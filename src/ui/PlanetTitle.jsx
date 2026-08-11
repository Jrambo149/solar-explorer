import { useEffect, useState } from 'react'
import { getBody } from '../data/bodies'
import { useStore } from '../store/useStore'
import { useBodyName } from './useBodyName'
import './PlanetTitle.css'

/**
 * The big serif planet name shown over the close-up view.
 *
 * Purely decorative and non-interactive. Animated with CSS rather than Framer
 * Motion: it stays mounted and toggles a class, so it can never get stranded
 * mid-transition, and it never needs to intercept a pointer event.
 *
 * The name is held after deselection so the fade-out reads the planet you were
 * just looking at, rather than snapping to empty text on the way out.
 */
/*
 * The fallback used to be `'Planet'`, which is how ʻOumuamua came to be
 * announced as one. A class this table does not know now says nothing rather
 * than saying something false — an empty eyebrow is a missing label, and
 * "Planet" over an interstellar object is a claim.
 */
const KIND_LABEL = {
  planet: 'Planet',
  dwarf: 'Dwarf planet',
  moon: 'Moon',
  comet: 'Comet',
  spacecraft: 'Spacecraft',
}

export default function PlanetTitle() {
  const selectedId = useStore((s) => s.selectedId)
  const planet = getBody(selectedId)
  const [shown, setShown] = useState(planet)

  useEffect(() => {
    if (planet) setShown(planet)
  }, [planet])

  // From `shown`, so the name fades out with the body it belongs to.
  const name = useBodyName(shown)

  const visible = Boolean(planet)

  return (
    <div className={`planet-title${visible ? ' is-visible' : ''}`} aria-hidden="true">
      {/* Names the class rather than always saying "Planet" — the title sits
          over Europa as readily as over Jupiter now. Read from `shown` so it
          fades out with the name it belongs to instead of changing a beat
          early. */}
      <p className="planet-title__eyebrow">
        {/* An `I` designation — 1I, 3I — means the body came from outside the
            solar system, and calling ʻOumuamua a comet is a claim its own
            discoverers would not make: it never grew a coma. */}
        {shown?.kind === 'comet' && /^\dI\//.test(shown.designation ?? '')
          ? 'Interstellar object'
          : (KIND_LABEL[shown?.kind] ?? '')}
      </p>
      {/* Keyed so the entrance animation replays when you switch planets. */}
      <h2 className="planet-title__name" key={shown?.id}>
        {name}
      </h2>
      <span className="planet-title__rule" />
    </div>
  )
}
