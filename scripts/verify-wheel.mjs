/**
 * Who gets the wheel.
 *
 * The scene and the page share one wheel axis by design — see the `invert`
 * listener in `CameraController` — and the panels laid over the scene have to
 * fit into that without either of the other two taking their gestures. Scrolling
 * the nav to look for a craft zoomed the camera into the one already selected,
 * and the list never moved.
 *
 * ## Why the wheels here are dispatched by the browser
 *
 * A synthetic `WheelEvent` runs every listener but performs **no default
 * action** — untrusted events never scroll anything. It can show that a wheel
 * does not reach the camera and cannot show that the thing under the pointer
 * scrolled instead, which is the half that matters when the complaint is that
 * the list will not move. Worse, it reports the wrong answer: the first fix here
 * passed a synthetic test and still moved the camera in a real browser, because
 * the wheel it declined to zoom with went on to scroll the *page*, and a
 * scrolled page hands the camera to the split-view framing. `page.wheel` goes
 * through CDP's input domain, so the browser delivers a real one.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp, openPage } from './lib/browser.mjs'

const CRAFT = 'sc_themis_b'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/** Camera, page and nav row, together — the three things a wheel could move. */
const READ = `(() => {
  const c = window.__solar.camera.position
  const row = document.querySelector('.navbar__row')
  return {
    camera: [c.x, c.y, c.z],
    scrollY: window.scrollY,
    left: row ? row.scrollLeft : null,
    selected: window.__solar.state().selectedId,
  }
})()`

const moved = (a, b) =>
  Math.hypot(a.camera[0] - b.camera[0], a.camera[1] - b.camera[1], a.camera[2] - b.camera[2])

