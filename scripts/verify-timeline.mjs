/**
 * The mission history, where you can see it.
 *
 * `verify-mission-events` checks that the dates are right. This checks that
 * they reach the screen and that clicking one takes you there — the two halves
 * fail independently, and the second fails silently: a row that sets the clock
 * but not the selection, or a selection whose layer is switched off, looks
 * exactly like a row that worked.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { MISSION_EVENTS_BY_CRAFT } from '../src/data/missionEvents.js'
import { dateFromJulian } from '../src/orbit/kepler.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const TRACK = `(() => ({
  marks: document.querySelectorAll('.timeline__mark').length,
  span: document.querySelector('.timeline__span')?.style.width ?? null,
}))()`

const page = await openApp()

try {
  console.log('\nThe track carries the selected mission\n')

  await page.evaluate(`window.__solar.state().revealAndSelect('sc_cassini')`)
  await page.frames(60)
  const cassini = await page.evaluate(TRACK)
  check(
    'Cassini puts every one of its events on the track',
    cassini.marks === MISSION_EVENTS_BY_CRAFT.sc_cassini.length,
    `${cassini.marks} marks against ${MISSION_EVENTS_BY_CRAFT.sc_cassini.length} events`,
  )

  /*
   * The span is the point of the whole row: a craft exists for a few years out
   * of the 250 the timeline covers, and without it nothing on screen says when.
   * Cassini's twenty years is eight percent of the track.
   */
  const span = parseFloat(cassini.span)
  check(
    'and marks the years it existed',
    span > 6 && span < 10,
    `${cassini.span} of the track`,
  )

  await page.evaluate(`window.__solar.state().revealAndSelect('mars')`)
  await page.frames(60)
  const mars = await page.evaluate(TRACK)
  check('a planet has no mission to draw', mars.marks === 0 && mars.span === null)

  console.log('\nThe panel lists them, and going there works\n')

  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.clearSelection()
    // Somewhere with a spacecraft event just ahead: Voyager 2 at Neptune.
    window.__solar.setSimulationDate(2447760)
    s.setEventFilter('missions')
    if (!s.eventsOpen) s.toggleEvents()
  })()`)
  await page.frames(60)

  const listed = await page.evaluate(
    `[...document.querySelectorAll('.events__row')].map((r) => r.innerText.split('\\n'))`,
  )
  check('the Missions filter lists something', listed.length > 0, `${listed.length} rows`)

  /*
   * Only mission events. The filter shares a pool with four thousand eclipses
   * and oppositions, and a filter that leaked would be invisible here — every
   * row is a real event on a real date either way.
   */
  const SKY = ['eclipse', 'opposition', 'elongation', 'conjunction', 'edge-on']
  const leaked = listed.filter((r) => SKY.some((w) => r.join(' ').toLowerCase().includes(w)))
  check('and only mission events', leaked.length === 0, leaked.map((r) => r[1]).join('; '))

  /*
   * The *first row still ahead*, not the first row. The panel deliberately
   * keeps a couple of past events above the line — "did I just miss it" is a
   * real question — so row zero here is Voyager 2 at Saturn in 1981, eight
   * years before the date on the clock. `is-past` is how the panel itself
   * marks that, so it is what to read.
   */
  const next = await page.evaluate(
    `[...document.querySelectorAll('.events__row')].findIndex((r) => !r.classList.contains('is-past'))`,
  )
  check(
    'Voyager 2 reaching Neptune is the next one ahead',
    /Voyager 2 passes Neptune/.test(listed[next]?.join(' ') ?? ''),
    `row ${next}: ${listed[next]?.join(' | ')}`,
  )
  check(
    'and the rows above it are the recent past',
    next === 2 && listed.slice(0, next).every((r) => /19[0-9]{2}/.test(r.join(' '))),
    listed.slice(0, next).map((r) => r[0]).join('; '),
  )

  const before = await page.evaluate(`window.__solar.state().selectedId`)
  await page.evaluate(`document.querySelectorAll('.events__row')[${next}].click()`)
  await page.frames(90)

  const after = await page.evaluate(`(() => {
    const s = window.__solar.state()
    return { id: s.selectedId, jd: s.displayJD, spacecraft: s.layers.spacecraft }
  })()`)

  check('clicking it selects the craft', after.id === 'sc_voyager_2', `was ${before}, now ${after.id}`)
  /*
   * And switches the layer on. Spacecraft are off by default, and a selection
   * whose class is hidden never mounts, never writes a position and is never
   * flown to — the title changes and the camera does not move.
   */
  check('and switches the spacecraft layer on', after.spacecraft === true)
  check(
    'and sets the clock to the encounter',
    dateFromJulian(after.jd).toISOString().slice(0, 10) === '1989-08-25',
    dateFromJulian(after.jd).toISOString().slice(0, 16),
  )

  const arrived = await page.evaluate(TRACK)
  check(
    'and the track now carries Voyager 2',
    arrived.marks === MISSION_EVENTS_BY_CRAFT.sc_voyager_2.length,
    `${arrived.marks} marks`,
  )
} finally {
  await page.close()
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
