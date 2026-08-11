#!/usr/bin/env node
/**
 * Bakes the spacecraft trajectories into `src/data/spacecraftData.js`.
 *
 * Run with:
 *     npm run fetch:spacecraft
 *
 * ## What is being fetched, and why it is not elements
 *
 * Every other body in this app is baked as six Keplerian elements and solved at
 * runtime. A spacecraft cannot be: it manoeuvres, and the point of a gravity
 * assist is that the orbit afterwards is not the orbit before. So this fetches
 * **positions** — one run of samples per segment of Eyes' `parents` list, each
 * in that segment's own reference frame — and `trajectory.js` interpolates
 * between them.
 *
 * ## Sampling density
 *
 * The step is chosen per segment rather than globally, because the segments
 * differ by six orders of magnitude in duration: Juno's Io flyby lasts under
 * four hours, Voyager 1's final heliocentric leg has been running for 44 years.
 *
 * A heliocentric cruise is a smooth conic and needs very little — Voyager 1's
 * whole 1977-2050 span is well described by monthly samples. A planet-centric
 * segment is the opposite: it holds the actual orbits, which is the part worth
 * looking at, so it gets a much finer step and a much higher point budget.
 *
 * This is a real compromise and worth stating plainly. Cassini spent 13 years
 * in orbit at Saturn and completed nearly 300 revolutions; no affordable
 * sampling reproduces every one. What the budget here buys is the shape and
 * extent of the tour — the craft is genuinely at Saturn, genuinely orbiting,
 * with revolutions of about the right size — not a rev-by-rev replay.
 *
 * ## The end of an open segment
 *
 * A craft still flying has no end date in Eyes' data, so the last segment runs
 * to `HORIZON_END`. Horizons will refuse anything past the end of the loaded
 * kernel, and the refusal names the date it can reach — so a rejected request
 * is retried against the span Horizons says it has, rather than being dropped
 * or guessed at.
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SPACECRAFT, HORIZONS_ID, FRAMES, FALLBACK, DEFAULT_FRAME } from './spacecraft-roster.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'data', 'spacecraftData.js')

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const J2000 = 2451545.0
const SECONDS_PER_DAY = 86400
const jdFromEt = (et) => J2000 + et / SECONDS_PER_DAY

/** How far a still-flying craft is carried forward. */
const HORIZON_END = '2050-01-01'

/**
 * Point budget and step bounds, by kind of frame.
 *
 * `target` is how many samples a segment gets if the bounds allow. `min` and
 * `max` are step sizes in days.
 */
/**
 * `target` is the sample count a segment gets when nothing else binds. `min`
 * and `max` bound the *step* in days. `cap` is a hard ceiling on the count.
 *
 * The cap is not belt-and-braces — without it `max` silently wins and blows the
 * budget wide open on long segments. The Lunar Reconnaissance Orbiter has been
 * in lunar orbit since 2009, which at the 4-day `max` step is 3702 samples, an
 * order of magnitude over target. And they buy nothing: LRO's orbital period is
 * two hours, so four-day sampling does not resolve a single revolution however
 * many points it takes. Where the step is already far coarser than the motion,
 * more samples only cost bytes.
 */
const BUDGET = {
  sun: { target: 320, min: 0.25, max: 30, cap: 900 },
  body: { target: 420, min: 0.002, max: 4, cap: 1200 },
}

/**
 * A Julian Date as a Horizons timestamp, **to the second**.
 *
 * Date granularity is not enough, and the failure it caused was not a rounding
 * error but a silent loss of the best moments in the data. Eyes' close-encounter
 * segments are *hours* long — Juno's Io flybys run under four hours, Huygens'
 * Titan descent about two and a half, New Horizons' Pluto pass a single day —
 * and truncating both ends of those to a date makes start equal stop. Horizons
 * answers "Bad dates -- start must be earlier than stop", and ten of the most
 * interesting segments in the whole roster were dropped: every one of Juno's
 * satellite flybys, Huygens at Titan, New Horizons at Pluto, Perseverance and
 * Opportunity at Mars.
 *
 * With seconds, those segments are a few hundred samples across a few hours,
 * which is what the frame handoffs are *for*.
 */
const jdToStamp = (jd) => new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 19).replace('T', ' ')

