import { useMemo } from 'react'
import { MOON_PHASES } from '../data/moonPhases'
import { ORBITAL_ELEMENTS } from '../data/orbitalElements'
import { moonPhaseAt } from '../orbit/moonPhase'
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
export default function MoonPhases() {
  const jd = useStore((s) => s.displayJD)

  const now = useMemo(() => moonPhaseAt(jd, ORBITAL_ELEMENTS.earth), [jd])

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
