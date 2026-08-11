#!/usr/bin/env node
/**
 * Bakes satellite orbital elements from JPL Horizons.
 *
 * Run with `npm run fetch:moons`. Writes `src/data/moonElements.js`, which is
 * committed — the app makes no network requests of its own.
 *
 * ## The frame question, which is the whole design
 *
 * A moon does not orbit in the ecliptic. It orbits close to its parent's
 * equatorial plane, held there by the planet's oblateness, and that is *why*
 * Titan runs flat through Saturn's rings and why Uranus's satellite system
 * hangs vertically. Elements expressed in the ecliptic would capture the tilt
 * at one instant and then lose it: the ecliptic-referenced node of a close
 * satellite precesses in years, so a frozen ecliptic ellipse propagated across
 * the app's 1800–2050 window would slowly swing the orbit out of the plane the
 * moon is physically pinned to.
 *
 * So these are fetched with `REF_PLANE=B` — Horizons' body-equator frame,
 * X-Y in the parent's IAU equator. The resulting offset is then rotated by the
 * parent's `axialTilt`, the very same angle that orients the planet's surface
 * and its rings. Titan and Saturn's rings therefore stay coplanar by
 * construction rather than by coincidence, and no separate IAU pole model is
 * needed.
 *
 * ## The Moon is the exception, and has to be
 *
 * Luna's orbit is inclined 5.15° to the **ecliptic**, not to Earth's equator.
 * Its inclination to the equator swings between about 18° and 28° across the
 * 18.6-year nodal cycle, so a body-equator ellipse frozen at J2000 would be
 * wrong almost immediately. Luna is written below from Meeus' mean arguments
 * in the ecliptic frame, complete with the real nodal regression and apsidal
 * advance, and is flagged `plane: 'ecliptic'` so the renderer skips the tilt
 * rotation for it.
 *
 * ## What is approximate
 *
 * The fetched rows are *osculating* elements at one instant, propagated as
 * two-body motion. Eccentricity and inclination oscillate a little around the
 * values captured here, and the node precesses where this model holds it
 * still. For the near-circular, near-equatorial majority that is invisible.
 *
 * Three are worth being honest about:
 *
 *  - **Triton.** Its node genuinely moves on a ~640-year cycle, so across 250
 *    years its orbital plane is drawn rotated from where it truly is. The
 *    retrograde motion and the steep tilt — the two things that make Triton
 *    worth showing — are right.
 *  - **Iapetus.** Inclined 15.5° to Saturn's equator and far enough out that the
 *    Sun, not Saturn's oblateness, controls its plane. It genuinely does not lie
 *    in the ring plane, and this draws that correctly, but its long-term
 *    precession about the Laplace plane is not modelled.
 *  - **Styx, Nix, Kerberos and Hydra**, which cannot be fetched this way at all.
 *    See `MEAN_ELEMENTS` below for what goes wrong and what is done instead.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/data/moonElements.js')

const KM_PER_AU = 149597870.7
const J2000 = 2451545.0

/**
 * Horizons body id → parent, for every equator-frame satellite.
 *
 * In orbital order within each system, because the generated file is read as
 * much as it is imported and "inner to outer" is the order that makes a moon
 * system legible.
 *
 * `500@999` for the Pluto system is Pluto's own centre, not `500@9`, which is
 * the Pluto–Charon *barycentre*. The difference is not academic: Charon is
 * massive enough that the barycentre lies outside Pluto's surface, so elements
 * about the wrong one would draw Charon orbiting a point in empty space — and
 * Pluto orbiting it too.
 */