const jdToCal = (jd) => new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10)

async function horizons(params) {
  const url = new URL(API)
  url.searchParams.set('format', 'text')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    signal: AbortSignal.timeout(180000),
    headers: { 'user-agent': 'solar-explorer/1.0 (build script)' },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return await res.text()
}

/** Rows between $$SOE and $$EOE as [jd, x, y, z] in AU. */
function parseVectors(text) {
  const start = text.indexOf('$$SOE')
  const end = text.indexOf('$$EOE')
  if (start < 0 || end < 0) return null
  const rows = []
  for (const line of text.slice(start + 5, end).trim().split('\n')) {
    const parts = line.split(',')
    if (parts.length < 5) continue
    const jd = Number(parts[0])
    const x = Number(parts[2])
    const y = Number(parts[3])
    const z = Number(parts[4])
    if ([jd, x, y, z].some(Number.isNaN)) continue
    rows.push([jd, x, y, z])
  }
  return rows.length ? rows : null
}

/**
 * The span Horizons says it actually has, pulled out of its refusal.
 *
 * The message reads like "No ephemeris for target "X" after A.D. 2026-Sep-08
 * ..." or names a full "Trajectory files ... spans" range. Reading it is what
 * turns a hard failure into a shorter, correct request.
 */
const MONTHS = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
}

/**
 * Horizons' own date format, which is `1977-SEP-05` — and which `new Date()`
 * cannot read.
 *
 * This was the whole of the bug that dropped Voyager 1's launch segment. The
 * refusal said, correctly, "No ephemeris ... prior to A.D. 1977-SEP-05
 * 13:59:24" — Eyes' segment starts at launch and the kernel starts a few hours
 * later — but handing that string to `new Date()` produced an Invalid Date,
 * every comparison against it was false, the window was never pulled in, and
 * three identical retries later the segment was dropped. A parse that returns
 * a value for anything is worse than one that throws.
 */
function parseHorizonsDate(s) {
  const m = /^(\d{4})-([A-Za-z]{3})-(\d{2})$/.exec(s)
  if (!m) return null
  const month = MONTHS[m[2].toUpperCase()]
  if (month === undefined) return null
  return new Date(Date.UTC(Number(m[1]), month, Number(m[3])))
}

function coverageFrom(text) {
  const after = /after\s+A\.D\.\s+(\d{4}-\w{3}-\d{2})/.exec(text)
  const before = /prior to\s+A\.D\.\s+(\d{4}-\w{3}-\d{2})/.exec(text)
  return {
    end: after ? parseHorizonsDate(after[1]) : null,
    start: before ? parseHorizonsDate(before[1]) : null,
  }
}

/** A Date back to the second-granularity stamp Horizons is sent. */
const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')

/**
 * One of this script's own `YYYY-MM-DD HH:MM:SS` stamps as a UTC instant.
 *
 * Written out rather than handed to `new Date(s)` because that constructor
 * treats a bare `YYYY-MM-DD HH:MM:SS` as *local* time, which would shift every
 * coverage comparison by the machine's offset and make the clamping wrong by
 * hours in one direction or the other depending on who ran the script.
 */
const utc = (s) => new Date(`${s.replace(' ', 'T')}Z`)

