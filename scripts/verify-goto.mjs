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
import { CONSTELLATION_REGIONS } from '../src/data/constellations.js'
import { CATEGORIES } from '../src/ui/bodySearch.js'
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

/**
 * A synthetic keydown aimed at the input, kept for the cases that only need the
 * handler to run.
 *
 * It cannot check the thing the arrow keys actually depend on, which is *where
 * focus is*: dispatching at the input passes whether or not the input has
 * focus, and whether or not something else in the app swallowed the key first.
 * The arrow checks below use `page.key`, which is a real press delivered to
 * whatever the browser decides should receive it.
 */
const press = (key) => `(() => {
  const el = document.querySelector('.search__input')
  el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))
  return true
})()`

/** Which row the arrows have landed on, and what it says. */
const ACTIVE = `(() => {
  const rows = [...document.querySelectorAll('.search__row')]
  const at = rows.findIndex((r) => r.classList.contains('is-active'))
  return {
    count: rows.length,
    at,
    name: at === -1 ? null : rows[at].querySelector('.search__name')?.textContent,
    focused: document.activeElement === document.querySelector('.search__input'),
  }
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

  /* ---- walking the list with the arrows ---- */

  console.log('\nThe arrow keys\n')

  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.clearSelection()
    s.setSearchOpen(true)
  })()`)
  await page.frames(20)
  /*
   * Typed one character at a time through the browser, not written into the
   * input's value. The arrows are only reachable if the field genuinely has
   * focus, and setting `.value` from a script proves nothing about that — this
   * is the one check in the suite where how the text got there is the point.
   */
  await page.type('mar')
  await page.frames(25)

  const start = await page.evaluate(ACTIVE)
  check(
    'typing puts the text in the field and arms the first row',
    start.focused && start.at === 0 && start.count > 3,
    `${start.count} rows, active ${start.at}, first is ${start.name}`,
  )

  await page.key('ArrowDown')
  await page.frames(15)
  const down1 = await page.evaluate(ACTIVE)
  await page.key('ArrowDown')
  await page.frames(15)
  const down2 = await page.evaluate(ACTIVE)
  check(
    'down walks the list',
    down1.at === 1 && down2.at === 2,
    `${start.name} → ${down1.name} → ${down2.name}`,
  )

  await page.key('ArrowUp')
  await page.frames(15)
  const up = await page.evaluate(ACTIVE)
  check('and up walks back', up.at === 1, `back to ${up.name}`)

  /*
   * Off the top and round to the bottom.
   *
   * Wrapping rather than stopping, because the list is short and the row
   * someone wants after overshooting the top is usually the last one. Checked
   * because an off-by-one here reads as the arrows going dead at the edge.
   */
  await page.key('ArrowUp')
  await page.frames(15)
  await page.key('ArrowUp')
  await page.frames(15)
  const wrapped = await page.evaluate(ACTIVE)
  check(
    'up from the first row wraps to the last',
    wrapped.at === wrapped.count - 1,
    `row ${wrapped.at} of ${wrapped.count}: ${wrapped.name}`,
  )

  /* And Enter takes the row the arrows left armed, not the first one. */
  await page.key('ArrowDown')
  await page.frames(15)
  const armed = await page.evaluate(ACTIVE)
  await page.key('Enter')
  await page.frames(30)
  const landed = await page.evaluate(`(() => {
    const s = window.__solar.state()
    return { selectedId: s.selectedId, constellation: s.constellation, open: s.searchOpen }
  })()`)
  check(
    'enter takes the row the arrows are on',
    !landed.open && (landed.selectedId !== null || landed.constellation !== null),
    `${armed.name} → ${landed.selectedId ?? `constellation ${landed.constellation}`}`,
  )

  /* ---- the arrows walk the list as it is drawn ---- */

  /*
   * The failure this exists for.
   *
   * Grouping *reorders* the results — that is what a heading does, gathering a
   * class that the ranking had interleaved — so the array the ranking produced
   * is no longer the order on screen. If the arrows kept indexing the old one,
   * every keystroke would still highlight exactly one row and the list would
   * still look right; the highlight would simply jump around it, backwards up
   * the screen and down again. Nothing would throw.
   *
   * So this reads the highlight's actual position in the DOM, and requires it
   * to move down by exactly one row each time, past the headings rather than
   * stopping on them.
   */
  console.log('\nThe arrows against the drawn order\n')

  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.clearSelection()
    s.setSearchOpen(true)
  })()`)
  await page.frames(20)
  await page.evaluate(type('mar'))
  await page.frames(25)

  const GROUPS = `[...document.querySelectorAll('.search__group')].map((g) => g.textContent)`
  const headings = await page.evaluate(GROUPS)
  check(
    '"mar" gathers its results under headings',
    headings.length >= 2,
    headings.join(' · '),
  )

  /** Where the highlight sits among the rows, counted down the screen. */
  const ROW_AT = `(() => {
    const rows = [...document.querySelectorAll('.search__row')]
    return rows.findIndex((r) => r.classList.contains('is-active'))
  })()`

  /**
   * Walk the entire list, one press per row.
   *
   * Better than sampling the first few, and better than testing a heading
   * boundary by itself: a full walk crosses every heading there is, and the
   * only way to pass it is for each press to advance exactly one drawn row
   * whatever lies between them. A highlight that stalled on a heading, skipped
   * a result, or jumped back up into an earlier group all fail here.
   */
  const rowCount = await page.evaluate(`document.querySelectorAll('.search__row').length`)
  const walk = []
  for (let i = 0; i < rowCount; i++) {
    walk.push(await page.evaluate(ROW_AT))
    await page.key('ArrowDown')
    await page.frames(10)
  }
  const straight = walk.every((at, i) => at === i)
  check(
    'each press moves the highlight down exactly one drawn row',
    straight && walk.length === rowCount,
    straight
      ? `${rowCount} rows across ${headings.length} headings, in order`
      : `visited ${walk.join(', ')}`,
  )

  /*
   * And off the bottom, round to the top.
   *
   * The wrap has to land on the first row of the *first* group, which is the
   * one the ranking put first — the same row Enter would have taken before a
   * single key was pressed.
   */
  const wrappedRow = await page.evaluate(ROW_AT)
  check(
    'and off the bottom it wraps to the first row',
    wrappedRow === 0,
    `landed on row ${wrappedRow}`,
  )

  /* ---- browsing a category ---- */

  console.log('\nThe categories\n')

  const ROWS = `[...document.querySelectorAll('.search__row')].map((r) => r.querySelector('.search__name')?.textContent)`

  /*
   * Closed and opened as two separate acts, with frames in between.
   *
   * Doing both in one call is not a state change at all — React batches them,
   * `open` never transitions, and the effect that empties the field never runs,
   * so the palette comes back holding the previous query. Which is correct
   * behaviour and not something a user can do; only a script can.
   */
  await page.evaluate(`window.__solar.state().setSearchOpen(false)`)
  await page.frames(15)
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.clearSelection()
    s.setSearchOpen(true)
  })()`)
  await page.frames(25)

  const menu = await page.evaluate(ROWS)
  check(
    'an empty field offers the categories',
    menu.length === CATEGORIES.length && menu[0] === 'Planets',
    menu.join(', '),
  )

  /*
   * The counts are the roster's, not the query's.
   *
   * A category row promising 88 and opening onto 12 would be the sort of wrong
   * that nobody checks, so the number on screen is compared against the module
   * that produced the list.
   */
  {
    const shown = await page.evaluate(
      `[...document.querySelectorAll('.search__row--category .search__where')].map((e) => Number(e.textContent))`,
    )
    const want = CATEGORIES.map((c) => c.count)
    check(
      'and each says how many are in it',
      shown.length === want.length && shown.every((n, i) => n === want[i]),
      shown.map((n, i) => `${CATEGORIES[i].label} ${n}`).join(' · '),
    )
  }

  /* Clicking one opens the whole category, not a page of it. */
  await page.evaluate(
    `[...document.querySelectorAll('.search__row')].find((r) => r.textContent.includes('Constellations')).click()`,
  )
  await page.frames(30)
  {
    const inside = await page.evaluate(ROWS)
    const scope = await page.evaluate(`document.querySelector('.search__scope')?.textContent ?? ''`)
    check(
      'clicking a category lists all of it',
      inside.length === 88 && inside[0] === 'Andromeda',
      `${inside.length} rows, first ${inside[0]}, scope "${scope}"`,
    )
    check(
      'and the field says what it is scoped to',
      scope.startsWith('Constellations'),
      `chip reads "${scope}"`,
    )
    check(
      'with no headings inside — they would all say the same thing',
      (await page.evaluate(`document.querySelectorAll('.search__group').length`)) === 0,
      'one category, no groups',
    )
  }

  /* Typing inside a category searches only that category. */
  await page.type('mar')
  await page.frames(25)
  {
    const inside = await page.evaluate(ROWS)
    check(
      'typing inside a category searches only it',
      inside.length > 0 && inside.every((name) => CONSTELLATION_REGIONS.some((c) => c.name === name)),
      inside.join(', '),
    )
  }

  /*
   * Escape steps back out rather than closing.
   *
   * Two steps for one press would throw away the browse and the palette
   * together, and the way back in is four keystrokes.
   */
  await page.key('Escape')
  await page.frames(25)
  {
    const state = await page.evaluate(`(() => {
      const s = window.__solar.state()
      return { open: s.searchOpen, rows: document.querySelectorAll('.search__row').length, scope: !!document.querySelector('.search__scope') }
    })()`)
    check(
      'escape leaves the category and keeps the palette open',
      state.open && !state.scope && state.rows === CATEGORIES.length,
      `open ${state.open}, ${state.rows} rows, scoped ${state.scope}`,
    )
  }

  await page.key('Escape')
  await page.frames(25)
  check(
    'and a second escape closes it',
    (await page.evaluate(`window.__solar.state().searchOpen`)) === false,
  )

  /* A heading in the results is the same door. */
  await page.evaluate(`window.__solar.state().setSearchOpen(true)`)
  await page.frames(25)
  await page.evaluate(type('mar'))
  await page.frames(25)
  await page.evaluate(
    `[...document.querySelectorAll('.search__group--button')].find((g) => g.textContent.includes('Spacecraft')).click()`,
  )
  await page.frames(30)
  {
    const inside = await page.evaluate(ROWS)
    const field = await page.evaluate(`document.querySelector('.search__input').value`)
    check(
      'clicking a heading opens its whole category and drops the query',
      inside.length === CATEGORIES.find((c) => c.key === 'spacecraft').count && field === '',
      `${inside.length} craft, field "${field}"`,
    )
  }

  /* Moons come with a second layer of headings: the planet they orbit. */
  await page.key('Backspace')
  await page.frames(20)
  await page.evaluate(
    `[...document.querySelectorAll('.search__row')].find((r) => r.querySelector('.search__name')?.textContent === 'Minor moons').click()`,
  )
  await page.frames(35)
  {
    const state = await page.evaluate(`(() => ({
      headings: [...document.querySelectorAll('.search__group')].map((g) => g.firstChild.textContent.trim()),
      rows: document.querySelectorAll('.search__row').length,
      doors: document.querySelectorAll('.search__group--button').length,
    }))()`)
    check(
      'the minor moons are gathered under their planets',
      state.headings.join(',') === 'Jupiter,Saturn,Uranus,Neptune' && state.rows === 413,
      `${state.rows} moons under ${state.headings.join(' → ')}`,
    )
    /*
     * And those headings are labels, not doors. There is no "moons of Saturn"
     * category to open, so drawing them as buttons would promise something
     * that does not exist.
     */
    check(
      'and a planet heading is a label, not a door',
      state.doors === 0,
      `${state.doors} buttons among ${state.headings.length} headings`,
    )
  }

  /* The arrows still walk it — 413 rows across four headings. */
  {
    const first = await page.evaluate(ACTIVE)
    await page.key('ArrowDown')
    await page.frames(12)
    const second = await page.evaluate(ACTIVE)
    check(
      'the arrows walk a grouped category',
      first.at === 0 && second.at === 1,
      `${first.name} → ${second.name}`,
    )
  }

  await page.evaluate(`window.__solar.state().setSearchOpen(false)`)
  await page.frames(15)
  await page.evaluate(`window.__solar.state().setSearchOpen(true)`)
  await page.frames(25)
  await page.evaluate(
    `[...document.querySelectorAll('.search__row')].find((r) => r.querySelector('.search__name')?.textContent === 'Spacecraft').click()`,
  )
  await page.frames(30)

  /* The spacecraft carry a second layer of headings too: where they were sent. */
  {
    const state = await page.evaluate(`(() => ({
      headings: [...document.querySelectorAll('.search__group')].map((g) => g.firstChild.textContent.trim()),
      rows: document.querySelectorAll('.search__row').length,
      doors: document.querySelectorAll('.search__group--button').length,
    }))()`)
    check(
      'the spacecraft are gathered by mission target',
      state.headings[0] === 'The Sun' &&
        state.headings[state.headings.length - 1] === 'Beyond the planets' &&
        state.rows === CATEGORIES.find((c) => c.key === 'spacecraft').count,
      `${state.rows} craft under ${state.headings.join(' → ')}`,
    )
    check('and those headings are labels too', state.doors === 0, `${state.doors} buttons`)
  }

  /* Backspace on an empty field steps back out, as it does in any palette. */
  await page.key('Backspace')
  await page.frames(25)
  check(
    'backspace on an empty field leaves the category',
    (await page.evaluate(`!document.querySelector('.search__scope')`)),
    'back at the categories',
  )

  /* ---- constellations, which are not bodies ---- */

  console.log('\nFinding a constellation\n')

  for (const [query, name] of [
    ['Lyra', 'Lyra'],
    ['great bear', 'Ursa Major'],
    ['cma', 'Canis Major'],
  ]) {
    await page.evaluate(`(() => {
      const s = window.__solar.state()
      s.clearConstellation()
      if (s.layers.constellations) s.toggleLayer('constellations')
      s.setSearchOpen(true)
    })()`)
    await page.frames(20)
    await page.evaluate(type(query))
    await page.frames(20)
    await page.evaluate(press('Enter'))
    await page.frames(25)

    const got = await page.evaluate(`(() => {
      const s = window.__solar.state()
      return { index: s.constellation, lit: s.layers.constellations, open: s.searchOpen }
    })()`)
    /*
     * The layer matters as much as the selection. The figures are off by
     * default, and `toggleLayer` clears the selection when they go off — so
     * selecting without lighting them would leave the app holding a choice it
     * has already decided to discard, and the sky would not change at all.
     */
    check(
      `"${query}" finds ${name}, and switches the figures on`,
      got.index !== null && CONSTELLATION_REGIONS[got.index].name === name && got.lit && !got.open,
      got.index === null
        ? 'nothing selected'
        : `${CONSTELLATION_REGIONS[got.index].name}, figures ${got.lit ? 'on' : 'OFF'}`,
    )
  }

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
