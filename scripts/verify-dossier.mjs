#!/usr/bin/env node
/**
 * Checks the dossier's derived numbers against published ones.
 *
 * Run with:
 *     npm run verify:dossier
 *
 * `planetFacts.js` works everything out from three inputs the app already
 * carries — a mass, a radius and an orbit — so the numbers cannot drift out of
 * step with the scene. What that does *not* prove is that they are right: a
 * sign error in the synodic period or a factor of two in escape velocity would
 * be perfectly consistent with the data and perfectly wrong.
 *
 * So the table below is NASA's planetary fact sheet, typed in here and nowhere
 * else. Nothing in `src/` has ever seen these values, and every one of them was
 * computed independently by the app from its own data. Agreement means the
 * derivation is sound; a mismatch means one of the two is wrong and both are
 * worth looking at.
 *
 * Tolerances are 1.5% except where noted, and each exception names the physics
 * it is leaving out rather than being slack for its own sake.
 *
 * This check has already earned its keep once. Surface gravity came out 4.6%
 * high for Jupiter and 7.2% high for Saturn, and the cause was a genuine
 * conflation: the app stores *volumetric mean* radii, which is right for
 * drawing a sphere and right for density, while every reference quotes surface
 * gravity and escape velocity at the **equator**. For Saturn those differ by
 * 2,036 km. Nothing in the app was inconsistent — it was consistently
 * answering a slightly different question than the one the labels implied.
 */

import { PLANETS } from '../src/data/planetData.js'
import { BODY_IMAGES } from '../src/data/bodyImages.js'
import {
  density,
  derivedFacts,
  escapeVelocity,
  lightDelaySeconds,
  moonOrbitShape,
  orbitShape,
  surfaceGravity,
  synodicDays,
  weightFraction,
} from '../src/ui/planetFacts.js'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}
const section = (title) => console.log(`\n${title}\n${'-'.repeat(title.length)}`)

const near = (got, want, tolerance = 0.015) => Math.abs(got - want) / Math.abs(want) <= tolerance

/**
 * NASA planetary fact sheet, nasa.gov/planetary/factsheet.
 * gravity m/s² · escape km/s · density kg/m³ · orbital speed km/s · synodic days
 */
const PUBLISHED = {
  mercury: { gravity: 3.7, escape: 4.3, density: 5429, speed: 47.36, synodic: 115.88 },
  venus: { gravity: 8.87, escape: 10.36, density: 5243, speed: 35.02, synodic: 583.92 },
  earth: { gravity: 9.807, escape: 11.186, density: 5514, speed: 29.78, synodic: null },
  mars: { gravity: 3.71, escape: 5.03, density: 3934, speed: 24.07, synodic: 779.94 },
  jupiter: { gravity: 24.79, escape: 59.5, density: 1326, speed: 13.06, synodic: 398.88 },
  saturn: { gravity: 10.44, escape: 35.5, density: 687, speed: 9.68, synodic: 378.09 },
  uranus: { gravity: 8.87, escape: 21.3, density: 1270, speed: 6.8, synodic: 369.66 },
  neptune: { gravity: 11.15, escape: 23.5, density: 1638, speed: 5.43, synodic: 367.49 },
}

const planet = (id) => PLANETS.find((p) => p.id === id)

section('Surface gravity, against the fact sheet')
for (const [id, want] of Object.entries(PUBLISHED)) {
  const p = planet(id)
  const got = surfaceGravity(p.massKg, p.equatorialRadiusKm)
  /*
   * 2.5%, which is what is left once the right radius is used. The remainder is
   * the centrifugal term: the fact sheet's equatorial gravity is reduced by the
   * body's own spin, which this Newtonian expression does not model. It matters
   * for exactly one planet — Saturn, whose equator moves at 9.87 km/s.
   */
  check(`${p.name}: ${got.toFixed(2)} m/s²`, near(got, want.gravity, 0.025), `published ${want.gravity}`)
}

section('Escape velocity')
for (const [id, want] of Object.entries(PUBLISHED)) {
  const p = planet(id)
  const got = escapeVelocity(p.massKg, p.equatorialRadiusKm)
  check(`${p.name}: ${got.toFixed(2)} km/s`, near(got, want.escape, 0.02), `published ${want.escape}`)
}

