import { useMemo, useState } from 'react'
import { EVENTS } from '../data/events'
import { MISSION_EVENTS } from '../data/missionEvents'
import { BODIES_BY_ID } from '../data/bodies'
import { dateFromJulian } from '../orbit/kepler'
import { nextShadowTransits } from '../orbit/shadowTransits'
import { setSimulationDate, useStore } from '../store/useStore'
import { factsFor } from './eventFacts'
import './EventPanel.css'

/**
 * What the sky is about to do, and a way to go and watch it.
 *
 * The app could already be scrubbed to any date in two and a half centuries,
 * which is a lot of dates and no reason to prefer any of them. Almost
 * everything worth seeing here happens on a handful of them — an eclipse, an
 * opposition, the rings edge-on — and finding those by dragging a slider is
 * hopeless: the total solar eclipse of 12 August 2026 is about four hours wide
 * on a track that spans nine million.
 *
 * So this is the index to the timeline rather than a feature beside it. Every
 * date in it was found by searching the app's own geometry (see
 * `orbit/events.js`), so clicking one is guaranteed to land on the thing it
 * names — the list cannot drift away from the scene, because one calculation
 * produced both.
 */

/** Which body to fly to, per kind. The event is *about* something. */
const SUBJECT = {
  // A mission event is about the craft, wherever it happens to be.
  'mission-begins': (e) => e.craft,
  flyby: (e) => e.craft,
  arrival: (e) => e.craft,
  landing: (e) => e.craft,
  'mission-ends': (e) => e.craft,
  'solar-eclipse': () => 'earth',
  'lunar-eclipse': () => 'luna',
  'shadow-transit': () => 'jupiter',
  'ring-plane-crossing': () => 'saturn',
  opposition: (e) => e.body,
  'greatest-elongation': (e) => e.body,
  conjunction: (e) => e.body,
  // The small body, not the planet it passes: the approach is the thing that
  // happens to Apophis, and Earth is where it happens.
  'close-approach': (e) => e.body,
}

/**
 * Filters, grouped by what someone is actually looking for.
 *
 * Not one chip per `kind`. Seven filters for six kinds is a menu of the
 * implementation; these are the three questions people arrive with — when is
 * the next eclipse, when is a planet best seen, when do the rings vanish.
 */
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'eclipses', label: 'Eclipses', kinds: ['solar-eclipse', 'lunar-eclipse', 'shadow-transit'] },
  {
    id: 'planets',
    label: 'Planets',
    kinds: ['opposition', 'greatest-elongation', 'conjunction'],
  },
  {
    id: 'missions',
    label: 'Missions',
    kinds: ['mission-begins', 'flyby', 'arrival', 'landing', 'mission-ends'],
  },
  { id: 'rings', label: 'Rings', kinds: ['ring-plane-crossing'] },
  { id: 'approaches', label: 'Near misses', kinds: ['close-approach'] },
]

/**
 * Published approach distances, by body and year.
 *
 * The one place in this file that states a number the app did not compute, and
 * it is deliberate: see the note in the `close-approach` case. JPL's Center for
 * Near-Earth Object Studies is the source, and its figure is measured from the
 * Earth's *centre* — the more quotable number, the height above the ground, is
 * that minus the planet's radius.
 */
const APPROACH_DISTANCE = {
  'apophis:2029':
    '31,600 km above the surface — inside the ring of geostationary satellites (JPL/CNEOS)',
}

const name = (id) => BODIES_BY_ID[id]?.name ?? id
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * How close it came.
 *
 * The number is quoted whenever it is a possible one, and hedged when it is
 * not. An earlier draft hedged on `resolutionKm` — how far the craft moves
 * between samples — on the theory that a coarse encounter deserves a caveat.
 * It does not work: that quantity does not predict the error. Cassini's Earth
 * pass has samples 12,869 km apart and comes out 35 km from the published
 * altitude, and it was being hedged; Juno's Europa pass has them 4,095 km apart
 * and is exact to 2 km. What decides the accuracy is how sharply the path
 * bends, which nothing here can see.
 *
 * So the only claim withheld is the one the data plainly cannot support: two of
 * the forty-four passes come out *inside* the body, where a low perigee is
 * turned through faster than the samples can follow.
 */
function closest(event) {
  const body = name(event.body)
  if (event.altitudeKm > 0) {
    return `${Math.round(event.altitudeKm).toLocaleString()} km above ${body}`
  }
  return `A pass too low and too fast for these samples to measure`
}

