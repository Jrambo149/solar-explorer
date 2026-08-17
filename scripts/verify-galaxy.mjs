/**
 * Does the zoom-out arrive at the real Galaxy?
 *
 * Run with:
 *     npm run verify:galaxy            (add --offline to skip the browser half)
 *
 * The dev server must be running for the browser half: `npm run dev`.
 *
 * ## What is actually being checked
 *
 * The easy version of this script would confirm that a galaxy-shaped thing
 * appears when you zoom out, which is worth almost nothing — a spiral texture
 * on a quad would pass it. The questions worth asking are the ones that could
 * fail silently and look right:
 *
 *  1. **Is the picture the right way round?** The face-on image is laid in the
 *     galactic plane, so it has a rotation and a handedness — and a spiral that
 *     is mirrored or turned ninety degrees still looks exactly like a spiral,
 *     so nothing on screen would ever show it. The alignment was fitted against
 *     Reid's arms; this re-checks that the fit was decisive.
 *
 *  2. **Is the Sun in the right place?** The image's centre must sit R0 = 8.15
 *     kpc away in the direction of Sgr A*, and the plane's normal must be the
 *     galactic pole — both re-derived from `galacticDirection`, the frame the
 *     band and the stars are already checked against.
 *
 *  3. **Is it the same sky it always was?** The catalogue stars moved from a
 *     dome to real 3D positions, which is exactly the kind of change that
 *     silently rotates or mirrors a frame. From the origin, every drawn star
 *     must be in its catalogue direction and at its catalogue magnitude.
 *
 *  4. **Do the constellations actually come apart?** The single most important
 *     thing on the way out, and the one a dome cannot do. Measured on Orion.
 *
 *  5. **Is exactly one sky drawn at a time?** Two representations of the stars
 *     and two of the Galaxy, cross-fading in pairs. A pair that fails to sum to
 *     one is a doubled sky or no sky, and neither throws.
 *
 *  6. **Did the planetary view survive?** The far plane now reaches 90 kpc when
 *     the camera is out there. If it ever does that while parked at a planet,
 *     the depth ratio goes past what the log buffer can hold and every orbit
 *     line comes out dashed — the failure `nearPlane` documents at length. So
 *     the old ratios are re-measured at every scale.
 */

import { ARMS, DISC, MASERS, R0 } from '../src/data/galaxy.js'
import { STARS } from '../src/data/stars.js'
import { armRadius, galacticCentre, galaxyCorners, galaxyUV } from '../src/scene/galaxyGeometry.js'
import { SPRITE_FIT, SPRITE_RADIUS_KPC, SPRITE_ROTATION } from '../src/data/galaxySprite.js'
import { galacticDirection } from '../src/scene/sky.js'
import { cosmicStageAt, discStageAt, zoomSpeedFor } from '../src/scene/cosmicStage.js'
import { cameraLimits, farPlane, nearPlane, systemEdge, unitsPerParsec } from '../src/orbit/frames.js'
import { galacticToWorld, starDirection } from '../src/scene/sky.js'
import { BODIES } from '../src/data/bodies.js'
import { bodyRadius, focusDistance } from '../src/data/bodies.js'

const offline = process.argv.includes('--offline')
const D = Math.PI / 180

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}
const section = (title) => console.log(`\n${title}\n${'-'.repeat(title.length)}`)

/* ================================================================== *
 * 1. The arms, recovered from the cloud that was drawn from them.
 * ================================================================== */

section('The face-on image')

/*
 * These re-derive the placement from galactic coordinates and compare it with
 * what the component draws. Checking `galaxyQuad` by calling `galaxyQuad` would
 * be worthless; going back to `galacticDirection` — the frame the band and the
 * stars are already checked against — is not.
 */
const corners = galaxyCorners()
check(
  'the image is a quad with four corners and a texture coordinate each',
  corners.length === 4 && corners.every((c) => c.position.length === 3 && c.uv.length === 2),
)

/* Its centre is the Galactic centre: R0 away, in the direction of Sgr A*. */
const centre = corners
  .reduce((a, c) => [a[0] + c.position[0], a[1] + c.position[1], a[2] + c.position[2]], [0, 0, 0])
  .map((v) => v / 4)
