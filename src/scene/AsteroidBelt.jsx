import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  ASTEROID_COUNT,
  ASTEROID_FAMILY,
  ASTEROIDS,
  ASTEROID_STRIDE,
  asteroidElements,
} from '../data/asteroids'
import { centuriesSinceJ2000, positionAt } from '../orbit/kepler'
import { warpHeliocentric, warpSunDistance } from '../orbit/frames'
import { simClock, useStore } from '../store/useStore'

/**
 * The asteroids, where they actually are.
 *
 * This replaced a procedural cloud: 1,200 rocks scattered by a seeded random
 * between two hand-set radii, drifting as one rigid ring. It read as a belt and
 * was not one. It had no Kirkwood gaps, no families, no Trojans, and not one of
 * its rocks was anywhere anything has ever been — the last piece of invented
 * geometry in the scene.
 *
 * Now every one of the 3,436 objects here is a real body on its real orbit,
 * solved from JPL's elements by the same Kepler code the planets use. The
 * gaps, the Trojan camps sixty degrees either side of Jupiter and the Hildas'
 * three-cornered figure are all *emergent* — nothing draws them, they are
 * simply what the population does.
 *
 * ## Solved on a budget, not every frame
 *
 * 3,436 Kepler solves and a 220 KB matrix upload is affordable at sixty hertz
 * and pointless: the fastest rock here moves a thousandth of a degree in a day.
 * So the positions are recomputed when the *clock* has moved far enough to show
 * — which at a paused clock is never, and at a century a second is every frame.
 * The threshold is in simulated days rather than in wall time, so it follows
 * the time rate instead of fighting it.
 *
 * ## What the sizes mean
 *
 * Nothing. A twenty-kilometre rock at true scale is far under a pixel from any
 * distance you would look at the belt from, so drawing them to scale would draw
 * nothing at all. These are markers sized to read, exactly as the spacecraft
 * are, and their *positions* are the claim being made. The brightest few are
 * drawn slightly larger so that Vesta and Pallas stand out from the crowd they
 * are genuinely much bigger than.
 */

/** Simulated days the clock must move before the belt is re-solved. */
const RESOLVE_DAYS = 0.6

/**
 * Marker size, as a fraction of the belt's own width.
 *
 * **Not a distance in AU put through `warpSunDistance`**, which was the first
 * attempt and produced boulders the size of Mercury's orbit. That function
 * warps a *heliocentric radius*, and the warp is strongly compressive — it maps
 * 0.006 AU to a large fraction of a world unit, because at diorama scale the
 * inner system is stretched enormously relative to the outer. A size is not a
 * radius and cannot go through it.
 *
 * Measured against the band instead, which is the quantity a rock has to look
 * small next to at either end of the dial.
 */
const ROCK_SIZE = 0.004

/** The belt's real edges, in AU, used only to measure the band. */
const BELT_INNER_AU = 2.06
const BELT_OUTER_AU = 3.28

/** How much larger the brightest are than the faintest. */
const SIZE_BY_MAGNITUDE = 2.6

/**
 * The smallest angle a rock may subtend, in radians.
 *
 * Sized against the band, a rock is about a tenth of a world unit at diorama
 * scale — and the opening shot spans nine hundred units across sixteen hundred
 * pixels, so every one of them lands on a fifth of a pixel and the belt simply
 * is not there. Sizing them large enough to read from out there instead would
 * make them boulders the width of Mars' orbit up close.
 *
 * So the size is floored in *angle*, which is the same move `Sun.jsx` makes for
 * its corona and `Spacecraft` makes for its markers, and for the same reason:
 * this scene spans nine orders of magnitude and only angles mean anything
 * across all of it. 0.0006 rad is about half a pixel in a sixty-degree view —
 * enough for the band to exist without any single rock claiming to be a world.
 */
const MIN_ROCK_ANGLE = 0.0006

/**
 * How much the camera must move before the floor is recomputed.
 *
 * A ratio rather than a distance, because the floor is proportional to range:
 * a tenth of a decade is finer than anything visible and still lets a zoom
 * follow smoothly. Same rule the near plane uses.
 */
const RESOLVE_ZOOM = 0.1

const _element = {}
const _position = { x: 0, y: 0, z: 0 }
const _world = { x: 0, y: 0, z: 0 }
const _matrix = new THREE.Matrix4()
const _vector = new THREE.Vector3()
const _quaternion = new THREE.Quaternion()
const _scale = new THREE.Vector3()

