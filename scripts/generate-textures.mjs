/**
 * Procedural planet texture generator — zero dependencies.
 *
 * This is the *offline fallback*. Normally scripts/fetch-textures.mjs downloads
 * photographic maps; if that fails, this draws stand-ins so the app still has a
 * complete set to render. Run it directly with `npm run textures:procedural`.
 *
 * Writes equirectangular PNGs into public/textures/.
 *
 * Everything here is deterministic: the same seed always produces the same
 * planet, so the app looks identical on every machine and needs no network.
 *
 * PNG encoding is done by hand (IHDR/IDAT/IEND + zlib from node:zlib) to keep
 * the dependency count at zero.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'textures')
const FORCE = process.argv.includes('--force')

const WIDTH = 1024
const HEIGHT = 512

/* ------------------------------------------------------------------ *
 * PNG encoder
 * ------------------------------------------------------------------ */

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
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/**
 * @param {Uint8Array} pixels raw samples, `channels` bytes per pixel, row-major
 * @param {number} channels 3 for RGB, 4 for RGBA
 */
function encodePNG(pixels, width, height, channels) {
  const colorType = channels === 4 ? 6 : 2
  const stride = width * channels

  // Each scanline is prefixed with a filter byte. Filter 1 (Sub) predicts each
  // byte from its left neighbour, which compresses these smooth gradients far
  // better than no filtering at all.
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const src = y * stride
    const dst = y * (stride + 1)
    raw[dst] = 1
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[src + x - channels] : 0
      raw[dst + 1 + x] = (pixels[src + x] - left) & 0xff
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = colorType
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------------ *
 * Deterministic 3D value noise
 * ------------------------------------------------------------------ */

function makeHash(seed) {
  // Integer hash -> [0,1). Cheap, stable across platforms (all 32-bit ops).
  return (x, y, z) => {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1274126177) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    h = h ^ (h >>> 16)
    return (h >>> 0) / 4294967296
  }
}

const smooth = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t

function makeNoise3(seed) {
  const hash = makeHash(seed)
  return (x, y, z) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const tx = smooth(x - xi)
    const ty = smooth(y - yi)
    const tz = smooth(z - zi)

    const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz)

    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), tx)
    const x10 = lerp(c(0, 1, 0), c(1, 1, 0), tx)
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), tx)
    const x11 = lerp(c(0, 1, 1), c(1, 1, 1), tx)

    return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz)
  }
}

/** Fractal Brownian motion — sums octaves of value noise. */
function makeFbm(seed, octaves = 5, lacunarity = 2.07, gain = 0.5) {
  const noise = makeNoise3(seed)
  return (x, y, z) => {
    let sum = 0
    let amp = 1
    let norm = 0
    let freq = 1
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * freq, y * freq, z * freq)
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }
}

/** Ridged variant — good for canyons and storm filaments. */
function ridged(fbm) {
  return (x, y, z) => 1 - Math.abs(fbm(x, y, z) * 2 - 1)
}

/* ------------------------------------------------------------------ *
 * Colour helpers
 * ------------------------------------------------------------------ */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Sample a colour ramp of [stop, '#hex'] pairs at position t. */
function rampAt(ramp, t) {
  t = clamp01(t)
  for (let i = 0; i < ramp.length - 1; i++) {
    const [p0, c0] = ramp[i]
    const [p1, c1] = ramp[i + 1]
    if (t <= p1) {
      const k = p1 === p0 ? 0 : (t - p0) / (p1 - p0)
      const a = hexToRgb(c0)
      const b = hexToRgb(c1)
      return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
    }
  }
  return hexToRgb(ramp[ramp.length - 1][1])
}

/* ------------------------------------------------------------------ *
 * Sphere-space rasteriser
 *
 * For each texel we convert (u,v) to a point on the unit sphere and evaluate
 * the shader there. Sampling in 3D is what makes the u=0/u=1 seam invisible
 * and keeps the poles from smearing.
 * ------------------------------------------------------------------ */

function renderSphereTexture(shade, { width = WIDTH, height = HEIGHT, channels = 3 } = {}) {
  const pixels = new Uint8Array(width * height * channels)
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height
    const phi = v * Math.PI // 0 at north pole
    const sinPhi = Math.sin(phi)
    const cosPhi = Math.cos(phi)
    // Latitude in [-1, 1], +1 = north pole. Used for ice caps and banding.
    const lat = cosPhi
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width
      const theta = u * Math.PI * 2
      const px = sinPhi * Math.cos(theta)
      const py = cosPhi
      const pz = sinPhi * Math.sin(theta)

      const out = shade(px, py, pz, lat, u, v)
      const i = (y * width + x) * channels
      pixels[i] = clamp01(out[0] / 255) * 255
      pixels[i + 1] = clamp01(out[1] / 255) * 255
      pixels[i + 2] = clamp01(out[2] / 255) * 255
      if (channels === 4) pixels[i + 3] = clamp01(out[3] / 255) * 255
    }
  }
  return pixels
}

/* ------------------------------------------------------------------ *
 * Body recipes
 * ------------------------------------------------------------------ */

