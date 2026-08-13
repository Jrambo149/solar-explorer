/**
 * The missions, against what actually happened.
 *
 * Every date in `src/data/missionEvents.js` is read out of a trajectory rather
 * than transcribed, which is the property worth having and also the reason this
 * file has to exist: a derivation cannot be proof-read. It always returns
 * plausible dates near real encounters, so the only way to know whether "Voyager
 * 2 passes Neptune" is the right day is to check it against the day.
 *
 * The table below is published history — encounter dates and closest-approach
 * altitudes as recorded by the missions themselves. Nothing in the app reads
 * it; it exists only here, as the outside opinion.
 *
 * ## What is asserted, and what is only reported
 *
 * **Dates are asserted.** A flyby's instant comes out of a dense run of samples
 * through the encounter and is good to the minute.
 *
 * **Altitudes are reported, and only loosely asserted.** They are only as good
 * as the sampling: where the path is nearly straight the interpolation is
 * excellent, and where it bends hard through a low perigee it is not. Both
 * cases are in the table so the difference stays visible rather than being
 * quietly averaged away.
 *
 *   node scripts/verify-mission-events.mjs
 */

import { MISSION_EVENTS, MISSION_EVENTS_BY_CRAFT } from '../src/data/missionEvents.js'
import { BODIES, BODIES_BY_ID } from '../src/data/bodies.js'
import { LANDED_CRAFT } from '../src/data/landedCraft.js'
import { dateFromJulian, julianDate } from '../src/orbit/kepler.js'
import { trajectoryWindow } from '../src/orbit/trajectory.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const at = (iso) => julianDate(new Date(`${iso}T00:00:00Z`))
const day = (jd) => dateFromJulian(jd).toISOString().slice(0, 10)

/**
 * Published encounters: craft, body, the date, and the closest approach in km
 * above the surface where one is recorded.
 *
 * The grand tours and the gravity assists, which between them cover every kind
 * of encounter in the roster — a 300 km perigee at Earth, a 350 km pass over
 * Europa, and a quarter of a million kilometres past Jupiter.
 */
const ENCOUNTERS = [
  ['sc_voyager_1', 'jupiter', '1979-03-05', 348890 - 71492],
  ['sc_voyager_1', 'saturn', '1980-11-12', 184300 - 58232],
  ['sc_voyager_2', 'jupiter', '1979-07-09', 721670 - 71492],
  ['sc_voyager_2', 'saturn', '1981-08-26', 161000 - 58232],
  ['sc_voyager_2', 'uranus', '1986-01-24', 107000 - 25559],
  ['sc_voyager_2', 'neptune', '1989-08-25', 4950],
  ['sc_new_horizons', 'jupiter', '2007-02-28', null],
  ['sc_new_horizons', 'pluto', '2015-07-14', 12500 - 1188],
  ['sc_galileo', 'venus', '1990-02-10', 16000],
  ['sc_juno', 'earth', '2013-10-09', 559],
  ['sc_juno', 'ganymede', '2021-06-07', 1038],
  ['sc_juno', 'europa', '2022-09-29', 352],
  ['sc_juno', 'io', '2023-12-30', 1500],
  ['sc_cassini', 'venus', '1998-04-26', 284],
  ['sc_cassini', 'earth', '1999-08-18', 1171],
  ['sc_messenger', 'mercury', '2008-01-14', 200],
  ['sc_pioneer_11', 'jupiter', '1974-12-03', 42760],
]

console.log('\nEncounters, against the record\n')

const errors = []
for (const [craft, body, date, altitude] of ENCOUNTERS) {
  const name = BODIES_BY_ID[craft].name
  const found = (MISSION_EVENTS_BY_CRAFT[craft] ?? []).filter(
    (e) => e.kind === 'flyby' && e.body === body,
  )
  // Several craft pass the same body more than once; take the nearest in time,
  // which is what the published date identifies.
  const target = at(date)
  const best = found.reduce(
    (a, b) => (a === null || Math.abs(b.jd - target) < Math.abs(a.jd - target) ? b : a),
    null,
  )

  if (!best) {
    check(`${name} at ${body}`, false, 'no flyby found')
    continue
  }

  check(
    `${name} passes ${body} on ${date}`,
    day(best.jd) === date,
    day(best.jd) === date ? null : `found ${day(best.jd)}`,
  )

  if (altitude !== null) {
    const off = best.altitudeKm - altitude
    errors.push({ craft: name, body, off, altitude, got: best.altitudeKm, res: best.resolutionKm })
  }
}

