#!/usr/bin/env node
/**
 * Bakes the eight principal phases of the Moon: a photograph and a fact for each.
 *
 * Run with:
 *     npm run fetch:moon-phases
 *
 * ## One series, not eight searches
 *
 * Every image here is from a single Goddard set, `GSFC_20171208_Archive_e0018*`,
 * shot at the same scale with the same framing. That matters more than usual: a
 * phase strip is a *comparison*, and eight pictures from eight sources — one
 * Cassini, one from the ISS, one taken through somebody's telescope — compare
 * their photographers rather than the Moon. The consecutive IDs are not a
 * coincidence; they are one sequence, and using it whole is what makes the row
 * read as one Moon changing rather than eight different Moons.
 *
 * NASA calls the 22-day phase "Third Quarter"; this app says "Last Quarter"
 * alongside it, since both are in common use and the one NASA prints is the one
 * that appears in the credit line.
 *
 * ## What is a fact and what is a phase
 *
 * `illumination` and `age` are *definitions* — the phase is defined by the
 * angle, so the numbers are exact by construction rather than measured. The
 * synodic month is 29.53059 days and the eight principal phases sit at even
 * eighths of it. Rise and set times are the idealised ones for an observer at
 * the equator: the real times shift with latitude and with the Moon's orbit,
 * and quoting them to the minute would be inventing precision. They are here
 * because "when can I actually see this?" is the question a phase list is for.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'images', 'phases')
const OUT = join(ROOT, 'src', 'data', 'moonPhases.js')
const EVENT_DIR = join(ROOT, 'public', 'images', 'events')

const SEARCH = 'https://images-api.nasa.gov/search'
const ASSET = 'https://images-api.nasa.gov/asset'
const log = (...a) => console.log('[moon-phases]', ...a)

/** The synodic month, in days — new Moon to new Moon. */
const SYNODIC_DAYS = 29.53059

const PHASES = [
  {
    id: 'new',
    name: 'New Moon',
    nasaId: 'GSFC_20171208_Archive_e001857',
    illumination: 0,
    rise: 'sunrise',
    set: 'sunset',
    note: 'Invisible. It is between us and the Sun, its lit face turned away, and it crosses the sky in daylight.',
  },
  {
    id: 'waxing-crescent',
    name: 'Waxing Crescent',
    nasaId: 'GSFC_20171208_Archive_e001864',
    illumination: 0.25,
    rise: 'mid-morning',
    set: 'after sunset',
    note: 'A thin sliver low in the west just after sunset. The dark part is often faintly visible — earthshine, sunlight reflected off our own planet.',
  },
  {
    id: 'first-quarter',
    name: 'First Quarter',
    nasaId: 'GSFC_20171208_Archive_e001863',
    illumination: 0.5,
    rise: 'noon',
    set: 'midnight',
    note: 'Half lit, and a quarter of the way round its orbit — which is where the name comes from, not from the shape.',
  },
  {
    id: 'waxing-gibbous',
    name: 'Waxing Gibbous',
    nasaId: 'GSFC_20171208_Archive_e001862',
    illumination: 0.75,
    rise: 'afternoon',
    set: 'before sunrise',
    note: 'More than half and still filling. Gibbous means humped — the terminator now bulges outward instead of cutting straight across.',
  },
  {
    id: 'full',
    name: 'Full Moon',
    nasaId: 'GSFC_20171208_Archive_e001861',
    illumination: 1,
    rise: 'sunset',
    set: 'sunrise',
    note: 'Opposite the Sun, so it rises as the Sun sets and is up all night. The craters look flattest now: the light comes from straight on and nothing casts a shadow.',
  },
  {
    id: 'waning-gibbous',
    name: 'Waning Gibbous',
    nasaId: 'GSFC_20171208_Archive_e001860',
    illumination: 0.75,
    rise: 'after sunset',
    set: 'mid-morning',
    note: 'Past full and shrinking from the other side. Rises later each night, which is why the late evening sky slowly empties of it.',
  },
  {
    id: 'last-quarter',
    name: 'Last Quarter',
    nasaId: 'GSFC_20171208_Archive_e001859',
    illumination: 0.5,
    rise: 'midnight',
    set: 'noon',
    note: 'Half lit again, but the other half — and it belongs to the morning sky. Also called the third quarter, which is what NASA titles this photograph.',
  },
  {
    id: 'waning-crescent',
    name: 'Waning Crescent',
    nasaId: 'GSFC_20171208_Archive_e001858',
    illumination: 0.25,
    rise: 'before sunrise',
    set: 'mid-afternoon',
    note: 'The last sliver, low in the east before dawn, thinning each morning until it is lost in the Sun.',
  },
]

/**
 * A photograph for each kind of special night, keyed by the `kind` that
 * `moonEvents` produces.
 *
 * These are photographs of *an* occurrence, not of the one being listed — the
 * 2028 blood Moon has obviously not been photographed yet — so the caption has
 * to say which one it was, and the panel prints the year. Showing a picture of
 * a 2025 eclipse beside a 2028 date without saying so would be the one dishonest
 * thing this section could do.
 *
 * Micromoon has no entry. NASA's library has no photograph captioned as one,
 * and pressing an ordinary full Moon into service as "the smallest of the year"
 * would be a caption doing work the picture cannot. It gets no image rather
 * than a misleading one.
 */
