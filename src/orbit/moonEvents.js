import { KM_PER_AU } from './frames.js'
import { lunarEclipses } from './events.js'
import { lunaPosition } from './luna.js'
import { nextPhaseAfter } from './moonPhase.js'

/**
 * The Moon's special nights, searched rather than listed.
 *
 * Every one of these is found by running the app's own geometry forward and
 * looking for the condition — the same approach `events.js` takes to eclipses
 * and oppositions. Nothing here is a table of dates somebody typed in, which
 * matters because a typed table is right until the year it runs out and then
 * silently stops having answers.
 *
 * ## The definitions, and which of them are real
 *
 * **Blood Moon** is the only one that is pure physics: a *total* lunar eclipse,
 * where the Moon is entirely inside the Earth's umbra and turns red because the
 * only light reaching it has been bent through our atmosphere. That comes
 * straight from `lunarEclipses`.
 *
 * **Supermoon** and **micromoon** are not astronomical terms at all — they were
 * coined by an astrologer in 1979 and adopted by everyone since. There is no
 * governing definition, so this uses the common one: a full Moon within 90% of
 * the closest perigee it reaches, which works out near 360,000 km. Anyone
 * quoting a different threshold is not wrong, because there isn't one.
 *
 * **Blue Moon** here is the calendar sense — the second full Moon in a calendar
 * month. That meaning is famously a mistake: it began as a misreading of the
 * Maine Farmers' Almanac in a 1946 article, where the original rule was the
 * third full Moon in a season with four. The mistaken version is the one
 * everybody now means, so it is the one computed, and the panel says as much.
 * It also depends on the time zone, since "which month" does — these are UTC.
 */

/** Full Moon to full Moon, in days. */
const SYNODIC_DAYS = 29.53059

/**
 * Perigee and apogee, in km — the Moon's orbit is eccentric enough that the
 * difference is visible: about 14% in apparent width between the extremes.
 */
const PERIGEE_KM = 356500
const APOGEE_KM = 406700

/** The common supermoon line: within 90% of the closest perigee. */
const SUPERMOON_KM = PERIGEE_KM + (APOGEE_KM - PERIGEE_KM) * 0.1
/** And the other end, for a micromoon. */
const MICROMOON_KM = APOGEE_KM - (APOGEE_KM - PERIGEE_KM) * 0.1

/** The Moon's distance from the Earth's centre at a Julian date, in km. */
export function lunarDistanceKm(jd) {
  const m = lunaPosition(jd)
  return Math.hypot(m.x, m.y, m.z) * KM_PER_AU
}

const toDate = (jd) => new Date((jd - 2440587.5) * 86400000)

/**
 * Every full Moon between two dates, with its distance.
 *
 * Stepped by solving for the next one each time rather than by adding 29.53
 * days: the synodic month varies by up to half a day either side of its mean,
 * and adding a constant would drift far enough over a few years to miss which
 * calendar month a full Moon lands in — which is exactly what the blue Moon
 * test turns on.
 */
export function fullMoons(from, to, earthElements) {
  const out = []
  let jd = from
  while (out.length < 200) {
    jd = nextPhaseAfter(jd, 180, earthElements)
    if (jd > to) break
    out.push({ jd, distanceKm: lunarDistanceKm(jd) })
  }
  return out
}

/**
 * The Moon's notable nights in a window, in date order.
 *
 * `limit` caps what comes back, because the panel shows a handful and the
 * search would happily run to the end of the app's timeline.
 */
export function moonEvents(from, to, earthElements, limit = 6) {
  const events = []

  /* Total eclipses only. A partial is worth knowing about but it does not turn
     the Moon red, and calling it a blood Moon would be the panel overclaiming. */
  for (const eclipse of lunarEclipses(from, to, earthElements)) {
    if (eclipse.type === 'total') {
      events.push({
        kind: 'blood-moon',
        jd: eclipse.jd,
        name: 'Blood Moon',
        note: 'A total lunar eclipse. The Moon passes fully into the Earth’s shadow and turns red, lit only by sunlight bent through our atmosphere — every sunrise and sunset on Earth at once.',
      })
    } else if (eclipse.type === 'partial') {
      events.push({
        kind: 'lunar-eclipse',
        jd: eclipse.jd,
        name: 'Partial lunar eclipse',
        note: `Part of the Moon enters the Earth’s umbra — ${(eclipse.umbralMagnitude * 100).toFixed(0)}% of it at maximum — so a dark bite is taken out of one edge.`,
      })
    }
  }

  const moons = fullMoons(from, to, earthElements)

  for (const [index, moon] of moons.entries()) {
    if (moon.distanceKm <= SUPERMOON_KM) {
      events.push({
        kind: 'supermoon',
        jd: moon.jd,
        name: 'Supermoon',
        note: `A full Moon near perigee, ${Math.round(moon.distanceKm).toLocaleString('en-US')} km away — about ${(((APOGEE_KM - moon.distanceKm) / moon.distanceKm) * 100).toFixed(0)}% wider than one at its furthest, though almost nobody can tell by eye.`,
      })
    } else if (moon.distanceKm >= MICROMOON_KM) {
      events.push({
        kind: 'micromoon',
        jd: moon.jd,
        name: 'Micromoon',
        note: `A full Moon near apogee, ${Math.round(moon.distanceKm).toLocaleString('en-US')} km away — the smallest and faintest full Moon of its year.`,
      })
    }

    /* Two full Moons inside one calendar month. Compared against the previous
       full Moon rather than counted per month, so the test is local. */
    const previous = moons[index - 1]
    if (previous) {
      const a = toDate(previous.jd)
      const b = toDate(moon.jd)
      if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
        events.push({
          kind: 'blue-moon',
          jd: moon.jd,
          name: 'Blue Moon',
          note: 'The second full Moon in a calendar month. It is not blue and the definition is a 1946 misreading of an almanac — but it is the one everybody means now.',
        })
      }
    }
  }

  return events.sort((x, y) => x.jd - y.jd).slice(0, limit)
}
