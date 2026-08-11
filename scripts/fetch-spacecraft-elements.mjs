#!/usr/bin/env node
/**
 * Bakes osculating orbital elements for the craft whose orbits samples cannot
 * describe.
 *
 * Run with:
 *     node scripts/fetch-spacecraft-elements.mjs
 *
 * ## Why these craft cannot be sampled positions
 *
 * Every other spacecraft in this app is a run of baked position samples, and
 * that works because its path is something you can decimate: a cruise between
 * planets is smooth over days. A Mars or Moon orbiter is not. LRO goes round the
 * Moon in about two hours, and its Horizons segment spans eighteen years —
 * sampling that finely enough to resolve one revolution needs 3.4 million points
 * for one craft, and 21 million across the five. That is not a longer fetch, it
 * is a different data structure.
 *
 * An eccentric orbit defeats sampling for the opposite reason. Juno's period is
 * 33 days against a 1.4-day step, so it is not undersampled on average at all —
 * but at e = 0.98 nearly every sample lands in the slow apojove arc and the
 * craft crosses the rest of the orbit between two of them. See
 * `MAX_SAMPLE_TURN`, which is the half of the admission rule that sees this.
 *
 * Two things were visibly wrong as a result. The trail, which Eyes draws as one
 * revolution, fell entirely between two stored samples and drew nothing at all.
 * And the *position* was wrong by 11,000-15,000 km, because interpolating across
 * a 6-day step on a 2-hour orbit is not interpolation, it is aliasing — the
 * craft was drawn nowhere near its own orbit.
 *
 * ## Why elements work where samples do not
 *
 * These are stable, near-circular orbits. The *shape* — a, e, i, node, argument
 * of periapsis — changes over weeks and months, not hours, so it decimates
 * beautifully: a weekly epoch is plenty. Only the phase moves fast, and the
 * phase is exactly what a mean motion is for. So a thousand element sets per
 * craft replace three million positions, and give a better answer.
 *
 * Elements come from Horizons' own ELEMENTS ephemeris rather than being fitted
 * from the vectors, so there is no fitting error to reason about.
 *
 * ## The one place this is delicate
 *
 * Mean anomaly at a weekly cadence is aliased just as badly as position was —
 * LRO turns about eighty-four times between epochs. It is never interpolated.
 * Each epoch carries its own mean motion and the phase is *propagated* from
 * there, which is exact by construction. See `elementsAtEpoch` in
 * `spacecraftElements.js` for how the two ends of an interval are blended so
 * there is no jump where one epoch hands over to the next.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SPACECRAFT_RAW } from '../src/data/spacecraftData.js'
import { SPACECRAFT_TRAILS } from '../src/data/spacecraftTrails.js'
import { BODIES_BY_ID } from '../src/data/bodies.js'
import { HORIZONS_ID, FRAMES } from './spacecraft-roster.mjs'
import { segmentAt, trailDays } from '../src/orbit/trajectory.js'
import { elementPositionAt } from '../src/orbit/spacecraftElements.js'

const KM_PER_AU = 149597870.7

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'src', 'data', 'spacecraftElements.js')

/**
 * One epoch every three and a half days.
 *
 * A week was the first choice and it is the right cadence for the *shape* — over
 * a week LRO's semi-major axis moves well under a kilometre and its node a
 * fraction of a degree, far below anything the renderer can show.
 *
 * Halved for the *phase*. `elementsAtEpoch` recovers the whole number of
 * revolutions between two epochs from the stored mean motion, and that inference
 * has to be right to within half a revolution. At a week LRO makes about ninety
 * turns between epochs, so the mean motion would have to be good to half a
 * percent, and these craft do real orbit maintenance — MRO's drifts by more than
 * that. Halving the interval halves the turns and doubles the margin, for
 * twelve thousand epochs across the five craft, which is still nothing beside
 * the twenty-one million samples the alternative needed.
 */
const STEP_DAYS = 3.5

const stamp = (jd) =>
  new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 19).replace('T', ' ')

