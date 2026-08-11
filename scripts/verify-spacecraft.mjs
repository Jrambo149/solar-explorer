#!/usr/bin/env node
/**
 * Checks the baked spacecraft trajectories against JPL Horizons.
 *
 * Run with:
 *     npm run verify:spacecraft
 *
 * The other verifiers in this repo are offline and check the app against
 * itself. This one goes back to the source, because the question it answers
 * cannot be answered any other way: the trajectories are **decimated**. A
 * 40-year cruise is stored as a few hundred samples and everything between them
 * is a Catmull-Rom guess, and the whole design rests on that guess being small.
 * Guessing that it is small is not the same as knowing.
 *
 * So this samples each craft at instants that deliberately fall *between* stored
 * samples — where the interpolation error is largest — and compares against
 * Horizons' own answer for that instant.
 *
 * It also checks the two things that would be invisible on screen:
 *
 *   **Frame continuity.** At a handoff the craft changes reference frame, and
 *   the position either side must agree once both are put in the same frame. A
 *   mismatch means a body jumping at an encounter, which reads as a glitch
 *   rather than as physics.
 *
 *   **Mission windows.** A craft must not exist before it launched or after it
 *   was destroyed. Cassini beside Saturn in 2026 is wrong in a way that looks
 *   perfectly normal.
 */

import { SPACECRAFT_RAW } from '../src/data/spacecraftData.js'
import {
  trajectoryAt,
  trajectoryWindow,
  isFlying,
  jdFromEt,
  segmentAt,
  trailDays,
} from '../src/orbit/trajectory.js'
import { SPACECRAFT_TRAILS } from '../src/data/spacecraftTrails.js'
import { LANDED_CRAFT } from '../src/data/landedCraft.js'
import { SPACECRAFT_ELEMENTS } from '../src/data/spacecraftElements.js'
import {
  elementPeriodDays,
  elementPositionAt,
  hasElements,
} from '../src/orbit/spacecraftElements.js'
import { FRAMES, HORIZONS_ID } from './spacecraft-roster.mjs'

/** The instant the "flying today" checks are anchored to. */
const TODAY = 2461255.955

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const KM_PER_AU = 149597870.7

let checks = 0
let failures = 0

function check(ok, label, detail = '') {
  checks += 1
  if (!ok) {
    failures += 1
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
  return ok
}

const stamp = (jd) =>
  new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 19).replace('T', ' ')

/** The Horizons center for one of our frame body ids. */
const centerFor = (bodyId) => {
  for (const f of Object.values(FRAMES)) if (f.body === bodyId) return f.horizons
  return null
}

async function horizonsAt(naif, center, jd) {
  const url = new URL(API)
  for (const [k, v] of Object.entries({
    format: 'text',
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
  }))
    url.searchParams.set(k, v)

  const text = await (await fetch(url, { signal: AbortSignal.timeout(120000) })).text()
  const s = text.indexOf('$$SOE')
  const e = text.indexOf('$$EOE')
  if (s < 0 || e < 0) return null
  const row = text
    .slice(s + 5, e)
    .trim()
    .split('\n')[0]
    .split(',')
  if (row.length < 5) return null
  return { x: Number(row[2]), y: Number(row[3]), z: Number(row[4]) }
}

/* ---------------------------------------------------------------- *
 * Offline structure checks — every craft, every segment
 * ---------------------------------------------------------------- */

console.log(`\nStructure — ${SPACECRAFT_RAW.length} craft`)

for (const craft of SPACECRAFT_RAW) {
  const w = trajectoryWindow(craft)
  check(w !== null, `${craft.name}: has a window`)
  if (!w) continue

  check(w.end > w.start, `${craft.name}: window runs forwards`)

  // Not drawn outside the window, drawn inside it.
  check(!isFlying(craft, w.start - 1), `${craft.name}: absent before launch`)
  check(!isFlying(craft, w.end + 1), `${craft.name}: absent after end of mission`)
  check(isFlying(craft, (w.start + w.end) / 2), `${craft.name}: present mid-mission`)

  for (const seg of craft.segments) {
    const n = seg.samples.length / 3
    check(seg.samples.length % 3 === 0, `${craft.name}/${seg.frame}: samples divide by 3`)
    check(n >= 1, `${craft.name}/${seg.frame}: has samples`)
    check(seg.step > 0, `${craft.name}/${seg.frame}: positive step`)
    check(
      Math.abs(seg.t0 + seg.step * (n - 1) - seg.t1) < seg.step * 0.51,
      `${craft.name}/${seg.frame}: step spans the segment`,
      `t0+${n - 1}*step=${(seg.t0 + seg.step * (n - 1)).toFixed(4)} vs t1=${seg.t1.toFixed(4)}`,
    )
    check(seg.samples.every(Number.isFinite), `${craft.name}/${seg.frame}: all samples finite`)

    // The stored samples must be reproduced exactly at their own instants —
    // that is the property Catmull-Rom is chosen for.
    const mid = Math.floor(n / 2)
    if (n > 3) {
      const got = trajectoryAt(craft, seg.t0 + seg.step * mid)
      if (got) {
        const d = Math.hypot(
          got.x - seg.samples[mid * 3],
          got.y - seg.samples[mid * 3 + 1],
          got.z - seg.samples[mid * 3 + 2],
        )
        check(
          d < 1e-9,
          `${craft.name}/${seg.frame}: passes through its samples`,
          `${d.toExponential(2)} AU`,
        )
      }
    }
  }
}

