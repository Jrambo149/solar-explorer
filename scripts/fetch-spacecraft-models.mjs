#!/usr/bin/env node
/**
 * Downloads Eyes' spacecraft meshes into `Models/Spacecraft/`.
 *
 * Run with:
 *     npm run models:spacecraft
 *
 * A sibling of `fetch-eyes-models.mjs` rather than another entry in its table,
 * because a spacecraft is a different kind of object from a moon and the
 * difference runs all the way through the pipeline.
 *
 * ## Why these cannot go through `prepare-nasa-model.mjs`
 *
 * That script exists to turn a NASA *body* into something `Body.jsx` can draw,
 * and it does two things that are right for a moon and wrong for a spacecraft:
 *
 * **It keeps only the first mesh.** A moon is one closed surface. Voyager is
 * three meshes and five materials — bus, dish, booms — and Cassini is far more.
 * Taking the first would ship a probe with no antenna.
 *
 * **It rewrites the material** to `roughness: 0.92, metalness: 0`, because a
 * planet lit by one point light should not look like a snooker ball. A
 * spacecraft is the opposite case: it is *made* of metal and gold foil, and
 * Eyes' models carry real metallic-roughness PBR authored to say so. Voyager's
 * first material alone has a normal map, a base-colour map and a
 * metallic-roughness map. Flattening those would remove the only thing that
 * makes the models worth having.
 *
 * So these are containerised and shipped as they arrive: every mesh, every
 * material, every map. The only transformation is packing the loose `.gltf` +
 * `.bin` + images into one self-contained `.glb`, which is a change of
 * container and not of content — the vertex data keeps its byte offsets and is
 * copied unmoved.
 *
 * ## Sizes
 *
 * Nothing is re-encoded, so these ship at Eyes' own weight. They are loaded
 * behind the existing progress bar and only when the spacecraft layer is
 * switched on, which is off by default.
 *
 * ## Provenance
 *
 * Eyes' own art assets, from its static bundle, not the science.nasa.gov 3D
 * Resources catalogue. The same caveat as `fetch-eyes-models.mjs`: NASA/JPL
 * imagery is generally public domain and this is JPL's own visualisation, but
 * that is a different distribution path from the catalogue's stated terms and
 * is worth confirming before this appears in anything published.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SPACECRAFT } from './spacecraft-roster.mjs'
import { LANDED_CRAFT } from '../src/data/landedCraft.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * Eyes' own set, kept in a subfolder of `Models/Spacecraft/`.
 *
 * Not because a subfolder is tidier but because **this filesystem is
 * case-insensitive** and the folder already holds hand-downloaded models whose
 * names differ from these only in case: `Cassini.glb` against this script's
 * `cassini.glb`, `Voyager.glb` against `voyager.glb`, `Juno.glb`, `MarCO.glb`.
 * Writing to the root would have quietly destroyed four files nobody asked to
 * replace, and `existsSync` would have reported the opposite problem — that
 * Eyes' Cassini was "already present" when what sat there was a different
 * model of unknown provenance.
 *
 * Separating them keeps both: the hand-downloaded copies stay exactly as they
 * were, and everything under `eyes/` is reproducible by re-running this script.
 */
const OUT_DIR = join(ROOT, 'Models', 'Spacecraft', 'eyes')

const BASE = process.env.EYES_ASSET_BASE || 'https://eyes.nasa.gov/assets/static/models'
const TIMEOUT_MS = 120000

/**
 * Eyes' model path -> the filename this app ships it under.
 *
 * Derived from the *directory*, not the file, because the file is frequently
 * generic — `sc_dawn/model.gltf` and `sc_marco/model.gltf` would collide as
 * `model.glb`. The directory is always the mission.
 */
