/**
 * The belt's structure — which is the thing it is for.
 *
 * These elements are osculating and propagated as two-body motion, so any
 * individual rock's *phase* drifts away from the 2026 epoch. That is stated
 * plainly in `fetch-asteroids.mjs` and it is not what these checks look at.
 * What they look at is structure, and structure is the one thing a frozen
 * ellipse gets right: the Kirkwood gaps, the families and the camps live in
 * `a`, `e` and `i`, which barely move in two centuries — that is precisely why
 * the gaps have survived for hundreds of millions of years.
 *
 * So every check here is a fact about the solar system that was known before
 * this app existed, and none of them can be satisfied by a plausible mistake:
 *
 *  - **The Kirkwood gaps** fall at the 3:1, 5:2, 7:3 and 2:1 resonances with
 *    Jupiter — 2.50, 2.82, 2.96 and 3.28 AU. Daniel Kirkwood noticed them in
 *    1866 with a hundred asteroids known. If the semi-major axes here were
 *    wrong, or scrambled, or quietly regenerated, the gaps would fill in.
 *  - **The Trojan camps** sit sixty degrees ahead of and behind Jupiter, and
 *    the leading camp is the larger — an asymmetry that is real, long argued
 *    over, and nothing this app does could produce by accident.
 *  - **And they stay there.** Checked at 1850 and 2050 as well as now, because
 *    the whole reason the resonant families carry Jupiter's mean motion rather
 *    than their own is that osculating axes would scatter them out of the camps
 *    within a lifetime. This is the check that would have caught that.
 *
 * Run the dev server first for the last section: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import {
  ASTEROIDS,
  ASTEROID_COUNT,
  ASTEROID_FAMILY,
  ASTEROID_NAMES,
  ASTEROID_STRIDE,
  asteroidElements,
} from '../src/data/asteroids.js'
import { ORBITAL_ELEMENTS } from '../src/data/orbitalElements.js'
import { elementsAt } from '../src/orbit/kepler.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const DEG = 180 / Math.PI
const semiMajor = (n) => ASTEROIDS[n * ASTEROID_STRIDE]

/** Centuries since J2000 for a few dates spanning the app's whole window. */
const EPOCHS = [
  ['1850', -1.5],
  ['now', 0.2644],
  ['2050', 0.5],
]

console.log('\nThe population\n')

check(
  'the table is the size it says it is',
  ASTEROIDS.length === ASTEROID_COUNT * ASTEROID_STRIDE &&
    ASTEROID_NAMES.length === ASTEROID_COUNT &&
    ASTEROID_FAMILY.length === ASTEROID_COUNT,
  `${ASTEROID_COUNT} bodies`,
)
check(
  'every orbit is a closed ellipse inside 6 AU',
  Array.from({ length: ASTEROID_COUNT }, (_, n) => n).every((n) => {
    const a = semiMajor(n)
    const e = ASTEROIDS[n * ASTEROID_STRIDE + 1]
    return a > 1 && a < 6 && e >= 0 && e < 1
  }),
)
check(
  'the famous Trojans are in it',
  ['624 Hektor', '588 Achilles', '911 Agamemnon'].every((name) => ASTEROID_NAMES.includes(name)),
)
/*
 * And the six drawn as worlds are *not*, which is the other half of the same
 * claim. Each of them has a fitted ephemeris in `asteroidBodyElements.js` that
 * disagrees with its osculating one by a few degrees; leaving it in both files
 * would draw the body twice, and the copy that was wrong would be the one
 * without a name on it.
 */
check(
  'and the six drawn as worlds are not',
  ['1 Ceres', '2 Pallas', '3 Juno', '4 Vesta', '10 Hygiea', '16 Psyche'].every(
    (name) => !ASTEROID_NAMES.includes(name),
  ),
)

console.log('\nThe Kirkwood gaps\n')

/*
 * A histogram of semi-major axis, and the gaps read straight off it. The bins
 * are narrow enough to resolve a gap — they are a few hundredths of an AU wide
 * — and the comparison is against the local background rather than an absolute
 * count, since the belt's density varies enormously across its width.
 */
