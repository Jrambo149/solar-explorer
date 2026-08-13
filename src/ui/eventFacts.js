/**
 * What else is true about an event, worked out when you ask.
 *
 * The list gives an event a line; this gives it a paragraph — how far away, how
 * long it lasts, how fast the craft was going. None of it is stored. Every fact
 * here is computed from the same orbits and trajectories that put the event in
 * the list, at the instant the row is opened, which is why the file is a set of
 * pure functions over a single event rather than more columns in a baked table.
 *
 * That is not only tidiness. A baked column is a claim frozen at build time; a
 * computed one cannot disagree with the scene, because the scene is where it
 * came from. And the cost is one event's worth of arithmetic on a click, where
 * the same thing across four thousand rows would be a table three times the
 * size of the one it annotates.
 *
 * ## Real distances, not drawn ones
 *
 * Everything here works in AU and kilometres, before `frames.js` compresses the
 * solar system into something that fits on a screen. A "distance to Earth" read
 * off the drawn positions would be a fact about the diorama.
 */

import { BODIES_BY_ID } from '../data/bodies.js'
import { KM_PER_AU } from '../orbit/frames.js'
import { centuriesSinceJ2000, positionAt } from '../orbit/kepler.js'
import { lunaPosition } from '../orbit/luna.js'
import { earthMoonSun, lunarEclipseAt, solarEclipseAt, surfacePoint } from '../orbit/eclipse.js'
import { bodyBasis, primeMeridianAt } from '../scene/pole.js'
import { dateFromJulian } from '../orbit/kepler.js'
import { segmentAt, sampleSegment } from '../orbit/trajectory.js'

/* The elements the eclipse geometry needs, from the assembled roster rather
   than from `planetData` — `bodies.js` is where elements are attached. */
const EARTH = BODIES_BY_ID.earth
/** Light travels this far in a second. */
const KM_PER_LIGHT_SECOND = 299792.458

const length = (v) => Math.hypot(v.x, v.y, v.z)
const between = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/** Heliocentric position in AU, for anything with elements. */
function heliocentric(id, jd) {
  const body = BODIES_BY_ID[id]
  if (!body) return null
  if (id === 'luna') {
    const earth = positionAt(BODIES_BY_ID.earth.elements, centuriesSinceJ2000(jd))
    const moon = lunaPosition(jd)
    return { x: earth.x + moon.x, y: earth.y + moon.y, z: earth.z + moon.z }
  }
  if (body.elements) {
    const local = positionAt(body.elements, centuriesSinceJ2000(jd))
    if (!body.parent) return local
    const parent = heliocentric(body.parent, jd)
    return parent ? { x: parent.x + local.x, y: parent.y + local.y, z: parent.z + local.z } : null
  }
  // A spacecraft: sampled, and in whatever frame holds it at this instant.
  if (body.kind === 'spacecraft') {
    const segment = segmentAt(body, jd)
    if (!segment) return null
    const local = sampleSegment(segment, jd)
    if (segment.frame === 'sun') return { x: local.x, y: local.y, z: local.z }
    const parent = heliocentric(segment.frame, jd)
    return parent ? { x: parent.x + local.x, y: parent.y + local.y, z: parent.z + local.z } : null
  }
  return null
}

/* ---- how numbers are said ---- */

const km = (n) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million km`
    : `${Math.round(n).toLocaleString()} km`

const au = (n) => `${n.toFixed(n < 10 ? 3 : 2)} AU`

/** A duration, in the largest unit that still says something. */
function duration(days) {
  const seconds = days * 86400
  if (seconds < 90) return `${seconds.toFixed(0)} seconds`
  if (seconds < 5400) {
    // Rounded first, then split — the other way round gives "23m 60s".
    const whole = Math.round(seconds)
    const m = Math.floor(whole / 60)
    const s = whole - m * 60
    return s ? `${m}m ${s}s` : `${m} minutes`
  }
  if (days < 2) {
    const h = Math.floor(seconds / 3600)
    const m = Math.round((seconds - h * 3600) / 60)
    return m ? `${h}h ${m}m` : `${h} hours`
  }
  if (days < 400) return `${Math.round(days)} days`
  return `${(days / 365.25).toFixed(1)} years`
}

/** Light-time, which is the honest way to say how far away something is. */
function lightTime(kmDistance) {
  const seconds = kmDistance / KM_PER_LIGHT_SECOND
  if (seconds < 90) return `${seconds.toFixed(1)} seconds`
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} minutes`
  return `${(seconds / 3600).toFixed(1)} hours`
}

