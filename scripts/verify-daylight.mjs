/**
 * The colour of the sky, measured off the screen.
 *
 * Every other check in this suite reads a number out of the app. These read
 * *pixels*, because the thing being checked is a picture and there is no
 * intermediate quantity worth trusting: a sky can have perfectly correct
 * uniforms and still render black, which is exactly what it did before
 * `SkyDome` existed.
 *
 * ## The check that matters
 *
 * > **Earth has a blue sky and a red sunset. Mars has a red sky and a blue
 * > sunset.**
 *
 * Both halves of both worlds, and the pair together is far stronger than any
 * one colour. Earth's sky is Rayleigh scattering off gas — strongest at short
 * wavelengths, so blue is scattered *into* the sky by day and *out of* the Sun
 * at sunset. Mars' is dust about a micron across, which scatters forward and
 * slightly favours red: butterscotch by day, and a blue aureole around the
 * setting Sun. Every rover that has photographed a Martian sunset has
 * photographed that inversion.
 *
 * It cannot be satisfied by a plausible mistake. A single swapped constant, a
 * shared colour, a generic warm-tint-at-sunset — any of them passes one of the
 * four and fails another.
 *
 * ## Reading a sky off a screenshot
 *
 * Through `page.pixels`, which composites through the browser rather than
 * calling `gl.readPixels`: the drawing buffer is undefined once a frame has
 * been presented, and reading it returns a rectangle of zeros *silently*. A
 * check written that way reports a black sky over a lit landscape, which looks
 * exactly like the bug it is supposed to catch.
 *
 * Sampled as a mean over a broad patch, because a sky is a wash and a peak
 * would find a star.
 *
 * And with the chrome hidden, which is not tidiness. A screenshot composites
 * the *page*, so the header, the body labels and the surface bar are all in it
 * — white DOM text sitting over the canvas. The first star check measured the
 * words "SOLAR EXPLORER" and reported a contrast of 147 on a black lunar sky,
 * which is a fine number and nothing to do with stars.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openApp } from './lib/browser.mjs'
import { SKIES } from '../src/data/skies.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const rgb = (c) => `rgb(${c.join(', ')})`
/** How strongly a colour leans blue rather than red, -1 to 1. */
const blueness = ([r, , b]) => (b - r) / Math.max(1, r + b)

const page = await openApp()

/** Where the Sun is in the sky, from a place on a body. */
const sunAt = (body, lat, lon) => `(() => {
  const THREE = window.__solar.three
  const p = window.__solar.positions.get('${body}')
  const toSun = new THREE.Vector3().sub(p).normalize()
  const s = window.__solar.surface
  const basis = s.bodyBasis('${body}')
  const spin = s.surfaceSpin('${body}')
  const o = s.surfaceOffset(${lat}, ${lon}, basis, spin, 1, { x: 0, y: 0, z: 0 })
  const up = new THREE.Vector3(o.x, o.y, o.z).normalize()
  const pole = new THREE.Vector3(basis.y.x, basis.y.y, basis.y.z).normalize()
  const north = pole.clone().addScaledVector(up, -up.dot(pole)).normalize()
  const east = north.clone().cross(up)
  return {
    alt: Math.asin(toSun.dot(up)) * 180 / Math.PI,
    az: ((Math.atan2(toSun.dot(east), toSun.dot(north)) * 180 / Math.PI) % 360 + 360) % 360,
  }
})()`

/**
 * How long a solar day is on each body, in Earth days. Sweeping one of these
 * visits every hour there is.
 */
const SOLAR_DAY = { earth: 1.0, mars: 1.0275, luna: 29.53 }

