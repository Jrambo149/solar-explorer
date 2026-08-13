import { useCallback, useSyncExternalStore } from 'react'
import { registerFeatureNode, shownFeatures, subscribeFeatures } from '../scene/featureRegistry'
import './FeatureLayer.css'

/**
 * The names of places on a surface.
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
  const ref = useCallback(
    (node) => registerFeatureNode(feature.name, node),
    [feature.name],
  )

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

export default function FeatureLayer() {
  const features = useSyncExternalStore(subscribeFeatures, shownFeatures, shownFeatures)

  if (!features.length) return null

  return (
    <div className="feature-layer" aria-hidden="true">
      {features.map((feature) => (
        <Feature key={feature.name} feature={feature} />
      ))}
    </div>
  )
}
