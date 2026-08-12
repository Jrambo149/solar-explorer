import { useEffect, useMemo, useRef, useState } from 'react'
import { BODIES } from '../data/bodies'
import { isFlying } from '../orbit/trajectory'
import { landedCraft } from '../data/landedCraft'
import { useStore } from '../store/useStore'
import { useNamer } from './useBodyName'
import { bodyContext, searchBodies } from './bodySearch'
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
  return `${BODIES.length} bodies: ${n.planet} planets, ${n.dwarf} dwarf planets, ${n.moon} moons, ${n.comet} comets and ${n.spacecraft} spacecraft.`
})()

/** A dot per class, so the eye can sort the list before reading it. */
const CLASS_MARK = {
  planet: '●',
  dwarf: '◐',
  moon: '○',
  comet: '✦',
  spacecraft: '▲',
}

export default function SearchPalette() {
  const open = useStore((s) => s.searchOpen)
  const setSearchOpen = useStore((s) => s.setSearchOpen)
  const toggleSearch = useStore((s) => s.toggleSearch)
  const revealAndSelect = useStore((s) => s.revealAndSelect)
  const displayJD = useStore((s) => s.displayJD)
  const namer = useNamer()

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const results = useMemo(() => searchBodies(query, LIMIT), [query])

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
    setActive(0)
    inputRef.current?.focus()
  }, [open])

  /* Keep the highlighted row on screen when the arrows walk past the edge. */
  useEffect(() => {
    listRef.current?.querySelector('.search__row.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (body) => {
    if (!body) return
    revealAndSelect(body.id)
    setSearchOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (results.length ? (i + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // Before the nav bar's own Escape listener, which would otherwise close
      // the bar underneath at the same time.
      e.stopPropagation()
      setSearchOpen(false)
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
          <input
            ref={inputRef}
            type="text"
            className="search__input"
            value={query}
            placeholder="Find a planet, moon, comet or spacecraft"
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
          {results.map((body, i) => {
            /*
             * A mission that is over, or has not launched, at the date on the
             * clock. Said rather than hidden: the roster is the roster whatever
             * the date, and selecting it carries the clock to the mission —
             * this is the line that explains why the date is about to change.
             */
            const site = landedCraft(body.id)
            const away =
              body.kind === 'spacecraft' &&
              !isFlying(body, displayJD) &&
              !(site && displayJD >= site.landed && (site.ended === null || displayJD <= site.ended))

            return (
              <li key={body.id}>
                <button
                  type="button"
                  className={`search__row${i === active ? ' is-active' : ''}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(body)}
                >
                  <span className="search__mark" aria-hidden="true">
                    {CLASS_MARK[body.kind]}
                  </span>
                  <span className="search__name">{namer(body)}</span>
                  <span className="search__where">
                    {bodyContext(body)}
                    {away ? ' · not there yet' : ''}
                  </span>
                </button>
              </li>
            )
          })}

          {query && results.length === 0 && (
            <li className="search__empty">Nothing here answers to “{query}”.</li>
          )}
          {!query && <li className="search__empty">{ROSTER}</li>}
        </ul>
      </div>
    </div>
  )
}
