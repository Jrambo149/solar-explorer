import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { unitsPerParsec } from '../orbit/frames'
import { useStore } from '../store/useStore'
import { getDiscStage } from './cosmicStage'
import { galaxyCorners } from './galaxyGeometry'

/**
 * The Milky Way from outside, drawn the way Eyes draws it.
 *
 * `MilkyWay.jsx` draws the same object from within, as the band across the sky.
 * The two cross-fade on the disc stage: a band is what a disc looks like from
 * inside it, and once the camera is genuinely out, that picture stops being
 * true and this one starts.
 *
 * ## The picture
 *
 * R. Hurt's (NASA/JPL-Caltech) face-on rendering of the Galaxy — the actual
 * file Eyes on the Solar System uses, `sprites/milky_way.png`, fetched at build
 * time by `scripts/fetch-galaxy-sprite.mjs` and served from `public/textures`.
 * Eyes sizes it 1.2e18 km across, which is 126,840 light years, and that size is
 * carried through rather than chosen here.
 *
 * This replaced a procedurally sampled point cloud built from Reid's arm fits.
 * That version was more defensible on paper — every point derived from a
 * published number — and it read as a spray of dots rather than as a galaxy.
 * The measurements did not go away: they are still in `src/data/galaxy.js`, and
 * they now do a job the point cloud could not, which is to say *which way round
 * this image goes*.
 *
 * ## A plane, not a billboard — the one place this differs from Eyes
 *
 * Eyes uses a `SpriteComponent`, so its Milky Way turns to face the camera and
 * is seen face-on from everywhere. That is a deliberate simplification and it
 * has a real cost: fly above the plane or into it and the picture is identical,
 * so the disc has no orientation and you can never see it edge-on.
 *
 * Here it lies in the galactic plane, at the attitude the Galaxy actually has,
 * so pulling out along the app's default three-quarter view shows it inclined —
 * which is both truer and, from most angles, better looking.
 *
 * The price is a rotation Eyes never has to decide, and one that is invisible
 * when wrong: a spiral turned ninety degrees, or mirrored, is still a perfectly
 * convincing spiral. So it is measured, not chosen — see
 * `fetch-galaxy-sprite.mjs`, which fits the image's own arms against Reid's six
 * over every rotation and both handednesses.
 */

/**
 * Gain on the image's colour, and it is deliberately above one.
 *
 * The obvious control is `opacity`, and it cannot do this. The picture is a
 * galaxy painted on transparency, so what makes the outer arms faint is their
 * own low *alpha* — and over a black background, lowering opacity and using
 * additive blending both come to the same arithmetic, `rgb * alpha`. Turning
 * either one up cannot recover light the alpha channel never had.
 *
 * So the fade to nothing stays on opacity, where it belongs, and the overall
 * level is a multiplier on the colour instead. Above 1.0 is only meaningful
 * because this material sets `toneMapped={false}`; anything ACES touched would
 * simply roll off.
 */
const GAIN = 1.9

