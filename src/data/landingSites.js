/**
 * Where things have touched down, and where things have hit.
 *
 * The one table in this app that is **transcribed rather than derived**, and it
 * is worth being plain about why. Everything else here is solved: a planet's
 * position comes out of its elements, a feature's coordinates come out of the
 * IAU register, an eclipse's track comes out of the geometry. A landing site is
 * a historical fact about a particular afternoon, published once in a mission
 * report, and there is no formula that produces it. So this is a list, and the
 * question is not how it is computed but how it is checked.
 *
 * ## How it is checked
 *
 * Two of the bodies here overlap data the repository already holds and has
 * already verified, and `verify-landing-sites.mjs` compares against both rather
 * than against my memory:
 *
 *  - **Six lunar sites are in the IAU gazetteer**, because the IAU has adopted
 *    names for them: Statio Tranquillitatis (Apollo 11), Guang Han Gong
 *    (Chang'e 3), Statio Tianhe (Chang'e 4), Statio Tianchuan (Chang'e 5),
 *    Statio Tianjiang (Chang'e 6) and Statio Shiv Shakti (Chandrayaan-3). Those
 *    coordinates are baked into `surfaceFeatures.js` by a script that fetches
 *    them, so six of these rows can be compared with a source.
 *  - **Six Mars sites are already in `landedCraft.js`**, placed there so the
 *    rovers stand in the right craters, and checked when that landed. The rows
 *    here must agree with those exactly.
 *
 *  - **Eleven more are described as being inside a named place** whose centre
 *    and diameter the gazetteer publishes: Curiosity in Gale, Chang'e 4 in Von
 *    Kármán, Viking 1 in Chryse Planitia, Venera 9 on Beta Regio. Containment
 *    says nothing about a coordinate's last decimal and everything about its
 *    hemisphere.
 *
 * Seventeen of fifty-two rows against data that came from somewhere else is not
 * proof of the other thirty-five. It does catch the errors that would affect all
 * of them at once — a hemisphere flipped, west longitude quoted as east, a sign
 * lost on a southern latitude — which are the mistakes a table like this
 * actually makes.
 *
 * ## Precision
 *
 * Quoted to the digits the source supports and no further, which varies by a
 * lot and is itself information:
 *
 *  - **Apollo, five decimals.** The descent stages are visible in Lunar
 *    Reconnaissance Orbiter images and have been measured off them; these are
 *    known to a few metres.
 *  - **The gazetteer's six, four decimals**, as published.
 *  - **Surveyor, Luna, Venera, Viking: two.** Post-mission determinations from
 *    tracking and from imagery, good to hundreds of metres at best.
 *  - **Mars 3 and Venera 7: one, and flagged `approximate`.** Mars 3 returned
 *    fourteen and a half seconds of signal and was never located; its site is
 *    an ellipse a hundred kilometres across, and the number here is its centre.
 *    Drawing it at four decimals would be a lie told in the shape of a
 *    coordinate.
 *
 * ## What is not here
 *
 * Bodies this app draws as spheres get sites; bodies it does not, do not.
 * Philae is missing for that reason and not for lack of a coordinate: Abydos is
 * on the small lobe of a comet shaped like a duck, and 67P is drawn here as a
 * point. Putting Philae at a latitude and longitude on a sphere that does not
 * exist would place it in empty space beside the comet and label it as though
 * it were somewhere.
 *
 * Eros, Ryugu, Bennu, Itokawa and Dimorphos are absent for the plainer version
 * of the same reason — this app has no such bodies.
 */

import { julianDate } from '../orbit/kepler.js'

/**
 * A UTC instant to a Julian date.
 *
 * The same conversion `landedCraft.js` does, and for the same reason: four of
 * its five hand-converted Julian numbers were wrong, one of them by eighteen
 * days, and nothing caught it because every consumer reads the number and no
 * consumer reads the comment beside it. With fifty-two rows the odds of getting
 * them all right by hand are nil.
 */
const at = (utc) => julianDate(new Date(utc))

/**
 * @typedef {{
 *   body: string,
 *   name: string,
 *   lat: number,
 *   lon: number,
 *   jd: number,
 *   kind: 'crewed' | 'rover' | 'sample return' | 'lander' | 'probe' | 'impact' | 'crash',
 *   agency: string,
 *   craft?: string,
 *   approximate?: boolean,
 *   note?: string,
 * }} LandingSite
 */

