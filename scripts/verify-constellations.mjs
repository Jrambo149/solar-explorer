/**
 * The 88 regions are the real ones, and clicking the sky finds them.
 *
 * The constellations are a good place to be quietly wrong. They are large, so
 * almost any click lands well inside one and looks right; the boundaries are in
 * an equinox nobody uses any more, so an app that ignored precession would give
 * a correct answer nine times in ten; and the figures are hand-drawn lines that
 * cross their own borders, so "the stars of Orion are in Orion" is not even
 * quite true.
 *
 * Every check here is therefore against something older than this app: the
 * published areas, the stars everybody knows the constellation of, the thirteen
 * regions the ecliptic actually crosses, and the handful of famous stars that
 * two constellations both claim.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { CONSTELLATIONS, STARS, STAR_NAMES } from '../src/data/stars.js'
import {
  BOUNDARY_TABLE,
  CONSTELLATION_REGIONS,
  STAR_CONSTELLATION,
} from '../src/data/constellations.js'
import {
  CONSTELLATION_DOSSIERS,
  CONSTELLATION_ORIGINS,
  ZODIAC,
} from '../src/data/constellationData.js'
import { constellationAt } from '../src/scene/constellationLookup.js'
import { directionToRaDec } from '../src/scene/sky.js'
import { centuriesSinceJ2000, julianDate, positionAt } from '../src/orbit/kepler.js'
import { ORBITAL_ELEMENTS } from '../src/data/orbitalElements.js'
import { bestSeen, latitudeBand, oppositionMonth } from '../src/ui/constellationFacts.js'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const DEGREES = Math.PI / 180
const byAbbr = Object.fromEntries(CONSTELLATION_REGIONS.map((c, i) => [c.abbr, i]))
const abbrAt = (ra, dec) => CONSTELLATION_REGIONS[constellationAt(ra, dec)].abbr

console.log('\nThe regions, against published values')

/*
 * Areas, against the IAU's own figures.
 *
 * These are not a sample: they are every constellation whose area is commonly
 * published to three decimals, which is enough of the list to catch a
 * systematic error and all of the extremes.
 *
 * The tolerance is 0.02 square degrees, and it is worth saying which side of
 * the comparison it is for. The values computed here are exact by construction:
 * the cells tile the sphere with no gaps, each one's area is an integral with a
 * closed form, and the 88 of them sum to 41252.9612 — the area of a sphere in
 * square degrees — to twelve significant figures.
 *
 * The published table does not. Its residuals against this one scatter in sign
 * and run to about one part in seventy thousand, which is the signature of a
 * numerical integration quoted to more decimals than it earned. So the check is
 * "these agree with the accepted figures", not "these reproduce them" — and if
 * it ever failed by more than a hundredth of a square degree, it would be this
 * app that had moved a boundary.
 */
const PUBLISHED_AREAS = {
  Hya: 1302.844, Vir: 1294.428, UMa: 1279.66, Cet: 1231.411, Her: 1225.148,
  Eri: 1137.919, Peg: 1120.794, Dra: 1082.952, Cen: 1060.422, Aqr: 979.854,
  Oph: 948.34, Leo: 946.964, Boo: 906.831, Psc: 889.417, Sgr: 867.432,
  Cyg: 803.983, Tau: 797.249, Cam: 756.828, And: 722.278, Pup: 673.434,
  Aur: 657.438, Aql: 652.473, Ser: 636.928, Per: 614.997, Cas: 598.407,
  Ori: 594.12, Cep: 587.787, Lyn: 545.386, Lib: 538.052, Gem: 513.761,
  Cnc: 505.872, Vel: 499.649, Sco: 496.783, Car: 494.184, Mon: 481.569,
  Scl: 474.764, Phe: 469.319, CMa: 380.118, UMi: 255.864, Lyr: 286.476,
  Cru: 68.447, Equ: 71.641, Sge: 79.932, Cir: 93.353, Sct: 109.114,
}

{
  let worst = 0
  let name = ''
  for (const [abbr, area] of Object.entries(PUBLISHED_AREAS)) {
    const difference = Math.abs(CONSTELLATION_REGIONS[byAbbr[abbr]].area - area)
    if (difference > worst) {
      worst = difference
      name = abbr
    }
  }
  check(
    `every published area matches, over ${Object.keys(PUBLISHED_AREAS).length} constellations`,
    worst <= 0.02,
    `worst ${name} by ${worst.toFixed(4)} sq°`,
  )
}

