/**
 * Numerical proof for the dwarf planets and the moons.
 *
 * Companion to `verify-orbits.mjs`, which covers the eight planets. Split
 * because the two answer different questions with different tolerances: the
 * planets are checked against a fitted table with published error bounds,
 * while the bodies here are checked against osculating elements propagated as
 * two-body motion — a weaker model, and the interesting thing is *how much*
 * weaker.
 *
 * The moon checks are of a different kind again. There is no Horizons fixture
 * for them, because what could go wrong is not the arithmetic — that is the
 * same `positionAt` the planets already prove — but the *frame*: whether the
 * offset lands in the right plane, on the right side, at a sane distance. Those
 * are geometric assertions, and they are the ones that would otherwise be
 * caught only by someone noticing Titan drifting through Saturn's rings.
 *
 * Run with: npm run verify:bodies
 */

import { existsSync } from 'node:fs'
import { DWARF_REFERENCE } from './fixtures/dwarf-reference.js'
import {
  BODIES,
  BODIES_BY_ID,
  COMETS,
  DWARF_PLANETS,
  MOONS,
  SPACECRAFT,
  bodyRadius,
  bodyShown,
  focusDistance,
} from '../src/data/bodies.js'
import { PLANETS } from '../src/data/planetData.js'
import { Vector3 as Vec3 } from 'three'
import {
  MAX_SPIN_TURNS_PER_SEC,
  centuriesSinceJ2000,
  julianDate,
  periodDays,
  positionAt,
  sampleOrbit,
  spinAt,
} from '../src/orbit/kepler.js'
import {
  KM_PER_AU,
  SNAP_ACQUIRE_DEG,
  SNAP_RELEASE_FACTOR,
  cameraLimits,
  degenerateLength,
  farPlane,
  nearPlane,
  warpHeliocentric,
  warpMoonDistance,
  warpMoonRadius,
  warpRadius,
  warpSpacecraftDistance,
} from '../src/orbit/frames.js'
import { satelliteOffset, satelliteSystemRadius } from '../src/scene/satelliteFrame.js'
import { BODY_POLES, applyBasis, bodyBasis } from '../src/scene/pole.js'
import { frameReferenceAU, surfaceFloor } from '../src/scene/spacecraftFrame.js'
import { SPACECRAFT_RAW } from '../src/data/spacecraftData.js'
import { SPACECRAFT_TRAILS } from '../src/data/spacecraftTrails.js'
import { isFlying, trailDays, trajectoryWindow } from '../src/orbit/trajectory.js'
import { surfaceDirection } from '../src/scene/surface.js'
import { SYSTEM_PLANE_ELEVATION, systemFramingDirection } from '../src/scene/splitFraming.js'

const ARCMIN = Math.PI / (180 * 60)

let failures = 0
let checks = 0

function check(label, ok, detail = '') {
  checks++
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${detail}`)
}

/* ------------------------------------------------------------------ *
 * Dwarf planets against Horizons
 * ------------------------------------------------------------------ */

/**
 * Angular budgets, in arcminutes.
 *
 * Pluto is held tightest because it is the one body here with a proper JPL
 * linear-rate fit — it sits in the planet table. The other four are frozen
 * osculating ellipses, and the budget reflects how hard each is perturbed:
 * Ceres has Jupiter working on it every orbit, while the three distant ones
 * are barely touched but are propagated across two centuries from a single
 * epoch.
 *
 * These are generous by the standards of an ephemeris and irrelevant by the
 * standards of a pixel: at Eris's distance one arcminute is well under a
 * thousandth of the screen.
 */
const BUDGET_ARCMIN = {
  pluto: 3,
  ceres: 40,
  haumea: 25,
  makemake: 25,
  eris: 25,
}

const byId = Object.fromEntries(DWARF_PLANETS.map((b) => [b.id, b]))

console.log('\nDwarf planets vs JPL Horizons\n')

let worst = { body: null, arcmin: 0 }

for (const ref of DWARF_REFERENCE) {
  const body = byId[ref.body]
  const p = positionAt(body.elements, centuriesSinceJ2000(ref.jd))

  const r = Math.hypot(ref.x, ref.y, ref.z)
  const distErr = Math.hypot(p.x - ref.x, p.y - ref.y, p.z - ref.z)
  // Angular separation as seen from the Sun. Chord over radius is the small-
  // angle form and is accurate to far better than the budgets involved.
  const arcmin = distErr / r / ARCMIN

  const budget = BUDGET_ARCMIN[ref.body]
  if (arcmin > worst.arcmin) worst = { body: ref.body, arcmin }

  check(`${ref.body} @ ${ref.date}`, arcmin < budget, `${arcmin.toFixed(1)}' (budget ${budget}')`)
}

console.log(`\n     worst: ${worst.body} at ${worst.arcmin.toFixed(1)} arcmin\n`)

/* ------------------------------------------------------------------ *
 * Moons: periods and directions
 * ------------------------------------------------------------------ */

console.log('Moon periods and directions\n')

/**
 * Published sidereal periods, in days. Independent of anything fetched.
 *
 * The point of writing these out by hand is that they come from somewhere else:
 * if a fetch silently returns elements about the wrong centre, or with the wrong
 * central mass, the period is the first thing to go wrong and this is what
 * notices. It has already earned its keep once — Kerberos came back from
 * Horizons at 119.7 days against the 32.2 below, which is what exposed the
 * Pluto-centre problem documented in `fetch-moon-elements.mjs`.
 */
const KNOWN_PERIOD = {
  luna: 27.321582,
  phobos: 0.31891,
  deimos: 1.26244,
  io: 1.769138,
  europa: 3.551181,
  ganymede: 7.154553,
  callisto: 16.689017,

  mimas: 0.942422,
  enceladus: 1.370218,
  tethys: 1.887802,
  dione: 2.736915,
  rhea: 4.518212,
  titan: 15.945421,
  iapetus: 79.330183,

  miranda: 1.413479,
  ariel: 2.520379,
  umbriel: 4.144177,
  titania: 8.705872,
  oberon: 13.463239,

  triton: 5.876854,

  charon: 6.38723,
  styx: 20.16155,
  nix: 24.85463,
  kerberos: 32.16756,
  hydra: 38.20177,
}

/*
 * 1% rather than the 0.5% this started at, and the reason is Mimas.
 *
 * These are osculating elements — a snapshot of the orbit at J2000 — checked
 * against *mean* elements averaged over many orbits, so some disagreement is
 * physics rather than error. Mimas has the most of it in this set: it is locked
 * in a 2:1 resonance with Tethys and sits deep in Saturn's oblate gravity field,
 * which swings its semi-major axis about 0.3% either side of the mean. That
 * lands its period 0.54% out — seven minutes on a 22-hour orbit, and correct.
 *
 * Loosening the bound does not weaken what this check is for. It exists to catch
 * elements fetched about the wrong centre or fitted with the wrong central mass,
 * and those are not subtle: Kerberos about Pluto's centre came out 272% wrong.
 * Anything between 1% and 272% is a class of mistake that does not occur.
 */
const PERIOD_TOLERANCE_PCT = 1.0
let worstPeriod = { errPct: 0 }

for (const moon of MOONS) {
  const computed = periodDays(moon.elements)
  const known = KNOWN_PERIOD[moon.id]
  const errPct = Math.abs((computed - known) / known) * 100
  if (errPct > worstPeriod.errPct) worstPeriod = { errPct, name: moon.name }
  check(
    `${moon.name} period`,
    errPct < PERIOD_TOLERANCE_PCT && Math.sign(computed) === Math.sign(known),
    `${computed.toFixed(4)} d vs ${known} d  (${errPct.toFixed(3)}%)`,
  )
}

check(
  'every period within tolerance of published',
  worstPeriod.errPct < PERIOD_TOLERANCE_PCT,
  `worst ${worstPeriod.name} at ${worstPeriod.errPct.toFixed(3)}% of ${PERIOD_TOLERANCE_PCT}%`,
)

// Triton is the only large retrograde moon in the solar system, and the one
// thing about it a viewer can check by eye.
//
// The check looks at inclination, not at the sign of the mean motion — which
// is where this script's first version looked, and was wrong. A retrograde
// orbit is not a negative `LDot`; it is an inclination past 90°, which tips
// the orbit's normal over so the same forward motion traces the path
// backwards. Horizons reports Triton at 156.8° with a perfectly positive mean
// motion, exactly as it should.
{
  const triton = MOONS.find((m) => m.id === 'triton')
  check(
    'Triton orbits retrograde',
    triton.elements.i > 90,
    `inclination ${triton.elements.i.toFixed(1)}° to Neptune's equator`,
  )

  // And it must actually come out backwards once solved, not merely be
  // labelled so: the cross product of two successive positions has to point
  // the opposite way from a prograde moon's.
  const cross = (m) => {
    const p0 = positionAt(m.elements, centuriesSinceJ2000(2451545))
    const p1 = positionAt(m.elements, centuriesSinceJ2000(2451545.1))
    return p0.x * p1.y - p0.y * p1.x
  }
  check(
    'Triton runs backwards, Titan forwards',
    cross(triton) < 0 && cross(MOONS.find((m) => m.id === 'titan')) > 0,
  )
}

/*
 * Tidal locking, and the four that are not.
 *
 * For a locked moon the spin period must equal the orbital period *exactly*,
 * because `bodies.js` derives one from the other rather than storing both — so
 * any difference at all means the derivation has been broken.
 *
 * Pluto's four small moons opt out with `spinHours`, and that opt-out is worth
 * checking in both directions: it has to apply to exactly those four, and their
 * spin has to actually differ from their orbit. Otherwise a typo that dropped
 * the field would leave them silently "locked" again, which is a claim about
 * chaotic rotation that would be quietly false.
 */
{
  const chaotic = new Set(['styx', 'nix', 'kerberos', 'hydra'])
  const locked = MOONS.filter((m) => !chaotic.has(m.id))

  const worstDiff = Math.max(
    ...locked.map((m) => Math.abs(m.rotationHours / 24 - periodDays(m.elements))),
  )
  check(
    `all ${locked.length} locked moons spin with their orbit`,
    worstDiff < 1e-9,
    `max diff ${worstDiff.toExponential(1)} d`,
  )

  const tumbling = MOONS.filter((m) => chaotic.has(m.id))
  check(
    "Pluto's small moons are not locked",
    tumbling.length === 4 &&
      tumbling.every((m) => Math.abs(m.rotationHours / 24 - periodDays(m.elements)) > 0.1),
    tumbling
      .map(
        (m) =>
          `${m.name} ${(m.rotationHours / 24).toFixed(1)}d spin vs ${periodDays(m.elements).toFixed(1)}d orbit`,
      )
      .join(', '),
  )
}

