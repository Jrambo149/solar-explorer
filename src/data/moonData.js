/**
 * Major moons.
 *
 * Twenty-five of the roughly three hundred known, in orbital order within each
 * system, chosen because each one is a place rather than a rock: our own Moon,
 * the two lumps circling Mars, the four Galileans, Saturn's seven round icy
 * moons, the five Uranian moons Voyager 2 photographed, Triton, and the whole
 * Pluto system.
 *
 * Complete systems rather than highlights, where the system is small enough to
 * finish — all five of Pluto's moons, all five large Uranian ones. A moon system
 * read whole shows something a selection cannot: the resonances that tie the
 * orbits together, and how much emptier the outer systems are.
 *
 * **Rotation is derived, not stated, for all but four.** Every moon here large
 * enough to have settled is tidally locked to its parent, so its rotation period
 * *is* its orbital period and there is no second number to give; `bodies.js`
 * takes the spin from the orbital elements so the two cannot drift apart the way
 * a hand-entered pair would.
 *
 * The exceptions are Styx, Nix, Kerberos and Hydra, which carry an explicit
 * `spinHours`. They are genuinely not locked: the gravity of the Pluto–Charon
 * pair keeps changing as the two swing around each other, and that is enough to
 * leave all four small moons tumbling chaotically. Hydra turns once every ten
 * hours while taking 38 days to go round. Deriving their spin from their orbit
 * would state something known to be false.
 *
 * `axialTilt` is absent for all but the Moon. A moon is drawn inside its
 * parent's frame, already inclined with the planet, and its own obliquity to
 * its orbit is under a degree for every one of them — except ours, which is
 * 6.68° and is the only moon here with a published IAU pole, so it is the only
 * one whose tilt the scene actually orients from and the dossier prints.
 */