/* ---------------------------------------------------------------- *
 * Touchdown instants, against the trajectory's own seam
 * ---------------------------------------------------------------- */

/**
 * The one number in `landedCraft.js` nothing else could check.
 *
 * `landed` decides four things at once — which model is drawn, what the craft is
 * called, whether it takes its attitude from the roster, and whether it is
 * placed from samples or from coordinates — and until this check existed it was
 * a hand-converted Julian date with the UTC time in a comment beside it. Four of
 * the five were wrong: Curiosity's by 18 days, InSight's by 5, Perseverance's by
 * 15 hours and Opportunity's by 3.7. Every one of them looked completely normal
 * on screen, because a rover on Mars looks the same on any date. The way it
 * surfaced was a screenshot captioned with the wrong year.
 *
 * The trajectories know the answer. Eyes samples the descent at 2.9-minute steps
 * and then switches to a step of days once the craft is sitting still, so the
 * end of the fine Mars-frame segment *is* touchdown, in the app's own data, for
 * every craft that has one. InSight has no descent segment — its Mars-frame
 * coverage opens 1.8 days before it landed and runs coarse throughout — so for
 * it the seam is that segment's start, and the bound is three days rather than
 * minutes. That is far weaker, and still an order of magnitude tighter than the
 * five-day error it replaces.
 *
 * The tolerance is deliberately loose. The published times are Earth-received,
 * the segment ends at the spacecraft event, and the two differ by the one-way
 * light time — 11 to 14 minutes at these arrivals. That difference is real and
 * neither number is wrong; 30 minutes admits it while still catching an error
 * of hours.
 */
console.log(`\nTouchdown instants`)

const FINE_STEP_DAYS = 10 / (24 * 60)

for (const [id, site] of Object.entries(LANDED_CRAFT)) {
  const craft = SPACECRAFT_RAW.find((c) => c.id === id)
  if (!check(craft !== undefined, `${site.name}: is in the roster`)) continue

  const surface = craft.segments.filter((s) => s.frame === site.body)
  const descent = surface.find((s) => s.step < FINE_STEP_DAYS)

  if (descent) {
    const off = (site.landed - descent.t1) * 24 * 60
    check(
      Math.abs(off) < 30,
      `${site.name}: lands where its descent segment ends`,
      `${off.toFixed(1)} min from the seam`,
    )
  } else {
    const off = site.landed - surface[0].t0
    check(
      off > 0 && off < 3,
      `${site.name}: lands just after its ${site.body}-frame coverage opens`,
      `${off.toFixed(2)} d after t0`,
    )
  }

  check(site.ended === null || site.ended > site.landed, `${site.name}: ends after it landed`)
}

/**
 * And the other direction: everything that landed is on the list.
 *
 * Checking the five entries says nothing about a sixth that was never written,
 * and that is not hypothetical — Phoenix sat on Mars for 161 days with no entry,
 * drawn from its surface samples, which put it between 13 and 179 km *below* the
 * surface for every instant of them.
 *
 * The signature of a craft that descended and then stayed is in the segments and
 * needs no roster of names to recognise: a fine-stepped segment in a body's
 * frame followed by a coarse one in *the same frame*. The step changes because
 * the craft stopped moving, and the frame does not change because it is still
 * there. An orbiter never matches — its samples stay fine or stay coarse — and
 * neither does an impactor or a probe whose data ends at contact, which is why
 * Cassini, MESSENGER, Deep Impact's impactor, LCROSS and Huygens are all silent
 * here while Phoenix was not.
 */
