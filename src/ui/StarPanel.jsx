import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { STARS, STAR_FACTS, STAR_NAMES } from '../data/stars'
import { useStore } from '../store/useStore'
import {
  constellationOf,
  designation,
  lightYears,
  luminosityNote,
  spectralSummary,
} from './starFacts'
import './ConstellationPanel.css'

/**
 * What you just clicked on in the sky, when it was a star.
 *
 * The sibling of `ConstellationPanel`, and it borrows that panel's stylesheet
 * outright rather than cloning 270 lines of CSS to say the same things. They
 * are the same object doing the same job at two scales — a small card at the
 * side, naming a direction, leaving the sky it describes visible behind it —
 * and if the constellation panel's look ever changes this should change with
 * it. A second stylesheet would be a second thing to keep in step.
 *
 * ## Why not the body dossier
 *
 * For the reason the constellation panel gives, only more so. The dossier is a
 * full-page scroll built around something you can fly to and see from other
 * angles. A star has no other angle: it is a point at a distance nothing in
 * this app can cross, and everything knowable about it fits in a short list.
 */

const NAMES = new Map(STAR_NAMES)
const FACTS = new Map(STAR_FACTS.map((f) => [f[0], f]))

export default function StarPanel() {
  const index = useStore((s) => s.star)
  const clearStar = useStore((s) => s.clearStar)

  /* Escape closes it, as it does every other transient surface here.
     Registered only while one is picked, so it cannot shadow the search
     palette's Escape or the surface bar's. */
  useEffect(() => {
    if (index === null) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') clearStar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, clearStar])

  const star = useMemo(() => {
    if (index === null) return null
    const row = STARS[index]
    const fact = FACTS.get(index)
    if (!row || !fact) return null

    const [, , magnitude, , parsecs] = row
    const [, spect, bayer, flamsteed, abbr, lum] = fact
    const proper = NAMES.get(index) ?? null
    const formal = designation(bayer, flamsteed, abbr)

    return {
      /* The proper name if it has one, else the sky map's designation. One of
         the two always exists: the pickable set is names plus everything
         brighter than third magnitude, and the bright ones all carry a Bayer
         letter or a Flamsteed number. */
      title: proper ?? formal ?? 'Unnamed star',
      /* Shown under the title only when it is not already the title. */
      formal: proper ? formal : null,
      summary: spectralSummary(spect),
      spect,
      magnitude,
      parsecs,
      ly: lightYears(parsecs),
      lum: luminosityNote(lum),
      region: constellationOf(abbr),
    }
  }, [index])

  const selectConstellation = useStore((s) => s.selectConstellation)
  const flyToStar = useStore((s) => s.flyToStar)

  return (
    <AnimatePresence>
      {star && (
        <motion.aside
          className="constellation-panel glass glass--calm"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.28 }}
          data-wheel="ui"
        >
          <header className="constellation-panel__head">
            <div>
              <p className="constellation-panel__eyebrow">
                Star
                {star.region && <span className="constellation-panel__abbr">{star.region.abbr}</span>}
              </p>
              <h2 className="constellation-panel__name">{star.title}</h2>
              {(star.formal || star.summary) && (
                <p className="constellation-panel__latin">
                  {star.formal}
                  {star.summary && <em>{star.summary}</em>}
                </p>
              )}
            </div>
            <button
              type="button"
              className="constellation-panel__close"
              onClick={clearStar}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <dl className="constellation-panel__facts">
            {/*
              Light years first, and the parsecs beside them, because "how long
              has that light been travelling" is the question people actually
              have. The parsec is the unit the measurement was made in and the
              one the rest of this app works in, so it is not hidden.
            */}
            {star.ly !== null && (
              <>
                <dt>Distance</dt>
                <dd>
                  {star.ly < 100 ? star.ly.toFixed(1) : Math.round(star.ly).toLocaleString('en-US')}{' '}
                  light years
                  <span className="constellation-panel__origin-note">
                    {star.parsecs.toFixed(star.parsecs < 100 ? 2 : 0)} pc
                  </span>
                </dd>
              </>
            )}
            <dt>Brightness</dt>
            <dd>magnitude {star.magnitude.toFixed(2)}</dd>
            {star.lum && (
              <>
                <dt>Output</dt>
                <dd>{star.lum}</dd>
              </>
            )}
            {star.spect && (
              <>
                <dt>Spectral type</dt>
                <dd>{star.spect}</dd>
              </>
            )}
          </dl>

          {/*
            The way back out to the wider answer. Clicking a star answered the
            specific question and closed off the general one — this is how you
            ask "and what is it part of?" without having to miss the star on
            purpose.
          */}
          {/*
            The only thing in this panel that is an *action* rather than a fact.
            Offered only where there is a distance to fly to — without a
            parallax the star is a direction and nothing more.
          */}
          {star.parsecs > 0 && (
            <p className="constellation-panel__origin">
              <button
                type="button"
                className="constellation-panel__meaning"
                onClick={() => flyToStar(index)}
              >
                Fly there →
              </button>
            </p>
          )}

          {star.region && (
            <p className="constellation-panel__origin">
              <button
                type="button"
                className="constellation-panel__meaning"
                onClick={() => selectConstellation(star.region.index)}
              >
                In {star.region.name} →
              </button>
            </p>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
