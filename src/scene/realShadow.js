/**
 * Which real shadows fall on a body, ready for the shader.
 *
 * The bridge between `orbit/eclipse.js`, which knows the true solar system in
 * kilometres, and `shadows.js`, which draws on whatever globe is on screen.
 * Everything here comes back in **target radii** rather than kilometres, which
 * is not a convenience: a fragment shader float is only guaranteed the range of
 * a `mediump`, about 65504, and the Sun at 1.5e8 km overflows it to infinity
 * and every direction derived from it to NaN. See the note in
 * `eclipseVisibility` — the symptom is no shadow at all, and nothing on the
 * JavaScript side of the GPU shows anything wrong.
 *
 * Kept out of `Body.jsx` for the usual reason: it is arithmetic on numbers and
 * can be driven from a check in Node with no renderer anywhere.
 *
 * ## Why the alignment is never tested here
 *
 * This hands the shader the Sun and the occulters unconditionally, on every
 * frame, without first asking whether anything is lined up. That looks wasteful
 * and is the opposite — the per-fragment solution already answers "how much of
 * the Sun is covered *here*", and its answer on an ordinary day is "all of it",
 * at the cost of one loop iteration.
 *
 * Testing first is also how the previous version got partial eclipses wrong. It
 * gated on whether the shadow *axis* struck the Earth, which is the condition
 * for a central eclipse — so in a partial eclipse, where the axis passes wide
 * but the penumbra still sweeps a continent, the app drew nothing at all. The
 * geometry was right and the gate in front of it was answering a different
 * question. There is no gate now.
 */

import { BODIES_BY_ID } from '../data/bodies.js'
import { MOON_ELEMENTS } from '../data/moonElements.js'
import { KM_PER_AU } from '../orbit/frames.js'
import { centuriesSinceJ2000, positionAt } from '../orbit/kepler.js'
import {
  EARTH_RADIUS_KM,
  MOON_RADIUS_KM,
  SUN_RADIUS_KM,
  earthMoonSun,
  toWorld,
} from '../orbit/eclipse.js'
import { applyBasis, bodyBasis } from './pole.js'

/**
 * The bodies whose shadows are worth computing from the real solar system.
 *
 * Deliberately short. Every body in the scene is already shadowed by its
 * neighbours through `sunVisibility`, which uses the drawn geometry and is the
 * right answer for the diorama. Overriding that with real geometry is only
 * worth the work where the event has a name and a published time — where
 * someone might reasonably check the app against what happened.
 */
export const REAL_SHADOW_CASTERS = {
  earth: new Set(['luna']),
  luna: new Set(['earth']),
  /*
   * The Galileans, and only them.
   *
   * A shadow transit is the one satellite event a small telescope shows plainly
   * — a hard black dot crossing the cloud tops — and observing guides predict
   * them to the minute, so it is exactly the kind of thing worth computing from
   * the real solar system rather than from the diorama, where the moons are
   * drawn at a compressed distance and would cross at the wrong time.
   *
   * Not the other systems, for two different reasons. Saturn's seven roster
   * moons would overflow the four occulter slots, and their shadows are faint
   * besides: at twice Jupiter's distance from the Sun the geometry is against
   * them, and Titan's shadow is a soft grey smudge rather than a dot. Phobos and
   * Deimos genuinely do cast shadows that Mars rovers have photographed, but
   * Phobos is the one body in the app whose position a straight line cannot
   * describe — see `fetch-moon-elements.mjs` — and an exact shadow cast by a
   * moon that is 13° from where it belongs is precision theatre.
   */
  jupiter: new Set(['io', 'europa', 'ganymede', 'callisto']),
}

export const REAL_SHADOW_BODIES = new Set(Object.keys(REAL_SHADOW_CASTERS))

/**
 * Who must *not* also cast a drawn shadow on `id`.
 *
 * The two shadow systems overlap, and where they do the drawn one has to give
 * way — otherwise it silently wins, because it runs first and takes the light
 * the real one was going to take.
 *
 * This was not a subtle failure. At the diorama scale the Earth is drawn
 * enormous beside a squeezed lunar orbit, so its drawn disc covers the Moon for
 * a good part of every month; measured on the night of a real total eclipse it
 * had already removed **88% of the Moon's direct light** before
 * `eclipseVisibility` was reached, and the real eclipse changed nothing at all
 * that a screen diff could find. The same fault ran the other way from the
 * start — the drawn Moon has always been able to throw a fake eclipse across
 * the Earth on any date it happened to line up.
 *
 * Removing the pair entirely, rather than trying to reconcile them, is the only
 * coherent answer: for these two bodies the real geometry is a strictly better
 * account of the same event, and two shadows of one object is never right.
 */
export const drawnShadowExclusions = (id) => REAL_SHADOW_CASTERS[id] ?? EMPTY

const EMPTY = new Set()

/**
 * Who can put `body` in shadow using the geometry as *drawn*.
 *
 * Only ever something in the same system. A planet is eclipsed by its own moons
 * — Io's shadow crossing Jupiter is the one everybody recognises — and a moon by
 * its planet or by a sibling. Nothing else in the scene can ever come between a
 * body and the Sun, so nothing else is worth testing per fragment.
 *
 * Lives here rather than inline in `Body.jsx` so the exclusion above can be
 * checked without a renderer. The exclusion is the kind of thing that goes
 * wrong silently: drop it and everything still draws, just with the diorama's
 * shadow sitting on top of the real one.
 *
 * @param all a function from a parent id to that system's moons, passed in so
 *   this file does not have to care how the roster is filtered
 */
