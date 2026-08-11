/**
 * Spacecraft meshes, loaded on demand.
 *
 * The one asset class in this app that is **not** preloaded, and the exception
 * is measured rather than stylistic. Every texture and every body mesh is
 * fetched up front behind the progress bar, which is what lets components read
 * synchronously and lets the app have no Suspense boundaries anywhere. That
 * works because those assets come to a few tens of megabytes.
 *
 * Eyes' 57 spacecraft models come to **263 MB**. Putting them in the preload
 * would mean every visit paying for all of them before the Sun appeared, to
 * draw a layer that is off by default.
 *
 * Nor is it a texture problem that could be compressed away. BioSentinel is
 * 32 MB and only 2.8 MB of that is images — the rest is **768 meshes** of CAD
 * geometry. Shrinking maps would not touch it; only mesh decimation would, and
 * that is a different project.
 *
 * So: a craft's mesh is fetched the first time something actually needs it, and
 * until then the craft draws as a marker. That is not a downgrade for most
 * views — at any scale wider than a close-up a four-metre spacecraft is far
 * under a pixel, and a marker is the only thing that could be seen at all.
 *
 * Failure is survivable by design: the marker is always drawn, so a mesh that
 * never arrives leaves a craft that is still in the right place, still
 * labelled, still selectable.
 */

import { createGLTFLoader } from '../gltf'

/** slug -> THREE.Group, ready to clone. */
const loaded = new Map()

/** slug -> in-flight promise, so a craft is never fetched twice. */
const inflight = new Map()

/** Slugs that failed, so a broken file is not retried every frame. */
const failed = new Set()

let loader = null

/**
 * The roster's model path to the slug the baked file is named by.
 *
 * The registry carries Eyes' own path — `sc_themis/themis.gltf` — because that
 * is what its entity table says and the roster is a transcription. The baked
 * file is `themis.glb`, named for the **directory** rather than the file, because
 * `sc_dawn/model.gltf` and `sc_marco/model.gltf` would otherwise collide.
 *
 * The two were never joined up. `Spacecraft` handed the raw path straight to the
 * loader, which asked for `models/spacecraft/sc_themis/themis.gltf.glb`, got a
 * 404, and marked the craft failed — so every spacecraft in the app has been
 * drawing as its fallback octahedron and no mesh has ever appeared. It is the
 * same rule as `slugFor` in `fetch-spacecraft-models.mjs`, and it has to stay
 * that way: that script names the files, this reads them.
 */
export function modelSlug(modelPath) {
  if (!modelPath) return null
  const parts = modelPath.split('/')
  const dir = parts[0].replace(/^sc_/, '').replace(/_v\d+$/, '').replace(/_/g, '-')

  /*
   * A `rover` or `lander` folder joins the slug, because a craft can have more
   * than one model and the directory alone cannot tell them apart: Eyes keeps
   * the cruise stage that carried Perseverance to Mars and Perseverance itself
   * both under `sc_mars_2020`. See `slugFor` in `fetch-spacecraft-models.mjs`,
   * which names the files this reads, and `render-spacecraft-thumbs.mjs`, which
   * writes a picture beside each — all three have to agree.
   */
  const variant = parts[1]
  if (variant !== 'rover' && variant !== 'lander') return dir
  return `${dir}-${variant}`
}

/**
 * The mesh for a craft, or null if it is not here yet.
 *
 * Synchronous, like `getBodySurface`. Callers re-read it on later frames rather
 * than being handed a promise — a component cannot suspend here.
 */
export function getSpacecraftModel(slug) {
  return loaded.get(slug) ?? null
}

/**
 * Asks for a craft's mesh. Safe and cheap to call every frame.
 *
 * Returns nothing: the result appears in `getSpacecraftModel` when it arrives.
 *
 * `renderer` is the live `WebGLRenderer`, needed to build the loader: a Basis
 * texture is transcoded to whatever compressed format the GPU supports, so the
 * KTX2 decoder has to be shown a context before it can choose one. Taken as an
 * argument rather than registered up front because the loader is built on the
 * first request, by which point a caller inside the canvas certainly has one —
 * a `setRenderer` called from somewhere else would be one more mount-order
 * contract to get wrong.
 */
