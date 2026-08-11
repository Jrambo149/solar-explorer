import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getGeometry } from '../models'
import { getTexture } from '../textures'

/**
 * The sun's three shells, from the Blender model.
 *
 * Replaces the smooth sphere the scene drew before. What the model actually
 * buys is *relief*: the photosphere carries a baked displacement, so its limb
 * is subtly irregular instead of a perfect circle, and `Solar_Fire` is a shell
 * displaced at full strength — a ragged, blobby layer of flame that no sprite
 * can imitate because its silhouette is genuinely lumpy.
 *
 * As with the prominences, none of the source materials survived glTF, so both
 * are relit here. The flame shell leans on the same idea the Blender graph did:
 * a Layer Weight fresnel mixing emission against transparency, so thin hot gas
 * glows where it is edge-on and vanishes where you look through it.
 */

/** The shells this draws. See `models.js` for the two that were left out. */
const SHELL_NODES = ['Star_Surface', 'Solar_Fire']

/* ---------------------------------------------------------------- *
 * The flame shell: emissive where the line of sight grazes it
 * ---------------------------------------------------------------- */

const SHELL_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying vec3 vObject;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDirW = normalize(cameraPosition - world.xyz);
    // Undisplaced direction, for sampling noise that should stay put on the
    // surface rather than swim with the camera.
    vObject = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const SHELL_FRAGMENT = /* glsl */ `
  uniform vec3 uInner;
  uniform vec3 uOuter;
  uniform float uPower;
  uniform float uIntensity;
  uniform float uFloor;
  uniform float uTime;
  uniform float uChurn;

  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying vec3 vObject;

  // Cheap value noise. The source material used Blender's Noise Texture, which
  // is gradient noise at several octaves; at the scale these shells are drawn
  // the difference is not visible and this costs a fraction as much.
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  void main() {
    // Layer Weight, rebuilt. Thin hot gas is brightest where the sight line
    // passes along it rather than through it, so both shells are edge-lit and
    // nearly invisible face-on — which is also what keeps them from flattening
    // the photosphere they sit over.
    float facing = abs(dot(normalize(vNormalW), normalize(vViewDirW)));
    float rim = pow(1.0 - facing, uPower);

    // Noise gate, sampled from the undisplaced object direction so the pattern
    // is anchored to the surface and turns with it rather than swimming with
    // the camera.
    //
    // For the flame shell this does most of the work, not the rim. A fresnel
    // alone traces the outline of every lump on a displaced shell, which is
    // a cage of bright edges rather than fire — and at moderate angles it
    // leaves a dim wash across the whole disc that reads as dull brown. Cutting
    // the shell into patches with noise is what turns it into tongues.
    float n = 1.0;
    if (uChurn > 0.0) {
      float f = noise(vObject * 4.0 + vec3(0.0, uTime * 0.05, 0.0)) * 0.65
              + noise(vObject * 11.0 - vec3(0.0, uTime * 0.09, 0.0)) * 0.35;
      n = smoothstep(0.42, 0.78, f);
    }

    vec3 colour = mix(uInner, uOuter, rim);
    float strength = (uFloor + (1.0 - uFloor) * rim) * uIntensity * n;

    gl_FragColor = vec4(colour * strength, 1.0);
  }
`

function Shell({ node, uniforms, renderOrder, side = THREE.FrontSide }) {
  const geometry = getGeometry('sun-body', node)
  const materialRef = useRef()

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  if (!geometry) return null

  return (
    <mesh geometry={geometry} renderOrder={renderOrder}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={SHELL_VERTEX}
        fragmentShader={SHELL_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={side}
        toneMapped={false}
      />
    </mesh>
  )
}

/**
 * The photosphere.
 *
 * The one shell that wears a map rather than a procedural shader — the app
 * already ships a photographic solar surface, which beats anything a noise
 * function here would invent. It uses Blender's own UV layout, which is why the
 * body export carries texcoords when the loops do not.
 *
 * The gain over the sphere this replaces is the geometry: a baked displacement
 * puts real relief on the limb, so the sun's edge is subtly irregular instead
 * of a drawn circle.
 */
function Photosphere({ materialRef }) {
  const geometry = getGeometry('sun-body', 'Star_Surface')
  const map = getTexture('sun')

  // The emissiveIntensity below is only the value for the first frame: `Sun.jsx`
  // overwrites it every frame from its SUN_EMISSIVE constant, with the pulse
  // added. Kept in step with that constant so a reader here is not told a
  // different number from the one that actually runs.

  if (!geometry) return null

  return (
    <mesh geometry={geometry} renderOrder={0}>
      <meshStandardMaterial
        ref={materialRef}
        map={map || undefined}
        color={map ? '#ffffff' : '#ffb03a'}
        emissive="#ff9a2e"
        emissiveMap={map || undefined}
        emissiveIntensity={1.9}
        toneMapped={false}
      />
    </mesh>
  )
}

export default function SunShells({ materialRef }) {
  /*
   * Both shells draw their *near* wall, not the far one.
   *
   * The first pass used BackSide, on the usual reasoning that an additive glow
   * should render the inside so the near hemisphere cannot occlude anything.
   * That is sound for a smooth sphere and quite wrong for `Solar_Fire`, which
   * is displaced at full strength: showing its inner wall meant the fresnel
   * picked out every interior crease where two lumps meet, and the shell read
   * as a hard polygonal cage around the sun rather than as flame. (The normals
   * are smooth — measured at 14 degrees of genuine curvature between adjacent
   * faces — so this was geometry, not shading.)
   *
   * FrontSide shows the lumps from outside, which is what they were modelled
   * to be seen as.
   */
  const fire = useMemo(
    () => ({
      uInner: { value: new THREE.Color('#ff4a00') },
      uOuter: { value: new THREE.Color('#ffb347') },
      // Steep, so only true grazing contributes. At 2.5 the moderate angles
      // all over a lumpy shell each added a little, and a little times the
      // whole disc is a brown haze.
      uPower: { value: 5.0 },
      uIntensity: { value: 2.4 },
      // Zero, and that is the whole fix. Any floor at all lights the shell's
      // face-on interior, and because this shell spans 1.12 to 1.25 radii that
      // is a large disc of dim orange laid over black — which reads as a dull
      // brown bubble with hard lumpy edges, not as fire. At zero the shell is
      // invisible except where the sight line grazes it, so what survives is
      // tongues of flame around the limb and nothing in between.
      uFloor: { value: 0.0 },
      uChurn: { value: 0.85 },
      uTime: { value: 0 },
    }),
    [],
  )


  return (
    <>
      <Photosphere materialRef={materialRef} />
      <Shell node="Solar_Fire" uniforms={fire} renderOrder={1} />
    </>
  )
}

export { SHELL_NODES }
