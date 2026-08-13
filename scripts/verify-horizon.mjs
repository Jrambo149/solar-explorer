/**
 * The view from the ground, and whether it is the right way up.
 *
 * A horizon is three vectors — up, north, east — and every one of them can be
 * wrong in a way that looks completely normal. Swap east and west and the sky
 * still turns, the Sun still rises and sets, and the constellations are still
 * the right shape; the Sun simply sets in the east, and nothing on screen says
 * so. Point north at the wrong pole and every altitude is still plausible. So
 * none of these checks look at the picture. Each one asks a question with an
 * answer that was known before this app existed.
 *
 * **Polaris.** From latitude φ the pole star stands due north at an altitude of
 * φ, to within the 0.74° it misses the pole by. Sailors navigated on this for
 * four hundred years. One measurement tests up and north together, and it is
 * immune to the app's arbitrary rotational phase — which is the reason the
 * checks below lean on it rather than on "the Sun is up at noon in London".
 * `spinAt` turns every body from a zero at J2000 rather than from a measured
 * prime-meridian epoch, so what time of day it is at a given longitude is
 * *not* something this app claims to know. Where north is, is.
 *
 * **The sub-solar point.** Directly under the Sun, the Sun is at the zenith.
 * That is a definition rather than an observation, but it is a definition of
 * the geometry rather than of the code, and it tests `up` against the same
 * transform the rovers and the eclipse track are placed with.
 *
 * **The spin carries you east.** Not a fact about the sky at all: take the
 * world position of a fixed latitude and longitude, advance the clock, and see
 * which way it went. On a prograde body it must move toward `east`. This is
 * the check that catches the swapped sign, and it needs no star.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/** Polaris, J2000, from the same table `verify-sky` checks the catalogue with. */
const POLARIS = { ra: 37.9545, dec: 89.2641 }

/** Its angular distance from the celestial pole, which bounds every claim below. */
const POLARIS_OFF_POLE = 90 - POLARIS.dec

/**
 * The probe, injected once.
 *
 * Everything runs through `window.__solar`, never through a dynamic `import()`:
 * under Vite that returns a *second* module instance whose spin registry is
 * empty, and every angle then comes out of a placement made at spin zero.
 */