{
  /* Summed from the *stored* values, each rounded to three decimals, so the
     residual here is 88 roundings and nothing else. The bake asserts the
     unrounded sum to twelve figures. */
  const total = CONSTELLATION_REGIONS.reduce((sum, c) => sum + c.area, 0)
  check(
    'the 88 regions add up to the whole sky, with no gaps and no overlaps',
    Math.abs(total - 41252.9612) < 0.05,
    `${total.toFixed(3)} against 41252.961 sq°`,
  )

  const sorted = [...CONSTELLATION_REGIONS].sort((a, b) => b.area - a.area)
  check(
    'Hydra is the largest and Crux the smallest',
    sorted[0].abbr === 'Hya' && sorted[sorted.length - 1].abbr === 'Cru',
    `${sorted[0].name} ${sorted[0].area}, ${sorted[87].name} ${sorted[87].area}`,
  )
}

console.log('\nWhat is where')

/*
 * Stars whose constellation is common knowledge.
 *
 * The point of the list is not that these are hard — it is that every one of
 * them is a fact somebody could contradict from memory, which is the only kind
 * of check worth having for a lookup table. Sigma Octantis and the galactic
 * centre are here because they are the two extremes: a degree from the south
 * pole, and the one direction everybody can name without a star.
 */
const KNOWN = [
  ['Betelgeuse', 88.7929, 7.4071, 'Ori'],
  ['Rigel', 78.6345, -8.2016, 'Ori'],
  ['Sirius', 101.2872, -16.7161, 'CMa'],
  ['Canopus', 95.9879, -52.6957, 'Car'],
  ['Polaris', 37.9462, 89.2641, 'UMi'],
  ['Vega', 279.2346, 38.7837, 'Lyr'],
  ['Deneb', 310.358, 45.2803, 'Cyg'],
  ['Altair', 297.6958, 8.8683, 'Aql'],
  ['Antares', 247.3519, -26.432, 'Sco'],
  ['Aldebaran', 68.9802, 16.5093, 'Tau'],
  ['Spica', 201.2982, -11.1613, 'Vir'],
  ['Regulus', 152.093, 11.9672, 'Leo'],
  ['Capella', 79.1723, 45.998, 'Aur'],
  ['Castor', 113.6495, 31.8883, 'Gem'],
  ['Acrux', 186.6497, -63.0991, 'Cru'],
  ['Alpha Centauri', 219.9115, -60.834, 'Cen'],
  ['Achernar', 24.4283, -57.2368, 'Eri'],
  ['Fomalhaut', 344.4126, -29.6222, 'PsA'],
  ['Arcturus', 213.9154, 19.1824, 'Boo'],
  ['Sigma Octantis', 317.195, -88.9564, 'Oct'],
  ['the galactic centre', 266.405, -28.936, 'Sgr'],
  ['the north galactic pole', 192.85948, 27.12825, 'Com'],
]

{
  const wrong = KNOWN.filter(([, ra, dec, want]) => abbrAt(ra, dec) !== want)
  check(
    `all ${KNOWN.length} landmarks land in the constellation everybody knows`,
    wrong.length === 0,
    wrong.length
      ? wrong.map(([n, ra, dec, want]) => `${n} → ${abbrAt(ra, dec)}, not ${want}`).join('; ')
      : 'including the south pole and the galactic centre',
  )
}

/*
 * Precession is doing real work.
 *
 * The boundaries are B1875 and the app is J2000, and the temptation is to skip
 * the conversion: the two frames differ by 1.7°, the constellations are tens of
 * degrees across, and almost every star gets the same answer either way.
 *
 * "Almost every" is the number worth knowing, so this measures it. Skipping the
 * precession misfiles hundreds of stars, and they are all near boundaries —
 * which is to say, exactly the cases anyone would look up to check.
 */
{
  const raw = (ra, dec) => {
    const hours = ra / 15
    for (const row of BOUNDARY_TABLE) {
      if (dec < row[2]) continue
      if (hours < row[0] || hours >= row[1]) continue
      return row[3]
    }
    return null
  }
  let misfiled = 0
  for (let i = 0; i < STARS.length; i++) {
    if (raw(STARS[i][0], STARS[i][1]) !== STAR_CONSTELLATION[i]) misfiled++
  }
  check(
    'the B1875 precession changes real answers, so it cannot be skipped',
    misfiled > 100,
    `${misfiled} of ${STARS.length} stars would be filed in the wrong constellation without it`,
  )
}

/* The runtime lookup and the baked membership are the same function. */
{
  let disagree = 0
  for (let i = 0; i < STARS.length; i++) {
    if (constellationAt(STARS[i][0], STARS[i][1]) !== STAR_CONSTELLATION[i]) disagree++
  }
  check(
    'the browser’s lookup agrees with the baked membership for every star',
    disagree === 0,
    `${STARS.length} stars, no disagreement`,
  )
}

console.log('\nThe zodiac, counted rather than asserted')