const centreOf = (page, selector) =>
  page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2,
             room: el.scrollWidth - el.clientWidth }
  })()`)

/* ---- a normal window: the nav must not drive the camera ---- */

const page = await openApp()
try {
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.layers.spacecraft) s.toggleLayer('spacecraft')
  })()`)
  await page.frames(30)
  await page.evaluate(`window.__solar.state().selectPlanet(${JSON.stringify(CRAFT)})`)
  await page.frames(250)
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.navOpen) s.toggleNav()
  })()`)
  await page.frames(40)

  const nav = await centreOf(page, '.navbar')
  const before = await page.evaluate(READ)
  for (let i = 0; i < 6; i++) await page.wheel(nav.x, nav.y, 120)
  await page.frames(90)
  const after = await page.evaluate(READ)

  check('the nav does not move the camera', moved(before, after) === 0,
    `camera moved ${moved(before, after).toExponential(2)} world units`)
  check('the nav does not scroll the page', after.scrollY === before.scrollY,
    `scrollY ${before.scrollY} → ${after.scrollY}`)
  check('the nav does not change the selection', after.selected === before.selected)

  /*
   * The keynote card, which is the one that took three tries.
   *
   * It is `pointer-events: none` — a 477x74 caption laid over the scene, which
   * would swallow every drag behind it if it took events — so a wheel there
   * reports the *canvas* as its target and no walk up from `event.target` can
   * ever find the nav it belongs to. It also sits directly above the chips,
   * which is where a pointer on its way to the list already is: the row scrolled
   * when you were low enough and the scene zoomed when you were not.
   */
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.layers.comets) s.toggleLayer('comets')
    if (!s.panelOpen) s.togglePanel()
  })()`)
  await page.frames(60)

  for (const [what, selector] of [
    ['keynote card', '.navbar-keynote'],
    ['layer panel', '.layer-panel'],
  ]) {
    const spot = await centreOf(page, selector)
    if (!spot) {
      check(`the ${what} is on screen`, false)
      continue
    }
    const was = await page.evaluate(READ)
    for (let i = 0; i < 5; i++) await page.wheel(spot.x, spot.y, 120)
    await page.frames(90)
    const now = await page.evaluate(READ)
    check(`the ${what} does not move the camera`, moved(was, now) === 0,
      `camera moved ${moved(was, now).toExponential(2)} world units`)
    check(`the ${what} does not scroll the page`, now.scrollY === was.scrollY)
  }

  /*
   * The events list, at the end of its scroll — the case the panels above do
   * not cover.
   *
   * A panel that is merely *scrollable* keeps its own wheel through the
   * `scrollsItself` path, which deliberately hands the gesture on once the
   * control has run out of room: right for a thin overlay laid across the
   * scene, wrong for an open list. So this was fine everywhere except at the
   * ends, where reaching the last row and carrying on flung the camera in and
   * out behind the panel — and only there, which is why it survived the checks
   * above.
   *
   * Scrolled hard to the bottom first, then wheeled again at the same spot.
   */
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    // The layer panel is still open from the case above, and it is tall: both
    // are marked \`data-wheel="ui"\`, \`wheelOwner\` returns the first whose
    // rectangle contains the point, and the two overlap on the right edge. With
    // it open this scrolled the layer panel and reported the events list stuck.
    if (s.panelOpen) s.togglePanel()
    if (!s.eventsOpen) s.toggleEvents()
  })()`)
  await page.frames(60)

  const list = await centreOf(page, '.events__list')
  if (!list) check('the events list is on screen', false)
  else {
    // To the bottom, and confirm it is actually there — a list that never
    // reached its end would pass the check below for the wrong reason.
    for (let i = 0; i < 40; i++) await page.wheel(list.x, list.y, 240)
    await page.frames(60)
    const atEnd = await page.evaluate(`(() => {
      const el = document.querySelector('.events__list')
      return el.scrollTop >= el.scrollHeight - el.clientHeight - 2
    })()`)
    check('the events list scrolls, and reaches its end', atEnd)

    const was = await page.evaluate(READ)
    for (let i = 0; i < 8; i++) await page.wheel(list.x, list.y, 240)
    await page.frames(90)
    const now = await page.evaluate(READ)
    check('scrolling past the end does not move the camera', moved(was, now) === 0,
      `camera moved ${moved(was, now).toExponential(2)} world units`)
    check('and does not scroll the page', now.scrollY === was.scrollY)

    // The other end, which fails independently: `scrollTop` at 0 with an
    // upward wheel is a different branch of the same room test.
    for (let i = 0; i < 40; i++) await page.wheel(list.x, list.y, -240)
    await page.frames(60)
    const top = await page.evaluate(READ)
    for (let i = 0; i < 8; i++) await page.wheel(list.x, list.y, -240)
    await page.frames(90)
    const stillTop = await page.evaluate(READ)
    check('scrolling past the top does not move the camera either',
      moved(top, stillTop) === 0,
      `camera moved ${moved(top, stillTop).toExponential(2)} world units`)

    await page.evaluate(`window.__solar.state().toggleEvents()`)
    await page.frames(30)
  }

  // And the scene still has the wheel everywhere else, which is the thing a
  // fix like this is most likely to break.
  const c0 = await page.evaluate(READ)
  for (let i = 0; i < 6; i++) await page.wheel(1150, 280, 120)
  await page.frames(90)
  const c1 = await page.evaluate(READ)
  check('the scene still zooms', moved(c0, c1) > 0,
    `camera moved ${moved(c0, c1).toExponential(2)} world units`)
} finally {
  await page.close()
}

/* ---- narrow enough that the nav row actually has somewhere to go ---- */

/*
 * 380px because the row only becomes scrollable when its chips overrun, and on
 * a normal window they never do — which is exactly why this bug existed. The
 * test would otherwise assert nothing: a row with no room to scroll cannot
 * demonstrate that the wheel reaches it.
 */
const narrow = await openPage({ url: 'http://localhost:5173', width: 380, height: 820 })
try {
  await narrow.waitFor('window.__solar')
  await narrow.waitFor('window.__solar.state().loaded', { timeout: 60000 })
  await narrow.waitFor('window.__solar.positions.size > 0')
  await narrow.evaluate(`window.__solar.state().selectPlanet('jupiter')`)
  await narrow.frames(250)
  await narrow.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.navOpen) s.toggleNav()
  })()`)
  await narrow.frames(40)

  const row = await centreOf(narrow, '.navbar__row')
  check('the nav row overruns at this width', row !== null && row.room > 1,
    `${row ? row.room : 0}px of travel`)

  if (row && row.room > 1) {
    const before = await narrow.evaluate(READ)
    for (let i = 0; i < 4; i++) await narrow.wheel(row.x, row.y, 120)
    await narrow.frames(60)
    const after = await narrow.evaluate(READ)

    /*
     * A vertical wheel scrolling a sideways row. Chrome does this itself, but
     * only as the event's default action — and the default action is cancelled
     * here to keep the page still, so the app has to do it by hand.
     */
    check('a vertical wheel scrolls the row sideways', after.left > before.left,
      `scrollLeft ${before.left} → ${after.left}`)
    check('scrolling the row leaves the page alone', after.scrollY === before.scrollY)
    check('scrolling the row leaves the camera alone', moved(before, after) === 0,
      `camera moved ${moved(before, after).toExponential(2)} world units`)
  }
} finally {
  await narrow.close()
}

console.log(failures === 0 ? '\nall wheel checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