const PROBE = `
window.__probe = {
  frame(bodyId, lat, lon) {
    const THREE = window.__solar.three
    const s = window.__solar.surface
    const basis = s.bodyBasis(bodyId)
    const spin = s.surfaceSpin(bodyId)
    const o = s.surfaceOffset(lat, lon, basis, spin, 1, { x: 0, y: 0, z: 0 })
    const up = new THREE.Vector3(o.x, o.y, o.z).normalize()
    const pole = new THREE.Vector3(basis.y.x, basis.y.y, basis.y.z).normalize()

    // horizonFrame, written out: the app's own copy is a module and this page
    // must not import one.
    const along = up.dot(pole)
    const north = pole.clone().addScaledVector(up, -along).normalize()
    const east = north.clone().cross(up)
    return { up, north, east }
  },

  sky(bodyId, lat, lon, direction) {
    const f = window.__probe.frame(bodyId, lat, lon)
    const d = direction.clone().normalize()
    const u = d.dot(f.up), n = d.dot(f.north), e = d.dot(f.east)
    return {
      altitude: Math.asin(Math.max(-1, Math.min(1, u))) * 180 / Math.PI,
      azimuth: ((Math.atan2(e, n) * 180 / Math.PI) % 360 + 360) % 360,
    }
  },

  /** A star's world direction, from its J2000 coordinates. */
  starAt(ra, dec) {
    const THREE = window.__solar.three
    const E = 23.4392911 * Math.PI / 180
    const r = ra * Math.PI / 180, d = dec * Math.PI / 180
    const x = Math.cos(d) * Math.cos(r)
    const y = Math.cos(d) * Math.sin(r)
    const z = Math.sin(d)
    // Equatorial to ecliptic about the shared x-axis, then the app's axis swap.
    const ey = y * Math.cos(E) + z * Math.sin(E)
    const ez = -y * Math.sin(E) + z * Math.cos(E)
    return new THREE.Vector3(x, ez, -ey)
  },

  /** Where the Sun is, seen from a body's centre. */
  toSun(bodyId) {
    const THREE = window.__solar.three
    const p = window.__solar.positions.get(bodyId)
    // The Sun sits at the origin of this scene.
    return new THREE.Vector3().sub(p).normalize()
  },

  /** The latitude and longitude directly under a world direction. */
  subPoint(bodyId, direction) {
    const THREE = window.__solar.three
    const s = window.__solar.surface
    const basis = s.bodyBasis(bodyId)
    const spin = s.surfaceSpin(bodyId)
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(basis.x.x, basis.x.y, basis.x.z),
      new THREE.Vector3(basis.y.x, basis.y.y, basis.y.z),
      new THREE.Vector3(basis.z.x, basis.z.y, basis.z.z),
    )
    const q = new THREE.Quaternion().setFromRotationMatrix(m)
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin))
    const local = direction.clone().normalize().applyQuaternion(q.invert())
    // Inverting surfaceDirection: x = cos(lat)cos(lon), y = sin(lat), z = -cos(lat)sin(lon).
    return {
      lat: Math.asin(Math.max(-1, Math.min(1, local.y))) * 180 / Math.PI,
      lon: ((Math.atan2(-local.z, local.x) * 180 / Math.PI) % 360 + 360) % 360,
    }
  },

  /** The body's drawn radius, read off the sphere the app actually built. */
  drawnRadius(bodyId) {
    const THREE = window.__solar.three
    const centre = window.__solar.positions.get(bodyId)
    let radius = null
    window.__solar.scene.traverse((o) => {
      if (!o.isMesh || radius !== null) return
      const p = new THREE.Vector3()
      o.getWorldPosition(p)
      if (p.distanceTo(centre) < 1e-9 && o.material && o.material.type === 'MeshStandardMaterial') {
        radius = o.scale.x
      }
    })
    return radius
  },

  /** Where a surface point is in the world, right now. */
  at(bodyId, lat, lon) {
    const THREE = window.__solar.three
    const s = window.__solar.surface
    const o = s.surfaceOffset(lat, lon, s.bodyBasis(bodyId), s.surfaceSpin(bodyId), 1, { x: 0, y: 0, z: 0 })
    return new THREE.Vector3(o.x, o.y, o.z)
  },
}
`

const page = await openApp()