for (const craft of SPACECRAFT_RAW) {
  for (let i = 1; i < craft.segments.length; i++) {
    const descent = craft.segments[i - 1]
    const after = craft.segments[i]
    if (descent.frame === 'sun' || descent.frame !== after.frame) continue
    if (!(descent.step < FINE_STEP_DAYS && after.step > FINE_STEP_DAYS)) continue
    check(
      LANDED_CRAFT[craft.id] !== undefined,
      `${craft.name}: descended onto ${after.frame} and stayed — needs a LANDED_CRAFT entry`,
      `${(after.t1 - after.t0).toFixed(0)} d of surface samples at ${(after.step * 24).toFixed(1)} h steps`,
    )
  }
}

/* ---------------------------------------------------------------- *
 * Frame continuity at every handoff
 * ---------------------------------------------------------------- */

console.log(`\nFrame handoffs`)

let handoffs = 0
for (const craft of SPACECRAFT_RAW) {
  for (let i = 1; i < craft.segments.length; i++) {
    const prev = craft.segments[i - 1]
    const next = craft.segments[i]
    if (prev.frame === next.frame) continue
    handoffs += 1
    // Both sides are only comparable through a common frame, which needs the
    // frame bodies' own positions — offline that is not available, so what is
    // checked here is that the segments *abut* in time. A gap is a craft that
    // vanishes for a stretch; an overlap is two positions claimed at once.
    const gapDays = next.t0 - prev.t1
    check(
      Math.abs(gapDays) < Math.max(prev.step, next.step) * 2 + 1e-6,
      `${craft.name}: ${prev.frame} -> ${next.frame} abuts`,
      `gap ${gapDays.toFixed(4)} d`,
    )
  }
}
console.log(`  ${handoffs} handoffs checked`)

/* ---------------------------------------------------------------- *
 * Against Horizons, at instants between stored samples
 * ---------------------------------------------------------------- */

const online = !process.argv.includes('--offline')
if (online) {
  console.log(`\nAgainst Horizons (worst-case instants, between samples)`)

  // A spread across mission types rather than all 63: this is a network check
  // and the point is to bound the interpolation error, not to re-fetch the set.
  const SUBJECTS = [
    'sc_voyager_1',
    'sc_voyager_2',
    'sc_new_horizons',
    'sc_juno',
    'sc_cassini',
    'sc_parker_solar_probe',
    'sc_europa_clipper',
    'sc_lucy',
    'sc_osiris_rex',
    'sc_maven',
    'sc_messenger',
    'sc_pioneer_10',
  ]

  const aliased = []
  let worstAu = 0
  let worstLabel = ''

  for (const id of SUBJECTS) {
    const craft = SPACECRAFT_RAW.find((c) => c.id === id)
    if (!craft) continue

    for (const seg of craft.segments) {
      const n = seg.samples.length / 3
      if (n < 6) continue
      const center = centerFor(seg.frame)
      if (!center) continue

      // Halfway between two stored samples, in the middle of the segment —
      // where a cubic through four points is furthest from the truth.
      const i = Math.floor(n / 2)
      const jd = seg.t0 + seg.step * (i + 0.5)

      const ours = trajectoryAt(craft, jd)
      const theirs = await horizonsAt(craft.naif, center, jd)
      if (!ours || !theirs) continue

      /*
       * Is this segment sampled finely enough to mean anything?
       *
       * A close orbiter is the hard case. MESSENGER circled Mercury every eight
       * hours for four years; the budget gives that segment a sample every few
       * days. Consecutive samples then land at unrelated points of unrelated
       * revolutions, and no interpolation scheme recovers the orbit from that —
       * the error is not the cubic being imprecise, it is the data being
       * aliased.
       *
       * The test is the angle swept between neighbouring samples as seen from
       * the frame body. Under about 40 degrees the samples trace the path and
       * interpolation is meaningful; above it they are just points that happen
       * to be in the right neighbourhood. Reporting those as a tolerance
       * failure would be misleading in both directions — it suggests a bug
       * that could be fixed by tightening something, and it buries the
       * heliocentric legs where the tolerance genuinely does hold.
       */
      const ang = (a, b) => {
        const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
        const na = Math.hypot(...a)
        const nb = Math.hypot(...b)
        return na && nb ? Math.acos(Math.max(-1, Math.min(1, dot / (na * nb)))) : 0
      }
      /*
       * Measured across the *whole* segment, not just around the probe point.
       *
       * Juno's orbit is extremely eccentric — months near apojove, hours
       * whipping through perijove — so the sweep between samples varies by more
       * than an order of magnitude along one revolution. A local window landed
       * in the slow part, reported 30-odd degrees, and passed a segment whose
       * fast end is hopelessly aliased. If any part of an orbit is
       * under-sampled then the orbit is not resolved, so the maximum over the
       * segment is the number that decides it.
       */
      let maxSweep = 0
      for (let k = 1; k < n; k++) {
        maxSweep = Math.max(
          maxSweep,
          ang(
            [seg.samples[(k - 1) * 3], seg.samples[(k - 1) * 3 + 1], seg.samples[(k - 1) * 3 + 2]],
            [seg.samples[k * 3], seg.samples[k * 3 + 1], seg.samples[k * 3 + 2]],
          ),
        )
      }
      const underResolved = maxSweep > (40 * Math.PI) / 180

      const d = Math.hypot(ours.x - theirs.x, ours.y - theirs.y, ours.z - theirs.z)
      const r = Math.hypot(theirs.x, theirs.y, theirs.z)
      const relative = r > 0 ? d / r : 0

      if (underResolved) {
        aliased.push(
          `${craft.name} in ${seg.frame}: sample every ${seg.step.toFixed(2)} d sweeps ` +
            `${((maxSweep * 180) / Math.PI).toFixed(0)}deg — orbit not resolved ` +
            `(${(d * KM_PER_AU).toFixed(0)} km off between samples)`,
        )
        continue
      }

      if (d > worstAu) {
        worstAu = d
        worstLabel = `${craft.name} in ${seg.frame}`
      }

      // 0.5% of the distance from the frame body, or 1000 km, whichever is
      // looser. Both are far below anything the renderer can show: at diorama
      // scale the whole solar system is 100 units across.
      check(
        relative < 0.005 || d * KM_PER_AU < 1000,
        `${craft.name}/${seg.frame}: interpolation within tolerance`,
        `${(d * KM_PER_AU).toFixed(0)} km, ${(relative * 100).toFixed(3)}% of ${r.toFixed(3)} AU`,
      )
    }
  }
  console.log(
    `  worst error where the orbit IS resolved: ${(worstAu * KM_PER_AU).toFixed(0)} km (${worstLabel})`,
  )
  if (aliased.length) {
    console.log(`\n  Under-resolved segments — a known limit, not a regression:`)
    for (const line of aliased) console.log(`    ${line}`)
  }
}

