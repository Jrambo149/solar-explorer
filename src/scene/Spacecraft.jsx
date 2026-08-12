import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as framePriority from './framePriority'
import * as THREE from 'three'
import { BODIES_BY_ID, bodyRadius } from '../data/bodies'
import { warpRadius } from '../orbit/frames'
import { isFlying, trajectoryAt } from '../orbit/trajectory'
import { elementPositionAt, elementsCover, elementsFor } from '../orbit/spacecraftElements'
import { planetPositions, simClock, useStore } from '../store/useStore'
import { satelliteClearance } from './satelliteFrame'
import { SPACECRAFT_ATTITUDE } from '../data/spacecraftAttitude'
import { aimQuaternion } from './attitude'
import { eclipticToWorld } from '../orbit/kepler'
import { spacecraftHeliocentric, spacecraftModelRadius, spacecraftOffset } from './spacecraftFrame'
import {
  clearDrawnRadius,
  getSpacecraftModel,
  modelSlug,
  requestSpacecraftModel,
  setDrawnRadius,
} from './spacecraftModels'
import { getPlanetSpin, surfaceOffset, surfaceUpright } from './surface'
import { bodyBasis } from './pole'
import { landedCraft } from '../data/landedCraft'
import { RING_PRESETS } from './Rings'
import { wasDragged } from './dragGuard'

/**
 * One spacecraft.
 *
 * A sibling of `Body.jsx` rather than a branch inside it, and the split is
 * along the deepest seam in the app: `Body` solves Keplerian elements, and a
 * spacecraft has none. Threading a second position source through a component
 * that already handles rings, atmospheres, night lights, tidal locking and
 * shadow occluders would have made both harder to read than either.
 *
 * What it shares with `Body` is everything about *placement* — the position
 * registry, the mount-order contract, the radial warp — because a spacecraft
 * has to sit in the same compressed space as everything around it or it will
 * not be next to the planet it is visiting.
 *
 * ## The frame changes under it
 *
 * Every frame this asks `trajectoryAt` which reference frame the craft is in
 * *at this instant*, and that answer changes over the mission. So the parent
 * lookup happens per frame rather than once at mount, and there is no
 * `parent` prop. Mount order still matters exactly as it does for moons: the
 * frame body must have written its own position first, which is why `Scene`
 * mounts spacecraft after every planet and moon.
 */
