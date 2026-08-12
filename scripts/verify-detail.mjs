/**
 * The mesh arrives when you do, and not before.
 *
 * Switching the spacecraft layer on used to take the scene from 99 draw calls
 * to 3,069 and from 733,000 triangles to 3.2 million — 16.7 ms a frame to
 * 25.7, sixty fps to thirty-nine — because all fifty craft drew their full
 * models whatever their size on screen. These are Eyes' own meshes, with a
 * material per antenna and a texture per panel, so a probe two pixels across
 * cost about sixty draw calls to look exactly like the one-call octahedron
 * already drawn underneath it.
 *
 * `Spacecraft` now hides the mesh below a threshold. Both halves of that need
 * checking and only one of them is visible: a gate that hid the models *always*
 * would look identical from the overview, cost nothing, pass any frame-time
 * measurement, and leave the app unable to show a spacecraft at all.
 *
 * `verify-models` cannot catch it — it loads the glTF files directly and never
 * looks at the scene.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * Is the named object *actually* on screen?
 *
 * `object.visible` is not the answer: the flag being checked lives on a wrapper
 * group above the model, and three hides a whole subtree by hiding its root. So
 * the chain up to the scene has to be walked, which is what the renderer does.
 */
const VISIBLE = (name) => `(() => {
  let o = null
  window.__solar.scene.traverse((x) => { if (x.name === ${JSON.stringify(name)}) o = x })
  if (!o) return null
  for (let p = o; p; p = p.parent) if (!p.visible) return false
  return true
})()`

const STATS = `(() => {
  const info = window.__solar.gl.info
  return { calls: info.render.calls, triangles: info.render.triangles }
})()`

const page = await openApp()

try {
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.layers.spacecraft) s.toggleLayer('spacecraft')
  })()`)
  await page.frames(120)

  /* ---- from the overview, every craft is a marker ---- */

  const wide = await page.evaluate(STATS)
  check(
    'the whole fleet costs under 250 draw calls from the overview',
    wide.calls < 250,
    `${wide.calls} calls, ${wide.triangles} triangles`,
  )

  for (const id of ['sc_voyager_1', 'sc_juno', 'sc_parker_solar_probe']) {
    check(`${id} draws its marker`, (await page.evaluate(VISIBLE(`marker:${id}`))) === true)
    check(`${id} does not draw its mesh`, (await page.evaluate(VISIBLE(`spin:${id}`))) === false)
  }

  /*
   * A craft that has ended draws *neither*, and that is not this gate — the
   * whole group is withdrawn because Cassini was flown into Saturn in 2017 and
   * the app is at 2026. Asserted here because it is the obvious wrong reading
   * of a hidden marker, and it cost a false failure while writing this file.
   */
  check(
    'a mission that is over draws no marker either',
    (await page.evaluate(VISIBLE('marker:sc_cassini'))) === false,
  )

  /* ---- at a planet, its own craft are craft ---- */

  /*
   * The case the first threshold got wrong, and the reason there is a number in
   * this file at all.
   *
   * Eight pixels of radius was picked from intuition, and nothing anyone ever
   * looks at is that big: parked at Mars, all six orbiters and both rovers came
   * out as octahedra, so the planet with the most spacecraft around it of
   * anywhere in the app showed not one of them. The overview looked right, the
   * frame time looked right, and the feature was pointless.
   *
   * So the threshold is asserted where it bites — in a planet's own
   * neighbourhood — rather than only at the two extremes where any value passes.
   */
  await page.evaluate(`window.__solar.state().revealAndSelect('mars')`)
  await page.frames(320)

  for (const id of [
    'sc_mars_reconnaissance_orbiter',
    'sc_mars_odyssey',
    'sc_trace_gas_orbiter',
    'sc_mars_express',
    'sc_mars_science_laboratory',
  ]) {
    check(`parked at Mars, ${id} draws its mesh`, (await page.evaluate(VISIBLE(`spin:${id}`))) === true)
  }

  const atMars = await page.evaluate(STATS)
  check(
    'and Mars with its whole fleet still costs under 1200 calls',
    atMars.calls < 1200,
    `${atMars.calls} calls`,
  )

  await page.evaluate(`window.__solar.state().clearSelection()`)
  await page.frames(300)

  /* ---- arrive, and the mesh takes over ---- */

  const CRAFT = 'sc_voyager_1'
  await page.evaluate(`window.__solar.state().revealAndSelect(${JSON.stringify(CRAFT)})`)
  await page.frames(260)

  check('the mesh is drawn once you are there', (await page.evaluate(VISIBLE(`spin:${CRAFT}`))) === true)
  check('and the marker steps aside', (await page.evaluate(VISIBLE(`marker:${CRAFT}`))) === false)

  const near = await page.evaluate(STATS)
  check(
    'one mesh is a fraction of the fleet drawing all of them',
    near.calls < 400,
    `${near.calls} calls (the fleet in full was 3069)`,
  )

  /*
   * Parked and stable.
   *
   * The threshold has hysteresis because a craft you have just flown to sits
   * exactly at it, and the follow camera moves by fractions of a pixel every
   * frame. Without the gap the mesh would appear and vanish sixty times a
   * second, which is worse than either state on its own — and it is the kind of
   * thing that reads as a flicker in a screenshot-free test run.
   */
  const flaps = await page.evaluate(`new Promise((done) => {
    let last = null
    let changes = 0
    let n = 0
    const tick = () => {
      let o = null
      window.__solar.scene.traverse((x) => { if (x.name === 'spin:${CRAFT}') o = x })
      let v = !!o
      for (let p = o; p; p = p.parent) if (!p.visible) v = false
      if (last !== null && v !== last) changes++
      last = v
      if (++n < 180) requestAnimationFrame(tick)
      else done(changes)
    }
    requestAnimationFrame(tick)
  })`)
  check('it does not flicker while parked', flaps === 0, `${flaps} changes in 180 frames`)

  /* ---- leave, and it goes away again ---- */

  await page.evaluate(`window.__solar.state().clearSelection()`)
  await page.frames(260)
  check(
    'backing out puts the mesh away',
    (await page.evaluate(VISIBLE(`spin:${CRAFT}`))) === false,
  )
  check('and brings the marker back', (await page.evaluate(VISIBLE(`marker:${CRAFT}`))) === true)
} finally {
  await page.close()
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
