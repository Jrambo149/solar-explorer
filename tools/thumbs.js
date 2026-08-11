/**
 * Renders a spacecraft model to a thumbnail. Build-time only.
 *
 * Lives outside `src/` because nothing in the app imports it — it is loaded by
 * `scripts/render-spacecraft-thumbs.mjs` through a dynamic import against the
 * running dev server, which is what lets it use bare specifiers: Vite rewrites
 * `three` for anything it serves, and a page evaluating its own `import('three')`
 * could not resolve it.
 *
 * ## Why not render these in Node
 *
 * There is no GL context there. The alternatives are a native `gl` binding,
 * which is a compiled dependency this project does not have and does not want,
 * or the browser that is already being driven for every other visual check —
 * with a real GPU, the same three.js, and the same loader the app itself uses.
 */

import * as THREE from 'three'
import { createGLTFLoader } from '/src/gltf.js'

/**
 * Rendered larger than it is delivered, because the render is cropped.
 *
 * Framing a spacecraft by any single rule leaves slack — different craft have
 * different proportions, and the percentile below is a heuristic, not a fit. So
 * the model is drawn big, the transparent margin is measured and cut away, and
 * what is left is scaled to `OUT`. Every thumbnail then fills its frame by
 * construction rather than by luck, and the ones that were framed loosely lose
 * resolution to the crop instead of showing up small.
 */
const SIZE = 512
const OUT = 256

/** Kept clear inside the cropped frame, as a fraction. Booms need somewhere to go. */
const MARGIN = 0.04

/**
 * The view the models are drawn from.
 *
 * Three-quarters and slightly above, which is the angle every spacecraft
 * photograph and press render uses, and for the same reason: it shows a bus, a
 * dish and an array all at once, where a straight-on view collapses at least one
 * of them into an edge. The chip is 20-odd pixels across, so anything that reads
 * as a silhouette has to read from here.
 */
const VIEW = new THREE.Vector3(1, 0.45, 0.85).normalize()

/** Fraction of the frame the model fills. Under 1 so booms do not touch an edge. */
const FILL = 0.82

/**
 * The fraction of the model's vertices the shot has to contain.
 *
 * Not all of them, and that is the entire point. A bounding sphere is set by
 * whatever sticks out furthest, and on a spacecraft that is always a boom:
 * Voyager's magnetometer is thirteen metres of wire carrying a handful of
 * vertices, against a bus and a dish that are the thing you actually recognise.
 * Framed on the bounding sphere the recognisable part came out a fifth of the
 * frame and off to one side, which at a 22-pixel chip is a grey smudge.
 *
 * So the radius is a percentile of vertex distance rather than a maximum. The
 * booms run out of frame, which is correct — they are invisible at this size
 * either way — and the bus fills the picture.
 */
const CONTAINS = 0.82

/** Vertices to sample when measuring. Enough to be stable, few enough to be quick. */
const SAMPLE_CAP = 20000

/**
 * Where to point the camera and how far back to stand.
 *
 * Centred on the *median* of the sampled vertices rather than on the bounding
 * box, for the same reason the radius is a percentile: a long boom drags a box
 * centre far off the body it is attached to.
 */
function frameOf(model) {
  model.updateWorldMatrix(true, true)

  const points = []
  const v = new THREE.Vector3()
  let total = 0

  model.traverse((node) => {
    const position = node.isMesh ? node.geometry?.getAttribute('position') : null
    if (position) total += position.count
  })
  const stride = Math.max(1, Math.ceil(total / SAMPLE_CAP))

  model.traverse((node) => {
    const position = node.isMesh ? node.geometry?.getAttribute('position') : null
    if (!position) return
    for (let i = 0; i < position.count; i += stride) {
      v.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld)
      points.push(v.clone())
    }
  })

  if (!points.length) {
    const box = new THREE.Box3().setFromObject(model)
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    return { center: sphere.center, radius: sphere.radius || 1 }
  }

  const median = (values) => values.slice().sort((a, b) => a - b)[values.length >> 1]
  const center = new THREE.Vector3(
    median(points.map((p) => p.x)),
    median(points.map((p) => p.y)),
    median(points.map((p) => p.z)),
  )

  const distances = points.map((p) => p.distanceTo(center)).sort((a, b) => a - b)
  const radius = distances[Math.min(distances.length - 1, Math.floor(distances.length * CONTAINS))]

  return { center, radius: radius > 0 ? radius : 1 }
}

/** Eyes' axis correction, composed — the same rule as `Spacecraft.jsx`. */
function axisCorrection(rotate) {
  const q = new THREE.Quaternion()
  if (!rotate) return q
  const step = new THREE.Quaternion()
  const axis = new THREE.Vector3()
  for (const turn of rotate) {
    const [name, degrees] = Object.entries(turn)[0]
    axis.set(name === 'x' ? 1 : 0, name === 'y' ? 1 : 0, name === 'z' ? 1 : 0)
    step.setFromAxisAngle(axis, (degrees * Math.PI) / 180)
    q.multiply(step)
  }
  return q
}

