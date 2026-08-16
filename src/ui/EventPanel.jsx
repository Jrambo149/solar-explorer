import { useEffect, useMemo, useRef, useState } from 'react'
import { EVENTS } from '../data/events'
import { MISSION_EVENTS } from '../data/missionEvents'
import { BODIES_BY_ID } from '../data/bodies'
import { LANDED_CRAFT } from '../data/landedCraft'
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

/**
 * Every event, in one list.
 *
 * This used to show a window — two behind the clock and twenty-four ahead —
 * which reads as a reasonable summary and is actually a wall: scroll to the
 * bottom and the list simply stops, with four thousand more events on the other
 * side of it and no way to say so. There is nothing special about the
 * twenty-fifth event.
 *
 * So the whole pool is rendered, and the list opens scrolled to the clock
 * rather than to the year 1800. Four and a half thousand rows is a lot of DOM
 * and it is a static list — no per-row work happens until a row is opened, and
 * the facts behind a row are still computed only for the one that is.
 *
 * The one thing still windowed is Jupiter's shadow transits, and unavoidably:
 * they are *searched* rather than baked, at about eight hundred a year, so the
 * whole timeline would be two hundred thousand of them. Six days either side of
 * the clock is what `nextShadowTransits` is asked for, and the filter row says
 * so.
 */

/** How far either side of the clock to look for shadow transits, in days. */
const TRANSIT_DAYS = 6

/** Case and punctuation removed, so "near-miss" finds "near miss". */
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * What a search matches against: the words the row actually shows.
 *
 * Built from `describe`, which is the same function that writes the title and
 * the detail line — so searching for "Perseverance" finds the rows that say
 * Perseverance, and there is no second description that could disagree with the
 * first. The kind is folded in too, in a readable form, so "eclipse" finds the
 * eclipses even though no row spells the word out, and the year is added
 * because a date is the most obvious thing to search a timeline for.
 *
 * Cached per event object. The pool is four and a half thousand and the objects
 * are stable for the life of the module, so this is computed once per event
 * however many keystrokes go past it.
 */
const SEARCH_TEXT = new WeakMap()

/**
 * `describe`, remembered per event.
 *
 * It is pure and its input objects live for the life of the module, so the
 * answer can only ever be computed once. With the panel listing all 4,349
 * events rather than twenty-six, it is called once per row per render and again
 * for every event on every keystroke in the search, which is where this earns
 * its place.
 *
 * It does *not* make the panel open faster, which was the guess: measured, that
 * is 516 ms before and 524 after, because what opening costs is building four
 * thousand DOM rows and not describing them. Kept for the search path, and the
 * number recorded here so the next person does not re-measure it hoping.
 */
const DESCRIBED = new WeakMap()

function described(event) {
  let d = DESCRIBED.get(event)
  if (d === undefined) {
    d = describe(event)
    DESCRIBED.set(event, d)
  }
  return d
}