section('Mean density')
for (const [id, want] of Object.entries(PUBLISHED)) {
  const p = planet(id)
  const got = density(p.massKg, p.radiusKm)
  // The volumetric mean radius is exactly what density is defined against.
  check(`${p.name}: ${got.toFixed(0)} kg/m³`, near(got, want.density, 0.01), `published ${want.density}`)
}

section('Mean orbital speed')
for (const [id, want] of Object.entries(PUBLISHED)) {
  const got = orbitShape(id).meanSpeedKms
  check(`${planet(id).name}: ${got.toFixed(2)} km/s`, near(got, want.speed), `published ${want.speed}`)
}

section('Synodic period with Earth')
for (const [id, want] of Object.entries(PUBLISHED)) {
  const got = synodicDays(id)
  if (want.synodic === null) {
    check(`${planet(id).name} has none, and says so`, got === null)
    continue
  }
  check(`${planet(id).name}: ${got.toFixed(1)} days`, near(got, want.synodic), `published ${want.synodic}`)
}

section('Sunlight, and the two facts everyone knows')
check(
  'light reaches Earth in about 8 minutes 19 seconds',
  near(lightDelaySeconds(1), 499, 0.01),
  `${lightDelaySeconds(orbitShape('earth').semiMajorAu).toFixed(1)} s at Earth’s own semi-major axis`,
)
check(
  'a person weighs 38% of their Earth weight on Mars',
  near(weightFraction(planet('mars').massKg, planet('mars').equatorialRadiusKm), 0.378, 0.02),
)
check(
  'Saturn is less dense than water',
  density(planet('saturn').massKg, planet('saturn').radiusKm) < 1000,
  `${density(planet('saturn').massKg, planet('saturn').radiusKm).toFixed(0)} kg/m³`,
)
check(
  'Neptune gets about a thousandth of Earth’s sunlight',
  near(1 / orbitShape('neptune').semiMajorAu ** 2, 0.00111, 0.05),
)

section('Every planet gets a full set')
for (const p of PLANETS) {
  const rows = derivedFacts(p)
  const complete = rows && rows.every((r) => r.value && !/NaN|undefined|Infinity/.test(r.value))
  check(`${p.name}: ${rows?.length ?? 0} rows, all readable`, complete)
}

/*
 * And the bodies that have no business with this table say so.
 *
 * `derivedFacts` needs a mass, a radius and an orbit, and refuses without
 * them — so this is checking a *refusal*, which is the half that would fail
 * silently. What belongs in the refusing set has narrowed twice: dwarf planets
 * and named asteroids joined the table once their masses were written down,
 * and comets get a table of their own that needs no mass at all. What is left
 * is the spacecraft, which have no mass, no radius and no Keplerian orbit
 * between them, and Pluto's four small moons, which nobody has weighed.
 */
const { BODIES } = await import('../src/data/bodies.js')
const ALLOWED = new Set(['planet', 'moon', 'dwarf', 'asteroid', 'comet'])
const wrongly = BODIES.filter((b) => !ALLOWED.has(b.kind) && derivedFacts(b) !== null)
check(
  'no spacecraft gets a “By the numbers” table',
  wrongly.length === 0,
  wrongly.length ? wrongly.map((b) => b.name).join(', ') : `${BODIES.length} bodies checked`,
)

/*
 * Every comet gets the comet table, and every row of it is readable.
 *
 * The rows differ by orbit — an open one has no aphelion and no period, and
 * says so instead — so this checks the count is plausible rather than fixed,
 * and that nothing anywhere printed a NaN. `speedAtKms` on a negative `a` is
 * the one that would.
 */
section('Every comet gets the comet table')
for (const c of BODIES.filter((b) => b.kind === 'comet')) {
  const rows = derivedFacts(c)
  const readable =
    rows && rows.length >= 5 && rows.every((r) => r.value && !/NaN|undefined|Infinity/.test(r.value))
  check(`${c.name}: ${rows?.length ?? 0} rows, all readable`, readable)
}

/*
 * The prose and the facts must not repeat each other.
 *
 * Adding a "story" beside a list of facts written years earlier produced
 * twenty-six restatements and one outright contradiction: a fact claimed the
 * Great Red Spot had been observed "for over 350 years" while the paragraph
 * under it said "at least 190 years and possibly since the 1660s". Both are
 * defensible readings of the same disputed history, and having both on one page
 * is indefensible.
 *
 * Word overlap will not catch a contradiction — only a person reading can — but
 * it catches the restatements, and it was the restatements that hid the
 * contradiction in the noise.
 */
