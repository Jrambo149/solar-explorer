/**
 * Every body the scene draws, behind one shape.
 *
 * Three files feed this: `planetData.js` (the eight), `dwarfPlanetData.js`
 * (five), `moonData.js` (twenty-five). They stay separate because they are largely
 * prose and each is long enough to be worth its own file; this module is what
 * turns them into a single list the renderer, the camera and the overlay can
 * iterate without caring which kind of thing they are looking at.
 *
 * Every body has:
 *
 *   kind      'planet' | 'dwarf' | 'moon'
 *   parent    null for anything orbiting the Sun, otherwise a body id
 *   elements  Keplerian, solved by `kepler.js` at the simulated date
 *   plane     which frame `elements` are expressed in — see below
 *
 * `plane` only means anything for moons, and it is the one field here that
 * changes what the renderer does rather than what it displays:
 *
 *   'heliocentric'  the ecliptic, about the Sun. Planets and dwarf planets.
 *   'equator'       the parent's equatorial plane, so the body is drawn inside
 *                   the parent's tilt group. Every moon but ours.
 *   'ecliptic'      the ecliptic, about the parent. The Moon only.
 */

import { FOCUS_RADII, PLANETS } from './planetData.js'
import { DWARF_PLANETS_RAW } from './dwarfPlanetData.js'
import { MOONS_RAW } from './moonData.js'
import { MINOR_MOONS_RAW } from './minorMoonData.js'
import { COMETS_RAW } from './cometData.js'
import { SPACECRAFT_RAW } from './spacecraftData.js'
import { ORBITAL_ELEMENTS } from './orbitalElements.js'
import { DWARF_ELEMENTS } from './dwarfElements.js'
import { ASTEROID_BODIES_RAW } from './asteroidBodyData.js'
import { ASTEROID_BODY_ELEMENTS } from './asteroidBodyElements.js'
import { MOON_ELEMENTS } from './moonElements.js'
import { MINOR_MOON_ELEMENTS } from './minorMoonElements.js'
import { periodDays } from '../orbit/kepler.js'
import { warpMoonRadius, warpRadius } from '../orbit/frames.js'

/**
 * Pluto's elements come from the planet table, not the SBDB bake.
 *
 * It is the only dwarf planet JPL fits linear precession rates for, because it
 * was a planet when the table was written. Reaching for the better data where
 * it exists costs one line here and is worth an order of magnitude in accuracy
 * over the app's 250-year window.
 */
const dwarfElements = (id) => ORBITAL_ELEMENTS[id] ?? DWARF_ELEMENTS[id]

/**
 * Bodies whose surface is not a photograph, and what it is instead.
 *
 * Worth saying out loud in the panel rather than leaving to be discovered.
 * Every planet here wears a real map; the moment moons and dwarf planets
 * arrived that stopped being true, and a viewer has no way to tell an imagined
 * surface from a mapped one by looking. Two different kinds of invention are
 * in play and they deserve different words: an artist's guess published with
 * the texture set, and this app's own noise functions.
 *
 * Kept as a lookup rather than a field on each body so that the *reason* lives
 * in one place. Anything absent from this map has a real map behind it.
 */
const ARTIST = 'No spacecraft has mapped this surface. The texture is an artist’s impression — NASA publishes one because the body is worth showing, not because anyone has seen it this closely.'
const DRAWN = 'No map of this surface ships with the app, so the texture is generated procedurally. The colouring follows what is known; the terrain itself is invented.'

/**
 * Bodies whose map is real but incomplete, with the specific reason.
 *
 * These are the honest cases and the easy ones to get wrong: a real mosaic
 * reads as authoritative everywhere, including where it is filling in. Both
 * were measured on the shipped map rather than asserted — the share of the map
 * carrying no detail at all is 35% for Pluto and 41% for Triton.
 */
const PLUTO_PARTIAL = 'Real, but only part of it is sharp. New Horizons flew past once, in 2015, and photographed one hemisphere in detail; the far side was caught from millions of kilometres out as Pluto turned, and the southern hemisphere was in polar night and could not be photographed at all. About a third of this map is interpolation, not terrain.'
const TRITON_PARTIAL = 'Real, but only part of it is sharp. Voyager 2 is the only spacecraft ever to visit, in 1989, and it saw a single hemisphere on the way past. Roughly 40% of this map carries no detail, because nothing has ever photographed it.'

