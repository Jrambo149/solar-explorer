/**
 * The bridge between the constellation projector and its DOM overlay.
 *
 * The third instance of the arrangement in `labelRegistry.js`, and the reasons
 * are the same as ever: names have to be DOM to be text you can read and click,
 * and their positions come from the camera, which only exists inside the
 * Canvas. The *set* crosses into React a few times a second; the *positions*
 * never do.
 *
 * Kept apart from `featureRegistry` rather than folded into it because the two
 * are never on screen together — that one draws craters on a surface a few
 * thousand kilometres away, this one draws names on a sky at infinity — and
 * sharing a channel would mean each pass clearing the other's nodes every
 * frame.
 */

/** index → the label's outer DOM element. */
export const constellationNodes = new Map()

export function registerConstellationNode(index, node) {
  if (node) constellationNodes.set(index, node)
  else constellationNodes.delete(index)
}

/**
 * Which names the overlay should be rendering, as indices, and how it hears
 * about changes. A tiny subscription rather than a store field: one consumer,
 * its own clock, and nothing else should re-render because a name came into
 * view.
 */
const EMPTY = []
let current = EMPTY
const listeners = new Set()

export function publishConstellations(indices) {
  current = indices.length === 0 ? EMPTY : indices
  for (const listener of listeners) listener(current)
}

export const shownConstellations = () => current

export function subscribeConstellations(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