console.log('\nClosest approach, reported\n')

/*
 * Printed in full rather than reduced to a pass or a fail, because the spread
 * *is* the finding: the same code is exact on one encounter and thousands of
 * kilometres out on another, and which is which depends on how sharply the
 * trajectory bends rather than on anything that can be tuned.
 */
for (const e of errors.sort((a, b) => Math.abs(a.off) - Math.abs(b.off))) {
  const pct = ((Math.abs(e.off) / Math.max(e.altitude, 1)) * 100).toFixed(0)
  console.log(
    `       ${e.craft.padEnd(14)} ${e.body.padEnd(8)} ` +
      `${Math.round(e.got).toLocaleString().padStart(9)} km vs ${e.altitude.toLocaleString().padStart(9)} ` +
      `(${e.off > 0 ? '+' : ''}${Math.round(e.off).toLocaleString()}, ${pct}%) ` +
      `samples ${Math.round(e.res).toLocaleString()} km apart`,
  )
}

// Loose, and deliberately so — this asserts that the altitudes are in the right
// world, not that they are precise. The line above is where the precision is
// actually reported.
const wild = errors.filter((e) => Math.abs(e.off) > Math.max(3000, e.altitude * 0.35))
check(
  'every altitude is within 35% or 3,000 km of the record',
  wild.length === 0,
  wild.map((e) => `${e.craft}/${e.body} off by ${Math.round(e.off)}`).join('; '),
)

/*
 * The known limit, pinned so it cannot quietly get worse. An Earth assist turns
 * through a perigee a few hundred kilometres up while the samples are twenty
 * minutes and twelve thousand kilometres apart, and the spline can dip below
 * the surface. Two of the forty-four do.
 */
const subsurface = MISSION_EVENTS.filter((e) => e.kind === 'flyby' && e.altitudeKm < 0)
check(
  'at most two flybys come out inside the body they pass',
  subsurface.length <= 2,
  subsurface.map((e) => `${e.craft}/${e.body} ${Math.round(e.altitudeKm)} km`).join('; '),
)

console.log('\nArrivals\n')

/*
 * An arrival is the frame handoff — the instant the body takes over the motion
 * — and it is deliberately not called an orbit insertion. For the inner planets
 * the two are the same day; at the giants the craft crosses into the sphere of
 * influence weeks before it fires the engine, and Cassini is a month.
 */
const ARRIVALS = [
  ['sc_mars_reconnaissance_orbiter', 'mars', '2006-03-10', 2],
  ['sc_maven', 'mars', '2014-09-22', 2],
  ['sc_mars_odyssey', 'mars', '2001-10-24', 2],
  ['sc_mars_express', 'mars', '2003-12-25', 2],
  ['sc_trace_gas_orbiter', 'mars', '2016-10-19', 2],
  ['sc_mars_orbiter_mission', 'mars', '2014-09-24', 2],
  ['sc_venus_express', 'venus', '2006-04-11', 2],
  ['sc_lunar_reconnaissance_orbiter', 'luna', '2009-06-23', 2],
  // The giants: weeks early by construction, and the tolerance says so.
  ['sc_juno', 'jupiter', '2016-07-05', 16],
  ['sc_galileo', 'jupiter', '1995-12-07', 11],
  ['sc_cassini', 'saturn', '2004-07-01', 33],
]

for (const [craft, body, date, tolerance] of ARRIVALS) {
  const name = BODIES_BY_ID[craft].name
  const found = (MISSION_EVENTS_BY_CRAFT[craft] ?? []).find(
    (e) => e.kind === 'arrival' && e.body === body,
  )
  const off = found ? found.jd - at(date) : null
  check(
    `${name} reaches ${body} within ${tolerance} days of ${date}`,
    found && Math.abs(off) <= tolerance,
    found ? `${day(found.jd)}, ${off > 0 ? '+' : ''}${off.toFixed(1)} d` : 'not found',
  )
}

console.log('\nThe shape of the list\n')

const craft = BODIES.filter((b) => b.kind === 'spacecraft')

check(
  `every one of the ${craft.length} craft has a beginning`,
  craft.every((c) => (MISSION_EVENTS_BY_CRAFT[c.id] ?? []).some((e) => e.kind === 'mission-begins')),
)

