import { useCallback, useSyncExternalStore } from 'react'
import { useStore } from '../store/useStore'
import {
  featureKey,
  registerFeatureNode,
  shownSurface,
  siteKey,
  subscribeSurface,
} from '../scene/featureRegistry'
import './FeatureLayer.css'

/**
 * The names of places on a surface, and the marks where things landed on it.
 *
 * Rendered once per change of the *set* and then left alone —
 * `SurfaceFeatures` moves each node every frame by writing `transform`
 * directly, which is the same division of labour as the body labels and for the
 * same reason. React never sees the motion.
 *
 * `useSyncExternalStore` rather than a store field: the set has one consumer,
 * updates on its own clock, and nothing else in the app should re-render
 * because a crater came over the limb.
 */

/** Does the name already carry its own type, in any declension? */
const says = (name, type) => name.toLowerCase().includes(type.slice(0, 4))

/** A dot at the feature, and its name beside it. */
function Feature({ feature }) {
  const key = featureKey(feature.name)
  const ref = useCallback((node) => registerFeatureNode(key, node), [key])

  return (
    <div className="feature" ref={ref} style={{ opacity: 0 }}>
      <span className="feature__dot" aria-hidden="true" />
      <span className="feature__name">
        {feature.name}
        {/* The kind, when the name does not already say it. "Tycho" gains
            "crater"; "Mare Imbrium" gains nothing.

            Matched on the first four letters rather than the whole word,
            because the register's type is singular and the names decline:
            "Montes Apenninus" is a *mons*, "Phlegra Dorsa" a *dorsum*,
            "Tartarus Colles" a *collis*. Comparing the words outright
            appended all three. */}
        {feature.type && !says(feature.name, feature.type) && (
          <em className="feature__type">{feature.type}</em>
        )}
      </span>
    </div>
  )
}

/** Landings that arrived intact, and landings that did not. */
const FAILED = new Set(['crash', 'impact'])

/**
 * A landing site: a mark, the mission's name, and the year.
 *
 * The year rather than the full date, because at this size a label is read at a
 * glance and "1969" carries almost everything "20 July 1969" does. The full
 * date is in the data and the event panel is where a date belongs.
 */
function Site({ site }) {
  const key = siteKey(site.name)
  const ref = useCallback((node) => registerFeatureNode(key, node), [key])
  const standOn = useStore((s) => s.standOn)
  const failed = FAILED.has(site.kind)
  const year = new Date((site.jd - 2440587.5) * 86400000).getUTCFullYear()

  /* The one thing in this layer you can click, and the only reason the layer
     is not `aria-hidden` outright. A crater name is decoration; a landing site
     is a place, and the obvious thing to do with a place is go and stand in
     it.

     `pointer-events` is re-enabled on this element alone — see the note in the
     stylesheet. The layer itself must stay transparent to the pointer or it
     eats every drag over the planet. */
  return (
    <button
      type="button"
      className={`feature feature--site${failed ? ' feature--failed' : ''}`}
      ref={ref}
      style={{ opacity: 0 }}
      title={site.note ? `${site.note} — click to stand here` : 'Click to stand here'}
      onClick={() => standOn(site.body, site.lat, site.lon, site.name)}
    >
      {/* A ring for something that arrived and stayed, a cross for something
          that hit. Two glyphs rather than two colours, because a mark on a grey
          globe has to survive being three pixels across. */}
      <span className="feature__mark" aria-hidden="true">
        {failed ? '×' : '○'}
      </span>
      <span className="feature__name">
        {site.name}
        <em className="feature__type">
          {/* "c." — circa — is the app admitting it does not know exactly
              where. Mars 3 was never located; its site is an ellipse a hundred
              kilometres across and this is the middle of it.

              A tilde was the obvious mark and was worse: at 9 px in this face
              it reads as a dash, so "~1959" looked like a negative year. */}
          {site.approximate ? 'c. ' : ''}
          {year}
        </em>
      </span>
    </button>
  )
}

export default function FeatureLayer() {
  const { features, sites } = useSyncExternalStore(subscribeSurface, shownSurface, shownSurface)

  if (!features.length && !sites.length) return null

  return (
    <div className="feature-layer">
      {features.map((feature) => (
        <Feature key={feature.name} feature={feature} />
      ))}
      {sites.map((site) => (
        <Site key={site.name} site={site} />
      ))}
    </div>
  )
}