const SATELLITES = [
  { id: 'phobos', name: 'Phobos', command: '401', centre: '500@499', parent: 'mars' },
  { id: 'deimos', name: 'Deimos', command: '402', centre: '500@499', parent: 'mars' },

  { id: 'io', name: 'Io', command: '501', centre: '500@599', parent: 'jupiter' },
  { id: 'europa', name: 'Europa', command: '502', centre: '500@599', parent: 'jupiter' },
  { id: 'ganymede', name: 'Ganymede', command: '503', centre: '500@599', parent: 'jupiter' },
  { id: 'callisto', name: 'Callisto', command: '504', centre: '500@599', parent: 'jupiter' },

  { id: 'mimas', name: 'Mimas', command: '601', centre: '500@699', parent: 'saturn' },
  { id: 'enceladus', name: 'Enceladus', command: '602', centre: '500@699', parent: 'saturn' },
  { id: 'tethys', name: 'Tethys', command: '603', centre: '500@699', parent: 'saturn' },
  { id: 'dione', name: 'Dione', command: '604', centre: '500@699', parent: 'saturn' },
  { id: 'rhea', name: 'Rhea', command: '605', centre: '500@699', parent: 'saturn' },
  { id: 'titan', name: 'Titan', command: '606', centre: '500@699', parent: 'saturn' },
  { id: 'iapetus', name: 'Iapetus', command: '608', centre: '500@699', parent: 'saturn' },

  { id: 'miranda', name: 'Miranda', command: '705', centre: '500@799', parent: 'uranus' },
  { id: 'ariel', name: 'Ariel', command: '701', centre: '500@799', parent: 'uranus' },
  { id: 'umbriel', name: 'Umbriel', command: '702', centre: '500@799', parent: 'uranus' },
  { id: 'titania', name: 'Titania', command: '703', centre: '500@799', parent: 'uranus' },
  { id: 'oberon', name: 'Oberon', command: '704', centre: '500@799', parent: 'uranus' },

  { id: 'triton', name: 'Triton', command: '801', centre: '500@899', parent: 'neptune' },

  { id: 'charon', name: 'Charon', command: '901', centre: '500@999', parent: 'pluto' },
  { id: 'styx', name: 'Styx', command: '905', centre: '500@999', parent: 'pluto' },
  { id: 'nix', name: 'Nix', command: '902', centre: '500@999', parent: 'pluto' },
  { id: 'kerberos', name: 'Kerberos', command: '904', centre: '500@999', parent: 'pluto' },
  { id: 'hydra', name: 'Hydra', command: '903', centre: '500@999', parent: 'pluto' },
]

/**
 * Luna, from Meeus, *Astronomical Algorithms*, ch. 47 — the mean arguments of
 * the ELP-2000/82 lunar theory, in the ecliptic frame of date.
 *
 * The three rates are the real ones and they are large: the node regresses a
 * full turn in 18.6 years and the apse advances one in 8.85. Over the app's
 * 250-year window they are worth thousands of degrees each, which is why they
 * are carried rather than zeroed like the satellites above.
 *
 * `LDot` here is 481,267.88 °/century — the classic value, and a useful check
 * that the units line up: 360 × 36525 / 27.321582 lands on the same number.
 */
const LUNA = {
  id: 'luna',
  name: 'Moon',
  parent: 'earth',
  plane: 'ecliptic',
  source: 'Meeus, Astronomical Algorithms, ch. 47 (ELP-2000/82 mean arguments)',
  elements: {
    a: 384400 / KM_PER_AU,
    aDot: 0,
    e: 0.0549,
    eDot: 0,
    i: 5.145,
    iDot: 0,
    L: 218.3164477,
    LDot: 481267.88123421,
    varpi: 83.3532465,
    varpiDot: 4069.0137287,
    Omega: 125.0445479,
    OmegaDot: -1934.1362891,
  },
  periodDays: 27.321582,
}

