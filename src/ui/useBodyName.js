import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { bodyNameFor, surfaceKey } from '../data/landedCraft'

/**
 * The naming function for the current date.
 *
 * Every label in the app goes through this rather than reading `body.name`,
 * because five of the bodies answer to two different names either side of a
 * landing — see `bodyName` in `landedCraft.js` for why the rover and its
 * mission are genuinely different objects.
 *
 * Returned as a function rather than a single name so that a component drawing
 * a list of bodies — the nav, a breadcrumb trail — pays for one subscription
 * instead of one per row. The identity only changes when a name does, so a
 * memoised child does not re-render on the clock.
 */
export function useNamer() {
  const key = useStore((s) => surfaceKey(s.displayJD))
  return useMemo(() => (body) => bodyNameFor(body, key), [key])
}

/** The name of one body, at the current date. */
export function useBodyName(body) {
  const key = useStore((s) => surfaceKey(s.displayJD))
  return bodyNameFor(body, key)
}
