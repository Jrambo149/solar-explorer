/**
 * Where a shadow lands.
 *
 * A solar eclipse is the one event in this app that is decided by all three of
 * the things the last few days were spent on at once — the Moon's position, the
 * Earth's orientation, and the map on the Earth's surface. Any of them wrong by
 * a degree puts the shadow in the wrong country.
 *
 * ## Three shapes of the same problem
 *
 * Everything here is one body's shadow falling on another, but the question
 * being asked differs, and so does the arithmetic:
 *
 *   shadow *on* a surface   Where does the axis meet the sphere, and what is
 *                           left of the Sun there? Solar eclipses; Io's black
 *                           dot crossing Jupiter. `shadowOnSphere`.
 *
 *   a body *inside* a cone  Is the whole target immersed, and how deeply? The
 *                           Moon in Earth's umbra. Nothing lands anywhere —
 *                           the quantity is a separation against a cone radius.
 *                           `coneImmersion`.
 *
 * They are not the same calculation dressed differently. A lunar eclipse has no
 * sub-shadow point on the Earth to speak of and a solar eclipse has no
 * magnitude; asking either question of the other geometry gives an answer that
 * looks reasonable and means nothing.
 *
 * ## Real geometry, not drawn geometry
 *
 * Everything here works in kilometres and true radii, and is deliberately
 * independent of the scale mode. `shadows.js` already computes shadows from
 * what is *drawn*, which is right for what it does — at diorama scale the
 * bodies are enormous and the orbits squeezed, so eclipses there happen far too
 * often and in the wrong places, and that is the honest picture of the diorama.
 * An eclipse is not a picture, though; it is an event with a published time and
 * a published track, so it is computed from the real solar system and then
 * drawn onto whatever globe is on screen.
 *
 * ## What is approximated
 *
 * The Earth is treated as a sphere for the intersection and converted to
 * geodetic latitude afterwards. The real oblateness moves the point by up to
 * about 20 km, which is inside the error the lunar theory already carries.
 */

import { centuriesSinceJ2000, positionAt } from './kepler.js'
import { lunaPosition } from './luna.js'

const DEG = Math.PI / 180
const KM_PER_AU = 149597870.7

/** Mean radii, km. The Sun's is the photosphere, which is what casts the edge. */
export const SUN_RADIUS_KM = 695700
export const MOON_RADIUS_KM = 1737.4
export const EARTH_RADIUS_KM = 6371.0

/** Earth's equatorial radius and flattening, for the geodetic conversion. */
const EARTH_EQUATORIAL_KM = 6378.137
const EARTH_FLATTENING = 1 / 298.257223563

/**
 * The sub-shadow point and the state of the eclipse at `jd`.
 *
 * Returns `null` when the shadow axis misses the Earth entirely, which is the
 * ordinary case — there is no central eclipse on most days.
 *
 * @param earthElements the Earth's orbital elements, passed in rather than
 *   imported so this file stays free of the body registry and can be driven
 *   from a check
 */
export function solarEclipseAt(jd, earthElements) {
  const { sun, moon } = earthMoonSun(jd, earthElements)

  const hit = shadowOnSphere({
    sun,
    occulter: moon,
    occulterRadius: MOON_RADIUS_KM,
    targetRadius: EARTH_RADIUS_KM,
  })
  if (!hit) return null

  return {
    /** The sub-shadow point in the world frame, km from the Earth's centre. */
    point: toWorld(hit.point),
    /** How far the axis passes from the Earth's centre, km. */
    missDistanceKm: hit.missDistanceKm,
    total: hit.total,
    moonAngularRadius: hit.occulterAngularRadius,
    sunAngularRadius: hit.sunAngularRadius,
    /** The Sun's and Moon's positions used, for anything that wants to draw. */
    sun: toWorld(sun),
    moon: toWorld(moon),
  }
}

