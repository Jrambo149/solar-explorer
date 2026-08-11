import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { STARS } from '../data/stars'
import { starAlpha, starColour, starDirection, starSize } from './sky'

/**
 * The sky, from a catalogue.
 *
 * Every point here is a real star at its real place: 8,922 of them to magnitude
 * 6.5, which is what an unaided eye resolves under a dark sky. Orion is in
 * Orion, and from Mars it is in the same place, because at these distances the
 * whole solar system is a single point of view.
 *
 * ## What this replaced, and what survived
 *
 * The field used to be procedural — points scattered uniformly on a shell, with
 * colours drawn from a weighted spectral palette and brightness from the cube of
 * a uniform random. It was a good backdrop and a false sky, and the moment the
 * app could stand on Mars and look up, the difference started to matter.
 *
 * The *drawing* is unchanged and was the hard-won part: a per-star shader with
 * log-depth chunks included by hand, sizes in device pixels, a soft round mask,
 * and the draw-order trick that puts the field in the opaque queue at
 * `renderOrder` -1000 so a star can never occlude a planet. All of that was
 * built against random points and none of it cared where the points came from.
 *
 * What went is everything that generated them: the seeded random, the spectral
 * weights, the shell thickness, and the cubic brightness. Position, colour and
 * brightness are now read from `STARS` and mapped by `sky.js`.
 *
 * ## No shell any more
 *
 * The old field was 220 units thick, so that `1 - t` through the shell could
 * make some stars dimmer than others. Real stars have distances, and none of
 * them are usable here: the nearest is 4.2 light years, which is 266,000 AU,
 * and drawing them to scale puts every one of them at the same place — very far
 * away. So they go on a sphere, at exactly `DOME_RADIUS`, and the brightness
 * that the shell used to fake now comes from the magnitude each star actually
 * has.
 */

/**
 * Mean drawn size across the catalogue, which the pixel maths needs.
 *
 * `uScale` normalises by the mean so that `starPixels` means what it says — an
 * *average* star is that many CSS pixels — and with a real catalogue the mean is
 * a property of the sky rather than a constant that can be written down. It is
 * measured once at mount, from the same array the sizes come from, so the two
 * can never drift apart.
 */

/*
 * `logdepthbuf` is not optional here, and leaving it out is what made the sky
 * almost vanish at true scale.
 *
 * The renderer runs with `logarithmicDepthBuffer: true`, and three.js only
 * injects the log-depth chunks into materials that ask for them — the built-in
 * ones do it via `#include`, and a hand-written `ShaderMaterial` has to do the
 * same or it keeps writing ordinary perspective depth into a buffer everything
 * else is filling logarithmically.
 *
 * Ordinary perspective depth is exactly what cannot survive this scene's range.
 * With `near` at 0.001, `ndc.z` for a fragment at distance d is
 * `1 - 0.002/d` regardless of the far plane, so a 24-bit buffer (quantum 6e-8)
 * has this much headroom below the cleared value of 1.0:
 *
 *   diorama    stars at   323 units   1 - 3.1e-6   ~51 quanta   safe
 *   true scale stars at 5,940 units   1 - 1.7e-7    ~3 quanta   fails
 *
 * Three quanta is inside the rounding, so at true scale most of the field
 * quantised to exactly 1.0 and was rejected against the cleared depth buffer.
 * The few survivors were the near edge of the shell — "barely any stars".
 *
 * The chunks are `#ifdef`-guarded on `USE_LOGARITHMIC_DEPTH_BUFFER`, so this
 * stays correct if the renderer setting is ever turned off. Eyes' own trail and
 * line shaders include the same thing (`ShaderChunkLogDepth`) for the same
 * reason — its scene spans an even wider range than this one.
 */
const VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;

  uniform float uTime;
  uniform float uTwinkle;
  uniform float uScale;

  varying vec3 vColor;
  varying float vAlpha;

  #include <common>
  #include <logdepthbuf_pars_vertex>

  void main() {
    vColor = aColor;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    #include <logdepthbuf_vertex>

    // Size in pixels falls off with distance like anything else in the scene,
    // so the far shell of the field reads as further away rather than merely
    // dimmer.
    gl_PointSize = aSize * uScale / max(-mv.z, 1.0);

    // Slight, and out of phase per star: the sky should look alive without
    // anything on it visibly blinking. Deliberately unlike drei's speed prop,
    // which is a single global sin(time) scaling every star at once — that reads
    // as the whole field glimmering rather than as individual stars.
    float twinkle = 1.0 + uTwinkle * sin(uTime + aPhase);
    vAlpha = aAlpha * twinkle;
  }
`

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  #include <common>
  #include <logdepthbuf_pars_fragment>

  void main() {
    #include <logdepthbuf_fragment>

    // A soft round dot. Points are square, and at these sizes the corners are
    // clearly visible as square stars.
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d) * 4.0;
    float mask = 1.0 - smoothstep(0.35, 1.0, r);
    if (mask <= 0.0) discard;

    // A touch of white in the middle: a bright star's core burns out toward
    // white whatever its colour, which is what keeps the tinted ones from
    // reading as coloured dots.
    vec3 rgb = mix(vColor, vec3(1.0), pow(1.0 - r, 3.0) * 0.18);

    gl_FragColor = vec4(rgb, vAlpha * mask);
  }
`

/**
 * Where the dome sits, and why it is a constant.
 *
 * These used to be derived from `cameraLimits().maxDistance`, so the shell grew
 * eighteenfold between diorama and true scale. The apparent size of a star was
 * still right — `uScale` divides by the same radius it multiplies — but "the
 * sizes work out proportionally" is a weaker property than "it is the same sky",
 * and only the second is actually wanted. Anything that depends on the scale is
 * something that can differ between the two, and this depended on it in three
 * places at once.
 *
 * Now nothing here does. The geometry, the shell and `uScale` are all fixed, so
 * diorama and true scale draw the identical field, star for star.
 *
 * The radius only has to satisfy two things: comfortably inside the near/far
 * planes at every scale (0.001 to 36,300 at diorama, to 661,540 at true scale),
 * and large enough that the perspective divide doesn't exaggerate the shell's
 * thickness. It no longer has to be outside the planetary system — see the
 * material below, which is what used to force that and no longer does.
 */
const DOME_RADIUS = 1000

