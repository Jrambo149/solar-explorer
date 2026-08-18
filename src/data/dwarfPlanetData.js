/**
 * Dwarf planets — the five the IAU currently recognises.
 *
 * Same shape as the planets in `planetData.js`, minus the things none of them
 * have: no rings, and no `glow`. Only Pluto has an atmosphere worth the name
 * and it is a seasonal frost that freezes out entirely for most of the orbit,
 * so a permanent limb haze would be the wrong picture even there.
 *
 * Where the elements come from differs by body, and it matters. Pluto is in
 * the same JPL table as the eight planets, with full precession rates. The
 * other four are osculating elements from the Small-Body Database — see
 * `dwarfElements.js`.
 */
export const DWARF_PLANETS_RAW = [
  {
    id: 'ceres',
    name: 'Ceres',
    color: '#8e8880',
    glow: null,
    radiusKm: 469.7,
    au: 2.766,
    dayHours: 9.074,
    retrograde: false,
    axialTilt: 4,
    moons: 0,
    diameter: '939 km',
    mass: '9.4 × 10²⁰ kg (0.00016 Earth)',
    distance: '414 million km (2.77 AU)',
    dayLength: '9 hours 4 minutes',
    yearLength: '4.6 Earth years',
    temperature: '−105 °C (average)',
    atmosphere: 'A tenuous, intermittent water-vapour exosphere',
    description:
      "The largest object in the asteroid belt and the only dwarf planet in the inner solar system. Ceres holds about a quarter of the belt's entire mass, and beneath its dusty crust may lie more fresh water than Earth has.",
    facts: [
      'It was classed as a planet for fifty years after its 1801 discovery, then demoted to an asteroid, then promoted to a dwarf planet in 2006.',
      'The bright spots in Occator Crater are salt deposits left by briny water that reached the surface.',
      'Dawn became the first spacecraft to orbit a dwarf planet when it arrived in 2015.',
    ],
    story: [
      'Ceres was found because of a gap. Eighteenth-century astronomers had noticed that the planets\' distances from the Sun fit a rough numerical sequence, and the sequence had a vacancy between Mars and Jupiter. A group of astronomers calling themselves the Celestial Police divided the zodiac between them and went looking. Giuseppe Piazzi, who was not one of them, found it first, on the first night of the nineteenth century.',
      'Then he lost it. Ceres moved into the Sun\'s glare after six weeks of observation and by the time it should have re-emerged nobody could say where to point. The problem — an orbit from a short arc of sky positions — was thought impractical. Carl Friedrich Gauss, then twenty-four, worked out a method for it, published a prediction, and Ceres was recovered a year later within half a degree of where he said it would be. The method he invented for the occasion is still how orbits are determined, including every orbit in this app.',
      'What Dawn found there in 2015 was stranger than a large rock. Ceres carries clays formed in the presence of ammonia, which does not survive as ice this close to the Sun — the suggestion being that Ceres formed much further out and was moved inward. Beneath the crust there is very probably a residual layer of brine, still liquid, still occasionally reaching the surface. That possibility is why Dawn was not crashed into it at the end of the mission: it was left in a stable orbit instead, where it will stay for decades without contaminating anything.',
    ],
    nasaLinks: [
      { label: 'NASA — Ceres overview', url: 'https://science.nasa.gov/dwarf-planets/ceres/' },
      { label: 'NASA — Dawn mission', url: 'https://science.nasa.gov/mission/dawn/' },
    ],
  },
  {
    id: 'pluto',
    name: 'Pluto',
    color: '#c2a68d',
    glow: null,
    radiusKm: 1188.3,
    au: 39.48,
    dayHours: 153.293,
    retrograde: true,
    axialTilt: 122.53,
    moons: 5,
    diameter: '2,377 km',
    mass: '1.30 × 10²² kg (0.0022 Earth)',
    distance: '5.9 billion km (39.48 AU average)',
    dayLength: '6.4 Earth days (retrograde)',
    yearLength: '248 Earth years',
    temperature: '−229 °C (average)',
    atmosphere:
      'Thin nitrogen, methane and carbon monoxide — which freezes onto the surface as Pluto recedes from the Sun',
    description:
      'For 76 years the ninth planet, and since 2006 a dwarf planet — the largest known body in the Kuiper Belt. New Horizons found it in 2015 to be far more alive than anyone expected: nitrogen glaciers, water-ice mountains and a haze-layered sky.',
    facts: [
      'Its orbit is tilted 17° and eccentric enough that for twenty years of each circuit it is closer to the Sun than Neptune.',
      'Pluto and its largest moon Charon are tidally locked to each other, each permanently showing the other one face.',
      'The heart-shaped Tombaugh Regio is a basin of nitrogen ice that convects and resurfaces itself.',
    ],
    story: [
      'Pluto was found by a search for something that does not exist. Percival Lowell had calculated that irregularities in Neptune\'s motion implied a further planet, and left an endowment to find it; the irregularities turned out to be errors in Neptune\'s assumed mass, and there was nothing to find. Clyde Tombaugh, comparing photographic plates taken days apart at the observatory Lowell founded, found Pluto anyway in 1930 — close enough to Lowell\'s predicted position to look like a triumph, and by coincidence rather than calculation. Pluto is far too small to have tugged on anything.',
      'The name came from an eleven-year-old. Venetia Burney, in Oxford, suggested the Roman god of the underworld over breakfast; her grandfather passed it to an astronomer friend, and it was adopted unanimously within months. She lived to see the spacecraft launched, and a dust counter aboard New Horizons carries her name.',
      'New Horizons left Earth in January 2006 with Pluto a planet and arrived in July 2015 with it a dwarf — the reclassification happened seven months into a nine-year flight. What it found was a world with an active surface: mountains of water ice standing kilometres high, because at these temperatures water ice is bedrock and nitrogen ice is the soft material that flows around it. The atmosphere it measured is thinning as Pluto recedes from the Sun, and much of it is expected to freeze onto the ground entirely before the orbit brings it back.',
    ],
    nasaLinks: [
      { label: 'NASA — Pluto overview', url: 'https://science.nasa.gov/dwarf-planets/pluto/' },
      { label: 'NASA — New Horizons', url: 'https://science.nasa.gov/mission/new-horizons/' },
    ],
  },
  {
    id: 'haumea',
    name: 'Haumea',
    color: '#d6d2ca',
    glow: null,
    /*
     * The mean radius of a body that is anything but spherical: Haumea is
     * 2,322 x 1,704 x 1,026 km. The scene draws a sphere, which is the one
     * thing about Haumea that is plainly wrong — see `facts` below.
     *
     * Was 780 km, from the pre-occultation shape model, and the density check
     * in `fetch-body-masses.mjs` is what found it: paired with Haumea's
     * measured mass it implied 2.02 g/cm³ against a published 1.885, which is
     * a 7% error in a number nothing else in the app would have contradicted.
     * 798 km is the radius that mass and that density actually agree on.
     */
    radiusKm: 798,
    au: 43.06,
    dayHours: 3.915,
    retrograde: false,
    /*
     * Derived from the pole rather than published, which makes it the one
     * `axialTilt` in this file that is not an independent number.
     *
     * Haumea's obliquity is not quoted anywhere reliable; what *is* measured is
     * its ring plane, from the 2017 occultation, and this is the angle between
     * that pole and Haumea's own orbit normal. It was a placeholder `0` until
     * the poles landed, which drew the most tilted large body in the solar
     * system bolt upright. See `BODY_POLES` in `scene/pole.js` for the source
     * and for why the check that covers it is weaker than the others.
     */
    axialTilt: 87.1,
    moons: 2,
    diameter: '~1,560 km (mean); 2,100 km along its long axis',
    mass: '4.0 × 10²¹ kg (0.00067 Earth)',
    distance: '6.4 billion km (43.06 AU average)',
    dayLength: '3 hours 55 minutes',
    yearLength: '283 Earth years',
    temperature: '−241 °C',
    atmosphere: 'None',
    description:
      'A Kuiper Belt body spinning so fast that it has been pulled into an ellipsoid twice as long as it is wide. Haumea turns once every four hours — the fastest rotation of any large object in the solar system.',
    facts: [
      'It is not a sphere and this scene draws it as one. Haumea is genuinely egg-shaped, stretched by its own spin.',
      'A ring was discovered around it in 2017, the first ever found at a body beyond Neptune.',
      'Its two moons and a family of icy fragments sharing its orbit are all thought to be debris from one ancient collision.',
    ],
    story: [
      'Haumea\'s discovery is the one genuinely contested claim in this part of the sky. A team at Sierra Nevada Observatory in Spain announced it in July 2005; a team at Caltech had been observing the same object since 2003 and had published an abstract with a coded designation days earlier. The Spanish group had accessed the Caltech observation logs, which were online and unprotected. The IAU credited the discovery to the Spanish observatory and used the Caltech team\'s proposed name, and left it there.',
      'The name is from Hawaiian myth — a goddess of childbirth whose children were made from parts of her own body — and it fits the object better than most mythological names manage. Haumea appears to have been struck hard enough to lose most of its icy mantle, and the fragments are still out there: a dozen or so bodies on similar orbits with surfaces of nearly pure water ice, unlike anything else in the Kuiper Belt. It is the only collisional family known beyond Neptune.',
      'What is left is mostly rock, spun up by the same impact into a shape it holds only because it is turning. At four hours a rotation Haumea\'s equator is close to the speed at which material would simply leave, and the ring found in 2017 sits just outside that line.',
    ],
    nasaLinks: [
      { label: 'NASA — Haumea overview', url: 'https://science.nasa.gov/dwarf-planets/haumea/' },
    ],
  },
  {
    id: 'makemake',
    name: 'Makemake',
    color: '#c19d86',
    glow: null,
    radiusKm: 715,
    au: 45.57,
    dayHours: 22.827,
    retrograde: false,
    axialTilt: 0,
    moons: 1,
    diameter: '1,430 km',
    mass: '3.1 × 10²¹ kg (0.00052 Earth)',
    distance: '6.8 billion km (45.57 AU average)',
    dayLength: '22 hours 50 minutes',
    yearLength: '308 Earth years',
    temperature: '−239 °C',
    atmosphere: 'None persistent — any nitrogen atmosphere has frozen out',
    description:
      'The second-brightest object in the Kuiper Belt after Pluto, and one of the reasons Pluto was reclassified: its 2005 discovery made clear that Pluto was not a lone outlier but one of a population.',
    facts: [
      'Its surface is covered in methane ice in frozen pellets up to a centimetre across.',
      'Its one known moon, nicknamed MK 2, is about 160 km across and was not found until 2016.',
    ],
    story: [
      'It was found the week after Easter 2005 and the discovery team nicknamed it the Easterbunny while the paperwork went through. The formal name had to fit: the IAU requires a creation deity for objects on orbits like this one, and Rapa Nui — Easter Island — supplied one that kept the joke and satisfied the rule.',
      'The expectation was a small Pluto, and in 2011 Makemake passed in front of a star and disappointed it. An atmosphere would have made the star dim gradually at the edges; instead it cut off sharply, which means there is essentially no atmosphere at all. Makemake has the surface methane that on Pluto sublimates into one — it is simply too cold, or too far out at the moment, for enough of it to be gas.',
      'The occultation also tightened the size, and left a puzzle: thermal measurements had suggested part of the surface was dark, which sat oddly with an object this bright. The moon found in 2016 is a reasonable answer. It is very dark, and everything measured before then had been measuring both together.',
    ],
    nasaLinks: [
      {
        label: 'NASA — Makemake overview',
        url: 'https://science.nasa.gov/dwarf-planets/makemake/',
      },
    ],
  },
  {
    id: 'eris',
    name: 'Eris',
    color: '#ded9d1',
    glow: null,
    radiusKm: 1163,
    au: 67.93,
    dayHours: 25.9,
    retrograde: false,
    axialTilt: 0,
    moons: 1,
    diameter: '2,326 km',
    mass: '1.65 × 10²² kg (0.0028 Earth)',
    distance: '10.2 billion km (67.9 AU average)',
    dayLength: '25 hours 54 minutes',
    yearLength: '560 Earth years',
    temperature: '−243 °C',
    atmosphere:
      'None at present — its nitrogen atmosphere is frozen to the surface and will only return near perihelion',
    description:
      "The most massive dwarf planet known, and the object whose discovery ended Pluto's planethood: Eris is slightly heavier than Pluto, and either both were planets or neither was. Its orbit is steeply tilted and so eccentric that it ranges from inside Pluto's to three times further out.",
    facts: [
      'Its 44° orbital inclination is the steepest of any dwarf planet — it spends most of its orbit far above or below the plane the planets share.',
      'A round trip takes 560 years; it last passed perihelion around 1699.',
      'Its surface is among the most reflective in the solar system, throwing back about 96% of the light that reaches it.',
    ],
    story: [
      'Eris is the reason there is a definition. It was picked out of images from 2003 by a Caltech team in January 2005, and it was immediately clear that it was at least Pluto\'s size — which left astronomy with a choice it had been avoiding since Pluto\'s own status started looking shaky. Either the solar system had a tenth planet, and probably more to come, or it had eight and a category of smaller round things. The IAU met in Prague in August 2006 and chose the second.',
      'The discovery team called it Xena while it was unnamed, after the television series. Eris, the Greek goddess of discord, was proposed once the argument it caused was over, and its moon Dysnomia — the daimon of lawlessness — is a joke at Xena\'s actress\'s expense that the IAU appears not to have noticed.',
      'Its brightness is a consequence of its distance rather than its composition. Eris is near the far end of an orbit that takes it three times further from the Sun than Pluto ever gets, and out there whatever atmosphere it has has frozen out onto the surface as a fresh, unweathered frost. As it comes back in over the next couple of centuries that frost should sublimate again, and Eris should get darker.',
    ],
    nasaLinks: [
      { label: 'NASA — Eris overview', url: 'https://science.nasa.gov/dwarf-planets/eris/' },
    ],
  },
]
