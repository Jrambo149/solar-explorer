/**
 * A `GLTFLoader` that can read every model this app ships.
 *
 * One factory rather than a `new GLTFLoader()` at each call site, because the
 * decoders are not optional decoration: four of the spacecraft meshes declare
 * `KHR_draco_mesh_compression` and `KHR_texture_basisu` under
 * `extensionsRequired`, and a loader without them does not degrade — it rejects
 * the file outright. A second call site with a plain loader would silently be a
 * place where Artemis, Danuri, ESCAPADE and Mariner 2 do not exist, which is
 * exactly what happened while the nav's thumbnail baker and the scene each had
 * their own.
 *
 * ## Why neither decoder is given a path
 *
 * Every guide to these loaders calls `setDecoderPath` and `setTranscoderPath`,
 * and a first pass here did too — with a script that copied the payloads out of
 * `node_modules` into `public/` on install, plus the gitignore entry and the
 * postinstall step that go with it. All of it was unnecessary.
 *
 * three points at its own payloads with `new URL('../libs/draco/…',
 * import.meta.url)`, which Vite understands: the dev server resolves it into
 * `node_modules` and the bundler emits a content-hashed copy into `assets/`.
 * The wasm is fetched from the app's own origin either way, the version cannot
 * drift from the `three` that reads it, and setting a path only overrode a
 * mechanism that already worked. That advice is written for pages that load
 * three from a CDN, where there is nothing to resolve against.
 */

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'

/**
 * Shared across every loader, because each one owns a worker pool.
 *
 * `DRACOLoader` spins up workers on first use and `KTX2Loader` does the same;
 * building them per loader would mean a fresh pool, and a fresh download of the
 * wasm, for every call site. There is only ever one of each here.
 */
let draco = null
let ktx2 = null

/**
 * A loader ready for the compressed models.
 *
 * `renderer` is required by KTX2: a Basis file is transcoded to whichever
 * compressed texture format the GPU actually supports, so the loader has to be
 * shown a live context before it can pick one. Called without a renderer it
 * throws at parse time rather than at setup, which reads as a broken model.
 */
export function createGLTFLoader(renderer) {
  draco ??= new DRACOLoader()
  ktx2 ??= new KTX2Loader()
  // Cheap and idempotent, and it has to run against the renderer in use — a
  // loader built before the canvas existed would have detected nothing.
  ktx2.detectSupport(renderer)

  return new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2)
}
