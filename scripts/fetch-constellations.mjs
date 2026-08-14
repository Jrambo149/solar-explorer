/**
 * The 88 constellations as regions of sky, not just as figures.
 *
 * `fetch-stars.mjs` already bakes the *figures* — Stellarium's stick lines,
 * given as pairs of stars. A figure is a drawing, and you cannot click a
 * drawing: the lines of Orion occupy a few hundred square degrees of nothing,
 * and a hit test against them would mean "click within four pixels of a line",
 * which is a dexterity test rather than an interface.
 *
 * A constellation is really a *region*. Since 1930 the sky has been divided
 * into 88 of them with no gaps and no overlaps, so every direction is in
 * exactly one — which is what makes clicking work: point anywhere at all and
 * the answer is unambiguous and correct.
 *
 * ## Where the regions come from
 *
 * Eugène Delporte drew the boundaries for the IAU in 1930 along lines of
 * constant right ascension and declination **in the equinox of B1875**, which
 * is why they look subtly skewed on a modern chart: the sky has precessed about
 * 1.7° since, and the boundaries went with it.
 *
 * This uses Roman (1987), VizieR VI/42 — the same table rearranged so that a
 * position can be looked up directly. 357 rows, each "at declinations above
 * `DE_low`, between `RA_low` and `RA_up`, the constellation is X", ordered by
 * descending declination so the first row that matches is the answer.
 *
 * That table is baked into the app whole. It is 10 KB, it is the authority, and
 * every question here is answered from it:
 *
 * - **which constellation a click is in** — the lookup, run in the browser
 * - **where the boundaries are drawn** — derived below, so the outline drawn
 *   and the region clicked cannot disagree
 * - **how large each one is** — summed from the same cells
 * - **which stars belong to which** — every catalogue star looked up
 *
 * ## The decomposition, and why it is exact
 *
 * Every boundary lies on a line of constant RA or constant declination in
 * B1875. So take every declination and every right ascension the table
 * mentions, use them as grid lines, and each resulting cell is *entirely*
 * inside one constellation — there is nowhere for a boundary to cross it,
 * because all the boundaries are grid lines by construction.
 *
 * Classify each cell at its centre, and the cells whose neighbours differ give
 * the boundaries back exactly. No sampling, no resolution to choose, no
 * boundary off by half a cell.
 *
 * ## Precession
 *
 * The table is B1875 and the app is J2000, so both directions are needed: a
 * click is J2000 and must go back to look itself up, and a boundary is B1875
 * and must come forward to be drawn. IAU 1976 precession, which is good to
 * well under an arcsecond over the 125 years involved — irrelevant to a click
 * and not irrelevant to the check that every star sits inside its own
 * constellation, where a star can lie a few arcseconds from a line.
 *
 * A constant-declination arc in B1875 is *not* a constant-declination arc in
 * J2000 — it is a slightly tilted curve — so the arcs are subdivided before
 * they are precessed rather than after.
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONSTELLATIONS, STARS, STAR_NAMES } from '../src/data/stars.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'data', 'constellations.js')

const ROMAN = 'https://cdsarc.cds.unistra.fr/ftp/VI/42/data.dat'

const log = (...args) => console.log('[constellations]', ...args)

const RADIANS = Math.PI / 180
const SQ_DEG_PER_STERADIAN = (180 / Math.PI) ** 2

/**
 * The Latin names, their genitives, and who is answerable for each.
 *
 * Written out rather than fetched, because no machine-readable source carries
 * all four columns and the values are fixed by the IAU and have not changed
 * since 1930. The nominatives are checked against Stellarium's own list at the
 * bottom of this script — 88 names that must match exactly — so a typo in the
 * column that matters cannot survive a run.
 *
 * The genitive is not decoration: it is how every star in the sky is named.
 * Betelgeuse is Alpha Orionis, "alpha of Orion", and a chart writes the
 * genitive rather than the nominative for exactly that reason.
 *
 * `origin` is who introduced the figure, which is the single most interesting
 * fact about most of them. Ptolemy's Almagest lists 48, of which **47** survive
 * as constellations in their own right — the forty-eighth was Argo Navis, so
 * large that Lacaille cut it into three, and Carina, Puppis and Vela are marked
 * `argo` rather than credited to either man. Lacaille's own 14 are new figures,
 * invented in 1756 after he catalogued the southern sky from the Cape and named
 * almost all of them after scientific instruments — which is why the far south
 * holds a Microscope, an Air Pump and a Telescope.
 *
 * The counts are asserted below rather than left as a claim in a comment.
 */
