/**
 * Rebuilds smooth vertex normals for a mesh that shipped flat-shaded.
 *
 * NASA's Moon is the only model in the set exported with faceted normals: all
 * 23,232 of its triangles carry one constant normal across their three
 * vertices, and its 11,618 distinct points are split into 46,464 vertices so
 * that they can. Every triangle is therefore a flat plate.
 *
 * On the lit side that is nearly invisible — a 23,000-triangle sphere has
 * facets about a degree across, and a degree of normal error changes the
 * brightness of a well-lit surface by almost nothing. Along the terminator it is
 * glaring. There the cosine of the incidence angle passes through zero, so a
 * degree of normal error is the difference between lit and unlit, and each facet
 * comes out a single flat tone against its neighbours. The mesh is a subdivided
 * cube, so the facets are laid out in a regular grid, and the grid draws itself
 * as rectangles marching across the shadowed limb.
 *
 * The repair does not move a single vertex. It welds the split copies of each
 * point back together, averages the surrounding face normals, and writes the
 * result back — so the silhouette, the relief, and the UV unwrap are all exactly
 * as NASA shipped them, and only the shading changes.
 *
 * Welding is the part that matters and the part that is easy to get wrong. The
 * duplicates exist to carry different texture coordinates across the cube-map
 * seams; if each copy averaged only the faces that reference it, the seams would
 * shade as if they were creases and the fix would trade a grid of lines for a
 * smaller set of worse ones.
 */

/**
 * Positions are normalised to a unit radius before this runs, so a fixed
 * tolerance is meaningful. Generous enough to catch duplicates that differ in
 * the last float bit, far tighter than the gap between neighbouring vertices on
 * even the densest mesh here (about 0.01 units on a 32,000-triangle body).
 */
const WELD_TOLERANCE = 1e-5

/**
 * Whether a mesh is flat-shaded — every triangle's three normals identical.
 *
 * Reported as a fraction rather than a boolean because a mesh can be partly
 * faceted: Saturn's file comes in at 8%, which is its ring disc and not
 * something to smooth.
 */
export function facetedFraction(normals, indices) {
  let faceted = 0
  const triangles = indices.length / 3

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3
    const b = indices[t + 1] * 3
    const c = indices[t + 2] * 3
    let same = true
    for (let k = 0; k < 3; k++) {
      if (
        Math.abs(normals[a + k] - normals[b + k]) > 1e-6 ||
        Math.abs(normals[a + k] - normals[c + k]) > 1e-6
      ) {
        same = false
        break
      }
    }
    if (same) faceted++
  }

  return triangles === 0 ? 0 : faceted / triangles
}

/**
 * Averages the normals of every vertex that shares a position, in place.
 *
 * Face normals are accumulated unnormalised so each carries twice its
 * triangle's area. That is the standard area weighting, and it is what stops a
 * sliver triangle from pulling a vertex normal as hard as the large quad next
 * to it.
 *
 * @param {Float32Array} positions vertex positions
 * @param {Float32Array} normals   vertex normals, overwritten
 * @param {ArrayLike<number>} indices triangle list
 * @returns {{points: number, vertices: number}} welded points and raw vertices
 */
export function smoothNormals(positions, normals, indices) {
  const count = positions.length / 3

  /* ---- weld by position ---- */

  const groupOf = new Int32Array(count)
  const buckets = new Map()
  const q = 1 / WELD_TOLERANCE
  let groups = 0

  for (let i = 0; i < count; i++) {
    const key = `${Math.round(positions[i * 3] * q)},${Math.round(
      positions[i * 3 + 1] * q,
    )},${Math.round(positions[i * 3 + 2] * q)}`
    let group = buckets.get(key)
    if (group === undefined) {
      group = groups++
      buckets.set(key, group)
    }
    groupOf[i] = group
  }

  /* ---- accumulate area-weighted face normals per welded point ---- */

  const nx = new Float64Array(groups)
  const ny = new Float64Array(groups)
  const nz = new Float64Array(groups)

  for (let t = 0; t < indices.length; t += 3) {
    const v0 = indices[t]
    const v1 = indices[t + 1]
    const v2 = indices[t + 2]
    const i0 = v0 * 3
    const i1 = v1 * 3
    const i2 = v2 * 3

    const ax = positions[i1] - positions[i0]
    const ay = positions[i1 + 1] - positions[i0 + 1]
    const az = positions[i1 + 2] - positions[i0 + 2]
    const bx = positions[i2] - positions[i0]
    const by = positions[i2 + 1] - positions[i0 + 1]
    const bz = positions[i2 + 2] - positions[i0 + 2]

    const cx = ay * bz - az * by
    const cy = az * bx - ax * bz
    const cz = ax * by - ay * bx

    for (const v of [v0, v1, v2]) {
      const g = groupOf[v]
      nx[g] += cx
      ny[g] += cy
      nz[g] += cz
    }
  }

  /* ---- write back ---- */

  for (let i = 0; i < count; i++) {
    const g = groupOf[i]
    const length = Math.hypot(nx[g], ny[g], nz[g])
    if (length === 0) {
      // A point whose faces cancel out exactly. Cannot happen on a closed
      // surface, but a degenerate triangle can produce it; radially outward is
      // right for every body here and harmless for the rest.
      const r =
        Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]) || 1
      normals[i * 3] = positions[i * 3] / r
      normals[i * 3 + 1] = positions[i * 3 + 1] / r
      normals[i * 3 + 2] = positions[i * 3 + 2] / r
      continue
    }
    normals[i * 3] = nx[g] / length
    normals[i * 3 + 1] = ny[g] / length
    normals[i * 3 + 2] = nz[g] / length
  }

  return { points: groups, vertices: count }
}
