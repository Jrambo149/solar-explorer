/**
 * The arrival flight, checked while the clock is running.
 *
 * Every earlier measurement of this camera was taken with time paused, which is
 * the default and which is also the one condition under which the bug this
 * guards could not appear. A paused body does not move, so a camera reading its
 * position one frame late reads exactly the right number.
 *
 * What that hid: `useFrame` callbacks run in subscription order within a
 * priority, subscription order is mount order, and a body class behind a layer
 * toggle mounts *after* the camera. The camera therefore flew to where the craft
 * had been on the previous frame. At one day a second LRO crosses a fifth of its
 * two-hour orbit between frames, so the target was 0.25 world units from the
 * craft — 92 times the distance the camera parks at. The flight could not
 * converge and never handed over to the follow.
 *
 * Both halves are checked here: the ordering contract directly, and the
 * behaviour it exists for.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { LANDED_CRAFT } from '../src/data/landedCraft.js'

const CRAFT = 'sc_lunar_reconnaissance_orbiter'

/** Rates in days per second. 30 is well past any orbit in the roster. */
const RATES = [0, 1, 30]

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * Flies to `id` and records the flight's own error term each frame.
 *
 * `|offset − desired|` rather than the distance to the craft, because that is
 * the quantity the damping actually controls: it must fall by a constant factor
 * every frame, whatever the craft is doing. Watching the distance instead can't
 * tell a camera closing in from a craft swinging past.
 */
const FLY = (id, rate, frames) => `new Promise((done) => {
  const st = window.__solar.state()
  st.setTimeRate(${rate})
  if (${rate} !== 0 && st.paused) st.togglePaused()
  if (${rate} === 0 && !st.paused) st.togglePaused()
  st.selectPlanet(${JSON.stringify(id)})
  const cam = window.__solar.camera
  const f = window.__solar.flight
  const rows = []
  let n = 0
  let last = cam.position.clone()
  const started = performance.now()
  const tick = () => {
    const p = window.__solar.positions.get(${JSON.stringify(id)})
    const speed = cam.position.distanceTo(last)
    last.copy(cam.position)
    rows.push(p ? {
      speed,
      // Seconds since the flight was armed, so the assertions can be about the
      // flight's own duration rather than about a frame count that silently
      // assumes 60 fps.
      at: (performance.now() - started) / 1000,
      // Read from the flight itself rather than copied from the component, so
      // the test cannot drift out of step with FLIGHT_SECONDS.
      duration: f.duration,
      active: f.active,
      // Recorded by the camera itself, inside its own frame — see the comment
      // beside the DEV-only error readout in CameraController.
      error: f.error,
      // The ordering contract: what the camera carried itself by must be the
      // position the craft was drawn at, not the one before it.
      stale: window.__solar.lastFollow.distanceTo(p),
      distance: cam.position.distanceTo(p),
    } : null)
    if (++n < ${frames}) requestAnimationFrame(tick)
    else done(rows)
  }
  requestAnimationFrame(tick)
})`

const page = await openApp()