const BIN = 0.01
const bins = new Map()
for (let n = 0; n < ASTEROID_COUNT; n++) {
  if (ASTEROID_FAMILY[n] !== 0) continue
  const key = Math.round(semiMajor(n) / BIN)
  bins.set(key, (bins.get(key) ?? 0) + 1)
}
const density = (au, halfWidth) => {
  let total = 0
  for (let k = Math.round((au - halfWidth) / BIN); k <= Math.round((au + halfWidth) / BIN); k++) {
    total += bins.get(k) ?? 0
  }
  return total / (2 * halfWidth)
}

/** Resonance, its semi-major axis in AU, and how wide the gap runs. */
const GAPS = [
  ['3:1', 2.5, 0.03],
  ['5:2', 2.825, 0.025],
  ['7:3', 2.957, 0.02],
  ['2:1', 3.27, 0.03],
]

for (const [name, au, halfWidth] of GAPS) {
  const inside = density(au, halfWidth)
  // The background either side, far enough out to be clear of the gap.
  const around = (density(au - 0.14, 0.05) + density(au + 0.14, 0.05)) / 2
  check(
    `the ${name} gap is empty at ${au} AU`,
    around > 0 && inside < around * 0.62,
    `${inside.toFixed(0)} per AU inside against ${around.toFixed(0)} either side`,
  )
}

/* And the belt is not empty in between, which is what makes a gap a gap. */
check(
  'while the belt between them is full',
  density(2.65, 0.05) > 400 && density(3.1, 0.05) > 200,
  `${density(2.65, 0.05).toFixed(0)} and ${density(3.1, 0.05).toFixed(0)} per AU`,
)

console.log('\nThe Trojan camps\n')

const el = {}
for (const [label, T] of EPOCHS) {
  const jupiter = elementsAt(ORBITAL_ELEMENTS.jupiter, T)
  let leading = 0
  let trailing = 0
  let stray = 0

  for (let n = 0; n < ASTEROID_COUNT; n++) {
    if (ASTEROID_FAMILY[n] !== 1) continue
    asteroidElements(n, el)
    const now = elementsAt(el, T)
    // `elementsAt` answers in radians — the one thing about it worth
    // remembering, and the reason the first draft of this file found every
    // Trojan one degree from Jupiter.
    let ahead = ((((now.L - jupiter.L) * DEG) % 360) + 360) % 360
    if (ahead > 180) ahead -= 360

    if (ahead > 25 && ahead < 95) leading++
    else if (ahead < -25 && ahead > -95) trailing++
    else stray++
  }

  check(
    `in ${label}, the Trojans are in two camps either side of Jupiter`,
    leading > 300 && trailing > 200 && stray < 30,
    `${leading} leading, ${trailing} trailing, ${stray} elsewhere`,
  )
  if (label === 'now') {
    /*
     * The leading camp is genuinely the larger — about 1.4 to 1, an asymmetry
     * that has been argued over since the 1990s and has no explanation
     * everybody accepts. Nothing in this app produces it; it is in the data.
     */
    check(
      'and the leading camp is the larger, as it really is',
      leading / trailing > 1.15 && leading / trailing < 1.7,
      `${(leading / trailing).toFixed(2)} to 1`,
    )
  }
}

console.log('\nThe Hildas\n')

/*
 * Locked 3:2 with Jupiter, so their period is two thirds of his and their
 * semi-major axis is 0.7631 of his. The three-cornered figure they trace is
 * not a snapshot — at any instant they are spread around — so what is checked
 * is the resonance itself, which is what makes the figure.
 */
const jupiterA = ORBITAL_ELEMENTS.jupiter.a
const hildas = []
for (let n = 0; n < ASTEROID_COUNT; n++) if (ASTEROID_FAMILY[n] === 2) hildas.push(semiMajor(n))
const meanHilda = hildas.reduce((a, b) => a + b, 0) / hildas.length
check(
  'the Hildas sit at the 3:2 resonance',
  hildas.length > 60 && Math.abs(meanHilda - jupiterA * (2 / 3) ** (2 / 3)) < 0.05,
  `${hildas.length} of them, mean a ${meanHilda.toFixed(3)} AU against ${(jupiterA * (2 / 3) ** (2 / 3)).toFixed(3)}`,
)

