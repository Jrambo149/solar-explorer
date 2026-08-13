/**
 * Landing sites, and whether they are in the right places.
 *
 * This table is the one thing in the app that cannot be derived. A planet's
 * position falls out of its elements and a crater's coordinates come from the
 * IAU register, but where Apollo 12 came down is a fact about one afternoon in
 * 1969, published once, and there is no formula that reproduces it. So the
 * question is not whether the arithmetic is right — there is no arithmetic —
 * but whether the transcription is.
 *
 * Four things can be checked without trusting the person who typed it:
 *
 *  1. **Twelve rows overlap sources the repository already holds.** Six lunar
 *     sites have IAU-adopted names and are baked from the gazetteer by
 *     `fetch-surface-features.mjs`; six Mars sites are in `landedCraft.js`,
 *     where they were checked when the rovers were placed. Both are compared
 *     here, to a hundredth of a degree.
 *  2. **Eleven more are described as being *inside* a named place**, and the
 *     gazetteer gives that place a centre and a diameter. Curiosity is in
 *     Gale; Chang'e 4 is in Von Kármán; Venera 9 is on Beta Regio. That does
 *     not test a coordinate's last decimal — it tests its hemisphere, which is
 *     the digit that goes wrong.
 *  3. **The geometry can be asked questions with known answers.** Chang'e 4
 *     landed on the far side, so it must face away from the Earth; Apollo 11
 *     landed on the near side, so it must not. Those are facts about the solar
 *     system.
 *  4. **The clock gates them.** Nothing from Earth had reached the Moon before
 *     Luna 2 hit it in September 1959.
 *
 * Seventeen of fifty-two missions against outside data is not proof of the
 * other thirty-five. It is proof that the *conventions* are right, which is the
 * part that would be wrong for all of them at once — and it now covers all five
 * bodies rather than two, which matters most for Venus, the one that turns
 * backwards.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { BODIES_BY_ID } from '../src/data/bodies.js'
import { EPOCH_RANGE } from '../src/data/orbitalElements.js'
import { LANDED_CRAFT } from '../src/data/landedCraft.js'
import { LANDING_SITES, SITES_BY_BODY } from '../src/data/landingSites.js'
import { GAZETTEER_STATIONES, SURFACE_FEATURES } from '../src/data/surfaceFeatures.js'
import { julianDate } from '../src/orbit/kepler.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const site = (name) => LANDING_SITES.find((s) => s.name === name)

/** Degrees between two coordinates, so a longitude near 0/360 does not lie. */
const apart = (a, b) => {
  const dLon = Math.abs(((a.lon - b.lon + 540) % 360) - 180)
  return Math.hypot(a.lat - b.lat, dLon * Math.cos((a.lat * Math.PI) / 180))
}

console.log('\nThe table\n')

check(
  'every body is one this app draws',
  LANDING_SITES.every((s) => BODIES_BY_ID[s.body]),
  [...new Set(LANDING_SITES.filter((s) => !BODIES_BY_ID[s.body]).map((s) => s.body))].join(', '),
)
check(
  'every longitude is east, 0 to 360',
  LANDING_SITES.every((s) => s.lon >= 0 && s.lon <= 360),
)
check(
  'every latitude is a latitude',
  LANDING_SITES.every((s) => s.lat >= -90 && s.lat <= 90),
)
/*
 * `landedCraft.js` had four of its five Julian dates wrong — one by eighteen
 * days — because they were converted by hand and nothing read the comment
 * beside them. These go through `julianDate` for that reason, and this is the
 * check that they went through it: a bad date here would land outside the
 * space age entirely.
 */
const dated = (s) =>
  Number.isFinite(s.jd) && s.jd >= 2436800 && s.jd <= EPOCH_RANGE.maxJD // 1959 onward.
check(
  'every date is a real one, inside the epoch the clock allows',
  LANDING_SITES.every(dated),
  LANDING_SITES.filter((s) => !dated(s))
    .map((s) => s.name)
    .join(', '),
)
const names = LANDING_SITES.map((s) => s.name)
check('no name appears twice', new Set(names).size === names.length)
check(
  'every craft named is one in the roster',
  LANDING_SITES.every((s) => !s.craft || s.craft.startsWith('sc_')),
)

console.log('\nAgainst the IAU gazetteer\n')

/*
 * The IAU's own name for the place, against this table's name for the mission
 * that made it. Six rows, and they are the only ones with a published
 * coordinate that did not come through me.
 */
