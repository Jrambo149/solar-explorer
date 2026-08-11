/**
 * The body switcher follows the selection.
 *
 * Selecting something in the scene and then opening the nav should show you
 * where you are, not where you last were. The bar had branches for moons and
 * dwarf planets and an `else` that meant Planets, written when those were the
 * only three classes in it — so comets and spacecraft, both added later, opened
 * on the eight planets while a probe orbiting the Moon filled the screen.
 *
 * ## Why this reads the DOM rather than the store
 *
 * The section is component state inside `NavBar`, not something `__solar`
 * exposes, and reaching into React internals to read it would be testing the
 * implementation. What the user judges is which tab is lit, so that is what is
 * asserted.
 *
 * The one trap, which cost a false failure while writing this: `.navbar__tab` is
 * used for **two** different rows. At the top level it is the class switcher
 * (Planets / Moons / Comets / Spacecraft); once drilled into a host it is the
 * *tier* switcher (Major / Minor). Reading "the open tab" without checking which
 * row you are in reports a moon's section as "Major".
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { SPACECRAFT } from '../src/data/bodies.js'
import { bodyName, LANDED_CRAFT } from '../src/data/landedCraft.js'
import { julianDate } from '../src/orbit/kepler.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * What the switcher is showing: the open tab, and the host if drilled in.
 *
 * `back` is only present while drilled, so it is the thing that tells the two
 * meanings of `.navbar__tab` apart.
 */
const SHOWING = `(() => {
  const back = document.querySelector('.navbar__back-label')
  const open = [...document.querySelectorAll('.navbar__tab')]
    .find((b) => b.classList.contains('is-open'))
  return {
    host: back ? back.textContent.trim() : null,
    tab: open ? open.textContent.replace(/\\d+$/, '').trim() : null,
    chips: [...document.querySelectorAll('.nav-chip')]
      .map((c) => c.textContent.trim().split('\\n')[0]),
  }
})()`

const page = await openApp()

