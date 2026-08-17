/**
 * Where a star goes, how big it is drawn, and what colour it is.
 *
 * Kept out of `Starfield` and free of three.js so that the checks can import it
 * and compare a star's drawn direction against its published coordinates
 * without a browser — the conversion below is the one thing in the sky that can
 * be silently, plausibly wrong.
 */

/**
 * Obliquity of the ecliptic at J2000, in degrees.
 *
 * The catalogue is equatorial — right ascension and declination, measured from
 * the Earth's equator and the vernal equinox — and every body in this app is
 * ecliptic, because that is the plane the planets are in. The two share an
 * x-axis (the equinox) and differ by this angle about it.
 *
 * Getting the sign backwards tilts the entire sky by 46.9°, which is the kind
 * of error that looks fine: the constellations keep their shapes, the Milky Way
 * still crosses the sky, and only a comparison against a known star finds it.
 * `verify-sky` makes that comparison.
 */
export const OBLIQUITY_J2000 = 23.4392911

const RADIANS = Math.PI / 180
const COS_E = Math.cos(OBLIQUITY_J2000 * RADIANS)
const SIN_E = Math.sin(OBLIQUITY_J2000 * RADIANS)

/**
 * A catalogue position to a direction in the app's world frame.
 *
 * Two steps, and the second is `eclipticToWorld` from `kepler.js` written out
 * rather than imported — equatorial to ecliptic about the shared x-axis, then
 * the ecliptic-to-world axis swap the bodies use (`x, z, -y`). Written out
 * because this is a hot loop over 8,922 stars at mount and the whole point of
 * the file is that both halves are visible in one place.
 */
export function starDirection(raDegrees, decDegrees, out = { x: 0, y: 0, z: 0 }) {
  const ra = raDegrees * RADIANS
  const dec = decDegrees * RADIANS
  const cosDec = Math.cos(dec)

  // Equatorial unit vector.
  const xe = cosDec * Math.cos(ra)
  const ye = cosDec * Math.sin(ra)
  const ze = Math.sin(dec)

  // Rotate about x into the ecliptic frame.
  const xc = xe
  const yc = ye * COS_E + ze * SIN_E
  const zc = -ye * SIN_E + ze * COS_E

  out.x = xc
  out.y = zc
  out.z = -yc
  return out
}

/**
 * The inverse, for checking: a world direction back to right ascension and
 * declination in degrees.
 */
export function directionToRaDec(x, y, z) {
  // Undo the world axis swap.
  const xc = x
  const yc = -z
  const zc = y

  // And the obliquity, the other way.
  const xe = xc
  const ye = yc * COS_E - zc * SIN_E
  const ze = yc * SIN_E + zc * COS_E

  const length = Math.hypot(xe, ye, ze) || 1
  let ra = Math.atan2(ye, xe) / RADIANS
  if (ra < 0) ra += 360
  return { ra, dec: Math.asin(ze / length) / RADIANS }
}

/**
 * The galactic frame, for the Milky Way panorama.
 *
 * Galactic coordinates are defined by two directions in the equatorial frame:
 * the north galactic pole, and the galactic centre. Both are conventions fixed
 * by the IAU in 1958 and carried over to J2000 as exact numbers rather than
 * measurements — the true centre of the Galaxy (Sagittarius A*) is about 0.07°
 * off `l = 0`, and everyone keeps using the convention anyway.
 */
const NORTH_GALACTIC_POLE = { ra: 192.85948, dec: 27.12825 }
const GALACTIC_CENTRE = { ra: 266.405, dec: -28.936 }

/**
 * The galactic axes, in world coordinates.
 *
 * Built once, from the two directions above, run through the same equatorial
 * conversion the stars use — so the band and the stars cannot end up in
 * different frames. `x` points at the galactic centre, `z` at the north pole,
 * and `y` completes a right-handed set, which puts it at `l = 90°`.
 */
const GALACTIC = (() => {
  const z = starDirection(NORTH_GALACTIC_POLE.ra, NORTH_GALACTIC_POLE.dec)
  const centre = starDirection(GALACTIC_CENTRE.ra, GALACTIC_CENTRE.dec)

  // Gram-Schmidt: the centre is 0.07° off perpendicular to the pole, so it is
  // squared up rather than trusted.
  const dot = centre.x * z.x + centre.y * z.y + centre.z * z.z
  const x = { x: centre.x - dot * z.x, y: centre.y - dot * z.y, z: centre.z - dot * z.z }
  const length = Math.hypot(x.x, x.y, x.z)
  x.x /= length
  x.y /= length
  x.z /= length

  const y = {
    x: z.y * x.z - z.z * x.y,
    y: z.z * x.x - z.x * x.z,
    z: z.x * x.y - z.y * x.x,
  }
  return { x, y, z }
})()

