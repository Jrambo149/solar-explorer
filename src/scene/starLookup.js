import { STARS, STAR_FACTS } from '../data/stars'
import { starDirection } from './sky'

/**
 * Which star is under the pointer.
 *
 * ## Only the 383 that have something to say
 *
 * `STAR_FACTS` is the pickable set, not the whole catalogue. Identifying one of
 * the eight thousand anonymous points would open a panel that could say nothing
 * but a magnitude and a pair of coordinates, which is not an answer to "what is
 * that?" — it is the question restated. Everything a person would actually
 * point at is in the set by construction: it is every star with a proper name
 * *plus* every star brighter than third magnitude, so nothing visually
 * prominent can be missed.
 *
 * It also keeps this cheap. A linear scan over 383 directions is nothing; over
 * 8,922 it would be a scan per click that had to be justified.
 *
 * ## Why a linear scan at all
 *
 * The obvious alternative is r3f's raycaster against the points geometry, and
 * it is the wrong tool twice over. The field is drawn by a custom shader whose
 * sizes are computed on the GPU, so the raycaster's idea of where a point is
 * and how big it looks is not the drawn one — `threshold` would be guesswork
 * against a size it cannot see. And the field is a *dome that rides with the
 * camera*, so its world positions are re-written every frame; a ray in world
 * space is meaningful only for the frame it was cast in.
 *
 * A direction, compared against catalogue directions, sidesteps both. It is the
 * same thing `constellationAtDirection` does, for the same reason, and the two
 * are asked in that order by the click handler.
 */

/** Unit direction and magnitude for every pickable star, built once. */
const PICKABLE = STAR_FACTS.map(([index]) => {
  const [ra, dec, magnitude] = STARS[index]
  const d = starDirection(ra, dec)
  return { index, x: d.x, y: d.y, z: d.z, magnitude }
})

/**
 * The star nearest a direction, or null if none is close enough.
 *
 * `tolerance` is the cosine of the largest angle that counts as a hit — a
 * cosine rather than an angle so the hot loop is a dot product and nothing
 * else, with the one `Math.acos` left to the caller who wants the miss
 * distance.
 *
 * Ties go to the brighter star, which matters more than it sounds: the naked
 * eye's doubles are catalogued separately, so a click near Mizar is a click
 * near two entries a few arcminutes apart, and picking the fainter one would
 * name the companion rather than the star anybody meant.
 */
export function starAtDirection(x, y, z, tolerance) {
  const length = Math.hypot(x, y, z)
  if (!(length > 0)) return null
  const nx = x / length
  const ny = y / length
  const nz = z / length

  let best = null
  let bestDot = tolerance
  for (const star of PICKABLE) {
    const dot = star.x * nx + star.y * ny + star.z * nz
    if (dot < bestDot) continue
    // Strictly closer wins; equally close, the brighter one does.
    if (best === null || dot > bestDot || star.magnitude < best.magnitude) {
      best = star
      bestDot = dot
    }
  }
  return best ? best.index : null
}

/**
 * How wide a click's reach is, as a cosine, given the shot.
 *
 * Expressed in *pixels* and converted, because that is the unit the gesture
 * actually happens in: a star should be clickable if the pointer lands within
 * a few pixels of it on screen, whatever the field of view or the zoom. A fixed
 * angle on the sky would be a generous target at a wide field and an impossible
 * one at a narrow one.
 */
export function clickTolerance(fovDegrees, viewportHeight, pixels = 14) {
  const radiansPerPixel = ((fovDegrees * Math.PI) / 180) / Math.max(viewportHeight, 1)
  return Math.cos(radiansPerPixel * pixels)
}
