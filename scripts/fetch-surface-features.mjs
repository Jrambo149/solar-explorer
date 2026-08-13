#!/usr/bin/env node
/**
 * The named places on other worlds, from the IAU's own gazetteer.
 *
 * Run with `npm run fetch:features`. Writes `src/data/surfaceFeatures.js`; the
 * app makes no network requests, this does.
 *
 * ## The source, and why this one
 *
 * The Gazetteer of Planetary Nomenclature is the authority — the IAU Working
 * Group for Planetary System Nomenclature approves every name on every body,
 * and the USGS publishes the register. So "which crater is that" has an answer
 * that is not a matter of opinion, and it comes with the centre coordinates and
 * a diameter rather than needing either to be estimated.
 *
 * It is published as shapefiles and KMZ per body. KMZ is a zip around a KML,
 * and the KML carries the whole record in `ExtendedData` — name, centre
 * latitude and longitude, diameter, feature type, and the origin of the name.
 * Reading it needs no dependency beyond `zlib`, which is already how the star
 * catalogue arrives.
 *
 * ## Why only the largest
 *
 * The Moon alone has nine thousand named features and the gazetteer runs to
 * fifteen thousand. Drawing them is not the problem — reading them is: past a
 * few dozen labels on a globe there is no map, only a grey wash. So each body
 * keeps its largest, which is a defensible rule rather than a taste: the
 * biggest features are the ones visible from the distance the labels appear at,
 * and Copernicus deserves a label before a two-kilometre crater does.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/data/surfaceFeatures.js')
const CACHE = join(ROOT, 'node_modules/.cache/gazetteer')

const BUCKET = 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com'

/**
 * App body id → the gazetteer's name for it, and how many features to keep.
 *
 * The counts are by eye at the distance the labels turn on: a body you can fill
 * the screen with carries more than a moon that is forty pixels across even
 * when you are at it. Everything the gazetteer covers and this app draws is
 * here; the rest of the roster has no named features at all.
 */
const BODIES = [
  ['luna', 'MOON', 600],
  ['mars', 'MARS', 600],
  ['mercury', 'MERCURY', 400],
  ['venus', 'VENUS', 400],
  ['io', 'IO', 150],
  ['europa', 'EUROPA', 120],
  ['ganymede', 'GANYMEDE', 180],
  ['callisto', 'CALLISTO', 150],
  ['titan', 'TITAN', 200],
  ['enceladus', 'ENCELADUS', 80],
  ['dione', 'DIONE', 90],
  ['rhea', 'RHEA', 140],
  ['tethys', 'TETHYS', 50],
  ['mimas', 'MIMAS', 40],
  ['iapetus', 'IAPETUS', 70],
  ['hyperion', 'HYPERION', 12],
  ['phoebe', 'PHOEBE', 25],
  ['miranda', 'MIRANDA', 18],
  ['ariel', 'ARIEL', 26],
  ['umbriel', 'UMBRIEL', 13],
  ['titania', 'TITANIA', 18],
  ['oberon', 'OBERON', 12],
  ['triton', 'TRITON', 60],
  ['proteus', 'PROTEUS', 8],
  ['pluto', 'PLUTO', 70],
  ['charon', 'CHARON', 24],
  ['ceres', 'CERES', 140],
  ['vesta', 'VESTA', 100],
  ['phobos', 'PHOBOS', 20],
  ['deimos', 'DEIMOS', 6],
  ['amalthea', 'AMALTHEA', 6],
  ['janus', 'JANUS', 6],
  ['epimetheus', 'EPIMETHEUS', 6],
  ['thebe', 'THEBE', 4],
  ['nix', 'NIX', 4],
  ['puck', 'PUCK', 4],
]

