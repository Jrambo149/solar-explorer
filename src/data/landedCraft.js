/**
 * The craft that stopped flying and stayed.
 *
 * Five missions on the surface of Mars, and they are a different kind of object
 * from everything else in the roster. A spacecraft is somewhere in space and the
 * app looks up where; a rover is somewhere *on a planet*, and has been for
 * years, turning with it once every 24 hours 39 minutes.
 *
 * ## Why the baked samples cannot draw them
 *
 * They are Mars-relative positions of a point on a rotating surface, sampled
 * every 1.52 days against a 24.6-hour rotation — 0.65 samples per turn. That is
 * the same aliasing that made LRO's two-hour orbit undrawable, and it has the
 * same consequence: interpolating between two samples traces a path through the
 * inside of Mars rather than a point sitting still on it.
 *
 * Eyes solves this by giving each one a *landing site* frame — `sc_mars_2020`'s
 * last segment is expressed in `sc_mars_2020_landing_site`, a body fixed to the
 * surface — and this app falls those back to Mars' own frame (see `FALLBACK` in
 * `spacecraft-roster.mjs`). So the frame is right and the samples inside it are
 * not usable.
 *
 * ## Why coordinates rather than positions
 *
 * `spinAt` turns a planet by `(jd - J2000) / period` with no epoch offset, so
 * the angle is zero at J2000 by construction rather than by measurement. Every
 * body in this app is therefore at an arbitrary rotational phase with respect to
 * the real sky — which is invisible for a planet nobody is looking at closely,
 * and decisive here.
 *
 * It means a rover placed at its true direction from Mars' centre, which is what
 * Horizons would give, would land at an essentially random longitude on the
 * *drawn* Mars. Curiosity would not be in Gale Crater. Since being in Gale
 * Crater is the entire point of drawing it, these are placed by their real
 * areographic coordinates in the planet's own body-fixed frame, and they rotate
 * with the drawn planet rather than with the real one.
 *
 * The trade is explicit: right place on the map, and the same arbitrary phase
 * relative to the stars that Mars itself already has. Giving the bodies real
 * prime-meridian epochs would collapse the two, and is a separate job.
 *
 * ## Sources
 *
 * Landing coordinates are the published, post-landing determinations —
 * planetocentric latitude and east longitude, the convention modern Mars
 * products use. Rounded to the fourth decimal, which is about six metres and far
 * finer than anything drawn here.
 */

import { julianDate } from '../orbit/kepler.js'

/**
 * A UTC instant to a Julian date, so the documented time *is* the value.
 *
 * These were hand-converted Julian numbers with the UTC time in a comment
 * beside them, and four of the five were wrong: Curiosity's was 18 days late,
 * InSight's 5 days, Perseverance's 15 hours and Opportunity's 3.7. Nothing
 * caught it, because every consumer reads the number and no consumer reads the
 * comment — the app placed Curiosity on the surface from 24 August 2012 and
 * drew its cruise stage for the eighteen days it had actually been driving.
 *
 * Converting here removes the class of error rather than the four instances of
 * it: there is now one statement of when each craft landed, it is in the form
 * every source publishes, and it is the one the code uses.
 */
const at = (utc) => julianDate(new Date(utc))

/**
 * Keyed by the roster id, so these join the craft already in `SPACECRAFT_RAW`
 * rather than describing new bodies.
 *
 * `model` overrides the roster's, which for the three rovers names the *cruise
 * stage* that delivered them — the disc with the heat shield, which is the right
 * model for the eight months in transit and the wrong one for the decade after.
 * Eyes keeps both under one directory and this app now slugs them apart; see
 * `modelSlug`.
 *
 * `landed` is when the craft reached the surface, and is the instant the surface
 * placement takes over. Before it the craft is in flight and its samples are
 * ordinary samples.
 *
 * A `model` of null is not an omission. Phoenix is here because it landed, and
 * the reason to place it by coordinates has nothing to do with what it is drawn
 * as: without an entry it was drawn from its surface samples, which put it
 * between 13 and 179 km *below* Mars for every instant of its mission. Eyes has
 * no deployed-lander mesh for it — only a cruise stage and an entry vehicle, and
 * neither is the object sitting in Green Valley — so it draws as its marker,
 * which is what Mars Pathfinder already does and is the honest picture. The bug
 * was the placement; the mesh is a separate want.
 */
