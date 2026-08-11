/**
 * Numerical proof that the planets are where they really are.
 *
 * `src/orbit/kepler.js` is deliberately free of React and three.js so it can be
 * driven straight from Node, which is what this does: it computes a position
 * for every planet at six dates spanning the element table's validity window
 * and compares each one against a vector from JPL Horizons.
 *
 * This matters more than it might look. A sign error in the node rotation, a
 * transposed element, or a degrees/radians slip all produce orbits that are
 * perfectly plausible on screen — right distance, right speed, smooth motion —
 * and simply put the planet in the wrong place. Nothing in the visual output
 * would give it away. So the check is arithmetic, not visual.
 *
 * Run with: npm run verify:orbits
 */

import { HORIZONS_REFERENCE } from './fixtures/horizons-reference.js'
import { ORBITAL_ELEMENTS } from '../src/data/orbitalElements.js'
import {
  J2000,
  centuriesSinceJ2000,
  julianDate,
  periodDays,
  positionAt,
  solveKepler,
} from '../src/orbit/kepler.js'

const ARCSEC = Math.PI / (180 * 3600)
const ARCMIN = 60 * ARCSEC

/**
 * Per-planet angular budget, in arcseconds.
 *
 * JPL publishes the maximum heliocentric error of this table over 1800–2050,
 * and it is not uniform: the inner planets are held to tens of arcseconds while
 * the outer ones, whose elements precess fastest relative to their slow motion,
 * drift into the arcminutes. Using one flat threshold would either fail Saturn
 * for behaving exactly as documented, or pass Mercury while hiding a real bug.
 */
const BUDGET_ARCSEC = {
  mercury: 30,
  venus: 60,
  earth: 40,
  mars: 120,
  jupiter: 600,
  saturn: 1200,
  uranus: 2400,
  neptune: 1000,
}

let failures = 0
const rows = []

for (const ref of HORIZONS_REFERENCE) {
  const el = ORBITAL_ELEMENTS[ref.body]
  // Use the JD Horizons reported rather than re-deriving it from the date
  // string. Horizons works in TDB and julianDate() takes UTC; the ~70 s between
  // them is worth about 11 arcsec of Mercury's motion, which is real but is a
  // property of the time argument, not of the orbit code under test.
  const T = centuriesSinceJ2000(ref.jd)
  const got = positionAt(el, T)

  const dx = got.x - ref.x
  const dy = got.y - ref.y
  const dz = got.z - ref.z
  const distErr = Math.hypot(dx, dy, dz)
  const r = Math.hypot(ref.x, ref.y, ref.z)

  // Angular separation as seen from the Sun — the meaningful measure. A raw AU
  // error would flatter Mercury and unfairly damn Neptune.
  const angErr = distErr / r
  const angArcsec = angErr / ARCSEC
  const budget = BUDGET_ARCSEC[ref.body]
  const ok = angArcsec <= budget

  if (!ok) failures++
  rows.push({
    body: ref.body,
    date: ref.date,
    r: r.toFixed(4),
    arcsec: angArcsec.toFixed(1),
    budget,
    ok,
  })
}

console.log('\n=== Kepler solver vs JPL Horizons ===\n')
console.log('body      date         r (AU)    error(")   budget(")  ')
console.log('-'.repeat(58))
for (const row of rows) {
  console.log(
    `${row.body.padEnd(9)} ${row.date}  ${row.r.padStart(8)}  ${row.arcsec.padStart(9)}  ${String(row.budget).padStart(8)}   ${row.ok ? 'ok' : 'FAIL'}`,
  )
}

const worst = rows.reduce((a, b) => (Number(a.arcsec) > Number(b.arcsec) ? a : b))
console.log(`\nworst: ${worst.body} ${worst.date} at ${worst.arcsec}" (budget ${worst.budget}")`)

