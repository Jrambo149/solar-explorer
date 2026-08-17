import { ORBITAL_ELEMENTS } from '../data/orbitalElements.js'

/**
 * What the dossier can work out for itself.
 *
 * Everything here is *derived* — from a mass, a radius and an orbit the app
 * already carries — rather than written down. That is the whole point. Prose
 * facts have to be researched, typed, and trusted; these cannot drift from the
 * data because they are the data, and `verify-dossier` checks them against
 * published values the app has never seen.
 *
 * It also answers a different question from the fact table above it. "Mass:
 * 6.42 × 10²³ kg" is a number nobody has intuition for. "You would weigh 38% of
 * what you weigh here" is the same number, answered.
 *
 * Kept out of the component, like `constellationFacts` and `starFacts`, so the
 * checks can call it without rendering anything.
 */

/** Newton's constant, m³ kg⁻¹ s⁻². CODATA 2018. */
const G = 6.6743e-11

/** Earth's surface gravity, for the comparison everything is quoted against. */
const EARTH_G = 9.80665

/** Light takes this many seconds to cross one astronomical unit. */
const LIGHT_SECONDS_PER_AU = 499.004784

/** Earth's mean orbital speed, km/s — the anchor for the vis-viva shortcut. */
const EARTH_SPEED_KMS = 29.7847

const KM_PER_AU = 149597870.7

/**
 * Surface gravity in m/s², from the mass and the **equatorial** radius.
 *
 * Which radius is not a detail. The app's `radiusKm` is the volumetric mean,
 * and every reference quotes surface gravity at the equator — for Saturn those
 * differ by 2,036 km and therefore by 7%, so using the mean produced 11.19 m/s²
 * against a published 10.44. Internally consistent, and wrong against every
 * source a reader could check.
 *
 * Still a simplification, and the same one the fact sheets make: this is the
 * Newtonian term alone, without the centrifugal reduction that makes a giant's
 * equator lighter still.
 */
export const surfaceGravity = (massKg, equatorialRadiusKm) =>
  (G * massKg) / (equatorialRadiusKm * 1000) ** 2

/**
 * What a person would weigh there, as a fraction of their weight here.
 *
 * Deliberately a *fraction* and never a number of kilograms. Mass does not
 * change and weight is what does, so "you would weigh 38% of what you weigh on
 * Earth" is true for everybody and needs nobody to type their own weight in.
 */
export const weightFraction = (massKg, equatorialRadiusKm) =>
  surfaceGravity(massKg, equatorialRadiusKm) / EARTH_G

/** Escape velocity in km/s, from the equatorial radius for the same reason. */
export const escapeVelocity = (massKg, equatorialRadiusKm) =>
  Math.sqrt((2 * G * massKg) / (equatorialRadiusKm * 1000)) / 1000

/**
 * Mean density in kg/m³, which is the number that sorts the solar system into
 * its two kinds: everything above about 3,000 is rock, everything below is
 * mostly gas and ice. Saturn's 687 is the one people remember, because it is
 * less than water.
 */
export const density = (massKg, meanRadiusKm) =>
  massKg / ((4 / 3) * Math.PI * (meanRadiusKm * 1000) ** 3)

/**
 * The orbit, from the same elements the scene is drawn from.
 *
 * Not from the `distance` string, and not from `au` — those are display values
 * and a rounded mean. `a` and `e` here are the osculating elements the planet
 * is actually solved with, so the perihelion and aphelion quoted are the ones
 * the dot on screen will visit.
 */
export function orbitShape(id) {
  const elements = ORBITAL_ELEMENTS[id]
  if (!elements) return null
  const { a, e } = elements
  return {
    semiMajorAu: a,
    eccentricity: e,
    perihelionAu: a * (1 - e),
    aphelionAu: a * (1 + e),
    /* Kepler's third law with the Sun's mass folded in: P in years is a^1.5
       when a is in AU. Exact enough that quoting it beside a published orbital
       period agrees to the day for every planet here. */
    periodYears: a ** 1.5,
    /* A circular-orbit speed scaled off Earth's. The real speed varies across
       an eccentric orbit — this is the mean, which is what "orbital speed" is
       taken to mean and what every fact sheet quotes. */
    meanSpeedKms: EARTH_SPEED_KMS / Math.sqrt(a),
  }
}

