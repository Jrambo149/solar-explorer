/**
 * Where a spacecraft sits in world space, given a sampled offset and a frame.
 *
 * Split out of the component and free of React and three for the same reason
 * `satelliteFrame.js` is: it is the part that can be wrong in a way nobody sees
 * on screen, so it has to be drivable from Node.
 *
 * ## Why this is not `satelliteOffset`
 *
 * A moon's elements are expressed in its own orbital plane — the parent's
 * equator, or its Laplace plane — and `satelliteOffset` rotates out of that
 * plane before warping. A spacecraft's samples arrive from Horizons already in
 * the **J2000 ecliptic**, the same frame the planets are solved in, whatever
 * body they are centred on. There is no plane to rotate out of, and applying
 * one would tilt every trajectory by the parent's obliquity.
 *
 * What is shared is the warp: radial, direction-preserving, so the shape of the
 * path is untouched and only its distance from the frame body is compressed.
 * That is what lets a trajectory stay a trajectory at diorama scale.
 */

import { eclipticToWorld } from '../orbit/kepler.js'
import {
  KM_PER_AU,
  UNITS_PER_AU,
  warpHeliocentric,
  warpRadius,
  warpSpacecraftDistance,
} from '../orbit/frames.js'
import { bodyRadius, majorMoonsOf } from '../data/bodies.js'

/**
 * How far out a frame's satellite system reaches, in AU.
 *
 * The distance below which a spacecraft's placement is exactly proportional —
 * see `warpSpacecraftDistance`. The outermost major moon is the right anchor
 * because it is what the frame's drawn geometry is already built around: put the
 * linear region there and a lunar flyby lands on the Moon, a Jupiter capture
 * lands among the Galileans, and nothing that was in the right place moves.
 *
 * It is the *larger* of that and sixty body radii, and the floor is what makes
 * it work away from Earth. Mars' outermost major moon is Deimos at 6.9 Mars
 * radii, and anchoring there would leave every approach and every capture orbit
 * outside the exact region — Psyche and Europa Clipper came out 6-7x distorted
 * against Deimos, and 1.3x against the floor. Jupiter, Uranus and Neptune are
 * the same story less severely.
 *
 * Sixty is not arbitrary: it is where the Moon sits in Earth radii. So Earth
 * resolves to the Moon either way, which is the one alignment that has to be
 * exact — Artemis II is held in Earth's frame through its lunar flyby, and any
 * larger floor walks it off the Moon (28% short at 120 radii, 49% at 250).
 * Bodies with no moons at all — the Moon itself carries five spacecraft — get
 * the floor alone, inheriting the proportions of the one frame everybody
 * already knows by eye.
 *
 * What this does *not* preserve is a craft co-orbiting with an inner moon:
 * moons stay on the inflated curve while spacecraft go proportional, so a craft
 * at Phobos' distance is not drawn at Phobos. Nothing in the roster does that,
 * and the close moon encounters that do exist — Juno at Io, Huygens at Titan —
 * are held in the *moon's* own frame, where they line up by construction.
 */
const REFERENCE_RADII_FLOOR = 60

/**
 * How far clear of the drawn surface the nearest orbit sits, as a multiple of
 * the body's drawn radius.
 *
 * 1.12 rather than 1.0 because touching is not the same as visible: a craft
 * exactly on the drawn surface z-fights with it and reads as a speck stuck to
 * the terrain. Twelve percent is about the smallest gap that still looks like an
 * orbit at the distance the camera parks.
 */
const SURFACE_CLEARANCE = 1.12

/** The drawn radius a spacecraft must stay outside of, in world units. */
export function surfaceFloor(frameBody, scaleMode) {
  return bodyRadius(frameBody, scaleMode) * SURFACE_CLEARANCE
}

const referenceCache = new Map()

export function frameReferenceAU(frameBody) {
  const cached = referenceCache.get(frameBody.id)
  if (cached !== undefined) return cached

  const moons = majorMoonsOf(frameBody.id)
  const outermost = moons.length ? Math.max(...moons.map((m) => m.elements.a)) : 0
  const reference = Math.max(
    outermost,
    (frameBody.radiusKm * REFERENCE_RADII_FLOOR) / KM_PER_AU,
  )

  referenceCache.set(frameBody.id, reference)
  return reference
}

/**
 * Warps an offset in a body's frame, in AU, to world units.
 *
 * `framePos` is the frame body's own world position; the caller reads it from
 * the position registry, so this stays pure.
 *
 * The zero-length case is real rather than defensive: a craft's segment can
 * begin at the instant it separates from a carrier, and a normalised zero
 * vector is NaN in every component, which propagates into the matrix and makes
 * the whole mesh vanish with no error anywhere.
 */