/**
 * Craters: a fixed set of seeded impact sites stamped onto the surface as a
 * darkened floor with a bright raised rim.
 */
function makeCraters(seed, count, minR, maxR) {
  const hash = makeHash(seed)
  const jitter = makeFbm(seed + 7, 3)
  const craters = []
  for (let i = 0; i < count; i++) {
    // Uniform-on-sphere sampling so craters don't clump at the poles.
    const z = hash(i, 1, 0) * 2 - 1
    const t = hash(i, 2, 0) * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    craters.push({
      x: r * Math.cos(t),
      y: z,
      z: r * Math.sin(t),
      // Cubed so the size distribution is power-law-ish: lots of small pits,
      // only a handful of big basins. A linear spread looks artificial.
      radius: lerp(minR, maxR, hash(i, 3, 0) ** 3),
      depth: lerp(0.3, 1, hash(i, 4, 0)),
    })
  }
  return (px, py, pz) => {
    let acc = 0
    for (const c of craters) {
      // Chord distance on the unit sphere.
      const dx = px - c.x
      const dy = py - c.y
      const dz = pz - c.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < c.radius) {
        // Warp the rim so craters aren't perfect circles.
        const wobble = 1 + (jitter(px * 14, py * 14, pz * 14) - 0.5) * 0.22
        const k = clamp01((d / c.radius) * wobble)
        // Smooth bowl, then a rim that rises and falls away.
        const bowl = -c.depth * Math.cos(k * Math.PI * 0.5) ** 2
        const rim = c.depth * 0.85 * Math.exp(-(((k - 0.86) / 0.13) ** 2))
        acc += bowl * (1 - clamp01((k - 0.7) / 0.3)) + rim
      }
    }
    return acc
  }
}

/** Elliptical storm spot (Great Red Spot, Neptune's Dark Spot). */
function makeSpot({ lat, lon, width, height, softness = 0.55 }) {
  // py on the unit sphere is exactly the latitude parameter we pass in.
  const cy = lat
  return (px, py, pz) => {
    const theta = Math.atan2(pz, px)
    let dLon = theta - lon
    while (dLon > Math.PI) dLon -= Math.PI * 2
    while (dLon < -Math.PI) dLon += Math.PI * 2
    const dLat = py - cy
    const d = Math.sqrt((dLon / width) ** 2 + (dLat / height) ** 2)
    return clamp01(1 - d) ** (1 / softness)
  }
}

/**
 * Gas-giant banding. Latitude drives a colour ramp, but the latitude itself is
 * warped by noise so the bands ripple and shear instead of sitting in perfect
 * horizontal stripes.
 */
function gasGiant({ seed, ramp, bands, warp, turbulence, spot, spotRamp }) {
  const warpFbm = makeFbm(seed, 4)
  const detail = makeFbm(seed + 91, 5)
  const fine = makeFbm(seed + 173, 3)
  return (px, py, pz, lat) => {
    // The warp is sampled at low vertical frequency: we want the band
    // boundaries to meander slowly, not to fracture into extra bands.
    const w = warpFbm(px * 1.7, py * 1.1, pz * 1.7) - 0.5
    const warpedLat = lat + w * warp

    let t = (Math.sin(warpedLat * Math.PI * bands) + 1) / 2
    // Turbulence is stretched along x/z (the flow direction) and kept low
    // frequency vertically, so it shears the bands instead of adding new ones.
    t = clamp01(t + (detail(px * 3.4, py * 1.6, pz * 3.4) - 0.5) * turbulence)

    let [r, g, b] = rampAt(ramp, t)

    // Fine streaks drawn out along the flow.
    const streak = (fine(px * 9, py * 3.2, pz * 9) - 0.5) * 16
    r += streak
    g += streak
    b += streak

    if (spot) {
      const s = spot(px, py, pz)
      if (s > 0) {
        const [sr, sg, sb] = rampAt(spotRamp, clamp01(1 - s + detail(px * 8, py * 8, pz * 8) * 0.25))
        r = lerp(r, sr, s)
        g = lerp(g, sg, s)
        b = lerp(b, sb, s)
      }
    }

    // Limb darkening toward the poles reads as a subtle sphere shade.
    const polar = 1 - Math.abs(lat) ** 3 * 0.35
    return [r * polar, g * polar, b * polar]
  }
}