const centreDistance = Math.hypot(...centre)
check(
  'the middle of the image sits at the Galactic centre',
  Math.abs(centreDistance - R0) < 1e-9,
  `${centreDistance.toFixed(4)} kpc from the Sun, against R0 = ${R0}`,
)

const hub = galacticCentre()
check(
  'and agrees with the Galactic centre the camera pivots on',
  Math.hypot(centre[0] - hub.x, centre[1] - hub.y, centre[2] - hub.z) < 1e-9,
)

const toCentre = galacticDirection(0, 0)
const alongCentre =
  (centre[0] * toCentre.x + centre[1] * toCentre.y + centre[2] * toCentre.z) / centreDistance
check(
  'and lies toward galactic longitude zero',
  alongCentre > 1 - 1e-9,
  `${(Math.acos(Math.min(1, alongCentre)) / D).toFixed(4)}° off Sgr A*`,
)

/*
 * The quad's own normal is the galactic pole — which is what makes the disc
 * rotatable at all. It was briefly a camera-facing billboard, and a billboard
 * has no normal to speak of: it turns to face you, so orbiting it can never
 * change how it looks and dragging appears to do nothing.
 */
const edgeA = [0, 1, 2].map((i) => corners[1].position[i] - corners[0].position[i])
const edgeB = [0, 1, 2].map((i) => corners[2].position[i] - corners[0].position[i])
const normal = [
  edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
  edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
  edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0],
]
const nLen = Math.hypot(...normal)
const pole = galacticDirection(0, 90)
const alongPole = Math.abs((normal[0] * pole.x + normal[1] * pole.y + normal[2] * pole.z) / nLen)
check(
  'the image lies in the galactic plane',
  alongPole > 1 - 1e-9,
  `its normal is ${(Math.acos(Math.min(1, alongPole)) / D).toFixed(4)}° off the galactic pole`,
)

check(
  "the image is Eyes' own size",
  Math.abs(Math.hypot(...edgeA) - SPRITE_RADIUS_KPC * 2) < 1e-9,
  `${(SPRITE_RADIUS_KPC * 2000 * 3.261564).toFixed(0)} light years across`,
)

/* The Galactic centre samples the middle of the picture, whatever the fit. */
{
  const uv = galaxyUV(0, 0)
  check(
    'the centre of the Galaxy samples the centre of the image',
    Math.abs(uv.u - 0.5) < 1e-9 && Math.abs(uv.v - 0.5) < 1e-9,
    `u ${uv.u.toFixed(6)}, v ${uv.v.toFixed(6)}`,
  )
}

/*
 * The Sun lands where the image's own Local arm is — which is the one thing the
 * fitted rotation buys, and the reason a wrong fit would matter.
 */
{
  const uv = galaxyUV(R0, 0)
  const out = Math.hypot(uv.u - 0.5, uv.v - 0.5) * 2 * SPRITE_RADIUS_KPC
  check(
    'the Sun sits R0 from the centre of the picture',
    Math.abs(out - R0) < 1e-9,
    `${out.toFixed(4)} kpc out, ${((SPRITE_ROTATION + 360) % 360).toFixed(0)}° round the image`,
  )
}

/*
 * The fitted alignment beat the best genuinely different one by a clear margin.
 *
 * The check with the least to look at and the most to lose: a mirrored or
 * rotated spiral is still a convincing spiral, so nothing on screen would ever
 * reveal it. If this stops being decisive the Sun's marker is on a guess.
 */
check(
  "the image's arms match Reid's, and not by luck",
  SPRITE_FIT.margin > 1.5,
  `${SPRITE_FIT.margin.toFixed(2)}x the contrast of the next distinct alignment`,
)

/* The measurements the fit was made against, re-checked against the file. */
section('Reid’s own parallaxes')