export default function Spacecraft({ craft }) {
  const { id, name, radiusKm, color, model } = craft

  const groupRef = useRef(null)
  const worldPos = useRef(new THREE.Vector3())
  const localAU = useRef({ x: 0, y: 0, z: 0, frame: null })
  const offset = useRef({ x: 0, y: 0, z: 0 })
  /*
   * Deliberately **not** `registerPlanetPosition`.
   *
   * That helper seeds a zero vector into the shared registry the moment it is
   * called, and every consumer reads the registry by id without knowing whether
   * anything has written to it yet. For a planet that is harmless — it writes a
   * real position on the very first frame and never stops.
   *
   * A spacecraft does stop. Thirty-six of the sixty-three are not flying on any
   * given date — Cassini ended in 2017, the Voyagers left Earth's frame in 1977,
   * Galileo was destroyed in 2003 — and a craft that never writes keeps the zero
   * vector, which is the world origin, which is the Sun. That is what put the
   * whole fleet in a pile on top of the Sun: not the craft, whose positions are
   * correct, but their labels, projected from a registry entry that meant "no
   * value" and read as "the centre of the solar system".
   *
   * So the vector is owned here and published to the registry only while it
   * holds a real position, and withdrawn on every path that does not compute
   * one. Absent means absent.
   */
  const registry = useMemo(() => new THREE.Vector3(), [id])

  /** Osculating elements, for the close orbiters that cannot be sampled. */
  const elements = useMemo(() => elementsFor(id), [id])

  /*
   * The craft's own velocity, as a unit vector in world space.
   *
   * Thirteen of the forty-nine pointing rules aim an axis along it — LRO flies
   * -X forward — so it has to exist before the model can be oriented.
   *
   * Measured as a finite difference of the *drawn* offset rather than taken from
   * the ephemeris, and both halves of that are deliberate. Drawn, because the
   * craft has to look like it is flying along the path this app is showing, and
   * the diorama warp bends that path away from the real one. And an offset
   * rather than a world position, because the frame body's own motion is not the
   * craft's: differencing world positions would have LRO's nose swing toward
   * wherever the Moon happens to be going, which at a day a second is most of
   * what the difference would measure.
   */
  const velocity = useRef(new THREE.Vector3())
  const aheadLocal = useRef({ x: 0, y: 0, z: 0, frame: null })
  const aheadOffset = useRef({ x: 0, y: 0, z: 0 })

  /*
   * The two meshes, and which of them is currently drawn.
   *
   * Held as refs and switched inside the frame loop rather than as React state,
   * because the answer changes with the camera — every wheel notch, every frame
   * of a flight — and a state write per craft per frame would re-render fifty
   * components sixty times a second to change one boolean.
   *
   * `showsModel` starts false so a craft that mounts far away never pays for
   * its model on the first frame.
   */
  const markerRef = useRef(null)
  const modelRef = useRef(null)
  const showsModel = useRef(false)
  /** Whether this craft's mesh has been handed to the GPU yet. */
  const warmed = useRef(false)

  /*
   * Which frame the craft is in, mirrored into React state.
   *
   * Only so the *model* can be sized in that frame's own units — see
   * `spacecraftModelRadius`. It changes a handful of times across a whole
   * mission, so a state write is free; the position itself never touches React.
   */
  const [frameId, setFrameId] = useState(null)

  const scaleMode = useStore((s) => s.scaleMode)
  const selectPlanet = useStore((s) => s.selectPlanet)

  /*
   * The landing site, for the five craft that have one.
   *
   * Null for everything else, and the branch in the frame loop is the only
   * place it is read — a craft that never landed pays one property lookup at
   * mount and nothing per frame.
   */
  const landed = useMemo(() => landedCraft(id), [id])

  /*
   * Which of its two objects this craft is right now.
   *
   * A rover mission is two different things wearing one roster entry: a cruise
   * stage crossing to Mars, and a rover on the ground. Everything that differs
   * between them hangs off this one flag — the mesh, the attitude rules, and
   * whether the position comes from samples or from coordinates — so the three
   * can never disagree about which object is on screen.
   *
   * Driven from the frame loop rather than from `displayJD`, because the store's
   * copy of the clock is updated a few times a second: at a high time rate that
   * is a long way behind the frame that placed the craft, and the swap has to
   * land on the same instant the placement does. `useState` rather than a ref
   * because the mesh is chosen during render — and it changes at most once per
   * craft per visit, so this costs one re-render at touchdown.
   */
  const [onSurface, setOnSurface] = useState(() => (landed ? simClock.jd >= landed.landed : false))

  /** Where "up" is, once it is standing on something. */
  const uprightQ = useRef(new THREE.Quaternion())

  /*
   * Eyes' orientation rules for this craft: axis correction, spin, pointing.
   *
   * Dropped once it is on the ground, because those rules describe the object
   * that *delivered* it. Mars 2020's entry spins its subject on a thirty-second
   * period, which is the cruise stage barbecue-rolling on the way to Mars and
   * not something Perseverance has done since 2021; the MER and InSight entries
   * point an axis at a target the same way. On the way there they are exactly
   * right and they apply; on the ground the only orientation is standing up,
   * and that comes from `surfaceUpright`.
   */
  const attitude = onSurface ? null : (SPACECRAFT_ATTITUDE[id] ?? null)

  // Only thirteen craft need a velocity; the rest should not pay for one.
  const aimsAtVelocity =
    attitude?.align?.primary?.type === 'velocity' || attitude?.align?.secondary?.type === 'velocity'

  /*
   * The mesh, fetched as soon as the craft is drawn.
   *
   * It used to wait for selection, on the reasoning that 263 MB of models should
   * not be pulled for a fleet nobody is looking at. That reasoning belonged to
   * the fleet: the roster is an explicit allowlist now, so what is mounted is
   * what somebody asked to see, and making them click each one before it stops
   * being a diamond is the wrong trade. If the list grows back to sixty-four
   * this becomes a preload budget rather than an `if`.
   */
  /*
   * The cruise stage on the way, the rover once it is down.
   *
   * The roster's `model` for these three names `sc_mars_2020/cruise_whole/...`
   * and friends — Eyes' own entity path, and the right object for the eight
   * months in transit: what crosses to Mars is a disc with a heat shield, and
   * the rover is folded up inside it. `LANDED_CRAFT` names the other one. Both
   * are baked, and which is fetched follows the same flag as everything else.
   */
  const slug = useMemo(
    () => modelSlug(onSurface && landed ? landed.model : model),
    [onSurface, landed, model],
  )
  const [mesh, setMesh] = useState(() => (slug ? getSpacecraftModel(slug) : null))
  /*
   * The renderer, for the KTX2 decoder rather than for drawing.
   *
   * Four of these models carry Basis-compressed textures, which are transcoded
   * to whichever format the GPU supports — so the decoder has to be shown a live
   * context before it can choose one. This is the first place in the app that
   * has one at the moment a model is asked for.
   */
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!slug) return undefined
    requestSpacecraftModel(slug, gl)
    let alive = true
    const tick = setInterval(() => {
      const found = getSpacecraftModel(slug)
      if (found && alive) {
        setMesh(found)
        clearInterval(tick)
      }
    }, 120)
    return () => {
      alive = false
      clearInterval(tick)
    }
  }, [slug, gl])

  /** A cloned scene, so two craft sharing one file do not share a transform. */
  const instance = useMemo(() => (mesh ? mesh.clone(true) : null), [mesh])

  /*
   * Withdraw on unmount as well.
   *
   * Switching the layer off unmounts every craft, and without this each one
   * would leave its last position in the registry looking live — the same
   * stale-entry problem, arrived at from the other direction. The label overlay
   * and the camera both read the registry, not the scene graph, so neither
   * would notice the component had gone.
   */
  useEffect(() => () => planetPositions.delete(id), [id])

  const radius = bodyRadius(craft, scaleMode)

  /*
   * The mesh's own size, which is not the marker's.
   *
   * `bodyRadius` floors small bodies so Phobos stays visible, and applied to a
   * spacecraft that floor is the whole answer: LRO and a 240 m moonlet came out
   * identical, sixteen percent of the Moon LRO orbits — a 3.8 m probe drawn
   * 280 km wide. The marker keeps that size because a locator has to be findable;
   * the model does not, because it is meant to look like the thing.
   */
  const modelRadius = useMemo(
    () => spacecraftModelRadius(radiusKm, frameId ? BODIES_BY_ID[frameId] : null, scaleMode),
    [radiusKm, frameId, scaleMode],
  )

  // Published so the camera parks at the mesh rather than at the marker.
  useEffect(() => {
    setDrawnRadius(id, modelRadius)
    return () => clearDrawnRadius(id)
  }, [id, modelRadius])

  useFrame(() => {
    const jd = simClock.jd

    /*
     * The five close orbiters come from elements, not samples.
     *
     * Their orbits turn in about two hours and their trajectories are baked at a
     * step of days, so the sampled path is aliased past usefulness — MRO was
     * drawn 15,551 km from where it actually was, which is four times its own
     * orbital radius and nowhere near its orbit. Solved from weekly osculating
     * elements the same craft lands within 31 km. See `spacecraftElements.js`.
     *
     * The check is per frame rather than once at mount because the element sets
     * only cover the orbiting phase; outside it the craft falls back to the
     * sampled cruise, which is what the samples are good at.
     */
    /*
     * On the ground, and carried by the planet rather than solved in space.
     *
     * Taken before the trajectory, because for these five the trajectory is the
     * wrong answer rather than a coarse one. A rover's samples are Mars-relative
     * positions of a point on a rotating surface at a step of 1.52 days against
     * a 24.6-hour rotation — 0.65 samples per turn — so interpolating them
     * traces a path through the inside of the planet.
     *
     * Needs the body's drawn radius and its current spin, both of which `Body`
     * has already written this frame: `BODIES` runs at priority -20 and this at
     * -10. Without a spin the planet has not been drawn at all — its layer is
     * off — and there is no surface to stand on, so the craft is withdrawn the
     * same way a missing frame body withdraws it below.
     */
    if (landed) {
      /*
       * The mission's own far end, and deliberately not `isFlying`.
       *
       * That reads the trajectory window, which for a landed craft is the
       * extent of an ephemeris this branch does not use — the rover is placed
       * from coordinates and Mars' rotation, not from samples. Tying the two
       * together got it wrong in both directions at once: Perseverance vanished
       * in February 2026 because JPL's kernel stopped there, while InSight,
       * whose segment runs to 2050, was still sitting on Mars four years after
       * it fell silent.
       */
      if (landed.ended !== null && jd > landed.ended) {
        if (groupRef.current) groupRef.current.visible = false
        planetPositions.delete(id)
        return
      }

      /*
       * The flag the mesh was chosen from, kept in step with the placement.
       *
       * Before touchdown this branch is skipped entirely and the craft is drawn
       * from its samples like any other, wearing the cruise stage. Setting it
       * here rather than reading the clock in render is what keeps the model
       * and the placement from disagreeing across a landing.
       */
      const down = jd >= landed.landed
      if (down !== onSurface) setOnSurface(down)

      if (down) {
        const host = BODIES_BY_ID[landed.body]
        const hostPos = host ? planetPositions.get(host.id) : null
        const spin = host ? getPlanetSpin(host.id) : null
        if (!host || !hostPos || spin === null) {
          if (groupRef.current) groupRef.current.visible = false
          planetPositions.delete(id)
          return
        }
        if (planetPositions.get(id) !== registry) planetPositions.set(id, registry)

        surfaceOffset(
          landed.lat,
          landed.lon,
          bodyBasis(host.id),
          spin,
          bodyRadius(host, scaleMode),
          offset.current,
        )
        const sx = hostPos.x + offset.current.x
        const sy = hostPos.y + offset.current.y
        const sz = hostPos.z + offset.current.z

        groupRef.current.visible = true
        groupRef.current.position.set(sx, sy, sz)
        worldPos.current.set(sx, sy, sz)
        registry.set(sx, sy, sz)
        // Standing up. The group carries it so both the marker and the model
        // inherit it; `attitude` is null once it is down, so nothing composes a
        // second orientation on top.
        surfaceUpright(landed.lat, landed.lon, bodyBasis(host.id), spin, uprightQ.current)
        groupRef.current.quaternion.copy(uprightQ.current)
        return
      }
      // Otherwise it is still on its way, and falls through to the sampled
      // cruise below like any other craft.
    }

    let here = null
    if (elements && elementsCover(elements, jd)) {
      elementPositionAt(elements, jd, localAU.current)
      localAU.current.frame = elements.frame
      here = localAU.current
    } else {
      here = trajectoryAt(craft, jd, localAU.current)
    }
    // Outside the mission window there is no position. The group is hidden
    // rather than left at its last one, so Cassini is not parked beside Saturn
    // for the eight years since it was flown into the planet.
    if (!here) {
      if (groupRef.current) groupRef.current.visible = false
      /*
       * Withdrawn from the position registry, not merely hidden.
       *
       * The registry entry outlives this component and every consumer reads it
       * by id, so a craft that simply stopped writing would leave its last
       * position lying there looking current. Cassini would still be beside
       * Saturn in 2026 as far as the label overlay and the camera's snap-focus
       * were concerned — selectable, followable, and drawn nowhere. That is the
       * same failure the wheel's `bodyShown` guard was added for when Pluto's
       * moons sat at the world origin.
       *
       * Consumers already treat a missing entry as "no position", so deleting
       * is enough; `registry` is still held here and goes back in the map the
       * moment the craft is flying again.
       */
      planetPositions.delete(id)
      return
    }
    if (planetPositions.get(id) !== registry) planetPositions.set(id, registry)

    let x
    let y
    let z

    if (here.frame === 'sun') {
      ;({ x, y, z } = spacecraftHeliocentric(localAU.current, scaleMode, offset.current))
    } else {
      const frameBody = BODIES_BY_ID[here.frame]
      const framePos = frameBody ? planetPositions.get(frameBody.id) : null
      // Same guard, and the same reasoning, as a moon with no parent position:
      // bail rather than collapse to the world origin.
      if (!frameBody || !framePos) {
        // Withdrawn here too. This is the branch the first fix missed, and on
        // its own it is enough to strand a craft's label on the Sun: it is
        // taken whenever the frame body is switched off or has not yet written
        // its position this frame.
        if (groupRef.current) groupRef.current.visible = false
        planetPositions.delete(id)
        return
      }
      spacecraftOffset(
        localAU.current,
        frameBody,
        warpRadius(frameBody.radiusKm, scaleMode),
        satelliteClearance(frameBody, RING_PRESETS),
        scaleMode,
        offset.current,
      )
      x = framePos.x + offset.current.x
      y = framePos.y + offset.current.y
      z = framePos.z + offset.current.z
    }

    /*
     * Velocity, from the offset one short step ahead.
     *
     * The step is a compromise between two failures. Too long and it chords
     * across a close orbit — LRO turns in two hours, so a step of minutes is
     * already cutting the corner. Too short and the difference is swamped by the
     * float error in two nearly equal positions, which at diorama scale are
     * separated by less than a millionth of a world unit. Eight seconds is about
     * 0.1% of the fastest orbit drawn and still four orders of magnitude above
     * the noise.
     */
    if (aimsAtVelocity) {
      let ahead = null
      if (elements && elementsCover(elements, jd + VELOCITY_STEP_DAYS)) {
        elementPositionAt(elements, jd + VELOCITY_STEP_DAYS, aheadLocal.current)
        aheadLocal.current.frame = elements.frame
        ahead = aheadLocal.current
      } else {
        ahead = trajectoryAt(craft, jd + VELOCITY_STEP_DAYS, aheadLocal.current)
      }

      // A step that crosses a frame handoff compares two different origins, and
      // the difference is the handoff rather than the motion. Keep the old
      // heading for that one frame.
      if (ahead && ahead.frame === here.frame) {
        if (here.frame === 'sun') {
          spacecraftHeliocentric(aheadLocal.current, scaleMode, aheadOffset.current)
        } else {
          const frameBody = BODIES_BY_ID[here.frame]
          spacecraftOffset(
            aheadLocal.current,
            frameBody,
            warpRadius(frameBody.radiusKm, scaleMode),
            satelliteClearance(frameBody, RING_PRESETS),
            scaleMode,
            aheadOffset.current,
          )
        }
        velocity.current
          .set(
            aheadOffset.current.x - offset.current.x,
            aheadOffset.current.y - offset.current.y,
            aheadOffset.current.z - offset.current.z,
          )
          .normalize()
      }
    }

    if (here.frame !== frameId) setFrameId(here.frame)

    if (groupRef.current) {
      groupRef.current.visible = true
      groupRef.current.position.set(x, y, z)
    }
    worldPos.current.set(x, y, z)
    registry.set(x, y, z)
  }, framePriority.SPACECRAFT)

  /**
   * Draw the model only when it is big enough to be worth drawing.
   *
   * The fleet costs about sixty draw calls a craft — these are Eyes' own
   * meshes, with a material per antenna and a texture per panel — and until
   * now every one of the fifty was drawn in full whatever its size on screen.
   * Switching the layer on took the scene from 99 draw calls to 3,069 and from
   * 733,000 triangles to 3.2 million, which is 16.7 ms a frame becoming 25.7:
   * sixty fps to thirty-nine, for objects that are mostly two pixels across.
   *
   * A marker is what a two-pixel craft *should* be, and one already exists —
   * the app just never stopped drawing the mesh behind it. So this is a
   * threshold rather than a new mechanism: below it the octahedron, above it
   * the real thing.
   *
   * `visible = false` on the wrapper rather than unmounting. Three skips a
   * hidden object and its whole subtree before it reaches the render list, so
   * the draw calls go without the model being torn down and rebuilt every time
   * the camera drifts across the threshold — and the GPU upload, which is the
   * expensive part, has already happened.
   *
   * Its own callback rather than a tail on the placement loop above, because
   * that loop returns early on six different paths — landed, ended, no frame
   * body, not flying — and a rule that has to be remembered at each of them
   * would eventually be forgotten at one.
   */
  useFrame((state) => {
    const group = groupRef.current
    if (!group || !markerRef.current) return

    let show = false
    if (modelRef.current && group.visible) {
      const distance = state.camera.position.distanceTo(worldPos.current)
      const focalPx = state.size.height / (2 * Math.tan((state.camera.fov * Math.PI) / 360))
      const px = (modelRadius / distance) * focalPx
      /*
       * Hysteresis, not one threshold. A craft sitting exactly at the boundary
       * — which is what a craft you have just flown to and stopped at does —
       * would otherwise flip between mesh and marker on the sub-pixel jitter of
       * the follow camera, and a model appearing and vanishing sixty times a
       * second is far more distracting than either state.
       */
      show = showsModel.current ? px > MODEL_HIDE_PX : px > MODEL_SHOW_PX

      /*
       * Warm it on the way in, before anything asks to draw it.
       *
       * The saving above has a cost: a mesh that is never drawn is never
       * uploaded, so the whole of that work — vertex buffers, textures, shader
       * variants — now lands on the single frame the craft crosses the
       * threshold. Measured at 164 ms arriving at Juno, 120 at Parker: one
       * visible hitch exactly when the camera is still moving.
       *
       * `compileAsync` does the same work off the critical path and resolves
       * when the GPU has it. Once per craft, on the earlier of two triggers:
       * being selected, which gives the whole two-second flight to get ready,
       * and getting within three times the threshold, which is what covers a
       * craft you merely zoomed towards. Size alone was not enough — the
       * approach crosses those last few pixels in a handful of frames, and the
       * warm had barely started when the mesh was wanted.
       */
      if (!warmed.current && (px > MODEL_SHOW_PX / 3 || useStore.getState().selectedId === id)) {
        warmed.current = true
        state.gl.compileAsync(modelRef.current, state.camera, state.scene)
      }
    }

    if (show !== showsModel.current) {
      showsModel.current = show
      modelRef.current.visible = show
      markerRef.current.visible = !show
    }
  }, framePriority.SPACECRAFT_ATTITUDE)

  return (
    <group ref={groupRef}>
      {/*
        The marker, always drawn.

        An octahedron rather than a sphere because at the size these are drawn
        it is four triangles against a sphere's several hundred, and at a few
        pixels across nobody can tell the difference. `toneMapped={false}` keeps
        it legible against black at the distances where it is all there is —
        this is a locator, not a lit object, and the real mesh takes over the
        moment it arrives.
      */}
      <mesh
        ref={markerRef}
        /* Named for the same reason the spin and axis groups are: so a probe
           can ask which of the two meshes is on screen. */
        name={`marker:${id}`}
        onClick={(event) => {
          if (wasDragged()) return
          event.stopPropagation()
          selectPlanet(id)
        }}
      >
        <octahedronGeometry args={[radius, 0]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      {/*
        The real thing, once it is here.

        Scaled from its own bounding radius to the craft's warped radius, the
        same normalisation `prepare-nasa-model.mjs` bakes into the body meshes —
        done here instead because these files ship exactly as Eyes authored
        them, at Eyes' own scale, and are not rewritten.
      */}
      {/* Hidden until the gate above says otherwise, so a craft that mounts far
          away never draws its mesh even once. */}
      {instance && (
        <group ref={modelRef} visible={false}>
          <ModelInstance
            object={instance}
            radius={modelRadius}
            attitude={attitude}
            id={id}
            worldPos={worldPos}
            velocity={velocity}
            live={showsModel}
            onSelect={() => selectPlanet(id)}
            name={name}
          />
        </group>
      )}
    </group>
  )
}

