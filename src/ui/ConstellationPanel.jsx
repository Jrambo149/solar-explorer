import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CONSTELLATION_REGIONS, STAR_CONSTELLATION } from '../data/constellations'
import { CONSTELLATION_DOSSIERS, CONSTELLATION_ORIGINS, ZODIAC } from '../data/constellationData'
import { STARS, STAR_NAMES } from '../data/stars'
import { bestSeen, latitudeBand } from './constellationFacts'
import { useStore } from '../store/useStore'
import './ConstellationPanel.css'

/**
 * What you just clicked on in the sky.
 *
 * A panel rather than the body dossier, and it is not a shortcut: the dossier
 * is a full-page scroll that takes the scene over, and it is built around a
 * body you can fly to and look at from angles. A constellation is a *direction*
 * — there is nothing to approach, no other side to it, and the thing being
 * described is already filling the screen behind this panel. Covering it up to
 * describe it would be perverse.
 *
 * So this sits at the side, stays small, and leaves the sky visible. The
 * highlight in the scene is the other half of the answer: this names the
 * region, the scene shows which one.
 *
 * ## What each number means, and where it comes from
 *
 * Everything measurable is read from the generated file, which derived it from
 * the IAU boundaries — the area, the star counts, the brightest member. The
 * prose is hand-written and lives in `constellationData.js`. Two lines are
 * neither: "best seen" and "visible from" are worked out at read time, because
 * they restate numbers already present rather than being facts of their own.
 * They live in `constellationFacts.js` so the checks can call them.
 */

export default function ConstellationPanel() {
  const index = useStore((s) => s.constellation)
  const clearConstellation = useStore((s) => s.clearConstellation)

  /* Escape closes it, as it does every other transient surface in the app.
     Registered only while one is picked, so it cannot shadow the search
     palette's Escape or the surface bar's. */
  useEffect(() => {
    if (index === null) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') clearConstellation()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, clearConstellation])

  /*
   * The named stars inside the region, brightest first.
   *
   * From `STAR_CONSTELLATION`, which was baked by looking every catalogue star
   * up in the same table the click went through — so this list is the stars
   * that are *in* the constellation by the IAU boundary, not the stars the
   * stick figure happens to connect. The two are not the same, and the
   * boundary is the one that is definitive.
   */
  const named = useMemo(() => {
    if (index === null) return []
    return STAR_NAMES.filter(([star]) => STAR_CONSTELLATION[star] === index)
      .sort((a, b) => STARS[a[0]][2] - STARS[b[0]][2])
      .slice(0, 6)
  }, [index])

  const region = index === null ? null : CONSTELLATION_REGIONS[index]
  const dossier = region ? CONSTELLATION_DOSSIERS[region.abbr] : null
  const origin = region ? CONSTELLATION_ORIGINS[region.origin] : null

  return (
    <AnimatePresence>
      {region && (
        <motion.aside
          className="constellation-panel glass glass--calm"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.28 }}
          /* Its own wheel, like the layer panel: a column of text is a reading
             surface and a scroll over one must never reach the camera. */
          data-wheel="ui"
        >
          <header className="constellation-panel__head">
            <div>
              <p className="constellation-panel__eyebrow">
                {ZODIAC.includes(region.abbr) ? 'Constellation of the zodiac' : 'Constellation'}
                <span className="constellation-panel__abbr">{region.abbr}</span>
              </p>
              <h2 className="constellation-panel__name">{region.name}</h2>
              {/* The genitive is how every star in it is named — Alpha Orionis,
                  not Alpha Orion — so it earns its place beside the name. */}
              <p className="constellation-panel__latin">
                {region.english}
                <em>{region.genitive}</em>
              </p>
            </div>
            <button
              type="button"
              className="constellation-panel__close"
              onClick={clearConstellation}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <p className="constellation-panel__meaning">{dossier.meaning}</p>
          <p className="constellation-panel__text">{dossier.description}</p>

          <dl className="constellation-panel__facts">
            <div>
              <dt>Area</dt>
              {/* Of the whole sky, because 1,303 square degrees means nothing
                  to anyone without the 41,253 it is a share of. */}
              <dd>
                {Math.round(region.area).toLocaleString()} sq°
                <em>{((region.area / 41252.96) * 100).toFixed(1)}% of the sky</em>
              </dd>
            </div>
            <div>
              <dt>Brightest star</dt>
              <dd>
                {region.brightestName ?? 'unnamed'}
                <em>magnitude {STARS[region.brightest][2].toFixed(2)}</em>
              </dd>
            </div>
            <div>
              <dt>Naked-eye stars</dt>
              <dd>
                {region.stars}
                <em>{region.named} with names</em>
              </dd>
            </div>
            <div>
              <dt>Named by</dt>
              <dd className="constellation-panel__origin">{origin.label}</dd>
            </div>
            <div>
              <dt>Best seen</dt>
              <dd>
                around {bestSeen(region.centre[0])}
                <em>highest at midnight</em>
              </dd>
            </div>
            <div>
              <dt>Visible from</dt>
              <dd>
                {latitudeBand(region.decRange)}
                <em>latitude</em>
              </dd>
            </div>
          </dl>

          <ul className="constellation-panel__list">
            {dossier.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>

          {named.length > 0 && (
            <section className="constellation-panel__stars">
              <h3>Named stars</h3>
              <ul>
                {named.map(([star, name]) => (
                  <li key={star}>
                    {name}
                    <em>{STARS[star][2].toFixed(2)}</em>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="constellation-panel__origin-note">{origin.note}</p>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
