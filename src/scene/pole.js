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
import { J2000, spinClampFactor, terrestrialTime } from '../orbit/kepler.js'

const RADIANS = Math.PI / 180

/**
 * The IAU rotational elements: where the north pole points, and where the
 * prime meridian is.
 *
 * `ra`/`dec` locate the pole at J2000, in degrees. `w0`/`wDot` locate the prime
 * meridian: `W = w0 + wDot · d` degrees, with `d` in days from J2000, measured
 * east along the body's equator from the ascending node of that equator on the
 * J2000 equator — the direction this file calls the basis `x` axis.
 *
 * IAU WGCCRE. The poles are checked rather than trusted: `verify-bodies`
 * computes the angle between each pole and that body's own orbit normal and
 * requires it to reproduce the published obliquity in `axialTilt`. Eight of
 * them land within 0.02°, which is a far stronger statement about a typed pair
 * of numbers than reading them twice.
 *
 * **`wDot` is here rather than derived from `rotationHours`, and it has to be.**
 * That field is a rounded, human-readable period — Jupiter's `9.93` hours — and
 * rounding is fatal to a phase: `360 / (9.93/24)` is 870.0906 °/day against the
 * true 870.5360, which over this app's 1800-2050 window is **113 whole turns**
 * of drift. Mars slips 11 turns and Earth 2. A period good enough to print is
 * nowhere near good enough to say which way a planet is facing.
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
  mercury: { ra: 281.0103, dec: 61.4155, w0: 329.5988, wDot: 6.1385108 },
  venus: { ra: 272.76, dec: 67.16, w0: 160.2, wDot: -1.4813688 },
  earth: { ra: 0.0, dec: 90.0, w0: 190.147, wDot: 360.9856235 },
  mars: { ra: 317.68143, dec: 52.8865, w0: 176.63, wDot: 350.89198226 },
  // System III, the rotation of Jupiter's magnetic field. Its clouds are not a
  // surface and do not share one period — the equator laps the poles by about
  // five minutes a rotation — so any single number for Jupiter is a convention,
  // and this is the one everybody uses.
  jupiter: { ra: 268.056595, dec: 64.495303, w0: 284.95, wDot: 870.536 },
  saturn: { ra: 40.589, dec: 83.537, w0: 38.9, wDot: 810.7939024 },
  uranus: { ra: 257.311, dec: -15.175, w0: 203.81, wDot: -501.1600928 },
  neptune: { ra: 299.334, dec: 42.95, w0: 253.18, wDot: 536.3128492 },
  pluto: { ra: 132.993, dec: -6.163, w0: 302.695, wDot: 56.3625225 },
  ceres: { ra: 291.418, dec: 66.764, w0: 170.9, wDot: 952.1532 },

  /*
   * The Moon, which had no pole at all and therefore showed a random face.
   *
   * It is tidally locked, so `wDot` is its orbital rate and the near side turns
   * to keep facing us — the single most recognisable fact about the Moon, and
   * one this app was not reproducing: with an arbitrary phase it presented
   * whatever hemisphere the date happened to land on. The sub-Earth longitude
   * now librates between about -6° and +7°, which is the real optical libration
   * and comes for free from the Moon's eccentric, inclined orbit.
   *
   * **These are not the constants from the table, and taking them from the
   * table is a trap.** The IAU expression for the Moon is
   * `α₀ = 269.9949 - 3.8787 sin E1 …`, `δ₀ = 66.5392 + 1.5419 cos E1 …`, and
   * that constant part — 269.9949, 66.5392 — is the *ecliptic pole*, to within
   * 0.02°. All of the Moon's 1.54° tilt away from the ecliptic lives in the
   * `E1` term, whose argument is the longitude of its ascending node. Drop the
   * periodic terms as decoration, as a first pass here did, and the Moon comes
   * out with no obliquity at all: 5.16° to its orbit where the real figure is
   * 6.68°, and its poles lit wrongly.
   *
   * So `E1` is folded in, evaluated at J2000, where `E1 = 125.045°`. What that
   * does not model is `E1` turning: the lunar node regresses once every 18.6
   * years, carrying the pole around a 1.54° cone, and this holds it at one
   * point on that cone. The error is bounded by the cone — at worst about 3° —
   * and it does not touch the near side facing Earth, which `W` and the orbit
   * carry between them. The other twelve arguments are the physical libration,
   * worth a few hundredths of a degree, and are left out.
   */
  luna: { ra: 266.8194, dec: 65.6538, w0: 41.2367, wDot: 13.17635815 },

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
 * Where the body's prime meridian is at `jd`, in radians, or null.
 *
 * This is the third and last of the three angles that orient a body, and until
 * now it was the one nobody had ever supplied. `spinAt` derives an angle from
 * the rotation period alone, which makes it zero at J2000 *by construction
 * rather than by measurement* — so every body in this app has been drawn at an
 * arbitrary longitude phase. Invisible on a gas giant, and decisive for
 * anything that has to line up with something else: which face of the Moon
 * points at Earth, which meridian is in daylight, where on the ground an
 * eclipse falls.
 *
 * Returns null for a body with no published `w0`, and those keep the old
 * arbitrary phase. That is the honest outcome — an invented meridian would be
 * indistinguishable from a real one on screen.
 *
 * The angle is measured the same way `surfaceDirection` measures east
 * longitude, which is what lets the two compose: a point at east longitude L
 * ends up at `W + L` from the basis `x` axis. That is also why the frame's `x`
 * is the equator's ascending node rather than any convenient direction — it is
 * where the IAU measures `W` from, so no offset has to be invented here.
 */
