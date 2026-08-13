/**
 * Named places, and whether they are in the right places.
 *
 * A label on a globe is the most convincing wrong answer in this app: it is
 * text, it is on a plausible patch of grey, and nobody can tell Mare Imbrium
 * from Mare Serenitatis by eye. So none of these checks look at whether a label
 * appeared. They ask where it is.
 *
 * The sharpest of them uses a fact about the Moon rather than about the code:
 * **the near side faces the Earth**, always, because the Moon is tidally
 * locked. Every mare anyone can name is on that side. So if the longitude
 * convention were flipped — the single likeliest mistake, and one that leaves
 * every label sitting neatly on a crater — Imbrium and Tranquillitatis would be
 * round the back, and this would say so.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { SURFACE_FEATURES, FEATURES_BY_BODY } from '../src/data/surfaceFeatures.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const find = (name) => SURFACE_FEATURES.find((f) => f.name === name)

console.log('\nThe register, as baked\n')

/*
 * Coordinates read straight out of the IAU's own KML for these four. Not from
 * memory — checking that way is how the last of these went wrong: Caloris
 * Planitia is at 161.98°E in the register and I was sure it was 189.8°E, which
 * would have had me "fixing" correct data.
 */
const KNOWN = [
  ['Tycho', 'luna', -43.2958, 348.7847, 85.3],
  ['Copernicus', 'luna', 9.6209, 339.9214, 96.1],
  ['Olympus Mons', 'mars', 18.6528, 226.1975, 610.1],
  ['Caloris Planitia', 'mercury', 31.6525, 161.9848, 1500],
]

for (const [name, body, lat, lon, km] of KNOWN) {
  const f = find(name)
  const ok =
    f && f.body === body && Math.abs(f.lat - lat) < 0.01 && Math.abs(f.lon - lon) < 0.01 && Math.abs(f.km - km) < 1
  check(`${name} is where the IAU puts it`, ok, f ? `${f.lat}, ${f.lon}, ${f.km} km` : 'missing')
}

check(
  'every longitude is east, 0 to 360',
  SURFACE_FEATURES.every((f) => f.lon >= 0 && f.lon <= 360),
)
check(
  'every latitude is a latitude',
  SURFACE_FEATURES.every((f) => f.lat >= -90 && f.lat <= 90),
)
/*
 * Some have no size, and that is the register's answer rather than a gap in
 * the parsing: mostly linear features and the small moons, where no extent has
 * been published. They are kept — dropping them cost Triton, Proteus, Janus and
 * Puck every name they have — and the drawing shows them by the *body's* size
 * instead. What must not happen is a negative or a NaN.
 */
const unsized = SURFACE_FEATURES.filter((f) => !(f.km > 0))
check(
  'every size is a size',
  SURFACE_FEATURES.every((f) => Number.isFinite(f.km) && f.km >= 0),
)
check(
  'and the unsized ones are the small moons and the linear features',
  unsized.length > 0 && unsized.length < SURFACE_FEATURES.length * 0.06,
  `${unsized.length} of ${SURFACE_FEATURES.length}`,
)

// Each body's list is largest-first, which is what the drawing relies on to
// take "the biggest few that pass" by simply slicing.
const unsorted = Object.entries(FEATURES_BY_BODY).filter(([, list]) =>
  list.some((f, i) => i > 0 && list[i - 1].km < f.km),
)
check('each body is in size order', unsorted.length === 0, unsorted.map(([b]) => b).join(', '))

console.log('\nOn the globe\n')

const page = await openApp()