/*
 * The ecliptic crosses thirteen constellations, not twelve.
 *
 * Walked rather than looked up: this steps the Sun's own path right round the
 * sky in fine increments and collects what it passes through. The answer is a
 * property of the 1930 boundaries and nothing else, so it is the one way to
 * check the zodiac list without simply restating it.
 */
{
  const obliquity = 23.4392911 * DEGREES
  const crossed = new Map()
  for (let l = 0; l < 360; l += 0.01) {
    const lambda = l * DEGREES
    const x = Math.cos(lambda)
    const y = Math.sin(lambda) * Math.cos(obliquity)
    const z = Math.sin(lambda) * Math.sin(obliquity)
    let ra = Math.atan2(y, x) / DEGREES
    if (ra < 0) ra += 360
    const abbr = abbrAt(ra, Math.asin(z) / DEGREES)
    crossed.set(abbr, (crossed.get(abbr) ?? 0) + 0.01)
  }

  const list = [...crossed.keys()].sort()
  const expected = [...ZODIAC, 'Oph'].sort()
  check(
    'the ecliptic crosses exactly the twelve of the zodiac and Ophiuchus',
    list.length === 13 && list.every((a, i) => a === expected[i]),
    `${list.length} regions: ${list.join(' ')}`,
  )

  /*
   * And the shares are the ones that make the zodiac a poor calendar. Virgo
   * gets the longest run and Scorpius the shortest — under seven days of the
   * year, less than Ophiuchus, which is not on the list at all.
   */
  const days = (abbr) => ((crossed.get(abbr) ?? 0) / 360) * 365.25
  check(
    'Virgo is the longest crossing and Scorpius shorter than Ophiuchus',
    [...crossed.entries()].sort((a, b) => b[1] - a[1])[0][0] === 'Vir' &&
      days('Sco') < days('Oph'),
    `Virgo ${days('Vir').toFixed(0)} days, Ophiuchus ${days('Oph').toFixed(0)}, Scorpius ${days('Sco').toFixed(0)}`,
  )
}

console.log('\nFigures against boundaries')

/*
 * The stick figures very nearly stay inside their own regions — and the places
 * they do not are the interesting part.
 *
 * These are two independent datasets: Stellarium's lines, drawn to look like
 * the figure, and Delporte's boxes, drawn in 1930 to divide the sky up. They
 * agree about 1,400 times and disagree seven, and every one of the seven is a
 * documented case of two constellations laying claim to the same star.
 *
 * Asserted by name rather than by count, because the names are the evidence
 * that the disagreements are real astronomy and not a bug. If a coordinate
 * conversion were wrong somewhere, the exceptions would be a long list of
 * anonymous faint stars instead of this.
 */
{
  const found = []
  CONSTELLATIONS.forEach((figure, index) => {
    for (const star of new Set(figure.segments)) {
      if (STAR_CONSTELLATION[star] !== index) {
        found.push(`${CONSTELLATION_REGIONS[index].abbr}→${CONSTELLATION_REGIONS[STAR_CONSTELLATION[star]].abbr}`)
      }
    }
  })
  const expected = ['Aur→Tau', 'Car→Pup', 'Car→Pup', 'Mon→Gem', 'Peg→And', 'Ser→Oph', 'Ser→Oph']
  check(
    'only seven figure stars fall outside their own region, and they are the famous ones',
    found.sort().join(' ') === expected.join(' '),
    'Elnath in Taurus, Alpheratz in Andromeda, Naos left over from Argo, the snake crossing Ophiuchus',
  )
}

console.log('\nThe drawn boundaries are the region’s own')

/*
 * The outline and the lookup cannot be allowed to disagree.
 *
 * They are derived from the same table, but by different code — one walks cells
 * and emits the edges between them, the other scans rows — so "derived from the
 * same source" is not the same as "in agreement". A boundary drawn around the
 * wrong region would look completely plausible: it would still be a
 * constellation-shaped outline on the sky, just not the one that was named.
 *
 * So every outline vertex is tested for being genuinely on its owner's edge:
 * within a fiftieth of a degree there must be a point that is inside the region
 * *and* a point that is not. A vertex belonging to some other region's boundary
 * would fail the first; a vertex adrift in the middle of the region would fail
 * the second.
 */
{
  const RING = 0.02
  let vertices = 0
  let wrong = 0
  let stranded = 0
  const offenders = new Set()

  for (let index = 0; index < CONSTELLATION_REGIONS.length; index++) {
    const region = CONSTELLATION_REGIONS[index]
    for (const line of region.outline) {
      for (let i = 0; i < line.length; i += 2) {
        vertices++
        const ra = line[i]
        const dec = line[i + 1]
        // Guard the cosine at the poles, where a step in right ascension is no
        // step at all.
        const spread = RING / Math.max(0.02, Math.cos(dec * DEGREES))
        let inside = false
        let outside = false
        for (let a = 0; a < 8; a++) {
          const angle = (a / 8) * 2 * Math.PI
          const sampleDec = Math.max(-89.999, Math.min(89.999, dec + RING * Math.sin(angle)))
          const sampleRa = (((ra + spread * Math.cos(angle)) % 360) + 360) % 360
          if (constellationAt(sampleRa, sampleDec) === index) inside = true
          else outside = true
        }
        if (!inside) {
          wrong++
          offenders.add(region.abbr)
        } else if (!outside) {
          stranded++
          offenders.add(region.abbr)
        }
      }
    }
  }

  check(
    `every one of the ${vertices} outline vertices sits on its own region’s edge`,
    wrong === 0 && stranded === 0,
    wrong || stranded
      ? `${wrong} outside their region, ${stranded} not on any edge (${[...offenders].join(' ')})`
      : 'inside on one side, outside on the other',
  )
}