/** Rocky body: fbm elevation through a ramp, plus craters and optional caps. */
function rocky({
  seed,
  ramp,
  scale,
  craters,
  capLat,
  capColor,
  ridgeAmount = 0,
  patch,
  patchColor,
}) {
  const fbm = makeFbm(seed, 6)
  const rid = ridged(makeFbm(seed + 55, 4))
  return (px, py, pz, lat) => {
    let h = fbm(px * scale, py * scale, pz * scale)
    if (ridgeAmount) h = clamp01(h + (rid(px * scale * 0.7, py * scale * 0.7, pz * scale * 0.7) - 0.5) * ridgeAmount)
    if (craters) h = clamp01(h + craters(px, py, pz) * 0.22)

    let [r, g, b] = rampAt(ramp, h)

    if (capLat) {
      const a = Math.abs(lat)
      // Ragged edge: perturb the cap boundary with noise.
      const edge = capLat + (fbm(px * 5, py * 5, pz * 5) - 0.5) * 0.07
      if (a > edge) {
        const k = clamp01((a - edge) / 0.05)
        const [cr, cg, cb] = hexToRgb(capColor)
        r = lerp(r, cr, k)
        g = lerp(g, cg, k)
        b = lerp(b, cb, k)
      }
    }

    // A single named region, for the bodies whose one famous feature is a
    // patch rather than a band or a cap — Pluto's Tombaugh Regio above all.
    // The mask is softened with the same fbm that shapes the terrain, so the
    // boundary breaks up instead of reading as an airbrushed oval.
    if (patch) {
      const s = clamp01(patch(px, py, pz) * 1.15 - (fbm(px * 4, py * 4, pz * 4) - 0.5) * 0.5)
      if (s > 0) {
        const [pr, pg, pb] = hexToRgb(patchColor)
        r = lerp(r, pr, s)
        g = lerp(g, pg, s)
        b = lerp(b, pb, s)
      }
    }
    return [r, g, b]
  }
}

const OCEAN_RAMP = [
  [0.0, '#06162f'],
  [0.45, '#0d3a6b'],
  [0.52, '#12639b'],
]
const LAND_RAMP = [
  [0.0, '#c2b280'],
  [0.14, '#4a7c3f'],
  [0.4, '#2f5a2c'],
  [0.62, '#6b6141'],
  [0.85, '#8d8d8a'],
  [1.0, '#e8e8ea'],
]

function earthShader() {
  const continents = makeFbm(7001, 6)
  const detail = makeFbm(7113, 5)
  // Earth is ~71% ocean; value noise centres on 0.5, so the sea level sits
  // well above the midpoint to get anywhere near that ratio.
  const SEA = 0.545
  return (px, py, pz, lat) => {
    const h = continents(px * 1.9, py * 1.9, pz * 1.9) + (detail(px * 5, py * 5, pz * 5) - 0.5) * 0.14

    let r, g, b
    if (h < SEA) {
      ;[r, g, b] = rampAt(OCEAN_RAMP, (h / SEA) * 0.52)
    } else {
      const e = (h - SEA) / (1 - SEA)
      // Latitude pushes high ground toward tundra/snow.
      ;[r, g, b] = rampAt(LAND_RAMP, clamp01(e * 1.35 + Math.abs(lat) * 0.3))
    }

    // Polar ice. lat is cos(phi), so 0.93 ≈ 68° — roughly the real ice line.
    const a = Math.abs(lat)
    const edge = 0.93 + (detail(px * 4, py * 4, pz * 4) - 0.5) * 0.09
    if (a > edge) {
      const k = clamp01((a - edge) / 0.05)
      r = lerp(r, 236, k)
      g = lerp(g, 242, k)
      b = lerp(b, 248, k)
    }
    return [r, g, b]
  }
}

function earthCloudsShader() {
  const fbm = makeFbm(8201, 6)
  const warp = makeFbm(8317, 3)
  return (px, py, pz, lat) => {
    const w = (warp(px * 2, py * 2, pz * 2) - 0.5) * 0.6
    let c = fbm(px * 2.6 + w, py * 3.4, pz * 2.6 + w)
    // Thin the clouds at the equator and thicken them in the mid latitudes,
    // which is roughly how the real bands sit.
    c += Math.cos(lat * Math.PI * 2.2) * 0.05
    const alpha = clamp01((c - 0.5) * 3.1) ** 1.25
    return [255, 255, 255, alpha * 255]
  }
}

function sunShader() {
  const granules = makeFbm(9001, 5)
  const filaments = ridged(makeFbm(9117, 4))
  const ramp = [
    [0.0, '#8a2a00'],
    [0.35, '#e8590c'],
    [0.6, '#ffa41b'],
    [0.82, '#ffd98a'],
    [1.0, '#fffbf0'],
  ]
  return (px, py, pz) => {
    const g = granules(px * 7, py * 7, pz * 7)
    const f = filaments(px * 3.4, py * 3.4, pz * 3.4)
    return rampAt(ramp, clamp01(g * 0.72 + f * 0.42))
  }
}

/**
 * Saturn's rings as a horizontal strip: U runs from the inner edge to the
 * outer edge, so the ring mesh needs UVs where U maps to radius.
 */
