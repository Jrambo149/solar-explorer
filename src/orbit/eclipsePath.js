/**
 * The track an eclipse's shadow draws across the ground.
 *
 * The event list gives one instant — greatest eclipse — and that instant is
 * routinely nowhere near where people watched. On 12 August 2026 it is the
 * Atlantic north of Iceland, while the crowds were in Spain, forty-five minutes
 * further along. A track is what answers "does it come anywhere near me", and
 * one moment never can.
 *
 * ## Width is asked of the ground, not of the axis
 *
 * `shadowOnSphere` answers a question about the *axis*: where it meets the
 * sphere and whether the Moon's disc covers the Sun's there. It says nothing
 * about how wide the shadow is, and the obvious ways to estimate that are all
 * wrong in the same direction — the umbra's cross-section is a circle only if
 * it lands head-on, and at the ends of a track it lands at a glancing angle and
 * smears out over hundreds of kilometres.
 *
 * So the width is measured by asking the ground. From a point on the surface,
 * the Sun and Moon are two discs of known angular size at a known separation;
 * the Sun is completely hidden when the separation is less than the difference
 * of the radii. Step sideways from the centre line until that stops being true
 * and the boundary is the edge of the path, whatever shape the shadow makes.
 *
 * That also gets annular eclipses right for free: the same test with the
 * inequality the other way round is the antumbra, and no special case is needed
 * anywhere in this file — a "central" eclipse is one where the discs are
 * concentric enough for one to contain the other.
 */

import {
  EARTH_RADIUS_KM,
  MOON_RADIUS_KM,
  SUN_RADIUS_KM,
  earthMoonSun,
  solarEclipseAt,
  surfacePoint,
  toWorld,
} from './eclipse.js'
import { bodyBasis, primeMeridianAt } from '../scene/pole.js'

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
const scale = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k })
const minus = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const norm = (v) => {
  const l = Math.hypot(v.x, v.y, v.z)
  return l > 0 ? scale(v, 1 / l) : v
}
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

/**
 * Is the Sun completely covered, seen from this point on the ground?
 *
 * `point`, `sun` and `moon` are all in kilometres from the Earth's centre, in
 * the same frame. Returns false when the Sun is below the horizon there, which
 * is not a technicality: the track's last minutes happen at sunset, and without
 * the test the path would carry on around the night side of the planet where
 * nothing can be seen at all.
 */
export function centralAt(point, sun, moon) {
  const toSun = minus(sun, point)
  const toMoon = minus(moon, point)

  // Below the horizon: the outward normal of a sphere is the point itself.
  if (dot(point, toSun) <= 0) return false

  const dSun = Math.hypot(toSun.x, toSun.y, toSun.z)
  const dMoon = Math.hypot(toMoon.x, toMoon.y, toMoon.z)
  const rSun = Math.asin(Math.min(1, SUN_RADIUS_KM / dSun))
  const rMoon = Math.asin(Math.min(1, MOON_RADIUS_KM / dMoon))

  const separation = Math.acos(
    Math.max(-1, Math.min(1, dot(norm(toSun), norm(toMoon)))),
  )
  // One disc inside the other: total if the Moon is the larger, annular if the
  // Sun is. Either way the eclipse is central here.
  return separation <= Math.abs(rMoon - rSun)
}

/**
 * How far the path reaches to one side of `centre`, in kilometres.
 *
 * Walks out along the surface in `perp` until the eclipse stops being central,
 * then bisects. The outward walk is capped at 8° of arc — about 900 km — which
 * is far wider than any real path and stops a glancing shadow at the limb from
 * running the search around the planet.
 */
function halfWidthKm(centre, perp, sun, moon) {
  const at = (angle) =>
    scale(
      {
        x: centre.x * Math.cos(angle) + perp.x * Math.sin(angle),
        y: centre.y * Math.cos(angle) + perp.y * Math.sin(angle),
        z: centre.z * Math.cos(angle) + perp.z * Math.sin(angle),
      },
      EARTH_RADIUS_KM,
    )

  const LIMIT = (8 * Math.PI) / 180
  const STEP = LIMIT / 40
  let inside = 0
  let outside = null
  for (let a = STEP; a <= LIMIT; a += STEP) {
    if (!centralAt(at(a), sun, moon)) {
      outside = a
      break
    }
    inside = a
  }
  if (outside === null) return EARTH_RADIUS_KM * inside
  for (let i = 0; i < 18; i++) {
    const mid = (inside + outside) / 2
    if (centralAt(at(mid), sun, moon)) inside = mid
    else outside = mid
  }
  return EARTH_RADIUS_KM * ((inside + outside) / 2)
}

