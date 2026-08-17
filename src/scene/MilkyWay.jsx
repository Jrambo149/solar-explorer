import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { getDiscStage, skyRadiusFor } from './cosmicStage'
import { getDaylight } from './daylight'
import * as THREE from 'three'
import { galacticDirection, galacticLongitudeAt } from './sky'

/**
 * The Galaxy we are inside, drawn as the band it looks like from here.
 *
 * This is what the zoom-out arrives at. Pull back past the Kuiper belt and the
 * planets close up into a knot around the Sun; what is left filling the view is
 * the sky, and the sky's largest feature by far is the disc of our own galaxy
 * seen edge-on from a third of the way out along it.
 *
 * ## A band *and* a galaxy, now
 *
 * This file used to carry an argument for why the face-on spiral could not be
 * drawn: Eyes shows one once its camera is far enough out, and this camera
 * stopped at 165 AU — 0.0026 light years — so from everywhere it could reach,
 * the Galaxy is the band overhead. Drawing the spiral would have been drawing a
 * view from somewhere the camera had never been.
 *
 * That was a fact about the camera's range, and the range is what changed. It
 * now reaches 60 kpc, `Galaxy.jsx` draws the disc from out there, and the two
 * cross-fade over 2 to 25 kpc — which is the span over which "are we inside the
 * disc" stops having a clear answer.
 *
 * Neither picture replaces the other and neither is a fallback. A band is what
 * a disc looks like from within it, so this one is exactly right everywhere the
 * camera is inside the Galaxy, which is the overwhelming majority of the places
 * anyone will ever put it. What is no longer true is that it is right
 * *everywhere*, and continuing to paint it on a shell around a camera that has
 * left would put the Galaxy simultaneously around you and in front of you.
 *
 * ## The geometry is built from coordinates, not from a UV sphere
 *
 * `SphereGeometry` would be one line, and its UV convention would then decide
 * where the galactic centre landed — a mapping nobody in this file chose and
 * nothing could check. Instead every vertex is placed by
 * `galacticDirection(l, b)` at its own texture coordinate, exactly as the stars
 * and the constellation figures are placed by `starDirection`. The mapping from
 * image to sky is then a statement in this file, in the same frame as
 * everything else in the sky, and `verify-sky` can compare a drawn vertex
 * against a published galactic coordinate.
 */

/** Matches `DOME_RADIUS` in `Starfield`, and sits just outside it. */
const RADIUS = 1080

/**
 * Rows and columns of the sphere.
 *
 * 96 x 48 is 4,608 triangles for a backdrop, which sounds generous and is not:
 * the panorama is a smooth gradient with no geometry of its own, and the only
 * thing the tessellation has to do is keep the equirectangular distortion from
 * showing as facets near the poles. Below about 64 the band develops visible
 * straight edges where it crosses the frame.
 */
const SEGMENTS_LON = 96
const SEGMENTS_LAT = 48

/**
 * How bright the band is drawn, and the one number here that is a judgement.
 *
 * The panorama is a photographic mosaic and comes out of the file far brighter
 * than the sky it represents — drawn at full strength it is a grey wash across
 * the view with the stars lost inside it. The Milky Way is genuinely faint: it
 * is invisible from any city, and from a dark site it is a soft glow you notice
 * rather than a feature that dominates. This is dim enough to sit behind the
 * stars and be found by looking for it.
 */
const BRIGHTNESS = 0.42

export default function MilkyWay({ radius = RADIUS, brightness = BRIGHTNESS }) {
  const geometry = useMemo(() => {
    const positions = []
    const uvs = []
    const indices = []

    for (let row = 0; row <= SEGMENTS_LAT; row++) {
      const v = row / SEGMENTS_LAT
      const b = 90 - v * 180
      for (let column = 0; column <= SEGMENTS_LON; column++) {
        const u = column / SEGMENTS_LON
        const direction = galacticDirection(galacticLongitudeAt(u), b)
        positions.push(direction.x * radius, direction.y * radius, direction.z * radius)
        // `1 - v` because an image's first row is the top, which is `b = +90`.
        uvs.push(u, 1 - v)
      }
    }

    const stride = SEGMENTS_LON + 1
    for (let row = 0; row < SEGMENTS_LAT; row++) {
      for (let column = 0; column < SEGMENTS_LON; column++) {
        const a = row * stride + column
        const b = a + stride
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    g.setIndex(indices)
    return g
  }, [radius])

  /*
   * Loaded here rather than through the texture registry, and by a literal path
   * rather than through `getTextureURL`.
   *
   * That function answers "what did the loader resolve this body's map to",
   * which is a real question for a body — a planet's texture may have come out
   * as a downloaded photo or as a procedural fallback, and the nav chip has to
   * show whichever arrived. This is not a body and has no fallback: the file is
   * either there under this exact name or the sky has no band, which is the
   * honest outcome for a panorama that cannot be invented. Asking the registry
   * returned null, and the first version of this component drew nothing at all.
   */
  const [map, setMap] = useState(null)
  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}textures/milky-way.jpg`
    let alive = true
    const loader = new THREE.TextureLoader()
    loader.load(url, (texture) => {
      if (!alive) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.SRGBColorSpace
      // The seam runs down the galactic anticentre, where the band is at its
      // faintest, and wrapping keeps the two edges of the panorama continuous
      // across it.
      texture.wrapS = THREE.RepeatWrapping
      setMap(texture)
    })
    return () => {
      alive = false
    }
  }, [])

  const mesh = useRef(null)
  useFrame(({ camera }) => {
    if (!mesh.current) return
    /*
     * And it stops being the right picture once the camera is outside it.
     *
     * The header above argued that the spiral could not honestly be drawn
     * because the camera could never get to a place it would be seen from.
     * That premise is what changed: it can now, and `Galaxy` draws it from
     * there. Both are the Milky Way and only one of them can be true at a time
     * — a band is what the disc looks like from inside it, and continuing to
     * paint it on a shell around a camera that has left would put the Galaxy
     * simultaneously around you and in front of you.
     *
     * So this fades out on exactly the schedule the disc fades in. The two are
     * `1 - stage` and `stage`, which is what keeps the total honest.
     *
     * On the **disc** stage, not the star one. The two handovers happen four
     * decades apart and for unrelated reasons — see `cosmicStage.js`. Fading
     * the band out with the star dome at 1,320 AU would put out the Milky Way
     * while the camera was still, by any measure, inside it.
     */
    const fade = 1 - getDiscStage()
    mesh.current.visible = fade > 0
    if (fade <= 0) return

    mesh.current.position.copy(camera.position)
    mesh.current.scale.setScalar(skyRadiusFor(radius) / radius)
    /*
     * And out in daylight, with the stars.
     *
     * The same rule and the same reason — see scene/daylight.js. Easy to miss
     * when the stars were done first: they went out over a blue midday sky and
     * the galaxy stayed, which is a stranger picture than leaving both.
     */
    const lit = 1 - getDaylight() * getDaylight()
    mesh.current.material.color.setScalar(brightness * lit * fade)
  })

  if (!map) return null

  /*
   * Behind the stars, and behind them the same way they are behind the planets:
   * in the opaque queue, no depth test, no depth write, drawn first. The
   * `renderOrder` of -1001 is one step ahead of the starfield's -1000, so the
   * band is laid down and the stars painted over it.
   *
   * `BackSide` because the camera is inside the sphere.
   */
  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={-1001}>
      <meshBasicMaterial
        map={map}
        side={THREE.BackSide}
        color={new THREE.Color(brightness, brightness, brightness)}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
