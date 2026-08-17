import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { BODIES } from '../data/bodies'
import { CONSTELLATION_REGIONS } from '../data/constellations'
import { isFlying } from '../orbit/trajectory'
import { landedCraft } from '../data/landedCraft'
import { useStore } from '../store/useStore'
import { useNamer } from './useBodyName'
import {
  CATEGORIES,
  categoryEntries,
  groupByParent,
  groupByTarget,
  groupResults,
  resultContext,
  searchAll,
} from './bodySearch'
import './SearchPalette.css'

/**
 * Type a name, go there.
 *
 * The app draws five hundred and fifteen bodies and the nav bar can offer
 * perhaps forty at a time, arranged by a taxonomy you have to already know to
 * use: Phoebe is four clicks deep behind Moons → Saturn → Minor → Norse. That
 * is a fine way to *browse* a family and a bad way to reach one thing whose
 * name you already have.
 *
 * Centred rather than docked to an edge, which is not a stylistic choice — all
 * four corners are taken (header, controls, nav dock, events and timeline), and
 * this is modal anyway: while it is open, typing means typing.
 *
 * Selection goes through `revealAndSelect` rather than `selectPlanet`, because
 * four of the six classes are switched off by default and a search that lands
 * on a hidden body moves nothing at all. See the note on that action.
 */

/** Enough rows to choose from, few enough to read without scrolling far. */
const LIMIT = 12

/**
 * What is in here, counted rather than written down, so it cannot go stale the
 * next time a comet is added.
 */
const ROSTER = (() => {
  const n = {}
  for (const b of BODIES) n[b.kind] = (n[b.kind] ?? 0) + 1
  return `${BODIES.length} bodies: ${n.planet} planets, ${n.dwarf} dwarf planets, ${n.moon} moons, ${n.comet} comets and ${n.spacecraft} spacecraft. And the ${CONSTELLATION_REGIONS.length} constellations.`
})()

/** A dot per class, so the eye can sort the list before reading it. */
const CLASS_MARK = {
  planet: '●',
  dwarf: '◐',
  asteroid: '◇',
  moon: '○',
  comet: '✦',
  spacecraft: '▲',
  // Not a disc, because a constellation is not an object — it is a patch of
  // sky. The one mark in the list that is not round.
  constellation: '✧',
  // A star is a point of light, and the mark should not pretend otherwise.
  star: '✦',
}

/**
 * One result: a mark, a name, and whatever the heading above it does not say.
 *
 * Shared by the two lists that draw results — grouped under headings, and the
 * flat list inside a browsed category — because they differ in exactly one
 * thing, which is whether a heading is carrying the class for them. Written
 * twice, they would drift, and the drift would be silent: two lists of the same
 * bodies, formatted slightly differently, is not something anyone would notice
 * from a screenshot.
 */
function Row({
  entry,
  index,
  active,
  setActive,
  go,
  namer,
  displayJD,
  showEnglish = false,
  hideParent = false,
}) {
  const isActive = index === active
  const className = `search__row${isActive ? ' is-active' : ''}`

  /*
   * A region of sky, which has no clock, no mission and no parent — every line
   * below this is about a body and none of it applies.
   */
  if (entry.kind === 'constellation' || entry.kind === 'star') {
    return (
      <li>
        <button
          type="button"
          className={className}
          onMouseMove={() => setActive(index)}
          onClick={() => go(entry)}
        >
          <span className="search__mark" aria-hidden="true">
            {CLASS_MARK[entry.kind]}
          </span>
          <span className="search__name">{entry.name}</span>
          {/* What it depicts, but only while browsing the category — there the
              column is otherwise empty and "Water Bearer" beside Aquarius is
              worth having. In a mixed result list the heading has already said
              "Constellations", and a second word saying the same thing in
              different clothes is the noise this column was cleared of. */}
          <span className="search__where">{showEnglish ? entry.region.english : ''}</span>
        </button>
      </li>
    )
  }

  const body = entry.body
  /*
   * A mission that is over, or has not launched, at the date on the clock.
   * Said rather than hidden: the roster is the roster whatever the date, and
   * selecting it carries the clock to the mission — this is the line that
   * explains why the date is about to change.
   */
  const site = landedCraft(body.id)
  const away =
    body.kind === 'spacecraft' &&
    !isFlying(body, displayJD) &&
    !(site && displayJD >= site.landed && (site.ended === null || displayJD <= site.ended))

  /*
   * What the heading does not already say.
   *
   * With the rows gathered under "Spacecraft" and "Planets", a right-hand
   * column repeating "Spacecraft" and "Planet" is the same word twice within an
   * inch. A moon's is kept either way, because "Moon of Jupiter" names the
   * *parent* and no heading can.
   */
  const context = body.parent && !hideParent ? resultContext(entry) : ''

  return (
    <li>
      <button
        type="button"
        className={className}
        onMouseMove={() => setActive(index)}
        onClick={() => go(entry)}
      >
        <span className="search__mark" aria-hidden="true">
          {CLASS_MARK[body.kind]}
        </span>
        <span className="search__name">{namer(body)}</span>
        <span className="search__where">
          {context}
          {away ? `${context ? ' · ' : ''}not there yet` : ''}
        </span>
      </button>
    </li>
  )
}