export function spacecraftOffset(local, frameBody, frameRenderRadius, clearance, scaleMode, out) {
  const r = Math.hypot(local.x, local.y, local.z)
  if (r === 0) {
    out.x = 0
    out.y = 0
    out.z = 0
    return out
  }
  const frameRadiusAU = frameBody.radiusKm / KM_PER_AU
  const warped = warpSpacecraftDistance(
    r,
    frameRadiusAU,
    frameRenderRadius,
    clearance,
    frameReferenceAU(frameBody),
    scaleMode,
    surfaceFloor(frameBody, scaleMode),
  )
  const k = warped / r
  return eclipticToWorld({ x: local.x * k, y: local.y * k, z: local.z * k }, out)
}

/**
 * How small a model is allowed to get, as a fraction of its frame body's drawn
 * radius.
 *
 * A legibility floor, and it is needed because the honest answer is unusable.
 * LRO is 3.8 metres across against a Moon of 1,737 km — two parts in a million.
 * Drawn at that proportion in the diorama it is 4.07e-7 world units, and the
 * camera cannot come closer than 1.65e-2, so it would be forty thousand times
 * too far away to ever see a single pixel of it. The model would exist and never
 * once be visible.
 *
 * 0.008 puts it at about two pixels across when the camera is parked at the
 * Moon, which is what Eyes shows at the same framing — a speck you can fly into,
 * rather than the 0.161-of-a-Moon blob it was, which drew LRO as though it were
 * 280 km wide.
 *
 * It fades out with `scaleMode`. At true scale there is nothing to compensate
 * for: the Moon is 1.16e-3 units, a true-size LRO is 2.54e-9, and the camera
 * reaches 1.84e-10 — so you can genuinely fly up to a three-metre spacecraft,
 * and it is drawn three metres across.
 */
const MODEL_MIN_FRACTION = 0.008

/**
 * The radius to draw a spacecraft's *mesh* at, in world units.
 *
 * Deliberately not `bodyRadius`. That floors every small body at a visible
 * minimum so Phobos does not vanish, which is right for a moon and absurd for a
 * spacecraft: it gave a 3.8 m orbiter and a 1.7 m one the same 0.03 units, the
 * same size as a 240 m moonlet, and sixteen percent of the Moon they orbit.
 *
 * The scale factor is the frame's own distance mapping, so the craft is sized in
 * the same units its orbit is drawn in — a metre of spacecraft and a metre of
 * altitude are the same length on screen. That is the property that makes a
 * model look like it belongs where it is.
 */
export function spacecraftModelRadius(radiusKm, frameBody, scaleMode) {
  const trueAU = radiusKm / KM_PER_AU

  if (!frameBody) {
    // Heliocentric. The compression curve has no single slope, so this takes the
    // one at 1 AU; no cruising craft is drawn close enough for the difference to
    // read, and at true scale the lerp below makes it exact anyway.
    const perAU = lerpScale(HELIOCENTRIC_SLOPE_AT_1AU, UNITS_PER_AU, scaleMode)
    return Math.max(trueAU * perAU, SUN_FRAME_MIN * (1 - clampUnit(scaleMode)))
  }

  const reference = frameReferenceAU(frameBody)
  const floor = surfaceFloor(frameBody, scaleMode)
  const atReference = warpSpacecraftDistance(
    reference,
    frameBody.radiusKm / KM_PER_AU,
    warpRadius(frameBody.radiusKm, scaleMode),
    0,
    reference,
    scaleMode,
    floor,
  )
  // The linear coefficient of the frame's own mapping — see
  // `warpSpacecraftDistance`.
  const perAU = Math.sqrt(Math.max(atReference * atReference - floor * floor, 0)) / reference

  const minimum = bodyRadius(frameBody, scaleMode) * MODEL_MIN_FRACTION * (1 - clampUnit(scaleMode))
  return Math.max(trueAU * perAU, minimum)
}

const HELIOCENTRIC_SLOPE_AT_1AU = 13.2
const SUN_FRAME_MIN = 0.01
const clampUnit = (v) => Math.min(1, Math.max(0, v))
const lerpScale = (a, b, t) => a + (b - a) * clampUnit(t)

/**
 * Heliocentric case: the same warp every planet gets, so a cruising probe sits
 * on the same compression curve as the planets it is flying between. Anything
 * else would put Voyager visibly off its own trajectory relative to Jupiter.
 */
export function spacecraftHeliocentric(local, scaleMode, out) {
  return warpHeliocentric(local, scaleMode, out)
}

/** True-scale world units per AU, for callers that need the unwarped length. */
export { UNITS_PER_AU }
