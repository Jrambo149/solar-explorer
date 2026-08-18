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

/**
 * The Sun's gravitational parameter, m³ s⁻², from the IAU's nominal value.
 *
 * Quoted as GM rather than as a mass because that is the product actually
 * measured: the Sun's mass and G are each known to about five figures, and
 * their product to eleven.
 */
const GM_SUN = 1.32712440018e20

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
export function orbitShape(source) {
  /*
   * An id, or the elements themselves.
   *
   * `ORBITAL_ELEMENTS` is the eight planets and Pluto, and for a long time
   * those were the only bodies with a page worth deriving anything for. Dwarf
   * planets come from the Small-Body Database, named asteroids from a separate
   * fit, and a comet carries its elements inline — so a lookup by id returned
   * null for three whole classes and the table silently did not appear.
   */
  const elements = typeof source === 'string' ? ORBITAL_ELEMENTS[source] : source
  if (!elements) return null
  const { a, e } = elements
  /*
   * An open orbit has no far end, no period and a negative `a`, so every
   * formula below returns something either meaningless or NaN. Four comets are
   * on one — three long-period comets a hair over e = 1, and 3I/ATLAS, which is
   * passing through from interstellar space at e = 6.1.
   */
  const closed = e < 1 && a > 0
  return {
    semiMajorAu: a,
    eccentricity: e,
    perihelionAu: a * (1 - e),
    aphelionAu: closed ? a * (1 + e) : null,
    /* Kepler's third law with the Sun's mass folded in: P in years is a^1.5
       when a is in AU. Exact enough that quoting it beside a published orbital
       period agrees to the day for every planet here. */
    periodYears: closed ? a ** 1.5 : null,
    /* A circular-orbit speed scaled off Earth's. The real speed varies across
       an eccentric orbit — this is the mean, which is what "orbital speed" is
       taken to mean and what every fact sheet quotes. Meaningless on an orbit
       that never closes, and dropped rather than quoted there. */
    meanSpeedKms: closed ? EARTH_SPEED_KMS / Math.sqrt(a) : null,
  }
}

/**
 * Speed at a given distance from the Sun, in km/s — the vis-viva equation.
 *
 * The mean speed above is a good enough answer for a planet, whose orbit is
 * nearly a circle. It is a useless one for a comet: Halley averages 3.4 km/s
 * over its orbit and rounds perihelion at 54.6, and the second number is the
 * one that says what a comet is. Works unchanged on an open orbit, where `a` is
 * negative and the `1/a` term adds rather than subtracts.
 */