/*
 * The dwarf planets and the named asteroids, against published values.
 *
 * A third table typed here and nowhere else, and it is doing more work than the
 * planet one because these numbers reach the app by a longer route: a `GM` from
 * the Small-Body Database, or a mass from a paper, divided by a radius curated
 * by hand in a different file. Two independently correct halves can still be
 * paired wrongly, and the result looks entirely plausible.
 *
 * `gravity` and `escape` here are quoted at the **mean** radius, which is the
 * convention for triaxial bodies and the opposite of the planet convention —
 * see `derivedFacts`. Getting that backwards is a factor of two on Haumea and
 * a few per cent everywhere else, which is exactly the sort of error that only
 * a table like this one catches.
 *
 * Orbital periods are from Kepler's third law on the app's own semi-major axis
 * against the period JPL publishes, which is a genuinely independent number.
 *
 * Tolerance is 5% rather than the 1.5% used for the planets, and the reason is
 * honest rather than convenient: several of these masses carry published error
 * bars wider than that themselves. Hygiea's is quoted to two significant
 * figures.
 */
section('The dwarf planets and named asteroids, against published values')

const SMALL = {
  ceres: { gravity: 0.28, escape: 0.51, density: 2162, periodYears: 4.60 },
  pluto: { gravity: 0.62, escape: 1.21, density: 1854, periodYears: 247.94 },
  haumea: { gravity: 0.401, density: 1885, periodYears: 284.88 },
  makemake: { periodYears: 307.33 },
  eris: { gravity: 0.82, escape: 1.38, density: 2430, periodYears: 557.12 },
  vesta: { gravity: 0.25, escape: 0.36, density: 3456, periodYears: 3.63 },
  pallas: { gravity: 0.21, escape: 0.32, density: 2890, periodYears: 4.62 },
  hygiea: { density: 1940, periodYears: 5.57 },
  juno: { periodYears: 4.36 },
  /*
   * No gravity row for Psyche, and the omission is the finding.
   *
   * The figure quoted almost everywhere is 0.144 m/s², and it disagrees with
   * this app by 10%. Neither is wrong: 0.144 divides the same `GM` by a
   * 211 km diameter, and Shepard et al. (2021) revised that to 222 km. The app
   * carries the newer radius, so it gets 0.130, and a check against the older
   * number would be asserting that the app should use superseded data.
   *
   * Density is the row that still bites here — it uses the same mass and the
   * same radius, and the SBDB publishes it independently at 4.172 g/cm³.
   */
  psyche: { density: 4172, periodYears: 4.99 },
  apophis: { periodYears: 0.89 },
}

for (const [id, want] of Object.entries(SMALL)) {
  const body = BODIES.find((b) => b.id === id)
  const results = []
  if (want.gravity) {
    const got = surfaceGravity(body.massKg, body.radiusKm)
    results.push([`gravity ${got.toFixed(3)} vs ${want.gravity} m/s²`, near(got, want.gravity, 0.05)])
  }
  if (want.escape) {
    const got = escapeVelocity(body.massKg, body.radiusKm)
    results.push([`escape ${got.toFixed(3)} vs ${want.escape} km/s`, near(got, want.escape, 0.05)])
  }
  if (want.density) {
    const got = density(body.massKg, body.radiusKm)
    results.push([`density ${got.toFixed(0)} vs ${want.density} kg/m³`, near(got, want.density, 0.05)])
  }
  const got = orbitShape(body.elements).periodYears
  results.push([`period ${got.toFixed(2)} vs ${want.periodYears} yr`, near(got, want.periodYears, 0.05)])

  check(
    `${body.name}: ${results.map(([label]) => label).join(', ')}`,
    results.every(([, ok]) => ok),
  )
}

/*
 * And the three nobody has weighed keep their orbit rows and lose the rest.
 *
 * The interesting half of the split. Makemake's moon has never had its orbit
 * solved, Juno's mass comes only from how it perturbs its neighbours, and
 * nothing has flown past Apophis — so all three have an orbit and no mass, and
 * the table has to degrade rather than vanish. It used to vanish, which threw
 * away Apophis's orbit, the most closely tracked one in the app.
 */
