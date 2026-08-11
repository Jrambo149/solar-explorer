/**
 * Texture preloading.
 *
 * Every texture is loaded up front, before the scene mounts, so that:
 *   - the loading bar reports genuine progress rather than guessing,
 *   - planets never pop in half-textured,
 *   - components can read textures synchronously (no Suspense boundaries).
 *
 * The photographic maps are fetched at install time by scripts/fetch-textures.mjs
 * and land as .jpg (or .png for the ring). If a download failed, that script
 * draws a procedural .png instead — so each key is tried at its photographic
 * extension first and falls back to .png. A key that resolves to neither ends
 * up as `null`, and the planet renders as a flat shaded sphere in its own
 * colour.
 */

import * as THREE from 'three'

/**
 * key -> extension of the photographic map, or `null` where none is published.
 *
 * A `null` here is not a missing entry: it says this body has no photograph in
 * the texture set and is drawn procedurally by design. The loader skips
 * straight to the `.png` the install script writes, rather than requesting a
 * `.jpg` that will always 404 and always log a warning.
 */
const PHOTO_EXT = {
  sun: 'jpg',
  mercury: 'jpg',
  venus: 'jpg',
  earth: 'jpg',
  'earth-night': 'jpg',
  mars: 'jpg',
  jupiter: 'jpg',
  saturn: 'jpg',
  'saturn-ring': 'png',
  uranus: 'jpg',
  neptune: 'jpg',

  /* Dwarf planets. The four with maps are Solar System Scope's *fictional*
     surfaces — nobody has imaged them — which is why `bodies.js` marks them
     as invented for the info panel.

     Pluto is absent from this table entirely: its map is the New Horizons
     mosaic that comes inside NASA's 3D model, loaded by `models.js` and read
     straight off the mesh's material. It has to be, because the map is
     authored against that mesh's UV unwrap rather than a three.js sphere's.
     The procedural `pluto.png` the generator still draws is the fallback if
     the model fails to load. */
  ceres: 'jpg',
  eris: 'jpg',
  haumea: 'jpg',
  makemake: 'jpg',
  pluto: null,

  /* Moons. Only ours is published; every other row here draws procedurally.

     The ones with a NASA model behind them (see `models.js`) read their map off
     the mesh's own material and never reach for these files — for those, the
     procedural draw is the fallback if the model fails to load. The fifteen
     added last have no model and no map, so for them this *is* the surface. */
  luna: 'jpg',
  phobos: null,
  deimos: null,
  io: null,
  europa: null,
  ganymede: null,
  callisto: null,

  /* Saturn's icy moons, inner to outer. */
  mimas: null,
  enceladus: null,
  tethys: null,
  dione: null,
  rhea: null,
  titan: null,
  iapetus: null,

  /* The Uranian five. */
  miranda: null,
  ariel: null,
  umbriel: null,
  titania: null,
  oberon: null,

  triton: null,

  /* The Pluto system. */
  charon: null,
  styx: null,
  nix: null,
  kerberos: null,
  hydra: null,
}

/**
 * Maps that ship in the repo, under `public/maps/`.
 *
 * Everything in `PHOTO_EXT` lives in `public/textures/`, which is gitignored:
 * those maps are either downloaded from Solar System Scope or drawn by the
 * procedural generator, both of which `npm install` can redo on any machine.
 *
 * These cannot be redone that way. They are resampled out of a NASA model — a
 * 19 MB Blender export that is itself too large to keep in the repo — so the
 * derived map is the artefact, and it is committed. `prepare-earth-maps.mjs`
 * rebuilds them for anyone who has the archive.
 *
 * They are also exempt from the grading table below. The maps in `GRADES` are
 * corrected against reference photographs because the Solar System Scope set is
 * built for general use and reads flat; a NASA product needs no such help.
 */
const COMMITTED = {
  'earth-nasa': { file: 'earth-nasa.jpg' },
  // A normal map is a field of unit vectors, not a picture, and must not be
  // reinterpreted through sRGB on the way to the GPU.
  'earth-nasa-normal': { file: 'earth-nasa-normal.png', data: true },
}

export const TEXTURE_KEYS = [...Object.keys(PHOTO_EXT), ...Object.keys(COMMITTED)]

const urlFor = (key, ext) => `${import.meta.env.BASE_URL}textures/${key}.${ext}`
const committedUrlFor = (key) => `${import.meta.env.BASE_URL}maps/${COMMITTED[key].file}`

