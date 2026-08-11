/**
 * Which way a body's axis actually points, and the frame that follows from it.
 *
 * ## What was here before, and why it could not work
 *
 * Every body carried one number, `axialTilt`, and `Body.jsx` drew it as
 * `rotation={[0, 0, axialTilt]}` — a lean of the right *size* about a fixed
 * scene axis. A spin axis needs two angles, not one. With only the obliquity
 * there is nothing to say *which way* a planet leans, so the direction was the
 * same for all of them, and which season a given date falls in came out
 * arbitrary.
 *
 * It was measurable and it was wrong. Recovering the sub-solar latitude from
 * the lighting at Phoenix's landing site gave -25.6° on 2008-05-25 against a
 * real +24.5°, and -26.6° against +25.2° at the northern summer solstice three
 * weeks later: the magnitude tracked the season correctly all the way down to
 * -19.1° against +17.5° in October, and only the sign was wrong. Mars was being
 * drawn half a Martian year out of phase, so Phoenix landed into a polar night
 * at a site that was in fact having its midnight sun.
 *
 * ## A second error underneath the first
 *
 * `axialTilt` is *obliquity*, which is measured from the body's own orbit
 * normal — and it was being applied as a rotation from the **ecliptic**. Those
 * differ by the orbital inclination, which is why Mercury (obliquity 0.03°,
 * inclination 7.0°) was drawn bolt upright when its axis is really 7° from the
 * ecliptic pole, and Pluto (17.1° inclination) was out by that much again.
 *
 * ## And a third: Venus and Uranus were turning the wrong way
 *
 * Both are retrograde, and both had it expressed *twice* — a tilt past 90°
 * flipping the body over, and a negative `rotationHours` spinning it backwards.
 * The two cancelled: `R_z(177.4°)` applied to Venus's angular velocity put it
 * back within 3° of the ecliptic **north**, so Venus was drawn rotating
 * prograde. Anchoring on the IAU north pole and keeping the signed period
 * leaves exactly one statement of the sense, and it is the right one.
 *
 * ## What replaces it
 *
 * The IAU pole: right ascension and declination of the north pole at J2000,
 * from the WGCCRE reports, which is how every planetary frame is actually
 * defined. From it comes a full basis, and `axialTilt` stops orienting anything
 * at all, surviving as the published figure `verify-bodies` holds each pole to
 * and as a row in the dossier — shown only for the bodies in this table, since
 * a stated 0° would read as a measurement rather than as an absence of one.
 *
 * The rotation *about* that pole is still not tied to the real prime meridian —
 * there is no `W₀` here — so a body's longitude phase remains arbitrary exactly
 * as it was before, and the rovers still ride at the same arbitrary phase (see
 * `landedCraft.js`). That is one axis of freedom left, down from three, and the
 * zero azimuth is now the IAU node, so adding `W₀` later is a one-line change
 * rather than a reinterpretation.
 */

import { starDirection } from './sky.js'

/**
 * North pole right ascension and declination at J2000, in degrees.
 *
 * IAU WGCCRE. These are checked rather than trusted: `verify-bodies` computes
 * the angle between each pole and that body's own orbit normal and requires it
 * to reproduce the published obliquity in `axialTilt`. Eight of them land
 * within 0.02°, which is a far stronger statement about a typed pair of numbers
 * than reading them twice.
 *
 * Two carry a note:
 *
 *  - **Neptune's pole precesses** on a 7,900-year cycle, `α = 299.36 + 0.70
 *    sin N`, `δ = 43.46 - 0.51 cos N` with `N = 357.85 + 52.316T`. Evaluated at
 *    J2000 rather than per-frame: the whole term is 0.7° and it takes centuries
 *    to traverse, so across this app's 1800-2050 window it is smaller than the
 *    obliquity figure it is checked against.
 *  - **Pluto** reproduces 119.61° where the fact sheets say 122.53°. Both are
 *    "the angle to the orbit normal"; they differ because the published figure
 *    is quoted against a different pole convention for a retrograde body. The
 *    value here is the one consistent with the IAU pole this app draws from, so
 *    it is the one the check uses.
 *
 * Bodies absent from this table — every moon, comet, asteroid and dwarf whose
 * pole is not determined — fall back to the ecliptic pole, which is the
 * identity and exactly what they were drawn with before.
 */