function describe(event) {
  switch (event.kind) {
    case 'mission-begins':
      return {
        title: `${name(event.craft)} sets out`,
        detail: 'The first position JPL publishes for it, a day or two after launch',
      }
    case 'flyby':
      return { title: `${name(event.craft)} passes ${name(event.body)}`, detail: closest(event) }
    case 'arrival':
      return {
        title: `${name(event.craft)} reaches ${name(event.body)}`,
        /*
         * Not "and stays N years": `stayDays` runs to the end of the segment,
         * which for a craft still working is the end of JPL's ephemeris rather
         * than the end of anything. It had Mars Odyssey staying 25.0 years,
         * which is a fact about a file.
         */
        detail: `Enters ${name(event.body)}'s gravitational sphere`,
      }
    case 'landing':
      return {
        title: `${name(event.craft)} lands on ${name(event.body)}`,
        detail: `Touchdown at ${place(event.lat, event.lon)}`,
      }
    case 'mission-ends':
      return {
        title: `${name(event.craft)} stops`,
        detail: 'The last position anyone has for it',
      }
    case 'solar-eclipse':
      return {
        title: `${capitalise(event.type)} solar eclipse`,
        detail:
          event.latitude === undefined
            ? 'Partial; the shadow’s axis misses the Earth'
            : `Greatest at ${place(event.latitude, event.longitude)}`,
      }
    case 'lunar-eclipse':
      return {
        title: `${capitalise(event.type)} lunar eclipse`,
        detail:
          event.type === 'penumbral'
            ? 'The Moon only grazes the outer shadow'
            : `Umbral magnitude ${event.umbralMagnitude.toFixed(2)}`,
      }
    case 'opposition':
      return {
        title: `${name(event.body)} at opposition`,
        detail: 'Opposite the Sun — nearest, brightest, and up all night',
      }
    case 'greatest-elongation':
      return {
        title: `${name(event.body)} at greatest elongation ${event.side}`,
        detail: `${event.degrees.toFixed(1)}° from the Sun, in the ${
          event.side === 'east' ? 'evening' : 'morning'
        } sky`,
      }
    case 'conjunction':
      return {
        title: `${name(event.body)} and ${name(event.with)} in conjunction`,
        detail: `${event.degrees.toFixed(2)}° apart`,
      }
    case 'ring-plane-crossing':
      return {
        title: 'Saturn’s rings edge-on',
        detail: 'Earth crosses the ring plane and the rings all but vanish',
      }
    case 'close-approach': {
      /*
       * The distance is *not* the app's own.
       *
       * Every other line in this switch reports a number the app computed, and
       * this one cannot: the elements behind the search are piecewise-linear
       * fits good to a few arcminutes, which at the Earth's distance is
       * hundreds of thousands of kilometres — larger than the approach itself.
       * The app finds the date to within three hours and has no business
       * quoting the separation, so where a published figure exists it is
       * printed with the source named, and where none does the line says only
       * what was searched for.
       */
      const published = APPROACH_DISTANCE[`${event.body}:${new Date((event.jd - 2440587.5) * 86400000).getUTCFullYear()}`]
      return {
        title: `${name(event.body)} passes close to ${name(event.with)}`,
        detail: published ?? 'A close approach, found from the orbits',
      }
    }
    case 'shadow-transit':
      return {
        title: `${name(event.body)}’s shadow crosses Jupiter`,
        detail: `A black dot on the cloud tops for ${event.hours.toFixed(1)} hours`,
      }
    default:
      return { title: event.kind, detail: '' }
  }
}