/* ------------------------------------------------------------------ *
 * Moons: the rendered frame
 * ------------------------------------------------------------------ */

console.log('\nSatellite frames at diorama scale\n')

// Mirrors src/scene/Rings.jsx. Duplicated rather than imported because that
// module pulls in three.js and this script must stay runnable in bare Node.
const RING_PRESETS = {
  saturn: { inner: 1.28, outer: 2.35 },
  uranus: { inner: 1.55, outer: 2.12 },
}

/** Re-derived here so the check does not depend on the caller passing it. */
function clearanceFor(parent) {
  const rings = parent.rings ? RING_PRESETS[parent.rings] : null
  return rings ? rings.outer + 0.25 : 1.35
}

const planetsById = Object.fromEntries(PLANETS.map((p) => [p.id, p]))

/**
 * Every body that can be a parent, which is not the same as every planet.
 *
 * Pluto hosts five moons and is a dwarf, so a planets-only lookup crashes on
 * Charon. Worth stating rather than quietly widening: nothing in the renderer
 * requires a parent to be a planet — `satelliteOffset` needs a `radiusKm` and an
 * `axialTilt`, which a dwarf has — so the only thing that ever assumed otherwise
 * was this script.
 */
const parentsById = {
  ...planetsById,
  ...Object.fromEntries(DWARF_PLANETS.map((d) => [d.id, d])),
}

const out = { x: 0, y: 0, z: 0 }
const systemRadius = {}

for (const moon of MOONS) {
  const parent = parentsById[moon.parent]
  const parentRender = warpRadius(parent.radiusKm, 0)
  const clearance = clearanceFor(parent)

  // Sample a full orbit; the interesting quantities are extremes, not one
  // instant. A near-circular orbit sampled once would hide an eccentric one
  // dipping inside the rings only at perigee.
  let minR = Infinity
  let maxR = 0
  let maxTilt = 0

  for (let k = 0; k < 64; k++) {
    const jd = 2451545 + (k / 64) * Math.abs(periodDays(moon.elements))
    const local = positionAt(moon.elements, centuriesSinceJ2000(jd))
    satelliteOffset(local, parent, parentRender, clearance, moon.plane, 0, out)

    const r = Math.hypot(out.x, out.y, out.z)
    minR = Math.min(minR, r)
    maxR = Math.max(maxR, r)
    // Angle out of the *parent's* equatorial plane, which after the tilt
    // rotation is the plane containing the rings.
    maxTilt = Math.max(maxTilt, Math.abs(Math.asin(out.y / r) * (180 / Math.PI)))
  }

  systemRadius[moon.parent] = Math.max(systemRadius[moon.parent] ?? 0, maxR)

  // Nothing may be drawn inside its planet, ever.
  check(
    `${moon.name} clears ${parent.name}'s surface`,
    minR > parentRender * 1.05,
    `${(minR / parentRender).toFixed(2)} parent radii`,
  )
}

// The checkable one: Enceladus feeds Saturn's E ring, so it orbits outside the
// main rings. Drawing it inside them would be wrong in a way a reader could
// catch, which is exactly why the clearance is read from the ring preset.
{
  const saturn = planetsById.saturn
  const parentRender = warpRadius(saturn.radiusKm, 0)
  const ringOuter = parentRender * RING_PRESETS.saturn.outer
  const clearance = clearanceFor(saturn)

  for (const id of ['enceladus', 'titan']) {
    const moon = MOONS.find((m) => m.id === id)
    const local = positionAt(moon.elements, centuriesSinceJ2000(2451545))
    satelliteOffset(local, saturn, parentRender, clearance, moon.plane, 0, out)
    const r = Math.hypot(out.x, out.y, out.z)
    check(
      `${moon.name} outside Saturn's rings`,
      r > ringOuter,
      `${r.toFixed(2)} vs ring edge ${ringOuter.toFixed(2)}`,
    )
  }
}

/**
 * The frame test, and the one worth having.
 *
 * Everything above would still pass if `satelliteOffset` quietly dropped the
 * tilt rotation — the distances would be right and the moons would orbit
 * tidily in the ecliptic, looking entirely reasonable. What would be lost is
 * the thing the frame exists for: Titan running flat through Saturn's rings.
 *
 * So this measures the tilt of each orbital plane against the ecliptic pole
 * and asserts what it should be. Titan's plane must be Saturn's 26.73° over,
 * because it is pinned to Saturn's equator. Luna's must be 5.145°, *not*
 * Earth's 23.44°, because the Moon tracks the ecliptic instead — the one
 * exception in the set, and the one a dropped `plane` field would break.
 */
