/**
 * Which NASA model each body wears, and what to do with it.
 *
 * Shared by `prepare-nasa-model.mjs` (the build step) and kept next to it so
 * there is exactly one list. `src/models.js` names the same bodies again for
 * the runtime, which is unavoidable — one is Node reading `Models/`, the other
 * is the browser reading `public/models/` — but only this file decides *which
 * source file* a body comes from.
 *
 * Bodies absent from this table draw the app's own sphere and the texture set:
 * the Sun (its own Blender model), Earth, Mars and Neptune.
 */

export const NASA_BODIES = {
  /* ---- planets ---- */
  mercury: { file: 'Planets/mercury.glb' },
  /**
   * Filed under Moons/, and it is the good one: 4096x2048 of Magellan radar
   * surface where the copy on NASA's own Venus resource page is a 292 KB stub.
   */
  venus: { file: 'Moons/Venussurface_1_12103.glb' },
  jupiter: { file: 'Planets/jupiter.glb' },
  /**
   * Body only. The file carries three meshes — the globe and two ring planes —
   * and the app keeps drawing its own rings, which are a radius-mapped mesh
   * with a proper alpha texture. NASA's ring map is 4096x16: a single strip,
   * one pixel row per ring gap, which is why `Rings.jsx` exists at all.
   *
   * Dropping the ring nodes also fixes the normalisation. Bounding radius is
   * measured over the meshes that survive the filter, so Saturn's *globe*
   * becomes radius 1 — measured over the rings it would have been 1165x too
   * small, and Saturn would have rendered as a dot.
   */
  saturn: { file: 'Planets/saturn.glb', keepNodes: ['Saturn.001'] },
  uranus: { file: 'Planets/uranus.glb' },

  /* ---- dwarf planets ---- */
  ceres: { file: 'Moons/ceres.glb' },
  haumea: { file: 'Moons/haumea.glb' },
  makemake: { file: 'Moons/makemake.glb' },
  eris: { file: 'Moons/eris.glb' },
  /** Already shipping; listed so the whole set rebuilds from one command. */
  pluto: { file: 'Planets/pluto.glb' },

  /* ---- moons ---- */
  /**
   * The one I reported did not exist. It is also the best mesh in the set:
   * 46,464 vertices carrying real displaced lunar terrain, where every other
   * body here is a smooth sphere wearing a photograph.
   */
  luna: { file: 'Planets/moon_small.glb' },
  phobos: { file: 'Moons/phobos.glb' },
  deimos: { file: 'Moons/deimos.glb' },
  io: { file: 'Moons/io.glb' },
  europa: { file: 'Moons/europa.glb' },
  ganymede: { file: 'Moons/ganymede.glb' },
  callisto: { file: 'Moons/callisto.glb' },
  enceladus: { file: 'Moons/enceladus.glb' },
  titan: { file: 'Moons/titan.glb' },
  triton: { file: 'Moons/triton.glb' },

  /* ---- Saturn's other icy moons ----
   *
   * Cassini mapped all five, and these carry those mosaics. The filenames keep
   * NASA's own convention — `Mimas_1_1000` is a 1:1000-scale model, not a
   * diameter — so they are left as downloaded rather than renamed, which makes
   * them traceable back to the resource page they came from.
   */
  mimas: { file: 'Moons/Mimas_1_1000.glb' },
  tethys: { file: 'Moons/Tethys_1_1077-1.glb' },
  dione: { file: 'Moons/Dione_1_1123.glb' },
  rhea: { file: 'Moons/Rhea_1_1529.glb' },
  iapetus: { file: 'Moons/Iapetus_1_1471.glb' },

  /* ---- the Uranian five ----
   *
   * Voyager 2 in 1986 is the only source there has ever been, and it saw one
   * hemisphere of each on the way past. These maps are real where they are real
   * and blank where nothing has ever been photographed — see the surface notes
   * in `bodies.js`, which are measured rather than asserted.
   */
  miranda: { file: 'Moons/Miranda_1_472.glb' },
  ariel: { file: 'Moons/Ariel_1_1158.glb' },
  umbriel: { file: 'Moons/Umbriel_1_1169.glb' },
  titania: { file: 'Moons/Titania_1_1577.glb' },
  oberon: { file: 'Moons/Oberon_1_1523.glb' },

  /* ---- Pluto's system ----
   *
   * Charon only. Styx, Nix, Kerberos and Hydra have no NASA model, which is not
   * an oversight on NASA's part: New Horizons resolved them into a handful of
   * pixels each, and there is no shape or map to publish. They keep their
   * procedural spheres, and the info panel says the shape is invented too.
   */
  charon: { file: 'Moons/Charon_1_2.glb' },

  /**
   * Neptune's second-largest moon, and the one body here that comes from Eyes
   * rather than the 3D Resources catalogue — the catalogue has nothing for it.
   * Downloaded by `npm run models:eyes`.
   *
   * Worth the exception because Proteus is right at the size where a world stops
   * being round: about 420 km across, visibly boxy, with a 150 km crater biting
   * one end off. A sphere would be telling a lie that the mesh does not.
   */
  proteus: { file: 'MinorMoons/proteus.glb' },

  /**
   * Saturn's two, also from Eyes and also absent from the catalogue.
   *
   * Both are *minor* moons that nonetheless have real shapes, which is the case
   * this pair exists to cover. Eyes' entity data tags Hyperion's group `major`,
   * and its interface counts it among Saturn's 278 minor moons — the interface
   * is the one to follow, and it is also the better call: the seven majors are
   * the round icy worlds, and Hyperion is neither round nor icy.
   *
   * They keep their meshes because Cassini went close to both. A body somebody
   * has actually seen should not be drawn as a generic asteroid just because of
   * which list it sits in.
   */
  hyperion: { file: 'MinorMoons/hyperion.glb' },
  phoebe: { file: 'MinorMoons/phoebe.glb' },

  /* ---- generic minor-moon shapes ----
   *
   * Not bodies. These are the three placeholder asteroids NASA's Eyes on the
   * Solar System deals out to the ~500 minor moons nothing has ever resolved —
   * Themisto, Carpo, Aitne and the rest of the irregular swarms — and they are
   * downloaded rather than hand-collected: `npm run models:generic` fetches
   * them into `Models/MinorMoons/`, and that script's header records where from
   * and on what terms.
   *
   * They are listed here so they go through the identical pipeline as a real
   * body: normalised to unit radius, colour map re-encoded, normal map capped,
   * material rewritten. The only thing that differs is that one file will be
   * worn by dozens of moons instead of one, which changes nothing about the
   * preparation and everything about how much it is worth compressing.
   *
   * The ids are hyphenated to match the `public/models/<id>.glb` convention and
   * to keep them visibly *not* body ids — nothing in `bodies.js` can collide
   * with one.
   */
  /* ---- comets ----
   *
   * The four Eyes has a real shape for, and each one is a spacecraft's doing:
   * Rosetta at 67P, Deep Impact at Tempel 1, EPOXI at Hartley 2, Deep Space 1
   * at Borrelly. The other nine comets in the roster wear a generic asteroid,
   * Halley included — nothing has ever resolved them into more than a point.
   *
   * Downloaded by `npm run models:eyes` into `Models/Comets/`.
   */
  '67p-churyumov-gerasimenko': { file: 'Comets/67p_churyumov_gerasimenko.glb' },
  '9p-tempel-1': { file: 'Comets/9p_tempel_1.glb' },
  '103p-hartley-2': { file: 'Comets/103p_hartley_2.glb' },
  '19p-borrelly': { file: 'Comets/19p_borrelly.glb' },
  /**
   * The fifth, and the only shape here nobody photographed. ʻOumuamua's form is
   * inferred from a light curve that swung by a factor of ten every 8.1 hours —
   * see the note in `fetch-eyes-models.mjs`.
   */
  '1i-oumuamua': { file: 'Comets/1i_oumuamua.glb' },

  'generic-asteroid-1': { file: 'MinorMoons/generic_asteroid_1.glb' },
  'generic-asteroid-2': { file: 'MinorMoons/generic_asteroid_2.glb' },
  'generic-asteroid-3': { file: 'MinorMoons/generic_asteroid_3.glb' },
}
