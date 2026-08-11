import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  centuriesSinceJ2000,
  elementsAt,
  isOpenOrbit,
  openOrbitRange,
  sampleOrbit,
  solveKepler,
} from '../orbit/kepler'
import { warpHeliocentric, warpRadius } from '../orbit/frames'
import { BODIES_BY_ID, bodyRadius } from '../data/bodies'
import { planetPositions, simClock, useStore } from '../store/useStore'
import { satelliteClearance, satelliteOffset } from './satelliteFrame'
import { RING_PRESETS } from './Rings'
import { buildRibbonGeometry, makeRibbonMaterial } from './pathRibbon'
import {
  ORBIT_LINE_ALPHA,
  ORBIT_LINE_FADE_PX,
  ORBIT_LINE_WIDTH,
  TRAIL_ALPHA_FADE,
  TRAIL_WIDTH,
  drawsOrbitLine,
  pathColour,
} from './eyesPalette'

/** Enough segments that even Neptune's path has no visible facets. */
const SEGMENTS = 512

const TWO_PI = Math.PI * 2

/*
 * Dimming an orbit line that has outgrown the screen.
 *
 * These four numbers are *not* from Eyes, and the reason they exist is that Eyes
 * does not need them: it only ever renders at true scale, so its single
 * body-radius rule is calibrated for one world. This app has two, and the same
 * rule lands in wildly different places in them. Measured as the camera-to-body
 * distance at which Earth's orbit line starts fading, as a multiple of the orbit's
 * own radius:
 *
 *   diorama      2.06x     the line clears out while you are still well away
 *   true scale   0.005x    400x later — it never gets out of the way at all
 *
 * That is not a mistuned threshold, it is the ratio of a body's drawn size to its
 * orbit changing by four hundred times between the two scale modes. No single
 * pixel threshold on the body can be right in both.
 *
 * So the body-radius fade stays exactly as Eyes has it, and this multiplies a
 * second, gentler factor into it, keyed on how much of the screen the *orbit*
 * covers. Once the line's own on-screen radius passes one viewport height it
 * begins to dim, reaching a floor at three. It floors rather than reaching zero on
 * purpose: at true scale a planet is sub-pixel for most of the approach, so a rule
 * that hid the orbit outright would leave you flying at an icon through an empty
 * field with nothing to give you your bearings. Dimmed to a quarter it reads as
 * context instead of as a bright line across the shot.
 *
 * The diorama is deliberately almost untouched — by the time Earth's orbit reaches
 * 1.28 viewport heights there, the body-radius fade has already taken over, so
 * this contributes a 0.9 multiplier for a moment and nothing more.
 */
const OVERSIZE_START = 1.0
const OVERSIZE_FULL = 3.0
const OVERSIZE_FLOOR = 0.25

/**
 * The path a body traces: a static orbit line, or a trail behind it.
 *
 * Which of the two, and in what colour and weight, is decided entirely by
 * `eyesPalette.js` — see the header there for the split and where the numbers
 * come from. This component's job is the geometry and the per-frame uniforms;
 * it holds no styling opinions of its own.
 *
 * The two modes share every line of the geometry code, because in this app they
 * genuinely are the same curve. A trail's length in Eyes defaults to the body's
 * orbital period, so a moon's trail *is* its complete ellipse, tapering to
 * nothing where it catches up with itself. Eyes computes that period at runtime
 * from the state vector (`TrailComponent._getAutoLength`); here the ellipse is
 * already the object being drawn, so one revolution needs no arithmetic at all.
 *
 * The path is the real ellipse — eccentric, inclined, with the primary at a
 * focus rather than at the centre. For most planets that is subtle; for Mercury
 * at e = 0.21 the offset is plainly visible, and it is what makes the line read
 * as an orbit rather than a decorative circle.
 */
