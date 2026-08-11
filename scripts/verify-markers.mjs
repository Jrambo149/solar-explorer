/**
 * Spacecraft markers: a hexagon at the craft, its name alongside.
 *
 * Checked in a real browser because every claim here is about laid-out geometry
 * — where a box ends up relative to another box — and that is decided by CSS the
 * moment the two exist together. Nothing in a pure module knows it, and a
 * screenshot cannot tell six pixels of clearance from four.
 *
 * The Moon is the vantage point: it is the one frame in the roster holding more
 * than one craft, so it is the only place the "other craft nearby" case this
 * exists for actually arises.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { SPACECRAFT } from '../src/data/bodies.js'
import { isFlying } from '../src/orbit/trajectory.js'
import { julianDate } from '../src/orbit/kepler.js'

/** The three craft the Moon holds, by the name their marker carries. */
const LUNAR_CRAFT = {
  sc_lunar_reconnaissance_orbiter: 'Lunar Reconnaissance Orbiter',
  sc_themis_b: 'ARTEMIS P1',
  sc_themis_c: 'ARTEMIS P2',
}

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/** Geometry of every marker on screen, measured in the page. */
const MEASURE = `(() => {
  const read = (el) => {
    const hex = el.querySelector('.marker__hex')
    const ring = el.querySelector('.marker__icon')
    const name = el.querySelector('.marker__name')
    const glyph = (hex ?? ring)?.getBoundingClientRect()
    const label = name?.getBoundingClientRect()
    // A crowded-out name is display:none, which measures as a zero box —
    // distinct from a name that is merely in the wrong place.
    const named = !!label && label.width > 0
    const box = el.getBoundingClientRect()
    return {
      id: el.getAttribute('aria-label').replace('Go to ', ''),
      craft: el.classList.contains('marker--craft'),
      shape: hex ? 'hexagon' : ring ? 'ring' : 'none',
      shown: getComputedStyle(el).visibility === 'visible',
      pinned: el.classList.contains('is-pinned'),
      flipped: el.classList.contains('is-flipped'),
      x: Math.round(box.left + box.width / 2),
      y: Math.round(box.top + box.height / 2),
      named,
      gap: named && glyph ? Math.round(label.x - (glyph.x + glyph.width)) : null,
      rise: named && glyph ? Math.round((glyph.y + glyph.height / 2) - (label.y + label.height / 2)) : null,
    }
  }
  return [...document.querySelectorAll('.marker')].map(read)
})()`

const page = await openApp()