/* ---- colour grading ----
 *
 * The Solar System Scope maps are accurate but flat: they are built for
 * general use and are noticeably less saturated than the reference photographs
 * of these bodies. Rather than ship hand-edited copies of a CC BY texture set,
 * each map is graded once at load, on a canvas, before it ever reaches the GPU.
 * The numbers below were measured against the reference images — comparing the
 * lit albedo of the photographed disc against the mean of the current map — so
 * they are corrections, not taste.
 *
 * Grades are applied in place of, not on top of, one another: a `ramp` recolours
 * from scratch, a `tint`/`saturation` adjusts what is already there.
 */
const GRADES = {
  /**
   * Mercury's map is effectively greyscale — measured mean chroma 0.44 against
   * the reference's 6.41. There is no colour there to amplify; multiplying it
   * would only bring up JPEG noise. What actually gives the MESSENGER
   * enhanced-colour view its look is a relationship between *brightness and
   * hue*: dark low-lying terrain runs cool and violet, bright rayed material
   * runs warm and creamy. So the grade rebuilds colour from luminance through
   * this ramp, sampled straight out of the reference photo in eight brightness
   * bins. The map's own luminance is preserved exactly, so every crater and ray
   * survives untouched — only the hue is new.
   */
  mercury: {
    ramp: [
      [0.223, [64, 61, 71]],
      [0.316, [86, 81, 88]],
      [0.409, [110, 103, 103]],
      [0.502, [135, 126, 116]],
      [0.596, [156, 148, 133]],
      [0.689, [178, 173, 153]],
      [0.782, [199, 197, 180]],
      [0.875, [222, 222, 208]],
    ],
    // The reference is a colour-enhanced product; at full strength it reads as
    // a novelty rather than a planet.
    rampStrength: 0.72,
  },

  /**
   * Chroma only, no hue shift.
   *
   * Switching to the Magellan surface got the map itself to (196, 112, 39)
   * against the reference photo's (190, 122, 38) — already the right golden
   * orange, so there is nothing to correct at the source. But the *rendered*
   * planet still came out pale next to the photo, because a flat comparison of
   * two images ignores everything in between: ACES tone mapping pulls colour
   * out of the brighter midtones, and a real light falloff across a sphere
   * desaturates in a way a photographic product does not. This boost is aimed
   * at what ends up on screen rather than at what is on disk.
   */
  venus: { saturation: 1.3 },

  /** Pull red down out of the pale cyan, toward the reference turquoise. */
  uranus: { tint: [0.97, 1.02, 1.0], saturation: 1.3 },

  /** Lift green and blue: the map sits violet-navy, the reference is azure. */
  neptune: { tint: [0.93, 1.3, 1.09], saturation: 1.12 },
}

const LUM = [0.2126, 0.7152, 0.0722]
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Colour for a normalised luminance, linearly interpolated along a ramp. */
function sampleRamp(ramp, t) {
  if (t <= ramp[0][0]) return ramp[0][1]
  const last = ramp[ramp.length - 1]
  if (t >= last[0]) return last[1]
  for (let i = 1; i < ramp.length; i++) {
    if (t > ramp[i][0]) continue
    const [t0, c0] = ramp[i - 1]
    const [t1, c1] = ramp[i]
    const f = (t - t0) / (t1 - t0)
    return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f]
  }
  return last[1]
}

/**
 * Returns a graded copy of the texture, or the original if it has no grade.
 *
 * Runs once per texture at load. A 2K map is ~2M pixels, which is a few
 * milliseconds — and it happens behind the loading screen, before the scene
 * mounts, so it costs nothing that the user sees.
 */
function grade(texture, key) {
  const g = GRADES[key]
  if (!g || !texture?.image) return texture

  const { image } = texture
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) return texture

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0)

  const data = ctx.getImageData(0, 0, width, height)
  const px = data.data
  const { ramp, rampStrength = 1, tint, saturation = 1 } = g

  for (let i = 0; i < px.length; i += 4) {
    let r = px[i]
    let b1 = px[i + 1]
    let b2 = px[i + 2]
    const lum = LUM[0] * r + LUM[1] * b1 + LUM[2] * b2

    if (ramp) {
      const target = sampleRamp(ramp, lum / 255)
      // Rescale the ramp colour to the pixel's own luminance, so the recolour
      // carries none of the reference's brightness — only its hue.
      const targetLum = LUM[0] * target[0] + LUM[1] * target[1] + LUM[2] * target[2]
      const k = targetLum > 1 ? lum / targetLum : 1
      r = r + (target[0] * k - r) * rampStrength
      b1 = b1 + (target[1] * k - b1) * rampStrength
      b2 = b2 + (target[2] * k - b2) * rampStrength
    }

    if (tint) {
      r *= tint[0]
      b1 *= tint[1]
      b2 *= tint[2]
    }

    if (saturation !== 1) {
      // Scale chroma about luminance, which changes colourfulness without
      // shifting how light or dark the pixel is.
      const l = LUM[0] * r + LUM[1] * b1 + LUM[2] * b2
      r = l + (r - l) * saturation
      b1 = l + (b1 - l) * saturation
      b2 = l + (b2 - l) * saturation
    }

    px[i] = clamp255(r)
    px[i + 1] = clamp255(b1)
    px[i + 2] = clamp255(b2)
  }

  ctx.putImageData(data, 0, 0)

  // The nav chips and the info-panel disc are CSS backgrounds, not 3D — if they
  // kept pointing at the file on disk they would show the ungraded colours and
  // visibly disagree with the planet on screen. A small graded thumbnail costs
  // a few KB and keeps the two in step.
  const thumb = document.createElement('canvas')
  thumb.width = 512
  thumb.height = Math.max(1, Math.round((512 * height) / width))
  thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height)
  displayUrls.set(key, thumb.toDataURL('image/jpeg', 0.82))

  const graded = new THREE.CanvasTexture(canvas)
  graded.flipY = texture.flipY
  return graded
}

