/**
 * Downloads the photographic planet textures into public/textures/.
 *
 * Source: Solar System Scope (https://www.solarsystemscope.com/textures/),
 * released under CC BY 4.0 — see the attribution note in the README. The maps
 * are built from NASA elevation and imagery data.
 *
 * Runs once on `npm install`. If a download fails (offline, host down), the
 * procedural generator in generate-textures.mjs draws that body instead, so
 * the app always has a complete set of textures to render and the build never
 * hard-fails on a network problem.
 */

import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateTextureFile } from './generate-textures.mjs'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'textures')
// Overridable so the set can be served from a mirror or an internal cache.
const BASE =
  process.env.SOLAR_TEXTURE_BASE || 'https://www.solarsystemscope.com/textures/download'
const FORCE = process.argv.includes('--force')

/**
 * local name -> { file, remote, fallback }
 *
 * `fallback` is the procedural recipe to draw if the download fails; `null`
 * means the app simply does without that map (night lights and the specular
 * mask are enhancements, not requirements).
 */
const TEXTURES = [
  { name: 'sun', remote: '2k_sun.jpg', fallback: 'sun' },
  { name: 'mercury', remote: '2k_mercury.jpg', fallback: 'mercury' },
  // The Magellan radar surface, not the cloud deck. Venus really is wrapped in
  // featureless yellow-white cloud, but every recognisable picture of it — and
  // the reference the look is matched against — is this golden, mapped surface.
  { name: 'venus', remote: '2k_venus_surface.jpg', fallback: 'venus' },
  // Earth is the planet you get closest to, so it's worth the extra weight.
  { name: 'earth', remote: '8k_earth_daymap.jpg', fallback: 'earth' },
  { name: 'earth-night', remote: '2k_earth_nightmap.jpg', fallback: null },
  // No longer loaded by the app — Earth's clouds now arrive composited into the
  // NASA colour map (see `prepare-earth-maps.mjs`). Kept so the procedural
  // fallback and the shader that draws it stay exercised and available.
  { name: 'earth-clouds', remote: '2k_earth_clouds.jpg', fallback: 'earth-clouds' },
  { name: 'mars', remote: '2k_mars.jpg', fallback: 'mars' },
  { name: 'jupiter', remote: '2k_jupiter.jpg', fallback: 'jupiter' },
  { name: 'saturn', remote: '2k_saturn.jpg', fallback: 'saturn' },
  { name: 'saturn-ring', remote: '2k_saturn_ring_alpha.png', fallback: 'saturn-ring' },
  { name: 'uranus', remote: '2k_uranus.jpg', fallback: 'uranus' },
  { name: 'neptune', remote: '2k_neptune.jpg', fallback: 'neptune' },

  /* ---- dwarf planets ----
   *
   * Solar System Scope labels its Ceres, Eris, Haumea and Makemake maps
   * "fictional", and they mean it: nobody has imaged those surfaces. Ceres is
   * the arguable case — Dawn mapped it properly in 2015 — but a USGS mosaic is
   * a different source under different terms, and mixing the two would make
   * the credit line a lie. They are used here because an invented surface from
   * a careful artist beats an invented surface from my noise function, and the
   * info panel says plainly which bodies are guesses.
   *
   * Pluto is not in the set at all. It used to be drawn procedurally, which of
   * all the bodies to have to invent was the unluckiest one — New Horizons gave
   * us a superb map. It now wears that map, which arrives inside NASA's 3D
   * model rather than through here (see `scripts/prepare-nasa-model.mjs`). The
   * drawn PNG is still generated and still puts a bright nitrogen plain where
   * Tombaugh Regio belongs, as the fallback if the model does not load.
   */
  { name: 'ceres', remote: '2k_ceres_fictional.jpg', fallback: 'ceres' },
  { name: 'eris', remote: '2k_eris_fictional.jpg', fallback: 'eris' },
  { name: 'haumea', remote: '2k_haumea_fictional.jpg', fallback: 'haumea' },
  { name: 'makemake', remote: '2k_makemake_fictional.jpg', fallback: 'makemake' },
  { name: 'pluto', remote: null, fallback: 'pluto' },

  /* ---- moons ----
   *
   * Only ours is published. The rest are procedural, and the recipes aim for
   * the one thing each moon is recognisable by rather than for detail they
   * cannot honestly carry: Io's sulphur yellows, Europa's fractured white,
   * Callisto's saturation of craters, Titan's featureless orange haze.
   */
  { name: 'luna', remote: '2k_moon.jpg', fallback: 'luna' },
  { name: 'phobos', remote: null, fallback: 'phobos' },
  { name: 'deimos', remote: null, fallback: 'deimos' },
  { name: 'io', remote: null, fallback: 'io' },
  { name: 'europa', remote: null, fallback: 'europa' },
  { name: 'ganymede', remote: null, fallback: 'ganymede' },
  { name: 'callisto', remote: null, fallback: 'callisto' },
  { name: 'enceladus', remote: null, fallback: 'enceladus' },
  { name: 'titan', remote: null, fallback: 'titan' },
  { name: 'triton', remote: null, fallback: 'triton' },

  /* ---- the galaxy ----
   *
   * The one texture here that is not a body. It wraps the sky rather than a
   * globe: an equirectangular panorama of the Milky Way in *galactic*
   * coordinates, which `MilkyWay.jsx` maps onto the celestial sphere.
   *
   * 2k rather than the 8k the same pack offers, and the resolution argument
   * runs the other way from Earth's. This is a diffuse band with no edges and
   * no feature anyone can name at arcminute scale; 8192x4096 would be 134 MB of
   * texture memory to draw a glow. There is no procedural fallback because
   * there is nothing to invent — a made-up galaxy in the wrong place is worse
   * than a black sky, and the component simply draws nothing if the file is
   * missing.
   */
  { name: 'milky-way', remote: '2k_stars_milky_way.jpg', fallback: null },
]

