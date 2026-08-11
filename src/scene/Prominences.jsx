import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getGeometry } from '../models'

/**
 * Plasma loops arching off the sun's limb.
 *
 * The geometry comes from the Blender model in `Models/`; the look does not.
 * glTF carries no shader graphs, and that model's entire appearance was
 * procedural Cycles nodes — Gradient and Noise textures through ColorRamps into
 * an Emission mixed against a Transparent BSDF by Layer Weight. None of that
 * survives export, so it is rebuilt here, which is the better arrangement
 * anyway: Layer Weight is *view-dependent*, and reproducing it live keeps the
 * grazing-angle glow that a baked texture would have flattened away.
 *
 * The model's own scatter is not used either. Its Geometry Nodes graph
 * evaluates to zero geometry outside the Blender GUI, so the loops are placed
 * here instead — which is what we want regardless, since they have to sit on a
 * sphere whose radius changes with the scale setting.
 */

/**
 * How many of each source loop to place.
 *
 * Four shapes, twenty-two instances, four draw calls. `Prominence_01` is the
 * largest and most detailed arc, so it appears least — repeated silhouettes are
 * what make a scattered set read as copies rather than as a surface.
 *
 * Twenty-two rather than the dozen this started at, because of where a loop
 * actually reads. Scattered over a whole sphere, half face away and are hidden
 * by the photosphere, and most of the near half sit face-on against the bright
 * disc where additive blending washes them out. Only the ones near the limb
 * silhouette against black — which is a small fraction, so the population has
 * to be large enough that a few are always there.
 */
const POPULATION = [
  { node: 'Prominence_01', count: 5 },
  { node: 'Prominence_02', count: 7 },
  { node: 'Prominence_03', count: 7 },
  // The only open surface in the set — a modelled plane, not a closed tube —
  // so it is the only one that needs drawing from both sides.
  { node: 'Flare', count: 3, side: THREE.DoubleSide },
]

/**
 * How far the base sinks below the surface, in sun radii.
 *
 * The loops are modelled with their feet at y = 0 and a little below, so they
 * need burying or the join reads as a seam. The photosphere is displaced by a
 * couple of percent of its radius in the source model, which is roughly the
 * depth that hides a foot without swallowing the arch.
 */
const BASE_SINK = 0.02

/** Deterministic placement: the same sun every reload, no stored seed data. */
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VERTEX = /* glsl */ `
  varying float vHeight;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying float vPhase;

  attribute float aPhase;

  void main() {
    // three.js injects the instanceMatrix attribute and this define for any
    // material drawn on an InstancedMesh, but a ShaderMaterial has to apply it
    // by hand — none of the stock chunks are in play here.
    #ifdef USE_INSTANCING
      mat4 instance = instanceMatrix;
    #else
      mat4 instance = mat4(1.0);
    #endif

    vec4 world = modelMatrix * instance * vec4(position, 1.0);

    // Height along the arch, in the loop's own space. glTF's Y-up conversion
    // puts Blender's +Z here, which is the direction the model arches in.
    vHeight = position.y;
    vNormalW = normalize(mat3(modelMatrix) * mat3(instance) * normal);
    vViewDirW = normalize(cameraPosition - world.xyz);
    vPhase = aPhase;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform float uSpan;
  uniform float uIntensity;
  uniform float uTime;

  varying float vHeight;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying float vPhase;

  void main() {
    float h = clamp(vHeight / uSpan, 0.0, 1.0);

    // Hot and near-white at the foot, cooling to deep orange at the tip. This
    // is the Blackbody-through-ColorRamp the source material built, collapsed
    // to the two ends that actually read at this size.
    vec3 colour = mix(uBase, uTip, h);

    // Plasma thins out as it climbs, so the arch fades rather than ending.
    float fade = 1.0 - smoothstep(0.3, 1.0, h);

    // Layer Weight, rebuilt: thin gas is brightest where the line of sight
    // passes along it rather than through it, which is why a real prominence
    // glows at its edges.
    float fresnel = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDirW))), 1.6);

    // Slow per-instance flicker. Two incommensurable rates so no two loops ever
    // settle into the same rhythm.
    float flicker = 0.86 + 0.14 * sin(uTime * 0.9 + vPhase) * cos(uTime * 0.41 + vPhase * 1.7);

    float strength = (0.22 + 0.78 * fresnel) * fade * flicker * uIntensity;

    // Additive blending adds src * srcAlpha, so the falloff goes in the colour
    // and alpha stays at 1 — folding it into both would square it and leave the
    // loops far dimmer than intended.
    gl_FragColor = vec4(colour * strength, 1.0);
  }
`

