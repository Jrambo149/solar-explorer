import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BODIES_BY_ID, bodyRadius, bodyShown } from '../data/bodies'
import { EVENTS } from '../data/events'
import { eclipseTrack } from '../orbit/eclipsePath'
import { planetPositions, simClock, useStore } from '../store/useStore'
import { bodyBasis } from './pole'
import { surfaceDirection, surfaceSpin } from './surface'

/**
 * The eclipse's track, drawn on the ground.
 *
 * The shader already darkens the Earth where the shadow is, which shows one
 * instant perfectly and answers none of the questions people actually have.
 * "Did it come near me" is a question about the whole path, and on 12 August
 * 2026 the difference matters more than usual: greatest eclipse is over the
 * Atlantic north of Iceland, and Spain — where most of Europe watched it — is
 * forty-five minutes further along, by which time the shadow is sitting on the
 * terminator and hard to pick out at all.
 *
 * ## Fixed to the ground, not to space
 *
 * The band is built once per eclipse in **body-fixed** coordinates and then
 * carried by the Earth's own rotation, which is the same arrangement the rovers
 * use — see `surface.js`. That is not an optimisation. A track over the ground
 * genuinely does not move when the Earth turns; building it in world space
 * would mean recomputing every vertex each frame *and* would leave the path
 * sliding across the continents at fifteen degrees an hour.
 *
 * The transform has to match `Body.jsx` exactly, for the same reason and with
 * the same failure: `basis · R_y(spin)`, where a single axis out of place puts
 * the path in the wrong ocean and looks like an error in the eclipse rather
 * than in a matrix.
 */

/** How far above the surface the band floats, as a fraction of the radius. */
const LIFT = 1.0015

/** Only bother while the shadow is actually on the Earth, plus a little. */
const NEAR_HOURS = 3

/** The solar eclipse in progress at `jd`, or null. */
function eclipseNear(jd) {
  const window = NEAR_HOURS / 24
  for (const event of EVENTS) {
    if (event.kind !== 'solar-eclipse') continue
    if (Math.abs(event.jd - jd) <= window) return event
    if (event.jd > jd + window) break
  }
  return null
}

export default function EclipsePath() {
  const scaleMode = useStore((s) => s.scaleMode)
  const layers = useStore((s) => s.layers)
  const displayJD = useStore((s) => s.displayJD)

  const groupRef = useRef(null)
  const quaternion = useRef(new THREE.Quaternion())
  const matrix = useRef(new THREE.Matrix4())
  const axis = useRef({
    x: new THREE.Vector3(),
    y: new THREE.Vector3(),
    z: new THREE.Vector3(),
  })

  const earth = BODIES_BY_ID.earth
  const drawn = bodyShown(earth, layers)

  /*
   * Keyed on the *event*, not on the clock: the track is a property of the
   * eclipse, and recomputing it while scrubbing through the two hours it lasts
   * would be a hundred surface searches a frame. `displayJD` is the throttled
   * mirror of the clock, so this asks the question a few times a second at
   * worst, and answers it once per eclipse.
   */
  const event = useMemo(() => (drawn ? eclipseNear(displayJD) : null), [drawn, displayJD])
  const track = useMemo(
    () => (event ? eclipseTrack(event.jd, earth.elements) : null),
    [event, earth],
  )

  /*
   * The band and the centre line, in body-fixed space. Rebuilt only when the
   * eclipse or the scale changes — the radius is the drawn one, so switching to
   * true scale has to re-lay it on a much smaller globe.
   */
  const geometry = useMemo(() => {
    if (!track) return null
    const radius = bodyRadius(earth, scaleMode) * LIFT
    const n = track.points.length

    const band = new Float32Array(n * 6)
    const line = new Float32Array(n * 3)
    const v = new THREE.Vector3()

    track.points.forEach((point, i) => {
      surfaceDirection(point.left.latitude, point.left.longitude, v).multiplyScalar(radius)
      band.set([v.x, v.y, v.z], i * 6)
      surfaceDirection(point.right.latitude, point.right.longitude, v).multiplyScalar(radius)
      band.set([v.x, v.y, v.z], i * 6 + 3)
      surfaceDirection(point.centre.latitude, point.centre.longitude, v).multiplyScalar(radius * 1.0004)
      line.set([v.x, v.y, v.z], i * 3)
    })

    // Two triangles per step, stitching the left edge to the right.
    const index = []
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }

    const bandGeometry = new THREE.BufferGeometry()
    bandGeometry.setAttribute('position', new THREE.BufferAttribute(band, 3))
    bandGeometry.setIndex(index)
    bandGeometry.computeVertexNormals()

    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(line, 3))

    return { band: bandGeometry, line: lineGeometry }
  }, [track, earth, scaleMode])

  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    const position = planetPositions.get('earth')
    const spin = surfaceSpin('earth')
    if (!geometry || !position || spin === null) {
      group.visible = false
      return
    }

    group.visible = true
    group.position.copy(position)

    /*
     * `basis · R_y(spin)`, composed the same way `surfaceOffset` composes it —
     * spin first, in the body's own frame, then the pole basis into the world.
     */
    const basis = bodyBasis('earth')
    axis.current.x.set(basis.x.x, basis.x.y, basis.x.z)
    axis.current.y.set(basis.y.x, basis.y.y, basis.y.z)
    axis.current.z.set(basis.z.x, basis.z.y, basis.z.z)
    matrix.current.makeBasis(axis.current.x, axis.current.y, axis.current.z)
    quaternion.current.setFromRotationMatrix(matrix.current)
    group.quaternion.copy(quaternion.current)
    group.rotateY(spin)
  })

  if (!geometry) return null

  return (
    <group ref={groupRef}>
      {/* The band of totality. Drawn from both sides — at a glancing angle the
          strip's own winding is not reliably toward the camera — and with depth
          writing off so it lies on the globe rather than fighting it. */}
      <mesh geometry={geometry.band} renderOrder={2}>
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.26}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <line geometry={geometry.line} renderOrder={3}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.75} toneMapped={false} />
      </line>
    </group>
  )
}