/** Read one entry out of a zip. Enough of the format for a single-file KMZ. */
function unzipFirst(buffer) {
  let eocd = buffer.length - 22
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('not a zip')

  const entries = buffer.readUInt16LE(eocd + 10)
  let p = buffer.readUInt32LE(eocd + 16)

  for (let i = 0; i < entries; i++) {
    const nameLength = buffer.readUInt16LE(p + 28)
    const extraLength = buffer.readUInt16LE(p + 30)
    const commentLength = buffer.readUInt16LE(p + 32)
    const name = buffer.toString('utf8', p + 46, p + 46 + nameLength)
    const method = buffer.readUInt16LE(p + 10)
    const compressed = buffer.readUInt32LE(p + 20)
    const uncompressed = buffer.readUInt32LE(p + 24)
    const offset = buffer.readUInt32LE(p + 42)

    if (name.endsWith('.kml')) {
      const localName = buffer.readUInt16LE(offset + 26)
      const localExtra = buffer.readUInt16LE(offset + 28)
      const start = offset + 30 + localName + localExtra
      const raw = buffer.subarray(start, start + (method === 0 ? uncompressed : compressed))
      return (method === 0 ? raw : inflateRawSync(raw)).toString('utf8')
    }
    p += 46 + nameLength + extraLength + commentLength
  }
  throw new Error('no kml inside')
}

async function download(target) {
  mkdirSync(CACHE, { recursive: true })
  const file = join(CACHE, `${target}.kmz`)
  if (existsSync(file)) return readFileSync(file)

  const url = `${BUCKET}/${target}_nomenclature_center_pts.kmz`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${target}: ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  writeFileSync(file, bytes)
  return bytes
}

const field = (block, name) => {
  const match = new RegExp(`<SimpleData name="${name}">([\\s\\S]*?)</SimpleData>`).exec(block)
  return match ? match[1].trim() : null
}

const unescape = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

function parse(kml) {
  const features = []
  for (const [, block] of kml.matchAll(/<Placemark[\s\S]*?<\/Placemark>/g).map((m) => [null, m[0]])) {
    const name = field(block, 'clean_name')
    const latitude = Number(field(block, 'center_lat'))
    const longitude = Number(field(block, 'center_lon'))
    const diameter = Number(field(block, 'diameter'))
    const approval = field(block, 'approval')
    const type = field(block, 'type')

    // Only names the IAU has actually adopted; the register also carries
    // proposals and dropped names, and a label is a claim that it is called
    // that.
    if (!name || approval !== 'Adopted by IAU') continue
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue


    features.push({
      name: unescape(name),
      latitude,
      // East longitude, 0–360, which is the convention `surfaceDirection`
      // already uses for the rovers.
      longitude: ((longitude % 360) + 360) % 360,
      /*
       * Zero where the register gives no diameter, which is not rare and not
       * random: it is mostly linear features and the small moons, where nobody
       * has published an extent. Dropping them cost Triton, Proteus, Janus and
       * Puck *every* name they have, so they are kept and marked — the drawing
       * shows a sizeless feature once the body itself is large on screen, since
       * the only honest reading of "no diameter" is "no idea how big".
       */
      diameter: Number.isFinite(diameter) ? diameter : 0,
      // "Crater, craters" → "crater". The register's own type strings carry a
      // plural and sometimes a Latin declension.
      type: (type ?? '').split(',')[0].trim().toLowerCase(),
    })
  }
  return features
}

const round = (n, places) => +n.toFixed(places)

/**
 * The IAU has adopted names for six landing sites, and they are gold.
 *
 * `Statio` is a feature type of its own in the register — Statio
 * Tranquillitatis, Statio Shiv Shakti, Guang Han Gong and the rest. They are
 * carried separately rather than with the craters, for two reasons that pull
 * the same way: they have no diameter, so the size-ranked cap drops every one
 * of them; and drawing them beside `landingSites.js` would put two labels on
 * one spot, since that table names the same six places after the missions that
 * made them.
 *
 * What they are for is checking. `landingSites.js` is transcribed rather than
 * derived — a list of historical facts with no formula behind them — and these
 * six are the part of it that can be compared against a published source. See
 * `verify-landing-sites.mjs`.
 */
const isStation = (type) => type === 'statio'