export const BODY_POLES = {
  mercury: { ra: 281.0103, dec: 61.4155 },
  venus: { ra: 272.76, dec: 67.16 },
  earth: { ra: 0.0, dec: 90.0 },
  mars: { ra: 317.68143, dec: 52.8865 },
  jupiter: { ra: 268.056595, dec: 64.495303 },
  saturn: { ra: 40.589, dec: 83.537 },
  uranus: { ra: 257.311, dec: -15.175 },
  neptune: { ra: 299.334, dec: 42.95 },
  pluto: { ra: 132.993, dec: -6.163 },
  ceres: { ra: 291.418, dec: 66.764 },

  /*
   * Haumea, and the one pole here that nothing independent confirms.
   *
   * From the 2017 stellar occultation that discovered its ring (Ortiz et al.,
   * *Nature* 550), which resolved the ring plane and takes it to be Haumea's
   * equator — the same plane Hi'iaka and Namaka orbit in. It puts the axis 87.1°
   * over, so Haumea lies on its side like Uranus, spinning end over end every
   * 3.9 hours. For a body whose shape is a 2,100 km cigar that is most of what
   * there is to see about it, and drawing it upright was drawing it wrong.
   *
   * What is missing is a second opinion. Every other pole here is checked
   * against that body's own published obliquity, and eight also against the
   * plane their moons orbit in. Haumea has no moons in this app's roster, and
   * its obliquity is not independently published — the `axialTilt` beside it in
   * `dwarfPlanetData` is *derived from this pole*, so the obliquity check is a
   * tautology for this one body and is labelled as such in `verify-bodies`. It
   * still earns its place there: the two numbers live in different files, so
   * editing one without the other is caught.
   *
   * The occultation solution is also the better-determined of the two in the
   * literature. Photometric pole fits from light curves put the tilt nearer
   * 126°; the occultation resolves the geometry directly and is preferred.
   */
  haumea: { ra: 285.1, dec: -10.6 },
}

/*
 * Eris and Makemake stay out. Neither has a usable pole — Makemake's rotation
 * is barely detected at all, and Eris is so nearly spherical and so slow that
 * its light curve constrains almost nothing. Both keep the identity basis,
 * which is what they were drawn with before, and it is honest: an upright body
 * here means "nobody knows", not "upright".
 */

/**
 * A body's frame in world coordinates: three orthonormal axes.
 *
 * `y` is the north pole, because `+Y` is the axis `Body` spins the mesh about
 * and the axis `surfaceDirection` measures latitude from. `x` is the ascending
 * node of the body's equator on the J2000 equator — the direction at
 * `RA = α₀ + 90°, Dec = 0`, which is perpendicular to the pole by construction
 * and is where the IAU measures `W` from. `z` completes a right-handed set,
 * matching three.js's `x × y = z`.
 *
 * Both directions go through `starDirection`, the same equatorial-to-world
 * conversion the star catalogue uses, so a planet's axis and the sky it stands
 * against cannot end up in different frames.
 */
function basisFor(pole) {
  if (!pole) {
    return {
      x: { x: 1, y: 0, z: 0 },
      y: { x: 0, y: 1, z: 0 },
      z: { x: 0, y: 0, z: 1 },
    }
  }
  const y = starDirection(pole.ra, pole.dec)
  const x = starDirection(pole.ra + 90, 0)
  return {
    x,
    y,
    z: {
      x: x.y * y.z - x.z * y.y,
      y: x.z * y.x - x.x * y.z,
      z: x.x * y.y - x.y * y.x,
    },
  }
}

/*
 * Built once per body and shared.
 *
 * These are constants of the app — the poles do not move — and the basis is
 * read from `useFrame` by every rover, every moon and every ring, so building
 * one on demand would be several allocations a frame for a value that never
 * changes.
 */
const IDENTITY = basisFor(null)
const cache = new Map()

/** The body's frame, or the identity for anything with no determined pole. */
export function bodyBasis(id) {
  if (!id) return IDENTITY
  const hit = cache.get(id)
  if (hit) return hit
  const pole = BODY_POLES[id]
  if (!pole) return IDENTITY
  const basis = basisFor(pole)
  cache.set(id, basis)
  return basis
}

/**
 * Whether this body's axis direction is actually known.
 *
 * Distinct from "has an `axialTilt`", which every body in the registry does —
 * mostly as a placeholder zero. The dossier uses this to decide whether to
 * print the tilt at all, because a stated 0° reads as a measurement.
 */
export const hasPole = (id) => Object.hasOwn(BODY_POLES, id)

/** The body's north pole as a world direction — the ring plane's normal. */
export const poleDirection = (id) => bodyBasis(id).y

/** A direction in the body's frame, rotated into world coordinates. */
export function applyBasis(basis, v, out = { x: 0, y: 0, z: 0 }) {
  const { x, y, z } = basis
  const vx = v.x
  const vy = v.y
  const vz = v.z
  out.x = x.x * vx + y.x * vy + z.x * vz
  out.y = x.y * vx + y.y * vy + z.y * vz
  out.z = x.z * vx + y.z * vy + z.z * vz
  return out
}