const STATIONES = {
  'Statio Tranquillitatis': 'Apollo 11',
  'Guang Han Gong': 'Chang’e 3',
  'Statio Tianhe': 'Chang’e 4',
  'Statio Tianchuan': 'Chang’e 5',
  'Statio Tianjiang': 'Chang’e 6',
  'Statio Shiv Shakti': 'Chandrayaan-3',
}

check(
  'the gazetteer still carries all six stationes',
  GAZETTEER_STATIONES.length === Object.keys(STATIONES).length,
  `${GAZETTEER_STATIONES.length} of ${Object.keys(STATIONES).length}`,
)

for (const station of GAZETTEER_STATIONES) {
  const mission = STATIONES[station.name]
  const row = mission ? site(mission) : null
  const off = row ? apart(row, station) : Infinity
  check(
    `${station.name} agrees with ${mission ?? '(no mission named)'}`,
    row != null && off < 0.02,
    row ? `${off.toFixed(4)}° apart` : 'not in the table',
  )
}

console.log('\nAgainst the craft already standing there\n')

/*
 * The six Mars landers are drawn as models at these coordinates when the
 * spacecraft layer is on. A disagreement would put the mark beside the rover.
 */
for (const [id, craft] of Object.entries(LANDED_CRAFT)) {
  const row = LANDING_SITES.find((s) => s.craft === id)
  const off = row ? apart(row, craft) : Infinity
  check(
    `${craft.name} matches its entry in landedCraft.js`,
    row != null && off < 1e-6 && Math.abs(row.jd - craft.landed) < 1e-6,
    row ? `${off.toExponential(1)}°` : 'missing from the table',
  )
}

console.log('\nInside the places they are said to be in\n')

/*
 * The check that reaches the rows no source overlaps.
 *
 * Every one of these landings is described in its own mission report as being
 * *in* somewhere: Curiosity in Gale, Chang'e 4 in Von Kármán, Venera 9 on the
 * eastern flank of Beta Regio. Those places are in the gazetteer with a centre
 * and a diameter, so "is the coordinate inside the thing it is meant to be
 * inside" is a real question with a published answer — and it does not care
 * whether I typed the coordinate correctly to four decimals, only whether I
 * typed it in the right hemisphere.
 *
 * Venus earns its own row here. It turns backwards, so its longitude
 * convention is the one most likely to come out mirrored, and it has no other
 * check: no craft stands on it and the IAU has named no landing site there.
 * Venera 9 sits 9.5° from the centre of Beta Regio, and a swapped sense would
 * put it 140° away.
 *
 * Perseverance is deliberately absent: Jezero is on the *rim* of Isidis
 * Planitia and genuinely falls outside the plain, so the obvious pairing is
 * one this check would have to be loosened to accept.
 */
const CONTAINED = [
  ['Curiosity', 'Gale'],
  ['Mars Pathfinder', 'Ares Vallis'],
  ['Opportunity', 'Meridiani Planum'],
  ['Viking 1', 'Chryse Planitia'],
  ['Viking 2', 'Utopia Planitia'],
  ['Zhurong', 'Utopia Planitia'],
  ['InSight', 'Elysium Planitia'],
  ['Chang’e 3', 'Mare Imbrium'],
  ['Chang’e 4', 'Von Karman'],
  ['Chang’e 6', 'Apollo'],
  ['Venera 9', 'Beta Regio'],
]

for (const [mission, place] of CONTAINED) {
  const row = site(mission)
  const feature = SURFACE_FEATURES.find((f) => f.body === row?.body && f.name === place)
  const radiusDeg = feature
    ? (feature.km / 2) * (180 / (Math.PI * BODIES_BY_ID[row.body].radiusKm))
    : 0
  const off = feature ? apart(row, feature) : Infinity
  check(
    `${mission} is inside ${place}`,
    off <= radiusDeg,
    feature ? `${off.toFixed(1)}° from centre, radius ${radiusDeg.toFixed(1)}°` : 'no such feature',
  )
}

console.log('\nOn the globe\n')

const page = await openApp()