async function main() {
  const kept = []
  const stations = []
  const report = []

  for (const [id, target, limit] of BODIES) {
    let features
    try {
      features = parse(unzipFirst(await download(target)))
    } catch (error) {
      console.warn(`[features] ${target}: ${error.message}`)
      continue
    }

    /*
     * Largest first, and nothing cleverer — but the cap has to be generous,
     * because **fame is not size and nothing here can derive it**.
     *
     * Measured on the Moon: Tycho is the 310th largest crater and the 545th
     * largest feature of any kind; Copernicus is 226th and 425th; Kepler is
     * 1,120th and Aristarchus 941st. A tidy cap of ninety keeps neither Tycho
     * nor Copernicus, which is indefensible for a map of the Moon.
     *
     * An earlier draft rotated between feature types so that the biggest crater
     * appeared alongside the biggest sea. That helps at ninety and actively
     * hurts here: dividing six hundred slots between eighteen types gives
     * craters thirty-three, which is a worse answer than size alone.
     *
     * So the caps below are set where the famous large craters fall, and the
     * *drawing* decides what is legible — a feature is labelled only once it is
     * big enough on screen, so distance thins the list rather than a build
     * script guessing. Kepler and Aristarchus are genuinely absent: they are
     * 29 and 40 km, they rank in the thousands, and no size-ranked list of a
     * sane length contains them.
     */
    for (const f of features.filter((f) => isStation(f.type))) stations.push({ body: id, ...f })
    features = features.filter((f) => !isStation(f.type))

    features.sort((a, b) => b.diameter - a.diameter)
    const top = features.slice(0, limit)

    report.push(`${id} ${top.length}/${features.length}`)
    for (const f of top) kept.push({ body: id, ...f })
  }

  kept.sort((a, b) => (a.body === b.body ? b.diameter - a.diameter : a.body < b.body ? -1 : 1))
  stations.sort((a, b) => (a.name < b.name ? -1 : 1))

  const rows = kept
    .map(
      (f) =>
        `  {body:'${f.body}',name:${JSON.stringify(f.name)},lat:${round(f.latitude, 3)},lon:${round(
          f.longitude,
          3,
        )},km:${round(f.diameter, 1)},type:'${f.type}'},`,
    )
    .join('\n')

  writeFileSync(
    OUT,
    `/**
 * Named surface features — generated by \`scripts/fetch-surface-features.mjs\`.
 *
 * Do not edit by hand. Every name, coordinate and diameter is the IAU's, from
 * the USGS Gazetteer of Planetary Nomenclature, filtered to names actually
 * adopted and then to the largest few on each body — the gazetteer holds
 * fifteen thousand and a globe can carry a few dozen before it stops being a
 * map.
 *
 * \`lat\` is planetocentric degrees north and \`lon\` is degrees **east**, 0–360,
 * which is the convention \`scene/surface.js\` already places rovers with.
 *
 * ${kept.length} features across ${report.length} bodies.
 */

/**
 * @typedef {{
 *   body: string,
 *   name: string,
 *   lat: number,
 *   lon: number,
 *   km: number,
 *   type: string,
 * }} SurfaceFeature
 */

/** @type {SurfaceFeature[]} */
export const SURFACE_FEATURES = [
${rows}
]

/** id → its own features, largest first. */
export const FEATURES_BY_BODY = SURFACE_FEATURES.reduce((map, f) => {
  ;(map[f.body] ??= []).push(f)
  return map
}, {})

/**
 * The \`Statio\` entries: the landing sites the IAU has given names of their own.
 *
 * Held apart from the features above rather than drawn with them. They have no
 * diameter, so the size-ranked cap would drop every one; and \`landingSites.js\`
 * already names these same six places after the missions that made them, so
 * drawing both would put two labels on one spot.
 *
 * They are here to be checked against. That table is transcribed from mission
 * reports and cannot be derived from anything; these six rows come from the
 * gazetteer, and \`verify-landing-sites.mjs\` compares them.
 */
export const GAZETTEER_STATIONES = [
${stations
  .map(
    (f) =>
      `  {body:'${f.body}',name:${JSON.stringify(f.name)},lat:${round(f.latitude, 4)},lon:${round(
        f.longitude,
        4,
      )}},`,
  )
  .join('\n')}
]
`,
  )

  console.log(`[features] ${kept.length} kept, ${stations.length} stationes: ${report.join(', ')}`)
  console.log(`[features] wrote ${OUT}`)
}

main()