function searchText(event) {
  let text = SEARCH_TEXT.get(event)
  if (text === undefined) {
    const { title, detail } = described(event)
    const year = new Date((event.jd - 2440587.5) * 86400000).getUTCFullYear()
    /*
     * Both names of a landed craft, and the row can only show one of them.
     *
     * The app calls the same rover Mars 2020 before February 2021 and
     * Perseverance after — see `bodyNameFor` — so `describe` writes whichever
     * the event's own date calls for, and searching the other found nothing.
     * The search palette indexes both for exactly this reason; so does this.
     */
    const alias = event.craft ? LANDED_CRAFT[event.craft]?.name : null
    text = squash(`${title} ${detail ?? ''} ${alias ?? ''} ${event.kind} ${year}`)
    SEARCH_TEXT.set(event, text)
  }
  return text
}

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
  const setScaleMode = useStore((s) => s.setScaleMode)

  /*
   * The date drives the list, so it has to come from the *display* clock rather
   * than `simClock`, which is mutated sixty times a second outside React and
   * would re-render this on every frame.
   */
  const displayJD = useStore((s) => s.displayJD)

  const kinds = useMemo(() => FILTERS.find((f) => f.id === filter)?.kinds ?? null, [filter])

  /* Declared above `listed`, which reads the query in its dependency array. */
  const [query, setQuery] = useState('')
  const listRef = useRef(null)
  const anchorRef = useRef(null)

  /*
   * Jupiter's shadow transits are searched rather than baked — there are eight
   * hundred a year — so they are found only when the panel is open and only for
   * the days on screen. Keyed on the whole day so that scrubbing within one day
   * does not re-run the search on every tick.
   */
  const day = Math.floor(displayJD)
  const transits = useMemo(
    () =>
      open && (!kinds || kinds.includes('shadow-transit'))
        ? nextShadowTransits(day, TRANSIT_DAYS)
        : [],
    [open, kinds, day],
  )

  const listed = useMemo(() => {
    if (!open) return []

    const q = squash(query)
    return [...EVENTS, ...MISSION_EVENTS, ...transits]
      .filter((e) => !kinds || kinds.includes(e.kind))
      .filter((e) => !q || searchText(e).includes(q))
      .sort((a, b) => a.jd - b.jd)
      .map((e) => ({ ...e, past: e.jd < displayJD }))
  }, [open, kinds, transits, displayJD, query])

  /**
   * The first event not yet past — where the list is scrolled to.
   *
   * The anchor rather than the boundary it used to be: everything before it is
   * still in the list, above the fold, which is where "did I just miss it"
   * gets answered without the panel having to guess how many to keep.
   */
  /* What the placeholder counts: everything the current filter admits, before
     the query narrows it. Saying "search 4,341 events" over a filter showing 35
     would be a lie about which list you are typing into. */
  const listedTotal = useMemo(() => {
    if (!open) return 0
    return (
      EVENTS.filter((e) => !kinds || kinds.includes(e.kind)).length +
      MISSION_EVENTS.filter((e) => !kinds || kinds.includes(e.kind)).length +
      transits.length
    )
  }, [open, kinds, transits])

  const anchor = useMemo(() => {
    const at = listed.findIndex((e) => !e.past)
    return at === -1 ? Math.max(0, listed.length - 1) : at
  }, [listed])

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

    /*
     * A close approach is only visible at true scale, and this is the one kind
     * where that is worth forcing.
     *
     * The scale dial exists because the solar system is mostly empty: at the
     * diorama end the planets are inflated enormously so that there is anything
     * to look at. Apophis passes 31,600 km above the Earth's surface, which at
     * that end of the dial is *inside the drawn Earth* — measured at 0.03 Earth
     * radii from its centre, buried thirty-six deep in the model. The event
     * would open, the camera would arrive, and there would be nothing there.
     *
     * Measured across the dial: 0.03 Earth radii at diorama, 0.11 at the
     * middle, 0.74 at nine tenths, and 12 at true scale. There is exactly one
     * setting that shows this event, so going to it goes there — the same
     * reasoning, and the same conclusion, as standing on a surface.
     */
    if (event.kind === 'close-approach') setScaleMode(1)

    const subject = SUBJECT[event.kind]?.(event)
    if (subject) revealAndSelect(subject)
  }

  /*
   * Open the list at the clock, not at 1800.
   *
   * On opening, and on changing what is listed — a different filter or a new
   * search brings a different set, and leaving the scroll where it was would
   * show an arbitrary slice of it. Deliberately *not* keyed on the date: the
   * clock ticks several times a second while playing, and re-scrolling on each
   * tick would tear the list out from under anyone reading it.
   *
   * A search jumps to the top instead. Matches are ordered by date and the
   * first one is the answer to "when was that" as often as the next upcoming
   * one is.
   */
  useEffect(() => {
    if (!open) return
    if (query) {
      listRef.current?.scrollTo({ top: 0 })
      return
    }
    anchorRef.current?.scrollIntoView({ block: 'start' })
    /*
     * Deliberately *not* keyed on the list's contents or its length.
     *
     * It was keyed on `listed.length`, which looked harmless and was not: the
     * pool includes Jupiter's shadow transits, and those are searched afresh
     * for a window around the clock, so their number changes as the day
     * advances. With the clock playing, the list re-anchored every time it did
     * — which is to say the panel snatched itself back to the present every few
     * seconds and could not be scrolled at all.
     *
     * It took a check to see it. A person would have called it "the events
     * panel feels sticky" and never known why, and nothing here throws.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter, query])

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

          {/* The field sits under the filters, because the filters narrow what
              is searched: "eclipse" inside Missions finds nothing, and that is
              the honest answer rather than a surprise. */}
          <div className="events__search">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              className="events__search-input"
              value={query}
              placeholder={`Search ${listedTotal.toLocaleString()} events`}
              aria-label="Search events"
              autoComplete="off"
              spellCheck="false"
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="events__search-clear"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                ×
              </button>
            )}
          </div>

          <ul className="events__list" ref={listRef}>
            {listed.map((event, i) => {
              const { title, detail } = described(event)
              const key = `${event.kind}-${event.jd}-${i}`
              const open = openKey === key
              return (
                <li key={key} ref={i === anchor ? anchorRef : null}>
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
            {/* Two different emptinesses, and they were one message.

                "Nothing of this kind left before 2050" was true when the list
                ran forward from the clock and could genuinely run out of
                future. It lists the whole timeline now, so an empty list means
                the filter has no events at all — or, far more often, that a
                search found nothing, which is a different thing to say and the
                only one of the two that is actionable. */}
            {listed.length === 0 && (
              <li className="events__empty">
                {query
                  ? `Nothing in these events answers to “${query}”.`
                  : 'Nothing of this kind anywhere on the timeline.'}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
