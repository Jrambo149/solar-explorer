/**
 * The spacecraft this app draws, taken from NASA's Eyes on the Solar System.
 *
 * Read out of Eyes' `app.js` by a brace-matching parse, the same source and the
 * same reasoning as `minor-moon-roster.mjs` and the comet roster: taking its
 * list means the two apps agree on what exists rather than on what someone
 * typed.
 *
 * ## Why only 75 of Eyes' 220
 *
 * Eyes carries 220 spacecraft and 145 of them are **Earth-orbiting
 * satellites** — the TDRS relays, the Landsat series, the NOAA weather birds,
 * the CYGNSS and TROPICS constellations. They are left for a later pass for a
 * reason that is about data rather than taste: JPL's Horizons has ephemerides
 * for deep-space missions but not for most of that fleet. `Landsat 8` and
 * `TDRS 11` both come back "No matches found", and the only source for them is
 * a TLE, which is an SGP4 element set rather than a Keplerian one and which
 * goes stale within weeks of its epoch. Baking a TLE into a static app means
 * shipping a satellite that is already in the wrong place.
 *
 * The 75 here are every craft that went somewhere: the Mars and Moon fleets,
 * the outer-planet missions, the small-body missions, and the handful that went
 * to look at the Sun.
 *
 * ## Segments, and why a spacecraft is not an ellipse
 *
 * Every other body in this app is a Keplerian orbit around one fixed parent,
 * solved analytically. A spacecraft is not: it launches, coasts, burns, swings
 * past a planet and gets captured, and no ellipse describes that. Eyes handles
 * it by streaming sampled trajectories from a service at runtime, keyed to a
 * `parents` list that hands the craft from one reference frame to the next:
 *
 *     sc_voyager_1  parents: [[-704412035.617, "earth"],
 *                             [-703530245,     "sun"],
 *                             [-660264745,     "jupiter"],
 *                             [-655057463,     "sun"],
 *                             [-606239665,     "saturn"],
 *                             [-600733702,     "sun"]]
 *
 * — Earth at launch, the Sun in cruise, Jupiter through the 1979 encounter, the
 * Sun again, Saturn through 1980, then the Sun for good.
 *
 * This app makes no runtime requests, so the trajectories are **sampled at
 * build time** by `fetch-spacecraft.mjs` and baked, one run of samples per
 * segment, in that segment's own frame. `trajectory.js` interpolates them.
 *
 * The numbers are **ET seconds past J2000**, SPICE's own convention, which is
 * what Eyes stores and what Horizons speaks. `fetch-spacecraft.mjs` converts.
 *
 * ## The terminal segment
 *
 * A `parents` entry whose frame is the empty string is not a frame — it is the
 * end of the mission. Cassini's last entry is `[558743640, ""]`, which is
 * 2017-09-15, the day it was flown into Saturn. Galileo, Deep Impact's
 * impactor, the Grail pair and a dozen others carry the same marker. A craft
 * with one is drawn only up to that instant; before launch and after the end it
 * does not exist rather than being frozen at its last position.
 */

/**
 * Eyes frame id -> the Horizons center this app fetches against, and the body
 * id the samples are stored relative to.
 *
 * `horizons` is Horizons' own center code. `body` is this app's body id, or
 * null where the app has no such body — see `FALLBACK` below.
 */
export const FRAMES = {
  sun: { horizons: '500@10', body: 'sun' },
  mercury: { horizons: '500@199', body: 'mercury' },
  venus: { horizons: '500@299', body: 'venus' },
  earth: { horizons: '500@399', body: 'earth' },
  moon: { horizons: '500@301', body: 'luna' },
  mars: { horizons: '500@499', body: 'mars' },
  jupiter: { horizons: '500@599', body: 'jupiter' },
  saturn: { horizons: '500@699', body: 'saturn' },
  uranus: { horizons: '500@799', body: 'uranus' },
  neptune: { horizons: '500@899', body: 'neptune' },
  io: { horizons: '500@501', body: 'io' },
  europa: { horizons: '500@502', body: 'europa' },
  ganymede: { horizons: '500@503', body: 'ganymede' },
  titan: { horizons: '500@606', body: 'titan' },
  '134340_pluto': { horizons: '500@999', body: 'pluto' },
  '1_ceres': { horizons: '500@2000001', body: 'ceres' },
}

/**
 * Frames this app has no body for, and what to sample them against instead.
 *
 * Eyes centres a flyby on the thing being flown past, and for most of these
 * that thing is an asteroid or comet Solar Explorer does not draw — Bennu,
 * Eros, Vesta, Braille, the five Lucy targets. It also centres the descent
 * phases on a *landing site*, which is a point fixed to a rotating planet's
 * surface rather than a body at all, and it parents a released probe to its
 * own carrier (`sc_galileo`, `sc_deep_impact`, `sc_stardust`).
 *
 * All of them fall back to the Sun. The craft is then still in exactly the
 * right place in space — a heliocentric sample is a heliocentric sample — it
 * simply is not held in a close frame while it is there. What is lost is the
 * ability to sit on Bennu and watch OSIRIS-REx station-keep; what is kept is
 * every position being real.
 *
 * The landing sites are the one case where this is visible: a lander's last
 * segment is its descent, and against the Sun that reads as arriving at Mars
 * rather than touching down on it. Mars' own frame is used for those rather
 * than the Sun, which is closer to right and is why this is a map rather than
 * a single default.
 */
