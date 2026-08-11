/**
 * Spacecraft orientation: the fixed axis correction, and the spin.
 *
 * Both are things you can only check on a running frame — one is a quaternion
 * applied to a loaded glTF scene, the other is integrated from the simulation
 * clock — so neither is reachable from the offline suite.
 *
 * The spin is checked as a *rate*, in degrees per frame, rather than by
 * comparing an orientation to an expected one. A rate is what the data actually
 * says (ARTEMIS: one turn every three seconds) and it is invariant to where the
 * craft happened to be pointing when the measurement started.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { SPACECRAFT_ATTITUDE } from '../src/data/spacecraftAttitude.js'
import { LANDED_CRAFT } from '../src/data/landedCraft.js'

/** ARTEMIS P1: Eyes gives Y axis, 8333e-7 hours — 3.0 s, the real THEMIS rate. */
const SPINNER = 'sc_themis_b'
const SPIN_SECONDS = SPACECRAFT_ATTITUDE[SPINNER].spin.periodDays * 86400

/** Drawn craft that carry one of Eyes' 40 axis corrections, and one that does not. */
const CORRECTED = ['sc_voyager_1', 'sc_pioneer_10', 'sc_lucy', 'sc_psyche']
const UNCORRECTED = 'sc_themis_b'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/** Degrees turned per frame by a craft's spin group, over `frames` frames. */
/**
 * The spin's own step, in degrees, for each of `frames` frames.
 *
 * Read from `userData.spinStep` rather than differenced off the group's
 * quaternion. The group carries `aim * spin` — pointing composed with rotation —
 * so differencing it measures the two together, and at a fast clock the
 * pointing of a craft in a one-day orbit contributes a real fraction of a degree
 * per frame on top of the cap. That is why an exact bound on the 20° clamp
 * failed at 20.01°: the extra hundredth was the craft turning to face the Sun.
 */
/**
 * Per-frame spin steps in degrees, and the wall-clock time they took.
 *
 * The elapsed time is not decoration. Turning degrees-per-frame into a period
 * needs a frame rate, and this file used to assume sixty — which is a fact about
 * a machine that is not busy, not a fact about the app. Growing the element
 * tables was enough to drop the headless browser to about thirty, and the spin
 * check reported a three-second turn as a 1.50-second one while the spin itself
 * had not changed at all.
 *
 * `performance.now` is the only thing here that knows how long a second is.
 */
const SPIN_RATE = (id, frames) => `new Promise((done) => {
  const g = window.__solar.scene.getObjectByName(${JSON.stringify(`spin:${id}`)})
  if (!g) return done(null)
  const out = []
  let n = 0
  const started = performance.now()
  const tick = () => {
    const step = g.userData.spinStep
    if (step !== undefined) out.push(Math.abs(step) * 180 / Math.PI)
    if (++n < ${frames}) requestAnimationFrame(tick)
    else done({ steps: out, seconds: (performance.now() - started) / 1000 })
  }
  requestAnimationFrame(tick)
})`

const setRate = (page, rate) =>
  page.evaluate(`(() => {
    const s = window.__solar.state()
    s.setTimeRate(${rate})
    if (${rate} !== 0 && s.paused) s.togglePaused()
    if (${rate} === 0 && !s.paused) s.togglePaused()
  })()`)

const page = await openApp()

