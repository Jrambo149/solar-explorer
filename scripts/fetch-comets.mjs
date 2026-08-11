#!/usr/bin/env node
/**
 * Bakes the comets into `src/data/cometData.js`.
 *
 * Run with:
 *     npm run fetch:comets
 *
 * ## The roster
 *
 * NASA's Eyes on the Solar System, read out of its `app.js` — the same source
 * and the same reason as `minor-moon-roster.mjs`: taking its list means the two
 * apps agree on what exists rather than on what someone typed. Thirteen comets,
 * and the selection is Eyes' own editorial judgement about which ones are worth
 * showing, which is not a judgement worth re-litigating.
 *
 * Four of the thirteen carry a real shape, and every one of those is a
 * spacecraft's doing — Rosetta at 67P, Deep Impact at Tempel 1, EPOXI at
 * Hartley 2, Deep Space 1 at Borrelly. The other nine wear a generic asteroid,
 * Halley included: it has been visited, but Giotto's 1986 images were never
 * turned into a shape model good enough to ship, and nothing else has been
 * resolved at all.
 *
 * ## The orbits
 *
 * JPL's Small-Body Database, which is where the dwarf planets came from too.
 * Comets need more care than those did in three ways:
 *
 * **Four are not on closed orbits.** Elenin, ISON and Siding Spring have e a
 * hair over 1 — 1.0000051 for ISON — and 3I/ATLAS is at 6.14, an interstellar
 * object passing through once. `a` comes back negative for all four and there
 * is no period. `kepler.js` grew a hyperbolic branch for them.
 *
 * **The designation is not a search key.** `sstr=C/2019 Y4` returns an
 * ambiguous list rather than an object, because that comet disintegrated in
 * 2020 and the database now carries C/2019 Y4-A through -D as well as the
 * parent. Querying without the `C/` prefix resolves to the parent, and that is
 * what the `search` field below records per comet.
 *
 * **Elements are osculating at an epoch, and comets are perturbed hard.** These
 * are two-body ellipses fitted at one instant, and a comet that passes close to
 * Jupiter has a genuinely different orbit afterwards — 67P's perihelion was
 * moved from 2.7 AU to 1.3 AU by an encounter in 1959. The elements here are
 * the current ones and are right for the present day; they are not a history.
 *
 * ## What is not fetched
 *
 * Radius, label and the mesh assignment are Eyes', because they are what make
 * the two apps look alike, and a comet nucleus radius is in any case a soft
 * number derived from brightness. Spin periods are Eyes' where it has one;
 * where it does not, `rotationHours` is null and the body does not spin rather
 * than spinning at an invented rate.
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'data', 'cometData.js')

const J2000 = 2451545.0
const DAYS_PER_CENTURY = 36525

/**
 * Eyes' thirteen, in its own order, with everything this script does not fetch.
 *
 * `search` is the SBDB query string. It is the packed designation rather than
 * the display name wherever the display name is ambiguous — see the header.
 */
const COMETS = [
  /**
   * ʻOumuamua, which is in Eyes' comet group and is not, to JPL, a comet.
   *
   * `apparition: false` drops both `CAP` and `NOFRAG`. Either one puts Horizons
   * into a comets-only index search, and the first interstellar object was
   * designated A/2017 U1 before the 1I/ class existed — it is still filed as an
   * asteroid, so the query comes back "no matches found" rather than with an
   * orbit. Neither flag means anything for it in any case: it has no repeat
   * apparition and it did not break up.
   *
   * The radius is Eyes' `extentsRadius` of 225 m rather than a `radius` field,
   * which is why the first pass at this roster missed the body entirely — the
   * scrape assumed every entity names `radius` between its groups and its
   * label. Nothing has ever imaged it; the dimensions come from a light curve
   * that swung by a factor of ten every 8.1 hours, which is why it is drawn as
   * something much longer than it is wide.
   */
  { id: '1i_oumuamua', search: '1I', apparition: false, name: 'ʻOumuamua',
    designation: '1I/2017 U1', radiusKm: 0.225, model: null, rotationHours: 8.1 },
  { id: '1p_halley', search: '1P', name: 'Halley', designation: '1P/Halley',
    radiusKm: 6, model: 2, rotationHours: 52 },
  { id: '103p_hartley_2', search: '103P', name: 'Hartley 2', designation: '103P/Hartley',
    radiusKm: 2, model: null, rotationHours: null },
  { id: '9p_tempel_1', search: '9P', name: 'Tempel 1', designation: '9P/Tempel',
    radiusKm: 5, model: null, rotationHours: null },
  { id: '81p_wild_2', search: '81P', name: 'Wild 2', designation: '81P/Wild',
    radiusKm: 2.5, model: 3, rotationHours: null },
  { id: '67p_churyumov_gerasimenko', search: '67P', name: 'Churyumov–Gerasimenko',
    designation: '67P/C-G', radiusKm: 4.1, model: null, rotationHours: 12.0550932412 },
  { id: '19p_borrelly', search: '19P', name: 'Borrelly', designation: '19P/Borrelly',
    radiusKm: 2.4, model: null, rotationHours: null },
  { id: 'c_1995_o1', search: '1995 O1', name: 'Hale-Bopp', designation: 'C/1995 O1',
    radiusKm: 5, model: 3, rotationHours: 11.766666666 },
  { id: 'c_2010_x1', search: '2010 X1', name: 'Elenin', designation: 'C/2010 X1',
    radiusKm: 5, model: 1, rotationHours: null },
  { id: 'c_2012_s1', search: '2012 S1', name: 'ISON', designation: 'C/2012 S1',
    radiusKm: 3, model: 2, rotationHours: null },
  { id: 'c_2013_a1', search: '2013 A1', name: 'Siding Spring', designation: 'C/2013 A1',
    radiusKm: 5, model: 2, rotationHours: 8 },
  { id: 'c_2019_y4', search: '2019 Y4', name: 'ATLAS', designation: 'C/2019 Y4',
    radiusKm: 3, model: 2, rotationHours: null },
  { id: 'c_2020_f3', search: '2020 F3', name: 'NEOWISE', designation: 'C/2020 F3',
    radiusKm: 6, model: 2, rotationHours: 7.58 },
  { id: 'c_2025_n1', search: '2025 N1', name: '3I/ATLAS', designation: 'C/2025 N1',
    radiusKm: 2.8, model: 3, rotationHours: 16.16 },
]