/**
 * Where an occulter's shadow meets a sphere at the origin, and how dark it is.
 *
 * All three arguments are positions relative to the target's centre, in
 * kilometres, in whatever frame the caller is working in — this is pure
 * geometry and never asks which frame that is. Returns `null` when the axis
 * misses, which is the ordinary case: there is no central eclipse on most days.
 */
export function shadowOnSphere({ sun, occulter, occulterRadius, targetRadius }) {
  // The shadow axis: the line from the Sun's centre through the occulter's.
  const ax = occulter.x - sun.x
  const ay = occulter.y - sun.y
  const az = occulter.z - sun.z
  const alen = Math.hypot(ax, ay, az)
  const dir = { x: ax / alen, y: ay / alen, z: az / alen }

  /*
   * Where that axis meets the target, solving |occulter + t·dir|² = R².
   *
   * The near root is the one wanted: the shadow lands on the face turned
   * towards the occulter, and the far root is the point it would exit through.
   */
  const b = occulter.x * dir.x + occulter.y * dir.y + occulter.z * dir.z
  const c = occulter.x ** 2 + occulter.y ** 2 + occulter.z ** 2 - targetRadius ** 2
  const disc = b * b - c
  if (disc < 0) return null

  const t = -b - Math.sqrt(disc)

  /*
   * Forward of the occulter, or it is not a shadow.
   *
   * A shadow travels away from the Sun, so the target has to lie *beyond* the
   * occulter along the axis. Without this the same line is accepted running
   * backwards, which describes the exactly opposite event: the occulter sitting
   * in the target's shadow rather than casting one on it.
   *
   * The two are half an orbit apart and look identical to a hit test, which is
   * how this announced itself — Io's shadow transits came out recurring every
   * 21 hours against a 42.5-hour orbit, because every eclipse *of* Io was being
   * counted as a transit *by* Io.
   */
  if (t <= 0) return null
  const p = {
    x: occulter.x + t * dir.x,
    y: occulter.y + t * dir.y,
    z: occulter.z + t * dir.z,
  }

  /*
   * Total or annular, decided from the ground rather than assumed.
   *
   * The Moon's apparent size varies by 12% over its orbit and the Sun's by 3%
   * over the year, so which of the two wins is a real question with a different
   * answer at different eclipses — and occasionally at different points along
   * the same track. For a moon of Jupiter the answer is never in doubt, but it
   * is the same calculation and it costs nothing to ask it honestly.
   */
  const toOcculter = Math.hypot(occulter.x - p.x, occulter.y - p.y, occulter.z - p.z)
  const toSun = Math.hypot(sun.x - p.x, sun.y - p.y, sun.z - p.z)
  const occulterAngular = Math.asin(Math.min(1, occulterRadius / toOcculter))
  const sunAngular = Math.asin(Math.min(1, SUN_RADIUS_KM / toSun))

  return {
    point: p,
    missDistanceKm: axisMiss(occulter, dir),
    total: occulterAngular >= sunAngular,
    occulterAngularRadius: occulterAngular / DEG,
    sunAngularRadius: sunAngular / DEG,
  }
}

/** Perpendicular distance from the target's centre to the shadow axis, km. */
function axisMiss(occulter, dir) {
  const dot = occulter.x * dir.x + occulter.y * dir.y + occulter.z * dir.z
  return Math.hypot(
    occulter.x - dot * dir.x,
    occulter.y - dot * dir.y,
    occulter.z - dot * dir.z,
  )
}

/**
 * Out of the ecliptic frame and into the app's.
 *
 * `positionAt` and `lunaPosition` both speak the ecliptic, because that is the
 * frame the sources are in. Everything that consumes the result — the body
 * basis, the meridian, the renderer — is in the world frame, `(x, z, -y)`.
 *
 * Leaving the conversion out is a mistake that hides well: the Sun and the
 * occulter stay consistent *with each other*, so the axis, the hit test and
 * even whether the eclipse is total all come out right, and only the latitude
 * and longitude are wrong. It read as a 6,000 km error in an otherwise
 * perfectly behaved calculation.
 */
export const toWorld = (v) => ({ x: v.x, y: v.z, z: -v.y })

