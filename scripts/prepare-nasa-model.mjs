/**
 * Repacks a NASA 3D model into a form this app can ship.
 *
 * Run with:
 *     npm run model:nasa -- pluto
 *
 * ## Why a conversion step exists
 *
 * NASA's models (https://science.nasa.gov/3d-resources/) are Blender exports,
 * and Blender's glTF exporter re-encodes every embedded image as **PNG**.
 * Pluto's map is named `pluto_equi.jpg` inside the file and is stored as a
 * 6.2 MB PNG — a lossless copy of a photograph, which is the one thing PNG is
 * worst at. The same pixels as JPEG are a fifth of that, and the file goes from
 * 6.8 MB to 1.6 MB with no visible difference on a sphere a few hundred pixels
 * across.
 *
 * The material is rewritten too. NASA ships `metallicFactor: 0.5`, which under
 * this scene's single point light makes a planet look like a snooker ball;
 * `Body.jsx` builds its own `MeshStandardMaterial` at `roughness: 0.92,
 * metalness: 0` and only the map is taken from the file. The values are
 * corrected in the GLB anyway so that anything else opening it gets a sane
 * surface rather than a shiny one.
 *
 * ## Why one file rather than a mesh and a texture side by side
 *
 * `public/textures/` is gitignored — every map there is either downloaded or
 * drawn by `npm install`, and nothing binary lives in the repo. A texture
 * carved out of a NASA model fits neither: regenerating it would mean making
 * the install depend on a 6.8 MB download from a NASA CDN. Keeping the map
 * inside the model keeps the whole thing in `public/models/` next to the sun,
 * committed, and reproducible offline.
 *
 * ## Why keep the mesh at all
 *
 * Where NASA modelled real shape — Phobos, Deimos, Haumea, Ceres — the mesh is
 * the whole point. Where it is a plain sphere, as Pluto's is, the geometry adds
 * nothing over the `sphereGeometry` the scene already draws, but it does
 * guarantee the map lines up: these meshes are UV-unwrapped in Blender (Pluto's
 * is literally named `cylindrically_mapped_sphere`), and a Blender cylindrical
 * unwrap is not required to agree with three.js's sphere UVs on longitude
 * offset or winding. Using the mesh the map was authored against removes the
 * question rather than answering it by eye.
 *
 * ## Normalisation
 *
 * NASA models a body at radius 500 (or, for the irregular ones, at some
 * arbitrary scale). Vertices are divided through by the mesh's own bounding
 * radius so the geometry arrives at radius 1, which is what `Body.jsx` expects:
 * it scales a unit mesh by `bodyRadius(body, scaleMode)`, so the scale slider
 * keeps working and no constant has to be kept in sync with the file.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { NASA_BODIES } from './nasa-models.mjs'
import { facetedFraction, smoothNormals } from './smooth-normals.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = join(ROOT, 'Models')
const MODEL_DIR = join(ROOT, 'public', 'models')

/**
 * JPEG quality for colour maps.
 *
 * 90 rather than the 82 the first pass used. At 82 the re-encode cost 4% of the
 * map's mean local contrast, measured block by block against the source; at 90
 * that falls to about 1% for roughly half again the bytes. Since the whole point
 * of shipping these at full resolution is sharpness, spending there is the
 * consistent choice.
 *
 * **Normal maps are never re-encoded.** They are not pictures — each pixel is a
 * unit vector, and JPEG's chroma subsampling and ringing turn small errors into
 * visible shading artifacts across a lit sphere. Those pass through as the PNG
 * they arrive as.
 */
const JPEG_QUALITY = 90

/* ---------------------------------------------------------------- *
 * GLB container
 * ---------------------------------------------------------------- */

const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