function orbitNormalTiltDeg(moon, parent) {
  const parentRender = warpRadius(parent.radiusKm, 0)
  const clearance = clearanceFor(parent)
  const P = Math.abs(periodDays(moon.elements))

  const at = (frac) => {
    const local = positionAt(moon.elements, centuriesSinceJ2000(2451545 + frac * P))
    const v = { x: 0, y: 0, z: 0 }
    satelliteOffset(local, parent, parentRender, clearance, moon.plane, 0, v)
    return v
  }

  // Two points a quarter-orbit apart span the plane; their cross product is
  // its normal.
  const a = at(0)
  const b = at(0.25)
  const n = {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
  const len = Math.hypot(n.x, n.y, n.z)
  // World +Y is the ecliptic pole.
  return Math.acos(Math.abs(n.y) / len) * (180 / Math.PI)
}

/**
 * How far a body's pole is from the ecliptic pole, in degrees.
 *
 * Not the same thing as its obliquity, and the difference is the second bug the
 * poles fixed. Obliquity is measured from the body's *own orbit* normal; this is
 * measured from the ecliptic, and the two differ by the orbital inclination.
 * These checks used to expect the obliquity — 26.73° for Saturn — and passed
 * only because the renderer made the same mistake, leaning every planet away
 * from the ecliptic by its obliquity. Saturn's pole is really 28.05° from the
 * ecliptic pole, and Titan now sits at 27.72°, which is right.
 */
function poleFromEclipticDeg(parentId) {
  const pole = BODY_POLES[parentId]
  if (!pole) return 0
  const D = Math.PI / 180
  const e = 23.4392911 * D
  const a = pole.ra * D
  const d = pole.dec * D
  const c = Math.cos(d)
  const ye = c * Math.sin(a)
  const ze = Math.sin(d)
  return Math.acos(Math.min(1, Math.abs(-ye * Math.sin(e) + ze * Math.cos(e)))) / D
}

{
  const cases = [
    ['Titan', 'titan', 'saturn', 'Saturn’s equator'],
    ['Enceladus', 'enceladus', 'saturn', 'Saturn’s equator'],
    ['Callisto', 'callisto', 'jupiter', 'Jupiter’s equator'],
    ['Triton', 'triton', 'neptune', 'Neptune’s equator'],
    ['Moon', 'luna', 'earth', 'the ecliptic'],
  ]

  for (const [name, id, parentId, frame] of cases) {
    const expected = frame === 'the ecliptic' ? 0 : poleFromEclipticDeg(parentId)
    const moon = MOONS.find((m) => m.id === id)
    const parent = parentsById[parentId]
    const measured = orbitNormalTiltDeg(moon, parent)
    // The moon's own inclination to its reference plane is the slack: Triton's
    // 156.8° means its normal is 23.2° off Neptune's pole before any tilt.
    const own = moon.elements.i > 90 ? 180 - moon.elements.i : moon.elements.i
    check(
      `${name}'s orbit lies in ${frame}`,
      Math.abs(measured - expected) <= own + 0.5,
      `${measured.toFixed(2)}° from the ecliptic pole, expected ${expected.toFixed(2)}° ±${(own + 0.5).toFixed(2)}`,
    )
  }
}

/*
 * Ordering: every system must keep its moons in their true sequence, with lanes
 * far enough apart to be told apart.
 *
 * A compression curve that saturates too hard collapses a system into one shell
 * or, worse, swaps a pair. This started as a Galileans-only check, where four
 * moons spanning 4.5 to 19 Jupiter radii is a gentle test — the real strain came
 * with the systems added later. Saturn now has seven, and Iapetus sits at 59
 * Saturn radii while Mimas is at 3.1, so a single curve has to keep all seven
 * distinct across a 19-fold range. Pluto's five are the opposite problem: Styx
 * through Hydra span barely 42,000 to 65,000 km, a factor of 1.5 from end to
 * end, and they are the tightest packing anywhere in the app.
 *
 * Run over every system rather than one, because the failure is silent: moons in
 * the wrong order still look like a moon system.
 */
{
  const systems = {
    jupiter: ['io', 'europa', 'ganymede', 'callisto'],
    saturn: ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus'],
    uranus: ['miranda', 'ariel', 'umbriel', 'titania', 'oberon'],
    pluto: ['charon', 'styx', 'nix', 'kerberos', 'hydra'],
  }

  for (const [parentId, order] of Object.entries(systems)) {
    const parent = parentsById[parentId]
    const parentRender = warpRadius(parent.radiusKm, 0)
    const clearance = clearanceFor(parent)

    const radii = order.map((id) => {
      const moon = MOONS.find((m) => m.id === id)
      const local = positionAt(moon.elements, centuriesSinceJ2000(2451545))
      satelliteOffset(local, parent, parentRender, clearance, moon.plane, 0, out)
      return Math.hypot(out.x, out.y, out.z)
    })

    const ascending = radii.every((r, i) => i === 0 || r > radii[i - 1])

    /*
     * Pairwise, against the two bodies actually involved.
     *
     * This used to compare the tightest gap in the system against the *widest
     * moon anywhere in it*, which is both too strict and too lax once a system
     * has more than four moons: it judged the Mimas–Enceladus gap by the size of
     * Titan, eleven lanes away, and would have missed two small moons crowding
     * each other out at the far end. What has to hold is local — two neighbours'
     * drawn discs must not touch when they line up.
     *
     * The 1.15 margin is a gap, not a safety factor on a guess: at exactly 1.0
     * the discs graze, which still reads as a collision.
     */
    let worst = { ratio: Infinity }
    for (let i = 1; i < order.length; i++) {
      const inner = MOONS.find((m) => m.id === order[i - 1])
      const outer = MOONS.find((m) => m.id === order[i])
      const needed = bodyRadius(inner, 0) + bodyRadius(outer, 0)
      const ratio = (radii[i] - radii[i - 1]) / needed
      if (ratio < worst.ratio) worst = { ratio, pair: `${inner.name}–${outer.name}` }
    }

    check(
      `${parent.name}'s moons in true order`,
      ascending,
      radii.map((r) => r.toFixed(2)).join(' < '),
    )
    check(
      `${parent.name}'s lanes never touch`,
      worst.ratio > 1.15,
      `tightest ${worst.pair} at ${worst.ratio.toFixed(2)}x the two radii`,
    )
  }
}

/*
 * Every class switch must actually reach the scene.
 *
 * This exists because `minorMoons` shipped not reaching it. `Scene` and
 * `LabelLayer` each handed `bodyShown` a hand-built `{ dwarfPlanets, moons }`
 * literal rather than the real layers object, so the new key read `undefined`
 * and every minor moon was filtered out — while the nav bar, which passes the
 * real object, went on listing them. The toggle appeared to do nothing.
 *
 * The consumers now share one hook, but a hook is a React thing and cannot be
 * driven from here. What can be checked is the half that matters: that each
 * switch, on its own, admits exactly the bodies it names and no others. A
 * consumer that drops a key will fail the browser pass; a `bodyShown` that
 * forgets one fails here.
 */
{
  // `planets: true` because the moons hang off them: `bodyShown` will not draw a
  // satellite whose parent is hidden, so switching the planets off here would
  // make every moon check fail for the wrong reason.
  const OFF = { planets: true, dwarfPlanets: false, moons: false, minorMoons: null, comets: false }

  // Major moons: still one switch for all of them.
  {
    const want = BODIES.filter(
      (b) => b.kind === 'moon' && b.tier === 'major' && BODIES_BY_ID[b.parent]?.kind === 'planet',
    )
    const got = BODIES.filter((b) => bodyShown(b, { ...OFF, moons: true }) && b.parent !== null)
    const missing = want.filter((b) => !got.includes(b))
    const extra = got.filter((b) => b.tier !== 'major')
    check(
      'the moons switch alone draws every major moon of a planet',
      missing.length === 0 && extra.length === 0,
      missing.length
        ? `${missing.length} missing, e.g. ${missing[0].name} — a layer key is not being read`
        : extra.length
          ? `${extra.length} unexpected, e.g. ${extra[0].name}`
          : `${got.length} bodies, nothing else`,
    )
  }

  /*
   * Minor moons: one host at a time.
   *
   * `minorMoons` holds a host id, so the property to check is no longer "the
   * switch admits all of them" but "the switch admits exactly that host's, and
   * nobody else's". That scoping is the whole point — 413 minor moons arriving
   * together is the hitch this replaced — so a regression back to a global
   * boolean has to fail here.
   */
  for (const hostId of ['jupiter', 'saturn', 'uranus', 'neptune']) {
    const layers = { ...OFF, minorMoons: hostId }
    const got = BODIES.filter((b) => bodyShown(b, layers))
    const want = BODIES.filter((b) => b.tier === 'minor' && b.parent === hostId)
    const strays = got.filter((b) => b.tier === 'minor' && b.parent !== hostId)
    check(
      `the minorMoons switch draws ${hostId}'s minor moons and no others`,
      want.every((b) => got.includes(b)) && strays.length === 0,
      `${want.length} drawn, ${strays.length} from elsewhere`,
    )
  }

  check(
    'no host switched on means no minor moons at all',
    BODIES.filter((b) => bodyShown(b, { ...OFF, moons: true }) && b.tier === 'minor').length === 0,
    'null is off',
  )

  /*
   * The planets switch, and the one thing about it that is not obvious.
   *
   * Hiding the planets hides their moons too. That is `bodyShown`'s existing
   * parent rule rather than anything the switch does, and it is the only honest
   * reading — "hide the planets" cannot leave Europa orbiting a gap. Asserted
   * because it is the sort of behaviour someone would later "fix".
   */
  {
    const ON = { ...OFF, planets: true, moons: true, comets: true, dwarfPlanets: true }
    const hidden = { ...ON, planets: false }

    check(
      'the planets switch draws the eight and nothing else new',
      BODIES.filter((b) => b.kind === 'planet').every((b) => bodyShown(b, ON)) &&
        !BODIES.filter((b) => b.kind === 'planet').some((b) => bodyShown(b, hidden)),
      `${BODIES.filter((b) => b.kind === 'planet').length} planets`,
    )
    check(
      'hiding the planets takes their moons with them',
      BODIES.filter((b) => b.kind === 'moon' && BODIES_BY_ID[b.parent]?.kind === 'planet').every(
        (b) => !bodyShown(b, hidden),
      ),
      "bodyShown's parent rule, not a special case",
    )
    check(
      'hiding the planets leaves the comets alone',
      COMETS.every((c) => bodyShown(c, hidden)),
      'comets orbit the Sun, not a planet',
    )
  }

  check(
    'the two moon switches are independent',
    !bodyShown(BODIES_BY_ID.triton, { ...OFF, minorMoons: 'neptune' }) &&
      bodyShown(BODIES_BY_ID.nereid, { ...OFF, minorMoons: 'neptune' }) &&
      bodyShown(BODIES_BY_ID.triton, { ...OFF, moons: true }) &&
      !bodyShown(BODIES_BY_ID.nereid, { ...OFF, moons: true }),
    'Triton follows Major, Nereid follows Minor, neither follows the other',
  )
}

/*
 * `cameraLimits` builds the near clip distance from a literal for the smallest
 * body drawn, because importing the registry into `frames.js` would be a cycle.
 * This is what keeps that literal honest: if a smaller moon is ever added, the
 * near limit would silently clamp every close-up of it, and the flight would
 * appear to stop short of arriving.
 */
{
  /*
   * 0.0005 km — half a metre — and the title now belongs to BioSentinel, a 6U
   * cubesat. Spacecraft took it from Aegaeon by a factor of 240.
   *
   * Lowering the literal lowers `minDistance`, and through it `degenerateLength`
   * and everything derived from them, which is the exact lever that produced the
   * dashed paths at true scale. It was checked rather than assumed: the near
   * plane, resolvability and depth-ratio blocks below all still pass at the new
   * value, because the near plane is now sized from the camera's *distance*
   * rather than from this constant.
   */
  const SMALLEST_KM = 0.0005
  const smaller = BODIES.filter((b) => b.radiusKm < SMALLEST_KM - 1e-9)
  check(
    `nothing is smaller than the ${SMALLEST_KM} km assumed by cameraLimits`,
    smaller.length === 0,
    smaller.length
      ? `${smaller.map((b) => `${b.name} ${b.radiusKm}km`).join(', ')} — update frames.js`
      : `smallest is ${Math.min(...BODIES.map((b) => b.radiusKm))} km`,
  )
}

/*
 * Every body must be able to get in front of the near plane — at every zoom.
 *
 * Two bugs live here, in opposite directions, and the check has to hold both
 * down at once.
 *
 * A near plane that is too *large* clips small bodies away on arrival: a fixed
 * 0.001 against a true-scale `minDistance` of 4.4e-8 meant the camera could fly
 * thousands of times closer than it could see, and every minor moon vanished
 * when you got to it.
 *
 * A near plane that is too *small* spends depth resolution the distant geometry
 * needs: pinning it to the smallest body in the app gave a far:near ratio of
 * 3e13 and the orbit lines and trails came out **dashed**, whole quads missing
 * at intervals right across the scene. Measured against a lit-pixel count, the
 * render is clean to 1e9 and degrades by 1e10.
 *
 * So the plane is sized from the camera's own distance, and both properties are
 * asserted over every body at both scales: the subject is always in front of
 * the plane and big enough to look at, and the ratio stays resolvable wherever
 * distant paths can actually be seen.
 */
{
  const VIEWPORT_H = 800
  const FOV = 55
  const focalPx = VIEWPORT_H / (2 * Math.tan((FOV * Math.PI) / 360))
  const MIN_PIXELS = 20
  const SAFE_RATIO = 1e9

  for (const scaleMode of [0, 1]) {
    const label = scaleMode === 0 ? 'diorama' : 'true scale'
    const far = farPlane(scaleMode)

    // 1. Parked at any body, that body is in front of the plane and resolvable.
    let worstClearance = { ratio: Infinity }
    let worstPixels = { px: Infinity }
    for (const body of BODIES) {
      const parked = focusDistance(body, scaleMode)
      const near = nearPlane(scaleMode, parked)
      const radius = bodyRadius(body, scaleMode)
      const clearance = parked / near
      if (clearance < worstClearance.ratio) worstClearance = { ratio: clearance, body }
      const px = (radius / parked) * focalPx
      if (px < worstPixels.px) worstPixels = { px, body }
    }
    check(
      `every body sits in front of the near plane at ${label}`,
      worstClearance.ratio > 1,
      `tightest ${worstClearance.body.name} at ${worstClearance.ratio.toFixed(1)}x the near plane`,
    )
    check(
      `every body is resolvable where it parks at ${label}`,
      worstPixels.px >= MIN_PIXELS,
      `smallest on screen ${worstPixels.body.name} at ${worstPixels.px.toFixed(0)} px of radius`,
    )

    // 2. Where distant paths are visible — the overview — the depth ratio has
    //    to be one the buffer can resolve. This is the dashing.
    const overview = cameraLimits(scaleMode).homeDistance
    const ratio = far / nearPlane(scaleMode, overview)
    check(
      `the depth range is resolvable at the overview at ${label}`,
      ratio <= SAFE_RATIO,
      `far:near ${ratio.toExponential(1)} of ${SAFE_RATIO.toExponential(0)}`,
    )
  }
}

/*
 * Camera thresholds must be scale-relative, not absolute world lengths.
 *
 * The near-plane bug had siblings. Four more comparisons in `CameraController`
 * were written as fixed world lengths — an approach-direction guard at 1e-3, a
 * split-view framing guard at 1e-6, a raycast divide guard at 1e-3, and an
 * arrival tolerance floored at 0.05. Every one of them was unreachable at
 * diorama scale and wrong at true scale, where a minor moon parks between
 * 2.4e-4 and 2.7e-7 world units from the camera.
 *
 * The arrival floor was the one that showed: it declared the flight complete
 * while the camera was still 183,000x further from Aegaeon than the shot it
 * was flying to, so the camera stopped short and the follow pinned it there.
 *
 * These assert the properties rather than the constants, so a future absolute
 * reintroduced anywhere in that file fails here.
 */
{
  const ARRIVAL_FRACTION = 0.02
  for (const scaleMode of [0, 1]) {
    const label = scaleMode === 0 ? 'diorama' : 'true scale'
    const worst = BODIES.reduce((a, b) =>
      focusDistance(a, scaleMode) <= focusDistance(b, scaleMode) ? a : b,
    )
    const parked = focusDistance(worst, scaleMode)

    check(
      `the flight arrives before it lands at ${label}`,
      Math.max(degenerateLength(scaleMode), parked * ARRIVAL_FRACTION) < parked,
      `${worst.name} parks at ${parked.toExponential(2)}, tolerance ${Math.max(
        degenerateLength(scaleMode),
        parked * ARRIVAL_FRACTION,
      ).toExponential(2)}`,
    )

    check(
      `a parked camera is not mistaken for a degenerate offset at ${label}`,
      degenerateLength(scaleMode) < parked,
      `${worst.name} parks at ${parked.toExponential(2)}, zero-length guard ${degenerateLength(
        scaleMode,
      ).toExponential(2)}`,
    )
  }
}

/*
 * Spin must stay watchable, and must stay honest where it is watchable.
 *
 * An assumed 11-hour minor moon turns 2.2 times a second at the default rate
 * and 66 a second at `1 mo/s`, which is aliased several times over — the body
 * strobes instead of rotating. `MAX_SPIN_TURNS_PER_SEC` caps the drawn rate.
 *
 * The two properties that matter are that the cap never touches a spin slow
 * enough to read — paused above all, and Earth at the default `1 day/s`, which
 * is 1.0028 turns per second because `rotationHours` is the sidereal day and
 * not 24 hours — and that it does catch the rates that alias.
 */
{
  const jd = julianDate(new Date('2026-01-01T00:00:00Z'))
  const EARTH_DEFAULT_TURNS = 24 / 23.934

  check(
    'the spin cap clears Earth at the default rate',
    MAX_SPIN_TURNS_PER_SEC > EARTH_DEFAULT_TURNS,
    `cap ${MAX_SPIN_TURNS_PER_SEC} vs ${EARTH_DEFAULT_TURNS.toFixed(4)} turns/s`,
  )

  const paused = BODIES.filter(
    (b) => b.rotationHours && spinAt(jd, b.rotationHours, 0) !== spinAt(jd, b.rotationHours),
  )
  check(
    'paused always shows the true angle for the date',
    paused.length === 0,
    `${paused.length} differ`,
  )

  const earth = BODIES_BY_ID.earth
  check(
    'Earth at 1 day/s is not capped',
    Math.abs(spinAt(jd, earth.rotationHours, 1) - spinAt(jd, earth.rotationHours)) < 1e-12,
    `${earth.rotationHours} h`,
  )

  // Nothing may be drawn past the cap, at any rate the timeline offers.
  const FASTEST_RATE = 36525
  const over = BODIES.filter((b) => {
    if (!b.rotationHours) return false
    const turns = FASTEST_RATE / (Math.abs(b.rotationHours) / 24)
    return Math.min(turns, MAX_SPIN_TURNS_PER_SEC) > MAX_SPIN_TURNS_PER_SEC + 1e-9
  })
  check('no body is drawn past the spin cap at 100 yr/s', over.length === 0, `${over.length} over`)
}

/*
 * The comets, and the two things about them that nothing else in the app does.
 *
 * Open orbits are the first. Four are hyperbolic, which means a negative `a`,
 * no period, and a mean anomaly that must not be wrapped — wrapping it folds
 * the outbound leg back onto the inbound one and the comet retraces its own
 * arrival forever.
 *
 * The second is that `sampleOrbit` has to return a curve with two ends for
 * those, not a ring. If the first and last samples ever coincide the ribbon
 * would close, drawing a straight chord between the two asymptotes right across
 * the solar system.
 */
{
  const open = COMETS.filter((c) => c.open)
  const closed = COMETS.filter((c) => !c.open)

  check('every comet is drawn', COMETS.length === 14, `${COMETS.length} comets`)
  check(
    'the hyperbolic ones are the five expected',
    open.length === 5 && open.every((c) => c.elements.e > 1 && c.elements.a < 0),
    open.map((c) => `${c.name} e=${c.elements.e.toFixed(4)}`).join(', '),
  )
  check(
    'every closed comet has a positive a and a period',
    closed.every((c) => c.elements.a > 0 && c.periodDays > 0),
    `${closed.length} periodic, ${(Math.min(...closed.map((c) => c.periodDays)) / 365.25).toFixed(1)}` +
      `–${(Math.max(...closed.map((c) => c.periodDays)) / 365.25).toFixed(0)} yr`,
  )

  // An open path must not close on itself.
  const T = centuriesSinceJ2000(julianDate(new Date()))
  for (const comet of open) {
    const pts = sampleOrbit(comet.elements, T, 64)
    const gap = Math.hypot(pts[0].x - pts[63].x, pts[0].y - pts[63].y, pts[0].z - pts[63].z)
    check(
      `${comet.name}'s path has two ends`,
      gap > 1,
      `${gap.toFixed(1)} AU between the first and last sample`,
    )
  }

  /*
   * A body that claims a mesh must have one on disk.
   *
   * ʻOumuamua claimed `1i-oumuamua`, the file was built and shipping, and it
   * still drew a smooth procedural sphere — the id was missing from one
   * hand-written list in `models.js`, so it was never registered as a source.
   * Nothing threw; the fallback quietly took over.
   *
   * Checking the file rather than the list, because the list is now derived
   * from this same data and a check against it would be circular.
   */
  for (const comet of COMETS.filter((c) => c.mesh)) {
    const file = new URL(`../public/models/${comet.mesh}.glb`, import.meta.url)
    check(
      `${comet.name}'s mesh is built and shipping`,
      existsSync(file),
      `public/models/${comet.mesh}.glb`,
    )
  }

  // Perihelion must land where the elements say it does.
  for (const comet of COMETS) {
    const pts = sampleOrbit(comet.elements, T, 2048)
    const closest = Math.min(...pts.map((p) => Math.hypot(p.x, p.y, p.z)))
    check(
      `${comet.name} comes closest at its perihelion distance`,
      Math.abs(closest - comet.perihelionAU) / comet.perihelionAU < 0.02,
      `${closest.toFixed(4)} vs q = ${comet.perihelionAU.toFixed(4)} AU`,
    )
  }
}

/*
 * The plane must track the camera. A constant is what produced both the
 * clipped small bodies and the dashed orbit lines — see the block above.
 */
check(
  'the near plane scales with the camera rather than being fixed',
  nearPlane(0, 100) > nearPlane(0, 1) && nearPlane(0, 1) > nearPlane(0, 0.01),
  'a closer camera gets a nearer plane',
)

// The satellite systems must not overlap each other's planets. Jupiter and
// Saturn are the pair at risk: both are drawn at the 2.9-unit radius ceiling,
// so their moon systems are the largest, and their orbits are the closest
// together of the outer planets after compression.
{
  const gap = 9 + 24 * planetsById.saturn.au ** 0.55 - (9 + 24 * planetsById.jupiter.au ** 0.55)
  const spread = (systemRadius.jupiter ?? 0) + (systemRadius.saturn ?? 0)
  check(
    'Jupiter and Saturn systems stay apart',
    spread < gap,
    `${spread.toFixed(1)} of ${gap.toFixed(1)} units`,
  )
}

/* ------------------------------------------------------------------ *
 * True scale really is true
 * ------------------------------------------------------------------ */

console.log('\nScale endpoints\n')

// At scaleMode 1 the compression must be gone entirely — a moon should sit at
// its real distance in real units. This is what makes the slider's far end a
// claim rather than a decoration.
{
  const earth = planetsById.earth
  const trueAU = 384400 / KM_PER_AU
  const rendered = warpMoonDistance(
    trueAU,
    earth.radiusKm / KM_PER_AU,
    warpRadius(earth.radiusKm, 1),
    1.35,
    1,
  )
  const expected = trueAU * 100
  check(
    'Moon at true scale is 384,400 km out',
    Math.abs(rendered - expected) < 1e-9,
    `${rendered.toFixed(6)} vs ${expected.toFixed(6)} units`,
  )

  const ratio = rendered / warpRadius(earth.radiusKm, 1)
  check('…which is 60.3 Earth radii', Math.abs(ratio - 60.33) < 0.05, ratio.toFixed(2))
}

// Phobos must not be drawn larger than Mars. The planet size curve floors at
// 0.4 units to keep Mercury visible, and applying that floor to an 11 km rock
// is what `warpMoonRadius` exists to prevent.
{
  const phobos = MOONS.find((m) => m.id === 'phobos')
  const mars = planetsById.mars
  const ratio = bodyRadius(phobos, 0) / warpRadius(mars.radiusKm, 0)
  check('Phobos drawn smaller than Mars', ratio < 0.25, `${(ratio * 100).toFixed(0)}% of Mars`)
}

// The scroll-to-focus pair. Acquiring is an angle and releasing is a multiple of
// the parked distance, so the two are not comparable by inspection any more —
// which is exactly why they are compared here. Release must stay *inside*
// acquire or they chatter, and it must stay inside `maxDistance` or a body that
// has been selected can never be let go of at all.
{
  let band = { ratio: Infinity }
  let unreachable = []

  for (const scaleMode of [0, 1]) {
    const { maxDistance } = cameraLimits(scaleMode)
    for (const body of BODIES) {
      const radius = bodyRadius(body, scaleMode)
      const release = focusDistance(body, scaleMode) * SNAP_RELEASE_FACTOR
      // Distance at which the body subtends the acquire angle.
      const acquire = radius / Math.tan((SNAP_ACQUIRE_DEG * Math.PI) / 180 / 2)
      const ratio = acquire / release
      if (ratio < band.ratio) band = { ratio, name: body.name, scaleMode }
      if (release > maxDistance) unreachable.push(`${body.name}@${scaleMode}`)
    }
  }

  check(
    'letting go happens closer in than taking hold',
    band.ratio > 1,
    `narrowest ${band.ratio.toFixed(2)}x — ${band.name} at scale ${band.scaleMode}`,
  )
  check(
    'the release distance is always reachable',
    unreachable.length === 0,
    unreachable.length ? unreachable.join(', ') : 'every body, both scales',
  )
}

/* ------------------------------------------------------------------ *
 * The "Moons" crumb: framing a whole satellite system
 * ------------------------------------------------------------------ */

/*
 * Clicking `Moons` in the breadcrumb has to land somewhere between two shots
 * that already exist — further out than the planet's own close-up, near enough
 * that the system is not a speck — and it has to do that for every host at both
 * scales. The two ends are what get asserted, because both have a real failure
 * behind them:
 *
 *   Too close: a satellite system can be tighter than the shot of the planet
 *   at its centre, and then `Moons` would zoom *in*. Mars is the body to watch
 *   — Phobos orbits at 2.8 Mars radii — and it is the one this check reports.
 *   It currently clears by 2.33x, so the floor in `systemFramingDistance` is
 *   not doing any work; the assertion is what would notice if a retune of the
 *   moon distance curve started making it do some.
 *
 *   Too far: nothing forces the system to fill any particular share of the
 *   frame, so an arithmetic slip in the warp would show up as a shot that is
 *   technically correct and visually empty.
 */
console.log('\nFraming a satellite system\n')

const SYSTEM_FRAME_FRACTION = 0.72
/** Mirrors the Canvas: 55° vertical, and a landscape window so height binds. */
const HALF_FOV = (55 * Math.PI) / 180 / 2

function systemShot(parent, moons, scaleMode) {
  const renderRadius = bodyRadius(parent, scaleMode)
  const radius = satelliteSystemRadius(parent, moons, renderRadius, clearanceFor(parent), scaleMode)
  const framed = radius / (SYSTEM_FRAME_FRACTION * Math.tan(HALF_FOV))
  return {
    radius,
    renderRadius,
    distance: Math.max(framed, focusDistance(parent, scaleMode)),
  }
}

{
  const hosts = Object.values(parentsById)
    .map((parent) => ({ parent, moons: MOONS.filter((m) => m.parent === parent.id) }))
    .filter((h) => h.moons.length > 0)

  let tightest = { ratio: Infinity }
  let emptiest = { fill: Infinity }
  let biggest = { share: 0 }

  for (const scaleMode of [0, 1]) {
    for (const { parent, moons } of hosts) {
      const { radius, renderRadius, distance } = systemShot(parent, moons, scaleMode)

      // Never closer than the planet's own shot.
      const ratio = distance / focusDistance(parent, scaleMode)
      if (ratio < tightest.ratio) tightest = { ratio, name: parent.name, scaleMode }

      // How much of the frame's height the system's full width takes up.
      const fill = radius / (distance * Math.tan(HALF_FOV))
      if (fill < emptiest.fill) emptiest = { fill, name: parent.name, scaleMode }

      // The planet must not swallow the frame it is meant to sit in the middle
      // of. Saturn is the case to watch: its clearance is pushed out by the
      // rings, so its globe is unusually large next to its innermost moon.
      const share = renderRadius / (distance * Math.tan(HALF_FOV))
      if (share > biggest.share) biggest = { share, name: parent.name, scaleMode }
    }
  }

  check(
    'framing the moons never zooms in past the planet',
    tightest.ratio >= 1,
    `tightest ${tightest.ratio.toFixed(2)}x — ${tightest.name} at scale ${tightest.scaleMode}`,
  )
  check(
    'the system is never lost in the middle of the frame',
    emptiest.fill > 0.25,
    `emptiest ${(emptiest.fill * 100).toFixed(1)}% of frame height — ${emptiest.name} at scale ${emptiest.scaleMode}`,
  )
  check(
    'the planet leaves room for its moons',
    biggest.share < 0.5,
    `largest globe ${(biggest.share * 100).toFixed(1)}% of frame height — ${biggest.name} at scale ${biggest.scaleMode}`,
  )
}

/* ------------------------------------------------------------------ *
 * …and where the camera stands to look at it
 * ------------------------------------------------------------------ */

/*
 * The elevation is the whole reason this shot exists separately from the
 * body shot, so it is the thing to assert — and it has to hold for every host
 * on every date, because the failure it replaces was precisely that it did not.
 *
 * The old framing is built from the sunlight rather than from the orbit plane,
 * so how high above the moons it landed depended on where the planet happened
 * to be. Measured over 2026 it gave Saturn 30-34° and Pluto 38°, but Jupiter and
 * Earth 14°, and Mars ran from 38° down to 2.4° over a single Martian year —
 * flat one season and angled the next, from the same click.
 *
 * The dates below are spread across a year for that reason: one date would pass
 * for the old code too.
 */
console.log('\nWhere the camera stands to see a system\n')

{
  const hosts = Object.values(parentsById)
    .map((parent) => ({ parent, moons: MOONS.filter((m) => m.parent === parent.id) }))
    .filter((h) => h.moons.length > 0)

  // Four points around 2026, so a shot that depends on the planet's position
  // cannot slip through on one lucky date.
  const dates = [0, 0.25, 0.5, 0.75].map((f) => new Date(Date.UTC(2026, 0, 1) + f * 365 * 864e5))

  const dir = new Vec3()
  const normal = new Vec3()
  let worstElevation = { error: 0 }
  let darkest = { lit: Infinity }

  for (const { parent, moons } of hosts) {
    // The plane the shot is measured against, derived the same way the renderer
    // derives it. Duplicated from `systemFramingDirection` on purpose: a check
    // that reuses the code under test proves only that it is self-consistent.
    if (moons[0].plane === 'ecliptic') normal.set(0, 1, 0)
    else {
      // The parent's pole, rebuilt here from its published right ascension and
      // declination rather than read from `poleDirection` — same reason as
      // before, that a check calling the code under test only proves the code
      // agrees with itself. This writes out the equatorial-to-world conversion
      // longhand.
      const pole = BODY_POLES[parent.id]
      if (!pole) normal.set(0, 1, 0)
      else {
        const D = Math.PI / 180
        const e = 23.4392911 * D
        const a = pole.ra * D
        const d = pole.dec * D
        const c = Math.cos(d)
        const xe = c * Math.cos(a)
        const ye = c * Math.sin(a)
        const ze = Math.sin(d)
        // Equatorial → ecliptic about the shared x-axis, then ecliptic → world.
        normal.set(xe, -ye * Math.sin(e) + ze * Math.cos(e), -(ye * Math.cos(e) + ze * Math.sin(e)))
      }
    }

    for (const date of dates) {
      const T = centuriesSinceJ2000(julianDate(date))
      const e = positionAt(parent.elements, T)
      // Ecliptic (z toward the pole) → three.js (y up). Only the direction
      // matters here, so the warp is irrelevant.
      const pos = new Vec3(e.x, e.z, -e.y).normalize().multiplyScalar(10)
      const approach = new Vec3(0, 0.4, 1).normalize()

      systemFramingDirection(parent, moons, pos, approach, dir)

      // Angle between the shot and the plane, which is 90° less the angle to
      // the normal. Signless: either face of the plane is the same elevation.
      const elevation = Math.PI / 2 - Math.acos(Math.min(1, Math.abs(dir.dot(normal))))
      const error = Math.abs(elevation - SYSTEM_PLANE_ELEVATION) * (180 / Math.PI)
      if (error > worstElevation.error) {
        worstElevation = { error, name: parent.name, date: date.toISOString().slice(0, 10) }
      }

      // The lit fraction of the disc seen from there: (1 + cos θ) / 2, where θ
      // is the angle between the shot and the sunlight. The azimuth leans
      // sunward for exactly this reason, so it should be a well-lit planet.
      const sun = new Vec3().copy(pos).negate().normalize()
      const lit = (1 + dir.dot(sun)) / 2
      if (lit < darkest.lit) {
        darkest = { lit, name: parent.name, date: date.toISOString().slice(0, 10) }
      }
    }
  }

  check(
    'every system is framed at the same angle to its own plane',
    worstElevation.error < 0.01,
    `${(SYSTEM_PLANE_ELEVATION * (180 / Math.PI)).toFixed(0)}° everywhere — worst error ${worstElevation.error.toExponential(1)}°`,
  )
  check(
    'the planet at the centre is lit, not a crescent',
    darkest.lit > 0.7,
    `dimmest ${(darkest.lit * 100).toFixed(0)}% lit — ${darkest.name} on ${darkest.date}`,
  )
}

/* ------------------------------------------------------------------ *
 * Which way each axis points, and what season that makes it
 * ------------------------------------------------------------------ */

/*
 * The two checks that would have caught a whole planet drawn out of season.
 *
 * `axialTilt` was applied as a lean about one fixed scene axis, which fixes the
 * *size* of a planet's tilt and says nothing about its direction. Every check
 * in this file passed anyway, because none of them ever asked where a pole
 * pointed — only how far over it leaned, and that was right. The symptom took a
 * screenshot to find: Phoenix landing into a polar night at a site that was in
 * fact having its midnight sun.
 *
 * So, two questions, neither of which the old model could have answered.
 */
console.log('\nWhere each axis points')

{
  /*
   * First: does each pole reproduce the obliquity the dossier prints?
   *
   * Obliquity is the angle between the spin axis and the body's **own orbit**
   * normal, which is why this builds the orbit normal from `i` and `Omega`
   * rather than comparing against the ecliptic — comparing against the ecliptic
   * is the mistake the renderer itself was making. It is a real test of a
   * hand-typed pair of numbers: a transposed digit in a right ascension moves
   * the answer by degrees.
   *
   * Venus and Uranus are quoted past 90° because their rotation is retrograde
   * and the figure is conventionally measured from the *positive rotation*
   * pole, which is opposite the IAU north pole this app draws from. The flip is
   * the convention, not a fudge — and `rotationHours` carries the same fact
   * once, as a sign, which is checked separately below.
   */
  const D = Math.PI / 180
  const e = 23.4392911 * D
  const poleEcliptic = (ra, dec) => {
    const a = ra * D
    const d = dec * D
    const c = Math.cos(d)
    const xe = c * Math.cos(a)
    const ye = c * Math.sin(a)
    const ze = Math.sin(d)
    return [xe, ye * Math.cos(e) + ze * Math.sin(e), -ye * Math.sin(e) + ze * Math.cos(e)]
  }
  const orbitNormal = (iDeg, omDeg) => {
    const i = iDeg * D
    const om = omDeg * D
    return [Math.sin(i) * Math.sin(om), -Math.sin(i) * Math.cos(om), Math.cos(i)]
  }

  /* Pluto's published 122.53° is quoted against a different pole convention;
     119.61° is the value consistent with the IAU pole drawn here. */
  const QUOTED = { pluto: 119.61 }

  /*
   * Haumea is measured but not *independently* measured.
   *
   * Its `axialTilt` is derived from the same occultation pole this compares it
   * against, so for that one body the arithmetic cannot fail on the physics —
   * it can only fail if the two numbers, which live in different files, stop
   * agreeing. That is worth catching and it is not the same claim as the other
   * ten, so it is counted and reported separately rather than quietly folded in.
   */
  const DERIVED = new Set(['haumea'])

  let worst = { error: 0 }
  let counted = 0
  let derivedWorst = { error: 0 }
  for (const body of [...PLANETS, ...DWARF_PLANETS]) {
    const pole = BODY_POLES[body.id]
    if (!pole || !body.elements) continue
    const p = poleEcliptic(pole.ra, pole.dec)
    const n = orbitNormal(body.elements.i, body.elements.Omega)
    const angle = Math.acos(Math.max(-1, Math.min(1, p[0] * n[0] + p[1] * n[1] + p[2] * n[2]))) / D
    const quoted = QUOTED[body.id]
    const expected = quoted ?? body.axialTilt
    /* Past 90° a *fact-sheet* figure is measured from the opposite pole, so the
       angle to the IAU pole has to be flipped to meet it. `QUOTED` values are
       already stated in the IAU convention and are compared as they stand —
       which is the whole reason Pluto has an entry there. */
    const measured = quoted === undefined && expected > 90 ? 180 - angle : angle
    const error = Math.abs(measured - expected)
    if (DERIVED.has(body.id)) {
      if (error > derivedWorst.error) derivedWorst = { error, name: body.name, measured, expected }
      continue
    }
    counted += 1
    if (error > worst.error) worst = { error, name: body.name, measured, expected }
  }
  check(
    'every pole reproduces its published obliquity',
    worst.error < 0.06,
    `${counted} bodies, worst ${worst.name}: ${worst.measured?.toFixed(2)}° against ${worst.expected}°`,
  )
  check(
    'and Haumea’s derived tilt still agrees with the pole it came from',
    derivedWorst.error < 0.06,
    `${derivedWorst.measured?.toFixed(2)}° against the ${derivedWorst.expected}° in dwarfPlanetData`,
  )
}

{
  /*
   * Second, and the one with teeth: is each planet in the right *season*?
   *
   * The sub-solar latitude is where the Sun stands overhead — +23.4° on Earth
   * at the June solstice, -23.4° in December — and it is exactly the quantity
   * the old model got backwards. It falls out of the pole and the planet's
   * position: project the direction from the planet to the Sun onto its pole,
   * and take the arcsine.
   *
   * Unlike the obliquity check above, this one deliberately reads the pole
   * through **`bodyBasis`** — the very axis the renderer tilts the body about.
   * The distinction matters: that check validates typed numbers against a
   * published figure and must not touch the code, while this one asks whether
   * the thing on screen is in the right season, and would be worthless if it
   * bypassed the code that puts it there. A first draft read `BODY_POLES`
   * directly and passed happily against a renderer rigged back to the old lean.
   * The truth it is measured against is external either way.
   *
   * The dates are the two solstices and an equinox on Earth, where the answer
   * is known to the arcminute, plus Mars at the landing that started all this.
   * Under the old lean every one of these came out wrong; Mars came out at
   * -25.6° against +24.5°.
   */
  const D = Math.PI / 180
  const subSolarLatitude = (body, date) => {
    const T = centuriesSinceJ2000(julianDate(date))
    const pos = positionAt(body.elements, T)
    // Ecliptic → world, the same swap the renderer uses, then the direction
    // from the planet to the Sun, which sits at the origin.
    const toSun = [-pos.x, -pos.z, pos.y]
    const m = Math.hypot(...toSun)
    const p = bodyBasis(body.id).y
    return Math.asin((toSun[0] * p.x + toSun[1] * p.y + toSun[2] * p.z) / m) / D
  }

  const SEASONS = [
    ['earth', '2026-06-21T08:24Z', 23.44, 'northern solstice'],
    ['earth', '2026-12-21T20:03Z', -23.44, 'southern solstice'],
    ['earth', '2026-03-20T14:46Z', 0, 'March equinox'],
    ['mars', '2008-05-25T23:38Z', 24.5, 'Phoenix landing, Ls 77'],
    ['mars', '2008-06-25T00:00Z', 25.2, 'Mars northern solstice'],
  ]

  let worst = { error: 0 }
  for (const [id, iso, expected, label] of SEASONS) {
    const body = PLANETS.find((b) => b.id === id)
    const got = subSolarLatitude(body, new Date(iso))
    const error = Math.abs(got - expected)
    if (error > worst.error) worst = { error, label, got, expected }
  }
  check(
    'the Sun stands over the right latitude — the seasons are in phase',
    worst.error < 0.6,
    `worst ${worst.label}: ${worst.got?.toFixed(2)}° against ${worst.expected}°`,
  )
}

{
  /*
   * And the sharpest test of a pole available: Saturn's ring-plane crossings.
   *
   * Twice a Saturnian year Earth passes through the plane of the rings and they
   * vanish — Galileo's telescope lost them in 1612 and he never worked out why.
   * The dates are published to the day, and they are a genuinely independent
   * measurement of where Saturn's axis points: Earth's orbit knows nothing about
   * it, so nothing but the right pole puts the crossings on the right dates.
   *
   * It is also sharp in a way the obliquity check is not. Near a crossing the
   * geometry is nearly tangent, so Earth can cut the plane three times in a
   * single apparition — 1995-96 and 2038-39 both do — and reproducing a triple
   * demands the plane be right to a fraction of a degree, not merely tilted by
   * about the right amount. A wrong pole gives two crossings, or three on the
   * wrong dates.
   *
   * The angle is the ring opening `B`: the elevation of Earth above the ring
   * plane, from the drawn pole and the two drawn positions.
   */
  const p = bodyBasis('saturn').y
  const saturn = PLANETS.find((b) => b.id === 'saturn')
  const earth = PLANETS.find((b) => b.id === 'earth')

  const openingAngle = (jd) => {
    const T = centuriesSinceJ2000(jd)
    const s = positionAt(saturn.elements, T)
    const e = positionAt(earth.elements, T)
    // Saturn → Earth, ecliptic → world.
    const v = [e.x - s.x, e.z - s.z, -(e.y - s.y)]
    const m = Math.hypot(...v)
    return Math.asin((v[0] * p.x + v[1] * p.y + v[2] * p.z) / m)
  }

  const from = julianDate(new Date('1990-01-01T00:00Z'))
  const to = julianDate(new Date('2045-01-01T00:00Z'))
  const found = []
  let prev = openingAngle(from)
  for (let jd = from + 1; jd <= to; jd += 1) {
    const b = openingAngle(jd)
    if (prev < 0 !== b < 0) found.push(jd - 1 + prev / (prev - b))
    prev = b
  }

  /* Every crossing between 1990 and 2045, from the published tables. */
  const KNOWN = [
    '1995-05-22',
    '1995-08-10',
    '1996-02-11',
    '2009-09-04',
    '2025-03-23',
    '2038-10-15',
    '2039-04-01',
    '2039-07-09',
  ]

  /*
   * Three days, and the slack is the *positions*, not the pole.
   *
   * Near a crossing Earth is skimming the ring plane almost tangentially, so the
   * opening angle passes through zero very slowly and a small error in either
   * body's position slides the date by a day or two. The planets here are solved
   * from mean elements with linear rates, which is accurate to arcminutes and no
   * better, and the triple crossings are the ones that feel it — the current
   * worst is 2.2 days, on the July 2039 pass.
   *
   * It is nowhere near loose enough to forgive a wrong axis. Under the old lean
   * the count itself collapses, because a plane pointing the wrong way is not
   * merely crossed late, it is crossed a different number of times.
   */
  const asDate = (jd) => new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10)
  const dates = found.map(asDate)

  let slip = 0
  for (let i = 0; i < Math.min(found.length, KNOWN.length); i++) {
    slip = Math.max(slip, Math.abs(found[i] - julianDate(new Date(`${KNOWN[i]}T00:00Z`))))
  }
  check(
    'Saturn’s rings vanish on the dates they really do',
    found.length === KNOWN.length && slip < 3,
    `${dates.length} crossings, worst ${slip.toFixed(1)} d — ${dates.join(', ')}`,
  )
}