try {
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.layers.spacecraft) s.toggleLayer('spacecraft')
  })()`)
  await page.frames(60)
  await page.evaluate(`window.__solar.state().selectPlanet(${JSON.stringify(SPINNER)})`)
  await page.frames(260)

  /* ---- the spin ---- */

  /*
   * Settled before measuring, which is the point of the 60 frames.
   *
   * At 30 this failed about one run in three, reporting a few microdegrees a
   * frame. That is not float noise in the quaternion: measured over 600 settled
   * frames the sum of the per-frame steps is exactly zero, and so is the net
   * rotation. It is a transient in the frames immediately after the rate change,
   * before the craft's position has stopped being rewritten.
   *
   * The tolerance is there as well, because a test that asserts exact equality
   * on a float will eventually fail for a reason nobody can reproduce. A
   * thousandth of a degree a frame is still two thousand times below the two
   * degrees a frame this is trying to detect.
   */
  await setRate(page, 0)
  await page.frames(60)
  const stillRun = await page.evaluate(SPIN_RATE(SPINNER, 8))
  const still = stillRun?.steps ?? null
  check('the spin group exists', still !== null)
  check(
    'a paused clock does not spin the craft',
    still && still.length > 3 && still.every((d) => d < 1e-3),
    still && `worst ${Math.max(...(still ?? [0])).toExponential(1)}°/frame`,
  )

  /*
   * Real time, where the spin is drawn exactly.
   *
   * One simulated second per wall second, so a three-second turn should be a
   * three-second turn. Frames are not perfectly even, so the period comes from
   * the total angle turned over the measured elapsed time — degrees per
   * *second*, which is what the claim is about. Dividing by an assumed frame
   * rate measured the machine instead.
   */
  await setRate(page, 1 / 86400)
  await page.frames(30)
  const live = await page.evaluate(SPIN_RATE(SPINNER, 40))
  const turned = live.steps.reduce((a, b) => a + b, 0)
  const period = (360 * live.seconds) / turned
  const fps = live.steps.length / live.seconds
  check(
    `it turns once every ${SPIN_SECONDS.toFixed(1)}s at real time`,
    Math.abs(period - SPIN_SECONDS) < SPIN_SECONDS * 0.15,
    `measured ${period.toFixed(2)}s over ${live.seconds.toFixed(2)}s at ${fps.toFixed(0)} fps`,
  )

  /*
   * And the cap, which is the deliberate lie.
   *
   * At a day a second the true rate is 480 revolutions between frames, where
   * every drawn orientation is an arbitrary draw and the craft reads as a broken
   * model jittering rather than as something spinning. See
   * `SPIN_MAX_DEG_PER_FRAME`.
   */
  await setRate(page, 1)
  await page.frames(30)
  const fast = (await page.evaluate(SPIN_RATE(SPINNER, 10))).steps
  check(
    'a fast clock clamps the spin instead of aliasing it',
    fast.length > 3 && fast.every((d) => d <= 20 + 1e-9),
    `${Math.max(...fast).toFixed(2)}°/frame`,
  )
  check(
    'and it is still visibly spinning',
    fast.length > 3 && fast.every((d) => d > 1),
    `${Math.min(...fast).toFixed(2)}°/frame`,
  )

  /* ---- the axis correction ---- */

  await setRate(page, 0)
  const identity = (q) =>
    Math.abs(q[0]) < 1e-6 && Math.abs(q[1]) < 1e-6 && Math.abs(q[2]) < 1e-6 &&
    Math.abs(Math.abs(q[3]) - 1) < 1e-6

  const readAxes = (id) => page.evaluate(`(() => {
    const g = window.__solar.scene.getObjectByName(${JSON.stringify(`axes:${id}`)})
    if (!g) return null
    return [g.quaternion.x, g.quaternion.y, g.quaternion.z, g.quaternion.w]
  })()`)

  for (const id of CORRECTED) {
    const q = await readAxes(id)
    /*
     * Non-identity is the whole assertion, and it is worth being clear that it
     * is a weak one: it proves Eyes' correction is being applied, not that the
     * craft looks right. `rotate` was scraped into the roster and read by
     * nothing for as long as spacecraft have been drawn, so the failure this
     * guards against is silence, not a wrong angle.
     */
    check(`${id} has its axis correction applied`, q !== null && !identity(q),
      q ? `[${q.map((v) => v.toFixed(3)).join(', ')}]` : 'no axes group')
  }

  const plain = await readAxes(UNCORRECTED)
  check(
    `${UNCORRECTED} has no correction and is left alone`,
    plain !== null && identity(plain),
    plain ? `[${plain.map((v) => v.toFixed(3)).join(', ')}]` : 'no axes group',
  )

  // The correction is fixed. If the spin ever leaked into it, the model would
  // drift away from its authored attitude and never come back.
  const before = await readAxes(CORRECTED[0])
  await setRate(page, 1)
  await page.frames(120)
  const after = await readAxes(CORRECTED[0])
  check(
    'the correction does not drift while the clock runs',
    before.every((v, i) => Math.abs(v - after[i]) < 1e-9),
  )

  /* ---- pointing ---- */

  /*
   * The aimed axis, taken all the way through the chain.
   *
   * `axes` carries the correction and `spin` carries the solved attitude, and
   * the axis has to pass through both in that order — which is the one thing
   * about this that is easy to get backwards, and getting it backwards produces
   * an orientation that is plausible and wrong for exactly the forty craft that
   * have a correction.
   */
  const AIM_ERROR = `(id, axis, target) => {
    const g = window.__solar.scene.getObjectByName('spin:' + id)
    if (!g) return 'no model'
    const craft = window.__solar.positions.get(id)
    const tgt = target === 'sun' ? { x: 0, y: 0, z: 0 } : window.__solar.positions.get(target)
    if (!craft || !tgt) return 'no position for ' + target
    const rot = (v, q) => {
      const ix = q.w * v.x + q.y * v.z - q.z * v.y
      const iy = q.w * v.y + q.z * v.x - q.x * v.z
      const iz = q.w * v.z + q.x * v.y - q.y * v.x
      const iw = -q.x * v.x - q.y * v.y - q.z * v.z
      return {
        x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
        y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
        z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
      }
    }
    let v = rot({ x: axis[0], y: axis[1], z: axis[2] }, g.children[0].quaternion)
    v = rot(v, g.quaternion)
    const d = { x: tgt.x - craft.x, y: tgt.y - craft.y, z: tgt.z - craft.z }
    const lv = Math.hypot(v.x, v.y, v.z)
    const ld = Math.hypot(d.x, d.y, d.z)
    const cos = (v.x * d.x + v.y * d.y + v.z * d.z) / (lv * ld)
    return Math.acos(Math.min(1, Math.max(-1, cos))) * 180 / Math.PI
  }`

  await setRate(page, 0)

  /*
   * Every drawn craft whose primary aims at a body, checked against that body.
   *
   * Landed craft are excluded, and the exclusion is the claim rather than an
   * exemption from it. Eyes' pointing rules describe a craft in flight, and for
   * these five they describe the *cruise stage* that delivered it — InSight's
   * entry aims an axis at Mars, which is a sensible thing for a lander to do on
   * approach and a meaningless one once it is standing on the ground. A rover's
   * only orientation is upright, from `surfaceUpright`, so `Spacecraft` drops
   * the attitude for them and this measured 158° off.
   */
  const POINTERS = Object.entries(SPACECRAFT_ATTITUDE)
    .filter(([id, a]) => a.align?.primary?.type === 'point' && !LANDED_CRAFT[id])
    .map(([id, a]) => [id, a.align.primary.axis, a.align.primary.target])

  for (const [id, axis, target] of POINTERS) {
    const drawn = await page.evaluate(`!!window.__solar.positions.get(${JSON.stringify(id)})`)
    if (!drawn) continue

    await page.evaluate(`window.__solar.state().selectPlanet(${JSON.stringify(id)})`)
    await page.frames(200)
    const off = await page.evaluate(
      `(${AIM_ERROR})(${JSON.stringify(id)}, ${JSON.stringify(axis)}, ${JSON.stringify(target)})`,
    )
    check(
      `${id} aims at ${target}`,
      typeof off === 'number' && off < 0.5,
      typeof off === 'number' ? `${off.toFixed(3)}° off` : off,
    )
  }

  /*
   * LRO, which is the only drawn craft that aims along its own velocity and the
   * only one with a secondary that has real work to do.
   *
   * Its secondary is what caught the bug this test exists for: Eyes names Earth's
   * moon `moon` and this app's registry calls it `luna`, so the lookup returned
   * undefined, `resolve` returned null, and the roll was simply never applied —
   * silently, leaving the craft 57° off the nadir it should be staring at. The
   * primary was perfect the whole time, which is what made it invisible.
   */
  const LRO = 'sc_lunar_reconnaissance_orbiter'
  await page.evaluate(`window.__solar.state().selectPlanet(${JSON.stringify(LRO)})`)
  await page.frames(200)
  const nadir = await page.evaluate(
    `(${AIM_ERROR})(${JSON.stringify(LRO)}, [0, 0, 1], 'luna')`,
  )
  check(
    'LRO holds its secondary axis on the Moon',
    typeof nadir === 'number' && nadir < 1,
    typeof nadir === 'number' ? `${nadir.toFixed(3)}° off nadir` : nadir,
  )

  const errors = page.errors.filter((e) => !e.startsWith('warning:'))
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await page.close()
}

console.log(failures === 0 ? '\nall attitude checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
