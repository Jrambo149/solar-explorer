import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { BODIES_BY_ID, bodyRadius } from '../data/bodies'
import { SPACECRAFT_TRAILS } from '../data/spacecraftTrails'
import { landedCraft } from '../data/landedCraft'
import { warpRadius } from '../orbit/frames'
import { isFlying, sampleSegment, segmentAt, trailDays, trajectoryWindow } from '../orbit/trajectory'
import {
  elementPositionAt,
  elementsCover,
  elementsFor,
} from '../orbit/spacecraftElements'
import { planetPositions, simClock, useStore } from '../store/useStore'
import { allocSampling, sampleEvenly } from '../orbit/pathSampling'
import { allocRibbonGeometry, fillRibbonGeometry, makeRibbonMaterial } from './pathRibbon'
import { satelliteClearance } from './satelliteFrame'
import { spacecraftHeliocentric, spacecraftOffset } from './spacecraftFrame'
import { TRAIL_ALPHA_FADE, TRAIL_FRAME_PROXIMITY, TRAIL_NEAR_FADE, TRAIL_WIDTH } from './eyesPalette'
import { RING_PRESETS } from './Rings'

/**
 * A spacecraft's trail: the last `trailDays` of its flight, and no more.
 *
 * ## Why this is a window and not the whole trajectory
 *
 * It used to draw every sample from launch to now, and with the fleet switched
 * on that is what sixty-four completed missions look like laid over each other:
 * a web across the inner system with the planets somewhere underneath it. Eyes
 * does not have that problem because its trails are not the flight — they are
 * `[now - length, now]`, a span of simulated time ending at the craft, and
 * `spacecraftTrails.js` carries Eyes' own length for each one.
 *
 * The lengths are worth reading. Voyager 1 shows thirty years of cruise but
 * tightens to sixty days through the Jupiter and Saturn encounters, so the
 * flybys read as manoeuvres rather than as kinks in a very long line. Juno drops
 * from two years to sixty days once it arrives. InSight's goes to *zero* the
 * moment it lands, because a lander has no trail.
 *
 * ## Why the geometry is rewritten every frame
 *
 * A window slides. Its points are a different stretch of the trajectory each
 * frame, so unlike an orbit — which is the same ellipse forever — there is
 * nothing to bake. The buffers are allocated once at `MAX_POINTS` and refilled
 * in place; see `allocRibbonGeometry`. Refilling is skipped when the window has
 * not moved by half a point, which is what makes a paused clock free.
 *
 * ## Why one ribbon per segment
 *
 * A trajectory changes reference frame partway along — Voyager 1's is held in
 * turn by Earth, the Sun, Jupiter, the Sun, Saturn and the Sun — and each frame
 * body moves independently, so a single mesh could not follow them. Each run
 * therefore lives in its own group, positioned at its frame body. The taper is
 * mapped so it runs continuously across the whole window regardless of how many
 * runs it is split over; see `uIndexStart` below.
 */

/**
 * Points per run.
 *
 * 256 was chosen because the window is a few hundred pixels of screen at most,
 * and it is the right budget for almost everything: the near-circular orbiters
 * and the cruise legs all come in well under a degree of turn at a joint, and
 * spending more on them buys nothing anyone can see.
 *
 * It is not enough for the two most eccentric orbits drawn. `sampleEvenly` puts
 * the points where the curve needs them rather than where the craft spends its
 * time, which is what makes 256 work at all for these — but Juno's orbit is
 * e = 0.975 and its trail is 1.8 revolutions of it, and after redistribution its
 * worst joint still came to 4.3°, with Parker's at 4.1°. Both halve cleanly at
 * 512, to 2.1° and 1.9°, which is inside the three degrees `verify-trails`
 * holds every ribbon to.
 *
 * Doubling costs one more evaluation per point on a resample and 6 KB of buffer
 * per run, against a trail budget that is already skipped entirely whenever the
 * window has not moved by half a point. Measured over 400 frames with all
 * twenty-one craft drawn and the clock at a day a second, the frame time did not
 * move: 16.6 ms median either way, and a 95th percentile of 18.6 against 18.7.
 * That is a vsync-locked 60 fps, so what it establishes is that nothing is being
 * dropped rather than how much headroom is left.
 */
const MAX_POINTS = 512

