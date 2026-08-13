/**
 * The eclipse track, and whether it is drawn where it is computed.
 *
 * Two failures to guard, and they are independent. The geometry can be wrong —
 * a path in the wrong ocean, a width off by a factor. And the geometry can be
 * right while the *drawing* is wrong, because the band is built in body-fixed
 * coordinates and carried by `basis · R_y(spin)`: get that composition wrong by
 * one axis and the path lands somewhere else entirely, looking like an error in
 * the eclipse rather than in a matrix.
 *
 * The second is the one that needs a browser, so this file uses one for both.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { BODIES_BY_ID, bodyRadius } from '../src/data/bodies.js'
import { EVENTS } from '../src/data/events.js'
import { eclipseTrack } from '../src/orbit/eclipsePath.js'
import { solarEclipseAt, surfacePoint } from '../src/orbit/eclipse.js'
import { bodyBasis, primeMeridianAt } from '../src/scene/pole.js'
import { dateFromJulian } from '../src/orbit/kepler.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const earth = BODIES_BY_ID.earth
const day = (jd) => dateFromJulian(jd).toISOString().slice(0, 10)
const clock = (jd) => dateFromJulian(jd).toISOString().slice(11, 16)
const eventOn = (date) => EVENTS.find((e) => e.kind === 'solar-eclipse' && day(e.jd) === date)

/** Great-circle distance between two lat/lon pairs, in km. */
const RADIUS_KM = 6371
function apart(a, b) {
  const d = Math.PI / 180
  const φ1 = a.latitude * d
  const φ2 = b.latitude * d
  const dφ = φ2 - φ1
  const dλ = (b.longitude - a.longitude) * d
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

console.log('\nThe track of 12 August 2026\n')

const event = eventOn('2026-08-12')
const track = eclipseTrack(event.jd, earth.elements)

check('it has a track at all', !!track && track.points.length > 40, `${track?.points.length} points`)

/*
 * Where it starts and ends. Published: the path begins at sunrise in the Arctic
 * north of Siberia and ends at sunset in the Mediterranean off the Spanish
 * coast — which is the half of this eclipse the event's own timestamp cannot
 * tell you, since greatest eclipse is out in the Atlantic between them.
 */
const first = track.points[0].centre
const last = track.points[track.points.length - 1].centre
check(
  'it begins in the Arctic',
  first.latitude > 70,
  `${clock(track.from)} at ${first.latitude.toFixed(1)}N ${first.longitude.toFixed(1)}E`,
)
check(
  'and ends off the Spanish coast',
  Math.abs(last.latitude - 39) < 3 && Math.abs(last.longitude - 5.5) < 4,
  `${clock(track.to)} at ${last.latitude.toFixed(1)}N ${last.longitude.toFixed(1)}E`,
)

/*
 * And passes through greatest eclipse, which is computed by an entirely
 * separate route — `shadowOnSphere` on the axis, rather than a walk along the
 * ground. Agreement between the two is worth more than either alone.
 */
const at = solarEclipseAt(event.jd, earth.elements)
const greatest = surfacePoint(at.point, bodyBasis('earth', event.jd), primeMeridianAt('earth', event.jd))
const nearest = track.points.reduce(
  (best, p) => (apart(p.centre, greatest) < apart(best.centre, greatest) ? p : best),
  track.points[0],
)
check(
  'and runs through the point of greatest eclipse',
  apart(nearest.centre, greatest) < 60,
  `${apart(nearest.centre, greatest).toFixed(0)} km from it`,
)

/*
 * The width, measured by asking the ground rather than by assuming the shadow
 * lands as a circle. NASA gives this eclipse a maximum path width of 294 km.
 * The few percent over is the spherical Earth this app draws standing in for an
 * ellipsoid, and it is worth stating rather than tuning away.
 */
check(
  'the path is 294 km wide at its widest, within a few percent',
  Math.abs(track.widestKm - 294) < 294 * 0.08,
  `${track.widestKm.toFixed(0)} km`,
)
check(
  'and it is widest near greatest eclipse',
  Math.abs(nearest.widthKm - track.widestKm) < 12,
  `${nearest.widthKm.toFixed(0)} km there against ${track.widestKm.toFixed(0)} km widest`,
)

// No point may be degenerate: a zero width means the search failed, and a huge
// one means it ran away around the limb.
const bad = track.points.filter((p) => !(p.widthKm > 5 && p.widthKm < 900))
check('every point along it has a sane width', bad.length === 0, `${bad.length} bad`)

console.log('\nAn annular one, for the other branch of the same test\n')

/*
 * The antumbra rather than the umbra — the Sun's disc is the larger, so the
 * "one disc inside the other" test flips. No special case exists for it in
 * `eclipsePath`, which is the claim being checked here.
 */
const annular = eclipseTrack(eventOn('2026-02-17').jd, earth.elements)
check('the February annular has a track', !!annular && annular.points.length > 40)
check(
  'and it crosses Antarctica',
  annular.points.every((p) => p.centre.latitude < -50),
  `${annular.points[0].centre.latitude.toFixed(0)}N to ${annular.points[annular.points.length - 1].centre.latitude.toFixed(0)}N`,
)
check(
  'and is wider than a total one, as an antumbra is',
  annular.widestKm > track.widestKm,
  `${annular.widestKm.toFixed(0)} km against ${track.widestKm.toFixed(0)} km`,
)

// Two thirds of solar eclipses never touch the Earth with their axis.
const partial = EVENTS.find((e) => e.kind === 'solar-eclipse' && e.latitude === undefined)
check(
  'a partial eclipse has no track',
  eclipseTrack(partial.jd, earth.elements) === null,
  day(partial.jd),
)

console.log('\nDrawn where it is computed\n')

const page = await openApp()

try {
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    window.__solar.setSimulationDate(${event.jd})
    s.selectPlanet('earth')
  })()`)
  await page.frames(300)

  /*
   * The band's own vertices, pulled through the group's world matrix — so this
   * measures what the renderer will actually draw, not what the component meant
   * to draw. Compared against the sub-shadow point in world space, which came
   * from the axis geometry and never went near the scene graph.
   */
  const measured = await page.evaluate(`(() => {
    const THREE = window.__solar.three
    let band = null
    window.__solar.scene.traverse((o) => {
      if (o.isMesh && o.geometry?.attributes?.position?.count === ${track.points.length * 2}) band = o
    })
    if (!band) return null
    band.updateWorldMatrix(true, false)
    const p = band.geometry.attributes.position
    const v = new THREE.Vector3()
    const earthPos = window.__solar.positions.get('earth')
    let closest = Infinity
    const points = []
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(band.matrixWorld)
      points.push([v.x, v.y, v.z])
    }
    return { points, earth: [earthPos.x, earthPos.y, earthPos.z] }
  })()`)

  check('the band is in the scene', measured !== null)

  if (measured) {
    // Where the axis says the shadow is, in world units on the drawn globe.
    const radius = bodyRadius(earth, 0)
    const n = Math.hypot(at.point.x, at.point.y, at.point.z)
    const target = [
      measured.earth[0] + (at.point.x / n) * radius,
      measured.earth[1] + (at.point.y / n) * radius,
      measured.earth[2] + (at.point.z / n) * radius,
    ]
    let nearestDrawn = Infinity
    for (const p of measured.points) {
      nearestDrawn = Math.min(nearestDrawn, Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]))
    }
    // World units to kilometres, via the drawn radius standing for 6,371 km.
    const km = (nearestDrawn / radius) * RADIUS_KM
    check(
      'and its nearest drawn vertex sits on the point of greatest eclipse',
      km < 200,
      `${km.toFixed(0)} km away`,
    )

    // Every vertex on the surface, not floating above it or sunk inside.
    const radii = measured.points.map((p) =>
      Math.hypot(p[0] - measured.earth[0], p[1] - measured.earth[1], p[2] - measured.earth[2]),
    )
    const low = Math.min(...radii) / radius
    const high = Math.max(...radii) / radius
    check(
      'and every vertex lies on the globe',
      low > 0.999 && high < 1.004,
      `${low.toFixed(4)} to ${high.toFixed(4)} of the radius`,
    )
  }

  /* And it goes away when the eclipse does. */
  await page.evaluate(`window.__solar.setSimulationDate(${event.jd + 2})`)
  await page.frames(90)
  const after = await page.evaluate(`(() => {
    let found = 0
    window.__solar.scene.traverse((o) => {
      if (o.isMesh && o.geometry?.attributes?.position?.count === ${track.points.length * 2}) found++
    })
    return found
  })()`)
  check('two days later there is no track drawn', after === 0, `${after} still there`)
} finally {
  await page.close()
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