/** A galactic longitude and latitude, in degrees, to a world direction. */
export function galacticDirection(lDegrees, bDegrees, out = { x: 0, y: 0, z: 0 }) {
  const l = lDegrees * RADIANS
  const b = bDegrees * RADIANS
  const cosB = Math.cos(b)
  const a = cosB * Math.cos(l)
  const c = cosB * Math.sin(l)
  const d = Math.sin(b)

  out.x = GALACTIC.x.x * a + GALACTIC.y.x * c + GALACTIC.z.x * d
  out.y = GALACTIC.x.y * a + GALACTIC.y.y * c + GALACTIC.z.y * d
  out.z = GALACTIC.x.z * a + GALACTIC.y.z * c + GALACTIC.z.z * d
  return out
}

/**
 * A heliocentric galactic Cartesian position to a world one.
 *
 * `u` points at the Galactic centre, `v` at `l = 90` (the way the Galaxy
 * turns), `w` at the north Galactic pole — the axes `GALACTIC` already holds,
 * used as a basis rather than only as a direction.
 *
 * This is what puts the Galaxy's disc in the same frame as the band that
 * precedes it and the stars that are drawn among it. Building a second rotation
 * for the disc would have been a second chance to get the handedness wrong, and
 * the header above records what that costs: mirroring the Galaxy leaves the
 * bulge in Sagittarius and swaps everything else, which is invisible without a
 * landmark to check against.
 *
 * Units are whatever the caller's are — it is a rotation, and it scales.
 */
export function galacticToWorld(u, v, w, out = { x: 0, y: 0, z: 0 }) {
  out.x = GALACTIC.x.x * u + GALACTIC.y.x * v + GALACTIC.z.x * w
  out.y = GALACTIC.x.y * u + GALACTIC.y.y * v + GALACTIC.z.y * w
  out.z = GALACTIC.x.z * u + GALACTIC.y.z * v + GALACTIC.z.z * w
  return out
}

/**
 * Which way round the panorama runs, measured rather than assumed.
 *
 * The texture is an equirectangular map in galactic coordinates with the
 * bulge at its centre — measured, not read off a label: the brightest column
 * of the band sits at u = 0.503 and the band's centre line at that column is
 * at latitude 1.3°, so `l = 0` is the middle of the image and `b = 0` its
 * middle row.
 *
 * The handedness took a real measurement. Sampling brightness along the band
 * in 3° steps either side of the bulge gives a bright plateau running 75° one
 * way, ending in a cliff from 0.375 to 0.11 over about six degrees, and a much
 * shorter falloff the other way with a modest secondary bump around 85°. Those
 * are the Carina tangent (`l ≈ 285`, the brightest stretch of the southern
 * Milky Way, dropping into Vela) and the Cygnus star cloud (`l ≈ 80`)
 * respectively — so longitude *decreases* as the image runs left to right.
 *
 * Getting this backwards mirrors the Galaxy: the bulge stays in Sagittarius
 * and everything else swaps sides, which is invisible without a landmark.
 */
export const galacticLongitudeAt = (u) => (0.5 - u) * 360

/**
 * The magnitude range the drawing maps onto, and why it is not the real one.
 *
 * Magnitude is logarithmic in flux: Sirius at -1.44 is about 1,600 times as
 * bright as the faintest star here at 6.5, and a field drawn in true relative
 * flux is one white dot and eight thousand black ones. Every star chart ever
 * printed compresses this, and so does this: the range below is mapped to a
 * brightness curve rather than to flux.
 */
const MAG_BRIGHTEST = -1.5
const MAG_FAINTEST = 6.5

/**
 * How much of the compression goes into brightness, and how much into size.
 *
 * The eye reads a bright star as both bigger and whiter, and a chart that gives
 * it all to alpha produces a flat field of same-sized dots in different greys.
 * Splitting it keeps the sky's structure legible: the pattern a constellation
 * makes is carried by which stars are *large*, and the depth of the field by
 * how faint the rest are.
 */
const SIZE_BASE = 0.62
const SIZE_SPREAD = 0.8
const ALPHA_FLOOR = 0.26
const ALPHA_SPREAD = 0.74

/**
 * Two gammas, in opposite directions, and the numbers that forced them.
 *
 * The naked-eye sky is overwhelmingly faint: of the 8,922 stars here the median
 * is magnitude 5.89 and the tenth percentile is 4.48, so nine tenths of the
 * catalogue sits inside the top fifth of the magnitude range. A ramp that is
 * linear in magnitude therefore leaves nearly every star on the floor — a first
 * pass raised `t` to 2.2 to keep the bright ones standing out, and measured a
 * **median alpha of 0.163 against a floor of 0.16**. That is a sky with a few
 * dozen stars in it and eight thousand invisible ones, which is neither what the
 * eye sees nor what the procedural field it replaced looked like: that one
 * averaged 0.48.
 *
 * So brightness is *compressed* — `t^0.6` lifts the faint mass to a median near
 * 0.42 — and size is *expanded*, `t^1.6`, so only the genuinely bright stars
 * grow. The compression is what makes the field read as a sky; the expansion is
 * what keeps Sirius, Vega and Betelgeuse standing out of it.
 */