function BodyPath({ planet }) {
  const groupRef = useRef()

  const scaleMode = useStore((s) => s.scaleMode)
  const { camera, size } = useThree()

  const parent = planet.parent ? BODIES_BY_ID[planet.parent] : null
  const isOrbitLine = drawsOrbitLine(planet.id)
  /** Hyperbolic: a path with two ends, which is drawn and stationed differently. */
  const isOpen = isOpenOrbit(planet.elements)

  const { geometry, pathRadius } = useMemo(() => {
    // Elements at the current date. They precess slowly enough that resampling
    // as the clock runs would be invisible and wasteful — a century shifts
    // Mercury's perihelion by 0.16°. Sampling once, at whatever instant the
    // component happens to mount, is well inside the width of the line.
    //
    // The Moon is the one body where that reasoning does not hold: its node
    // regresses a full turn every 18.6 years, so its ellipse genuinely does
    // swing round on a human timescale. It is also 0.0026 AU across and drawn a
    // couple of world units from Earth, where the difference is a fraction of
    // the line's own width. Left alone rather than special-cased.
    const T = centuriesSinceJ2000(simClock.jd)
    const points = sampleOrbit(planet.elements, T, SEGMENTS)

    const clearance = parent ? satelliteClearance(parent, RING_PRESETS) : 0
    const parentRadius = parent ? warpRadius(parent.radiusKm, scaleMode) : 0

    const warped = points.map((point) => {
      const world = { x: 0, y: 0, z: 0 }
      if (parent) {
        // Built about the origin and moved to the parent each frame below, so
        // the whole path travels with the planet as one object rather than
        // 512 samples being rewritten.
        satelliteOffset(point, parent, parentRadius, clearance, planet.plane, scaleMode, world)
      } else {
        warpHeliocentric(point, scaleMode, world)
      }
      return world
    })

    // Mean distance from the path's own centre, in world units. Taken from the
    // warped samples rather than from the elements because it has to be the
    // radius of the curve actually drawn, after the scale warp — and it works
    // for both frames unchanged, since a satellite's path is also built about
    // the origin before being moved to its parent.
    let total = 0
    for (const point of warped) total += Math.hypot(point.x, point.y, point.z)

    return {
      geometry: buildRibbonGeometry(warped, !isOpen),
      pathRadius: total / warped.length,
    }
  }, [planet.elements, planet.plane, parent, scaleMode, isOpen])

  // Dragging the scale slider rebuilds this on every step, so the old buffers
  // have to go back rather than waiting on the GC to notice a few hundred
  // orphaned VBOs.
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => {
    const [r, g, b, a] = pathColour(planet.id, planet.parent, planet.tier === 'minor')
    const mat = makeRibbonMaterial({ colour: [r, g, b], alpha: a, additive: !isOrbitLine })
    mat.uniforms.uIndexLength.value = SEGMENTS
    mat.uniforms.uOpen.value = isOpen ? 1 : 0
    if (isOrbitLine) {
      // Flat: equal widths and no tail fade, so the whole ellipse is drawn at
      // one weight and `uIndexStart` never matters.
      mat.uniforms.uWidthMin.value = ORBIT_LINE_WIDTH.default
      mat.uniforms.uWidthMax.value = ORBIT_LINE_WIDTH.default
      mat.uniforms.uAlphaFade.value = 1
    } else {
      mat.uniforms.uWidthMin.value = TRAIL_WIDTH.default[0]
      mat.uniforms.uWidthMax.value = TRAIL_WIDTH.default[1]
      mat.uniforms.uAlphaFade.value = TRAIL_ALPHA_FADE
    }
    return mat
  }, [planet.id, isOrbitLine, isOpen])

  useEffect(() => () => material.dispose(), [material])

  const visible = useStore((s) => (isOrbitLine ? s.layers.orbits : s.layers.trails))
  const active = useStore((s) => s.hoveredId === planet.id || s.selectedId === planet.id)

  /** Current fade, damped so a path doesn't snap on and off. */
  const shown = useRef(1)

  useFrame((_, delta) => {
    const mat = material

    // A satellite's path is drawn about the origin, so the group has to follow
    // the parent. Same ordering requirement as the bodies themselves: the parent
    // must have written its position this frame already.
    if (parent && groupRef.current) {
      const parentPos = planetPositions.get(parent.id)
      if (parentPos) groupRef.current.position.copy(parentPos)
    }

    mat.uniforms.uViewport.value.set(size.width, size.height)

    /*
     * Where the head of the trail is, as a fractional station along the ellipse.
     *
     * `sampleOrbit` steps the *eccentric* anomaly uniformly, so a sample's index
     * is its eccentric anomaly scaled — which means the body's own station is
     * just its current E, with no search through the samples. One extra Kepler
     * solve per trail per frame, against the one `Body.jsx` already does.
     *
     * `uIndexStart` marks the *tail*, so the head — where `indexU` reaches 1 —
     * is the vertex just below it, and the body's own station is the value that
     * puts the head on the body. There used to be a `+ 1` here, from a comment
     * in `pathRibbon.js` that had the two ends the wrong way round; it threw the
     * bright tip a full segment past the body.
     *
     * Correcting it leaves the head on the nearest sample at or behind the body,
     * which is still up to a segment short — nothing at diorama scale, and
     * hundreds of body radii at true scale, where a parked shot is about seven
     * radii wide. So the head vertex is also handed the body's exact position
     * and snapped onto it in the shader.
     */
    if (!isOrbitLine) {
      const T = centuriesSinceJ2000(simClock.jd)
      const { e, L, varpi } = elementsAt(planet.elements, T)
      const E = solveKepler(L - varpi, e)

      /*
       * An open path's station is a position along a finite strip, not a phase.
       *
       * `sampleOrbit` walks the hyperbolic anomaly from −hMax to +hMax across
       * the samples, so the body's own H maps linearly onto the index. It is
       * clamped rather than wrapped because there is nothing to wrap onto: a
       * comet past the far end has genuinely left, and letting the head reappear
       * at the other end would run it backwards up its own inbound leg.
       */
      let station
      if (isOpen) {
        // The same helper `sampleOrbit` used, so the index the head lands on is
        // the index the geometry was built with. Computing the range twice from
        // the same formula would work until one of them changed.
        const hMax = openOrbitRange(planet.elements, T)
        station = THREE.MathUtils.clamp((E + hMax) / (2 * hMax), 0, 1)
      } else {
        station = (((E / TWO_PI) % 1) + 1) % 1
      }
      const head = station * SEGMENTS
      mat.uniforms.uIndexStart.value = head

      // The path is built about the origin and moved to the parent each frame,
      // so the head has to be given in that same local frame.
      const bodyPos = planetPositions.get(planet.id)
      if (bodyPos) {
        mat.uniforms.uHeadPos.value.copy(bodyPos)
        if (parent && groupRef.current) {
          mat.uniforms.uHeadPos.value.sub(groupRef.current.position)
        }
        mat.uniforms.uHeadIndex.value = head
      } else {
        mat.uniforms.uHeadIndex.value = -1
      }
    }

    /*
     * Fade the path out as its body grows on screen.
     *
     * Eyes' rule, from `OrbitLineComponent`: full strength while the body is
     * under 8 px of on-screen radius, gone by 22 px. It replaces a
     * selection-based rule this app used to have, and answers the same problem
     * better — a path that would otherwise sweep past the camera at close range
     * gets out of the way whether you *selected* the body or merely zoomed at
     * it, and it needs no special case for whether you happen to be somewhere
     * else in the same moon system.
     */
    const position = planetPositions.get(planet.id)
    let target = 1
    if (position) {
      const distance = position.distanceTo(camera.position)
      const focalPx = size.height / (2 * Math.tan((camera.fov * Math.PI) / 360))
      const screenRadius = (bodyRadius(planet, scaleMode) / distance) * focalPx
      const { gone, full } = ORBIT_LINE_FADE_PX
      target = THREE.MathUtils.clamp((screenRadius - gone) / (full - gone), 0, 1)

      // The oversize dim, on top of Eyes' rule. Orbit lines only: a moon's trail
      // is short and local, and the pixel rule already behaves at both scales for
      // it — measured at 6.5px when parked at Jupiter, so visible, and 254px when
      // parked at the moon itself, so hidden.
      if (isOrbitLine) {
        const orbitHeights = (pathRadius / distance) * focalPx / size.height
        const over = THREE.MathUtils.clamp(
          (orbitHeights - OVERSIZE_START) / (OVERSIZE_FULL - OVERSIZE_START),
          0,
          1,
        )
        target *= THREE.MathUtils.lerp(1, OVERSIZE_FLOOR, over)
      }
    }

    shown.current = THREE.MathUtils.damp(shown.current, target, 7, delta)
    mat.uniforms.uAlphaMultiplier.value = shown.current
    mat.visible = shown.current > 0.004

    // Hover and selection: Eyes thickens the line rather than brightening it,
    // and takes the alpha to 1 at the same time.
    const [, , , resting] = pathColour(planet.id, planet.parent, planet.tier === 'minor')
    if (isOrbitLine) {
      const width = active ? ORBIT_LINE_WIDTH.hover : ORBIT_LINE_WIDTH.default
      mat.uniforms.uWidthMin.value = width
      mat.uniforms.uWidthMax.value = width
    } else {
      const [min, max] = active ? TRAIL_WIDTH.hover : TRAIL_WIDTH.default
      mat.uniforms.uWidthMin.value = min
      mat.uniforms.uWidthMax.value = max
    }
    mat.uniforms.uAlpha.value = active ? ORBIT_LINE_ALPHA.hover : resting
  })

  if (!visible) return null

  return (
    <group ref={groupRef}>
      {/* Both geometry and material are built in `useMemo` and handed over
          whole, rather than declared as JSX children. The frame callback writes
          uniforms on the same objects directly, so there is nothing for a ref to
          add — and it keeps their disposal next to their construction. */}
      <mesh geometry={geometry} material={material} renderOrder={-2} />
    </group>
  )
}

export default memo(BodyPath)