/** How long sunlight takes to arrive, in seconds. */
export const lightDelaySeconds = (au) => au * LIGHT_SECONDS_PER_AU

/**
 * How much sunlight it gets, relative to Earth — the inverse square law, and
 * the reason the outer solar system is dark. Neptune gets about a thousandth of
 * what we do.
 */
export const sunlightFraction = (au) => 1 / au ** 2

/**
 * How often Earth and this planet line up again, in days.
 *
 * The synodic period, and the one number here that is genuinely about *us*: it
 * is how long between the close approaches when a planet is biggest and
 * brightest in our sky, and it is why Mars launches come in windows twenty-six
 * months apart. Undefined for Earth, which has no synodic period with itself.
 */
export function synodicDays(id) {
  if (id === 'earth') return null
  const shape = orbitShape(id)
  if (!shape) return null
  const years = 1 / Math.abs(1 / shape.periodYears - 1)
  return years * 365.256363
}

/* ---- shaping the numbers for reading ---- */

const round = (v, places) => {
  const f = 10 ** places
  return Math.round(v * f) / f
}

/** "2 hours 39 minutes", "8.3 minutes", "42 seconds". */
export function readableDuration(seconds) {
  if (seconds < 90) return `${round(seconds, 0)} seconds`
  const minutes = seconds / 60
  if (minutes < 90) return `${round(minutes, 1)} minutes`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest === 0 ? `${hours} hours` : `${hours} h ${rest} min`
}

/** A fraction as a percentage or a multiple, whichever reads better. */
export function readableShare(fraction) {
  if (fraction >= 2) return `${round(fraction, fraction < 10 ? 1 : 0)}× Earth's`
  if (fraction >= 0.1) return `${round(fraction * 100, 0)}% of Earth's`
  if (fraction >= 0.001) return `${round(fraction * 100, 1)}% of Earth's`
  return `${round(fraction * 100, 3)}% of Earth's`
}

/**
 * The whole derived set for one planet, ready to print, or null for a body
 * without the numbers to build it — which is every moon, comet and spacecraft.
 * Those get the dossier they already had rather than a table of blanks.
 */
export function derivedFacts(body) {
  if (!body?.massKg || !body?.radiusKm || !body?.equatorialRadiusKm) return null
  const shape = orbitShape(body.id)
  if (!shape) return null

  // Equatorial for the two that are quoted that way; the mean for density.
  const gravity = surfaceGravity(body.massKg, body.equatorialRadiusKm)
  const synodic = synodicDays(body.id)

  return [
    {
      label: 'You would weigh',
      value: readableShare(weightFraction(body.massKg, body.equatorialRadiusKm)),
      note: `surface gravity ${round(gravity, 2)} m/s²`,
    },
    {
      label: 'Escape velocity',
      // `toFixed` rather than `round`: Mars comes out at exactly 5.0 and
      // rounding drops the zero, so it printed "5 km/s" beside "11.2 km/s".
      value: `${escapeVelocity(body.massKg, body.equatorialRadiusKm).toFixed(1)} km/s`,
      note: "Earth's is 11.2 km/s",
    },
    {
      label: 'Density',
      value: `${round(density(body.massKg, body.radiusKm), 0)} kg/m³`,
      note: density(body.massKg, body.radiusKm) < 1000 ? 'less dense than water' : null,
    },
    {
      label: 'Sunlight takes',
      value: readableDuration(lightDelaySeconds(shape.semiMajorAu)),
      note: 'to reach it from the Sun',
    },
    {
      label: 'Sunlight received',
      value: readableShare(sunlightFraction(shape.semiMajorAu)),
      note: 'by the inverse square law',
    },
    {
      label: 'Orbital speed',
      value: `${round(shape.meanSpeedKms, 1)} km/s`,
      note: `${round((shape.meanSpeedKms * 3600) / 1000, 0).toLocaleString('en-US')} thousand km/h`,
    },
    {
      label: 'Closest / furthest',
      value: `${round(shape.perihelionAu, 2)} – ${round(shape.aphelionAu, 2)} AU`,
      note: `eccentricity ${round(shape.eccentricity, 3)}`,
    },
    synodic && {
      label: 'Lines up with Earth',
      value: `every ${round(synodic / 365.256363, 2)} years`,
      note: `${round(synodic, 0).toLocaleString('en-US')} days between closest approaches`,
    },
  ].filter(Boolean)
}

export { KM_PER_AU }
