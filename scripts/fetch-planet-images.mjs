#!/usr/bin/env node
/**
 * Bakes a small gallery of real NASA photographs for each planet.
 *
 * Run with:
 *     npm run fetch:planet-images
 *
 * ## Why they are baked
 *
 * The app makes no network requests at run time, and that rule does not bend
 * for pictures. Everything here is downloaded once, written into
 * `public/images/planets`, and shipped.
 *
 * ## Why the IDs are curated rather than searched
 *
 * The obvious version asks the NASA image library for "Jupiter" and shows the
 * first few results. Run today that returns an artist's concept of a spacecraft
 * as the top hit for the Great Red Spot; run next year it returns something
 * else. A gallery whose contents change when a search index is reindexed is not
 * a gallery, and there would be nothing to check it against.
 *
 * So each entry below is a specific `nasa_id` — a NASA/JPL PIA number or a
 * Goddard archive ID — chosen for what it shows. The `why` line beside each is
 * editorial and is the caption's subject: a picture in a dossier should earn
 * its place by showing something the text claims.
 *
 * Metadata is *not* curated. The title, the date, the centre that produced it
 * and the description all come from the API, so the credit line is whatever
 * NASA says it is rather than whatever this file remembers.
 *
 * ## Licence
 *
 * NASA still and moving images are generally not copyrighted and may be used
 * for any purpose, with the usual conditions: do not imply NASA endorsement,
 * and note that a few images carry third-party rights. Every ID here is from
 * NASA/JPL-Caltech, Goddard, or a NASA mission archive. The credit line the
 * panel prints comes from the API's own `center` and `secondary_creator`.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'images', 'planets')
const OUT = join(ROOT, 'src', 'data', 'planetImages.js')

const SEARCH = 'https://images-api.nasa.gov/search'
const ASSET = 'https://images-api.nasa.gov/asset'

const log = (...args) => console.log('[planet-images]', ...args)

/**
 * Three per planet, and the three are chosen to do different jobs: one that
 * shows the whole world, one that shows the feature the dossier talks about,
 * and one that shows it as a place rather than as a disc.
 */
const GALLERY = {
  mercury: [
    ['PIA11403', 'The whole disc in enhanced colour, where the mineral differences show'],
    ['PIA11219', 'Colour differences that a grey world turns out to have'],
    ['PIA10187', 'Toward the south pole, where crater floors never see the Sun'],
  ],
  venus: [
    ['PIA00271', 'The cloud deck, which is all that can be seen from outside'],
    ['PIA00254', 'Maat Mons, built from radar because the clouds never open'],
    ['PIA00104', 'The surface itself, mapped through the atmosphere by Magellan'],
  ],
  earth: [
    ['PIA18033', 'Home, at the only scale that shows all of it at once'],
    ['GSFC_20171208_Archive_e001386', 'The Blue Marble, composited from a day of orbits'],
    ['as08-14-2383', 'Earthrise — the first time anyone saw it from another world'],
  ],
  mars: [
    ['PIA02653', 'The globe, with Valles Marineris across the middle'],
    ['PIA02982', 'Olympus Mons, the tallest volcano in the solar system'],
    ['PIA23971', 'The view from the ground, where it stops being a dot'],
  ],
  jupiter: [
    ['PIA22946', 'The banded atmosphere, which is all weather and no surface'],
    ['PIA21773', 'The Great Red Spot, a storm wider than the Earth'],
    ['PIA01519', 'The four Galilean moons that broke geocentrism'],
  ],
  saturn: [
    ['PIA06193', 'The portrait — the rings at the angle that made them famous'],
    ['PIA08329', 'Backlit, with the Sun behind the planet and Earth in the frame'],
    ['PIA17199', 'The rings edge-on, where their real thinness shows'],
  ],
  uranus: [
    ['PIA18182', 'A featureless blue disc, which is what Voyager 2 found'],
    ['PIA00346', 'The crescent, on the way out — nobody has been back since'],
    ['PIA01977', 'The rings, which are there and very nearly invisible'],
  ],
  neptune: [
    ['PIA00046', 'The Great Dark Spot, a storm that had gone by the next look'],
    ['PIA01493', 'The rings, and the arcs in them nothing fully explains'],
    ['PIA02245', 'The last thing Voyager 2 photographed on its way out'],
  ],
}