/*
 * This list shrank a long way when the NASA models arrived, and the shrinking
 * is the point: twenty bodies that had to be invented now wear real spacecraft
 * mosaics. Ceres has Dawn's, the Galilean moons have Galileo's, Saturn's seven
 * icy moons have Cassini's, the Uranian five have Voyager 2's, Charon has New
 * Horizons', Phobos and Deimos have Mars orbiter imagery, the Moon has LRO's.
 *
 * Which of these are real was measured, not assumed — the fraction of each
 * shipped map carrying no local detail, ignoring the blank regions of the
 * cube-map atlases. Ceres came out at 2%, Ganymede 1%, Callisto, Enceladus,
 * Tethys, Dione, Rhea and Iapetus 0%: complete maps. Pluto at 35% and Triton at
 * 41% did not, and they keep a note saying so, as do the Uranian five and Charon.
 *
 * Only four bodies are still drawn from noise, and all four are Pluto's small
 * moons.
 *
 * The three that remain fully invented are the ones nobody has been to. Eris,
 * Haumea and Makemake are points of light in the best telescope ever pointed at
 * them; NASA's models of them are artist's impressions exactly as the Solar
 * System Scope textures they replace were. Swapping one guess for another is
 * not progress, so the note stays.
 *
 * Titan is worth a word because it looks like a defect: 99% of its map carries
 * no detail. That is not a gap, it is Titan — an unbroken orange smog with no
 * visible surface at all. Cassini needed radar and infrared to see through it.
 */

/**
 * Small bodies drawn as spheres that are nothing like spherical.
 *
 * Separate from `DRAWN` because it is a different claim: not "this surface is
 * invented" but "this *shape* is invented". Below roughly 200 km a body's own
 * gravity cannot round it, and four of Pluto's five moons are tens of kilometres
 * across — lumpy, double-lobed, and in Styx's case twice as long as it is thick.
 */
const DRAWN_LUMPY = `${DRAWN} The shape is invented too: this body is far too small for gravity to have rounded it, and is drawn as a sphere for want of a measured mesh.`

/**
 * The Uranian moons, whose maps are half missing for one specific reason.
 *
 * Voyager 2 is the only spacecraft ever to visit, in January 1986, and Uranus's
 * axis lies almost in its orbital plane — so at the encounter the *southern*
 * hemispheres were the ones turned toward the Sun and the north was in decades of
 * winter darkness. There was nothing to photograph, and nothing has been back.
 *
 * Measured rather than assumed, and the measurement is what confirms the story:
 * the share of each map carrying no local detail is 41% for Ariel, 46% for
 * Titania, 54% for Umbriel, 55% for Miranda and 56% for Oberon — and in every
 * case it is concentrated in the northern latitude bands and spread evenly across
 * all longitudes. A missing hemisphere looks like that. A missing *side* would
 * show up in the longitude quarters instead, and does not.
 */
const URANIAN_PARTIAL = 'Real, but only half of it. Voyager 2 is the only spacecraft ever to visit Uranus, in 1986, and the planet lies so far on its side that only the southern hemispheres were in sunlight as it passed — the north was in the middle of a decades-long winter night. About half of this map is interpolation over ground nobody has ever seen.'

/**
 * Charon, which fails the same way Pluto does and for the same reason.
 *
 * 32% of the map carries no detail, concentrated in the southern bands — 96% of
 * the bottom quarter is flat. New Horizons flew past once, in 2015, and Charon's
 * southern hemisphere was in polar night exactly as Pluto's was.
 */
const CHARON_PARTIAL = 'Real, but only part of it is sharp. New Horizons flew past once, in 2015, and Charon\'s southern hemisphere was in polar night — the same shadow that hid Pluto\'s. Roughly a third of this map is interpolation, concentrated in the south.'

/*
 * Eleven of the fifteen moons added last wear real NASA models. The four that do
 * not are the small Pluto moons, and that is not an oversight on NASA's part:
 * New Horizons resolved them into a handful of pixels each, so there is no shape
 * or map to publish.
 *
 * Which of the eleven are complete was measured the same way as the rest — the
 * fraction of the shipped map with no local variation. Saturn's came out at 0%
 * for Tethys, Dione, Rhea and Iapetus: complete Cassini mosaics, and they need no
 * note. Mimas measured 43%, which for an equirectangular map would mean half a
 * missing moon — it is a cube-map atlas, and that is unused corner. See
 * `models.js`. The Uranian five and Charon are genuinely partial and say so.
 */
/**
 * What the five named asteroids are and are not, said in the panel.
 *
 * They are drawn as spheres, and four of the five are decidedly not spheres —
 * Psyche is 278 by 238 by 171 kilometres. The globe carries no map either:
 * Vesta and Psyche have been imaged well enough for one to exist, and nothing
 * in this repo's texture set covers them.
 *
 * Saying so is the whole point. A smooth shaded ball at the right size, in the
 * right place, turning at the right rate is an honest drawing of a body whose
 * shape this app does not have; the same ball with nothing said about it is a
 * claim that Psyche is round.
 */
const ASTEROID_SHAPE =
  'Drawn as a sphere of the right mean size, and four of these five are not spheres — the measured axes are in the figures above. There is no surface map here either. What is real is the size, the rotation rate and the orbit.'

