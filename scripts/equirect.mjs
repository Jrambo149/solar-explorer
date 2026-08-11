/**
 * Turns a model's texture atlas into an equirectangular map.
 *
 * Several of NASA's models wear a **cube-map cross**: six square faces laid out
 * in a 4x3 grid, unwrapped so that only that model's own mesh can read them.
 * That is why `models.js` draws those bodies with the mesh from the file rather
 * than with a three.js sphere — the UVs are the only thing that knows where the
 * Pacific is.
 *
 * For Earth that trade is a bad one. NASA's Earth is a 3,072-triangle sphere,
 * a quarter the density of the 96x64 sphere the app already draws, and its
 * silhouette is visibly polygonal once you fly in. Earth also carries the one
 * shader in the scene that reads a *second* map through the same coordinates —
 * the night lights — and that map is equirectangular. Adopting the model's
 * unwrap would have meant either resampling the night lights to match or
 * rewriting the lookup.
 *
 * So the atlas is resampled instead, once, at build time. Out comes an ordinary
 * equirectangular map that any sphere can wear, and the app keeps its own
 * geometry and its existing night-lights path.
 *
 * ## How
 *
 * Not by decoding the cross layout. Which square is +X and which way up it sits
 * is a convention of whoever did the unwrap, and guessing it is how you end up
 * with a mirrored Australia. The mesh already holds the answer — every vertex
 * pairs a direction in space with a coordinate in the atlas — so the resampler
 * asks the mesh.
 *
 * For each pixel of the output, take its direction on the sphere, find the
 * triangle that direction passes through, and read that triangle's texture
 * coordinates at the point of intersection. Working in 3D rather than in any 2D
 * parameterisation is what makes the poles and the date line ordinary: there is
 * no seam in a set of directions, so there is no seam to special-case.
 */

import { deflateSync, inflateSync } from 'node:zlib'

/* ---------------------------------------------------------------- *
 * PNG
 * ---------------------------------------------------------------- */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

const paeth = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/**
 * Decodes an 8-bit non-interlaced PNG to `{width, height, channels, pixels}`.
 *
 * Covers exactly what Blender's glTF exporter writes — truecolour with or
 * without alpha, eight bits a sample, no interlacing — and refuses anything
 * else rather than returning quietly wrong pixels.
 */
export function decodePNG(buf) {
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) throw new Error('not a PNG')

  let offset = 8
  let width = 0
  let height = 0
  let channels = 0
  const idat = []

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const depth = data[8]
      const colorType = data[9]
      const interlace = data[12]
      if (depth !== 8) throw new Error(`PNG bit depth ${depth} is not handled`)
      if (interlace !== 0) throw new Error('interlaced PNG is not handled')
      if (colorType === 2) channels = 3
      else if (colorType === 6) channels = 4
      else throw new Error(`PNG colour type ${colorType} is not handled`)
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }

    offset += 12 + length
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(stride * height)

  // Undo the per-scanline filters. Each line names its own predictor and refers
  // back to the reconstructed line above, so this has to run in order.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const dst = y * stride
    const up = dst - stride

    for (let x = 0; x < stride; x++) {
      const value = raw[src + x]
      const a = x >= channels ? pixels[dst + x - channels] : 0
      const b = y > 0 ? pixels[up + x] : 0
      const c = y > 0 && x >= channels ? pixels[up + x - channels] : 0

      let out
      if (filter === 0) out = value
      else if (filter === 1) out = value + a
      else if (filter === 2) out = value + b
      else if (filter === 3) out = value + ((a + b) >> 1)
      else if (filter === 4) out = value + paeth(a, b, c)
      else throw new Error(`unknown PNG filter ${filter}`)

      pixels[dst + x] = out & 0xff
    }
  }

  return { width, height, channels, pixels }
}