function Loop({ node, count, seedBase, side = THREE.FrontSide }) {
  const meshRef = useRef()
  const materialRef = useRef()
  const source = getGeometry('sun-prominences', node)

  // Cloned rather than used directly: the per-instance phase is stored as an
  // attribute on the geometry, and the loader's copy is shared cache. Writing
  // to it would work today and break the moment a second component wanted the
  // same loop.
  const { geometry, matrices, span } = useMemo(() => {
    if (!source) return {}

    const geo = source.clone()
    geo.computeBoundingBox()
    // Normalising the gradient by each loop's own height keeps the colour ramp
    // consistent across four shapes of quite different size — the tallest
    // flare is more than twice the height of the smallest arc.
    const height = Math.max(geo.boundingBox.max.y, 1e-4)

    const random = mulberry32(seedBase)
    const phases = new Float32Array(count)
    const placed = []

    const quaternion = new THREE.Quaternion()
    const roll = new THREE.Quaternion()
    const direction = new THREE.Vector3()
    const position = new THREE.Vector3()
    const UP = new THREE.Vector3(0, 1, 0)

    for (let i = 0; i < count; i++) {
      // Uniform on the sphere. Sampling latitude directly would crowd the
      // poles, and a dozen loops is few enough that the clustering would show.
      const z = random() * 2 - 1
      const theta = random() * Math.PI * 2
      const r = Math.sqrt(1 - z * z)
      direction.set(r * Math.cos(theta), z, r * Math.sin(theta))

      position.copy(direction).multiplyScalar(1 - BASE_SINK)

      // Stand the loop up along the surface normal, then spin it about that
      // normal so the arches don't all face the same way.
      quaternion.setFromUnitVectors(UP, direction)
      roll.setFromAxisAngle(direction, random() * Math.PI * 2)
      quaternion.premultiply(roll)

      // Uniform, deliberately. Squashing the arches would give more variety but
      // `mat3(instanceMatrix)` is only a correct normal transform under uniform
      // scale, and the fresnel term reads those normals — a stretched loop
      // would glow along the wrong edges.
      const size = 0.95 + random() * 0.95

      placed.push(
        new THREE.Matrix4().compose(
          position.clone(),
          quaternion.clone(),
          new THREE.Vector3(size, size, size),
        ),
      )
      phases[i] = random() * Math.PI * 2
    }

    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
    return { geometry: geo, matrices: placed, span: height }
  }, [source, count, seedBase])

  const uniforms = useMemo(
    () => ({
      uBase: { value: new THREE.Color('#ffcf87') },
      uTip: { value: new THREE.Color('#ff3d0c') },
      uSpan: { value: span ?? 1 },
      uIntensity: { value: 0.85 },
      uTime: { value: 0 },
    }),
    [span],
  )

  useFrame((state) => {
    const mesh = meshRef.current
    if (mesh && matrices && !mesh.userData.placed) {
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
      mesh.instanceMatrix.needsUpdate = true
      mesh.userData.placed = true
    }

    if (materialRef.current) {
      // Wall clock, not the simulation clock. This is a shimmer, not a
      // physical quantity — the same reasoning as the sun's own pulse — so it
      // should keep breathing when time is paused rather than freezing solid.
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  if (!geometry) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, count]}
      // The loops sit on the limb of a sphere that is itself scaled every
      // frame; letting three.js cull them against a bounding box computed for
      // the unit model pops them out of view at close range.
      frustumCulled={false}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={side}
        toneMapped={false}
      />
    </instancedMesh>
  )
}

/**
 * The whole set, drawn in the sun's local frame.
 *
 * Rendered inside the group that carries the photosphere's rotation, so the
 * loops turn with the surface they are anchored to instead of hanging in space
 * while the sun spins underneath them.
 */
export default function Prominences() {
  return (
    <>
      {POPULATION.map(({ node, count, side }, index) => (
        <Loop
          key={node}
          node={node}
          count={count}
          side={side}
          seedBase={4801 + index * 977}
        />
      ))}
    </>
  )
}
