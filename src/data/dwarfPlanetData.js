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
    // The mean radius of a body that is anything but spherical: Haumea is
    // roughly 2,100 x 1,600 x 1,100 km. The scene draws a sphere, which is the
    // one thing about Haumea that is plainly wrong — see `facts` below.
    radiusKm: 780,
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
      'It is named after the creator god of the Rapa Nui people of Easter Island.',
      'Its one known moon, nicknamed MK 2, is about 160 km across and was not found until 2016.',
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
    nasaLinks: [
      { label: 'NASA — Eris overview', url: 'https://science.nasa.gov/dwarf-planets/eris/' },
    ],
  },
]