const NAMES = [
  ['And', 'Andromeda', 'Andromedae', 'ptolemy'],
  ['Ant', 'Antlia', 'Antliae', 'lacaille'],
  ['Aps', 'Apus', 'Apodis', 'keyser'],
  ['Aqr', 'Aquarius', 'Aquarii', 'ptolemy'],
  ['Aql', 'Aquila', 'Aquilae', 'ptolemy'],
  ['Ara', 'Ara', 'Arae', 'ptolemy'],
  ['Ari', 'Aries', 'Arietis', 'ptolemy'],
  ['Aur', 'Auriga', 'Aurigae', 'ptolemy'],
  ['Boo', 'Boötes', 'Boötis', 'ptolemy'],
  ['Cae', 'Caelum', 'Caeli', 'lacaille'],
  ['Cam', 'Camelopardalis', 'Camelopardalis', 'plancius'],
  ['Cnc', 'Cancer', 'Cancri', 'ptolemy'],
  ['CVn', 'Canes Venatici', 'Canum Venaticorum', 'hevelius'],
  ['CMa', 'Canis Major', 'Canis Majoris', 'ptolemy'],
  ['CMi', 'Canis Minor', 'Canis Minoris', 'ptolemy'],
  ['Cap', 'Capricornus', 'Capricorni', 'ptolemy'],
  ['Car', 'Carina', 'Carinae', 'argo'],
  ['Cas', 'Cassiopeia', 'Cassiopeiae', 'ptolemy'],
  ['Cen', 'Centaurus', 'Centauri', 'ptolemy'],
  ['Cep', 'Cepheus', 'Cephei', 'ptolemy'],
  ['Cet', 'Cetus', 'Ceti', 'ptolemy'],
  ['Cha', 'Chamaeleon', 'Chamaeleontis', 'keyser'],
  ['Cir', 'Circinus', 'Circini', 'lacaille'],
  ['Col', 'Columba', 'Columbae', 'plancius'],
  ['Com', 'Coma Berenices', 'Comae Berenices', 'vopel'],
  ['CrA', 'Corona Australis', 'Coronae Australis', 'ptolemy'],
  ['CrB', 'Corona Borealis', 'Coronae Borealis', 'ptolemy'],
  ['Crv', 'Corvus', 'Corvi', 'ptolemy'],
  ['Crt', 'Crater', 'Crateris', 'ptolemy'],
  ['Cru', 'Crux', 'Crucis', 'plancius'],
  ['Cyg', 'Cygnus', 'Cygni', 'ptolemy'],
  ['Del', 'Delphinus', 'Delphini', 'ptolemy'],
  ['Dor', 'Dorado', 'Doradus', 'keyser'],
  ['Dra', 'Draco', 'Draconis', 'ptolemy'],
  ['Equ', 'Equuleus', 'Equulei', 'ptolemy'],
  ['Eri', 'Eridanus', 'Eridani', 'ptolemy'],
  ['For', 'Fornax', 'Fornacis', 'lacaille'],
  ['Gem', 'Gemini', 'Geminorum', 'ptolemy'],
  ['Gru', 'Grus', 'Gruis', 'keyser'],
  ['Her', 'Hercules', 'Herculis', 'ptolemy'],
  ['Hor', 'Horologium', 'Horologii', 'lacaille'],
  ['Hya', 'Hydra', 'Hydrae', 'ptolemy'],
  ['Hyi', 'Hydrus', 'Hydri', 'keyser'],
  ['Ind', 'Indus', 'Indi', 'keyser'],
  ['Lac', 'Lacerta', 'Lacertae', 'hevelius'],
  ['Leo', 'Leo', 'Leonis', 'ptolemy'],
  ['LMi', 'Leo Minor', 'Leonis Minoris', 'hevelius'],
  ['Lep', 'Lepus', 'Leporis', 'ptolemy'],
  ['Lib', 'Libra', 'Librae', 'ptolemy'],
  ['Lup', 'Lupus', 'Lupi', 'ptolemy'],
  ['Lyn', 'Lynx', 'Lyncis', 'hevelius'],
  ['Lyr', 'Lyra', 'Lyrae', 'ptolemy'],
  ['Men', 'Mensa', 'Mensae', 'lacaille'],
  ['Mic', 'Microscopium', 'Microscopii', 'lacaille'],
  ['Mon', 'Monoceros', 'Monocerotis', 'plancius'],
  ['Mus', 'Musca', 'Muscae', 'keyser'],
  ['Nor', 'Norma', 'Normae', 'lacaille'],
  ['Oct', 'Octans', 'Octantis', 'lacaille'],
  ['Oph', 'Ophiuchus', 'Ophiuchi', 'ptolemy'],
  ['Ori', 'Orion', 'Orionis', 'ptolemy'],
  ['Pav', 'Pavo', 'Pavonis', 'keyser'],
  ['Peg', 'Pegasus', 'Pegasi', 'ptolemy'],
  ['Per', 'Perseus', 'Persei', 'ptolemy'],
  ['Phe', 'Phoenix', 'Phoenicis', 'keyser'],
  ['Pic', 'Pictor', 'Pictoris', 'lacaille'],
  ['Psc', 'Pisces', 'Piscium', 'ptolemy'],
  ['PsA', 'Piscis Austrinus', 'Piscis Austrini', 'ptolemy'],
  ['Pup', 'Puppis', 'Puppis', 'argo'],
  ['Pyx', 'Pyxis', 'Pyxidis', 'lacaille'],
  ['Ret', 'Reticulum', 'Reticuli', 'lacaille'],
  ['Sge', 'Sagitta', 'Sagittae', 'ptolemy'],
  ['Sgr', 'Sagittarius', 'Sagittarii', 'ptolemy'],
  ['Sco', 'Scorpius', 'Scorpii', 'ptolemy'],
  ['Scl', 'Sculptor', 'Sculptoris', 'lacaille'],
  ['Sct', 'Scutum', 'Scuti', 'hevelius'],
  ['Ser', 'Serpens', 'Serpentis', 'ptolemy'],
  ['Sex', 'Sextans', 'Sextantis', 'hevelius'],
  ['Tau', 'Taurus', 'Tauri', 'ptolemy'],
  ['Tel', 'Telescopium', 'Telescopii', 'lacaille'],
  ['Tri', 'Triangulum', 'Trianguli', 'ptolemy'],
  ['TrA', 'Triangulum Australe', 'Trianguli Australis', 'keyser'],
  ['Tuc', 'Tucana', 'Tucanae', 'keyser'],
  ['UMa', 'Ursa Major', 'Ursae Majoris', 'ptolemy'],
  ['UMi', 'Ursa Minor', 'Ursae Minoris', 'ptolemy'],
  ['Vel', 'Vela', 'Velorum', 'argo'],
  ['Vir', 'Virgo', 'Virginis', 'ptolemy'],
  ['Vol', 'Volans', 'Volantis', 'keyser'],
  ['Vul', 'Vulpecula', 'Vulpeculae', 'hevelius'],
]

