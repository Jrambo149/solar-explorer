/**
 * Checks that the split view's framing never crops a body.
 *
 * The dossier's first screen slides the shot right and sizes the body to fit
 * beside a column of text. Whether that actually *fits* is geometry, and it
 * depends on the window's shape as well as the body — so it is checked here at
 * every plausible window rather than by dragging a browser about. The bug this
 * exists to catch was found this way: framing computed from the viewport height
 * alone looks perfect at 16:9 and runs Saturn's rings 22% past the right edge
 * of a tall narrow window.
 *
 *   node scripts/verify-framing.mjs
 */
import * as THREE from 'three'
import { BODIES, bodyRadius } from '../src/data/bodies.js'
import {
  RINGED_FRAME_FRACTION,
  SHOT_THETA,
  SIDE_SHIFT,
  SPLIT_FRAME_FRACTION,
  framingDirection,
  splitFramingDistance,
} from '../src/scene/splitFraming.js'

/* `RING_PRESETS` lives in Rings.jsx, which Node cannot load. Mirrored here on
   purpose rather than worked around: if someone widens Saturn's rings without
   re-checking the framing, this file disagreeing with that one is exactly the
   signal wanted, and the last check below is what reports it. */
const RING_OUTER = { saturn: 2.35, uranus: 2.12 }

const FOV = 55

/**
 * Window shapes to test.
 *
 * Only above 900px wide: below that `useScrollChrome` skips the offset entirely
 * and the dossier stacks, so there is no split view to crop anything.
 */
const SHAPES = [
  [901, 1180], // narrow and tall — the tightest case, and the one that failed
  [1024, 768],
  [1280, 720],
  [1440, 900],
  [1512, 982], // 14" MacBook Pro
  [1920, 1080],
  [1920, 1200],
  [2560, 1080], // ultrawide
  [3440, 1440],
]