/** Which of these wear a real mesh, keyed to `nasa-models.mjs`. */
const MESHES = {
  '67p_churyumov_gerasimenko': '67p-churyumov-gerasimenko',
  '9p_tempel_1': '9p-tempel-1',
  '103p_hartley_2': '103p-hartley-2',
  '19p_borrelly': '19p-borrelly',
  '1i_oumuamua': '1i-oumuamua',
}

/**
 * The epoch the orbits are taken at, and why it is not J2000.
 *
 * Everything else in the app is anchored at J2000 because the elements are a
 * *fitted linear model* valid across two centuries. A comet's are not: they are
 * an osculating snapshot with no rates, so the orbit is only really that orbit
 * near the instant it was taken, and the honest anchor is the one closest to
 * what the viewer is looking at.
 *
 * It matters more than it sounds. The first version of this script took SBDB's
 * published solution, whose epoch is whenever that comet was last fitted — 1968
 * for Halley, two perihelia ago. Propagating a two-body ellipse across those
 * fifty-eight years put Halley 0.18 AU out and 67P 0.26 AU out, about 5% of its
 * distance from the Sun. Against the same check 3I/ATLAS came out at 0.06%,
 * because its solution is from 2026 — the correlation with epoch age was exact,
 * which is what identified the cause.
 *
 * Bump this and rerun to refresh. The date is deliberately a round one rather
 * than "now" so that two runs a week apart produce the same file.
 */
const ANCHOR_JD = 2461041.5 // 2026-01-01

/**
 * Osculating elements from Horizons at `ANCHOR_JD`.
 *
 * `CAP` asks for the current-apparition solution, which periodic comets need:
 * Horizons carries a separate orbit per perihelion passage — thirty-odd for
 * Halley, going back to 239 BC — because outgassing and planetary encounters
 * genuinely change the orbit each time round. Without it the query returns an
 * index listing rather than an ephemeris.
 *
 * `NOFRAG` asks for the parent body rather than its pieces, which is what makes
 * the disintegrated ones resolvable at all: C/2019 Y4 broke up in 2020 and the
 * database now carries -A through -D alongside it.
 */