const extOf = (remote) => (remote?.endsWith('.png') ? 'png' : 'jpg')

/**
 * True if we already have this texture in some usable form.
 *
 * A `remote: null` entry has no photographic form to have — it is procedural
 * by design, not by failure — so it counts as satisfied once the drawn PNG is
 * on disk. Without this the installer would try to download every moon on
 * every run and report a dozen failures as if something were wrong.
 */
function havePhoto(entry) {
  if (!entry.remote) return haveFallback(entry)
  return existsSync(join(OUT_DIR, `${entry.name}.${extOf(entry.remote)}`))
}

function haveFallback(entry) {
  return entry.fallback && existsSync(join(OUT_DIR, `${entry.fallback}.png`))
}

async function download(entry, timeoutMs = 60000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}/${entry.remote}`, {
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const buffer = Buffer.from(await res.arrayBuffer())
    // A truncated or error-page response would be far too small to be a texture.
    if (buffer.length < 8192) throw new Error(`suspiciously small (${buffer.length} bytes)`)

    writeFileSync(join(OUT_DIR, `${entry.name}.${extOf(entry.remote)}`), buffer)
    return buffer.length
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const todo = FORCE ? TEXTURES : TEXTURES.filter((e) => !havePhoto(e))

  if (todo.length === 0) {
    console.log('[textures] photographic textures already present — skipping')
    return
  }

  console.log(
    `[textures] fetching ${todo.filter((e) => e.remote).length} texture(s) ` +
      'from solarsystemscope.com (CC BY 4.0)…',
  )

  const downloads = todo.filter((e) => e.remote)
  // Genuine download failures, worth telling the user to retry. Kept apart
  // from the procedural-by-design entries below so that a clean run on a
  // perfectly good connection doesn't end by advising the user to get online.
  const failed = []
  let bytes = 0

  // Sequential rather than parallel: this is one small host, and a burst of
  // 12 concurrent multi-megabyte requests is a good way to get throttled.
  for (const entry of downloads) {
    const t0 = Date.now()
    try {
      const size = await download(entry)
      bytes += size
      console.log(
        `[textures]   ${entry.name.padEnd(13)} ${(size / 1024).toFixed(0).padStart(5)} KB  ${Date.now() - t0}ms`,
      )
    } catch (error) {
      console.warn(`[textures]   ${entry.name.padEnd(13)} failed — ${error.message}`)
      failed.push(entry)
    }
  }

  // Everything that has no photograph — because none is published, or because
  // the download failed — gets drawn instead.
  for (const entry of [...todo.filter((e) => !e.remote), ...failed]) {
    if (!entry.fallback) {
      console.warn(`[textures]   ${entry.name.padEnd(13)} no fallback — feature disabled`)
      continue
    }
    if (haveFallback(entry)) continue
    try {
      const size = generateTextureFile(entry.fallback)
      console.log(
        `[textures]   ${entry.name.padEnd(13)} drew procedural fallback (${(size / 1024).toFixed(0)} KB)`,
      )
    } catch (error) {
      console.error(`[textures]   ${entry.name.padEnd(13)} fallback failed — ${error.message}`)
    }
  }

  console.log(
    `[textures] done — ${(bytes / 1024 / 1024).toFixed(1)} MB downloaded` +
      (failed.length ? `, ${failed.length} fell back to procedural` : ''),
  )

  if (failed.length) {
    console.log('[textures] re-run `npm run textures` once you are online to get the real maps.')
  }
}

main().catch((error) => {
  // Never fail the install over textures — the app has a fallback path.
  console.error('[textures] unexpected error:', error.message)
  process.exitCode = 0
})