async function fetchSegment(naif, center, startJd, stopJd, stepDays) {
  let start = jdToStamp(startJd)
  let stop = jdToStamp(stopJd)

  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await horizons({
      COMMAND: `'${naif}'`,
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'VECTORS',
      CENTER: `'${center}'`,
      REF_PLANE: 'ECLIPTIC',
      // Quoted, because these now carry a time and Horizons parses its
      // parameters as a control file: an unquoted space ends the value and the
      // rest becomes a stray token ("BATVAR: problem loading execution-control
      // setting"). The same rule already applies to STEP_SIZE below.
      START_TIME: `'${start}'`,
      STOP_TIME: `'${stop}'`,
      STEP_SIZE: `'${Math.max(1, Math.round((stopJd - startJd) / stepDays))}'`,
      VEC_TABLE: '1',
      OUT_UNITS: 'AU-D',
      CSV_FORMAT: 'YES',
    })

    const rows = parseVectors(text)
    if (rows) return rows

    const cover = coverageFrom(text)
    if (!cover.start && !cover.end) throw new Error(text.split('\n').filter((l) => l.trim()).slice(-3).join(' | ').slice(0, 200))
    // Pull the window in to what Horizons says it has and try again.
    //
    // `utc` rather than `new Date(...)` on a bare string for the same reason
    // `parseHorizonsDate` exists: "1977-09-05 UTC" is not a format the Date
    // constructor is required to accept, and where it does not, the comparison
    // below is false rather than throwing — so the window is never adjusted and
    // the retry re-sends the identical failing request.
    //
    // `<=`, not `<`. Horizons reports its coverage to the second — "prior to
    // A.D. 1977-SEP-05 13:59:24" — but only the date is parsed, and requests
    // are made at date granularity. Comparing 09-05 against 09-05 with `<` is
    // false, so the window was left exactly as it was and the retry re-sent the
    // identical failing request three times. Stepping a whole day clear of the
    // boundary is the only move that is guaranteed to be inside the kernel.
    //
    // Compared against the *whole day* either side rather than the parsed
    // instant. Only the date is read out of the refusal, so `cover.start` is
    // midnight — and a request that legitimately starts at 12:56 on that day is
    // not "before" midnight, so an instant comparison stops adjusting the
    // moment timestamps carry a time. That regression put Voyager 1 back to
    // five segments the first time the request gained seconds.
    if (cover.start) {
      const earliest = cover.start.getTime() + 86400000
      if (utc(start).getTime() < earliest) start = fmt(new Date(earliest))
    }
    if (cover.end) {
      const latest = cover.end.getTime() - 86400000
      if (utc(stop).getTime() > latest) stop = fmt(new Date(latest))
    }
    if (utc(stop) <= utc(start)) return null
  }
  return null
}

/**
 * Trim a number to the digits that matter, as a source-code literal.
 *
 * Eight significant figures, and *significant* is the operative word: these
 * samples span 1e-6 AU (a craft a few hundred km off a moon) to 1e2 AU
 * (Voyager 1 today), so a fixed number of decimal places would either destroy
 * the small ones or waste a dozen characters on the large ones. Eight
 * significant digits holds about a metre at 1 AU, which is far below anything
 * this app can draw, and costs roughly half of what the first pass spent.
 */
