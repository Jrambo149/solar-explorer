/**
 * The bridge between the surface projector and its DOM overlay.
 *
 * Exactly the arrangement `labelRegistry.js` uses for body labels, and for the
 * same reason: the names have to be DOM to be text, and their positions come
 * from the camera, which only exists inside the Canvas.
 *
 * One difference, and it is why this is a separate file rather than another Map
 * in the old one. A body's label set is fixed — eight planets are eight labels
 * for the life of the session — while a surface's set changes as you approach,
 * turn the globe, or select somewhere else. So there are two channels here: the
 * *set*, which crosses into React a few times a second, and the *positions*,
 * which never do.
 *
 * ## Two kinds of thing, one channel
 *
 * Craters and landing sites are drawn by the same pass and published together.
 * They are the same geometry problem — a point at a latitude and longitude,
 * facing the camera or not — and separating them would mean two copies of the
 * body-fixed transform, which is the one thing `surface.js` exists to prevent.
 * They are *not* the same claim, so they carry a kind and the overlay draws
 * them differently: a crater is a name for ground that was always there, and a
 * landing site is a thing that happened on a particular afternoon.
 */

/** key → the label's outer DOM element. Keys are namespaced by kind. */
export const featureNodes = new Map()

export function registerFeatureNode(key, node) {
  if (node) featureNodes.set(key, node)
  else featureNodes.delete(key)
}

/** The overlay's key for a named feature, and for a landing site. */
export const featureKey = (name) => `f:${name}`
export const siteKey = (name) => `s:${name}`

/**
 * What the overlay should be rendering, and how it hears about changes.
 *
 * A tiny subscription rather than a store field: this updates on its own clock,
 * has exactly one consumer, and putting it in the store would invite anything
 * else to re-render on it.
 */
const EMPTY = { features: [], sites: [] }
let current = EMPTY
const listeners = new Set()

export function publishSurface(features, sites) {
  current = features.length === 0 && sites.length === 0 ? EMPTY : { features, sites }
  for (const listener of listeners) listener(current)
}

export const shownSurface = () => current

export function subscribeSurface(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