export function speedAtKms(elements, radiusAu) {
  if (!elements) return null
  const r = radiusAu * KM_PER_AU * 1000
  const a = elements.a * KM_PER_AU * 1000
  return Math.sqrt(GM_SUN * (2 / r - 1 / a)) / 1000
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
export function synodicDays(id, elements) {
  if (id === 'earth') return null
  const shape = orbitShape(elements ?? id)
  if (!shape?.periodYears) return null
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
  if (!body) return null
  /*
   * A comet is the one class here that earns a table without a mass. Nobody
   * has weighed most of these — a few kilometres of porous ice has no
   * measurable pull on anything — but the orbit is known to many figures, and
   * on an orbit this eccentric the orbit *is* the story. See `cometFacts`.
   */
  if (body.kind === 'comet') return cometFacts(body)
  if (body.kind === 'moon') return body.massKg && body.radiusKm ? moonFacts(body) : null
  /*
   * The body's own elements rather than a lookup by id: a dwarf planet's come
   * from the Small-Body Database and a named asteroid's from its own fit, and
   * neither is in the planet table. See `orbitShape`.
   */
  const shape = orbitShape(body.elements ?? body.id)
  if (!shape) return null

  /*
   * Three of these rows need a mass and the rest need only an orbit, and the
   * split is not hypothetical: nobody has weighed Makemake, Juno or Apophis.
   *
   * The table used to be all-or-nothing, so a body without a mass got no table
   * at all — which threw away six rows that were perfectly well known in order
   * to avoid three that were not. Apophis is the case that makes the point: its
   * orbit is the most closely tracked of any object in this app, and it was the
   * one page that said nothing about it.
   */
  const weighed = Boolean(body.massKg && body.radiusKm)
  /*
   * Which radius, and it is not the same answer for a planet and for a rock.
   *
   * A planet is an oblate spheroid and every reference quotes its surface
   * gravity and escape velocity **at the equator** — using the volumetric mean
   * instead put Saturn 7% out, which is what this file's `surfaceGravity`
   * comment is about.
   *
   * A dwarf planet or a named asteroid is quoted at the **mean** radius
   * instead, because most of them are triaxial and an "equator" is not a
   * meaningful place on them. Following the planet convention here would have
   * been wrong by a factor of two on Haumea, whose long axis is 1,161 km and
   * whose mean radius is 798 — it is the one body where the choice is visible
   * rather than a few per cent.
   */
  const gravityRadiusKm =
    body.kind === 'planet' ? body.equatorialRadiusKm ?? body.radiusKm : body.radiusKm
  const gravity = weighed ? surfaceGravity(body.massKg, gravityRadiusKm) : null
  const synodic = synodicDays(body.id, body.elements)

  return [
    weighed && {
      label: 'You would weigh',
      value: readableShare(weightFraction(body.massKg, gravityRadiusKm)),
      /* Three decimals below 0.1 m/s²: Psyche pulls at 0.14 and Ceres at 0.28,
         and two would have printed several of these as "0.03 m/s²" for
         genuinely different numbers. */
      note: `surface gravity ${gravity < 0.1 ? gravity.toFixed(3) : gravity.toFixed(2)} m/s²`,
    },
    weighed && {
      label: 'Escape velocity',
      // `toFixed` rather than `round`: Mars comes out at exactly 5.0 and
      // rounding drops the zero, so it printed "5 km/s" beside "11.2 km/s".
      value:
        escapeVelocity(body.massKg, gravityRadiusKm) < 1
          ? `${round(escapeVelocity(body.massKg, gravityRadiusKm) * 1000, 0)} m/s`
          : `${escapeVelocity(body.massKg, gravityRadiusKm).toFixed(1)} km/s`,
      note: "Earth's is 11.2 km/s",
    },
    weighed && {
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
      value: `${shape.meanSpeedKms.toFixed(1)} km/s`,
      note: `${round((shape.meanSpeedKms * 3600) / 1000, 0).toLocaleString('en-US')} thousand km/h`,
    },
    {
      label: 'Closest / furthest',
      value: `${shape.perihelionAu.toFixed(2)} – ${shape.aphelionAu.toFixed(2)} AU`,
      note: `eccentricity ${shape.eccentricity.toFixed(3)}`,
    },
    synodic && {
      label: 'Lines up with Earth',
      /*
       * Days, not years, once the two orbits are close to a whole number of
       * years apart — which is everything beyond Jupiter, because a distant
       * body barely moves while Earth goes round. Neptune's synodic period is
       * 367 days and this row said "every 1 years", throwing away the only
       * interesting thing about it: it comes to opposition two days later each
       * year, and that is the whole of the difference.
       */
      value:
        synodic < 500
          ? `every ${round(synodic, 0)} days`
          : `every ${(synodic / 365.256363).toFixed(2)} years`,
      note:
        synodic < 500
          ? 'between closest approaches — barely more than one of our years'
          : `${round(synodic, 0).toLocaleString('en-US')} days between closest approaches`,
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

/**
 * A comet's numbers, which are a different set from a planet's.
 *
 * Everything the planet table leads with needs a mass, and these have none
 * worth the name: a few kilometres of porous ice, never weighed, and the two
 * that have been (67P by Rosetta, Tempel 1 by the size of the crater Deep
 * Impact dug) are not enough to build a class around. What is known instead is
 * the orbit, to as many figures as anything in this app, and on an orbit this
 * eccentric the orbit is the interesting thing.
 *
 * So the rows answer the questions an eccentric orbit provokes and a planet's
 * never does: how close does it get, how far out does it go, how fast is it
 * moving when it rounds the Sun, and how hard is the Sun hitting it there. The
 * last two are why comets grow tails at all.
 */
function cometFacts(body) {
  const shape = orbitShape(body.elements)
  if (!shape) return null

  const perihelion = body.perihelionAU ?? shape.perihelionAu
  const speed = speedAtKms(body.elements, perihelion)

  return [
    {
      label: 'Closest to the Sun',
      value: `${round(perihelion, 3)} AU`,
      /* Named against the orbits people can place, not against a bare number.
         Half of these dive inside Mercury's orbit; ISON came within two solar
         radii of the surface and did not survive it. */
      note: perihelion < 0.39
        ? 'inside Mercury’s orbit'
        : perihelion < 1
          ? 'inside Earth’s orbit'
          : perihelion < 1.52
            ? 'between Earth and Mars'
            : 'outside Mars’s orbit',
    },
    shape.aphelionAu
      ? {
          label: 'Furthest from it',
          value:
            shape.aphelionAu > 100
              ? `${round(shape.aphelionAu, 0).toLocaleString('en-US')} AU`
              : `${round(shape.aphelionAu, 1)} AU`,
          note:
            shape.aphelionAu > 1000
              ? 'far out into the Oort cloud'
              : shape.aphelionAu > 30
                ? 'beyond Neptune'
                : shape.aphelionAu > 9.5
                  ? 'out past Saturn'
                  : 'out into the asteroid belt',
        }
      : {
          /* The honest row for the four that never come back. Stated as the
             consequence rather than as "eccentricity 1.0005", which is the
             same fact in a form nobody can read. */
          label: 'It does not come back',
          value: 'unbound',
          note: `eccentricity ${round(shape.eccentricity, 4)} — over 1, so the orbit never closes`,
        },
    shape.periodYears && {
      label: 'One orbit takes',
      value:
        shape.periodYears > 500
          ? `${round(shape.periodYears, 0).toLocaleString('en-US')} years`
          : `${round(shape.periodYears, 1)} years`,
      note: shape.periodYears < 200 ? 'a short-period comet' : 'a long-period comet',
    },
    speed && {
      label: 'Speed at perihelion',
      value: `${round(speed, 1)} km/s`,
      /* The comparison that makes the number mean something. Earth's orbital
         speed is the one everybody has heard, and most of these beat it
         several times over at their closest. */
      note: `Earth orbits at ${round(EARTH_SPEED_KMS, 1)} km/s`,
    },
    {
      label: 'Sunlight there',
      value: readableShare(sunlightFraction(perihelion)),
      /* This is the row that explains the tail. A comet is inert ice until the
         sunlight is strong enough to turn that ice straight to gas, and the
         coma and tail are that gas being blown off. */
      note: 'which is what drives off the coma and tail',
    },
    /*
     * No nucleus row, and the reason is worth writing down.
     *
     * A comet's `radiusKm` here comes from Eyes on the Solar System, where it
     * is a *render* size — how big to draw a thing that is otherwise a
     * sub-pixel speck — and not a measurement. For the half-dozen a spacecraft
     * has flown past it happens to be close to the real figure; for ISON it
     * would have printed "about 6 km across" for a nucleus no observation ever
     * put above two, and that is exactly the kind of wrong nobody can catch by
     * looking. Where a nucleus really has been measured it is written down in
     * `cometDossiers.js` and appears in the Key facts table instead.
     */
    {
      label: 'Orbit tilt',
      value: `${round(body.elements.i, 1)}°`,
      /* Over 90° means it goes round the Sun the wrong way, which is worth
         naming: Halley meets us head-on, and that is why its meteor showers
         are the fastest of the year. */
      note: body.elements.i > 90 ? 'retrograde — it orbits the wrong way round' : 'to the ecliptic',
    },
  ].filter(Boolean)
}
