#!/usr/bin/env node
/**
 * Bakes the real sky into `src/data/stars.js`.
 *
 * Run with:
 *     npm run fetch:stars
 *
 * ## Why a catalogue at all
 *
 * The starfield this replaces was procedural: points scattered on a sphere with
 * colours drawn down the black-body curve. As a backdrop it was convincing, and
 * as a sky it was a lie — Orion was not in it, nothing was where it is, and the
 * moment the app started claiming to be *at* Mars looking back, the difference
 * between a sky and some stars became the difference between a view and a
 * decoration.
 *
 * ## The two sources
 *
 * **Stars: the HYG database v4.0** (`astronexus/HYG-Database`, CC BY-SA 4.0), a
 * merge of Hipparcos, Yale Bright Star and Gliese. Cut at magnitude 6.5, which
 * is the naked-eye limit under a dark sky and comes to 8,920 stars — the sky a
 * person could actually see, rather than the 119,614 rows of the full file, most
 * of which would be drawn at a brightness indistinguishable from black.
 *
 * **Figures: Stellarium's modern skyculture** (`skycultures/modern/index.json`,
 * GPL-2), whose 88 constellations are polylines of **HIP numbers** rather than
 * coordinates. That is the property worth having: the lines are drawn through
 * catalogue stars, so a figure cannot drift away from the stars it is supposed
 * to connect, and the check for it is structural rather than geometric.
 *
 * ## What was not used, and why
 *
 * Eyes ships its own sky as three undocumented binaries, and
 * `stars/constellations.bin` decodes cleanly — u8 name length, name, a 4-byte
 * magic, u8 point count, that many `float32[3]`, u8 segment count, that many
 * `u8[2]` index pairs. It parses to the exact byte: 88 figures, 694 points, 673
 * segments, no index out of range, and the point magnitudes run to 3.0857e20 m,
 * which is 10 kpc — distances in metres, clamped.
 *
 * What could not be recovered is the frame. The directions are some rotation of
 * one: the best signed axis permutation still leaves Orion's centroid 20° from
 * Orion, and neither the ecliptic nor the equatorial reading of it is right. A
 * catalogue with published coordinates is a better answer than a rotation
 * reverse-engineered by fitting, so the binary is left where it is.
 *
 * ## Coordinates
 *
 * HYG gives J2000 equatorial RA (hours) and declination (degrees), and this
 * writes exactly that, converted to degrees. The rotation into the app's world
 * frame belongs in the app — through the 23.4393° obliquity to the ecliptic and
 * then `eclipticToWorld` — because that is where it can be checked against the
 * bodies, which are in the same frame and were solved separately.
 *
 * Proper motion is ignored. It is a few tens of milliarcseconds a year for all
 * but a handful of stars; over the app's two-century timeline the largest mover
 * in the sky (Barnard's Star, 10.3"/yr, and too faint to be here anyway) would
 * shift by half a degree, and the naked-eye stars by far less than a pixel.
 *
 * ## Distance, and why it is now written
 *
 * The app used to need two angles and nothing else: the sky was a dome, every
 * star was equally far away, and a distance would have been an unused column.
 * Zooming out to the Galaxy makes it the load-bearing number. A dome cannot
 * dissolve — leave the solar system and it follows you forever — and the whole
 * point of the outward journey is that Orion stops being a shape, which only
 * happens if Betelgeuse (168 pc) and Rigel (264 pc) are genuinely at different
 * distances along their two directions.
 *
 * HYG's `dist` is parsecs from parallax, so it costs nothing to carry: the
 * fetch already parses the row.
 *
 * **206 of the 8,920 have no usable parallax**, and HYG marks them by parking
 * `dist` at 100,000 pc — which is outside the Galaxy, four times further than
 * anything this app draws, and it poisons `absmag` with it (every one of them
 * comes out near -14, brighter than any star that exists). They are written as
 * `0`, meaning *unknown*, rather than as any number that could be mistaken for
 * a measurement. `Starfield` keeps them in the sky, where they genuinely are,
 * and declines to fly past them — see its `UNKNOWN_DISTANCE`.
 */

import { writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'data', 'stars.js')

const HYG =
  'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v40.csv.gz'
const STELLARIUM =
  'https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/index.json'

/**
 * The naked-eye limit, and the whole editorial decision in one number.
 *
 * 6.5 is the conventional threshold for what an unaided eye resolves under a
 * dark sky. Going fainter does not add sky, it adds points below the brightness
 * the renderer can distinguish from the background; going brighter starts
 * deleting stars people know by name.
 */
const MAG_LIMIT = 6.5

const log = (...args) => console.log('[stars]', ...args)

async function get(url, { binary = false } = {}) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return binary ? Buffer.from(await res.arrayBuffer()) : res.text()
}

/** Splits a CSV line, honouring double quotes. HYG quotes its text columns. */
function splitCSV(line) {
  const out = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(field)
      field = ''
    } else field += c
  }
  out.push(field)
  return out
}

const round = (v, places) => Number(v.toFixed(places))

/**
 * HYG's "no usable parallax" marker.
 *
 * Not a documented constant — it is what the file contains where a distance
 * could not be computed, and it is a literal 100000.0 rather than a blank, so a
 * naive read gets a number and no warning. Compared with `>=` because a handful
 * of rows carry a hair more after their own round trip through the catalogue.
 */
const HYG_NO_PARALLAX = 100000

/**
 * Distances span 1.3 pc to 980 pc, so a fixed number of decimal places is
 * either wasteful at the far end or lossy at the near one. Four significant
 * figures is 0.03% everywhere, far finer than the parallaxes themselves.
 */
const significant = (v, digits) => Number(v.toPrecision(digits))

log('fetching HYG v4.0 …')
const csv = gunzipSync(await get(HYG, { binary: true })).toString('utf8')
const rows = csv.split('\n')
const columns = splitCSV(rows[0])
const at = Object.fromEntries(columns.map((c, i) => [c, i]))
log(`${rows.length - 1} catalogue rows`)

log('fetching Stellarium’s modern skyculture …')
const sky = JSON.parse(await get(STELLARIUM))
const figures = sky.constellations
log(`${figures.length} constellations`)

/** Every HIP a figure draws through, so a faint one is kept whatever its magnitude. */
const wanted = new Set()
for (const figure of figures) for (const line of figure.lines) for (const hip of line) wanted.add(hip)
log(`${wanted.size} stars are used by a figure`)

/*
 * The Sun is row 0 of HYG and is not a star in the sky — it is the thing at the
 * centre of the scene, already drawn, and at magnitude -26.7 it would otherwise
 * be baked into the backdrop as a point of light in Pisces.
 */