try {
  await page.evaluate(`window.__solar.state().revealAndSelect('earth')`)
  await page.frames(280)
  await page.evaluate(PROBE)

  console.log('\nPolaris, from six latitudes\n')

  /*
   * The oldest instrument in navigation. Its altitude is your latitude and its
   * azimuth is north, and both are true whatever the date, the longitude or the
   * time of day — so this survives the fact that the app's rotational phase is
   * arbitrary.
   *
   * The southern latitudes are here deliberately: Polaris is *below the horizon*
   * from the southern hemisphere, at a negative altitude equal to the latitude,
   * and a frame with `up` inverted would pass every northern check and fail
   * these.
   */
  for (const lat of [0, 23.5, 45, 60, -20, -45]) {
    const seen = await page.evaluate(`(() => {
      const d = window.__probe.starAt(${POLARIS.ra}, ${POLARIS.dec})
      return window.__probe.sky('earth', ${lat}, 0, d)
    })()`)
    const offAltitude = Math.abs(seen.altitude - lat)
    // Azimuth is meaningless within the star's own distance from the pole once
    // you are near it, so the bound grows with latitude exactly as it must.
    const offAzimuth = Math.min(seen.azimuth, 360 - seen.azimuth)
    const azimuthBound = POLARIS_OFF_POLE / Math.max(0.05, Math.cos(lat * Math.PI / 180)) + 0.2
    check(
      `at ${lat}° Polaris stands ${lat}° up, due north`,
      offAltitude <= POLARIS_OFF_POLE + 0.05 && offAzimuth <= azimuthBound,
      `altitude ${seen.altitude.toFixed(2)}°, azimuth ${seen.azimuth.toFixed(1)}°`,
    )
  }

  console.log('\nAnd the other pole\n')

  /*
   * Sigma Octantis, the southern pole star — 1.06° off the pole and barely
   * visible, which is why the southern hemisphere never had a Polaris. It is
   * here because a `north` built from the wrong end of the spin axis passes
   * every check above with the sign flipped, and fails this one.
   */
  const SIGMA_OCT = { ra: 317.195, dec: -88.956 }
  for (const lat of [-45, -20, 20]) {
    const seen = await page.evaluate(`(() => {
      const d = window.__probe.starAt(${SIGMA_OCT.ra}, ${SIGMA_OCT.dec})
      return window.__probe.sky('earth', ${lat}, 0, d)
    })()`)
    const offAzimuth = Math.abs(seen.azimuth - 180)
    check(
      `at ${lat}° Sigma Octantis stands ${-lat}° up, due south`,
      Math.abs(seen.altitude + lat) <= 1.1 && offAzimuth <= 1.1 / Math.max(0.05, Math.cos(lat * Math.PI / 180)) + 0.2,
      `altitude ${seen.altitude.toFixed(2)}°, azimuth ${seen.azimuth.toFixed(1)}°`,
    )
  }

  console.log('\nUnder the Sun\n')

  /*
   * One fact, stated generally: **the Sun's altitude is 90° minus your angular
   * distance from the sub-solar point.** Overhead beneath it, on the horizon a
   * quarter turn away, underfoot at the antipode, and everything in between.
   *
   * Stated generally on purpose. The first draft asserted the special cases and
   * walked 90° of *longitude* to reach "a quarter turn away", which is only a
   * quarter turn on the equator: from the sub-solar point at 14.7°N that is
   * 86.3° of arc, so the Sun sat 3.7° up and the check failed against correct
   * geometry. The Moon passed the same test only because its sub-solar point
   * happened to be at 0.4°N that day.
   */
  for (const body of ['earth', 'mars', 'luna']) {
    if (body !== 'earth') {
      await page.evaluate(`window.__solar.state().revealAndSelect('${body}')`)
      await page.frames(240)
    }
    const result = await page.evaluate(`(() => {
      const THREE = window.__solar.three
      const toSun = window.__probe.toSun('${body}')
      const p = window.__probe.subPoint('${body}', toSun)
      const DEG = Math.PI / 180
      let worst = { where: null, off: 0 }
      const rows = []
      // A spread of places, including the three special ones.
      for (const [lat, lon] of [[p.lat, p.lon], [-p.lat, p.lon + 180], [0, 0], [51.5, 0], [-33.9, 151.2], [78, 15], [-64, 300]]) {
        const seen = window.__probe.sky('${body}', lat, lon, toSun)
        // Angular distance from the sub-solar point, on the sphere.
        const cos =
          Math.sin(lat * DEG) * Math.sin(p.lat * DEG) +
          Math.cos(lat * DEG) * Math.cos(p.lat * DEG) * Math.cos((lon - p.lon) * DEG)
        const away = Math.acos(Math.max(-1, Math.min(1, cos))) / DEG
        const off = Math.abs(seen.altitude - (90 - away))
        rows.push({ lat, lon, altitude: seen.altitude, want: 90 - away, off })
        if (off > worst.off) worst = { where: [lat, lon], off }
      }
      return { p, worst, noon: rows[0].altitude, night: rows[1].altitude }
    })()`)
    check(
      `on ${body}, the Sun's altitude is 90° minus the distance from the sub-solar point`,
      result.worst.off < 0.02,
      `worst ${result.worst.off.toFixed(4)}°, sub-solar ${result.p.lat.toFixed(1)}°N ${result.p.lon.toFixed(1)}°E`,
    )
    check(
      `on ${body}, that means overhead beneath it and underfoot opposite`,
      Math.abs(result.noon - 90) < 0.02 && Math.abs(result.night + 90) < 0.02,
      `${result.noon.toFixed(3)}° / ${result.night.toFixed(3)}°`,
    )
  }

  console.log('\nWhich way the ground is going\n')

  /*
   * The east check, and the only one that needs no sky.
   *
   * Take a fixed latitude and longitude, let the clock run, and see which way
   * the point moved. A prograde body carries you east — that is what prograde
   * means — so the displacement must have a positive component along `east`.
   *
   * Venus is here because it is the exception: it turns backwards, so the same
   * measurement must come out *negative*, and a frame that had simply hard-coded
   * a handedness would get one of the two wrong.
   */
  for (const [body, prograde] of [['earth', true], ['mars', true], ['luna', true], ['venus', false]]) {
    await page.evaluate(`window.__solar.state().revealAndSelect('${body}')`)
    await page.frames(240)
    const carried = await page.evaluate(`(() => {
      const before = window.__probe.at('${body}', 12, 40)
      const frame = window.__probe.frame('${body}', 12, 40)
      window.__solar.setSimulationDate(window.__solar.simClock.jd + 0.02)
      return { before: before.toArray(), east: frame.east.toArray(), up: frame.up.toArray() }
    })()`)
    await page.frames(6)
    const moved = await page.evaluate(`(() => {
      const THREE = window.__solar.three
      const after = window.__probe.at('${body}', 12, 40)
      const before = new THREE.Vector3(${carried.before.join(',')})
      const east = new THREE.Vector3(${carried.east.join(',')})
      const d = after.clone().sub(before)
      return { alongEast: d.dot(east), length: d.length() }
    })()`)
    const fraction = moved.length > 0 ? moved.alongEast / moved.length : 0
    check(
      `${body} carries the ground ${prograde ? 'east' : 'west'}`,
      prograde ? fraction > 0.5 : fraction < -0.5,
      `${(fraction * 100).toFixed(0)}% of the motion is eastward`,
    )
  }

  console.log('\nStanding up\n')

  /*
   * And the camera itself, which is the only thing above that the user sees.
   * Stand somewhere, ask where the camera is and which way it points, and
   * compare against the frame — the same numbers, arrived at by a different
   * road.
   */
  await page.evaluate(`window.__solar.state().standOn('mars', -4.5895, 137.4417, 'Curiosity')`)
  await page.frames(200)

  const stood = await page.evaluate(`(() => {
    const THREE = window.__solar.three
    const cam = window.__solar.camera
    const s = window.__solar.state()
    const mars = window.__solar.positions.get('mars')
    const frame = window.__probe.frame('mars', -4.5895, 137.4417)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
    const eye = cam.position.clone().sub(mars)
    return {
      scale: s.scaleMode,
      // How far above the surface, as a fraction of the radius. The probe's
      // "at" returns a unit vector, so the drawn radius comes off the mesh.
      heightRatio: eye.length() / window.__probe.drawnRadius('mars') - 1,
      // Is the eye above the right spot?
      offAxis: THREE.MathUtils.radToDeg(eye.normalize().angleTo(frame.up)),
      look: window.__probe.sky('mars', -4.5895, 137.4417, forward),
      want: { azimuth: s.surface.azimuth, altitude: s.surface.altitude },
    }
  })()`)

  check('standing sets the scale to true', stood.scale === 1, String(stood.scale))
  check(
    'the eye is directly over the coordinates it was given',
    stood.offAxis < 0.01,
    `${stood.offAxis.toFixed(4)}° off`,
  )
  check(
    'and just above the ground',
    stood.heightRatio > 0 && stood.heightRatio < 1e-4,
    `${(stood.heightRatio * 3389.5 * 1000).toFixed(1)} m up`,
  )
  check(
    'the camera looks where the readout says it does',
    Math.abs(stood.look.altitude - stood.want.altitude) < 0.05 &&
      Math.abs(((stood.look.azimuth - stood.want.azimuth + 540) % 360) - 180) < 0.05,
    `${stood.look.azimuth.toFixed(2)}°/${stood.look.altitude.toFixed(2)}° against ${stood.want.azimuth}°/${stood.want.altitude}°`,
  )

  /* Turn, and check it turned. */
  await page.evaluate(`window.__solar.state().lookAround(270, -5)`)
  await page.frames(20)
  const turned = await page.evaluate(`(() => {
    const THREE = window.__solar.three
    const cam = window.__solar.camera
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
    return window.__probe.sky('mars', -4.5895, 137.4417, forward)
  })()`)
  check(
    'looking west puts the camera in the west',
    Math.abs(turned.azimuth - 270) < 0.05 && Math.abs(turned.altitude + 5) < 0.05,
    `${turned.azimuth.toFixed(2)}°/${turned.altitude.toFixed(2)}°`,
  )

  /*
   * The gestures, through the browser rather than through the store.
   *
   * Calling `lookAround` proves the maths and nothing about the pointer. What
   * actually decides whether a drag turns your head is hit testing and event
   * ordering — which overlay is in front, which listener runs first, whether
   * the camera's own wheel-inverting handler swallowed it — and none of that is
   * exercised by a store call. The label layer taking `pointer-events: auto`
   * and eating every drag over a planet is the precedent.
   */
  await page.evaluate(`window.__solar.state().lookAround(90, 0)`)
  await page.frames(20)
  const centre = await page.evaluate(`(() => {
    const r = document.querySelector('canvas').getBoundingClientRect()
    return [r.left + r.width / 2, r.top + r.height / 2]
  })()`)

  check(
    'the pointer reaches the canvas while standing',
    (await page.evaluate(
      `document.elementFromPoint(${centre[0]}, ${centre[1]})?.tagName`,
    )) === 'CANVAS',
  )

  // Drag right: the sky should come with the hand, so the heading falls.
  await page.drag(centre[0], centre[1], centre[0] + 200, centre[1] - 60)
  await page.frames(20)
  const dragged = await page.evaluate(`(() => {
    const s = window.__solar.state().surface
    return { azimuth: s.azimuth, altitude: s.altitude }
  })()`)
  check(
    'dragging right turns the view left, and up looks up',
    dragged.azimuth < 90 && dragged.azimuth > 40 && dragged.altitude > 3,
    `${dragged.azimuth.toFixed(1)}°/${dragged.altitude.toFixed(1)}°`,
  )

  const beforeFov = await page.evaluate(`window.__solar.state().surface.fov`)
  await page.wheel(centre[0], centre[1], -240)
  await page.frames(20)
  const afterFov = await page.evaluate(`window.__solar.state().surface.fov`)
  check(
    'the wheel narrows the field of view instead of flying anywhere',
    afterFov < beforeFov - 5,
    `${beforeFov.toFixed(1)}° → ${afterFov.toFixed(1)}°`,
  )
  check(
    'and the camera follows it',
    Math.abs((await page.evaluate(`window.__solar.camera.fov`)) - afterFov) < 0.001,
  )

  /*
   * The eye does not move, whatever you do with it. This is the one thing that
   * separates a surface view from an orbit view, and the failure it guards
   * against is a drag being handled by *both* handlers — turning the head and
   * orbiting the target at the same time, which drifts you off the ground a
   * pixel per frame and is invisible for about a minute.
   */
  const before = await page.evaluate(`window.__solar.camera.position.toArray()`)
  await page.drag(centre[0], centre[1], centre[0] - 260, centre[1] + 90)
  await page.frames(30)
  const after = await page.evaluate(`window.__solar.camera.position.toArray()`)
  const radius = await page.evaluate(`window.__probe.drawnRadius('mars')`)
  const slid = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) / radius
  check(
    'and the eye stays on its spot however much you look about',
    slid < 1e-4,
    `moved ${(slid * 3389.5).toFixed(2)} km`,
  )

  /* And leaving gives the orbit camera back what it lent. */
  await page.evaluate(`window.__solar.state().leaveSurface()`)
  await page.frames(120)
  const left = await page.evaluate(`(() => {
    const cam = window.__solar.camera
    return { fov: cam.fov, up: cam.up.toArray(), surface: window.__solar.state().surface }
  })()`)
  check(
    'leaving restores the field of view and the world vertical',
    left.surface === null && Math.abs(left.fov - 55) < 0.001 && Math.abs(left.up[1] - 1) < 1e-6,
    `fov ${left.fov}, up ${left.up.map((v) => v.toFixed(2)).join(', ')}`,
  )

  const errors = page.errors.filter((e) => !e.startsWith('warning:'))
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await page.close()
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