/* ------------------------------------------------------------------ *
 * Precession, IAU 1976.
 * ------------------------------------------------------------------ */

/**
 * B1875.0 as Julian centuries from J2000.0.
 *
 * A Besselian epoch, not a Julian one: B1875.0 is JD 2405889.25855, the instant
 * the mean Sun's longitude reached 280°, and it lands a couple of days off
 * 1875 January 1. Using 1875.0 as a Julian year instead would be a 0.2"
 * error, which is far below anything here — it is written out exactly because
 * the number costs nothing and guessing it invites the question later.
 */
const T_B1875 = (2405889.25855 - 2451545.0) / 36525

/** Rotation from mean J2000 to the mean equinox of `T`, as a 3×3 row-major matrix. */
function precessionMatrix(T) {
  const arcsec = (1 / 3600) * RADIANS
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * arcsec
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * arcsec
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * arcsec

  const cz = Math.cos(zeta)
  const sz = Math.sin(zeta)
  const cZ = Math.cos(z)
  const sZ = Math.sin(z)
  const ct = Math.cos(theta)
  const st = Math.sin(theta)

  return [
    cz * ct * cZ - sz * sZ, -sz * ct * cZ - cz * sZ, -st * cZ,
    cz * ct * sZ + sz * cZ, -sz * ct * sZ + cz * cZ, -st * sZ,
    cz * st, -sz * st, ct,
  ]
}

