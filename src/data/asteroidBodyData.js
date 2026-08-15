/**
 * The asteroids big enough to be places.
 *
 * Six of them, and the line between these and the three and a half thousand in
 * `asteroids.js` is worth stating: that file is a *population*, drawn as an
 * instanced field of markers whose value is the shape they make together. These
 * are **bodies** — they have a globe, a size, a rotation, a page, and a fitted
 * ephemeris, and you can search for one and fly to it.
 *
 * Ceres is the precedent and appears in both. It is a rock in the belt data and
 * a world in `dwarfPlanetData.js`, because both are true and each file is
 * answering a different question.
 *
 * ## Why these six
 *
 * **Vesta, Pallas and Hygiea** are the three largest after Ceres, and together
 * with it they are about half the mass of the entire belt. **Juno** is here for
 * history rather than size: with Ceres, Pallas and Vesta it was one of the
 * original four, every one of them counted as a planet for about fifty years
 * until the discoveries kept coming and the category gave way. **Psyche** is
 * here because a spacecraft of the same name is already on this app's roster
 * and reaches it in 2029.
 *
 * ## What is measured and what is not
 *
 * Diameters, rotation periods and masses are published values — these are
 * bodies that have been visited, radar-mapped or occulted, so the numbers are
 * real measurements rather than estimates from brightness.
 *
 * The axial tilts are the exception and are worth flagging. Vesta's is known
 * precisely because Dawn orbited it for a year. The others are derived from
 * lightcurve inversion, are quoted with wide error bars in the literature, and
 * are here only so the globes do not all spin bolt upright. Nothing in this app
 * turns on them.
 *
 * These are not in `dwarfPlanetData.js` because they are not dwarf planets, and
 * the difference is not a technicality: a dwarf planet has pulled itself round
 * under its own gravity. Ceres has. Vesta nearly has and lost the argument by
 * being battered out of shape; Pallas, Hygiea, Juno and Psyche are not close.
 */

