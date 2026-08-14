import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CONSTELLATIONS, STARS } from '../data/stars'
import { CONSTELLATION_REGIONS } from '../data/constellations'
import { useStore } from '../store/useStore'
import { starDirection } from './sky'

/**
 * The 88 figures, drawn through the stars they connect.
 *
 * The lines are Stellarium's, and they arrive as pairs of *indices into*
 * `STARS` rather than as coordinates — resolved from HIP numbers when the sky
 * was baked. That is the property worth having: a figure cannot drift away from
 * its own stars, because it has no positions of its own to drift with. Every
 * vertex here is read out of the same catalogue array `Starfield` draws, at the
 * same radius, through the same conversion.
 *
 * ## One geometry, not 88
 *
 * Every figure in a single `LineSegments`, because there is nothing to be
 * gained from separating them: they share a material, none of them is
 * individually selectable, and 88 draw calls for 695 segments would be most of
 * a frame's overhead spent on lines that are off by default.
 *
 * ## Why it rides with the camera
 *
 * Same reason as the starfield, and it has to be the *same* reason or the two
 * would separate: stars are drawn on a dome that follows the camera, so a
 * figure drawn at fixed world positions would slide off its stars the moment
 * the camera moved. Both are pinned to the camera, so both are effectively at
 * infinity, which is where the sky is.
 */

/** The dome the stars are on. Shared with `Starfield` through the prop below. */
const DOME_RADIUS = 1000

/**
 * Eyes' own colour for these, read off its `ConstellationsComponent`: a cold
 * blue at half alpha, which is dim enough to sit under the stars rather than
 * over them. Its figures are drawn from the same lines, so matching the colour
 * makes the two apps agree on what a constellation looks like as well as on
 * where it is.
 */
const LINE_COLOUR = new THREE.Color(0.35, 0.7, 1)
/*
 * Dimmer than Eyes' own 0.5, and the screenshots are why: against this
 * catalogue the lines came out brighter than the stars they connect, so Orion
 * read as a diagram with some dots near it. The figures are an annotation of
 * the sky, so they have to sit under it.
 */
const LINE_OPACITY = 0.28

/**
 * The picked region, drawn back.
 *
 * A click on the sky has to produce something *on the sky*, or the only
 * evidence that it landed is a panel appearing at the edge of the screen —
 * which tells you a name without telling you what was named, and is exactly no
 * use to someone asking "what am I looking at?".
 *
 * So the answer is drawn where the question was asked: the region's own
 * boundary, and its figure brightened out of the crowd. Both come from
 * `constellations.js`, whose outlines were derived from the same table the
 * click was looked up in — so the shape drawn around the answer is guaranteed
 * to be the shape that produced it.
 *
 * ## Why the outline is not a closed loop
 *
 * A constellation's boundary is a set of arcs, not a polygon, and this draws
 * them as such. Serpens alone would defeat any assumption otherwise: it is one
 * constellation in two disconnected pieces, so there is no single loop to walk.
 * `LineSegments` over disjoint arcs has no opinion on the matter.
 */
function Region({ index, radius }) {
  const geometry = useMemo(() => {
    const region = CONSTELLATION_REGIONS[index]
    const figure = CONSTELLATIONS[index]

    const points = []
    const direction = { x: 0, y: 0, z: 0 }
    const push = (ra, dec) => {
      starDirection(ra, dec, direction)
      points.push(direction.x * radius, direction.y * radius, direction.z * radius)
    }

    // The outline, as consecutive pairs: a polyline of n points becomes n-1
    // segments, each written out twice over.
    for (const line of region.outline) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        push(line[i], line[i + 1])
        push(line[i + 2], line[i + 3])
      }
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))

    // And the figure inside it, on its own geometry so the two can be drawn at
    // different weights — the boundary is a fact about the sky, the figure is a
    // drawing, and they should not read as one object.
    const stick = []
    for (const starIndex of figure.segments) {
      const star = STARS[starIndex]
      starDirection(star[0], star[1], direction)
      stick.push(direction.x * radius, direction.y * radius, direction.z * radius)
    }
    const s = new THREE.BufferGeometry()
    s.setAttribute('position', new THREE.Float32BufferAttribute(stick, 3))

    return { boundary: g, figure: s }
  }, [index, radius])

  const group = useRef(null)
  useFrame(({ camera }) => {
    if (group.current) group.current.position.copy(camera.position)
  })

  return (
    <group ref={group}>
      <lineSegments geometry={geometry.boundary} frustumCulled={false} renderOrder={-998}>
        <lineBasicMaterial
          color={BOUNDARY_COLOUR}
          transparent
          opacity={0.5}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      <lineSegments geometry={geometry.figure} frustumCulled={false} renderOrder={-997}>
        <lineBasicMaterial
          color={PICKED_COLOUR}
          transparent
          opacity={0.95}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  )
}

/**
 * The picked figure and its boundary, in the app's own accent rather than the
 * sky blue the other 87 are drawn in. The boundary is dimmer than the figure it
 * encloses: it is a container, and it should not compete with its contents.
 */
const PICKED_COLOUR = new THREE.Color(1, 0.86, 0.62)
const BOUNDARY_COLOUR = new THREE.Color(0.62, 0.66, 0.78)

export default function Constellations({ radius = DOME_RADIUS }) {
  const picked = useStore((s) => s.constellation)

  const geometry = useMemo(() => {
    let count = 0
    for (const figure of CONSTELLATIONS) count += figure.segments.length

    const positions = new Float32Array(count * 3)
    const direction = { x: 0, y: 0, z: 0 }
    let v = 0
    for (const figure of CONSTELLATIONS) {
      for (const index of figure.segments) {
        const star = STARS[index]
        starDirection(star[0], star[1], direction)
        positions[v++] = direction.x * radius
        positions[v++] = direction.y * radius
        positions[v++] = direction.z * radius
      }
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [radius])

  const lines = useRef(null)
  useFrame(({ camera }) => {
    if (lines.current) lines.current.position.copy(camera.position)
  })

  /*
   * Drawn with the sky rather than with the scene: no depth test, no depth
   * write, and a `renderOrder` just after the starfield's -1000. A figure is a
   * mark on the backdrop, so a planet has to paint over it exactly as it paints
   * over the stars — and drawing it *after* the stars means a line crosses in
   * front of the faint ones it passes rather than being eaten by them.
   */
  return (
    <>
      <lineSegments ref={lines} geometry={geometry} frustumCulled={false} renderOrder={-999}>
        <lineBasicMaterial
          color={LINE_COLOUR}
          transparent
          opacity={LINE_OPACITY}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      {picked !== null && <Region index={picked} radius={radius} />}
    </>
  )
}