try {
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.layers.spacecraft) s.toggleLayer('spacecraft')
  })()`)
  // Parked at the Moon, where the three lunar craft separate on screen.
  await page.evaluate(`window.__solar.state().selectPlanet('luna')`)
  await page.frames(300)

  const markers = await page.evaluate(MEASURE)
  const craft = markers.filter((m) => m.craft)
  const natural = markers.filter((m) => !m.craft)

  /*
   * Read from the app rather than written down here.
   *
   * This asserted a literal 3 — every drawn spacecraft at the time — and so it
   * failed the moment the roster grew, reporting "10 of 3" as though ten craft
   * were a defect. A test that has to be edited every time the data it describes
   * changes is a test that will eventually be edited without being read.
   */
  /*
   * `shown`, because this counts DOM nodes and a node exists per shown body.
   *
   * Briefly asserted against `flying` instead, which was wrong in an instructive
   * way: a mission that has ended still gets a marker *element* — it is a
   * spacecraft and the spacecraft layer is on — and that element is held at
   * `visibility: hidden` by the projector because the craft has no position.
   * Counting nodes and comparing against craft-with-positions mixed the two.
   * What each one is worth asserting is below.
   */
  const drawn = await page.evaluate(
    `window.__solar.fleet().shown`,
  )
  check('every craft in the layer has a marker', craft.length === drawn, `${craft.length} of ${drawn}`)

  /*
   * And a mission that has ended shows nothing at today's date.
   *
   * The complement of the check above, and the one that actually matters now
   * that the roster holds craft whose missions are over: Eyes ends a craft at a
   * `parents` entry whose frame is the empty string — Cassini's is 2017-09-15,
   * the day it was flown into Saturn — so past that instant it is not drawn
   * rather than parked at its last position. The marker element still exists;
   * the projector holds it hidden because there is no position to place it at.
   *
   * Worth asserting because the failure mode is a marker frozen in space naming
   * something that is not there — exactly what the filter comment in
   * `LabelLayer` warns about for hidden layers, in the one case that comment
   * does not cover.
   */
  const historic = SPACECRAFT.filter((b) => !isFlying(b, julianDate(new Date())))
  const lingering = historic.filter((b) => markers.find((m) => m.id === b.name)?.shown)
  check(
    `no ended mission is drawn today (${historic.length} on the roster)`,
    lingering.length === 0,
    lingering.map((b) => b.name).join(', '),
  )

  /* ---- and the same going backwards ---- */

  /*
   * Scrub to 1995 and only the craft flying in 1995 may be labelled.
   *
   * The mirror of the check above, and the one that caught a real bug. The
   * projector's missing-position branch was a bare `continue`, which skipped the
   * visibility write at the bottom of its loop and left each node holding its
   * last visibility *and* its last transform. Harmless while the only bodies
   * without a position had never had one — a fresh node starts hidden — and not
   * harmless at all once the clock could move somewhere they had all vanished.
   *
   * Measured here rather than reasoned about: with the branch reverted, 24
   * markers stay lit in 1995, including Mars Express, Lucy, Parker and JUICE,
   * none of which had launched. Frozen mid-air, names overprinting each other
   * because the crowding pass had stopped running for them too.
   */
  const EPOCH = 2449950.5 // 1995-09-20, during the Galileo Probe's cruise
  // Back out to the solar system first. The checks above leave the camera parked
  // at the Moon, where none of the 1995 fleet is on screen at all — and a run
  // with nothing lit passes this trivially, which is the one result that would
  // mean nothing. The count assertion below is what makes that explicit.
  await page.evaluate(`window.__solar.state().clearSelection()`)
  await page.frames(90)
  await page.evaluate(`window.__solar.setSimulationDate(${EPOCH})`)
  await page.frames(150)

  const back = await page.evaluate(MEASURE)
  const shouldFly = new Set(
    SPACECRAFT.filter((b) => isFlying(b, EPOCH)).map((b) => b.name),
  )
  const litThen = back.filter((m) => m.craft && m.shown).map((m) => m.id)
  const ghosts = litThen.filter((name) => !shouldFly.has(name))
  // Non-vacuous first: with the projector's hidden-branch reverted this reads
  // 24, and with it in place it must still be more than none, or the assertion
  // underneath is about an empty set.
  check(
    'some craft are labelled in 1995 at all',
    litThen.length > 0,
    `${litThen.length} lit of ${shouldFly.size} flying then`,
  )
  check(
    `nothing unlaunched is labelled in 1995 (${shouldFly.size} craft flying then)`,
    ghosts.length === 0,
    `${litThen.length} lit, ghosts: ${ghosts.join(', ')}`,
  )

  await page.evaluate(`window.__solar.setSimulationDate(${julianDate(new Date())})`)
  await page.frames(60)
  check(
    'every craft draws a hexagon',
    craft.every((m) => m.shape === 'hexagon'),
    craft.map((m) => m.shape).join(', '),
  )
  check(
    'no natural body draws one',
    natural.every((m) => m.shape !== 'hexagon'),
    `${natural.length} checked`,
  )

  const named = craft.filter((m) => m.shown && m.named)
  check('at least two craft names have room', named.length >= 2, `${named.length} shown`)

  for (const m of named) {
    // Beside the hexagon, clear of it, and on the same line — the three things
    // that make the pair read as one object rather than two marks.
    check(`${m.id}: name clears the hexagon`, m.gap > 2 && m.gap < 14, `${m.gap}px`)
    check(`${m.id}: name is on the glyph's line`, Math.abs(m.rise) <= 1, `${m.rise}px off centre`)
  }

  // The natural bodies must be untouched: their names still ride above the disc.
  const naturalNamed = natural.filter((m) => m.shown && m.named)
  check(
    'natural names still sit above their body',
    naturalNamed.length > 0 && naturalNamed.every((m) => m.rise > 4),
    `${naturalNamed.length} checked`,
  )

  /* ---- pinned to the rim ---- */

  check(
    'nothing is pinned from the Moon',
    craft.every((m) => !m.pinned),
    'the rim is for spacecraft focus only',
  )

  /*
   * Each craft in turn, and the repetition is the point.
   *
   * Which neighbours fall inside the shot is decided by the bearing the camera
   * happens to arrive on — measured from LRO, the two ARTEMIS craft sat 27.6°
   * and 42.1° off the view axis against a frustum of 27.5° by 39.8°, so one was
   * a tenth of a degree outside. Testing a single craft would pass or fail by
   * luck; testing all three is what makes it a check.
   */
  const viewport = await page.evaluate('[innerWidth, innerHeight]')

  for (const [id, name] of Object.entries(LUNAR_CRAFT)) {
    await page.evaluate(`window.__solar.state().selectPlanet(${JSON.stringify(id)})`)
    await page.frames(240)
    const seen = await page.evaluate(MEASURE)

    for (const other of Object.values(LUNAR_CRAFT)) {
      if (other === name) continue
      const m = seen.find((s) => s.id === other)

      check(`${other} is findable while ${name} is focused`, !!m && m.shown && m.shape === 'hexagon')
      if (!m?.shown) continue

      // Pinned or not, it has to be somewhere you can actually look at.
      const inside = m.x >= 0 && m.x <= viewport[0] && m.y >= 0 && m.y <= viewport[1]
      check(`${other} is drawn inside the viewport`, inside, `${m.x},${m.y}`)

      // On the right-hand rim the name is what would run off the edge, so it
      // swaps to the hexagon's other side. Everywhere else it stays put.
      check(
        `${other}'s name is on the readable side`,
        m.flipped === (m.pinned && m.x > viewport[0] / 2),
        `pinned=${m.pinned} x=${m.x} flipped=${m.flipped}`,
      )
    }
  }

  // Backing out clears the rim, or the markers would outlive the case they are
  // for and ring the overview.
  await page.evaluate('window.__solar.state().clearSelection()')
  await page.frames(120)
  const released = await page.evaluate(MEASURE)
  check(
    'the rim clears on deselect',
    released.every((m) => !m.pinned),
    released.filter((m) => m.pinned).map((m) => m.id).join(', '),
  )

  const errors = page.errors.filter((e) => !e.startsWith('warning:'))
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await page.close()
}

console.log(failures === 0 ? '\nall marker checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