/** Latitude and longitude as a person would say them. */
function place(latitude, longitude) {
  const ns = latitude >= 0 ? 'N' : 'S'
  const ew = longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(latitude).toFixed(1)}°${ns} ${Math.abs(longitude).toFixed(1)}°${ew}`
}

const FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

/** How many events to list. Enough to scroll, few enough to read. */
const AHEAD = 24
const BEHIND = 2

/**
 * The open row's extra facts.
 *
 * Its own component so the work is keyed to the row being open: mount it and
 * the facts are computed, unmount it and they are gone. Nothing is cached,
 * because nothing needs to be — one event costs an eclipse solve or a couple of
 * ephemeris lookups, and it happens on a click.
 */
function EventFacts({ event }) {
  const facts = useMemo(() => factsFor(event), [event])
  if (!facts.length) return null
  return (
    <dl className="events__facts">
      {facts.map((fact) => (
        <div className="events__fact" key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function EventPanel() {
  const open = useStore((s) => s.eventsOpen)
  const toggleEvents = useStore((s) => s.toggleEvents)
  const filter = useStore((s) => s.eventFilter)
  const setEventFilter = useStore((s) => s.setEventFilter)
  /*
   * `revealAndSelect`, not `selectPlanet`: half of what this panel offers to
   * fly to is behind a switched-off layer. Every spacecraft is, and the
   * spacecraft events are most of the list.
   */
  const revealAndSelect = useStore((s) => s.revealAndSelect)

  /*
   * The date drives the list, so it has to come from the *display* clock rather
   * than `simClock`, which is mutated sixty times a second outside React and
   * would re-render this on every frame.
   */
  const displayJD = useStore((s) => s.displayJD)

  const kinds = useMemo(() => FILTERS.find((f) => f.id === filter)?.kinds ?? null, [filter])

  /*
   * Jupiter's shadow transits are searched rather than baked — there are eight
   * hundred a year — so they are found only when the panel is open and only for
   * the days on screen. Keyed on the whole day so that scrubbing within one day
   * does not re-run the search on every tick.
   */
  const day = Math.floor(displayJD)
  const transits = useMemo(
    () => (open && (!kinds || kinds.includes('shadow-transit')) ? nextShadowTransits(day, 6) : []),
    [open, kinds, day],
  )

  const listed = useMemo(() => {
    if (!open) return []

    const pool = [...EVENTS, ...MISSION_EVENTS, ...transits]
      .filter((e) => !kinds || kinds.includes(e.kind))
      .sort((a, b) => a.jd - b.jd)

    // The first event not yet past, then a window either side of it. A couple
    // of recent ones because "did I just miss it" is a real question, and the
    // panel is otherwise silent about a date you have deliberately scrubbed to.
    let first = pool.findIndex((e) => e.jd >= displayJD)
    if (first === -1) first = pool.length
    return pool.slice(Math.max(0, first - BEHIND), first + AHEAD).map((e) => ({
      ...e,
      past: e.jd < displayJD,
    }))
  }, [open, kinds, transits, displayJD])

  /*
   * Which row is open, and its facts.
   *
   * One at a time, and computed on demand — see `eventFacts.js`. Doing it for
   * the whole list would be four thousand eclipse solves to fill a panel
   * showing twenty-six rows, and most of them will never be looked at.
   */
  const [openKey, setOpenKey] = useState(null)

  const go = (event, key) => {
    /*
     * Clicking the open row closes it and goes nowhere. Anything else opens
     * and travels — the two are one gesture, because a row you have opened to
     * read about is a row you are deciding whether to visit, and making that
     * two clicks would put the answer behind the question.
     */
    if (openKey === key) {
      setOpenKey(null)
      return
    }
    setOpenKey(key)
    setSimulationDate(event.jd)
    const subject = SUBJECT[event.kind]?.(event)
    if (subject) revealAndSelect(subject)
  }

  return (
    <div className={`events${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="events__toggle"
        onClick={toggleEvents}
        aria-expanded={open}
      >
        <span className="events__toggle-label">Events</span>
        <span className="events__chevron" aria-hidden="true" />
      </button>

      {/*
        The wheel belongs to this list, including at its ends.

        `CameraController` otherwise applies the rule it uses for thin overlays —
        a control that has run out of scroll passes the gesture on — and for an
        open list of four thousand events that is wrong: reaching the last row
        and carrying on flung the camera in and out behind the panel. The marker
        makes the panel's rectangle claim the wheel outright, which is what the
        nav dock and the search palette already do. See `wheelOwner`.
      */}
      {open && (
        <div className="events__body" data-wheel="ui">
          <div className="events__filters" role="group" aria-label="Event kinds">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`events__filter${filter === f.id ? ' is-active' : ''}`}
                onClick={() => setEventFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <ul className="events__list">
            {listed.map((event, i) => {
              const { title, detail } = describe(event)
              const key = `${event.kind}-${event.jd}-${i}`
              const open = openKey === key
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`events__row${event.past ? ' is-past' : ''}${
                      open ? ' is-open' : ''
                    }`}
                    onClick={() => go(event, key)}
                    aria-expanded={open}
                  >
                    <span className="events__when">{FORMAT.format(dateFromJulian(event.jd))}</span>
                    <span className="events__title">{title}</span>
                    <span className="events__detail">{detail}</span>
                  </button>
                  {open && <EventFacts event={event} />}
                </li>
              )
            })}
            {listed.length === 0 && (
              <li className="events__empty">Nothing of this kind left before 2050.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
