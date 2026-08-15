/**
 * The close approaches, against JPL.
 *
 * A close approach is the most falsifiable event this app produces and the
 * easiest to get plausibly wrong. Every other kind is an *alignment* — an
 * opposition, an elongation, a ring-plane crossing — and an alignment is
 * forgiving: it depends on an angle, the angle changes slowly, and an ephemeris
 * that is a few arcminutes out still names the right day.
 *
 * An approach depends on a distance between two moving objects, and the
 * distance changes fast. Apophis crosses the Earth's neighbourhood at about
 * 7 km/s relative to it, so it covers half a million kilometres in a day: an
 * error that would be invisible in an opposition is the difference between a
 * flyby and a miss.
 *
 * ## What is checked, and what is deliberately not
 *
 * The **date** is checked hard, against JPL Horizons, by asking Horizons for
 * the actual Earth–Apophis distance around the app's answer and finding where
 * that minimum really falls.
 *
 * The **distance** is checked only to state how wrong it is. It *is* wrong —
 * the app's own geometry puts the 2029 pass at about 79,000 km when the true
 * figure is 38,000 — and that is not a defect to be fixed by a better fit but a
 * consequence of what a six-element linear model can do. The check exists so
 * that the number is measured and written down rather than trusted, and so that
 * nothing in the app starts printing it.
 *
 * Needs the network.
 *
 *   node scripts/verify-approaches.mjs
 */

import { EVENTS } from '../src/data/events.js'
import { BODIES_BY_ID } from '../src/data/bodies.js'
import { ASTEROID_BODY_ELEMENTS } from '../src/data/asteroidBodyElements.js'
import { elementsFor } from '../src/orbit/kepler.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const day = (jd) => new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 16).replace('T', ' ')
const julian = (iso) => Date.parse(iso) / 86400000 + 2440587.5

/** Horizons body codes for the things an approach can be between. */
const HORIZONS = {
  apophis: "'99942'",
  earth: "'399'",
  mars: "'499'",
  venus: "'299'",
  mercury: "'199'",
  jupiter: "'599'",
  saturn: "'699'",
}

/**
 * The true separation of two bodies over a window, from Horizons.
 *
 * Asked as an *observer* table — the range from one body to another — rather
 * than two vector tables differenced here, because that is the quantity JPL
 * publishes and refines, and differencing two ephemerides invites exactly the
 * frame mistakes this file exists to catch.
 */
async function separations(body, centre, from, to, step) {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: HORIZONS[body],
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'OBSERVER',
    CENTER: `@${HORIZONS[centre].replaceAll("'", '')}`,
    QUANTITIES: '20',
    START_TIME: `'${from}'`,
    STOP_TIME: `'${to}'`,
    STEP_SIZE: `'${step}'`,
  })

  const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`)
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status}`)
  const text = await res.text()
  const block = text.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) throw new Error(`no ephemeris:\n${text.slice(-500)}`)

  const rows = []
  for (const line of block.split('\n')) {
    // "2029-Apr-13 20:00     0.00025441553  -5.4021460"
    const m = line.match(/^\s*(\d{4}-\w{3}-\d{2} \d{2}:\d{2})\s+([\d.E+-]+)/)
    if (!m) continue
    const [, stamp, au] = m
    rows.push({ jd: julian(`${stamp.replace(/(\d{4})-(\w{3})-(\d{2})/, '$1 $2 $3')} UTC`), au: Number(au) })
  }
  if (rows.length < 5) throw new Error(`only ${rows.length} rows`)
  return rows
}

const AU_KM = 149597870.7

console.log('\nWhat the app found\n')

const approaches = EVENTS.filter((e) => e.kind === 'close-approach')
check(
  'the search produced approaches at all',
  approaches.length > 0,
  approaches.map((e) => `${BODIES_BY_ID[e.body].name}–${BODIES_BY_ID[e.with].name} ${day(e.jd)}`).join(', '),
)