export const FALLBACK = {
  sc_mars_2020_landing_site: 'mars',
  sc_mars_science_laboratory_landing_site: 'mars',
  sc_mars_exploration_rover_1_landing_site: 'mars',
  sc_mars_exploration_rover_2_landing_site: 'mars',
  sc_phoenix_landing_site: 'mars',
}

/** Everything else with no frame of its own is sampled heliocentrically. */
export const DEFAULT_FRAME = 'sun'

/**
 * The 75, in Eyes' own order within each group.
 *
 * `radiusKm` is Eyes' `extentsRadius`, falling back to `occlusionRadius`, and
 * it really is kilometres — Voyager's 0.0043 is the 4.3 m across its high-gain
 * dish. Ten of the 75 carry neither and take a 5 m default; they are the ones
 * Eyes draws as a bare marker with no mesh at all (Viking, Venus Express,
 * Apollo 15, WMAP and friends), so nothing is being sized by the guess.
 *
 * `model` is Eyes' own path within its model tree, kept verbatim because the
 * filename inside a directory is frequently not the directory's name —
 * `sc_dawn/model.gltf`, `sc_marco/model.gltf`, `sc_grail/grail_b.gltf`. Guessing
 * it produced a 403 for Juno on the first attempt, exactly as it did for three
 * of the comets.
 *
 * `rotate` is Eyes' own correction from the model's authored axes into its
 * scene, applied in order and in degrees.
 *
 * `segments` is the `parents` list described above: ET seconds past J2000
 * paired with the frame that takes over at that instant.
 */

