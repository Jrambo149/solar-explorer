import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { skyOf } from '../data/skies'
import { planetPositions, useStore } from '../store/useStore'
import { setDaylight } from './daylight'
import { bodyBasis } from './pole'
import { surfaceOffset, surfaceSpin } from './surface'

/**
 * Daylight, from underneath it.
 *
 * `Atmosphere.jsx` draws air seen from outside — a limb glow on a shell whose
 * faces point outward, which is why standing on Mars gave a lit orange ground
 * under a perfectly black sky. From inside that shell there is nothing to see:
 * every triangle is facing away.
 *
 * ## Two passes, because a sky is not a coloured veil
 *
 * The obvious implementation is one alpha-blended dome tinted by the Sun's
 * altitude. It gets the colour approximately right and everything else wrong,
 * because air does two separate things to a line of sight and they pull in
 * opposite directions:
 *
 *  1. **Extinction** takes light *out* of whatever is behind — and takes more
 *     of some colours than others. This is why the setting Sun is red: not
 *     because anything paints it red, but because the blue has been removed
 *     from it. A single alpha blend cannot express a per-channel multiply.
 *  2. **Inscattering** puts light *in* along the way. This is the sky itself,
 *     and it is what hides the stars in the daytime — they are still there and
 *     nothing is blocking them; there is simply more light in front.
 *
 * So this draws two meshes on the same sphere. The first multiplies the frame
 * by a per-channel transmittance; the second adds the inscattered light. Both
 * are back-faced, both ride with the camera, and together they are the
 * difference between a sunset that reddens the Sun and one that merely has an
 * orange sky next to a white Sun.
 *
 * ## And why it only exists while standing
 *
 * The camera never gets inside an atmosphere except in the surface view. Gating
 * on `surface` rather than on "is the camera below the shell" avoids inventing
 * a case that cannot arise, and guarantees the orbit views are untouched.
 */

/**
 * How far out the dome sits, as a fraction of the camera's far plane.
 *
 * It has to be beyond everything it is meant to affect — the stars sit on their
 * own dome, and the Sun is an AU or more away — while staying inside the far
 * plane, since geometry clipped by the far plane is not dimmed by anything.
 */
const DOME_FRACTION = 0.45

const vertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    // The direction from the dome's centre, which is the camera. Normalising
    // in the fragment shader rather than here, so a coarse sphere still gives
    // a smooth gradient across each triangle.
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * The shared part: where in the sky this pixel is, and how much air is in
 * front of it.
 *
 * `uUp` is the local vertical and `uSunDirection` points at the Sun, both in
 * world space and both handed in per frame — the shader has no idea which body
 * it is on, which is the point.
 */
const common = /* glsl */ `
  uniform vec3 uUp;
  uniform vec3 uSunDirection;
  uniform float uBrightness;

  varying vec3 vDirection;

  /**
   * Relative air mass along this ray.
   *
   * At the zenith you look through one atmosphere; at the horizon, through far
   * more of it, which is the whole reason the horizon is paler and the setting
   * Sun is dim. The 1/cos form diverges at the horizon, so it is floored — a
   * flat-earth approximation, and honest at every altitude a person can see.
   *
   * **Looking down it collapses, and it has to.** The path through air is
   * bounded by the distance to whatever you are looking at, and looking down
   * that is the ground a few kilometres away. Running the 1/cos form below the
   * horizon gave every downward ray twelve atmospheres of absorption and
   * multiplied the sunlit landscape to solid black — a blue sky over a void,
   * which read as the ground failing to draw rather than as the sky eating it.
   */
  float airMass(float upness) {
    float sky = 1.0 / max(upness, 0.08);
    // A few kilometres of dense air near the surface, not a whole column.
    return mix(0.30, sky, smoothstep(-0.02, 0.06, upness));
  }

  /** How much daylight there is at all, from the Sun's altitude. */
  float daylight(float sunUpness) {
    // Zero once the Sun is about 17° below the horizon, which is roughly where
    // astronomical twilight ends and the sky is as dark as it is going to get.
    return smoothstep(-0.30, 0.12, sunUpness);
  }
`