for (const id of ['makemake', 'juno', 'apophis']) {
  const body = BODIES.find((b) => b.id === id)
  const rows = derivedFacts(body) ?? []
  const labels = rows.map((r) => r.label)
  check(
    `${body.name}: ${rows.length} orbit rows, and none claiming a mass`,
    rows.length >= 4 &&
      !body.massKg &&
      !labels.some((l) => /weigh|Escape|Density/.test(l)) &&
      rows.every((r) => !/NaN|undefined/.test(r.value)),
  )
}

section('The writing does not repeat itself')

const words = (text) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  )

const WITH_PROSE = BODIES.filter(
  (b) => ['planet', 'dwarf', 'asteroid', 'comet'].includes(b.kind) && b.facts?.length,
)
for (const p of WITH_PROSE) {
  const pieces = [...p.facts, ...(p.story ?? [])]
  const clashes = []
  for (let i = 0; i < p.facts.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = words(p.facts[i])
      const b = words(pieces[j])
      const shared = [...b].filter((w) => a.has(w)).length
      if (shared / Math.min(a.size, b.size) > 0.55) clashes.push(p.facts[i].slice(0, 44))
    }
  }
  check(`${p.name}: ${p.facts.length} facts, ${p.story?.length ?? 0} paragraphs, none restated`,
    clashes.length === 0, clashes.length ? clashes.join(' / ') : undefined)
}

section('The moons, against published values')

/*
 * A second table nothing in src/ has seen. Orbital periods and distances are
 * the ones every reference quotes; gravity and escape velocity are computed
 * from the mean radius, which for bodies this small and this slow is the only
 * radius there is.
 */
const MOONS = {
  luna: { gravity: 1.62, escape: 2.38, density: 3344, days: 27.322, km: 384400 },
  io: { gravity: 1.796, escape: 2.558, density: 3528, days: 1.769, km: 421800 },
  europa: { gravity: 1.314, escape: 2.025, density: 3013, days: 3.551, km: 671100 },
  ganymede: { gravity: 1.428, escape: 2.741, density: 1936, days: 7.155, km: 1070400 },
  callisto: { gravity: 1.235, escape: 2.44, density: 1834, days: 16.689, km: 1882700 },
  titan: { gravity: 1.352, escape: 2.639, density: 1881, days: 15.945, km: 1221870 },
  enceladus: { gravity: 0.113, escape: 0.239, density: 1609, days: 1.370, km: 238040 },
  mimas: { gravity: 0.064, escape: 0.159, density: 1150, days: 0.942, km: 185540 },
  triton: { gravity: 0.779, escape: 1.455, density: 2059, days: 5.877, km: 354759 },
  phobos: { gravity: 0.0057, escape: 0.0114, density: 1876, days: 0.319, km: 9376 },
  charon: { gravity: 0.288, escape: 0.58, density: 1702, days: 6.387, km: 19591 },
}

const { BODIES: ALL } = await import('../src/data/bodies.js')
const moon = (id) => ALL.find((b) => b.id === id)

for (const [id, want] of Object.entries(MOONS)) {
  const m = moon(id)
  const shape = moonOrbitShape(id)
  const g = surfaceGravity(m.massKg, m.radiusKm)
  const v = escapeVelocity(m.massKg, m.radiusKm)
  const rho = density(m.massKg, m.radiusKm)
  const ok =
    near(g, want.gravity, 0.03) &&
    near(v, want.escape, 0.03) &&
    near(rho, want.density, 0.06) &&
    near(shape.periodDays, want.days, 0.01) &&
    near(shape.radiusKm, want.km, 0.01)
  check(
    `${m.name}: ${g.toFixed(3)} m/s², ${v.toFixed(3)} km/s, ${shape.periodDays.toFixed(3)} d, ` +
      `${Math.round(shape.radiusKm).toLocaleString('en-US')} km`,
    ok,
    `published ${want.gravity} / ${want.escape} / ${want.days} / ${want.km.toLocaleString('en-US')}`,
  )
}

/*
 * And Pluto's four small moons get nothing, deliberately.
 *
 * Their masses are inferred from assumed densities and a size measured from a
 * handful of pixels — known to within a factor of a few, not weighed. A table
 * quoting their surface gravity to three decimals would read as a measurement.
 */
for (const id of ['styx', 'nix', 'kerberos', 'hydra']) {
  check(`${moon(id).name} has no table, because nobody has weighed it`, derivedFacts(moon(id)) === null)
}

