/**
 * Planet data — real astronomical values, plus the facts the info panel shows.
 *
 * Where each planet *is* no longer lives here. Positions come from real
 * Keplerian elements (`src/data/orbitalElements.js`) solved at the simulation
 * date (`src/orbit/kepler.js`), and the compression that keeps the system on
 * screen is applied at render time (`src/orbit/frames.js`) so it can be dialled
 * between diorama and true scale. What remains in this file is the physics and
 * the prose: sizes, rotation, tilt, and everything the panel reads.
 */

import { ORBITAL_ELEMENTS } from './orbitalElements.js'
import { warpRadius } from '../orbit/frames.js'

/**
 * How far the camera parks from a focused planet, in planet radii.
 *
 * A sphere at distance d subtends 2·asin(r/d), so this puts the planet at about
 * 34° across — comfortably filling the frame with a margin of space around it,
 * rather than pressing right up against the edges. (The first pass used 2.7,
 * which gave ~44° and arrived too tight to take the whole planet in.)
 *
 * The atmosphere shader imports this too: its glow reaches full attenuation at
 * exactly the distance a close-up parks at, so the two can't drift apart.
 */
export const FOCUS_RADII = 3.4

/*
 * Mass as a *number*, beside the `mass` string the panel already printed.
 *
 * The string is display text — "6.42 × 10²³ kg (0.107 Earth)" — and there is no
 * honest way to compute with it. Surface gravity, escape velocity and density
 * are all one line each given a mass and a radius, and none of them could be
 * derived while the only mass in the file was prose. Parsing it back out of the
 * string was the alternative and is exactly the kind of thing that works until
 * somebody writes a mass slightly differently.
 *
 * Values are NASA's planetary fact sheet, and they agree with the strings
 * already here to every digit those strings carry.
 *
 * `equatorialRadiusKm` comes with it, and the two radii are **not**
 * interchangeable. `radiusKm` is the volumetric mean — the right radius for
 * drawing a sphere and the right one for density, since density is mass over
 * the volume the body actually occupies. Surface gravity and escape velocity
 * are quoted at the equator by every reference, and for a fast-rotating gas
 * giant that is a different number: Saturn's equator is 2,036 km further from
 * its centre than the mean, which is a 7% difference in gravity. Using the mean
 * for everything gave Saturn 11.19 m/s² against a published 10.44 — consistent
 * with the app's own data and disagreeing with every source a reader could
 * check it against.
 */
