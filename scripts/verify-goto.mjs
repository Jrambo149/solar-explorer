/**
 * Typing a name actually takes you there.
 *
 * `verify-search` checks the ranking, which is a pure function and the half
 * that can be checked without a browser. This is the other half, and it exists
 * for one failure that the ranking cannot see: **four of the six classes are
 * switched off by default**, and a body whose class is off is never mounted,
 * never writes a position, and so is never flown to. `armFlight` returns false
 * every frame and gives up silently.
 *
 * What that looks like is the worst possible thing — the search finds the right
 * body, the title changes to its name, the dossier opens on it, and the camera
 * sits exactly where it was. Nothing throws, nothing is missing, and the app
 * says you are at Phoebe while showing you Jupiter.
 *
 * So every check here is "did the camera arrive", not "was the right thing
 * selected". The comet, the minor moon and the spacecraft are the three whose
 * layers are off; Ganymede is the control whose layer is on.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { BODIES_BY_ID, bodyRadius } from '../src/data/bodies.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * Type into the palette the way a person does.
 *
 * The native value setter rather than `el.value = …`: React installs its own
 * setter on the instance and reads the old value from it to decide whether
 * anything changed, so assigning directly updates the DOM and leaves React
 * believing the field is still empty. The input event then carries no change
 * and the results never appear.
 */
const type = (text) => `(() => {
  const el = document.querySelector('.search__input')
  if (!el) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(text)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

const press = (key) => `(() => {
  const el = document.querySelector('.search__input')
  el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))
  return true
})()`

const OPEN_WITH_SLASH = `(() => {
  document.activeElement?.blur()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
  return true
})()`

/** Where the camera is, and how far that is from the body it should be at. */
const DISTANCE = (id) => `(() => {
  const p = window.__solar.positions.get(${JSON.stringify(id)})
  if (!p) return null
  return window.__solar.camera.position.distanceTo(p)
})()`

const page = await openApp()

try {
  /* ---- the palette opens, and to a clean field ---- */

  await page.evaluate(OPEN_WITH_SLASH)
  await page.frames(20)
  check(
    'slash opens the palette',
    await page.evaluate(`!!document.querySelector('.search__card')`),
  )
  check(
    'and the field has the focus',
    await page.evaluate(`document.activeElement === document.querySelector('.search__input')`),
  )

  await page.evaluate(type('phoeb'))
  await page.frames(20)
  const rows = await page.evaluate(
    `[...document.querySelectorAll('.search__name')].map((n) => n.textContent)`,
  )
  check('typing five letters lists Phoebe first', rows[0] === 'Phoebe', rows.slice(0, 3).join(', '))
  check(
    'the first row is the one Enter would take',
    await page.evaluate(
      `document.querySelectorAll('.search__row')[0].classList.contains('is-active')`,
    ),
  )

  /*
   * Each case is a body, the layer that governs it, and whether that layer is
   * on when the app opens. The three `false`s are the whole reason this file
   * exists; Ganymede is here so that a failure of the harness itself — a click
   * that never landed, a camera that never flies — cannot be mistaken for the
   * layer bug.
   */
  const CASES = [
    ['ganymede', 'Ganymede', 'moons', true],
    ['phoebe', 'Phoebe', 'minorMoons', false],
    ['1p_halley', 'Halley', 'comets', false],
    ['sc_voyager_1', 'Voyager 1', 'spacecraft', false],
  ]

  for (const [id, name, layer, litToStart] of CASES) {
    console.log(`\n${name} — ${layer}${litToStart ? '' : ', off by default'}\n`)

    await page.evaluate(`(() => {
      const s = window.__solar.state()
      s.clearSelection()
      s.setSearchOpen(true)
    })()`)
    await page.frames(20)
    await page.evaluate(type(name))
    await page.frames(20)
    await page.evaluate(press('Enter'))
    await page.frames(10)

    const state = await page.evaluate(`(() => {
      const s = window.__solar.state()
      return { selectedId: s.selectedId, layers: s.layers, searchOpen: s.searchOpen }
    })()`)

    check(`${name} is selected`, state.selectedId === id, `selected ${state.selectedId}`)
    check('the palette closes behind it', state.searchOpen === false)
    const lit = layer === 'minorMoons' ? state.layers.minorMoons === 'saturn' : state.layers[layer]
    check(`${layer} is switched on`, !!lit, `value ${JSON.stringify(state.layers[layer])}`)

    // The flight takes a couple of seconds; 220 frames is well past it.
    await page.frames(220)
    const distance = await page.evaluate(DISTANCE(id))
    check(`${name} is drawn at all`, distance !== null)

    /*
     * Parked, not merely nearer. The camera stops at a small multiple of the
     * body's own radius — see `focusDistance` — so the test is the distance
     * against that radius rather than against where the camera started, which
     * would pass for a flight that stalled halfway.
     */
    const radius = bodyRadius(BODIES_BY_ID[id], await page.evaluate(`window.__solar.state().scaleMode`))
    check(
      `the camera arrived at ${name}`,
      distance !== null && distance < radius * 40,
      distance === null ? 'no position' : `${distance.toFixed(3)} vs radius ${radius.toFixed(3)}`,
    )
  }

  /* ---- a mission that is over takes the clock with it ---- */

  console.log('\nA mission outside its window\n')

  const before = await page.evaluate(`window.__solar.state().displayJD`)
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.clearSelection()
    s.setSearchOpen(true)
  })()`)
  await page.frames(20)
  await page.evaluate(type('Galileo Probe'))
  await page.frames(20)
  await page.evaluate(press('Enter'))
  await page.frames(60)

  const after = await page.evaluate(`(() => {
    const s = window.__solar.state()
    return { jd: s.displayJD, id: s.selectedId }
  })()`)
  check('the Galileo Probe is selected', after.id === 'sc_galileo_probe', `got ${after.id}`)
  // It was dropped into Jupiter in December 1995, so the clock cannot still be
  // in 2026 — `carryClockToMission` moves it to the middle of the mission.
  check(
    'and the clock went with it',
    after.jd < 2451545,
    `JD ${after.jd.toFixed(1)} (was ${before.toFixed(1)})`,
  )

  /* ---- escape ---- */

  await page.evaluate(`window.__solar.state().setSearchOpen(true)`)
  await page.frames(20)
  await page.evaluate(press('Escape'))
  await page.frames(20)
  check(
    'escape closes it',
    (await page.evaluate(`document.querySelector('.search__card')`)) === null,
  )
} finally {
  await page.close()
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