try {
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.revealAndSelect('luna')
    if (!s.layers.landingSites) s.toggleLayer('landingSites')
  })()`)
  await page.frames(320)

  /*
   * Stand where the Earth is, as `verify-features` does and for the same
   * reason: "the visible face" is only the near side from there.
   *
   * Called again after every change of date, which is not housekeeping. The
   * follow carries the camera with the Moon's *translation* and keeps its
   * offset fixed in inertial space, so scrubbing back fifty-six years leaves
   * the camera looking at whatever face happens to point that way now. The
   * near side has not moved; the viewer has. Without this the 1970 check found
   * eight sites and neither of the two it was asking about.
   */
  const standAtEarth = () =>
    page.evaluate(`(() => {
    const THREE = window.__solar.three
    const moon = window.__solar.positions.get('luna')
    const earth = window.__solar.positions.get('earth')
    const cam = window.__solar.camera
    const controls = window.__solar.controls
    const toEarth = new THREE.Vector3().subVectors(earth, moon).normalize()
    const range = cam.position.distanceTo(moon)
    cam.position.copy(moon).addScaledVector(toEarth, range)
    controls.target.copy(moon)
    controls.update()
  })()`)

  await standAtEarth()
  await page.frames(60)

  const shown = () =>
    page.evaluate(
      `[...document.querySelectorAll('.feature--site')].map((n) => n.querySelector('.feature__name').firstChild.textContent)`,
    )

  const marked = await shown()
  check('the Moon carries landing marks', marked.length > 4, `${marked.length}: ${marked.join(', ')}`)

  /*
   * The sharp one, and the same trick `verify-features` uses on the maria: the
   * Moon is tidally locked, so which sites can be seen from Earth is a fact
   * about history rather than about this app. Every Apollo landing was chosen
   * to be in radio view of Earth. Chang'e 4 was the first landing anywhere on
   * the far side, and it is famous precisely because it could not be.
   */
  const angles = await page.evaluate(`(() => {
    const THREE = window.__solar.three
    // Through the dev handle. A dynamic \`import()\` here gets a *second* module
    // instance under Vite, whose spin registry is empty — every angle then
    // comes out of a placement made at spin zero.
    const surface = window.__solar.surface
    const moon = window.__solar.positions.get('luna')
    const earth = window.__solar.positions.get('earth')
    const spin = surface.surfaceSpin('luna')
    const basis = surface.bodyBasis('luna')
    const toEarth = new THREE.Vector3().subVectors(earth, moon).normalize()
    const test = (lat, lon) => {
      const o = surface.surfaceOffset(lat, lon, basis, spin, 1, { x: 0, y: 0, z: 0 })
      const n = new THREE.Vector3(o.x, o.y, o.z).normalize()
      return THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, n.dot(toEarth)))))
    }
    const sites = ${JSON.stringify(SITES_BY_BODY.luna.map((s) => [s.name, s.lat, s.lon]))}
    return Object.fromEntries(sites.map(([name, lat, lon]) => [name, test(lat, lon)]))
  })()`)

  const near = [
    'Apollo 11',
    'Apollo 12',
    'Apollo 15',
    'Apollo 17',
    'Luna 9',
    'Surveyor 1',
    'Lunokhod 1',
    'Chang’e 3',
    'Chang’e 5',
    'Blue Ghost 1',
  ]
  for (const name of near) {
    check(`${name} is on the near side, as it had to be`, angles[name] < 80, `${angles[name]?.toFixed(0)}°`)
  }

  const far = ['Chang’e 4', 'Chang’e 6']
  for (const name of far) {
    check(`${name} is on the far side, which was the point`, angles[name] > 100, `${angles[name]?.toFixed(0)}°`)
  }

  /* And none of the far-side ones is labelled from here. */
  check(
    'no far-side landing is marked from the Earth',
    marked.filter((n) => far.includes(n)).length === 0,
    marked.join(', '),
  )

  /*
   * The clock. Nothing from Earth had reached the Moon before Luna 2 hit it in
   * September 1959, and a mark drawn before its landing is the app asserting
   * something false — the one class of error a static table cannot catch.
   *
   * 1958 rather than the more obvious 1968: by then Luna 2 and four Surveyors
   * were genuinely down, and the first draft of this check asserted an empty
   * Moon and was simply wrong about history.
   */
  const scrubTo = async (utc) => {
    await page.evaluate('window.__solar.setSimulationDate(' + julianDate(new Date(utc)) + ')')
    await page.frames(90)
    await standAtEarth()
    await page.frames(30)
    return shown()
  }

  const early = await scrubTo('1958-06-01T00:00:00Z')
  check('nothing is on the Moon before Luna 2', early.length === 0, early.join(', '))

  const seventy = await scrubTo('1970-01-01T00:00:00Z')
  check(
    'Apollo 11 is there in 1970 and Chang’e 3 is not',
    seventy.includes('Apollo 11') && !seventy.includes('Chang’e 3'),
    seventy.join(', '),
  )

  /* And the switch puts them away. */
  await page.evaluate(`window.__solar.state().toggleLayer('landingSites')`)
  await page.frames(60)
  check('the layer switch puts them away', (await shown()).length === 0)
} finally {
  await page.close()
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