/** Scratch for the continuity pass, which runs once per craft per frame. */
const _endA = new THREE.Vector3()
const _endB = new THREE.Vector3()

/**
 * Hides the leading pieces of a trail that no longer join the one holding the
 * craft.
 *
 * ## What is being fixed
 *
 * A trail crossing a frame handoff is drawn as one ribbon per segment, and the
 * pieces are supposed to meet: the end of the Sun-frame leg and the start of the
 * Mars-frame leg are the same instant, so they are the same point.
 *
 * In world space they are not, because the two frames warp that point
 * differently. A planet's frame deliberately inflates distances so that a craft
 * in a close orbit is visible at all against a planet drawn twelve times too
 * large — LRO is lifted 240-fold, and that inflation is the whole reason the
 * frame exists. The Sun's frame does no such thing. Where a body-frame segment
 * reaches far enough out for the difference to matter, the two mappings disagree
 * by a great deal: measured at Mars, a craft 0.01 AU out is drawn 7.7 world
 * units from the planet in Mars's frame and 0.24 in the Sun's.
 *
 * The result is a piece of trail hanging in space with no craft at either end of
 * it — the gaps measured 26 to 68 world units, on a diorama where Mars sits 39
 * units from the Sun, so a fragment of Psyche's cruise was drawn across Mars
 * having nothing to do with Mars at all.
 *
 * ## Why hiding them is the honest answer and not a patch
 *
 * A trail is one continuous path. Until the frames agree about where a point is,
 * the only part of it that can be drawn truthfully is the run of pieces that do
 * meet, ending at the craft. A fragment 50 units from where it belongs is not a
 * shorter trail, it is a wrong one.
 *
 * This costs history: Psyche keeps the leg since its Mars flyby rather than all
 * 566 days. The proper repair is for a planet's frame to converge on the Sun's
 * far from the planet, so that the handoff is continuous by construction and
 * nothing needs dropping — at which point this becomes a safety net that never
 * fires, because a real join measures exactly zero.
 *
 * ## The threshold
 *
 * There is nothing to tune. Pieces that genuinely meet are the same point
 * evaluated twice and come out *exactly* equal; pieces that do not are tens of
 * units apart. The frame body's drawn radius is used as the yardstick only
 * because it scales with `scaleMode`, so the test means the same thing at
 * diorama and true scale.
 */
function dropDetachedRuns(runs, groups) {
  let last = -1
  for (let i = runs.length - 1; i >= 0; i--) {
    if (groups[i]?.visible) {
      last = i
      break
    }
  }
  if (last < 1) return

  // Walk back from the piece holding the craft, and stop at the first break.
  let attached = last
  for (let i = last; i > 0; i--) {
    const before = runs[i - 1]
    const beforeGroup = groups[i - 1]
    if (!beforeGroup?.visible) break

    _endA.copy(before.tail).add(beforeGroup.position)
    _endB.copy(runs[i].head).add(groups[i].position)
    const tolerance = Math.max(before.frameRadius, runs[i].frameRadius, 1e-4)
    if (_endA.distanceTo(_endB) > tolerance) break
    attached = i - 1
  }

  for (let i = 0; i < attached; i++) {
    if (groups[i]) groups[i].visible = false
  }
}