const SURFACE_NOTES = {
  vesta: ASTEROID_SHAPE,
  pallas: ASTEROID_SHAPE,
  hygiea: ASTEROID_SHAPE,
  juno: ASTEROID_SHAPE,
  psyche: ASTEROID_SHAPE,

  eris: ARTIST,
  haumea: ARTIST,
  makemake: ARTIST,
  pluto: PLUTO_PARTIAL,
  triton: TRITON_PARTIAL,

  miranda: URANIAN_PARTIAL,
  ariel: URANIAN_PARTIAL,
  umbriel: URANIAN_PARTIAL,
  titania: URANIAN_PARTIAL,
  oberon: URANIAN_PARTIAL,

  charon: CHARON_PARTIAL,
  styx: DRAWN_LUMPY,
  nix: DRAWN_LUMPY,
  kerberos: DRAWN_LUMPY,
  hydra: DRAWN_LUMPY,
}

export const DWARF_PLANETS = DWARF_PLANETS_RAW.map((body) => ({
  ...body,
  kind: 'dwarf',
  parent: null,
  plane: 'heliocentric',
  texture: body.id,
  elements: dwarfElements(body.id),
  rotationHours: body.dayHours * (body.retrograde ? -1 : 1),
  chipRadius: warpRadius(body.radiusKm, 0),
  surfaceNote: SURFACE_NOTES[body.id] ?? null,
}))

/**
 * The five asteroids drawn as worlds rather than as population.
 *
 * A separate class from the dwarf planets, and the difference is not a
 * technicality: a dwarf planet has pulled itself round under its own gravity.
 * Ceres has, which is why it is a dwarf; Vesta nearly did and lost the argument
 * by being battered out of shape, and the other four are not close.
 *
 * `texture: null` because none of these has a map to draw. Vesta and Psyche
 * have been photographed well enough for one to exist, but nothing in this
 * repo's texture set covers them, so they take the same fallback the comets
 * do — a shaded body of the right size, in the right place, turning at the
 * right rate, with no invented surface on it.
 */
export const ASTEROID_BODIES = ASTEROID_BODIES_RAW.map((body) => ({
  ...body,
  kind: 'asteroid',
  parent: null,
  plane: 'heliocentric',
  texture: null,
  rings: null,
  elements: ASTEROID_BODY_ELEMENTS[body.id],
  rotationHours: body.dayHours * (body.retrograde ? -1 : 1),
  chipRadius: warpMoonRadius(body.radiusKm, 0),
  surfaceNote: SURFACE_NOTES[body.id] ?? null,
}))

export const MOONS = MOONS_RAW.map((body) => {
  const elements = MOON_ELEMENTS[body.id]

  return {
    ...body,
    kind: 'moon',
    /**
     * Major, as Eyes labels them.
     *
     * The distinction is not the app's invention and it is not about size —
     * Nereid is bigger than Hippocamp and both are minor, while Miranda is
     * major at 236 km. It is about whether a body is a *place*: somewhere
     * mapped, with terrain that has names. Every moon in `moonData.js` has been
     * photographed by a spacecraft close enough to see features; every moon in
     * `minorMoonData.js` is an unresolved point of light with an orbit and a
     * brightness and nothing else.
     *
     * That is exactly why they are separated in the UI rather than merged into
     * one list of four hundred. A viewer scrolling past Europa to reach Thelxinoe
     * learns nothing; a viewer told that Jupiter has four moons worth visiting
     * and ninety-odd captured rocks learns the shape of the system.
     */
    tier: 'major',
    plane: elements.plane,
    texture: body.id,
    elements,
    /**
     * Tidally locked unless the body says otherwise: the spin period is the
     * orbital period, derived rather than typed so the two cannot disagree.
     *
     * `spinHours` is the opt-out, and only Pluto's four small moons use it —
     * they tumble chaotically rather than keeping one face to Pluto, because the
     * Pluto–Charon pair's gravity keeps shifting under them. See `moonData.js`.
     *
     * Note that this is unsigned even for Triton. Triton's orbit is
     * retrograde, but that is carried by its inclination — 156.8°, past the
     * pole — rather than by a negative mean motion, so `periodDays` returns a
     * positive 5.88 days like any other moon. An inclination over 90° tips the
     * orbit's normal the other way, and the body traces it backwards without
     * any element changing sign.
     */
    rotationHours: body.spinHours ?? periodDays(elements) * 24,
    /** Moons are drawn already inclined with their parent; see `moonData.js`. */
    axialTilt: 0,
    glow: null,
    moons: 0,
    chipRadius: warpMoonRadius(body.radiusKm, 0),
    surfaceNote: SURFACE_NOTES[body.id] ?? null,
  }
})