/** The Sun and the Moon relative to the Earth's centre, km, ecliptic frame. */
export function earthMoonSun(jd, earthElements) {
  const T = centuriesSinceJ2000(jd)

  // The Earth about the Sun, then flipped to give the Sun as seen from Earth.
  const e = positionAt(earthElements, T)
  const sun = { x: -e.x * KM_PER_AU, y: -e.y * KM_PER_AU, z: -e.z * KM_PER_AU }

  // The Moon about the Earth, from the series. Same frame, same units.
  const m = lunaPosition(jd)
  const moon = { x: m.x * KM_PER_AU, y: m.y * KM_PER_AU, z: m.z * KM_PER_AU }

  return { sun, moon }
}

/**
 * How much bigger the Earth's shadow is than the Earth.
 *
 * The one number in this file that is not geometry. A shadow cast by a bare
 * sphere would have a sharp edge; the Earth's has an atmosphere around it, and
 * the lowest few tens of kilometres are opaque enough with cloud and dust to
 * act as if the planet were larger. Every observed lunar eclipse is deeper and
 * longer than the bare cone predicts, and by a consistent amount.
 *
 * Two conventions exist for it and they are worth telling apart, because they
 * disagree by about 1% in the umbral radius — a couple of hundredths of
 * magnitude, which is inside the tolerance of the check but not by much.
 * Chauvenet's rule, used here, enlarges the Earth's radius by 1/50. Danjon's
 * instead enlarges the radius by 1/85 and takes the cone from a point displaced
 * along the axis; NASA's five-millennium canon uses Danjon.
 *
 * It is an empirical fudge in both cases, and it varies in reality with how
 * much volcanic dust is in the stratosphere — which is the same thing that
 * decides how dark the eclipse looks. See the Danjon scale.
 */
const SHADOW_ENLARGEMENT = 1 + 1 / 85

/**
 * The Moon inside the Earth's shadow.
 *
 * A different question from a solar eclipse and not a rearrangement of it:
 * nothing lands anywhere, because the Moon is smaller than the cone it enters.
 * What matters is how far the Moon's centre sits from the shadow axis compared
 * with how wide the cone is at the Moon's distance — and the cone is converging,
 * so its width has to be evaluated where the Moon actually is.
 *
 * Unlike a solar eclipse, this is visible from the whole night side of the
 * Earth at once: the shadow is on the Moon, not on us, so everyone who can see
 * the Moon sees the same eclipse. That is why they are common in a way solar
 * eclipses are not, despite being rarer in absolute count.
 *
 * Always returns a result — `phase: 'none'` on the ordinary day — because the
 * magnitudes are continuous and a caller sweeping for the deepest moment needs
 * to see them go negative rather than fall off a cliff.
 */
