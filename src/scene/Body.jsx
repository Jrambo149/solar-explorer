import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as framePriority from './framePriority'
import * as THREE from 'three'
import { getTexture } from '../textures'
import {
  planetPositions,
  registerPlanetPosition,
  simClock,
  useStore,
  viewScroll,
} from '../store/useStore'
import { centuriesSinceJ2000, positionAt, spinAt } from '../orbit/kepler'
import { setPlanetSpin } from './surface'
import { bodyBasis } from './pole'
import { warpHeliocentric, warpRadius, warpSunRadius } from '../orbit/frames'
import { BODIES_BY_ID, bodyRadius, systemMoonsOf } from '../data/bodies'
import { getBodySurface } from '../models'
import { attachShadows, ringNormal, setOccluders, shadowUniforms } from './shadows'
import { attachNightLights } from './nightLights'
import { satelliteClearance, satelliteOffset } from './satelliteFrame'
import Rings, { RING_PRESETS } from './Rings'
import { wasDragged } from './dragGuard'

/**
 * Seconds per turn for the selected body while the dossier is open.
 *
 * A turntable, not the real rotation. Once the split view is up the clock has
 * eased to a stop (see `SimulationClock`), which is what stops the background
 * wheeling about — but it would also leave the subject dead still, showing one
 * face and never the rest of a model that has a whole surface worth looking at.
 *
 * So the *rate* here is decoupled from the simulation entirely: the same sedate
 * 48 seconds for Jupiter's ten hours as for Venus's 243 days, because this is a
 * product shot rather than a fact about the body. Slow enough to read as
 * drifting rather than turning, and still brings the far side round within the
 * time it takes to read the page.
 *
 * The *direction* is not decoupled, and used to be — this was one fixed
 * positive rate for everything, so the turntable turned Venus the same way it
 * turned Earth. That is the one claim on the page it cannot afford to
 * contradict, because the page beside it says "243 Earth days (retrograde)" and
 * the turntable is the only place a viewer can ever see the difference: at a
 * day a second Venus turns 1/243 as fast as Earth, which is no visible motion
 * at all. So the two bodies rotating alike in the dossier was the whole of the
 * evidence available, and it said the opposite of the text.
 *
 * Three bodies are affected — Venus, Uranus and Pluto, the three with a
 * negative `rotationHours`. Triton is not: its retrograde *orbit* is carried by
 * its inclination rather than by its spin, which is an ordinary positive
 * tidally-locked period.
 */
const SHOWCASE_PERIOD = 48
const SHOWCASE_RATE = (Math.PI * 2) / SHOWCASE_PERIOD

/**
 * Any body with a surface: planet, dwarf planet or moon.
 *
 * This was `Planet` until moons arrived, and generalising it rather than
 * writing a second component was the easy call — selection, hover, the emissive
 * response, the drag-guarded click, the axial tilt group and the raycast hit
 * sphere are identical for a moon and for Jupiter. What actually differs is
 * two lines: which curve sizes the sphere, and whether the orbit is solved
 * about the Sun or about a parent.
 *
 * Everything genuinely planet-specific is already behind a guard — Earth's
 * night lights and its NASA maps on `id === 'earth'`, rings on a field no moon
 * carries — so none of it needed touching.
 */
