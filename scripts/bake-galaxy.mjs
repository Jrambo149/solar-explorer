#!/usr/bin/env node
/**
 * Bakes the Milky Way's structure into `src/data/galaxy.js`.
 *
 * Run with:
 *     npm run bake:galaxy
 *
 * ## What this is for
 *
 * Zooming out past the Kuiper belt used to stop at 165 AU, and the reason was
 * written down in `MilkyWay.jsx`: from anywhere the camera could reach, the
 * Galaxy is the band overhead, and drawing the face-on spiral would have been
 * drawing a view from somewhere the camera had never been. Letting the camera
 * go there is what makes the spiral honest, and this is the structure it
 * arrives at.
 *
 * ## What is baked, and what is not
 *
 * **Baked: the model.** Where the arms run, how far the disc reaches, how
 * thick it is, how long the bar is, and where the Sun sits in all of it.
 *
 * **Not baked: the stars.** Nobody has a catalogue of the Galaxy's hundred
 * billion stars, and inventing one and shipping it as data would be inventing
 * data. The cloud is sampled at runtime from the density model in
 * `src/scene/galaxySample.js`, from a fixed seed, so what ships is the
 * knowledge and what is drawn is a rendering of it.
 *
 * ## The arms: published fit, measured check
 *
 * The arm parameters are **Reid et al. 2019** (ApJ 885, 131), Table 2 — six
 * log-periodic spirals, each `ln(R/Rref) = -(beta - betaref) tan(psi)`.
 *
 * They are copied rather than refitted, and that was a decision rather than
 * laziness. This script also fetches Reid's own data — the 199 high-mass
 * star-forming regions with VLBI parallaxes, VizieR J/ApJ/885/131 — and
 * fitting a straight line to `ln R` against `beta` for each arm gives:
 *
 *     arm        own fit   published
 *     Norma        10.2       12.4
 *     Sct-Cen      10.4       19.8
 *     Sgr-Car       4.6       13.1
 *     Local        11.0       11.4
 *     Perseus       9.7        9.9
 *     Outer         4.3       13.8
 *
 * Every one of them comes out *shallower*, which is the signature of
 * regression dilution: `beta` carries real scatter, and least squares of
 * `lnR` on a noisy abscissa is biased toward zero slope. Regressing the other
 * way overshoots in every case (Norma 55°, Outer 32°) and the published value
 * is bracketed by the two, every time. Reid fits with per-source distance
 * uncertainties, which is the estimator that lands in between, and which this
 * script cannot reproduce from the table alone.
 *
 * So the paper's answer is the input and the data is the **check**: with the
 * published parameters the masers sit a median 2.5%-8.7% off the drawn arms in
 * radius, against 2.4%-7.2% for a fit tuned on those very points. A wrong
 * pitch angle cannot hide in that over the 100-degree spans these arms cover.
 * `verify-galaxy.mjs` measures it, so a typo in the table below fails loudly.
 *
 * The reference radii corroborate independently: `R` evaluated at each arm's
 * own `betaref` lands within 0.1-0.35 kpc of the published `Rref` for all six.
 *
 * ## Everything else
 *
 * Disc scale length and height, the bar, and the bulge are **Bland-Hawthorn &
 * Gerhard 2016** (ARA&A 54, 529), the standard review. `R0` is Reid's 8.15 kpc
 * rather than that review's 8.2, so the Sun's place and the arms it is placed
 * among come from one source.
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'data', 'galaxy.js')

const VIZIER =
  'https://vizier.cds.unistra.fr/viz-bin/asu-tsv' +
  '?-source=J/ApJ/885/131/table1&-out=Name,RAJ2000,DEJ2000,plx,Arm&-out.max=unlimited'

const log = (...args) => console.log('[galaxy]', ...args)
const D = Math.PI / 180

/**
 * The Sun's distance from the Galactic centre, in kiloparsecs.
 *
 * Reid et al. 2019, from the same fit the arms come from. It is the single
 * most load-bearing number here: every maser distance is turned into a
 * galactocentric radius through it, so getting it wrong would move all six
 * arms together and the residuals would not notice.
 */
const R0 = 8.15

/**
 * Reid et al. 2019, Table 2. `psi` is the pitch angle in degrees, `Rref` the
 * radius in kpc at galactocentric azimuth `betaref` in degrees.
 *
 * `tags` are the arm designators in Reid's own table 1, which splits the two
 * arms that are seen on both sides of the Galactic centre into a near and a
 * far segment. They are one arm and are fitted as one.
 */
const ARMS = [
  { name: 'Norma', tags: ['Nor'], Rref: 4.46, betaref: 18, psi: 12.4 },
  { name: 'Scutum-Centaurus', tags: ['ScN', 'ScF'], Rref: 4.91, betaref: 23, psi: 19.8 },
  { name: 'Sagittarius-Carina', tags: ['SgN', 'SgF'], Rref: 6.04, betaref: 24, psi: 13.1 },
  { name: 'Local', tags: ['Loc'], Rref: 8.26, betaref: 9, psi: 11.4 },
  { name: 'Perseus', tags: ['Per'], Rref: 8.87, betaref: 40, psi: 9.9 },
  { name: 'Outer', tags: ['Out'], Rref: 12.24, betaref: 18, psi: 13.8 },
]