console.log('\nThe dossiers')

{
  const missing = CONSTELLATION_REGIONS.filter((c) => !CONSTELLATION_DOSSIERS[c.abbr])
  check('all 88 have a dossier', missing.length === 0, missing.map((c) => c.abbr).join(' '))

  const extra = Object.keys(CONSTELLATION_DOSSIERS).filter((a) => byAbbr[a] === undefined)
  check('and nothing has a dossier that is not a constellation', extra.length === 0, extra.join(' '))

  const thin = Object.entries(CONSTELLATION_DOSSIERS).filter(
    ([, d]) => !d.meaning || !d.description || (d.facts?.length ?? 0) < 2,
  )
  check(
    'every dossier has a meaning, a description and at least two facts',
    thin.length === 0,
    thin.map(([a]) => a).join(' '),
  )

  const unlabelled = CONSTELLATION_REGIONS.filter((c) => !CONSTELLATION_ORIGINS[c.origin])
  check(
    'every attribution has a label to print',
    unlabelled.length === 0,
    unlabelled.map((c) => c.origin).join(' '),
  )
}

/*
 * The attributions, counted.
 *
 * The historical record, and the version this app states: Ptolemy's Almagest
 * lists 48 constellations, of which 47 survive intact — the forty-eighth, Argo
 * Navis, was cut into Carina, Puppis and Vela, which are credited to neither
 * man alone.
 */
{
  const tally = {}
  for (const c of CONSTELLATION_REGIONS) tally[c.origin] = (tally[c.origin] ?? 0) + 1
  const expected = { ptolemy: 47, lacaille: 14, argo: 3, keyser: 12, plancius: 4, hevelius: 7, vopel: 1 }
  const wrong = Object.entries(expected).filter(([o, n]) => tally[o] !== n)
  check(
    'the attributions are the historical ones',
    wrong.length === 0,
    wrong.length
      ? wrong.map(([o, n]) => `${o} ${tally[o] ?? 0}, expected ${n}`).join('; ')
      : 'Ptolemy 47, Argo’s 3, Lacaille 14, the Dutch 12, Hevelius 7, Plancius 4, Vopel 1',
  )
}

/*
 * The brightest star of each region is the one the region is known for.
 *
 * A sample, and every entry is a small trap. Ursa Major's brightest is Alioth,
 * not Dubhe, which carries the alpha. Orion's is Rigel, not Betelgeuse, which
 * is more famous and variable. Gemini's is Pollux, not Castor, which is the
 * alpha and the first-named twin. A membership bug would move one of these to a
 * neighbour and the result would still look entirely reasonable.
 */
{
  const BRIGHTEST = {
    Ori: 'Rigel', UMa: 'Alioth', Gem: 'Pollux', CMa: 'Sirius', Lyr: 'Vega',
    Cyg: 'Deneb', Tau: 'Aldebaran', Sco: 'Antares', Boo: 'Arcturus', Vir: 'Spica',
    Car: 'Canopus', Cru: 'Acrux', Leo: 'Regulus', UMi: 'Polaris', Aur: 'Capella',
    PsA: 'Fomalhaut', Eri: 'Achernar', Aql: 'Altair', CMi: 'Procyon',
  }
  const wrong = Object.entries(BRIGHTEST).filter(
    ([abbr, star]) => CONSTELLATION_REGIONS[byAbbr[abbr]].brightestName !== star,
  )
  check(
    `the brightest star of each of ${Object.keys(BRIGHTEST).length} constellations is the right one`,
    wrong.length === 0,
    wrong.length
      ? wrong.map(([a, s]) => `${a} says ${CONSTELLATION_REGIONS[byAbbr[a]].brightestName}, not ${s}`).join('; ')
      : 'Alioth over Dubhe, Rigel over Betelgeuse, Pollux over Castor',
  )
}

console.log('\nThe two derived lines')