/**
 * The minor moons — the same shape as `MOONS`, filled from much less.
 *
 * A major moon arrives with a written dossier. These arrive with measurements,
 * so the fields a dossier would carry are either derived from those or left
 * null, and `InfoPanel` shows what is there rather than printing "unknown" six
 * times.
 *
 * Two derivations are worth naming:
 *
 * **Colour.** No spacecraft has photographed any of these, so there is no
 * measured colour to use. Rather than invent one per body they all take the same
 * dark grey, which is what a small unweathered rock actually looks like and, more
 * to the point, is one visible statement — a uniform swarm reads as "these are
 * all the same kind of thing", which is true, instead of implying differences
 * nobody has observed.
 *
 * **Rotation.** Left explicitly unknown rather than derived. The tidal-locking
 * assumption that every major moon here relies on is *false* for these: an
 * irregular captured on a distant orbit has nothing locking it, and the handful
 * that have been measured spin in hours while orbiting for years. Deriving spin
 * from the orbit would state something known to be wrong, so they turn on a
 * nominal period that the panel does not report as fact.
 */
/**
 * What the generic asteroid mesh is, said plainly in the panel.
 *
 * The one thing a viewer cannot tell by looking. Every other body in this app
 * wears either a real map or an acknowledged artist's impression of *that body*;
 * these wear a mesh that is not a picture of anything, shared between dozens of
 * moons. Leaving that unsaid would be the app's only genuinely misleading claim.
 */
const GENERIC_SHAPE = 'Nothing has ever resolved this moon into more than a point of light, so there is no shape or map to show. It is drawn with one of three generic asteroid meshes — the same ones NASA’s Eyes on the Solar System uses, shared between dozens of these bodies. Only the size and the orbit are real.'

/**
 * The same admission for a comet, which needs its own wording twice over.
 *
 * "Moon" is wrong, and so is "nothing has ever resolved it" for the ones with a
 * real mesh — of the thirteen, four were flown past by spacecraft and nine were
 * not. Only the nine get this.
 */
const GENERIC_COMET_SHAPE =
  'No spacecraft has been to this comet and nothing has resolved its nucleus into more than a point of light, so there is no shape to show. It is drawn with one of three generic asteroid meshes — the same ones NASA’s Eyes on the Solar System uses. Only the size and the orbit are real.'

const MINOR_MOON_GREY = '#6b6660'

/** Nominal spin for a body whose rotation nobody has measured. See above. */
const UNKNOWN_SPIN_HOURS = 11

export const MINOR_MOONS = MINOR_MOONS_RAW.map((body) => {
  const elements = MINOR_MOON_ELEMENTS[body.id]

  return {
    ...body,
    kind: 'moon',
    tier: 'minor',
    plane: elements.plane,
    texture: null,
    elements,
    color: MINOR_MOON_GREY,
    rotationHours: UNKNOWN_SPIN_HOURS,
    axialTilt: 0,
    glow: null,
    moons: 0,
    rings: null,
    chipRadius: warpMoonRadius(body.radiusKm, 0),
    surfaceNote: body.model === null ? null : GENERIC_SHAPE,
  }
})

/** Planets first, then dwarfs, then moons — the order the UI lists them in. */
export const ALL_MOONS = [...MOONS, ...MINOR_MOONS]

/**
 * The thirteen comets Eyes carries.
 *
 * Heliocentric like the planets and dwarfs, and unlike either in three ways
 * that the fields below have to answer for.
 *
 * **They are tiny.** Two to six kilometres, against Mercury's 2,440. That puts
 * them on the moon size curve rather than the planet one: `warpRadius` floors
 * at 0.4 world units to stop Mercury vanishing, and applied to a 2 km nucleus
 * it would draw Hartley 2 the size of a planet. `bodyRadius` sends every comet
 * down `warpMoonRadius` for that reason, which is about the curve and not about
 * whether the body orbits a planet.
 *
 * **Four are not coming back.** `open` marks the hyperbolic ones — see
 * `cometData.js`. They have no period, a negative `a`, and a path that has to
 * be cut off rather than closed.
 *
 * **Most have no measured spin.** Where Eyes names a rotation period it is used;
 * where it does not, `rotationHours` stays null and the nucleus simply does not
 * turn, rather than turning at a number somebody made up.
 */
const COMET_GREY = '#8d8b88'

export const COMETS = COMETS_RAW.map((body) => ({
  ...body,
  kind: 'comet',
  parent: null,
  plane: 'heliocentric',
  texture: null,
  color: COMET_GREY,
  axialTilt: 0,
  glow: null,
  moons: 0,
  rings: null,
  au: body.perihelionAU,
  chipRadius: warpMoonRadius(body.radiusKm, 0),
  surfaceNote: body.mesh === null ? GENERIC_COMET_SHAPE : null,
}))