export default function Starfield({
  radius = DOME_RADIUS,
  /**
   * Size of an average star in **CSS** pixels.
   *
   * A target rather than a raw multiplier, because the raw multiplier is how the
   * shimmer happened: sized by hand, an average star came out under one device
   * pixel, and a point that small lands on one pixel or its neighbour depending
   * on rounding, so it pops on and off as the camera turns. No animation setting
   * can fix that — the dot has to be big enough to move smoothly. 2.6 is the
   * smallest value that clears it.
   */
  starPixels = 2.6,
  twinkle = 0.06,
}) {
  const { geometry, averageSize } = useMemo(() => {
    const count = STARS.length
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const alphas = new Float32Array(count)
    const phases = new Float32Array(count)

    const direction = { x: 0, y: 0, z: 0 }
    const rgb = [0, 0, 0]
    let sizeTotal = 0

    for (let i = 0; i < count; i++) {
      const [ra, dec, magnitude, colourIndex] = STARS[i]

      starDirection(ra, dec, direction)
      positions[i * 3] = direction.x * radius
      positions[i * 3 + 1] = direction.y * radius
      positions[i * 3 + 2] = direction.z * radius

      starColour(colourIndex, rgb)
      colors[i * 3] = rgb[0]
      colors[i * 3 + 1] = rgb[1]
      colors[i * 3 + 2] = rgb[2]

      const size = starSize(magnitude)
      sizes[i] = size
      sizeTotal += size
      alphas[i] = starAlpha(magnitude)

      /*
       * The one thing still drawn from a random number, and it is not a
       * property of the star — it is where in its own twinkle cycle each one
       * happens to be, so that the sky is alive without anything visibly
       * blinking in step. Derived from the index rather than a generator so it
       * is stable across mounts without carrying a seeded RNG for one line.
       */
      phases[i] = (i * 2.399963) % (Math.PI * 2)
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    return { geometry: g, averageSize: sizeTotal / count }
  }, [radius])

  /*
   * `gl_PointSize` is in *device* pixels, so the ratio has to be multiplied back
   * in or the same scene draws stars at half the apparent size on a 2x display.
   * That is exactly the trap drei's `<Stars>` falls into, and it is why the
   * shimmer was worse on a retina screen than anywhere else.
   *
   * The shader divides by the distance to the star, which the camera-following
   * dome below pins at `radius` — so this resolves to a fixed pixel size rather
   * than something that drifts as the camera moves.
   */
  const dpr = useThree((state) => state.viewport.dpr)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTwinkle: { value: twinkle },
      uScale: { value: 0 },
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [],
  )

  uniforms.uTwinkle.value = twinkle
  uniforms.uScale.value = (starPixels * dpr * radius) / averageSize

  /*
   * The field rides with the camera, which is what stops you flying out of it.
   *
   * It used to sit at the origin, and a shell at a fixed radius is a shell you
   * can leave: zoom all the way out and the far edge of the sky came into view as
   * a visible sphere of stars with nothing beyond it. Real stars are effectively
   * at infinity, so the honest model is a dome that travels with you — always the
   * same distance away, whatever the camera does. Parallax is the only thing
   * given up, and at these distances there was never any to see.
   *
   * A version of this followed the camera at `1 - 0.18` instead, so the field
   * slid past as you travelled and moving inward read as passing stars. It is one
   * multiply to bring back, and it is left out because it was not liked.
   */
  const points = useRef(null)

  useFrame(({ camera }, delta) => {
    uniforms.uTime.value += delta * 0.6
    if (points.current) points.current.position.copy(camera.position)
  })

  /*
   * Drawn first, with the depth buffer left entirely alone — the sky is a
   * backdrop, not an object in the scene.
   *
   * This is what lets `DOME_RADIUS` be a constant. The dome used to be sized off
   * `maxDistance` for one reason: with depth testing on, a fixed shell at 320
   * units sits *inside* the true-scale planetary system, which reaches 3,000, so
   * Neptune would have been drawn behind stars that are nearer the camera than it
   * is — the sky strewn among the planets. Scaling the shell kept it beyond the
   * outermost body at every scale, at the cost of making the sky scale-dependent.
   *
   * Answering it with draw order instead is both simpler and strictly more
   * correct. `transparent: false` puts the field in the *opaque* queue, and
   * `renderOrder` of -1000 puts it first within that queue, so it is laid down
   * before any body exists in the frame; `depthTest: false` means it never
   * compares against anything, and `depthWrite: false` means nothing ever
   * compares against it. Every planet then paints over it in the ordinary way,
   * whatever its distance. A star can no longer occlude anything at any scale,
   * which is what "behind everything" should have meant all along.
   *
   * It also makes the field immune to the depth-precision trap that cost most of
   * the sky at true scale: a fragment that is never depth-tested cannot lose.
   * The `logdepthbuf` includes above stay regardless — they cost nothing here and
   * keep the shader honest if depth testing is ever turned back on.
   */
  return (
    <points ref={points} geometry={geometry} frustumCulled={false} renderOrder={-1000}>
      <shaderMaterial
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        depthTest={false}
        // Not `transparent`, despite being blended: that flag chooses the render
        // *queue*, and the opaque queue is the one that runs before the bodies.
        // Blending still applies — it comes from `blending`, not from this.
        transparent={false}
        // Stars add light to a black sky; they never occlude anything, and
        // writing depth would let the near shell punch holes in the far one.
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}
