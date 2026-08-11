/**
 * Which minor moons the app carries, and what shape each one wears.
 *
 * Input to `fetch-minor-moons.mjs`. Everything *measured* about these bodies —
 * size, orbit, discovery — is fetched from JPL by that script; this file only
 * records the two things JPL has no opinion about: which moons to include, and
 * which of the three generic asteroid meshes each one is drawn with.
 *
 * ## Where the list comes from
 *
 * NASA's Eyes on the Solar System, read out of its `app.js`. Taking its roster
 * rather than assembling one means the two apps agree on what exists, which
 * matters more than it sounds: the IAU's satellite count moves every year, and
 * a hand-built list would be a snapshot of whenever it was typed.
 *
 * ## The model numbers
 *
 * Also Eyes'. It deals its three generic asteroids out round-robin,
 * alphabetically within each system — Adrastea 1, Amalthea 2, Metis 2, Thebe 3,
 * then Aitne 1, Ananke 2, Aoede 3, and so on — so the number carries no claim
 * about the body. Nobody has seen any of these as more than a point of light.
 *
 * The assignment is copied rather than regenerated so that a moon looks the same
 * here as it does in Eyes. A body with a real mesh (`model: null`) is one the
 * app has a measured shape for, and takes it from `nasa-models.mjs` instead.
 *
 * ## `radiusKm`
 *
 * A fallback, present only where JPL has never published a measured radius —
 * which is most of them, since a mean radius needs a resolved disc or a
 * spacecraft flyby and these have had neither. The number is Eyes' own, derived
 * the way everyone derives them: from brightness under an assumed albedo. It
 * could be out by a factor of two if the assumption is wrong, and the generated
 * data marks it `'estimated'` for exactly that reason.
 *
 * Where JPL *does* publish a radius the fetched value wins and any number here
 * is ignored, so the two cannot silently disagree.
 *
 * ## `family`
 *
 * The dynamical group, from Eyes' own `groups` array. For the inner moons it is
 * descriptive; for the irregulars it is the real classification — a family is a
 * set of moons sharing an orbit closely enough to be fragments of one captured
 * parent body, which is why they cluster so tightly in `a`, `e` and `i`.
 */

/**
 * Neptune's fifteen.
 *
 * Seven regular moons orbiting inside Triton, all of them Voyager 2 discoveries
 * from 1989 apart from Hippocamp, which was found in 2013 by stacking Hubble
 * frames — it is about 35 km across and was hiding in plain sight. Then eight
 * irregulars on huge, steep, mostly retrograde orbits, of which Nereid is the
 * outlier in every sense: found in 1949, and on the most eccentric orbit of any
 * moon in the solar system.
 *
 * Triton is absent because it is already in `moonData.js` as a major moon.
 * Proteus is here but takes a real mesh — Voyager saw it well enough.
 */
const NEPTUNE = [
  // ---- regular, inner ----
  { id: 'naiad', name: 'Naiad', code: '803', family: 'inner', model: 1 },
  { id: 'thalassa', name: 'Thalassa', code: '804', family: 'inner', model: 3 },
  { id: 'despina', name: 'Despina', code: '805', family: 'inner', model: 1 },
  { id: 'galatea', name: 'Galatea', code: '806', family: 'inner', model: 2 },
  { id: 'larissa', name: 'Larissa', code: '807', family: 'inner', model: 3 },
  { id: 'hippocamp', name: 'Hippocamp', code: '814', family: 'inner', model: 1, radiusKm: 17.4 },
  { id: 'proteus', name: 'Proteus', code: '808', family: 'inner', model: null },

  // ---- irregular, outer ----
  { id: 'nereid', name: 'Nereid', code: '802', family: 'irregular', model: 3 },
  { id: 'halimede', name: 'Halimede', code: '809', family: 'irregular', model: 3, radiusKm: 31 },
  { id: 'sao', name: 'Sao', code: '811', family: 'irregular', model: 2, radiusKm: 22 },
  { id: 'laomedeia', name: 'Laomedeia', code: '812', family: 'irregular', model: 2, radiusKm: 21 },
  { id: 'psamathe', name: 'Psamathe', code: '810', family: 'irregular', model: 1, radiusKm: 20 },
  { id: 'neso', name: 'Neso', code: '813', family: 'irregular', model: 2, radiusKm: 30 },
  /**
   * The two still on provisional designations. Both are real, both are in JPL's
   * element table under the codes below, and neither has an IAU name yet —
   * S/2002 N 5 was found in 2002 and lost again until it was recovered in 2021,
   * which is why it is still unnamed twenty years on.
   */
  { id: 's_2002_n_5', name: 'S/2002 N 5', code: '85051', family: 'irregular', model: 3, radiusKm: 12 },
  { id: 's_2021_n_1', name: 'S/2021 N 1', code: '85052', family: 'irregular', model: 2, radiusKm: 8 },
]

/**
 * Uranus's twenty-four.
 *
 * Thirteen inner moons packed into a region smaller than Miranda's orbit —
 * shepherds for the narrow rings, and in the Portia group a cluster so tightly
 * spaced that it is thought to be dynamically unstable on a timescale of
 * millions of years. Then eleven irregulars, nearly all retrograde, discovered
 * from the ground between 1997 and 2025.
 *
 * The five Voyager 2 photographed are absent: they are the major moons, already
 * in `moonData.js`.
 */
const URANUS = [
  // ---- inner ----
  { id: 'cordelia', name: 'Cordelia', code: '706', family: 'inner', model: 1, radiusKm: 20.1 },
  { id: 'ophelia', name: 'Ophelia', code: '707', family: 'inner', model: 1, radiusKm: 22.4 },
  /**
   * **S/2025 U 1 is deliberately absent**, and it is the one place this roster
   * diverges from Eyes.
   *
   * JWST found it in 2025 and JPL's element table has it — a 4 km rock at
   * a = 57,844 km on a 10-hour orbit, which makes it an inner moon between
   * Ophelia and Bianca rather than the irregular Eyes files it as. But its
   * ephemeris (URA184) is fitted to a single year's arc and Horizons will not
   * serve elements for it at any epoch: asked at J2000 it returns e = 169,907
   * and a = −12,061 km, and asked at its own 2025 epoch, e = 317,856. Those are
   * hyperbolic orbits, which is Horizons' way of saying it has nothing.
   *
   * Its published mean elements are in a Laplace frame described from Uranus's
   * far pole, so using them would mean a frame flip that nothing else here needs
   * and that could not be checked against anything. Omitting one 4 km body is
   * the smaller cost. Rerun this script when JPL extends the ephemeris.
   */
  { id: 'bianca', name: 'Bianca', code: '708', family: 'inner', model: 2, radiusKm: 25.7 },
  { id: 'cressida', name: 'Cressida', code: '709', family: 'inner', model: 2, radiusKm: 39.8 },
  { id: 'desdemona', name: 'Desdemona', code: '710', family: 'inner', model: 1, radiusKm: 32 },
  { id: 'juliet', name: 'Juliet', code: '711', family: 'inner', model: 1, radiusKm: 46.8 },
  { id: 'portia', name: 'Portia', code: '712', family: 'inner', model: 3, radiusKm: 67.6 },
  { id: 'rosalind', name: 'Rosalind', code: '713', family: 'inner', model: 3, radiusKm: 36 },
  { id: 'cupid', name: 'Cupid', code: '727', family: 'inner', model: 3, radiusKm: 9 },
  { id: 'belinda', name: 'Belinda', code: '714', family: 'inner', model: 1, radiusKm: 45 },
  { id: 'perdita', name: 'Perdita', code: '725', family: 'inner', model: 2, radiusKm: 15 },
  { id: 'puck', name: 'Puck', code: '715', family: 'inner', model: 2, radiusKm: 81 },
  { id: 'mab', name: 'Mab', code: '726', family: 'inner', model: 2, radiusKm: 12.5 },

  // ---- irregular ----
  { id: 'francisco', name: 'Francisco', code: '722', family: 'irregular', model: 3, radiusKm: 11 },
  { id: 'caliban', name: 'Caliban', code: '716', family: 'irregular', model: 3, radiusKm: 36 },
  { id: 'stephano', name: 'Stephano', code: '720', family: 'irregular', model: 2, radiusKm: 16 },
  { id: 'trinculo', name: 'Trinculo', code: '721', family: 'irregular', model: 1, radiusKm: 9 },
  { id: 'sycorax', name: 'Sycorax', code: '717', family: 'irregular', model: 3, radiusKm: 82 },
  { id: 'margaret', name: 'Margaret', code: '723', family: 'irregular', model: 3, radiusKm: 10 },
  { id: 'prospero', name: 'Prospero', code: '718', family: 'irregular', model: 1, radiusKm: 25 },
  { id: 'setebos', name: 'Setebos', code: '719', family: 'irregular', model: 1, radiusKm: 24 },
  { id: 'ferdinand', name: 'Ferdinand', code: '724', family: 'irregular', model: 2, radiusKm: 10 },
  { id: 's_2023_u_1', name: 'S/2023 U 1', code: '75051', family: 'irregular', model: 3, radiusKm: 5 },
]