async function json(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

/**
 * The largest JPEG that is still sensible to ship.
 *
 * The asset endpoint lists every rendition, `~orig` included, and originals run
 * to tens of megabytes — a 24-image gallery would outweigh the rest of the app.
 * The order below is a preference, not a fallback chain for failures: `~medium`
 * is a few hundred kilobytes and is more resolution than a dossier column can
 * show.
 */
const PREFERRED = ['~medium.jpg', '~small.jpg', '~large.jpg', '~orig.jpg']

function pickRendition(hrefs) {
  for (const suffix of PREFERRED) {
    const found = hrefs.find((h) => h.toLowerCase().endsWith(suffix))
    if (found) return found
  }
  return hrefs.find((h) => /\.jpe?g$/i.test(h)) ?? null
}

/** Trim NASA's description to something a caption can carry. */
function summarise(text) {
  if (!text) return null
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= 300) return clean
  // Cut at a sentence end rather than mid-word.
  const cut = clean.slice(0, 300)
  const stop = cut.lastIndexOf('. ')
  return `${stop > 120 ? cut.slice(0, stop) : cut.trimEnd()}…`
}

mkdirSync(OUT_DIR, { recursive: true })

const out = {}
const missing = []
let bytes = 0

for (const [planet, entries] of Object.entries(GALLERY)) {
  out[planet] = []
  for (const [nasaId, why] of entries) {
    try {
      const found = await json(`${SEARCH}?nasa_id=${encodeURIComponent(nasaId)}`)
      const item = found.collection.items[0]
      if (!item) throw new Error('no such nasa_id')
      const meta = item.data[0]

      const assets = await json(`${ASSET}/${encodeURIComponent(nasaId)}`)
      const href = pickRendition(assets.collection.items.map((i) => i.href))
      if (!href) throw new Error('no JPEG rendition')

      const res = await fetch(href)
      if (!res.ok) throw new Error(`${res.status} fetching the image`)
      const buffer = Buffer.from(await res.arrayBuffer())

      const file = `${planet}-${out[planet].length + 1}.jpg`
      writeFileSync(join(OUT_DIR, file), buffer)
      bytes += buffer.length

      out[planet].push({
        file,
        nasaId,
        why,
        title: meta.title?.replace(/\s+/g, ' ').trim() ?? nasaId,
        /*
         * The credit is the API's, not this file's — see the header.
         *
         * `secondary_creator` is already a full credit line ("NASA/JPL/MSSS")
         * where it exists, so joining it to `center` and prefixing "NASA" in
         * the panel printed the agency three times: "NASA · JPL ·
         * NASA/JPL/MSSS". Preferred whole, and only assembled from the centre
         * when it is missing.
         */
        credit: meta.secondary_creator?.trim() || `NASA/${meta.center ?? 'JPL'}`,
        date: meta.date_created?.slice(0, 10) ?? null,
        description: summarise(meta.description),
      })
      log(`  ${planet.padEnd(8)} ${nasaId.padEnd(30)} ${(buffer.length / 1024).toFixed(0)} KB`)
    } catch (error) {
      missing.push(`${planet}/${nasaId}: ${error.message}`)
      log(`  ${planet.padEnd(8)} ${nasaId.padEnd(30)} FAILED — ${error.message}`)
    }
  }
}

/*
 * A failure is reported and does not stop the bake, but it is never silent: a
 * gallery quietly one image short looks exactly like a gallery that was meant
 * to have two.
 */
if (missing.length) {
  log(`\n${missing.length} image(s) could not be fetched:`)
  for (const line of missing) log(`  ${line}`)
}

const counts = Object.entries(out).map(([k, v]) => `${k} ${v.length}`)
log(`\n${Object.values(out).flat().length} images, ${(bytes / 1024 / 1024).toFixed(1)} MB — ${counts.join(', ')}`)

const today = new Date().toISOString().slice(0, 10)

writeFileSync(
  OUT,
  `/**
 * A few real photographs of each planet.
 *
 * GENERATED by \`scripts/fetch-planet-images.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:planet-images\` instead. Generated ${today}.
 *
 * Images are NASA's, fetched from the NASA Image and Video Library by a
 * curated \`nasaId\` and stored under \`public/images/planets\`. The app makes no
 * network requests at run time.
 *
 * \`why\` is this project's editorial line — what the picture is here to show.
 * Everything else (\`title\`, \`credit\`, \`date\`, \`description\`) is NASA's own
 * metadata, carried through unchanged so the credit is theirs rather than ours.
 */

export const PLANET_IMAGES = ${JSON.stringify(out, null, 2)}
`,
)
log(`wrote ${OUT}`)