const TO_B1875 = precessionMatrix(T_B1875)
/** The inverse of a rotation is its transpose. */
const TO_J2000 = [
  TO_B1875[0], TO_B1875[3], TO_B1875[6],
  TO_B1875[1], TO_B1875[4], TO_B1875[7],
  TO_B1875[2], TO_B1875[5], TO_B1875[8],
]

function rotate(m, raDeg, decDeg) {
  const ra = raDeg * RADIANS
  const dec = decDeg * RADIANS
  const cd = Math.cos(dec)
  const x = cd * Math.cos(ra)
  const y = cd * Math.sin(ra)
  const z = Math.sin(dec)

  const X = m[0] * x + m[1] * y + m[2] * z
  const Y = m[3] * x + m[4] * y + m[5] * z
  const Z = m[6] * x + m[7] * y + m[8] * z

  let outRa = Math.atan2(Y, X) / RADIANS
  if (outRa < 0) outRa += 360
  return [outRa, Math.asin(Math.max(-1, Math.min(1, Z))) / RADIANS]
}

const toB1875 = (ra, dec) => rotate(TO_B1875, ra, dec)
const toJ2000 = (ra, dec) => rotate(TO_J2000, ra, dec)

/*
 * Which way precession runs, asserted rather than assumed.
 *
 * The two matrices are transposes of each other, so a round trip is the
 * identity whichever way round they are applied — a self-consistency check
 * cannot catch a sign error here, and the wrong sign is a 3.4° error in RA that
 * would put stars near a boundary in the neighbouring constellation and leave
 * everything else looking perfect.
 *
 * So the check is against the direction of precession itself. General
 * precession carries right ascension *forward* at about 3.07 seconds of time a
 * year near the equator, so a star's B1875 right ascension must be smaller than
 * its J2000 one, by roughly 125 × 3.07 s = 1.6° there. Mintaka, the westernmost
 * star of Orion's belt, sits close enough to the equator to make that the whole
 * story.
 */
{
  const [ra] = toB1875(83.0016, -0.2991)
  const shift = 83.0016 - ra
  if (!(shift > 1.4 && shift < 1.9)) {
    throw new Error(`precession looks wrong: Mintaka moved ${shift.toFixed(3)}°, expected ~1.6°`)
  }
  log(`precession checks out — Mintaka is ${shift.toFixed(3)}° west in B1875`)
}

/* ------------------------------------------------------------------ *
 * Roman's table.
 * ------------------------------------------------------------------ */