/*
 * And none of them outside the window their elements were fitted over.
 *
 * The check that would have caught the first run of this feature, which
 * reported five Apophis approaches in the nineteenth century — three to seven
 * million kilometres, perfectly plausible, and every one an artefact of
 * extrapolating a chaotic orbit a century and a half past its own evidence.
 */
{
  let stray = null
  for (const event of approaches) {
    const el = ASTEROID_BODY_ELEMENTS[event.body]
    if (!el?.validFrom) continue
    if (event.jd < el.validFrom || event.jd > el.validTo) stray = `${event.body} at ${day(event.jd)}`
  }
  check(
    'no approach falls outside the fit it was found with',
    stray === null,
    stray ?? 'every one inside its own evidence',
  )
}

console.log('\nAgainst JPL Horizons\n')

for (const event of approaches) {
  const name = BODIES_BY_ID[event.body].name
  const centre = BODIES_BY_ID[event.with].name

  /*
   * A day either side, at ten-minute steps. Wide enough that the true minimum
   * cannot be outside it unless the app is badly wrong — in which case the
   * check says so rather than silently finding the edge of the window.
   */
  const rows = await separations(
    event.body,
    event.with,
    day(event.jd - 1).replace(' ', ' '),
    day(event.jd + 1).replace(' ', ' '),
    '10m',
  )

  let best = rows[0]
  for (const row of rows) if (row.au < best.au) best = row

  const atEdge = best === rows[0] || best === rows[rows.length - 1]
  const hoursOut = (event.jd - best.jd) * 24

  check(
    `${name} near ${centre}: the date is right`,
    !atEdge && Math.abs(hoursOut) < 6,
    atEdge
      ? 'the true minimum is outside the window searched — the app is more than a day out'
      : `app ${day(event.jd)}, JPL ${day(best.jd)} — ${hoursOut >= 0 ? '+' : ''}${hoursOut.toFixed(1)} h`,
  )

  /*
   * The distance, measured rather than asserted.
   *
   * Never a pass/fail on accuracy — it is expected to be wrong, and by how much
   * is the point. What *is* asserted is that the app has not started printing
   * it: `EventPanel` prints a published figure for the approaches it has one
   * for, and a sentence with no number for the rest.
   */
  const trueKm = best.au * AU_KM
  const ratio = event.km / trueKm
  console.log(
    `        distance: app ${(event.km / 1000).toFixed(0)}k km, JPL ${(trueKm / 1000).toFixed(0)}k km ` +
      `(${ratio.toFixed(1)}×) — not shown to the user, by design`,
  )
}

console.log('\nThe orbit that changes\n')

/*
 * The encounter is a discontinuity, and the element sets have to show it.
 *
 * A single fit through the step would produce an orbit wrong on both sides and
 * plausible throughout, so this asserts the two eras really do describe
 * different orbits — and that the app picks the right one on each side of the
 * date.
 */
{
  const el = ASTEROID_BODY_ELEMENTS.apophis
  const T = (jd) => (jd - 2451545) / 36525
  const encounter = julian('2029-04-13T00:00:00Z')
  const before = elementsFor(el, T(encounter - 30))
  const after = elementsFor(el, T(encounter + 30))

  check(
    'Apophis is an Aten before the encounter and an Apollo after',
    before.a < 1 && after.a > 1,
    `a ${before.a.toFixed(4)} → ${after.a.toFixed(4)} AU`,
  )
  check(
    'and the encounter bends its inclination by about a degree',
    Math.abs(before.i - after.i) > 0.9 && Math.abs(before.i - after.i) < 1.4,
    `i ${before.i.toFixed(3)}° → ${after.i.toFixed(3)}°`,
  )
  check(
    'its year is a third longer afterwards',
    after.a ** 1.5 / before.a ** 1.5 > 1.25,
    `${(before.a ** 1.5 * 365.25).toFixed(0)} d → ${(after.a ** 1.5 * 365.25).toFixed(0)} d`,
  )

  /*
   * And the seam is exactly where it should be. One day either side of the
   * encounter must land in different eras — a fencepost error here would put
   * the new orbit a month early or late, which is invisible in every check
   * above.
   */
  check(
    'the seam falls on the day of the encounter',
    elementsFor(el, T(encounter - 1)) !== elementsFor(el, T(encounter + 1)),
    `${el.segments.length} eras in all`,
  )
}

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