function readGlb(path) {
  const buf = readFileSync(path)
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${path} is not a GLB`)

  let offset = 12
  let json = null
  let bin = null
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset)
    const type = buf.readUInt32LE(offset + 4)
    const body = buf.subarray(offset + 8, offset + 8 + length)
    if (type === CHUNK_JSON) json = JSON.parse(body.toString('utf8'))
    else if (type === CHUNK_BIN) bin = body
    offset += 8 + length
  }
  if (!json || !bin) throw new Error(`${path} is missing a JSON or BIN chunk`)
  return { json, bin }
}

/** Pads to the 4-byte alignment the spec requires, with the filler each chunk wants. */
function pad(buf, filler) {
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

  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonChunk.length, 0)
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4)

  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(binChunk.length, 0)
  binHeader.writeUInt32LE(CHUNK_BIN, 4)

  writeFileSync(path, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]))
}

/* ---------------------------------------------------------------- *
 * Geometry
 * ---------------------------------------------------------------- */

const viewOf = (json, bin, index) => {
  const view = json.bufferViews[index]
  const start = view.byteOffset || 0
  return bin.subarray(start, start + view.byteLength)
}

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const COMPONENT_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

/** The bytes an accessor actually owns, rather than the whole buffer view. */
function accessorBytes(json, bin, accessor) {
  const view = json.bufferViews[accessor.bufferView]
  if (view.byteStride !== undefined) {
    throw new Error('interleaved vertex data is not handled')
  }
  const stride = COMPONENT_BYTES[accessor.componentType] * COMPONENT_COUNT[accessor.type]
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
  return Buffer.from(bin.subarray(start, start + stride * accessor.count))
}

/**
 * Farthest vertex from the origin, over the meshes that survive filtering.
 *
 * Taken from the accessors' own `min`/`max`, which the spec requires to be
 * present and exact for POSITION — so this is a bound on the corner of the
 * bounding box rather than a scan of every vertex. For a sphere the two agree;
 * for an irregular body the box corner is the safer normaliser anyway, because
 * it is what keeps the mesh inside the radius the scene reserves for it.
 */
function boundingRadius(json, meshIndices) {
  let radius = 0
  for (const index of meshIndices) {
    for (const primitive of json.meshes[index].primitives) {
      const accessor = json.accessors[primitive.attributes.POSITION]
      for (const v of [...accessor.min, ...accessor.max]) radius = Math.max(radius, Math.abs(v))
    }
  }
  return radius
}

/* ---------------------------------------------------------------- *
 * Node transforms
 * ---------------------------------------------------------------- */

/**
 * A node's local transform as a 3x3 (rotation and scale) plus a translation.
 *
 * Uranus and Neptune are the reason this exists: both sit under a node rotated
 * 90 degrees about X, because they were modelled Z-up. Carrying the node
 * transform into the output would work for a loader that walks the scene graph,
 * but `models.js` reads `object.geometry` straight off the named node and hands
 * it to a mesh of its own — so an unbaked rotation would silently lay Uranus on
 * its side. Which, for Uranus, would be very hard to notice.
 */
function nodeTransform(node) {
  let m = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  const t = node.translation ?? [0, 0, 0]

  if (node.matrix) {
    // glTF matrices are column-major 4x4.
    const n = node.matrix
    return { m: [n[0], n[4], n[8], n[1], n[5], n[9], n[2], n[6], n[10]], t: [n[12], n[13], n[14]] }
  }

  if (node.rotation) {
    const [x, y, z, w] = node.rotation
    m = [
      1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
    ]
  }

  if (node.scale) {
    const [sx, sy, sz] = node.scale
    m = [m[0] * sx, m[1] * sy, m[2] * sz, m[3] * sx, m[4] * sy, m[5] * sz, m[6] * sx, m[7] * sy, m[8] * sz]
  }

  return { m, t }
}

const isIdentity = ({ m, t }) =>
  t.every((v) => v === 0) &&
  m.every((v, i) => Math.abs(v - (i % 4 === 0 ? 1 : 0)) < 1e-9)

function applyTransform(floats, { m, t }, translate) {
  for (let i = 0; i < floats.length; i += 3) {
    const x = floats[i], y = floats[i + 1], z = floats[i + 2]
    floats[i] = m[0] * x + m[1] * y + m[2] * z + (translate ? t[0] : 0)
    floats[i + 1] = m[3] * x + m[4] * y + m[5] * z + (translate ? t[1] : 0)
    floats[i + 2] = m[6] * x + m[7] * y + m[8] * z + (translate ? t[2] : 0)
  }
}

/**
 * Rebuilds the file: only the kept nodes, their transforms baked in, vertices
 * divided through by `scale`, and each image replaced by its re-encoding.
 *
 * Everything is copied accessor by accessor rather than by patching the
 * original buffer, because the images change size and every byte offset after
 * them would have to move. Rebuilding is shorter than the arithmetic.
 *
 * Accessors are deliberately *not* shared between nodes here. Two nodes could
 * reference one mesh under different transforms, and baking would then need two
 * different copies of the same vertices — so each kept node gets its own.
 */
/** An index accessor's values, whatever width they were stored at. */
function readIndices(json, bin, index) {
  const accessor = json.accessors[index]
  const bytes = accessorBytes(json, bin, accessor)
  if (accessor.componentType === 5125) {
    return new Uint32Array(bytes.buffer, bytes.byteOffset, accessor.count)
  }
  if (accessor.componentType === 5123) {
    return new Uint16Array(bytes.buffer, bytes.byteOffset, accessor.count)
  }
  return new Uint8Array(bytes.buffer, bytes.byteOffset, accessor.count)
}

/**
 * A mesh is faceted at or above this fraction before its normals are rebuilt.
 *
 * Only the Moon reaches it, at 100%. The next highest in the set is Saturn at
 * 8%, which is its ring disc — genuinely flat, and correctly flat-shaded.
 */
const FACETED_THRESHOLD = 0.9

/**
 * Replaces faceted normals with smooth ones. See `smooth-normals.mjs` for what
 * the artefact looks like and why it only shows along the terminator.
 *
 * Runs before `repack` and hands it a finished NORMAL buffer, because smoothing
 * needs positions, normals and indices together — and needs the positions in
 * their final frame, with the node transform baked in and the mesh normalised to
 * unit radius, so that the weld tolerance means what it says.
 *
 * Only normals are replaced. Not one vertex moves, so the shape NASA surveyed
 * ships exactly as it arrived.
 *
 * @returns {Map<number, Buffer>} replacement bytes, keyed by accessor index
 */
function smoothFacetedMeshes(json, bin, scale, keptNodes, report) {
  const replacements = new Map()

  for (const { node, transform } of keptNodes) {
    for (const primitive of json.meshes[node.mesh].primitives) {
      const posIndex = primitive.attributes.POSITION
      const normalIndex = primitive.attributes.NORMAL
      if (posIndex === undefined || normalIndex === undefined) continue
      if (primitive.indices === undefined) continue

      const indices = readIndices(json, bin, primitive.indices)
      const normalBytes = accessorBytes(json, bin, json.accessors[normalIndex])
      const normals = new Float32Array(
        normalBytes.buffer,
        normalBytes.byteOffset,
        normalBytes.byteLength / 4,
      )

      const faceted = facetedFraction(normals, indices)
      if (faceted < FACETED_THRESHOLD) continue

      // A scratch copy in the final frame, purely to weld against. The real
      // positions are written by `repack` from the untouched source.
      const posBytes = accessorBytes(json, bin, json.accessors[posIndex])
      const positions = new Float32Array(
        posBytes.buffer,
        posBytes.byteOffset,
        posBytes.byteLength / 4,
      )
      if (transform) applyTransform(positions, transform, true)
      for (let i = 0; i < positions.length; i++) positions[i] /= scale

      // Normals are rebuilt from the transformed positions, so they come out
      // already in the final frame and must not be transformed again.
      const counts = smoothNormals(positions, normals, indices)

      replacements.set(normalIndex, normalBytes)
      report.push({ mesh: json.meshes[node.mesh].name, faceted, ...counts })
    }
  }

  return replacements
}

function repack(json, bin, scale, keptNodes, images, replacements = new Map()) {
  const chunks = []
  const bufferViews = []
  const accessors = []
  let offset = 0

  function copyAccessor(index, role, transform) {
    const accessor = { ...json.accessors[index] }
    // A rebuilt NORMAL was computed from already-transformed positions, so it is
    // in the final frame and must skip the transform below rather than take it
    // twice.
    const rebuilt = replacements.get(index)
    const source = rebuilt ?? accessorBytes(json, bin, accessor)
    const sourceView = json.bufferViews[accessor.bufferView]

    if (!rebuilt && (role === 'POSITION' || role === 'NORMAL')) {
      const floats = new Float32Array(source.buffer, source.byteOffset, source.byteLength / 4)
      // A normal is a direction: it takes the rotation but never the
      // translation. (These transforms are rotations only, so no inverse
      // transpose is needed — under a pure rotation the two agree.)
      if (transform) applyTransform(floats, transform, role === 'POSITION')
      if (role === 'POSITION') {
        for (let i = 0; i < floats.length; i++) floats[i] /= scale
        // Recomputed rather than transformed: a rotated bounding box is not the
        // bounding box of the rotated points.
        const min = [Infinity, Infinity, Infinity]
        const max = [-Infinity, -Infinity, -Infinity]
        for (let i = 0; i < floats.length; i += 3) {
          for (let c = 0; c < 3; c++) {
            if (floats[i + c] < min[c]) min[c] = floats[i + c]
            if (floats[i + c] > max[c]) max[c] = floats[i + c]
          }
        }
        accessor.min = min
        accessor.max = max
      }
    }

    const view = { buffer: 0, byteOffset: offset, byteLength: source.byteLength }
    if (sourceView.target !== undefined) view.target = sourceView.target

    chunks.push(source)
    offset += source.byteLength
    // Accessor data must start on a multiple of its component size; padding to
    // 4 covers every type glTF allows.
    const over = offset % 4
    if (over) {
      chunks.push(Buffer.alloc(4 - over))
      offset += 4 - over
    }

    accessor.bufferView = bufferViews.length
    accessor.byteOffset = 0
    bufferViews.push(view)
    accessors.push(accessor)
    return accessors.length - 1
  }

  const meshes = []
  const nodes = []

  for (const { node, transform } of keptNodes) {
    const mesh = json.meshes[node.mesh]
    meshes.push({
      name: mesh.name,
      primitives: mesh.primitives.map((primitive) => {
        const attributes = {}
        for (const [name, index] of Object.entries(primitive.attributes)) {
          attributes[name] = copyAccessor(index, name, transform)
        }
        const out = { attributes }
        if (primitive.indices !== undefined) out.indices = copyAccessor(primitive.indices, 'INDEX')
        if (primitive.material !== undefined) out.material = primitive.material
        if (primitive.mode !== undefined) out.mode = primitive.mode
        return out
      }),
    })
    // The transform is now in the vertices, so the node must not carry it too.
    nodes.push({ name: node.name, mesh: meshes.length - 1 })
  }

  // Images go in after the vertex data, each as its own buffer view.
  const outImages = images.map((image) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: image.data.length }
    chunks.push(image.data)
    offset += image.data.length
    const over = offset % 4
    if (over) {
      chunks.push(Buffer.alloc(4 - over))
      offset += 4 - over
    }
    bufferViews.push(view)
    return { name: image.name, mimeType: image.mimeType, bufferView: bufferViews.length - 1 }
  })

  const bin_ = Buffer.concat(chunks)

  const out = {
    asset: json.asset,
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin_.length }],
  }

  if (outImages.length) {
    out.images = outImages
    out.samplers = json.samplers ?? [{}]
    out.textures = json.textures.map((texture) => ({
      source: texture.source,
      sampler: texture.sampler ?? 0,
    }))
    // Rewritten rather than copied — see the header note on metallicFactor.
    out.materials = json.materials.map((material) => {
      const m = {
        name: material.name,
        pbrMetallicRoughness: {
          ...material.pbrMetallicRoughness,
          metallicFactor: 0,
          roughnessFactor: 0.92,
        },
      }
      if (material.normalTexture) m.normalTexture = material.normalTexture
      return m
    })
  }

  return { json: out, bin: bin_ }
}

/* ---------------------------------------------------------------- *
 * Images
 * ---------------------------------------------------------------- */

/**
 * Re-encodes an embedded colour map as JPEG.
 *
 * Uses `sips`, which ships with macOS, rather than adding an image library to a
 * project whose only build-time dependency so far is `fetch`. If this ever
 * needs to run elsewhere the swap is one call.
 */
function toJpeg(bytes, label) {
  const stem = join(tmpdir(), `nasa-model-${process.pid}-${label}`)
  const source = `${stem}.src`
  const out = `${stem}.jpg`

  writeFileSync(source, bytes)
  execFileSync(
    'sips',
    ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(JPEG_QUALITY), source, '--out', out],
    { stdio: 'ignore' },
  )
  const jpeg = readFileSync(out)

  unlinkSync(source)
  unlinkSync(out)
  return jpeg
}

/** Pixel dimensions of an encoded image, via sips. */
function dimensions(bytes, label) {
  const path = join(tmpdir(), `nasa-dim-${process.pid}-${label}`)
  writeFileSync(path, bytes)
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path]).toString()
  unlinkSync(path)
  return { width: +out.match(/pixelWidth: (\d+)/)[1], height: +out.match(/pixelHeight: (\d+)/)[1] }
}

/**
 * Resizes a PNG, staying PNG.
 *
 * Used only to cap a normal map at its colour map's resolution. Haumea is the
 * case that motivated it: NASA ships a 2048x2048 normal map against a 1024x1024
 * colour map, and 9.2 MB of it — larger than every other asset in the app — for
 * a dwarf planet that is a handful of pixels across at most zooms. A normal map
 * finer than the colour it accompanies is detail nothing can sample.
 */
function resizePng(bytes, size, label) {
  const stem = join(tmpdir(), `nasa-resize-${process.pid}-${label}`)
  const source = `${stem}.src.png`
  const out = `${stem}.png`

  writeFileSync(source, bytes)
  execFileSync('sips', ['-s', 'format', 'png', '-z', String(size.height), String(size.width), source, '--out', out], {
    stdio: 'ignore',
  })
  const resized = readFileSync(out)

  unlinkSync(source)
  unlinkSync(out)
  return resized
}

/** Which images a material uses, and for what. */
function imageRoles(json) {
  const roles = new Map()
  const mark = (textureIndex, role) => {
    if (textureIndex === undefined) return
    roles.set(json.textures[textureIndex].source, role)
  }
  for (const material of json.materials ?? []) {
    mark(material.pbrMetallicRoughness?.baseColorTexture?.index, 'colour')
    mark(material.normalTexture?.index, 'normal')
  }
  return roles
}

/* ---------------------------------------------------------------- *
 * Entry point
 * ---------------------------------------------------------------- */

export function prepare(body, config) {
  const source = join(SOURCE_DIR, config.file)
  const { json, bin } = readGlb(source)

  // Only nodes that actually draw something, filtered by `keepNodes` where the
  // file carries parts the app does not want (Saturn's rings).
  const keptNodes = json.nodes
    .filter((node) => node.mesh !== undefined)
    .filter((node) => !config.keepNodes || config.keepNodes.includes(node.name))
    .map((node) => {
      const transform = nodeTransform(node)
      return { node, transform: isIdentity(transform) ? null : transform }
    })

  if (!keptNodes.length) throw new Error(`${body}: no meshes survived the node filter`)

  const roles = imageRoles(json)
  const raw = (json.images ?? []).map((image, index) => {
    if (image.bufferView === undefined) {
      throw new Error(`${body}: image "${image.name}" is a URI reference, not embedded`)
    }
    return { image, index, bytes: viewOf(json, bin, image.bufferView), role: roles.get(index) ?? 'unused' }
  })

  const colour = raw.find((r) => r.role === 'colour')
  const colourSize = colour ? dimensions(colour.bytes, `${body}-c`) : null

  const images = raw.map(({ image, index, bytes, role }) => {
    // Normal maps are never JPEG-encoded — see the note on JPEG_QUALITY — but
    // they are capped at the colour map's resolution.
    if (role === 'normal') {
      let data = Buffer.from(bytes)
      const size = dimensions(bytes, `${body}-n`)
      if (colourSize && (size.width > colourSize.width || size.height > colourSize.height)) {
        data = resizePng(data, colourSize, `${body}-n`)
      }
      return { name: image.name, mimeType: 'image/png', data, role }
    }
    return {
      name: image.name,
      mimeType: 'image/jpeg',
      data: toJpeg(bytes, `${body}-${index}`),
      role,
    }
  })

  mkdirSync(MODEL_DIR, { recursive: true })

  const radius = boundingRadius(json, keptNodes.map(({ node }) => node.mesh))
  const smoothing = []
  const replacements = smoothFacetedMeshes(json, bin, radius, keptNodes, smoothing)
  const packed = repack(json, bin, radius, keptNodes, images, replacements)
  const out = join(MODEL_DIR, `${body}.glb`)
  writeGlb(out, packed.json, packed.bin)

  return {
    body,
    source,
    radius,
    nodes: keptNodes.map(({ node, transform }) => node.name + (transform ? ' (transform baked)' : '')),
    dropped: json.nodes.filter((n) => n.mesh !== undefined).length - keptNodes.length,
    images: images.map((image, index) => ({
      name: image.name,
      role: image.role,
      before: json.bufferViews[json.images[index].bufferView].byteLength,
      after: image.data.length,
    })),
    smoothing,
    sourceBytes: statSync(source).size,
    outBytes: statSync(out).size,
  }
}

function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const bodies = wanted.length ? wanted : Object.keys(NASA_BODIES)

  const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`
  let totalIn = 0
  let totalOut = 0

  for (const body of bodies) {
    const config = NASA_BODIES[body]
    if (!config) {
      console.error(`[nasa] ${body}: not in scripts/nasa-models.mjs`)
      process.exitCode = 1
      continue
    }

    const r = prepare(body, config)
    totalIn += r.sourceBytes
    totalOut += r.outBytes

    console.log(`[nasa] ${body}`)
    console.log(`[nasa]   from     ${config.file}`)
    console.log(
      `[nasa]   nodes    ${r.nodes.join(', ')}${r.dropped ? `  (${r.dropped} dropped)` : ''}`,
    )
    console.log(`[nasa]   scale    /${r.radius.toFixed(3)} -> unit radius`)
    for (const s of r.smoothing) {
      console.log(
        `[nasa]   normals  ${s.mesh}: ${(s.faceted * 100).toFixed(0)}% faceted -> smoothed ` +
          `(${s.vertices} vertices welded to ${s.points} points)`,
      )
    }
    for (const image of r.images) {
      console.log(
        `[nasa]   ${image.role.padEnd(8)} ${image.name}: ${kb(image.before)} -> ${kb(image.after)}`,
      )
    }
    console.log(`[nasa]   wrote    ${kb(r.outBytes)} (from ${kb(r.sourceBytes)})`)
  }

  const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`
  console.log(`\n[nasa] ${bodies.length} bodies: ${mb(totalIn)} of source -> ${mb(totalOut)} shipped`)
}

main()