// Which is the first sample of its ephemeris, so it must be exactly that.
const beginnings = MISSION_EVENTS.filter((e) => e.kind === 'mission-begins')
check(
  'and it is the first instant the craft exists',
  beginnings.every((e) => Math.abs(e.jd - trajectoryWindow(BODIES_BY_ID[e.craft]).start) < 1e-6),
)

/*
 * The launch is *not* claimed, and this is the measurement behind that
 * decision: JPL's ephemerides begin a day or two after the rocket left the pad,
 * so printing the first sample as a launch time would be wrong by up to two
 * days on every craft in the roster.
 */
const LAUNCHES = [
  ['sc_voyager_1', '1977-09-05'],
  ['sc_voyager_2', '1977-08-20'],
  ['sc_cassini', '1997-10-15'],
  ['sc_galileo', '1989-10-18'],
  ['sc_new_horizons', '2006-01-19'],
  ['sc_juno', '2011-08-05'],
]
let worstLaunch = 0
for (const [id, date] of LAUNCHES) {
  const begins = MISSION_EVENTS_BY_CRAFT[id].find((e) => e.kind === 'mission-begins')
  worstLaunch = Math.max(worstLaunch, Math.abs(begins.jd - at(date)))
}
check(
  'the first sample trails the real launch, which is why it is not called one',
  worstLaunch > 0.5 && worstLaunch < 3,
  `by up to ${worstLaunch.toFixed(1)} days`,
)

// A mission that has ended stopped in the past; one still flying has not.
const ended = MISSION_EVENTS.filter((e) => e.kind === 'mission-ends')
const now = julianDate(new Date())
check(
  'nothing has ended in the future',
  ended.every((e) => e.jd <= now),
  ended
    .filter((e) => e.jd > now)
    .map((e) => e.craft)
    .join(', '),
)
check(
  'Cassini ends on the day of the Grand Finale',
  day(ended.find((e) => e.craft === 'sc_cassini').jd) === '2017-09-15',
)
check(
  'and Voyager 1, still flying, has no ending',
  !ended.some((e) => e.craft === 'sc_voyager_1'),
)

// Every landing is the one in the roster, which is where the app puts the rover.
for (const [id, site] of Object.entries(LANDED_CRAFT)) {
  const landing = (MISSION_EVENTS_BY_CRAFT[id] ?? []).find((e) => e.kind === 'landing')
  check(
    `${site.name} lands where the roster says`,
    // A tenth of a second: the baked file rounds Julian dates to six decimal
    // places, so bit-equality is the wrong test and fails on five of the six.
    landing && Math.abs(landing.jd - site.landed) < 1.2e-6 && landing.body === site.body,
    landing ? day(landing.jd) : 'no landing',
  )
}

// A craft that landed is not also announced as arriving in orbit.
const doubled = Object.keys(LANDED_CRAFT).filter((id) =>
  (MISSION_EVENTS_BY_CRAFT[id] ?? []).some(
    (e) => e.kind === 'arrival' && e.body === LANDED_CRAFT[id].body,
  ),
)
check('a craft that lands is not also said to arrive', doubled.length === 0, doubled.join(', '))

// And nothing is announced twice: Eyes splits Juno's time at Jupiter into a
// segment per moon encounter, and each one is a chance to say "arrives" again.
const twice = []
for (const c of craft) {
  const seen = new Set()
  for (const e of MISSION_EVENTS_BY_CRAFT[c.id] ?? []) {
    if (e.kind !== 'arrival') continue
    if (seen.has(e.body)) twice.push(`${c.id}/${e.body}`)
    seen.add(e.body)
  }
}
check('and nothing arrives anywhere twice', twice.length === 0, twice.join(', '))

// Ordering, which everything downstream assumes.
check(
  'the file is in time order',
  MISSION_EVENTS.every((e, i) => i === 0 || MISSION_EVENTS[i - 1].jd <= e.jd),
)
check(
  'every event falls inside its own mission',
  MISSION_EVENTS.every((e) => {
    const w = trajectoryWindow(BODIES_BY_ID[e.craft])
    return e.jd >= w.start - 1e-6 && e.jd <= w.end + 1e-6
  }),
)

console.log(failures ? `\n${failures} failed\n` : `\nAll checks passed (${MISSION_EVENTS.length} events)\n`)
process.exit(failures ? 1 : 0)