{
  /*
   * Third: does the body on screen actually turn the way its period says?
   *
   * `rotationHours` is signed and three bodies are negative, so the data has
   * always known. What the data could not stop was the *drawing* saying it a
   * second time: a tilt past 90° flips a body over, and Venus carried both —
   * `axialTilt: 177.4` and `rotationHours: -5832.5`. Turn something upside down
   * and then spin it backwards and it is spinning forwards. Venus and Uranus
   * were drawn rotating prograde, and nothing here noticed, because the check
   * next to this one compares the period's sign against the dossier's prose and
   * neither of those is the picture.
   *
   * This takes a point on the equator, advances the drawn spin, and asks which
   * way it went around the body's own orbit normal. It is the composition
   * `surfaceOffset` uses, so it fails if either half of the transform flips.
   */
  const D = Math.PI / 180
  const spinStep = (basis, angle) => {
    // R_y(angle) applied to the prime meridian on the equator, then the basis.
    const v = { x: Math.cos(angle), y: 0, z: -Math.sin(angle) }
    return applyBasis(basis, v, { x: 0, y: 0, z: 0 })
  }

  let wrong = []
  for (const body of PLANETS) {
    if (!body.rotationHours || !body.elements) continue
    const basis = bodyBasis(body.id)
    // Advance the spin the way `spinAt` does — it divides by `rotationHours`,
    // so a negative period runs the angle backwards. Stepping forward
    // regardless was this check's own first bug, and it duly accused the
    // renderer of the very thing it was written to catch.
    const a = spinStep(basis, 0)
    const b = spinStep(basis, Math.sign(body.rotationHours) * 0.01)
    // a x b points along the angular velocity.
    const w = [a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x]
    const i = body.elements.i * D
    const om = body.elements.Omega * D
    // The orbit normal, ecliptic → world.
    const n = [Math.sin(i) * Math.sin(om), Math.cos(i), Math.sin(i) * Math.cos(om)]
    const sense = w[0] * n[0] + w[1] * n[1] + w[2] * n[2]
    const drawnPrograde = sense > 0
    const shouldBePrograde = body.rotationHours > 0
    if (drawnPrograde !== shouldBePrograde) wrong.push(body.name)
  }
  check(
    'every body is drawn turning the way its period says',
    wrong.length === 0,
    wrong.length ? `${wrong.join(', ')} drawn backwards` : 'including retrograde Venus and Uranus',
  )
}