for (const arm of ARMS) {
  const index = ARMS.indexOf(arm)
  const mine = MASERS.filter((m) => m[3] === index)
  const mean = mine.reduce((s, m) => s + m[1], 0) / mine.length
  const residuals = mine
    .map(([R, beta]) => {
      let b = beta
      while (b - mean > 180) b -= 360
      while (b - mean < -180) b += 360
      return Math.abs(Math.log(R / armRadius(arm, b)))
    })
    .sort((a, b) => a - b)
  const median = residuals[Math.floor(residuals.length / 2)]
  check(
    `${arm.name}: the masers sit on the published arm`,
    median < 0.12,
    `median ${(median * 100).toFixed(1)}% in radius, ${mine.length} sources`,
  )
}

/* ================================================================== *
 * 3. It is still the same sky.
 * ================================================================== */

section('The catalogue sky, now in three dimensions')

const withDistance = STARS.filter((s) => s[4] > 0)
check(
  'every star but the parallax-less ones has a distance',
  withDistance.length === 8715 && STARS.length === 8922,
  `${withDistance.length} of ${STARS.length}`,
)

/*
 * From the Sun, a star at `direction * distance` is in exactly its catalogue
 * direction — trivially, since that is how it is built. What is *not* trivial
 * is that the apparent magnitude the shader computes there comes back as the
 * catalogue magnitude, because that is the property that lets the deep field
 * cross-fade into a dome drawn from those same magnitudes.
 */
let worstMagnitude = 0
let worstStar = null
for (const [ra, dec, magnitude, , parsecs] of withDistance) {
  const d = starDirection(ra, dec)
  const seen = Math.hypot(d.x * parsecs, d.y * parsecs, d.z * parsecs)
  const apparent = magnitude + 5 * Math.log10(seen / parsecs)
  if (Math.abs(apparent - magnitude) > worstMagnitude) {
    worstMagnitude = Math.abs(apparent - magnitude)
    worstStar = ra
  }
}
check(
  'seen from the Sun, every star is at its catalogue magnitude',
  worstMagnitude < 1e-9,
  `worst drift ${worstMagnitude.toExponential(2)} mag${worstStar === null ? '' : ` (RA ${worstStar})`}`,
)

/*
 * Orion, and whether it comes apart.
 *
 * Its belt is the clearest case in the sky: Alnitak, Alnilam and Mintaka look
 * like three equally spaced stars in a line and are 380, 600 and 380 parsecs
 * away, so the line is an accident of viewing angle and nothing else. From far
 * enough along a perpendicular it has to stop being a line.
 *
 * Measured as the angle the belt subtends, which is ~2.7 degrees from here.
 */
const BELT = [
  [85.1897, -1.9426], // Alnitak
  [84.0534, -1.2019], // Alnilam
  [83.0016, -0.2991], // Mintaka
]
const belt = BELT.map(([ra, dec]) => {
  const match = withDistance.find((s) => Math.abs(s[0] - ra) < 0.02 && Math.abs(s[1] - dec) < 0.02)
  if (!match) return null
  const d = starDirection(match[0], match[1])
  return { x: d.x * match[4], y: d.y * match[4], z: d.z * match[4], pc: match[4] }
}).filter(Boolean)

check('the belt’s three stars are in the catalogue with distances', belt.length === 3,
  belt.map((b) => `${b.pc.toFixed(0)} pc`).join(', '))

function beltSpread(from) {
  const dirs = belt.map((b) => {
    const dx = b.x - from.x
    const dy = b.y - from.y
    const dz = b.z - from.z
    const n = Math.hypot(dx, dy, dz)
    return { x: dx / n, y: dy / n, z: dz / n }
  })
  let widest = 0
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      const dot = dirs[i].x * dirs[j].x + dirs[i].y * dirs[j].y + dirs[i].z * dirs[j].z
      widest = Math.max(widest, Math.acos(Math.min(1, Math.max(-1, dot))) / D)
    }
  }
  return widest
}