try {
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.layers.spacecraft) s.toggleLayer('spacecraft')
  })()`)
  await page.frames(60)

  for (const rate of RATES) {
    // Start each run from the Moon so the trip is the same length every time.
    await page.evaluate(`(() => {
      const s = window.__solar.state()
      if (!s.paused) s.togglePaused()
      s.selectPlanet('luna')
    })()`)
    await page.frames(150)

    const rows = (await page.evaluate(FLY(CRAFT, rate, 132))).filter(Boolean)

    /*
     * Progress per frame, measured as the error closed rather than as ground
     * covered in world space.
     *
     * The two are the same thing only when the clock is paused. Once it is
     * running the camera is also being carried along by the craft's own orbital
     * motion, and at thirty days a second that swamps the flight entirely — the
     * camera's world speed is then a fact about LRO's orbit, not about the
     * approach. The error term is expressed in the craft's moving frame, which
     * is where the flight actually happens.
     */
    const speeds = rows.slice(1).map((r, i) => Math.max(0, rows[i].error - r.error))
    const label = `at ${rate} day/s`

    /*
     * Active for the whole of the flight, measured in seconds rather than in
     * frames.
     *
     * This asserted that the first hundred frames were all active, which is the
     * same claim only while the browser holds a steady sixty. It does not
     * always — this is a real GPU under a real compositor — and a single hitch
     * pushed the hundredth frame past the 2.1-second flight and failed a run
     * that was entirely correct — once at 30 days a second, with the next two
     * runs of the same code clean. That is the worst kind of test: one that
     * fires occasionally and never for the reason it claims.
     *
     * The margin is 90% of the flight, so the last frames either side of arrival
     * are not being argued over.
     */
    const window9 = (rows[0]?.duration ?? 0) * 0.9
    const during = rows.filter((r) => r.at < window9)
    check(
      `${label}: a flight is running`,
      during.length > 10 && during.every((r) => r.active),
      `${during.filter((r) => !r.active).length} idle of ${during.length} frames in the first ${window9.toFixed(1)}s`,
    )

    const stale = Math.max(...rows.map((r) => r.stale))
    check(
      `${label}: the camera reads this frame's position`,
      stale === 0,
      `worst lag ${stale.toFixed(4)} world units`,
    )

    /*
     * Monotone, not merely smaller at the end. An exponential ease has no way to
     * increase its own error, so a single frame where it does is proof that
     * something outside the damping moved the camera — which is exactly the
     * failure, and it averages out of any before-and-after comparison.
     */
    let rises = 0
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].error > rows[i - 1].error * 1.001) rises++
    }
    check(`${label}: the error never grows`, rises === 0, `${rises} of ${rows.length - 1} frames`)

    /*
     * The shape of the motion, which is the thing that was actually wrong.
     *
     * Exponential damping passed every test above and still read as a cut: its
     * velocity is proportional to the gap left, so it is fastest on the first
     * frame and decays from there. Earth to Mars, in units travelled per fifth
     * of a second, it ran 27.86 13.86 6.77 3.32 … — over half the trip gone
     * before the eye registers it began.
     *
     * A flight accelerates, covers ground where the motion is legible, and
     * settles. So the test is where the peak falls, not how much got covered.
     */
    /*
     * Bucketed by the clock, not by frame index.
     *
     * These were twelve-frame slices called fifths of a second, which they are
     * only at a steady sixty. Under a hitch a twelve-frame slice covers more of
     * the ease than it is credited with, and the first one then holds a larger
     * share of the trip than the shape allows — which failed both checks below
     * on a run where the ease was perfectly correct. The claim is about how the
     * motion is distributed *in time*, so time is what it is measured against.
     */
    const SLICE_SECONDS = 0.2
    const duration = rows[0]?.duration ?? 0
    const slices = new Array(Math.ceil(duration / SLICE_SECONDS)).fill(0)
    for (let i = 0; i < speeds.length; i++) {
      // speeds[i] is the ground closed between rows[i] and rows[i + 1].
      const bucket = Math.floor(rows[i + 1].at / SLICE_SECONDS)
      if (bucket < slices.length) slices[bucket] += speeds[i]
    }
    const peak = slices.indexOf(Math.max(...slices))
    check(
      `${label}: it accelerates away rather than jumping`,
      peak >= 2,
      `fastest 0.2s slice is #${peak} of ${slices.length}`,
    )
    check(
      `${label}: the first moment is the slowest part`,
      slices[0] < Math.max(...slices) * 0.15,
      `${slices[0].toFixed(2)} vs peak ${Math.max(...slices).toFixed(2)}`,
    )
  }

  /* ---- the first frame after a real click ---- */

  /*
   * Driven by clicking the marker, not by calling the store.
   *
   * The distinction turned out to matter, which is why it is spelled out here.
   * Arming used to happen in a React effect — one frame after the store updated
   * — and in that single frame the loop fell through to the *follow*, which
   * carried the camera by the gap between the old body and the new one. Earth to
   * Mars, that was a 56.7 unit jump before the flight had started: the trip was
   * over on frame one and everything after it was decoration.
   *
   * A store call from outside React commits and runs effects on its own
   * schedule, so this never reproduced from `selectPlanet`. Only a real click
   * did.
   */
  for (const [from, to] of [
    ['earth', 'Mars'],
    ['jupiter', 'Earth'],
  ]) {
    await page.evaluate(`(() => {
      const s = window.__solar.state()
      if (!s.paused) s.togglePaused()
      s.selectPlanet(${JSON.stringify(from)})
    })()`)
    await page.frames(250)

    const first = await page.evaluate(`new Promise((done) => {
      const btn = [...document.querySelectorAll('.marker')]
        .find((b) => b.getAttribute('aria-label') === ${JSON.stringify(`Go to ${to}`)})
      if (!btn) return done(null)
      const cam = window.__solar.camera
      const before = cam.position.clone()
      btn.click()
      requestAnimationFrame(() => done({
        step: cam.position.distanceTo(before),
        active: window.__solar.flight.active,
      }))
    })`)

    check(`${from} → ${to}: a flight is armed on the click frame`, first?.active === true)
    check(
      `${from} → ${to}: the camera does not jump on the click frame`,
      first !== null && first.step < 1,
      `moved ${first ? first.step.toFixed(3) : '?'} world units`,
    )
  }

  /*
   * And it finishes: the camera ends parked, not merely heading that way.
   *
   * The selection is re-made here rather than inherited from whatever ran last.
   * An earlier version of this file leaned on the state the previous block
   * happened to leave behind, and adding a block above it silently changed the
   * subject — it compared the camera's distance to the spacecraft against a
   * *planet's* parking distance and reported a failure the app did not have.
   */
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.setTimeRate(1)
    if (s.paused) s.togglePaused()
    s.selectPlanet(${JSON.stringify(CRAFT)})
  })()`)
  await page.frames(240)
  const parked = await page.evaluate(`(() => {
    const p = window.__solar.positions.get(${JSON.stringify(CRAFT)})
    return {
      distance: window.__solar.camera.position.distanceTo(p),
      want: window.__solar.flight.distance,
      active: window.__solar.flight.active,
    }
  })()`)
  check(
    'the flight completes with the clock running',
    !parked.active && parked.distance < parked.want * 1.5,
    `parked at ${parked.distance.toFixed(5)}, wanted ${parked.want.toFixed(5)}`,
  )

  /* ---- selecting a mission that has not happened yet ---- */

  /*
   * A craft can be chosen from the nav on a date it does not exist.
   *
   * The Galileo Probe entered Jupiter in 1995 and the nav lists it whatever the
   * clock says, so picking it at today's date selects a body with no position at
   * all. The flight cannot be armed against nothing — but it has to be armed the
   * moment the craft appears, and it was not: the frame loop latched the
   * selection key whether or not `armFlight` had managed to arm anything, so the
   * one attempt it made was the one that could not work. Scrubbing back to 1995
   * then produced the craft with the camera still 264 units away, aimed at
   * wherever it had been.
   *
   * Both orders are checked, because the bug is only in one of them and a test
   * that flew the working order would have passed throughout.
   */
  const EPOCH = 2449950.5 // 1995-09-20
  const NOW = 2461256.5

  /*
   * Measured where it lands on *screen*, not how near the camera got.
   *
   * The first version of this asked for the camera-to-craft distance and read
   * 0.02 units in every case it was shown, including one a person looking at the
   * app called "not centering". Distance cannot tell centred from adjacent: a
   * camera parked right beside a craft while aimed somewhere else scores the
   * same 0.02 as one looking straight at it. Projecting to normalised device
   * coordinates asks the question the eye asks — is it in the middle — and
   * (0, 0) is the middle.
   *
   * Done off the matrices by hand because a page served by Vite cannot resolve a
   * bare `three` specifier of its own; see `verify-models.mjs`.
   */
  const onScreen = (id) => `(() => {
    const at = window.__solar.positions.get(${JSON.stringify(id)})
    if (!at) return null
    const cam = window.__solar.camera
    cam.updateMatrixWorld(); cam.updateProjectionMatrix()
    const m = cam.matrixWorldInverse.elements
    const vx = m[0]*at.x + m[4]*at.y + m[8]*at.z + m[12]
    const vy = m[1]*at.x + m[5]*at.y + m[9]*at.z + m[13]
    const vz = m[2]*at.x + m[6]*at.y + m[10]*at.z + m[14]
    const q = cam.projectionMatrix.elements
    const w = q[3]*vx + q[7]*vy + q[11]*vz + q[15]
    const x = (q[0]*vx + q[4]*vy + q[8]*vz + q[12]) / w
    const y = (q[1]*vx + q[5]*vy + q[9]*vz + q[13]) / w
    return { offCentre: Math.hypot(x, y), behind: vz > 0, jd: window.__solar.simClock.jd }
  })()`

  /*
   * Three routes to the same craft, because only one of them was broken and the
   * other two passed throughout.
   *
   * The one that matters is the last: the nav lists every craft whatever the
   * date, so picking the Galileo Probe in 2026 selects something that stopped
   * existing in 1995. That used to set the title and the dossier and move the
   * camera nowhere, since there was no object to move to — nothing broken,
   * nothing apparently happening. `selectPlanet` now carries the clock into the
   * mission first, so the check asserts the date moved as well as the camera.
   */
  for (const [label, order] of [
    ['scrubbing to the date first', ['date', 'select']],
    ['scrubbing after selecting', ['select', 'date']],
    ['selecting it at today’s date, with no scrub at all', ['select']],
  ]) {
    await page.evaluate(`(() => {
      window.__solar.state().clearSelection()
      window.__solar.setSimulationDate(${NOW})
    })()`)
    await page.frames(120)

    for (const step of order) {
      if (step === 'date') await page.evaluate(`window.__solar.setSimulationDate(${EPOCH})`)
      else await page.evaluate(`window.__solar.state().selectPlanet('sc_galileo_probe')`)
      await page.frames(30)
    }
    await page.frames(420)

    const seen = await page.evaluate(onScreen('sc_galileo_probe'))
    check(
      `the Galileo Probe ends up centred when ${label}`,
      seen !== null && !seen.behind && seen.offCentre < 0.05,
      seen === null
        ? 'craft has no position — the clock never reached the mission'
        : `${seen.offCentre.toFixed(3)} from centre, behind=${seen.behind}`,
    )
  }

  /*
   * A rover that is still working must not drag the clock anywhere.
   *
   * `carryClockToMission` used to ask `isFlying`, which reads the *trajectory
   * window* — an ephemeris extent, and for Perseverance one that JPL stops
   * propagating in February 2026 while the rover carries on driving. Clicking
   * it today therefore threw the clock back to the middle of that window, 2023,
   * which is a real date on a real mission and so looked like nothing was wrong
   * at all. Landed craft now carry their own mission dates.
   */
  for (const [id, label] of [
    ['sc_mars_2020', 'Perseverance'],
    ['sc_mars_science_laboratory', 'Curiosity'],
  ]) {
    await page.evaluate(`(() => {
      const s = window.__solar.state()
      s.clearSelection()
      s.setTimeRate(0)
      if (!s.paused) s.togglePaused()
      window.__solar.setSimulationDate(${NOW})
    })()`)
    await page.frames(60)
    await page.evaluate(`window.__solar.state().selectPlanet('${id}')`)
    await page.frames(120)

    const jd = await page.evaluate(`window.__solar.simClock.jd`)
    check(
      `selecting ${label} today leaves the clock alone`,
      Math.abs(jd - NOW) < 1e-6,
      `clock moved ${(jd - NOW).toFixed(1)} days, to JD ${jd.toFixed(2)}`,
    )
  }

  /*
   * And the cruise half is left alone, because a rover has two lives.
   *
   * A month out from Mars, Mars 2020 is a cruise stage on an ordinary
   * trajectory and the approach is the thing worth watching. An intermediate
   * version treated every landed craft as though only its surface mission
   * existed, and threw the clock forward from the approach to the middle of
   * the rover's years on the ground.
   */
  const CRUISE = LANDED_CRAFT.sc_mars_2020.landed - 30
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.clearSelection()
    s.setTimeRate(0)
    if (!s.paused) s.togglePaused()
    window.__solar.setSimulationDate(${CRUISE})
  })()`)
  await page.frames(60)
  await page.evaluate(`window.__solar.state().selectPlanet('sc_mars_2020')`)
  await page.frames(120)
  const cruiseJD = await page.evaluate(`window.__solar.simClock.jd`)
  check(
    'selecting Mars 2020 during cruise leaves the clock on the approach',
    Math.abs(cruiseJD - CRUISE) < 1e-6,
    `clock moved ${(cruiseJD - CRUISE).toFixed(1)} days, to JD ${cruiseJD.toFixed(2)}`,
  )

  /* And one that ended still carries — InSight fell silent in December 2022. */
  await page.evaluate(`(() => {
    window.__solar.state().clearSelection()
    window.__solar.setSimulationDate(${NOW})
  })()`)
  await page.frames(60)
  await page.evaluate(`window.__solar.state().selectPlanet('sc_insight')`)
  await page.frames(120)
  const insightJD = await page.evaluate(`window.__solar.simClock.jd`)
  check(
    'selecting InSight today carries the clock into its surface mission',
    insightJD > LANDED_CRAFT.sc_insight.landed && insightJD < LANDED_CRAFT.sc_insight.ended,
    `clock is at JD ${insightJD.toFixed(2)}`,
  )

  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.clearSelection()
    s.setTimeRate(1)
    if (s.paused) s.togglePaused()
    window.__solar.setSimulationDate(${NOW})
  })()`)
  await page.frames(60)

  const errors = page.errors.filter((e) => !e.startsWith('warning:'))
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await page.close()
}

console.log(failures === 0 ? '\nall flight checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