/**
 * Saturn's two hundred and seventy-seven.
 *
 * The largest satellite system known, and the one where "minor moon" stops
 * meaning one thing. It runs from Aegaeon, 240 metres across and embedded in the
 * G ring, out to bodies orbiting 25 million kilometres away — five orders of
 * magnitude of distance in one list.
 *
 * The inner set is where Saturn's rings are actually made and maintained, and
 * several of these moons are doing visible work:
 *
 *   ring shepherds   Pan and Daphnis orbit *inside* the rings and clear the
 *                    Encke and Keeler gaps, raising waves along the gap edges.
 *                    Prometheus and Pandora bracket the F ring.
 *   co-orbitals      Janus and Epimetheus share one orbit 50 km apart and swap
 *                    places every four years rather than colliding.
 *   trojans          Telesto and Calypso ride 60 degrees ahead of and behind
 *                    Tethys; Helene and Polydeuces do the same for Dione. Nowhere
 *                    else in the solar system are moons known to do this.
 *   alkyonides       Methone, Anthe and Pallene, each a kilometre or two across,
 *                    each maintaining its own faint arc of dust.
 *
 * Then the captured population, in three groups named after three mythologies —
 * Inuit, Gallic and Norse. The Norse are the bulk of it, ninety-eight bodies all
 * orbiting backwards, and they are why Saturn's moon count moves every year: they
 * are faint, they are found in batches, and most are a few kilometres across.
 *
 * **S/2009 S 1** is the one body here Horizons has never heard of, and it comes
 * with its orbit written out instead. See `elements` below.
 *
 * **Hyperion and Phoebe are here**, and both take `model: null`. Eyes' entity
 * data tags Hyperion's group `major` — which is what put it in `moonData.js` on
 * the first pass — but its interface counts seven major moons and 278 minor, and
 * the interface is right: the seven are the round icy worlds, and Hyperion is a
 * tumbling sponge. Being minor does not cost either of them their shape, though.
 * Cassini went close to both, so they keep their real meshes while everything
 * else here wears a generic asteroid.
 */