/** Encodes 8-bit RGB or RGBA to PNG. */
export function encodePNG({ width, height, channels, pixels }) {
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)

  for (let y = 0; y < height; y++) {
    const src = y * stride
    const dst = y * (stride + 1)
    // Sub. These are photographs, where the left neighbour is a good predictor
    // and picking a filter per line costs more time than it saves bytes.
    raw[dst] = 1
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[src + x - channels] : 0
      raw[dst + 1 + x] = (pixels[src + x] - left) & 0xff
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = channels === 4 ? 6 : 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    PNG_MAGIC,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------------------------------------------------------- *
 * Direction -> triangle
 * ---------------------------------------------------------------- */

/** Longitude/latitude buckets, so a pixel tests a handful of triangles. */
const GRID_LON = 64
const GRID_LAT = 32

/**
 * Buckets triangles by the patch of sky they cover.
 *
 * Conservative on purpose. A triangle whose vertices straddle the date line, or
 * one close enough to a pole that longitude stops being meaningful, is filed
 * under every longitude for its latitude band rather than under the range its
 * vertices happen to suggest. Over-filing costs a few extra intersection tests;
 * under-filing would leave holes in the output, and holes on a texture this size
 * are easy to miss.
 */
function buildIndex(positions, indices) {
  const cells = Array.from({ length: GRID_LON * GRID_LAT }, () => [])

  for (let t = 0; t < indices.length; t += 3) {
    let lonMin = Infinity
    let lonMax = -Infinity
    let latMin = Infinity
    let latMax = -Infinity
    let wrap = false

    for (let k = 0; k < 3; k++) {
      const i = indices[t + k] * 3
      const x = positions[i]
      const y = positions[i + 1]
      const z = positions[i + 2]
      const r = Math.hypot(x, y, z)
      const lat = Math.asin(y / r)
      const lon = Math.atan2(z, x)
      if (Math.abs(lat) > 1.4) wrap = true
      lonMin = Math.min(lonMin, lon)
      lonMax = Math.max(lonMax, lon)
      latMin = Math.min(latMin, lat)
      latMax = Math.max(latMax, lat)
    }

    if (lonMax - lonMin > Math.PI) wrap = true

    const j0 = Math.max(0, Math.floor(((latMin + Math.PI / 2) / Math.PI) * GRID_LAT) - 1)
    const j1 = Math.min(GRID_LAT - 1, Math.floor(((latMax + Math.PI / 2) / Math.PI) * GRID_LAT) + 1)
    const i0 = wrap ? 0 : Math.max(0, Math.floor(((lonMin + Math.PI) / (2 * Math.PI)) * GRID_LON) - 1)
    const i1 = wrap
      ? GRID_LON - 1
      : Math.min(GRID_LON - 1, Math.floor(((lonMax + Math.PI) / (2 * Math.PI)) * GRID_LON) + 1)

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) cells[j * GRID_LON + i].push(t)
    }
  }

  return cells
}

/**
 * Resamples a model's atlas into an equirectangular map.
 *
 * @param {object} mesh `{positions, normalsIgnored, uvs, indices}` in any scale
 * @param {object} image decoded atlas, as returned by `decodePNG`
 * @param {number} width output width; height is half
 * @returns {object} a decoded image ready for `encodePNG`
 */
