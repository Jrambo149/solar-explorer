import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTexture } from '../textures'
import { warpSunRadius } from '../orbit/frames'
import { BODIES_BY_ID, bodyRadius } from '../data/bodies'
import { planetPositions, useStore } from '../store/useStore'
import { attachShadows, setOccluders, shadowUniforms } from './shadows'

/**
 * Uranus's rings, drawn from scratch.
 *
 * Solar System Scope ships a ring strip for Saturn but not for Uranus, so this
 * builds one. They are nothing like Saturn's broad banded sheet: thirteen
 * narrow, dark, well-separated threads. The radii below are the real ones in
 * planetary radii, which is what gives the set its uneven, clustered spacing —
 * three tight rings low down, then a widening spread out to the bright epsilon
 * ring on the outside.
 *
 * The widths are not real. Even epsilon, the widest, is under 100 km against a
 * 25,559 km planet — about 0.004 of a radius, far under a pixel at any zoom
 * this app reaches. Drawn truthfully the rings would simply be invisible, so
 * each is widened to something that survives rasterisation while keeping the
 * relative ordering and brightness intact.
 */
const URANUS_RINGS = [
  // [radius in planet radii, drawn width, brightness]
  [1.637, 0.9, 0.30], // 6
  [1.652, 0.9, 0.32], // 5
  [1.666, 0.9, 0.34], // 4
  [1.75, 1.0, 0.30], // alpha
  [1.786, 1.0, 0.32], // beta
  [1.834, 0.8, 0.22], // eta
  [1.863, 1.0, 0.30], // gamma
  [1.9, 1.0, 0.32], // delta
  [1.957, 0.7, 0.18], // lambda
  [2.006, 2.6, 0.62], // epsilon — much the brightest and widest
]

const URANUS_INNER = 1.55
const URANUS_OUTER = 2.12

let uranusRingTexture = null

function getUranusRingTexture() {
  if (uranusRingTexture) return uranusRingTexture

  const W = 1024
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(W, 1)

  const span = URANUS_OUTER - URANUS_INNER

  for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W
    let alpha = 0

    for (const [radius, width, brightness] of URANUS_RINGS) {
      const centre = (radius - URANUS_INNER) / span
      // Half-width in U, scaled off the drawn width above.
      const half = (width * 0.006) / span
      const d = Math.abs(u - centre) / half
      if (d >= 1) continue
      // Soft shoulders rather than a hard bar, so the thread doesn't alias into
      // a dashed line as it tilts away from the camera.
      alpha = Math.max(alpha, brightness * (1 - d * d))
    }

    const i = x * 4
    // Uranus's rings are famously dark — charcoal, not ice. Barely warm.
    image.data[i] = 196
    image.data[i + 1] = 190
    image.data[i + 2] = 182
    image.data[i + 3] = Math.round(Math.min(1, alpha) * 255)
  }

  ctx.putImageData(image, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  uranusRingTexture = tex
  return tex
}

/** Inner/outer radius multipliers and the map to use, per planet. */
export const RING_PRESETS = {
  saturn: { inner: 1.28, outer: 2.35, texture: 'saturn-ring' },
  uranus: { inner: URANUS_INNER, outer: URANUS_OUTER, texture: 'uranus-ring' },
}

/**
 * A planet's ring system.
 *
 * `RingGeometry`'s default UVs are laid out for a square texture, which would
 * smear a radial strip around the ring. We rewrite them so that U runs from the
 * inner edge (0) to the outer edge (1) — matching how the ring textures are
 * built — and V is constant.
 */
export default function Rings({ radius, preset, bodyId }) {
  const innerRadius = radius * preset.inner
  const outerRadius = radius * preset.outer

  const geometry = useMemo(() => {
    const geo = new THREE.RingGeometry(innerRadius, outerRadius, 192, 1)
    const pos = geo.attributes.position
    const uv = geo.attributes.uv
    const v = new THREE.Vector3()
    const span = outerRadius - innerRadius

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      uv.setXY(i, (v.length() - innerRadius) / span, 0.5)
    }
    uv.needsUpdate = true
    return geo
  }, [innerRadius, outerRadius])

  const isUranus = preset.texture === 'uranus-ring'
  const map = isUranus ? getUranusRingTexture() : getTexture(preset.texture)

  /*
   * The other half of the ring shadow: the planet's own shadow thrown outward
   * across the rings.
   *
   * This is the wedge that makes a ringed planet read as a solid object rather
   * than a decal — the rings run bright all the way round until they cross
   * behind the planet and go dark. It is the same sphere-occlusion test every
   * other body uses, with a single occluder: the planet itself.
   */
  const uniforms = useMemo(() => shadowUniforms(), [])

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      map: map || undefined,
      color: map ? '#ffffff' : '#c9b28c',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: map ? 1 : 0.55,
      // Uranus's threads are semi-transparent by design, so they must not be
      // alpha-tested away the way Saturn's sharp-edged sheet can be.
      alphaTest: isUranus ? 0 : 0.01,
      depthWrite: false,
      roughness: 0.9,
      metalness: 0,
    })
    attachShadows(mat, uniforms)
    return mat
  }, [map, isUranus, uniforms])

  const occluder = useRef([{ position: null, radius: 0 }])

  useFrame(() => {
    const scaleMode = useStore.getState().scaleMode
    const planet = BODIES_BY_ID[bodyId]
    const position = planetPositions.get(bodyId)
    if (!planet || !position) return

    uniforms.uSunRadius.value = warpSunRadius(scaleMode)
    occluder.current[0].position = position
    occluder.current[0].radius = bodyRadius(planet, scaleMode)
    setOccluders(uniforms, occluder.current)
  })

  return (
    // RingGeometry is built in the XY plane; lay it flat into the planet's
    // equatorial plane.
    <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} />
  )
}