export const LANDED_CRAFT = {
  sc_mars_2020: {
    name: 'Perseverance',
    body: 'mars',
    // Octavia E. Butler Landing, Jezero Crater.
    lat: 18.4447,
    lon: 77.4508,
    landed: at('2021-02-18T20:55:00Z'), // Touchdown confirmed.
    ended: null, // Still operating.
    model: 'sc_mars_2020/rover/perseverance.gltf',
  },

  sc_mars_science_laboratory: {
    name: 'Curiosity',
    body: 'mars',
    // Bradbury Landing, Gale Crater.
    lat: -4.5895,
    lon: 137.4417,
    landed: at('2012-08-06T05:17:57Z'), // Touchdown; signal received 05:32.
    ended: null, // Still operating.
    model: 'sc_mars_science_laboratory/rover/curiosity_static.gltf',
  },

  sc_mars_exploration_rover_2: {
    name: 'Spirit',
    body: 'mars',
    // Columbia Memorial Station, Gusev Crater.
    lat: -14.5684,
    lon: 175.4726,
    landed: at('2004-01-04T04:35:52Z'), // Touchdown.
    ended: at('2010-03-22T00:00:00Z'), // Last contact.
    model: 'sc_mars_exploration_rover/rover/mer_static.gltf',
  },

  sc_mars_exploration_rover_1: {
    name: 'Opportunity',
    body: 'mars',
    // Challenger Memorial Station, Meridiani Planum.
    lat: -1.9462,
    lon: 354.4734,
    landed: at('2004-01-25T05:05:00Z'), // Touchdown.
    ended: at('2018-06-10T00:00:00Z'), // Last contact, before the dust storm.
    model: 'sc_mars_exploration_rover/rover/mer_static.gltf',
  },

  sc_insight: {
    name: 'InSight',
    body: 'mars',
    // Elysium Planitia. The one whose roster model is already the right object —
    // `sc_insight/lander/insight.gltf` is the lander, not the cruise stage.
    lat: 4.502,
    lon: 135.623,
    landed: at('2018-11-26T19:52:59Z'), // Touchdown.
    ended: at('2022-12-15T00:00:00Z'), // Last contact; retired 2022-12-21.
    model: 'sc_insight/lander/insight.gltf',
  },

  sc_phoenix: {
    name: 'Phoenix',
    body: 'mars',
    // Green Valley, Vastitas Borealis — the far north, and the reason the
    // mission lasted a summer rather than years: the site freezes over.
    lat: 68.2188,
    lon: 234.2508,
    landed: at('2008-05-25T23:38:24Z'), // Touchdown; signal received 23:53:44.
    ended: at('2008-11-02T00:00:00Z'), // Last transmission, as the winter closed in.
    // No deployed-lander mesh exists to draw. See the note above.
    model: null,
  },
}

/**
 * What to call a craft at `jd` — the mission before touchdown, the rover after.
 *
 * Eyes does this too, and does it the same way round: its roster carries `Mars
 * 2020` and `Mars Science Laboratory`, and its surface scenes run a literal
 * `.replace("Mars 2020", "Perseverance")` on the label as you arrive. The reason
 * is that both names are correct about different objects. What crosses the gap
 * between Earth and Mars is the mission — a cruise stage with a rover folded up
 * inside it, and Eyes draws exactly that. What is on the ground afterwards is
 * the rover, and nobody calls it Mars 2020.
 *
 * So the name changes at the same instant the *model* changes, which is the
 * instant `Spacecraft` swaps the cruise stage for the rover and starts placing
 * it by coordinates. One event, one moment, three consequences — and no date at
 * which the label names something other than what is on screen.
 *
 * `ended` deliberately does not come into it. Spirit stopped answering in 2010
 * and is still Spirit.
 */
const LANDED_IDS = Object.keys(LANDED_CRAFT)

/**
 * Which of them are down at `jd`, as one bit each.
 *
 * The names depend on the date, and the date advances several times a second.
 * Subscribing the nav bar and every marker to the clock to re-derive labels
 * that change five times in two centuries would be absurd, so components
 * subscribe to *this* instead: it takes one value per landing over the whole
 * timeline, so a string compare turns the clock into a re-render only at the
 * instants a name actually changes.
 */
export function surfaceKey(jd) {
  let key = ''
  for (const id of LANDED_IDS) key += jd >= LANDED_CRAFT[id].landed ? '1' : '0'
  return key
}

/** As `bodyName`, from a `surfaceKey` rather than a date. */
export function bodyNameFor(body, key) {
  if (!body) return ''
  const i = LANDED_IDS.indexOf(body.id)
  return i >= 0 && key[i] === '1' ? LANDED_CRAFT[body.id].name : body.name
}

export const bodyName = (body, jd) => bodyNameFor(body, surfaceKey(jd))

/** The landed record for a craft, or null. */
export const landedCraft = (id) => LANDED_CRAFT[id] ?? null

/** Whether this craft is on a surface at `jd` rather than in flight. */
export function isLanded(id, jd) {
  const site = LANDED_CRAFT[id]
  return site ? jd >= site.landed : false
}