/**
 * Eyes' axis correction, composed into a quaternion.
 *
 * `rotate` is a list of single-axis turns in degrees applied in order — Voyager
 * is `[{x:-90},{z:180}]` — mapping the model's authored axes onto the ones Eyes'
 * attitude controllers assume. Forty of the seventy-five craft carry one, and
 * until now nothing read it: the value was scraped into the roster when the
 * fleet was first transcribed and then dropped on the way into the app, so every
 * one of those forty has been drawn in whatever attitude its modeller happened
 * to author.
 */
function axisCorrection(rotate) {
  const q = new THREE.Quaternion()
  if (!rotate) return q

  const step = new THREE.Quaternion()
  const axis = new THREE.Vector3()
  for (const turn of rotate) {
    const [name, degrees] = Object.entries(turn)[0]
    axis.set(name === 'x' ? 1 : 0, name === 'y' ? 1 : 0, name === 'z' ? 1 : 0)
    step.setFromAxisAngle(axis, (degrees * Math.PI) / 180)
    q.multiply(step)
  }
  return q
}

/**
 * The world direction one arm of a pointing rule wants, or null.
 *
 * `point` is the direction from the craft to the target's *drawn* position, not
 * its true one. That is the choice that makes the picture honest with itself: at
 * diorama scale everything is radially compressed, so a craft that aimed at
 * where Earth really is would visibly miss the Earth on screen. Eyes has no such
 * problem because it draws to scale.
 *
 * The Sun is the world origin and is deliberately not in the position registry —
 * it never moves, so nothing writes it — which is why it is answered here rather
 * than looked up. Thirty-five of the sixty-two arms target it.
 */