export function slugFor(modelPath) {
  const parts = posix.dirname(modelPath).split('/')
  const dir = parts[0].replace(/^sc_/, '').replace(/_v\d+$/, '').replace(/_/g, '-')

  /*
   * A craft can have more than one model, and the directory alone cannot say
   * which.
   *
   * Eyes ships the Mars surface missions twice over: `sc_mars_2020/cruise_whole/
   * msl_cruise_stage.gltf` is the disc that carried it there, and
   * `sc_mars_2020/rover/perseverance.gltf` is Perseverance. Both live under
   * `sc_mars_2020`, so the old rule gave them one slug and one baked file —
   * whichever was fetched last would silently stand in for the other, and the
   * thumbnails already shipped show cruise stages where the rovers should be.
   *
   * So a `rover` or `lander` folder joins the slug. Only those two: every other
   * second-level folder in the roster names the same object as its parent, and
   * folding them in would rename files that are already correct.
   *
   * The suffix is appended even when the directory already ends with it, so
   * the Mars Exploration Rover's rover is `mars-exploration-rover-rover`. That
   * reads badly and is the only correct answer: its cruise stage is
   * `sc_mars_exploration_rover/cruise/...`, which is `mars-exploration-rover`,
   * and skipping the suffix there put the two back on one slug — the exact
   * collision this exists to prevent. A first version did skip it, and the
   * fetch reported the rover as "already present" while the cruise stage sat in
   * its place.
   */
  const variant = parts[1]
  if (variant !== 'rover' && variant !== 'lander') return dir
  return `${dir}-${variant}`
}

async function get(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'solar-explorer/1.0 (build script)' },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/* ---------------------------------------------------------------- *
 * GLB container
 * ---------------------------------------------------------------- */

const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

const pad = (buf, filler) => {
  const over = buf.length % 4
  return over === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - over, filler)])
}

function writeGlb(path, json, bin) {
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20)
  const binChunk = pad(bin, 0)
  const header = Buffer.alloc(12)
  header.writeUInt32LE(GLB_MAGIC, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8)
  const chunkHeader = (length, type) => {
    const h = Buffer.alloc(8)
    h.writeUInt32LE(length, 0)
    h.writeUInt32LE(type, 4)
    return h
  }
  writeFileSync(
    path,
    Buffer.concat([
      header,
      chunkHeader(jsonChunk.length, CHUNK_JSON),
      jsonChunk,
      chunkHeader(binChunk.length, CHUNK_BIN),
      binChunk,
    ]),
  )
}

/**
 * Folds every external buffer and image into one binary chunk.
 *
 * Unlike the moon models, a spacecraft glTF is not guaranteed to have exactly
 * one buffer, so buffers are concatenated in order and each buffer view is
 * shifted by its own buffer's new base offset. Views are then all rooted at
 * buffer 0, which is what a GLB requires.
 */
function pack(gltf, buffers, images) {
  const json = structuredClone(gltf)
  const chunks = []
  let offset = 0
  const align = () => {
    const over = offset % 4
    if (over) {
      chunks.push(Buffer.alloc(4 - over))
      offset += 4 - over
    }
  }

  const bases = []
  for (const data of buffers) {
    bases.push(offset)
    chunks.push(data)
    offset += data.length
    align()
  }

  for (const view of json.bufferViews ?? []) {
    view.byteOffset = (view.byteOffset ?? 0) + bases[view.buffer ?? 0]
    view.buffer = 0
  }

  json.images = (json.images ?? []).map((image) => {
    if (image.uri === undefined) return image // already a buffer view
    const data = images.get(image.uri)
    if (!data) throw new Error(`no bytes downloaded for image "${image.uri}"`)
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length })
    chunks.push(data)
    offset += data.length
    align()
    return {
      name: image.name,
      mimeType: image.mimeType ?? (image.uri.endsWith('.png') ? 'image/png' : 'image/jpeg'),
      bufferView: json.bufferViews.length - 1,
    }
  })

  const packed = Buffer.concat(chunks)
  json.buffers = [{ byteLength: packed.length }]
  return { json, bin: packed }
}

/* ---------------------------------------------------------------- *
 * Entry point
 * ---------------------------------------------------------------- */