async function fetchElements({ command, centre, name }) {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: command,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'ELEMENTS',
    CENTER: centre,
    // Body-equator frame of the central body. See the header.
    REF_PLANE: 'B',
    TLIST: String(J2000),
    OUT_UNITS: 'KM-S',
  })

  const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`)
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status} for ${name}`)

  const text = await res.text()
  const block = text.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) throw new Error(`no ephemeris block for ${name}:\n${text.slice(-600)}`)

  // The block is fixed-format `KEY= value` pairs across several lines. `W` and
  // `N` carry a space before the `=`, hence the optional whitespace.
  const read = (key) => {
    const match = block.match(new RegExp(`\\b${key}\\s*=\\s*(-?[\\d.]+E?[+-]?\\d*)`))
    if (!match) throw new Error(`missing ${key} for ${name}`)
    return Number(match[1])
  }

  const e = read('EC')
  const i = read('IN')
  const Omega = read('OM')
  const w = read('W')
  const M = read('MA')
  const aKm = read('A')
  // Horizons reports mean motion per second under OUT_UNITS=KM-S.
  const nPerDay = read('N') * 86400
  // True anomaly. Only the four small Pluto moons use it — see `MEAN_ELEMENTS`.
  const TA = read('TA')

  return {
    plane: 'equator',
    source: `JPL Horizons, osculating at J2000, REF_PLANE=B about ${centre}`,
    periodDays: 360 / nPerDay,
    /** Argument of latitude: where the body is *in its plane*, measured from the
     *  ascending node. Pure geometry from the state vector, so it is exact even
     *  where the fitted ellipse is not. */
    argLatitude: wrap360(w + TA),
    elements: {
      a: aKm / KM_PER_AU,
      aDot: 0,
      e,
      eDot: 0,
      i,
      iDot: 0,
      L: wrap360(M + w + Omega),
      LDot: nPerDay * 36525,
      varpi: wrap360(w + Omega),
      varpiDot: 0,
      Omega: wrap360(Omega),
      OmegaDot: 0,
    },
  }
}

/**
 * Published mean elements for the four small Pluto moons, and why they are here.
 *
 * These are the one set Horizons cannot be asked for directly, and the failure
 * is quiet enough to be worth spelling out. Osculating elements are fitted from
 * a state vector measured *relative to the centre requested* — and Pluto's own
 * centre is not an inertial point: it circles the Pluto–Charon barycentre at
 * about 24 m/s, because Charon is a tenth of Pluto's mass rather than a
 * rounding error. Styx through Hydra orbit at only 120–150 m/s, so elements
 * taken about Pluto's centre carry a ~20% velocity error, and the two-body fit
 * absorbs it as eccentricity. Fetched that way Kerberos comes back as
 * `a = 133,084 km, e = 0.556, P = 119.7 d` against a true
 * `a = 57,783 km, e = 0.003, P = 32.2 d` — not a small error, an orbit that is
 * not Kerberos's.
 *
 * Charon is immune and does not appear below: Pluto's wobble *is* Charon's orbit
 * mirrored, so measured from Pluto's centre Charon traces a clean ellipse. It
 * comes back within 5 km of the published semi-major axis, so it is fetched like
 * any other moon.
 *
 * The barycentre is not the way out either. `CENTER=@9` is the right point
 * physically, but Horizons answers `Body frame output not available for this
 * center` — a barycentre has no equator, so it cannot serve `REF_PLANE=B`, and
 * the body-equator frame is the whole basis of how this app places moons.
 *
 * So the two halves are taken from where each is sound:
 *
 *   plane (i, Omega)   from Horizons. The orbital plane is the direction of
 *                      r x v, which the wobble does not tilt — it lies in the
 *                      same plane, since all five moons are coplanar to within
 *                      a degree. Exact.
 *   position           from Horizons' argument of latitude, `w + TA`. Also pure
 *                      geometry of the state vector, so also exact.
 *   size and period    from the published mean elements below, which is what the
 *                      corrupted fit gets wrong.
 *
 * The one thing given up is the direction of periapsis, which is set to the node
 * (`varpi = Omega`). At e = 0.002–0.006 that displaces the moon along its orbit
 * by under half a degree, and there is nothing to see in it.
 *
 * Source: JPL Solar System Dynamics, *Planetary Satellite Mean Orbital
 * Parameters*, from Brozović et al. (2015), the New Horizons-era fit.
 */
const MEAN_ELEMENTS = {
  styx: { aKm: 42656, e: 0.0058, periodDays: 20.16155 },
  nix: { aKm: 48694, e: 0.0020, periodDays: 24.85463 },
  kerberos: { aKm: 57783, e: 0.0033, periodDays: 32.16756 },
  hydra: { aKm: 64738, e: 0.0059, periodDays: 38.20177 },
}