function resolve(arm, worldPos, velocity, out) {
  if (!arm) return null

  if (arm.type === 'velocity') {
    return velocity.current.lengthSq() > 0 ? out.copy(velocity.current) : null
  }

  if (arm.type === 'align') {
    /*
     * An axis of the target's own orientation. Eyes reads the target entity's
     * quaternion; this app does not track one for the Sun, which is what every
     * `align` arm in the roster points at, so the axis is taken as fixed in the
     * ecliptic and converted into world space.
     *
     * The approximation is the Sun's rotation axis, which is tilted 7.25° from
     * the ecliptic pole. It costs at most 7° of roll on the craft that use it —
     * the two Pioneers, Lucy and Psyche — and roll is the one degree of freedom
     * that carries the least meaning: it decides how the panels are canted, not
     * where anything points.
     */
    if (!arm.targetAxis) return null
    return eclipticToWorld(
      { x: arm.targetAxis[0], y: arm.targetAxis[1], z: arm.targetAxis[2] },
      out,
    ).normalize()
  }

  // `point` and `position`, both of which need somewhere to point at.
  const target = arm.target === 'sun' ? ORIGIN : (planetPositions.get(arm.target) ?? null)
  if (!target) return null

  if (arm.type === 'position') return out.copy(target).normalize()

  out.subVectors(target, worldPos.current)
  return out.lengthSq() > 0 ? out.normalize() : null
}

