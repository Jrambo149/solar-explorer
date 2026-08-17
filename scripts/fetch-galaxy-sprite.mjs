#!/usr/bin/env node
/**
 * Fetches the face-on Milky Way that Eyes draws, and works out which way round
 * it goes.
 *
 * Run with:
 *     npm run fetch:galaxy-sprite        (needs `npm run dev` running)
 *
 * ## Where it comes from
 *
 * `https://eyes.nasa.gov/assets/static/sprites/milky_way.png` — read out of
 * Eyes' own `app.js`, which sets it up like this:
 *
 *     e.setTextureUrl("$STATIC_ASSETS_URL/sprites/milky_way.png")
 *     e.setSize(new Vector2(12e17, 12e17))
 *     e.setTransparent(true); e.setBlending("normal")
 *     e.setVisibleInterval(new VisibleInterval(12e15, +Infinity, "z-distance"))
 *
 * Eyes works in kilometres, so 1.2e18 km is 126,840 light years across — the
 * whole disc — and it appears once the camera is more than 1.2e16 km out, which
 * is 1,268 light years. The picture itself is R. Hurt's (NASA/JPL-Caltech)
 * artist's rendering of the Galaxy seen from the north galactic pole.
 *
 * Eyes builds the same galactic frame this app does, from the same two
 * directions — its `app.js` carries 192.85948120833 / 27.12825119444 for the
 * pole and 266.40499625 / -28.93617241667 for the centre, against `sky.js`'s
 * 192.85948 / 27.12825 and 266.405 / -28.936.
 *
 * ## The one thing Eyes does not have to decide
 *
 * Its Milky Way is a **sprite** — a billboard that turns to face the camera. So
 * the picture is always seen face-on from anywhere, and the question "which way
 * is the image rotated within the galactic plane" never comes up, because it is
 * never *in* the plane.
 *
 * This app lays it in the plane, where it belongs, so that flying out at an
 * angle shows the disc at that angle. That buys a rotation to get wrong, and
 * getting it wrong is invisible: a spiral rotated 90 degrees, or mirrored, is
 * still a perfectly convincing spiral. It is the same trap `galacticLongitudeAt`
 * describes for the panorama — mirroring the Galaxy leaves the bulge in
 * Sagittarius and swaps everything else.
 *
 * So it is measured rather than eyeballed. The image's own arms are matched
 * against Reid et al. 2019's six spirals — already baked into
 * `src/data/galaxy.js`, in galactocentric coordinates — by scoring the total
 * image brightness along the arm loci over every rotation and both
 * handednesses. The arms are the brightest ridges in the picture, so the
 * correct alignment is a clear peak, and the margin over the runner-up is
 * reported so a weak fit cannot pass quietly.
 *
 * ## Why a browser decodes the PNG
 *
 * It is a colour-mapped PNG with an alpha channel, and this repo has no image
 * decoder and no dependencies to add one with. Headless Chrome is already here
 * for the verification scripts, already knows how to decode a PNG, and can hand
 * back an ImageData in three lines. The dev server serves the file, so the page
 * and the image are same-origin and the canvas is not tainted.
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARMS, DISC, R0 } from '../src/data/galaxy.js'
import { openApp } from './lib/browser.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PNG = join(ROOT, 'public', 'textures', 'milky-way-face.png')
const OUT = join(ROOT, 'src', 'data', 'galaxySprite.js')

const SOURCE = 'https://eyes.nasa.gov/assets/static/sprites/milky_way.png'

/** Eyes' sprite size, in kilometres, straight out of its `app.js`. */
const SIZE_KM = 12e17
const KM_PER_PARSEC = 3.0856775814913673e13

const log = (...args) => console.log('[galaxy-sprite]', ...args)
const D = Math.PI / 180

/* ---- the image ---- */

