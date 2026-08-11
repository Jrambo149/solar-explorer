import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EPOCH_RANGE } from '../data/orbitalElements'
import { dateFromJulian, julianDate } from '../orbit/kepler'
import { DEFAULT_RATE_DAYS_PER_SEC, setSimulationDate, useStore } from '../store/useStore'
import './Timeline.css'

/**
 * Time rates, in simulated days per real second.
 *
 * Logarithmic, because the useful range spans nine orders of magnitude:
 * watching Earth turn needs about a day per second, watching Neptune go round
 * needs about a decade. A linear control across that would put the entire
 * inner-planet range inside the first pixel.
 *
 * The rungs were 4x to 12x apart and are now nearer 3x, because at 12x there
 * were things in the scene with no rate that showed them. A month per second
 * ran Mars round in 22 seconds and Jupiter in ten minutes; the next rung up,
 * a year, did Jupiter in twelve seconds and left Mars a blur. Nothing sat in
 * between, and the same hole existed either side of a year per second.
 *
 * The stops are picked to be sayable as well as evenly spaced — 3 hr, 3 days,
 * 3 months — since the label is the whole of what the control tells you.
 *
 * Below an hour per second the gaps stay at 60x, deliberately. Those rungs
 * exist to approach real time rather than to show motion: at a minute per
 * second Earth turns a quarter of a degree in the time you spend looking at it.
 * Filling that end evenly would spend a third of a short slider on rates that
 * all look equally like nothing happening.
 */
const RATES = [
  { label: '1 sec/s', days: 1 / 86400 },
  { label: '1 min/s', days: 1 / 1440 },
  { label: '1 hr/s', days: 1 / 24 },
  { label: '3 hr/s', days: 0.125 },
  { label: '6 hr/s', days: 0.25 },
  { label: '12 hr/s', days: 0.5 },
  { label: '1 day/s', days: 1 },
  { label: '3 day/s', days: 3 },
  { label: '1 wk/s', days: 7 },
  { label: '1 mo/s', days: 30.44 },
  { label: '3 mo/s', days: 91.31 },
  { label: '1 yr/s', days: 365.25 },
  { label: '3 yr/s', days: 1095.75 },
  { label: '10 yr/s', days: 3652.5 },
  { label: '30 yr/s', days: 10957.5 },
  { label: '100 yr/s', days: 36525 },
]

const MIN_YEAR = 1800
const MAX_YEAR = 2050

const jdForYear = (year) => julianDate(new Date(Date.UTC(year, 0, 1)))

const SPAN_START = EPOCH_RANGE.minJD
const SPAN_END = EPOCH_RANGE.maxJD
const SPAN = SPAN_END - SPAN_START

/** Where a Julian Date falls along the track, as 0..1. */
const fractionOf = (jd) => (jd - SPAN_START) / SPAN
const jdAtFraction = (f) => SPAN_START + f * SPAN

/**
 * Tick marks.
 *
 * Labelled every 25 years and marked every 5. Any denser and the labels
 * collide below about 1100px; any sparser and there is nothing to aim at.
 */
const TICKS = (() => {
  const out = []
  for (let year = MIN_YEAR; year <= MAX_YEAR; year += 5) {
    out.push({ year, major: year % 25 === 0, fraction: fractionOf(jdForYear(year)) })
  }
  return out
})()

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

/** `YYYY-MM-DDTHH:mm`, the format `<input type="datetime-local">` requires. */
function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  )
}

const Icon = {
  pause: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
      <rect x="3.5" y="2.5" width="3.4" height="11" rx="1" />
      <rect x="9.1" y="2.5" width="3.4" height="11" rx="1" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
      <path d="M4.5 2.6a.8.8 0 0 1 1.22-.68l7.2 5.4a.8.8 0 0 1 0 1.36l-7.2 5.4A.8.8 0 0 1 4.5 13.4z" />
    </svg>
  ),
  reverse: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
      <path d="M13.5 3.4v9.2a.6.6 0 0 1-.94.5L8.5 10.3v2.3a.6.6 0 0 1-.94.5L2.2 8.62a.75.75 0 0 1 0-1.24l5.36-3.5a.6.6 0 0 1 .94.5v2.3l4.06-2.8a.6.6 0 0 1 .94.5z" />
    </svg>
  ),
}

/**
 * The timeline.
 *
 * Every body's position is a pure function of the Julian Date, so dragging the
 * playhead is not a playback control — it recomputes the whole solar system at
 * whatever instant you land on. Scrub left and the planets are where they were;
 * scrub right and they are where they will be.
 *
 * Two controls rather than one, deliberately. 250 years across roughly a
 * thousand pixels is three months per pixel, which is right for "somewhere in
 * the 1970s" and useless for "the morning of the Apollo 11 launch". The track
 * handles the first, the date field handles the second.
 */