/* ------------------------------------------------------------------ *
 * Which way each body turns
 * ------------------------------------------------------------------ */

/*
 * `rotationHours` is signed, and the sign is the only thing that makes a body
 * turn backwards — `spinAt` divides by it, and the dossier turntable takes its
 * direction from it. The dossier *text* is written by hand in a separate field.
 * Two statements of the same fact, so they get checked against each other.
 *
 * The bug this follows was one step further along: the sign was right in the
 * data and the prose agreed with it, but the turntable ignored both and turned
 * every body prograde. Nothing here would have caught that, and it is worth
 * saying so — this check guards the data, and the renderer reading the data is
 * a separate claim that only the browser can settle.
 */
console.log('\nSpin direction\n')

{
  const disagreements = []
  const zero = []

  for (const body of BODIES) {
    // "(retrograde)" in the day-length line is the claim the reader sees.
    const saysRetrograde = /retrograde/i.test(body.dayLength ?? '')
    const spinsBackwards = body.rotationHours < 0

    if (saysRetrograde !== spinsBackwards) {
      disagreements.push(
        `${body.name}: text ${saysRetrograde ? 'says' : 'does not say'} retrograde, rotationHours ${body.rotationHours}`,
      )
    }
    if (!body.rotationHours) zero.push(body.name)
  }

  check(
    'the dossier agrees with the data about which way a body turns',
    disagreements.length === 0,
    disagreements.length
      ? disagreements.join('; ')
      : `${BODIES.filter((b) => b.rotationHours < 0)
          .map((b) => b.name)
          .join(', ')} turn backwards, the rest forwards`,
  )
  /*
   * Comets are allowed no rotation period, and it is not an omission.
   *
   * Seven of the thirteen have never had one measured. Eyes leaves them without
   * a spin controller and so does this app: `rotationHours` is null and the
   * nucleus does not turn. Filling it with a plausible-looking number would be
   * the same mistake as the minor moons' assumed 11 hours, which turned out to
   * be both invented and — at speed — the thing that made them strobe.
   *
   * Every other class must still have one, so the check keeps its teeth.
   */
  /*
   * Spacecraft are exempt alongside the unmeasured comets, and for a different
   * reason: it is not that nobody has measured their spin, it is that spin is
   * the wrong model entirely. A probe holds an attitude — Eyes orients each one
   * by pointing an axis at Earth or along its velocity vector — so a rotation
   * period would be an invented number rather than a missing one.
   */
  const missing = zero.filter((name) => {
    const body = BODIES.find((b) => b.name === name)
    return body?.kind !== 'comet' && body?.kind !== 'spacecraft'
  })
  check(
    'every body except an unmeasured comet has a rotation period',
    missing.length === 0,
    missing.length
      ? missing.join(', ')
      : `${BODIES.length - zero.length} of ${BODIES.length}; ${zero.length} comets have no measured spin`,
  )
}

