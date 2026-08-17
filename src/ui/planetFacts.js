import { ORBITAL_ELEMENTS } from '../data/orbitalElements.js'
import { MOON_ELEMENTS } from '../data/moonElements.js'
import { KM_PER_AU as AU_KM } from '../orbit/frames.js'

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
 * A moon's orbit, around its planet rather than around the Sun.
 *
 * The elements are already here — `moonElements.js` drives the scene — and
 * `LDot`, the mean longitude rate in degrees per Julian century, *is* the
 * orbital period once turned the right way up. Io comes out at 1.769 days,
 * which is the published figure to four significant figures.
 *
 * `a` is in AU like everything else in this app, which for a moon is an
 * awkward unit — Phobos orbits at 0.0000627 AU — so it is converted to
 * kilometres, which is how every reference quotes a moon's distance and how
 * `moonData` already writes it in prose.
 */
export function moonOrbitShape(id) {
  const elements = MOON_ELEMENTS[id]
  if (!elements?.LDot) return null
  const periodDays = (360 / elements.LDot) * 36525
  const radiusKm = elements.a * AU_KM
  return {
    parent: elements.parent,
    periodDays,
    radiusKm,
    eccentricity: elements.e,
    /* Circumference over period. An ellipse is longer than a circle of the
       same semi-major axis, but by less than 0.01% at these eccentricities. */
    meanSpeedKms: (2 * Math.PI * radiusKm) / (periodDays * 86400),
  }
}

/** "3.55 days", "27.3 days", "16 hours". */
function readableOrbit(days) {
  if (days < 1) return `${round(days * 24, 1)} hours`
  if (days < 100) return `${round(days, 2)} days`
  return `${round(days, 1)} days`
}

/**
 * The whole derived set for one body, ready to print, or null for anything
 * without the numbers to build it — every comet, every spacecraft, and the four
 * moons of Pluto whose masses nobody has actually measured. Those keep the
 * dossier they already had rather than a table of blanks.
 */
export function derivedFacts(body) {
  if (!body?.massKg || !body?.radiusKm) return null
  if (body.kind === 'moon') return moonFacts(body)
  if (!body.equatorialRadiusKm) return null
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

/**
 * The same idea for a moon, with the three rows that only make sense out there.
 *
 * A moon's radius is the mean one and there is no equatorial figure to reach
 * for, which is fine: these are small, slow, tidally locked bodies whose
 * oblateness is a fraction of a percent, so the distinction that mattered for
 * Saturn does not arise.
 *
 * The sunlight rows are dropped. A moon sits at its planet's distance from the
 * Sun to within a fraction of a percent, so repeating them here would be
 * printing the planet's numbers on the moon's page.
 */
function moonFacts(body) {
  const orbit = moonOrbitShape(body.id)
  if (!orbit) return null

  const gravity = surfaceGravity(body.massKg, body.radiusKm)
  const rho = density(body.massKg, body.radiusKm)

  return [
    {
      label: 'You would weigh',
      value: readableShare(weightFraction(body.massKg, body.radiusKm)),
      note: `surface gravity ${gravity < 1 ? gravity.toFixed(3) : gravity.toFixed(2)} m/s²`,
    },
    {
      label: 'Escape velocity',
      /*
       * Metres per second below 1 km/s, and most of these are. Phobos escapes
       * at 11 m/s — a running jump — and "0.0 km/s" would have thrown that
       * away, which is the single most striking number on the page.
       */
      value:
        escapeVelocity(body.massKg, body.radiusKm) < 1
          ? `${round(escapeVelocity(body.massKg, body.radiusKm) * 1000, 0)} m/s`
          : `${escapeVelocity(body.massKg, body.radiusKm).toFixed(2)} km/s`,
      note: "Earth's is 11.2 km/s",
    },
    {
      label: 'Density',
      value: `${round(rho, 0)} kg/m³`,
      /*
       * Only the two ends get a label. The middle of the range is genuinely
       * ambiguous — Phobos at 1,779 kg/m³ is a porous carbonaceous rubble pile
       * with no ice to speak of, and calling it "rock and ice" on the strength
       * of a density alone was asserting a composition the number cannot carry.
       */
      note: rho < 1200 ? 'mostly ice' : rho > 3000 ? 'mostly rock' : null,
    },
    {
      label: 'Orbits its planet in',
      value: readableOrbit(orbit.periodDays),
      /* Tidally locked, which is every major moon here: the day equals the
         year, so one number states both. */
      note: 'and turns once in the same time, keeping one face inward',
    },
    {
      label: 'Distance from it',
      value: `${round(orbit.radiusKm, 0).toLocaleString('en-US')} km`,
      note: `eccentricity ${round(orbit.eccentricity, 4)}`,
    },
    {
      label: 'Orbital speed',
      value: `${round(orbit.meanSpeedKms, 2)} km/s`,
      note: `${round(orbit.meanSpeedKms * 3600, 0).toLocaleString('en-US')} km/h`,
    },
  ]
}