/*
 * The trails.
 *
 * A trail is a window of simulated time ending at the craft, and its length
 * comes from Eyes. Two things can go wrong silently and neither shows up in the
 * position checks above.
 *
 * The first is a missing or nonsensical length, which puts the craft back to
 * drawing its whole flight — the spider's web this replaced.
 *
 * The second is subtler and is a limit rather than a bug: a window can be
 * *shorter than the interval the trajectory was sampled at*. Eyes streams its
 * trajectories at whatever resolution it needs, so a Mars orbiter can carry a
 * one-revolution trail of 6,720 seconds. Here the same segment is baked at a
 * step of days, so a two-hour window falls between two stored samples and there
 * is nothing to draw. Those craft are listed rather than failed: the fix is more
 * samples in the bake, not different code.
 */
console.log('\nTrail windows')
{
  const today = TODAY
  const short = []
  let drawn = 0

  for (const craft of SPACECRAFT_RAW) {
    const config = SPACECRAFT_TRAILS[craft.id]
    check(config !== undefined, `${craft.name}: has a trail length from Eyes`)
    if (!config) continue

    for (const [days, from, to] of config.coverages) {
      check(days >= 0, `${craft.name}: coverage length is not negative`, String(days))
      check(from <= to, `${craft.name}: coverage window is ordered`, `${from} > ${to}`)
    }

    if (!isFlying(craft, today)) continue
    const days = trailDays(craft, today, config)
    check(
      days === null || (Number.isFinite(days) && days >= 0),
      `${craft.name}: trail length is a finite number of days`,
      String(days),
    )
    if (days === null || days === 0) continue

    // A craft solved from elements is not sampled at all, so the sample step is
    // not the thing that limits it — see `spacecraftElements.js`. Its accuracy is
    // checked against Horizons in the elements block below.
    if (hasElements(craft.id)) {
      drawn += 1
      continue
    }

    const segment = segmentAt(craft, today)
    const samples = days / segment.step
    if (samples < 2) {
      short.push(
        `${craft.name}: ${(days * 24).toFixed(2)} h of trail against a ` +
          `${segment.step.toFixed(2)} d sample step — ${samples.toFixed(3)} samples, nothing to draw`,
      )
    } else {
      drawn += 1
    }
  }

  console.log(`  ${drawn} craft flying today draw a resolved trail`)
  if (short.length) {
    console.log(`\n  Trails shorter than the baked sample step — a data limit, not a regression:`)
    for (const line of short) console.log(`    ${line}`)
  }
}