if (belt.length === 3) {
  const here = beltSpread({ x: 0, y: 0, z: 0 })
  check(
    'from the Sun, Orion’s belt is the belt',
    here > 2.4 && here < 3.2,
    `${here.toFixed(2)}° across, against 2.7° in the sky`,
  )

  /*
   * Move a hundred parsecs sideways — a thousandth of the way out — and check
   * it has already started to go. The direction is perpendicular to the belt's
   * own line of sight, which is what makes the depth differences show.
   */
  const mid = belt[1]
  const n = Math.hypot(mid.x, mid.y, mid.z)
  const along = { x: mid.x / n, y: mid.y / n, z: mid.z / n }
  // Any vector across the line of sight will do; this one is orthogonalised
  // from the world's y axis.
  const dot = along.y
  const across = { x: -dot * along.x, y: 1 - dot * along.y, z: -dot * along.z }
  const an = Math.hypot(across.x, across.y, across.z)

  for (const step of [100, 400]) {
    const from = {
      x: (across.x / an) * step,
      y: (across.y / an) * step,
      z: (across.z / an) * step,
    }
    const spread = beltSpread(from)
    check(
      `from ${step} pc aside, the belt has come apart`,
      spread > here * 1.5,
      `${spread.toFixed(2)}° against ${here.toFixed(2)}° from home`,
    )
  }
}

/* ================================================================== *
 * 4. One sky at a time.
 * ================================================================== */

section('The handovers')

for (const scaleMode of [0, 1]) {
  const edge = systemEdge(scaleMode)
  const perKpc = unitsPerParsec(scaleMode) * 1000

  check(
    `scale ${scaleMode}: the dome holds everywhere the camera used to reach`,
    cosmicStageAt(edge, scaleMode) === 0 && cosmicStageAt(edge * 0.999, scaleMode) === 0,
    `stage 0 out to ${edge.toFixed(0)} world units`,
  )
  check(
    `scale ${scaleMode}: the band holds while we are inside the Galaxy`,
    discStageAt(perKpc, scaleMode) === 0 && discStageAt(perKpc * 1.9, scaleMode) === 0,
    'still 0 at 1.9 kpc',
  )
  check(
    `scale ${scaleMode}: the disc has taken over before the ceiling`,
    discStageAt(cameraLimits(scaleMode).maxDistance, scaleMode) === 1,
    `stage 1 at ${(cameraLimits(scaleMode).maxDistance / perKpc).toFixed(0)} kpc`,
  )

  /*
   * The pairs sum to one at every distance. Both fades are computed as
   * `stage` and `1 - stage` from the same call, so this can only fail if one of
   * them is ever asked at a different distance from the other — which is
   * precisely what `SkyStage` publishing a single value per frame exists to
   * prevent, and precisely what would be invisible if it broke.
   */
  let worstSum = 0
  for (let l = Math.log(edge * 0.5); l < Math.log(perKpc * 200); l += 0.05) {
    const d = Math.exp(l)
    const stars = cosmicStageAt(d, scaleMode)
    const disc = discStageAt(d, scaleMode)
    worstSum = Math.max(worstSum, Math.abs(stars + (1 - stars) - 1), Math.abs(disc + (1 - disc) - 1))
  }
  check(`scale ${scaleMode}: each pair of skies sums to exactly one`, worstSum === 0)
}

/*
 * Diorama and true scale must show the *same* sky. Both put the stars at
 * `unitsPerParsec` times their catalogue distance, so the two clouds differ by
 * one overall factor and nothing else — which is what "same picture" means.
 */
const ratio = unitsPerParsec(0) / unitsPerParsec(1)
check(
  'diorama and true scale draw one sky, uniformly scaled',
  Math.abs(ratio - systemEdge(0) / systemEdge(1)) < 1e-12,
  `${ratio.toExponential(4)} between the modes`,
)
check(
  'at true scale a parsec really is a parsec',
  Math.abs(unitsPerParsec(1) - 206264.806247 * 100) < 1,
  `${unitsPerParsec(1).toFixed(0)} world units per parsec`,
)

/* ================================================================== *
 * 5. The planetary view is untouched.
 * ================================================================== */

section('The depth planes')

