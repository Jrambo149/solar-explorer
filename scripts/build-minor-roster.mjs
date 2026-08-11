#!/usr/bin/env node
/**
 * Prints roster entries for a planet's minor moons, ready to paste into
 * `minor-moon-roster.mjs`.
 *
 * Run with:
 *     node scripts/build-minor-roster.mjs saturn
 *
 * ## Why this prints rather than writes
 *
 * The roster is the one file in this pipeline that holds *decisions* — which
 * moons the app carries, which are inner and which irregular, and the handful
 * that are deliberately left out with a reason. Those are editorial and they
 * need a person. Everything else about a roster row is mechanical: reading
 * Eyes' list, reading its generic-mesh assignment, and finding each body's
 * Horizons code.
 *
 * So this does the mechanical part and hands it over. Nothing is overwritten,
 * and the prose and the omissions in the roster survive a rerun.
 *
 * ## Matching Eyes to JPL
 *
 * By name, which works for 281 of Saturn's 285 and fails in one specific way
 * worth handling rather than hand-patching. Some of Eyes' entries are labelled
 * only by Roman numeral — `Saturn LVIII` — because they were numbered before
 * they were named, and JPL lists the same bodies under their provisional
 * designations (`S2004_S_26`). Neither table can be joined to the other
 * directly, but the *discovery* table carries both, so it is used as the bridge.
 *
 * The residue after that is real: a body Eyes draws that JPL publishes no orbit
 * for. Those are reported, not guessed at, and belong in the roster as a
 * commented omission if they belong there at all.
 */

import { MINOR_MOON_ROSTER } from './minor-moon-roster.mjs'

const stripTags = (html) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;?/g, ' ').replace(/\s+/g, ' ').trim()

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

async function getText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) })
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  return res.text()
}

function tableRows(html) {
  return (html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []).map((row) =>
    (row.match(/<t[dh][^>]*>[\s\S]*?(?=<t[dh]|<\/tr>)/g) ?? []).map(stripTags),
  )
}