/** How wide something looks, in arcseconds or arcminutes. */
function apparentSize(radiusKm, distanceKm) {
  const arcsec = ((2 * Math.atan(radiusKm / distanceKm) * 180) / Math.PI) * 3600
  return arcsec >= 120 ? `${(arcsec / 60).toFixed(1)}′` : `${arcsec.toFixed(1)}″`
}

/* ---- durations that have to be searched for ---- */

/**
 * How long a condition holds around `jd`, by walking out from it.
 *
 * Used for the two eclipse durations, which are not stored anywhere: the baked
 * event is the instant of greatest eclipse, and "how long is totality" is a
 * question about the interval either side of it. Walks out in `step` until the
 * test fails, then bisects the crossing — the same shape as the contact search
 * in `shadowTransits`, at a resolution nobody will notice.
 */
function windowAround(jd, test, step, limit) {
  if (!test(jd)) return 0
  const edge = (direction) => {
    let inside = jd
    let outside = null
    for (let t = step; t <= limit; t += step) {
      const at = jd + direction * t
      if (!test(at)) {
        outside = at
        break
      }
      inside = at
    }
    if (outside === null) return inside
    for (let i = 0; i < 24; i++) {
      const mid = (inside + outside) / 2
      if (test(mid)) inside = mid
      else outside = mid
    }
    return inside
  }
  return edge(1) - edge(-1)
}

/* ---- the facts, per kind ---- */