/** When the shadow's axis first and last touches the Earth, around `jd`. */
function contactWindow(jd, earthElements) {
  const STEP = 2 / 1440
  const LIMIT = 4 / 24
  const edge = (direction) => {
    let inside = jd
    for (let t = STEP; t <= LIMIT; t += STEP) {
      const at = jd + direction * t
      if (!solarEclipseAt(at, earthElements)) {
        let outside = at
        for (let i = 0; i < 20; i++) {
          const mid = (inside + outside) / 2
          if (solarEclipseAt(mid, earthElements)) inside = mid
          else outside = mid
        }
        return inside
      }
      inside = at
    }
    return inside
  }
  return { from: edge(-1), to: edge(1) }
}

/**
 * The whole track of a central eclipse, as points on the ground.
 *
 * Each point carries the **body-fixed** latitude and longitude of the centre
 * line and of both edges, so the caller can lay it on the drawn globe and let
 * the planet carry it round. That is the frame it belongs in: a path over the
 * ground does not move when the Earth turns, which is precisely what makes it a
 * path over the ground rather than a shadow in space.
 *
 * Returns null when the axis never meets the Earth — two thirds of solar
 * eclipses are partial and have no track.
 */
export function eclipseTrack(jd, earthElements, steps = 96) {
  if (!solarEclipseAt(jd, earthElements)) return null

  const { from, to } = contactWindow(jd, earthElements)
  const basisOf = (t) => ({ basis: bodyBasis('earth', t), meridian: primeMeridianAt('earth', t) })

  const points = []
  let widest = 0

  for (let i = 0; i <= steps; i++) {
    /*
     * The ends are nudged just inside the window, because `from` and `to` are
     * the instants the axis *stops* meeting the Earth and evaluating exactly
     * there returns nothing. Skipping those samples instead costs more than it
     * sounds: at the limb the shadow crosses the ground at a glancing angle and
     * its speed runs away, so the last sample before the end was 600 km short
     * of it — the path stopped in northern Spain rather than out over the
     * Mediterranean where it really lifts off.
     */
    const inset = (to - from) * 1e-4
    const t = Math.min(to - inset, Math.max(from + inset, from + ((to - from) * i) / steps))
    const hit = solarEclipseAt(t, earthElements)
    if (!hit) continue

    const { sun, moon } = earthMoonSun(t, earthElements)
    /*
     * `solarEclipseAt` has already put its point in the drawn frame — the raw
     * Sun and Moon from `earthMoonSun` have not. Converting the point a second
     * time is silent and total: the track came out along the equator in the
     * Pacific, and every width measured zero because the Sun was below the
     * horizon at a place the shadow was never at.
     */
    const centre = norm(hit.point)
    const worldSun = toWorld(sun)
    const worldMoon = toWorld(moon)

    /*
     * Which way the shadow is going, so "sideways" means across the track. Taken
     * from the next sample rather than analytically — the axis's motion over the
     * ground is the sum of the Moon's orbit and the Earth's spin, and
     * differencing the thing itself cannot get that combination wrong.
     */
    const delta = (to - from) / steps / 4
    let neighbour = solarEclipseAt(t + delta, earthElements)
    let sense = 1
    if (!neighbour) {
      /*
       * The last point has nothing ahead of it — `to` is the instant the axis
       * leaves the Earth — so it looks backwards instead and flips the sense.
       * Dropping it instead is not a rounding error: the shadow's ground speed
       * runs away at the limb, and the sample before the end was 600 km short,
       * stopping the path in northern Spain rather than out over the
       * Mediterranean where it really lifts off.
       */
      neighbour = solarEclipseAt(t - delta, earthElements)
      sense = -1
    }
    const along = neighbour ? norm(minus(norm(neighbour.point), centre)) : null
    const perp = along ? norm(scale(cross(centre, along), sense)) : null
    if (!perp) continue

    const left = halfWidthKm(centre, perp, worldSun, worldMoon)
    const right = halfWidthKm(centre, scale(perp, -1), worldSun, worldMoon)
    widest = Math.max(widest, left + right)

    const { basis, meridian } = basisOf(t)
    const place = (unit) => {
      const p = surfacePoint(scale(unit, EARTH_RADIUS_KM), basis, meridian)
      return { latitude: p.latitude, longitude: p.longitude }
    }
    const edgeAt = (distanceKm, direction) => {
      const angle = distanceKm / EARTH_RADIUS_KM
      return place({
        x: centre.x * Math.cos(angle) + direction.x * Math.sin(angle),
        y: centre.y * Math.cos(angle) + direction.y * Math.sin(angle),
        z: centre.z * Math.cos(angle) + direction.z * Math.sin(angle),
      })
    }

    points.push({
      jd: t,
      centre: place(centre),
      left: edgeAt(left, perp),
      right: edgeAt(right, scale(perp, -1)),
      widthKm: left + right,
      total: hit.total,
    })
  }

  if (points.length < 2) return null
  return { from, to, points, widestKm: widest, total: points[0].total }
}