export const MOONS_RAW = [
  {
    id: 'luna',
    name: 'Moon',
    parent: 'earth',
    color: '#a8a29a',
    radiusKm: 1737.4,
    massKg: 7.342e22,
    // To its own orbit, the convention this repo uses throughout. Quoted
    // against the ecliptic instead it is 1.54°, which is the figure most
    // often printed and the one that makes the Moon sound untilted.
    axialTilt: 6.68,
    diameter: '3,475 km',
    mass: '7.35 × 10²² kg (0.0123 Earth)',
    distance: '384,400 km from Earth',
    yearLength: '27.3 days per orbit',
    temperature: '−173 °C to 127 °C',
    atmosphere: 'Effectively none — a trace exosphere of helium, neon and argon',
    description:
      "The only world beyond Earth that humans have stood on, and by far the largest moon relative to its planet. It stabilises Earth's tilt, drives the tides, and is slowly drifting away at about 3.8 cm a year.",
    facts: [
      'It is tidally locked, so the same face has looked at Earth for billions of years.',
      'It almost certainly formed from debris thrown off when a Mars-sized body struck the early Earth.',
      'The dark maria are ancient basalt floods — vast lava plains, not seas.',
    ],
    story: [
      "The Moon is a quarter of Earth's diameter, which makes the pair almost a double planet — no other rocky world has a satellite anything like this size relative to itself. It is almost certainly the debris of a collision: a Mars-sized body struck the early Earth, and what did not sink into the core spun out into a ring and gathered.",
      "It keeps one face turned toward us because tides have slowed its spin until the day matches the orbit, and it is still taking energy from Earth's rotation — receding 3.8 cm a year while our days lengthen by 1.8 milliseconds a century. Twelve people have walked on it, all of them between 1969 and 1972.",
    ],
    nasaLinks: [
      { label: "NASA — Earth's Moon", url: 'https://science.nasa.gov/moon/' },
      { label: 'NASA — Artemis', url: 'https://science.nasa.gov/artemis/' },
    ],
  },
  {
    id: 'phobos',
    name: 'Phobos',
    parent: 'mars',
    color: '#7d7168',
    radiusKm: 11.267,
    massKg: 1.0659e16,
    diameter: '27 × 22 × 18 km',
    mass: '1.06 × 10¹⁶ kg',
    distance: '9,376 km from Mars',
    yearLength: '7 hours 39 minutes per orbit',
    temperature: '−40 °C to −112 °C',
    atmosphere: 'None',
    description:
      'A dark, cratered lump orbiting closer to its planet than any other moon in the solar system — so close that it circles Mars three times a Martian day, rising in the west and setting in the east.',
    facts: [
      'It is spiralling inward by about 2 cm a year and will break up into a ring, or hit Mars, within 50 million years.',
      'Stickney, its largest crater, is 9 km across on a moon only 22 km wide — the impact nearly destroyed it.',
      'It is drawn here as a sphere, which is generous: Phobos is far too small for gravity to have rounded it.',
    ],
    story: [
      "Phobos is 22 km across, shaped like a battered potato, and orbits closer to its planet than any other moon in the solar system — 6,000 km above the surface, inside the height where a body should be torn apart. It goes round in 7 hours 39 minutes, faster than Mars turns, so from the ground it rises in the west and sets in the east twice a day.",
      "It is also falling. Tides are drawing it inward about 2 cm a year, and in perhaps 50 million years it will either break into a ring or hit. The long grooves across its surface were once read as impact scars; the better explanation now is that they are stretch marks, from a moon already coming apart.",
    ],
    nasaLinks: [{ label: 'NASA — Phobos', url: 'https://science.nasa.gov/mars/moons/phobos/' }],
  },
  {
    id: 'deimos',
    name: 'Deimos',
    parent: 'mars',
    color: '#8a7d70',
    radiusKm: 6.2,
    massKg: 1.4762e15,
    diameter: '15 × 12 × 11 km',
    mass: '1.48 × 10¹⁵ kg',
    distance: '23,458 km from Mars',
    yearLength: '30 hours 18 minutes per orbit',
    temperature: '−40 °C (average)',
    atmosphere: 'None',
    description:
      "The smaller and further of Mars's two moons, and the smaller of any moon in the solar system with a name most people have heard. From the Martian surface it would look like a bright star, not a disc.",
    facts: [
      "Its surface is smoother than Phobos's — a blanket of dust has partly buried its craters.",
      'Unlike Phobos it is slowly moving away from Mars rather than falling in.',
      'Phobos and Deimos are named for the Greek personifications of fear and dread, the sons of Ares.',
    ],
    story: [
      "Deimos is the smaller and further of Mars's two moons, 12 km across and orbiting at 23,500 km. Its surface is smoother than Phobos's — not because it has fewer craters, but because a layer of loose dust has filled them in, which is surprising on a body whose escape velocity is about 5 m/s.",
      "From the Martian surface it is barely more than a bright star, and when it crosses the Sun the result is a transit rather than an eclipse: it is far too small to cover the disc. Both moons are probably captured asteroids, though their near-circular equatorial orbits are hard to explain that way, and the argument is not settled.",
    ],
    nasaLinks: [{ label: 'NASA — Deimos', url: 'https://science.nasa.gov/mars/moons/deimos/' }],
  },
  {
    id: 'io',
    name: 'Io',
    parent: 'jupiter',
    color: '#d9c56a',
    radiusKm: 1821.6,
    massKg: 8.9319e22,
    diameter: '3,643 km',
    mass: '8.93 × 10²² kg (0.015 Earth)',
    distance: '421,800 km from Jupiter',
    yearLength: '1.77 days per orbit',
    temperature: '−143 °C, with volcanic hotspots above 1,300 °C',
    atmosphere: 'A thin, patchy sulphur dioxide atmosphere fed by the volcanoes',
    description:
      "The most volcanically active body in the solar system. Squeezed between Jupiter's gravity and the pull of Europa and Ganymede, Io's interior is kneaded until it melts, and hundreds of volcanoes throw sulphur plumes 300 km into space.",
    facts: [
      'It resurfaces itself so fast that it has essentially no impact craters.',
      'Its volcanoes feed a doughnut of charged particles around Jupiter called the Io plasma torus.',
      'Io, Europa and Ganymede are locked in a 4:2:1 orbital resonance — for every Ganymede orbit, Io makes exactly four.',
    ],
    story: [
      "Io is the most volcanically active body in the solar system, with several hundred active volcanoes throwing plumes 300 km above the surface. The heat comes from Jupiter: caught in a resonance with Europa and Ganymede, Io is flexed by tides on every orbit, and the friction melts its interior.",
      "The result is a world that resurfaces itself faster than craters can accumulate — there are essentially none. What there is instead is sulphur, in yellows, oranges and whites, and lava hotter than anything erupting on Earth today. It also feeds a torus of ionised gas around Jupiter and carries a current of five million amps.",
    ],
    nasaLinks: [{ label: 'NASA — Io', url: 'https://science.nasa.gov/jupiter/moons/io/' }],
  },
  {
    id: 'europa',
    name: 'Europa',
    parent: 'jupiter',
    color: '#c9b79c',
    radiusKm: 1560.8,
    massKg: 4.7998e22,
    diameter: '3,122 km',
    mass: '4.80 × 10²² kg (0.008 Earth)',
    distance: '671,100 km from Jupiter',
    yearLength: '3.55 days per orbit',
    temperature: '−160 °C at the equator',
    atmosphere: 'A tenuous oxygen atmosphere, produced by radiation splitting surface ice',
    description:
      "A shell of water ice wrapped around a salt-water ocean holding perhaps twice as much liquid water as all of Earth's. It is one of the most promising places in the solar system to look for life.",
    facts: [
      'Its surface is the smoothest of any solid body known — the ice is young and constantly renewed.',
      'The dark cracks criss-crossing it are fractures where the shell has pulled apart and refrozen.',
      'Europa Clipper, launched in 2024, will make dozens of close passes to survey the ice and the ocean beneath.',
    ],
    story: [
      "Europa is the smoothest object in the solar system. Its surface is water ice, criss-crossed with brown cracks and almost devoid of craters, which means it is young — tens of millions of years, not billions. Underneath, the evidence points to a global ocean perhaps 100 km deep, holding more than twice the liquid water of all Earth's oceans.",
      "That makes it one of the best places to look for life beyond Earth. The ocean is in contact with a rocky floor, tidal flexing supplies energy, and the cracks suggest material moves between the surface and the water below. Europa Clipper launched in 2024 to find out, and will make dozens of close passes from 2030.",
    ],
    nasaLinks: [
      { label: 'NASA — Europa', url: 'https://science.nasa.gov/jupiter/moons/europa/' },
      { label: 'NASA — Europa Clipper', url: 'https://science.nasa.gov/mission/europa-clipper/' },
    ],
  },
  {
    id: 'ganymede',
    name: 'Ganymede',
    parent: 'jupiter',
    color: '#9a8f84',
    radiusKm: 2634.1,
    massKg: 1.4819e23,
    diameter: '5,268 km',
    mass: '1.48 × 10²³ kg (0.025 Earth)',
    distance: '1,070,400 km from Jupiter',
    yearLength: '7.15 days per orbit',
    temperature: '−163 °C (average)',
    atmosphere: 'A thin oxygen exosphere',
    description:
      'The largest moon in the solar system — bigger than Mercury, and the only moon known to generate a magnetic field of its own. It has a saltwater ocean buried under about 150 km of ice.',
    facts: [
      'If it orbited the Sun rather than Jupiter, it would comfortably be classed a planet.',
      'Its magnetic field creates aurorae, and watching them shift is how the subsurface ocean was confirmed.',
      'Its surface is half ancient dark cratered terrain and half younger grooved ice.',
    ],
    story: [
      "Ganymede is the largest moon in the solar system, bigger than Mercury, and the only one with a magnetic field of its own — generated in a liquid iron core, and strong enough to carve its own small magnetosphere inside Jupiter's vast one.",
      "Its surface is two terrains in one: dark, ancient, heavily cratered ground, and lighter regions cut with parallel grooves where the crust has been pulled apart. It very probably holds a saltwater ocean too, buried under 150 km of ice — deeper and less accessible than Europa's, but likely larger.",
    ],
    nasaLinks: [
      { label: 'NASA — Ganymede', url: 'https://science.nasa.gov/jupiter/moons/ganymede/' },
    ],
  },
  {
    id: 'callisto',
    name: 'Callisto',
    parent: 'jupiter',
    color: '#6f6459',
    radiusKm: 2410.3,
    massKg: 1.0759e23,
    diameter: '4,821 km',
    mass: '1.08 × 10²³ kg (0.018 Earth)',
    distance: '1,882,700 km from Jupiter',
    yearLength: '16.69 days per orbit',
    temperature: '−139 °C (average)',
    atmosphere: 'A very thin carbon dioxide and oxygen exosphere',
    description:
      'The outermost Galilean moon and the most heavily cratered object known — its surface has barely changed in four billion years. Far enough from Jupiter to escape both the tidal heating and the worst of the radiation.',
    facts: [
      'It has no large-scale geological activity at all: nothing has resurfaced it since the solar system was young.',
      'Valhalla, a bullseye of concentric rings from one ancient impact, spans about 3,800 km.',
      'Its low radiation makes it the most plausible site for a crewed base anywhere in the Jupiter system.',
    ],
    story: [
      "Callisto is the most heavily cratered body known. Nothing has resurfaced it in four billion years — no volcanism, no tectonics, no tidal heating, because it orbits far enough out to escape the resonance that drives Io, Europa and Ganymede. What it looks like now is roughly what it looked like when the solar system finished forming.",
      "That makes it the quietest of the four, and the most useful: it sits outside Jupiter's fiercest radiation belts, which has made it a recurring candidate for a crewed outpost. It may also have an ocean, inferred from the way it disturbs Jupiter's magnetic field.",
    ],
    nasaLinks: [
      { label: 'NASA — Callisto', url: 'https://science.nasa.gov/jupiter/moons/callisto/' },
    ],
  },
  {
    id: 'mimas',
    name: 'Mimas',
    parent: 'saturn',
    color: '#b9b6b0',
    radiusKm: 198.2,
    massKg: 3.7493e19,
    diameter: '396 km',
    mass: '3.75 × 10¹⁹ kg',
    distance: '185,540 km from Saturn',
    yearLength: '22 hours 37 minutes per orbit',
    temperature: '−209 °C, with a puzzling warm band across the leading face',
    atmosphere: 'None',
    description:
      'The smallest body in the solar system known to have been pulled round by its own gravity, and the owner of the most disproportionate crater anywhere: Herschel is 130 km across on a moon only 396 km wide, a third of its diameter.',
    facts: [
      'The impact that made Herschel came close to shattering it — fractures on the far side line up with the shock passing through.',
      "Ring particles in the Cassini Division circle Saturn twice for every one of Mimas's orbits, and that 2:1 resonance is what keeps the 4,800 km gap swept clear.",
      "Cassini's final orbits found a wobble in its rotation best explained by a young ocean beneath the ice, which nobody expected of a moon this small.",
    ],
    story: [
      "Mimas is 396 km across and carries a crater 130 km wide — Herschel, a third the width of the moon itself. The impact that made it came close to shattering the body; fractures on the opposite side may be the shock arriving round the other way.",
      "It is the smallest body known to have been pulled into a round shape by its own gravity, and it is mostly water ice. Its wobble is larger than a solid interior allows, which has led to the suggestion of an ocean 20 to 30 km down — an unexpected place to find one, on a moon with a frozen and ancient surface.",
    ],
    nasaLinks: [{ label: 'NASA — Mimas', url: 'https://science.nasa.gov/saturn/moons/mimas/' }],
  },
  {
    id: 'enceladus',
    name: 'Enceladus',
    parent: 'saturn',
    color: '#e8e6e2',
    radiusKm: 252.1,
    massKg: 1.0802e20,
    diameter: '504 km',
    mass: '1.08 × 10²⁰ kg',
    distance: '238,000 km from Saturn',
    yearLength: '1.37 days per orbit',
    temperature: '−201 °C (average)',
    atmosphere: 'A localised water-vapour atmosphere over the south pole, fed by the plumes',
    description:
      'A moon small enough to fit inside the British Isles, venting water from a global ocean through cracks at its south pole. Cassini flew through those plumes and tasted salt, silica and organic molecules.',
    facts: [
      "Its plumes escape into orbit and are the entire source of Saturn's broad, diffuse E ring.",
      'It reflects about 90% of the sunlight reaching it, making it the most reflective body in the solar system — and one of the coldest.',
      'The chemistry in the plumes points to hot water meeting rock on the ocean floor.',
    ],
    story: [
      "Enceladus is 500 km across and vents water into space. More than a hundred geysers erupt from fractures near its south pole — the “tiger stripes” — throwing ice and vapour hundreds of kilometres up, some of it escaping to form Saturn's E ring. Cassini flew through the plumes and tasted them directly.",
      "What it found makes this one of the most promising places in the solar system: liquid water, salts, silica grains implying a hot rocky floor, and organic molecules including hydrogen — an energy source a microbe could use. All of it from a moon small enough to fit inside the British Isles.",
    ],
    nasaLinks: [
      { label: 'NASA — Enceladus', url: 'https://science.nasa.gov/saturn/moons/enceladus/' },
    ],
  },
  {
    id: 'tethys',
    name: 'Tethys',
    parent: 'saturn',
    color: '#cfcbc4',
    radiusKm: 531.1,
    massKg: 6.1745e20,
    diameter: '1,062 km',
    mass: '6.17 × 10²⁰ kg',
    distance: '294,670 km from Saturn',
    yearLength: '1.89 days per orbit',
    temperature: '−187 °C (average)',
    atmosphere: 'None',
    description:
      'Almost pure water ice — its density is barely more than water itself, so there is very little rock inside. Two features dominate it: a crater two fifths of its width, and a canyon that runs most of the way around it.',
    facts: [
      'Odysseus is 450 km across on a moon 1,062 km wide; its floor has since sagged back upward, flattening the basin.',
      "Ithaca Chasma is 2,000 km long and up to 100 km wide — the moon's ice shell cracking as its interior froze and expanded.",
      "It is one of the most reflective bodies in the solar system, continuously sandblasted clean by ice from Enceladus's plumes.",
    ],
    story: [
      "Tethys is almost pure water ice, with a density barely above water itself, and one of the most reflective surfaces of any body in the solar system. It carries two enormous features: Odysseus, an impact basin two fifths of its diameter, and Ithaca Chasma, a canyon running most of the way round it.",
      "It shares its orbit with two small moons, Telesto and Calypso, sitting 60 degrees ahead and behind at the stable Lagrange points — the same arrangement Jupiter's Trojan asteroids hold with the Sun, on a far smaller scale.",
    ],
    nasaLinks: [{ label: 'NASA — Tethys', url: 'https://science.nasa.gov/saturn/moons/tethys/' }],
  },
  {
    id: 'dione',
    name: 'Dione',
    parent: 'saturn',
    color: '#c8c6c1',
    radiusKm: 561.4,
    massKg: 1.0955e21,
    diameter: '1,123 km',
    mass: '1.10 × 10²¹ kg',
    distance: '377,420 km from Saturn',
    yearLength: '2.74 days per orbit',
    temperature: '−186 °C (average)',
    atmosphere: 'An extremely thin exosphere of oxygen ions',
    description:
      'Voyager saw pale wispy streaks across its trailing side and took them for frost. Cassini got close enough to resolve them properly: they are cliffs, hundreds of metres of bright ice exposed along a network of tectonic fractures.',
    facts: [
      'Its gravity field suggests an ocean perhaps 100 km down, under 100 km of ice.',
      'It has more craters on its trailing hemisphere than its leading one — the opposite of what orbital motion predicts, so it was probably spun around by a large impact.',
      'Two small moons, Helene and Polydeuces, ride 60° ahead of and behind it in its orbit.',
    ],
    story: [
      "Dione's trailing side is streaked with bright lines that Voyager saw as wispy and took for something erupted. Cassini resolved them: they are ice cliffs, hundreds of metres high, where the crust has fractured — tectonics on a moon of ice.",
      "It is dense enough to be about a third rock, and shows signs of past activity that has since stopped. Like Tethys it has two Trojan companions, Helene and Polydeuces, in the same 60-degree positions.",
    ],
    nasaLinks: [{ label: 'NASA — Dione', url: 'https://science.nasa.gov/saturn/moons/dione/' }],
  },
  {
    id: 'rhea',
    name: 'Rhea',
    parent: 'saturn',
    color: '#c4c1ba',
    radiusKm: 763.8,
    massKg: 2.3065e21,
    diameter: '1,528 km',
    mass: '2.31 × 10²¹ kg',
    distance: '527,070 km from Saturn',
    yearLength: '4.52 days per orbit',
    temperature: '−174 °C in sunlight, −220 °C in shadow',
    atmosphere: 'A tenuous oxygen and carbon dioxide exosphere',
    description:
      "Saturn's second largest moon, and three quarters water ice by mass. An old, quiet, heavily cratered world with bright fracture walls cutting across it — the same kind of ice cliffs as Dione's, on a larger body.",
    facts: [
      'Cassini detected oxygen and carbon dioxide around it, the first time an oxygen atmosphere was found at an icy moon.',
      'For a while it was thought to have its own ring system; a dedicated search found nothing, and the idea was withdrawn.',
      'It is so lightly bound that a rock thrown hard enough by hand could, in principle, be put into orbit around it.',
    ],
    story: [
      "Rhea is Saturn's second largest moon and almost entirely water ice, with a surface saturated in craters and no sign of ever having been resurfaced. It is a cold, ancient, geologically finished world.",
      "In 2008 Cassini found a symmetric drop in electrons on both sides of it, which was read as a possible ring system — the only moon that would have one. Later imaging found nothing, and the case is now generally considered unproven.",
    ],
    nasaLinks: [{ label: 'NASA — Rhea', url: 'https://science.nasa.gov/saturn/moons/rhea/' }],
  },
  {
    id: 'titan',
    name: 'Titan',
    parent: 'saturn',
    color: '#d9a05a',
    radiusKm: 2574.7,
    massKg: 1.3452e23,
    diameter: '5,149 km',
    mass: '1.35 × 10²³ kg (0.0225 Earth)',
    distance: '1,221,900 km from Saturn',
    yearLength: '15.95 days per orbit',
    temperature: '−179 °C',
    atmosphere: "95% nitrogen, 5% methane — denser at the surface than Earth's",
    description:
      'The only moon with a substantial atmosphere, and the only world besides Earth with standing liquid on its surface: lakes and seas of methane and ethane, fed by rain, feeding rivers that carve valleys.',
    facts: [
      "Surface pressure is 1.5 times Earth's, and the air is so thick and gravity so low that a person could fly by flapping strapped-on wings.",
      'Huygens landed there in 2005 — still the most distant landing ever made.',
      'Its haze is so opaque that its surface was not seen until radar and infrared cut through it.',
    ],
    story: [
      "Titan is the only moon with a substantial atmosphere: nitrogen, half again as dense at the surface as Earth's, and thick with orange haze that hid the ground entirely until radar and infrared got through it. It is the only place besides Earth known to have standing liquid on its surface.",
      "That liquid is methane and ethane, in seas hundreds of kilometres across, fed by rain and rivers that carve channels into water ice bedrock. In 2005 Huygens descended through the haze and landed on a plain of rounded pebbles — the most distant landing ever made. Dragonfly, a nuclear-powered rotorcraft, is due to arrive in the 2030s.",
    ],
    nasaLinks: [
      { label: 'NASA — Titan', url: 'https://science.nasa.gov/saturn/moons/titan/' },
      { label: 'NASA — Dragonfly', url: 'https://science.nasa.gov/mission/dragonfly/' },
    ],
  },
  {
    id: 'iapetus',
    name: 'Iapetus',
    parent: 'saturn',
    color: '#8f8578',
    radiusKm: 734.5,
    massKg: 1.8056e21,
    diameter: '1,469 km',
    mass: '1.81 × 10²¹ kg',
    distance: '3,560,840 km from Saturn',
    yearLength: '79.3 days per orbit',
    temperature: '−143 °C on the dark side, −173 °C on the bright',
    atmosphere: 'None',
    description:
      'Two-toned to a degree found nowhere else: one hemisphere is about as dark as coal, the other as bright as fresh snow, with ten times the reflectivity between them. It also has a ridge running almost exactly along its equator, 1,300 km long and up to 20 km high, which makes it look like a walnut.',
    facts: [
      'The colour split is self-sustaining: dark dust swept up on its leading face absorbs sunlight, warms, and drives off the ice, leaving it darker still.',
      'That dust almost certainly comes from Phoebe, an outer moon orbiting backwards far beyond it.',
      'Its orbit is tilted 15.5° and lies far outside the rings, so it is the only large Saturnian moon from which the rings can be seen at an angle rather than edge-on.',
    ],
    story: [
      "Iapetus is two colours. Its leading side is as dark as coal and its trailing side as bright as snow, a contrast Giovanni Cassini noticed in 1671 when the moon vanished on one side of its orbit. The dark material is dust swept up from the outer moons; where it settles the surface warms, ice sublimates away, and the darkening runs away with itself.",
      "It also has a ridge of mountains up to 20 km high running almost exactly along its equator, giving it the outline of a walnut. Nothing else in the solar system has one, and there is still no agreed explanation.",
    ],
    nasaLinks: [{ label: 'NASA — Iapetus', url: 'https://science.nasa.gov/saturn/moons/iapetus/' }],
  },
  {
    id: 'miranda',
    name: 'Miranda',
    parent: 'uranus',
    color: '#b5b8bc',
    radiusKm: 235.8,
    massKg: 6.59e19,
    diameter: '472 km',
    mass: '6.59 × 10¹⁹ kg',
    distance: '129,900 km from Uranus',
    yearLength: '1.41 days per orbit',
    temperature: '−187 °C (average)',
    atmosphere: 'None',
    description:
      'The strangest surface Voyager 2 photographed on its way through: a patchwork of terrains that do not belong together, cut by enormous grooved ovals, as though pieces of several different moons had been assembled into one.',
    facts: [
      'Verona Rupes is a scarp up to 20 km high — the tallest known cliff in the solar system. Stepping off it, you would fall for about twelve minutes.',
      'It may have been broken apart and gravitationally reassembled, or heated by a tidal resonance it has since fallen out of.',
      'Voyager 2 saw only its southern hemisphere. The rest has never been photographed.',
    ],
    story: [
      "Miranda is only 470 km across and has the most extreme terrain known. Verona Rupes is a cliff some 20 km high — ten times the depth of the Grand Canyon — and the surface is a patchwork of unrelated regions butted against each other, as though assembled from parts.",
      "The old explanation was that it shattered and reassembled. The better one now is tidal heating: partial melting drove dense material down and lighter material up, and the surface is the record of that overturn stalling part way through.",
    ],
    nasaLinks: [{ label: 'NASA — Miranda', url: 'https://science.nasa.gov/uranus/moons/miranda/' }],
  },
  {
    id: 'ariel',
    name: 'Ariel',
    parent: 'uranus',
    color: '#c3c7cb',
    radiusKm: 578.9,
    massKg: 1.353e21,
    diameter: '1,158 km',
    mass: '1.25 × 10²¹ kg',
    distance: '190,900 km from Uranus',
    yearLength: '2.52 days per orbit',
    temperature: '−213 °C (average)',
    atmosphere: 'None',
    description:
      "The brightest of Uranus's moons and the youngest-looking: its craters have been partly erased by something flowing across the surface, and broad rift valleys have floors that look flooded rather than fractured.",
    facts: [
      'Whatever resurfaced it was probably an ammonia-water mixture, which stays soft at temperatures where pure ice is rigid rock.',
      "Carbon dioxide frost has been detected on its trailing side, concentrated where Uranus's magnetosphere sweeps across it.",
      'It reflects about a third of the light that reaches it — twice as much as Umbriel, its near-twin in size.',
    ],
    story: [
      "Ariel is the brightest of Uranus's moons and the least cratered, which means something resurfaced it after it formed. It is cut by a network of rift valleys, and their floors are smooth — filled by something that flowed, probably a water-ammonia mixture erupting as an icy lava.",
      "Everything known about it comes from a few days in January 1986, when Voyager 2 passed through the Uranian system. No spacecraft has returned, and none is scheduled.",
    ],
    nasaLinks: [{ label: 'NASA — Ariel', url: 'https://science.nasa.gov/uranus/moons/ariel/' }],
  },
  {
    id: 'umbriel',
    name: 'Umbriel',
    parent: 'uranus',
    color: '#8c8f93',
    radiusKm: 584.7,
    massKg: 1.172e21,
    diameter: '1,169 km',
    mass: '1.28 × 10²¹ kg',
    distance: '266,000 km from Uranus',
    yearLength: '4.14 days per orbit',
    temperature: '−198 °C (average)',
    atmosphere: 'None',
    description:
      'Almost the same size as Ariel and its opposite in every other respect: the darkest and most uniformly ancient of the five, saturated with craters and apparently unchanged since it formed.',
    facts: [
      'One bright ring stands out on an otherwise featureless dark surface — the floor of the crater Wunda, made of something nobody has identified.',
      'Why it is so much darker than its neighbours is unresolved; it may simply never have had the internal warmth to resurface itself.',
      "Its uniform greyness makes it useful: it is the reference against which the other moons' brightness variations are measured.",
    ],
    story: [
      "Umbriel is the darkest of Uranus's large moons, reflecting only about 16% of the light that reaches it, and its surface is uniformly ancient and cratered. Why it is so dark when Ariel, a near neighbour of similar size, is so bright is not understood.",
      "Its one distinguishing feature is Wunda, a bright ring about 130 km across near the equator, sitting on an otherwise featureless dark face. It was photographed once, by Voyager 2, and there are no other pictures of it.",
    ],
    nasaLinks: [{ label: 'NASA — Umbriel', url: 'https://science.nasa.gov/uranus/moons/umbriel/' }],
  },
  {
    id: 'titania',
    name: 'Titania',
    parent: 'uranus',
    color: '#b8b4b0',
    radiusKm: 788.4,
    massKg: 3.527e21,
    diameter: '1,577 km',
    mass: '3.40 × 10²¹ kg',
    distance: '436,300 km from Uranus',
    yearLength: '8.71 days per orbit',
    temperature: '−203 °C (average)',
    atmosphere: 'Possibly a seasonal trace of carbon dioxide',
    description:
      "The largest of Uranus's moons and the eighth largest in the solar system. Its surface is cut by a system of enormous fault canyons, one of them nearly as long as the moon's own circumference.",
    facts: [
      'Messina Chasma runs about 1,500 km from near the equator to well south — a rift opened as the interior froze and expanded.',
      'It has fewer large craters than Oberon, so something resurfaced it after the heaviest bombardment ended.',
      'Models allow a liquid ocean at its rock-ice boundary, kept from freezing by ammonia rather than heat.',
    ],
    story: [
      "Titania is the largest moon of Uranus at 1,578 km across, roughly half the diameter of our own. Its surface carries huge fault valleys — Messina Chasma runs some 1,500 km — formed as the interior froze, expanded, and split the crust.",
      "It has fewer large craters than its neighbours, so something resurfaced it early on. Like the rest of the Uranian system it is about half ice and half rock, and like the rest of it, everything known comes from a single flyby.",
    ],
    nasaLinks: [{ label: 'NASA — Titania', url: 'https://science.nasa.gov/uranus/moons/titania/' }],
  },
  {
    id: 'oberon',
    name: 'Oberon',
    parent: 'uranus',
    color: '#a49f9b',
    radiusKm: 761.4,
    massKg: 3.014e21,
    diameter: '1,523 km',
    mass: '3.08 × 10²¹ kg',
    distance: '583,500 km from Uranus',
    yearLength: '13.46 days per orbit',
    temperature: '−198 °C (average)',
    atmosphere: 'None',
    description:
      'The outermost of the five large Uranian moons, and the most heavily cratered. Many of its crater floors hold dark deposits of unknown material, as though something rose from below and pooled in the low ground.',
    facts: [
      'Voyager 2 caught a mountain about 11 km high in silhouette on its limb, which is why we know it is there at all.',
      "It orbits far enough out to spend part of each Uranian year outside the planet's magnetosphere.",
      "It and Titania are close enough in size and colour to be near-twins, but Oberon's surface is far older.",
    ],
    story: [
      "Oberon is the outermost of Uranus's large moons and among the most heavily cratered, with dark material on the floors of many of its craters — possibly matter erupted from below after the impacts opened the crust.",
      "Voyager 2 caught a mountain about 11 km high in profile on its limb, which is how its height is known at all. Its orbit lies far enough out that it spends part of its time outside Uranus's magnetosphere.",
    ],
    nasaLinks: [{ label: 'NASA — Oberon', url: 'https://science.nasa.gov/uranus/moons/oberon/' }],
  },
  {
    id: 'triton',
    name: 'Triton',
    parent: 'neptune',
    color: '#c4bfc6',
    radiusKm: 1353.4,
    massKg: 2.139e22,
    diameter: '2,707 km',
    mass: '2.14 × 10²² kg (0.0036 Earth)',
    distance: '354,800 km from Neptune',
    yearLength: '5.88 days per orbit (retrograde)',
    temperature: '−235 °C — among the coldest surfaces measured anywhere',
    atmosphere: 'A very thin nitrogen atmosphere with a trace of methane',
    description:
      "Neptune's largest moon, and the only large moon in the solar system that orbits backwards. That retrograde path means it did not form where it is: Triton is a captured Kuiper Belt object, hauled in and circularised by Neptune long ago.",
    facts: [
      'Voyager 2 photographed nitrogen geysers erupting 8 km high through its icy crust.',
      'Its backwards orbit is decaying; in a few billion years it will be torn apart into a ring.',
      'Its cantaloupe terrain — a dimpled, ridged landscape — is found nowhere else.',
    ],
    story: [
      "Triton orbits Neptune backwards, against the planet's rotation, which no large moon does if it formed in place. It is almost certainly a captured Kuiper belt object — a dwarf planet like Pluto, of nearly the same size and density, that came too close and was taken.",
      "It is one of the coldest places measured anywhere, at −235 °C, and it is still active: Voyager 2 saw plumes of nitrogen gas rising 8 km and streaking downwind across the polar cap. The capture is also killing it — tides are drawing it inward, and in a few billion years it will break up into a ring.",
    ],
    nasaLinks: [{ label: 'NASA — Triton', url: 'https://science.nasa.gov/neptune/moons/triton/' }],
  },
  {
    id: 'charon',
    name: 'Charon',
    parent: 'pluto',
    color: '#a89f96',
    radiusKm: 606,
    massKg: 1.586e21,
    diameter: '1,212 km',
    mass: '1.59 × 10²¹ kg (0.122 Pluto)',
    distance: '19,591 km from Pluto',
    yearLength: '6.39 days per orbit',
    temperature: '−220 °C (average)',
    atmosphere: 'None',
    description:
      "Half Pluto's diameter and an eighth of its mass, which makes this the closest thing to a double planet in the solar system. The two are locked face to face: each permanently shows the other the same hemisphere, and they turn about a point that lies outside Pluto's surface.",
    facts: [
      'Serenity Chasma is part of a canyon system running at least 1,800 km, in places four times deeper than the Grand Canyon.',
      'Its dark red north polar cap, Mordor Macula, is made of tholins built from methane that escaped Pluto and froze out here.',
      'Its whole southern plain appears to be one enormous refrozen flood of water ice — a cryovolcanic resurfacing early in its history.',
    ],
    story: [
      "Charon is half Pluto's diameter, a ratio no other planet-moon pair comes close to, and the two are tidally locked to each other: each keeps the same face toward the other, and they turn about a point in the empty space between them. It is the nearest thing in the solar system to a genuine double planet.",
      "Its north pole is capped in dark red material — tholins, made when methane escaping from Pluto's atmosphere is caught by Charon's gravity, freezes out on the coldest ground, and is worked on by sunlight. Its surface is also split by a canyon system four times the length of the Grand Canyon.",
    ],
    nasaLinks: [
      { label: 'NASA — Charon', url: 'https://science.nasa.gov/dwarf-planets/pluto/moons/charon/' },
    ],
  },
  {
    id: 'styx',
    name: 'Styx',
    parent: 'pluto',
    color: '#9b968f',
    radiusKm: 5.2,
    spinHours: 77.8,
    diameter: '16 × 9 × 8 km',
    mass: '7.5 × 10¹⁴ kg (estimated)',
    distance: '42,656 km from Pluto',
    yearLength: '20.2 days per orbit',
    temperature: '−230 °C (estimated)',
    atmosphere: 'None',
    description:
      "The smallest and faintest of Pluto's moons, found in 2012 while Hubble searched for anything New Horizons might collide with. It is a bright chip of water ice, and it tumbles as it goes.",
    facts: [
      "It circles roughly three times for each of Charon's orbits, close to but not exactly a 3:1 resonance.",
      'Its spin is not locked to its orbit — the shifting pull of the Pluto–Charon pair makes the rotation of all four small moons chaotic.',
      'New Horizons resolved it into a double-lobed shape, suggesting two smaller bodies that merged.',
    ],
    story: [
      "Styx is the smallest and faintest of Pluto's four small moons, roughly 16 by 9 km, and was not found until 2012 — three years before New Horizons arrived. It orbits between Charon and Nix.",
      "All four small moons orbit close to the plane of the Pluto-Charon pair and in near-resonance with it, which is the strongest evidence that they formed from debris of the same collision that made Charon rather than being captured separately.",
    ],
    nasaLinks: [
      { label: "NASA — Pluto's moons", url: 'https://science.nasa.gov/dwarf-planets/pluto/moons/' },
    ],
  },
  {
    id: 'nix',
    name: 'Nix',
    parent: 'pluto',
    color: '#a8a29b',
    radiusKm: 24.8,
    spinHours: 43.9,
    diameter: '50 × 35 × 33 km',
    mass: '4.5 × 10¹⁶ kg (estimated)',
    distance: '48,694 km from Pluto',
    yearLength: '24.9 days per orbit',
    temperature: '−230 °C (estimated)',
    atmosphere: 'None',
    description:
      'Discovered alongside Hydra in 2005, two years before New Horizons launched, and photographed by it a decade later as a lumpy, bright, jellybean-shaped world of water ice with one conspicuous red-tinted crater.',
    facts: [
      'That reddish crater is the only strong colour on an otherwise grey-white surface — an impact that dug up something different from below.',
      'It tumbles chaotically, so there is no fixed day: its poles and equator wander over time.',
      "It is named for the Greek goddess of night, and its discovery images were taken in the same run as Hydra's.",
    ],
    story: [
      "Nix is about 50 by 35 by 33 km and was discovered by Hubble in 2005. New Horizons found it to be elongated and surprisingly bright, with a large reddish crater on an otherwise grey, icy surface.",
      "It does not keep one face toward Pluto. Pulled by two large bodies at once, its rotation is chaotic: the axis wanders and the length of its day changes unpredictably, which is true of all four of the small moons.",
    ],
    nasaLinks: [
      { label: "NASA — Pluto's moons", url: 'https://science.nasa.gov/dwarf-planets/pluto/moons/' },
    ],
  },
  {
    id: 'kerberos',
    name: 'Kerberos',
    parent: 'pluto',
    color: '#9d9891',
    radiusKm: 9.6,
    spinHours: 127.4,
    diameter: '19 × 10 × 9 km',
    mass: '1.6 × 10¹⁵ kg (estimated)',
    distance: '57,783 km from Pluto',
    yearLength: '32.2 days per orbit',
    temperature: '−230 °C (estimated)',
    atmosphere: 'None',
    description:
      'Found in 2011, and the one that upset the arithmetic: it seemed to be far darker than the other small moons, which would have implied a very different composition. New Horizons arrived and found it bright like the rest — the earlier estimate had been wrong.',
    facts: [
      'It is two lobes stuck together, about 8 and 5 km across, a gentle merger of two objects rather than a single body.',
      "Its orbit sits between Nix's and Hydra's, near a 5:1 resonance with Charon.",
      'It is named for the three-headed dog guarding the entrance to the underworld — spelled the Greek way, because Cerberus was already an asteroid.',
    ],
    story: [
      "Kerberos was found in 2011 and was expected to be dark, because the light it reflects is faint. New Horizons showed the opposite: a small double-lobed body about 19 by 10 km, as reflective as the others, and simply much smaller than the brightness estimate assumed.",
      "Its double shape suggests it formed when two objects met slowly enough to settle together rather than shatter — a common outcome among the small bodies of the outer solar system.",
    ],
    nasaLinks: [
      { label: "NASA — Pluto's moons", url: 'https://science.nasa.gov/dwarf-planets/pluto/moons/' },
    ],
  },
  {
    id: 'hydra',
    name: 'Hydra',
    parent: 'pluto',
    color: '#aeaaa3',
    radiusKm: 25.4,
    spinHours: 10.3,
    diameter: '51 × 36 × 31 km',
    mass: '4.8 × 10¹⁶ kg (estimated)',
    distance: '64,738 km from Pluto',
    yearLength: '38.2 days per orbit',
    temperature: '−230 °C (estimated)',
    atmosphere: 'None',
    description:
      "The outermost of Pluto's five moons and the fastest spinner among them, turning once every ten hours while taking over five weeks to complete one orbit.",
    facts: [
      'Its surface is unusually clean water ice, which suggests it is being resurfaced or scoured rather than accumulating dark material.',
      "It circles almost exactly six times for every one of Charon's orbits.",
      'Its irregular outline has at least two obvious lobes, the same merged-pair shape seen on Styx and Kerberos.',
    ],
    story: [
      "Hydra is the outermost of Pluto's known moons, about 65 by 45 km, and irregular — a lumpy shard rather than a sphere. Its surface is nearly pure water ice, cleaner than expected, which suggests it is regularly scoured by micrometeorite impacts.",
      "Like Nix it tumbles chaotically, so its day genuinely has no fixed length. It orbits about 65,000 km out and takes 38 days to go round.",
    ],
    nasaLinks: [
      { label: "NASA — Pluto's moons", url: 'https://science.nasa.gov/dwarf-planets/pluto/moons/' },
    ],
  },
]
