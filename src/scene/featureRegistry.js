/**
 * The bridge between the surface-feature projector and its DOM overlay.
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
 */

/** name → the label's outer DOM element. */
export const featureNodes = new Map()

export function registerFeatureNode(name, node) {
  if (node) featureNodes.set(name, node)
  else featureNodes.delete(name)
}

/**
 * The features the overlay should be rendering, and how it hears about changes.
 *
 * A tiny subscription rather than a store field: this updates on its own clock,
 * has exactly one consumer, and putting it in the store would invite anything
 * else to re-render on it.
 */
let current = []
const listeners = new Set()

export function publishFeatures(features) {
  current = features
  for (const listener of listeners) listener(features)
}

export const shownFeatures = () => current

export function subscribeFeatures(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