/**
 * The spacecraft, and the one body class here that is not a Keplerian orbit.
 *
 * Every other entry in this file carries `elements` and is solved by
 * `kepler.js` at the simulated date. A spacecraft carries `segments` instead —
 * runs of sampled positions, each in its own reference frame — and is looked up
 * by `trajectory.js`. Anything that reaches for `body.elements` must check
 * `kind` first, which is why `kind` is checked rather than `elements` being
 * faked with a null.
 *
 * `parent` is null even for a craft that is, right now, orbiting Mars. That
 * looks wrong and is deliberate: a moon's parent is a fixed property of the
 * body, but a spacecraft's changes over its mission, and the parent for *this
 * instant* lives on the segment. Putting a fixed parent here would be a claim
 * that is false for most of the mission — Voyager 1's would have to be Earth,
 * Sun, Jupiter, Saturn and the Sun again. `bodyShown` and the nav bar therefore
 * treat them as top-level, and the frame handoff happens at render time.
 *
 * They have no texture and no spin. Eyes orients its models by pointing an axis
 * at Earth or along the velocity vector; nothing here does that yet, so a craft
 * keeps the attitude its mesh was authored with rather than tumbling at an
 * invented rate.
 */
const SPACECRAFT_GREY = '#b9c0c8'

/**
 * Which spacecraft are actually drawn.
 *
 * **Empty on purpose.** The fleet went in all at once and several things were
 * wrong at the same time — trajectories bent by the diorama's distance warp,
 * trail lengths derived from aliased samples, orbits that no sampled path could
 * represent — and with sixty-four craft on screen at once there was no way to
 * tell which defect any given wrong-looking line belonged to. So the roster is
 * an explicit allowlist and it starts empty. Add one id, look at it against
 * Eyes, and move on.
 *
 * Everything else stays: the baked trajectories, the osculating elements for
 * the close orbiters, Eyes' trail lengths, the models, and the scripts that
 * fetched all of it. Nothing here needs re-fetching to come back — this is a
 * filter on what renders, one line per craft:
 *
 *     const DRAWN_SPACECRAFT = new Set(['sc_voyager_1'])
 *
 * `SPACECRAFT_RAW` is untouched, so `verify-spacecraft.mjs` still checks all 64
 * craft against Horizons whether or not they are on screen. The data stays
 * honest while the view stays quiet.
 */
/*
 * Admission is measured, not assumed.
 *
 * A craft goes on this list when *some* representation actually resolves the
 * path it is flying, and the test for a sampled one is the largest turn between
 * consecutive samples inside its own trail window. That number is what the
 * ribbon inherits: the renderer redistributes 256 points evenly along the
 * window, so it can smooth out where the samples are *spaced* but can never
 * recover a corner the data does not contain.
 *
 * Three degrees is the bar, the same one `verify-trails` holds the drawn ribbons
 * to. Measured at today's date, in the trail window each craft actually shows:
 *
 *     Voyager 1        0.0°     Europa Clipper   1.1°
 *     Voyager 2        0.2°     JUICE            1.7°
 *     New Horizons     0.0°     Psyche           1.8°
 *     Pioneer 10/11    0.0°     Lucy             0.5°
 *                               ESCAPADE ×2      2.6°
 *
 * Failing that bar is no longer a reason to hold a craft back, only a reason to
 * stop sampling it. Every craft below whose samples corner too hard is solved
 * from osculating elements instead, which have no corners to inherit — they are
 * evaluated continuously — and are checked against Horizons directly by
 * `verify-spacecraft`. Parker was the extreme case at 116°, an 88-day orbit
 * sampled every 10.9 days; solved, it lands 16 km from Horizons.
 *
 * What is still held back is CAPSTONE, and for a reason neither representation
 * fixes: its samples corner at 133° and its near-rectilinear halo orbit is a
 * three-body path about Earth-Moon L2 that is not an ellipse about the Moon at
 * all, so the elements fit it only to 5.8% of its own orbit radius where every
 * craft here fits under 0.2%. See `fetch-spacecraft-elements.mjs`.
 */
