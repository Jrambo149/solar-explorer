/**
 * Spacecraft trails, checked in a browser that actually draws frames.
 *
 * The claim under test is one sentence: a craft's trail fades only when it is
 * the selected craft, and stays at full strength otherwise. It is not a claim
 * about a number in a pure module — `shown.current` is damped every frame
 * inside `useFrame` from the live camera distance — so nothing in the existing
 * headless suite can reach it, and it is not a claim a screenshot settles either,
 * since "dimmer" and "further away" look identical in a picture.
 *
 * What settles it is `uAlphaMultiplier` on each craft's ribbon material, read
 * out of the running scene graph while the camera is parked at one of them.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { SPACECRAFT } from '../src/data/bodies.js'
import { isFlying, trajectoryWindow } from '../src/orbit/trajectory.js'
import { LANDED_CRAFT } from '../src/data/landedCraft.js'
import { julianDate } from '../src/orbit/kepler.js'

/** `MAX_POINTS` in `SpacecraftPath`. Raised from 256 for Juno and Parker. */
const BUDGET = 512

const SUBJECT = 'sc_lunar_reconnaissance_orbiter'
const NEIGHBOURS = ['sc_themis_b', 'sc_themis_c']

/** Every ribbon's alpha, keyed by craft. Averaged over a craft's runs. */
const READ_ALPHAS = `(() => {
  const out = {}
  window.__solar.scene.traverse((o) => {
    if (!o.name?.startsWith('trail:')) return
    const [, id] = o.name.split(':')
    const alpha = o.material?.uniforms?.uAlphaMultiplier?.value
    if (alpha === undefined) return
    const seen = out[id] ?? (out[id] = { sum: 0, runs: 0, visible: false })
    seen.sum += alpha
    seen.runs += 1
    seen.visible = seen.visible || o.parent.visible
  })
  return Object.fromEntries(
    Object.entries(out).map(([id, v]) => [id, { alpha: v.sum / v.runs, visible: v.visible }]),
  )
})()`

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const page = await openApp()