function renderRingTexture(width = 1024, height = 64) {
  const noise = makeNoise3(4242)
  const pixels = new Uint8Array(width * height * 4)

  // [start, end, opacity, brightness] across the ring's radial span.
  const bands = [
    [0.0, 0.06, 0.0, 0.0], // gap between planet and C ring
    [0.06, 0.28, 0.35, 0.55], // C ring — dim
    [0.28, 0.62, 0.92, 1.0], // B ring — bright and dense
    [0.62, 0.68, 0.05, 0.4], // Cassini Division
    [0.68, 0.9, 0.7, 0.85], // A ring
    [0.9, 0.93, 0.1, 0.5], // Encke gap
    [0.93, 1.0, 0.45, 0.7], // outer A ring fading out
  ]

  const sample = (t) => {
    for (const [s, e, o, b] of bands) {
      if (t <= e) {
        // Soften the leading edge of each band so transitions aren't hard cuts.
        const k = clamp01((t - s) / Math.max(1e-4, (e - s) * 0.18))
        return [o * k, b]
      }
    }
    return [0, 0]
  }

  for (let x = 0; x < width; x++) {
    const t = (x + 0.5) / width
    let [alpha, bright] = sample(t)

    // Fine ringlet structure.
    const fine = noise(t * 220, 0.5, 0.5) * 0.5 + noise(t * 60, 3.5, 0.5) * 0.5
    alpha = clamp01(alpha * (0.72 + fine * 0.56))
    bright = clamp01(bright * (0.8 + fine * 0.4))

    // Fade both extreme edges to zero so there's no hard outer rim.
    const edge = Math.min(clamp01(t / 0.04), clamp01((1 - t) / 0.05))
    alpha *= edge

    const base = rampAt(
      [
        [0.0, '#6b5a42'],
        [0.5, '#c9b28c'],
        [1.0, '#efe3cd'],
      ],
      bright,
    )

    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4
      pixels[i] = clamp01(base[0] / 255) * 255
      pixels[i + 1] = clamp01(base[1] / 255) * 255
      pixels[i + 2] = clamp01(base[2] / 255) * 255
      pixels[i + 3] = alpha * 255
    }
  }
  return { pixels, width, height }
}

/* ------------------------------------------------------------------ *
 * Recipe table
 * ------------------------------------------------------------------ */