/* ---- galactic coordinates ---- */

/**
 * The J2000 galactic pole and the longitude of the north celestial pole.
 *
 * Deliberately the same numbers as `src/scene/sky.js`, which places the band:
 * the arms and the panorama have to be in one frame or the disc would not line
 * up with the glow it replaces. `verify-galaxy` asserts the two agree.
 */
const NGP_RA = 192.85948 * D
const NGP_DEC = 27.12825 * D
const L_NCP = 122.93192 * D

function galactic(raRad, decRad) {
  const dra = raRad - NGP_RA
  const sinB =
    Math.sin(decRad) * Math.sin(NGP_DEC) + Math.cos(decRad) * Math.cos(NGP_DEC) * Math.cos(dra)
  const b = Math.asin(Math.max(-1, Math.min(1, sinB)))
  const l =
    L_NCP -
    Math.atan2(
      Math.cos(decRad) * Math.sin(dra),
      Math.sin(decRad) * Math.cos(NGP_DEC) - Math.cos(decRad) * Math.sin(NGP_DEC) * Math.cos(dra),
    )
  return { l: (((l / D) % 360) + 360) % 360, b: b / D }
}

const hours = (s) => {
  const [h, m, sec] = s.trim().split(/\s+/).map(Number)
  return (h + m / 60 + sec / 3600) * 15
}
const degrees = (s) => {
  const t = s.trim()
  const sign = t.startsWith('-') ? -1 : 1
  const [d, m, sec] = t.replace(/^[-+]/, '').split(/\s+/).map(Number)
  return sign * (d + m / 60 + sec / 3600)
}

/**
 * Heliocentric galactic to galactocentric cylindrical.
 *
 * The Sun sits at `beta = 0`, `R = R0`, and `beta` increases toward `l = 90`,
 * which is the direction the Galaxy rotates. That is Reid's convention and it
 * is the one the arm formula above is written in.
 */
function galactocentric(lDeg, bDeg, distanceKpc) {
  const cosB = Math.cos(bDeg * D)
  // Toward the centre, and toward l = 90.
  const u = distanceKpc * cosB * Math.cos(lDeg * D)
  const v = distanceKpc * cosB * Math.sin(lDeg * D)
  const x = R0 - u
  return { R: Math.hypot(x, v), beta: Math.atan2(v, x) / D, z: distanceKpc * Math.sin(bDeg * D) }
}

/* ---- the masers ---- */