async function horizons(search, apparition = true) {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: `'DES=${search};${apparition ? 'CAP;NOFRAG;' : ''}'`,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'ELEMENTS',
    CENTER: '@sun',
    TLIST: String(ANCHOR_JD),
    OUT_UNITS: 'AU-D',
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
  })
  const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`, {
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`${res.status} for ${search}`)
  const text = await res.text()

  const block = text.match(/\$\$SOE([\s\S]*?)\$\$EOE/)
  if (!block) throw new Error(`${search}: no ephemeris returned — ${text.slice(0, 200)}`)

  /*
   * The key must be preceded by whitespace or the line start.
   *
   * Horizons writes its elements as bare two-letter labels on shared lines, and
   * several are substrings of others: an unanchored `A` matches inside `MA`,
   * `TA` and `AD`, and `N` inside `IN`. Without the anchor Halley's semi-major
   * axis came back as its mean anomaly — 190 AU instead of 17.9 — which is
   * wrong by an order of magnitude while still looking like a plausible number
   * for a long-period comet.
   */
  const read = (key) => {
    const m = new RegExp(`(?:^|\\s)${key}\\s*=\\s*(-?[\\d.]+E?[+-]?\\d*)`).exec(block[1])
    if (!m) throw new Error(`${search}: no ${key} in Horizons output`)
    return Number(m[1])
  }

  return {
    el: {
      e: read('EC'),
      q: read('QR'),
      i: read('IN'),
      om: read('OM'),
      w: read('W'),
      ma: read('MA'),
      n: read('N'),
      a: read('A'),
      // Horizons still prints a `PR` for a hyperbolic orbit and it is nonsense —
      // 2.7e97 years, the formula run on a negative `a`. There is no period.
      per: read('EC') < 1 ? read('PR') : null,
    },
    epoch: ANCHOR_JD,
  }
}

/**
 * SBDB's elements, in the shape `kepler.js` propagates.
 *
 * The app carries mean *longitude* plus a rate, because that is the form JPL
 * publishes the planets in and the one `elementsAt` was written around. SBDB
 * gives mean anomaly at an epoch instead, so it is converted here rather than
 * teaching the propagator a second form:
 *
 *     varpi = w + Om        longitude of perihelion
 *     L     = M + varpi     mean longitude
 *
 * and `L` is walked from SBDB's epoch back to J2000 at the body's own mean
 * motion, so every body in the app starts from the same instant.
 *
 * For a hyperbolic orbit the same two lines still hold arithmetically — `M`
 * grows without bound instead of wrapping, and `solveKepler` knows not to wrap
 * it — so nothing here needs a second case. What does differ is that `n` for
 * e > 1 is `sqrt(mu/|a|^3)`; SBDB publishes `n` directly, so that is taken as
 * given rather than recomputed.
 *
 * No rates: a comet's orbit is not slowly precessing in a way a linear fit
 * would capture. It is fitted at an epoch and perturbed unpredictably by the
 * planets, so the honest thing is a frozen ellipse plus the note in the header.
 */
function toElements({ el, epoch }) {
  const varpi = el.w + el.om
  const L0 = el.ma + varpi
  const T = (J2000 - epoch) / DAYS_PER_CENTURY

  return {
    a: el.a,
    e: el.e,
    i: el.i,
    // Walked to J2000 at the mean motion, which SBDB gives in degrees per day.
    L: L0 + el.n * (J2000 - epoch),
    varpi,
    Omega: el.om,
    aDot: 0,
    eDot: 0,
    iDot: 0,
    LDot: el.n * DAYS_PER_CENTURY,
    varpiDot: 0,
    OmegaDot: 0,
    // Kept for the dossier and for the checks — not read by the propagator.
    q: el.q,
    periodDays: el.per ?? null,
    epoch,
    T,
  }
}

const num = (v) => (v === null || v === undefined ? 'null' : String(v))

async function main() {
  const rows = []

  for (const comet of COMETS) {
    const found = await horizons(comet.search, comet.apparition ?? true)
    const elements = toElements(found)
    const open = elements.e >= 1

    rows.push({ ...comet, elements, open })

    console.log(
      `[comet] ${comet.name.padEnd(24)} e=${elements.e.toFixed(6).padStart(10)} ` +
        `q=${elements.q.toFixed(4).padStart(8)} AU ` +
        `${open ? 'HYPERBOLIC   ' : `a=${elements.a.toFixed(2).padStart(9)} AU`} ` +
        `${elements.periodDays ? `P=${(elements.periodDays / 365.25).toFixed(1)} yr` : ''}`,
    )
  }

  const body = rows
    .map((r) => {
      const e = r.elements
      return `  {
    id: '${r.id}',
    name: ${JSON.stringify(r.name)},
    designation: ${JSON.stringify(r.designation)},
    radiusKm: ${r.radiusKm},
    model: ${num(r.model)},
    mesh: ${MESHES[r.id] ? `'${MESHES[r.id]}'` : 'null'},
    rotationHours: ${num(r.rotationHours)},
    open: ${r.open},
    periodDays: ${num(e.periodDays)},
    perihelionAU: ${e.q},
    elements: {
      a: ${e.a}, e: ${e.e}, i: ${e.i},
      L: ${e.L}, varpi: ${e.varpi}, Omega: ${e.Omega},
      aDot: 0, eDot: 0, iDot: 0, LDot: ${e.LDot}, varpiDot: 0, OmegaDot: 0,
    },
  },`
    })
    .join('\n')

  const header = `/**
 * The comets, generated by \`scripts/fetch-comets.mjs\` — do not edit by hand.
 *
 * Roster, radii, meshes and spin periods from NASA's Eyes on the Solar System;
 * orbits from JPL's Small-Body Database. See that script's header for why each
 * field comes from where it does.
 *
 * \`open: true\` marks the four on hyperbolic trajectories — three long-period
 * comets whose eccentricity is a hair over 1, and 3I/ATLAS, which is passing
 * through from interstellar space and will not return. They have no period and
 * their \`a\` is negative; \`kepler.js\` handles them and \`sampleOrbit\` cuts their
 * path off at \`OPEN_ORBIT_MAX_AU\` rather than closing it.
 *
 * Generated ${new Date().toISOString().slice(0, 10)} from ${rows.length} bodies.
 */

export const COMETS_RAW = [
${body}
]
`

  writeFileSync(OUT, header)
  console.log(`\n[comet] wrote ${OUT}`)
  console.log(`[comet] ${rows.length} comets, ${rows.filter((r) => r.open).length} hyperbolic`)
}

main().catch((error) => {
  console.error(`[comet] ${error.message}`)
  process.exitCode = 1
})