const EVENTS = {
  'blood-moon': ['GRC-2025-C-01605', 'Totality, photographed in March 2025'],
  'lunar-eclipse': ['GSFC_20171208_Archive_e001515', 'The umbra taking a bite out of one edge, April 2013'],
  supermoon: ['NHQ201712030002', 'A full Moon at perigee, December 2017'],
  'blue-moon': ['KSC-20240819-PH-JBS01_0012', 'The second full Moon of August 2024'],
}

async function json(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

const PREFERRED = ['~medium.jpg', '~small.jpg', '~large.jpg', '~orig.jpg']
const pick = (hrefs) =>
  PREFERRED.map((sfx) => hrefs.find((h) => h.toLowerCase().endsWith(sfx))).find(Boolean) ??
  hrefs.find((h) => /\.jpe?g$/i.test(h)) ??
  null

mkdirSync(OUT_DIR, { recursive: true })

const out = []
let bytes = 0
for (const [index, phase] of PHASES.entries()) {
  const found = await json(`${SEARCH}?nasa_id=${encodeURIComponent(phase.nasaId)}`)
  const meta = found.collection.items[0]?.data[0]
  if (!meta) throw new Error(`no such nasa_id: ${phase.nasaId}`)

  const assets = await json(`${ASSET}/${encodeURIComponent(phase.nasaId)}`)
  const href = pick(assets.collection.items.map((i) => i.href))
  if (!href) throw new Error(`no JPEG for ${phase.nasaId}`)

  const res = await fetch(href)
  if (!res.ok) throw new Error(`${res.status} fetching ${phase.nasaId}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const file = `${phase.id}.jpg`
  writeFileSync(join(OUT_DIR, file), buffer)
  bytes += buffer.length

  out.push({
    ...phase,
    file,
    /* Days since new Moon, at even eighths of the synodic month. */
    age: Number(((index * SYNODIC_DAYS) / 8).toFixed(2)),
    title: meta.title.replace(/\s+/g, ' ').trim(),
    credit: [meta.center, meta.secondary_creator].filter(Boolean).join(' · ') || 'NASA',
    source: `https://images.nasa.gov/details/${encodeURIComponent(phase.nasaId)}`,
  })
  log(`  ${phase.name.padEnd(17)} ${phase.nasaId.padEnd(30)} ${(buffer.length / 1024).toFixed(0)} KB  → "${meta.title}"`)
}

/* ---- and one picture for each kind of special night ---- */

mkdirSync(EVENT_DIR, { recursive: true })
const events = {}
for (const [kind, [nasaId, why]] of Object.entries(EVENTS)) {
  const found = await json(`${SEARCH}?nasa_id=${encodeURIComponent(nasaId)}`)
  const meta = found.collection.items[0]?.data[0]
  if (!meta) throw new Error(`no such nasa_id: ${nasaId}`)
  const assets = await json(`${ASSET}/${encodeURIComponent(nasaId)}`)
  const href = pick(assets.collection.items.map((i) => i.href))
  if (!href) throw new Error(`no JPEG for ${nasaId}`)
  const res = await fetch(href)
  if (!res.ok) throw new Error(`${res.status} fetching ${nasaId}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const file = `${kind}.jpg`
  writeFileSync(join(EVENT_DIR, file), buffer)
  bytes += buffer.length
  events[kind] = {
    file,
    nasaId,
    why,
    title: meta.title.replace(/\s+/g, ' ').trim(),
    credit: [meta.center, meta.secondary_creator].filter(Boolean).join(' · ') || 'NASA',
    /*
     * NASA's `date_created`, and it is **not** the date the photograph was
     * taken — for the Goddard archive items it is the date they were archived.
     * The partial eclipse here was shot on 25 April 2013 and reports 2017.
     *
     * So it is carried but never printed. The occurrence date the panel shows
     * comes from the `why` line above, which is written here against the
     * picture's own title and can therefore be right.
     */
    archived: meta.date_created?.slice(0, 4) ?? null,
    source: `https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`,
  }
  log(`  ${kind.padEnd(17)} ${nasaId.padEnd(30)} ${(buffer.length / 1024).toFixed(0)} KB  → "${meta.title}"`)
}

log(`\n${out.length} phases and ${Object.keys(events).length} event pictures, ${(bytes / 1024).toFixed(0)} KB`)

writeFileSync(
  OUT,
  `/**
 * The eight principal phases of the Moon.
 *
 * GENERATED by \`scripts/fetch-moon-phases.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:moon-phases\` instead. Generated ${new Date().toISOString().slice(0, 10)}.
 *
 * Photographs are one Goddard series, shot at the same scale and framing, so
 * the row compares the Moon rather than eight photographers. \`illumination\`
 * and \`age\` are exact by definition — a phase *is* an angle, and the principal
 * eight sit at even eighths of the ${SYNODIC_DAYS}-day synodic month. Rise and set
 * are idealised for the equator; see the script.
 */

/** New Moon to new Moon, in days. */
export const SYNODIC_DAYS = ${SYNODIC_DAYS}

export const MOON_PHASES = ${JSON.stringify(out, null, 2)}

/**
 * One photograph per kind of special night, keyed by \`moonEvents\`' \`kind\`.
 *
 * These show *an* occurrence, not the one being listed — a 2028 eclipse has not
 * happened yet — so \`year\` is carried and printed. There is no micromoon
 * entry: NASA has no photograph captioned as one, and an ordinary full Moon
 * relabelled would be a caption claiming what the picture cannot show.
 */
export const MOON_EVENT_IMAGES = ${JSON.stringify(events, null, 2)}
`,
)
log(`wrote ${OUT}`)
