import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { warpSunDistance } from '../orbit/frames'
import { simClock, useStore } from '../store/useStore'

const COUNT = 1200

/**
 * The main belt's real extent, in AU.
 *
 * The scene previously hardcoded 48–61 world units, which inverts to 2.42–4.08
 * AU — a belt sitting well outside where the rocks actually are. These are the
 * real edges, and because they are now in AU they follow the scale setting like
 * everything else.
 */
const BELT_INNER_AU = 2.06
const BELT_OUTER_AU = 3.28

/**
 * Mean orbital period at the middle of the belt: a = 2.67 AU, so by Kepler's
 * third law T = a^1.5 years. Drives the belt's drift from the simulation clock
 * rather than from a hand-picked constant.
 */
const BELT_PERIOD_DAYS = 2.67 ** 1.5 * 365.25

/** Width of the band at scaleMode 0, the scale the rock sizes were tuned at. */
const DIORAMA_BAND_WIDTH = warpSunDistance(BELT_OUTER_AU, 0) - warpSunDistance(BELT_INNER_AU, 0)

/**
 * The asteroid belt between Mars and Jupiter.
 *
 * One instanced mesh, with every transform baked in once at mount. Per-frame
 * cost is a single rotation on the parent group rather than 1,200 matrix
 * updates — the belt drifts as a unit, which at this scale is indistinguishable
 * from animating each rock individually.
 */
export default function AsteroidBelt() {
  const groupRef = useRef()
  const meshRef = useRef()

  const scaleMode = useStore((s) => s.scaleMode)

  // Deterministic pseudo-random so the belt is identical on every load.
  const rocks = useMemo(() => {
    let seed = 20260727
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }

    const inner = warpSunDistance(BELT_INNER_AU, scaleMode)
    const outer = warpSunDistance(BELT_OUTER_AU, scaleMode)
    // The belt's real thickness is a few tenths of an AU — comparable to its
    // width — so scale it with the band rather than leaving it a fixed 2.4.
    const thickness = (outer - inner) * 0.19

    return Array.from({ length: COUNT }, () => {
      // Bias toward the middle of the belt, and leave the Kirkwood-ish edges
      // sparser, so it reads as a band rather than a uniform annulus.
      const t = (rand() + rand() + rand()) / 3
      const radius = inner + t * (outer - inner)
      return {
        radius,
        angle: rand() * Math.PI * 2,
        y: (rand() - 0.5) * thickness,
        // Rock sizes were hand-picked against the diorama's band width, so they
        // are carried across proportionally rather than left absolute.
        scale: (0.035 + rand() ** 2 * 0.16) * ((outer - inner) / DIORAMA_BAND_WIDTH),
        rotation: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI],
      }
    })
  }, [scaleMode])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const euler = new THREE.Euler()
    const scale = new THREE.Vector3()

    rocks.forEach((rock, i) => {
      position.set(Math.cos(rock.angle) * rock.radius, rock.y, Math.sin(rock.angle) * rock.radius)
      euler.set(...rock.rotation)
      quaternion.setFromEuler(euler)
      scale.setScalar(rock.scale)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [rocks])

  useFrame(() => {
    if (!groupRef.current) return
    // The belt drifts as one body at the mean orbital rate for its distance —
    // driven by the clock, so it stays in step with the planets when the time
    // rate changes. Individual rocks don't get their own orbits: 1,200 Kepler
    // solves a frame would cost more than the effect is worth, and the
    // differential rotation across the band is invisible at this scale.
    // Positive rotation about +Y is counterclockwise seen from the north, which
    // is the direction everything in the solar system actually orbits.
    groupRef.current.rotation.y = ((simClock.jd / BELT_PERIOD_DAYS) % 1) * Math.PI * 2
  })

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#8a8073" roughness={0.95} metalness={0.05} flatShading />
      </instancedMesh>
    </group>
  )
}