log(`fetching ${SOURCE} …`)
const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${SOURCE}`)
const bytes = Buffer.from(await res.arrayBuffer())
writeFileSync(PNG, bytes)
log(`wrote ${PNG} (${(bytes.length / 1024).toFixed(0)} KB)`)

/**
 * Half the sprite's width, in kiloparsecs — the radius the image covers.
 *
 * The disc this app draws stops at `DISC.edge`, 16 kpc, which is well inside
 * this: the picture is a whole galaxy including the faint outer reaches, and
 * Reid's arms are measured across the inner part of it.
 */
const RADIUS_KPC = SIZE_KM / 2 / KM_PER_PARSEC / 1000
log(`sprite radius ${RADIUS_KPC.toFixed(2)} kpc (${(RADIUS_KPC * 2000 * 3.261564).toFixed(0)} ly across)`)

/* ---- decode it ---- */

const GRID = 256

log('decoding through headless Chrome …')
const page = await openApp()
let grid
try {
  grid = await page.evaluate(
    `(async () => {
      const image = new Image()
      image.src = '/textures/milky-way-face.png'
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = ${GRID}
      canvas.height = ${GRID}
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(image, 0, 0, ${GRID}, ${GRID})
      const data = ctx.getImageData(0, 0, ${GRID}, ${GRID}).data
      const out = new Array(${GRID} * ${GRID})
      for (let i = 0; i < out.length; i++) {
        // Luminance times alpha: the background is fully transparent, and
        // without the alpha every transparent pixel would read as bright white
        // and drown the arms entirely.
        const a = data[i * 4 + 3] / 255
        const l = (data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722) / 255
        out[i] = l * a
      }
      return { out, natural: [image.naturalWidth, image.naturalHeight] }
    })()`,
  )
} finally {
  await page.close()
}
log(`decoded ${grid.natural.join('x')} to a ${GRID}x${GRID} brightness grid`)

const brightness = grid.out
const kpcPerCell = (RADIUS_KPC * 2) / GRID

/**
 * Samples the image at a galactocentric point, under a candidate alignment.
 *
 * `mirror` flips the azimuth, which is the handedness: an image drawn looking
 * down on the north galactic pole and one drawn looking up at the south pole
 * are mirror images, and nothing about a spiral says which you are holding.
 */
function sampleAt(R, beta, rotation, mirror) {
  const angle = (mirror ? -beta : beta) + rotation
  const x = R * Math.cos(angle * D)
  const y = R * Math.sin(angle * D)
  // Image rows run downward, so y is negated to keep the sampled frame
  // right-handed with the galactocentric one.
  const cx = GRID / 2 + x / kpcPerCell
  const cy = GRID / 2 - y / kpcPerCell
  const ix = Math.round(cx)
  const iy = Math.round(cy)
  if (ix < 0 || iy < 0 || ix >= GRID || iy >= GRID) return 0
  return brightness[iy * GRID + ix]
}

const armRadius = (arm, beta) =>
  arm.Rref * Math.exp(-(beta - arm.betaref) * D * Math.tan(arm.psi * D))

/**
 * How well the image's light lines up with Reid's arms, for one alignment.
 *
 * Scored as the mean brightness along the arms *minus* the mean brightness on
 * either side of them, half a kiloparsec out. The subtraction is what makes it
 * a measure of the arms rather than of the bulge: the centre is the brightest
 * part of the picture by far, and a plain sum along the loci would simply
 * reward whichever rotation dragged the most of them across the middle.
 */
function score(rotation, mirror) {
  let on = 0
  let off = 0
  let n = 0
  for (const arm of ARMS) {
    for (let beta = arm.betaMin; beta <= arm.betaMax; beta += 2) {
      const R = armRadius(arm, beta)
      if (R < 3 || R > DISC.edge) continue
      on += sampleAt(R, beta, rotation, mirror)
      off += (sampleAt(R - 0.9, beta, rotation, mirror) + sampleAt(R + 0.9, beta, rotation, mirror)) / 2
      n++
    }
  }
  return n === 0 ? -Infinity : (on - off) / n
}

log('fitting the image against Reid’s arms …')
const results = []
for (const mirror of [false, true]) {
  for (let rotation = 0; rotation < 360; rotation += 1) {
    results.push({ rotation, mirror, value: score(rotation, mirror) })
  }
}
results.sort((a, b) => b.value - a.value)
const best = results[0]

/*
 * The runner-up has to be a genuinely different alignment, not the same peak
 * one degree over — otherwise every fit would look decisive by definition.
 */
const separation = (a, b) => Math.abs(((a - b + 180) % 360) - 180)
const rival = results.find(
  (r) => r.mirror !== best.mirror || separation(r.rotation, best.rotation) > 30,
)
const margin = best.value / rival.value

log(
  `best: rotation ${best.rotation}°, ${best.mirror ? 'mirrored' : 'not mirrored'}, ` +
    `contrast ${best.value.toFixed(4)}`,
)
log(
  `next distinct alignment: rotation ${rival.rotation}°, ` +
    `${rival.mirror ? 'mirrored' : 'not mirrored'}, contrast ${rival.value.toFixed(4)} ` +
    `— ${margin.toFixed(2)}x weaker`,
)

const today = new Date().toISOString().slice(0, 10)

writeFileSync(
  OUT,
  `/**
 * How the face-on Milky Way image is laid into the galactic plane.
 *
 * GENERATED by \`scripts/fetch-galaxy-sprite.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:galaxy-sprite\` instead. Generated ${today}.
 *
 * The picture is the one NASA's Eyes on the Solar System draws (R. Hurt,
 * NASA/JPL-Caltech), fetched from \`${SOURCE}\`
 * and stored at \`public/textures/milky-way-face.png\`. Eyes sizes it 1.2e18 km
 * across; it billboards its copy, so it never has to decide which way round the
 * image goes. This one lies in the plane, so it does.
 *
 * \`rotation\` and \`mirrored\` are **measured**, not chosen: the image's own
 * spiral arms were matched against Reid et al. 2019's six, by scoring
 * brightness along the arm loci against brightness half a kiloparsec either
 * side of them, over every rotation and both handednesses. See the script.
 */

/** Half the sprite's width, in kiloparsecs. Eyes' 1.2e18 km, converted. */
export const SPRITE_RADIUS_KPC = ${Number(RADIUS_KPC.toFixed(4))}

/** Degrees to turn the image within the plane, about the galactic pole. */
export const SPRITE_ROTATION = ${best.rotation}

/** Whether the image is a view from the *south* pole and must be flipped. */
export const SPRITE_MIRRORED = ${best.mirror}

/**
 * Arm contrast at the fitted alignment, and how much better it is than the best
 * genuinely different one. \`verify-galaxy\` re-measures both.
 */
export const SPRITE_FIT = { contrast: ${Number(best.value.toFixed(5))}, margin: ${Number(margin.toFixed(3))} }
`,
)
log(`wrote ${OUT}`)