/**
 * The instant Horizons says its own ephemeris stops, out of a refusal.
 *
 * A trajectory segment runs to wherever Eyes says the mission ends, and that is
 * not a promise about how far JPL has propagated the craft. Mars Odyssey's
 * segment reaches into 2027; Horizons currently answers
 *
 *     No ephemeris for target "Mars Odyssey (spacecraft)" after
 *     A.D. 2026-NOV-03 00:00:00.0000 TDB
 *
 * and refuses the *whole* request rather than returning the part it has. So the
 * craft came back with nothing at all and dropped out of the table — which cost
 * it its elements, and with them the only usable path it has, since its 1.87-hour
 * orbit against a 7.63-day sample step aliases to nothing.
 *
 * Returns a Julian Date to clamp to, or null when the refusal is about something
 * else. `prior to` is the mirror case, for a craft asked about before launch.
 */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function ephemerisLimit(text) {
  const match = /No ephemeris for target .* (after|prior to) A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text)
  if (!match) return null
  const [, side, year, mon, day, hh, mm, ss] = match
  const month = MONTHS.indexOf(mon)
  if (month < 0) return null
  const ms = Date.UTC(+year, month, +day, +hh, +mm, +ss)
  return { side, jd: ms / 86400000 + 2440587.5 }
}

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

/**
 * Horizons' ELEMENTS CSV, as `[jd, a, e, i, node, argp, M, n]`.
 *
 * Column order is fixed by Horizons and documented in the header it emits:
 *
 *     JDTDB, Calendar, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
 *       0        1      2   3   4   5   6   7  8   9  10  11  12  13
 *
 * Angles in degrees, `A` in AU, `N` in degrees per day — the `AU-D` output
 * units. Semi-major axis is read from `A` rather than derived from `QR` and
 * `EC`, because Horizons already did that arithmetic correctly.
 */
function parseElements(text) {
  const start = text.indexOf('$$SOE')
  const end = text.indexOf('$$EOE')
  if (start < 0 || end < 0) return null
  const rows = []
  for (const line of text.slice(start + 5, end).trim().split('\n')) {
    const p = line.split(',')
    if (p.length < 14) continue
    const row = [
      Number(p[0]), // JDTDB
      Number(p[11]), // A
      Number(p[2]), // EC
      Number(p[4]), // IN
      Number(p[5]), // OM
      Number(p[6]), // W
      Number(p[9]), // MA
      Number(p[8]), // N
    ]
    if (row.some(Number.isNaN)) continue
    rows.push(row)
  }
  return rows.length ? rows : null
}

/**
 * The frame body's radius in AU, which `closedRun` uses as the floor an orbit
 * has to clear.
 *
 * The Sun is spelled out because it is not in `BODIES_BY_ID` — the star is
 * built by `frames.js` from its own constants rather than being a body in the
 * registry, so reading its radius from there returns undefined and divides to
 * NaN, and every comparison against NaN is false. That fails *open*: a
 * heliocentric craft would sail through the ground check no matter where it
 * was, which happens to be harmless here and would not be the next time.
 */
function frameRadiusAU(frame) {
  const km = frame === 'sun' ? 696340 : BODIES_BY_ID[frame]?.radiusKm
  if (!km) throw new Error(`no radius for frame ${frame}`)
  return km / KM_PER_AU
}

/** The Horizons center for one of our frame body ids. */
function centerFor(bodyId) {
  for (const f of Object.values(FRAMES)) if (f.body === bodyId) return f.horizons
  return null
}

/**
 * Which craft to *ask* about — deliberately wider than the answer.
 *
 * Every craft in a body's frame right now is a candidate, and whether it
 * actually needs elements is decided after Horizons has answered, from the
 * orbital period it reports. That ordering matters and cost two wrong rosters to
 * arrive at.
 *
 * Deciding beforehand needs a period, and every way of getting one from the
 * baked samples is circular, because the samples are the thing under suspicion.
 * Differentiating them gave Danuri, in a two-hour lunar orbit, a 41-day trail.
 * Measuring how far the craft swings between samples looks independent but is
 * not: Danuri's step is 1.255 days and its period 2.01 hours, almost exactly
 * fifteen revolutions, so consecutive samples land on nearly the same point of
 * the orbit and the path looks perfectly smooth while being nothing of the kind.
 * Aliasing hides from every test run on the aliased data.
 *
 * Horizons knows the period. Ask it, then decide.
 */