export const SPACECRAFT = [
  { id: 'sc_apollo_15', name: 'Apollo 15', group: 'moon', radiusKm: 0.005,
    model: null, rotate: null,
    segments: [[-897044358.3260887, 'moon'], [-896822958.3195117, '']] },
  { id: 'sc_artemis_1', name: 'Artemis I', group: 'moon', radiusKm: 0.005,
    model: 'sc_artemis/artemis_ii.gltf', rotate: null,
    segments: [[721860361, 'earth'], [724052473, '']] },
  { id: 'sc_artemis_2', name: 'Artemis II', group: 'moon', radiusKm: 0.01,
    model: 'sc_artemis/artemis_ii.gltf', rotate: null,
    segments: [[828372485.86066, 'earth'], [829137247.80165, '']] },
  { id: 'sc_capstone', name: 'CAPSTONE', group: 'moon', radiusKm: 0.005,
    model: 'sc_capstone/capstone.gltf', rotate: null,
    segments: [[710191748, 'earth'], [721583059, 'moon']] },
  { id: 'sc_clementine', name: 'Clementine', group: 'moon', radiusKm: 0.005,
    model: 'sc_clementine/clementine.gltf', rotate: [{z:-90}],
    segments: [[-187185539, 'earth'], [-185065319, 'moon'], [-178496940, '']] },
  { id: 'sc_danuri', name: 'Danuri (Korea Pathfinder Lunar Orbiter)', group: 'moon', radiusKm: 0.0032,
    model: 'sc_danuri/danuri.gltf', rotate: [{x:-90},{z:-90}],
    segments: [[712929310, 'earth'], [724456233, 'moon']] },
  { id: 'sc_grail_a', name: 'Ebb', group: 'moon', radiusKm: 0.005,
    model: 'sc_grail/grail_b.gltf', rotate: null,
    segments: [[368932239, 'earth'], [377620394, 'moon'], [409055394, '']] },
  { id: 'sc_grail_b', name: 'Flow', group: 'moon', radiusKm: 0.005,
    model: 'sc_grail/grail_b.gltf', rotate: null,
    segments: [[368932239, 'earth'], [378599282, 'moon'], [409055423, '']] },
  { id: 'sc_ladee', name: 'LADEE', group: 'moon', radiusKm: 0.005,
    model: 'sc_ladee/ladee.gltf', rotate: null,
    segments: [[431797927, 'earth'], [434203267, 'moon'], [451067572, '']] },
  { id: 'sc_lcross', name: 'LCROSS', group: 'moon', radiusKm: 0.0022,
    model: 'sc_lcross/lcross.gltf', rotate: [{z:-90}],
    segments: [[298635466, 'earth'], [308333606, 'moon'], [308360202.356, '']] },
  { id: 'sc_lunar_flashlight', name: 'Lunar Flashlight', group: 'moon', radiusKm: 0.0005,
    model: 'sc_lunar_flashlight/lunar_flashlight.gltf', rotate: null,
    segments: [[724019554, 'earth'], [737640069, '']] },
  { id: 'sc_lunar_prospector', name: 'Lunar Prospector', group: 'moon', radiusKm: 0.0022,
    model: 'sc_lunar_prospector/lunar_prospector.gltf', rotate: null,
    segments: [[-62206800, 'moon'], [-13402020, '']] },
  { id: 'sc_lunar_reconnaissance_orbiter', name: 'Lunar Reconnaissance Orbiter', group: 'moon', radiusKm: 0.0038,
    model: 'sc_lunar_reconnaissance_orbiter/LRO.gltf', rotate: [{z:-90}],
    segments: [[298635426.1844444, 'earth'], [298929666, 'moon']] },
  { id: 'sc_smart_1', name: 'SMART-1', group: 'moon', radiusKm: 0.00653,
    model: null, rotate: null,
    segments: [[117977163.35299999, 'earth'], [153410717, 'moon'], [210585600, '']] },
  { id: 'sc_themis_b', name: 'ARTEMIS P1', group: 'moon', radiusKm: 0.0017,
    model: 'sc_themis/themis.gltf', rotate: null,
    segments: [[225029706, 'earth'], [362424822, 'moon']] },
  { id: 'sc_themis_c', name: 'ARTEMIS P2', group: 'moon', radiusKm: 0.0017,
    model: 'sc_themis/themis.gltf', rotate: null,
    segments: [[225029706, 'earth'], [364189900, 'moon']] },
  { id: 'sc_escapade_blue', name: 'ESCAPADE Blue', group: 'mars', radiusKm: 0.005,
    model: 'sc_escapade/escapade.gltf', rotate: null,
    segments: [[816342898, 'earth'], [847971260, 'sun'], [873517951, 'mars']] },
  { id: 'sc_escapade_gold', name: 'ESCAPADE Gold', group: 'mars', radiusKm: 0.005,
    model: 'sc_escapade/escapade.gltf', rotate: null,
    segments: [[816342898, 'earth'], [847971260, 'sun'], [873258326, 'mars']] },
  { id: 'sc_mars_2020', name: 'Mars 2020', group: 'mars', radiusKm: 0.003,
    model: 'sc_mars_2020/cruise_whole/msl_cruise_stage.gltf', rotate: [{x:-90}],
    segments: [[649385564, 'earth'], [649595376, 'sun'], [666932224, 'mars'], [666952859, 'sc_mars_2020_landing_site']] },
  { id: 'sc_mars_science_laboratory', name: 'Mars Science Laboratory', group: 'mars', radiusKm: 0.004,
    model: 'sc_mars_science_laboratory/cruise/msl_cruisestage.gltf', rotate: [{x:-90}],
    segments: [[375594733, 'earth'], [376039259, 'sun'], [397477501, 'mars'], [397502386.832, 'sc_mars_science_laboratory_landing_site']] },
  { id: 'sc_mars_exploration_rover_1', name: 'Opportunity', group: 'mars', radiusKm: 0.0026,
    model: 'sc_mars_exploration_rover/cruise/mpf_mera_merb_cruise.gltf', rotate: [{x:90}],
    segments: [[110911022.184, 'earth'], [111234172, 'sun'], [128262836, 'mars'], [128278419, 'sc_mars_exploration_rover_1_landing_site'], [581920316.8566707, '']] },
  { id: 'sc_mars_exploration_rover_2', name: 'Spirit', group: 'mars', radiusKm: 0.0026,
    model: 'sc_mars_exploration_rover/cruise/mpf_mera_merb_cruise.gltf', rotate: [{x:90}],
    segments: [[108541883.184, 'earth'], [108887371, 'sun'], [126444477, 'mars'], [126462105, 'sc_mars_exploration_rover_2_landing_site'], [322567479.3896215, '']] },
  { id: 'sc_insight', name: 'InSight', group: 'mars', radiusKm: 0.005,
    model: 'sc_insight/lander/insight.gltf', rotate: [{y:90}],
    segments: [[578795968.9654216, 'earth'], [579182469.185, 'sun'], [596376069.183, 'mars']] },
  { id: 'sc_marco_a', name: 'MarCO A', group: 'mars', radiusKm: 0.005,
    model: 'sc_marco/model.gltf', rotate: null,
    segments: [[578796051, 'earth'], [579182469.185, 'sun'], [596376069.183, 'mars'], [596552080, 'sun'], [631152000, '']] },
  { id: 'sc_marco_b', name: 'MarCO B', group: 'mars', radiusKm: 0.005,
    model: 'sc_marco/model.gltf', rotate: null,
    segments: [[578796051, 'earth'], [579182469.185, 'sun'], [596376069.183, 'mars'], [596552080, 'sun'], [631152000, '']] },
  { id: 'sc_mars_odyssey', name: 'Mars Odyssey', group: 'mars', radiusKm: 0.004,
    model: 'sc_mars_odyssey/mars_odyssey.gltf', rotate: null,
    segments: [[39932700, 'earth'], [40233664, 'sun'], [57128464, 'mars']] },
  { id: 'sc_mars_reconnaissance_orbiter', name: 'Mars Reconnaissance Orbiter', group: 'mars', radiusKm: 0.005,
    model: 'sc_mars_reconnaissance_orbiter/MRO.gltf', rotate: null,
    segments: [[177122516, 'earth'], [177429664, 'sun'], [195285665, 'mars']] },
  { id: 'sc_maven', name: 'MAVEN', group: 'mars', radiusKm: 0.005,
    model: 'sc_maven/Maven.gltf', rotate: [{x:90},{z:90}],
    segments: [[438074509.3428109, 'earth'], [438296467, 'sun'], [464590867, 'mars']] },
  { id: 'sc_mars_express', name: 'Mars Express', group: 'mars', radiusKm: 0.005,
    model: 'sc_mars_express/mars_express.gltf', rotate: [{x:90},{z:-180}],
    segments: [[107853140.59600002, 'earth'], [108232264, 'sun'], [125539264, 'mars']] },
  { id: 'sc_phoenix', name: 'Phoenix', group: 'mars', radiusKm: 0.005,
    model: 'sc_phoenix/cruise/phoenix_cruise.gltf', rotate: [{z:90}],
    segments: [[239496427, 'earth'], [239618121, 'sun'], [265008306, 'mars'], [265030318, 'sc_phoenix_landing_site'], [278942465, '']] },
  { id: 'sc_trace_gas_orbiter', name: 'Trace Gas Orbiter', group: 'mars', radiusKm: 0.005,
    model: 'sc_trace_gas_orbiter/TGO.gltf', rotate: [{x:-90},{y:-90}],
    segments: [[511257268, 'earth'], [511941668, 'sun'], [530107268, 'mars']] },
  { id: 'sc_mars_orbiter_mission', name: 'Mars Orbiter Mission', group: 'mars', radiusKm: 0.005,
    model: null, rotate: null,
    segments: [[436917230, 'earth'], [439621267, 'sun'], [464758867, 'mars'], [702924129, '']] },
  { id: 'sc_mars_global_surveyor', name: 'Mars Global Surveyor', group: 'mars', radiusKm: 0.005,
    model: 'sc_mars_global_surveyor/mars_global_surveyor.gltf', rotate: [{x:90}],
    segments: [[-99329637, 'earth'], [-99081876, 'sun'], [-72717692, 'mars'], [215806800, '']] },
  { id: 'sc_mars_climate_orbiter', name: 'Mars Climate Orbiter', group: 'mars', radiusKm: 0.005,
    model: null, rotate: null,
    segments: [[-33318000, 'earth'], [-33074503, 'sun'], [-8818837, 'mars'], [-7689600, '']] },
  { id: 'sc_mars_pathfinder', name: 'Mars Pathfinder', group: 'mars', radiusKm: 0.005,
    model: null, rotate: null,
    segments: [[-91704541, 'sun'], [-78692880, '']] },
  { id: 'sc_mars_polar_lander', name: 'Mars Polar Lander', group: 'mars', radiusKm: 0.005,
    model: null, rotate: null,
    segments: [[-31298400, 'earth'], [-31084810, 'sun'], [-2507347, 'mars'], [-2476791, '']] },
  { id: 'sc_viking_1_orbiter', name: 'Viking 1 Orbiter', group: 'mars', radiusKm: 0.005,
    model: null, rotate: null,
    segments: [[-742490410, 'mars'], [-663249600, '']] },
  { id: 'sc_viking_2_orbiter', name: 'Viking 2 Orbiter', group: 'mars', radiusKm: 0.005,
    model: null, rotate: null,
    segments: [[-738460186, 'mars'], [-676517400, '']] },
  { id: 'sc_messenger', name: 'MESSENGER', group: 'mercury', radiusKm: 0.0035,
    model: 'sc_messenger/Messenger.gltf', rotate: [{z:-90},{y:90}],
    segments: [[144789279.39320505, 'earth'], [145066469, 'sun'], [175801890, 'earth'], [176659095, 'sun'], [214828942, 'venus'], [215033751, 'sun'], [234289415, 'venus'], [234436749, 'sun'], [253547108, 'mercury'], [253671753, 'sun'], [276485360, 'mercury'], [276627276, 'sun'], [307423681, 'mercury'], [307651285, 'sun'], [353474040, 'mercury'], [483694028.351, '']] },
  { id: 'sc_juno', name: 'Juno', group: 'jupiter', radiusKm: 0.01,
    model: 'sc_juno/Juno.gltf', rotate: [{x:90}],
    segments: [[365836752.1832, 'earth'], [366088266.183, 'sun'], [434433667.182, 'earth'], [434793667.182, 'sun'], [519652868.184, 'jupiter'], [676339597, 'ganymede'], [676381521, 'jupiter'], [717700360, 'europa'], [717727733, 'jupiter'], [757191924, 'io'], [757203571, 'jupiter'], [760247560, 'io'], [760262808, 'jupiter']] },
  { id: 'sc_cassini', name: 'Cassini', group: 'saturn', radiusKm: 0.0055,
    model: 'sc_cassini/Cassini.gltf', rotate: [{x:-90},{z:180}],
    segments: [[-69820368.42763124, 'earth'], [-69537536.818, 'sun'], [-53179136.814, 'venus'], [-53092736.814, 'sun'], [-16495135.816, 'venus'], [-16451935.816, 'sun'], [-11951935.817, 'earth'], [-11660335.817, 'sun'], [139219264.185, 'saturn'], [558743640, '']] },
  { id: 'sc_europa_clipper', name: 'Europa Clipper', group: 'jupiter', radiusKm: 0.011,
    model: 'sc_europa_clipper/europa_clipper.gltf', rotate: null,
    segments: [[782194503, 'earth'], [782641310, 'sun'], [794086294, 'mars'], [794230007, 'sun'], [849407067, 'earth'], [849810294, 'sun'], [953991214, 'jupiter']] },
  { id: 'sc_galileo', name: 'Galileo', group: 'jupiter', radiusKm: 0.0055,
    model: 'sc_galileo/galileo.gltf', rotate: [{x:-90},{z:180}],
    segments: [[-321964226.73959994, 'earth'], [-321559829, 'sun'], [-312199026, 'venus'], [-311946958, 'sun'], [-286252262, 'earth'], [-285827020, 'sun'], [-223105356, 'earth'], [-222610262, 'sun'], [-129268796, 'jupiter'], [117442702, '']] },
  { id: 'sc_galileo_probe', name: 'Galileo Probe', group: 'jupiter', radiusKm: 0.005,
    model: 'sc_galileo_probe/galileo_probe.gltf', rotate: [{x:-90}],
    segments: [[-321964226.73959994, 'sc_galileo'], [-129268796, 'jupiter'], [-128353980, '']] },
  { id: 'sc_huygens', name: 'Huygens', group: 'saturn', radiusKm: 0.0013,
    model: 'sc_huygens/Huygens.gltf', rotate: [{x:-90},{z:180}],
    segments: [[157212064.184, 'saturn'], [158945582, 'titan'], [158974766.184, '']] },
  { id: 'sc_juice', name: 'JUICE', group: 'jupiter', radiusKm: 0.0135,
    model: 'sc_juice/juice.gltf', rotate: null,
    segments: [[734748207, 'earth'], [735606318, 'sun'], [777026548, 'earth'], [778061110, 'sun'], [809697014, 'venus'], [810162491, 'sun'], [843697642, 'earth'], [844049179, 'sun'], [916393497, 'earth'], [916903199, 'sun'], [994471790, 'jupiter'], [1103217877, 'ganymede']] },
  { id: 'sc_pioneer_10', name: 'Pioneer 10', group: 'sun', radiusKm: 0.003,
    model: 'sc_pioneer/pioneer.gltf', rotate: [{x:90}],
    segments: [[-878291717.8145751, 'earth'], [-878146409, 'sun'], [-824046472, 'jupiter'], [-822011429, 'sun']] },
  { id: 'sc_pioneer_11', name: 'Pioneer 11', group: 'sun', radiusKm: 0.003,
    model: 'sc_pioneer/pioneer.gltf', rotate: [{x:90}],
    segments: [[-843816855.8143449, 'earth'], [-843644357, 'sun'], [-792658454, 'jupiter'], [-790152245, 'sun'], [-643302619, 'saturn'], [-640194311, 'sun']] },
  { id: 'sc_voyager_1', name: 'Voyager 1', group: 'jupiter', radiusKm: 0.0043,
    model: 'sc_voyager/Voyager.gltf', rotate: [{x:-90},{z:180}],
    segments: [[-704412035.617, 'earth'], [-703530245, 'sun'], [-660264745, 'jupiter'], [-655057463, 'sun'], [-606239665, 'saturn'], [-600733702, 'sun']] },
  { id: 'sc_voyager_2', name: 'Voyager 2', group: 'jupiter', radiusKm: 0.0043,
    model: 'sc_voyager/Voyager.gltf', rotate: [{x:-90},{z:180}],
    segments: [[-705788847.817, 'earth'], [-704774613, 'sun'], [-650828783, 'jupiter'], [-642276063, 'sun'], [-582886481, 'saturn'], [-574538624, 'sun'], [-440395228, 'uranus'], [-439259319, 'sun'], [-327233138, 'neptune'], [-326252606, 'sun']] },
  { id: 'sc_dart', name: 'DART', group: 'small body spacecraft', radiusKm: 0.00625,
    model: 'sc_dart/dart.gltf', rotate: null,
    segments: [[691007069, 'earth'], [691418893, 'sun'], [717454117, '65803_didymos']] },
  { id: 'sc_dawn', name: 'Dawn', group: 'small body spacecraft', radiusKm: 0.00985,
    model: 'sc_dawn/model.gltf', rotate: [{z:-90}],
    segments: [[244168849.8323595, 'earth'], [244461608, 'sun'], [288169447, 'mars'], [288210177, 'sun'], [363182466, '4_vesta'], [400075267, 'sun'], [476712067, '1_ceres'], [594302469.184, '']] },
  { id: 'sc_deep_impact', name: 'Deep Impact', group: 'small body spacecraft', radiusKm: 0.003,
    model: 'sc_deep_impact/deep_impact_wo_impactor.gltf', rotate: [{y:-90}],
    segments: [[158829812.068274, 'earth'], [159287744, 'sun'], [173560752, '9p_tempel_1'], [173923158, 'sun'], [251798121, 'earth'], [253531474, 'sun'], [282984399, 'earth'], [285405903, 'sun'], [330384030, 'earth'], [331534813, 'sun'], [342017751, '103p_hartley_2'], [342368983, 'sun'], [429192067, '']] },
  { id: 'sc_deep_impact_impactor', name: 'Deep Impact Impactor', group: 'small body spacecraft', radiusKm: 0.001,
    model: 'sc_deep_impact_impactor/deep_impact_impactor.gltf', rotate: [{y:-90}],
    segments: [[158829812.068274, 'sc_deep_impact'], [173642464.18400002, '9p_tempel_1'], [173727938.18158135, '']] },
  { id: 'sc_deep_space_1', name: 'Deep Space 1', group: 'small body spacecraft', radiusKm: 0.005,
    model: 'sc_deep_space_1/deep_space_1.gltf', rotate: [{x:90},{z:90}],
    segments: [[-37470248, 'earth'], [-36628312, 'sun'], [-13523799, '9969_braille'], [-13496699, 'sun'], [54458637, '19p_borrelly'], [54476825, 'sun'], [61977664.184, '']] },
  { id: 'sc_near_shoemaker', name: 'NEAR', group: 'small body spacecraft', radiusKm: 0.0034,
    model: 'sc_near_shoemaker/near.gltf', rotate: [{x:90},{z:135}],
    segments: [[-122129937, 'sun'], [-61397606, 'earth'], [-60793811, 'sun'], [-79403925, '253_mathilde'], [-79210250, 'sun'], [-8425610, '433_eros'], [36675809.3654, '']] },
  { id: 'sc_lucy', name: 'Lucy', group: 'small body spacecraft', radiusKm: 0.007125,
    model: 'sc_lucy/lucy.gltf', rotate: [{x:90},{z:90}],
    segments: [[687656642.763, 'earth'], [687915086, 'sun'], [718960993, 'earth'], [719531941, 'sun'], [787134972, 'earth'], [787532222, 'sun'], [798252820, '52246_donaldjohanson'], [798584539, 'sun'], [870652086, '3548_eurybates'], [872642047, 'sun'], [872642047, '15094_polymele'], [875308504, 'sun'], [891166024, '11351_leucus'], [894761809, 'sun'], [909384911, '21900_orus'], [912190135, 'sun'], [977590306, 'earth'], [978108682, 'sun'], [1046169596, '617_patroclus_barycenter'], [1047892376, 'sun']] },
  { id: 'sc_new_horizons', name: 'New Horizons', group: 'small body spacecraft', radiusKm: 0.0026,
    model: 'sc_new_horizons/new_horizons.gltf', rotate: [{y:90}],
    segments: [[190972278.33046317, 'earth'], [191055829, 'sun'], [225619606, 'jupiter'], [226100665, 'sun'], [490130161, '134340_pluto'], [490167848, 'sun'], [598753684, '486958_arrokoth'], [600203601, 'sun']] },
  { id: 'sc_rosetta', name: 'Rosetta', group: 'small body spacecraft', radiusKm: 0.016,
    model: 'sc_rosetta/rosettaPhilae.gltf', rotate: [{x:180},{z:90}],
    segments: [[131491581.583, 'earth'], [131901500, 'sun'], [162704887, 'earth'], [163831232, 'sun'], [225623375, 'mars'], [225657862, 'sun'], [248111015, 'earth'], [248475560, 'sun'], [311055929, 'earth'], [311664877, 'sun'], [452394238, '67p_churyumov_gerasimenko'], [528503957.968, '']] },
  { id: 'sc_osiris_rex', name: 'OSIRIS-REx', group: 'small body spacecraft', radiusKm: 0.005,
    model: 'sc_osiris_rex_v2/osiris_rex_articulated_panels.gltf', rotate: [{x:90}],
    segments: [[526676400, 'earth'], [527025408, 'sun'], [558938468, 'earth'], [559919190, 'sun'], [591770603, '101955_bennu'], [674049669, 'sun'], [748358886, 'earth'], [749140122, 'sun'], [924136663, '99942_apophis']] },
  { id: 'sc_philae', name: 'Philae', group: 'small body spacecraft', radiusKm: 0.001,
    model: 'sc_philae/philae.gltf', rotate: [{x:180},{z:90}],
    segments: [[469053367.183, '67p_churyumov_gerasimenko'], [469078512.324, '']] },
  { id: 'sc_psyche', name: 'Psyche', group: 'small body spacecraft', radiusKm: 0.025,
    model: 'sc_psyche/psyche.gltf', rotate: [{x:90},{z:90}],
    segments: [[750482453, 'earth'], [750686758, 'sun'], [831828698, 'mars'], [832302380, 'sun'], [931665741, '16_psyche']] },
  { id: 'sc_stardust', name: 'Stardust', group: 'small body spacecraft', radiusKm: 0.003,
    model: 'sc_stardust/stardust_articulated.gltf', rotate: [{x:90},{z:90}],
    segments: [[-28304869.3, 'earth'], [-28038699, 'sun'], [32627842, 'earth'], [33120541, 'sun'], [89379733, '5535_annefrank'], [89550209, 'sun'], [126009572, '81p_wild_2'], [126678668, 'sun'], [190336290, 'earth'], [190866114, 'sun'], [284944970, 'earth'], [285742028, 'sun'], [350896766, '9p_tempel_1'], [351068113, 'sun'], [354279666, '']] },
  { id: 'sc_stardust_src', name: 'Stardust SRC', group: 'small body spacecraft', radiusKm: 0.0008,
    model: 'sc_stardust_src/stardust_capsule.gltf', rotate: [{x:90},{z:90}],
    segments: [[190576690.7833838, 'sc_stardust'], [190576755.185, 'earth'], [190591985.184, '']] },
  { id: 'sc_biosentinel', name: 'BioSentinel', group: 'sun', radiusKm: 0.0005,
    model: 'sc_biosentinel/biosentinel.gltf', rotate: null,
    segments: [[721866289, 'earth'], [722273637, 'moon'], [722923565, 'sun']] },
  { id: 'sc_kepler_space_telescope', name: 'Kepler', group: 'sun', radiusKm: 0.004,
    model: 'sc_kepler/Kepler.gltf', rotate: null,
    segments: [[289679042.1855, 'earth'], [290348743, 'sun'], [595512069.183, '']] },
  { id: 'sc_mariner_2', name: 'Mariner 2', group: 'sun', radiusKm: 0.0025,
    model: 'sc_mariner_2/mariner2.gltf', rotate: null,
    segments: [[-1178599200, 'earth'], [-1178199300, 'sun'], [-1169206910, 'venus'], [-1167652800, '']] },
  { id: 'sc_parker_solar_probe', name: 'Parker Solar Probe', group: 'sun', radiusKm: 0.003,
    model: 'sc_parker_solar_probe/PSP.gltf', rotate: null,
    segments: [[587333783.3431, 'earth'], [587454078, 'sun']] },
  { id: 'sc_spitzer', name: 'Spitzer', group: 'sun', radiusKm: 0.004,
    model: 'sc_spitzer/SPITZER.gltf', rotate: [{z:-90},{x:-90}],
    segments: [[115064804, 'earth'], [115493678, 'sun'], [633614469, '']] },
  { id: 'sc_stereo_ahead', name: 'STEREO Ahead', group: 'sun', radiusKm: 0.003,
    model: 'sc_stereo_ahead/stereo_a.gltf', rotate: [{x:90}],
    segments: [[215097110, 'earth'], [221418192, 'sun']] },
  { id: 'sc_stereo_behind', name: 'STEREO Behind', group: 'sun', radiusKm: 0.003,
    model: 'sc_stereo_behind/stereo_b.gltf', rotate: [{x:90}],
    segments: [[215097110, 'earth'], [224468337, 'sun'], [527860868.182, '']] },
  { id: 'sc_ulysses', name: 'Ulysses', group: 'sun', radiusKm: 0.002,
    model: 'sc_ulysses/ulysses.gltf', rotate: null,
    segments: [[-291488100, 'earth'], [-291393201, 'sun'], [-249645790, 'jupiter'], [-248519090, 'sun'], [299678465.184, '']] },
  { id: 'sc_wmap', name: 'WMAP', group: 'sun', radiusKm: 0.0026,
    model: null, rotate: null,
    segments: [[339422466.184, 'sun'], [360158466.184, '']] },
  { id: 'sc_magellan', name: 'Magellan', group: 'venus', radiusKm: 0.006,
    model: 'sc_magellan/magellan.gltf', rotate: null,
    segments: [[-336388283.36, 'sun'], [-296448521.457, 'venus'], [-164631538.81763855, '']] },
  { id: 'sc_venus_express', name: 'Venus Express', group: 'venus', radiusKm: 0.004,
    model: null, rotate: null,
    segments: [[184784702, 'earth'], [185369766, 'sun'], [197902579, 'venus'], [473341201, '']] },
]