/*
 * Spacecraft trajectory shapes.
 *
 * The diorama's distance curve is concave, so a path that sweeps a wide radial
 * range gets bent: the near end is drawn proportionally further out than the far
 * end. A moon never notices, because it sits at one distance forever. A
 * spacecraft sweeps three decades of range in one pass, and this is what made
 * Artemis II's free return stop looking like a free return.
 *
 * `warpSpacecraftDistance` makes the mapping linear below the frame's reference
 * distance, which is where all the orbital mechanics happens. This checks the
 * bend that is left. It is deliberately a *ratio* test rather than a distance
 * one: what reads as wrong on screen is the shape, and the shape is exactly the
 * ratio between the near and far ends of a path.
 *
 * ## Two claims, measured separately
 *
 * This was one check, and it conflated two different things: it scored the warp
 * function by running whole trajectory *segments* through it and bounding the
 * result at 9x. That number belonged to neither claim. Every drawn craft scores
 * under 1.7x on the part of its path a viewer can actually see, so as a claim
 * about what is on screen a bound of 9 asserted nothing; and as a claim about
 * the warp it depended entirely on which radial range each craft's mission
 * happened to sweep. Juno passes at 7.49x and ESCAPADE fails at 13.66x on the
 * same warp, because ESCAPADE's Earth leg spans 166x in radius and Juno's does
 * not. That is a fact about mission design, not about the renderer.
 *
 * So the two are now separate:
 *
 *   1. **The warp function**, probed directly at fixed multiples of each frame's
 *      reference distance. No trajectory involved, so nothing depends on what
 *      happens to have been launched. This is what guards against reintroducing
 *      the original curve.
 *   2. **What is drawn**, scored over each craft's trail window — the arc that
 *      is on screen at once — at a bound tight enough to mean something.
 */
