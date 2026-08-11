/**
 * Downloads the meshes this app takes from NASA's Eyes on the Solar System.
 *
 * Run with:
 *     npm run models:eyes
 *
 * Two kinds, and the first is the reason the script exists: the three **generic
 * asteroids** Eyes dresses its minor moons in, plus the handful of **named**
 * models Eyes has that the science.nasa.gov 3D Resources catalogue does not.
 *
 * ## Why these exist
 *
 * NASA's 3D Resources library (https://science.nasa.gov/3d-resources/) — the
 * source of everything in `nasa-models.mjs` — publishes a model per *body*, and
 * it only publishes bodies somebody has actually surveyed. Themisto has never
 * been resolved into more than a point of light, and neither have the other
 * ~500 minor moons, so there is nothing there to download for any of them.
 *
 * Eyes solves this by not pretending. It ships three generic asteroids and
 * deals them out round-robin, alphabetically within each system:
 *
 *     adrastea 1, amalthea 2, metis 2, thebe 3,
 *     aitne 1, ananke 2, aoede 3, arche 1, autonoe 2, callirrhoe 3, ...
 *
 * Read out of its `app.js`, `themisto` is:
 *
 *     themisto: {
 *       groups: ["jupiter","moons","irregular"], radius: 4, label: "Themisto",
 *       model: { url: ".../generic/asteroid_3/generic_asteroid_3.gltf",
 *                scale: [4,4,4], shadowEntities: ["jupiter"] }, ... }
 *
 * — one of the three files, scaled by the body's radius in km. 527 references
 * across Jupiter, Saturn, Uranus, Neptune, Pluto, Haumea, the Ida and Patroclus
 * systems and seven comets. Nobody chose a shape to suit a moon; the shape is an
 * honest placeholder saying "small, lumpy, and we have never seen it".
 *
 * ## What this script does, and what it does not
 *
 * It only fetches and *containerises*: each model arrives as a `.gltf` plus a
 * loose `.bin` plus two loose texture files, and is written out as one
 * self-contained `.glb` under `Models/MinorMoons/`. Every decision about what
 * ships — JPEG quality, normal-map capping, unit normalisation, the material
 * rewrite — belongs to `prepare-nasa-model.mjs`, which runs over the result
 * exactly as it does over a hand-downloaded NASA file. Landing these in the same
 * shape as everything else in `Models/` is the entire point: one pipeline, not
 * two.
 *
 * `Models/MinorMoons/` is gitignored like its siblings. Unlike them it is
 * genuinely reproducible — this script is the download the others were done by
 * hand — so nothing is lost by not committing it.
 *
 * ## Provenance
 *
 * These are Eyes' own art assets, served from its static bundle, not items in
 * the 3D Resources catalogue. NASA/JPL imagery is generally public domain and
 * this is JPL's own visualisation, but that is a different distribution path
 * from the catalogue's stated terms, and it is worth someone confirming before
 * these appear in anything published.
 */

import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODELS_DIR = join(ROOT, 'Models')

// Overridable for the same reason `fetch-textures.mjs` allows it: so the set can
// come from a mirror or an offline cache rather than the live host.
const BASE = process.env.EYES_ASSET_BASE || 'https://eyes.nasa.gov/assets/static/models'

/**
 * What to fetch: `path` is Eyes' own directory, `stem` its own filename.
 *
 * The three generics, then the named ones. A named model earns its place here
 * only if the 3D Resources catalogue has nothing for that body — otherwise the
 * catalogue copy wins, because it is the higher-resolution original and its
 * terms are the ones stated on the page it comes from.
 *
 * **Proteus** is the first such case. Voyager 2 caught Neptune's second-largest
 * moon well enough in 1989 to build a shape model from, and it is a good one to
 * have: Proteus is right at the size where a body stops being round, about
 * 420 km across and visibly boxy, with a 150 km crater taking a bite out of one
 * end. Nothing in the catalogue covers it. Note Eyes gives it `scale: [1,1,1]`
 * rather than scaling by radius as it does the generics — the mesh is already at
 * true size, and normalising to unit radius here removes the distinction anyway.
 */