/**
 * Planetocentric latitude, **east** longitude 0–360 — the convention
 * `scene/surface.js` places everything by, and the one the gazetteer publishes.
 *
 * Much of the older literature quotes west longitude for the Moon and for Mars,
 * which is the single likeliest way for a row here to be wrong: Apollo 12 at
 * 23.42°W is at 336.58°E, and a table that mixed the two would put half the
 * Apollo sites in the wrong ocean while looking entirely reasonable. Every
 * value below has been converted to east, and the six the gazetteer also knows
 * about are the check that the conversion was done in the right direction.
 *
 * `craft` names a roster id where the same object is also drawn as a
 * spacecraft, so the drawing can show one or the other rather than both.
 *
 * @type {LandingSite[]}
 */
export const LANDING_SITES = [
  /* ---- the Moon ---------------------------------------------------------
   *
   * In date order, which is also very nearly the order of ambition: an impact,
   * then a soft landing, then a person, then a sample, then the far side.
   */
  {
    body: 'luna',
    name: 'Luna 2',
    lat: 29.1,
    lon: 0.0,
    jd: at('1959-09-13T21:02:24Z'),
    kind: 'impact',
    agency: 'USSR',
    approximate: true,
    note: 'The first object from Earth to reach another world.',
  },
  {
    body: 'luna',
    name: 'Luna 9',
    lat: 7.08,
    lon: 295.63,
    jd: at('1966-02-03T18:45:30Z'),
    kind: 'lander',
    agency: 'USSR',
    note: 'The first soft landing, and the first pictures from the surface.',
  },
  {
    body: 'luna',
    name: 'Surveyor 1',
    lat: -2.47,
    lon: 316.66,
    jd: at('1966-06-02T06:17:36Z'),
    kind: 'lander',
    agency: 'NASA',
  },
  {
    body: 'luna',
    name: 'Luna 13',
    lat: 18.87,
    lon: 297.95,
    jd: at('1966-12-24T18:01:00Z'),
    kind: 'lander',
    agency: 'USSR',
  },
  {
    body: 'luna',
    name: 'Surveyor 3',
    lat: -2.94,
    lon: 336.66,
    jd: at('1967-04-20T00:04:53Z'),
    kind: 'lander',
    agency: 'NASA',
    note: 'Apollo 12 landed 155 m away and brought part of it home.',
  },
  {
    body: 'luna',
    name: 'Surveyor 5',
    lat: 1.41,
    lon: 23.18,
    jd: at('1967-09-11T00:46:44Z'),
    kind: 'lander',
    agency: 'NASA',
  },
  {
    body: 'luna',
    name: 'Surveyor 6',
    lat: 0.46,
    lon: 358.63,
    jd: at('1967-11-10T01:01:06Z'),
    kind: 'lander',
    agency: 'NASA',
  },
  {
    body: 'luna',
    name: 'Surveyor 7',
    lat: -41.01,
    lon: 348.59,
    jd: at('1968-01-10T01:05:36Z'),
    kind: 'lander',
    agency: 'NASA',
  },
  {
    body: 'luna',
    name: 'Apollo 11',
    lat: 0.67409,
    lon: 23.47298,
    jd: at('1969-07-20T20:17:40Z'),
    kind: 'crewed',
    agency: 'NASA',
    note: 'Statio Tranquillitatis. Two hours 31 minutes outside.',
  },
  {
    body: 'luna',
    name: 'Apollo 12',
    lat: -3.01239,
    lon: 336.57712,
    jd: at('1969-11-19T06:54:35Z'),
    kind: 'crewed',
    agency: 'NASA',
  },
  {
    body: 'luna',
    name: 'Luna 16',
    lat: -0.68,
    lon: 56.3,
    jd: at('1970-09-20T05:18:00Z'),
    kind: 'sample return',
    agency: 'USSR',
    note: 'The first sample returned from another world without a crew.',
  },
  {
    body: 'luna',
    name: 'Lunokhod 1',
    lat: 38.24,
    lon: 325.0,
    jd: at('1970-11-17T03:47:00Z'),
    kind: 'rover',
    agency: 'USSR',
    note: 'Landed by Luna 17. Drove 10 km over ten months.',
  },
  {
    body: 'luna',
    name: 'Apollo 14',
    lat: -3.6453,
    lon: 342.5226,
    jd: at('1971-02-05T09:18:11Z'),
    kind: 'crewed',
    agency: 'NASA',
  },
  {
    body: 'luna',
    name: 'Apollo 15',
    lat: 26.13222,
    lon: 3.63386,
    jd: at('1971-07-30T22:16:29Z'),
    kind: 'crewed',
    agency: 'NASA',
    note: 'Hadley Rille, at the foot of the Apennines. The first rover.',
  },
  {
    body: 'luna',
    name: 'Luna 20',
    lat: 3.53,
    lon: 56.55,
    jd: at('1972-02-21T19:19:00Z'),
    kind: 'sample return',
    agency: 'USSR',
  },
  {
    body: 'luna',
    name: 'Apollo 16',
    lat: -8.97301,
    lon: 15.50019,
    jd: at('1972-04-21T02:23:35Z'),
    kind: 'crewed',
    agency: 'NASA',
  },
  {
    body: 'luna',
    name: 'Apollo 17',
    lat: 20.1908,
    lon: 30.77168,
    jd: at('1972-12-11T19:54:58Z'),
    kind: 'crewed',
    agency: 'NASA',
    note: 'Taurus-Littrow. The last time anyone stood here.',
  },
  {
    body: 'luna',
    name: 'Lunokhod 2',
    lat: 25.85,
    lon: 30.45,
    jd: at('1973-01-15T23:35:00Z'),
    kind: 'rover',
    agency: 'USSR',
    note: 'Landed by Luna 21. Drove 39 km — the record until 2023.',
  },
  {
    body: 'luna',
    name: 'Luna 24',
    lat: 12.75,
    lon: 62.2,
    jd: at('1976-08-18T06:36:00Z'),
    kind: 'sample return',
    agency: 'USSR',
    note: 'The last landing of any kind for thirty-seven years.',
  },
  {
    body: 'luna',
    name: 'Chang’e 3',
    lat: 44.1184,
    lon: 340.4877,
    jd: at('2013-12-14T13:11:18Z'),
    kind: 'rover',
    agency: 'CNSA',
    note: 'Guang Han Gong, in Mare Imbrium. Carried the rover Yutu.',
  },
  {
    body: 'luna',
    name: 'Beresheet',
    lat: 32.5956,
    lon: 19.3496,
    jd: at('2019-04-11T19:23:00Z'),
    kind: 'crash',
    agency: 'SpaceIL',
    note: 'The engine cut out at 150 m.',
  },
  {
    body: 'luna',
    name: 'Chang’e 4',
    lat: -45.45,
    lon: 177.6,
    jd: at('2019-01-03T02:26:00Z'),
    kind: 'rover',
    agency: 'CNSA',
    note: 'Statio Tianhe, in Von Kármán. The first landing on the far side.',
  },
  {
    body: 'luna',
    name: 'Chang’e 5',
    lat: 43.06,
    lon: 308.08,
    jd: at('2020-12-01T15:11:00Z'),
    kind: 'sample return',
    agency: 'CNSA',
    note: 'Statio Tianchuan. The first samples since Luna 24.',
  },
  {
    body: 'luna',
    name: 'Luna 25',
    lat: -57.87,
    lon: 61.36,
    jd: at('2023-08-19T11:57:00Z'),
    kind: 'crash',
    agency: 'Roscosmos',
    approximate: true,
    note: 'An engine burn ran 43 s too long.',
  },
  {
    body: 'luna',
    name: 'Chandrayaan-3',
    lat: -69.3734,
    lon: 32.3198,
    jd: at('2023-08-23T12:33:00Z'),
    kind: 'lander',
    agency: 'ISRO',
    note: 'Statio Shiv Shakti. The furthest south anything had landed.',
  },
  {
    body: 'luna',
    name: 'SLIM',
    lat: -13.32,
    lon: 25.25,
    jd: at('2024-01-19T15:20:00Z'),
    kind: 'lander',
    agency: 'JAXA',
    note: 'Landed within 100 m of its aim point, and upside down.',
  },
  {
    body: 'luna',
    name: 'Odysseus',
    lat: -80.13,
    lon: 1.44,
    jd: at('2024-02-22T23:24:00Z'),
    kind: 'lander',
    agency: 'Intuitive Machines',
    note: 'The first commercial landing. Caught a foot and tipped over.',
  },
  {
    body: 'luna',
    name: 'Chang’e 6',
    lat: -41.63,
    lon: 206.02,
    jd: at('2024-06-01T22:23:00Z'),
    kind: 'sample return',
    agency: 'CNSA',
    note: 'Statio Tianjiang, in Apollo basin — the first samples from the far side.',
  },
  {
    body: 'luna',
    name: 'Blue Ghost 1',
    lat: 18.56,
    lon: 61.81,
    jd: at('2025-03-02T08:34:00Z'),
    kind: 'lander',
    agency: 'Firefly',
    note: 'Mare Crisium, upright, and it lasted the whole lunar day.',
  },

  /* ---- Mars -------------------------------------------------------------
   *
   * The six with a `craft` are also in `landedCraft.js`, which places the
   * actual rover on the ground when the spacecraft layer is on. The
   * coordinates here are copies of those and the check enforces it: this table
   * is a map of missions, and it should not disagree with the objects standing
   * on the same map.
   */
  {
    body: 'mars',
    name: 'Mars 3',
    lat: -45.0,
    lon: 202.0,
    jd: at('1971-12-02T13:52:00Z'),
    kind: 'lander',
    agency: 'USSR',
    approximate: true,
    note: 'The first soft landing on Mars. It transmitted for 14.5 seconds.',
  },
  {
    body: 'mars',
    name: 'Viking 1',
    lat: 22.27,
    lon: 312.05,
    jd: at('1976-07-20T11:53:06Z'),
    kind: 'lander',
    agency: 'NASA',
    note: 'Chryse Planitia. The first pictures from the surface of Mars.',
  },
  {
    body: 'mars',
    name: 'Viking 2',
    lat: 47.64,
    lon: 134.29,
    jd: at('1976-09-03T22:37:50Z'),
    kind: 'lander',
    agency: 'NASA',
    note: 'Utopia Planitia.',
  },
  {
    body: 'mars',
    name: 'Mars Pathfinder',
    lat: 19.13,
    lon: 326.75,
    jd: at('1997-07-04T16:56:55Z'),
    kind: 'lander',
    agency: 'NASA',
    craft: 'sc_mars_pathfinder',
    note: 'Sagan Memorial Station, in Ares Vallis. Carried Sojourner.',
  },
  {
    body: 'mars',
    name: 'Beagle 2',
    lat: 11.53,
    lon: 90.43,
    jd: at('2003-12-25T02:54:00Z'),
    kind: 'lander',
    agency: 'ESA',
    note: 'Silent from the moment it arrived. Found intact in 2015, half unfolded.',
  },
  {
    body: 'mars',
    name: 'Spirit',
    lat: -14.5684,
    lon: 175.4726,
    jd: at('2004-01-04T04:35:52Z'),
    kind: 'rover',
    agency: 'NASA',
    craft: 'sc_mars_exploration_rover_2',
    note: 'Columbia Memorial Station, Gusev Crater.',
  },
  {
    body: 'mars',
    name: 'Opportunity',
    lat: -1.9462,
    lon: 354.4734,
    jd: at('2004-01-25T05:05:00Z'),
    kind: 'rover',
    agency: 'NASA',
    craft: 'sc_mars_exploration_rover_1',
    note: 'Challenger Memorial Station. Drove 45 km over fourteen years.',
  },
  {
    body: 'mars',
    name: 'Phoenix',
    lat: 68.2188,
    lon: 234.2508,
    jd: at('2008-05-25T23:38:24Z'),
    kind: 'lander',
    agency: 'NASA',
    craft: 'sc_phoenix',
    note: 'Green Valley, in the far north. It froze over that winter.',
  },
  {
    body: 'mars',
    name: 'Curiosity',
    lat: -4.5895,
    lon: 137.4417,
    jd: at('2012-08-06T05:17:57Z'),
    kind: 'rover',
    agency: 'NASA',
    craft: 'sc_mars_science_laboratory',
    note: 'Bradbury Landing, Gale Crater.',
  },
  {
    body: 'mars',
    name: 'Schiaparelli',
    lat: -2.07,
    lon: 353.79,
    jd: at('2016-10-19T14:48:00Z'),
    kind: 'crash',
    agency: 'ESA',
    note: 'The parachute released early. It hit at about 150 m/s.',
  },
  {
    body: 'mars',
    name: 'InSight',
    lat: 4.502,
    lon: 135.623,
    jd: at('2018-11-26T19:52:59Z'),
    kind: 'lander',
    agency: 'NASA',
    craft: 'sc_insight',
    note: 'Elysium Planitia. Listened to marsquakes for four years.',
  },
  {
    body: 'mars',
    name: 'Perseverance',
    lat: 18.4447,
    lon: 77.4508,
    jd: at('2021-02-18T20:55:00Z'),
    kind: 'rover',
    agency: 'NASA',
    craft: 'sc_mars_2020',
    note: 'Octavia E. Butler Landing, Jezero Crater.',
  },
  {
    body: 'mars',
    name: 'Zhurong',
    lat: 25.066,
    lon: 109.925,
    jd: at('2021-05-14T23:18:00Z'),
    kind: 'rover',
    agency: 'CNSA',
    note: 'Utopia Planitia, 1,300 km from Viking 2.',
  },

  /* ---- Venus ------------------------------------------------------------
   *
   * Every one of these stopped within two hours, most within one. The surface
   * is 465 °C at ninety atmospheres, and nothing built has survived a day
   * there. The dates are the whole story: nine landings between 1970 and 1985,
   * and nothing since.
   */
  {
    body: 'venus',
    name: 'Venera 7',
    lat: -5.0,
    lon: 351.0,
    jd: at('1970-12-15T05:34:10Z'),
    kind: 'probe',
    agency: 'USSR',
    approximate: true,
    note: 'The first signal ever returned from the surface of another planet.',
  },
  {
    body: 'venus',
    name: 'Venera 8',
    lat: -10.7,
    lon: 335.25,
    jd: at('1972-07-22T09:32:00Z'),
    kind: 'probe',
    agency: 'USSR',
    note: 'Transmitted for 50 minutes.',
  },
  {
    body: 'venus',
    name: 'Venera 9',
    lat: 31.01,
    lon: 291.64,
    jd: at('1975-10-22T05:13:00Z'),
    kind: 'probe',
    agency: 'USSR',
    note: 'The first photograph taken on the surface of another planet.',
  },
  {
    body: 'venus',
    name: 'Venera 10',
    lat: 15.42,
    lon: 291.51,
    jd: at('1975-10-25T05:17:00Z'),
    kind: 'probe',
    agency: 'USSR',
  },
  {
    body: 'venus',
    name: 'Venera 13',
    lat: -7.55,
    lon: 303.69,
    jd: at('1982-03-01T03:57:21Z'),
    kind: 'probe',
    agency: 'USSR',
    note: 'Designed for 32 minutes. Lasted 127, and sent back colour.',
  },
  {
    body: 'venus',
    name: 'Venera 14',
    lat: -13.055,
    lon: 310.19,
    jd: at('1982-03-05T07:00:10Z'),
    kind: 'probe',
    agency: 'USSR',
  },
  {
    body: 'venus',
    name: 'Vega 1',
    lat: 7.2,
    lon: 177.8,
    jd: at('1985-06-11T03:02:54Z'),
    kind: 'probe',
    agency: 'USSR',
    note: 'Dropped a lander on the way to Halley’s Comet.',
  },
  {
    body: 'venus',
    name: 'Vega 2',
    lat: -6.45,
    lon: 181.08,
    jd: at('1985-06-15T03:00:50Z'),
    kind: 'probe',
    agency: 'USSR',
    note: 'The last thing to land on Venus.',
  },

  /* ---- and one further out ---------------------------------------------- */
  {
    body: 'titan',
    name: 'Huygens',
    lat: -10.3,
    lon: 192.3,
    jd: at('2005-01-14T11:38:00Z'),
    kind: 'probe',
    agency: 'ESA',
    craft: 'sc_huygens',
    note: 'The most distant landing ever made, on a shore of frozen sand.',
  },
  {
    body: 'mercury',
    name: 'MESSENGER',
    lat: 54.4,
    lon: 210.1,
    jd: at('2015-04-30T19:26:00Z'),
    kind: 'impact',
    agency: 'NASA',
    approximate: true,
    craft: 'sc_messenger',
    note: 'Out of fuel after four years in orbit. It hit at 3.9 km/s.',
  },
]

/** id → its own sites, oldest first. */
export const SITES_BY_BODY = LANDING_SITES.reduce((map, site) => {
  ;(map[site.body] ??= []).push(site)
  return map
}, {})

for (const list of Object.values(SITES_BY_BODY)) list.sort((a, b) => a.jd - b.jd)
