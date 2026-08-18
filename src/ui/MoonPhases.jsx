import { useMemo } from 'react'
import { MOON_PHASES } from '../data/moonPhases'
import { ORBITAL_ELEMENTS } from '../data/orbitalElements'
import { moonPhaseAt, upcomingPhases } from '../orbit/moonPhase'
import { useStore } from '../store/useStore'
import './MoonPhases.css'

/**
 * The eight phases, with the one it is actually in right now marked.
 *
 * The marking is the point. A phase strip is in every textbook; what a strip
 * cannot do is tell you where in the cycle *tonight* falls, and this app
 * already knows — it solves the Earth's orbit and Meeus' lunar theory every
 * frame to draw eclipses, so the phase is those two vectors and the angle
 * between them. See `orbit/moonPhase.js`.
 *
 * It follows the timeline too. Drag the clock and the highlight walks the row,
 * because it is computed from the same date the scene is drawn at rather than
 * from the wall clock.
 */
/**
 * A Julian date as a readable day.
 *
 * The Julian-to-Unix epoch offset is 2440587.5, which is the one conversion in
 * this file worth stating rather than burying: it is the number of days between
 * noon on 1 January 4713 BC and midnight on 1 January 1970.
 */
function formatWhen(jd) {
  if (!Number.isFinite(jd)) return '—'
  const date = new Date((jd - 2440587.5) * 86400000)
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MoonPhases() {
  const jd = useStore((s) => s.displayJD)

  const now = useMemo(() => moonPhaseAt(jd, ORBITAL_ELEMENTS.earth), [jd])

  /*
   * When each phase next comes round, solved from the same geometry.
   *
   * Recomputed only when the day changes rather than on every clock tick. The
   * answers move by seconds across a day and the solve runs a secant search per
   * phase — at 60 frames a second with the clock running that would be 480
   * root-finds a second to move a date that has not changed.
   */
  const day = Math.floor(jd)
  const upcoming = useMemo(() => {
    const found = upcomingPhases(day, ORBITAL_ELEMENTS.earth)
    return Object.fromEntries(found.map((f) => [f.id, f.jd]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

  return (
    <section className="dossier__section phases">
      <h3 className="dossier__section-title">Phases</h3>

      <p className="phases__now">
        Tonight it is a <strong>{now.phase.name}</strong> —{' '}
        {(now.illumination * 100).toFixed(0)}% lit and{' '}
        {now.waxing ? 'filling' : 'emptying'}, {now.age.toFixed(1)} days into a{' '}
        29.5-day cycle.
      </p>

      <ol className="phases__row">
        {MOON_PHASES.map((phase) => {
          const current = phase.id === now.phase.id
          return (
            <li
              key={phase.id}
              className={`phase${current ? ' is-now' : ''}`}
              aria-current={current ? 'true' : undefined}
            >
              <a
                className="phase__link"
                href={phase.source}
                target="_blank"
                rel="noreferrer noopener"
              >
                <img
                  className="phase__image"
                  src={`${import.meta.env.BASE_URL}images/phases/${phase.file}`}
                  alt={phase.name}
                  loading="lazy"
                  decoding="async"
                />
              </a>
              <p className="phase__name">{phase.name}</p>
              {/* Illumination is exact by definition — a phase *is* an angle —
                  so this is the nominal figure for the named phase, not a
                  measurement of tonight. The live number is in the line above. */}
              <p className="phase__meta">
                {phase.illumination * 100}% lit · day {Math.round(phase.age)}
              </p>
              <p className="phase__note">{phase.note}</p>
              {/* The next time it comes round, from the same solve — see
                  `nextPhaseAfter`. Dated rather than counted down, because a
                  countdown would be wrong the moment the timeline is dragged. */}
              <p className="phase__next">Next {formatWhen(upcoming[phase.id])}</p>
              <p className="phase__when">
                rises {phase.rise} · sets {phase.set}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