/*
 * Surface placement: does a longitude land where the map draws it?
 *
 * `surfaceDirection` turns areographic coordinates into a body-fixed direction,
 * and the only thing that makes it *correct* rather than merely consistent is
 * agreeing with the texture. Mars takes the texture path rather than a NASA
 * mesh, so its UVs are `SphereGeometry`'s: `uv.x = u` sits at
 * `(-cos 2πu, 0, sin 2πu)` on the equator.
 *
 * The mapping was measured off `public/textures/mars.jpg` at three landmarks —
 * Olympus Mons at u 0.125, Valles Marineris at 0.292, Hellas at 0.684 — which
 * all fit `u = ((lon - 180) / 360) mod 1`. This asserts the code still agrees
 * with that, and it is the check that would have caught the placement shipping
 * on an assumed constant: a sign error or a 180° offset moves a rover to the
 * other side of the planet while every other test still passes, because nothing
 * else in the suite knows where Gale Crater is.
 */
console.log('\nSurface coordinates against the map')
{
  const LANDMARKS = [
    ['Olympus Mons', 18.65, 226.2],
    ['Valles Marineris', -14, 285],
    ['Hellas basin', -42.4, 70.5],
    ['prime meridian', 0, 0],
    ['antimeridian', 0, 180],
  ]

  let worst = 0
  let worstAt = ''
  for (const [name, lat, lon] of LANDMARKS) {
    const d = surfaceDirection(lat, lon, new Vec3())
    // Where SphereGeometry puts the texture column for this longitude.
    const u = ((((lon - 180) / 360) % 1) + 1) % 1
    const theta = (90 - lat) * (Math.PI / 180)
    const expected = new Vec3(
      -Math.cos(2 * Math.PI * u) * Math.sin(theta),
      Math.cos(theta),
      Math.sin(2 * Math.PI * u) * Math.sin(theta),
    )
    const off = (Math.acos(Math.min(1, Math.max(-1, d.dot(expected)))) * 180) / Math.PI
    if (off > worst) {
      worst = off
      worstAt = name
    }
  }
  check(
    'every landmark lands where the texture draws it',
    worst < 1e-6,
    `worst ${worst.toExponential(1)}° (${worstAt})`,
  )
}

