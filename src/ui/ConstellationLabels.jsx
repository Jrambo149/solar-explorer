import { memo, useCallback, useSyncExternalStore } from 'react'
import { CONSTELLATION_REGIONS } from '../data/constellations'
import {
  registerConstellationNode,
  shownConstellations,
  subscribeConstellations,
} from '../scene/constellationRegistry'
import { useStore } from '../store/useStore'
import './ConstellationLabels.css'

/**
 * The names, written across the sky.
 *
 * Without these the sky was clickable and undiscoverable: the figures gave no
 * hint that they were anything but decoration, and the only way to find out
 * what a pattern was called was to click it and read the panel — which is the
 * wrong way round. A name on the sky says both things at once, what it is and
 * that the app knows.
 *
 * They are buttons, not text. A label is the most obvious thing on screen to
 * click when you want to select something, and having it be inert while the
 * empty sky beside it worked would be a small, constant irritation. Clicking a
 * name does exactly what clicking its patch of sky does.
 *
 * Positions are written straight onto these nodes every frame by `Names` inside
 * the Canvas; React only sees the *set* change, a few times a second. Same
 * division of labour as the body labels and the surface features.
 */

const Label = memo(function Label({ index, picked }) {
  const selectConstellation = useStore((s) => s.selectConstellation)
  const region = CONSTELLATION_REGIONS[index]
  const ref = useCallback((node) => registerConstellationNode(index, node), [index])

  return (
    <button
      type="button"
      ref={ref}
      className={`constellation-label${picked ? ' is-picked' : ''}`}
      /* Starts invisible and is placed on the first frame after mount. A node
         that appeared at the top-left corner for one frame before its transform
         arrived would flicker there every time the set changed. */
      style={{ opacity: 0 }}
      onClick={() => selectConstellation(index)}
    >
      {region.name}
    </button>
  )
})

export default function ConstellationLabels() {
  const indices = useSyncExternalStore(subscribeConstellations, shownConstellations)
  const picked = useStore((s) => s.constellation)

  if (indices.length === 0) return null

  return (
    <div className="constellation-labels" aria-label="Constellation names">
      {indices.map((index) => (
        <Label key={index} index={index} picked={index === picked} />
      ))}
    </div>
  )
}