/* Their periods must be Jupiter's two thirds, which is the thing that keeps
   the figure from unravelling across the timeline. */
const hildaRates = []
const trojanRates = []
for (let n = 0; n < ASTEROID_COUNT; n++) {
  const rate = ASTEROIDS[n * ASTEROID_STRIDE + 6]
  if (ASTEROID_FAMILY[n] === 2) hildaRates.push(rate)
  if (ASTEROID_FAMILY[n] === 1) trojanRates.push(rate)
}
const jupiterRate = ORBITAL_ELEMENTS.jupiter.LDot
check(
  'every Trojan carries Jupiter’s own mean motion',
  trojanRates.every((r) => Math.abs(r - jupiterRate) < 0.01),
  `${trojanRates[0]} against ${jupiterRate}`,
)
check(
  'and every Hilda one and a half times it',
  hildaRates.every((r) => Math.abs(r - jupiterRate * 1.5) < 0.01),
  `${hildaRates[0]} against ${(jupiterRate * 1.5).toFixed(4)}`,
)

console.log('\nOn screen\n')

const page = await openApp()

try {
  await page.frames(200)

  /*
   * The rocks have to be somewhere the belt is. Read their world positions off
   * the instanced mesh's own matrices — not recomputed here, which would only
   * check this file against itself.
   */
  await page.evaluate(`window.FAMILY = [${Array.from(ASTEROID_FAMILY).join(',')}]`)
  const drawn = await page.evaluate(`(() => {
    const THREE = window.__solar.three
    let mesh = null
    window.__solar.scene.traverse((o) => { if (o.isInstancedMesh && o.count > 2000) mesh = o })
    if (!mesh) return null
    const m = new THREE.Matrix4()
    const v = new THREE.Vector3()
    const belt = []
    const trojan = []
    let scale = 0
    for (let n = 0; n < mesh.count; n++) {
      mesh.getMatrixAt(n, m)
      v.setFromMatrixPosition(m)
      ;(window.FAMILY[n] === 1 ? trojan : belt).push(v.length())
      if (n === 0) scale = m.getMaxScaleOnAxis()
    }
    const median = (xs) => { xs.sort((a, b) => a - b); return xs[Math.floor(xs.length / 2)] }
    return { count: mesh.count, belt: median(belt), trojan: median(trojan), scale }
  })()`)

  check('the belt is drawn as one instanced mesh', drawn !== null && drawn.count > 3000, drawn ? `${drawn.count} rocks` : 'not found')

  /*
   * At diorama scale the belt's edges warp to 44.7 and 55.1 world units and
   * Jupiter's orbit to 68.4, so the two families must land in different places
   * - which is also the check that the rocks given Jupiter's mean motion really
   * did end up on Jupiter's orbit rather than on their own osculating one.
   *
   * Per family, and on medians rather than extremes. The first draft bounded
   * the furthest rock and failed on 944 Hidalgo, whose aphelion is 9.5 AU and
   * which is exactly where it should be - an outlier in the data, not in the
   * drawing.
   */
  check(
    'the main belt lands in the band',
    drawn.belt > 44 && drawn.belt < 58,
    `median ${drawn.belt.toFixed(1)} world units, band 44.7 to 55.1`,
  )
  check(
    'and the Trojans out on Jupiter’s orbit',
    Math.abs(drawn.trojan - 68.4) < 3,
    `median ${drawn.trojan.toFixed(1)} against Jupiter at 68.4`,
  )
  check(
    'no rock is drawn larger than a rock',
    drawn.scale > 0 && drawn.scale < 1,
    `${drawn.scale.toFixed(3)} world units across`,
  )

  const errors = page.errors.filter((e) => !e.startsWith('warning:'))
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await page.close()
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