export const ASTEROID_BODIES_RAW = [
  {
    id: 'apophis',
    name: 'Apophis',
    color: '#9a8b7a',
    glow: null,
    radiusKm: 0.185,
    au: 0.922,
    dayHours: 30.6,
    retrograde: false,
    axialTilt: 0,
    moons: 0,
    diameter: '370 m (elongated: about 450 × 170 m)',
    mass: '2.7 × 10¹⁰ kg',
    distance: '138 million km (0.92 AU), inside Earth’s orbit',
    dayLength: '30 hours 36 minutes, tumbling',
    yearLength: '324 Earth days — 423 after 2029',
    temperature: '−10 to 70 °C',
    atmosphere: 'None',
    description:
      'A peanut-shaped rock about the length of three football pitches, and the only object in this app whose orbit changes while you watch. On 13 April 2029 it passes 31,000 km above the Earth’s surface — closer than the geostationary satellites — and Earth’s gravity will bend its path enough to turn it into a different kind of asteroid.',
    facts: [
      'Two billion people will be able to see it with the naked eye, moving visibly against the stars: a third-magnitude point crossing the sky over Europe and Africa in a couple of hours. Nothing this large has ever been watched passing this close.',
      'For a few days after its discovery in 2004 it held the highest impact rating any asteroid has ever been given. Older photographs were then found, the orbit was tightened, and it dropped to zero. It is now ruled out for at least a century.',
      'The encounter changes what it is. It arrives an Aten — an asteroid whose orbit lies mostly inside Earth’s — and leaves an Apollo, crossing from outside. Its year goes from 324 days to 423.',
      'It tumbles rather than spins: it turns once about one axis every 27.4 hours while that axis itself swings round every 263 hours, so it has no fixed day at all.',
      'OSIRIS-APEX, the extended mission of the spacecraft that sampled Bennu, arrives a month after the flyby to see what the encounter did to it.',
    ],
    nasaLinks: [
      { label: 'NASA — Apophis', url: 'https://science.nasa.gov/solar-system/asteroids/apophis/' },
      { label: 'CNEOS — Apophis 2029 approach', url: 'https://cneos.jpl.nasa.gov/apophis/' },
    ],
  },

  {
    id: 'vesta',
    name: 'Vesta',
    color: '#a89b86',
    glow: null,
    radiusKm: 262.7,
    au: 2.362,
    dayHours: 5.342,
    retrograde: false,
    axialTilt: 27,
    moons: 0,
    diameter: '525 km (irregular: 573 × 557 × 446 km)',
    mass: '2.59 × 10²⁰ kg (0.28 Ceres)',
    distance: '353 million km (2.36 AU)',
    dayLength: '5 hours 21 minutes',
    yearLength: '3.6 Earth years',
    temperature: '−188 to −18 °C',
    atmosphere: 'None',
    description:
      'The second most massive body in the asteroid belt, and the only one bright enough to see from Earth without a telescope. Vesta is a survivor from the first few million years of the solar system — a body that got hot enough to separate into a metal core, a rocky mantle and a basalt crust before it stopped growing, which makes it less an asteroid than an unfinished planet.',
    facts: [
      'A colossal impact near its south pole blasted out a crater 500 km across — nearly the width of Vesta itself — and left a central peak higher than any mountain on Earth.',
      'About one meteorite in twenty found on Earth came from that impact. They are the only rocks we have from a body whose exact origin is known.',
      'Dawn orbited it for fourteen months in 2011–12, then left for Ceres — the first spacecraft ever to orbit two worlds.',
    ],
    nasaLinks: [
      { label: 'NASA — Vesta overview', url: 'https://science.nasa.gov/solar-system/asteroids/vesta/' },
      { label: 'NASA — Dawn mission', url: 'https://science.nasa.gov/mission/dawn/' },
    ],
  },

  {
    id: 'pallas',
    name: 'Pallas',
    color: '#8f8e88',
    glow: null,
    radiusKm: 256,
    au: 2.771,
    dayHours: 7.813,
    retrograde: false,
    axialTilt: 84,
    moons: 0,
    diameter: '512 km',
    mass: '2.04 × 10²⁰ kg (0.22 Ceres)',
    distance: '415 million km (2.77 AU)',
    dayLength: '7 hours 49 minutes',
    yearLength: '4.6 Earth years',
    temperature: '−109 °C (average)',
    atmosphere: 'None',
    description:
      'The third largest asteroid, and by far the most awkwardly placed. Pallas orbits at 35° to the plane every other large body keeps to, which means no spacecraft has ever been able to afford the trip — reaching it costs more fuel than reaching Pluto.',
    facts: [
      'Its steep, tilted orbit crosses the belt twice per circuit, so it collides with other asteroids far harder and far more often than its neighbours do. Hubble images show a surface covered in craters.',
      'Discovered in 1802 by Heinrich Olbers, who found it while looking for more of Ceres.',
      'It is the largest asteroid never visited by a spacecraft, and the largest object in the inner solar system we have no close-up of.',
    ],
    nasaLinks: [
      { label: 'NASA — Asteroids overview', url: 'https://science.nasa.gov/solar-system/asteroids/' },
    ],
  },

  {
    id: 'hygiea',
    name: 'Hygiea',
    color: '#6f6b66',
    glow: null,
    radiusKm: 216.5,
    au: 3.143,
    dayHours: 13.83,
    retrograde: false,
    axialTilt: 30,
    moons: 0,
    diameter: '433 km',
    mass: '8.7 × 10¹⁹ kg (0.09 Ceres)',
    distance: '470 million km (3.14 AU)',
    dayLength: '13 hours 50 minutes',
    yearLength: '5.6 Earth years',
    temperature: '−109 °C (average)',
    atmosphere: 'None',
    description:
      'The fourth largest asteroid, and a very dark one — it reflects about seven per cent of the light that reaches it, which is why an object this size was not found until 1849. It is the parent of one of the belt’s largest families: thousands of fragments sharing its orbit, all of them pieces of whatever hit it.',
    facts: [
      'Images from the Very Large Telescope in 2019 showed it to be very nearly round, which would make it the smallest body in the solar system to have pulled itself into a sphere.',
      'That roundness is odd: it is almost certainly a rubble pile reassembled after a catastrophic impact, rather than a body that was ever solid.',
      'Its family has some 7,000 known members, one of the largest collision families in the belt.',
    ],
    nasaLinks: [
      { label: 'NASA — Asteroids overview', url: 'https://science.nasa.gov/solar-system/asteroids/' },
    ],
  },

  {
    id: 'juno',
    name: 'Juno',
    color: '#a08a72',
    glow: null,
    radiusKm: 127,
    au: 2.669,
    dayHours: 7.21,
    retrograde: false,
    axialTilt: 50,
    moons: 0,
    diameter: '254 km',
    mass: '2.7 × 10¹⁹ kg (0.03 Ceres)',
    distance: '399 million km (2.67 AU)',
    dayLength: '7 hours 13 minutes',
    yearLength: '4.4 Earth years',
    temperature: '−106 °C (average)',
    atmosphere: 'None',
    description:
      'The third asteroid ever found, in 1804, and for forty-three years one of only four objects between Mars and Jupiter that anyone knew about. All four were called planets until the discoveries started arriving faster than names could be found for them.',
    facts: [
      'It is one of the brightest asteroids despite its modest size, because its surface is unusually reflective — bright enough to be glimpsed with binoculars.',
      'Its orbit is noticeably eccentric, carrying it from inside the main belt out past most of it and back.',
      'The Juno spacecraft at Jupiter is named for the same goddess, not for this asteroid.',
    ],
    nasaLinks: [
      { label: 'NASA — Asteroids overview', url: 'https://science.nasa.gov/solar-system/asteroids/' },
    ],
  },

  {
    id: 'psyche',
    name: 'Psyche',
    color: '#8c8079',
    glow: null,
    radiusKm: 111,
    au: 2.922,
    dayHours: 4.196,
    retrograde: false,
    axialTilt: 95,
    moons: 0,
    diameter: '222 km (irregular: 278 × 238 × 171 km)',
    mass: '2.29 × 10¹⁹ kg (0.02 Ceres)',
    distance: '437 million km (2.92 AU)',
    dayLength: '4 hours 12 minutes',
    yearLength: '5.0 Earth years',
    temperature: '−135 °C (average)',
    atmosphere: 'None',
    description:
      'An asteroid made substantially of metal, and the reason a spacecraft is on its way there now. The leading explanation was that it is the exposed core of a small planet stripped of its rock by collisions — the only way anyone will ever see the inside of a world without digging through one.',
    facts: [
      'Radar shows it is far denser than a rocky asteroid but less metallic than a solid core would be, so the stripped-core story is now one possibility among several.',
      'NASA’s Psyche launched in October 2023 and arrives in 2029, after a Mars flyby in 2026.',
      'It turns once every four hours, faster than almost anything else its size in the belt.',
    ],
    nasaLinks: [
      { label: 'NASA — Psyche the asteroid', url: 'https://science.nasa.gov/solar-system/asteroids/16-psyche/' },
      { label: 'NASA — Psyche mission', url: 'https://science.nasa.gov/mission/psyche/' },
    ],
  },
]