/** Eyes' own moon list for one planet, with its generic-mesh assignment. */
async function eyesRoster(planet) {
  const app = await getText('https://eyes.nasa.gov/apps/solar-system/app.js')

  const marks = []
  const re = /([a-z0-9_]+):\{groups:\[([^\]]*)\],radius:([0-9.eE+-]+),label:"([^"]*)"/g
  let m
  while ((m = re.exec(app))) {
    marks.push({
      idx: m.index,
      id: m[1],
      groups: m[2].replace(/"/g, '').split(','),
      radius: Number(m[3]),
      label: m[4],
    })
  }

  const out = []
  for (let k = 0; k < marks.length; k++) {
    const cur = marks[k]
    if (cur.groups[0] !== planet || !cur.groups.includes('moons')) continue

    // Bounded by the next entity so a model URL cannot bleed in from the one
    // after it — which is how Umbriel first appeared to wear a generic asteroid.
    const end = k + 1 < marks.length ? marks[k + 1].idx : cur.idx + 1200
    const segment = app.slice(cur.idx, end)
    const generic = segment.match(/generic_asteroid_(\d)/)
    const own = segment.match(/models\/(?!generic)([a-z0-9_]+)\//)

    out.push({
      id: cur.id,
      label: cur.label,
      radiusKm: cur.radius,
      groups: cur.groups.slice(1).filter((g) => g !== 'moons'),
      model: generic ? Number(generic[1]) : null,
      ownModel: own ? own[1] : null,
    })
  }
  return out
}

/** JPL's Horizons codes for one planet's satellites, keyed by normalised name. */
async function jplCodes(planetName) {
  const html = await getText('https://ssd.jpl.nasa.gov/sats/elem/')
  const out = {}
  for (const c of tableRows(html)) {
    if (c.length < 19 || c[1] !== planetName) continue
    out[JPL_NAME_FIXES[norm(c[2])] ?? norm(c[2])] = {
      code: c[3],
      name: c[2],
      frame: c[5],
      tilt: c[18] === '' ? null : Number(c[18]),
      aKm: Number(c[7]),
    }
  }
  return out
}

/** numeral → provisional designation, for the bodies Eyes labels by numeral. */
async function numeralBridge(planetName) {
  const html = await getText('https://ssd.jpl.nasa.gov/sats/discovery.html')
  const rows = tableRows(html)
  const out = {}

  // The discovery page is one long table covering every planet in order, with
  // no planet column — the only thing separating the systems is that the
  // numerals restart. Tracking that is enough to key numerals per planet.
  let seen = new Set()
  let planetOf = []
  for (const c of rows) {
    if (c.length < 5 || !/^\d{4}$/.test(c[3])) continue
    if (seen.has(c[0])) {
      seen = new Set()
      planetOf.push(null)
    }
    seen.add(c[0])
    planetOf.push({ numeral: c[0], name: c[1], provisional: c[2] })
  }

  // Rather than infer the boundaries, key on the pairing that is unambiguous:
  // a numeral plus the provisional designation's planet letter (`S/2004 S26`).
  const letter = planetName[0].toUpperCase()
  for (const row of planetOf) {
    if (!row?.provisional) continue
    if (!new RegExp(`^S/\\d{4} ${letter}`).test(row.provisional)) continue
    out[`${planetName} ${row.numeral}`.toLowerCase()] = row.provisional
  }
  return out
}

/**
 * Which family a moon belongs to, collapsed to the two the pipeline cares about.
 *
 * `inner` means the planet's oblateness controls the orbit and the elements
 * belong in its equatorial frame; `irregular` means the Sun does and they belong
 * in the ecliptic. Getting it wrong is not cosmetic — it is the difference
 * between Nereid at i = 5° and Nereid at i = 28°.
 *
 * Taken from **JPL's own reference frame** for the body, and specifically from
 * whether that frame is the planet's equator — which is the same question asked
 * by the people who fitted the orbit.
 *
 * Two things had to be got wrong first. Eyes' group names were the original
 * attempt and are not reliable for this: they work where a body has been sorted
 * into a named family — norse, gallic, inuit — but a hundred and thirty of
 * Saturn's are filed only as `minor` with no family assigned yet, and reading
 * that as "not irregular" put 154 bodies in Saturn's equatorial frame when it
 * has fifteen genuine inner minor moons.
 *
 * Reading `frame === 'ecliptic'` alone is closer and still wrong, because a
 * Laplace frame is not automatically the equator. **Phoebe** is the case: JPL
 * tabulates it as Laplace, but it orbits 12.9 million kilometres out and
 * backwards, and at that distance its Laplace plane has been pulled around to
 * near the ecliptic. The `tilt` column says so, and testing it is what puts the
 * solar system's best-known irregular moon on the right side of the line.
 *
 * The threshold matches `EQUATOR_TILT_LIMIT` in `fetch-minor-moons.mjs`, and
 * folds 180° onto 0° for the same reason: a plane described from its far pole is
 * still that plane.
 */
const EQUATOR_TILT_LIMIT = 2

/**
 * Eyes' own name for the dynamical group, kept alongside `family`.
 *
 * `family` is the physics — which frame the orbit belongs in — and is all the
 * element pipeline needs. `group` is what the body is *called*, and it is what
 * makes a list of 276 navigable: Saturn's irregulars are not an undifferentiated
 * swarm, they are the Inuit, Gallic and Norse groups, each thought to be the
 * debris of one captured parent, and each with its own inclination and direction
 * of travel.
 *
 * Taken from Eyes rather than derived, because the assignment is a research
 * result — which fragments belong to which parent — and not something to infer
 * from a semi-major axis. Where Eyes has not assigned one, `null`: a hundred and
 * thirty of Saturn's are still filed only as `minor`, which honestly reflects
 * that nobody has placed them yet.
 */
const NAMED_GROUPS = new Set([
  'norse', 'gallic', 'inuit',
  'pasiphae', 'carme', 'ananke', 'himalia', 'carpo',
  'ring shepherd', 'ring moonlet', 'co-orbital', 'trojan', 'alkyonides',
  'propeller moonlet', 'amalthea', 'galilean',
])

const groupOf = (groups) => groups.find((g) => NAMED_GROUPS.has(g)) ?? null

/**
 * Bodies whose name JPL's element table spells differently from everyone else.
 *
 * Not alternative designations — the numeral bridge above handles those. These
 * are two data-entry faults in the table itself, and they are worth naming here
 * rather than hand-patching the roster, because a rerun would otherwise drop the
 * same two moons again with the same "no orbit published" message:
 *
 *   Megaclite      tabulated `Magaclite`     — a typo
 *   Philophrosyne  tabulated `Philophrosyn`  — truncated one character short
 *
 * Both are real Jupiter irregulars of the Pasiphae group with full JUP347
 * ephemerides, and both are matched by their Horizons code once found. Keyed on
 * the normalised *published* spelling, mapping to the normalised true name.
 */
const JPL_NAME_FIXES = { magaclite: 'megaclite', philophrosyn: 'philophrosyne' }

function familyOf({ frame, tilt }) {
  if (frame !== 'Laplace') return 'irregular'
  if (tilt === null || Number.isNaN(tilt)) return 'irregular'
  return Math.min(Math.abs(tilt), Math.abs(180 - tilt)) <= EQUATOR_TILT_LIMIT ? 'inner' : 'irregular'
}

async function main() {
  const planet = process.argv[2]
  if (!planet) throw new Error('usage: build-minor-roster.mjs <planet>')

  const planetName = planet[0].toUpperCase() + planet.slice(1)
  const [eyes, codes, numerals] = await Promise.all([
    eyesRoster(planet),
    jplCodes(planetName),
    numeralBridge(planetName),
  ])

  // Anything already carried as a major moon is not a minor moon.
  const majors = new Set(
    (await import('../src/data/moonData.js')).MOONS_RAW
      .filter((m) => m.parent === planet)
      .map((m) => m.id),
  )

  const resolved = []
  const unresolved = []

  for (const moon of eyes) {
    if (majors.has(moon.id)) continue

    const viaNumeral = numerals[moon.label.toLowerCase()]
    const found =
      codes[norm(moon.id)] ??
      codes[norm(moon.label)] ??
      (viaNumeral ? codes[norm(viaNumeral)] : null)

    if (!found) {
      unresolved.push(moon)
      continue
    }
    resolved.push({ ...moon, code: found.code, aKm: found.aKm, jplName: found.name, frame: found.frame, tilt: found.tilt })
  }

  // Innermost first, which is how every other roster block reads.
  resolved.sort((a, b) => a.aKm - b.aKm)

  const already = new Set((MINOR_MOON_ROSTER[planet] ?? []).map((m) => m.id))

  console.log(`  // ---- ${planet}: ${resolved.length} ----`)
  for (const m of resolved) {
    const name = m.label.replace(/'/g, "\\'")
    const fields = [
      `id: '${m.id}'`,
      `name: '${name}'`,
      `code: '${m.code}'`,
      `family: '${familyOf(m)}'`,
      `group: ${groupOf(m.groups) ? `'${groupOf(m.groups)}'` : 'null'}`,
      `model: ${m.ownModel ? 'null' : m.model}`,
      `radiusKm: ${m.radiusKm}`,
    ]
    console.log(`  { ${fields.join(', ')} },${already.has(m.id) ? ' // already present' : ''}`)
  }

  console.error(`\n[roster] ${resolved.length} resolved, ${unresolved.length} unresolved`)
  for (const m of unresolved) {
    console.error(`[roster]   ${m.label} [${m.groups.join('/')}] — no orbit published by JPL`)
  }
  const own = resolved.filter((m) => m.ownModel)
  if (own.length) {
    console.error(`\n[roster] ${own.length} carry a real mesh in Eyes rather than a generic:`)
    for (const m of own) console.error(`[roster]   ${m.label} → models/${m.ownModel}/`)
  }
}

main().catch((error) => {
  console.error(`[roster] ${error.message}`)
  process.exitCode = 1
})