/** Count and label per category, for the headings and the menu. */
const CATEGORY_COUNT = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.count]))
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]))

/**
 * The mark beside a category, which is the mark its members carry.
 *
 * Minor moons take the same ring as the major ones on purpose: they are the
 * same kind of object seen at a different size, and inventing a ninth glyph to
 * separate them would be drawing a distinction the sky does not make.
 */
const CATEGORY_MARK = {
  planet: CLASS_MARK.planet,
  dwarf: CLASS_MARK.dwarf,
  moon: CLASS_MARK.moon,
  minorMoon: CLASS_MARK.moon,
  asteroid: CLASS_MARK.asteroid,
  comet: CLASS_MARK.comet,
  spacecraft: CLASS_MARK.spacecraft,
  constellation: CLASS_MARK.constellation,
}

/**
 * The categories whose lists are gathered under a further heading.
 *
 * Only the moons, because they are the only class where every member belongs
 * to something else in the same app. A comet belongs to the Sun and a
 * constellation to nobody.
 */
const GROUPED_BY_HOST = new Set(['moon', 'minorMoon'])

export default function SearchPalette() {
  const open = useStore((s) => s.searchOpen)
  const setSearchOpen = useStore((s) => s.setSearchOpen)
  const toggleSearch = useStore((s) => s.toggleSearch)
  const revealAndSelect = useStore((s) => s.revealAndSelect)
  const revealConstellation = useStore((s) => s.revealConstellation)
  const revealStar = useStore((s) => s.revealStar)
  const displayJD = useStore((s) => s.displayJD)
  const namer = useNamer()

  const [query, setQuery] = useState('')
  /**
   * Which category is being browsed, or null for the whole roster.
   *
   * A mode rather than a filter chip, and the difference shows in what the
   * empty field means. With no category, an empty query is a question nobody
   * has asked yet and the palette offers the categories. Inside one, an empty
   * query means "all of these", which is a perfectly good answer — it is the
   * list you asked for by clicking the heading.
   */
  const [category, setCategory] = useState(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  /*
   * Three states, and the list is a different thing in each.
   *
   * Browsing a category with nothing typed is the only one that is not a
   * search at all: it is the whole category, in the order its roster holds it,
   * and it is not capped — the point of clicking "Minor moons" is to see all
   * 413 of them, and the list scrolls.
   */
  const results = useMemo(() => {
    if (category && !query) return categoryEntries(category)
    return searchAll(query, category ? 200 : LIMIT, category)
  }, [query, category])

  /*
   * The results under headings, and the same results flattened back out.
   *
   * `order` is the list as *drawn*, which is what the arrow keys walk and what
   * `active` indexes. Grouping reorders — that is what a heading does — so the
   * flat array the ranking produced is no longer the order on screen, and
   * indexing the old one would send the arrows jumping backwards up the list.
   */
  /**
   * The list as sections, which is the one shape the renderer understands.
   *
   * Four arrangements collapse into it. A mixed search is gathered by class,
   * and those headings are doors into the whole category. The moons are
   * gathered by the planet they orbit and the spacecraft by where they were
   * sent — both are categories that already have a structure which one column
   * would throw away — and those headings are only labels, since there is no
   * "moons of Saturn" category to open. Every other category is one unlabelled
   * section, because the chip in the field is already carrying its name.
   */
  const sections = useMemo(() => {
    if (!category) return groupResults(results).map((g) => ({ ...g, door: true }))
    if (GROUPED_BY_HOST.has(category)) {
      return groupByParent(results).map((g) => ({ ...g, door: false }))
    }
    if (category === 'spacecraft') {
      return groupByTarget(results).map((g) => ({ ...g, door: false }))
    }
    return [{ key: category, label: null, door: false, entries: results }]
  }, [results, category])

  const order = useMemo(() => sections.flatMap((s) => s.entries), [sections])

  /* What the arrows walk: the categories when they are what is on screen. */
  const browsing = !category && !query
  const rowCount = browsing ? CATEGORIES.length : order.length

  /*
   * `/` to open, `⌘K`/`Ctrl-K` because that is what a palette is, and both are
   * free: the letter shortcuts in `LayerPanel` are single letters without
   * modifiers, and it already stands down while a text field has focus.
   *
   * `/` has to be refused while something else is being typed into, or the
   * date field in the timeline could never take a slash.
   */
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement
      const typing =
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggleSearch()
        return
      }
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSearchOpen, toggleSearch])

  /* A fresh question every time it opens, focused and ready to be typed into. */
  useEffect(() => {
    if (!open) return
    setQuery('')
    setCategory(null)
    setActive(0)
    inputRef.current?.focus()
  }, [open])

  /* Keep the highlighted row on screen when the arrows walk past the edge. */
  useEffect(() => {
    listRef.current?.querySelector('.search__row.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  /*
   * Two kinds of result, two destinations.
   *
   * A body is somewhere to fly to; a constellation is a direction to be named.
   * Both go through a *reveal* rather than a bare select, because four of the
   * body classes and the constellation figures are all switched off by default,
   * and a search that lands on something switched off moves nothing at all.
   */
  const go = (entry) => {
    if (!entry) return
    if (entry.kind === 'constellation') revealConstellation(entry.constellation)
    else if (entry.kind === 'star') revealStar(entry.star)
    else revealAndSelect(entry.id)
    setSearchOpen(false)
  }

  /*
   * Into a category, from its heading or from the menu.
   *
   * The query is dropped on the way in, and that is the whole point of the
   * gesture: while a query is showing, the group under a heading already *is*
   * every match of that class, so scoping to it would change nothing on screen.
   * Clicking a heading means "never mind the search — show me all of these".
   */
  const enter = (key) => {
    setCategory(key)
    setQuery('')
    setActive(0)
    inputRef.current?.focus()
  }

  /* Back out one step: out of the category, then out of the palette. */
  const back = () => {
    setCategory(null)
    setQuery('')
    setActive(0)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (rowCount ? (i + 1) % rowCount : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (rowCount ? (i - 1 + rowCount) % rowCount : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // On the menu, Enter opens the category rather than going anywhere: the
      // categories are the rows, so they are what the arrows are pointing at.
      if (browsing) enter(CATEGORIES[active]?.key)
      else go(order[active])
    } else if (e.key === 'Backspace' && category && query === '') {
      /*
       * Backspace with nothing left to delete steps back out of the category.
       *
       * The gesture every palette with a scope has, and it costs nothing here
       * because the guard is exact: there must be a category open *and* an
       * empty field, so it can never eat a keystroke someone meant for the
       * text.
       */
      e.preventDefault()
      back()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // Before the nav bar's own Escape listener, which would otherwise close
      // the bar underneath at the same time.
      e.stopPropagation()
      // Out of the category first. Escape closing the whole palette from
      // inside a category would throw away two steps for one press, and the
      // way back in is four keystrokes.
      if (category) back()
      else setSearchOpen(false)
    }
  }

  if (!open) return null

  return (
    /* `data-wheel="ui"` so the camera does not take the wheel over a list that
       scrolls; the same reason the nav dock carries it. */
    <div className="search" data-wheel="ui" role="dialog" aria-modal="true" aria-label="Find a body">
      {/* A click anywhere off the card closes it. Behind the card in the stack,
          so it never eats a click meant for a row. */}
      <button
        type="button"
        className="search__scrim"
        aria-label="Close search"
        onClick={() => setSearchOpen(false)}
      />

      <div className="search__card glass--calm">
        <div className="search__field">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>

          {/* The scope, sitting inside the field where a mail client puts a
              recipient — because that is what it is: something the typing is
              addressed to. Clicking it steps back out, as does backspace on an
              empty field and escape. */}
          {category && (
            <button type="button" className="search__scope" onClick={back}>
              {CATEGORY_LABEL[category]}
              <span aria-hidden="true">×</span>
            </button>
          )}

          <input
            ref={inputRef}
            type="text"
            className="search__input"
            value={query}
            placeholder={
              category
                ? `Search ${CATEGORY_LABEL[category].toLowerCase()}`
                : 'Find a planet, moon, spacecraft or constellation'
            }
            aria-label="Find a body"
            autoComplete="off"
            spellCheck="false"
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
          <kbd className="search__kbd">esc</kbd>
        </div>

        <ul className="search__list" ref={listRef}>
          {/* Nothing typed and no category: the way in for someone who does not
              have a name in mind. The roster, as eight doors. */}
          {browsing &&
            CATEGORIES.map((entry, i) => (
              <li key={entry.key}>
                <button
                  type="button"
                  className={`search__row search__row--category${i === active ? ' is-active' : ''}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => enter(entry.key)}
                >
                  <span className="search__mark" aria-hidden="true">
                    {CATEGORY_MARK[entry.key]}
                  </span>
                  <span className="search__name">{entry.label}</span>
                  <span className="search__where">{entry.count}</span>
                </button>
              </li>
            ))}

          {sections.map((section) => (
            <Fragment key={section.key}>
              {/* A door into the whole category, or a plain label.

                  A class heading is a button because there is a category behind
                  it to open. A planet's name over its moons is not: there is no
                  "moons of Saturn" list to go to, and making it look clickable
                  would promise something that does not exist. */}
              {section.label !== null &&
                (section.door ? (
                  <li>
                    <button
                      type="button"
                      className="search__group search__group--button"
                      onClick={() => enter(section.key)}
                    >
                      {section.label}
                      <span className="search__group-count">
                        {CATEGORY_COUNT[section.key]}
                        <span className="search__group-go" aria-hidden="true">
                          →
                        </span>
                      </span>
                    </button>
                  </li>
                ) : (
                  /* `aria-hidden`: a label that is not focusable should not
                     interrupt a screen reader walking a list of results. */
                  <li className="search__group" aria-hidden="true">
                    {section.label}
                    <span className="search__group-count">{section.entries.length}</span>
                  </li>
                ))}

              {section.entries.map((entry) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  /* Its place in the *drawn* order, which is what the arrows
                     walk and what `active` counts. See `groupResults`. */
                  index={order.indexOf(entry)}
                  active={active}
                  setActive={setActive}
                  go={go}
                  namer={namer}
                  displayJD={displayJD}
                  showEnglish={category === 'constellation'}
                  /* The parent is the heading here, so the row need not repeat
                     it 146 times down a column. */
                  hideParent={!section.door && section.label !== null}
                />
              ))}
            </Fragment>
          ))}

          {query && results.length === 0 && (
            <li className="search__empty">
              Nothing {category ? `in ${CATEGORY_LABEL[category]} ` : ''}answers to “{query}”.
            </li>
          )}
        </ul>

        {/* The keys, said out loud.

            The arrows have always worked and nothing on screen admitted it, so
            for anyone who did not try them the list was a set of twelve things
            to reach for with the mouse — having just been invited to use the
            keyboard. A palette is a keyboard instrument and this is the label
            on it. */}
        {rowCount > 0 && (
          <div className="search__hint" aria-hidden="true">
            <kbd className="search__kbd">↑</kbd>
            <kbd className="search__kbd">↓</kbd>
            <span>to move</span>
            <kbd className="search__kbd">↵</kbd>
            <span>{browsing ? 'to open' : 'to go'}</span>
            {category && (
              <>
                <kbd className="search__kbd">esc</kbd>
                <span>to go back</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