const RECIPES = {
  mercury: () =>
    rocky({
      seed: 1101,
      scale: 3.1,
      ramp: [
        [0.0, '#4a4643'],
        [0.4, '#7d7671'],
        [0.7, '#9a938c'],
        [1.0, '#c4bdb5'],
      ],
      craters: makeCraters(1102, 190, 0.03, 0.17),
    }),

  venus: () =>
    rocky({
      seed: 2201,
      scale: 2.2,
      ridgeAmount: 0.5,
      ramp: [
        [0.0, '#8a5a1e'],
        [0.32, '#c98c33'],
        [0.58, '#e3b25c'],
        [0.8, '#f0cf8e'],
        [1.0, '#fbecc4'],
      ],
    }),

  earth: () => earthShader(),
  'earth-clouds': () => earthCloudsShader(),

  mars: () =>
    rocky({
      seed: 4401,
      scale: 2.9,
      ridgeAmount: 0.6,
      ramp: [
        [0.0, '#5c2410'],
        [0.35, '#a3411c'],
        [0.58, '#c1653a'],
        [0.78, '#d98b58'],
        [1.0, '#e8b48a'],
      ],
      craters: makeCraters(4402, 120, 0.025, 0.13),
      capLat: 0.945,
      capColor: '#f2f4f6',
    }),

  jupiter: () =>
    gasGiant({
      seed: 5501,
      bands: 6,
      warp: 0.16,
      turbulence: 0.22,
      // Ramps must run monotonically dark -> light. A ramp that brightens then
      // darkens again would paint two light bands per sine cycle.
      ramp: [
        [0.0, '#6b4429'],
        [0.3, '#96653f'],
        [0.55, '#c79a6f'],
        [0.78, '#e6c99e'],
        [1.0, '#f7e8cd'],
      ],
      spot: makeSpot({ lat: -0.3, lon: 2.1, width: 0.62, height: 0.16 }),
      spotRamp: [
        [0.0, '#e8b79a'],
        [0.5, '#c4553a'],
        [1.0, '#8c2f1e'],
      ],
    }),

  saturn: () =>
    gasGiant({
      seed: 6601,
      bands: 5,
      warp: 0.12,
      turbulence: 0.16,
      ramp: [
        [0.0, '#a8854f'],
        [0.3, '#cdae74'],
        [0.58, '#e4cf9f'],
        [0.8, '#f2e4c2'],
        [1.0, '#faf1dc'],
      ],
    }),

  uranus: () =>
    gasGiant({
      seed: 7701,
      bands: 4,
      warp: 0.07,
      turbulence: 0.07,
      ramp: [
        [0.0, '#8fd3d8'],
        [0.35, '#a9e2e6'],
        [0.62, '#c6eef0'],
        [1.0, '#dcf5f6'],
      ],
    }),

  neptune: () =>
    gasGiant({
      seed: 8801,
      bands: 5,
      warp: 0.1,
      turbulence: 0.12,
      ramp: [
        [0.0, '#1f3f96'],
        [0.32, '#2b57b8'],
        [0.58, '#4a7ad4'],
        [0.8, '#7ba4e8'],
        [1.0, '#b9d2f4'],
      ],
      spot: makeSpot({ lat: -0.28, lon: 4.0, width: 0.36, height: 0.11 }),
      spotRamp: [
        [0.0, '#4a6fb8'],
        [0.6, '#16296b'],
        [1.0, '#0b1741'],
      ],
    }),

  sun: () => sunShader(),

  /* ------------------------------------------------------------------ *
   * Dwarf planets and moons
   *
   * These are the bodies with no photographic map in the Solar System Scope
   * set, so unlike the eight above — where a recipe is an offline fallback
   * that almost never runs — what is drawn here is what actually ships.
   *
   * Each one aims at the single thing that makes the body recognisable and
   * stops there. Io is sulphur yellow with no craters; Callisto is nothing
   * but craters; Europa is white cut by fractures; Titan is a smooth orange
   * blank. Reaching for more detail would only be inventing terrain, and an
   * invented crater in the wrong place is worse than no crater at all.
   * ------------------------------------------------------------------ */

  // Bright nitrogen plain on a dark, reddish tholin-stained crust.
  pluto: () =>
    rocky({
      seed: 9901,
      scale: 2.6,
      ridgeAmount: 0.35,
      ramp: [
        [0.0, '#4a3327'],
        [0.35, '#7d5d45'],
        [0.6, '#a8896b'],
        [0.82, '#c9b096'],
        [1.0, '#e0d0bb'],
      ],
      craters: makeCraters(9902, 70, 0.03, 0.12),
      // Tombaugh Regio: wide, bright, and sitting a little south of the
      // equator, which is roughly where New Horizons found it.
      patch: makeSpot({ lat: -0.08, lon: 1.5, width: 0.9, height: 0.34, softness: 0.75 }),
      patchColor: '#f2e9d8',
    }),

  // Fallbacks for the four dwarfs that do have a downloaded map. Reached only
  // if the download failed, hence the plainness.
  ceres: () =>
    rocky({
      seed: 1201,
      scale: 3.3,
      ramp: [
        [0.0, '#4a453f'],
        [0.45, '#726b62'],
        [0.75, '#8e8880'],
        [1.0, '#b3aca2'],
      ],
      craters: makeCraters(1202, 220, 0.025, 0.15),
    }),

  eris: () =>
    rocky({
      seed: 1301,
      scale: 2.4,
      ramp: [
        [0.0, '#9a958d'],
        [0.4, '#c3bfb7'],
        [0.72, '#ded9d1'],
        [1.0, '#f4f1ec'],
      ],
      craters: makeCraters(1302, 60, 0.02, 0.09),
    }),

  haumea: () =>
    rocky({
      seed: 1401,
      scale: 2.8,
      ridgeAmount: 0.3,
      ramp: [
        [0.0, '#9b978f'],
        [0.42, '#c2beb6'],
        [0.75, '#d6d2ca'],
        [1.0, '#efece6'],
      ],
    }),

  makemake: () =>
    rocky({
      seed: 1501,
      scale: 2.7,
      ramp: [
        [0.0, '#6d5445'],
        [0.4, '#a07f68'],
        [0.72, '#c19d86'],
        [1.0, '#dcc0a8'],
      ],
      craters: makeCraters(1502, 80, 0.02, 0.1),
    }),

  // Fallback for the Moon, which normally ships the real map.
  luna: () =>
    rocky({
      seed: 1601,
      scale: 3.0,
      ramp: [
        [0.0, '#38352f'],
        [0.3, '#5c5850'],
        [0.55, '#8b857b'],
        [0.8, '#a8a29a'],
        [1.0, '#cdc7bd'],
      ],
      craters: makeCraters(1602, 320, 0.02, 0.16),
    }),

  // Two very small, very dark, very battered rocks. Almost pure crater.
  phobos: () =>
    rocky({
      seed: 1701,
      scale: 4.2,
      ramp: [
        [0.0, '#332d28'],
        [0.4, '#574e46'],
        [0.75, '#7d7168'],
        [1.0, '#9a8d81'],
      ],
      craters: makeCraters(1702, 260, 0.05, 0.3),
    }),

  deimos: () =>
    rocky({
      seed: 1801,
      scale: 3.6,
      ramp: [
        [0.0, '#41392f'],
        [0.42, '#655a4e'],
        [0.76, '#8a7d70'],
        [1.0, '#a89a8b'],
      ],
      // Smoother than Phobos: a regolith blanket has half-buried its craters.
      craters: makeCraters(1802, 110, 0.04, 0.19),
    }),

  // Sulphur. No craters at all — Io resurfaces itself faster than they form,
  // and leaving them out is the single most characteristic thing about it.
  io: () =>
    rocky({
      seed: 1901,
      scale: 2.3,
      ridgeAmount: 0.55,
      ramp: [
        [0.0, '#5c3a12'],
        [0.28, '#a8761f'],
        [0.52, '#d9c56a'],
        [0.76, '#f0e08c'],
        [1.0, '#fdf6d2'],
      ],
    }),

  // Bright ice cut by the lineae. The high ridge amount is doing the work:
  // ridged noise makes long thin filaments, which is what those cracks are.
  europa: () =>
    rocky({
      seed: 2001,
      scale: 2.0,
      ridgeAmount: 0.95,
      ramp: [
        [0.0, '#7a5f47'],
        [0.3, '#b09a86'],
        [0.6, '#ddd6cc'],
        [0.85, '#efeae2'],
        [1.0, '#fbf9f6'],
      ],
    }),

  // Half ancient dark cratered ground, half younger grooved ice.
  ganymede: () =>
    rocky({
      seed: 2101,
      scale: 2.6,
      ridgeAmount: 0.5,
      ramp: [
        [0.0, '#4a423a'],
        [0.35, '#6f665c'],
        [0.62, '#9a8f84'],
        [0.85, '#b9afa4'],
        [1.0, '#d6cec4'],
      ],
      craters: makeCraters(2102, 200, 0.02, 0.12),
    }),

  // The most cratered surface known — nothing has resurfaced it in four
  // billion years, so the count is pushed as high as the recipe will take.
  callisto: () =>
    rocky({
      // Not 2201 — that is Venus's seed, and sharing it would give the two
      // bodies the same terrain under different palettes.
      seed: 2251,
      scale: 3.4,
      ramp: [
        [0.0, '#2e2822'],
        [0.35, '#4d443b'],
        [0.65, '#6f6459'],
        [0.88, '#8d8175'],
        [1.0, '#b0a496'],
      ],
      craters: makeCraters(2202, 420, 0.018, 0.14),
    }),

  /* ---- Saturn's icy moons ----
   *
   * A family, and drawn as one: near-white water-ice ramps separated by how
   * battered each surface is rather than by colour, because that is genuinely
   * what distinguishes them. Mimas and Rhea are saturated with craters, Tethys
   * and Dione carry fewer craters and more fracture, and each of the four gets
   * its own seed so they are not the same terrain in different palettes.
   */

  // The Death Star look is one crater, so it is placed rather than left to
  // chance: Herschel is a third of Mimas's diameter, and no random draw from
  // `makeCraters` would reliably put a basin that large anywhere in particular.
  mimas: () =>
    rocky({
      seed: 2601,
      scale: 3.6,
      ramp: [
        [0.0, '#8e8b86'],
        [0.4, '#b1aea8'],
        [0.72, '#c9c6c0'],
        [1.0, '#e4e2dd'],
      ],
      craters: makeCraters(2602, 380, 0.02, 0.13),
      patch: makeSpot({ lat: 0.06, lon: 1.15, width: 0.34, height: 0.34, softness: 0.75 }),
      patchColor: '#7f7c78',
    }),

  // The brightest surface in the solar system: a narrow ramp, all of it near
  // white, with a faint blue cast in the shadows.
  enceladus: () =>
    rocky({
      seed: 2301,
      scale: 2.2,
      ridgeAmount: 0.7,
      ramp: [
        [0.0, '#b9c2c6'],
        [0.4, '#dbe1e3'],
        [0.72, '#e8e6e2'],
        [1.0, '#fdfdfc'],
      ],
    }),

  // Nearly pure water ice — its density is barely above water's. Ithaca Chasma
  // wraps most of the way round it, which is what the raised ridge amount is
  // standing in for: long thin fracture rather than pitting.
  tethys: () =>
    rocky({
      seed: 2611,
      scale: 2.9,
      ridgeAmount: 0.55,
      ramp: [
        [0.0, '#a6a39d'],
        [0.4, '#c6c3bc'],
        [0.72, '#dcd9d2'],
        [1.0, '#f2f0eb'],
      ],
      craters: makeCraters(2612, 250, 0.02, 0.15),
    }),

  // The wispy terrain is not frost, as Voyager read it, but cliffs — bright ice
  // exposed along fractures. Ridged noise makes long bright lineaments, which is
  // the closest this generator gets to saying so.
  dione: () =>
    rocky({
      seed: 2621,
      scale: 2.6,
      ridgeAmount: 0.8,
      ramp: [
        [0.0, '#9d9b96'],
        [0.42, '#bfbdb8'],
        [0.74, '#d6d4cf'],
        [1.0, '#efeee9'],
      ],
      craters: makeCraters(2622, 190, 0.02, 0.12),
    }),

  // Old, quiet and saturated with craters, with the same bright fracture walls
  // as Dione on a larger body.
  rhea: () =>
    rocky({
      seed: 2631,
      scale: 3.2,
      ridgeAmount: 0.35,
      ramp: [
        [0.0, '#9a978f'],
        [0.4, '#bcb9b1'],
        [0.72, '#d3d0c8'],
        [1.0, '#edebe5'],
      ],
      craters: makeCraters(2632, 360, 0.018, 0.12),
    }),

  // Haze, and nothing else. Titan's surface has never been seen in visible
  // light from orbit, so a banded gas-giant recipe with the turbulence turned
  // almost off is the honest picture: a smooth orange blank.
  titan: () =>
    gasGiant({
      seed: 2401,
      bands: 2,
      warp: 0.05,
      turbulence: 0.06,
      ramp: [
        [0.0, '#a5652a'],
        [0.35, '#c4823f'],
        [0.65, '#d9a05a'],
        [0.85, '#e8bd82'],
        [1.0, '#f2d5ab'],
      ],
    }),

  // Pinkish nitrogen ice with a bright polar cap, and the dimpled
  // "cantaloupe terrain" approximated by ridged noise at low relief.
  /*
   * Iapetus is the one body here whose defining feature is a *hemisphere*.
   *
   * Coal-dark on the leading face, snow-bright on the trailing one, ten to one
   * in reflectivity. `patch` is normally a named region — Pluto's Tombaugh
   * Regio, Umbriel's Wunda — but a spot 92° wide in both directions is a
   * hemisphere, and reusing the mechanism means the boundary gets broken up by
   * the same noise that shapes the terrain, which is right: the real edge is
   * ragged, not a painted line.
   *
   * Centred on longitude 90°, where Cassini Regio actually is.
   */
  iapetus: () =>
    rocky({
      seed: 2641,
      scale: 3.0,
      ramp: [
        [0.0, '#a9a49a'],
        [0.4, '#c8c3b8'],
        [0.72, '#ded9ce'],
        [1.0, '#f0ece2'],
      ],
      craters: makeCraters(2642, 300, 0.02, 0.13),
      patch: makeSpot({ lat: 0, lon: Math.PI / 2, width: 1.6, height: 1.6, softness: 0.95 }),
      patchColor: '#241d16',
    }),

  /* ---- The Uranian five ----
   *
   * Greyer and flatter than Saturn's moons, and that is not laziness: Voyager 2
   * saw them once, in 1986, and they really are near-colourless. What separates
   * them is albedo and age — Ariel bright and resurfaced, Umbriel dark and
   * untouched, the rest in between.
   */

  // A patchwork of terrains that do not belong together, plus the tallest cliff
  // known. High ridge amount on a small scale gives the broken, blocky look.
  miranda: () =>
    rocky({
      seed: 2701,
      scale: 4.2,
      ridgeAmount: 1.0,
      ramp: [
        [0.0, '#7e8286'],
        [0.38, '#9ca0a4'],
        [0.68, '#b7babe'],
        [1.0, '#d4d6d9'],
      ],
      craters: makeCraters(2702, 160, 0.02, 0.11),
    }),

  // The brightest and youngest-looking of the five: rift floors that read as
  // flooded rather than fractured, so fewer craters and a bright ramp.
  ariel: () =>
    rocky({
      seed: 2711,
      scale: 2.7,
      ridgeAmount: 0.7,
      ramp: [
        [0.0, '#94989c'],
        [0.4, '#b4b8bc'],
        [0.72, '#cdd1d5'],
        [1.0, '#e6e9ec'],
      ],
      craters: makeCraters(2712, 120, 0.02, 0.10),
    }),

  // The darkest and most uniformly ancient. Wunda is the one thing on it — a
  // bright ring on an otherwise featureless dark surface — so it gets the patch.
  umbriel: () =>
    rocky({
      seed: 2721,
      scale: 3.3,
      ramp: [
        [0.0, '#4f5255'],
        [0.4, '#6a6d70'],
        [0.72, '#82858a'],
        [1.0, '#9a9da1'],
      ],
      craters: makeCraters(2722, 400, 0.018, 0.12),
      patch: makeSpot({ lat: 0.38, lon: -0.55, width: 0.17, height: 0.1, softness: 0.5 }),
      patchColor: '#cfd2d5',
    }),

  // Largest of the five, cut by fault canyons — Messina Chasma runs about
  // 1,500 km — and slightly warmer in tone than its neighbours.
  titania: () =>
    rocky({
      seed: 2731,
      scale: 2.8,
      ridgeAmount: 0.75,
      ramp: [
        [0.0, '#87837f'],
        [0.4, '#a5a19d'],
        [0.72, '#c0bcb8'],
        [1.0, '#dcd8d4'],
      ],
      craters: makeCraters(2732, 210, 0.02, 0.12),
    }),

  // Titania's near-twin in size, with a far older surface: crater count up,
  // fracture down, and dark floors in the low ground.
  oberon: () =>
    rocky({
      seed: 2741,
      scale: 3.1,
      ridgeAmount: 0.25,
      ramp: [
        [0.0, '#6b6663'],
        [0.38, '#8a8581'],
        [0.7, '#a8a29e'],
        [1.0, '#c6c1bd'],
      ],
      craters: makeCraters(2742, 390, 0.018, 0.13),
    }),

  triton: () =>
    rocky({
      seed: 2501,
      scale: 3.1,
      ridgeAmount: 0.85,
      ramp: [
        [0.0, '#8b7f88'],
        [0.38, '#ada4ab'],
        [0.68, '#c4bfc6'],
        [0.88, '#ded9de'],
        [1.0, '#f2eef2'],
      ],
      capLat: 0.62,
      capColor: '#f7f4f7',
    }),

  /* ---- The Pluto system ----
   *
   * Charon gets its cap through `patch` rather than `capLat`, and that is the
   * whole reason the mechanism is used here: `capLat` works on `abs(lat)`, so it
   * paints both poles. Mordor Macula is only in the north. A spot placed high
   * with a longitude width far wider than the sphere covers every longitude at
   * that latitude and leaves the south alone.
   */
  charon: () =>
    rocky({
      seed: 2801,
      scale: 2.9,
      ridgeAmount: 0.6,
      ramp: [
        [0.0, '#736c65'],
        [0.4, '#948c83'],
        [0.72, '#b0a79d'],
        [1.0, '#cfc6bb'],
      ],
      craters: makeCraters(2802, 240, 0.02, 0.12),
      patch: makeSpot({ lat: 0.94, lon: 0, width: 40, height: 0.34, softness: 0.8 }),
      patchColor: '#5b3a2e',
    }),

  /*
   * Styx, Nix, Kerberos and Hydra: bright water ice on bodies 10 to 50 km
   * across. There is nothing to map — New Horizons resolved them into a handful
   * of pixels each — so these are four variations on clean ice, differing only
   * in seed and in how hard the cratering is pushed. Nix keeps the one detail
   * that was actually seen: a reddish crater on an otherwise grey-white surface.
   *
   * They are drawn as spheres, which for a 16 x 9 x 8 km rock is generous. The
   * info panel says so.
   */
  styx: () =>
    rocky({
      seed: 2811,
      scale: 4.6,
      ridgeAmount: 0.5,
      ramp: [
        [0.0, '#77726c'],
        [0.42, '#948f88'],
        [0.74, '#b0aba4'],
        [1.0, '#cbc6bf'],
      ],
      craters: makeCraters(2812, 150, 0.03, 0.16),
    }),

  nix: () =>
    rocky({
      seed: 2821,
      scale: 4.1,
      ridgeAmount: 0.45,
      ramp: [
        [0.0, '#807a73'],
        [0.42, '#9e9891'],
        [0.74, '#bab4ad'],
        [1.0, '#d5cfc8'],
      ],
      craters: makeCraters(2822, 130, 0.03, 0.17),
      patch: makeSpot({ lat: -0.2, lon: 2.1, width: 0.3, height: 0.28, softness: 0.65 }),
      patchColor: '#8a5343',
    }),

  kerberos: () =>
    rocky({
      seed: 2831,
      scale: 4.8,
      ridgeAmount: 0.55,
      ramp: [
        [0.0, '#736e68'],
        [0.42, '#918c85'],
        [0.74, '#ada8a1'],
        [1.0, '#c8c3bc'],
      ],
      craters: makeCraters(2832, 140, 0.03, 0.16),
    }),

  hydra: () =>
    rocky({
      seed: 2841,
      scale: 4.3,
      ridgeAmount: 0.5,
      ramp: [
        [0.0, '#847e77'],
        [0.42, '#a29c95'],
        [0.74, '#bfb9b2'],
        [1.0, '#dbd5ce'],
      ],
      craters: makeCraters(2842, 135, 0.03, 0.17),
    }),
}

