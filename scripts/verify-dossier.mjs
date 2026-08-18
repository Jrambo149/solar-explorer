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
 * `derivedFacts` returns null without a mass, a radius and an orbit, which is
 * every moon, comet and spacecraft in the app. The dossier then draws the page
 * it always drew rather than a section full of blanks — so this is checking a
 * *refusal*, which is the half that would fail silently.
 */
const { BODIES } = await import('../src/data/bodies.js')
const wrongly = BODIES.filter(
  (b) => b.kind !== 'planet' && b.kind !== 'moon' && derivedFacts(b) !== null,
)
check(
  'nothing but a planet or a moon gets a “By the numbers” table',
  wrongly.length === 0,
  wrongly.length ? wrongly.map((b) => b.name).join(', ') : `${BODIES.length} bodies checked`,
)

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
section('The writing does not repeat itself')

const words = (text) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  )

for (const p of PLANETS) {
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
const WITH_GALLERIES = [...PLANETS, ...ALL.filter((b) => b.kind === 'moon' && b.tier !== 'minor')]
for (const p of WITH_GALLERIES) {
  const gallery = BODY_IMAGES[p.id] ?? []
  shots += gallery.length
  const onDisk = gallery.every((s) => existsSync(join(ROOT, 'public', 'images', 'bodies', s.file)))
  const credited = gallery.every((s) => s.credit && /NASA/i.test(s.credit) && s.title && s.why)
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
    gallery.length >= (p.kind === 'moon' ? 1 : 3) && onDisk && credited,
  )
}
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
