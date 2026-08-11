/**
 * Builds Earth's surface maps from NASA's model.
 *
 * Run with:
 *     npm run maps:earth
 *
 * `EarthClouds_1_12756.glb` carries a 4096x3072 cube-map cross of the Blue
 * Marble with the cloud deck already composited in, plus a matching normal map,
 * on a 3,072-triangle oblate spheroid. `equirect.mjs` explains why the atlas is
 * resampled rather than used through the model's own mesh: Earth is the one body
 * the app flies right up to, and the one whose shader reads a second map — the
 * night lights — through the same coordinates.
 *
 * ## Where the output lives
 *
 * `public/maps/`, committed, rather than `public/textures/`, which is
 * gitignored and rebuilt by `npm install` from downloads and a procedural
 * generator. These cannot be rebuilt that way: they come out of a 19 MB Blender
 * export that is itself too large to keep in the repo. It is the same reasoning
 * that keeps the other NASA maps inside `public/models/*.glb`.
 *
 * ## Resolution
 *
 * A cube face is 1024 pixels across and spans 90 degrees, so the atlas carries
 * about 11.4 pixels per degree. 4096x2048 is the equirectangular map with the
 * same angular resolution — anything larger would be inventing detail, anything
 * smaller would be throwing some away.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { decodePNG, encodePNG, resampleToEquirect } from './equirect.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'Models', 'Planets', 'EarthClouds_1_12756.glb')
const OUT_DIR = join(ROOT, 'public', 'maps')

/** Matches the atlas's angular resolution. See the header. */
const COLOUR_WIDTH = 4096

/**
 * The normal map is built at half the colour map's width.
 *
 * Earth's relief is the least of any solid body in the scene — Everest is
 * 0.14% of the radius, against 0.8% for the Moon — so this map is doing very
 * little work, and at full size it would be the largest single asset in the app
 * for that little. Half resolution keeps the coastal and mountain shading it
 * contributes at a quarter of the bytes.
 */
const NORMAL_WIDTH = 2048

/** Matches `prepare-nasa-model.mjs`. */
const JPEG_QUALITY = 90

/* ---- GLB reading, in the small ---- */

function readGlb(path) {
  const buf = readFileSync(path)
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB`)
  const jsonLength = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
  // The BIN chunk follows the JSON chunk, past its own 8-byte header.
  const bin = buf.subarray(20 + jsonLength + 8)
  return { json, bin }
}

const COMPONENT_BYTES = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }
const COMPONENT_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3 }

function attribute(json, bin, index) {
  const accessor = json.accessors[index]
  const view = json.bufferViews[accessor.bufferView]
  const stride = COMPONENT_BYTES[accessor.componentType] * COMPONENT_COUNT[accessor.type]
  const start = bin.byteOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0)
  const length = accessor.count * COMPONENT_COUNT[accessor.type]
  const slice = bin.buffer.slice(start, start + accessor.count * stride)

  if (accessor.componentType === 5126) return new Float32Array(slice, 0, length)
  if (accessor.componentType === 5125) return new Uint32Array(slice, 0, length)
  if (accessor.componentType === 5123) return new Uint16Array(slice, 0, length)
  return new Uint8Array(slice, 0, length)
}

function imageBytes(json, bin, index) {
  const view = json.bufferViews[json.images[index].bufferView]
  const start = view.byteOffset || 0
  return Buffer.from(bin.subarray(start, start + view.byteLength))
}

/* ---- encoding ---- */

function toJpeg(png, label) {
  const stem = join(tmpdir(), `earth-map-${process.pid}-${label}`)
  const src = `${stem}.png`
  const out = `${stem}.jpg`
  writeFileSync(src, png)
  execFileSync('sips', [
    '-s', 'format', 'jpeg',
    '-s', 'formatOptions', String(JPEG_QUALITY),
    src, '--out', out,
  ])
  const bytes = readFileSync(out)
  unlinkSync(src)
  unlinkSync(out)
  return bytes
}

/* ---- main ---- */

function main() {
  const { json, bin } = readGlb(SOURCE)
  const primitive = json.meshes[0].primitives[0]

  const mesh = {
    positions: attribute(json, bin, primitive.attributes.POSITION),
    uvs: attribute(json, bin, primitive.attributes.TEXCOORD_0),
    indices: attribute(json, bin, primitive.indices),
  }

  console.log(`[earth] source   ${json.meshes[0].name}, ${mesh.indices.length / 3} triangles`)

  const material = json.materials[0]
  const jobs = [
    {
      role: 'colour',
      image: material.pbrMetallicRoughness.baseColorTexture.index,
      width: COLOUR_WIDTH,
      file: 'earth-nasa.jpg',
      encode: (png) => toJpeg(png, 'colour'),
    },
    {
      role: 'normal',
      image: material.normalTexture?.index,
      width: NORMAL_WIDTH,
      file: 'earth-nasa-normal.png',
      // Never JPEG: every pixel of a normal map is a unit vector, and chroma
      // subsampling turns small errors into visible shading artifacts.
      encode: (png) => png,
    },
  ]

  mkdirSync(OUT_DIR, { recursive: true })

  for (const job of jobs) {
    if (job.image === undefined) {
      console.log(`[earth] ${job.role}: not present in the model, skipped`)
      continue
    }

    const source = json.textures[job.image].source
    const atlas = decodePNG(imageBytes(json, bin, source))
    const resampled = resampleToEquirect(mesh, atlas, job.width)

    if (resampled.missed) {
      throw new Error(
        `${job.role}: ${resampled.missed} output pixels hit no triangle — the ray index is wrong`,
      )
    }

    const bytes = job.encode(encodePNG(resampled))
    const path = join(OUT_DIR, job.file)
    writeFileSync(path, bytes)

    console.log(
      `[earth] ${job.role.padEnd(7)} ${json.images[source].name} ` +
        `${atlas.width}x${atlas.height} cross -> ${resampled.width}x${resampled.height} ` +
        `equirect, ${(statSync(path).size / 1024).toFixed(0)} KB (${job.file})`,
    )
  }
}

main()