export function primeMeridianAt(id, jd, daysPerSecond = 0) {
  const r = BODY_POLES[id]
  if (!r || r.w0 === undefined) return null
  const factor = spinClampFactor(daysPerSecond, r.wDot)
  // In Terrestrial Time, because that is what the IAU model is written in. The
  // app's clock is UT, and the ~70-second gap is 0.29° of Earth and 0.70° of
  // Jupiter — small, and exactly the size of the residual this removes.
  const w = r.w0 + r.wDot * (terrestrialTime(jd) - J2000) * factor
  return (w % 360) * RADIANS
}

/**
 * Where a body's *artwork* puts longitude zero, in degrees, when that differs
 * from where its physics does.
 *
 * A body's orientation is a fact about the solar system; where the prime
 * meridian falls on the image wrapped around it is a fact about an asset. They
 * are usually the same and for Mars they were measured to be — see
 * `LONGITUDE_ZERO` in `surface.js`. They are not always: NASA's lunar model
 * carries its own UV unwrap, and it puts the *far* side where this app's
 * convention expects the near side.
 *
 * This was unobservable until the prime meridians landed, and for the same
 * reason everything else in this file was: with an arbitrary rotation phase,
 * "the wrong face is showing" is not a statement that means anything. The
 * moment `W` became real, the Moon's sub-Earth longitude checked out to ±6.6°
 * while the picture showed craters where the maria belong.
 *
 * The Moon's 180° is not a fudged number, it is the gap between the two ways
 * an equirectangular map is laid out. This app's convention, measured off the
 * Mars texture, is `u = (lon - 180)/360` — longitude zero at the *centre* of
 * the image. NASA's lunar map uses the other one, `u = lon/360`, which starts
 * the image at the prime meridian instead. The difference between them is
 * exactly half a turn, which is why the far side was pointing at us.
 *
 * Added to the drawn spin only. Nothing that stands on a surface reads it,
 * because the one body with things standing on it is Mars, whose offset is
 * zero — but if a lander is ever put on a body listed here, this is the number
 * that has to go into its placement too.
 */
const TEXTURE_MERIDIAN = {
  luna: 180,
}

/** The offset, in radians, for the drawn spin. Zero for almost everything. */
export const textureMeridian = (id) => (TEXTURE_MERIDIAN[id] ?? 0) * RADIANS

/** Whether this body's rotation phase is real rather than arbitrary. */
export const hasPrimeMeridian = (id) => BODY_POLES[id]?.w0 !== undefined

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
