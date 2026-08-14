import { BOUNDARY_TABLE, J2000_TO_B1875 } from '../data/constellations.js'
import { directionToRaDec } from './sky.js'

/**
 * What constellation a direction is in.
 *
 * The sky has been divided into 88 regions since 1930, with no gaps and no
 * overlaps, so this question always has exactly one answer — which is what
 * makes the sky clickable at all. Point at anything, including the empty
 * stretches between the figures, and the answer is well defined.
 *
 * Free of three.js, like `sky.js` next door and for the same reason: the checks
 * import it and compare its answers against published positions without a
 * browser. A lookup that is silently off by a degree is exactly the sort of
 * thing that looks right — the constellations are large, most clicks land well
 * inside one, and only a position near a boundary would ever disagree.
 *
 * ## Why a position has to go backwards in time first
 *
 * Delporte drew the boundaries in 1930 along lines of constant right ascension
 * and declination **in the equinox of B1875** — already half a century out of
 * date when he drew them, chosen because that was the equinox of the charts he
 * was working from.
 *
 * The Earth's axis has precessed since. In J2000 coordinates those boundaries
 * are no longer straight lines at all, and the whole grid has slid about 1.7°
 * east. So the honest way to answer the question is to take the position back
 * to 1875, where the boundaries really are the straight lines the table
 * describes, and look it up there.
 *
 * Skipping the precession would put every answer 1.7° out — which is invisible
 * anywhere but near a boundary, and wrong at every boundary. Betelgeuse would
 * still be in Orion. The stars of the Milky Way that Delporte deliberately
 * placed on one side or the other would not be.
 */

/** The rotation is baked; this is just applying it. */
const M = J2000_TO_B1875
const RADIANS = Math.PI / 180

/**
 * A J2000 right ascension and declination, in degrees, to a constellation index.
 *
 * The index is into `CONSTELLATION_REGIONS` — and into `CONSTELLATIONS` in
 * `stars.js`, which is in the same order, so the figure and the region are
 * reachable from one number.
 */
export function constellationAt(raDegrees, decDegrees) {
  const ra = raDegrees * RADIANS
  const dec = decDegrees * RADIANS
  const cosDec = Math.cos(dec)
  const x = cosDec * Math.cos(ra)
  const y = cosDec * Math.sin(ra)
  const z = Math.sin(dec)

  const X = M[0] * x + M[1] * y + M[2] * z
  const Y = M[3] * x + M[4] * y + M[5] * z
  const Z = M[6] * x + M[7] * y + M[8] * z

  let hours = Math.atan2(Y, X) / RADIANS / 15
  if (hours < 0) hours += 24
  const declination = Math.asin(Math.max(-1, Math.min(1, Z))) / RADIANS

  /*
   * Roman's algorithm, and the ordering of the table is the whole of it.
   *
   * Rows run from the north pole down, so the first row whose southern edge
   * lies below the point and whose right-ascension range contains it is the
   * answer: any later row that also matches describes a region further south
   * which this one sits on top of.
   *
   * A linear scan of 357 rows, which sounds careless and is not — it averages
   * well under a hundred iterations, it runs once per click rather than per
   * frame, and every alternative (an interval tree, a binned index) would be a
   * second structure that could disagree with this one.
   */
  for (let i = 0; i < BOUNDARY_TABLE.length; i++) {
    const row = BOUNDARY_TABLE[i]
    if (declination < row[2]) continue
    if (hours < row[0] || hours >= row[1]) continue
    return row[3]
  }

  /*
   * Unreachable: the regions tile the sphere, and the bake refuses to write a
   * table with a hole in it. Returning null rather than throwing anyway, because
   * the caller is a click handler and a sky that cannot be clicked is a better
   * outcome than a scene that stops rendering.
   */
  return null
}

/** The same, from a direction in the app's world frame. */
export function constellationAtDirection(x, y, z) {
  const { ra, dec } = directionToRaDec(x, y, z)
  return constellationAt(ra, dec)
}