export default function Galaxy() {
  const scaleMode = useStore((s) => s.scaleMode)
  /* The corners come out in kiloparsecs; one scale takes them to world units. */
  const scale = unitsPerParsec(scaleMode) * 1000

  const geometry = useMemo(() => {
    const corners = galaxyCorners()
    const positions = new Float32Array(corners.flatMap((c) => c.position))
    const uvs = new Float32Array(corners.flatMap((c) => c.uv))
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    // Corners are ordered (-,-) (+,-) (-,+) (+,+), so the two triangles are the
    // standard strip split.
    g.setIndex([0, 1, 2, 2, 1, 3])
    return g
  }, [])

  /*
   * Loaded by literal path rather than through the texture registry, for the
   * same reason `MilkyWay` loads its panorama that way: this is not a body and
   * has no procedural fallback. The file is either there under this name or
   * there is no disc, which is the honest outcome for a picture that cannot be
   * invented.
   */
  const [map, setMap] = useState(null)
  useEffect(() => {
    let alive = true
    new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}textures/milky-way-face.png`,
      (texture) => {
        if (!alive) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        // The image is a disc on transparency and the quad runs past its edge,
        // so the corners sample outside 0..1. Clamping keeps that as more
        // transparency instead of wrapping the galaxy's rim back over itself.
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        setMap(texture)
      },
    )
    return () => {
      alive = false
    }
  }, [])

  /*
   * The Sun's marker, which needs no position at all.
   *
   * The scene is heliocentric, so the origin *is* the Sun, and with the image
   * laid in the plane around it the marker lands where it belongs for free.
   * This was briefly not true: while the picture was billboarded the origin
   * stopped being where the Sun appeared in it, and the marker had to be placed
   * inside the image by hand. Back in the plane, the geometry does it.
   */
  const marker = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    return g
  }, [])

  const dpr = useThree((state) => state.viewport.dpr)
  const markerUniforms = useMemo(
    () => ({ uPixels: { value: 0 }, uStage: { value: 0 } }),
    [],
  )

  const disc = useRef(null)
  const markerPoints = useRef(null)
  const markerMaterial = useRef(null)

  useFrame(() => {
    const stage = getDiscStage()
    const on = stage > 0

    if (disc.current) {
      disc.current.visible = on
      // Opacity carries the cross-fade; the gain carries the brightness. See
      // `GAIN` for why those cannot be the same number.
      if (on) disc.current.material.opacity = stage
    }
    if (markerPoints.current) markerPoints.current.visible = on
    // Written through the ref, never through the object above: `ShaderMaterial`
    // deep-clones the uniforms it is built with. See the note in `Starfield`,
    // which lost its twinkle to exactly that for the life of the file.
    if (on && markerMaterial.current) {
      markerMaterial.current.uniforms.uStage.value = stage
      markerMaterial.current.uniforms.uPixels.value = 26 * dpr
    }
  })

  if (!map) return null

  return (
    <group scale={scale}>
      {/*
        `renderOrder` -1002, behind the band at -1001 and the stars at -1000, so
        the deepest thing in the scene is laid down first and everything paints
        over it. Depth testing off for the same reason the rest of the sky has
        it off — a backdrop should never compete for the depth buffer with a
        planet 1e12 world units nearer.

        `DoubleSide` because the plane can be crossed: the camera arrives from
        whichever side of the galactic plane the flight out happened to leave on,
        and a single-sided disc is invisible from below.
      */}
      <mesh ref={disc} geometry={geometry} frustumCulled={false} renderOrder={-1002}>
        <meshBasicMaterial
          map={map}
          side={THREE.DoubleSide}
          transparent
          opacity={0}
          color={new THREE.Color(GAIN, GAIN, GAIN)}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/*
        The Sun's place in it, as a ring rather than a dot — a dot would be one
        more speck on a picture made of them, and a ring has a hole so what it
        marks stays visible through it. Drawn at the origin because that is
        where the Sun is: the scene is heliocentric, so the marker needs no
        position at all, and the point it makes is made by where the rest of the
        Galaxy sits around it.
      */}
      <points ref={markerPoints} geometry={marker} frustumCulled={false} renderOrder={-999}>
        <shaderMaterial
          ref={markerMaterial}
          uniforms={markerUniforms}
          vertexShader={/* glsl */ `
            uniform float uPixels;
            #include <common>
            #include <logdepthbuf_pars_vertex>
            void main() {
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              gl_Position = projectionMatrix * mv;
              #include <logdepthbuf_vertex>
              gl_PointSize = uPixels;
            }
          `}
          fragmentShader={/* glsl */ `
            uniform float uStage;
            #include <common>
            #include <logdepthbuf_pars_fragment>
            void main() {
              #include <logdepthbuf_fragment>
              float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
              float ring = smoothstep(0.62, 0.70, r) * (1.0 - smoothstep(0.86, 0.96, r));
              if (ring <= 0.0) discard;
              gl_FragColor = vec4(1.0, 0.98, 0.90, ring * uStage * 0.9);
            }
          `}
          depthTest={false}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </group>
  )
}