log('fetching Roman (1987) constellation boundaries, VizieR VI/42 …')
const res = await fetch(ROMAN)
if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${ROMAN}`)
const text = await res.text()

/** `[raLowHours, raHighHours, decLowDegrees, abbreviation]`, in file order. */
const TABLE = text
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [raLo, raHi, dec, abbr] = line.split(/\s+/)
    return [Number(raLo), Number(raHi), Number(dec), abbr]
  })

log(`${TABLE.length} boundary rows`)
if (TABLE.length !== 357) throw new Error(`expected 357 rows, got ${TABLE.length}`)

/** Roman's own three-letter forms, cased as the app writes them. */
const ABBR = NAMES.map(([a]) => a)
const ABBR_INDEX = Object.fromEntries(ABBR.map((a, i) => [a.toUpperCase(), i]))

/**
 * The lookup, and it is the whole algorithm.
 *
 * The table is ordered by descending declination, so the first row whose
 * southern edge is below the point and whose right-ascension range contains it
 * is the answer. Every later row that also matches describes a region further
 * south that this one sits on top of.
 *
 * Right ascension in *hours*, declination in degrees, both **B1875**.
 */
function lookupB1875(raHours, decDegrees) {
  for (let i = 0; i < TABLE.length; i++) {
    const row = TABLE[i]
    if (decDegrees < row[2]) continue
    if (raHours < row[0] || raHours >= row[1]) continue
    return row[3]
  }
  return null
}

/* ------------------------------------------------------------------ *
 * The exact decomposition.
 * ------------------------------------------------------------------ */

const decLevels = [...new Set([...TABLE.map((r) => r[2]), 90])].sort((a, b) => a - b)
const raLevels = [...new Set([...TABLE.flatMap((r) => [r[0], r[1]]), 0, 24])].sort((a, b) => a - b)

if (decLevels[0] !== -90) throw new Error(`southernmost level is ${decLevels[0]}, expected -90`)
log(`${decLevels.length - 1} declination bands × ${raLevels.length - 1} right-ascension columns`)

const rows = decLevels.length - 1
const columns = raLevels.length - 1
/** Cell → constellation index, row-major, south to north. */
const cells = new Int16Array(rows * columns).fill(-1)

for (let r = 0; r < rows; r++) {
  const dec = (decLevels[r] + decLevels[r + 1]) / 2
  for (let c = 0; c < columns; c++) {
    const ra = (raLevels[c] + raLevels[c + 1]) / 2
    const abbr = lookupB1875(ra, dec)
    if (!abbr) throw new Error(`no constellation at RA ${ra}h dec ${dec}° — the table has a hole`)
    const index = ABBR_INDEX[abbr.toUpperCase()]
    if (index === undefined) throw new Error(`unknown abbreviation ${abbr}`)
    cells[r * columns + c] = index
  }
}

const cellAt = (r, c) => cells[r * columns + ((c + columns) % columns)]

/* ------------------------------------------------------------------ *
 * Area, centre and neighbours, summed off the same cells.
 * ------------------------------------------------------------------ */

const areas = new Float64Array(NAMES.length)
const centres = Array.from({ length: NAMES.length }, () => ({ x: 0, y: 0, z: 0 }))
/**
 * How far north and south each one reaches, which is what decides who can see
 * it. Taken in B1875 like everything else here and *not* precessed: it is a
 * property of the region, and the region is a 1875 shape. The difference is
 * under two degrees and the statement it feeds — "visible from latitudes X to
 * Y" — is a rule of thumb about horizons, not an ephemeris.
 */
const extents = Array.from({ length: NAMES.length }, () => [90, -90])

for (let r = 0; r < rows; r++) {
  const decLo = decLevels[r] * RADIANS
  const decHi = decLevels[r + 1] * RADIANS
  const band = Math.sin(decHi) - Math.sin(decLo)
  const decMid = ((decLevels[r] + decLevels[r + 1]) / 2) * RADIANS
  for (let c = 0; c < columns; c++) {
    const span = (raLevels[c + 1] - raLevels[c]) * 15 * RADIANS
    const area = span * band
    const index = cells[r * columns + c]
    areas[index] += area
    if (decLevels[r] < extents[index][0]) extents[index][0] = decLevels[r]
    if (decLevels[r + 1] > extents[index][1]) extents[index][1] = decLevels[r + 1]

    // An area-weighted vector mean, which is the only way to average a
    // direction: a constellation straddling right ascension 0 would otherwise
    // average its two halves to a centre on the far side of the sky.
    const raMid = ((raLevels[c] + raLevels[c + 1]) / 2) * 15 * RADIANS
    const cd = Math.cos(decMid)
    centres[index].x += area * cd * Math.cos(raMid)
    centres[index].y += area * cd * Math.sin(raMid)
    centres[index].z += area * Math.sin(decMid)
  }
}

const neighbours = Array.from({ length: NAMES.length }, () => new Set())
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < columns; c++) {
    const here = cellAt(r, c)
    const east = cellAt(r, c + 1)
    if (east !== here) {
      neighbours[here].add(east)
      neighbours[east].add(here)
    }
    if (r + 1 < rows) {
      const north = cellAt(r + 1, c)
      if (north !== here) {
        neighbours[here].add(north)
        neighbours[north].add(here)
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * The boundaries, as the edges between cells that disagree.
 * ------------------------------------------------------------------ */

/**
 * How finely a boundary arc is chopped before it is precessed, in degrees.
 *
 * An arc of constant declination in B1875 is a curve in J2000, and the sag over
 * a long arc is real: the pole has moved, so what was a small circle about the
 * old pole is not one about the new. 2° keeps the error under an arcsecond
 * everywhere and costs a few thousand vertices.
 */
const ARC_STEP = 2

/** A run of cells along one row or column that share a boundary edge. */
function runs(length, sameAs) {
  const out = []
  let start = 0
  for (let i = 1; i <= length; i++) {
    if (i === length || !sameAs(i, start)) {
      out.push([start, i])
      start = i
    }
  }
  return out
}

/** Boundary polylines per constellation, as flat `[ra, dec, ra, dec, …]` in J2000. */
const outlines = Array.from({ length: NAMES.length }, () => [])

/** A meridian segment: constant right ascension, declination from lo to hi. */
function addMeridian(index, raHours, decLo, decHi) {
  const steps = Math.max(1, Math.ceil((decHi - decLo) / ARC_STEP))
  const line = []
  for (let s = 0; s <= steps; s++) {
    const dec = decLo + ((decHi - decLo) * s) / steps
    line.push(...toJ2000(raHours * 15, dec))
  }
  outlines[index].push(line)
}

/** A parallel segment: constant declination, right ascension from lo to hi. */
function addParallel(index, dec, raLo, raHi) {
  const steps = Math.max(1, Math.ceil(((raHi - raLo) * 15 * Math.cos(dec * RADIANS)) / ARC_STEP))
  const line = []
  for (let s = 0; s <= steps; s++) {
    const ra = raLo + ((raHi - raLo) * s) / steps
    line.push(...toJ2000(ra * 15, dec))
  }
  outlines[index].push(line)
}

// Meridians: for each vertical grid line, the runs of rows where the cells
// either side disagree. Both constellations get the edge — a boundary belongs
// to the two regions it separates, and each is drawn on its own.
let edges = 0
for (let c = 0; c < columns; c++) {
  const west = (r) => cellAt(r, c)
  const east = (r) => cellAt(r, c + 1)
  const differ = (r) => west(r) !== east(r)
  for (const [from, to] of runs(rows, (i, start) => differ(i) === differ(start) && (!differ(i) || (west(i) === west(start) && east(i) === east(start))))) {
    if (!differ(from)) continue
    const ra = raLevels[c + 1]
    addMeridian(west(from), ra, decLevels[from], decLevels[to])
    addMeridian(east(from), ra, decLevels[from], decLevels[to])
    edges += 2
  }
}

// Parallels: the same along each horizontal grid line, plus the poles, which
// have no cell above or below them and so are never a boundary.
for (let r = 0; r + 1 < rows; r++) {
  const south = (c) => cellAt(r, c)
  const north = (c) => cellAt(r + 1, c)
  const differ = (c) => south(c) !== north(c)
  for (const [from, to] of runs(columns, (i, start) => differ(i) === differ(start) && (!differ(i) || (south(i) === south(start) && north(i) === north(start))))) {
    if (!differ(from)) continue
    const dec = decLevels[r + 1]
    addParallel(south(from), dec, raLevels[from], raLevels[to])
    addParallel(north(from), dec, raLevels[from], raLevels[to])
    edges += 2
  }
}

log(`${edges} boundary arcs`)

/* ------------------------------------------------------------------ *
 * Which stars belong to which.
 * ------------------------------------------------------------------ */

const membership = new Int16Array(STARS.length)
const populations = Array.from({ length: NAMES.length }, () => [])
for (let i = 0; i < STARS.length; i++) {
  const [ra, dec] = STARS[i]
  const [ra1875, dec1875] = toB1875(ra, dec)
  const abbr = lookupB1875(ra1875 / 15, dec1875)
  const index = ABBR_INDEX[abbr.toUpperCase()]
  membership[i] = index
  populations[index].push(i)
}

const NAMED = new Map(STAR_NAMES)

/* ------------------------------------------------------------------ *
 * Cross-check against the figures, and emit.
 * ------------------------------------------------------------------ */

/*
 * The attributions, counted.
 *
 * A comment claiming "48 are Ptolemy's" is exactly the sort of thing that stays
 * on the page after the table under it has changed — and this one was wrong the
 * first time it was written, because the three pieces of Argo Navis were filed
 * under the man who *divided* the figure rather than the one who catalogued it.
 * The counts are the historical record, so they are asserted.
 */
{
  const tally = {}
  for (const [, , , origin] of NAMES) tally[origin] = (tally[origin] ?? 0) + 1
  const expected = { ptolemy: 47, lacaille: 14, argo: 3, keyser: 12, plancius: 4, hevelius: 7, vopel: 1 }
  for (const [origin, count] of Object.entries(expected)) {
    if (tally[origin] !== count) {
      throw new Error(`${count} constellations should be ${origin}, the table has ${tally[origin] ?? 0}`)
    }
  }
  const total = Object.values(tally).reduce((a, b) => a + b, 0)
  if (total !== 88) throw new Error(`${total} constellations, expected 88`)
  log('attributions check out — Ptolemy 47 plus Argo’s 3, Lacaille 14, the Dutch 12, Hevelius 7')
}

const figureByName = new Map(CONSTELLATIONS.map((f) => [f.name, f]))
for (const [, name] of NAMES) {
  if (!figureByName.has(name)) {
    throw new Error(`"${name}" is not one of the 88 figures — the Latin name table has a typo`)
  }
}
if (figureByName.size !== NAMES.length) {
  throw new Error(`${figureByName.size} figures against ${NAMES.length} names`)
}

const round = (v, places) => Number(v.toFixed(places))

const built = NAMES.map(([abbr, name, genitive, origin], index) => {
  const stars = populations[index]
  const brightest = stars.reduce((best, i) => (STARS[i][2] < STARS[best][2] ? i : best), stars[0])
  const centre = centres[index]
  const length = Math.hypot(centre.x, centre.y, centre.z)
  let ra = Math.atan2(centre.y / length, centre.x / length) / RADIANS
  if (ra < 0) ra += 360

  return {
    abbr,
    name,
    genitive,
    english: figureByName.get(name).english,
    origin,
    area: round(areas[index] * SQ_DEG_PER_STERADIAN, 3),
    centre: [round(ra, 3), round(Math.asin(centre.z / length) / RADIANS, 3)],
    decRange: [round(extents[index][0], 3), round(extents[index][1], 3)],
    brightest,
    brightestName: NAMED.get(brightest) ?? null,
    stars: stars.length,
    named: stars.filter((i) => NAMED.has(i)).length,
    neighbours: [...neighbours[index]].sort((a, b) => a - b),
    outline: outlines[index],
  }
})

/*
 * The decomposition covers the sphere exactly, so this is not a tolerance —
 * it is a test of whether the cells tile without gap or overlap, and the answer
 * should be the whole sky to within floating point. Summed *unrounded*: the
 * published figures are quoted to three decimals, and 88 of them rounded to one
 * would leave a couple of square degrees of rounding to hide a real hole in.
 */
const totalArea = [...areas].reduce((sum, a) => sum + a, 0) * SQ_DEG_PER_STERADIAN
log(`areas total ${totalArea.toFixed(4)} square degrees (the sky is 41252.9612)`)
// A ten-thousandth of a square degree, which is to say floating point. This is
// not a tolerance on a measurement — the cells either tile the sphere or they
// do not, and a single miscounted cell would show up as tens of square degrees.
if (Math.abs(totalArea - 41252.9612) > 1e-4) throw new Error('the areas do not add up to a sphere')

const biggest = [...built].sort((a, b) => b.area - a.area)[0]
const smallest = [...built].sort((a, b) => a.area - b.area)[0]
log(`largest ${biggest.name} ${biggest.area}, smallest ${smallest.name} ${smallest.area}`)

const today = new Date().toISOString().slice(0, 10)
const vertices = built.reduce((n, c) => n + c.outline.reduce((m, l) => m + l.length / 2, 0), 0)

const body = `/**
 * The 88 constellations as regions: boundaries, areas, neighbours, membership.
 *
 * GENERATED by \`scripts/fetch-constellations.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:constellations\` instead. Generated ${today}.
 *
 * Boundaries are Delporte's, drawn for the IAU in 1930 along lines of constant
 * right ascension and declination in the equinox of **B1875**, by way of Roman
 * (1987), VizieR VI/42. The prose about each one lives in
 * \`constellationData.js\`; the stick figures live in \`stars.js\`.
 *
 * Since 1930 these regions tile the sky completely — no gaps, no overlaps — so
 * every direction is in exactly one constellation. That is what makes the sky
 * clickable, and it is why \`BOUNDARY_TABLE\` below is shipped whole rather than
 * summarised: it is the authority, and the app answers "what am I looking at"
 * from it directly.
 */