/*
 * "Best seen" against the app's own Sun, for all 88.
 *
 * The panel's month comes from a rule of thumb — right ascension, halved, plus
 * the six months of opposition and the position of the March equinox in the
 * year. The check does not restate that rule. It searches the year for the date
 * the *Earth in this app* actually puts the Sun opposite each constellation,
 * using the same Kepler solve the scene draws with, and asks whether the rule
 * names the month that date falls in.
 *
 * Two claims, because they fail differently. The date is the real test of the
 * arithmetic and is asserted tightly. The month is what the user reads, and it
 * cannot be exactly right for everything: a constellation whose opposition
 * falls on the 31st is one day from the next month, and no rule of thumb
 * survives that. So the month is asserted for every constellation that is not
 * within a few days of a month's edge, and the edge cases are counted.
 *
 * The first version of this failed here, and deserved to: rounding rather than
 * flooring the position pushed everything past mid-month forward, which put
 * Auriga — highest at midnight on 19 December — into January.
 */
{
  const sunRightAscension = (jd) => {
    const earth = positionAt(ORBITAL_ELEMENTS.earth, centuriesSinceJ2000(jd), {})
    // The Sun seen from Earth is the reverse of Earth seen from the Sun, put
    // through the same ecliptic-to-world swap every body here uses.
    return directionToRaDec(-earth.x, -earth.z, earth.y).ra
  }
  const wrap = (d) => (((d % 360) + 540) % 360) - 180

  const start = julianDate(new Date(Date.UTC(2026, 0, 1)))
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  let worstDays = 0
  let worstName = ''
  let monthWrong = []
  let edgeCases = 0

  for (const region of CONSTELLATION_REGIONS) {
    const opposite = (region.centre[0] + 180) % 360
    let best = start
    let closest = 999
    for (let day = 0; day < 365; day++) {
      const offset = Math.abs(wrap(sunRightAscension(start + day) - opposite))
      if (offset < closest) {
        closest = offset
        best = start + day
      }
    }

    const date = new Date((best - 2440587.5) * 86400000)
    const month = date.getUTCMonth()
    const dayOfMonth = date.getUTCDate()

    // The rule's own answer, as a date in the year, against the real one.
    const position = oppositionMonth(region.centre[0])
    let sinceStart = 0
    for (let m = 0; m < Math.floor(position); m++) sinceStart += daysInMonth[m]
    sinceStart += (position % 1) * daysInMonth[Math.floor(position) % 12]
    const trueDay = daysInMonth.slice(0, month).reduce((a, b) => a + b, 0) + dayOfMonth
    const off = Math.abs(sinceStart - trueDay)
    if (off > worstDays) {
      worstDays = off
      worstName = region.abbr
    }

    const nearEdge = dayOfMonth <= 3 || dayOfMonth >= daysInMonth[month] - 2
    if (bestSeen(region.centre[0]) !== MONTHS[month]) {
      if (nearEdge) edgeCases++
      else monthWrong.push(`${region.abbr} says ${bestSeen(region.centre[0])}, opposite the Sun on ${date.toISOString().slice(0, 10)}`)
    }
  }

  check(
    'the “best seen” rule lands within a week of when the Sun is really opposite',
    worstDays < 7,
    `worst ${worstName}, out by ${worstDays.toFixed(1)} days over all 88`,
  )
  check(
    'and it names the right month for every constellation not on a month’s edge',
    monthWrong.length === 0,
    monthWrong.length ? monthWrong.slice(0, 3).join('; ') : `${88 - edgeCases} exact, ${edgeCases} within three days of a month boundary`,
  )
}

/*
 * And the latitude band, at the three cases that matter: one visible from
 * everywhere, one only from the north, one only from the deep south.
 */
{
  const BANDS = {
    Ori: '+90° to -90°', // straddles the equator, so everyone gets it
    Cru: '+35° to -90°', // the Southern Cross, lost from most of the north
    // Not "+90° to 0°": the constellation reaches down to declination +66, and
    // that end of it still rises for anyone north of latitude −24°. Polaris
    // itself is the part that gives out at the equator.
    UMi: '+90° to -24°',
  }
  const wrong = Object.entries(BANDS).filter(
    ([abbr, band]) => latitudeBand(CONSTELLATION_REGIONS[byAbbr[abbr]].decRange) !== band,
  )
  check(
    'the visible-from band is right at the equator and at both poles',
    wrong.length === 0,
    wrong.length
      ? wrong.map(([a, b]) => `${a} says ${latitudeBand(CONSTELLATION_REGIONS[byAbbr[a]].decRange)}, not ${b}`).join('; ')
      : 'Orion from everywhere, Crux only south of +35°',
  )
}

/* ------------------------------------------------------------------ *
 * In a browser: clicking the sky.
 * ------------------------------------------------------------------ */

console.log('\nClicking the sky')

const page = await openApp()