/**
 * Eyes' spacecraft id -> its NAIF code in JPL Horizons.
 *
 * Every one of these was **round-tripped**: the code was queried back and the
 * name Horizons returned was checked against the craft it is supposed to be.
 * That check is not ceremony — resolving these by name is a minefield, and it
 * produced four wrong bodies and two outright absurdities before the round-trip
 * caught them:
 *
 *   "Magellan"  ->  asteroid 4055 Magellan
 *   "Philae"    ->  asteroid 24663 Philae
 *
 * Both are real main-belt asteroids named after the same things the spacecraft
 * are. A name search returns them with no error and no ambiguity warning, and
 * Venus' radar mapper would have shipped as a rock between Mars and Jupiter.
 *
 * Guessing the code instead is no safer, because the negative-integer space is
 * dense and heavily reused. Every one of these guesses came back confidently
 * wrong:
 *
 *   -130 is Hayabusa, not SMART-1        -95 is TESS, not Mars Climate Orbiter
 *   -30  is Deep Space 1, not Viking 2   -18 is LCROSS Shepherd, not Magellan
 *   -66  is MarCO-B, not New Horizons (which is -98)
 *
 * The lesson is the one the comet fetch learned about substring matching, in a
 * new place: a lookup that cannot fail is not the same as a lookup that is
 * right. Anything added here gets the same round-trip.
 *
 * `null` means Horizons has no ephemeris for the craft at all. Ten of the 75:
 * mostly pre-1999 missions whose kernels were never published (the Vikings,
 * Mars Global Surveyor, Magellan, Apollo 15, SMART-1), the two Mars failures
 * that never arrived (Climate Orbiter, Polar Lander), and Philae, which has no
 * trajectory of its own separate from Rosetta's. They are kept in the roster
 * and simply not drawn, rather than dropped — see `fetch-spacecraft.mjs`.
 */