export function resampleToEquirect(mesh, image, width) {
  const { positions, uvs, indices } = mesh
  const height = width / 2
  const cells = buildIndex(positions, indices)
  const channels = 3
  const out = Buffer.alloc(width * height * channels)

  let missed = 0

  for (let py = 0; py < height; py++) {
    // Pixel centres. Latitude runs from +90 at the top row down to -90, which
    // is the convention three.js's sphere UVs expect.
    const lat = Math.PI / 2 - ((py + 0.5) / height) * Math.PI
    const cosLat = Math.cos(lat)
    const sinLat = Math.sin(lat)
    const j = Math.min(
      GRID_LAT - 1,
      Math.max(0, Math.floor(((lat + Math.PI / 2) / Math.PI) * GRID_LAT)),
    )

    for (let px = 0; px < width; px++) {
      const lon = ((px + 0.5) / width) * 2 * Math.PI - Math.PI
      const dx = cosLat * Math.cos(lon)
      const dy = sinLat
      const dz = cosLat * Math.sin(lon)

      const i = Math.min(
        GRID_LON - 1,
        Math.max(0, Math.floor(((lon + Math.PI) / (2 * Math.PI)) * GRID_LON)),
      )

      let u = -1
      let v = -1

      // Möller–Trumbore, from the origin outwards. The mesh encloses the
      // origin, so exactly one front-facing triangle is hit.
      for (const t of cells[j * GRID_LON + i]) {
        const a = indices[t] * 3
        const b = indices[t + 1] * 3
        const c = indices[t + 2] * 3

        const e1x = positions[b] - positions[a]
        const e1y = positions[b + 1] - positions[a + 1]
        const e1z = positions[b + 2] - positions[a + 2]
        const e2x = positions[c] - positions[a]
        const e2y = positions[c + 1] - positions[a + 1]
        const e2z = positions[c + 2] - positions[a + 2]

        const hx = dy * e2z - dz * e2y
        const hy = dz * e2x - dx * e2z
        const hz = dx * e2y - dy * e2x
        const det = e1x * hx + e1y * hy + e1z * hz
        if (Math.abs(det) < 1e-12) continue

        const inv = 1 / det
        // The ray starts at the origin, so the vector to the first vertex is
        // simply minus that vertex.
        const sx = -positions[a]
        const sy = -positions[a + 1]
        const sz = -positions[a + 2]

        const bu = (sx * hx + sy * hy + sz * hz) * inv
        if (bu < -1e-6 || bu > 1 + 1e-6) continue

        const qx = sy * e1z - sz * e1y
        const qy = sz * e1x - sx * e1z
        const qz = sx * e1y - sy * e1x
        const bv = (dx * qx + dy * qy + dz * qz) * inv
        if (bv < -1e-6 || bu + bv > 1 + 1e-6) continue

        const distance = (e2x * qx + e2y * qy + e2z * qz) * inv
        if (distance <= 0) continue

        const bw = 1 - bu - bv
        u = bw * uvs[indices[t] * 2] + bu * uvs[indices[t + 1] * 2] + bv * uvs[indices[t + 2] * 2]
        v =
          bw * uvs[indices[t] * 2 + 1] +
          bu * uvs[indices[t + 1] * 2 + 1] +
          bv * uvs[indices[t + 2] * 2 + 1]
        break
      }

      const o = (py * width + px) * channels
      if (u < 0) {
        missed++
        continue
      }

      /* ---- bilinear sample of the atlas ---- */

      // glTF puts v = 0 at the *top* of the image, so v indexes rows directly
      // and must not be flipped. Flipping it here sent both polar caps into the
      // empty corners of the cross — the atlas is 4x3, the equatorial band
      // occupies the middle row, and the middle row is symmetric under a flip,
      // so the equator looked perfectly fine while the poles came out white.
      //
      // The output's own orientation is a separate matter, and is already
      // handled: the row loop above runs latitude from +90 down, putting north
      // at the top of the image, which is what an equirectangular map means and
      // what three.js's sphere expects once the loader flips it back.
      const sx = u * image.width - 0.5
      const sy = v * image.height - 0.5
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0

      for (let ch = 0; ch < channels; ch++) {
        let acc = 0
        for (let dyi = 0; dyi < 2; dyi++) {
          for (let dxi = 0; dxi < 2; dxi++) {
            // Clamped rather than wrapped: an atlas is not periodic, and
            // wrapping at a face edge would fetch from an unrelated face.
            const xx = Math.min(image.width - 1, Math.max(0, x0 + dxi))
            const yy = Math.min(image.height - 1, Math.max(0, y0 + dyi))
            const weight = (dxi ? fx : 1 - fx) * (dyi ? fy : 1 - fy)
            acc += image.pixels[(yy * image.width + xx) * image.channels + ch] * weight
          }
        }
        out[o + ch] = Math.round(acc)
      }
    }
  }

  return { width, height, channels, pixels: out, missed }
}