try {
  // The fleet is off by default, and the trails layer is what is being tested.
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.layers.spacecraft) s.toggleLayer('spacecraft')
    if (!s.layers.trails) s.toggleLayer('trails')
  })()`)
  await page.frames(30)

  // Nothing selected: every trail should be at full strength.
  const idle = await page.evaluate(READ_ALPHAS)
  for (const id of [SUBJECT, ...NEIGHBOURS]) {
    const seen = idle[id]
    check(`${id} draws a trail with nothing selected`, !!seen && seen.visible)
    check(`${id} is at full alpha`, !!seen && seen.alpha > 0.99, seen && seen.alpha.toFixed(3))
  }

  /*
   * Fly to the subject and let the camera actually arrive.
   *
   * The flight is exponentially damped over about two seconds, and the fade is
   * a function of the camera's distance, so reading before the arrival measures
   * a camera in transit. 240 frames is four seconds at 60 fps — comfortably
   * past it, and cheap.
   */
  await page.evaluate(`window.__solar.state().selectPlanet(${JSON.stringify(SUBJECT)})`)
  await page.frames(240)

  const parked = await page.evaluate(READ_ALPHAS)
  check(
    'the selected craft fades close up',
    parked[SUBJECT] && parked[SUBJECT].alpha < 0.5,
    parked[SUBJECT] && parked[SUBJECT].alpha.toFixed(3),
  )
  for (const id of NEIGHBOURS) {
    check(
      `${id} keeps its trail while ${SUBJECT} is selected`,
      parked[id] && parked[id].alpha > 0.99 && parked[id].visible,
      parked[id] && parked[id].alpha.toFixed(3),
    )
  }

  // And back: deselecting has to restore the selected craft's own trail, or the
  // fade would be a one-way trip.
  await page.evaluate(`window.__solar.state().clearSelection()`)
  await page.frames(240)
  const released = await page.evaluate(READ_ALPHAS)
  check(
    'the trail comes back on deselect',
    released[SUBJECT] && released[SUBJECT].alpha > 0.99,
    released[SUBJECT] && released[SUBJECT].alpha.toFixed(3),
  )

  /* ---- smoothness ---- */

  /*
   * The worst joint in each trail, in degrees.
   *
   * This is the number the eye actually reads. A polyline is smooth when no
   * single corner stands out, not when the average is small — ARTEMIS P2's mean
   * turn was already well under a degree while thirteen consecutive joints at
   * periapsis ran past five and peaked at 17.3°, and that run of corners is
   * exactly what read as a faceted arc wrapped around the Moon.
   */
  await page.evaluate('window.__solar.state().clearSelection()')
  await page.frames(60)
  const geometry = await page.evaluate(`(() => {
    const out = {}
    window.__solar.scene.traverse((o) => {
      if (!o.name?.startsWith('trail:')) return
      const pos = o.geometry.getAttribute('position')
      // Two ribbon vertices per centreline sample.
      const pts = []
      for (let i = 0; i < pos.count; i += 2) pts.push([pos.getX(i), pos.getY(i), pos.getZ(i)])
      let worst = 0
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i].map((v, k) => v - pts[i - 1][k])
        const b = pts[i + 1].map((v, k) => v - pts[i][k])
        const la = Math.hypot(...a)
        const lb = Math.hypot(...b)
        if (!la || !lb) continue
        const cos = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb)
        worst = Math.max(worst, Math.acos(Math.min(1, Math.max(-1, cos))) * 180 / Math.PI)
      }
      out[o.name.split(':')[1]] = { points: pts.length, worst }
    })
    return out
  })()`)

  /*
   * Every craft that is *flying today* has to appear, before anything is
   * asserted about shape.
   *
   * The loop below only ever looked at the trails it found, which means a craft
   * with no trail at all passed by not being there — and four of them were:
   * `SpacecraftPath` required a frame body for an element set, the Sun is not in
   * the body registry, and Parker, STEREO-A, OSIRIS-REx and BioSentinel drew
   * nothing while every check about them silently did not run.
   *
   * Scoped by `isFlying` rather than over the whole roster, because a mission
   * that has ended genuinely has no trail at the current date and that is the
   * correct behaviour, not a bug: Eyes ends a craft at a `parents` entry whose
   * frame is the empty string — Cassini's is 2017-09-15, the day it was flown
   * into Saturn — and this app transcribed the same rule. Asserting over the
   * whole roster would make a correctly-vanished craft indistinguishable from a
   * broken one. What covers the historic craft instead is the scrub below.
   */
  const flyingToday = SPACECRAFT.filter((b) => isFlying(b, julianDate(new Date())))
  const missing = flyingToday.map((b) => b.id).filter((id) => !(id in geometry))
  check(
    `every craft flying today has a trail (${flyingToday.length} of ${SPACECRAFT.length})`,
    missing.length === 0,
    missing.join(', '),
  )

  for (const [id, g] of Object.entries(geometry)) {
    check(`${id} spends its whole sample budget`, g.points === BUDGET, `${g.points} points`)
    check(`${id} has no visible corner`, g.worst < 3, `worst joint ${g.worst.toFixed(2)}°`)
  }

  /* ---- no piece of trail floats free of its craft ---- */

  /*
   * A trail crossing a frame handoff is drawn as one ribbon per segment, and
   * those pieces have to meet — the end of one leg and the start of the next are
   * the same instant, so they are the same point.
   *
   * In world space they were not, because each frame warps that point on its own
   * scale: a planet's frame inflates distances so a close orbiter is visible at
   * all, and the Sun's does not. The pieces landed 26 to 68 world units apart on
   * a diorama where Mars sits 39 units from the Sun, so a fragment of Psyche's
   * cruise was drawn straight across Mars with no craft at either end of it.
   *
   * Measured in world units rather than on screen. Projecting would be the
   * obvious way to ask "does this look detached", and it cannot be trusted here:
   * a point behind the camera projects to a garbage coordinate rather than to
   * nothing, and the first version of this measurement reported ribbons with
   * on-screen lengths of six million pixels.
   */
  const chains = await page.evaluate(`(() => {
    const byCraft = new Map()
    window.__solar.scene.traverse((o) => {
      if (!o.name?.startsWith('trail:')) return
      if (!o.visible || !o.parent.visible) return
      const [, id, index] = o.name.split(':')
      const pos = o.geometry.getAttribute('position')
      const at = (i) => [
        pos.getX(i) + o.parent.position.x,
        pos.getY(i) + o.parent.position.y,
        pos.getZ(i) + o.parent.position.z,
      ]
      const list = byCraft.get(id) ?? []
      list.push({ run: +index, head: at(0), tail: at(pos.count - 2) })
      byCraft.set(id, list)
    })

    const out = []
    for (const [id, runs] of byCraft) {
      runs.sort((a, b) => a.run - b.run)
      const craft = window.__solar.positions.get(id)
      let worstJoin = 0
      for (let i = 1; i < runs.length; i++) {
        const a = runs[i - 1].tail
        const b = runs[i].head
        worstJoin = Math.max(worstJoin, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
      }
      const end = runs[runs.length - 1].tail
      out.push({
        id,
        pieces: runs.length,
        worstJoin,
        // The live end of the last piece is the craft itself, which is what makes
        // the whole chain attached rather than merely self-consistent.
        toCraft: craft ? Math.hypot(end[0] - craft.x, end[1] - craft.y, end[2] - craft.z) : Infinity,
      })
    }
    return out
  })()`)

  // Real joins are the same point evaluated twice, so they are exactly equal;
  // the broken ones were tens of units apart. Nothing here is a tuned threshold.
  const split = chains.filter((c) => c.worstJoin > 0.01)
  check(
    'every trail is one connected line',
    split.length === 0,
    split.map((c) => `${c.id} breaks by ${c.worstJoin.toFixed(1)} units`).join(', '),
  )
  const adrift = chains.filter((c) => c.toCraft > 0.01)
  check(
    'and it ends at its craft',
    adrift.length === 0,
    adrift.map((c) => `${c.id} ends ${c.toCraft.toFixed(1)} units away`).join(', '),
  )

  /* ---- a mission that has ended appears when you scrub back to it ---- */

  /*
   * The other half of the `isFlying` scoping above.
   *
   * Eyes ends a craft at a `parents` entry whose frame is the empty string —
   * Cassini's is 2017-09-15, the day it was flown into Saturn — and a craft past
   * that instant is not drawn at all rather than parked at its last position.
   * This app transcribed the rule, so a historic craft correctly has no trail
   * today, and the check above cannot say anything about it.
   *
   * What it *must* do is appear when the clock is inside its window and be gone
   * when it is not. Both directions, because "always drawn" and "never drawn"
   * each pass a one-sided test.
   *
   * Scrubbed through `setSimulationDate`, the setter the date picker itself
   * calls; the app opens paused, so the clock stays where it is put.
   */
  const TODAY = julianDate(new Date())
  /*
   * A landed craft's dates come from `LANDED_CRAFT`, not from its trajectory.
   *
   * The trajectory window of a rover is the extent of an ephemeris nothing
   * draws from — it is placed by coordinates and Mars' rotation. Perseverance's
   * kernel stops in February 2026 and the rover is still operating, so scoring
   * it on the window asked for it to vanish a year after JPL happened to stop
   * propagating it. One with no end date is skipped here entirely: there is no
   * "after" to check.
   */
  const historic = SPACECRAFT.filter((b) => {
    const site = LANDED_CRAFT[b.id]
    if (site) return site.ended !== null && TODAY > site.ended
    return !isFlying(b, TODAY)
  }).map((b) => {
    const site = LANDED_CRAFT[b.id]
    const window = trajectoryWindow(b)
    const start = site ? site.landed : window.start
    const end = site ? site.ended : window.end
    return { id: b.id, name: b.name, mid: (start + end) / 2, end }
  })

  if (historic.length === 0) {
    // Reported rather than silently passing: with no historic craft on the
    // roster this file proves nothing about them, and a run that printed
    // nothing here would read as though it had.
    console.log('  --   no historic craft on the roster yet; scrub check not run')
  }

  for (const craft of historic) {
    const inside = await page.evaluate(`(async () => {
      window.__solar.setSimulationDate(${craft.mid})
      return true
    })()`)
    void inside
    await page.frames(90)
    const drawnInside = await page.evaluate(
      `!!window.__solar.positions.get(${JSON.stringify(craft.id)})`,
    )
    check(`${craft.name} is drawn inside its mission window`, drawnInside === true)

    // A year past the end, which is outside every craft's window and still
    // inside the app's epoch range.
    await page.evaluate(`window.__solar.setSimulationDate(${craft.end + 365})`)
    await page.frames(90)
    const drawnAfter = await page.evaluate(
      `!!window.__solar.positions.get(${JSON.stringify(craft.id)})`,
    )
    check(`and gone after it ends`, drawnAfter === false)
  }

  /*
   * A rover's two lives, and that it has both.
   *
   * Before touchdown it is a cruise stage on an ordinary trajectory; after, it
   * is a rover placed on the surface by coordinates. The two are told apart by
   * *where* it is rather than by which mesh is loaded — that is the observable
   * that matters, and the one a mesh mix-up cannot fake: on the ground its
   * distance from the centre of Mars is the planet's drawn radius exactly, and
   * on the way in it is not.
   *
   * Four months, not an hour, and the bound is loose in both directions. Entry,
   * descent and landing take seven minutes against a trajectory sampled every
   * 1.5 days, so the last samples before touchdown interpolate straight through
   * the planet — an hour before landing the sampled position is *inside* Mars,
   * which is a resolution the baked data does not have. And at the default
   * scale distance is warped, so four months out reads as five or six Mars
   * radii rather than the ten million km it is.
   *
   * Both halves have been broken here. The craft was undrawn before touchdown
   * for as long as the rover was the only mesh it had, so the first half would
   * have failed; and the far end was `isFlying` for a while, which had
   * Perseverance vanish the day JPL's kernel ran out.
   */
  const distanceFromMars = (id) => `(() => {
    const p = window.__solar.positions.get(${JSON.stringify(id)})
    const mars = window.__solar.positions.get('mars')
    if (!p || !mars) return null
    return Math.hypot(p.x - mars.x, p.y - mars.y, p.z - mars.z)
  })()`

  /** Mars' drawn radius at the default scale, which is what a rover sits at. */
  const MARS_RADIUS = await page.evaluate(`(() => {
    const p = window.__solar.positions.get('sc_mars_science_laboratory')
    const mars = window.__solar.positions.get('mars')
    return p && mars ? Math.hypot(p.x - mars.x, p.y - mars.y, p.z - mars.z) : null
  })()`)

  for (const [id, site] of Object.entries(LANDED_CRAFT).filter(([, s]) => s.body === 'mars')) {
    await page.evaluate(`window.__solar.setSimulationDate(${site.landed} - 120)`)
    await page.frames(90)
    const cruise = await page.evaluate(distanceFromMars(id))
    await page.evaluate(`window.__solar.setSimulationDate(${site.landed} + 1)`)
    await page.frames(90)
    const down = await page.evaluate(distanceFromMars(id))

    check(
      `${site.name} is drawn out in space four months before it lands`,
      cruise !== null && cruise > 4 * MARS_RADIUS,
      cruise === null ? 'not drawn at all' : `${cruise.toFixed(2)} from Mars' centre`,
    )
    check(
      `and is standing on Mars the day after`,
      down !== null && Math.abs(down - MARS_RADIUS) < 1e-4,
      down === null ? 'not drawn at all' : `${down.toFixed(4)} vs radius ${MARS_RADIUS.toFixed(4)}`,
    )
  }

  // Back to now, so the console-error check below reads a normal scene.
  await page.evaluate(`window.__solar.setSimulationDate(${TODAY})`)
  await page.frames(60)

  const errors = page.errors.filter((e) => !e.startsWith('warning:'))
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await page.close()
}

console.log(failures === 0 ? '\nall trail checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