function SpacecraftPath({ craft }) {
  const size = useThree((state) => state.size)
  const camera = useThree((state) => state.camera)
  const scaleMode = useStore((s) => s.scaleMode)
  const trailsOn = useStore((s) => s.layers.trails)
  /*
   * Whether this craft is the one being looked at.
   *
   * The close-range fades below are Eyes' own, and they are right for the craft
   * you have flown up to: at that framing the trail is a bright line running out
   * of the model you are trying to see. They are wrong for every *other* craft,
   * because they trigger on nothing but proximity — park at LRO and both ARTEMIS
   * trails dim as well, purely for being in the same neighbourhood, which is the
   * opposite of what the trail is for. So the fades now apply only to the
   * selection, and everything else keeps its trail at full strength.
   */
  const selected = useStore((s) => s.selectedId === craft.id)

  const groupsRef = useRef([])
  const config = SPACECRAFT_TRAILS[craft.id] ?? null
  const elements = useMemo(() => elementsFor(craft.id), [craft.id])

  /*
   * One run per segment, with the buffers to draw it.
   *
   * Rebuilt only when the scale changes — the frame body's warped radius and
   * clearance feed every point, and nothing else here depends on time.
   *
   * A craft solved from elements gets exactly one run instead. Its trail is a
   * single revolution around a single body, so the per-segment machinery has
   * nothing to do: there are no frame handoffs inside an orbit.
   */
  const runs = useMemo(() => {
    const out = []

    if (elements) {
      /*
       * A heliocentric element set has no frame body, exactly as a heliocentric
       * *segment* has none below — the Sun is drawn by `frames.js` from its own
       * constants and is not in the body registry, so `BODIES_BY_ID.sun` is
       * undefined rather than missing.
       *
       * This branch used to require one, which was true while every element set
       * orbited a planet or a moon and silently stopped being true when Parker,
       * STEREO-A, OSIRIS-REx and BioSentinel joined them. It failed closed: no
       * run was pushed, so the four craft drew no trail at all, and nothing
       * errored because there was nothing to error on.
       */
      const frameBody = elements.frame === 'sun' ? null : BODIES_BY_ID[elements.frame]
      if (elements.frame === 'sun' || frameBody) {
        out.push({
          seg: null,
          elements,
          frameBody,
          frameRadius: frameBody ? warpRadius(frameBody.radiusKm, scaleMode) : 0,
          clearance: frameBody ? satelliteClearance(frameBody, RING_PRESETS) : 0,
          geometry: allocRibbonGeometry(MAX_POINTS),
          drawn: { t0: NaN, t1: NaN, count: 0 },
          head: new THREE.Vector3(),
          tail: new THREE.Vector3(),
        })
      }
      return out
    }

    for (const seg of craft.segments) {
      if (seg.samples.length < 6) continue
      const frameBody = seg.frame === 'sun' ? null : BODIES_BY_ID[seg.frame]
      if (seg.frame !== 'sun' && !frameBody) continue

      out.push({
        seg,
        elements: null,
        frameBody,
        frameRadius: frameBody ? warpRadius(frameBody.radiusKm, scaleMode) : 0,
        clearance: frameBody ? satelliteClearance(frameBody, RING_PRESETS) : 0,
        geometry: allocRibbonGeometry(MAX_POINTS),
        // The window this run last drew, so an unmoved window costs nothing.
        drawn: { t0: NaN, t1: NaN, count: 0 },
        head: new THREE.Vector3(),
        tail: new THREE.Vector3(),
      })
    }
    return out
  }, [craft, elements, scaleMode])

  const materials = useMemo(
    () =>
      runs.map(() => {
        // `makeRibbonMaterial` wants linear [r, g, b], not the hex string the
        // registry carries — it reads `colour[0..2]`, so a string yields three
        // undefineds and a NaN colour, which renders as nothing at all.
        const c = new THREE.Color(craft.color)
        const mat = makeRibbonMaterial({ colour: [c.r, c.g, c.b], alpha: 0.7, additive: false })
        mat.uniforms.uOpen.value = 1
        // Eyes' own trail styling: `TrailManager._width.default` and
        // `TrailComponent._alphaFade`. The tail tapers to nothing at both ends
        // of the scale, which is what lets a window end without a cut edge.
        mat.uniforms.uWidthMin.value = TRAIL_WIDTH.default[0]
        mat.uniforms.uWidthMax.value = TRAIL_WIDTH.default[1]
        mat.uniforms.uAlphaFade.value = TRAIL_ALPHA_FADE
        return mat
      }),
    [runs, craft.color],
  )

  useEffect(
    () => () => {
      for (const r of runs) r.geometry.dispose()
      for (const m of materials) m.dispose()
    },
    [runs, materials],
  )

  /** Flat xyz for the current window, reused every frame. */
  const points = useRef(new Float32Array(MAX_POINTS * 3))
  /** Working room for the even-spacing pass, allocated once. */
  const sampling = useRef(allocSampling(MAX_POINTS))
  const local = useRef({ x: 0, y: 0, z: 0, frame: null })
  const scratch = useRef({ x: 0, y: 0, z: 0 })

  /** Current near-fade, damped so flying past a craft doesn't flick its trail. */
  const shown = useRef(1)

  /** First sample of the mission, the fallback when no length is known. */
  const launched = useRef(trajectoryWindow(craft)?.start ?? 0)

  useFrame((_, delta) => {
    const jd = simClock.jd
    /*
     * A craft on the ground has no trail.
     *
     * Not a stylistic call: the trail is built from the baked samples, and for a
     * rover those are Mars-relative positions of a point on a rotating surface,
     * aliased at 0.65 samples per turn. Drawing them puts a ribbon through the
     * inside of the planet, ending 0.8 world units from a rover that is placed
     * on the surface — the craft and its own trail in different places.
     *
     * Eyes reaches the same answer for InSight by setting its trail length to
     * zero at touchdown, and does not for Curiosity, whose coverage keeps 112
     * days after landing. In Mars' frame that is a circle the rover never drove.
     */
    const site = landedCraft(craft.id)
    const onGround = site ? jd >= site.landed : false
    const alive = isFlying(craft, jd) && !onGround

    const days = alive ? trailDays(craft, jd, config) : null
    // A window of zero is not "draw everything" — it is InSight on the surface
    // of Mars, whose coverage sets the length to 0 at touchdown.
    //
    // A window of *null* is the genuine unknown: no entry in Eyes' table, or an
    // auto length that could not be derived. Falling back to launch keeps the
    // craft drawn rather than silently blank, and keeps `span` finite so the
    // taper mapping below stays well defined.
    const launch = launched.current
    const windowStart = days === null ? launch : jd - days
    const drawsAnything = alive && days !== 0

    /*
     * Eyes' two close-range fade factors, applied to the whole trail rather
     * than per run.
     *
     * Per run would be the more literal reading — each ribbon has its own frame
     * body, so each could measure its own proximity — but Eyes has one trail per
     * craft with one multiplier, and splitting it would dim the run holding
     * "now" while the leg before the handoff stayed bright. A seam across a
     * continuous line is worse than a slightly wrong threshold on the legs that
     * are not near the camera anyway.
     */
    const craftPos = planetPositions.get(craft.id)
    let target = 1
    if (craftPos && selected) {
      const toCamera = craftPos.distanceTo(camera.position)
      const normalRadius =
        bodyRadius(craft, scaleMode) / toCamera / Math.tan((camera.fov * Math.PI) / 360)
      target = THREE.MathUtils.clamp(
        (1 - normalRadius / TRAIL_NEAR_FADE.max) / TRAIL_NEAR_FADE.blur + 1,
        0,
        1,
      )
      // The divisor is the craft's distance from the origin of the frame it is
      // in at this instant, which is what Eyes' `getPosition().magnitude()`
      // returns: a position is always expressed in its current parent's frame.
      const here = segmentAt(craft, jd)
      const origin = here && here.frame !== 'sun' ? planetPositions.get(here.frame) : null
      const fromOrigin = origin ? craftPos.distanceTo(origin) : craftPos.length()
      if (fromOrigin > 0) {
        target *= THREE.MathUtils.clamp((TRAIL_FRAME_PROXIMITY * toCamera) / fromOrigin, 0, 1)
      }
    }
    shown.current = THREE.MathUtils.damp(shown.current, target, 7, delta)

    const visible = trailsOn && drawsAnything && shown.current > 0.004
    const span = jd - windowStart

    for (let r = 0; r < runs.length; r++) {
      const run = runs[r]
      const { seg, elements: orbit, frameBody, frameRadius, clearance, geometry, drawn } = run
      const group = groupsRef.current[r]
      const mat = materials[r]
      if (!group || !mat) continue

      // This run's overlap with the window. Everything outside it — every
      // segment of every completed mission — simply does not draw, which is the
      // whole point. An element set's bounds are its first and last epoch.
      const from = orbit ? orbit.rows[0][0] : seg.t0
      const to = orbit ? orbit.rows[orbit.rows.length - 1][0] : seg.t1
      const w0 = Math.max(from, windowStart)
      const w1 = Math.min(to, jd)
      if (!visible || w1 <= w0) {
        group.visible = false
        continue
      }
      group.visible = true

      mat.uniforms.uViewport.value.set(size.width, size.height)
      mat.uniforms.uAlphaMultiplier.value = shown.current

      // The frame body's world position this frame — the whole reason each run
      // is its own group.
      if (frameBody) {
        const framePos = planetPositions.get(frameBody.id)
        if (!framePos) {
          group.visible = false
          continue
        }
        group.position.copy(framePos)
      } else {
        group.position.set(0, 0, 0)
      }

      // Resample only when the window has moved by half a point. A paused clock
      // therefore costs nothing at all, and at one day a second the outer-planet
      // trails still skip most frames.
      const count = MAX_POINTS
      const spacing = (w1 - w0) / (count - 1)
      const moved =
        Math.abs(w0 - drawn.t0) > spacing * 0.5 || Math.abs(w1 - drawn.t1) > spacing * 0.5
      if (moved || drawn.count !== count) {
        /*
         * One sample of this run, in the world space it is drawn in.
         *
         * Passed to `sampleEvenly` rather than called in a loop here, because
         * *when* to evaluate is the thing being decided: stepping the window in
         * equal slices of time puts the samples where the craft spends its time,
         * not where the curve needs them, and on an eccentric orbit those are
         * opposite ends of the ellipse. See `pathSampling.js`.
         */
        const evaluate = (at, out) => {
          if (orbit) elementPositionAt(orbit, at, local.current)
          else sampleSegment(seg, at, local.current)
          const w = frameBody
            ? spacecraftOffset(
                local.current,
                frameBody,
                frameRadius,
                clearance,
                scaleMode,
                scratch.current,
              )
            : spacecraftHeliocentric(local.current, scaleMode, scratch.current)
          out.x = w.x
          out.y = w.y
          out.z = w.z
        }

        const buffer = points.current
        sampleEvenly(w0, w1, count, evaluate, buffer, sampling.current)
        fillRibbonGeometry(geometry, buffer, count)
        drawn.t0 = w0
        drawn.t1 = w1
        drawn.count = count
        /*
         * Both ends kept for the continuity check after the loop.
         *
         * Stored in the group's own coordinates, exactly as the vertices are,
         * and turned into world positions there by adding `group.position`.
         * Holding world coordinates here instead would go stale the moment the
         * frame body moved without the window moving far enough to resample —
         * which is most frames.
         */
        run.head.set(buffer[0], buffer[1], buffer[2])
        run.tail.set(buffer[(count - 1) * 3], buffer[(count - 1) * 3 + 1], buffer[(count - 1) * 3 + 2])
      }

      /*
       * Map the taper onto this run's share of the window.
       *
       * The shader derives `vIndexU = (aIndex - uIndexStart + uIndexLength) /
       * uIndexLength`, running 0 at the tail to 1 at the head. A run covering
       * the window's fraction [f0, f1] wants `vIndexU` to run f0..f1 across its
       * own vertices, so that a trail split over three frame handoffs still
       * fades once from end to end instead of three times.
       *
       * Solving the two endpoints gives the pair below. Note `uIndexStart` lands
       * at or beyond the last vertex, so the shader's "ahead of the head" branch
       * never collapses anything on a run that is wholly in the past — which is
       * correct, because its far end is not a head, it is a handoff.
       */
      const f0 = span > 0 ? (w0 - windowStart) / span : 0
      const f1 = span > 0 ? (w1 - windowStart) / span : 1
      const fraction = Math.max(f1 - f0, 1e-6)
      const length = (count - 1) / fraction
      mat.uniforms.uIndexLength.value = length
      mat.uniforms.uIndexStart.value = length * (1 - f0)

      // The head is pinned to the craft's live position so the tip meets the
      // model rather than the last resampled point — the same head-snap the
      // Keplerian paths needed, and for the same reason.
      if (jd <= to && jd >= from && craftPos) {
        mat.uniforms.uHeadIndex.value = count - 1
        mat.uniforms.uHeadPos.value.copy(craftPos).sub(group.position)
      } else {
        mat.uniforms.uHeadIndex.value = -1
      }
    }

    dropDetachedRuns(runs, groupsRef.current)
  })

  return (
    <>
      {runs.map((run, i) => (
        <group key={i} ref={(el) => (groupsRef.current[i] = el)}>
          {/* Named so a probe can find this ribbon in the scene graph and read
              its uniforms — see `DevHandle` in `Scene.jsx`. `name` is a plain
              Object3D field with no rendering cost, and three's own
              `getObjectByName` is the lookup. */}
          <mesh
            name={`trail:${craft.id}:${i}`}
            geometry={run.geometry}
            material={materials[i]}
            frustumCulled={false}
          />
        </group>
      ))}
    </>
  )
}

export default memo(SpacecraftPath)