/**
 * Pass one: what survives.
 *
 * Blended as `dst * src`, so whatever this outputs multiplies the frame. Near
 * the horizon the path is long, so more is absorbed and the *colour* of what
 * remains shifts — on Earth toward red, because blue is removed hardest.
 */
const transmittanceShader = /* glsl */ `
  ${common}
  uniform vec3 uExtinction;
  uniform float uOpacity;

  void main() {
    vec3 dir = normalize(vDirection);
    float upness = dot(dir, uUp);
    float mass = airMass(upness);

    /*
     * Beer's law, with the optical depth scaled by how lit the air is.
     *
     * Air absorbs at night as well, but a night sky the eye can see through is
     * the correct picture — the stars come out. Tying this to daylight is what
     * makes them come back.
     */
    float lit = mix(0.12, 1.0, daylight(dot(uSunDirection, uUp)));
    vec3 survives = exp(-uExtinction * mass * lit * uOpacity);

    // An overcast has no windows. Titan and Venus set this to 1 and nothing
    // reaches the ground through them.
    survives = mix(vec3(1.0), survives, uOpacity);
    gl_FragColor = vec4(survives, 1.0);
  }
`

/**
 * Pass two: what is added.
 *
 * The sky's own light. Additive, so it lays over whatever survived pass one —
 * and once it is bright enough, the stars underneath stop being distinguishable
 * from it, which is exactly how daylight actually hides them.
 */
const inscatterShader = /* glsl */ `
  ${common}
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uAureole;

  void main() {
    vec3 dir = normalize(vDirection);
    float upness = dot(dir, uUp);
    float sunUpness = dot(uSunDirection, uUp);
    float day = daylight(sunUpness);

    // Straight up to the horizon. The exponent shapes how quickly the pale
    // horizon band gives way to the deeper colour overhead.
    float height = pow(clamp(upness, 0.0, 1.0), 0.55);
    vec3 colour = mix(uHorizon, uZenith, height);

    /*
     * The aureole: the colour the sky takes *around the Sun* while the Sun is
     * low. This is the field that carries the Earth/Mars inversion — warm on
     * Earth, blue on Mars — so it must survive as its own term rather than
     * being folded into a generic warm tint.
     *
     * Two factors, and both are needed: how close this pixel is to the Sun's
     * direction, and how near the horizon the Sun is. A high Sun
     * has an aureole too, but it is white and small, and the interesting one is
     * the sunset.
     */
    float toward = max(dot(dir, uSunDirection), 0.0);
    float low = smoothstep(0.45, -0.08, sunUpness);
    float glow = pow(toward, 3.0) * low;
    colour = mix(colour, uAureole, clamp(glow, 0.0, 0.92));

    /*
     * Brightness falls off below the horizon as well as with the Sun's
     * altitude: looking down, the ray leaves the air almost at once and there
     * is nothing to scatter. Without this the dome washes the ground you are
     * standing on with sky colour.
     */
    float ground = smoothstep(-0.06, 0.02, upness);
    float mass = mix(1.0, 1.35, 1.0 - clamp(upness, 0.0, 1.0));

    float brightness = uBrightness * day * ground * mass;
    gl_FragColor = vec4(colour * brightness, 1.0);
  }
`

const _up = new THREE.Vector3()
const _sun = new THREE.Vector3()
const _offset = { x: 0, y: 0, z: 0 }