const RAW = [
  {
    id: 'mercury',
    name: 'Mercury',
    color: '#9a938c',
    // Mercury has essentially no atmosphere, so it gets no limb glow — the
    // bare, hard-edged silhouette is the point. (`atmosphere` below is the
    // composition text shown in the info panel; `glow` is the render setting.)
    glow: null,
    radiusKm: 2439.7,
    massKg: 3.3011e23,
    equatorialRadiusKm: 2440.5,
    au: 0.387,
    dayHours: 1407.6, // sidereal: 58.6 Earth days
    retrograde: false,
    axialTilt: 0.034,
    moons: 0,
    diameter: '4,879 km',
    mass: '3.30 × 10²³ kg (0.055 Earth)',
    distance: '57.9 million km (0.39 AU)',
    dayLength: '58.6 Earth days',
    yearLength: '88 Earth days',
    temperature: '−173 °C to 427 °C',
    atmosphere: 'Virtually none — a thin exosphere of oxygen, sodium, hydrogen, helium and potassium',
    description:
      'The smallest planet and the closest to the Sun, Mercury is a cratered ball of rock barely larger than our Moon. With almost no atmosphere to trap heat, it swings between the most extreme temperatures of any planet.',
    facts: [
      'A single day on Mercury (sunrise to sunrise) lasts 176 Earth days — two full Mercurian years.',
      'Despite being closest to the Sun, it is not the hottest planet; Venus is far hotter.',
      'Ice survives in permanently shadowed craters at its poles, never touched by sunlight.',
    ],
    nasaLinks: [
      { label: 'NASA — Mercury overview', url: 'https://science.nasa.gov/mercury/' },
      { label: 'NASA — MESSENGER mission', url: 'https://science.nasa.gov/mission/messenger/' },
    ],
  },
  {
    id: 'venus',
    name: 'Venus',
    color: '#e3b25c',
    // Thick sulphuric cloud deck — a wide, warm, strong halo.
    // Restrained, despite Venus having the deepest atmosphere of the eight.
    // The map is the Magellan *surface*, so a thick gold haze laid over it
    // fights the very thing it is there to show — it washed the golden
    // topography out to a pale tan. Enough haze to read as a dense atmosphere,
    // not enough to bury the ground under it.
    glow: { color: '#ffe6a8', intensity: 0.5, thickness: 0.05 },
    radiusKm: 6051.8,
    massKg: 4.8675e24,
    equatorialRadiusKm: 6051.8,
    au: 0.723,
    dayHours: 5832.5, // 243 Earth days, retrograde
    retrograde: true,
    axialTilt: 177.4,
    moons: 0,
    diameter: '12,104 km',
    mass: '4.87 × 10²⁴ kg (0.815 Earth)',
    distance: '108.2 million km (0.72 AU)',
    dayLength: '243 Earth days (retrograde)',
    yearLength: '224.7 Earth days',
    temperature: '464 °C (average)',
    atmosphere: '96.5% carbon dioxide, 3.5% nitrogen, with clouds of sulfuric acid',
    description:
      "Often called Earth's twin for its similar size, Venus is anything but. A runaway greenhouse effect has left it wrapped in a crushing carbon dioxide atmosphere, making it the hottest planet in the solar system.",
    facts: [
      'Surface pressure is about 92 times Earth\'s — equivalent to being 900 m underwater.',
      'It rotates backwards, so on Venus the Sun rises in the west and sets in the east.',
      'Its day is longer than its year: 243 Earth days to spin once, 225 to orbit the Sun.',
    ],
    nasaLinks: [
      { label: 'NASA — Venus overview', url: 'https://science.nasa.gov/venus/' },
      { label: 'NASA — Magellan mission', url: 'https://science.nasa.gov/mission/magellan/' },
    ],
  },
  {
    id: 'earth',
    name: 'Earth',
    color: '#2b6cb0',
    // Rayleigh scattering: a tight, intense cyan-blue limb. This is the
    // signature look — bright and narrow rather than a soft wash.
    glow: { color: '#5aa9ff', intensity: 1.15, thickness: 0.055 },
    radiusKm: 6371,
    massKg: 5.9722e24,
    equatorialRadiusKm: 6378.137,
    au: 1,
    dayHours: 23.934,
    retrograde: false,
    axialTilt: 23.44,
    moons: 1,
    diameter: '12,756 km',
    mass: '5.97 × 10²⁴ kg',
    distance: '149.6 million km (1 AU)',
    dayLength: '23 hours 56 minutes',
    yearLength: '365.25 days',
    temperature: '15 °C (average)',
    atmosphere: '78% nitrogen, 21% oxygen, 1% argon and trace gases',
    description:
      'Our home world, and the only place in the universe known to harbour life. Earth is the densest planet in the solar system and the only one with liquid water covering most of its surface.',
    facts: [
      'About 71% of the surface is ocean, and 97% of all that water is salt water.',
      'Earth’s magnetic field deflects the solar wind that would otherwise strip away the atmosphere.',
      'The Moon is slowly drifting away at about 3.8 cm per year, gradually lengthening our days.',
    ],
    nasaLinks: [
      { label: 'NASA — Earth overview', url: 'https://science.nasa.gov/earth/' },
      { label: 'NASA — Earth Observatory', url: 'https://earthobservatory.nasa.gov/' },
    ],
  },
  {
    id: 'mars',
    name: 'Mars',
    color: '#c1653a',
    // Thin CO2 atmosphere with suspended dust — faint and warm.
    // Barely there — Mars's atmosphere is under 1% of Earth's pressure.
    glow: { color: '#ff9e63', intensity: 0.5, thickness: 0.04 },
    radiusKm: 3389.5,
    massKg: 6.4171e23,
    equatorialRadiusKm: 3396.2,
    au: 1.524,
    dayHours: 24.62,
    retrograde: false,
    axialTilt: 25.19,
    moons: 2,
    diameter: '6,792 km',
    mass: '6.42 × 10²³ kg (0.107 Earth)',
    distance: '227.9 million km (1.52 AU)',
    dayLength: '24 hours 37 minutes',
    yearLength: '687 Earth days',
    temperature: '−63 °C (average)',
    atmosphere: '95% carbon dioxide, 2.8% nitrogen, 2% argon — and very thin',
    description:
      'The red planet owes its colour to iron oxide dust covering its surface. Mars holds the largest volcano and the deepest canyon in the solar system, and once had rivers and lakes of liquid water.',
    facts: [
      'Olympus Mons rises about 22 km — nearly three times the height of Mount Everest.',
      'Valles Marineris stretches over 4,000 km, long enough to span the United States.',
      'Its two moons, Phobos and Deimos, are likely captured asteroids.',
    ],
    nasaLinks: [
      { label: 'NASA — Mars overview', url: 'https://science.nasa.gov/mars/' },
      { label: 'NASA — Perseverance rover', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/' },
    ],
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    color: '#c79a6f',
    glow: { color: '#ffd9a8', intensity: 0.8, thickness: 0.06 },
    radiusKm: 69911,
    massKg: 1.89819e27,
    equatorialRadiusKm: 71492,
    au: 5.204,
    dayHours: 9.93,
    retrograde: false,
    axialTilt: 3.13,
    moons: 95,
    diameter: '142,984 km',
    mass: '1.898 × 10²⁷ kg (318 Earth)',
    distance: '778.5 million km (5.20 AU)',
    dayLength: '9 hours 56 minutes',
    yearLength: '11.86 Earth years',
    temperature: '−110 °C (cloud tops)',
    atmosphere: '90% hydrogen, 10% helium, with traces of methane and ammonia',
    description:
      'The giant of the solar system — more than twice as massive as all the other planets combined. Jupiter is a ball of gas with no solid surface, banded by ferocious storms that have raged for centuries.',
    facts: [
      'The Great Red Spot is a storm wider than Earth that has been observed for over 350 years.',
      'It spins faster than any other planet, completing a rotation in under 10 hours.',
      'Its gravity acts as a shield, deflecting many comets and asteroids away from the inner planets.',
    ],
    nasaLinks: [
      { label: 'NASA — Jupiter overview', url: 'https://science.nasa.gov/jupiter/' },
      { label: 'NASA — Juno mission', url: 'https://science.nasa.gov/mission/juno/' },
    ],
  },
  {
    id: 'saturn',
    name: 'Saturn',
    color: '#e4cf9f',
    glow: { color: '#ffeec2', intensity: 0.72, thickness: 0.06 },
    radiusKm: 58232,
    massKg: 5.6834e26,
    equatorialRadiusKm: 60268,
    au: 9.583,
    dayHours: 10.66,
    retrograde: false,
    axialTilt: 26.73,
    moons: 274,
    rings: 'saturn',
    diameter: '120,536 km',
    mass: '5.68 × 10²⁶ kg (95 Earth)',
    distance: '1.43 billion km (9.58 AU)',
    dayLength: '10 hours 40 minutes',
    yearLength: '29.4 Earth years',
    temperature: '−140 °C (cloud tops)',
    atmosphere: '96% hydrogen, 3% helium, with traces of methane',
    description:
      'Famous for the most spectacular ring system in the solar system — billions of chunks of ice and rock, most no bigger than a house, spread across a disc 280,000 km wide but often only 10 metres thick.',
    facts: [
      'Saturn is less dense than water; given a big enough ocean, it would float.',
      'Its rings are only about 10 metres thick in places, despite spanning 280,000 km.',
      'Its moon Titan has a thick atmosphere and lakes of liquid methane on its surface.',
    ],
    nasaLinks: [
      { label: 'NASA — Saturn overview', url: 'https://science.nasa.gov/saturn/' },
      { label: 'NASA — Cassini mission', url: 'https://science.nasa.gov/mission/cassini/' },
    ],
  },
  {
    id: 'uranus',
    name: 'Uranus',
    color: '#a9e2e6',
    // Uranus has a real, if faint, ring system — thirteen narrow dark threads,
    // clearly visible in the reference photographs. Because its axis is tipped
    // 97.8°, they hang almost vertically rather than lying flat.
    rings: 'uranus',
    // Methane haze gives the ice giants a cold, even limb.
    glow: { color: '#9beef5', intensity: 0.85, thickness: 0.055 },
    radiusKm: 25362,
    massKg: 8.6810e25,
    equatorialRadiusKm: 25559,
    au: 19.19,
    dayHours: 17.24,
    retrograde: true,
    axialTilt: 97.77,
    moons: 28,
    diameter: '51,118 km',
    mass: '8.68 × 10²⁵ kg (14.5 Earth)',
    distance: '2.87 billion km (19.19 AU)',
    dayLength: '17 hours 14 minutes (retrograde)',
    yearLength: '84 Earth years',
    temperature: '−195 °C',
    atmosphere: '83% hydrogen, 15% helium, 2% methane — the methane gives it its colour',
    description:
      'An ice giant tipped almost completely on its side, Uranus orbits the Sun like a rolling ball. Methane in its upper atmosphere absorbs red light, leaving the pale blue-green colour we see.',
    facts: [
      'Its axis is tilted 98°, so each pole spends 42 years in continuous sunlight, then 42 in darkness.',
      'It was the first planet discovered with a telescope, by William Herschel in 1781.',
      'It has 13 faint rings, far darker and thinner than Saturn’s.',
    ],
    nasaLinks: [
      { label: 'NASA — Uranus overview', url: 'https://science.nasa.gov/uranus/' },
      { label: 'NASA — Voyager mission', url: 'https://science.nasa.gov/mission/voyager/' },
    ],
  },
  {
    id: 'neptune',
    name: 'Neptune',
    color: '#4a7ad4',
    glow: { color: '#6f9dff', intensity: 0.9, thickness: 0.055 },
    radiusKm: 24622,
    massKg: 1.02409e26,
    equatorialRadiusKm: 24764,
    au: 30.07,
    dayHours: 16.11,
    retrograde: false,
    axialTilt: 28.32,
    moons: 16,
    diameter: '49,528 km',
    mass: '1.02 × 10²⁶ kg (17 Earth)',
    distance: '4.5 billion km (30.07 AU)',
    dayLength: '16 hours 6 minutes',
    yearLength: '164.8 Earth years',
    temperature: '−200 °C',
    atmosphere: '80% hydrogen, 19% helium, 1.5% methane',
    description:
      'The most distant planet, and the windiest. Neptune was found by mathematics before it was ever seen — astronomers predicted its position from wobbles in the orbit of Uranus.',
    facts: [
      'Winds reach 2,100 km/h, the fastest recorded anywhere in the solar system.',
      'It has completed only one full orbit of the Sun since its discovery in 1846.',
      'Its largest moon, Triton, orbits backwards and is probably a captured Kuiper Belt object.',
    ],
    nasaLinks: [
      { label: 'NASA — Neptune overview', url: 'https://science.nasa.gov/neptune/' },
      { label: 'NASA — Triton', url: 'https://science.nasa.gov/neptune/moons/triton/' },
    ],
  },
]

export const PLANETS = RAW.map((p, i) => ({
  ...p,
  /** Position from the Sun, 1-indexed. */
  order: i + 1,
  texture: p.id,

  /** See `bodies.js` for what these three mean across the whole registry. */
  kind: 'planet',
  parent: null,
  plane: 'heliocentric',

  /** Real Keplerian elements. The scene solves these at the simulated date. */
  elements: ORBITAL_ELEMENTS[p.id],

  /**
   * Sidereal rotation period in hours, signed: negative is retrograde. Venus
   * and Uranus really do spin backwards.
   */
  rotationHours: p.dayHours * (p.retrograde ? -1 : 1),

  /**
   * The diorama-scale radius, frozen.
   *
   * Not for the 3D scene — that computes `warpRadius(radiusKm, scaleMode)` per
   * frame so it tracks the scale setting. This is for the DOM chrome: the nav
   * chips size themselves off the relative sizes of the planets, and those
   * should stay legible whatever the 3D view is doing. At true scale, chips
   * sized from the real ratio would put Jupiter at 29 times Mercury's width.
   */
  chipRadius: warpRadius(p.radiusKm, 0),
}))

/* `getPlanet`, `PLANETS_BY_ID` and `focusDistance` all used to live here, and
   all moved to `bodies.js` when moons arrived.

   Lookups had to move because "the selected thing" can now be a moon, and a
   table of eight planets cannot answer that. `focusDistance` had to move for a
   subtler reason: a moon's drawn radius comes off a different curve from a
   planet's, so the camera can no longer work out where to park from `radiusKm`
   alone — it has to know what kind of body it is looking at. */