const MODELS = [
  ...[1, 2, 3].map((n) => ({ path: `generic/asteroid_${n}`, stem: `generic_asteroid_${n}` })),
  { path: 'proteus', stem: 'proteus' },
  /*
   * The four comets Eyes has a real shape for, and they are real for one reason:
   * a spacecraft went and looked. Every other comet in its list — nine of
   * thirteen, including Halley — wears a generic asteroid, because nobody has
   * resolved them into more than a moving point.
   *
   *   67P   Rosetta, 2014-16, and the best-mapped comet there is. The two-lobed
   *         contact-binary shape is the reason "rubber duck" entered the
   *         literature. Eyes also hangs four gas jets off this one.
   *   9P    Deep Impact, 2005 — the comet NASA fired a 370 kg copper slug into
   *         to see what was under the crust — then revisited by Stardust in 2011.
   *   103P  EPOXI, 2010, flying the Deep Impact spacecraft past a second target.
   *         A 2 km peanut spraying CO2 jets from both ends.
   *   19P   Deep Space 1, 2001, on an extended mission after its ion drive had
   *         already done its job. A rough, dark 8 km nucleus.
   *
   * They go to `Models/Comets/` rather than alongside the moons because they are
   * a different population, and the folder is the only thing that says so.
   */
  { path: '67p_churyumov_gerasimenko', stem: '67p_churyumov_gerasimenko', dir: 'Comets' },
  // `file` is the name inside the directory, which for three of these is not the
  // directory's own name — taken from the model URLs in Eyes' bundle rather than
  // assumed, after guessing produced three 403s.
  { path: '9p_tempel_1', file: '9p_tempel', stem: '9p_tempel_1', dir: 'Comets' },
  { path: '103p_hartley_2', file: 'hartley_2', stem: '103p_hartley_2', dir: 'Comets' },
  { path: '19p_borrelly', file: 'borrelly', stem: '19p_borrelly', dir: 'Comets' },
  /**
   * ʻOumuamua, the fifth real shape and the one that is not a spacecraft's doing.
   *
   * Nothing has ever photographed it. The first interstellar object ever seen
   * was found on its way out in October 2017, stayed observable for a couple of
   * weeks, and is now gone for good — what exists is a light curve, and it
   * varied by a factor of ten every 8.1 hours, which is what an object tumbling
   * end over end does when it is several times longer than it is wide. The mesh
   * is that inference given a form, not a picture of anything.
   */
  { path: '1i_oumuamua', file: 'oumuamua', stem: '1i_oumuamua', dir: 'Comets' },
  /**
   * Saturn's two, both Cassini shape models and neither in the catalogue.
   *
   * **Hyperion** is the reason the word "irregular" is not just about orbits. It
   * is 270 km across, shaped like a sponge, and tumbling chaotically — its
   * rotation axis moves so unpredictably that its orientation cannot be
   * predicted more than a few weeks out. A sphere would say none of that.
   *
   * **Phoebe** is a captured body from the outer solar system on a retrograde
   * orbit, and Cassini's 2004 flyby is the only close look anything has had. It
   * is also the source of Saturn's vast outer ring and of the dark material on
   * one face of Iapetus.
   */
  { path: 'hyperion', stem: 'hyperion' },
  { path: 'phoebe', stem: 'phoebe' },
]

const TIMEOUT_MS = 60000

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

/* ---------------------------------------------------------------- *
 * Packing
 * ---------------------------------------------------------------- */

/**
 * Folds the external `.bin` and the loose images into one binary chunk.
 *
 * The vertex data keeps its byte offsets — it is copied first and unmoved — so
 * every existing buffer view stays valid and only the images need new ones.
 * That is what makes this a container change rather than a rebuild: not one
 * vertex, index or UV is touched, and `prepare-nasa-model.mjs` sees the file
 * NASA authored.
 */
function pack(gltf, bin, images) {
  const json = structuredClone(gltf)
  const chunks = [bin]
  let offset = bin.length

  const align = () => {
    const over = offset % 4
    if (over) {
      chunks.push(Buffer.alloc(4 - over))
      offset += 4 - over
    }
  }
  align()

  json.images = (json.images ?? []).map((image) => {
    const data = images.get(image.uri)
    if (!data) throw new Error(`no bytes downloaded for image "${image.uri}"`)

    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length })
    chunks.push(data)
    offset += data.length
    align()

    // `uri` must go: an image is either a URI or a buffer view, never both.
    return {
      name: image.name,
      mimeType: image.mimeType,
      bufferView: json.bufferViews.length - 1,
    }
  })

  const packed = Buffer.concat(chunks)
  // A GLB's single buffer is the BIN chunk itself and carries no uri.
  json.buffers = [{ byteLength: packed.length }]
  return { json, bin: packed }
}

/* ---------------------------------------------------------------- *
 * Entry point
 * ---------------------------------------------------------------- */

async function main() {
  const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`
  let total = 0

  for (const { path, stem, file = stem, dir = 'MinorMoons' } of MODELS) {
    const OUT_DIR = join(MODELS_DIR, dir)
    mkdirSync(OUT_DIR, { recursive: true })
    const base = `${BASE}/${path}`
    const gltf = JSON.parse((await get(`${base}/${file}.gltf`)).toString('utf8'))

    if (gltf.buffers?.length !== 1 || !gltf.buffers[0].uri) {
      throw new Error(`${stem}: expected exactly one external buffer`)
    }

    const bin = await get(`${base}/${gltf.buffers[0].uri}`)
    if (bin.length !== gltf.buffers[0].byteLength) {
      throw new Error(
        `${stem}: ${gltf.buffers[0].uri} is ${bin.length} bytes, manifest says ` +
          `${gltf.buffers[0].byteLength}`,
      )
    }

    const images = new Map()
    for (const image of gltf.images ?? []) {
      images.set(image.uri, await get(`${base}/${image.uri}`))
    }

    const packed = pack(gltf, bin, images)
    const out = join(OUT_DIR, `${stem}.glb`)
    writeGlb(out, packed.json, packed.bin)
    total += statSync(out).size

    const verts = gltf.meshes.reduce(
      (n, mesh) =>
        n + mesh.primitives.reduce((m, p) => m + gltf.accessors[p.attributes.POSITION].count, 0),
      0,
    )
    console.log(`[eyes] ${stem}  ${verts} vertices`)
    console.log(`[eyes]   mesh     ${gltf.meshes.map((m) => m.name).join(', ')}`)
    console.log(`[eyes]   bin      ${kb(bin.length)}`)
    for (const [uri, data] of images) console.log(`[eyes]   image    ${uri}: ${kb(data.length)}`)
    console.log(`[eyes]   wrote    Models/${dir}/${stem}.glb  ${kb(statSync(out).size)}`)
  }

  console.log(
    `\n[eyes] ${MODELS.length} models, ${(total / 1048576).toFixed(1)} MB of source. ` +
      `Run \`npm run model:nasa -- ${MODELS.map((m) => m.stem.replace(/_/g, '-')).join(' ')}\` to ship them.`,
  )
}

main().catch((error) => {
  console.error(`[generic] ${error.message}`)
  process.exitCode = 1
})