const ORIGIN = new THREE.Vector3(0, 0, 0)

/**
 * The most a spinning craft may turn between frames, in degrees.
 *
 * A cap, and a deliberate departure from the data rather than a tuning constant.
 * The spins are real and they are *fast*: ARTEMIS turns once every three
 * seconds, which is right for a spin-stabilised probe and impossible to draw
 * once the clock is running at anything but real time. At the app's default of a
 * day a second, three seconds of spin passes in 35 microseconds of wall clock —
 * the craft makes four hundred and eighty revolutions between one frame and the
 * next, and the orientation each frame is effectively a random draw.
 *
 * Aliased rotation does not read as fast rotation. It reads as a broken model
 * jittering in place, and it is worse than not spinning at all, which is at
 * least an honest "no information".
 *
 * So below the cap the spin is exact, and above it the craft keeps turning at
 * the fastest rate that still reads as turning. Twenty degrees a frame is about
 * three revolutions a second at 60 fps: plainly spinning, and unambiguous in
 * direction, which anything past thirty degrees a frame is not.
 *
 * The cost is that absolute phase is not preserved once the cap engages — the
 * spin is integrated per frame rather than solved from the epoch. Eyes gives an
 * epoch (`relativeToTime`) for three of the seven, and for periods between three
 * and thirty seconds no viewer could tell which way round the craft started.
 */
