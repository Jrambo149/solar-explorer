/**
 * What each comet is, in words. Hand-written; merged onto the bodies in
 * `bodies.js`.
 *
 * Separate from `cometData.js` because that file is generated — roster, radii
 * and meshes from Eyes on the Solar System, orbits from the Small-Body
 * Database — and re-running `npm run fetch:comets` would erase anything typed
 * into it. Everything here is the opposite kind of content: researched once,
 * true indefinitely, and nothing a script could produce.
 *
 * ## `diameter` is only here where somebody measured it
 *
 * Six of these have had a spacecraft fly past and be photographed as a shape
 * rather than a dot. Those carry a `diameter`, and it is a real measurement of
 * a real object. The other eight do not carry one at all, and that omission is
 * deliberate: a comet's `radiusKm` in `cometData.js` is Eyes' *render* size,
 * chosen so a sub-pixel speck is visible on screen, and quoting it as a
 * measurement would have printed "about 6 km across" for ISON, whose nucleus no
 * observation put above two.
 *
 * ## `atmosphere` is the coma
 *
 * Which is the same field the planets use, and the dossier relabels it "Coma
 * and tail" for this class. It is not a stretch: a coma is an atmosphere, just
 * one that a comet has only near the Sun and loses entirely each time.
 */

export const COMET_DOSSIERS = {
  '1p_halley': {
    diameter: '15 × 8 × 8 km',
    atmosphere:
      'A coma of water vapour, carbon dioxide and dust that grows to more than 100,000 km across near perihelion, with a dust tail and a separate blue ion tail pushed straight out by the solar wind.',
    description:
      'The comet that made comets predictable. Edmond Halley noticed in 1705 that the bright comets of 1531, 1607 and 1682 had followed the same path, proposed they were one object on a 76-year orbit, and predicted its return for 1758. He died sixteen years before it arrived. It has been observed on every one of its returns since at least 240 BC.',
    facts: [
      'It is the only short-period comet reliably visible to the naked eye, which means it is the only one a person can see twice in a lifetime — and the odds of that are worse than they sound, because the 1986 return was the worst-placed in two thousand years.',
      'Two meteor showers are its dust: the Eta Aquariids each May and the Orionids each October. Earth crosses the debris stream twice a year, on the way in and on the way out.',
      'Five spacecraft met it in 1986. Giotto passed 596 km from the nucleus and was struck hard enough by dust to knock its camera off target moments after the closest images.',
      'The nucleus turned out to be one of the darkest objects in the solar system, reflecting about 4% of the light reaching it — a crust of dust left behind as the ice beneath it evaporated away.',
      'Its next perihelion is in 2061.',
    ],
    story: [
      'Halley did not discover the comet and never claimed to. What he did was harder: he took Newton’s new gravitation, computed orbits for two dozen historical comets, noticed that three of them were the same orbit at 76-year intervals, and made a prediction that could only be tested after his death. It returned on Christmas night 1758, and the point being tested was not really the comet — it was whether the law that governs falling apples also governs objects nobody had ever seen come back.',
      'Its appearances are woven through recorded history because for most of that history a bright comet was an event that demanded explanation. The 1066 return is stitched into the Bayeux Tapestry above a crowd of pointing Englishmen. Chinese astronomers recorded it in 240 BC and have a nearly unbroken series of sightings since. The 1910 return had Earth passing through the tail, which prompted a small industry in comet pills and sealed jars of clean air.',
      'The 1986 return was scientifically the richest and visually the poorest. Earth and the comet were on opposite sides of the Sun at the best moment, and a generation that had been promised a spectacle got a faint smudge — while an international fleet of five probes was returning the first close images of a cometary nucleus anyone had ever seen.',
    ],
    nasaLinks: [
      { label: 'NASA — 1P/Halley', url: 'https://science.nasa.gov/solar-system/comets/1p-halley/' },
      { label: 'NASA — Orionid meteors', url: 'https://science.nasa.gov/solar-system/meteors-meteorites/orionids/' },
    ],
  },

  '67p_churyumov_gerasimenko': {
    diameter: '4.3 km along its long axis — two lobes, 4.1 and 2.6 km across',
    atmosphere:
      'A coma of water, carbon dioxide and carbon monoxide, measured directly by Rosetta for two years — including the discovery of molecular oxygen, which nobody expected to survive since the comet formed.',
    description:
      'The most thoroughly studied comet in history, and the only one anything has ever landed on. Rosetta reached it in August 2014, flew alongside for more than two years through its closest approach to the Sun, and ended by deliberately touching down on the surface it had been mapping.',
    facts: [
      'It is two objects. The neck between the lobes is the most active region on the comet, and the shape is now understood as a gentle collision between two bodies early in the solar system, at walking pace.',
      'Philae landed in November 2014, bounced twice because its anchoring harpoons did not fire, and came to rest on its side in shadow. It returned 64 hours of data on battery before falling silent, and was not located again until a month before the mission ended.',
      'Rosetta found that the comet’s water is not like Earth’s — its ratio of heavy hydrogen is three times ours — which weakened the idea that comets of this family delivered Earth’s oceans.',
      'Amino acid glycine was detected in the coma, along with phosphorus: the first time the building blocks of biology were found around a comet.',
      'The comet is named for two Soviet astronomers who found it in 1969 — Klim Churyumov, who spotted it, and Svetlana Gerasimenko, on whose photographic plate it appeared.',
    ],
    story: [
      'Rosetta launched in 2004 and spent ten years getting there, using three Earth flybys and one at Mars, then hibernated for thirty-one months in the cold beyond the asteroid belt with everything switched off except a clock. It woke on schedule in January 2014. Nothing about the mission was reversible: the launch window it missed in 2003 had cost it its original target, and the one it took allowed no second attempt.',
      'What it watched was a comet turning on. When Rosetta arrived, 67P was inert and far from the Sun; over the following year the ice began to sublimate, jets opened, the surface visibly changed, and cliffs collapsed on camera. No comet had ever been observed continuously through that transition, and most of what is now known about how comets behave comes from those two years rather than from the flybys before them.',
      'It ended by landing, because the spacecraft was solar-powered and heading back out to where it could no longer keep itself warm. Rather than shut it down in orbit, the team put it on a slow descent into the more active lobe, taking images the whole way down, and it stopped transmitting on contact in September 2016.',
    ],
    nasaLinks: [
      { label: 'NASA — 67P/Churyumov-Gerasimenko', url: 'https://science.nasa.gov/solar-system/comets/67p-churyumov-gerasimenko/' },
      { label: 'ESA — Rosetta', url: 'https://www.esa.int/Science_Exploration/Space_Science/Rosetta' },
    ],
  },

  '9p_tempel_1': {
    diameter: '7.6 × 4.9 km',
    atmosphere:
      'A modest coma; the comet is comparatively inactive, and most of what is known about its interior came from being hit rather than from what it gives off on its own.',
    description:
      'The comet that was deliberately struck. Deep Impact released a 370 kg copper projectile into its path on 4 July 2005 and photographed the collision from a safe distance — the first time anyone had excavated a comet to see what was underneath.',
    facts: [
      'The impactor hit at 10.3 km/s and threw out far more fine dust than expected, so much that the debris cloud obscured the crater it had made. Nobody could see the result.',
      'That is why Stardust was retargeted. Having already completed its own mission at another comet, it was sent to Tempel 1 and flew past in February 2011 — the first time a comet was revisited on a later orbit — and photographed a crater about 150 m across, shallow and partly filled in.',
      'The material thrown up included clays, carbonates and crystalline silicates: minerals that form at high temperatures, in a body that has been cold since it formed. They must have been made near the young Sun and carried outward before the comet assembled.',
      'The surface has layers, and features that appear to be flows — evidence of a comet that has been resurfacing itself rather than simply eroding.',
    ],
    story: [
      'The experiment answered a question that observation alone could not. A comet’s surface is a crust of dust and processed ice, and everything a telescope sees comes off that crust; the pristine material — the reason comets are interesting — is underneath. Short of landing and drilling, hitting it hard enough to throw the inside outward was the only way to sample it, and the mission was designed around the fact that the projectile would be destroyed and had to make its own approach.',
      'What came out was fluffier than anyone had modelled. The ejecta behaved like talcum powder rather than like broken rock, implying a nucleus held together very weakly — closer to a snowbank than an iceberg, with a strength that barely registers.',
      'The Stardust revisit six years later did something no comet mission had done before: it looked at the same ground twice, an orbit apart. Comparing the two sets of images showed a scarp that had retreated by about fifty metres in one pass round the Sun, which is the only direct measurement anyone has of how fast a comet wears away.',
    ],
    nasaLinks: [
      { label: 'NASA — Deep Impact', url: 'https://science.nasa.gov/mission/deep-impact/' },
      { label: 'NASA — 9P/Tempel 1', url: 'https://science.nasa.gov/solar-system/comets/9p-tempel-1/' },
    ],
  },

  '81p_wild_2': {
    diameter: '5.5 × 4.0 × 3.3 km',
    atmosphere:
      'An active coma with more than twenty distinct jets, several strong enough that Stardust could see them coming off the surface as it passed.',
    description:
      'The comet that samples on Earth came from. Stardust flew through its coma in January 2004 with a tray of aerogel held out, caught the dust, and parachuted it into the Utah desert two years later — the first material returned from beyond the Moon.',
    facts: [
      'It has only been on this orbit since 1974. Before that it circled well beyond Jupiter; a close pass by the planet pulled it into the inner solar system, which means it has been warmed far less than a comet of its age has any right to be.',
      'The catching medium was aerogel, a silica foam that is 99.8% air. Grains arriving at 6 km/s had to be stopped without being vaporised, and they buried themselves in carrot-shaped tracks that could be cut out and studied.',
      'The samples contained a mineral that forms above 1,000 °C, later named for the mission. Finding it in a body assembled in the coldest part of the solar system meant material was being transported outward from near the Sun on a huge scale.',
      'Glycine, the simplest amino acid, was identified in the returned samples in 2009 — found in the laboratory rather than inferred from a spectrum.',
      'The nucleus turned out to be covered in steep-walled flat-floored depressions up to 2 km across, unlike anything on any other comet imaged since.',
    ],
    story: [
      'The value of a sample return is that it does not end. Everything a flyby learns is limited by the instruments that were on board when it launched; a returned sample is examined by every instrument that has been built since, and Wild 2 grains have been reanalysed continuously for two decades with techniques that did not exist when Stardust flew.',
      'The result overturned the simple picture. Comets were supposed to be the solar system’s deep freeze — material from the cold outer disc, never heated, preserved as it was. The grains include crystals that can only have formed within a fraction of an astronomical unit of the young Sun. Something moved material from the very hottest region to the very coldest one before the comets assembled, and the discovery is what turned the early disc from a static picture into a violently mixing one.',
    ],
    nasaLinks: [
      { label: 'NASA — Stardust', url: 'https://science.nasa.gov/mission/stardust/' },
      { label: 'NASA — 81P/Wild 2', url: 'https://science.nasa.gov/solar-system/comets/81p-wild/' },
    ],
  },

  '103p_hartley_2': {
    diameter: '2.2 km long',
    atmosphere:
      'A coma driven by carbon dioxide rather than water — jets of CO2 gas from the rough ends of the nucleus carry ice grains out with them, and those grains make most of the visible coma.',
    description:
      'A small, extremely active comet visited by the Deep Impact spacecraft in November 2010, after its main mission was over. Hartley 2 gives off far more gas for its size than a comet this small should, and the flyby found out why.',
    facts: [
      'It is shaped like a peanut, 2.2 km end to end, with two rough lobes joined by a smooth narrow waist.',
      'The two ends behave completely differently. Carbon dioxide jets fire from the rough ends, carrying chunks of water ice — some of them the size of a grapefruit — out into the coma; the smooth middle releases water vapour quietly, without jets.',
      'That distinction was new. Every comet visited before it was assumed to be driven by water sublimating from the surface, and here most of the activity is CO2 lifting solid ice off it instead.',
      'It tumbles: turning about one axis roughly every 18 hours while that axis itself swings round every 27, so its illumination pattern never repeats exactly.',
      'The comet is the source of the Draconid meteor shower, which is usually feeble and occasionally produces thousands of meteors an hour.',
    ],
    story: [
      'The mission that visited it was already finished. Deep Impact had spent its impactor at Tempel 1 in 2005 and was left with a working flyby spacecraft, healthy instruments, and no target. Retargeting it cost a fraction of a new mission and produced the closest look anyone has had at a hyperactive comet — one of a series of extended missions in this app that outlived what they were built to do.',
      'What it found reframed a category. Hartley 2 was known to be over-productive for its size, and the flyby showed that much of what telescopes had been measuring as gas was actually ice grains in the coma, sublimating slowly out there rather than on the surface. The effective emitting area is much larger than the nucleus, which is how something two kilometres across manages to look like a much bigger comet.',
    ],
    nasaLinks: [
      { label: 'NASA — EPOXI at Hartley 2', url: 'https://science.nasa.gov/mission/deep-impact/' },
      { label: 'NASA — 103P/Hartley 2', url: 'https://science.nasa.gov/solar-system/comets/103p-hartley-2/' },
    ],
  },

  '19p_borrelly': {
    diameter: '8 × 4 × 4 km',
    atmosphere:
      'A coma with a single dominant jet, and — unusually — a nucleus whose surface has almost no exposed ice on it at all.',
    description:
      'A comet photographed almost by accident. Deep Space 1 was a mission to test new technology, ion propulsion above all; having done so and having fuel left, it was pointed at Borrelly and returned the best images of a cometary nucleus anyone had until Rosetta.',
    facts: [
      'The spacecraft had no working star tracker by then — it had failed a year earlier — and was being navigated with its camera. It passed 2,171 km from the nucleus in September 2001 with no protection against dust and survived.',
      'The nucleus is shaped like a bowling pin, and darker than a photocopier toner: it reflects about 3% of the light that reaches it.',
      'No water ice was detected on the surface at all, despite the comet plainly producing water. The ice is beneath a crust, and the gas escapes through it.',
      'One broad jet dominates the output, coming from a smooth central region and pointing roughly at the Sun.',
    ],
    story: [
      'Deep Space 1 is in this app twice over: it is a comet flyby and it is the flight that proved the propulsion Dawn and Psyche now use. Ion engines had been laboratory hardware for decades and nobody had flown one as primary propulsion, because a thruster producing the force of a sheet of paper resting on your hand is hard to trust across a solar system. It ran for 16,000 hours.',
      'The Borrelly encounter was a bonus objective on a mission whose formal goals were already met, flown with a degraded spacecraft that was steering by camera, and it produced the sharpest cometary images of its era. It was switched off three months later.',
    ],
    nasaLinks: [
      { label: 'NASA — Deep Space 1', url: 'https://science.nasa.gov/mission/deep-space-1/' },
      { label: 'NASA — 19P/Borrelly', url: 'https://science.nasa.gov/solar-system/comets/19p-borrelly/' },
    ],
  },

  'c_1995_o1': {
    atmosphere:
      'A coma that reached a million kilometres across, with three tails rather than the usual two: dust, ions, and a faint third of neutral sodium atoms nobody had ever clearly seen before.',
    description:
      'The Great Comet of 1997, and the most widely observed comet in history. Hale-Bopp was visible to the naked eye for eighteen months — longer than any comet on record — and was bright enough to be seen from inside cities, which is why so many people who have seen exactly one comet have seen this one.',
    facts: [
      'It was found at 7.2 AU, further out than any comet had been discovered before, by two independent observers on the same night in July 1995. Alan Hale was watching for it deliberately; Thomas Bopp was at a star party with a borrowed telescope.',
      'Being visible that far out meant it was enormous. The nucleus is estimated at 40 to 80 km across, some ten times Halley’s, and that size is why it stayed bright for so long.',
      'The sodium tail was a genuine discovery: a third tail, 50 million km long, of neutral sodium atoms pushed away by sunlight pressure alone.',
      'Its orbit was changed by the visit. It arrived on a roughly 4,200-year period and left on one closer to 2,500 years, bent by passing near Jupiter.',
      'It remained visible in amateur telescopes until 2007 and was still being detected beyond Saturn’s distance in the 2020s.',
    ],
    story: [
      'A comet is bright for one of two reasons: it is close, or it is big. Most great comets are the first kind and are visible for weeks. Hale-Bopp was the second, and never came especially close to Earth — it stayed on the far side of 1.3 AU throughout — which is exactly why the show lasted so long. Nothing had to line up.',
      'Its fame has an ugly footnote. A claim circulated that a spacecraft was following the comet, based on a misread photograph, and the Heaven’s Gate group cited it in the mass suicide of thirty-nine people in March 1997, days before perihelion. The astronomers who had found the comet spent the weeks of its greatest visibility publicly explaining that there was nothing behind it.',
    ],
    nasaLinks: [
      { label: 'NASA — C/1995 O1 (Hale-Bopp)', url: 'https://science.nasa.gov/solar-system/comets/c-1995-o1-hale-bopp/' },
      { label: 'NASA — Comets overview', url: 'https://science.nasa.gov/solar-system/comets/' },
    ],
  },

  'c_2020_f3': {
    atmosphere:
      'A broad dust tail with a visible split — a yellowish sodium component beside the ordinary dust — and a fainter blue ion tail.',
    description:
      'The brightest comet in the northern sky since 1997, and the one most people alive have actually seen. NEOWISE was discovered by an infrared space telescope in March 2020 and became a naked-eye object in July, hanging under the Plough in the evening sky for several weeks.',
    facts: [
      'It was found by a spacecraft that was not built to find comets. WISE was an infrared sky survey; after its coolant ran out it was repurposed to hunt near-Earth objects, and the comet carries the name of the second mission rather than the first.',
      'It survived perihelion at 0.29 AU, inside Mercury’s orbit, which is where most comets of its size come apart. Its nucleus is about 5 km across — large enough to hold together.',
      'Astronauts on the International Space Station photographed it against the airglow, and those images did more to publicise it than any observatory’s.',
      'Its orbit is close to 7,000 years, so it was last here around 5000 BC.',
    ],
    story: [
      'The timing is why it is remembered. It reached naked-eye brightness in July 2020, when a great many people were spending unusual amounts of time at home and outdoors after dark, and it needed nothing but a clear northern horizon. Two heavily promoted comets earlier that same year — ATLAS and SWAN — had both fallen apart before they arrived, so expectations were low and it was found by people who had stopped looking.',
      'It also demonstrates what an infrared survey is for. A comet that far out is cold and dark and reflects almost nothing, but it glows in the infrared, and NEOWISE spotted it months before it was doing anything visible. The same survey exists to find asteroids on Earth-crossing orbits, which are dark for the same reason.',
    ],
    nasaLinks: [
      { label: 'NASA — C/2020 F3 (NEOWISE)', url: 'https://science.nasa.gov/solar-system/comets/c-2020-f3-neowise/' },
      { label: 'NASA — NEOWISE mission', url: 'https://science.nasa.gov/mission/neowise/' },
    ],
  },

  'c_2013_a1': {
    atmosphere:
      'A coma that swept over Mars — the only time a comet’s atmosphere has been sampled directly by spacecraft in orbit around another planet.',
    description:
      'The comet that grazed Mars. On 19 October 2014 Siding Spring passed about 140,000 km from the planet — a third of the Earth–Moon distance — and every spacecraft at Mars was moved to the far side to shelter from the dust.',
    facts: [
      'The odds were remarkable and briefly alarming: early orbits could not rule out an impact, and it took months of observation to establish it would miss.',
      'Five orbiters and two rovers were at Mars for the encounter, and the orbiters were manoeuvred so the planet was between them and the dust stream at the moment of closest approach. The rovers, protected by the atmosphere, watched from the ground.',
      'MAVEN detected a layer of metal ions — magnesium, iron, sodium — high in the Martian atmosphere, from cometary dust burning up. It is the only time anyone has watched a meteor shower deposit metals into another planet’s ionosphere.',
      'It came from the Oort cloud on its first visit to the inner solar system, which means the material it shed had never been warmed before.',
    ],
    story: [
      'The encounter was a windfall that had to be defended against. A comet passing a planet that closely is a chance to measure fresh Oort-cloud material with instruments already in place, and simultaneously a hazard: dust arriving at 56 km/s can destroy a spacecraft with a grain the size of a grit. The response was to keep everything and hide it, timing the orbits so all five spacecraft were behind Mars during the thirty minutes that mattered.',
      'Everything survived, and the observations were made either side of the shelter period. The atmospheric measurements are still the only direct sampling of a long-period comet’s coma anywhere but Earth.',
    ],
    nasaLinks: [
      { label: 'NASA — Comet Siding Spring at Mars', url: 'https://science.nasa.gov/solar-system/comets/c-2013-a1-siding-spring/' },
      { label: 'NASA — MAVEN', url: 'https://science.nasa.gov/mission/maven/' },
    ],
  },

  'c_2012_s1': {
    atmosphere:
      'A coma that ended. ISON was still producing gas and dust hours before perihelion and had none left afterwards — what emerged was a spreading cloud of debris.',
    description:
      'The comet that did not survive. ISON was billed for a year as a potential comet of the century, on a course that took it 1.2 million km above the Sun’s surface on 28 November 2013. It went in bright and came out as a fading smear.',
    facts: [
      'Its perihelion was 0.0125 AU — closer to the Sun than any comet in this app, and inside the corona, where the temperature is measured in millions of degrees.',
      'It was tracked through the encounter by solar observatories that watch the Sun continuously, so the destruction of a comet was witnessed in detail for the first time, live, by an audience following along online.',
      'The nucleus was probably under 2 km across, which is small for what it attempted. Sungrazers that survive are generally larger.',
      'It was another Oort-cloud comet making a first pass, which is the least predictable kind: the surface has never been processed, so its behaviour on approach says little about how it will hold together.',
    ],
    story: [
      'It was a lesson in how badly comets are predicted. Brightness a year out is a poor guide, because it depends on volatile ices near the surface that a fresh comet has plenty of and then exhausts, and the extrapolation from an early bright reading to an object that outshines the Moon is an extrapolation over factors nobody can model. ISON did what a substantial fraction of first-time sungrazers do.',
      'The scientific return was better than the spectacle. A comet coming apart under solar heating and tidal stress is an experiment nobody could arrange, and it was watched by a fleet of spacecraft designed for the Sun rather than for comets. What was left afterwards was rubble on the outbound track, dispersing.',
    ],
    nasaLinks: [
      { label: 'NASA — Comet ISON', url: 'https://science.nasa.gov/solar-system/comets/c-2012-s1-ison/' },
      { label: 'NASA — Sungrazing comets', url: 'https://science.nasa.gov/solar-system/comets/' },
    ],
  },

  'c_2019_y4': {
    atmosphere:
      'A coma that outlived its nucleus: after the comet fragmented in April 2020 the gas kept coming from pieces too small to see, and the tail persisted for weeks.',
    description:
      'A comet that fell apart on camera. ATLAS brightened rapidly through early 2020 and was expected to become an easy naked-eye object; instead its nucleus split into more than two dozen pieces, and Hubble caught them scattering.',
    facts: [
      'Its orbit is nearly identical to the Great Comet of 1844, which means the two are fragments of a single larger comet that broke up centuries ago. This one was already a piece of something.',
      'Hubble resolved about thirty fragments in late April 2020, each wrapped in its own dust, drifting apart along the orbit. Sequences taken days apart show individual pieces appearing and vanishing.',
      'The break-up happened well before perihelion and at a comfortable 1.4 AU from the Sun, so heating alone does not explain it. A nucleus spun up by outgassing until it came apart is the leading account.',
      'It was one of three comets in 2020 that were promoted as spectacles and disappointed, before NEOWISE arrived unheralded and delivered.',
    ],
    story: [
      'Comets disintegrate more often than the coverage suggests, and this one is unusually well documented because it did so within reach of a space telescope and after months of attention. The fragments are the interesting part: a nucleus that pulls apart at 1.4 AU is being held together by essentially nothing, which supports what Deep Impact found at Tempel 1 — that a comet has the tensile strength of a snowdrift.',
      'That it was already a fragment of the 1844 comet makes it a second-generation break-up, and the family it belongs to is presumably still coming apart. Whatever remains will pass again in about five thousand years, in more pieces.',
    ],
    nasaLinks: [
      { label: 'NASA — Hubble watches Comet ATLAS break up', url: 'https://science.nasa.gov/missions/hubble/' },
      { label: 'NASA — Comets overview', url: 'https://science.nasa.gov/solar-system/comets/' },
    ],
  },

  'c_2010_x1': {
    atmosphere:
      'Nothing left. Elenin came apart in August 2011 and what reached perihelion was a dispersing cloud, faint enough that some telescopes could not find it at all.',
    description:
      'A small, faint comet remembered almost entirely for what was invented about it. Elenin was discovered in December 2010, disintegrated before it reached the Sun, and in between became the subject of one of the more energetic doomsday campaigns of the internet era.',
    facts: [
      'It was never bright. At its best it needed a telescope, and its closest approach to Earth was 0.23 AU — about ninety times the distance to the Moon.',
      'It was found by Leonid Elenin, a Russian amateur, using a remotely operated telescope in New Mexico — an increasingly common way for comets to be discovered.',
      'A solar outburst in August 2011 appears to have destroyed it. By September only an expanding cloud remained, and nothing at all was recovered afterwards.',
      'JPL published a specific rebuttal of the claims made about it, which is not something a faint comet usually warrants.',
    ],
    story: [
      'The claims were that it was a brown dwarf, or a spacecraft, or on a collision course, or aligned with earthquakes, and that its name was an acronym. None of it was true and all of it travelled further than the comet ever did. A four-kilometre object at a hundred million kilometres exerts a tidal pull on Earth smaller than that of a passing lorry.',
      'It is in this app because it is on the Eyes on the Solar System roster, and it earns its place for a better reason than the mythology: it is a clean example of the ordinary fate of a small comet on its first approach. Most of them do not put on a show. Some of them do not arrive.',
    ],
    nasaLinks: [
      { label: 'NASA — Comet Elenin: preposterous predictions', url: 'https://science.nasa.gov/solar-system/comets/' },
      { label: 'JPL — Small-Body Database', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    ],
  },

  '1i_oumuamua': {
    atmosphere:
      'None found, and that is the puzzle. Every search for a coma came back empty, and yet the object accelerated as though something were escaping from it.',
    description:
      'The first object from another star ever seen passing through the solar system. ʻOumuamua was picked up in October 2017 on its way out, already past the Sun and past the Earth, and was observable for barely two weeks before it faded beyond reach.',
    facts: [
      'Its orbit settled the question by itself. At an eccentricity of 1.2 it is not bound to the Sun, has not been round before, and is leaving at a speed nothing in the solar system could have given it.',
      'It was never resolved as a shape. Everything known about its form comes from its brightness varying by a factor of ten as it tumbled, which implies something at least five times longer than it is wide — more extreme than any known asteroid.',
      'It accelerated slightly as it left, by an amount sunlight pressure alone cannot account for. On any ordinary comet that means outgassing; no gas was detected, to sensitive limits.',
      'The favoured explanations involve ices that sublimate without producing visible dust — nitrogen or hydrogen — which would make it a fragment of something rather than a whole object.',
      'The name is Hawaiian, for a scout or messenger from the distant past, and was chosen by the survey in Hawaii that found it.',
    ],
    story: [
      'It was found on the way out, and that is the whole difficulty. By the time the orbit was solved it was already receding and fading fast, and nothing existed that could be launched to catch it. Every claim about ʻOumuamua rests on about two weeks of photometry and spectra from an object that was never more than a point of light.',
      'Which is why the arguments have been so hard to settle. A non-gravitational acceleration with no visible outgassing is a genuine anomaly, and the range of explanations offered — nitrogen ice chipped off a Pluto-like body, a fluffy fractal aggregate, a hydrogen iceberg, and rather more speculative proposals — cannot be distinguished with the data that exists. There will be no more of it.',
      'The lasting result is not the object but the expectation. ʻOumuamua established that interstellar visitors pass through often enough to catch, and 2I/Borisov turned up two years later, and a third in 2025. The next one will be found earlier, because everybody is now looking.',
    ],
    nasaLinks: [
      { label: 'NASA — ʻOumuamua', url: 'https://science.nasa.gov/solar-system/comets/oumuamua/' },
      { label: 'NASA — Interstellar objects', url: 'https://science.nasa.gov/solar-system/comets/' },
    ],
  },

  'c_2025_n1': {
    atmosphere:
      'A real coma, which is the headline difference from ʻOumuamua: this one behaves like a comet, and could be watched doing so.',
    description:
      'The third interstellar object found passing through the solar system, discovered on 1 July 2025 by the ATLAS survey in Chile. Its eccentricity of 6.1 is far beyond anything the Sun could impose, and it is the least ambiguous interstellar orbit yet measured.',
    facts: [
      'Its orbit is the most emphatically unbound of the three. ʻOumuamua came in at an eccentricity of 1.2 and Borisov at 3.4; at 6.1 this one arrived considerably faster and is leaving the same way.',
      'It came in almost exactly against the flow, at 175° to the plane the planets orbit in — very nearly a head-on retrograde approach.',
      'Its perihelion was outside Earth’s orbit, between Earth and Mars, so it was never close and never bright to the naked eye.',
      'Unlike ʻOumuamua it was found on the way in, which gave months of observation rather than days.',
    ],
    story: [
      'Three interstellar objects in eight years, after none in all of recorded history, is a statement about telescopes rather than about the galaxy. Nothing changed out there; sky surveys got fast enough and deep enough to notice things that are faint, moving oddly, and only briefly present. The population was always passing through.',
      'This one is the useful case because it was caught early and it is active. ʻOumuamua gave two weeks of a point source and an unexplained acceleration; a comet that visibly outgasses can be spectroscopically taken apart, and what it is made of is a sample of another planetary system’s building material — which is a thing nobody has ever had.',
    ],
    nasaLinks: [
      { label: 'NASA — Interstellar comet 3I/ATLAS', url: 'https://science.nasa.gov/solar-system/comets/' },
      { label: 'JPL — Small-Body Database', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html' },
    ],
  },
}
