/**
 * Bakes a thumbnail of every spacecraft model, for the nav bar's chips.
 *
 * A planet's chip is its own surface map — `getTextureURL(body.id)` — so the bar
 * shows real thumbnails rather than coloured dots. A spacecraft has no map, so
 * it fell through to a flat disc of its accent colour, which tells you nothing:
 * ten craft, ten identical grey circles.
 *
 * The equivalent for a spacecraft is a picture of the spacecraft, and the models
 * are already downloaded. So they are rendered once, here, to transparent PNGs
 * that the chip uses exactly the way a planet uses its map — same mechanism,
 * same zero runtime cost, nothing loaded at runtime that was not already needed.
 *
 * ## Why through the browser
 *
 * Node has no GL context, and the alternatives are a compiled `gl` binding this
 * project deliberately does not have, or the browser that already renders every
 * other visual check in this suite. The second one is free: `scripts/lib/browser.mjs`
 * is already driving real Chrome on a real GPU with the same three.js the app
 * uses, so the thumbnails are lit and shaded by the same code that draws the
 * craft in the scene.
 *
 * Usage: `npm run thumbs:spacecraft`, with `npm run dev` already running.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { openPage } from './lib/browser.mjs'
import { SPACECRAFT } from './spacecraft-roster.mjs'
import { LANDED_CRAFT } from '../src/data/landedCraft.js'

/**
 * The roster's model path to the baked file's slug.
 *
 * The same rule as `modelSlug` in `spacecraftModels.js` and `slugFor` in
 * `fetch-spacecraft-models.mjs`, and it has to stay the same in all three: the
 * fetch script names the files, the app reads them, and this writes a thumbnail
 * beside each one. The directory names the file because `sc_dawn/model.gltf`
 * and `sc_marco/model.gltf` would otherwise collide.
 */
const slugFor = (modelPath) => {
  const parts = modelPath.split('/')
  const dir = parts[0].replace(/^sc_/, '').replace(/_v\d+$/, '').replace(/_/g, '-')
  // A `rover` or `lander` folder joins the slug — Eyes keeps a cruise stage and
  // the rover it delivered under one directory. See `slugFor` in
  // `fetch-spacecraft-models.mjs`, which is the copy that names the files.
  const variant = parts[1]
  if (variant !== 'rover' && variant !== 'lander') return dir
  return `${dir}-${variant}`
}

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'thumbs', 'spacecraft')
await mkdir(outDir, { recursive: true })

/*
 * One thumbnail per *model*, not per craft.
 *
 * The two ARTEMIS probes are the same THEMIS bus, both GRAIL twins are one file,
 * both STEREO craft are one file. Rendering per craft would draw the same
 * picture several times and write it to several names.
 */
const models = new Map()
for (const craft of SPACECRAFT) {
  if (!craft.model) continue
  const slug = slugFor(craft.model)
  if (!models.has(slug)) models.set(slug, craft.rotate ?? null)
}

/*
 * The surface missions carry a second model each, and the chip should show it.
 *
 * A rover's roster entry names the cruise stage that delivered it, so without
 * this the nav pictures Perseverance as a disc with a heat shield. The rovers
 * take no axis correction: Eyes' `rotate` belongs to the flight model, and these
 * are separate files authored upright.
 */
for (const site of Object.values(LANDED_CRAFT)) {
  if (!site.model) continue
  const slug = slugFor(site.model)
  if (!models.has(slug)) models.set(slug, null)
}

const page = await openPage({ url: 'http://localhost:5173', width: 600, height: 400 })
await page.waitFor('document.readyState === "complete"')

let written = 0
const failed = []

try {
  // Loaded from the dev server so Vite rewrites its bare `three` imports; see
  // the note at the top of `tools/thumbs.js`.
  await page.evaluate(`(async () => {
    window.__thumbs = await import('/tools/thumbs.js')
    return true
  })()`)

  for (const [slug, rotate] of models) {
    const data = await page.evaluate(
      `window.__thumbs.renderThumb(` +
        `${JSON.stringify(`/models/spacecraft/${slug}.glb`)}, ${JSON.stringify(rotate)})`,
    )

    if (!data || !data.startsWith('data:image/png;base64,')) {
      failed.push(slug)
      continue
    }

    const png = Buffer.from(data.slice('data:image/png;base64,'.length), 'base64')

    /*
     * A blank render is a *silent* failure — a valid PNG of nothing at all,
     * which would sit in the nav as an invisible chip and look like a CSS bug.
     * A 256x256 transparent PNG compresses to a few hundred bytes; anything with
     * a spacecraft in it is tens of kilobytes.
     */
    if (png.length < 2000) {
      failed.push(`${slug} (rendered empty, ${png.length} bytes)`)
      continue
    }

    await writeFile(join(outDir, `${slug}.png`), png)
    written++
  }
} finally {
  await page.close()
}

console.log(`[thumbs] ${written} of ${models.size} spacecraft models rendered`)
if (failed.length) console.warn(`[thumbs] failed: ${failed.join(', ')}`)