export function drawnOccluders(body, systemMoons) {
  const parent = body.parent ? BODIES_BY_ID[body.parent] : null
  const candidates = parent
    ? [parent, ...systemMoons(parent.id).filter((m) => m.id !== body.id)]
    : systemMoons(body.id)

  const skip = drawnShadowExclusions(body.id)
  return skip.size ? candidates.filter((b) => !skip.has(b.id)) : candidates
}

/** Reused across frames; this runs once per body per frame. */
const scratch = {
  /** `radius` here is the Sun's, in target radii; `air` is unused. */
  sun: { x: 0, y: 0, z: 0, radius: 0, air: 0 },
  occulters: [
    { x: 0, y: 0, z: 0, radius: 0, air: 0 },
    { x: 0, y: 0, z: 0, radius: 0, air: 0 },
    { x: 0, y: 0, z: 0, radius: 0, air: 0 },
    { x: 0, y: 0, z: 0, radius: 0, air: 0 },
  ],
  count: 0,
}

/** Copy a km-frame vector into a slot, rescaled into target radii. */
const set = (slot, v, R, radius, air) => {
  slot.x = v.x / R
  slot.y = v.y / R
  slot.z = v.z / R
  slot.radius = radius
  slot.air = air
}

/**
 * The Sun and everything that can eclipse `id`, in units of `id`'s own radius.
 *
 * Returns `null` for a body with no real shadow to compute, which is most of
 * them. The result is shared scratch — read it before the next call.
 *
 * @param air how strongly an occulter refracts sunlight into its own shadow,
 *   0 for an airless body. It is what makes a totally eclipsed Moon copper
 *   rather than black; see `REFRACTED_LIGHT` in `shadows.js`.
 */
export function realShadowsOn(id, jd) {
  if (id === 'earth') {
    const { sun, moon } = earthMoonSun(jd, BODIES_BY_ID.earth.elements)
    const R = EARTH_RADIUS_KM
    const s = toWorld(sun)
    const m = toWorld(moon)

    set(scratch.occulters[0], m, R, MOON_RADIUS_KM / R, 0)
    set(scratch.sun, s, R, SUN_RADIUS_KM / R, 0)
    scratch.count = 1
    return scratch
  }

  if (id === 'luna') {
    /*
     * The same two bodies as above, seen from the other one — so the Sun and
     * the Earth are both taken relative to the Moon.
     *
     * Deriving it from the identical `earthMoonSun` call rather than from a
     * lunar-eclipse routine is deliberate. A solar and a lunar eclipse are the
     * same three bodies in the same line; only the vantage differs, and if the
     * two were computed separately they could disagree about where the Moon is
     * while both looked correct on their own.
     */
    const { sun, moon } = earthMoonSun(jd, BODIES_BY_ID.earth.elements)
    const R = MOON_RADIUS_KM
    const s = toWorld({ x: sun.x - moon.x, y: sun.y - moon.y, z: sun.z - moon.z })
    const e = toWorld({ x: -moon.x, y: -moon.y, z: -moon.z })

    set(scratch.occulters[0], e, R, EARTH_RADIUS_KM / R, 1)
    set(scratch.sun, s, R, SUN_RADIUS_KM / R, 0)
    scratch.count = 1
    return scratch
  }

  return satelliteShadows(id, jd)
}

/** Scratch for the two-step conversion below; no allocation per frame. */
const _swapped = { x: 0, y: 0, z: 0 }
const _world = { x: 0, y: 0, z: 0 }

/**
 * A planet shadowed by its own moons, in real kilometres.
 *
 * The moons' elements are solved in the parent's **equatorial** frame — that is
 * the whole point of fetching them with `REF_PLANE=B` — so getting from there to
 * the world frame is two steps, and they are the same two `satelliteFrame.js`
 * uses to draw the moon itself. Doing it differently here would put the shadow
 * somewhere its own moon is not, which is the one error this feature cannot
 * afford: the shadow is checkable against a published minute and the moon is
 * right there beside it.
 *
 * The planet is treated as a sphere of its equatorial radius. Jupiter is
 * noticeably oblate — a fragment at its pole is 6% closer to the centre than
 * this assumes — so a shadow falling near the poles is placed a few hundred
 * kilometres out. Shadow transits happen near the equator, where the error is
 * zero.
 */
function satelliteShadows(id, jd) {
  const casters = REAL_SHADOW_CASTERS[id]
  if (!casters) return null

  const planet = BODIES_BY_ID[id]
  const R = planet.radiusKm
  const T = centuriesSinceJ2000(jd)
  const basis = bodyBasis(id)

  // The Sun as seen from the planet: its heliocentric position, reversed.
  const helio = positionAt(planet.elements, T)
  set(
    scratch.sun,
    toWorld({
      x: -helio.x * KM_PER_AU,
      y: -helio.y * KM_PER_AU,
      z: -helio.z * KM_PER_AU,
    }),
    R,
    SUN_RADIUS_KM / R,
    0,
  )

  let count = 0
  for (const moonId of casters) {
    const local = positionAt(MOON_ELEMENTS[moonId], T)

    // Axis convention first, then the parent's own equator — the same order as
    // `satelliteOffset`, and not interchangeable with the reverse.
    _swapped.x = local.x * KM_PER_AU
    _swapped.y = local.z * KM_PER_AU
    _swapped.z = -local.y * KM_PER_AU
    applyBasis(basis, _swapped, _world)

    set(scratch.occulters[count], _world, R, BODIES_BY_ID[moonId].radiusKm / R, 0)
    count++
  }

  scratch.count = count
  return scratch
}