/**
 * Family colours, and they are not decoration.
 *
 * The Trojans and the Hildas are the two populations in this range that are
 * shaped by a resonance rather than by collisions, and tinting them is what
 * makes that visible at a glance — otherwise the camps read as two random
 * thickenings of a band that happens to reach Jupiter.
 */
const FAMILY_COLOURS = [
  new THREE.Color('#8a8073'), // main belt: the rock colour the old cloud used
  new THREE.Color('#b98f5a'), // Jupiter Trojans
  new THREE.Color('#7f93a8'), // Hildas
]

export default function AsteroidBelt() {
  const meshRef = useRef(null)
  const scaleMode = useStore((s) => s.scaleMode)
  const solvedAt = useRef({ jd: null, scale: null, range: 1 })

  /*
   * Sizes and colours, which depend on nothing that changes. Magnitude runs
   * from about -1 (Vesta) to the cut at 12.2, and it is a log scale already, so
   * a linear map across it is the right shape.
   */
  const look = useMemo(() => {
    const sizes = new Float32Array(ASTEROID_COUNT)
    const colours = new Float32Array(ASTEROID_COUNT * 3)
    let brightest = Infinity
    let faintest = -Infinity
    for (let n = 0; n < ASTEROID_COUNT; n++) {
      const H = ASTEROIDS[n * ASTEROID_STRIDE + 7]
      if (H < brightest) brightest = H
      if (H > faintest) faintest = H
    }
    for (let n = 0; n < ASTEROID_COUNT; n++) {
      const H = ASTEROIDS[n * ASTEROID_STRIDE + 7]
      const bright = 1 - (H - brightest) / Math.max(1e-6, faintest - brightest)
      sizes[n] = 1 + bright * (SIZE_BY_MAGNITUDE - 1)
      const colour = FAMILY_COLOURS[ASTEROID_FAMILY[n]] ?? FAMILY_COLOURS[0]
      colours[n * 3] = colour.r
      colours[n * 3 + 1] = colour.g
      colours[n * 3 + 2] = colour.b
    }
    return { sizes, colours }
  }, [])

  /*
   * A fixed random orientation each, so the facets catch the light differently
   * and the field does not read as a swarm of identical dice. Deterministic, so
   * it is the same on every load.
   */
  const spins = useMemo(() => {
    let seed = 20260814
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    const out = new Float32Array(ASTEROID_COUNT * 4)
    const euler = new THREE.Euler()
    const q = new THREE.Quaternion()
    for (let n = 0; n < ASTEROID_COUNT; n++) {
      euler.set(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2)
      q.setFromEuler(euler)
      out.set([q.x, q.y, q.z, q.w], n * 4)
    }
    return out
  }, [])

  useFrame(({ camera }) => {
    const mesh = meshRef.current
    if (!mesh) return

    const jd = simClock.jd
    // The belt is centred on the Sun, which is the origin.
    const range = camera.position.length()
    const was = solvedAt.current
    if (
      was.jd !== null &&
      was.scale === scaleMode &&
      Math.abs(jd - was.jd) < RESOLVE_DAYS &&
      Math.abs(Math.log(range / was.range)) < RESOLVE_ZOOM
    ) {
      return
    }
    solvedAt.current = { jd, scale: scaleMode, range }

    const T = centuriesSinceJ2000(jd)
    const band =
      warpSunDistance(BELT_OUTER_AU, scaleMode) - warpSunDistance(BELT_INNER_AU, scaleMode)
    // Whichever is larger: the rock's own marker size, or the angular floor.
    const size = Math.max(band * ROCK_SIZE, range * MIN_ROCK_ANGLE)

    for (let n = 0; n < ASTEROID_COUNT; n++) {
      asteroidElements(n, _element)
      positionAt(_element, T, _position)

      /*
       * The whole trip in one call — warp the heliocentric radius onto the
       * drawn scale, then swap the ecliptic's Z-up for three's Y-up. The same
       * function every planet's position goes through, so a rock and a planet
       * can never end up in subtly different frames.
       */
      warpHeliocentric(_position, scaleMode, _world)
      _vector.set(_world.x, _world.y, _world.z)

      _quaternion.set(spins[n * 4], spins[n * 4 + 1], spins[n * 4 + 2], spins[n * 4 + 3])
      _scale.setScalar(size * look.sizes[n])
      _matrix.compose(_vector, _quaternion, _scale)
      mesh.setMatrixAt(n, _matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, ASTEROID_COUNT]}
      frustumCulled={false}
    >
      <dodecahedronGeometry args={[1, 0]}>
        <instancedBufferAttribute attach="attributes-color" args={[look.colours, 3]} />
      </dodecahedronGeometry>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0.05} flatShading />
    </instancedMesh>
  )
}
