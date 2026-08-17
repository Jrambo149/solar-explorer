import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { STARS } from '../data/stars'
import { unitsPerParsec } from '../orbit/frames'
import { useStore } from '../store/useStore'
import { getCosmicStage } from './cosmicStage'
import { STAR_RAMP_GLSL, starColour, starDirection } from './sky'

/**
 * The same sky as `Starfield`, at its real depth.
 *
 * `Starfield` draws all 8,922 catalogue stars on a shell that rides with the
 * camera, and says so plainly: real distances are unusable when the furthest
 * the camera can go is 165 AU and the nearest star is 273,000. That was true
 * for as long as it was the ceiling.
 *
 * Past it the dome becomes the one thing that cannot be allowed to happen. A
 * shell that follows you can never be left, so Orion would still be Orion from
 * ten thousand light years away — the constellations pinned to the inside of a
 * sphere while the Galaxy they belong to turned in front of them. The
 * constellations are an accident of where we stand, and coming apart is the
 * single most important thing they do on the way out.
 *
 * So this draws the same catalogue with the distance column used: every star at
 * its own parallax, brightening and dimming by the inverse-square law from
 * wherever the camera actually is. The two cross-fade on the cosmic stage, and
 * `cosmicStage.js` sets out why they are interchangeable over exactly that
 * band — the short version is that the real parallax across the handover is
 * under 0.28 degrees for the nearest star in the sky.
 *
 * ## Built in parsecs, scaled once
 *
 * The geometry holds catalogue parsecs and the object carries a single uniform
 * scale, `unitsPerParsec`. That is not a convenience: it is the structural
 * statement that diorama and true scale show the *same sky*. A uniformly scaled
 * picture is the same picture, so the two modes cannot drift into showing
 * different constellations dissolving at different times, whatever else the
 * scale dial does to the planets. Building world-unit positions per mode would
 * have made that a property to test rather than a property to have.
 *
 * ## The 207 without a parallax
 *
 * They are not here. HYG has no usable parallax for them and there is no
 * distance to put them at — see `fetch-stars.mjs`, which writes them as zero
 * rather than as the 100,000 pc the catalogue parks them at. They are in the
 * dome, where a direction is all that is needed and they are perfectly real,
 * and they fade out with it. Placing them at a guessed distance would put 207
 * invented stars into a view whose entire claim is that the stars are where
 * they are; losing 2.3% of the faint end on the way out costs nothing.
 */

/**
 * Where a star's brightness is worked out, and the one line that matters.
 *
 * A star's apparent magnitude from somewhere else is
 * `m' = m + 5 log10(d' / d)` — the inverse-square law, in magnitudes. Nothing
 * else is needed: the star's luminosity cancels between the two, so no absolute
 * magnitude has to be derived, stored, or trusted.
 *
 * The consequence worth naming is that from inside the solar system `d'` and
 * `d` are equal to nine figures, so `m'` *is* the catalogue magnitude and this
 * reproduces the printed sky exactly. It has to: it is cross-fading with a dome
 * that draws precisely that.
 */
const VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aMagnitude;
  attribute float aDistance;

  uniform vec3 uCameraLocal;
  uniform float uPixels;
  uniform float uStage;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vGlare;

  #include <common>
  #include <logdepthbuf_pars_vertex>

  ${STAR_RAMP_GLSL}

  void main() {
    vColor = aColor;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    #include <logdepthbuf_vertex>

    /*
     * Distance measured in the object's own space, which is parsecs — the same
     * units the catalogue distance is in, so the ratio is unitless and the
     * world scale cannot get into it. Measuring in world units would have
     * worked too and would have quietly made the result depend on the scale
     * dial the moment either side of the ratio stopped being converted.
     *
     * The floor is a star you have flown into. The ratio would go to zero and
     * the logarithm to negative infinity; a thousandth of a parsec is 206 AU,
     * closer than this app has any business being to another star, and it keeps
     * the maths finite instead of producing a NaN that discards the vertex.
     */
    float seen = max(length(position - uCameraLocal), 0.001);
    float magnitude = aMagnitude + 5.0 * (log2(seen / aDistance) / log2(10.0));

    /*
     * Glare, for a star the camera has come close to.
     *
     * starSizeOf and starAlphaOf both flatten out at magnitude -1.5,
     * because they map onto a *chart's* range: Sirius is the brightest thing
     * in the sky and everything is drawn relative to it. Fly to a star and
     * that ceiling becomes the problem — from a third of a parsec Vega is
     * magnitude -7, forty times brighter than Venus, and it was being drawn at
     * exactly the same six pixels as Sirius. Arriving looked like nothing had
     * happened.
     *
     * What it must *not* become is a big disc. A star that close is still
     * 0.00002 degrees across — utterly unresolved, and it stays a point at any
     * distance this app can reach. What makes a bright point look bright is
     * glare: light spilling around it in the eye, the lens and the sensor. So
     * the extra magnitudes are spent on a halo and on overexposure, and the
     * core below is held at its true pixel size while the quad grows around it.
     */
    vGlare = clamp(magnitudeOver(magnitude) / 6.0, 0.0, 1.0);
    // No division by depth. A star is a point source: how big it is drawn is a
    // statement about how bright it is, and the brightness above already
    // carries the distance. Dividing again would apply the inverse-square law
    // twice.
    gl_PointSize = starSizeOf(magnitude) * uPixels * (1.0 + vGlare * 7.0);

    /*
     * And a star has to be able to go out.
     *
     * starAlphaOf bottoms out at its floor rather than at zero, and that is
     * deliberate where it came from: on the dome the floor is what keeps eight
     * thousand faint stars from being invisible, and no star on a dome ever
     * gets further away. Here they do. Left as it is, every star in the
     * catalogue would still be drawn at 26% opacity from ten thousand parsecs
     * out — the solar neighbourhood would hang in the view as a 980-parsec
     * bubble of stars that refused to dim, with a visible edge where the
     * catalogue's own limit is.
     *
     * So brightness past the naked-eye limit keeps falling, to nothing three
     * magnitudes later. That is the same thing the eye does, and it is what
     * makes the stars we know thin out into the Galaxy rather than travel with
     * us.
     */
    float faded = 1.0 - smoothstep(6.5, 9.5, magnitude);

    vAlpha = starAlphaOf(magnitude) * faded * uStage;
  }