export default function SkyDome() {
  const { camera } = useThree()
  const surface = useStore((s) => s.surface)
  const scaleMode = useStore((s) => s.scaleMode)

  const sky = surface ? skyOf(surface.body) : null

  const groupRef = useRef(null)
  const transmittanceRef = useRef(null)
  const inscatterRef = useRef(null)

  const uniforms = useMemo(() => {
    if (!sky) return null
    const shared = {
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
      uBrightness: { value: sky.brightness },
    }
    return {
      transmittance: {
        ...shared,
        uExtinction: { value: new THREE.Vector3(...sky.extinction) },
        uOpacity: { value: sky.opacity },
      },
      inscatter: {
        ...shared,
        uZenith: { value: new THREE.Vector3(...sky.zenith) },
        uHorizon: { value: new THREE.Vector3(...sky.horizon) },
        uAureole: { value: new THREE.Vector3(...sky.aureole) },
      },
    }
  }, [sky])

  useFrame(() => {
    const group = groupRef.current
    if (!group || !uniforms) return

    const state = useStore.getState()
    const standing = state.surface
    const position = standing ? planetPositions.get(standing.body) : null
    const spin = standing ? surfaceSpin(standing.body) : null
    if (!standing || !position || spin === null) {
      group.visible = false
      setDaylight(0)
      return
    }

    /*
     * The local vertical, through the same call that placed the eye —
     * `basis · R_y(spin)`, which is also what the rovers and the eclipse track
     * are composed with. Recomputed here rather than published by the camera
     * because the two run in the same frame and the order between them is not
     * something to depend on; see `framePriority.js`.
     */
    surfaceOffset(standing.lat, standing.lon, bodyBasis(standing.body), spin, 1, _offset)
    _up.set(_offset.x, _offset.y, _offset.z).normalize()

    // The Sun sits at the origin of this scene, so the direction to it from
    // where we are standing is the negated position of the body.
    _sun.copy(position).negate().normalize()

    for (const key of ['transmittance', 'inscatter']) {
      uniforms[key].uUp.value.copy(_up)
      uniforms[key].uSunDirection.value.copy(_sun)
    }

    group.visible = true
    group.position.copy(camera.position)
    const size = camera.far * DOME_FRACTION
    group.scale.setScalar(size)

    /*
     * And tell the stars there is daylight. The same curve the shader uses,
     * evaluated once on the CPU — see `daylight.js` for why the stars cannot
     * work this out for themselves.
     *
     * The Sun's altitude alone, deliberately not scaled by how bright *this*
     * sky renders. Scaling by brightness was the first version and it is wrong
     * about Mars: its sky is far dimmer than Earth's, so the stars survived a
     * butterscotch noon and the picture had a full Milky Way over a sunlit
     * landscape. Thin air is still some hundred times brighter than a naked-eye
     * star. A lit sky hides them everywhere; what differs between worlds is how
     * *long* twilight lasts, and that is already in the Sun's altitude.
     *
     * The permanently overcast pair need none of this: Titan and Venus set
     * `opacity` to 1, and the transmittance pass takes everything behind them
     * to nothing at any hour.
     */
    const sunUpness = _sun.dot(_up)
    setDaylight(THREE.MathUtils.smoothstep(sunUpness, -0.3, 0.12))
  })

  if (!sky) return null

  return (
    <group ref={groupRef}>
      {/* Multiply first, then add. `renderOrder` puts both after everything
          they are meant to act on — the stars sit at -1000, the bodies at 0. */}
      <mesh ref={transmittanceRef} renderOrder={800}>
        <sphereGeometry args={[1, 32, 24]} />
        <shaderMaterial
          uniforms={uniforms.transmittance}
          vertexShader={vertexShader}
          fragmentShader={transmittanceShader}
          side={THREE.BackSide}
          depthTest={false}
          depthWrite={false}
          transparent
          blending={THREE.CustomBlending}
          blendSrc={THREE.ZeroFactor}
          blendDst={THREE.SrcColorFactor}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={inscatterRef} renderOrder={801}>
        <sphereGeometry args={[1, 32, 24]} />
        <shaderMaterial
          uniforms={uniforms.inscatter}
          vertexShader={vertexShader}
          fragmentShader={inscatterShader}
          side={THREE.BackSide}
          depthTest={false}
          depthWrite={false}
          transparent
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
