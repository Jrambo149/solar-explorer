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
    '-s',
    'format',
    'jpeg',
    '-s',
    'formatOptions',
    String(JPEG_QUALITY),
    src,
    '--out',
    out,
  ])
  const bytes = readFileSync(out)
  unlinkSync(src)
  unlinkSync(out)
  return bytes
}

/* ---- main ---- */

/**
 * Turn the resampled map from the *model's* longitude convention into the
 * app's, which is the ordinary one: east longitude, zero at the centre column.
 *
 * `resampleToEquirect` works in the GLB's own coordinates and has no way to
 * know how that frame is oriented with respect to the Earth — so what it emits
 * is a perfectly good map of the planet in the wrong frame. NASA's export turns
 * out to be rotated a quarter turn and handed the other way: the map came out
 * holding east longitude `L` at `u = (90° - L)/360`, with Africa to the *left*
 * of South America.
 *
 * Nothing could see it until the prime meridians landed. Every body's rotation
 * phase was arbitrary, so "the wrong meridian faces the Sun" had no meaning;
 * once `W` was real, the sub-solar point checked out against Horizons to 0.2°
 * while the *drawn* Earth put the Americas under the noon Sun at 12:00 UTC.
 *
 * The 90° is measured, not assumed, and by two independent routes. Coastline
 * crossings on the equator — Gabon at 9.35°E, the Amazon mouth at 50°W, Ecuador
 * at 80.4°W — fitted 89.26°. Cross-correlating the land mask against
 * `public/textures/earth.jpg`, which is an ordinary map of the same planet,
 * gave 89.75° at 1440 px and 89.90° at 2880 px, converging on a clean quarter
 * turn as the grid got finer.
 *
 * This also fixes a second bug that had nothing to do with the meridians and
 * was equally invisible: the night-lights map is an ordinary equirectangular
 * image from a different source, sampled through the same UVs, so the city
 * lights were landing nowhere near the continents underneath them.
 */
function intoEastLongitude(img) {
  const { width, height, channels, pixels } = img
  const out = Buffer.alloc(pixels.length)

  for (let x = 0; x < width; x++) {
    /*
     * Column `x` of the output holds `L = 180 + 360·x/width`. The input holds
     * that same longitude at `u = (90 - L)/360`, which reduces to
     * `-0.25 - x/width` once the constants are folded together.
     */
    let u = -0.25 - x / width
    u = ((u % 1) + 1) % 1
    const src = Math.min(width - 1, Math.round(u * width))
    for (let y = 0; y < height; y++) {
      const from = (y * width + src) * channels
      const to = (y * width + x) * channels
      for (let c = 0; c < channels; c++) out[to + c] = pixels[from + c]
    }
  }

  return { width, height, channels, pixels: out }
}

/**
 * Assert the finished colour map really is in east longitude, by finding
 * coastlines where they belong.
 *
 * The rotation this file corrects was invisible for months and was only caught
 * because an unrelated feature made it measurable. A quarter turn is exactly
 * the kind of error that survives review — the map still looks like the Earth —
 * so the generator checks its own output rather than trusting the arithmetic
 * above.
 *
 * Sampling *inside* well-known features rather than hunting for coastlines:
 * a coastline crossing is a one-pixel event that cloud, river mouths and JPEG
 * ringing all disturb, whereas the middle of the Sahara is unambiguous over
 * hundreds of kilometres. Nine points spread over both hemispheres and all four
 * quadrants of longitude — any rotation, mirror or pole flip breaks several.
 */
const LANDMARKS = [
  ['Congo basin', 0, 20, true],
  ['Sahara', 22, 10, true],
  ['Arabia', 24, 45, true],
  ['Kazakhstan', 48, 65, true],
  ['Amazon basin', -5, -62, true],
  ['central Australia', -24, 133, true],
  ['mid Pacific', 0, -150, false],
  ['South Atlantic', -30, -20, false],
  ['mid Indian Ocean', -30, 80, false],
]
/* The ocean points are in the subtropical highs on purpose. This map has the
   cloud deck composited in, and a thick enough deck reads as neutral rather
   than blue — (-20°, -25°) does, which is why the South Atlantic sample is
   taken ten degrees further south where the sky is reliably clear. */

function assertEastLongitude(img) {
  const { width, height, channels, pixels } = img

  /** Average a small patch, so one bad pixel cannot decide anything. */
  const isLand = (latDeg, lonDeg) => {
    // Column holds east longitude L = 180 + 360*x/width; row runs +90 to -90.
    const x0 = Math.round((((lonDeg - 180) / 360 + 1) % 1) * width)
    const y0 = Math.round(((90 - latDeg) / 180) * height)
    let land = 0
    let seen = 0
    for (let dy = -8; dy <= 8; dy += 2) {
      for (let dx = -8; dx <= 8; dx += 2) {
        const x = (((x0 + dx) % width) + width) % width
        const y = Math.min(height - 1, Math.max(0, y0 + dy))
        const i = (y * width + x) * channels
        const r = pixels[i]
        const g = pixels[i + 1]
        const b = pixels[i + 2]
        if (r + g + b > 620) continue // cloud says nothing either way
        seen += 1
        land += b > r + 18 ? -1 : 1
      }
    }
    return { land: land > 0, seen }
  }

  const wrong = []
  for (const [name, lat, lon, expected] of LANDMARKS) {
    const { land, seen } = isLand(lat, lon)
    if (seen < 8) continue // buried under cloud; no evidence either way
    if (land !== expected) wrong.push(`${name} reads as ${land ? 'land' : 'ocean'}`)
  }

  if (wrong.length) {
    throw new Error(
      `earth colour map is not in east longitude — ${wrong.length} of ${LANDMARKS.length} ` +
        `landmarks are wrong: ${wrong.join('; ')}`,
    )
  }
  console.log(`[earth] longitude convention checked against ${LANDMARKS.length} landmarks`)
}

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

    const oriented = intoEastLongitude(resampled)
    if (job.role === 'colour') assertEastLongitude(oriented)
    const bytes = job.encode(encodePNG(oriented))
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