for (const scaleMode of [0, 1]) {
  const edge = systemEdge(scaleMode)

  /*
   * The regression that matters. `farPlane` now reaches 90 kpc, and if it ever
   * did so while the camera was parked at a body the far:near ratio would go
   * from under 1e9 to about 1e15 and every orbit line in the scene would come
   * out dashed. It must not open up anywhere inside the planetary system.
   */
  /*
   * Stated as "unchanged" rather than as an absolute ratio, deliberately.
   *
   * An absolute bound fails on the sub-kilometre bodies at true scale, and it
   * failed there before any of this existed: BioSentinel parks 1.1e-9 world
   * units out, which puts the near plane at 5.7e-11 and the ratio at 1e16
   * against a far plane nothing here touched. `nearPlane` already documents
   * that case and why it is harmless — the only geometry in frame is the
   * body's own trail, a few of its own radii away, in the best-resolved part
   * of the buffer.
   *
   * Writing it as an absolute threshold would therefore have been a check that
   * fails for a reason it does not name, which is worse than no check. What is
   * actually being defended is that the galactic far plane never opens up while
   * the camera is parked at something — so that is what is asserted, for every
   * body at both scales.
   */
  let opened = []
  for (const body of BODIES) {
    const parked = focusDistance(body, scaleMode)
    if (!(parked > 0)) continue
    if (farPlane(scaleMode, parked) !== edge * 40) opened.push(body.name)
  }
  check(
    `scale ${scaleMode}: parked at a body, the far plane never reaches for the Galaxy`,
    opened.length === 0,
    opened.length ? `opened up at ${opened.slice(0, 4).join(', ')}` : `${BODIES.length} bodies`,
  )

  check(
    `scale ${scaleMode}: the far plane is unchanged inside the planetary system`,
    farPlane(scaleMode, edge) === edge * 40,
    `${(edge * 40).toExponential(3)} world units`,
  )

  /* And out at the Galaxy it is affordable, because the near plane grew too. */
  const out = cameraLimits(scaleMode).maxDistance
  const galactic = farPlane(scaleMode, out) / nearPlane(scaleMode, out)
  check(
    `scale ${scaleMode}: out at the Galaxy the ratio is comfortable`,
    galactic < 1e9,
    `${galactic.toExponential(2)}`,
  )

  /* The worst case is the handover itself, where near is smallest for a far
     plane that has just opened all the way up. */
  const atEdge = farPlane(scaleMode, edge * 1.001) / nearPlane(scaleMode, edge * 1.001)
  check(
    `scale ${scaleMode}: the handover itself stays inside the buffer`,
    atEdge < 1e9,
    `${atEdge.toExponential(2)} at ${edge.toFixed(0)} world units — the worst point on the journey`,
  )
}

/*
 * The wheel.
 *
 * Counted as the cost *added*, not the total. The total is not a useful number
 * and the first version of this check treated it as one: at true scale the
 * closest approach is 1.8e-10 world units, because Aegaeon is 240 metres
 * across, so the range from there to the old 165 AU ceiling was already
 * fourteen decades and about 700 notches. Asserting "under 600 for the whole
 * zoom" failed against behaviour that predates this feature entirely.
 *
 * What the new range must not do is multiply that. Everything inside
 * `systemEdge` has to cost exactly what it cost before — the rate there is
 * untouched — and the eight new decades have to be cheap.
 */
{
  const scaleMode = 1
  const { minDistance, maxDistance } = cameraLimits(scaleMode)
  const edge = systemEdge(scaleMode)

  const count = (from, to) => {
    let notches = 0
    let d = from
    while (d < to && notches < 100000) {
      d /= Math.pow(0.95, zoomSpeedFor(cosmicStageAt(d, scaleMode), discStageAt(d, scaleMode)))
      notches++
    }
    return notches
  }

  const inside = count(minDistance, edge)
  const before = Math.ceil(Math.log(edge / minDistance) / -Math.log(Math.pow(0.95, 0.9)))
  check(
    'inside the planetary system the wheel costs exactly what it always did',
    inside === before,
    `${inside} notches, unchanged`,
  )

  const added = count(edge, maxDistance)
  check(
    'and the eight new decades are cheap',
    added < 130,
    `${added} more notches for ${(Math.log10(maxDistance / edge)).toFixed(1)} further decades`,
  )
}

