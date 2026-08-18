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
    story: [
      'It is named for the serpent of ancient Egyptian myth that attacks the Sun\'s boat each night, and the name was chosen while the impact probability was still non-zero — the discoverers were fans of the television series where Apophis is a villain, and the mythological reading came free.',
      'What makes 2029 worth waiting for is not the risk, which is gone, but the experiment. Nothing this size has been observed passing this close, and Earth\'s gravity will not merely bend the path: the tidal stress across a body 370 metres long is enough to shift loose material on its surface. Landslides, seismic shaking, a resurfacing of parts of it — all predicted, none ever watched. A close pass is a way of probing an asteroid\'s interior structure that nobody has to launch anything to arrange.',
      'Ruling out the later encounters took work that has nothing to do with gravity. An asteroid absorbs sunlight on its day side and radiates the heat away slightly later, as it turns, and that lopsided emission is a tiny thrust — the Yarkovsky effect. Over decades it moves an orbit by more than the width of a keyhole that a future impact would have to pass through, so the 2068 possibility could not be dismissed until radar in 2021 measured how fast Apophis was actually drifting.',
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
    story: [
      'Vesta melted early. Aluminium-26, a short-lived radioactive isotope present when the solar system formed, released enough heat in a body this size to turn it molten within a few million years — and because the meteorites from it can be dated directly, that timing is measured rather than modelled. Vesta had a crust, a mantle and a core while the Earth was still accumulating.',
      'That account has recently been complicated by the spacecraft that established it. A 2025 re-analysis of Dawn\'s radio tracking gave a moment of inertia close to that of a uniform body, which is not what a differentiated one should show. Either Vesta\'s core is much smaller than assumed, or it never fully separated, or the tracking is being read wrong. The measurements this app uses for Vesta\'s mass and size come from that same re-analysis.',
      'Its surface records the other half of its history. Two overlapping basins sit at the south pole, one older and mostly buried by the other, and troughs run round Vesta\'s equator that are almost certainly fractures opened by those impacts — a body ringing and cracking rather than shattering.',
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
    ],
    story: [
      'Pallas is expensive. A spacecraft leaving Earth is already moving in the plane the planets share, and getting out of that plane costs velocity that no gravity assist in the inner solar system can cheaply supply. At 35° Pallas is far enough out of it that reaching orbit there costs more than reaching Pluto — which is why the third-largest object between Mars and Jupiter is also the largest thing in the inner solar system nobody has photographed closely.',
      'Its discoverer drew the wrong conclusion from it, productively. Heinrich Olbers proposed that Ceres and Pallas were fragments of a full-sized planet that had broken apart, which explained why two objects were sharing one orbital slot and predicted that more pieces would turn up. More pieces did turn up, and the hypothesis survived for most of a century before the numbers killed it: everything in the belt put together would not make a body a third the size of the Moon, and the belt was never a planet — it is a region where Jupiter stirred the material too vigorously for one to form.',
      'What Pallas is made of is still partly open. Its density is low enough to suggest a substantial fraction of ice under a dark surface, which would make it more like Ceres than like Vesta, and a steeply inclined orbit through a crowded belt has been battering it for four billion years.',
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
      'Its family has some 7,000 known members, one of the largest collision families in the belt.',
    ],
    story: [
      'Hygiea is the fourth-largest asteroid and it went unnoticed for half a century after the first three, which says everything about its surface. It reflects about one photon in fourteen. Carbonaceous material this dark is common in the outer belt and it is the reason the size ranking and the discovery order diverge so sharply here.',
      'The 2019 observations that showed it to be nearly round created a category problem nobody has resolved. Roundness under self-gravity is one of the IAU\'s three tests for a dwarf planet, and Hygiea passes the others; if the shape holds up it would be the smallest body in the solar system to qualify, and smaller than Ceres by a good margin. The IAU has not acted on it, and there is no procedure that obliges it to.',
      'The oddity is that the roundness may have nothing to do with gravity slowly winning. Hygiea\'s family of fragments implies an impact that destroyed the original body entirely, and what orbits there now is most likely the rubble falling back together — a shape settled in hours rather than eons.',
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
    story: [
      'For forty-three years the solar system had eleven planets. Ceres, Pallas, Juno and Vesta were found between 1801 and 1807, and each was announced as a planet and printed as one in textbooks and almanacs; Juno was the third of them, found by Karl Harding at a private observatory in Lilienthal.',
      'Then nothing for thirty-eight years, and then a flood. Astraea in 1845, Hebe and Iris and Flora in 1847, and by 1851 there were fifteen. Naming and numbering them as planets stopped being tenable, and the word William Herschel had coined in 1802 — asteroid, star-like, meant as a description of how they looked through a telescope rather than what they were — won by default. It had been resented for decades by astronomers who felt it demoted their discoveries, which is an argument this app\'s dwarf planets went through again in 2006.',
      'Juno was one of the first asteroids anyone got a shape out of. An occultation in 1979 and later adaptive-optics imaging showed it to be distinctly irregular, with a large bite out of one side.',
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
    story: [
      'Psyche is regularly described as being worth ten quintillion dollars, which is a number obtained by weighing the iron and looking up the price. It is not a meaningful figure — the metal\'s price is what it is because metal is scarce on Earth, and any quantity large enough to be worth fetching would end that — but it has done more than anything else to make people aware of the mission.',
      'The science is more interesting than the arithmetic and less settled than the headline. If Psyche were a solid exposed core it would be about twice as dense as it measures; the numbers instead point to something substantially metallic but very porous, or a mixture of metal and rock that never fully separated. Hubble has also detected hydroxyl on it, which implies water-bearing minerals — not what a stripped core should be carrying.',
      'The spacecraft will settle it, and it is getting there by a route worth noting. Psyche flies on solar-electric propulsion: thrusters that ionise xenon and accelerate it electrically, producing about as much force as the weight of a coin, continuously, for years. Almost the entire journey is under thrust.',
    ],
    nasaLinks: [
      { label: 'NASA — Psyche the asteroid', url: 'https://science.nasa.gov/solar-system/asteroids/16-psyche/' },
      { label: 'NASA — Psyche mission', url: 'https://science.nasa.gov/mission/psyche/' },
    ],
  },
]