export function lunarEclipseAt(jd, earthElements) {
  const { sun, moon } = earthMoonSun(jd, earthElements)

  // The shadow axis runs from the Sun through the Earth, which is the origin
  // here — so it is simply the antisolar direction.
  const sunDist = Math.hypot(sun.x, sun.y, sun.z)
  const dir = { x: -sun.x / sunDist, y: -sun.y / sunDist, z: -sun.z / sunDist }

  // How far down the cone the Moon is, and how far off its axis.
  const along = moon.x * dir.x + moon.y * dir.y + moon.z * dir.z
  const separation = Math.hypot(
    moon.x - along * dir.x,
    moon.y - along * dir.y,
    moon.z - along * dir.z,
  )

  /*
   * The two cones at the Moon's distance.
   *
   * The umbra converges — the Sun is larger than the Earth, so the region of
   * total blockage tapers to a point about 1.4 million km out, a little under
   * four times the Moon's distance. The penumbra diverges. Both are similar
   * triangles on the Sun–Earth line and neither needs anything but radii.
   *
   * `along` is negative when the Moon is on the sunward side — a new moon, so
   * the event in progress is a *solar* eclipse and there is no shadow here for
   * the Moon to be in at all.
   *
   * That case has to be rejected outright rather than left to fall out of the
   * arithmetic, and assuming otherwise was a real bug. With `along` negative
   * the umbra radius below comes out *larger* than the Earth instead of
   * converging, so an ordinary new moon reports an umbral magnitude near 1 —
   * a total lunar eclipse, at the exact moment the Moon is between us and the
   * Sun. It stayed hidden because every check evaluated this within a day of a
   * known lunar eclipse, where `along` is never negative; it surfaced the first
   * time something swept a continuous range of dates.
   */
  const R = EARTH_EQUATORIAL_KM * SHADOW_ENLARGEMENT
  const sunward = along <= 0
  const umbraRadius = R - (along * (SUN_RADIUS_KM - R)) / sunDist
  const penumbraRadius = R + (along * (SUN_RADIUS_KM + R)) / sunDist

  /*
   * Magnitude is the fraction of the Moon's *diameter* inside the shadow, which
   * is the convention every published catalogue uses. So 0 is first contact, 1
   * is the whole disc just immersed, and above 1 the Moon is entirely inside
   * with room to spare — the value keeps climbing and is a real measure of how
   * central the eclipse is, not a saturated flag.
   */
  const umbral = sunward
    ? -Infinity
    : (umbraRadius + MOON_RADIUS_KM - separation) / (2 * MOON_RADIUS_KM)
  const penumbral = sunward
    ? -Infinity
    : (penumbraRadius + MOON_RADIUS_KM - separation) / (2 * MOON_RADIUS_KM)

  const phase =
    umbral >= 1 ? 'total' : umbral > 0 ? 'partial' : penumbral > 0 ? 'penumbral' : 'none'

  return {
    phase,
    umbralMagnitude: umbral,
    penumbralMagnitude: penumbral,
    separationKm: separation,
    umbraRadiusKm: umbraRadius,
    penumbraRadiusKm: penumbraRadius,
    /** The Sun and the Earth relative to the *Moon*, world frame — for drawing. */
    sun: toWorld({ x: sun.x - moon.x, y: sun.y - moon.y, z: sun.z - moon.z }),
    earth: toWorld({ x: -moon.x, y: -moon.y, z: -moon.z }),
  }
}

/**
 * A point in the world frame to latitude and east longitude on the body.
 *
 * `basis` and `meridian` come from `scene/pole.js`, so this reads the same
 * orientation the renderer draws — the sub-shadow point has to land on the same
 * ground the texture shows.
 *
 * Latitude is converted to **geodetic**, which is what maps and published
 * eclipse tracks use: it is the angle of the local vertical rather than the
 * angle at the centre, and on a body as flattened as the Earth the two differ
 * by up to 0.19° — about 21 km, which matters at the accuracy this is checked
 * to.
 */
export function surfacePoint(p, basis, meridian) {
  const bx = p.x * basis.x.x + p.y * basis.x.y + p.z * basis.x.z
  const by = p.x * basis.y.x + p.y * basis.y.y + p.z * basis.y.z
  const bz = p.x * basis.z.x + p.y * basis.z.y + p.z * basis.z.z

  const r = Math.hypot(bx, by, bz)
  const geocentric = Math.asin(by / r)
  const geodetic = Math.atan(Math.tan(geocentric) / (1 - EARTH_FLATTENING) ** 2)

  let lon = (Math.atan2(-bz, bx) - meridian) / DEG
  lon = (((((lon % 360) + 360) % 360) + 180) % 360) - 180

  return { latitude: geodetic / DEG, longitude: lon }
}

/** Ground distance between two lat/lon points, km — for checking a track. */
export function groundDistanceKm(a, b) {
  const la = a.latitude * DEG
  const lb = b.latitude * DEG
  const dLon = (b.longitude - a.longitude) * DEG
  const cos = Math.sin(la) * Math.sin(lb) + Math.cos(la) * Math.cos(lb) * Math.cos(dLon)
  return EARTH_EQUATORIAL_KM * Math.acos(Math.max(-1, Math.min(1, cos)))
}
