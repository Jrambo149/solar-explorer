import { useEffect, useMemo, useRef } from 'react'
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
 * The angular floor, and why it is far smaller than it was.
 *
 * It started at 0.0006 rad — about half a pixel in a sixty-degree view — on the
 * reasoning that a rock a fifth of a pixel across is a rock nobody can see, so
 * the belt would simply not be there at the opening shot.
 *
 * That reasoning was right about one rock and wrong about three thousand. A
 * floor applies to *every* rock at once, so the whole population is held at
 * minimum legibility however far away it is, and the belt never fades: at the
 * overview it came out as three and a half thousand hard specks scattered
 * across the middle of the screen, over the inner planets, at full brightness.
 * The procedural cloud this replaced had no floor at all, and *that* is why it
 * read as a soft band rather than as noise — its distant rocks fell under a
 * pixel and dimmed away, which is what distance is supposed to do.
 *
 * So the floor is halved, to the measured *mean* of the old cloud rather than
 * to its maximum. The numbers, at the opening shot:
 *
 * - old cloud, no floor: 0.12 to 0.65 px, mean 0.27 — a dusting in which only
 *   the largest rocks register at all
 * - floored at 0.0006:   0.53 to 1.4 px — every rock legible, all 3,436 of them
 * - floored at 0.0003:   0.26 to 0.68 px — the old distribution, near enough
 *
 * The floor sets the *base* size and the magnitude spread multiplies on top of
 * it, so lowering it restores the variation as well as the dimness: at 0.0006
 * the faintest rock and the brightest were both plainly visible, and a
 * population drawn at uniform legibility is exactly what reads as noise instead
 * of as texture.
 */
const MIN_ROCK_ANGLE = 0.0003

/**
 * How much the camera must move before the floor is recomputed.
 *
 * A ratio rather than a distance, because the floor is proportional to range:
 * a tenth of a decade is finer than anything visible and still lets a zoom
 * follow smoothly. Same rule the near plane uses.
 */
const RESOLVE_ZOOM = 0.1

/**
 * How many rocks are drawn, against how far away the camera is.
 *
 * The belt is a *population*, and the honest way to draw a population from far
 * away is to draw fewer of them — not to draw all of them smaller, which is
 * what the angular floor was quietly preventing. Thinning is what a star chart
 * does with faint stars and what this app already does with labels: past a
 * certain point the extra members carry no information and cost legibility.
 *
 * The rocks are ordered brightest first, so a thinned belt is the belt you
 * would actually see — the big ones — rather than an arbitrary sample of it.
 * The Kirkwood gaps, the Trojan camps and the Hilda triangle are all still
 * there at 1,200, because they are properties of *where* the rocks are and the
 * brightest 1,200 are distributed the same way.
 *
 * 1,200 is the count the procedural cloud used, which is not a coincidence: it
 * is the number that looked right on this scene before, and the complaint that
 * sent me back here was that 3,436 does not.
 */
const FAR_COUNT = 1200

/**
 * How far away the belt is drawn in full, and how far away it is thinned — in
 * *band widths*, not world units.
 *
 * These were 40 and 220 world units, tuned by eye at the diorama end of the
 * dial, and they were wrong everywhere else. The band is 10.4 units wide at
 * diorama and 122 at true scale, so 220 units means twenty-one band widths at
 * one end of the dial and 1.8 at the other: at true scale you would be standing
 * inside the belt and it would still be drawn thinned.
 *
 * The band is the only length here that means the same thing at every scale, so
 * distance is measured in it. Four band widths away the whole population is
 * drawn; twenty-one away it is down to `FAR_COUNT`. This app has been caught by
 * an absolute length surviving the scale dial before.
 */
const NEAR_BANDS = 4
const FAR_BANDS = 21

function beltCount(range, band) {
  if (!(band > 0)) return ASTEROID_COUNT
  const bands = range / band
  const t = THREE.MathUtils.clamp(
    (Math.log(bands) - Math.log(NEAR_BANDS)) / (Math.log(FAR_BANDS) - Math.log(NEAR_BANDS)),
    0,
    1,
  )
  return Math.round(THREE.MathUtils.lerp(ASTEROID_COUNT, FAR_COUNT, t))
}

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
    let brightest = Infinity
    let faintest = -Infinity
    for (let n = 0; n < ASTEROID_COUNT; n++) {
      const H = ASTEROIDS[n * ASTEROID_STRIDE + 7]
      if (H < brightest) brightest = H
      if (H > faintest) faintest = H
    }

    /*
     * Instance slots in order of brightness, not in catalogue order.
     *
     * This is what makes thinning honest. `instancedMesh.count` draws the first
     * *n* slots, so whichever rocks sit at the front are the ones that survive
     * being far away — and the ones that should survive are the ones you could
     * actually see. Sorting once here means the renderer never has to choose.
     *
     * Everything below is written in this order too, so slot `i` is asteroid
     * `order[i]` throughout: sizes, colours, spins and matrices all agree, and
     * there is exactly one place where the mapping exists.
     */
    const order = Uint16Array.from({ length: ASTEROID_COUNT }, (_, n) => n).sort(
      (a, b) => ASTEROIDS[a * ASTEROID_STRIDE + 7] - ASTEROIDS[b * ASTEROID_STRIDE + 7],
    )

    const sizes = new Float32Array(ASTEROID_COUNT)
    const colours = new Float32Array(ASTEROID_COUNT * 3)
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      const n = order[i]
      const H = ASTEROIDS[n * ASTEROID_STRIDE + 7]
      const bright = 1 - (H - brightest) / Math.max(1e-6, faintest - brightest)
      sizes[i] = 1 + bright * (SIZE_BY_MAGNITUDE - 1)
      const colour = FAMILY_COLOURS[ASTEROID_FAMILY[n]] ?? FAMILY_COLOURS[0]
      colours[i * 3] = colour.r
      colours[i * 3 + 1] = colour.g
      colours[i * 3 + 2] = colour.b
    }
    return { order, sizes, colours }
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

  /*
   * Which asteroid is in which instance slot, for the checks.
   *
   * The slots are in brightness order rather than catalogue order — see `look`
   * — so anything reading the drawn matrices needs the mapping to say what it
   * is looking at. `verify-asteroids` reads family membership per slot, and
   * without this it silently read the wrong family for every rock.
   *
   * The same arrangement as the rest of `__solar`: DEV only, and a handle onto
   * state the app deliberately keeps out of React.
   */
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined' || !window.__solar) return undefined
    window.__solar.beltOrder = look.order
    return () => {
      delete window.__solar.beltOrder
    }
  }, [look])

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

    // Fewer of them the further away you are — see `beltCount`.
    const count = beltCount(range, band)
    mesh.count = count

    for (let i = 0; i < count; i++) {
      const n = look.order[i]
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

      _quaternion.set(spins[i * 4], spins[i * 4 + 1], spins[i * 4 + 2], spins[i * 4 + 3])
      _scale.setScalar(size * look.sizes[i])
      _matrix.compose(_vector, _quaternion, _scale)
      mesh.setMatrixAt(i, _matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  })

  return (
    <instancedMesh
      ref={meshRef}
      name="asteroid-belt"
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