`

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vGlare;

  #include <common>
  #include <logdepthbuf_pars_fragment>

  void main() {
    #include <logdepthbuf_fragment>

    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d) * 4.0;

    /*
     * The core is held at a fixed size in *pixels*.
     *
     * gl_PointCoord is normalised to the quad, so a threshold of 0.35 means
     * "35% of however big this point is" — and since the vertex shader grows
     * the quad eightfold for a close star, leaving it there would have drawn
     * exactly the swollen disc the glare is meant to avoid. Dividing by the
     * same growth factor keeps the bright middle the size it would have been
     * and lets everything the quad gained go to the halo.
     */
    float grown = 1.0 + vGlare * 7.0;
    float edge = 0.35 / grown;
    float core = 1.0 - smoothstep(edge, min(1.0, edge * 2.85), r);

    // A broad, steeply-falling skirt. Cubic rather than linear because glare
    // has no edge — anything with one reads as a drawn circle.
    float halo = pow(max(0.0, 1.0 - r), 3.0) * vGlare;

    float mask = core + halo * 0.55;
    if (mask <= 0.0) discard;

    vec3 rgb = mix(vColor, vec3(1.0), pow(1.0 - r, 3.0) * 0.18);
    /*
     * And it overexposes. Past 1.0 the colour is out of range for the display
     * and into the bloom pass's threshold, which is what turns a blown-out
     * core into actual glare on screen rather than a flat white dot. Costs
     * nothing when the bloom toggle is off — the value simply clips, which is
     * what an overexposed star does anyway.
     */
    gl_FragColor = vec4(rgb * (1.0 + vGlare * 1.8), vAlpha * mask);
  }
`

export default function DeepField({ starPixels = 2.1 }) {
  const { geometry, count } = useMemo(() => {
    const kept = STARS.filter((s) => s[4] > 0)
    const positions = new Float32Array(kept.length * 3)
    const colors = new Float32Array(kept.length * 3)
    const magnitudes = new Float32Array(kept.length)
    const distances = new Float32Array(kept.length)

    const direction = { x: 0, y: 0, z: 0 }
    const rgb = [0, 0, 0]

    for (let i = 0; i < kept.length; i++) {
      const [ra, dec, magnitude, colourIndex, parsecs] = kept[i]
      starDirection(ra, dec, direction)
      positions[i * 3] = direction.x * parsecs
      positions[i * 3 + 1] = direction.y * parsecs
      positions[i * 3 + 2] = direction.z * parsecs

      starColour(colourIndex, rgb)
      colors[i * 3] = rgb[0]
      colors[i * 3 + 1] = rgb[1]
      colors[i * 3 + 2] = rgb[2]

      magnitudes[i] = magnitude
      distances[i] = parsecs
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('aMagnitude', new THREE.BufferAttribute(magnitudes, 1))
    g.setAttribute('aDistance', new THREE.BufferAttribute(distances, 1))
    return { geometry: g, count: kept.length }
  }, [])

  const dpr = useThree((state) => state.viewport.dpr)
  const scaleMode = useStore((s) => s.scaleMode)

  const uniforms = useMemo(
    () => ({
      uCameraLocal: { value: new THREE.Vector3() },
      uPixels: { value: 0 },
      uStage: { value: 0 },
    }),
    [],
  )

  /*
   * Through a ref, never through the object above.
   *
   * `ShaderMaterial` deep-clones the uniforms it is constructed with, so
   * anything written to that object after mount goes into a map nothing
   * renders from. That cost `Starfield` its twinkle for the entire life of the
   * file without anyone noticing — see the note there. Every one of these
   * changes every frame, so the same mistake here would leave the deep field
   * permanently at stage zero: invisible, with nothing to suggest why.
   */
  const materialRef = useRef(null)
  const points = useRef(null)

  useFrame(({ camera }) => {
    const material = materialRef.current
    if (!material || !points.current) return

    const stage = getCosmicStage()
    material.uniforms.uStage.value = stage
    material.uniforms.uPixels.value = starPixels * dpr

    // Nothing is drawn until the handover begins. Eight and a half thousand
    // points cost little, but they cost it on every frame of every close-up
    // where not one of them is visible.
    points.current.visible = stage > 0
    if (stage <= 0) return

    // The camera in the object's own space: no rotation and no offset to undo,
    // only the uniform scale, so this is a divide rather than a matrix inverse.
    material.uniforms.uCameraLocal.value
      .copy(camera.position)
      .divideScalar(unitsPerParsec(scaleMode))
  })

  if (count === 0) return null

  return (
    <points
      ref={points}
      geometry={geometry}
      frustumCulled={false}
      renderOrder={-1000}
      scale={unitsPerParsec(scaleMode)}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        depthTest={false}
        // Not `transparent`: that chooses the render *queue*, and the opaque one
        // runs before the bodies. Blending comes from `blending` below. Same
        // reasoning as the dome's, and the same reason a star can never occlude
        // a planet at any distance.
        transparent={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}