try {
  await page.evaluate(`window.__solar.state().revealAndSelect('luna')`)
  await page.frames(320)

  /*
   * Stand where the Earth is, so "the visible face" is the near side.
   *
   * The flight parks wherever it approached from, which on the first run here
   * was 141° round the back — and the far-side names it duly showed were
   * correct for that camera. Asserting against them without saying where the
   * camera is tests nothing.
   */
  await page.evaluate(`(() => {
    const THREE = window.__solar.three
    const moon = window.__solar.positions.get('luna')
    const earth = window.__solar.positions.get('earth')
    const cam = window.__solar.camera
    const controls = window.__solar.controls
    const toEarth = new THREE.Vector3().subVectors(earth, moon).normalize()
    // The distance first: copying the Moon's position into the camera and then
    // asking how far the camera is from the Moon answers zero, which parks it
    // in the middle of the Moon and labels nothing at all.
    const range = cam.position.distanceTo(moon)
    cam.position.copy(moon).addScaledVector(toEarth, range)
    controls.target.copy(moon)
    controls.update()
  })()`)
  await page.frames(40)

  const shown = await page.evaluate(
    `[...document.querySelectorAll('.feature:not(.feature--site)')].map((n) => n.querySelector('.feature__name').firstChild.textContent)`,
  )
  check('the Moon carries labels', shown.length > 6, `${shown.length} of them`)

  /*
   * The near side faces the Earth. Measured as the angle between the feature's
   * outward normal and the direction to the Earth — under 90° means you could
   * see it from here, which for a mare is a fact about the solar system rather
   * than about this app.
   */
  const facing = await page.evaluate(`(() => {
    const THREE = window.__solar.three
    const moon = window.__solar.positions.get('luna')
    const earth = window.__solar.positions.get('earth')
    const toEarth = new THREE.Vector3().subVectors(earth, moon).normalize()
    const out = []
    for (const node of document.querySelectorAll('.feature:not(.feature--site)')) {
      out.push(node.querySelector('.feature__name').firstChild.textContent)
    }
    return { names: out, toEarth: [toEarth.x, toEarth.y, toEarth.z] }
  })()`)

  /*
   * Rather than trust the DOM, ask the app where it *would* put a given
   * feature, through the same transform the rovers use — `surfaceOffset`. If
   * these two agree, a feature sits exactly where a lander at the same
   * coordinates would, and the rover placement is already calibrated against
   * the textures.
   */
  const angles = await page.evaluate(`(() => {
    const THREE = window.__solar.three
    /*
     * The app's own module instance, through the dev handle. A dynamic
     * \`import()\` here returns a *second* copy under Vite, whose spin registry
     * is empty — every angle then comes out of a placement done at spin zero,
     * which is how a working transform first read as broken.
     */
    const surface = window.__solar.surface
    const moon = window.__solar.positions.get('luna')
    const earth = window.__solar.positions.get('earth')
    const radius = 1
    const spin = surface.surfaceSpin('luna')
    const basis = surface.bodyBasis('luna')
    const toEarth = new THREE.Vector3().subVectors(earth, moon).normalize()

    const test = (lat, lon) => {
      const o = surface.surfaceOffset(lat, lon, basis, spin, radius, { x: 0, y: 0, z: 0 })
      const n = new THREE.Vector3(o.x, o.y, o.z).normalize()
      return THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, n.dot(toEarth)))))
    }

    return {
      // Near side, all of them famous from Earth.
      imbrium: test(34.72, 345.09),
      tranquillitatis: test(8.35, 30.84),
      crisium: test(17.0, 59.1),
      tycho: test(-43.2958, 348.7847),
      // Far side: never visible from Earth, and the name is the giveaway —
      // Moscoviense was found by Luna 3 in 1959.
      moscoviense: test(27.3, 147.9),
      tsiolkovskiy: test(-20.4, 129.1),
    }
  })()`)

  check(
    'Mare Imbrium faces the Earth',
    angles.imbrium < 60,
    `${angles.imbrium.toFixed(0)}° off the Earth direction`,
  )
  check('Mare Tranquillitatis faces the Earth', angles.tranquillitatis < 60, `${angles.tranquillitatis.toFixed(0)}°`)
  check('Mare Crisium faces the Earth', angles.crisium < 75, `${angles.crisium.toFixed(0)}°`)
  check('Tycho faces the Earth', angles.tycho < 60, `${angles.tycho.toFixed(0)}°`)
  check(
    'Mare Moscoviense faces away, as a far-side sea must',
    angles.moscoviense > 105,
    `${angles.moscoviense.toFixed(0)}°`,
  )
  check('and so does Tsiolkovskiy', angles.tsiolkovskiy > 105, `${angles.tsiolkovskiy.toFixed(0)}°`)

  /*
   * And the labels on screen are only ever the ones facing you — the far side
   * has plenty of large features, and DOM floats over the globe, so nothing but
   * this test keeps them off the front.
   */
  const farSide = ['Mare Moscoviense', 'Tsiolkovskiy', 'Apollo', 'Hertzsprung', 'Korolev', 'Poincare']
  const leaked = shown.filter((n) => farSide.includes(n))
  check('no far-side feature is labelled from the Earth', leaked.length === 0, leaked.join(', '))

  // And the near side is what you do get: the seas anyone can point to.
  const nearSide = ['Mare Imbrium', 'Mare Serenitatis', 'Mare Tranquillitatis', 'Oceanus Procellarum', 'Mare Crisium']
  check(
    'the seas you can see from Earth are the ones named',
    nearSide.some((n) => shown.includes(n)),
    shown.join(', '),
  )

  /*
   * And the names do not take the planet away from you.
   *
   * The overlay is a full-viewport div sitting over the canvas, so if it ever
   * takes pointer events it eats every drag — and it did: `.feature-layer`
   * ties with `.ui-layer > *` in global.css at (0,1,0) and lost on source
   * order, so it inherited `pointer-events: auto`. Nothing showed it, because
   * the layer is empty until you are close enough to a body for its features
   * to appear. The complaint was "when I click on Mars it won't let me drag
   * the camera".
   *
   * Two checks and both are needed. What the browser says is under the pointer
   * is the cause; whether a real drag turns the camera is the symptom, and a
   * synthetic pointer event would answer neither.
   */
  const centre = await page.evaluate(`(() => {
    const r = document.querySelector('canvas').getBoundingClientRect()
    return [r.left + r.width / 2, r.top + r.height / 2]
  })()`)
  check(
    'the pointer reaches the canvas, not the label layer',
    (await page.evaluate(
      `document.elementFromPoint(${centre[0]}, ${centre[1]})?.tagName`,
    )) === 'CANVAS',
  )

  const eye = () =>
    page.evaluate(`(() => { const p = window.__solar.camera.position; return [p.x, p.y, p.z] })()`)
  const from = await eye()
  await page.drag(centre[0] - 60, centre[1], centre[0] + 70, centre[1] + 20)
  await page.frames(20)
  const to = await eye()
  const moved = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  check('and a drag over the labelled globe still turns the camera', moved > 1e-3, moved.toExponential(1))

  /* A body with no register entry draws nothing. */
  await page.evaluate(`window.__solar.state().revealAndSelect('jupiter')`)
  await page.frames(200)
  check(
    'Jupiter, which has no named surface, carries none',
    (await page.evaluate(`document.querySelectorAll('.feature:not(.feature--site)').length`)) === 0,
  )

  /* And the switch turns them off. */
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.revealAndSelect('luna')
  })()`)
  await page.frames(260)
  const before = await page.evaluate(`document.querySelectorAll('.feature:not(.feature--site)').length`)
  await page.evaluate(`window.__solar.state().toggleLayer('features')`)
  await page.frames(60)
  const after = await page.evaluate(`document.querySelectorAll('.feature:not(.feature--site)').length`)
  check('the layer switch puts them away', before > 0 && after === 0, `${before} → ${after}`)
} finally {
  await page.close()
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