log('fetching Reid et al. 2019 parallaxes from VizieR …')
const res = await fetch(VIZIER)
if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${VIZIER}`)
const tsv = await res.text()

const masers = []
for (const line of tsv.split('\n')) {
  // Every source name is `G` followed by galactic longitude, which is also the
  // cheapest way to tell a data row from the header and the column rulers.
  if (!/^G\d/.test(line)) continue
  const f = line.split('\t')
  if (f.length < 5) continue
  const parallax = Number(f[3])
  // Parallax in milliarcseconds is kiloparsecs reciprocally, which is the one
  // place in astronomy where the units line up for free.
  if (!(parallax > 0)) continue
  const { l, b } = galactic(hours(f[1]) * D, degrees(f[2]) * D)
  masers.push({ name: f[0].trim(), arm: f[4].trim(), ...galactocentric(l, b, 1 / parallax) })
}
log(`${masers.length} star-forming regions with a usable parallax`)

/* ---- checking the published fit against them ---- */

const round = (v, places) => Number(v.toFixed(places))

/** Radius of an arm at a galactocentric azimuth, in kpc. */
const armRadius = (arm, beta) =>
  arm.Rref * Math.exp(-(beta - arm.betaref) * D * Math.tan(arm.psi * D))

for (const arm of ARMS) {
  const mine = masers.filter((m) => arm.tags.includes(m.arm))
  /*
   * Azimuths are unwrapped about the arm's own mean before anything is
   * measured with them. Three of these arms are traced past `beta = 180`, and
   * an `atan2` that jumps from 179 to -179 mid-arm turns a smooth spiral into
   * a fold — the residual would then be dominated entirely by the wrap.
   */
  const mean = mine.reduce((s, m) => s + m.beta, 0) / mine.length
  const unwrapped = mine.map((m) => {
    let beta = m.beta
    while (beta - mean > 180) beta -= 360
    while (beta - mean < -180) beta += 360
    return { ...m, beta }
  })

  const residuals = unwrapped
    .map((m) => Math.abs(Math.log(m.R / armRadius(arm, m.beta))))
    .sort((a, b) => a - b)
  arm.residual = round(residuals[Math.floor(residuals.length / 2)], 4)
  arm.count = unwrapped.length

  const betas = unwrapped.map((m) => m.beta).sort((a, b) => a - b)
  /*
   * How far each arm is drawn: the span its own measurements cover, and not a
   * degree further.
   *
   * Extrapolating a log spiral is cheap and badly behaved — a 20-degree pitch
   * doubles the radius every 110 degrees of azimuth, so continuing
   * Scutum-Centaurus a half turn past its last maser would swing it out beyond
   * the disc entirely and read as a real feature. The far ends of these arms
   * are genuinely not measured, and the drawing stops where the evidence does.
   */
  arm.betaMin = round(betas[0], 1)
  arm.betaMax = round(betas[betas.length - 1], 1)
  arm.RatRef = round(armRadius(arm, arm.betaref), 3)
}

log('arm                 n   median |ln R| residual   span in beta')
for (const a of ARMS) {
  log(
    `  ${a.name.padEnd(19)}${String(a.count).padStart(3)}   ` +
      `${(a.residual * 100).toFixed(1)}%`.padStart(20) +
      `   ${a.betaMin}° … ${a.betaMax}°`,
  )
}

/* ---- the disc ---- */

/**
 * Bland-Hawthorn & Gerhard 2016, section 5, in kiloparsecs.
 *
 * `discScaleLength` is the exponential falloff of the thin disc's surface
 * brightness; `discScaleHeight` its vertical one. `discEdge` is where the
 * drawing stops — the stellar disc has no edge so much as a steep decline
 * beyond about 15 kpc, and 16 is past the last arm measurement.
 */
const DISC = {
  scaleLength: 2.6,
  scaleHeight: 0.3,
  edge: 16,
  /** Half-length of the bar, and its angle to the Sun-centre line. */
  barLength: 5.0,
  barAngle: 27,
  /** The bulge, as the radius containing most of it. */
  bulgeRadius: 2.1,
}

const today = new Date().toISOString().slice(0, 10)

const body = `/**
 * The Milky Way's structure: six spiral arms, a disc, a bar, and our place in it.
 *
 * GENERATED by \`scripts/bake-galaxy.mjs\` — do not hand-edit; rerun
 * \`npm run bake:galaxy\` instead. Generated ${today}.
 *
 * Arms are Reid et al. 2019 (ApJ 885, 131) Table 2; the disc and bar are
 * Bland-Hawthorn & Gerhard 2016 (ARA&A 54, 529). \`MASERS\` are Reid's own
 * ${masers.length} VLBI parallaxes (VizieR J/ApJ/885/131), carried so the arms can be
 * checked against the measurements they were fitted to rather than trusted.
 *
 * All distances are **kiloparsecs**, and all positions are galactocentric:
 * \`R\` from the centre, \`beta\` the azimuth in degrees measured at the centre
 * from the Sun's direction and increasing the way the Galaxy turns, \`z\` above
 * the plane. The Sun is at \`R = R0\`, \`beta = 0\`, \`z = 0\` by construction.
 */

/** The Sun's distance from the Galactic centre, kpc (Reid et al. 2019). */
export const R0 = ${R0}

/**
 * The six arms. \`psi\` is the pitch angle in degrees; the arm's radius at an
 * azimuth is \`Rref * exp(-(beta - betaref) * tan(psi))\` with angles in radians.
 *
 * \`beta\` runs only across the span Reid's own measurements cover — see the
 * bake script on why a log spiral is not extrapolated. \`residual\` is the
 * median fractional radius error against those measurements, which is what
 * \`verify-galaxy\` re-measures.
 */
export const ARMS = [
${ARMS.map(
  (a) =>
    `  { name: ${JSON.stringify(a.name)}, Rref: ${a.Rref}, betaref: ${a.betaref}, psi: ${a.psi},\n` +
    `    betaMin: ${a.betaMin}, betaMax: ${a.betaMax}, count: ${a.count}, residual: ${a.residual} },`,
).join('\n')}
]

/** The disc, the bar and the bulge (Bland-Hawthorn & Gerhard 2016), kpc and degrees. */
export const DISC = ${JSON.stringify(DISC, null, 2).replace(/\n/g, '\n')}

/**
 * Reid's ${masers.length} star-forming regions, as \`[R, beta, z, armIndex]\` — galactocentric
 * kpc and degrees, with the index into \`ARMS\` or -1 for the sources that trace
 * the bar, the Galactic centre or no named arm.
 *
 * These are measurements, not a model, and they are the only points in this
 * file that anybody has actually observed.
 */
export const MASERS = [
${masers
  .map((m) => {
    const index = ARMS.findIndex((a) => a.tags.includes(m.arm))
    return `  [${round(m.R, 3)}, ${round(m.beta, 2)}, ${round(m.z, 4)}, ${index}],`
  })
  .join('\n')}
]
`

writeFileSync(OUT, body)
log(`wrote ${OUT} (${(body.length / 1024).toFixed(0)} KB)`)
