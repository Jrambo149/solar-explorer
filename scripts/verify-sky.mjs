/**
 * The sky is the real sky, and it is in the right place.
 *
 * Two claims, and they fail differently. A catalogue in the wrong frame still
 * looks like a sky: the constellations keep their shapes, the Milky Way still
 * runs across it, and every screenshot looks exactly as good as a correct one.
 * Nothing but a comparison against known coordinates can tell them apart — so
 * that is what most of this file is.
 *
 * The checks are in three groups, and they are deliberately independent:
 *
 *  1. **The data**, against published positions typed in here. If the bake
 *     picked up the wrong columns, or read right ascension as degrees when the
 *     catalogue gives hours, this is what says so.
 *  2. **The frame**, against the Sun. The app's own Earth and Sun are solved
 *     from Kepler elements in the ecliptic frame and know nothing about the sky;
 *     the direction between them, run back through the sky's conversion, has to
 *     land on the Sun's published right ascension for the date. That ties the
 *     stars to the bodies, and it is the only check here that would catch the
 *     obliquity applied with the wrong sign.
 *  3. **The drawing**, in a browser: that the field is on the dome, that it does
 *     not move when the camera does, and that every constellation vertex is a
 *     star.
 *
 * Run the dev server first: `npm run dev`.
 */

import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { openApp } from './lib/browser.mjs'
import { decodePNG } from './equirect.mjs'
import { CONSTELLATIONS, STAR_NAMES, STARS } from '../src/data/stars.js'
import { directionToRaDec, galacticDirection, starDirection } from '../src/scene/sky.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const DEGREES = Math.PI / 180

/** Angular separation between two directions, in degrees. */
function separation(a, b) {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z
  return Math.acos(Math.min(1, Math.max(-1, dot))) / DEGREES
}

const named = new Map(STAR_NAMES.map(([index, name]) => [name, STARS[index]]))
const starNamed = (name) => {
  const star = named.get(name)
  if (!star) throw new Error(`no star named ${name} in the bake`)
  return star
}

/* ---- 1. the data, against published positions ---- */

/**
 * J2000 right ascension and declination in degrees, and visual magnitude, from
 * the Bright Star Catalogue as printed in any almanac.
 *
 * Typed in here rather than derived from anything the bake touched — the whole
 * value of this check is that it comes from outside the pipeline. Chosen to
 * spread over the sky and over the magnitude range: a pole star, two equatorial
 * ones, two far south, and Sirius because it is the brightest and therefore the
 * one whose absence would be most obvious.
 */
const KNOWN = [
  ['Sirius', 101.2872, -16.7161, -1.46],
  ['Canopus', 95.988, -52.6957, -0.72],
  ['Arcturus', 213.9153, 19.1824, -0.05],
  ['Vega', 279.2347, 38.7837, 0.03],
  ['Rigel', 78.6345, -8.2017, 0.18],
  ['Betelgeuse', 88.7929, 7.4071, 0.45],
  ['Polaris', 37.9545, 89.2641, 1.97],
  ['Acrux', 186.6496, -63.0991, 0.77],
  ['Aldebaran', 68.98, 16.5093, 0.87],
  ['Antares', 247.3519, -26.432, 1.06],
]

for (const [name, ra, dec, mag] of KNOWN) {
  const star = starNamed(name)
  const here = starDirection(star[0], star[1])
  const there = starDirection(ra, dec)
  const off = separation(here, there)
  check(
    `${name} is where the almanac puts it`,
    off < 0.02,
    `${(off * 3600).toFixed(0)}" from RA ${ra} Dec ${dec}`,
  )
  check(
    `and is magnitude ${star[2]}`,
    Math.abs(star[2] - mag) < 0.12,
    `catalogue ${star[2]} vs published ${mag}`,
  )
}

/*
 * Canopus is the one to watch: HYG's right ascension for it is 6.399 *hours*.
 * Read as degrees it would put the star at 6.4°, which is 90° away — in Pisces,
 * on the far side of the sky, and still a perfectly plausible-looking star.
 */