/**
 * A transparent PNG data URL for one model, or null if it will not load.
 *
 * `rotate` is the craft's axis correction, applied so the thumbnail shows the
 * craft the way up the scene draws it. Without it the forty corrected craft
 * would be pictured on their sides in the nav while flying upright in the view.
 */
export async function renderThumb(url, rotate) {
  /*
   * The renderer is built before the model is loaded, which is the reverse of
   * the obvious order and is required rather than tidy.
   *
   * Four of these models carry Basis-compressed textures, and a Basis file is
   * transcoded to whichever compressed format the GPU actually supports — so
   * `KTX2Loader` has to be shown a live context before it can parse anything.
   * With the loader built at module scope, as it was, those four threw during
   * `loadAsync`, were swallowed by the `catch` below, and simply had no
   * thumbnail.
   */
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    // Without this the buffer is cleared before `toDataURL` can read it, and
    // every thumbnail comes back fully transparent — with no error anywhere.
    preserveDrawingBuffer: true,
  })
  renderer.setSize(SIZE, SIZE, false)
  renderer.setClearAlpha(0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const gltf = await createGLTFLoader(renderer)
    .loadAsync(url)
    .catch((error) => {
      console.warn(`[thumbs] ${url} — ${error?.message ?? error}`)
      return null
    })
  if (!gltf) {
    renderer.dispose()
    return null
  }

  const scene = new THREE.Scene()
  const model = gltf.scene
  model.quaternion.copy(axisCorrection(rotate))
  scene.add(model)

  /*
   * Lighting, and it has to be generous.
   *
   * These are real metallic-roughness materials on mostly-black thermal blanket
   * and bare metal, authored to be lit by a sun in a scene with nothing else in
   * it. Lit by one lamp they come out as a black silhouette on transparency,
   * which is a shape but not a picture. A key, a fill from the opposite side and
   * a soft hemisphere is enough to find the edges of a gold foil bus.
   */
  const key = new THREE.DirectionalLight(0xffffff, 3.4)
  key.position.copy(VIEW).add(new THREE.Vector3(0.3, 0.8, 0.2))
  scene.add(key)

  const fill = new THREE.DirectionalLight(0xaecbff, 1.1)
  fill.position.copy(VIEW).multiplyScalar(-1).add(new THREE.Vector3(0, 0.4, 0))
  scene.add(fill)

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x202028, 1.5))

  const { center, radius } = frameOf(model)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100)
  const distance = radius / (FILL * Math.tan((camera.fov * Math.PI) / 360))
  camera.position.copy(VIEW).multiplyScalar(distance).add(center)
  camera.lookAt(center)
  camera.near = Math.max(distance - radius * 4, 0.001)
  camera.far = distance + radius * 8
  camera.updateProjectionMatrix()

  renderer.render(scene, camera)
  const data = cropToContent(canvas)

  renderer.dispose()
  return data
}

/**
 * Trims the transparent border and rescales to `OUT`.
 *
 * The alpha channel is the mask: anything the renderer touched is opaque, so the
 * bounding box of non-transparent pixels is exactly the model's silhouette,
 * booms included. A threshold rather than `> 0` because antialiasing leaves a
 * fringe of nearly-transparent pixels a long way out from thin geometry, and
 * treating those as content would put the border back.
 */
function cropToContent(canvas) {
  /*
   * Copied into a second canvas first, and this is not tidiness.
   *
   * A canvas hands out exactly one kind of context for its lifetime: ask a
   * WebGL canvas for `2d` and it returns **null**, not an error. Written the
   * obvious way, the null lands in a guard, the function returns the uncropped
   * image, and every thumbnail is silently the thing this code exists to
   * prevent. `drawImage` moves the pixels somewhere they can be read.
   */
  const work = document.createElement('canvas')
  work.width = canvas.width
  work.height = canvas.height
  const ctx = work.getContext('2d')
  ctx.drawImage(canvas, 0, 0)

  const { data: pixels } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  // Nothing drawn. Hand back the blank so the caller's size check catches it.
  if (maxX < 0) return work.toDataURL('image/png')

  // A square crop, so the aspect ratio survives the rescale.
  const side = Math.max(maxX - minX + 1, maxY - minY + 1) * (1 + MARGIN * 2)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  const out = document.createElement('canvas')
  out.width = OUT
  out.height = OUT
  const outCtx = out.getContext('2d')
  outCtx.imageSmoothingQuality = 'high'
  outCtx.drawImage(work, cx - side / 2, cy - side / 2, side, side, 0, 0, OUT, OUT)

  return out.toDataURL('image/png')
}