section('The prose')

const MOONS_ALL = ALL.filter((b) => b.kind === 'moon' && b.tier !== 'minor')
check(
  'every major moon has a story to read',
  MOONS_ALL.every((m) => m.story?.length >= 2),
  `${MOONS_ALL.filter((m) => m.story?.length >= 2).length} of ${MOONS_ALL.length}`,
)
check(
  'and every planet does',
  PLANETS.every((b) => b.story?.length >= 2),
)

section('The Moon’s phases')

const { MOON_PHASES, SYNODIC_DAYS } = await import('../src/data/moonPhases.js')
const { moonPhaseAt } = await import('../src/orbit/moonPhase.js')
const { ORBITAL_ELEMENTS: ELEM } = await import('../src/data/orbitalElements.js')

check('eight principal phases, each with a photograph on disk',
  MOON_PHASES.length === 8 &&
    MOON_PHASES.every((f) => existsSync(join(ROOT, 'public', 'images', 'phases', f.file))))

check('all eight come from one photographic series',
  new Set(MOON_PHASES.map((f) => f.nasaId.replace(/\d+$/, ''))).size === 1,
  'so the row compares the Moon rather than eight photographers')

/*
 * The phase is computed from the app's own geometry, so it can be checked
 * against the almanac. These are published new and full Moons; nothing in src/
 * has ever seen them.
 */
const EVENTS = [
  ['2025-12-20 new', 2461029.571, 0],
  ['2026-01-18 new', 2461059.328, 0],
  ['2026-02-01 full', 2461073.424, 1],
  ['2026-03-03 full', 2461102.985, 1],
]
for (const [label, jd, want] of EVENTS) {
  const p = moonPhaseAt(jd, ELEM.earth)
  const ok = want === 0 ? p.illumination < 0.01 : p.illumination > 0.99
  check(`${label}: ${(p.illumination * 100).toFixed(1)}% lit`, ok,
    `elongation ${p.elongationDegrees.toFixed(1)}°, nearest "${p.phase.name}"`)
}

/*
 * Waxing and waning is the half of this that is invisible when wrong: first
 * and last quarter are the same shape mirrored, and a sign error swaps them
 * without changing a single pixel of the strip.
 */
{
  const first = moonPhaseAt(2461059.328 + 7.38, ELEM.earth)
  const last = moonPhaseAt(2461059.328 + 22.15, ELEM.earth)
  check('a half Moon on the way up is the first quarter, waxing',
    first.waxing && first.phase.id === 'first-quarter' && Math.abs(first.illumination - 0.5) < 0.1)
  check('and on the way down is the last quarter, waning',
    !last.waxing && last.phase.id === 'last-quarter' && Math.abs(last.illumination - 0.5) < 0.1)
}

/* The age has to run forward through a whole lunation and never double back. */
{
  let back = 0
  let previous = null
  for (let d = 0; d < SYNODIC_DAYS; d += 0.25) {
    const { age } = moonPhaseAt(2461059.328 + d, ELEM.earth)
    if (previous !== null && age < previous - 0.01 && age > 1) back++
    previous = age
  }
  check('the age runs forward across a whole lunation', back === 0, `${back} reversals`)
}

/*
 * The instants themselves, against the almanac.
 *
 * These are published to the minute and nothing in src/ has seen them. The
 * search has to use ecliptic longitude rather than the 3D elongation: the
 * Moon's orbit is inclined 5.1°, so the elongation bottoms out at the latitude
 * rather than at zero and only reaches zero during an eclipse — a root search
 * on it would find new Moons in eclipse seasons and nothing in between.
 */
{
  const { nextPhaseAfter, upcomingPhases } = await import('../src/orbit/moonPhase.js')
  const MINUTE = 1 / 1440
  const INSTANTS = [
    ['new Moon, 18 Jan 2026 19:52 UTC', 2461040, 0, 2461059.32778],
    ['full Moon, 3 Mar 2026 11:38 UTC', 2461090, 180, 2461102.98472],
    ['new Moon, 17 Feb 2026 12:01 UTC', 2461070, 0, 2461089.00069],
  ]
  for (const [label, from, target, want] of INSTANTS) {
    const got = nextPhaseAfter(from, target, ELEM.earth)
    check(`${label}`, Math.abs(got - want) < 2 * MINUTE,
      `off by ${((got - want) * 1440).toFixed(1)} minutes`)
  }

  /* Every phase's next occurrence is in the future and inside one month. */
  const from = 2461269
  const soon = upcomingPhases(from, ELEM.earth)
  check('every phase comes round again within a month',
    soon.length === 8 && soon.every((f) => f.jd > from && f.jd < from + SYNODIC_DAYS + 0.1),
    soon.map((f) => (f.jd - from).toFixed(1)).join(', ') + ' days away')
}