try {
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    for (const k of ['spacecraft', 'comets', 'dwarfPlanets']) {
      if (!s.layers[k]) s.toggleLayer(k)
    }
  })()`)
  await page.frames(60)

  /*
   * Each class, opened the way a user opens it: select first, *then* open the
   * nav. Closing it in between matters — the bug is about what the bar shows
   * when it appears, and a bar left open follows the selection live either way.
   */
  const CASES = [
    ['sc_themis_b', 'ARTEMIS P1', 'Spacecraft'],
    ['sc_voyager_1', 'Voyager 1', 'Spacecraft'],
    ['1p_halley', 'Halley', 'Comets'],
    ['pluto', 'Pluto', 'Dwarf planets'],
    ['jupiter', 'Jupiter', 'Planets'],
  ]

  for (const [id, name, section] of CASES) {
    await page.evaluate(`(() => {
      const s = window.__solar.state()
      if (s.navOpen) s.toggleNav()
      s.selectPlanet(${JSON.stringify(id)})
    })()`)
    await page.frames(40)
    await page.evaluate(`(() => {
      const s = window.__solar.state()
      if (!s.navOpen) s.toggleNav()
    })()`)
    await page.frames(40)

    const shown = await page.evaluate(SHOWING)
    check(`${name} opens the nav on ${section}`, shown.tab === section, `showing ${shown.tab}`)
    // The section being right is only half of it: the body has to be in the row.
    check(
      `${name} is a chip in that row`,
      shown.chips.includes(name),
      shown.chips.slice(0, 5).join(', '),
    )
  }

  /*
   * A moon goes further, and always did: its section *and* its host *and* its
   * tier, because a chip you cannot see is no better than the wrong section.
   */
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (s.navOpen) s.toggleNav()
    s.selectPlanet('europa')
  })()`)
  await page.frames(40)
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.navOpen) s.toggleNav()
  })()`)
  await page.frames(40)

  const moon = await page.evaluate(SHOWING)
  check('Europa drills into Jupiter', moon.host === 'Jupiter', `host ${moon.host}`)
  check('and into the major tier', moon.tab === 'Major', `tab ${moon.tab}`)
  check('and Europa is a chip there', moon.chips.includes('Europa'), moon.chips.join(', '))

  /* ---- spacecraft chips show their model ---- */

  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (s.navOpen) s.toggleNav()
    s.selectPlanet('sc_voyager_1')
  })()`)
  await page.frames(40)
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.navOpen) s.toggleNav()
  })()`)
  await page.frames(40)

  /*
   * The image is *decoded*, not merely referenced.
   *
   * A missing PNG leaves the CSS `background-image` exactly as authored — the
   * rule still reads back as the url you set — so asserting on the style proves
   * nothing at all. Loading each one through `Image` and waiting for it is the
   * only way to tell a thumbnail that exists from one that 404s, and four of the
   * models genuinely have no thumbnail because they need decoders this app does
   * not configure.
   */
  const chips = await page.evaluate(`(async () => {
    const rows = [...document.querySelectorAll('.nav-chip')]
    const out = []
    for (const chip of rows) {
      const art = chip.querySelector('.nav-chip__model')
      const dot = chip.querySelector('.nav-chip__dot')
      const name = chip.querySelector('.nav-chip__name')
      // Unwrapped by slicing, not by a regex: a replace() written here lives
      // inside a template literal on the Node side, so its backslashes are
      // consumed before the browser sees the pattern. The escaped version
      // arrived unescaped, matched nothing, every URL kept its wrapper, and the
      // test reported ten broken thumbnails that were all perfectly fine.
      const raw = art ? getComputedStyle(art).backgroundImage : ''
      const url = raw.startsWith('url(')
        ? raw.slice(4, -1).replace(/^["']|["']$/g, '')
        : null
      let decoded = false
      if (url) {
        decoded = await new Promise((done) => {
          const img = new Image()
          img.onload = () => done(img.naturalWidth > 0)
          img.onerror = () => done(false)
          img.src = url
        })
      }
      out.push({
        name: name.textContent.trim(),
        hasArt: !!art,
        decoded,
        file: url ? url.split('/').pop() : null,
        size: Math.round(dot.getBoundingClientRect().width),
        nameLeft: name.getBoundingClientRect().left,
        nameRight: name.getBoundingClientRect().right,
      })
    }
    return out
  })()`)

  /*
   * Every craft that *has* a mesh shows it; the rest correctly fall back.
   *
   * This asserted over every chip, which held while every craft on the roster
   * had a model. Mars Pathfinder does not: no mesh for it was ever published, so
   * its roster entry carries `model: null` and `getSpacecraftThumb` returns null
   * by design — the chip falls back to its coloured disc, which is the intended
   * behaviour for a craft with no mesh and is what the four Draco/KTX2 models
   * used to do before their decoders were configured.
   *
   * Scoped by the roster rather than by what the page happens to render, so a
   * craft that *should* have art and silently lost it still fails. That is the
   * bug this was written for: a thumbnail 404ing leaves the CSS `background-image`
   * exactly as authored, so only decoding the image tells the two apart.
   */
  /*
   * Named the way the chips are, which for a rover is not the way the roster is:
   * the bar says `Perseverance` where `SPACECRAFT` says `Mars 2020`, from the
   * moment it lands. Matching on the roster name put both rovers in the
   * no-mesh pile and failed them for showing the art they should show.
   */
  const withModel = new Set(
    SPACECRAFT.filter((b) => b.model).map((b) => bodyName(b, julianDate(new Date()))),
  )
  const arted = chips.filter((c) => withModel.has(c.name))
  const bare = chips.filter((c) => !withModel.has(c.name))
  check(
    `every spacecraft chip with a mesh carries model art (${arted.length} of ${chips.length})`,
    arted.every((c) => c.hasArt),
    arted
      .filter((c) => !c.hasArt)
      .map((c) => c.name)
      .join(', '),
  )
  check(
    'and every one of those images loads',
    arted.every((c) => c.decoded),
    arted
      .filter((c) => !c.decoded)
      .map((c) => `${c.name} → ${c.file}`)
      .join(', '),
  )
  // The complement, so "no mesh" cannot quietly become "art that 404s".
  check(
    'and a craft with no mesh shows no art',
    bare.every((c) => !c.hasArt),
    bare
      .filter((c) => c.hasArt)
      .map((c) => c.name)
      .join(', '),
  )

  /*
   * The size is the assertion that `sizeOf` routes spacecraft to their own
   * sizer. It used to send them to the comets', which made the spacecraft
   * section's own `base` and `span` dead data — declared, authoritative-looking,
   * and read by nothing.
   */
  check(
    'the chips use the spacecraft size',
    chips.every((c) => c.size === 26),
    [...new Set(chips.map((c) => c.size))].join(', ') + 'px',
  )

  // Long names used to overhang into the next chip; see `.nav-chip__name`.
  const overlaps = chips
    .slice(1)
    .filter((c, i) => c.nameLeft < chips[i].nameRight - 1)
    .map((c, i) => `${chips[i].name} / ${c.name}`)
  check('no name overhangs its neighbour', overlaps.length === 0, overlaps.join(', '))

  /* ---- the class switcher stays put while the chips scroll ---- */

  /*
   * A geometric claim, measured geometrically.
   *
   * The panel is one flex row of switcher, rule and chips, and the sideways
   * scroll used to sit on the box containing all three — so scrolling right to
   * reach the end of the spacecraft carried Planets, Moons and Spacecraft off
   * the left edge with the chips. It cost nothing while a class fitted the
   * window, which is why it survived; twenty-one craft is comfortably past that.
   *
   * The wheel is dispatched through CDP rather than as a synthetic `WheelEvent`.
   * A synthetic one runs the listeners and performs **no default action**, so it
   * can report a scroll that never happened — it would pass this test against
   * either version of the stylesheet.
   */
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (s.navOpen) s.toggleNav()
    s.selectPlanet('sc_voyager_1')
  })()`)
  await page.frames(40)
  await page.evaluate(
    `(() => { const s = window.__solar.state(); if (!s.navOpen) s.toggleNav() })()`,
  )
  await page.frames(40)

  const FROZEN = `(() => {
    const row = document.querySelector('.navbar__row')
    const tabs = [...document.querySelectorAll('.navbar__tab')]
    const r = row.getBoundingClientRect()
    return {
      scrollLeft: row.scrollLeft,
      room: row.scrollWidth - row.clientWidth,
      lefts: tabs.map((t) => Math.round(t.getBoundingClientRect().left)),
      onScreen: tabs.every((t) => t.getBoundingClientRect().left > 0),
      mid: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
    }
  })()`

  const before = await page.evaluate(FROZEN)
  // The whole test is vacuous if the row already fits — there would be nothing
  // to scroll and the tabs could not move whatever the stylesheet said.
  check('the spacecraft row overruns its panel', before.room > 50, `${before.room}px of overrun`)

  for (let i = 0; i < 14; i++) {
    await page.wheel(before.mid, before.y, 120)
    await page.frames(3)
  }
  await page.frames(30)

  const after = await page.evaluate(FROZEN)
  check('the chips scroll', after.scrollLeft > 50, `${after.scrollLeft}px of ${after.room}`)
  check(
    'and the class switcher does not move',
    after.lefts.every((x, i) => x === before.lefts[i]),
    `${before.lefts.join(', ')} -> ${after.lefts.join(', ')}`,
  )
  check('so every tab is still on screen', after.onScreen)

  /* ---- every keynote fits the card it is written for ---- */

  /*
   * The dock is anchored to the bottom of the screen and grows upward, so a note
   * that needs a fourth line does not push anything down — it lifts the entire
   * control, chips and all, while you are reading it. `.navbar-keynote` is
   * floored at three lines for exactly that reason and every note is meant to
   * fit in three.
   *
   * Meant to, and two did not. Comets ran to four, and Spacecraft had no note at
   * all — which is worse than a long one, because the card is always mounted:
   * the section opened onto an empty pane of glass. Neither is visible in the
   * source, where all that can be counted is characters, and characters do not
   * decide this. Comets was 246 to Dwarf planets' 245 and wrapped a line
   * earlier, because where a line breaks is a matter of which long words fall
   * near the edge.
   */
  const notes = await page.evaluate(`(async () => {
    const rows = []
    for (const tab of [...document.querySelectorAll('.navbar__tab')]) {
      tab.click()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const card = document.querySelector('.navbar-keynote')
      rows.push({
        tab: tab.textContent.trim(),
        height: Math.round(card.getBoundingClientRect().height),
        chars: card.textContent.trim().length,
      })
    }
    return rows
  })()`)

  const floor = Math.min(...notes.map((n) => n.height))
  check(
    'every section has a keynote',
    notes.every((n) => n.chars > 40),
    notes
      .filter((n) => n.chars <= 40)
      .map((n) => `${n.tab} (${n.chars} chars)`)
      .join(', '),
  )
  check(
    'and none of them lifts the dock by overflowing its card',
    notes.every((n) => n.height === floor),
    notes.map((n) => `${n.tab} ${n.height}px`).join(', '),
  )

  /*
   * A rover's name changes at touchdown, and every label changes with it.
   *
   * Both names are right about different objects — `Mars 2020` is the cruise
   * stage crossing to Mars, `Perseverance` is what drives away from it — so the
   * label turns over at the same instant the model does. Asserted either side
   * of the landing rather than at two arbitrary dates: the whole point is that
   * the two agree on *when*, and fifteen minutes is far tighter than any
   * plausible off-by-one in the boundary test.
   *
   * Every surface the name appears on, because they read it from five different
   * components and the first cut changed one of them.
   */
  const LANDED = LANDED_CRAFT.sc_mars_2020.landed
  const labels = `(() => ({
    title: document.querySelector('.planet-title__name')?.textContent ?? '',
    hint: document.querySelector('.scroll-hint__label')?.textContent ?? '',
    dossier: document.querySelector('.dossier__title')?.textContent ?? '',
    chip: [...document.querySelectorAll('.nav-chip__name')].map((c) => c.textContent)
      .find((t) => /Mars 2020|Perseverance/.test(t)) ?? '',
    marker: [...document.querySelectorAll('.marker__name')].map((m) => m.textContent)
      .find((t) => /Mars 2020|Perseverance/.test(t)) ?? '',
  }))()`

  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.setTimeRate(0)
    if (!s.paused) s.togglePaused()
    s.selectPlanet('sc_mars_2020')
    if (!s.navOpen) s.toggleNav()
  })()`)
  await page.frames(120)

  for (const [dt, when, want, other] of [
    [-0.01, 'fifteen minutes before touchdown', 'Mars 2020', 'Perseverance'],
    [0.01, 'fifteen minutes after touchdown', 'Perseverance', 'Mars 2020'],
  ]) {
    await page.evaluate(`window.__solar.setSimulationDate(${LANDED} + ${dt})`)
    await page.frames(90)
    const seen = await page.evaluate(labels)
    const wrong = Object.entries(seen).filter(([, t]) => !t.includes(want) || t.includes(other))
    check(
      `it is called ${want} ${when}`,
      wrong.length === 0,
      wrong.map(([k, t]) => `${k}: ${JSON.stringify(t)}`).join(', ') ||
        Object.values(seen).length + ' labels agree',
    )
  }

  /* ---- the dossier states an axial tilt only where one is known ---- */

  /*
   * A zero here would be a claim, not a blank.
   *
   * Every body in the registry carries an `axialTilt` and most of them carry a
   * placeholder zero — every moon, every comet, Eris, Makemake. The dossier
   * prints the row only for the bodies in `BODY_POLES`, so what is checked is
   * both halves of that: the number is there and correct where the pole is
   * known, and the row is *absent* rather than zero where it is not.
   *
   * Reading the rendered `<dd>` rather than the data, because the failure this
   * guards against is a formatting one — a raw `87.1` with no degree sign, or a
   * row that quietly reappears for every moon in the scene.
   */
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    for (const k of ['dwarfPlanets', 'moons']) if (!s.layers[k]) s.toggleLayer(k)
  })()`)
  await page.frames(60)

  const tiltRow = `(() => {
    const row = [...document.querySelectorAll('.fact-grid__row')]
      .find((r) => r.querySelector('dt')?.textContent === 'Axial tilt')
    return row ? row.querySelector('dd').textContent : null
  })()`

  for (const [id, name, want] of [
    ['haumea', 'Haumea', '87.1°'],
    ['uranus', 'Uranus', '97.77°'],
    ['earth', 'Earth', '23.44°'],
    ['europa', 'Europa', null],
    ['eris', 'Eris', null],
  ]) {
    await page.evaluate(`window.__solar.state().selectPlanet(${JSON.stringify(id)})`)
    await page.frames(120)
    const got = JSON.parse(await page.evaluate(`JSON.stringify(${tiltRow})`))
    check(
      want === null
        ? `${name} states no axial tilt, having no known pole`
        : `${name}'s dossier states its axial tilt`,
      got === want,
      `showed ${JSON.stringify(got)}`,
    )
  }

  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.clearSelection()
    s.setTimeRate(1)
    if (s.paused) s.togglePaused()
  })()`)
  await page.frames(30)

  const errors = page.errors.filter((e) => !e.startsWith('warning:'))
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await page.close()
}

console.log(failures === 0 ? '\nall nav checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