/**
 * Stand somewhere, then find the brightest or darkest hour of its day.
 *
 * **A search for an extreme, not for a chosen altitude**, and that is the whole
 * point. The first version asked for the Sun 40° below the horizon at London
 * and stepped the clock until it got there — which in August it never does. The
 * lowest the Sun reaches at 51.5°N in high summer is about 15° below the
 * horizon, so the loop ran out of steps and returned whatever it happened to be
 * standing in, which was broad daylight. Every "Earth at midnight" measurement
 * was a measurement of noon, and it passed anyway because the check downstream
 * was comparing star counts in two different patches of sky.
 *
 * Sweeping the body's own solar day and taking the extreme always works: it
 * needs no season, no latitude and no assumption about what is reachable, and it
 * reports the altitude it actually found so a check can say so.
 *
 * `want` is 'high' for the middle of the day, 'low' for the middle of the night,
 * and 'set' for the moment the Sun is nearest the horizon.
 */
async function standAt(body, lat, lon, name, want) {
  await page.evaluate(`(() => {
    const s = window.__solar.state()
    // Stop the clock first, and this is not housekeeping. It runs at a day a
    // second, so between setting a date and reading the Sun's altitude back
    // three frames later the Earth has turned eighteen degrees.
    if (!s.paused) s.togglePaused()
    s.standOn('${body}', ${lat}, ${lon}, '${name}')
  })()`)
  await page.frames(220)

  const start = await page.evaluate('window.__solar.simClock.jd')
  const day = SOLAR_DAY[body] ?? 1
  const STEPS = 48

  let best = null
  for (let step = 0; step <= STEPS; step++) {
    const jd = start + (day * step) / STEPS
    await page.evaluate(`window.__solar.setSimulationDate(${jd})`)
    await page.frames(3)
    const sun = await page.evaluate(sunAt(body, lat, lon))
    const score =
      want === 'high' ? sun.alt : want === 'low' ? -sun.alt : -Math.abs(sun.alt)
    const better = best === null || score > best.score
    if (better) best = { jd, sun, score }
  }

  await page.evaluate(`window.__solar.setSimulationDate(${best.jd})`)
  await page.frames(20)
  // Face the Sun, looking a little above the horizon so the frame holds sky.
  await page.evaluate(`window.__solar.state().lookAround(${best.sun.az.toFixed(2)}, 10)`)
  await page.frames(40)
  return best.sun
}

/** Everything the app draws over the canvas, out of the way of a measurement. */
const hideChrome = (hidden) =>
  page.evaluate(
    `(() => {
      for (const el of document.querySelectorAll('.ui-layer, .feature-layer')) {
        el.style.visibility = '${hidden ? 'hidden' : ''}'
      }
      return true
    })()`,
  )

/** A patch of canvas, with no chrome in it. */
async function patch(x, y, w, h) {
  await hideChrome(true)
  const result = await page.pixels(x, y, w, h)
  await hideChrome(false)
  return result
}

/** The mean colour of a patch of sky, and of the patch around the Sun. */
async function sample() {
  const view = await page.evaluate(
    `(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.width, r.height] })()`,
  )
  const [w, h] = view
  return {
    // Around the Sun, which is centred and a little below the middle.
    sunward: (await patch(w / 2 - 70, h * 0.36, 140, 110)).mean,
    // High overhead.
    zenith: (await patch(w * 0.18, h * 0.20, 220, 100)).mean,
  }
}