section('The Moon’s special nights')

{
  const { moonEvents, lunarDistanceKm } = await import('../src/orbit/moonEvents.js')
  const found = moonEvents(2461270, 2461270 + 3000, ELEM.earth, 200)
  const kinds = new Set(found.map((e) => e.kind))
  check('all five kinds are found by searching, not listed',
    ['blood-moon', 'lunar-eclipse', 'supermoon', 'micromoon', 'blue-moon'].every((k) => kinds.has(k)),
    [...kinds].join(', '))

  /*
   * The 31 December 2028 total eclipse falls on the second full Moon of the
   * month — a blood Moon on a blue Moon. It is the single best check available
   * here, because it can only come out right if the eclipse search, the full
   * Moon solve and the calendar test all agree on the same night.
   */
  const newYear = found.filter((e) => Math.abs(e.jd - 2462136.5) < 1)
  check('31 Dec 2028 is both a blood Moon and a blue Moon',
    newYear.some((e) => e.kind === 'blood-moon') && newYear.some((e) => e.kind === 'blue-moon'),
    newYear.map((e) => e.name).join(' + ') || 'neither found')

  /* Distances have to stay inside the real orbit. */
  const distances = found.filter((e) => e.kind === 'supermoon' || e.kind === 'micromoon')
  check('every super/micro Moon sits inside perigee and apogee',
    distances.every((e) => {
      const km = lunarDistanceKm(e.jd)
      return km > 356000 && km < 407000
    }),
    `${distances.length} checked`)

  /*
   * The event discs are the phase renders, not press photographs, and they must
   * stay that way: a row of pictures is a comparison, and it only compares the
   * Moon if the camera, the scale and the background are held still.
   */
  const full = join(ROOT, 'public', 'images', 'phases', 'full.jpg')
  check('the special nights reuse the phase renders', existsSync(full))

  /*
   * The rare nights must survive the cut from ordinary dates.
   *
   * Super and micro Moons come in runs of three or four consecutive months, so
   * truncating the list chronologically filled every place with near-identical
   * full Moons and dropped the blood Moon entirely — the rarest thing in the
   * window, and the one anyone would actually stay up for. Checked from several
   * starting dates, because it depended entirely on where in the cycle you
   * happened to look.
   */
  for (const start of [2461270, 2461600, 2461950, 2462300]) {
    const shown = moonEvents(start, start + 365 * 5, ELEM.earth, 8)
    const kinds = new Set(shown.map((e) => e.kind))
    check(`from JD ${start}, the rare nights are not crowded out`,
      kinds.has('blood-moon') && kinds.has('blue-moon'),
      [...kinds].join(', '))
    check(`  and it still reads in date order`,
      shown.every((e, i) => i === 0 || e.jd >= shown[i - 1].jd))
  }

  /* Events must run forward and never precede the search window. */
  check('events come back in date order, all in the future',
    found.every((e, i) => e.jd > 2461270 && (i === 0 || e.jd >= found[i - 1].jd)))
}

section('The photographs')
let shots = 0
/*
 * Planets and moons together. Moons carry two rather than three, and for most
 * of them two is all that exists — Umbriel was photographed once, in 1986.
 */
/*
 * Which bodies are expected to have pictures, and — the harder half — which are
 * expected not to.
 *
 * Nine of the dwarf planets and named asteroids have never been resolved into
 * more than a few pixels by anything, and four of the comets were never more
 * than points of light. NASA publishes artists' impressions of most of them,
 * and the one rule a section headed "Seen for real" has is that it must not
 * contain an illustration. So an empty gallery is the correct answer for those,
 * and `NO_GALLERY` asserts it stays empty — otherwise a later well-meaning
 * addition of a beautiful Eris concept painting would pass every other check
 * here.
 */