/**
 * The instant a craft is asked about, and the leg it is asked about at.
 *
 * For a craft still flying that is today, and the segment it is on — which is
 * what this script always did, back when every craft on the roster was still
 * somewhere.
 *
 * A mission that has ended has no "now", and picking one badly picks the wrong
 * question: Cassini has nine segments, and asking about it at launch gets the
 * heliocentric cruise to Saturn rather than the thirteen years in orbit around
 * it. So a finished craft is asked about at the **middle of its longest leg in a
 * body's frame** — Cassini's Saturn tour of 2004-2017, Galileo's eight years at
 * Jupiter, MESSENGER at Mercury, Dawn at Ceres. That is the orbital phase in
 * every case, because a tour outlasts the flybys around it.
 *
 * Where a craft has no real orbital phase the rule still picks something — a
 * thirteen-day gravity-assist leg for Rosetta at the Earth, four days for
 * Spitzer — and `closedRun` throws those out for not being closed orbits, which
 * is the correct answer arrived at honestly rather than by not asking.
 */
function referenceEpochs(craft, today) {
  const live = segmentAt(craft, today)
  if (live) return [{ segment: live, epoch: today }]

  /*
   * Every leg in a body's frame, longest first, and the caller stops at the
   * first that yields a table.
   *
   * Longest-only would be enough if the longest always worked, and it does not:
   * Dawn's longest is its three years at Ceres, and Horizons will not give
   * elements about Ceres at all — "Required masses not defined, osculating
   * elements not available", because there is no GM for it in that context. A
   * single-candidate rule turns that into no Dawn, when its sixteen months at
   * Vesta are right there.
   *
   * The extra fetches are only paid by craft that fail, since a success stops
   * the search: Cassini asks about Saturn and is done.
   */
  return craft.segments
    .filter((s) => s.frame !== 'sun')
    .sort((a, b) => b.t1 - b.t0 - (a.t1 - a.t0))
    .map((segment) => ({ segment, epoch: (segment.t0 + segment.t1) / 2 }))
}

function candidates(today) {
  const out = []
  for (const craft of SPACECRAFT_RAW) {
    for (const { segment, epoch } of referenceEpochs(craft, today)) {
    if (segment.samples.length / 3 < 3) continue

    /*
     * Heliocentric craft are asked about only when their samples visibly fail.
     *
     * In a body's frame the ask is unconditional, because aliasing hides from
     * every test run on the aliased data and only Horizons' period exposes it.
     * The Sun's frame cannot hide it. Aliasing needs an orbital period near or
     * below the sampling step, and the shortest heliocentric period any
     * spacecraft has ever had is Parker's eighty-eight days against a step of
     * eleven. There is no room for a hidden revolution, so the visible turn is
     * the whole story and the ones that turn smoothly genuinely are smooth.
     *
     * Which matters, because asking unconditionally would drag every cruise in
     * the roster through a full-span ELEMENTS fetch to be thrown away — the
     * escaping craft are on hyperbolas and get rejected as unclosed anyway.
     */
    if (segment.frame === 'sun' && worstTurn(craft, segment, epoch) <= MAX_SAMPLE_TURN) continue

    out.push({ craft, segment, epoch })
    }
  }
  return out
}

/**
 * The sharpest corner the baked samples take inside the craft's own trail
 * window, in degrees.
 *
 * This is the number the ribbon inherits. `SpacecraftPath` redistributes 256
 * points evenly along the window, so it can smooth out where the samples are
 * *spaced* but can never recover a corner the data does not contain — a
 * hundred-degree turn between two samples is a hundred-degree corner on screen
 * no matter how the points in between are arranged. Measured over the trail
 * window rather than the whole segment because that is the stretch actually
 * drawn; a cruise sampled monthly has sharp corners at encounters decades ago.
 */