try {
  console.log('\nThe table\n')

  check(
    'only bodies with air have a sky',
    !SKIES.luna && !SKIES.mercury && !!SKIES.earth && !!SKIES.mars,
    Object.keys(SKIES).join(', '),
  )
  check(
    'every colour is a colour',
    Object.values(SKIES).every((s) =>
      [s.zenith, s.horizon, s.aureole].every((c) => c.length === 3 && c.every((v) => v >= 0 && v <= 1)),
    ),
  )
  /*
   * The inversion, asserted in the data before it is asserted on screen. If
   * these two rows ever agree, the shader below cannot save them.
   */
  check(
    "Earth's sunset colour is warm and Mars' is cool, in the table",
    blueness(SKIES.earth.aureole) < -0.3 && blueness(SKIES.mars.aureole) > 0.15,
    `earth ${blueness(SKIES.earth.aureole).toFixed(2)}, mars ${blueness(SKIES.mars.aureole).toFixed(2)}`,
  )

  console.log('\nEarth\n')

  await standAt('earth', 51.5, 0, 'London', 'high')
  const earthNoon = await sample()
  check(
    'a midday sky over London is blue',
    blueness(earthNoon.zenith) > 0.3 && earthNoon.zenith[2] > earthNoon.zenith[0],
    rgb(earthNoon.zenith),
  )
  check(
    'and blue overhead as well as toward the Sun',
    blueness(earthNoon.sunward) > 0.2,
    rgb(earthNoon.sunward),
  )

  const earthSet = await standAt('earth', 51.5, 0, 'London', 'set')
  const earthSunset = await sample()
  check(
    'the setting Sun sits in a red sky',
    earthSunset.sunward[0] > earthSunset.sunward[2] * 1.8,
    `${rgb(earthSunset.sunward)}, Sun ${earthSet.alt.toFixed(1)}° up`,
  )

  console.log('\nMars\n')

  await standAt('mars', -4.5895, 137.4417, 'Curiosity', 'high')
  const marsNoon = await sample()
  check(
    'a midday sky over Gale is butterscotch, not blue',
    marsNoon.zenith[0] > marsNoon.zenith[2] * 1.4,
    rgb(marsNoon.zenith),
  )

  const marsSet = await standAt('mars', -4.5895, 137.4417, 'Curiosity', 'set')
  const marsSunset = await sample()
  /*
   * The one. Every rover that has watched the Sun go down on Mars has sent back
   * a blue glow around it, and it is the opposite of the sky it sits in.
   */
  check(
    'and the setting Sun sits in a BLUE one — the Martian inversion',
    marsSunset.sunward[2] > marsSunset.sunward[0],
    `${rgb(marsSunset.sunward)}, Sun ${marsSet.alt.toFixed(1)}° up`,
  )
  check(
    'which is the reverse of Earth, measured the same way',
    blueness(marsSunset.sunward) > 0 && blueness(earthSunset.sunward) < 0,
    `mars ${blueness(marsSunset.sunward).toFixed(2)}, earth ${blueness(earthSunset.sunward).toFixed(2)}`,
  )
  check(
    "and the reverse of Mars' own daytime sky",
    blueness(marsSunset.sunward) > blueness(marsNoon.zenith) + 0.15,
    `sunset ${blueness(marsSunset.sunward).toFixed(2)}, noon ${blueness(marsNoon.zenith).toFixed(2)}`,
  )

  console.log('\nNight, and worlds with no air\n')

  /*
   * Deep night on Mars: no sky at all. The dome must not leave a permanent
   * wash over the stars, which is the failure mode of anything driven by a
   * constant rather than by the Sun.
   */
  await standAt('mars', -4.5895, 137.4417, 'Curiosity', 'low')
  const marsNight = await sample()
  check(
    'a Martian midnight has no sky',
    Math.max(...marsNight.zenith) < 14,
    rgb(marsNight.zenith),
  )

  /*
   * And the Moon, which has no air at any hour. Its daytime sky is black with
   * the Sun blazing in it, and that is not a limitation of this app — it is
   * what the Apollo photographs show.
   */
  await standAt('luna', 0.67409, 23.47298, 'Apollo 11', 'high')
  const moonNoon = await sample()
  check(
    'lunar noon has a black sky, as the Apollo photographs do',
    Math.max(...moonNoon.zenith) < 14,
    rgb(moonNoon.zenith),
  )

  console.log('\nStars, and what daylight does to them\n')

  /*
   * **Contrast, not brightness.** A star is a small bright point on a darker
   * ground, and what daylight does to it is flatten that difference — see
   * `daylight.js` for why the app has to be told this rather than deriving it.
   *
   * The first version of this check compared the brightest pixel by day against
   * the brightest by night and asserted day was brighter. It passed, and it was
   * worthless: the daytime sky is itself brighter than any star, so it would
   * have passed just as happily with the stars blazing through a blue noon.
   * Peak *minus* mean is the quantity that actually falls when a star goes out.
   */
  /**
   * A wide patch of sky, and always *away* from the Sun.
   *
   * Wide because star density varies enormously across the sky — one small box
   * can hold forty stars or four, and a check that compares two different
   * patches is measuring the galaxy rather than the app. Away from the Sun so
   * the glare is not in it.
   *
   * Every comparison below is therefore the *same place at two times*, which is
   * the only version of this that means anything.
   */
  const starCount = `(() => {
    const c = document.querySelector('canvas').getBoundingClientRect()
    return [c.width * 0.08, c.height * 0.16, c.width * 0.5, c.height * 0.34]
  })()`

  /**
   * Turn away from the Sun and count what is left in the sky — four times,
   * around the compass, and summed.
   *
   * One patch is not enough and the reason is the galaxy. Star density varies
   * by an order of magnitude across the sky, and the search above lands on
   * whatever date puts the Sun at the altitude asked for — so two runs an hour
   * apart can face completely different constellations. This check went from
   * 706 stars to 42 on a change that touched neither the stars nor the sky,
   * purely because it had drifted onto an empty patch of Ophiuchus.
   *
   * Four headings, ninety degrees apart, starting away from the Sun. The
   * average density of the whole sky is a property of the catalogue rather than
   * of the hour.
   */
  const starsAt = async (body, lat, lon, name, want) => {
    const sun = await standAt(body, lat, lon, name, want)
    let bright = 0
    for (let turn = 0; turn < 4; turn++) {
      const azimuth = (sun.az + 180 + turn * 90) % 360
      await page.evaluate(`window.__solar.state().lookAround(${azimuth.toFixed(2)}, 45)`)
      await page.frames(24)
      bright += (await patch(...(await page.evaluate(starCount)))).bright
    }
    return { bright }
  }

  /*
   * `bright` counts the pixels standing clearly above the patch's own mean.
   * The brightest *single* pixel is no use here: at midday over London it is
   * the Moon, which is genuinely up and genuinely visible — a daytime Moon is
   * not a bug. Only a count separates "two planets" from "two planets and four
   * hundred stars".
   */
  const moonNight = await starsAt('luna', 0.67409, 23.47298, 'Apollo 11', 'low')
  const moonDay = await starsAt('luna', 0.67409, 23.47298, 'Apollo 11', 'high')
  check(
    'the Moon keeps its stars in broad daylight, having no air to lose them in',
    moonDay.bright > moonNight.bright * 0.6,
    `${moonDay.bright} by day against ${moonNight.bright} at night`,
  )

  const earthNight = await starsAt('earth', 51.5, 0, 'London', 'low')
  const earthDay = await starsAt('earth', 51.5, 0, 'London', 'high')
  check(
    'Earth has stars at midnight',
    earthNight.bright > 600,
    `${earthNight.bright} bright pixels`,
  )
  /*
   * A tenth, not nothing. What survives a blue midday is the Moon, Venus and
   * whichever planets are up — all of which are genuinely visible in daylight,
   * and none of which this check should be asking the sky to hide. The bound is
   * on the ratio because the absolute count depends on how many of them happen
   * to be above the horizon that day.
   */
  check(
    'and loses them at midday',
    earthDay.bright < earthNight.bright * 0.15,
    `${earthDay.bright} against ${earthNight.bright} at night`,
  )

  /* Mars too, whose thin air hides them just as thoroughly. */
  const marsDark = await starsAt('mars', -4.5895, 137.4417, 'Curiosity', 'low')
  const marsLit = await starsAt('mars', -4.5895, 137.4417, 'Curiosity', 'high')
  check(
    'and so does Mars, thin air notwithstanding',
    marsDark.bright > 600 && marsLit.bright < marsDark.bright * 0.15,
    `${marsLit.bright} by day against ${marsDark.bright} at night`,
  )

  console.log('\nAnd back out\n')

  await page.evaluate(`window.__solar.state().leaveSurface()`)
  await page.frames(120)
  check(
    'the sky is put away on the way out',
    (await page.evaluate(`(() => {
      let found = 0
      window.__solar.scene.traverse((o) => { if (o.isMesh && o.renderOrder >= 800 && o.visible && o.parent.visible) found++ })
      return found
    })()`)) === 0,
  )

  const errors = page.errors.filter((e) => !e.startsWith('warning:'))
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await page.close()
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
