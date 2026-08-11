/**
 * The bridge between the 3D scene and the DOM label overlay.
 *
 * Labels have to be DOM: they need real text rendering, real hit targets and
 * real accessibility, none of which a canvas gives for free. But their
 * *positions* come from the camera, which only exists inside the R3F tree. So
 * something has to carry screen coordinates across that boundary sixty times a
 * second.
 *
 * This is that something, and it is deliberately the same pattern as
 * `planetPositions` in the store: a plain Map, outside React entirely. The
 * overlay renders its nodes once and registers them here; the projector inside
 * the Canvas writes `transform` straight onto those nodes each frame. No state,
 * no re-renders, no reconciliation — just a matrix multiply and a style write
 * per body.
 *
 * The alternative, drei's `<Html>`, mounts a separate React root per body. At
 * eight planets that is merely wasteful; at the thirty-odd bodies that arrive
 * with dwarf planets and moons it would be thirty roots all transforming
 * themselves every frame.
 */

/** id -> the label's outer DOM element. */
export const labelNodes = new Map()

export function registerLabelNode(id, node) {
  if (node) labelNodes.set(id, node)
  else labelNodes.delete(id)
}