/** Separations between famous pairs, which no frame error can change. */
const PAIRS = [
  ['Alnitak', 'Mintaka', 2.72, 'the span of Orion’s belt'],
  ['Dubhe', 'Merak', 5.37, 'the Pointers of the Plough'],
  ['Sirius', 'Betelgeuse', 27.1, 'across Orion to the Dog Star'],
  ['Castor', 'Pollux', 4.5, 'the twins'],
]

for (const [a, b, expected, what] of PAIRS) {
  const first = starDirection(...starNamed(a).slice(0, 2))
  const second = starDirection(...starNamed(b).slice(0, 2))
  const measured = separation(first, second)
  check(
    `${a} to ${b} is ${expected}° — ${what}`,
    Math.abs(measured - expected) < 0.1,
    `measured ${measured.toFixed(2)}°`,
  )
}

/*
 * Orion's belt is straight, which is the check a shape can fail while every
 * individual position passes.
 *
 * The three stars are famously collinear; the middle one sits within a few
 * arcminutes of the great circle through the other two. Measured as the angle
 * between Alnilam and that circle's plane.
 */
{
  const a = starDirection(...starNamed('Alnitak').slice(0, 2))
  const b = starDirection(...starNamed('Mintaka').slice(0, 2))
  const middle = starDirection(...starNamed('Alnilam').slice(0, 2))
  const normal = {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
  const length = Math.hypot(normal.x, normal.y, normal.z)
  const outOfPlane =
    Math.abs((middle.x * normal.x + middle.y * normal.y + middle.z * normal.z) / length) / DEGREES
  check(
    'Orion’s belt is collinear',
    outOfPlane < 0.35,
    `Alnilam is ${(outOfPlane * 60).toFixed(1)}' off the line`,
  )
}

/* ---- 1b. the galactic frame, against the stars themselves ---- */

/*
 * The Milky Way's frame is checked against the catalogue before anything is
 * drawn, and the two know nothing about each other: `galacticDirection` is
 * built from two published directions — the north galactic pole and the
 * galactic centre — while the stars come from HYG in equatorial coordinates.
 *
 * If the pole is right, naked-eye stars have to pile up around `b = 0`, because
 * they do in the sky: the Galaxy is a disc and we are in it. That is a fact
 * about the universe rather than about either data source, which is what makes
 * it worth asserting.
 */
{
  const pole = galacticDirection(0, 90)
  const latitudes = STARS.map(([ra, dec]) => {
    const d = starDirection(ra, dec)
    return 90 - Math.acos(Math.min(1, Math.max(-1, d.x * pole.x + d.y * pole.y + d.z * pole.z))) /
      DEGREES
  })

  // sin(10°) of the sphere lies within 10° of a great circle; 1 - sin(60°)
  // beyond 60° of it. Comparing counts against those areas gives a density.
  const band = latitudes.filter((b) => Math.abs(b) < 10).length / Math.sin(10 * DEGREES)
  const poles = latitudes.filter((b) => Math.abs(b) > 60).length / (1 - Math.sin(60 * DEGREES))
  check(
    'naked-eye stars crowd the galactic plane',
    band / poles > 1.8,
    `${(band / poles).toFixed(2)}x denser within 10° of it than beyond 60°`,
  )

  const meanLatitude = latitudes.reduce((sum, b) => sum + Math.abs(b), 0) / latitudes.length
  check(
    'and their mean galactic latitude is well under the uniform 32.7°',
    meanLatitude < 29,
    `${meanLatitude.toFixed(1)}°`,
  )

  /*
   * The angle between the galactic and celestial poles is 62.87°, which is the
   * inclination of the Galaxy to the Earth's equator and a number in every
   * reference. It catches a galactic frame built from the right numbers in the
   * wrong order — the two axes swapped, say — which the density check above
   * would still pass.
   */
  const celestial = starDirection(0, 90)
  const tilt = Math.acos(
    Math.min(1, Math.max(-1, pole.x * celestial.x + pole.y * celestial.y + pole.z * celestial.z)),
  ) / DEGREES
  check('the Galaxy is tilted 62.87° to the celestial equator', Math.abs(tilt - 62.87) < 0.05,
    `${tilt.toFixed(3)}°`)
}

/* ---- 2. the frame, against the Sun ---- */

/**
 * The Sun as seen from Earth, J2000 astrometric, straight from JPL Horizons.
 *
 * Typed in rather than computed, because the first version of this check
 * computed it — the Astronomical Almanac's low-precision formulae — and failed
 * all four dates by a flat 0.365°. That number is not an error, it is
 * **precession**: 26 years from J2000 at 50.29" a year is 0.363°, and the
 * formulae give the Sun's *apparent* place, referred to the equinox of date.
 *
 * This app has no equinox of date. The bodies are solved from J2000 elements
 * and the stars are a J2000 catalogue, so the sky it draws is the J2000 sky at
 * every date — which is self-consistent, is what Eyes does, and is the only
 * choice that keeps a planet in the right constellation. Comparing it against
 * an apparent place would have been comparing two different frames and calling
 * the difference a bug.
 *
 * So the truth here is Horizons' astrometric J2000 right ascension and
 * declination (`QUANTITIES='1'`, `CENTER='500@399'`), which is the same frame
 * the app is in. Fetched once, at these four dates:
 *
 *     2026-Mar-20 12:00   359.56263   -0.18983
 *     2026-Jun-21 12:00    89.75639   23.43560
 *     2026-Sep-22 12:00   179.20856    0.34338
 *     2026-Dec-21 12:00   269.18419  -23.43343
 *
 * A season apart, because one date cannot tell a rotation from an offset: the
 * Sun runs right round the sky in a year, so agreeing at both equinoxes and
 * both solstices is agreement about the whole circle.
 */
const SUN = [
  ['at the March equinox', 2461120.0, 359.56263, -0.18983],
  ['at the June solstice', 2461213.0, 89.75639, 23.4356],
  ['at the September equinox', 2461306.0, 179.20856, 0.34338],
  ['at the December solstice', 2461396.0, 269.18419, -23.43343],
]

const page = await openApp()

try {
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    s.setTimeRate(0)
    if (!s.paused) s.togglePaused()
  })()`)
  await page.frames(60)

  for (const [label, jd, ra, dec] of SUN) {
    await page.evaluate(`window.__solar.setSimulationDate(${jd})`)
    await page.frames(30)

    /*
     * The Sun as seen from Earth, out of the app's own position registry — two
     * bodies solved from Kepler elements, in world units, with no knowledge
     * that a sky exists. Read rather than assumed: the Sun is at the world
     * origin, but nothing here should depend on that.
     */
    const seen = await page.evaluate(`(() => {
      const earth = window.__solar.positions.get('earth')
      const sun = window.__solar.positions.get('sun') ?? { x: 0, y: 0, z: 0 }
      if (!earth) return null
      const d = { x: sun.x - earth.x, y: sun.y - earth.y, z: sun.z - earth.z }
      const n = Math.hypot(d.x, d.y, d.z)
      return { x: d.x / n, y: d.y / n, z: d.z / n }
    })()`)

    const drawn = directionToRaDec(seen.x, seen.y, seen.z)
    // Compared as an angle on the sky rather than as two coordinates, so an
    // error in right ascension near a pole is not exaggerated by the meridians
    // converging.
    const off = separation(starDirection(drawn.ra, drawn.dec), starDirection(ra, dec))

    check(
      `the drawn Sun is where Horizons puts it ${label}`,
      off < 0.05,
      `RA ${drawn.ra.toFixed(3)}° vs ${ra}, Dec ${drawn.dec.toFixed(3)}° vs ${dec} — ` +
        `${(off * 3600).toFixed(0)}" apart`,
    )
  }

  /* ---- 3. the drawing ---- */

  const field = await page.evaluate(`(() => {
    let stars = null
    window.__solar.scene.traverse((o) => {
      if (o.isPoints && o.geometry?.getAttribute('aSize')) stars = o
    })
    if (!stars) return null
    const pos = stars.geometry.getAttribute('position')
    const first = { x: pos.getX(0), y: pos.getY(0), z: pos.getZ(0) }
    return {
      count: pos.count,
      first,
      radius: Math.hypot(first.x, first.y, first.z),
      renderOrder: stars.renderOrder,
      depthTest: stars.material.depthTest,
    }
  })()`)

  check('the field is drawn from the catalogue', field?.count === STARS.length,
    field ? `${field.count} points vs ${STARS.length} stars` : 'no star geometry in the scene')
  check('and lies on a sphere', field !== null && Math.abs(field.radius - 1000) < 0.5,
    field && `radius ${field.radius.toFixed(1)}`)
  check('and never occludes a body', field?.depthTest === false && field?.renderOrder < 0,
    field && `depthTest ${field.depthTest}, renderOrder ${field.renderOrder}`)

  /*
   * The brightest star in the array is the first one in it, so its drawn vertex
   * is Sirius' — and its direction has to be Sirius'. This is the end-to-end
   * version of the first check: catalogue, conversion, buffer, one comparison.
   */
  if (field) {
    const drawn = directionToRaDec(field.first.x, field.first.y, field.first.z)
    const off = separation(starDirection(drawn.ra, drawn.dec), starDirection(101.2872, -16.7161))
    check(
      'and the first vertex in the buffer is Sirius',
      off < 0.02,
      `RA ${drawn.ra.toFixed(3)}° Dec ${drawn.dec.toFixed(3)}°`,
    )
  }

  /*
   * A star has no parallax, which is the whole reason the dome rides along.
   *
   * The camera is moved a long way — 300 world units, more than Neptune's orbit
   * at this scale — and the direction to a star has to come back unchanged. A
   * field left at the world origin would swing by tens of degrees.
   */
  const parallax = await page.evaluate(`(() => {
    const cam = window.__solar.camera
    let stars = null
    window.__solar.scene.traverse((o) => {
      if (o.isPoints && o.geometry?.getAttribute('aSize')) stars = o
    })
    const pos = stars.geometry.getAttribute('position')
    const at = () => {
      stars.updateMatrixWorld()
      const v = new (cam.position.constructor)(pos.getX(0), pos.getY(0), pos.getZ(0))
      v.applyMatrix4(stars.matrixWorld).sub(cam.position).normalize()
      return { x: v.x, y: v.y, z: v.z }
    }
    const before = at()
    const home = cam.position.clone()
    cam.position.set(home.x + 300, home.y - 120, home.z + 200)
    return new Promise((done) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const after = at()
        cam.position.copy(home)
        done({ before, after })
      }))
    })
  })()`)

  const swing = separation(parallax.before, parallax.after)
  check('a star does not move when the camera does', swing < 0.01, `${swing.toFixed(4)}° of swing`)

  /*
   * Every constellation vertex is a star, checked against the drawn buffers
   * rather than against the source arrays.
   *
   * The bake resolves figures to indices, so the *data* cannot point at a
   * missing star — but the two components convert those positions separately,
   * and nothing in the data stops the lines being drawn on a different radius
   * or through a different rotation. This compares the two buffers.
   */
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    if (!s.layers.constellations) s.toggleLayer('constellations')
  })()`)
  await page.frames(60)

  const figures = await page.evaluate(`(() => {
    let lines = null, stars = null
    window.__solar.scene.traverse((o) => {
      if (o.isLineSegments && o.geometry?.getAttribute('position')?.count > 100) lines = o
      if (o.isPoints && o.geometry?.getAttribute('aSize')) stars = o
    })
    if (!lines || !stars) return null
    const lp = lines.geometry.getAttribute('position')
    const sp = stars.geometry.getAttribute('position')
    // Every star position, rounded to a key, so each line vertex can be looked
    // up rather than searched for.
    const key = (x, y, z) => [x, y, z].map((v) => v.toFixed(2)).join(',')
    const set = new Set()
    for (let i = 0; i < sp.count; i++) set.add(key(sp.getX(i), sp.getY(i), sp.getZ(i)))
    let orphans = 0
    for (let i = 0; i < lp.count; i++) {
      if (!set.has(key(lp.getX(i), lp.getY(i), lp.getZ(i)))) orphans++
    }
    return { vertices: lp.count, orphans, renderOrder: lines.renderOrder }
  })()`)

  const segments = CONSTELLATIONS.reduce((n, c) => n + c.segments.length, 0)
  check('every figure is drawn', figures?.vertices === segments,
    figures ? `${figures.vertices} vertices vs ${segments} endpoints` : 'no line geometry')
  check('and every endpoint of one is a star', figures?.orphans === 0,
    figures && `${figures.orphans} vertices land on no star`)

  /* ---- 4. the Milky Way ---- */

  /*
   * The band, measured off the rendered frame rather than read out of the
   * scene graph.
   *
   * Its geometry is checked structurally below, but "is the Galaxy actually
   * drawn where the Galaxy is" is a question about pixels: the mesh could carry
   * the right vertices and still show the bulge at the anticentre if the texture
   * were mapped the wrong way round, and nothing in the buffers would look
   * wrong.
   *
   * The statistic is the mean of the *darkest 70%* of the middle of the frame.
   * A plain average measures the stars — they are a few hundred very bright
   * pixels against a faint wash — and the median is too coarse at 8 bits to
   * separate one part of the band from another. Trimming the bright tail leaves
   * the diffuse background, which is the thing being asked about.
   */
  const diffuseToward = async (label, l, b) => {
    const d = galacticDirection(l, b)
    await page.evaluate(`(() => {
      const c = window.__solar.controls, cam = window.__solar.camera
      // Stood off along the direction being sampled and looking further along
      // it, so the Sun is behind the camera rather than in the shot.
      cam.position.set(${d.x} * 300, ${d.y} * 300, ${d.z} * 300)
      c.target.set(
        cam.position.x + ${d.x} * 50,
        cam.position.y + ${d.y} * 50,
        cam.position.z + ${d.z} * 50,
      )
      cam.fov = 50
      cam.updateProjectionMatrix()
      c.update()
    })()`)
    await page.frames(25)
    const file = join(tmpdir(), `sky-${label}.png`)
    await page.screenshot(file)
    const { width: W, height: H, channels: C, pixels } = decodePNG(readFileSync(file))
    const values = []
    for (let y = Math.floor(H * 0.25); y < Math.floor(H * 0.6); y++) {
      for (let x = Math.floor(W * 0.25); x < Math.floor(W * 0.75); x++) {
        const i = (y * W + x) * C
        values.push((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3)
      }
    }
    values.sort((a, b2) => a - b2)
    const cut = Math.floor(values.length * 0.7)
    let sum = 0
    for (let i = 0; i < cut; i++) sum += values[i]
    return sum / cut / 255
  }

  const centre = await diffuseToward('centre', 0, 0)
  const anticentre = await diffuseToward('anticentre', 180, 0)
  const northPole = await diffuseToward('pole', 0, 90)
  const carina = await diffuseToward('carina', 295, 0)
  const rift = await diffuseToward('rift', 65, 0)

  check(
    'the sky is brightest toward the galactic centre',
    centre > anticentre * 1.5 && centre > northPole * 3,
    `centre ${centre.toFixed(4)}, anticentre ${anticentre.toFixed(4)}, pole ${northPole.toFixed(4)}`,
  )
  check(
    'and darkest toward the galactic poles',
    northPole < anticentre * 0.6,
    `pole ${northPole.toFixed(4)} vs anticentre ${anticentre.toFixed(4)}`,
  )
  /*
   * Which way round the panorama runs, which is the error a picture cannot
   * show: mirror the map and the bulge stays in Sagittarius while everything
   * else swaps sides.
   *
   * The pair is chosen to be as far from ambiguous as the sky allows, and they
   * are mirror images of each other about `l = 0`. At `l = 295` is the Carina
   * tangent, the brightest stretch of the Milky Way after the bulge itself; at
   * `l = 65` is the Great Rift, the dust lane that splits the band and is the
   * darkest thing on it. Measured: 1.83x the right way round, and 0.94x with
   * the texture coordinates mirrored — so the bar sits between them at 1.4.
   *
   * An earlier version compared `l = 330` against `l = 240` and did not
   * discriminate at all: 3.6 correct against 1.7 mirrored, both clearing a
   * threshold of 1.5. Worse, the first attempt to break it flipped the sign in
   * `galacticLongitudeAt`, which reverses the triangle winding and makes the
   * whole band invisible — every brightness check failed at once and the test
   * looked far stronger than it was.
   */
  check(
    'the Carina tangent reads brighter than the Great Rift',
    carina > rift * 1.4,
    `l=295 ${carina.toFixed(4)} vs l=65 ${rift.toFixed(4)} — ${(carina / rift).toFixed(2)}x`,
  )

  /*
   * And the mesh really is in the galactic frame: the vertex at the middle of
   * the panorama has to point at the galactic centre, which is a published
   * equatorial direction.
   */
  const bulge = await page.evaluate(`(() => {
    let band = null
    window.__solar.scene.traverse((o) => {
      if (o.isMesh && o.renderOrder === -1001) band = o
    })
    if (!band) return null
    const pos = band.geometry.getAttribute('position')
    const uv = band.geometry.getAttribute('uv')
    let best = null, bestD = Infinity
    for (let i = 0; i < uv.count; i++) {
      const d = Math.hypot(uv.getX(i) - 0.5, uv.getY(i) - 0.5)
      if (d < bestD) { bestD = d; best = i }
    }
    const n = Math.hypot(pos.getX(best), pos.getY(best), pos.getZ(best))
    return { x: pos.getX(best) / n, y: pos.getY(best) / n, z: pos.getZ(best) / n, uvOff: bestD }
  })()`)

  if (bulge) {
    const drawn = directionToRaDec(bulge.x, bulge.y, bulge.z)
    const off = separation(starDirection(drawn.ra, drawn.dec), starDirection(266.405, -28.936))
    check(
      'the middle of the panorama points at the galactic centre',
      off < 2,
      `RA ${drawn.ra.toFixed(2)}° Dec ${drawn.dec.toFixed(2)}° — ${off.toFixed(2)}° from Sgr A*`,
    )
  } else {
    check('the middle of the panorama points at the galactic centre', false, 'no band in the scene')
  }

  await page.evaluate(`window.__solar.state().toggleLayer('milkyWay')`)
  await page.frames(30)
  const bandGone = await page.evaluate(`(() => {
    let found = false
    window.__solar.scene.traverse((o) => { if (o.isMesh && o.renderOrder === -1001) found = true })
    return !found
  })()`)
  check('turning the Milky Way off removes it', bandGone === true)
  await page.evaluate(`window.__solar.state().toggleLayer('milkyWay')`)
  await page.frames(20)

  /* And the switch is a switch. */
  await page.evaluate(`window.__solar.state().toggleLayer('constellations')`)
  await page.frames(30)
  const gone = await page.evaluate(`(() => {
    let found = false
    window.__solar.scene.traverse((o) => {
      if (o.isLineSegments && o.geometry?.getAttribute('position')?.count > 100) found = true
    })
    return !found
  })()`)
  check('turning the layer off removes the figures', gone === true)

  const errors = page.errors.filter((e) => !e.startsWith('warning:'))
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await page.close()
}

console.log(failures === 0 ? '\nall sky checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