function Body({ planet }) {
  const { id, elements, rotationHours, color, parent: parentId, plane } = planet

  const orbitRef = useRef()
  const spinRef = useRef()

  /**
   * Which way the body turns: +1 prograde, -1 retrograde.
   *
   * `rotationHours` carries the sign — `planetData.js` and `bodies.js` both
   * build it as `dayHours * (retrograde ? -1 : 1)` — so this reads the same
   * fact `spinAt` does rather than a second copy of it. The `|| 1` is for a
   * body with no period at all, which would otherwise get `Math.sign(0) === 0`
   * and a turntable that never moves.
   */
  const spinDirection = Math.sign(rotationHours) || 1

  const scaleMode = useStore((s) => s.scaleMode)
  const radius = bodyRadius(planet, scaleMode)

  // Resolved once. A moon needs its parent's size and tilt every frame, and
  // looking them up in the registry sixty times a second for a value that
  // never changes would be pure waste.
  const parent = parentId ? BODIES_BY_ID[parentId] : null
  const clearance = parent ? satelliteClearance(parent, RING_PRESETS) : 0

  // Scratch objects reused every frame. Positions are recomputed from the clock
  // each time rather than accumulated, so nothing here is state — but it must
  // also never allocate, at 60 fps across every body in the scene.
  const eclipticAU = useRef({ x: 0, y: 0, z: 0 })
  const world = useRef({ x: 0, y: 0, z: 0 })
  const worldPos = useRef(registerPlanetPosition(id))
  const sunDir = useRef(new THREE.Vector3(0, 0, 1))
  // Refilled every frame; the positions inside are the registry's own vectors,
  // so nothing is copied and nothing is allocated.
  const occluderScratch = useRef([])

  const [hovered, setHovered] = useState(false)

  /** Accumulated turntable angle. Only ever grows; see the frame callback. */
  const showcase = useRef(0)

  // A NASA model, where one is shipped for this body — twenty of the
  // twenty-three are. Each brings a mesh and its own maps in one file, and the
  // two have to be used together: several of these textures are cube-map
  // atlases that only make sense through the mesh's own UV unwrap. Earth, Mars
  // and Neptune have no model and take the texture-set path below.
  const surface = getBodySurface(id)

  /*
   * Earth's maps come from NASA's model too, but by a different route.
   *
   * That model is a cube-map cross on a 3,072-triangle sphere. Every other body
   * in the set is drawn with its own mesh for exactly that reason — a cube atlas
   * is unreadable without the unwrap it was authored against — but Earth is the
   * body the camera actually lands on, and a quarter of the app's own sphere
   * density shows. It is also the only body with a *second* map read through the
   * same coordinates, the night lights, which are equirectangular.
   *
   * So `prepare-earth-maps.mjs` resamples the atlas to equirectangular ahead of
   * time and Earth keeps the 96x64 sphere below, its night lights, and a normal
   * map it did not have before.
   *
   * The cloud deck comes with it, composited into the colour map. That is why
   * there is no cloud shell here any more: drawing one over this would be two
   * sets of weather. What it costs is the drift — the old shell turned slowly
   * against the surface — and what it buys is a sharper, better-registered deck
   * than a separate alpha-mapped sphere could give.
   */
  const nasaEarth = id === 'earth' ? getTexture('earth-nasa') : null
  const map = nasaEarth ?? surface?.map ?? getTexture(id)
  const nightMap = id === 'earth' ? getTexture('earth-night') : null

  const selectPlanet = useStore((s) => s.selectPlanet)
  const setHovered_ = useStore((s) => s.setHovered)
  const isSelected = useStore((s) => s.selectedId === id)

  // Ceres and Haumea are the only two bodies whose model carries a normal map.
  // It is worth having: it lights real relief rather than painting shadows into
  // the colour, so craters catch the sun and turn with the body instead of
  // staying put. Haumea gains the most — its mesh is only 559 vertices, so
  // nearly all of its surface detail is in this map.
  const normalMap =
    (id === 'earth' ? getTexture('earth-nasa-normal') : null) ?? surface?.normalMap ?? null

  /*
   * Who can put this body in shadow.
   *
   * Only ever something in the same system. A planet is eclipsed by its own
   * moons — Io's shadow crossing Jupiter is the one everybody recognises — and a
   * moon by its planet or by a sibling. Nothing else in the scene can ever come
   * between a body and the Sun, so nothing else is worth testing per fragment.
   *
   * Resolved once. The membership never changes; only the positions do.
   */
  const occluders = useMemo(() => {
    if (parent) return [parent, ...systemMoonsOf(parent.id).filter((m) => m.id !== id)]
    return systemMoonsOf(id)
  }, [id, parent])

  const rings = planet.rings ? RING_PRESETS[planet.rings] : null
  const ringMap = rings ? getTexture(rings.texture) : null

  const uniforms = useMemo(() => shadowUniforms(), [])

  /*
   * The colour the surface sits at when nothing is hovered or selected.
   *
   * Hover and selection used to be an *emissive* term, and that turned out to
   * be the single biggest thing stopping this scene from having real shadows.
   * Emissive is added after lighting, so it lifts the night side exactly as
   * much as the day side: a selected Venus measured rgb(81, 60, 27) across its
   * unlit hemisphere, of which roughly two thirds was this glow. The planet
   * read as evenly brown all the way round with a seam down the middle.
   *
   * Brightening the *diffuse* colour instead gives the same feedback where it
   * is actually visible and none where it should not be, because diffuse is
   * multiplied by incoming light. The dark side is left with a 30% lift on a
   * near-zero number, which is nothing.
   */
  const baseColor = useMemo(() => new THREE.Color(map ? '#ffffff' : color), [map, color])
  const highlight = useRef(0)

  /*
   * Every body renders untone-mapped.
   *
   * ACES is a film transform: it rolls off highlights and pulls the saturation
   * out of them. That was found the roundabout way — the sun-glow toggle used
   * to switch tone mapping off scene-wide as a side effect (see
   * `ToneMappingGuard`), and the look people liked with the glow on was never
   * the glow, it was the missing tone map. Earth was exempted first, because
   * the roll-off took its ocean from deep blue to a washed grey; the same
   * flattening applies to every other surface, just less obviously.
   *
   * So the exemption is now the rule and the whole scene keeps the glow-on
   * colours in both states. Safe because the lit side of a body stays under 1.0
   * with this ambient and this sun — there is nothing for the roll-off to have
   * rescued and nothing that clips without it. The sun's own materials were
   * already `toneMapped={false}`, which is what keeps the bloom threshold at
   * 1.0 meaningful: the sun clears it and nothing else does.
   */
  const toneMapped = false

  // Build the surface material once so the shader patches compile a single time.
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      map: map || undefined,
      normalMap: normalMap || undefined,
      color: baseColor.clone(),
      roughness: 0.92,
      metalness: 0,
      toneMapped,
    })
    if (nightMap) attachNightLights(mat, nightMap)
    attachShadows(mat, uniforms)
    return mat
  }, [map, normalMap, nightMap, baseColor, uniforms, toneMapped])

  // The rings' own shadow, cast onto the planet wearing them. Saturn's is the
  // one worth having: a hard dark band with the Cassini Division drawn through
  // it as a bright stripe, straight out of the ring texture's alpha.
  useMemo(() => {
    uniforms.uHasRings.value = rings && ringMap ? 1 : 0
    if (!rings || !ringMap) return
    uniforms.uRingMap.value = ringMap
    ringNormal(id, uniforms.uRingNormal.value)
  }, [uniforms, rings, ringMap, id])

  /*
   * The body's own frame, replacing a lean of the right size about the wrong
   * axis.
   *
   * This used to be `rotation={[0, 0, axialTilt * DEG]}` — one angle, so every
   * planet leaned the same way and no planet's seasons were in phase with the
   * real ones. It is now the full orientation built from the IAU pole; see
   * `pole.js` for what that fixed and what it deliberately did not.
   *
   * Memoised on `id` because the poles are constants: this is one quaternion
   * per body for the life of the app.
   */
  const orientation = useMemo(() => {
    const basis = bodyBasis(id)
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(basis.x.x, basis.x.y, basis.x.z),
      new THREE.Vector3(basis.y.x, basis.y.y, basis.y.z),
      new THREE.Vector3(basis.z.x, basis.z.y, basis.z.z),
    )
    return new THREE.Quaternion().setFromRotationMatrix(m)
  }, [id])

  useFrame((_, delta) => {
    // The clock is advanced once per frame by <SimulationClock>, not here —
    // every body must read the *same* instant or they would drift apart by a
    // frame's worth of motion each.
    const jd = simClock.jd

    // Solve the real orbit at the current date, then compress the result to
    // world units. Nothing accumulates: the position is a pure function of the
    // date, so scrubbing time, pausing, or dropping frames can't cause drift.
    positionAt(elements, centuriesSinceJ2000(jd), eclipticAU.current)

    let x
    let y
    let z

    if (parent) {
      // The elements above are about the *parent*, so this is an offset, not a
      // position. Adding the parent's own world position is what nests the
      // frames — and it depends on the parent having already run this frame,
      // which is why `Scene` mounts every primary before every satellite.
      /*
       * A satellite is an offset, so with no parent position there is no position
       * to compute — and the failure mode is silent rather than loud, which is why
       * this guard is here rather than left to the invariant.
       *
       * `planetPositions` hands out a zero vector for any id asked for, so a moon
       * whose parent is not in the scene used to resolve to the world origin: five
       * of Pluto's moons were drawn, labelled and made clickable inside the Sun
       * whenever Moons was on and Dwarf planets was off. `bodyShown` now stops
       * that combination from mounting at all, and this makes the collapse
       * impossible rather than merely unreachable — bailing leaves the body at its
       * previous position for a frame instead of teleporting it to the centre.
       */
      const parentPos = planetPositions.get(parent.id)
      if (!parentPos) return

      satelliteOffset(
        eclipticAU.current,
        parent,
        warpRadius(parent.radiusKm, scaleMode),
        clearance,
        plane,
        scaleMode,
        world.current,
      )
      x = parentPos.x + world.current.x
      y = parentPos.y + world.current.y
      z = parentPos.z + world.current.z
    } else {
      ;({ x, y, z } = warpHeliocentric(eclipticAU.current, scaleMode, world.current))
    }

    if (orbitRef.current) orbitRef.current.position.set(x, y, z)
    worldPos.current.set(x, y, z)

    /*
     * Likewise derived from the date rather than accumulated. `spinAt` returns
     * an absolute angle, so the spin always agrees with the displayed date even
     * after a rate change or a jump to a new time.
     *
     * The turntable is the one exception, and it has to *accumulate* — which is
     * why it is added on rather than folded into the date. Scaling an absolute
     * angle by the scroll would run the body backwards on the way down; adding
     * a rate that the scroll scales means the angle only ever moves one way, so
     * scrolling up and down eases the spin rather than rewinding it.
     */
    if (isSelected) {
      // Rate scales with the scroll, so the turntable eases to a dead stop as
      // the page comes back up and holds there. Nothing unwinds while you are
      // still parked at the body: the offset simply stays where the gesture
      // left it, and picks up again if you scroll down a second time.
      //
      // Signed by the body's own spin, so the turntable turns Venus, Uranus and
      // Pluto backwards — see `SHOWCASE_RATE`. The monotonic property above
      // survives: the angle still only ever moves one way, that way is just
      // negative for these three.
      if (viewScroll.p > 0) {
        showcase.current += spinDirection * SHOWCASE_RATE * viewScroll.p * delta
      }
    } else if (showcase.current !== 0) {
      /*
       * Unwound once you leave the body, and only then.
       *
       * The offset is a presentation device, but it is still a lie about where
       * the body is pointing — leave it in place and this planet's rotation no
       * longer agrees with the date, permanently, because you once looked at
       * it. Zeroing it outright would snap the surface round, so it eases out.
       *
       * The condition is `isSelected`, not "is the turntable running", and the
       * difference is the whole point: gated on the latter, scrolling back up
       * to the scene started a two-second unwind with the camera still parked
       * a few radii away, watching the planet drift backwards to a stop. Here
       * it can only happen once the flight home is already under way, where the
       * body is a handful of pixels.
       */
      showcase.current = THREE.MathUtils.damp(showcase.current, 0, 1.6, delta)
      if (Math.abs(showcase.current) < 1e-4) showcase.current = 0
    }
    // Paused is a dead stop, not a rate of zero held in `timeRate` — so the
    // cap has to be told the clock is not running, or a body would sit at its
    // capped orientation instead of the true one for the date on screen.
    const clock = useStore.getState()
    // A null period means nobody has measured one — seven of the comets. The
    // nucleus is held still rather than turned at an invented rate; `spinAt`
    // would divide by zero and hand back NaN, which silently removes the mesh.
    const spin =
      (rotationHours ? spinAt(jd, rotationHours, clock.paused ? 0 : clock.timeRate) : 0) +
      showcase.current
    if (spinRef.current) spinRef.current.rotation.y = spin
    // Published for anything standing on this body. Recomputing it elsewhere
    // would mean copying this expression — cap, pause and turntable included —
    // and a copy that drifts by a degree slides a rover a hundred kilometres.
    setPlanetSpin(id, spin)

    /*
     * Shadow uniforms, in render space.
     *
     * Positions come from the shared registry rather than from the scene graph,
     * because a moon's world matrix is not composed until three walks the tree —
     * after every `useFrame` has run. The registry is written at the top of this
     * same callback for every body, and `Scene` mounts primaries before
     * satellites, so by the time a moon reads its parent the value is current.
     */
    uniforms.uSunRadius.value = warpSunRadius(scaleMode)

    occluderScratch.current.length = 0
    for (const body of occluders) {
      const position = planetPositions.get(body.id)
      if (position) {
        occluderScratch.current.push({ position, radius: bodyRadius(body, scaleMode) })
      }
    }
    setOccluders(uniforms, occluderScratch.current)

    if (uniforms.uHasRings.value) {
      uniforms.uRingCentre.value.set(x, y, z)
      uniforms.uRingInner.value = radius * rings.inner
      uniforms.uRingOuter.value = radius * rings.outer
    }

    // The Sun is at the origin, so the direction to it is just the negated
    // position. Feeds the night-lights shader.
    if (nightMap) {
      sunDir.current.set(-x, -y, -z).normalize()
      material.userData.uSunDirection.value.copy(sunDir.current)
    }

    // Larger numbers than the emissive ones they replace, because a diffuse
    // lift only shows on the lit hemisphere and so has to work harder there to
    // read as the same amount of feedback.
    const target = hovered ? 0.4 : isSelected ? 0.18 : 0
    highlight.current = THREE.MathUtils.damp(highlight.current, target, 6, delta)
    material.color.copy(baseColor).multiplyScalar(1 + highlight.current)
  }, framePriority.BODIES)

  const onOver = useCallback(
    (e) => {
      e.stopPropagation()
      setHovered(true)
      setHovered_(id)
      document.body.style.cursor = 'pointer'
    },
    [id, setHovered_],
  )

  const onOut = useCallback(
    (e) => {
      e.stopPropagation()
      setHovered(false)
      setHovered_(null)
      document.body.style.cursor = 'auto'
    },
    [setHovered_],
  )

  const onClick = useCallback(
    (e) => {
      e.stopPropagation()
      // Letting go of an orbit drag over a planet shouldn't select it.
      if (wasDragged()) return
      selectPlanet(id)
    },
    [id, selectPlanet],
  )

  return (
    <group ref={orbitRef}>
      {/* Unit spheres scaled by `radius`, rather than geometry built at that
          radius. The scale setting can change every frame while the user drags
          it, and rebuilding a 96x64 sphere per planet per frame would stutter;
          a scale is one matrix. */}
      <group quaternion={orientation}>
        {/* The model's mesh where there is one, and a sphere otherwise. Both
            arrive at unit radius — `prepare-nasa-model.mjs` divides NASA's
            vertices through by the mesh's own bounding radius for exactly this
            reason — so the scale below is the only thing that sizes a body,
            whichever geometry it is wearing. */}
        <mesh
          ref={spinRef}
          material={material}
          geometry={surface?.geometry}
          renderOrder={0}
          scale={radius}
        >
          {!surface && <sphereGeometry args={[1, 96, 64]} />}
        </mesh>

        {/* Rings share the tilt group with the surface — and, by way of
            `satelliteFrame.js`, with the parent's moons. Titan being coplanar
            with Saturn's rings is not arranged; it falls out of both reading
            the same basis from `pole.js`. */}
        {rings && <Rings radius={radius} preset={rings} bodyId={id} />}
      </group>

      {/* No atmospheric limb glow. Seven of the planets carried one — a
          coloured halo standing off the limb, blue on Earth, gold on Venus —
          and it is gone by request: it read as a tint hanging around the body
          rather than as air. `Atmosphere.jsx` and each body's `glow` field are
          left in place, unread, so the effect can be put back or offered as a
          layer without rebuilding the shader. */}

      {/* Invisible-but-raycastable hit sphere. Distant planets are only a few
          pixels across, and this makes them comfortably clickable. It uses a
          zero-opacity material rather than `visible={false}`, because the
          raycaster skips objects that aren't visible. */}
      {/* No hover name tag. Up close the planet covers the viewport, so the
          cursor is over it almost all the time and the label was effectively
          always on. The nav bar names every planet and the close-up carries a
          title of its own, so nothing is lost. Hovering still lights the planet
          and changes the cursor. */}
      <mesh onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} scale={radius * 2.6}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

export default memo(Body)