const SPIN_MAX_DEG_PER_FRAME = 20

/** The step used to differentiate position into velocity. Eight seconds. */
const VELOCITY_STEP_DAYS = 8 / 86400

/**
 * How big a craft has to look before its mesh is drawn, as a screen radius in
 * pixels — and how much smaller it must get before the mesh is put away again.
 *
 * Six pixels of radius is twelve across, which is about where these models stop
 * being a shape and start being a smudge: below it the octahedron marker says
 * the same thing for one draw call instead of sixty. The gap up to eight is the
 * hysteresis, and it is wide enough to cover the jitter of a follow camera
 * without being wide enough to notice.
 *
 * Measured against the *model's* radius rather than the craft's true size,
 * because that is what is actually drawn — see `spacecraftModelRadius`, which
 * inflates a four-metre probe to something visible next to a planet.
 */
const MODEL_SHOW_PX = 8
const MODEL_HIDE_PX = 6

/**
 * Normalises a loaded scene to unit radius, scales it, orients it, and spins it.
 *
 * The bounding sphere is measured once, on mount, rather than every frame: it
 * is a property of the geometry and the geometry does not change. Rotation does
 * not affect it either — a sphere is a sphere — so the sizing stays valid
 * whatever the attitude.
 *
 * Three nested groups, and the nesting is the meaning: scale, then spin about
 * the *entity's* axis, then the correction that maps model axes onto entity
 * axes. A point travels model → entity → spun, which is the order Eyes applies
 * them in and the only one where a spin axis given as "Y" means the craft's Y
 * rather than the modeller's.
 */