export const HORIZONS_ID = {
  sc_apollo_15: null,                               // Apollo 15 — not in Horizons
  sc_artemis_1: null,                               // Artemis I — not in Horizons
  sc_artemis_2: -1024,                              // Artemis II / Spacecraft (Earth)
  sc_capstone: -1176,                               // CAPSTONE / Spacecraft (Moon)
  sc_clementine: -40,                               // Clementine Spacecraft
  sc_danuri: -155,                                  // Danuri / KPLO Spacecraft (Moon)
  sc_grail_a: -177,                                 // GRAIL-A "Ebb" Spacecraft
  sc_grail_b: -181,                                 // GRAIL-B "Flow" Spacecraft
  sc_ladee: -12,                                    // LADEE (spacecraft)
  sc_lcross: -18,                                   // LCROSS Shepherd (spacecraft)
  sc_lunar_flashlight: -164,                        // Lunar Flashlight / Spacecraft (Moon)
  sc_lunar_prospector: -25,                         // Lunar Prospector Spacecraft
  sc_lunar_reconnaissance_orbiter: -85,             // LRO Spacecraft / (Moon)
  sc_smart_1: null,                                 // SMART-1 — not in Horizons
  sc_themis_b: -192,                                // ARTEMIS-P1 Spacecraft (THEMIS-B) / (Moon)
  sc_themis_c: -193,                                // ARTEMIS-P2 Spacecraft (THEMIS-C) / (Moon)
  sc_escapade_blue: -9,                             // EscaPADE-Blue Spacecraft / (E-S L2, Mars)
  sc_escapade_gold: -10,                            // EscaPADE-Gold Spacecraft / (E-S L2, Mars)
  sc_mars_2020: -168,                               // Mars 2020 (Perseverance & Ingenuity)
  sc_mars_science_laboratory: -76,                  // MSL Spacecraft / (Sun)
  sc_mars_exploration_rover_1: -253,                // Opportunity (Mars Exploration Rover) / (Sun,Mars)
  sc_mars_exploration_rover_2: -254,                // Spirit (Mars Exploration Rover) / (Sun,Mars)
  sc_insight: -189,                                 // InSight (spacecraft) / (Sun)
  sc_marco_a: -65,                                  // Mars Cube One-A (spacecraft) / (Sun)
  sc_marco_b: -66,                                  // Mars Cube One-B (spacecraft) / (Sun)
  sc_mars_odyssey: -53,                             // Mars Odyssey (Spacecraft) / (Sun)
  sc_mars_reconnaissance_orbiter: -74,              // Mars Reconnaisance Orbiter (MRO) / (Sun)
  sc_maven: -202,                                   // MAVEN Spacecraft Mission
  sc_mars_express: -41,                             // Mars Express / (Sun)
  sc_phoenix: -84,                                  // Phoenix Spacecraft / (Sun)
  sc_trace_gas_orbiter: -143,                       // ExoMars16 TGO Spacecraft / (Sun & Mars)
  sc_mars_orbiter_mission: -3,                      // Mars Orbiter Mission (MOM)
  sc_mars_global_surveyor: null,                    // Mars Global Surveyor — not in Horizons
  sc_mars_climate_orbiter: null,                    // Mars Climate Orbiter — not in Horizons
  sc_mars_pathfinder: -530,                         // Mars Pathfinder Spacecraft / (Sun)
  sc_mars_polar_lander: null,                       // Mars Polar Lander — not in Horizons
  sc_viking_1_orbiter: null,                        // Viking 1 Orbiter — not in Horizons
  sc_viking_2_orbiter: null,                        // Viking 2 Orbiter — not in Horizons
  sc_messenger: -236,                               // MESSENGER Spacecraft
  sc_juno: -61,                                     // Juno Spacecraft / (Sun, Jupiter)
  sc_cassini: -82,                                  // Cassini Spacecraft (interplanetary) / (Sun)
  sc_europa_clipper: -159,                          // Europa Clipper (Spacecraft) / (Sun, Jupiter)
  sc_galileo: -77,                                  // Galileo Spacecraft (Orbiter) / (Sun, Jupiter)
  sc_galileo_probe: -344,                           // Galileo Probe / (Sun, Jupiter)
  sc_huygens: -150,                                 // Cassini Huygens Probe
  sc_juice: -28,                                    // JUICE Spacecraft / Sun-Jupiter-Ganymede
  sc_pioneer_10: -23,                               // Pioneer 10 Spacecraft (interplanetary) / (Sun)
  sc_pioneer_11: -24,                               // Pioneer 11 Spacecraft / (Sun)
  sc_voyager_1: -31,                                // Voyager 1 Spacecraft (interplanetary) / (Sun)
  sc_voyager_2: -32,                                // Voyager 2 Spacecraft (interplanetary) / (Sun)
  sc_dart: -135,                                    // DART Spacecraft / Sun
  sc_dawn: -203,                                    // Dawn Spacecraft (interplanetary) / (Sun)
  sc_deep_impact: -140,                             // Deep Impact Flyby/EPOXI Spacecraft (DI)
  sc_deep_impact_impactor: -70,                     // Deep Impact IMPACTOR Spacecraft (DI)
  sc_deep_space_1: -30,                             // Deep Space 1 / (Sun)
  sc_near_shoemaker: -93,                           // Revised : May 05, 2020 NEAR Spacecraft / (Sun)
  sc_lucy: -49,                                     // Lucy Spacecraft / Sun
  sc_new_horizons: -98,                             // New Horizons Spacecraft
  sc_rosetta: -226,                                 // Rosetta Spacecraft
  sc_osiris_rex: -64,                               // OSIRIS-REx/APEX Spacecraft / (Sun)
  sc_philae: null,                                  // Philae — not in Horizons
  sc_psyche: -255,                                  // Psyche Spacecraft / Sun
  sc_stardust: -29,                                 // Stardust Spacecraft Bus & NExT / (Sun)
  sc_stardust_src: -29900,                          // Stardust Spacecraft Sample Return Capsule
  sc_biosentinel: -70007,                           // BioSentinel / Spacecraft (Sun)
  sc_kepler_space_telescope: -227,                  // Kepler
  sc_mariner_2: -2,                                 // Mariner 2
  sc_parker_solar_probe: -96,                       // Parker Solar Probe / Sun
  sc_spitzer: -79,                                  // Spitzer Space Telescope (SST) / (Sun)
  sc_stereo_ahead: -234,                            // STEREO-A Spacecraft
  sc_stereo_behind: -235,                           // STEREO-B Spacecraft
  sc_ulysses: -55,                                  // Ulysses Spacecraft (interplanetary) / (Sun)
  sc_wmap: -165,                                    // WMAP Spacecraft / (Earth)
  sc_magellan: null,                                // Magellan — not in Horizons
  sc_venus_express: -248,                           // Venus Express Spacecraft
}