/**
 * Roman's table, verbatim: \`[raLowHours, raHighHours, decLowDegrees, index]\`.
 *
 * Ordered by descending declination, which is not incidental — it *is* the
 * algorithm. The first row whose southern edge lies below the point and whose
 * right-ascension range contains it is the answer, because every later match
 * describes a region further south that this one overlies.
 *
 * The last column is an index into \`CONSTELLATION_REGIONS\` rather than the
 * three-letter abbreviation, so a lookup lands on the record without a second
 * one through a name.
 *
 * **B1875**, so a J2000 position has to be precessed back before it is looked
 * up. \`src/scene/constellationLookup.js\` does that, and explains why.
 */
export const BOUNDARY_TABLE = [
${TABLE.map((r) => `  [${r[0]}, ${r[1]}, ${r[2]}, ${ABBR_INDEX[r[3].toUpperCase()]}],`).join('\n')}
]

/**
 * The rotation from mean J2000 to mean B1875, row-major.
 *
 * IAU 1976 precession, evaluated once here rather than in the app: it is nine
 * constants and the alternative is shipping the polynomials and a date to
 * evaluate them at, for an epoch that by definition never changes.
 */
export const J2000_TO_B1875 = [
${'  ' + TO_B1875.map((v) => v.toExponential(12)).join(',\n  ')},
]

