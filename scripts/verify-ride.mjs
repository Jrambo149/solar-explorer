/**
 * Riding a spacecraft, rather than watching one.
 *
 * The difference between the two is one question: **which frame holds still?**
 * A follow keeps the craft centred while the world stays the right way up; a
 * ride keeps the craft the right way up, so when it turns to point an
 * instrument the stars and the planet wheel past the window. Nothing else about
 * the camera changes, which is exactly why this needs measuring — from a single
 * screenshot the two are indistinguishable, and the wrong one is the one that
 * looks normal.
 *
 * So every check here is about *relative* motion across frames:
 *
 *   - riding, the camera's offset from the craft turns with the craft
 *   - following, the same offset does not
 *   - riding, a fixed star moves across the view while the craft turns
 *   - and the craft itself stays put on screen either way
 *
 * The clock has to be running for any of it to mean anything: a craft at a
 * paused instant has no attitude *change*, so a ride and a follow are the same
 * picture and every check would pass on both.
 *
 * Run the dev server first: `npm run dev`.
 */

import * as THREE from 'three'
import { openApp } from './lib/browser.mjs'
import { frameFromVelocity } from '../src/scene/attitude.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * Watch a craft for `frames`, and report how much things turned.
 *
 * `offsetTurn` is the angle the camera's offset from the craft swept, summed
 * over the run; `attitudeTurn` is how far the craft itself turned in the same
 * time. Riding, the first should track the second. Following, the first should
 * be about zero however much the craft turns.
 *
 * `screenDrift` is where the craft sits in the frame, which must not move under
 * either mode — a ride that let the subject wander would be a bug in the
 * carry, not a feature.
 */
const WATCH = (id, frames) => `new Promise((done) => {
  const THREE = window.__solar.three
  const cam = window.__solar.camera
  const q = () => window.__solar.attitudes.get(${JSON.stringify(id)})
  const p = () => window.__solar.positions.get(${JSON.stringify(id)})

  let offsetTurn = 0
  let attitudeTurn = 0
  let maxStep = 0
  let n = 0
  const prevOffset = new THREE.Vector3().subVectors(cam.position, p()).normalize()
  const prevQ = q().clone()
  const screen = []
  const here = new THREE.Vector3()
  const offset = new THREE.Vector3()

  const tick = () => {
    const pos = p()
    const now = q()
    if (!pos || !now) { done(null); return }

    offset.subVectors(cam.position, pos).normalize()
    offsetTurn += Math.acos(Math.min(1, Math.max(-1, offset.dot(prevOffset)))) * 180 / Math.PI
    prevOffset.copy(offset)

    const step = prevQ.angleTo(now) * 180 / Math.PI
    attitudeTurn += step
    maxStep = Math.max(maxStep, step)
    prevQ.copy(now)

    here.copy(pos).project(cam)
    screen.push([here.x, here.y])

    if (++n < ${frames}) requestAnimationFrame(tick)
    else {
      const xs = screen.map((s) => s[0])
      const ys = screen.map((s) => s[1])
      done({
        offsetTurn: +offsetTurn.toFixed(2),
        attitudeTurn: +attitudeTurn.toFixed(2),
        maxStep: +maxStep.toFixed(2),
        screenDrift: +Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)).toFixed(3),
      })
    }
  }
  requestAnimationFrame(tick)
})`

/** Where a fixed direction in the sky lands on screen, in NDC. */
const STAR = `(() => {
  const THREE = window.__solar.three
  const cam = window.__solar.camera
  // An arbitrary fixed world direction, projected as a point far away. It
  // stands in for the whole sky: if this moves, the view has turned.
  const far = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(0)
  const fixed = new THREE.Vector3(1, 0.3, 0.2).normalize().multiplyScalar(1e6).add(far)
  const ndc = fixed.project(cam)
  return [ndc.x, ndc.y]
})()`

/* ---- the fallback frame, without a browser ---- */

console.log('\nA frame built from a heading\n')

/*
 * `makeBasis` will build a reflection as happily as a rotation, and
 * `setFromRotationMatrix` will read a quaternion off it without complaint — it
 * just picks a different branch on the trace from one frame to the next. The
 * symptom is not a wrong angle, it is a frame that alternates: Juno's read
 * exactly 120.00° of turn every frame, forever.
 *
 * Two checks, and the second is the one with teeth. A smooth sweep of the
 * heading must give a smooth sweep of the frame — that is the property a
 * reflection cannot fake.
 */
{
  const q = new THREE.Quaternion()
  frameFromVelocity(new THREE.Vector3(0, 0, -1), q)
  check(
    'flying along -Z with the world upright is no rotation at all',
    q.angleTo(new THREE.Quaternion()) < 1e-9,
    `${[q.x, q.y, q.z, q.w].map((v) => v.toFixed(3)).join(' ')}`,
  )

  let worst = 0
  let prev = null
  for (let a = 0; a < 360; a++) {
    const v = new THREE.Vector3(Math.cos((a * Math.PI) / 180), 0.2, Math.sin((a * Math.PI) / 180))
    const r = frameFromVelocity(v, new THREE.Quaternion())
    if (prev) worst = Math.max(worst, (prev.angleTo(r) * 180) / Math.PI)
    prev = r
  }
  check(
    'and a one-degree turn of the heading turns the frame by one degree',
    worst < 1.5,
    `worst step ${worst.toFixed(3)}°`,
  )
}