/* ------------------------------------------------------------------ *
 * Public API
 *
 * These are used as the offline fallback by fetch-textures.mjs: if a
 * photographic texture can't be downloaded, the procedural one is drawn
 * instead so the app always has something to render.
 * ------------------------------------------------------------------ */

/** Every body this generator can draw. */
export const PROCEDURAL_NAMES = [...Object.keys(RECIPES), 'saturn-ring']

/** Renders one body and returns the encoded PNG. */
export function generateTexturePNG(name) {
  if (name === 'saturn-ring') {
    const { pixels, width, height } = renderRingTexture()
    return encodePNG(pixels, width, height, 4)
  }
  if (!RECIPES[name]) throw new Error(`no procedural recipe for "${name}"`)
  const channels = name === 'earth-clouds' ? 4 : 3
  const pixels = renderSphereTexture(RECIPES[name](), { channels })
  return encodePNG(pixels, WIDTH, HEIGHT, channels)
}

/** Renders one body straight to `public/textures/<name>.png`. */
export function generateTextureFile(name) {
  mkdirSync(OUT_DIR, { recursive: true })
  const png = generateTexturePNG(name)
  writeFileSync(join(OUT_DIR, `${name}.png`), png)
  return png.length
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const names = PROCEDURAL_NAMES
  const missing = names.filter((n) => !existsSync(join(OUT_DIR, `${n}.png`)))

  if (!FORCE && missing.length === 0) {
    console.log('[textures] all textures present — skipping (use --force to regenerate)')
    return
  }

  const todo = FORCE ? names : missing
  const started = Date.now()
  console.log(`[textures] generating ${todo.length} texture(s) into public/textures/`)

  for (const name of todo) {
    const t0 = Date.now()
    let png

    if (name === 'saturn-ring') {
      const { pixels, width, height } = renderRingTexture()
      png = encodePNG(pixels, width, height, 4)
    } else {
      const channels = name === 'earth-clouds' ? 4 : 3
      const pixels = renderSphereTexture(RECIPES[name](), { channels })
      png = encodePNG(pixels, WIDTH, HEIGHT, channels)
    }

    writeFileSync(join(OUT_DIR, `${name}.png`), png)
    console.log(
      `[textures]   ${name.padEnd(14)} ${(png.length / 1024).toFixed(0).padStart(5)} KB  ${Date.now() - t0}ms`,
    )
  }

  console.log(`[textures] done in ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

// Only run the CLI when invoked directly, not when imported as a fallback.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