const NO_GALLERY = new Set([
  'haumea', 'makemake', 'eris',
  'pallas', 'hygiea', 'juno', 'psyche', 'apophis',
  '1i_oumuamua', 'c_2025_n1', 'c_2010_x1', 'c_2019_y4',
])
const WITH_GALLERIES = [
  ...PLANETS,
  ...ALL.filter((b) => b.kind === 'moon' && b.tier !== 'minor'),
  ...ALL.filter(
    (b) => ['dwarf', 'asteroid', 'comet'].includes(b.kind) && !NO_GALLERY.has(b.id),
  ),
]
for (const p of WITH_GALLERIES) {
  const gallery = BODY_IMAGES[p.id] ?? []
  shots += gallery.length
  const onDisk = gallery.every((s) => existsSync(join(ROOT, 'public', 'images', 'bodies', s.file)))
  /*
   * Credited to an agency, not necessarily to NASA.
   *
   * This check used to insist on the word NASA and it failed the moment the
   * comets arrived: the best images of 67P are Rosetta's, the only close image
   * of Halley is Giotto's, and both are ESA missions whose pictures NASA hosts
   * and credits to ESA — correctly. The thing worth asserting is that the
   * credit names whoever took it, which is why the fallback the fetch script
   * builds from a centre name would not satisfy this on its own.
   */
  const credited = gallery.every(
    (s) => s.credit && /NASA|ESA|JAXA|ISRO|Roscosmos/i.test(s.credit) && s.title && s.why,
  )
  /*
   * Every picture links to its own source, and no caption carries a bare URL.
   *
   * NASA's descriptions routinely end with a photojournal link, which read as a
   * wall of raw URL in the middle of a paragraph — redundant, since the picture
   * is already a link to exactly that.
   */
  const linked = gallery.every(
    (s) => /^https:\/\/images\.nasa\.gov\/details\//.test(s.source ?? '') &&
      !/https?:\/\//.test(s.description ?? ''),
  )
  check(`${p.name}: every picture links to its source, no URLs in the prose`, linked)
  check(
    `${p.name}: ${gallery.length} image${gallery.length === 1 ? '' : 's'}, present and credited`,
    /* Three for a planet or a dwarf planet, at least one for anything else —
       Halley has exactly one close image in existence and always will. */
    gallery.length >= (p.kind === 'planet' || p.kind === 'dwarf' ? 3 : 1) && onDisk && credited,
  )
}

for (const id of NO_GALLERY) {
  check(
    `${id}: no gallery, because no real picture of it exists`,
    (BODY_IMAGES[id] ?? []).length === 0,
  )
}

/*
 * No picture is credited with the year it was filed rather than the year it was
 * taken.
 *
 * `date_created` in NASA's library is the date the *record* was created, and
 * Goddard bulk-loaded a large archive on 8 December 2017 — which includes the
 * Moon phase renders, the Siding Spring images from the 2014 Mars flyby, and
 * Comet ISON, which ceased to exist in 2013. Every one of them reports 2017,
 * and the panel prints that year in the credit line. The fetch script drops the
 * date for those ids; this makes sure it keeps doing so.
 */
const misdated = Object.values(BODY_IMAGES)
  .flat()
  .filter((shot) => shot.nasaId.startsWith('GSFC_20171208_Archive_') && shot.date)
check(
  'no photograph is credited with a bulk-archive ingest date',
  misdated.length === 0,
  misdated.length ? misdated.map((s) => s.nasaId).join(', ') : undefined,
)
/*
 * Counted from the galleries themselves rather than from a literal, so adding a
 * moon cannot quietly leave it without pictures: the expected total is "three
 * for every planet, at least one for every major moon", which is a rule rather
 * than a number somebody has to remember to bump.
 */
const expected = PLANETS.length * 3
check(
  `${shots} photographs in total`,
  shots >= expected + MOONS_ALL.length && WITH_GALLERIES.every((b) => (BODY_IMAGES[b.id] ?? []).length > 0),
)

/*
 * Nothing in the shipped app may reach for them over the network.
 *
 * The whole reason these are baked. A stray absolute URL in the generated file
 * would work perfectly in development and leave the gallery blank for anyone
 * offline, which is exactly the failure this project's no-runtime-fetch rule
 * exists to prevent.
 */
const remote = Object.values(BODY_IMAGES)
  .flat()
  .filter((s) => /^https?:/i.test(s.file))
check('no image is loaded from the network', remote.length === 0)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