let failures = 0
const check = (label, pass, detail) => {
  if (!pass) failures++
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${detail}`)
}

/**
 * Where the body's silhouette lands, in percentages of the viewport.
 *
 * The silhouette of a sphere is its tangent circle, not its equator — slightly
 * larger than 2R, and the difference matters at these distances. Rings are
 * measured at their worst case, seen face-on.
 */
function frame(body, scaleMode, width, height) {
  const radius = bodyRadius(body, scaleMode)
  const ringOuter = body.rings ? (RING_OUTER[body.rings] ?? 1) : 1
  const aspect = width / height
  const d = splitFramingDistance({ radius, ringOuter, fovDegrees: FOV, aspect })

  const tanHalfFov = Math.tan((FOV * Math.PI) / 180 / 2)
  const halfH = d * tanHalfFov
  const halfW = halfH * aspect

  const angRadius = Math.asin(Math.min(1, radius / d))
  const silhouette = (Math.tan(angRadius) * d) / Math.cos(angRadius)
  const widest = Math.max(silhouette, radius * ringOuter)

  const centreX = 0.5 + SIDE_SHIFT
  return {
    radii: d / radius,
    // `silhouette` and `halfH` are both half-measures, so their ratio is
    // already the fraction of the full height the disc covers.
    globeHeightPct: (silhouette / halfH) * 100,
    rightEdgePct: (centreX + widest / (2 * halfW)) * 100,
    leftEdgePct: (centreX - widest / (2 * halfW)) * 100,
    topPct: (0.5 - silhouette / (2 * halfH)) * 100,
  }
}

console.log('\nSplit-view framing\n')

/* ---- 1. nothing is cropped, in any window, at either end of the scale ---- */

let worstRight = { pct: -Infinity }
let worstTop = { pct: Infinity }

for (const scaleMode of [0, 1]) {
  for (const [w, h] of SHAPES) {
    for (const body of BODIES) {
      const f = frame(body, scaleMode, w, h)
      if (f.rightEdgePct > worstRight.pct) {
        worstRight = { pct: f.rightEdgePct, body: body.name, w, h, scaleMode }
      }
      if (f.topPct < worstTop.pct) {
        worstTop = { pct: f.topPct, body: body.name, w, h, scaleMode }
      }
    }
  }
}

check(
  'nothing runs past the right edge',
  worstRight.pct < 100,
  `worst ${worstRight.pct.toFixed(1)}% — ${worstRight.body} at ${worstRight.w}x${worstRight.h}`,
)
check(
  'nothing is cut off at the top',
  worstTop.pct > 0,
  `worst ${worstTop.pct.toFixed(1)}% — ${worstTop.body} at ${worstTop.w}x${worstTop.h}`,
)

/* ---- 2. the size is the body's, not the user's last zoom ---- */

const sizes = BODIES.filter((b) => !b.rings).map((b) => frame(b, 0, 1440, 900).globeHeightPct)
const spread = Math.max(...sizes) - Math.min(...sizes)
check(
  'every ringless body frames to one size',
  spread < 0.01,
  `${sizes[0].toFixed(1)}% of frame height, spread ${spread.toFixed(4)}`,
)

const earth = frame(BODIES.find((b) => b.id === 'earth'), 0, 1440, 900)
const phobos = frame(BODIES.find((b) => b.id === 'phobos'), 0, 1440, 900)
check(
  'Phobos frames the same as Jupiter',
  Math.abs(earth.globeHeightPct - phobos.globeHeightPct) < 0.01,
  `${phobos.globeHeightPct.toFixed(1)}% vs ${earth.globeHeightPct.toFixed(1)}%`,
)

/* Independent of scale: the whole point of `bodyRadius(body, scaleMode)` is
   that the framing follows whatever the scene is currently using. */
const diorama = frame(BODIES.find((b) => b.id === 'earth'), 0, 1440, 900)
const trueScale = frame(BODIES.find((b) => b.id === 'earth'), 1, 1440, 900)
check(
  'framing is identical at diorama and true scale',
  Math.abs(diorama.globeHeightPct - trueScale.globeHeightPct) < 0.01,
  `${diorama.globeHeightPct.toFixed(1)}% at both`,
)

/* ---- 3. a ringed planet is still recognisably a planet ---- */

const saturn = frame(BODIES.find((b) => b.id === 'saturn'), 0, 1440, 900)
check(
  'Saturn keeps a usable globe once its rings fit',
  saturn.globeHeightPct > 25,
  `globe ${saturn.globeHeightPct.toFixed(1)}%, rings end at ${saturn.rightEdgePct.toFixed(1)}%`,
)

/* ---- 4. the constants still mean what they say ---- */

const ringless = frame(BODIES.find((b) => b.id === 'mercury'), 0, 1920, 1080)
check(
  'a ringless globe fills SPLIT_FRAME_FRACTION of the height',
  Math.abs(ringless.globeHeightPct / 100 - SPLIT_FRAME_FRACTION) < 0.06,
  `${(ringless.globeHeightPct / 100).toFixed(3)} vs ${SPLIT_FRAME_FRACTION} (silhouette > 2R)`,
)

check(
  'ringed bodies are allowed a wider frame than globes',
  RINGED_FRAME_FRACTION > SPLIT_FRAME_FRACTION,
  `${RINGED_FRAME_FRACTION} > ${SPLIT_FRAME_FRACTION}`,
)

/* ---- 5. the shot looks at the lit face, from slightly above ---- */

/*
 * The property that matters is not the angle itself but what it means: the
 * camera has to be on the *sunward* side. Get a sign wrong here and the
 * portrait is a silhouette — technically framed, entirely black.
 *
 * Checked from viewpoints all over the sphere, because `framingDirection` takes
 * the user's current approach as an input and only the azimuth is meant to
 * survive it.
 */
const approaches = []
for (let i = 0; i < 60; i++) {
  // Deterministic spiral over the sphere, so a failure is reproducible.
  const y = 1 - (2 * (i + 0.5)) / 60
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const phi = i * 2.399963
  approaches.push(new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r).normalize())
}

const out = new THREE.Vector3()
const sun = new THREE.Vector3()
let worstLit = 1
let worstTiltBody = null
let minTilt = Infinity
let unit = true

for (const body of BODIES) {
  // A spread of world positions, standing in for wherever the body is on its
  // orbit — the Sun is at the origin, so the position *is* the lighting.
  for (const pos of [
    new THREE.Vector3(9, 0, 0),
    new THREE.Vector3(-14, 0, 6),
    new THREE.Vector3(0, 0, -22),
    new THREE.Vector3(5, 2, 5),
  ]) {
    sun.copy(pos).negate().normalize()
    for (const approach of approaches) {
      framingDirection(pos, approach, out)
      if (Math.abs(out.length() - 1) > 1e-6) unit = false

      // cos of the angle between the viewpoint and the light.
      const lit = out.dot(sun)
      if (lit < worstLit) worstLit = lit

      // Height of the viewpoint above the plane through the body perpendicular
      // to nothing in particular — what matters is that it is above the
      // sun-line plane, i.e. some north pole is showing.
      const tilt = out.y - sun.y * out.dot(sun)
      if (tilt < minTilt) {
        minTilt = tilt
        worstTiltBody = body.name
      }
    }
  }
}

check('every shot direction is a unit vector', unit, 'length 1 within 1e-6')
check(
  'the camera is always on the lit side',
  worstLit > 0.5,
  `worst cos ${worstLit.toFixed(4)} — disc at least ${(((1 + worstLit) / 2) * 100).toFixed(0)}% lit`,
)
check(
  'the angle to the Sun is the one intended',
  Math.abs(Math.acos(worstLit) - SHOT_THETA) < 1e-6,
  `${((Math.acos(worstLit) * 180) / Math.PI).toFixed(1)}° off the sunlight, every time`,
)
check(
  'the shot is lifted above the sunlight plane',
  minTilt > 0,
  `worst lift ${minTilt.toFixed(4)} (${worstTiltBody})`,
)

console.log()
if (failures) {
  console.log(`${failures} check(s) failed.`)
  process.exit(1)
}
console.log('All framing checks passed.\n')
