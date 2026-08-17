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
import { PLANET_IMAGES } from '../src/data/planetImages.js'
import {
  density,
  derivedFacts,
  escapeVelocity,
  lightDelaySeconds,
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
const wrongly = BODIES.filter((b) => b.kind !== 'planet' && derivedFacts(b) !== null)
check(
  'nothing but a planet gets a “By the numbers” table',
  wrongly.length === 0,
  wrongly.length ? wrongly.map((b) => b.name).join(', ') : `${BODIES.length} bodies checked`,
)

section('The photographs')
let shots = 0
for (const p of PLANETS) {
  const gallery = PLANET_IMAGES[p.id] ?? []
  shots += gallery.length
  const onDisk = gallery.every((s) => existsSync(join(ROOT, 'public', 'images', 'planets', s.file)))
  const credited = gallery.every((s) => s.credit && /NASA/i.test(s.credit) && s.title && s.why)
  check(`${p.name}: ${gallery.length} images, all present and credited`, gallery.length >= 3 && onDisk && credited)
}
check(`${shots} photographs in total`, shots === PLANETS.length * 3)

/*
 * Nothing in the shipped app may reach for them over the network.
 *
 * The whole reason these are baked. A stray absolute URL in the generated file
 * would work perfectly in development and leave the gallery blank for anyone
 * offline, which is exactly the failure this project's no-runtime-fetch rule
 * exists to prevent.
 */
const remote = Object.values(PLANET_IMAGES)
  .flat()
  .filter((s) => /^https?:/i.test(s.file))
check('no image is loaded from the network', remote.length === 0)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