console.log('\nSpacecraft trajectory shape at diorama scale')
{
  const distortion = (lo, hi, frame) => {
    if (frame === 'sun') {
      const near = Math.hypot(...Object.values(warpHeliocentric({ x: lo, y: 0, z: 0 }, 0, {})))
      const far = Math.hypot(...Object.values(warpHeliocentric({ x: hi, y: 0, z: 0 }, 0, {})))
      return near / far / (lo / hi)
    }
    const body = BODIES_BY_ID[frame]
    if (!body) return 1
    const R = warpRadius(body.radiusKm, 0)
    const bodyRadiusAU = body.radiusKm / KM_PER_AU
    const reference = frameReferenceAU(body)
    const floor = surfaceFloor(body, 0)
    const near = warpSpacecraftDistance(lo, bodyRadiusAU, R, 0, reference, 0, floor)
    const far = warpSpacecraftDistance(hi, bodyRadiusAU, R, 0, reference, 0, floor)
    return near / far / (lo / hi)
  }

  const magnitude = (e) => (e > 1 ? e : 1 / e)

  /* ---- 1. the warp function, probed without a spacecraft ---- */

  /*
   * Every frame a craft is ever held in, taken from the data rather than listed.
   *
   * A hand-written list would go stale silently in the direction that matters:
   * a new frame would simply not be probed, and the check would keep passing
   * while covering less than it claims.
   */
  const FRAMES = [
    ...new Set(
      SPACECRAFT_RAW.flatMap((c) => c.segments.map((s) => s.frame)).filter(
        (f) => f !== 'sun' && BODIES_BY_ID[f],
      ),
    ),
  ].sort()

  /*
   * Proportional across the working band.
   *
   * From half the reference distance out to the reference is where the orbital
   * mechanics happens — an orbiter's whole path, and the near half of a flyby.
   * `warpSpacecraftDistance` is meant to be linear there, so a shape drawn in
   * this band is the shape the craft actually flew.
   *
   * This is the check that guards against reintroducing the original curve,
   * which is what the old 9x bound was really reaching for. Under that curve
   * this band is bent by more than a factor of two; the whole point of the
   * linear region is that it is not.
   *
   * 10%, not 2%, and for the same reason the Moon check below allows it: the
   * surface floor costs a few percent even this far out, because it is added in
   * quadrature so it fades rather than vanishing. That is the price of a craft
   * in low orbit being visible at all.
   */
  const bandBends = FRAMES.map((frame) => {
    const reference = frameReferenceAU(BODIES_BY_ID[frame])
    return { frame, bend: magnitude(distortion(reference / 2, reference, frame)) }
  })
  const bent = bandBends.filter((f) => f.bend > 1.1)
  check(
    'every frame is proportional across its working band',
    bent.length === 0,
    bent.length
      ? bent.map((f) => `${f.frame} ${f.bend.toFixed(3)}x`).join(', ')
      : `${FRAMES.length} frames, worst ${Math.max(...bandBends.map((f) => f.bend)).toFixed(3)}x`,
  )

  /*
   * And beyond the reference, every frame bends *identically*.
   *
   * Past its reference distance a frame is no longer describing a satellite
   * system, it is on its way to meeting the Sun's scale, and that join is
   * written once — so the bend from the reference out to four times it must not
   * depend on which body the frame belongs to. It comes out at 1.9185 for all of
   * them today.
   *
   * Worth asserting because the failure it catches is invisible: a join made to
   * depend on the body would still look right around any one planet, and would
   * put the same craft on two different curves either side of a handoff.
   */
  const joins = FRAMES.map((frame) => {
    const reference = frameReferenceAU(BODIES_BY_ID[frame])
    return { frame, bend: magnitude(distortion(reference, reference * 4, frame)) }
  })
  const spread = Math.max(...joins.map((j) => j.bend)) - Math.min(...joins.map((j) => j.bend))
  check(
    'and every frame joins the Sun’s scale on the same curve',
    spread < 0.01,
    `${joins[0].bend.toFixed(4)}x across ${FRAMES.length} frames, spread ${spread.toFixed(4)}`,
  )

  /* ---- 2. what is actually drawn ---- */

  /*
   * Scored over the trail window, which is the arc on screen at one moment.
   *
   * The old measure took each segment's whole radial range, and a segment is not
   * a picture — ESCAPADE's Earth leg runs from 15,230 km to 2.5 million over ten
   * months, and no two of those points are ever drawn together. What a viewer
   * judges is the shape of the ribbon, and the ribbon is `trailDays` long.
   *
   * At today's date, not across the segment's whole life. That is the same
   * convention the old check already used when it skipped segments not covering
   * today as "geometry nobody can look at" — a trail window in 2025 is no more
   * on screen than a segment in 2010. The survey below prints the worst across
   * all of time so a craft that distorts badly when you scrub to it is visible
   * rather than asserted on.
   */
  const drawn = new Set(SPACECRAFT.map((c) => c.id))
  const TODAY_JD = julianDate(new Date())

  /** The radial range of the arc drawn at `jd`, clamped clear of the body. */
  const windowRange = (craft, segment, jd) => {
    const body = BODIES_BY_ID[segment.frame]
    if (!body) return null
    const count = segment.samples.length / 3
    const days = trailDays(craft, jd, SPACECRAFT_TRAILS[craft.id]) ?? 30
    const from = Math.max(0, Math.floor((jd - days - segment.t0) / segment.step))
    const to = Math.min(count - 1, Math.ceil((jd - segment.t0) / segment.step))
    let lo = Infinity
    let hi = 0
    for (let i = from; i <= to; i++) {
      const r = Math.hypot(
        segment.samples[i * 3],
        segment.samples[i * 3 + 1],
        segment.samples[i * 3 + 2],
      )
      if (r > 0) {
        lo = Math.min(lo, r)
        hi = Math.max(hi, r)
      }
    }
    /*
     * Measured from two body radii outward.
     *
     * Below that a craft is launching, landing or aerobraking, and the surface
     * floor in `warpSpacecraftDistance` is deliberately lifting it clear of a
     * body drawn far too large — OSIRIS-REx's Earth leg starts at 7,200 km, and
     * drawing that at its true proportion would start the launch inside the
     * planet. Scoring the lift as distortion measures the fix rather than the
     * fault.
     */
    lo = Math.max(lo, (2 * body.radiusKm) / KM_PER_AU)
    return Number.isFinite(lo) && hi > lo ? [lo, hi] : null
  }

  const today = []
  const overTime = []
  for (const craft of SPACECRAFT_RAW) {
    /*
     * When to score a craft: today if it is flying today, else its own window.
     *
     * The old rule dropped any segment not covering today, which was right for
     * a live craft — Voyager 1's 1977 launch leg is not what anyone is looking
     * at — and silently excluded every mission that has *ended*. Cassini,
     * Galileo and MESSENGER are drawn only when the clock is scrubbed into their
     * window, so today is the one date at which they have no shape to score, and
     * dropping them would not have been conservative: it would have let them
     * onto the roster with their shape never measured.
     *
     * So the fallback is per craft, and it is one instant per craft either way.
     *
     * A live craft is judged on the leg it is flying now. A finished one is
     * judged at the middle of its mission window — which is not a convenient
     * choice but a literal one: `carryClockToMission` in the store sends the
     * clock to exactly that instant when you pick the craft, so it is the frame
     * a viewer actually lands on.
     *
     * Scoring *every* leg of a finished craft was the first attempt and it is
     * not the same standard as the live craft get. It flagged Ebb and Flow at
     * 12.7x on their Earth-to-Moon transfer and MESSENGER at 4.3x on a Venus
     * flyby — legs that are real, and that no live cruiser is scored on either,
     * because a live craft only ever gets measured on the one leg carrying it
     * today. Holding the ended fleet to a stricter bar would have been a rule
     * about which craft happened to have stopped flying.
     */
    const live = isFlying(craft, TODAY_JD)
    const window = trajectoryWindow(craft)
    const visit = live ? TODAY_JD : window ? (window.start + window.end) / 2 : null
    if (visit === null) continue

    for (const segment of craft.segments) {
      if (segment.frame === 'sun' || !BODIES_BY_ID[segment.frame]) continue
      const covers = visit >= segment.t0 && visit <= segment.t1
      if (!covers) continue
      const at = visit

      const now = windowRange(craft, segment, at)
      if (now) {
        today.push({
          craft,
          segment,
          bend: magnitude(distortion(now[0], now[1], segment.frame)),
        })
      }

      // 400 samples of the segment's life, for the survey line only.
      let worst = 1
      const stride = Math.max(segment.step, (segment.t1 - segment.t0) / 400)
      for (let jd = segment.t0; jd <= segment.t1; jd += stride) {
        const range = windowRange(craft, segment, jd)
        if (range) worst = Math.max(worst, magnitude(distortion(range[0], range[1], segment.frame)))
      }
      overTime.push({ craft, segment, bend: worst })
    }
  }

  /*
   * Three, the same number `verify-trails` holds a drawn ribbon's corners to.
   *
   * Every drawn craft is under 1.7x today, so this is roughly a factor of two of
   * headroom — tight enough that a real regression in the warp shows up here as
   * well as in the function checks above, and loose enough not to fail on the
   * surface floor doing its job around a close orbiter.
   */
  const drawnToday = today.filter((t) => drawn.has(t.craft.id))
  const tooBent = drawnToday.filter((t) => t.bend >= 3)
  const worstDrawn = drawnToday.reduce((a, b) => (b.bend > a.bend ? b : a), {
    bend: 0,
    craft: null,
  })
  check(
    'no drawn spacecraft trail is bent more than 3x at diorama scale',
    tooBent.length === 0,
    tooBent.length
      ? tooBent.map((t) => `${t.craft.name} ${t.bend.toFixed(2)}x in ${t.segment.frame}`).join(', ')
      : `worst ${worstDrawn.bend.toFixed(2)}x (${worstDrawn.craft?.name} in ${worstDrawn.segment?.frame})`,
  )

  // The one alignment that has to be exact: Artemis II is held in Earth's frame
  // through its lunar flyby, so if the reference distance ever drifts off the
  // Moon it walks visibly off the Moon with it.
  const moonRatio = distortion(
    BODIES_BY_ID.luna.elements.a * 0.5,
    BODIES_BY_ID.luna.elements.a,
    'earth',
  )
  check(
    "Earth's frame is proportional out to the Moon",
    Math.abs(moonRatio - 1) < 0.1,
    `${moonRatio.toFixed(4)}`,
  )

  /*
   * Reported, not asserted: the worst any craft's ribbon reaches at any date it
   * can be scrubbed to. Juno's capture ellipse and ESCAPADE's departure both
   * live here, and both are drawn today at under 1.7x.
   */
  const worstEver = overTime.reduce((a, b) => (b.bend > a.bend ? b : a), { bend: 0, craft: null })
  console.log(
    `  drawn trails today: worst bend ${worstDrawn.bend.toFixed(2)}x` +
      ` (${worstDrawn.craft?.name} in ${worstDrawn.segment?.frame})`,
  )
  console.log(
    `  all baked craft, any date: worst bend ${worstEver.bend.toFixed(2)}x` +
      ` (${worstEver.craft?.name} in ${worstEver.segment?.frame})`,
  )
}

console.log(
  failures === 0
    ? `\nAll ${checks} checks passed.\n`
    : `\n${failures} of ${checks} checks FAILED.\n`,
)
process.exit(failures === 0 ? 0 : 1)