const stars = []
const byHIP = new Map()
for (let i = 1; i < rows.length; i++) {
  const f = splitCSV(rows[i])
  if (f.length < columns.length) continue
  if (f[at.id] === '0') continue

  const mag = Number(f[at.mag])
  const hip = f[at.hip] ? Number(f[at.hip]) : null
  if (!Number.isFinite(mag)) continue
  if (mag > MAG_LIMIT && !(hip !== null && wanted.has(hip))) continue

  const star = {
    // HYG's RA is in hours, which is how catalogues are written and not how
    // anything is computed. Degrees from here on.
    ra: round(Number(f[at.ra]) * 15, 4),
    dec: round(Number(f[at.dec]), 4),
    mag: round(mag, 2),
    // B-V colour index. Missing for forty of them — all faint, none named — and
    // 0.65 is the Sun's, so an unmeasured star comes out as an ordinary yellow
    // one rather than as the blue that a zero would make it.
    ci: f[at.ci] === '' ? 0.65 : round(Number(f[at.ci]), 3),
    /*
     * What a dossier needs, kept only for the stars that will get one.
     *
     * `spect` is the MK spectral type as HYG has it — "A1Vm", "M2Iab" — which
     * is the single most informative string about a star there is: temperature
     * class, then luminosity class. `bayer` and `flam` are the Greek letter and
     * the Flamsteed number, and `con` the three-letter constellation, so a star
     * can be named the way a sky map names it (Alpha Canis Majoris) as well as
     * by its proper name. `lum` is luminosity in Suns.
     */
    spect: f[at.spect] || null,
    bayer: f[at.bayer] || null,
    flam: f[at.flam] ? Number(f[at.flam]) : null,
    con: f[at.con] || null,
    lum: f[at.lum] ? Number(f[at.lum]) : null,
    // Parsecs, or 0 for the 206 with no usable parallax. See the header.
    dist: (() => {
      const d = Number(f[at.dist])
      if (!Number.isFinite(d) || d <= 0 || d >= HYG_NO_PARALLAX) return 0
      return significant(d, 4)
    })(),
    proper: f[at.proper] || null,
    hip,
  }
  stars.push(star)
  if (hip !== null) byHIP.set(hip, star)
}

// Brightest first, so the array's own order is a level of detail: the first
// thousand entries are the sky anyone could name.
stars.sort((a, b) => a.mag - b.mag)
stars.forEach((s, i) => {
  s.index = i
})

log(`${stars.length} stars kept to magnitude ${MAG_LIMIT}`)
log(`brightest: ${stars[0].proper} at ${stars[0].mag}`)

const withDistance = stars.filter((s) => s.dist > 0)
const spans = withDistance.map((s) => s.dist).sort((a, b) => a - b)
log(
  `${withDistance.length} have a parallax: ${spans[0]} pc to ${spans[spans.length - 1]} pc, ` +
    `median ${spans[Math.floor(spans.length / 2)]} pc`,
)
log(`${stars.length - withDistance.length} have none and are written as distance 0`)

/*
 * Figures resolved to indices at bake time rather than HIP numbers at run time.
 *
 * The app then has no star-lookup table at all, and "a line ends on a drawn
 * star" stops being a thing to verify — an index either points at a star or the
 * file does not build.
 */