const page = await openApp()

try {
  /*
   * MRO, because it genuinely turns and the data says so: its rules point one
   * axis at Mars and roll the other along the velocity, and it goes round Mars
   * every 1.9 hours. At a day a second that is a full turn of attitude every
   * few seconds of wall clock — plenty to measure.
   *
   * Read from the roster rather than remembered. The first draft of this file
   * used Juno on the stated grounds that it "aims at the Sun and at Jupiter",
   * which the roster flatly contradicts — `align: null`, a fixed axis
   * correction and nothing else. Every check then measured zero and looked like
   * a broken ride rather than a badly chosen subject.
   */
  const CRAFT = 'sc_mars_reconnaissance_orbiter'

  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.layers.spacecraft) s.toggleLayer('spacecraft')
    if (s.paused) s.togglePaused()
    s.setTimeRate(1)
    s.revealAndSelect(${JSON.stringify(CRAFT)})
  })()`)
  await page.frames(300)

  check(
    'the craft publishes an attitude',
    (await page.evaluate(`!!window.__solar.attitudes.get(${JSON.stringify(CRAFT)})`)) === true,
  )

  /* ---- following: the world stays the right way up ---- */

  const followed = await page.evaluate(WATCH(CRAFT, 150))
  check(
    'following, the craft turns',
    followed && followed.attitudeTurn > 1,
    `attitude turned ${followed?.attitudeTurn}°`,
  )
  check(
    'and the camera does not turn with it',
    followed && followed.offsetTurn < followed.attitudeTurn * 0.1,
    `offset swept ${followed?.offsetTurn}° against ${followed?.attitudeTurn}°`,
  )

  /* ---- riding: the craft does ---- */

  const before = await page.evaluate(STAR)
  await page.evaluate(`window.__solar.state().toggleRide()`)
  await page.frames(10)
  check('the ride is on', (await page.evaluate(`window.__solar.state().rideAlong`)) === true)

  const ridden = await page.evaluate(WATCH(CRAFT, 150))
  check(
    'riding, the camera turns with the craft',
    ridden && ridden.offsetTurn > ridden.attitudeTurn * 0.75,
    `offset swept ${ridden?.offsetTurn}° against ${ridden?.attitudeTurn}°`,
  )

  const after = await page.evaluate(STAR)
  const skyMoved = Math.hypot(after[0] - before[0], after[1] - before[1])
  check(
    'and the sky wheels past the window',
    skyMoved > 0.02,
    `a fixed star moved ${skyMoved.toFixed(3)} of the frame`,
  )

  /*
   * The subject must not wander. This is the half a ride can silently break:
   * carrying the camera through the rotation without carrying the pivot swings
   * the craft out of shot, and the view still looks like a plausible ride.
   */
  /*
   * A frame that jitters would sail through the ratio check above — the camera
   * would follow the jitter faithfully — and be unwatchable. MRO turns fastest
   * of anything here, a full orbit of Mars every 1.9 hours, which at a day a
   * second is a bit over a degree a frame.
   */
  check(
    'the attitude turns smoothly rather than jumping',
    ridden && ridden.maxStep < 15,
    `worst step ${ridden?.maxStep}° in one frame`,
  )

  check(
    'the craft stays put on screen while riding',
    ridden && ridden.screenDrift < 0.25,
    `drifted ${ridden?.screenDrift} of the frame`,
  )

  /* ---- leaving ---- */

  await page.evaluate(`window.__solar.state().toggleRide()`)
  await page.frames(60)
  const off = await page.evaluate(WATCH(CRAFT, 120))
  check(
    'switching it off hands back to the follow',
    off && off.offsetTurn < off.attitudeTurn * 0.1,
    `offset swept ${off?.offsetTurn}° against ${off?.attitudeTurn}°`,
  )

  /* ---- a craft with no pointing rules still rides ---- */

  /*
   * Twelve of the fifty carry no `align` rule — Juno is one — and are drawn in
   * whatever attitude their modeller authored, which is a constant. Riding that
   * would be a camera that never turns. They fall back to a frame built from
   * the heading, which is the one thing that is known about them.
   */
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.revealAndSelect('sc_juno')
  })()`)
  await page.frames(300)
  check(
    'a craft with no pointing rules still has a frame',
    (await page.evaluate(`!!window.__solar.attitudes.get('sc_juno')`)) === true,
  )
  await page.evaluate(`window.__solar.state().toggleRide()`)
  await page.frames(30)
  const junoRide = await page.evaluate(WATCH('sc_juno', 150))
  check(
    'and riding it turns the camera',
    junoRide && junoRide.attitudeTurn > 0.5 && junoRide.offsetTurn > junoRide.attitudeTurn * 0.75,
    `offset swept ${junoRide?.offsetTurn}° against ${junoRide?.attitudeTurn}°`,
  )

  /* ---- the ride belongs to the craft ---- */

  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.toggleRide()
    s.revealAndSelect('mars')
  })()`)
  await page.frames(60)
  check(
    'selecting something else ends the ride',
    (await page.evaluate(`window.__solar.state().rideAlong`)) === false,
  )
  await page.evaluate(`window.__solar.state().toggleRide()`)
  check(
    'and a planet cannot be ridden',
    (await page.evaluate(`window.__solar.state().rideAlong`)) === false,
  )
} finally {
  await page.close()
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
