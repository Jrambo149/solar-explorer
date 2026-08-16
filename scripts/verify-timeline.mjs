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
import { MISSION_EVENTS } from '../src/data/missionEvents.js'
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
   * The *first row still ahead*, not the first row. The panel lists the whole
   * timeline — every event, not a window around the clock — so everything
   * before this index is the past, all the way back to 1800. `is-past` is how
   * the panel itself marks the division, so it is what to read.
   */
  const next = await page.evaluate(
    `[...document.querySelectorAll('.events__row')].findIndex((r) => !r.classList.contains('is-past'))`,
  )
  check(
    'Voyager 2 reaching Neptune is the next one ahead',
    /Voyager 2 passes Neptune/.test(listed[next]?.join(' ') ?? ''),
    `row ${next}: ${listed[next]?.join(' | ')}`,
  )
  /*
   * Every row above the line is genuinely earlier, and every row below it is
   * later. This replaced an assertion that exactly two past rows were kept,
   * which was a fact about the old fixed window rather than about the panel:
   * the list now runs from 1800 and there are twelve Voyager events before this
   * one. What has to hold is the ordering and the marking, not the count.
   */
  const dated = listed.map((r) => Date.parse(r[0].replace(/Sept/, 'Sep')))
  check(
    'and the rows above it are all in the past, in order',
    next > 0 &&
      dated.slice(0, next).every((t, i) => i === 0 || t >= dated[i - 1]) &&
      dated[next - 1] <= dated[next],
    `${next} past rows, ${listed.length - next} ahead`,
  )

  /*
   * And the list is not windowed any more.
   *
   * It used to show two behind the clock and twenty-four ahead, which reads as
   * a summary and is really a wall: scroll to the bottom and it stops, with
   * four thousand more events on the other side and nothing saying so. The
   * Missions filter admits every one of the 146 mission events, so that is the
   * number the panel has to be showing.
   */
  check(
    'the panel lists every mission event, not a window',
    listed.length === MISSION_EVENTS.length,
    `${listed.length} rows against ${MISSION_EVENTS.length} events`,
  )

  /* ---- searching the list ---- */

  console.log('\nSearching the events\n')

  const typeSearch = (text) => `(() => {
    const el = document.querySelector('.events__search-input')
    if (!el) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(text)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`

  const ROW_TEXT = `[...document.querySelectorAll('.events__row')].map((r) => r.innerText.replace(/\\n/g, ' '))`

  await page.evaluate(`window.__solar.state().setEventFilter('all')`)
  await page.frames(40)

  {
    const total = await page.evaluate(`document.querySelectorAll('.events__row').length`)
    check('with no filter the panel lists thousands', total > 4000, `${total} rows`)
  }

  /*
   * A name that appears in exactly one event, so the count is checkable rather
   * than merely plausible.
   */
  await page.evaluate(typeSearch('apophis'))
  await page.frames(40)
  {
    const rows = await page.evaluate(ROW_TEXT)
    check(
      'searching a name finds it',
      rows.length === 1 && /Apophis/.test(rows[0]),
      rows.length === 1 ? rows[0].slice(0, 60) : `${rows.length} rows`,
    )
  }

  /*
   * A word no row spells out. "Eclipse" is in the *kind* of every solar and
   * lunar eclipse, and the rows say "Partial lunar eclipse" and so on — this is
   * the check that the search reads what the row shows rather than some second
   * description that could disagree with it.
   */
  await page.evaluate(typeSearch('eclipse'))
  await page.frames(40)
  {
    const rows = await page.evaluate(ROW_TEXT)
    const all = rows.every((r) => /eclipse|shadow/i.test(r))
    check(
      'searching a kind finds all of them and nothing else',
      rows.length > 1000 && all,
      `${rows.length} rows, all eclipses: ${all}`,
    )
  }

  /*
   * The name the row is *not* showing.
   *
   * The app calls the same rover Mars 2020 before February 2021 and
   * Perseverance after, so its own rows say "Mars 2020 sets out". Searching the
   * other name found nothing until the alias was indexed, which is the same
   * trap the body search had.
   */
  await page.evaluate(typeSearch('perseverance'))
  await page.frames(40)
  {
    const rows = await page.evaluate(ROW_TEXT)
    check(
      'and finds a craft by the name the row is not using',
      rows.length > 0,
      rows.length ? rows[0].slice(0, 60) : 'nothing — the alias is not indexed',
    )
  }

  /* A search with no answer says so rather than showing an empty box. */
  await page.evaluate(typeSearch('qwertyuiop'))
  await page.frames(40)
  {
    const state = await page.evaluate(`({
      rows: document.querySelectorAll('.events__row').length,
      empty: document.querySelector('.events__empty')?.innerText ?? '',
    })`)
    check(
      'a search with no matches says so',
      state.rows === 0 && state.empty.includes('qwertyuiop'),
      state.empty || `${state.rows} rows and no message`,
    )
  }

  await page.evaluate(typeSearch(''))
  await page.frames(40)
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.setEventFilter('missions')
    window.__solar.setSimulationDate(2447760)
  })()`)
  await page.frames(60)

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