const missing = []
const constellations = figures
  .map((figure) => {
    const segments = []
    for (const line of figure.lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = byHIP.get(line[i])
        const b = byHIP.get(line[i + 1])
        if (!a || !b) {
          missing.push(`${figure.common_name.native}: HIP ${!a ? line[i] : line[i + 1]}`)
          continue
        }
        segments.push([a.index, b.index])
      }
    }
    return {
      name: figure.common_name.native,
      english: figure.common_name.byname ?? figure.common_name.english,
      segments,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

if (missing.length) log(`${missing.length} figure endpoints missing from HYG:`, missing.join(', '))
const segmentCount = constellations.reduce((n, c) => n + c.segments.length, 0)
log(`${constellations.length} figures, ${segmentCount} segments`)

/**
 * Which stars get a dossier.
 *
 * Everything with a proper name, plus everything brighter than third magnitude
 * — the two together are "the stars anyone could point at". A name alone is not
 * the right cut: HYG carries proper names for some genuinely obscure stars, and
 * misses none of the bright ones, so the union is what a person would expect to
 * be able to click on and be told about.
 *
 * The other 8,500 stay as points. They are real and they are drawn and they
 * have positions; what they do not have is anything to say.
 */
const FACT_MAGNITUDE = 3.0
const facts = stars.filter((s) => s.proper || s.mag <= FACT_MAGNITUDE)

const named = stars.filter((s) => s.proper)
log(`${named.length} stars carry a proper name`)
log(`${facts.length} get a dossier (named, or brighter than magnitude ${FACT_MAGNITUDE})`)

const today = new Date().toISOString().slice(0, 10)

const body = `/**
 * The sky: ${stars.length.toLocaleString('en-US')} naked-eye stars and the ${constellations.length} IAU constellation figures.
 *
 * GENERATED by \`scripts/fetch-stars.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:stars\` instead. Generated ${today}.
 *
 * Stars are the HYG database v4.0 (CC BY-SA 4.0), cut at magnitude ${MAG_LIMIT} — the
 * naked-eye limit. Figures are Stellarium's modern skyculture (GPL-2), whose
 * lines are given as HIP numbers and are resolved here to indices into \`STARS\`,
 * so a figure can only ever connect stars this file also draws.
 *
 * \`STARS\` is ordered brightest first, which makes its own order a level of
 * detail: the first thousand entries are the sky anyone could name.
 *
 * Each star is \`[rightAscension, declination, magnitude, colourIndex,
 * distance]\` — degrees for the two angles, J2000 equatorial, and **parsecs**
 * for the distance. The rotation into the app's world frame lives in
 * \`src/scene/sky.js\`, next to the obliquity it needs.
 *
 * A distance of **0 means unknown**: ${stars.length - withDistance.length} of these stars have no usable
 * parallax in HYG, and zero is used rather than the 100,000 pc the catalogue
 * parks them at, which is outside the Galaxy and would be read as a
 * measurement. The other ${withDistance.length} run from ${spans[0]} pc to ${spans[spans.length - 1]} pc.
 */

/** @type {[number, number, number, number, number][]} */
export const STARS = [
${stars.map((s) => `  [${s.ra}, ${s.dec}, ${s.mag}, ${s.ci}, ${s.dist}],`).join('\n')}
]

/**
 * The ${named.length} stars with a proper name, as \`[index, name]\`.
 *
 * Kept apart from \`STARS\` rather than as a fifth column, because it is a label
 * table for a few hundred stars and would otherwise put ${stars.length - named.length} nulls in the
 * hot array.
 */
export const STAR_NAMES = [
${named.map((s) => `  [${s.index}, ${JSON.stringify(s.proper)}],`).join('\n')}
]

/**
 * The 88 figures, alphabetical, each a flat list of index pairs into \`STARS\`.
 *
 * The Latin name is the one drawn — it is what a sky map says and what Eyes
 * says — with the English kept beside it for the dossier.
 */
/**
 * The ${facts.length} stars worth a dossier, as
 * \`[index, spectralType, bayer, flamsteed, constellation, luminosity]\`.
 *
 * Indices point into \`STARS\`; the proper name, where there is one, is in
 * \`STAR_NAMES\`. Luminosity is in Suns, and is null where HYG has none.
 *
 * \`spect\` is the MK type as the catalogue has it — "A1Vm", "M2Iab" — which is
 * the most informative string about a star there is: temperature class, then
 * luminosity class. Together with \`bayer\` and \`con\` a star can be named the
 * way a sky map names it, Alpha Canis Majoris, as well as by the name people
 * use.
 */
export const STAR_FACTS = [
${facts
  .map(
    (s) =>
      `  [${s.index}, ${JSON.stringify(s.spect)}, ${JSON.stringify(s.bayer)}, ` +
      `${s.flam ?? 'null'}, ${JSON.stringify(s.con)}, ` +
      `${s.lum === null || !Number.isFinite(s.lum) ? 'null' : significant(s.lum, 4)}],`,
  )
  .join('\n')}
]

export const CONSTELLATIONS = [
${constellations
  .map(
    (c) =>
      `  {\n    name: ${JSON.stringify(c.name)},\n    english: ${JSON.stringify(c.english)},\n` +
      `    segments: [${c.segments.map(([a, b]) => `${a}, ${b}`).join(', ')}],\n  },`,
  )
  .join('\n')}
]
`

writeFileSync(OUT, body)
log(`wrote ${OUT} (${(body.length / 1024).toFixed(0)} KB)`)