try {
  const centre = { x: 0, y: 0 }
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.layers.constellations) s.toggleLayer('constellations')
    s.clearConstellation()
  })()`)
  await page.frames(30)

  /*
   * A real click, at the middle of the window, and then the same direction
   * asked of the lookup directly.
   *
   * The click has to travel through the raycaster, the backdrop sphere and the
   * scene's handler; the direct call does not. Comparing the two is what
   * catches the failure this whole arrangement is exposed to — a hit test that
   * works off the *point* the ray struck rather than the direction it went,
   * which would give an answer that changes with the scale dial.
   */
  const size = await page.evaluate(`({ w: window.innerWidth, h: window.innerHeight })`)
  centre.x = Math.round(size.w / 2)
  centre.y = Math.round(size.h / 2)

  await page.evaluate(`(() => {
    const canvas = document.querySelector('canvas')
    const options = { bubbles: true, clientX: ${centre.x}, clientY: ${centre.y}, pointerId: 1, button: 0, isPrimary: true }
    canvas.dispatchEvent(new PointerEvent('pointerdown', options))
    canvas.dispatchEvent(new PointerEvent('pointerup', options))
    canvas.dispatchEvent(new MouseEvent('click', options))
  })()`)
  await page.frames(45)

  const picked = await page.evaluate(`window.__solar.state().constellation`)
  check('clicking the sky picks a constellation', picked !== null && picked !== undefined, `index ${picked}`)

  const expected = await page.evaluate(`(async () => {
    const { constellationAtDirection } = await import('/src/scene/constellationLookup.js')
    const camera = window.__solar.camera
    const THREE = window.__solar.three
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2(
      (${centre.x} / window.innerWidth) * 2 - 1,
      -(${centre.y} / window.innerHeight) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, camera)
    const d = raycaster.ray.direction
    return constellationAtDirection(d.x, d.y, d.z)
  })()`)
  check(
    'and it picks the one the camera is actually pointing at',
    picked === expected,
    `clicked ${picked}, ray says ${expected}`,
  )

  /* The panel says the same thing the store does. */
  const panel = await page.evaluate(`(() => {
    const el = document.querySelector('.constellation-panel')
    if (!el) return null
    const box = el.getBoundingClientRect()
    return {
      name: el.querySelector('.constellation-panel__name')?.textContent,
      facts: el.querySelectorAll('.constellation-panel__facts div').length,
      bullets: el.querySelectorAll('.constellation-panel__list li').length,
      right: Math.round(box.right),
      bottom: Math.round(box.bottom),
      fits: box.right <= window.innerWidth && box.bottom <= window.innerHeight && box.top >= 0,
    }
  })()`)
  check('the panel opens on it', panel !== null && panel.name === CONSTELLATION_REGIONS[picked].name,
    panel ? `${panel.name}, ${panel.facts} facts and ${panel.bullets} notes` : 'no panel')
  check('and it fits on screen', panel?.fits === true, `right ${panel?.right}, bottom ${panel?.bottom}`)

  /*
   * The highlight is drawn.
   *
   * Counted as line segments added to the scene rather than looked for by name:
   * the region draws its boundary and its figure as two more `LineSegments`, so
   * the count going up by two and back down again is the whole claim.
   */
  const countLines = `(() => {
    let n = 0
    window.__solar.scene.traverse((o) => { if (o.isLineSegments) n++ })
    return n
  })()`
  const withHighlight = await page.evaluate(countLines)
  await page.evaluate(`window.__solar.state().clearConstellation()`)
  await page.frames(30)
  const without = await page.evaluate(countLines)
  check(
    'the picked region is drawn on the sky, and put away again',
    withHighlight === without + 2,
    `${without} lines, ${withHighlight} while picked`,
  )

  /*
   * With the figures off, a sky click means what it always meant.
   *
   * This is the behaviour the feature had to take over, and taking it over
   * everywhere would have been a mistake: clicking empty space to back out to
   * the overview is how this app has always worked.
   */
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.selectPlanet('mars')
  })()`)
  await page.frames(30)
  await page.evaluate(`window.__solar.state().toggleLayer('constellations')`)
  await page.frames(20)
  await page.evaluate(`(() => {
    const canvas = document.querySelector('canvas')
    const options = { bubbles: true, clientX: 12, clientY: ${centre.y}, pointerId: 1, button: 0, isPrimary: true }
    canvas.dispatchEvent(new PointerEvent('pointerdown', options))
    canvas.dispatchEvent(new PointerEvent('pointerup', options))
    canvas.dispatchEvent(new MouseEvent('click', options))
  })()`)
  await page.frames(30)
  const after = await page.evaluate(`(() => {
    const s = window.__solar.state()
    return { selected: s.selectedId, constellation: s.constellation }
  })()`)
  check(
    'with the figures switched off, clicking empty space still backs out',
    after.selected === null && after.constellation === null,
    `selection ${after.selected}, constellation ${after.constellation}`,
  )

  /* And switching the layer off while one is picked puts the panel away. */
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.toggleLayer('constellations')
    s.selectConstellation(${byAbbr.Ori})
  })()`)
  await page.frames(20)
  const before = await page.evaluate(`document.querySelector('.constellation-panel') !== null`)
  await page.evaluate(`window.__solar.state().toggleLayer('constellations')`)
  await page.frames(40)
  const gone = await page.evaluate(
    `window.__solar.state().constellation === null && document.querySelector('.constellation-panel') === null`,
  )
  check(
    'switching the figures off closes the panel with them',
    before === true && gone === true,
    'nothing left naming a region with no region drawn',
  )

  /* ---- the names written across the sky ---- */

  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.layers.constellations) s.toggleLayer('constellations')
    s.clearConstellation()
  })()`)
  await page.frames(45)

  const labels = await page.evaluate(`[...document.querySelectorAll('.constellation-label')].map((el) => {
    const b = el.getBoundingClientRect()
    return { name: el.textContent, x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), picked: el.classList.contains('is-picked') }
  })`)

  const names = new Set(CONSTELLATION_REGIONS.map((c) => c.name))
  check(
    'the sky carries names, and every one of them is a constellation',
    labels.length > 0 && labels.every((l) => names.has(l.name)),
    `${labels.length} written: ${labels.map((l) => l.name).slice(0, 5).join(', ')}…`,
  )

  /*
   * And they do not sit on top of one another.
   *
   * The declutter is the only thing standing between this and a fog of
   * overlapping words: the app can show the entire celestial sphere at once, at
   * which point every one of the 88 centres is on screen. Measured against the
   * boxes the browser actually laid out rather than the projector's own
   * arithmetic, since it is the rendered text that overlaps.
   */
  {
    let worst = null
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const dx = Math.abs(labels[i].x - labels[j].x)
        const dy = Math.abs(labels[i].y - labels[j].y)
        if (dx < 104 && dy < 15) worst = `${labels[i].name} and ${labels[j].name}`
      }
    }
    check('no two names are written over each other', worst === null, worst ?? `${labels.length} names, all clear`)
  }

  /* Clicking a name does what clicking its patch of sky does. */
  {
    const target = labels[0]
    await page.evaluate(`[...document.querySelectorAll('.constellation-label')].find((el) => el.textContent === ${JSON.stringify(target.name)}).click()`)
    await page.frames(40)
    const state = await page.evaluate(`(() => {
      const i = window.__solar.state().constellation
      const el = document.querySelector('.constellation-label.is-picked')
      return { index: i, marked: el?.textContent ?? null }
    })()`)
    check(
      'clicking a name selects it, and the name marks itself',
      state.index !== null && CONSTELLATION_REGIONS[state.index].name === target.name && state.marked === target.name,
      `${target.name} → ${state.index === null ? 'nothing' : CONSTELLATION_REGIONS[state.index].name}`,
    )
  }

  /*
   * The labels must not eat the drag.
   *
   * This app has lost a drag to a full-screen overlay four times: `.ui-layer > *`
   * grants `pointer-events: auto` with a bare class, which ties any layer's own
   * rule on specificity and wins on source order. The names are a full-screen
   * layer over the sky, which is precisely where the user drags to look around,
   * so this is the one regression that would make the feature actively harmful.
   *
   * Two claims. The layer itself declares `pointer-events: none` — the direct
   * statement of the rule — and a real drag over it moves the camera.
   *
   * The drag point is *found* rather than chosen, and the first version of this
   * check is why: a hand-picked point in the middle of the window landed on a
   * planet marker, which swallows the drag by design, and the check failed
   * with the label layer entirely innocent. So it searches for somewhere the
   * topmost element is the canvas — genuinely empty sky, under the names —
   * and reports honestly if the window has nowhere like that.
   */
  {
    const pe = await page.evaluate(
      `getComputedStyle(document.querySelector('.constellation-labels')).pointerEvents`,
    )
    check('the names layer is transparent to the pointer', pe === 'none', `pointer-events: ${pe}`)

    const spot = await page.evaluate(`(() => {
      for (let y = 200; y < window.innerHeight - 260; y += 40) {
        for (let x = 380; x < window.innerWidth - 380; x += 40) {
          const top = document.elementsFromPoint(x, y)[0]
          if (top && top.tagName === 'CANVAS') return [x, y]
        }
      }
      return null
    })()`)

    if (!spot) {
      check('dragging across the names still orbits the camera', false, 'found no clear sky to drag from')
    } else {
      const before = await page.evaluate(`window.__solar.camera.position.toArray().join(',')`)
      await page.drag(spot[0], spot[1], spot[0] + 150, spot[1] + 70, 8)
      await page.frames(45)
      const after = await page.evaluate(`window.__solar.camera.position.toArray().join(',')`)
      check(
        'dragging across the names still orbits the camera',
        before !== after,
        before === after
          ? `the drag from ${spot.join(',')} was swallowed`
          : `orbited from ${spot.join(',')}, under the names`,
      )
    }
  }

  /* And the names go when the figures do. */
  await page.evaluate(`window.__solar.state().toggleLayer('constellations')`)
  await page.frames(45)
  check(
    'switching the figures off takes the names with them',
    (await page.evaluate(`document.querySelectorAll('.constellation-label').length`)) === 0,
    'the publisher retracts on unmount',
  )

  /* ---- turning to face one ---- */

  console.log('\nThe view swings round\n')

  /**
   * How far the camera is looking from the middle of a region, in degrees.
   *
   * The measurement that matters, and the only one that does: not where the
   * camera *is*, which is meaningless for a direction at infinity, but the
   * angle between where it points and where the constellation lies. Zero means
   * the region is dead centre.
   */
  const OFF_BY = (index) => `(async () => {
    const { CONSTELLATION_REGIONS } = await import('/src/data/constellations.js')
    const { starDirection } = await import('/src/scene/sky.js')
    const THREE = window.__solar.three
    const region = CONSTELLATION_REGIONS[${index}]
    const d = starDirection(region.centre[0], region.centre[1])
    const want = new THREE.Vector3(d.x, d.y, d.z)
    const look = new THREE.Vector3()
    window.__solar.camera.getWorldDirection(look)
    return THREE.MathUtils.radToDeg(look.angleTo(want))
  })()`

  const indexOf = (name) => CONSTELLATION_REGIONS.findIndex((c) => c.name === name)

  await page.evaluate(`window.__solar.state().clearSelection()`)
  // Well past the flight that backing out to the overview arms: a swing waits
  // for a flight rather than fighting it, so measuring too early measures the
  // wait rather than the turn.
  await page.frames(200)

  for (const name of ['Crux', 'Ursa Minor', 'Orion']) {
    const index = indexOf(name)
    const before = await page.evaluate(OFF_BY(index))
    await page.evaluate(`window.__solar.state().revealConstellation(${index})`)
    await page.frames(140)
    const after = await page.evaluate(OFF_BY(index))
    check(
      `searching for ${name} turns the view to face it`,
      before > 20 && after < 1,
      `${before.toFixed(1)}° off → ${after.toFixed(1)}° off`,
    )
  }

  /*
   * And a *click* on the sky does not turn anything.
   *
   * The distinction the whole mechanism rests on. A click already carries a
   * direction — you were pointing at it — so swinging the view in response
   * would drag the thing out from under the cursor. Only the search, which
   * carries no direction at all, may move the camera.
   */
  {
    const before = await page.evaluate(`window.__solar.camera.position.toArray().join(',')`)
    await page.evaluate(`window.__solar.state().selectConstellation(${indexOf('Lyra')})`)
    await page.frames(120)
    const after = await page.evaluate(`window.__solar.camera.position.toArray().join(',')`)
    check(
      'but clicking one leaves the camera exactly where it was',
      before === after,
      before === after ? 'no swing on a click' : 'the click moved the camera',
    )
  }

  /*
   * From the ground, which is a different manoeuvre entirely.
   *
   * Standing there is no pivot and no orbit — only a heading and an altitude —
   * so facing something means turning your head, and the angles have to come
   * from the local horizon frame at this instant of the body's rotation.
   * Checked from the Moon, which has no air to hide the sky in.
   */
  await page.evaluate(`window.__solar.state().standOn('luna', 0.67409, 23.47298, 'Tranquility Base')`)
  await page.frames(140)
  check(
    'standing on the Moon to look from',
    await page.evaluate(`!!window.__solar.state().surface`),
    'at Tranquility Base',
  )

  for (const name of ['Orion', 'Scorpius']) {
    const index = indexOf(name)
    const before = await page.evaluate(OFF_BY(index))
    await page.evaluate(`window.__solar.state().revealConstellation(${index})`)
    await page.frames(140)
    const after = await page.evaluate(OFF_BY(index))
    const facing = await page.evaluate(`(() => {
      const s = window.__solar.state()
      return { standing: !!s.surface, azimuth: s.surface?.azimuth ?? null, altitude: s.surface?.altitude ?? null }
    })()`)
    check(
      `from the ground, ${name} is found by turning the head`,
      before > 20 && after < 1 && facing.standing,
      `${before.toFixed(1)}° → ${after.toFixed(1)}°, facing ${(((facing.azimuth % 360) + 360) % 360).toFixed(0)}° at ${facing.altitude.toFixed(0)}° altitude`,
    )
  }

  /*
   * The heading is left unwrapped on purpose — a turn works in *change* from
   * where you were looking, which is what sends 350°→10° twenty degrees east
   * rather than three hundred and forty west. The bar has no such excuse, and
   * printed "−99°" until it wrapped the number for display.
   */
  {
    const shown = await page.evaluate(
      `document.querySelector('.surface-bar__heading em')?.textContent ?? ''`,
    )
    const degrees = Number(shown.replace('°', ''))
    check(
      'and the bar shows a bearing, not a signed angle',
      shown !== '' && degrees >= 0 && degrees < 360,
      `reads ${shown}`,
    )
  }

  await page.evaluate(`window.__solar.state().leaveSurface()`)
  await page.frames(30)

  const errors = page.errors.filter((e) => !e.startsWith('warning:'))
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await page.close()
}

console.log(
  failures === 0 ? '\nall constellation checks passed' : `\n${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