function worstTurn(craft, segment, jd) {
  const count = segment.samples.length / 3
  const days = trailDays(craft, jd, SPACECRAFT_TRAILS[craft.id]) ?? 30
  const lo = Math.max(0, Math.floor((jd - days - segment.t0) / segment.step))
  const hi = Math.min(count - 1, Math.ceil((jd - segment.t0) / segment.step))

  const at = (i, k) => segment.samples[i * 3 + k]
  let worst = 0
  for (let i = lo + 1; i < hi; i++) {
    const ux = at(i, 0) - at(i - 1, 0)
    const uy = at(i, 1) - at(i - 1, 1)
    const uz = at(i, 2) - at(i - 1, 2)
    const vx = at(i + 1, 0) - at(i, 0)
    const vy = at(i + 1, 1) - at(i, 1)
    const vz = at(i + 1, 2) - at(i, 2)
    const nu = Math.hypot(ux, uy, uz)
    const nv = Math.hypot(vx, vy, vz)
    if (!nu || !nv) continue
    const cos = (ux * vx + uy * vy + uz * vz) / (nu * nv)
    worst = Math.max(worst, (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI)
  }
  return worst
}

/**
 * How many samples the baked trajectory gets per revolution, below which it
 * cannot describe the orbit and the elements take over.
 *
 * Eight. Below it the sampled path is not a coarse version of the orbit, it is a
 * different shape — four samples a revolution draw a quadrilateral. Above it the
 * samples are a fair rendering of a real trajectory, and they have something the
 * elements do not: they follow the actual path rather than the closest ellipse
 * to it.
 */
const MIN_SAMPLES_PER_ORBIT = 8

/**
 * The sharpest corner a sampled path may take before the elements take over.
 *
 * The same three degrees `verify-trails` holds the drawn ribbons to, and this
 * is the half of the rule that `MIN_SAMPLES_PER_ORBIT` cannot see.
 *
 * Samples per revolution is an average, and an average is only a fair summary
 * of a round orbit. Juno's orbit about Jupiter is e = 0.98: twenty-three
 * samples a revolution sounds generous and it comfortably passed, but almost
 * all twenty-three fall in the long slow apojove arc, and the craft crosses
 * most of the orbit near perijove between two of them. Measured, the sampled
 * path turns **114 degrees** in a single step — an aggressively wrong shape
 * that the samples-per-orbit test rated as fine. Parker is the same failure
 * heliocentrically at 116 degrees.
 *
 * So a craft needs elements when *either* test fails, and each catches what the
 * other cannot. The turn test alone would miss Danuri, whose step is fifteen
 * near-exact revolutions, so consecutive samples land on nearly the same point
 * of the orbit and the aliased path looks perfectly smooth. The average alone
 * misses every eccentric orbit in the roster.
 */
const MAX_SAMPLE_TURN = 3

/**
 * How far the element solution lands from the craft's own baked samples, as a
 * fraction of the orbit's size. Returns null where the samples cannot be
 * trusted to answer.
 *
 * Elements are only worth having when there *is* an ellipse. An osculating
 * element set always exists — it is just the two-body orbit matching the
 * current position and velocity — so Horizons hands back a confident answer for
 * a path that is not an ellipse at all, and the renderer draws it as a tidy
 * closed curve. CAPSTONE is the case that matters: its near-rectilinear halo
 * orbit is a three-body path about Earth-Moon L2, held there by the Earth as
 * much as by the Moon, and lunar elements describe it for about as long as you
 * look at them.
 *
 * ## Why this asks the samples rather than the elements
 *
 * The first version of this test measured how much the *shape* moved over a
 * revolution, on the theory that a real orbit drifts slowly while a three-body
 * path does not. It caught CAPSTONE and it also threw out OSIRIS-REx, which is
 * on a perfectly good heliocentric ellipse — its shape moved because it flew
 * past the Earth, and one revolution of a 401-day orbit is two and a half years
 * of real trajectory. A craft that changes orbit is not a craft without one,
 * and the stored epochs describe the change anyway: elements are interpolated
 * every 3.5 days, not fixed once.
 *
 * The honest question is not whether the ellipse moves but whether the
 * reconstruction lands where the craft actually is, and the baked samples
 * already say where that is. So they are asked directly.
 *
 * ## When the samples may be asked
 *
 * Only when they are not themselves aliased, which is the same condition
 * `MIN_SAMPLES_PER_ORBIT` already tests. Below it a sample run has hidden whole
 * revolutions inside it and is as far from the truth as from anything else —
 * LRO's samples miss its own orbit by 11,000 km, so scoring elements against
 * them would reject the craft this file exists for.
 *
 * ## And only at the sample instants
 *
 * This is the whole delicacy of the test and the first two versions of it got
 * this wrong. A baked sample *is* a Horizons position, exact to the metre. The
 * curve drawn through the samples is not, and where the path corners hard the
 * interpolation cuts it badly — which is the exact complaint that sent these
 * craft here. Walking the reconstruction against the interpolated curve
 * therefore asks the corner-cutting to referee its own case, and it duly
 * convicted Parker at 29% and Juno at 13% for the crime of being right.
 *
 * So the probes land on the stored samples and nowhere else. That is also where
 * the elements have nothing handed to them: an epoch reproduces its own
 * position by construction, epochs are 3.5 days apart, and the samples fall
 * between them, so every comparison is made where the reconstruction is
 * working hardest.
 */
function elementError(craft, segment, rows, jd, periodDays) {
  if (periodDays / segment.step < MIN_SAMPLES_PER_ORBIT) return null

  const entry = { frame: segment.frame, rows }
  const solved = { x: 0, y: 0, z: 0 }
  const count = segment.samples.length / 3

  // One revolution either side of the present, which brackets the stretch the
  // trail draws.
  const lo = Math.max(0, Math.ceil((jd - periodDays - segment.t0) / segment.step))
  const hi = Math.min(count - 1, Math.floor((jd + periodDays - segment.t0) / segment.step))

  let worst = 0
  let scale = 0
  for (let i = lo; i <= hi; i++) {
    const at = segment.t0 + i * segment.step
    if (at < rows[0][0] || at > rows[rows.length - 1][0]) continue
    const x = segment.samples[i * 3]
    const y = segment.samples[i * 3 + 1]
    const z = segment.samples[i * 3 + 2]
    elementPositionAt(entry, at, solved)
    worst = Math.max(worst, Math.hypot(solved.x - x, solved.y - y, solved.z - z))
    scale = Math.max(scale, Math.hypot(x, y, z))
  }
  return scale > 0 ? worst / scale : null
}

/**
 * The most the element solution may miss the craft by, relative to how far it
 * is from the thing it orbits.
 *
 * One percent, and it is placed by the measurements rather than by taste. The
 * craft that pass come in at 0.00, 0.00, 0.00 and 0.14 percent — Juno's 0.14
 * being the most eccentric orbit admitted and so the honest worst case — and
 * CAPSTONE's halo comes in at 5.79. There is nothing in between, so the line is
 * put in the middle of the empty space: seven times above everything accepted
 * and six times below the one thing rejected.
 *
 * Five percent was the first choice, on the reasoning that it is about the width
 * of the drawn body at these distances. It happened to give the same answer, but
 * only by 0.79 of a percentage point, which is not a margin — it was a threshold
 * sitting on top of the one measurement it had to discriminate.
 */
const MAX_ELEMENT_ERROR = 0.01

/**
 * Mid-interval error against Horizons itself, for the craft whose own samples
 * cannot referee.
 *
 * `elementError` scores the reconstruction against the baked samples, and for a
 * close orbiter those are the very thing the elements exist to replace — LRO's
 * 1.95-hour orbit against a 7.63-day step is 0.0 samples per revolution. So it
 * refuses to answer (`MIN_SAMPLES_PER_ORBIT`), the fit goes unchecked, and the
 * only thing that ever looks at it is `verify-spacecraft` afterwards, online.
 * That is how LRO shipped at 7.6% of its own orbit radius while every other
 * orbiter sat under 2.2%.
 *
 * The error of a linear interpolation is zero at the knots and worst between
 * them, so this asks Horizons for the true position at interval *midpoints* —
 * measured, LRO reads 1.5 km at both row epochs and 160 km at the middle. Six
 * probes, spread over the fortnight around `jd`, which is the stretch a trail
 * actually draws.
 */
async function midIntervalError(entry, naif, center, jd) {
  const rows = entry.rows
  const last = rows.length - 1
  const step = (rows[last][0] - rows[0][0]) / last

  const solved = { x: 0, y: 0, z: 0 }
  let worst = 0
  let scale = 0

  for (let i = -3; i < 3; i++) {
    const k = Math.floor((jd - rows[0][0]) / step) + i
    if (k < 0 || k >= last) continue
    const at = rows[k][0] + step * 0.5
    const truth = await horizonsVector(naif, center, at)
    if (!truth) continue
    elementPositionAt(entry, at, solved)
    worst = Math.max(
      worst,
      Math.hypot(solved.x - truth.x, solved.y - truth.y, solved.z - truth.z),
    )
    scale = Math.max(scale, Math.hypot(truth.x, truth.y, truth.z))
  }
  return scale > 0 ? worst / scale : null
}

/** One true position, as vectors rather than elements. */
async function horizonsVector(naif, center, jd) {
  const text = await horizons({
    COMMAND: `'${naif}'`,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: `'${center}'`,
    REF_PLANE: 'ECLIPTIC',
    START_TIME: `'${stamp(jd)}'`,
    STOP_TIME: `'${stamp(jd + 0.002)}'`,
    STEP_SIZE: `'1'`,
    VEC_TABLE: '1',
    OUT_UNITS: 'AU-D',
    CSV_FORMAT: 'YES',
  })
  const s = text.indexOf('$$SOE')
  const e = text.indexOf('$$EOE')
  if (s < 0 || e < 0) return null
  const row = text.slice(s + 5, e).trim().split('\n')[0].split(',')
  if (row.length < 5) return null
  return { x: Number(row[2]), y: Number(row[3]), z: Number(row[4]) }
}

/**
 * How close the reconstruction has to sit to Horizons between the rows, and how
 * far the step may be refined chasing it.
 *
 * One percent of the orbit radius, the same bar `MAX_ELEMENT_ERROR` holds the
 * sample-refereed craft to, so a craft is not held to a looser standard merely
 * because its samples were too coarse to check it.
 *
 * Three halvings, which takes 3.5 days down to 0.44. Measured on LRO, the worst
 * case in the file: 4.41% at 3.5 days, 0.80% at 0.875, 0.13% at 0.4375. The
 * refinement is not monotonic step by step — 1.75 days scored worse than 3.5,
 * because what a fixed set of probes catches depends on where the knots fall —
 * so it keeps halving until it passes rather than stopping at the first
 * improvement.
 */
const MAX_MID_INTERVAL_ERROR = 0.02
const MAX_REFINEMENTS = 3

/**
 * Trims element rows to the stretch that is actually a closed orbit.
 *
 * A segment often begins long before capture — LRO's lunar segment starts on the
 * cruise out from Earth, where the osculating "orbit" about the Moon is
 * hyperbolic and drawing it as an ellipse would be a fiction. Landers are the
 * same problem from the other end: on the surface the elements describe an orbit
 * that passes through the body.
 *
 * So the rows are cut down to the run containing the present in which the orbit
 * is both closed and above the ground, and outside it the craft falls back to
 * the sampled path — which is what the samples are good at, because a cruise is
 * exactly the smooth case they were decimated for.
 */
function closedRun(rows, jd, bodyRadiusAU) {
  // 0.99, not 0.9. Juno's orbit about Jupiter is genuinely e = 0.98 — a long
  // thin ellipse is still an ellipse, and excluding it dropped the one craft in
  // the outer system that needed this most.
  const usable = (r) => r[2] < 0.99 && r[1] > bodyRadiusAU
  let at = 0
  let best = Infinity
  for (let i = 0; i < rows.length; i++) {
    const d = Math.abs(rows[i][0] - jd)
    if (d < best) {
      best = d
      at = i
    }
  }
  if (!usable(rows[at])) return []

  let lo = at
  let hi = at
  while (lo > 0 && usable(rows[lo - 1])) lo--
  while (hi < rows.length - 1 && usable(rows[hi + 1])) hi++
  return rows.slice(lo, hi + 1)
}

async function main() {
  const today = 2461255.955
  const wanted = candidates(today)
  console.log(`asking Horizons about ${wanted.length} craft in a body's frame:\n`)

  const baked = {}
  for (const { craft, segment, epoch } of wanted) {
    // A finished craft offers every orbital phase it had, longest first, and one
    // usable table is the whole answer — see `referenceEpochs`.
    if (baked[craft.id]) continue

    const naif = HORIZONS_ID[craft.id]
    const center = centerFor(segment.frame)
    if (!naif || !center) {
      console.log(`  ${craft.name}: no Horizons id or center — skipped`)
      continue
    }

    let from = segment.t0
    let to = segment.t1
    const count = Math.max(2, Math.round((to - from) / STEP_DAYS))
    process.stdout.write(`  ${craft.name} (${segment.frame}) ${count} epochs ... `)

    const ask = (a, b, stepDays = STEP_DAYS) =>
      horizons({
        COMMAND: `'${naif}'`,
        OBJ_DATA: 'NO',
        MAKE_EPHEM: 'YES',
        EPHEM_TYPE: 'ELEMENTS',
        CENTER: `'${center}'`,
        REF_PLANE: 'ECLIPTIC',
        START_TIME: `'${stamp(a)}'`,
        STOP_TIME: `'${stamp(b)}'`,
        STEP_SIZE: `'${Math.max(2, Math.round((b - a) / stepDays))}'`,
        OUT_UNITS: 'AU-D',
        CSV_FORMAT: 'YES',
      })

    let text
    try {
      text = await ask(from, to)
      /*
       * Horizons refuses the whole request when the window runs past what it
       * has, so a segment reaching beyond JPL's propagation loses the craft
       * entirely rather than losing the tail. It names the boundary in the
       * refusal, so the fix is to believe it and ask again.
       *
       * A day inside the stated limit, because the boundary itself is where the
       * ephemeris stops rather than the last instant it covers.
       */
      const limit = ephemerisLimit(text)
      if (limit) {
        if (limit.side === 'after') to = Math.min(to, limit.jd - 1)
        else from = Math.max(from, limit.jd + 1)
        process.stdout.write(`clamped to ${stamp(from).slice(0, 10)}..${stamp(to).slice(0, 10)} ... `)
        text = to > from ? await ask(from, to) : text
      }
    } catch (error) {
      console.log(`FAILED — ${error.message}`)
      continue
    }

    const rows = parseElements(text)
    if (!rows) {
      console.log(`FAILED — ${text.split('\n').filter((l) => l.trim()).slice(-2).join(' | ').slice(0, 160)}`)
      continue
    }

    const trimmed = closedRun(rows, epoch, frameRadiusAU(segment.frame))
    if (trimmed.length < 3) {
      console.log(`${rows.length} epochs, but no closed orbit around now — skipped`)
      continue
    }

    // The period is the sanity line. An orbiter whose period comes back in days
    // rather than hours is not in its science orbit, which is what reading
    // elements from the arrival phase gives you.
    const at = trimmed.reduce((b, r, i) => (Math.abs(r[0] - epoch) < Math.abs(trimmed[b][0] - epoch) ? i : b), 0)
    const periodDays = 360 / trimmed[at][7]
    const perOrbit = periodDays / segment.step
    const turn = worstTurn(craft, segment, epoch)

    const why = []
    if (perOrbit < MIN_SAMPLES_PER_ORBIT) why.push(`${perOrbit.toFixed(1)} samples/orbit`)
    if (turn > MAX_SAMPLE_TURN) why.push(`${turn.toFixed(0)}° corner`)

    let label =
      `period ${periodDays < 2 ? `${(periodDays * 24).toFixed(2)} h` : `${periodDays.toFixed(1)} d`}, ` +
      `${perOrbit.toFixed(1)} samples/orbit, ${turn.toFixed(1)}° corner`

    if (!why.length) {
      console.log(`${label} — samples are fine`)
      continue
    }

    const error = elementError(craft, segment, trimmed, epoch, periodDays)
    if (error !== null) label += `, ellipse fits to ${(error * 100).toFixed(2)}%`
    if (error !== null && error > MAX_ELEMENT_ERROR) {
      console.log(`${label} — not an ellipse, samples kept`)
      continue
    }

    /*
     * Refine the step until the reconstruction holds up *between* the rows.
     *
     * Only where `elementError` declined to answer. Where it did answer, the
     * samples were dense enough to referee and already have; re-asking Horizons
     * would be spending calls to re-derive a verdict in hand.
     */
    let entry = { frame: segment.frame, rows: trimmed }
    let stepDays = STEP_DAYS
    if (error === null) {
      for (let pass = 0; ; pass++) {
        const mid = await midIntervalError(entry, naif, center, epoch)
        if (mid === null) break
        if (mid <= MAX_MID_INTERVAL_ERROR) {
          label += `, ${(mid * 100).toFixed(2)}% between rows at ${stepDays} d`
          break
        }
        if (pass >= MAX_REFINEMENTS) {
          label += `, ${(mid * 100).toFixed(2)}% between rows at ${stepDays} d — could not refine further`
          break
        }
        stepDays /= 2
        process.stdout.write(`${(mid * 100).toFixed(1)}% between rows, retrying at ${stepDays} d ... `)
        const finer = parseElements(await ask(from, to, stepDays))
        const run = finer && closedRun(finer, epoch, frameRadiusAU(segment.frame))
        if (!run || run.length < 3) break
        entry = { frame: segment.frame, rows: run }
      }
    }

    const rowsKept = entry.rows
    const span = ((rowsKept[rowsKept.length - 1][0] - rowsKept[0][0]) / 365.25).toFixed(1)
    console.log(`${label} — ${why.join(' + ')}, ${rowsKept.length} epochs over ${span} yr`)

    baked[craft.id] = entry
  }

  const num = (v, digits) => String(Number(Number(v).toPrecision(digits)))
  const lines = []
  lines.push('/**')
  lines.push(' * Osculating orbital elements for the close planetary orbiters.')
  lines.push(' *')
  lines.push(' * Generated by `scripts/fetch-spacecraft-elements.mjs` from JPL Horizons.')
  lines.push(' * Do not edit by hand.')
  lines.push(' *')
  lines.push(' * Each row is `[jd, a, e, i, node, argp, M, n]` — semi-major axis in AU, all')
  lines.push(' * angles in degrees, mean motion in degrees per day, referred to the J2000')
  lines.push(` * ecliptic and centred on \`frame\`. Rows are evenly spaced, ${STEP_DAYS} days`)
  lines.push(' * apart for most craft — and closer where that was measured not to be enough.')
  lines.push(' * The spacing is per craft and `elementsAtEpoch` reads it off the rows, so')
  lines.push(' * nothing downstream needs to know which is which. See the refinement loop in')
  lines.push(' * the generator: a close orbiter\'s own samples are too coarse to check its')
  lines.push(' * elements, so the step is halved until Horizons agrees between the rows.')
  lines.push(' *')
  lines.push(' * `M` and `n` are a matched pair and `M` must never be interpolated between')
  lines.push(' * rows — these orbits turn dozens of times between epochs. See')
  lines.push(' * `elementsAtEpoch` in `src/orbit/spacecraftElements.js`.')
  lines.push(' */')
  lines.push('export const SPACECRAFT_ELEMENTS = {')
  for (const [id, entry] of Object.entries(baked)) {
    lines.push(`  ${id}: {`)
    lines.push(`    frame: '${entry.frame}',`)
    lines.push('    rows: [')
    for (const r of entry.rows) {
      // Julian Dates at full precision for the same reason the segment times
      // are: 11 significant digits, and rounding to 8 puts a 12-minute error
      // into every epoch — which on a 2-hour orbit is 36 degrees of phase.
      lines.push(
        `      [${r[0]}, ${num(r[1], 10)}, ${num(r[2], 8)}, ${num(r[3], 8)}, ` +
          `${num(r[4], 8)}, ${num(r[5], 8)}, ${num(r[6], 8)}, ${num(r[7], 10)}],`,
      )
    }
    lines.push('    ],')
    lines.push('  },')
  }
  lines.push('}')
  lines.push('')

  writeFileSync(OUT, lines.join('\n'))
  const total = Object.values(baked).reduce((sum, e) => sum + e.rows.length, 0)
  console.log(`\nwrote ${Object.keys(baked).length} craft, ${total} epochs`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