/* ================================================================== *
 * 6. And that it is actually drawn.
 * ================================================================== */

if (!offline) {
  section('In a running frame')
  const { openApp } = await import('./lib/browser.mjs')
  const page = await openApp()
  try {
    /*
     * Let the opening flight land before measuring anything.
     *
     * The app flies the camera to the overview on load, and that flight owns
     * the camera outright while it runs — so a position written into it is
     * overwritten on the next frame, silently. The first version of this
     * section did exactly that and reported the sky unchanged at every
     * distance, which read as six broken cross-fades rather than as a camera
     * that had never moved.
     */
    await page.frames(240)
    const perKpc = await page.evaluate(`(() => {
      const s = window.__solar.state()
      return { scaleMode: s.scaleMode }
    })()`)

    /** Puts the camera a given distance from the Sun and lets the frame settle. */
    const flyTo = async (units) => {
      await page.evaluate(`(() => {
        const c = window.__solar.camera
        const n = Math.hypot(c.position.x, c.position.y, c.position.z) || 1
        const k = ${units} / n
        c.position.multiplyScalar(k)
        const controls = window.__solar.gl.__controls
        return true
      })()`)
      /*
       * Long enough for the eased dolly to arrive.
       *
       * Writing `camera.position` is indistinguishable from a very large wheel
       * notch — which is correct, and means a teleport is now glided into
       * rather than snapped to. At 45 frames these reads were catching the
       * camera mid-flight and reporting the sky as half-faded.
       */
      await page.frames(140)
    }

    const readSky = () => page.evaluate(`(() => {
      const out = { band: null, dome: null, deep: null, disc: null, figures: null }
      window.__solar.scene.traverse((o) => {
        if (o.isMesh && o.renderOrder === -1001) out.band = { visible: o.visible, level: o.material.color.r }
        if (o.isPoints && o.renderOrder === -1000 && o.material.uniforms && o.material.uniforms.uFade)
          out.dome = { visible: o.visible, fade: o.material.uniforms.uFade.value }
        if (o.isPoints && o.renderOrder === -1000 && o.material.uniforms && o.material.uniforms.uCameraLocal)
          out.deep = { visible: o.visible, stage: o.material.uniforms.uStage.value }
        if (o.isMesh && o.renderOrder === -1002) {
          const T = window.__solar.three
          o.updateWorldMatrix(true, false)
          const p = o.geometry.getAttribute('position')
          const at = (i) => new T.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(o.matrixWorld)
          const a = at(0)
          const n = at(1).sub(a).cross(at(2).sub(a)).normalize()
          const mid = new T.Vector3()
          o.getWorldPosition(mid)
          // How far from face-on the disc is seen: 0 is looking straight down
          // on it, 90 is edge-on. This is the quantity a billboard could never
          // change and the whole reason it is not one.
          const look = new T.Vector3(0, 0, 0)
            .addVectors(a, n.clone().multiplyScalar(0))
            .copy(mid)
            .sub(window.__solar.camera.position)
            .normalize()
          out.disc = { visible: o.visible, opacity: o.material.opacity,
                       corners: p.count,
                       tilt: Math.acos(Math.min(1, Math.abs(n.dot(look)))) * 180 / Math.PI }
        }
        if (o.isLineSegments && o.renderOrder === -999) out.figures = { visible: o.visible, opacity: o.material.opacity }
      })
      const c = window.__solar.camera
      out.camera = Math.hypot(c.position.x, c.position.y, c.position.z)
      out.far = c.far
      out.near = c.near
      return out
    })()`)

    const home = await readSky()
    check('at home the dome is up and the deep field is not',
      home.dome && home.dome.fade > 0.999 && home.deep && home.deep.visible === false,
      `dome fade ${home.dome?.fade}, deep field ${home.deep?.visible ? 'drawn' : 'not drawn'}`)
    check('at home the band is up and the disc is not',
      home.band && home.band.visible === true && home.disc && home.disc.visible === false)

    const edge = systemEdge(perKpc.scaleMode)
    await flyTo(edge * 3)
    const mid = await readSky()
    check('part way out, both skies of stars are drawn',
      mid.dome && mid.deep && mid.dome.fade > 0 && mid.dome.fade < 1 && mid.deep.stage > 0,
      `dome ${mid.dome?.fade.toFixed(3)}, deep field ${mid.deep?.stage.toFixed(3)}`)
    check('and they sum to one',
      mid.dome && mid.deep && Math.abs(mid.dome.fade + mid.deep.stage - 1) < 1e-6)
    check('the band is still up, because we are still inside the Galaxy',
      mid.band && mid.band.visible === true && mid.disc && mid.disc.visible === false)

    const upp = unitsPerParsec(perKpc.scaleMode)
    await flyTo(upp * 1000 * 40)
    /*
     * The face-on ease has a 1.4-per-second time constant, so it wants a couple
     * of seconds rather than the handful of frames the other reads need. The
     * first version of this checked at 45 frames and read 32 degrees, which is
     * the ease part way through rather than anything wrong with it.
     */
    await page.frames(180)
    const out = await readSky()
    check('out at 40 kpc the disc is drawn',
      out.disc && out.disc.visible === true && out.disc.opacity > 0.3,
      `opacity ${out.disc?.opacity.toFixed(3)}, ${out.disc?.corners} corners`)
    /*
     * The zoom-out ends looking down on the disc rather than along it.
     *
     * The galactic plane is 60 degrees to the ecliptic and the camera leaves
     * along a fixed ecliptic-relative direction, so without `frameTheGalaxy`
     * the Galaxy arrives 75 degrees from face-on — a dark smear at the end of a
     * fourteen-decade zoom.
     */
    check('the view has settled onto the face of the disc',
      out.disc && out.disc.tilt < 25,
      `${out.disc?.tilt.toFixed(1)}° from face-on`)
    check('the band has gone', out.band === null || out.band.visible === false)
    check('the dome has gone', out.dome === null || out.dome.visible === false)
    check('the figures have gone', out.figures === null || out.figures.visible === false)
    check('the far plane reached the Galaxy',
      out.far > upp * 1000 * 24,
      `far ${out.far.toExponential(2)}, near ${out.near.toExponential(2)}, ratio ${(out.far / out.near).toExponential(2)}`)
    check('and the depth ratio out there is still sane', out.far / out.near < 1e9)

    /*
     * Dragging orbits the **Sun**, at every distance, exactly as it does at
     * home — see `frameTheGalaxy`. So the thing that must not move is the Sun,
     * not the Galaxy: we are eight kiloparsecs off centre, and a view that
     * turned perfectly about the Galaxy's middle would be a view from somewhere
     * we are not.
     *
     * The pivot did slide to the Galactic centre for a while. It is gone
     * because it cost the one thing that matters more: a pivot that moves is a
     * zoom that is not centred on the same point at every scale.
     */
    /*
     * The middle of the *image*, as the centroid of its four world vertices.
     *
     * Not `getWorldPosition`, which is the mesh's own origin — and that is the
     * Sun, because the geometry holds heliocentric positions and the object
     * itself sits at the origin. Measuring that was measuring the wrong thing
     * entirely: the Sun is 8.15 kpc off the middle of the picture, so it
     * genuinely does slide across the frame and change range as the camera
     * orbits the Galactic centre, and the check read that as a broken orbit.
     */
    const framed = () => page.evaluate(`(() => {
      const T = window.__solar.three
      const c = window.__solar.camera
      const sun = new T.Vector3(0, 0, 0)
      const range = sun.clone().sub(c.position).length()
      const ndc = sun.clone().project(c)
      return { x: ndc.x, y: ndc.y, range, cam: [c.position.x, c.position.y, c.position.z] }
    })()`)

    const held = await framed()
    const tiltBefore = (await readSky()).disc.tilt
    await page.drag(800, 450, 1080, 560)
    await page.frames(70)
    const swung = await framed()
    const tiltAfter = (await readSky()).disc.tilt

    const travelled = Math.hypot(...held.cam.map((v, i) => v - swung.cam[i]))
    check('dragging swings the camera a long way',
      travelled > held.range * 0.2,
      `${(travelled / held.range).toFixed(2)} of its distance to the Sun`)
    check('and the Sun stays centred while it does',
      Math.abs(swung.x) < 0.02 && Math.abs(swung.y) < 0.02,
      `screen offset ${swung.x.toFixed(4)}, ${swung.y.toFixed(4)}`)
    check('at an unchanged range from the Sun — an orbit, not a drift',
      Math.abs(swung.range / held.range - 1) < 0.01,
      `${(swung.range / held.range).toFixed(5)}x`)

    /*
     * And the disc actually turns. This is the check the billboard version
     * could not have passed: dragging moved the camera perfectly well, and the
     * picture never changed, because facing the camera is what a billboard
     * does. "The camera moved" is not the same claim as "you can rotate it".
     */
    /*
     * --- The way back in ---
     *
     * "Smooth" is a per-frame property, so it is measured per frame. Wheel
     * notches are sent while the camera's distance to its pivot is recorded on
     * every animation frame, and the trace is checked for steps.
     *
     * The number this exists to defend: OrbitControls damps rotation and pan
     * and applies the dolly outright, so before `smoothDolly` the camera moved
     * **33% of its distance in a single frame and then held still for five** —
     * a staircase. That was always true and only became visible once the zoom
     * rate opened up for the cosmic range, where one notch is a third of the
     * way to the subject.
     */
    await page.evaluate(`(() => {
      window.__trace = []
      window.__traceStop = false
      const c = window.__solar.camera, k = window.__solar.controls
      const tick = () => {
        if (window.__traceStop) return
        const sun = new window.__solar.three.Vector3(0, 0, 0).project(c)
        window.__trace.push([c.position.distanceTo(k.target), sun.x, sun.y])
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })()`)
    for (let i = 0; i < 40; i++) {
      await page.wheel(800, 450, 120)
      await page.frames(2)
    }
    await page.frames(120)
    const trace = await page.evaluate(`(() => { window.__traceStop = true; return window.__trace })()`)

    let biggest = 0
    let backwards = 0
    let lurch = 0
    for (let i = 1; i < trace.length; i++) {
      const [r, x, y] = trace[i]
      const [pr, px, py] = trace[i - 1]
      if (!(r > 0) || !(pr > 0)) continue
      biggest = Math.max(biggest, Math.abs(Math.log(r / pr)))
      if (r > pr * 1.0001) backwards++
      /*
       * How far the Sun moved across the screen. The pivot is the Sun at every
       * distance, so the answer should be *nothing at all*, on every frame of
       * the whole fourteen-decade journey.
       */
      lurch = Math.max(lurch, Math.hypot(x - px, y - py))
    }
    const decades = Math.log10(trace[0][0] / trace[trace.length - 1][0])

    check('zooming back in actually crosses the distance',
      decades > 2,
      `${decades.toFixed(2)} decades over ${trace.length} frames`)
    /*
     * The complaint this defends against, in the user's words: the view stayed
     * centred on the Galaxy coming in and then "snaps to the solar system
     * position". That was the orbit pivot sliding its 8.15 kpc back to the Sun
     * on the disc-fade schedule, which finished at 2 kpc — where 8.15 kpc is
     * four times the camera's whole distance to its subject.
     */
    check('and the Sun never moves on screen the whole way in',
      lurch < 0.002,
      `it shifted at most ${lurch.toFixed(5)} NDC in any one frame`)
    check('and no single frame jumps more than a sixth of the way',
      biggest < 0.18,
      `worst frame moved ${((Math.exp(biggest) - 1) * 100).toFixed(1)}% of the distance`)
    check('and the zoom never stutters backwards',
      backwards <= 2,
      `${backwards} of ${trace.length} frames moved the wrong way`)

    check('and the disc rotates as you drag',
      Math.abs(tiltAfter - tiltBefore) > 8,
      `${tiltBefore.toFixed(1)}° → ${tiltAfter.toFixed(1)}° from face-on`)
  } finally {
    await page.close()
  }
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