const DRAWN_SPACECRAFT = new Set([
  // Close orbiters, solved from osculating elements. Their orbits turn in about
  // two hours against trajectories baked at a step of days, so there is no
  // sampled path to draw at all.
  'sc_lunar_reconnaissance_orbiter',
  'sc_themis_b', // ARTEMIS P1
  'sc_themis_c', // ARTEMIS P2
  'sc_mars_odyssey',
  'sc_mars_reconnaissance_orbiter',
  'sc_mars_express',
  'sc_trace_gas_orbiter',
  'sc_danuri',

  // Eccentric orbiters, also from elements, and for the opposite reason: their
  // periods are long but they cross most of the orbit near periapsis between two
  // samples. Juno's orbit about Jupiter is e = 0.98 and Parker's about the Sun
  // is e = 0.85, and both cornered above 114° while looking well sampled on
  // average.
  'sc_juno',
  'sc_parker_solar_probe',
  'sc_stereo_ahead',
  'sc_osiris_rex',
  'sc_biosentinel',

  // Deep-space cruisers, sampled. Nothing is turning quickly this far out, so a
  // monthly step resolves these to a fraction of a degree.
  'sc_voyager_1',
  'sc_voyager_2',
  'sc_pioneer_10',
  'sc_pioneer_11',
  'sc_new_horizons',

  // Inner-system cruisers on their way somewhere, sampled every few days.
  'sc_lucy',
  'sc_psyche',
  'sc_juice',
  'sc_europa_clipper',

  /*
   * The ESCAPADE pair, sampled, and the closest either has come to the corner
   * bar: 2.6° against a limit of 3, where every other sampled craft here is
   * under 2. The step is what Eyes chose rather than what the path needs — 0.75
   * days across a trajectory still working its way out of Earth's neighbourhood,
   * not the sedate arc a deep-space cruiser draws.
   *
   * They were held back for a while by the shape check in `verify-bodies.mjs`,
   * which scored a craft's whole *segment* and put their Earth leg at 13.66x
   * against a bound of 9. That measure was the wrong one, and it took these two
   * to show it: their leg runs from 15,230 km to 2.5 million over ten months and
   * no two of those points are ever drawn together. What is on screen is the
   * 28-day ribbon, which bends 1.6x. Meanwhile Juno passed the old check at
   * 7.49x on geometry nobody was looking at either.
   *
   * That check is now split — the warp probed directly, the ribbon scored on its
   * own — and both pass. It does mean a wide-sweeping leg is drawn distorted if
   * you scrub back toward launch: theirs reaches 12x in the weeks after it, and
   * Juno's capture ellipse reaches 7.5x the same way. Neither is new, and the
   * survey line in that check prints it rather than hiding it.
   *
   * Two craft, one model, in the way the GRAIL twins and the ARTEMIS pair are.
   */
  'sc_escapade_blue',
  'sc_escapade_gold',

  /*
   * Missions that have ended, drawn only while the clock is inside them.
   *
   * Not a new mechanism. Eyes closes a mission with a `parents` entry whose
   * frame is the empty string — Cassini's is 2017-09-15, the day it was flown
   * into Saturn — and this app transcribed that rule into the segment bounds, so
   * `isFlying` has always answered correctly and `Spacecraft` has always hidden
   * a craft outside its window. What was missing was any craft on this list that
   * exercised it: the roster happened to contain only things still flying.
   *
   * These nine are the ones whose *sampled* paths hold up. Measured the way
   * every other sampled craft here is, but at sixty instants across each
   * mission rather than at today's date, since today is the one date at which
   * they have no path at all:
   *
   *     Galileo Probe    0.2°     DART                 1.0°
   *     Deep Impact Imp. 0.5°     Deep Space 1         2.0°
   *     Huygens          0.5°     MarCO A/B            0.9°
   *     Mars Pathfinder  0.4°     Phoenix              0.8°
   *
   * Stardust's sample return capsule is left out for a different reason: Eyes
   * gives it a window of zero length — start and end are both 2006-01-15 — so it
   * exists for one instant and could not be found by scrubbing to it.
   */
  'sc_galileo_probe',
  'sc_huygens',
  'sc_deep_impact_impactor',
  'sc_mars_pathfinder',
  'sc_marco_a',
  'sc_marco_b',
  'sc_phoenix',
  'sc_dart',
  'sc_deep_space_1',

  /*
   * And the ended fleet's orbiters, solved from elements at their own epoch.
   *
   * These are the ones the block above was holding back — Cassini cornering at
   * 178.8°, MESSENGER at 177.8°, Galileo at 130.4°. None of that was a fact
   * about the missions; it was orbital phases aliasing against a step of days,
   * exactly as LRO's two-hour orbit did, and the elements path answers it.
   *
   * What had to change was where the generator asks. It anchored everything on
   * today, and a finished craft has no today — Cassini simply was not a
   * candidate. It now asks at the middle of a craft's longest leg in a body's
   * frame, which lands on the orbital phase in every case, because a tour
   * outlasts the flybys around it: thirteen years at Saturn, eight at Jupiter,
   * four at Mercury.
   *
   * Admitted on the element fit measured against Horizons *between* the rows,
   * not on their sample corners, which are meaningless for a craft whose orbit
   * turns faster than its samples are spaced:
   *
   *     MESSENGER      0.02%     Cassini      0.28%
   *     Venus Express  0.03%     MAVEN        0.57%
   *     Galileo        0.21%     Mars Orbiter 0.67%
   *
   * They appear only while the clock is inside their mission, which is Eyes' own
   * rule — see the terminal segment in `spacecraft-roster.mjs`.
   */
  'sc_cassini',
  'sc_galileo',
  'sc_messenger',
  'sc_maven',
  'sc_venus_express',
  'sc_mars_orbiter_mission',
  'sc_clementine',
  'sc_lunar_prospector',
  'sc_ladee',
  'sc_lcross',
  'sc_grail_a', // Ebb
  'sc_grail_b', // Flow

  /*
   * And the ones that landed and stayed.
   *
   * Not solved in space at all: these sit at a place on Mars and are carried by
   * it, which is what `LANDED_CRAFT` and `surface.js` are for. Their samples
   * exist and are useless — Mars-relative positions of a point on a rotating
   * surface, at 1.52 days against a 24.6-hour rotation, which is 0.65 samples
   * per turn and aliases exactly the way LRO's orbit did.
   *
   * Drawn only from touchdown onward. Each carries the rover rather than the
   * cruise stage its roster entry names, which is why `modelSlug` now tells a
   * `rover/` folder from a `cruise/` one.
   */
  'sc_mars_2020', // Perseverance
  'sc_mars_science_laboratory', // Curiosity
  'sc_mars_exploration_rover_1', // Opportunity
  'sc_mars_exploration_rover_2', // Spirit
  'sc_insight',
])