/*
 * The close orbiters, which are elements rather than samples.
 *
 * This is the one place where the app does not merely interpolate Horizons but
 * re-derives a position from it, so it is the one place a silent arithmetic
 * error would survive every other check. The phase is the part worth testing:
 * `elementsAtEpoch` recovers the whole number of revolutions between two epochs
 * from the stored mean motion, and if that inference is ever off by one the
 * craft lands somewhere else entirely on the same, correct-looking orbit.
 *
 * So the instants are chosen *between* epochs, where the reconstruction is
 * doing the most work, rather than on them where it is pinned by construction.
 */
console.log('\nOrbiter elements')
{
  for (const [id, entry] of Object.entries(SPACECRAFT_ELEMENTS)) {
    const craft = SPACECRAFT_RAW.find((c) => c.id === id)
    const naif = HORIZONS_ID[id]
    const center = centerFor(entry.frame)
    if (!craft || !naif || !center) continue

    const rows = entry.rows
    const step = (rows[rows.length - 1][0] - rows[0][0]) / (rows.length - 1)

    /*
     * Probed inside the table, which for a finished mission is not today.
     *
     * This asked about `TODAY` outright, which was fine while every craft with
     * elements was still flying. Cassini's table ends in 2017: Horizons answers
     * nothing for 2026, every probe was skipped, `radius` stayed zero and the
     * relative error fell through to its 1.0 default — so thirteen craft failed
     * at "0 km, 100.00%", a reading that is not a measurement of anything.
     *
     * The generator picks its epoch the same way; see `referenceEpochs` there.
     */
    const first = rows[0][0]
    const last = rows[rows.length - 1][0]
    const base = TODAY >= first && TODAY <= last ? TODAY : (first + last) / 2
    const period = elementPeriodDays(entry, base) * 24

    let worst = 0
    let radius = 0
    for (const offset of [0, 0.31 * step, 0.5 * step, 0.77 * step, -0.4 * step]) {
      const jd = base + offset
      const ours = elementPositionAt(entry, jd, {})
      const theirs = await horizonsAt(naif, center, jd)
      if (!theirs) continue
      radius = Math.hypot(ours.x, ours.y, ours.z)
      worst = Math.max(worst, Math.hypot(ours.x - theirs.x, ours.y - theirs.y, ours.z - theirs.z))
    }

    const km = worst * KM_PER_AU
    const relative = radius > 0 ? worst / radius : 1
    console.log(
      `  ${craft.name}: period ${period.toFixed(2)} h, worst ${km.toFixed(0)} km ` +
        `(${(relative * 100).toFixed(2)}% of orbit radius)`,
    )

    // 5% of the orbital radius. The sampled trajectories these replaced were off
    // by 400% for MRO — four times its own orbit — so this is not a tight
    // tolerance so much as a floor below which the craft is unambiguously on its
    // own orbit and roughly in the right place on it.
    check(
      relative < 0.05,
      `${craft.name}: element position agrees with Horizons`,
      `${km.toFixed(0)} km, ${(relative * 100).toFixed(2)}%`,
    )

    /*
     * The stored run has to contain whole revolutions, and plenty of them.
     *
     * This began as a bound in hours — a period of days or weeks meant the
     * elements had been read from the wrong phase of the mission, the arrival
     * ellipse rather than the science orbit, which is exactly what the first
     * fetch did before the rows were trimmed to the closed run. That worked
     * while every element set was a close orbiter and it has now failed twice as
     * the roster widened, each time by calling correct data wrong: first at 24
     * hours, because ARTEMIS P1 and P2 sit in genuine 25 and 27 hour lunar
     * orbits, and then at 72, because Parker's heliocentric orbit takes 88 days
     * and Juno's about Jupiter takes 33.
     *
     * Juno is the one that shows the original idea cannot be repaired by moving
     * the number. Its real science orbit is 33 days and the capture ellipse it
     * arrived on was 53 — the two overlap, so no threshold in hours separates
     * them, and a check that cannot distinguish its two cases is not measuring
     * anything.
     *
     * What is true of every element set regardless of frame is that the epochs
     * must cover many revolutions of the orbit they describe. A capture ellipse
     * fails it the way it always did, because it is a transient that appears
     * once at arrival and does not repeat, and so does anything degenerate the
     * trimming let through. A third of the span is a deliberately loose bound:
     * the real assurance that these are the right orbits is the Horizons
     * comparison above, which is direct.
     */
    const span = rows[rows.length - 1][0] - rows[0][0]
    check(
      period > 0 && period < (span * 24) / 3,
      `${craft.name}: the stored span covers many revolutions`,
      `${period.toFixed(2)} h over ${(span / 365.25).toFixed(1)} yr`,
    )
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures) process.exitCode = 1