/** A place on the Earth, said the way an atlas would. */
function placeOf(jd) {
  const hit = solarEclipseAt(jd, EARTH.elements)
  if (!hit) return null
  const p = surfacePoint(hit.point, bodyBasis('earth', jd), primeMeridianAt('earth', jd))
  const ns = p.latitude >= 0 ? 'N' : 'S'
  const ew = p.longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(p.latitude).toFixed(1)}°${ns} ${Math.abs(p.longitude).toFixed(1)}°${ew}`
}

const CLOCK = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

/**
 * Where the shadow touches down and where it leaves, by walking out from
 * greatest eclipse until the axis misses the Earth.
 *
 * This is the fact the panel was missing, and its absence is a genuine trap
 * rather than a nicety: the time on the event is the instant of *greatest*
 * eclipse, and for 12 August 2026 that is the Atlantic north of Iceland. Spain
 * — where most people watched it — is forty-five minutes further on, and
 * someone who jumps to the event and sees no shadow over Spain has been told
 * something misleading by omission.
 */
function trackEnds(jd) {
  const step = 2 / 1440
  const edge = (direction) => {
    let inside = jd
    for (let t = step; t <= 3 / 24; t += step) {
      const at = jd + direction * t
      if (!solarEclipseAt(at, EARTH.elements)) {
        let outside = at
        for (let i = 0; i < 20; i++) {
          const mid = (inside + outside) / 2
          if (solarEclipseAt(mid, EARTH.elements)) inside = mid
          else outside = mid
        }
        break
      }
      inside = at
    }
    return inside
  }
  return { from: edge(-1), to: edge(1) }
}

function solarEclipseFacts(event) {
  const at = solarEclipseAt(event.jd, EARTH.elements)
  const facts = []

  if (at) {
    /*
     * The ratio of the two discs, which is the whole story of an eclipse: over
     * 1 and the Moon covers the Sun with room to spare, under it and a ring of
     * Sun is left however perfect the alignment. It is why annular eclipses
     * exist at all, and it changes because the Moon's distance does.
     */
    const ratio = at.moonAngularRadius / at.sunAngularRadius
    facts.push({
      label: 'Discs',
      value: `The Moon looks ${(Math.abs(ratio - 1) * 100).toFixed(1)}% ${
        ratio >= 1 ? 'larger' : 'smaller'
      } than the Sun`,
    })
  }

  if (event.type === 'total' || event.type === 'annular') {
    /*
     * How long the shadow is anywhere on the Earth — **not** how long totality
     * lasts where you are standing.
     *
     * The two are wildly different and it is worth being plain about which is
     * which: the umbra sweeps the Earth for a couple of hours, while any one
     * place on the track is inside it for a couple of minutes. The second needs
     * the umbra's width and the speed it travels at, which is more geometry
     * than this panel is doing; the first falls straight out of the search that
     * already exists.
     *
     * The first draft claimed the second and computed neither. It searched ±12
     * minutes for a condition that holds for hours, so it returned its own
     * search limit — 24 minutes, printed as "23m 60s", for an eclipse whose
     * real totality is 2m 18s.
     */
    const held = windowAround(
      event.jd,
      (t) => {
        const s = solarEclipseAt(t, EARTH.elements)
        return !!s && s.total === (event.type === 'total')
      },
      5 / 1440,
      4 / 24,
    )
    if (held > 0) {
      facts.push({
        label: 'Shadow on Earth',
        value: `The ${event.type === 'total' ? 'umbra' : 'antumbra'} crosses the Earth over ${duration(held)}`,
      })
    }
  }

  if (event.latitude !== undefined) {
    const { from, to } = trackEnds(event.jd)
    const start = placeOf(from)
    const end = placeOf(to)
    if (start && end) {
      facts.push({
        label: 'Shadow track',
        value: `${CLOCK.format(dateFromJulian(from))} at ${start} → ${CLOCK.format(dateFromJulian(to))} at ${end}, all UTC`,
      })
      facts.push({
        label: 'Greatest at',
        value: `${CLOCK.format(dateFromJulian(event.jd))} — the moment shown, not the whole track`,
      })
    }
  }

  const { sun, moon } = earthMoonSun(event.jd, EARTH.elements)
  facts.push({ label: 'The Moon', value: `${km(length(moon))} from Earth` })
  facts.push({ label: 'The Sun', value: `${au(length(sun) / KM_PER_AU)} away` })
  return facts
}

function lunarEclipseFacts(event) {
  const facts = []
  const at = lunarEclipseAt(event.jd, EARTH.elements)

  if (event.type !== 'penumbral') {
    const total = windowAround(
      event.jd,
      (t) => lunarEclipseAt(t, EARTH.elements).phase === 'total',
      2 / 1440,
      120 / 1440,
    )
    const umbral = windowAround(
      event.jd,
      (t) => {
        const p = lunarEclipseAt(t, EARTH.elements).phase
        return p === 'total' || p === 'partial'
      },
      4 / 1440,
      300 / 1440,
    )
    if (total > 0) facts.push({ label: 'Totality', value: duration(total) })
    if (umbral > 0) facts.push({ label: 'In the umbra', value: duration(umbral) })
  }

  facts.push({
    label: 'Depth',
    value: `${(event.umbralMagnitude ?? at.umbralMagnitude).toFixed(2)} of the Moon's diameter inside the umbra`,
  })
  facts.push({
    label: 'Seen from',
    value: 'Anywhere the Moon is up — the shadow is on it, not on us',
  })
  return facts
}

function bodyFacts(id, jd, extra = []) {
  const body = BODIES_BY_ID[id]
  const here = heliocentric(id, jd)
  const earth = heliocentric('earth', jd)
  if (!body || !here || !earth) return extra

  const fromEarth = between(here, earth) * KM_PER_AU
  const facts = [
    { label: 'From Earth', value: `${au(fromEarth / KM_PER_AU)} — ${lightTime(fromEarth)} at light speed` },
    { label: 'From the Sun', value: au(length(here)) },
  ]
  if (body.radiusKm) {
    facts.push({ label: 'Apparent size', value: `${apparentSize(body.radiusKm, fromEarth)} across` })
  }
  return [...extra, ...facts]
}

/** A spacecraft's speed relative to whatever holds it, in km/s. */
function speedKmPerSecond(craft, jd) {
  const segment = segmentAt(craft, jd)
  if (!segment) return null
  const step = Math.min(segment.step, 60 / 86400) // a minute, or less
  const a = sampleSegment(segment, jd - step / 2)
  const b = sampleSegment(segment, jd + step / 2, { x: 0, y: 0, z: 0, frame: null })
  return (between(a, b) * KM_PER_AU) / (step * 86400)
}