/*
 * Dawn is the one that got away, and not for want of asking.
 *
 * Its longest orbital phase is three years at Ceres, and Horizons will not give
 * elements about Ceres at all — "Required masses not defined, osculating
 * elements not available", because there is no GM for it in that context. The
 * generator falls through to a craft's next-longest leg for exactly this case,
 * and Dawn's others are two-sample Earth and Mars flybys with no closed orbit in
 * them. Eyes carries no Vesta frame either, so the sixteen months there are not
 * a leg that can be asked about.
 *
 * That leaves its samples, which corner at 153°, so it stays undrawn.
 */

export const SPACECRAFT = SPACECRAFT_RAW.filter((body) =>
  DRAWN_SPACECRAFT.has(body.id),
).map((body) => ({
  ...body,
  kind: 'spacecraft',
  parent: null,
  plane: 'trajectory',
  elements: null,
  texture: null,
  color: SPACECRAFT_GREY,
  axialTilt: 0,
  rotationHours: null,
  glow: null,
  moons: 0,
  rings: null,
  chipRadius: warpMoonRadius(body.radiusKm, 0),
}))

export const BODIES = [
  ...PLANETS,
  ...DWARF_PLANETS,
  ...ASTEROID_BODIES,
  ...ALL_MOONS,
  ...COMETS,
  ...SPACECRAFT,
]

export const BODIES_BY_ID = Object.fromEntries(BODIES.map((b) => [b.id, b]))

export const getBody = (id) => (id ? BODIES_BY_ID[id] ?? null : null)

/**
 * Bodies that orbit the Sun directly, and bodies that orbit one of those.
 *
 * Split because the render order matters: a moon's world position is its
 * parent's plus an offset, so every parent has to have written its position
 * for this frame before any moon reads it. `Scene` mounts them in this order
 * and `useFrame` runs subscribers in mount order.
 */
export const PRIMARY_BODIES = BODIES.filter((b) => b.parent === null)
export const SATELLITE_BODIES = BODIES.filter((b) => b.parent !== null)

/**
 * Moons of a given body, in orbital order, major and minor together.
 *
 * Both tiers, deliberately. Callers that want one or the other filter on `tier`;
 * callers that are asking a question about the *system* — how wide is it, what
 * does the camera have to frame — must have all of it, and getting that wrong
 * would frame Neptune's moons around Triton and leave Neso fifty million
 * kilometres outside the shot.
 */
export const moonsOf = (id) => ALL_MOONS.filter((m) => m.parent === id)

/** Major moons of a body. */
export const majorMoonsOf = (id) => MOONS.filter((m) => m.parent === id)

/** Minor moons of a body, innermost first. */
export const minorMoonsOf = (id) => MINOR_MOONS.filter((m) => m.parent === id)

/**
 * The moons a *shot* of the system has to contain.
 *
 * Everything except the distant irregulars, and that exclusion is the whole
 * reason this exists. Framing is driven by the outermost moon's apoapsis, and
 * Neso's is 83 million kilometres against Triton's 355,000 — so a frame built
 * from every moon would be 234 times too wide, and Neptune's actual system would
 * be a cluster of pixels at the centre of an empty screen.
 *
 * The irregulars are still drawn and still selectable; flying to one frames that
 * moon. What this decides is only what "show me Neptune's moons" means, and it
 * means the system, not its most remote member.
 *
 * Also used for mutual shadowing in `Body.jsx`, where the reasoning happens to
 * land the same way: a body tens of millions of kilometres out cannot cast a
 * shadow on anything, and testing it every frame would be work for nothing.
 */