function ModelInstance({ object, radius, attitude, id, worldPos, velocity, live, onSelect }) {
  const ref = useRef(null)
  const spinRef = useRef(null)
  const aim = useRef(new THREE.Quaternion())
  const composed = useRef(new THREE.Quaternion())
  const spinQuat = useRef(new THREE.Quaternion())
  const primaryDir = useRef(new THREE.Vector3())
  const secondaryDir = useRef(new THREE.Vector3())

  const unitScale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(object)
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    return sphere.radius > 0 ? 1 / sphere.radius : 1
  }, [object])

  const correction = useMemo(() => axisCorrection(attitude?.rotate), [attitude])

  /** Accumulated spin, and the clock reading it was last advanced from. */
  const spin = useRef({ angle: 0, jd: null })
  const spinAxis = useMemo(
    () => (attitude?.spin ? new THREE.Vector3(...attitude.spin.axis) : null),
    [attitude],
  )

  useFrame(() => {
    if (!spinRef.current) return
    /*
     * Nothing to orient while the marker is standing in for the mesh.
     *
     * The saving is not the quaternion algebra, which is cheap; it is the two
     * `resolve` calls behind it, each a registry lookup and a normalise, run
     * fifty times a frame to point a model that is not being drawn.
     *
     * The spin clock is reset rather than carried, so the craft does not
     * integrate a turn across the whole time it was away and snap to a new
     * phase the moment it reappears — see the note on `SPIN_MAX_DEG_PER_FRAME`
     * for why absolute phase is not preserved anyway.
     */
    if (live && !live.current) {
      spin.current.jd = null
      return
    }
    const jd = simClock.jd

    /* ---- spin ---- */
    if (spinAxis) {
      const last = spin.current.jd
      spin.current.jd = jd
      if (last !== null) {
        const turns = (jd - last) / attitude.spin.periodDays
        const limit = (SPIN_MAX_DEG_PER_FRAME * Math.PI) / 180
        const step = THREE.MathUtils.clamp(turns * Math.PI * 2, -limit, limit)
        spin.current.angle += step
        /*
         * The clamped step, published for the verifier. Dev only.
         *
         * The test used to read it off the group's own quaternion, which cannot
         * see it: this group carries `aim * spin`, so what it measures is the
         * cap plus however far the pointing turned that frame. That is a real
         * quantity but it is not the one being capped, and asserting the exact
         * 20° bound on it failed intermittently at 20.01°.
         */
        if (import.meta.env.DEV) spinRef.current.userData.spinStep = step
      }
      spinQuat.current.setFromAxisAngle(spinAxis, spin.current.angle)
    } else {
      spinQuat.current.identity()
    }

    /* ---- pointing ---- */
    const solved = aimQuaternion(
      correction,
      attitude?.align ?? null,
      resolve(attitude?.align?.primary, worldPos, velocity, primaryDir.current),
      resolve(attitude?.align?.secondary, worldPos, velocity, secondaryDir.current),
      aim.current,
    )

    /*
     * Spin inside the aim, so a craft that does both spins about the axis it is
     * pointing rather than tumbling around a fixed one. ARTEMIS is exactly that
     * case — its spin axis and its aimed axis are both model Y — and it is the
     * arrangement that reads as a drum turning rather than a probe wobbling.
     *
     * Eyes defaults `axisInFrameSpace` to true, which would spin about a *world*
     * axis instead. For every craft drawn today the two agree, because the only
     * spinners on screen are the ARTEMIS pair, whose axis correction is identity
     * and whose spin axis is the one being aimed. If a craft is ever drawn where
     * they disagree, this is the line to revisit.
     */
    spinRef.current.quaternion.copy(composed.current.copy(solved).multiply(spinQuat.current))
  }, framePriority.SPACECRAFT_ATTITUDE)

  return (
    <group
      ref={ref}
      scale={radius * unitScale}
      onClick={(event) => {
        if (wasDragged()) return
        event.stopPropagation()
        onSelect()
      }}
    >
      {/* Named so a probe can find them in the scene graph and read the
          quaternions — the same reason the trail ribbons are named, and the same
          zero cost. `spin` carries the turning; `axes` carries Eyes' fixed
          correction, which must never change once the model is loaded. */}
      <group ref={spinRef} name={`spin:${id}`}>
        <group quaternion={correction} name={`axes:${id}`}>
          <primitive object={object} />
        </group>
      </group>
    </group>
  )
}