export function requestSpacecraftModel(slug, renderer) {
  if (!slug || loaded.has(slug) || inflight.has(slug) || failed.has(slug)) return
  loader ??= createGLTFLoader(renderer)

  const promise = new Promise((resolve) => {
    loader.load(
      `${import.meta.env.BASE_URL}models/spacecraft/${slug}.glb`,
      (gltf) => {
        // The whole scene, not the first mesh — a spacecraft is a bus, panels,
        // booms and an antenna, and its materials are real metallic-roughness
        // PBR. This is exactly where the body-mesh path would be wrong.
        loaded.set(slug, gltf.scene)
        inflight.delete(slug)
        resolve(true)
      },
      undefined,
      (error) => {
        console.warn(`[spacecraft] could not load "${slug}" — ${error?.message ?? error}`)
        failed.add(slug)
        inflight.delete(slug)
        resolve(false)
      },
    )
  })
  inflight.set(slug, promise)
}

/** How many meshes are resident, for the verifier and for debugging. */
export const loadedCount = () => loaded.size

/**
 * What each spacecraft's mesh is actually drawn at, in world units.
 *
 * A non-reactive registry, in the same spirit as `planetPositions`: written by
 * `Spacecraft` every time its frame or the scale changes, read by the camera.
 *
 * It exists because `focusDistance` parks the camera at a multiple of
 * `bodyRadius`, and for a spacecraft that is the *marker's* size — the floor
 * that keeps a locator findable — not the mesh's. With the mesh now twenty times
 * smaller than the marker, the camera flew all the way to a craft and stopped
 * twenty times too far out, leaving you to zoom in by hand every time.
 *
 * Deliberately not a field on the body: the mesh's size depends on which frame
 * the craft is in *at this instant*, and the registry is already how this app
 * carries per-frame facts that React must not re-render for.
 */
const drawnRadii = new Map()

export const setDrawnRadius = (id, radius) => {
  if (radius > 0) drawnRadii.set(id, radius)
}

export const clearDrawnRadius = (id) => {
  drawnRadii.delete(id)
}

/** The drawn radius for a body, or null if it is not a spacecraft with a mesh. */
export const getDrawnRadius = (id) => drawnRadii.get(id) ?? null

/**
 * The baked thumbnail for a craft's model, or null.
 *
 * The nav bar's counterpart to `getTextureURL`. A planet's chip is its own
 * surface map, so the bar shows real thumbnails; a spacecraft has no map and
 * fell back to a flat disc of its accent colour — ten craft, ten identical grey
 * circles that named different things and looked like the same thing.
 *
 * Rendered from the model itself by `scripts/render-spacecraft-thumbs.mjs`, so
 * the chip is a picture of exactly what you fly to. Keyed by model rather than
 * by craft, because the two ARTEMIS probes are one THEMIS bus and the GRAIL twins
 * are one file — the same reason the meshes themselves are.
 *
 * There used to be an exception list here — Artemis, Danuri, ESCAPADE and
 * Mariner 2, the four models that declare `KHR_draco_mesh_compression` and
 * `KHR_texture_basisu` as *required*, which a bare `GLTFLoader` rejects outright
 * rather than reading at lower quality. They had no thumbnail because they could
 * not be rendered, in the nav or in the scene. `createGLTFLoader` configures both
 * decoders now, so every model in the roster loads and there is nothing to
 * exclude.
 */
export function getSpacecraftThumb(modelPath) {
  const slug = modelSlug(modelPath)
  if (!slug) return null
  return `${import.meta.env.BASE_URL}thumbs/spacecraft/${slug}.png`
}
