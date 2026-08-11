/**
 * Placing a moon.
 *
 * A moon's position is its parent's, plus an offset — and the offset is solved
 * in the parent's frame rather than the Sun's. That nesting is what makes the
 * scale system work at all: compressing a 0.0026 AU lunar orbit with the curve
 * tuned for Neptune's 30 AU would collapse it to nothing.
 *
 * Two frames are in play, and which one a moon uses is set by its `plane`:
 *
 *   'equator'   the parent's equatorial plane. The offset is rotated by the
 *               planet's own basis from `pole.js` — the same orientation
 *               `Body.jsx` applies to the planet's surface and its rings. That
 *               is why Titan runs flat through Saturn's ring plane and why
 *               Uranus's satellites hang vertically: they are not arranged to
 *               look that way, they are in the frame that makes it inevitable.
 *
 *   'ecliptic'  the ecliptic, unrotated. The Moon only. Its orbit tracks the
 *               ecliptic to within 5.1°, not Earth's equator, and pinning it
 *               to the equator would swing it by up to 28°.
 *
 * Kept out of `Body.jsx` because it is pure arithmetic on numbers and can be
 * checked in Node without a renderer — the same reason `kepler.js` and
 * `followMath.js` are separate.
 */

import { KM_PER_AU, RING_CLEARANCE, BARE_CLEARANCE, warpMoonDistance } from '../orbit/frames.js'
import { applyBasis, bodyBasis } from './pole.js'

/** Scratch for the ecliptic-frame offset, before the parent's basis is applied. */
const _local = { x: 0, y: 0, z: 0 }

/**
 * How close in, in parent radii, the innermost moon may be drawn.
 *
 * A ringed planet has to clear its rings, and that is a fact about the sky
 * rather than about taste: Enceladus orbits outside Saturn's main rings — it
 * is what feeds the E ring — so drawing it inside them would be checkably
 * wrong. The value is read from where the rings are actually drawn, so
 * retuning a ring preset carries the moons with it.
 */
export function satelliteClearance(parent, ringPresets) {
  const rings = parent.rings ? ringPresets[parent.rings] : null
  return rings ? rings.outer + RING_CLEARANCE : BARE_CLEARANCE
}

/**
 * How far out a body's moon system reaches, in world units.
 *
 * The apoapsis of the outermost moon, warped by the same curve that places the
 * moons themselves — so this is where the system's edge is *drawn*, not where
 * it is in space. Anything that frames a satellite system has to ask the render
 * geometry rather than the ephemeris, because the compression between the two
 * is a factor of ten and body-dependent.
 *
 * Apoapsis rather than the semi-major axis because the framing has to hold for
 * the whole orbit, not for the average of it. It matters for exactly one body:
 * Nereid's e is 0.75, so its `a` would under-frame it by nearly half an orbit's
 * worth. For the near-circular majority the two differ by well under a percent.
 *
 * Returns 0 for a body with no moons, which callers must treat as "there is no
 * system here" rather than as a distance.
 *
 * @param {object} parent the body the moons orbit
 * @param {object[]} moons its moons — passed in rather than looked up, so this
 *   stays free of the body registry and can be driven from a test
 * @param {number} parentRenderRadius the parent's drawn radius, world units
 * @param {number} clearance from `satelliteClearance`
 * @param {number} scaleMode
 */
export function satelliteSystemRadius(parent, moons, parentRenderRadius, clearance, scaleMode) {
  if (!parent || moons.length === 0) return 0

  const parentRadiusAU = parent.radiusKm / KM_PER_AU

  let furthest = 0
  for (const moon of moons) {
    const { a, e = 0 } = moon.elements
    const apoapsis = a * (1 + e)
    furthest = Math.max(
      furthest,
      warpMoonDistance(apoapsis, parentRadiusAU, parentRenderRadius, clearance, scaleMode),
    )
  }
  return furthest
}

/**
 * Parent-frame ecliptic offset in AU → a world-space offset.
 *
 * @param {{x,y,z}} local position in the parent's frame, AU
 * @param {object} parent the parent body
 * @param {number} parentRenderRadius the parent's drawn radius, world units
 * @param {number} clearance from `satelliteClearance`
 * @param {'equator'|'ecliptic'} plane
 * @param {number} scaleMode
 * @param {{x,y,z}} out written in place; never allocates
 */
export function satelliteOffset(
  local,
  parent,
  parentRenderRadius,
  clearance,
  plane,
  scaleMode,
  out,
) {
  const r = Math.hypot(local.x, local.y, local.z)
  const parentRadiusAU = parent.radiusKm / KM_PER_AU
  // Radial, exactly as in the heliocentric warp: only the length changes, so
  // the orbit stays a closed curve at its true inclination and the moon's
  // angular position around its planet is always the real one.
  const k =
    r > 0 ? warpMoonDistance(r, parentRadiusAU, parentRenderRadius, clearance, scaleMode) / r : 0

  // Ecliptic (Z toward the north ecliptic pole) → three.js (Y up).
  const x = local.x * k
  const y = local.z * k
  const z = -local.y * k

  if (plane === 'equator') {
    /*
     * Into the parent's own frame, by the same basis the parent is drawn with.
     *
     * These elements are fetched with Horizons' `REF_PLANE=B` — the parent's
     * IAU equator — precisely so a close satellite stays in the plane its
     * parent's oblateness pins it to. That only pays off if the frame they are
     * rotated into is the parent's real equator, which it now is: this used to
     * apply `R_z(axialTilt)`, a lean of the right size in an arbitrary
     * direction, so every satellite system was drawn correctly *inclined* and
     * wrongly *oriented*. Titan is coplanar with Saturn's rings either way,
     * because both read the same source; what changed is that the plane they
     * share is now the true one.
     */
    _local.x = x
    _local.y = y
    _local.z = z
    applyBasis(bodyBasis(parent.id), _local, out)
  } else {
    out.x = x
    out.y = y
    out.z = z
  }

  return out
}