export const systemMoonsOf = (id) =>
  ALL_MOONS.filter((m) => m.parent === id && m.family !== 'irregular')

/**
 * A body and everything it orbits, outermost first: `[Jupiter, Europa]`.
 *
 * The containment chain, not a navigation history — where a body *sits* does
 * not depend on how you arrived at it, so this is derived from `parent` rather
 * than recorded as you click. `[]` for no body at all, which the breadcrumb
 * reads as "the whole system".
 *
 * Worth being explicit that this is not what Eyes does. Eyes' breadcrumb is
 * built from its URL route, and a body is a single route segment, so selecting
 * Europa there gives you `Eyes on the Solar System > Europa` — Jupiter never
 * appears. The middle level is the useful part, so this app derives the real
 * hierarchy instead.
 *
 * Guarded against a cycle rather than trusting the data: a body listing itself
 * as its own ancestor would otherwise hang the render, and this is called from
 * a component.
 */
export function lineageOf(id) {
  const chain = []
  const seen = new Set()

  let body = getBody(id)
  while (body && !seen.has(body.id)) {
    seen.add(body.id)
    chain.unshift(body)
    body = getBody(body.parent)
  }

  return chain
}

/**
 * Whether a body is drawn at all, given the visibility layers.
 *
 * The two class switches are the obvious half. The third rule is the one that
 * had to be added: **a satellite of a body that is not drawn is not drawn
 * either.** Without it, Pluto's five moons survived the filter whenever Moons
 * was on and Dwarf planets was off — and a moon is positioned as an offset from
 * its parent, so with no parent to offset from all five collapsed onto the world
 * origin and were rendered, labelled and clickable in the middle of the Sun.
 *
 * That combination used to take two deliberate toggles to reach. It became the
 * default path the moment dwarf planets started switched off, since turning on
 * Moons alone is enough.
 *
 * Recursive rather than a single parent check, so it stays correct for a chain:
 * a moon of a dwarf needs the dwarf, which needs nothing. It is called per body
 * per render, over 38 bodies and at most two levels, which is nothing.
 *
 * Every consumer must agree on this — `Scene` for the meshes and paths,
 * `LabelLayer` for the markers, `CameraController` for what a zoom may snap to,
 * `NavBar` for what it offers to fly to. A disagreement between any two of them
 * is a body you can select but not see, or see but not select.
 */
export function bodyShown(body, layers) {
  if (!body) return false
  if (body.kind === 'planet' && !layers.planets) return false
  if (body.kind === 'dwarf' && !layers.dwarfPlanets) return false
  if (body.kind === 'comet' && !layers.comets) return false
  if (body.kind === 'spacecraft' && !layers.spacecraft) return false
  // Two peer switches, not a switch and a sub-switch: `moons` governs the moons
  // that are places, `minorMoons` the unresolved ones, and neither implies the
  // other. See the notes beside them in `useStore`.
  //
  // `minorMoons` is a host id rather than a boolean, so a minor moon is drawn
  // only when its own parent is the one host currently switched on — 413 of
  // these exist and no view wants them all at once.
  if (body.kind === 'moon') {
    if (body.tier === 'minor') {
      if (layers.minorMoons !== body.parent) return false
    } else if (!layers.moons) return false
  }
  if (body.parent) return bodyShown(BODIES_BY_ID[body.parent], layers)
  return true
}

/**
 * A body's drawn radius in world units.
 *
 * The one place that knows moons are sized off a different curve. Everything
 * that needs a radius — the camera, the label projector, the renderer — goes
 * through here rather than reaching for `warpRadius` directly, because calling
 * the planet curve on Phobos returns a sphere larger than Mars.
 */
/*
 * Comets take the moon curve, not the planet one.
 *
 * `warpRadius` floors at 0.4 world units so Mercury does not vanish in the
 * diorama; a 2 km comet nucleus run through it would come out the size of a
 * planet. The moon curve exists for exactly this — small bodies that have to
 * stay visible without pretending to be worlds — so the split is by size class
 * rather than by what the body orbits.
 */
export const bodyRadius = (body, scaleMode) =>
  body.kind === 'moon' || body.kind === 'comet' || body.kind === 'spacecraft'
    ? warpMoonRadius(body.radiusKm, scaleMode)
    : warpRadius(body.radiusKm, scaleMode)

/**
 * How far the camera parks from a body, in world units.
 *
 * Scale-dependent, so a function rather than a field.
 */
export const focusDistance = (body, scaleMode) => bodyRadius(body, scaleMode) * FOCUS_RADII