/* ---- Independent sanity checks ----
 *
 * The comparison above shares its element table with the thing it is testing,
 * so it would not catch a mistyped row that Horizons happens to be consistent
 * with. These check the orbits against facts known from elsewhere. */

console.log('\n=== Independent checks ===\n')

function check(label, actual, expected, tolerance, unit = '') {
  const ok = Math.abs(actual - expected) <= tolerance
  if (!ok) failures++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(44)} ${actual.toFixed(4)}${unit} (expected ${expected}${unit} ±${tolerance})`,
  )
}

check('Mercury orbital period (days)', periodDays(ORBITAL_ELEMENTS.mercury), 87.969, 0.01)
check('Earth orbital period (days)', periodDays(ORBITAL_ELEMENTS.earth), 365.256, 0.01)
check('Neptune orbital period (years)', periodDays(ORBITAL_ELEMENTS.neptune) / 365.25, 164.79, 0.05)

// Earth's distance over a year: perihelion 0.9833 AU, aphelion 1.0167 AU, and
// perihelion falls in the first week of January.
{
  const start = julianDate(new Date(Date.UTC(2026, 0, 1)))
  let min = Infinity
  let max = -Infinity
  let minJD = 0
  for (let d = 0; d < 366; d++) {
    const p = positionAt(ORBITAL_ELEMENTS.earth, centuriesSinceJ2000(start + d))
    const r = Math.hypot(p.x, p.y, p.z)
    if (r < min) {
      min = r
      minJD = start + d
    }
    if (r > max) max = r
  }
  check('Earth perihelion distance (AU)', min, 0.9833, 0.0005)
  check('Earth aphelion distance (AU)', max, 1.0167, 0.0005)
  const perihelionDay = new Date((minJD - 2440587.5) * 86400000).getUTCDate()
  const inFirstWeek = perihelionDay <= 7
  if (!inFirstWeek) failures++
  console.log(
    `${inFirstWeek ? 'ok  ' : 'FAIL'} ${'Earth perihelion falls in early January'.padEnd(44)} Jan ${perihelionDay}`,
  )
}

// Kepler's equation, solved directly. The identity M = E - e·sin(E) must hold
// on the way back, including at an eccentricity no planet reaches — comets are
// the reason the solver iterates to convergence rather than a fixed count.
{
  let worstResidual = 0
  for (const e of [0, 0.0068, 0.2056, 0.2488, 0.7, 0.967]) {
    for (let k = 0; k < 64; k++) {
      const M = -Math.PI + (k / 63) * 2 * Math.PI
      const E = solveKepler(M, e)
      worstResidual = Math.max(worstResidual, Math.abs(E - e * Math.sin(E) - M))
    }
  }
  const ok = worstResidual < 1e-10
  if (!ok) failures++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${'Kepler residual, e up to 0.967'.padEnd(44)} ${worstResidual.toExponential(2)}`,
  )
}

// Planets orbit counterclockwise seen from the north ecliptic pole, so the
// ecliptic-plane cross product z-component must be positive. This is the check
// that catches a flipped frame — which otherwise looks completely normal.
{
  let allPrograde = true
  for (const [id, el] of Object.entries(ORBITAL_ELEMENTS)) {
    const p0 = positionAt(el, centuriesSinceJ2000(J2000))
    const p1 = positionAt(el, centuriesSinceJ2000(J2000 + 1))
    if (p0.x * p1.y - p0.y * p1.x <= 0) {
      allPrograde = false
      console.log(`     ${id} is retrograde in the ecliptic frame`)
    }
  }
  if (!allPrograde) failures++
  console.log(`${allPrograde ? 'ok  ' : 'FAIL'} ${'all orbits prograde (counterclockwise)'.padEnd(44)}`)
}

console.log(
  failures === 0
    ? `\nAll ${rows.length + 8} checks passed.\n`
    : `\n${failures} check(s) FAILED.\n`,
)
process.exit(failures === 0 ? 0 : 1)