/**
 * Which constellation each star in \`STARS\` falls in, by index into
 * \`CONSTELLATION_REGIONS\`.
 *
 * ${STARS.length} entries, in the same order as the catalogue. Baked rather than looked
 * up at load because it is ${STARS.length} precessions and ${STARS.length} table scans, and the
 * answer cannot change.
 */
export const STAR_CONSTELLATION = [
${(() => {
  const lines = []
  for (let i = 0; i < membership.length; i += 40) {
    lines.push('  ' + [...membership.slice(i, i + 40)].join(',') + ',')
  }
  return lines.join('\n')
})()}
]

/**
 * The regions themselves, alphabetical by Latin name — the same order as
 * \`CONSTELLATIONS\` in \`stars.js\`, so an index is good in both.
 *
 * \`outline\` is a list of polylines in J2000 degrees, \`[ra, dec, ra, dec, …]\`.
 * They are the edges between cells that disagree, derived from the table above,
 * so an outline cannot drift from the region it draws. ${vertices} vertices in all.
 *
 * \`centre\` is the area-weighted mean direction, which is where the name is
 * written and where the camera looks when you fly to one. \`brightest\` and the
 * star counts are indices into and counts over \`STARS\`.
 */
export const CONSTELLATION_REGIONS = [
${built
  .map(
    (c) => `  {
    abbr: ${JSON.stringify(c.abbr)},
    name: ${JSON.stringify(c.name)},
    genitive: ${JSON.stringify(c.genitive)},
    english: ${JSON.stringify(c.english)},
    origin: ${JSON.stringify(c.origin)},
    area: ${c.area},
    centre: [${c.centre.join(', ')}],
    decRange: [${c.decRange.join(', ')}],
    brightest: ${c.brightest},
    brightestName: ${JSON.stringify(c.brightestName)},
    stars: ${c.stars},
    named: ${c.named},
    neighbours: [${c.neighbours.join(', ')}],
    outline: [
${c.outline.map((line) => `      [${line.map((v) => round(v, 3)).join(',')}],`).join('\n')}
    ],
  },`,
  )
  .join('\n')}
]
`

writeFileSync(OUT, body)
log(`wrote ${OUT} (${(body.length / 1024).toFixed(0)} KB, ${vertices} boundary vertices)`)