function missionFacts(event) {
  const craft = BODIES_BY_ID[event.craft]
  const facts = []

  if (event.kind === 'flyby') {
    if (event.altitudeKm > 0) {
      facts.push({
        label: 'Closest approach',
        value: `${km(event.altitudeKm)} above ${BODIES_BY_ID[event.body]?.name ?? event.body}`,
      })
    }
    const speed = speedKmPerSecond(craft, event.jd)
    if (speed) {
      facts.push({
        label: 'Passing at',
        value: `${speed.toFixed(1)} km/s relative to ${BODIES_BY_ID[event.body]?.name ?? event.body}`,
      })
    }
    /*
     * The precision, said plainly. `resolutionKm` is how far the craft moves
     * between the samples either side of closest approach — where that dwarfs
     * the altitude, the altitude is an estimate, and two of the forty-four
     * flybys come out marginally inside the body they pass.
     */
    if (event.resolutionKm > Math.max(event.altitudeKm, 0)) {
      facts.push({
        label: 'Precision',
        value: `Sampled every ${km(event.resolutionKm)} of flight — the altitude is an estimate`,
      })
    }
  }

  if (event.kind === 'arrival') {
    facts.push({
      label: 'What this is',
      value: `The instant ${BODIES_BY_ID[event.body]?.name ?? event.body} takes over its motion, not an engine burn`,
    })
  }

  if (event.kind === 'landing') {
    facts.push({ label: 'Site', value: `${event.lat.toFixed(3)}°, ${event.lon.toFixed(3)}°` })
  }

  const here = heliocentric(event.craft, event.jd)
  const earth = heliocentric('earth', event.jd)
  if (here && earth) {
    const fromEarth = between(here, earth) * KM_PER_AU
    facts.push({
      label: 'From Earth',
      value: `${au(fromEarth / KM_PER_AU)} — a signal takes ${lightTime(fromEarth)}`,
    })
    facts.push({ label: 'From the Sun', value: au(length(here)) })
  }

  const window = craft?.segments?.length
    ? { start: craft.segments[0].t0, end: craft.segments[craft.segments.length - 1].t1 }
    : null
  if (window && event.kind !== 'mission-begins') {
    facts.push({ label: 'Mission elapsed', value: duration(event.jd - window.start) })
  }
  return facts
}

/**
 * Everything worth saying about one event, as label/value pairs.
 *
 * Returns an empty array rather than throwing for a kind with nothing extra to
 * add — the panel simply shows the line it already had.
 */
export function factsFor(event) {
  switch (event.kind) {
    case 'solar-eclipse':
      return solarEclipseFacts(event)
    case 'lunar-eclipse':
      return lunarEclipseFacts(event)
    case 'opposition':
      return bodyFacts(event.body, event.jd, [
        { label: 'Why it matters', value: 'Nearest to Earth and lit full-face, all night' },
      ])
    case 'greatest-elongation':
      return bodyFacts(event.body, event.jd, [
        {
          label: 'Elongation',
          value: `${event.degrees.toFixed(1)}° from the Sun, ${
            event.side === 'east' ? 'setting after it' : 'rising before it'
          }`,
        },
      ])
    case 'conjunction':
      return bodyFacts(event.body, event.jd, [
        {
          label: 'Separation',
          value: `${event.degrees.toFixed(2)}° — about ${(event.degrees / 0.5).toFixed(1)} Moon widths`,
        },
      ])
    case 'ring-plane-crossing':
      return bodyFacts('saturn', event.jd, [
        {
          label: 'What happens',
          value: 'Earth crosses the ring plane and the rings all but disappear',
        },
      ])
    case 'shadow-transit':
      return [
        { label: 'Duration', value: duration(event.hours / 24) },
        {
          label: 'What to look for',
          value: `A hard black dot of ${BODIES_BY_ID[event.body]?.name ?? event.body}'s shadow crossing the cloud tops`,
        },
        ...bodyFacts('jupiter', event.jd),
      ]
    case 'mission-begins':
    case 'flyby':
    case 'arrival':
    case 'landing':
    case 'mission-ends':
      return missionFacts(event)
    default:
      return []
  }
}