export default function Timeline() {
  const paused = useStore((s) => s.paused)
  const togglePaused = useStore((s) => s.togglePaused)
  const timeRate = useStore((s) => s.timeRate)
  const setTimeRate = useStore((s) => s.setTimeRate)
  const displayJD = useStore((s) => s.displayJD)

  const trackRef = useRef(null)
  const [scrubbing, setScrubbing] = useState(false)
  /** True while the date field has focus, so the clock can't type over the user. */
  const [editing, setEditing] = useState(false)

  const reversed = timeRate < 0
  const magnitude = Math.abs(timeRate)
  const rateIndex = Math.max(
    0,
    RATES.findIndex((r) => r.days >= magnitude - 1e-9),
  )

  const date = useMemo(() => dateFromJulian(displayJD), [displayJD])
  const fraction = fractionOf(displayJD)

  /* ---- scrubbing ---- */

  const jdFromEvent = useCallback((event) => {
    const track = trackRef.current
    if (!track) return null
    const rect = track.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    return jdAtFraction(f)
  }, [])

  const onPointerDown = useCallback(
    (event) => {
      const jd = jdFromEvent(event)
      if (jd === null) return
      // Pointer capture keeps the drag alive when the cursor leaves the track,
      // which it will constantly — the track is 12px tall and 250 years wide.
      event.currentTarget.setPointerCapture(event.pointerId)
      setScrubbing(true)
      setSimulationDate(jd)
    },
    [jdFromEvent],
  )

  const onPointerMove = useCallback(
    (event) => {
      if (!scrubbing) return
      const jd = jdFromEvent(event)
      if (jd !== null) setSimulationDate(jd)
    },
    [scrubbing, jdFromEvent],
  )

  const endScrub = useCallback(() => setScrubbing(false), [])

  /* Arrow keys nudge by a day, page keys by a year — the track is focusable, so
     this is the only way to hit a precise date without a pointer. */
  const onKeyDown = useCallback(
    (event) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, PageDown: -365.25, PageUp: 365.25 }[event.key]
      if (step === undefined) return
      event.preventDefault()
      setSimulationDate(useStore.getState().displayJD + step * (event.shiftKey ? 30 : 1))
    },
    [],
  )

  /* ---- the date field ---- */

  /**
   * The field's own value, held locally.
   *
   * It cannot simply mirror the clock: while the user is typing, a running
   * simulation would rewrite the field every 250 ms and eat the keystrokes. So
   * the clock only pushes into it when the field is idle, and while it has
   * focus the user owns it outright.
   */
  const [fieldValue, setFieldValue] = useState(() => toLocalInputValue(date))

  useEffect(() => {
    if (!editing) setFieldValue(toLocalInputValue(date))
  }, [date, editing])

  const onDateChange = useCallback((event) => {
    const value = event.target.value
    setFieldValue(value)
    if (!value) return
    // Half-typed dates parse to nonsense; ignore them and wait for a real one.
    const parsed = new Date(`${value}:00Z`)
    if (Number.isNaN(parsed.getTime())) return
    const year = parsed.getUTCFullYear()
    if (year < MIN_YEAR || year > MAX_YEAR) return
    setSimulationDate(julianDate(parsed))
  }, [])

  const goToNow = useCallback(() => setSimulationDate(julianDate(new Date())), [])

  const onRate = useCallback(
    (event) => {
      const next = RATES[Number(event.target.value)].days
      setTimeRate(reversed ? -next : next)
    },
    [reversed, setTimeRate],
  )

  const toggleDirection = useCallback(() => setTimeRate(-timeRate), [timeRate, setTimeRate])

  /* Space toggles playback, as it does everywhere else that has a transport —
     but not while a control has focus, where it means "press this button". */
  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'Space') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'SELECT') return
      event.preventDefault()
      useStore.getState().togglePaused()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="timeline">
      <div className="timeline__bar">
        <div className="timeline__transport">
          <button
            type="button"
            className="timeline__btn timeline__btn--primary"
            onClick={togglePaused}
            aria-label={paused ? 'Resume time' : 'Pause time'}
            aria-pressed={paused}
          >
            {paused ? Icon.play : Icon.pause}
          </button>

          <button
            type="button"
            className={`timeline__btn${reversed ? ' is-active' : ''}`}
            onClick={toggleDirection}
            aria-label={reversed ? 'Run time forwards' : 'Run time backwards'}
            aria-pressed={reversed}
          >
            {Icon.reverse}
          </button>

          <input
            className="timeline__rate-range"
            type="range"
            min="0"
            max={RATES.length - 1}
            step="1"
            value={rateIndex}
            onChange={onRate}
            style={{ '--fill': `${(rateIndex / (RATES.length - 1)) * 100}%` }}
            aria-label="Time rate"
            aria-valuetext={RATES[rateIndex].label}
          />

          <output className="timeline__rate">
            {reversed ? '−' : ''}
            {RATES[rateIndex].label}
          </output>
        </div>

        <div className="timeline__readout">
          <span className="timeline__date">{DATE_FORMAT.format(date)}</span>
          <span className="timeline__time">{TIME_FORMAT.format(date)} UTC</span>
        </div>

        <div className="timeline__jump">
          <input
            className="timeline__field"
            type="datetime-local"
            value={fieldValue}
            min={`${MIN_YEAR}-01-01T00:00`}
            max={`${MAX_YEAR}-01-01T00:00`}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            onChange={onDateChange}
            aria-label="Jump to date and time"
          />

          <button type="button" className="timeline__now" onClick={goToNow}>
            Now
          </button>
        </div>
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={trackRef}
        className={`timeline__track${scrubbing ? ' is-scrubbing' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="Scrub through time"
        aria-valuemin={MIN_YEAR}
        aria-valuemax={MAX_YEAR}
        aria-valuenow={date.getUTCFullYear()}
        aria-valuetext={DATE_FORMAT.format(date)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onKeyDown={onKeyDown}
      >
        <div className="timeline__rail" />

        <div className="timeline__ticks" aria-hidden="true">
          {TICKS.map((tick) => (
            <span
              key={tick.year}
              className={`timeline__tick${tick.major ? ' is-major' : ''}`}
              style={{ left: `${tick.fraction * 100}%` }}
            >
              {tick.major && <em className="timeline__tick-label">{tick.year}</em>}
            </span>
          ))}
        </div>

        <div className="timeline__playhead" style={{ left: `${fraction * 100}%` }}>
          <span className="timeline__handle" />
        </div>
      </div>
    </div>
  )
}