const ALPHA_GAMMA = 0.6
const SIZE_GAMMA = 1.6

/** Where a magnitude falls in the drawn range: 1 at Sirius, 0 at the limit. */
export function magnitudeRamp(magnitude) {
  const t = (MAG_FAINTEST - magnitude) / (MAG_FAINTEST - MAG_BRIGHTEST)
  return Math.min(1, Math.max(0, t))
}

export const starSize = (magnitude) =>
  SIZE_BASE + Math.pow(magnitudeRamp(magnitude), SIZE_GAMMA) * SIZE_SPREAD

export const starAlpha = (magnitude) =>
  ALPHA_FLOOR + Math.pow(magnitudeRamp(magnitude), ALPHA_GAMMA) * ALPHA_SPREAD

/**
 * The same three functions, in GLSL, built from the same constants.
 *
 * `Starfield` works a star's size and brightness out once, on the CPU, because
 * on a dome they never change: every star is the same distance away forever, so
 * its apparent magnitude is the catalogue's and that is that.
 *
 * `DeepField` cannot. Its stars are at their real distances, the camera moves
 * among them, and the whole point of the journey out is that a star's apparent
 * magnitude changes as you approach or leave it. That has to happen per vertex
 * per frame, which means in a shader.
 *
 * Interpolated from the constants above rather than typed out again, because
 * the two skies cross-fade into each other and a sky that dimmed or swelled
 * across the handover would be the immediate, obvious symptom of these numbers
 * having drifted apart. There is no version of this worth maintaining twice.
 */
export const STAR_RAMP_GLSL = /* glsl */ `
  float magnitudeRamp(float magnitude) {
    return clamp((${MAG_FAINTEST.toFixed(1)} - magnitude) /
      ${(MAG_FAINTEST - MAG_BRIGHTEST).toFixed(1)}, 0.0, 1.0);
  }
  float starSizeOf(float magnitude) {
    return ${SIZE_BASE} + pow(magnitudeRamp(magnitude), ${SIZE_GAMMA}) * ${SIZE_SPREAD};
  }
  /**
   * How many magnitudes brighter than the drawn range's top a star is.
   *
   * Zero for everything in the sky as seen from here — the range was chosen to
   * hold it — and positive only once the camera has approached one. It is what
   * the chart compression *threw away*, handed back so the renderer can spend
   * it on glare instead of on a bigger disc.
   */
  float magnitudeOver(float magnitude) {
    return max(0.0, ${MAG_BRIGHTEST.toFixed(1)} - magnitude);
  }
  float starAlphaOf(float magnitude) {
    return ${ALPHA_FLOOR} + pow(magnitudeRamp(magnitude), ${ALPHA_GAMMA}) * ${ALPHA_SPREAD};
  }
`

/**
 * Colour from the B-V index, down the same anchors the procedural sky used.
 *
 * B-V is a real measurement — the difference between a star's blue and visual
 * magnitudes — and it runs from about -0.3 for the hottest naked-eye stars to
 * 2.0 for the reddest. The anchors are the spectral classes, and they are
 * roughly twice as far from white as the true black-body colours: at two or
 * three pixels a physically-accurate tint is simply not resolvable, and the sky
 * comes out white with a suggestion of something. This is the same licence Eyes
 * takes, and it is what makes Betelgeuse read as orange and Rigel as blue.
 */
const ANCHORS = [
  { bv: -0.33, rgb: [0.52, 0.68, 1.0] }, // O/B — Rigel, Spica
  { bv: 0.0, rgb: [0.71, 0.83, 1.0] }, // A — Sirius, Vega
  { bv: 0.35, rgb: [1.0, 1.0, 0.99] }, // F — white
  { bv: 0.65, rgb: [1.0, 0.94, 0.74] }, // G — the Sun's own colour
  { bv: 1.05, rgb: [1.0, 0.83, 0.53] }, // K — gold
  { bv: 1.6, rgb: [1.0, 0.71, 0.46] }, // M — Betelgeuse, Antares
]

export function starColour(bv, out = [0, 0, 0]) {
  if (bv <= ANCHORS[0].bv) {
    out[0] = ANCHORS[0].rgb[0]
    out[1] = ANCHORS[0].rgb[1]
    out[2] = ANCHORS[0].rgb[2]
    return out
  }
  for (let i = 1; i < ANCHORS.length; i++) {
    const b = ANCHORS[i]
    if (bv > b.bv && i < ANCHORS.length - 1) continue
    const a = ANCHORS[i - 1]
    const t = Math.min(1, Math.max(0, (bv - a.bv) / (b.bv - a.bv)))
    out[0] = a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t
    out[1] = a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t
    out[2] = a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t
    return out
  }
  return out
}