/**
 * Rebuilds a row from published size and period, keeping Horizons' plane.
 *
 * `L` is set so that the mean anomaly comes out equal to the argument of
 * latitude — with periapsis pinned to the node, `M = u`, so the moon starts
 * exactly where it really is.
 */
function withMeanElements(body) {
  const mean = MEAN_ELEMENTS[body.id]
  if (!mean) return body

  const e = body.elements
  const nPerDay = 360 / mean.periodDays

  return {
    ...body,
    source: `${body.source.replace('osculating at J2000', 'plane and phase at J2000')}; size and period from JPL mean elements (Brozović et al. 2015)`,
    periodDays: mean.periodDays,
    elements: {
      ...e,
      a: mean.aKm / KM_PER_AU,
      e: mean.e,
      L: wrap360(e.Omega + body.argLatitude),
      LDot: nPerDay * 36525,
      varpi: e.Omega,
    },
  }
}

const wrap360 = (deg) => ((deg % 360) + 360) % 360

const fmt = (n, digits = 8) => n.toFixed(digits)

function renderRow(body) {
  const e = body.elements
  return `  ${body.id}: {
    // ${body.name} — ${body.source}
    parent: '${body.parent}',
    plane: '${body.plane}',
    /** Sidereal period in days: ${body.periodDays.toFixed(6)}. */
    a: ${e.a.toExponential(9)}, aDot: 0,
    e: ${fmt(e.e)}, eDot: 0,
    i: ${fmt(e.i)}, iDot: ${fmt(e.iDot)},
    L: ${fmt(e.L)}, LDot: ${fmt(e.LDot)},
    varpi: ${fmt(e.varpi)}, varpiDot: ${fmt(e.varpiDot)},
    Omega: ${fmt(e.Omega)}, OmegaDot: ${fmt(e.OmegaDot)},
  },`
}

function render(bodies) {
  return `/**
 * Satellite orbital elements.
 *
 * GENERATED by \`scripts/fetch-moon-elements.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:moons\` instead. Generated ${new Date().toISOString().slice(0, 10)}.
 *
 * Every row carries a \`plane\`, and it decides which frame the renderer solves
 * the orbit in:
 *
 *   'equator'   the parent's equatorial plane. Elements come from Horizons in
 *               its body-equator frame, and the offset is rotated by the same
 *               \`axialTilt\` that orients the planet and its rings — so Titan
 *               and Saturn's rings are coplanar by construction.
 *   'ecliptic'  the ecliptic, unrotated. Only the Moon, whose orbit tracks the
 *               ecliptic rather than Earth's equator.
 *
 * See the generating script for what is approximated and where it shows.
 */

/** @type {Record<string, import('./orbitalElements').Elements & {parent: string, plane: 'equator'|'ecliptic'}>} */
export const MOON_ELEMENTS = {
${bodies.map(renderRow).join('\n\n')}
}
`
}

async function main() {
  const bodies = []
  for (const satellite of SATELLITES) {
    process.stdout.write(`[moons] fetching ${satellite.name}… `)
    const data = await fetchElements(satellite)
    const body = withMeanElements({ ...satellite, ...data })
    bodies.push(body)
    console.log(
      `a=${(body.elements.a * KM_PER_AU).toFixed(0)} km, ` +
        `e=${body.elements.e.toFixed(4)}, i=${body.elements.i.toFixed(3)}°, ` +
        `P=${body.periodDays.toFixed(4)} d` +
        (MEAN_ELEMENTS[body.id] ? '  [mean elements]' : ''),
    )
  }

  // Luna sorts to the front: it is the moon everyone knows, and the generated
  // file reads better opening with the exception it explains.
  writeFileSync(OUT, render([LUNA, ...bodies]))
  console.log(`[moons] wrote ${OUT}`)
}

main().catch((error) => {
  console.error(`[moons] ${error.message}`)
  process.exitCode = 1
})