/** key -> THREE.Texture | null (null means it could not be loaded) */
const cache = new Map()
/** key -> the URL that actually resolved. */
const resolvedUrls = new Map()
/** key -> a graded thumbnail data URL, for keys that are colour graded. */
const displayUrls = new Map()

let inflight = null

/** Synchronous read. Returns null before preloading finishes or on failure. */
export function getTexture(key) {
  return cache.get(key) ?? null
}

/**
 * The URL the map actually loaded from, or null.
 *
 * The nav chips and the info panel render the same photographic map as the 3D
 * scene, as a CSS background. They can't guess the extension: a body may have
 * resolved to its .jpg photo or to a procedural .png fallback, and hardcoding
 * either one silently produces a blank chip. This reports what really loaded —
 * and since the loader has already fetched it, the browser serves it from cache.
 */
export function getTextureURL(key) {
  return displayUrls.get(key) ?? resolvedUrls.get(key) ?? null
}

function configure(texture, key) {
  // Colour maps are authored in sRGB. The ring's alpha strip and the night
  // lights are read as data/emissive and also look right in sRGB here. A normal
  // map is the exception and stays linear.
  texture.colorSpace = COMMITTED[key]?.data ? THREE.NoColorSpace : THREE.SRGBColorSpace
  texture.anisotropy = 8

  if (key === 'saturn-ring') {
    // The strip is sampled across the ring's radius; clamping stops the outer
    // edge bleeding back around to the inner edge.
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
  } else {
    // Equirectangular maps wrap in longitude, clamp at the poles.
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
  }

  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

/** Resolves to a Texture, or null once both the photo and fallback have failed. */
function loadOne(loader, key) {
  return new Promise((resolve) => {
    const attempt = (ext, onFail) => {
      const url = urlFor(key, ext)
      loader.load(
        url,
        (texture) => {
          resolvedUrls.set(key, url)
          // Grade before configuring: grading swaps in a new texture object, so
          // the filtering and wrap settings have to be applied to that one.
          resolve(configure(grade(texture, key), key))
        },
        undefined,
        onFail,
      )
    }

    const giveUp = () => {
      console.warn(`[textures] could not load "${key}" — falling back to flat colour`)
      resolve(null)
    }

    // Committed maps have no fallback chain and no grading: there is exactly one
    // file, it is in the repo, and if it is missing something is wrong with the
    // checkout rather than with the install.
    if (COMMITTED[key]) {
      const url = committedUrlFor(key)
      loader.load(
        url,
        (texture) => {
          resolvedUrls.set(key, url)
          resolve(configure(texture, key))
        },
        undefined,
        giveUp,
      )
      return
    }

    // No photographic map exists for this key, so there is nothing to try
    // first — go straight to the drawn one.
    if (!PHOTO_EXT[key]) {
      attempt('png', giveUp)
      return
    }

    attempt(PHOTO_EXT[key], () => {
      // Photographic map missing — try the procedural fallback the install
      // script would have written.
      attempt('png', giveUp)
    })
  })
}

/**
 * Loads every texture once. Safe to call repeatedly — subsequent calls return
 * the same promise.
 *
 * @param {(progress: number) => void} [onProgress] called with 0..1
 */
export function preloadTextures(onProgress) {
  if (inflight) return inflight

  const loader = new THREE.TextureLoader()
  let done = 0

  inflight = Promise.all(
    TEXTURE_KEYS.map((key) =>
      loadOne(loader, key).then((texture) => {
        cache.set(key, texture)
        done += 1
        onProgress?.(done / TEXTURE_KEYS.length)
        return texture
      }),
    ),
  )

  return inflight
}