const num = (v) => String(Number(Number(v).toPrecision(8)))

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const out = []
  const skipped = []
  const failed = []
  let totalSamples = 0

  for (const craft of SPACECRAFT) {
    if (only.length && !only.includes(craft.id)) continue
    const naif = HORIZONS_ID[craft.id]
    if (naif == null) {
      skipped.push({ name: craft.name, why: 'no Horizons ephemeris' })
      continue
    }

    /*
     * Sorted by time before anything else is done with it.
     *
     * Eyes' `parents` arrays are **not guaranteed to be in chronological
     * order**. NEAR's runs 1996-02-17, 1998-01-20, 1998-01-27, then jumps back
     * to 1997-06-26 for the Mathilde flyby before going forward again — the
     * list is grouped by encounter, not sorted by clock.
     *
     * Taking `segments[i + 1]` as the end of segment `i` without sorting gives
     * that segment a stop date eight months *before* its start, so it is
     * silently dropped and the two neighbours around it overlap by 215 days.
     * The structural verifier's handoff check is what surfaced it; on screen it
     * would have been a craft in two places at once for part of 1997.
     */
    const ordered = [...craft.segments].sort((a, b) => a[0] - b[0])

    const segments = []
    for (let i = 0; i < ordered.length; i++) {
      const [etStart, frame] = ordered[i]
      if (frame === '') break // terminal marker: the mission ends here

      const next = ordered[i + 1]
      const startJd = jdFromEt(etStart)
      const stopJd = next
        ? jdFromEt(next[0])
        : (new Date(`${HORIZON_END} UTC`).getTime() / 86400000) + 2440587.5

      if (!(stopJd > startJd)) continue

      const resolved = FRAMES[frame] ?? FRAMES[FALLBACK[frame] ?? DEFAULT_FRAME] ?? FRAMES[DEFAULT_FRAME]
      const budget = resolved.body === 'sun' ? BUDGET.sun : BUDGET.body
      const span = stopJd - startJd
      // The cap is applied last so it wins over `max`, which is the whole point.
      const step = Math.max(
        Math.min(Math.max(span / budget.target, budget.min), budget.max),
        span / budget.cap,
      )

      let rows
      try {
        rows = await fetchSegment(naif, resolved.horizons, startJd, stopJd, step)
      } catch (error) {
        failed.push({ name: craft.name, frame, message: error.message })
        continue
      }
      if (!rows || rows.length < 2) {
        // Never silent. The first run dropped Voyager 1's launch segment
        // without a word, and a missing segment reads on screen as a craft that
        // simply appears in deep space rather than as an error.
        failed.push({ name: craft.name, frame, message: `no samples in ${jdToCal(startJd)}..${jdToCal(stopJd)}` })
        continue
      }

      // Re-derive the step from what came back: Horizons rounds the count, and
      // `trajectory.js` indexes by a uniform step, so the two must agree
      // exactly or every position drifts along the path.
      const t0 = rows[0][0]
      const t1 = rows[rows.length - 1][0]
      const realStep = (t1 - t0) / (rows.length - 1)

      const flat = []
      for (const [, x, y, z] of rows) flat.push(x, y, z)
      totalSamples += rows.length

      segments.push({ frame: resolved.body, t0, t1, step: realStep, samples: flat })
      process.stderr.write(`  ${craft.name} / ${frame} -> ${resolved.body}: ${rows.length} pts\n`)
    }

    if (!segments.length) {
      failed.push({ name: craft.name, message: 'no usable segments' })
      continue
    }
    out.push({ ...craft, naif, segments })
    console.log(`[sc] ${craft.name}: ${segments.length} segments, ${segments.reduce((n, s) => n + s.samples.length / 3, 0)} samples`)
  }

  const body = out
    .map((c) => {
      const segs = c.segments
        .map(
          (s) =>
            // Times are written at **full** precision, deliberately not through
            // `num`. Eight significant figures is right for a position in AU
            // and catastrophic for a Julian Date: JD 2459872.9082 needs eleven
            // digits, so `num` rounded it to 2459872.9 and put a twelve-minute
            // error into every segment boundary and every step. It was
            // invisible on screen and the structural verifier caught it — the
            // stored `t1` no longer equalled `t0 + step * (n - 1)`, which is an
            // identity the fetch constructs and so can only fail through
            // rounding.
            `    { frame: '${s.frame}', t0: ${s.t0}, t1: ${s.t1}, step: ${s.step},\n` +
            `      samples: [${s.samples.map(num).join(',')}] },`,
        )
        .join('\n')
      return (
        `  { id: '${c.id}', name: ${JSON.stringify(c.name).replace(/"/g, "'")}, group: '${c.group}', ` +
        `radiusKm: ${c.radiusKm}, naif: ${c.naif},\n` +
        `    model: ${c.model ? `'${c.model}'` : 'null'},\n    segments: [\n${segs}\n    ] },`
      )
    })
    .join('\n')

  writeFileSync(
    OUT,
    `/**\n * Generated by \`npm run fetch:spacecraft\`. Do not edit by hand.\n *\n` +
      ` * ${out.length} spacecraft, ${totalSamples} position samples, from JPL Horizons.\n` +
      ` * Positions are AU in the J2000 ecliptic frame, relative to each segment's\n` +
      ` * own \`frame\` body. See \`src/orbit/trajectory.js\`.\n */\n\n` +
      `export const SPACECRAFT_RAW = [\n${body}\n]\n`,
  )

  console.log(`\n[sc] wrote ${out.length} craft, ${totalSamples} samples -> src/data/spacecraftData.js`)
  if (skipped.length) {
    console.log(`\n[sc] ${skipped.length} skipped (no Horizons ephemeris):`)
    for (const s of skipped) console.log(`[sc]   ${s.name}`)
  }
  if (failed.length) {
    console.log(`\n[sc] ${failed.length} problems:`)
    for (const f of failed) console.log(`[sc]   ${f.name} ${f.frame ?? ''}: ${f.message}`)
  }
}

main().catch((error) => {
  console.error(`[sc] ${error.message}`)
  process.exitCode = 1
})