const SATURN = [
  /**
   * A 300-metre object in the B ring, and the only moon in the app whose orbit is
   * stated rather than fetched.
   *
   * It has never been seen. What Cassini saw in 2009 was the *propeller* — a
   * pair of dark wakes a few kilometres long that a body this size opens in the
   * ring around itself, the way a boat is visible from its wash. JPL publishes no
   * ephemeris for it and Horizons does not know the name.
   *
   * Eyes does draw it, and it is the single entity in that whole file driven by
   * static Keplerian elements rather than a server ephemeris — so the numbers
   * below are Eyes' own, read straight out of its `orbitalElements` controller:
   *
   *     eccentricity: 0, semiMajorAxis: 117e3,
   *     meanAngularMotion: 0.00015472777, meanAnomalyAtEpoch: -1.5
   *
   * They check out. 117,000 km is the outer edge of the B ring, which is where
   * the propeller was found, and that angular motion is 11.28 hours a lap —
   * within 0.5% of what Kepler's third law gives for that distance around
   * Saturn. The mean anomaly is radians, so -1.5 is 274.06 degrees.
   *
   * The one number **not** taken from Eyes is the orientation. Eyes carries it as
   * a quaternion in its own internal frame, and decoded against either axis
   * convention it lands 129 or 141 degrees from the reference plane — neither of
   * which is Saturn's 26.7-degree obliquity, so the frame is something else and
   * transferring it would be guesswork. It is not needed: a propeller is a
   * disturbance *in the ring*, and the ring is Saturn's equatorial plane by
   * definition. Inclination is zero here because there is nowhere else it could be.
   */
  {
    id: 's_2009_s_1',
    name: 'S/2009 S 1',
    code: null,
    family: 'inner',
    group: 'propeller moonlet',
    model: 1,
    radiusKm: 0.15,
    elements: {
      aKm: 117000,
      e: 0,
      i: 0,
      /** Mean anomaly at J2000, degrees: Eyes' -1.5 radians. */
      L: 274.0563,
      /** Eyes' 0.00015472777 rad/s in the units `kepler.js` propagates. */
      LDot: 27976595.642,
      periodDays: 0.47,
    },
    source: "NASA's Eyes on the Solar System, static orbitalElements controller; plane from the ring geometry",
  },
  { id: 'pan', name: 'Pan', code: '618', family: 'inner', group: 'ring shepherd', model: 1, radiusKm: 14.1 },
  { id: 'daphnis', name: 'Daphnis', code: '635', family: 'inner', group: 'ring shepherd', model: 1, radiusKm: 3.8 },
  { id: 'atlas', name: 'Atlas', code: '615', family: 'inner', group: 'ring shepherd', model: 2, radiusKm: 15.1 },
  { id: 'prometheus', name: 'Prometheus', code: '616', family: 'inner', group: 'ring shepherd', model: 1, radiusKm: 43.1 },
  { id: 'pandora', name: 'Pandora', code: '617', family: 'inner', group: 'ring shepherd', model: 2, radiusKm: 40.7 },
  { id: 'epimetheus', name: 'Epimetheus', code: '611', family: 'inner', group: 'co-orbital', model: 2, radiusKm: 58.1 },
  { id: 'janus', name: 'Janus', code: '610', family: 'inner', group: 'co-orbital', model: 3, radiusKm: 89.5 },
  { id: 'aegaeon', name: 'Aegaeon', code: '653', family: 'inner', group: 'ring moonlet', model: 1, radiusKm: 0.12 },
  { id: 'methone', name: 'Methone', code: '632', family: 'inner', group: 'alkyonides', model: 2, radiusKm: 1.6 },
  { id: 'anthe', name: 'Anthe', code: '649', family: 'inner', group: 'alkyonides', model: 1, radiusKm: 0.9 },
  { id: 'pallene', name: 'Pallene', code: '633', family: 'inner', group: 'alkyonides', model: 3, radiusKm: 2.5 },
  { id: 'calypso', name: 'Calypso', code: '614', family: 'inner', group: 'trojan', model: 3, radiusKm: 10.7 },
  { id: 'telesto', name: 'Telesto', code: '613', family: 'inner', group: 'trojan', model: 3, radiusKm: 12.4 },
  { id: 'helene', name: 'Helene', code: '612', family: 'inner', group: 'trojan', model: 3, radiusKm: 17.6 },
  { id: 'polydeuces', name: 'Polydeuces', code: '634', family: 'inner', group: 'trojan', model: 3, radiusKm: 1.3 },
  { id: 'hyperion', name: 'Hyperion', code: '607', family: 'inner', group: null, model: null, radiusKm: 135 },
  { id: 's_2023_s_1', name: 'S/2023 S 1', code: '65236', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2019_s_1', name: 'S/2019 S 1', code: '65093', family: 'irregular', group: 'inuit', model: 1, radiusKm: 3 },
  { id: 's_2004_s_54', name: 'S/2004 S 54', code: '65158', family: 'irregular', group: null, model: 2, radiusKm: 2 },
  { id: 's_2023_s_56', name: 'S/2023 S 56', code: '65295', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2004_s_55', name: 'S/2004 S 55', code: '65159', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2020_s_11', name: 'S/2020 S 11', code: '65202', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2019_s_22', name: 'S/2019 S 22', code: '65179', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'kiviuq', name: 'Kiviuq', code: '624', family: 'irregular', group: 'inuit', model: 3, radiusKm: 8 },
  { id: 's_2023_s_2', name: 'S/2023 S 2', code: '65237', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2019_s_23', name: 'S/2019 S 23', code: '65180', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2020_s_12', name: 'S/2020 S 12', code: '65203', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2005_s_4', name: 'S/2005 S 4', code: '65129', family: 'irregular', group: 'inuit', model: 3, radiusKm: 2.5 },
  { id: 's_2019_s_25', name: 'S/2019 S 25', code: '65182', family: 'irregular', group: null, model: 2, radiusKm: 2 },
  { id: 's_2020_s_1', name: 'S/2020 S 1', code: '65096', family: 'irregular', group: 'inuit', model: 1, radiusKm: 2 },
  { id: 'ijiraq', name: 'Ijiraq', code: '622', family: 'irregular', group: 'inuit', model: 2, radiusKm: 6 },
  { id: 's_2020_s_48', name: 'S/2020 S 48', code: '65289', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2019_s_24', name: 'S/2019 S 24', code: '65181', family: 'irregular', group: null, model: 3, radiusKm: 2 },
  { id: 's_2007_s_10', name: 'S/2007 S 10', code: '65177', family: 'irregular', group: null, model: 3, radiusKm: 2 },
  { id: 's_2019_s_26', name: 'S/2019 S 26', code: '65183', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2020_s_13', name: 'S/2020 S 13', code: '65204', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2023_s_50', name: 'S/2023 S 50', code: '65285', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_6', name: 'S/2023 S 6', code: '65241', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_7', name: 'S/2023 S 7', code: '65242', family: 'irregular', group: null, model: 2, radiusKm: 2 },
  { id: 's_2023_s_38', name: 'S/2023 S 38', code: '65273', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'phoebe', name: 'Phoebe', code: '609', family: 'irregular', group: 'norse', model: null, radiusKm: 106.5 },
  { id: 's_2023_s_9', name: 'S/2023 S 9', code: '65244', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2006_s_20', name: 'S/2006 S 20', code: '65157', family: 'irregular', group: 'norse', model: 2, radiusKm: 2.5 },
  { id: 's_2004_s_56', name: 'S/2004 S 56', code: '65160', family: 'irregular', group: null, model: 1, radiusKm: 2.5 },
  { id: 's_2023_s_8', name: 'S/2023 S 8', code: '65243', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_11', name: 'S/2023 S 11', code: '65246', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2006_s_9', name: 'S/2006 S 9', code: '65100', family: 'irregular', group: 'norse', model: 3, radiusKm: 1.5 },
  { id: 's_2006_s_21', name: 'S/2006 S 21', code: '65168', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 'paaliaq', name: 'Paaliaq', code: '620', family: 'irregular', group: 'inuit', model: 2, radiusKm: 11 },
  { id: 's_2006_s_22', name: 'S/2006 S 22', code: '65169', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2023_s_13', name: 'S/2023 S 13', code: '65248', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2023_s_10', name: 'S/2023 S 10', code: '65245', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'skathi', name: 'Skathi', code: '627', family: 'irregular', group: 'norse', model: 3, radiusKm: 4 },
  { id: 's_2023_s_12', name: 'S/2023 S 12', code: '65247', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2007_s_5', name: 'S/2007 S 5', code: '65101', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2007_s_7', name: 'S/2007 S 7', code: '65130', family: 'irregular', group: 'norse', model: 2, radiusKm: 2 },
  { id: 's_2007_s_2', name: 'S/2007 S 2', code: '65091', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 's_2004_s_37', name: 'S/2004 S 37', code: '65082', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2004_s_47', name: 'S/2004 S 47', code: '65123', family: 'irregular', group: 'norse', model: 3, radiusKm: 2 },
  { id: 's_2004_s_40', name: 'S/2004 S 40', code: '65098', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2020_s_14', name: 'S/2020 S 14', code: '65205', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2019_s_27', name: 'S/2019 S 27', code: '65184', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'albiorix', name: 'Albiorix', code: '626', family: 'irregular', group: 'gallic', model: 3, radiusKm: 16 },
  { id: 's_2019_s_2', name: 'S/2019 S 2', code: '65094', family: 'irregular', group: 'norse', model: 2, radiusKm: 1.5 },
  { id: 's_2020_s_15', name: 'S/2020 S 15', code: '65206', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2023_s_14', name: 'S/2023 S 14', code: '65249', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_55', name: 'S/2023 S 55', code: '65294', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2020_s_16', name: 'S/2020 S 16', code: '65207', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2023_s_16', name: 'S/2023 S 16', code: '65251', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 'bebhionn', name: 'Bebhionn', code: '637', family: 'irregular', group: 'gallic', model: 3, radiusKm: 3 },
  { id: 's_2007_s_8', name: 'S/2007 S 8', code: '65131', family: 'irregular', group: 'gallic', model: 3, radiusKm: 2 },
  { id: 'saturn_lx', name: 'Saturn LX', code: '660', family: 'irregular', group: 'inuit', model: 1, radiusKm: 2 },
  { id: 's_2019_s_3', name: 'S/2019 S 3', code: '65095', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2020_s_17', name: 'S/2020 S 17', code: '65208', family: 'irregular', group: null, model: 3, radiusKm: 2 },
  { id: 's_2023_s_53', name: 'S/2023 S 53', code: '65292', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2023_s_20', name: 'S/2023 S 20', code: '65255', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2019_s_29', name: 'S/2019 S 29', code: '65186', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2023_s_18', name: 'S/2023 S 18', code: '65253', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2023_s_17', name: 'S/2023 S 17', code: '65252', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2020_s_7', name: 'S/2020 S 7', code: '65132', family: 'irregular', group: 'norse', model: 2, radiusKm: 1.5 },
  { id: 's_2007_s_11', name: 'S/2007 S 11', code: '65178', family: 'irregular', group: null, model: 2, radiusKm: 2 },
  { id: 's_2023_s_54', name: 'S/2023 S 54', code: '65293', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2019_s_28', name: 'S/2019 S 28', code: '65185', family: 'irregular', group: null, model: 3, radiusKm: 2 },
  { id: 's_2004_s_31', name: 'S/2004 S 31', code: '65067', family: 'irregular', group: 'inuit', model: 1, radiusKm: 2 },
  { id: 'erriapus', name: 'Erriapus', code: '628', family: 'irregular', group: 'gallic', model: 3, radiusKm: 5 },
  { id: 's_2023_s_19', name: 'S/2023 S 19', code: '65254', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 'skoll', name: 'Skoll', code: '647', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 's_2023_s_3', name: 'S/2023 S 3', code: '65238', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2019_s_30', name: 'S/2019 S 30', code: '65187', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2020_s_19', name: 'S/2020 S 19', code: '65210', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2019_s_31', name: 'S/2019 S 31', code: '65188', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 'tarqeq', name: 'Tarqeq', code: '652', family: 'irregular', group: 'inuit', model: 1, radiusKm: 3 },
  { id: 's_2023_s_21', name: 'S/2023 S 21', code: '65256', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_4', name: 'S/2023 S 4', code: '65239', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2020_s_18', name: 'S/2020 S 18', code: '65209', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2019_s_14', name: 'S/2019 S 14', code: '65133', family: 'irregular', group: 'inuit', model: 3, radiusKm: 2 },
  { id: 's_2020_s_2', name: 'S/2020 S 2', code: '65097', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 'siarnaq', name: 'Siarnaq', code: '629', family: 'irregular', group: 'inuit', model: 2, radiusKm: 20 },
  { id: 's_2019_s_4', name: 'S/2019 S 4', code: '65103', family: 'irregular', group: 'norse', model: 2, radiusKm: 1.5 },
  { id: 's_2019_s_32', name: 'S/2019 S 32', code: '65189', family: 'irregular', group: null, model: 2, radiusKm: 2.5 },
  { id: 's_2020_s_20', name: 'S/2020 S 20', code: '65211', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2020_s_3', name: 'S/2020 S 3', code: '65102', family: 'irregular', group: 'inuit', model: 3, radiusKm: 1.5 },
  { id: 's_2004_s_41', name: 'S/2004 S 41', code: '65104', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2005_s_6', name: 'S/2005 S 6', code: '65166', family: 'irregular', group: null, model: 3, radiusKm: 2 },
  { id: 's_2004_s_57', name: 'S/2004 S 57', code: '65161', family: 'irregular', group: null, model: 3, radiusKm: 2 },
  { id: 's_2019_s_6', name: 'S/2019 S 6', code: '65116', family: 'irregular', group: 'inuit', model: 2, radiusKm: 2.5 },
  { id: 's_2006_s_24', name: 'S/2006 S 24', code: '65171', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'tarvos', name: 'Tarvos', code: '621', family: 'irregular', group: 'gallic', model: 2, radiusKm: 7.5 },
  { id: 's_2020_s_4', name: 'S/2020 S 4', code: '65105', family: 'irregular', group: 'gallic', model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_30', name: 'S/2023 S 30', code: '65265', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2004_s_42', name: 'S/2004 S 42', code: '65108', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2023_s_15', name: 'S/2023 S 15', code: '65250', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2004_s_58', name: 'S/2004 S 58', code: '65162', family: 'irregular', group: null, model: 3, radiusKm: 2.5 },
  { id: 's_2006_s_23', name: 'S/2006 S 23', code: '65170', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 'hyrrokkin', name: 'Hyrrokkin', code: '644', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 's_2023_s_24', name: 'S/2023 S 24', code: '65259', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'greip', name: 'Greip', code: '651', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 's_2020_s_5', name: 'S/2020 S 5', code: '65106', family: 'irregular', group: 'inuit', model: 2, radiusKm: 1.5 },
  { id: 's_2019_s_34', name: 'S/2019 S 34', code: '65191', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2004_s_13', name: 'S/2004 S 13', code: '65087', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 's_2005_s_7', name: 'S/2005 S 7', code: '65167', family: 'irregular', group: null, model: 3, radiusKm: 2 },
  { id: 's_2007_s_6', name: 'S/2007 S 6', code: '65107', family: 'irregular', group: 'norse', model: 3, radiusKm: 1.5 },
  { id: 's_2019_s_35', name: 'S/2019 S 35', code: '65192', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2006_s_25', name: 'S/2006 S 25', code: '65172', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2023_s_22', name: 'S/2023 S 22', code: '65257', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'mundilfari', name: 'Mundilfari', code: '625', family: 'irregular', group: 'norse', model: 3, radiusKm: 3.5 },
  { id: 's_2006_s_26', name: 'S/2006 S 26', code: '65173', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2019_s_33', name: 'S/2019 S 33', code: '65190', family: 'irregular', group: null, model: 2, radiusKm: 2 },
  { id: 's_2006_s_1', name: 'S/2006 S 1', code: '65089', family: 'irregular', group: 'norse', model: 1, radiusKm: 2.5 },
  { id: 's_2023_s_23', name: 'S/2023 S 23', code: '65258', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2020_s_21', name: 'S/2020 S 21', code: '65212', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2020_s_46', name: 'S/2020 S 46', code: '65287', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2004_s_43', name: 'S/2004 S 43', code: '65111', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2006_s_10', name: 'S/2006 S 10', code: '65109', family: 'irregular', group: 'norse', model: 2, radiusKm: 1.5 },
  { id: 's_2019_s_5', name: 'S/2019 S 5', code: '65110', family: 'irregular', group: 'norse', model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_25', name: 'S/2023 S 25', code: '65260', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2004_s_59', name: 'S/2004 S 59', code: '65163', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2006_s_27', name: 'S/2006 S 27', code: '65174', family: 'irregular', group: null, model: 2, radiusKm: 2 },
  { id: 'gridr', name: 'Gridr', code: '654', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 'bergelmir', name: 'Bergelmir', code: '638', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 'jarnsaxa', name: 'Jarnsaxa', code: '650', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 'narvi', name: 'Narvi', code: '631', family: 'irregular', group: 'norse', model: 1, radiusKm: 3.5 },
  { id: 's_2023_s_44', name: 'S/2023 S 44', code: '65279', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 'suttungr', name: 'Suttungr', code: '623', family: 'irregular', group: 'norse', model: 3, radiusKm: 3.5 },
  { id: 's_2020_s_22', name: 'S/2020 S 22', code: '65213', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2004_s_44', name: 'S/2004 S 44', code: '65112', family: 'irregular', group: 'norse', model: 1, radiusKm: 2.5 },
  { id: 's_2004_s_60', name: 'S/2004 S 60', code: '65164', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2006_s_12', name: 'S/2006 S 12', code: '65115', family: 'irregular', group: 'gallic', model: 2, radiusKm: 2 },
  { id: 's_2007_s_3', name: 'S/2007 S 3', code: '65092', family: 'irregular', group: 'norse', model: 1, radiusKm: 2.5 },
  { id: 's_2004_s_45', name: 'S/2004 S 45', code: '65113', family: 'irregular', group: 'norse', model: 3, radiusKm: 2 },
  { id: 'hati', name: 'Hati', code: '643', family: 'irregular', group: 'norse', model: 2, radiusKm: 3 },
  { id: 's_2004_s_17', name: 'S/2004 S 17', code: '65088', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2006_s_11', name: 'S/2006 S 11', code: '65114', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 's_2004_s_12', name: 'S/2004 S 12', code: '65086', family: 'irregular', group: 'norse', model: 1, radiusKm: 2.5 },
  { id: 's_2020_s_23', name: 'S/2020 S 23', code: '65214', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2023_s_27', name: 'S/2023 S 27', code: '65262', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'eggther', name: 'Eggther', code: '659', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 's_2023_s_28', name: 'S/2023 S 28', code: '65263', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_37', name: 'S/2023 S 37', code: '65272', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2023_s_26', name: 'S/2023 S 26', code: '65261', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2019_s_36', name: 'S/2019 S 36', code: '65193', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2006_s_13', name: 'S/2006 S 13', code: '65117', family: 'irregular', group: 'norse', model: 2, radiusKm: 2 },
  { id: 's_2019_s_37', name: 'S/2019 S 37', code: '65194', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_48', name: 'S/2023 S 48', code: '65283', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_29', name: 'S/2023 S 29', code: '65264', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2007_s_9', name: 'S/2007 S 9', code: '65153', family: 'irregular', group: 'norse', model: 3, radiusKm: 2 },
  { id: 's_2019_s_7', name: 'S/2019 S 7', code: '65118', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2019_s_8', name: 'S/2019 S 8', code: '65119', family: 'irregular', group: 'norse', model: 2, radiusKm: 2 },
  { id: 'farbauti', name: 'Farbauti', code: '640', family: 'irregular', group: 'norse', model: 1, radiusKm: 2.5 },
  { id: 'thrymr', name: 'Thrymr', code: '630', family: 'irregular', group: 'norse', model: 1, radiusKm: 3.5 },
  { id: 'bestla', name: 'Bestla', code: '639', family: 'irregular', group: 'norse', model: 2, radiusKm: 3.5 },
  { id: 's_2019_s_9', name: 'S/2019 S 9', code: '65120', family: 'irregular', group: 'norse', model: 3, radiusKm: 2 },
  { id: 's_2023_s_32', name: 'S/2023 S 32', code: '65267', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2004_s_46', name: 'S/2004 S 46', code: '65121', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 's_2023_s_57', name: 'S/2023 S 57', code: '65296', family: 'irregular', group: null, model: 1, radiusKm: 1 },
  { id: 'angrboda', name: 'Angrboda', code: '655', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 's_2020_s_24', name: 'S/2020 S 24', code: '65215', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2019_s_11', name: 'S/2019 S 11', code: '65124', family: 'irregular', group: 'norse', model: 2, radiusKm: 2 },
  { id: 'aegir', name: 'Aegir', code: '636', family: 'irregular', group: 'norse', model: 2, radiusKm: 3 },
  { id: 's_2019_s_10', name: 'S/2019 S 10', code: '65122', family: 'irregular', group: 'norse', model: 3, radiusKm: 1.5 },
  { id: 'beli', name: 'Beli', code: '661', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 's_2023_s_31', name: 'S/2023 S 31', code: '65266', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2020_s_25', name: 'S/2020 S 25', code: '65216', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2023_s_34', name: 'S/2023 S 34', code: '65269', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2023_s_39', name: 'S/2023 S 39', code: '65274', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2019_s_12', name: 'S/2019 S 12', code: '65126', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 'gerd', name: 'Gerd', code: '657', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2019_s_13', name: 'S/2019 S 13', code: '65128', family: 'irregular', group: 'norse', model: 2, radiusKm: 1.5 },
  { id: 's_2004_s_61', name: 'S/2004 S 61', code: '65165', family: 'irregular', group: null, model: 2, radiusKm: 2 },
  { id: 's_2006_s_14', name: 'S/2006 S 14', code: '65125', family: 'irregular', group: 'norse', model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_40', name: 'S/2023 S 40', code: '65275', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'gunnlod', name: 'Gunnlod', code: '662', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2019_s_15', name: 'S/2019 S 15', code: '65134', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 's_2020_s_6', name: 'S/2020 S 6', code: '65127', family: 'irregular', group: 'norse', model: 2, radiusKm: 1.5 },
  { id: 's_2020_s_26', name: 'S/2020 S 26', code: '65217', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2023_s_41', name: 'S/2023 S 41', code: '65276', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2004_s_7', name: 'S/2004 S 7', code: '65085', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 's_2006_s_3', name: 'S/2006 S 3', code: '65090', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 's_2005_s_5', name: 'S/2005 S 5', code: '65135', family: 'irregular', group: 'norse', model: 3, radiusKm: 1.5 },
  { id: 's_2020_s_47', name: 'S/2020 S 47', code: '65288', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 'skrymir', name: 'Skrymir', code: '656', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2023_s_33', name: 'S/2023 S 33', code: '65268', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2006_s_16', name: 'S/2006 S 16', code: '65137', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 's_2023_s_49', name: 'S/2023 S 49', code: '65284', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2020_s_30', name: 'S/2020 S 30', code: '65221', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2006_s_15', name: 'S/2006 S 15', code: '65136', family: 'irregular', group: 'norse', model: 2, radiusKm: 2 },
  { id: 's_2020_s_27', name: 'S/2020 S 27', code: '65218', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_42', name: 'S/2023 S 42', code: '65277', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2004_s_28', name: 'S/2004 S 28', code: '65077', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2020_s_32', name: 'S/2020 S 32', code: '65223', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2006_s_28', name: 'S/2006 S 28', code: '65175', family: 'irregular', group: null, model: 1, radiusKm: 2 },
  { id: 's_2020_s_8', name: 'S/2020 S 8', code: '65140', family: 'irregular', group: 'norse', model: 3, radiusKm: 1.5 },
  { id: 's_2020_s_28', name: 'S/2020 S 28', code: '65219', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'alvaldi', name: 'Alvaldi', code: '665', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 's_2019_s_38', name: 'S/2019 S 38', code: '65195', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 'kari', name: 'Kari', code: '645', family: 'irregular', group: 'norse', model: 2, radiusKm: 3 },
  { id: 's_2004_s_48', name: 'S/2004 S 48', code: '65139', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2023_s_36', name: 'S/2023 S 36', code: '65271', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 'geirrod', name: 'Geirrod', code: '666', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2023_s_35', name: 'S/2023 S 35', code: '65270', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2020_s_29', name: 'S/2020 S 29', code: '65220', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'fenrir', name: 'Fenrir', code: '641', family: 'irregular', group: 'norse', model: 2, radiusKm: 2 },
  { id: 's_2004_s_50', name: 'S/2004 S 50', code: '65142', family: 'irregular', group: 'norse', model: 2, radiusKm: 1.5 },
  { id: 's_2006_s_17', name: 'S/2006 S 17', code: '65138', family: 'irregular', group: 'norse', model: 3, radiusKm: 2 },
  { id: 's_2004_s_49', name: 'S/2004 S 49', code: '65141', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2020_s_34', name: 'S/2020 S 34', code: '65225', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2020_s_31', name: 'S/2020 S 31', code: '65222', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_52', name: 'S/2023 S 52', code: '65291', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_43', name: 'S/2023 S 43', code: '65278', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2019_s_17', name: 'S/2019 S 17', code: '65145', family: 'irregular', group: 'norse', model: 2, radiusKm: 2 },
  { id: 'surtur', name: 'Surtur', code: '648', family: 'irregular', group: 'norse', model: 2, radiusKm: 3 },
  { id: 's_2006_s_18', name: 'S/2006 S 18', code: '65143', family: 'irregular', group: 'norse', model: 3, radiusKm: 2 },
  { id: 's_2020_s_36', name: 'S/2020 S 36', code: '65227', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'loge', name: 'Loge', code: '646', family: 'irregular', group: 'norse', model: 1, radiusKm: 3 },
  { id: 's_2020_s_33', name: 'S/2020 S 33', code: '65224', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'ymir', name: 'Ymir', code: '619', family: 'irregular', group: 'norse', model: 2, radiusKm: 9 },
  { id: 's_2020_s_35', name: 'S/2020 S 35', code: '65226', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2019_s_19', name: 'S/2019 S 19', code: '65147', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 's_2019_s_18', name: 'S/2019 S 18', code: '65146', family: 'irregular', group: 'norse', model: 2, radiusKm: 1.5 },
  { id: 's_2004_s_21', name: 'S/2004 S 21', code: '65079', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 's_2004_s_39', name: 'S/2004 S 39', code: '65084', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 's_2019_s_16', name: 'S/2019 S 16', code: '65144', family: 'irregular', group: 'norse', model: 3, radiusKm: 1.5 },
  { id: 's_2004_s_53', name: 'S/2004 S 53', code: '65154', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2004_s_24', name: 'S/2004 S 24', code: '65070', family: 'irregular', group: 'gallic', model: 1, radiusKm: 1.5 },
  { id: 's_2004_s_36', name: 'S/2004 S 36', code: '65081', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 's_2023_s_51', name: 'S/2023 S 51', code: '65290', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2023_s_45', name: 'S/2023 S 45', code: '65280', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2020_s_45', name: 'S/2020 S 45', code: '65286', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 'thiazzi', name: 'Thiazzi', code: '663', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2020_s_38', name: 'S/2020 S 38', code: '65229', family: 'irregular', group: null, model: 2, radiusKm: 2 },
  { id: 's_2019_s_20', name: 'S/2019 S 20', code: '65148', family: 'irregular', group: 'norse', model: 2, radiusKm: 1.5 },
  { id: 's_2020_s_37', name: 'S/2020 S 37', code: '65228', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2019_s_39', name: 'S/2019 S 39', code: '65196', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2020_s_40', name: 'S/2020 S 40', code: '65231', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2006_s_19', name: 'S/2006 S 19', code: '65149', family: 'irregular', group: 'norse', model: 3, radiusKm: 2 },
  { id: 's_2019_s_40', name: 'S/2019 S 40', code: '65197', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2019_s_42', name: 'S/2019 S 42', code: '65199', family: 'irregular', group: null, model: 1, radiusKm: 2 },
  { id: 'saturn_lxiv', name: 'Saturn LXIV', code: '664', family: 'irregular', group: 'norse', model: 1, radiusKm: 1.5 },
  { id: 's_2020_s_39', name: 'S/2020 S 39', code: '65230', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2019_s_41', name: 'S/2019 S 41', code: '65198', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2023_s_46', name: 'S/2023 S 46', code: '65281', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 'fornjot', name: 'Fornjot', code: '642', family: 'irregular', group: 'norse', model: 3, radiusKm: 3 },
  { id: 's_2023_s_47', name: 'S/2023 S 47', code: '65282', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2004_s_51', name: 'S/2004 S 51', code: '65150', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2006_s_29', name: 'S/2006 S 29', code: '65176', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2020_s_10', name: 'S/2020 S 10', code: '65155', family: 'irregular', group: 'norse', model: 2, radiusKm: 1.5 },
  { id: 's_2020_s_42', name: 'S/2020 S 42', code: '65233', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 's_2020_s_9', name: 'S/2020 S 9', code: '65151', family: 'irregular', group: 'norse', model: 3, radiusKm: 2 },
  { id: 's_2023_s_5', name: 'S/2023 S 5', code: '65240', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2020_s_41', name: 'S/2020 S 41', code: '65232', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'saturn_lviii', name: 'Saturn LVIII', code: '658', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2019_s_21', name: 'S/2019 S 21', code: '65156', family: 'irregular', group: 'norse', model: 1, radiusKm: 2 },
  { id: 's_2004_s_52', name: 'S/2004 S 52', code: '65152', family: 'irregular', group: 'norse', model: 2, radiusKm: 1.5 },
  { id: 's_2020_s_43', name: 'S/2020 S 43', code: '65234', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2019_s_43', name: 'S/2019 S 43', code: '65200', family: 'irregular', group: null, model: 3, radiusKm: 1.5 },
  { id: 's_2019_s_44', name: 'S/2019 S 44', code: '65201', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 's_2020_s_44', name: 'S/2020 S 44', code: '65235', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
]

/**
 * Jupiter's ninety-seven.
 *
 * Four inner moons and ninety-three captured ones, and the split between them is
 * about as stark as this system gets.
 *
 * The inner four — Metis, Adrastea, Amalthea and Thebe — orbit inside Io in a
 * couple of days or less, and they are where Jupiter's rings come from: the main
 * ring is dust knocked off Metis and Adrastea by micrometeorites, and the two
 * faint gossamer rings are the same process at Amalthea and Thebe, each ring
 * reaching out exactly as far as the moon that feeds it. Amalthea is the large
 * one at 167 km across, red as Io and less dense than water, which means it is
 * probably a rubble pile with gaps in it rather than a solid rock.
 *
 * Everything beyond them was captured, and it sorts into families the same way
 * Saturn's does — each family the debris of one parent body broken up after
 * capture, sharing an orbit closely enough to still be recognisable:
 *
 *   himalia    the prograde group, and the only one with a substantial member —
 *              Himalia itself is 170 km across, a fifth of the total mass of
 *              everything captured here.
 *   ananke     retrograde, steeply inclined, tightly clustered.
 *   carme      retrograde and the most populous, nearly all of them found since
 *              2000 and most only a kilometre or two across.
 *   pasiphae   retrograde and the most scattered of the three.
 *
 * The handful with no family are the interesting ones. **Themisto** orbits alone
 * in the gap between the Galileans and the Himalia group, with nothing else near
 * it. **Valetudo** is half a kilometre across, prograde, and out among the
 * retrograde swarm going the wrong way through traffic — it crosses their orbits,
 * and a collision is thought to be a matter of time.
 *
 * The four Galileans are absent because they are already in `moonData.js` as
 * Jupiter's major moons.
 *
 * **Megaclite and Philophrosyne** are both here despite JPL's element table
 * spelling neither of them correctly — see `JPL_NAME_FIXES` in
 * `build-minor-roster.mjs`, which is what keeps a rerun from dropping them.
 */
const JUPITER = [
  // ---- inner, the ring sources ----
  { id: 'metis', name: 'Metis', code: '516', family: 'inner', group: 'amalthea', model: 2, radiusKm: 21.5 },
  { id: 'adrastea', name: 'Adrastea', code: '515', family: 'inner', group: 'amalthea', model: 1, radiusKm: 8.2 },
  { id: 'amalthea', name: 'Amalthea', code: '505', family: 'inner', group: 'amalthea', model: 2, radiusKm: 83.5 },
  { id: 'thebe', name: 'Thebe', code: '514', family: 'inner', group: 'amalthea', model: 3, radiusKm: 49 },

  // ---- captured ----
  { id: 'themisto', name: 'Themisto', code: '518', family: 'irregular', group: null, model: 3, radiusKm: 4 },
  { id: 's_2011_j_4', name: 'S/2011 J 4', code: '55527', family: 'irregular', group: null, model: 1, radiusKm: 1.5 },
  { id: 'leda', name: 'Leda', code: '513', family: 'irregular', group: 'himalia', model: 2, radiusKm: 10 },
  { id: 'ersa', name: 'Ersa', code: '571', family: 'irregular', group: 'himalia', model: 3, radiusKm: 1.5 },
  { id: 's_2018_j_2', name: 'S/2018 J 2', code: '55510', family: 'irregular', group: 'himalia', model: 1, radiusKm: 1.5 },
  { id: 'himalia', name: 'Himalia', code: '506', family: 'irregular', group: 'himalia', model: 1, radiusKm: 85 },
  { id: 'pandia', name: 'Pandia', code: '565', family: 'irregular', group: 'himalia', model: 3, radiusKm: 1.5 },
  { id: 'lysithea', name: 'Lysithea', code: '510', family: 'irregular', group: 'himalia', model: 3, radiusKm: 18 },
  { id: 'elara', name: 'Elara', code: '507', family: 'irregular', group: 'himalia', model: 2, radiusKm: 43 },
  { id: 's_2011_j_3', name: 'S/2011 J 3', code: '55509', family: 'irregular', group: 'himalia', model: 1, radiusKm: 1.5 },
  { id: 'dia', name: 'Dia', code: '553', family: 'irregular', group: 'himalia', model: 2, radiusKm: 2 },
  { id: 's_2018_j_4', name: 'S/2018 J 4', code: '55520', family: 'irregular', group: 'carpo', model: 1, radiusKm: 1 },
  { id: 'carpo', name: 'Carpo', code: '546', family: 'irregular', group: null, model: 2, radiusKm: 1.5 },
  { id: 'valetudo', name: 'Valetudo', code: '562', family: 'irregular', group: null, model: 1, radiusKm: 0.5 },
  { id: 'euporie', name: 'Euporie', code: '534', family: 'irregular', group: 'ananke', model: 3, radiusKm: 1 },
  { id: 'jupiter_lv', name: 'Jupiter LV', code: '555', family: 'irregular', group: 'ananke', model: 1, radiusKm: 1 },
  { id: 'eupheme', name: 'Eupheme', code: '560', family: 'irregular', group: 'ananke', model: 3, radiusKm: 1 },
  { id: 's_2021_j_3', name: 'S/2021 J 3', code: '55514', family: 'irregular', group: 'ananke', model: 1, radiusKm: 1 },
  { id: 'jupiter_lii', name: 'Jupiter LII', code: '552', family: 'irregular', group: 'ananke', model: 1, radiusKm: 0.5 },
  { id: 'jupiter_liv', name: 'Jupiter LIV', code: '554', family: 'irregular', group: 'ananke', model: 1, radiusKm: 0.5 },
  { id: 'mneme', name: 'Mneme', code: '540', family: 'irregular', group: 'ananke', model: 2, radiusKm: 1 },
  { id: 'euanthe', name: 'Euanthe', code: '533', family: 'irregular', group: 'ananke', model: 1, radiusKm: 1.5 },
  { id: 's_2003_j_16', name: 'S/2003 J 16', code: '55506', family: 'irregular', group: 'ananke', model: 1, radiusKm: 1 },
  { id: 'harpalyke', name: 'Harpalyke', code: '522', family: 'irregular', group: 'ananke', model: 2, radiusKm: 2.2 },
  { id: 'orthosie', name: 'Orthosie', code: '535', family: 'irregular', group: 'ananke', model: 3, radiusKm: 1 },
  { id: 'helike', name: 'Helike', code: '545', family: 'irregular', group: 'ananke', model: 1, radiusKm: 2 },
  { id: 's_2021_j_2', name: 'S/2021 J 2', code: '55513', family: 'irregular', group: 'ananke', model: 1, radiusKm: 1 },
  { id: 'praxidike', name: 'Praxidike', code: '527', family: 'irregular', group: 'ananke', model: 3, radiusKm: 3.4 },
  { id: 'jupiter_lxiv', name: 'Jupiter LXIV', code: '564', family: 'irregular', group: 'ananke', model: 1, radiusKm: 1 },
  { id: 's_2021_j_1', name: 'S/2021 J 1', code: '55512', family: 'irregular', group: 'ananke', model: 1, radiusKm: 0.5 },
  { id: 's_2003_j_12', name: 'S/2003 J 12', code: '55505', family: 'irregular', group: 'ananke', model: 1, radiusKm: 0.5 },
  { id: 'jupiter_lxviii', name: 'Jupiter LXVIII', code: '568', family: 'irregular', group: 'ananke', model: 1, radiusKm: 1 },
  { id: 'thelxinoe', name: 'Thelxinoe', code: '542', family: 'irregular', group: 'ananke', model: 2, radiusKm: 1 },
  { id: 'thyone', name: 'Thyone', code: '529', family: 'irregular', group: 'ananke', model: 1, radiusKm: 2 },
  { id: 's_2003_j_2', name: 'S/2003 J 2', code: '55501', family: 'irregular', group: 'ananke', model: 1, radiusKm: 1 },
  { id: 's_2022_j_3', name: 'S/2022 J 3', code: '55523', family: 'irregular', group: 'ananke', model: 1, radiusKm: 0.5 },
  { id: 'ananke', name: 'Ananke', code: '512', family: 'irregular', group: 'ananke', model: 2, radiusKm: 14 },
  { id: 'iocaste', name: 'Iocaste', code: '524', family: 'irregular', group: 'ananke', model: 2, radiusKm: 2.6 },
  { id: 's_2017_j_10', name: 'S/2017 J 10', code: '55525', family: 'irregular', group: 'ananke', model: 2, radiusKm: 0.5 },
  { id: 'hermippe', name: 'Hermippe', code: '530', family: 'irregular', group: 'ananke', model: 2, radiusKm: 2 },
  { id: 'jupiter_lxx', name: 'Jupiter LXX', code: '570', family: 'irregular', group: 'ananke', model: 1, radiusKm: 1.5 },
  { id: 'philophrosyne', name: 'Philophrosyne', code: '558', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 1 },
  { id: 's_2016_j_3', name: 'S/2016 J 3', code: '55518', family: 'irregular', group: 'carme', model: 1, radiusKm: 1 },
  { id: 's_2022_j_1', name: 'S/2022 J 1', code: '55521', family: 'irregular', group: 'carme', model: 1, radiusKm: 0.5 },
  { id: 'jupiter_lxix', name: 'Jupiter LXIX', code: '569', family: 'irregular', group: 'carme', model: 1, radiusKm: 0.5 },
  { id: 'pasithee', name: 'Pasithee', code: '538', family: 'irregular', group: 'carme', model: 2, radiusKm: 1 },
  { id: 's_2021_j_6', name: 'S/2021 J 6', code: '55517', family: 'irregular', group: 'carme', model: 1, radiusKm: 0.5 },
  { id: 's_2003_j_24', name: 'S/2003 J 24', code: '55508', family: 'irregular', group: 'carme', model: 1, radiusKm: 1 },
  { id: 'eurydome', name: 'Eurydome', code: '532', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 1.5 },
  { id: 'jupiter_lvi', name: 'Jupiter LVI', code: '556', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 0.5 },
  { id: 's_2003_j_4', name: 'S/2003 J 4', code: '55502', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 1 },
  { id: 'chaldene', name: 'Chaldene', code: '521', family: 'irregular', group: 'carme', model: 3, radiusKm: 1.9 },
  { id: 'jupiter_lxiii', name: 'Jupiter LXIII', code: '563', family: 'irregular', group: 'carme', model: 1, radiusKm: 1 },
  { id: 'isonoe', name: 'Isonoe', code: '526', family: 'irregular', group: 'carme', model: 3, radiusKm: 1.9 },
  { id: 's_2017_j_11', name: 'S/2017 J 11', code: '55526', family: 'irregular', group: 'carme', model: 3, radiusKm: 0.5 },
  { id: 'kallichore', name: 'Kallichore', code: '544', family: 'irregular', group: 'carme', model: 2, radiusKm: 1 },
  { id: 's_2021_j_4', name: 'S/2021 J 4', code: '55515', family: 'irregular', group: 'carme', model: 1, radiusKm: 0.5 },
  { id: 'erinome', name: 'Erinome', code: '525', family: 'irregular', group: 'carme', model: 3, radiusKm: 1.6 },
  { id: 'kale', name: 'Kale', code: '537', family: 'irregular', group: 'carme', model: 1, radiusKm: 1 },
  { id: 'eirene', name: 'Eirene', code: '557', family: 'irregular', group: 'carme', model: 3, radiusKm: 2 },
  { id: 'aitne', name: 'Aitne', code: '531', family: 'irregular', group: 'carme', model: 1, radiusKm: 1.5 },
  { id: 'eukelade', name: 'Eukelade', code: '547', family: 'irregular', group: 'carme', model: 2, radiusKm: 2 },
  { id: 's_2022_j_2', name: 'S/2022 J 2', code: '55522', family: 'irregular', group: 'carme', model: 1, radiusKm: 0.5 },
  { id: 'arche', name: 'Arche', code: '543', family: 'irregular', group: 'carme', model: 1, radiusKm: 1.5 },
  { id: 'taygete', name: 'Taygete', code: '520', family: 'irregular', group: 'carme', model: 1, radiusKm: 2.5 },
  { id: 's_2016_j_4', name: 'S/2016 J 4', code: '55519', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 0.5 },
  { id: 'jupiter_lxxii', name: 'Jupiter LXXII', code: '572', family: 'irregular', group: 'ananke', model: 1, radiusKm: 1 },
  { id: 'carme', name: 'Carme', code: '511', family: 'irregular', group: 'carme', model: 1, radiusKm: 23 },
  { id: 'herse', name: 'Herse', code: '550', family: 'irregular', group: 'carme', model: 3, radiusKm: 1 },
  { id: 'jupiter_lxi', name: 'Jupiter LXI', code: '561', family: 'irregular', group: 'carme', model: 1, radiusKm: 1 },
  { id: 'jupiter_li', name: 'Jupiter LI', code: '551', family: 'irregular', group: 'carme', model: 1, radiusKm: 1 },
  { id: 's_2003_j_9', name: 'S/2003 J 9', code: '55503', family: 'irregular', group: 'carme', model: 1, radiusKm: 0.5 },
  { id: 'jupiter_lxvi', name: 'Jupiter LXVI', code: '566', family: 'irregular', group: 'carme', model: 1, radiusKm: 1 },
  { id: 'jupiter_lxvii', name: 'Jupiter LXVII', code: '567', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 1 },
  { id: 's_2018_j_5', name: 'S/2018 J 5', code: '55528', family: 'irregular', group: null, model: 1, radiusKm: 1 },
  { id: 'kalyke', name: 'Kalyke', code: '523', family: 'irregular', group: 'carme', model: 3, radiusKm: 2.6 },
  { id: 'hegemone', name: 'Hegemone', code: '539', family: 'irregular', group: 'pasiphae', model: 3, radiusKm: 1.5 },
  { id: 's_2003_j_10', name: 'S/2003 J 10', code: '55504', family: 'irregular', group: 'carme', model: 1, radiusKm: 1 },
  { id: 's_2018_j_3', name: 'S/2018 J 3', code: '55511', family: 'irregular', group: 'carme', model: 1, radiusKm: 0.5 },
  { id: 's_2021_j_5', name: 'S/2021 J 5', code: '55516', family: 'irregular', group: 'carme', model: 1, radiusKm: 1 },
  { id: 's_2024_j_1', name: 'S/2024 J 1', code: '55529', family: 'irregular', group: null, model: 3, radiusKm: 1 },
  { id: 'pasiphae', name: 'Pasiphae', code: '508', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 30 },
  { id: 's_2011_j_5', name: 'S/2011 J 5', code: '55530', family: 'irregular', group: null, model: 2, radiusKm: 1 },
  { id: 'sponde', name: 'Sponde', code: '536', family: 'irregular', group: 'pasiphae', model: 2, radiusKm: 1 },
  { id: 'megaclite', name: 'Megaclite', code: '519', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 2.7 },
  { id: 'cyllene', name: 'Cyllene', code: '548', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 1 },
  { id: 'sinope', name: 'Sinope', code: '509', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 19 },
  { id: 'jupiter_lix', name: 'Jupiter LIX', code: '559', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 1 },
  { id: 'aoede', name: 'Aoede', code: '541', family: 'irregular', group: 'pasiphae', model: 3, radiusKm: 2 },
  { id: 'autonoe', name: 'Autonoe', code: '528', family: 'irregular', group: 'pasiphae', model: 2, radiusKm: 2 },
  { id: 'callirrhoe', name: 'Callirrhoe', code: '517', family: 'irregular', group: 'pasiphae', model: 3, radiusKm: 4.3 },
  { id: 's_2003_j_23', name: 'S/2003 J 23', code: '55507', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 1 },
  { id: 'kore', name: 'Kore', code: '549', family: 'irregular', group: 'pasiphae', model: 1, radiusKm: 1 },
]

/**
 * Keyed by parent, in the order the systems were added — fewest moons first,
 * which is also roughly least to most speculative.
 */
export const MINOR_MOON_ROSTER = {
  neptune: NEPTUNE,
  uranus: URANUS,
  saturn: SATURN,
  jupiter: JUPITER,
}

/** Every roster row, flattened, with its parent attached. */
export const ALL_MINOR_MOONS = Object.entries(MINOR_MOON_ROSTER).flatMap(([parent, moons]) =>
  moons.map((moon) => ({ ...moon, parent })),
)
