/**
 * The facts an opened event shows.
 *
 * These are strings assembled from live geometry, which is a combination with a
 * particular failure mode: it reaches the screen looking like prose. The first
 * draft of `eventFacts.js` shipped three of them in one sitting — "The Moon
 * looks NaN% smaller than the Sun" from a field that does not exist under that
 * name, a totality of "23m 60s" from a formatter that rounds before it carries,
 * and that same 24 minutes being nothing but the search's own limit for a
 * condition that holds for hours.
 *
 * None of the three would fail a type check, throw, or look wrong in a diff.
 * So: sweep every event the panel can open, assert nothing degenerate comes
 * out, and check the handful of values that have a published answer.
 *
 *   node scripts/verify-event-facts.mjs
 */

import { EVENTS } from '../src/data/events.js'
import { MISSION_EVENTS } from '../src/data/missionEvents.js'
import { factsFor } from '../src/ui/eventFacts.js'
import { dateFromJulian } from '../src/orbit/kepler.js'
import { nextShadowTransits } from '../src/orbit/shadowTransits.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const day = (jd) => dateFromJulian(jd).toISOString().slice(0, 10)
const find = (kind, test) => EVENTS.find((e) => e.kind === kind && test(e))
const value = (facts, label) => facts.find((f) => f.label === label)?.value ?? null

console.log('\nNothing degenerate, across every event that can be opened\n')

/*
 * All of them — every mission event and all 4,195 sky events. This started as a
 * one-in-a-hundred sample on the assumption that walking a search outward from
 * every eclipse would be slow; it is not. The whole sweep is a couple of
 * seconds, and a sample is exactly the wrong tool for a check whose quarry is
 * the one date where a number comes out strange.
 */
const sampled = [...MISSION_EVENTS, ...EVENTS]
// Shadow transits are searched live rather than baked, so they are not in
// either file — take a week of them.
const transits = nextShadowTransits(2461000, 7)
const pool = [...sampled, ...transits]

const BAD = /NaN|undefined|Infinity|null/
const broken = []
const empty = []
for (const event of pool) {
  const facts = factsFor(event)
  for (const fact of facts) {
    if (typeof fact.value !== 'string' || !fact.value.trim()) empty.push(`${event.kind}/${fact.label}`)
    else if (BAD.test(fact.value)) broken.push(`${event.kind} ${day(event.jd)} — ${fact.label}: ${fact.value}`)
  }
}

check(`${pool.length} events produce no NaN, undefined or Infinity`, broken.length === 0, broken.slice(0, 4).join('; '))
check('and no empty values', empty.length === 0, empty.slice(0, 4).join('; '))

// Every kind the panel can show has something to say, or the row opens onto
// nothing at all.
const kinds = [...new Set(pool.map((e) => e.kind))]
const silent = kinds.filter((k) => factsFor(pool.find((e) => e.kind === k)).length === 0)
check(`all ${kinds.length} kinds say something`, silent.length === 0, silent.join(', '))

console.log('\nValues with a published answer\n')

/*
 * The eclipse magnitude, which is exactly the disc ratio this reports: the
 * total of 12 August 2026 is magnitude 1.039 and the annular of 17 February
 * 2026 is 0.963, so the two should read 3.9% larger and 3.7% smaller.
 */
const total = find('solar-eclipse', (e) => day(e.jd) === '2026-08-12')
const discs = value(factsFor(total), 'Discs')
const percent = Number(/([\d.]+)%/.exec(discs ?? '')?.[1])
check(
  'the 2026 total eclipse has the Moon 3.9% larger than the Sun',
  /larger/.test(discs ?? '') && Math.abs(percent - 3.9) < 0.4,
  discs,
)

const annular = find('solar-eclipse', (e) => day(e.jd) === '2026-02-17')
const annularDiscs = value(factsFor(annular), 'Discs')
check(
  'and the annular of February has it 3.7% smaller',
  /smaller/.test(annularDiscs ?? '') && Math.abs(Number(/([\d.]+)%/.exec(annularDiscs)?.[1]) - 3.7) < 0.4,
  annularDiscs,
)

/*
 * The shadow-on-Earth duration, which is the one that was silently returning
 * its own search limit. A central eclipse takes one to three and a half hours
 * to cross the Earth — never the 24 minutes the first version reported, and
 * never the four-hour limit the search now allows.
 */
const shadow = value(factsFor(total), 'Shadow on Earth')
const minutes = /(\d+)h (\d+)m/.exec(shadow ?? '')
const crossing = minutes ? Number(minutes[1]) * 60 + Number(minutes[2]) : NaN
check(
  'the umbra takes between an hour and three to cross the Earth',
  crossing > 60 && crossing < 210,
  shadow,
)

// And it is not the limit. A search that returns exactly its own bound is
// reporting the bound, which is what "23m 60s" was.
const limits = []
for (const e of EVENTS.filter((x) => x.kind === 'solar-eclipse' && x.type === 'total').slice(0, 40)) {
  const v = value(factsFor(e), 'Shadow on Earth') ?? ''
  const m = /(\d+)h (\d+)m/.exec(v)
  if (m && Number(m[1]) * 60 + Number(m[2]) >= 239) limits.push(day(e.jd))
}
check('no eclipse reports the search limit as its answer', limits.length === 0, limits.join(', '))

/*
 * New Horizons passed Pluto at 13.78 km/s, and the light-time that day was
 * about four and a half hours — the number everyone waited out for the first
 * pictures.
 */
const pluto = MISSION_EVENTS.find((e) => e.craft === 'sc_new_horizons' && e.body === 'pluto')
const plutoFacts = factsFor(pluto)
const speed = Number(/([\d.]+) km\/s/.exec(value(plutoFacts, 'Passing at') ?? '')?.[1])
check('New Horizons passes Pluto at 13.8 km/s', Math.abs(speed - 13.78) < 0.3, `${speed} km/s`)

const signal = value(plutoFacts, 'From Earth') ?? ''
check(
  'and a signal from it takes about four and a half hours',
  /4\.[3-6] hours/.test(signal),
  signal,
)

/*
 * Internal consistency, which catches a wrong distance that no published value
 * happens to cover: an apparent size and a distance are the same fact said two
 * ways, so they have to agree.
 */
const opposition = find('opposition', (e) => e.body === 'mars' && e.jd > 2461000)
const oppositionFacts = factsFor(opposition)
const auAway = Number(/([\d.]+) AU/.exec(value(oppositionFacts, 'From Earth') ?? '')?.[1])
const arcsec = Number(/([\d.]+)″/.exec(value(oppositionFacts, 'Apparent size') ?? '')?.[1])
const expected = ((2 * Math.atan(3389.5 / (auAway * 149597870.7)) * 180) / Math.PI) * 3600
check(
  "Mars's apparent size agrees with its distance",
  Math.abs(arcsec - expected) < 0.2,
  `${arcsec}″ against ${expected.toFixed(1)}″ at ${auAway} AU`,
)

// A Mars opposition is between 0.37 and 0.68 AU, always — the check that the
// distance itself is sane rather than merely self-consistent.
check('and that distance is a possible one', auAway > 0.36 && auAway < 0.69, `${auAway} AU`)

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