async function fetchOne(modelPath) {
  const base = `${BASE}/${posix.dirname(modelPath)}`
  const gltf = JSON.parse((await get(`${BASE}/${modelPath}`)).toString('utf8'))

  const buffers = []
  for (const buffer of gltf.buffers ?? []) {
    if (!buffer.uri) throw new Error('embedded buffer in a .gltf')
    if (buffer.uri.startsWith('data:')) {
      buffers.push(Buffer.from(buffer.uri.split(',')[1], 'base64'))
      continue
    }
    const data = await get(`${base}/${buffer.uri}`)
    if (data.length !== buffer.byteLength) {
      throw new Error(`${buffer.uri} is ${data.length} bytes, manifest says ${buffer.byteLength}`)
    }
    buffers.push(data)
  }

  const images = new Map()
  for (const image of gltf.images ?? []) {
    if (image.uri === undefined || image.uri.startsWith('data:')) continue
    images.set(image.uri, await get(`${base}/${image.uri}`))
  }

  const verts = (gltf.meshes ?? []).reduce(
    (n, mesh) =>
      n + mesh.primitives.reduce((m, p) => m + (gltf.accessors[p.attributes.POSITION]?.count ?? 0), 0),
    0,
  )
  return { ...pack(gltf, buffers, images), stats: { verts, meshes: gltf.meshes?.length ?? 0, materials: gltf.materials?.length ?? 0, images: images.size } }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const force = process.argv.includes('--force')
  const only = process.argv.filter((a) => !a.startsWith('-')).slice(2)

  // One entry per distinct file: Eyes reuses a mesh across a whole series, so
  // the two Voyagers, the two Pioneers and the two Artemis flights are one
  // download each.
  const wanted = new Map()
  const add = (path, user) => {
    const slug = slugFor(path)
    if (only.length && !only.includes(slug)) return
    if (!wanted.has(slug)) wanted.set(slug, { path, users: [] })
    wanted.get(slug).users.push(user)
  }

  for (const craft of SPACECRAFT) {
    if (!craft.model) continue
    add(craft.model, craft.name)
  }

  /*
   * The surface missions want a second model each.
   *
   * The roster's `model` for the three rovers is the *cruise stage* that carried
   * them — Eyes' own entity carries that path, and it is the right object for
   * the months in transit. The rover itself is a separate file in the same
   * directory, and it is what a viewer wants for the decade after landing. Both
   * are downloaded; `LANDED_CRAFT` decides which is drawn when.
   */
  for (const [id, site] of Object.entries(LANDED_CRAFT)) {
    if (!site.model) continue
    add(site.model, `${site.name} (landed)`)
    void id
  }

  const kb = (b) => `${(b / 1024).toFixed(0)} KB`
  let total = 0
  const failed = []

  for (const [slug, { path, users }] of [...wanted].sort()) {
    const out = join(OUT_DIR, `${slug}.glb`)
    if (!force && existsSync(out)) {
      total += statSync(out).size
      console.log(`[sc] ${slug}  — already present, skipped`)
      continue
    }
    try {
      const { json, bin, stats } = await fetchOne(path)
      writeGlb(out, json, bin)
      const size = statSync(out).size
      total += size
      console.log(
        `[sc] ${slug}  ${stats.verts} verts, ${stats.meshes} meshes, ` +
          `${stats.materials} materials, ${stats.images} images -> ${kb(size)}`,
      )
      console.log(`[sc]      ${users.join(', ')}`)
    } catch (error) {
      failed.push({ slug, path, message: error.message })
      console.error(`[sc] ${slug}  FAILED — ${error.message}`)
    }
  }

  console.log(
    `\n[sc] ${wanted.size - failed.length}/${wanted.size} models, ` +
      `${(total / 1048576).toFixed(1)} MB in Models/Spacecraft/`,
  )
  if (failed.length) {
    console.error(`\n[sc] ${failed.length} failed:`)
    for (const f of failed) console.error(`[sc]   ${f.slug}  (${f.path})  ${f.message}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`[sc] ${error.message}`)
  process.exitCode = 1
})
