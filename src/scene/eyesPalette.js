/**
 * The orbit and trail styling from NASA's Eyes on the Solar System.
 *
 * Every number here is transcribed from the values Eyes itself ships, not
 * matched by eye against a screenshot. They are declared in the open in
 * `eyes.nasa.gov/apps/solar-system/app.js`: the per-body colours in each
 * entity's `trail: { length, color }` literal, and the orbit-line colours and
 * widths in the `TrailManager` constructor as `_colors`, `_width`,
 * `_opacity` and `_orbitLinesOpts`. Colours there are RGBA floats or /255
 * fractions; they are kept in that form below so a line-by-line comparison with
 * the source is possible.
 *
 * ## The two-renderer split, which is the whole design
 *
 * Eyes draws a body's path with one of *two* components, never both:
 *
 *   OrbitLineComponent  a static closed ellipse. The eight planets, plus
 *                       Earth's Moon.
 *   TrailComponent      the path actually travelled, tapering and fading out
 *                       behind the body. Everything else — the other moons, the
 *                       dwarf planets, and the spacecraft.
 *
 * They are mutually exclusive by construction: `TrailManager.createOrbitLine`
 * *removes* the trail component before adding the orbit line. That is why, in
 * Eyes, switching the Orbits layer off does nothing to the moons and switching
 * Trails off makes their paths disappear — the observation that sent me to read
 * the source rather than trust the entity table, which had led me to the wrong
 * conclusion.
 *
 * Note there are two *different* palettes, and they disagree sharply. Mercury's
 * orbit line is purple (#9768AC) while its trail colour is neutral grey; Venus's
 * orbit line is a dark ochre against a bright gold trail. Both are real and both
 * are used, for different components. Since only the planets and the Moon draw
 * orbit lines, and only non-planets draw trails, the disagreement never shows
 * up on screen — but it does mean neither table can be used for both jobs.
 */

/**
 * Orbit-line colours: `TrailManager._colors`.
 *
 * Alpha is `_opacity.primary` (0.75) for the eight named planets and
 * `_opacity.secondary` (0.35) for the default, which is what any other body
 * drawing an orbit line would get. Eyes only ever names the planets here.
 */
export const ORBIT_LINE_COLOURS = {
  mercury: [151 / 255, 104 / 255, 172 / 255],
  venus: [176 / 255, 121 / 255, 25 / 255],
  earth: [0, 0.6, 0.8],
  mars: [154 / 255, 78 / 255, 25 / 255],
  jupiter: [218 / 255, 139 / 255, 114 / 255],
  saturn: [213 / 255, 193 / 255, 135 / 255],
  uranus: [104 / 255, 0.8, 218 / 255],
  neptune: [112 / 255, 140 / 255, 227 / 255],
}

/** `TrailManager._colors.default` — white, and dimmer than a named planet. */
export const DEFAULT_ORBIT_LINE_COLOUR = [1, 1, 1]

/** `TrailManager._opacity`. `secondary` is "not one of the eight planets". */
export const ORBIT_LINE_ALPHA = { primary: 0.75, secondary: 0.35, hover: 1 }

/**
 * `TrailManager._orbitLinesOpts.lineWidth`, in pixels.
 *
 * Uniform along the line's whole length — unlike a trail, an orbit line does
 * not taper. Being pixels rather than world units is why this cannot be a
 * `lineBasicMaterial`: WebGL ignores `linewidth` and always draws one pixel.
 */
export const ORBIT_LINE_WIDTH = { default: 1.2, hover: 2 }

/**
 * `TrailManager._orbitLinesOpts.alphaFade`, as on-screen radii in pixels.
 *
 * Read as `[fullyFadedAt, startFadingAt]`: the engine computes
 * `clamp01((r - 22) / (8 - 22))`, so an orbit line is at full strength while its
 * body is under 8 px on screen and is gone once the body reaches 22 px. The
 * orbit fades out as you fly in, which is the same problem the old
 * selection-based rule in this app was solving, answered by distance instead of
 * by intent — so it also works when you simply scroll-zoom toward something
 * without selecting it.
 */
export const ORBIT_LINE_FADE_PX = { gone: 22, full: 8 }

/**
 * Trail colours: each entity's `trail.color`, as RGBA.
 *
 * Every moon carries its *planet's* colour rather than one of its own, which is
 * what makes a planet and its satellites read as one system. The four Galileans
 * are all Jupiter's salmon; Saturn's seven are all its tan.
 *
 * Absent from this table and deliberately so: the dwarf planets and Charon,
 * which specify no colour in Eyes at all and fall through to the engine default
 * below. The Moon is absent for a different reason — it draws an orbit line.
 */
const MERCURY_TRAIL = [0.6, 0.6, 0.6]
const VENUS_TRAIL = [0.9, 0.8, 0.45]
const EARTH_TRAIL = [0, 0.6, 0.8]
const MARS_TRAIL = [0.89, 0.51, 0.35]
const JUPITER_TRAIL = [0.95, 0.71, 0.64]
const SATURN_TRAIL = [0.72, 0.65, 0.52]
const URANUS_TRAIL = [0.67, 0.92, 1]
const NEPTUNE_TRAIL = [0.48, 0.69, 1]

export const TRAIL_COLOURS = {
  mercury: MERCURY_TRAIL,
  venus: VENUS_TRAIL,
  earth: EARTH_TRAIL,
  mars: MARS_TRAIL,
  jupiter: JUPITER_TRAIL,
  saturn: SATURN_TRAIL,
  uranus: URANUS_TRAIL,
  neptune: NEPTUNE_TRAIL,

  luna: EARTH_TRAIL,
  phobos: MARS_TRAIL,
  deimos: MARS_TRAIL,
  io: JUPITER_TRAIL,
  europa: JUPITER_TRAIL,
  ganymede: JUPITER_TRAIL,
  callisto: JUPITER_TRAIL,
  mimas: SATURN_TRAIL,
  enceladus: SATURN_TRAIL,
  tethys: SATURN_TRAIL,
  dione: SATURN_TRAIL,
  rhea: SATURN_TRAIL,
  titan: SATURN_TRAIL,
  iapetus: SATURN_TRAIL,
  miranda: URANUS_TRAIL,
  ariel: URANUS_TRAIL,
  umbriel: URANUS_TRAIL,
  titania: URANUS_TRAIL,
  oberon: URANUS_TRAIL,
  triton: NEPTUNE_TRAIL,
}

/** The alpha Eyes authors into every one of those `trail.color` literals. */
export const TRAIL_ALPHA = 0.7

/**
 * What a minor moon's path is drawn at instead, and why it is not Eyes' 0.7.
 *
 * The paths here are **additively** blended — see `makeRibbonMaterial` — so
 * overlapping ones do not average, they sum. That is right for a handful of
 * moons and wrong for Saturn's, where two hundred and sixty-one ellipses cross
 * the same few hundred pixels: at 0.7 each they add to a solid white mass with
 * the planet somewhere inside it, invisible.
 *
 * Roughly a third of the authored value brings the densest region back to about
 * the brightness one path has on its own, which is the point — the swarm should
 * read as a swarm, dense where the family is dense, rather than as a blown-out
 * disc. A single irregular seen alone is correspondingly fainter than a major
 * moon's path, and that is a fair thing to say about it.
 *
 * Applied by tier rather than by how many are currently drawn, so a path does
 * not change brightness as other moons are switched on and off.
 */
export const MINOR_TRAIL_ALPHA = 0.22

/**
 * `Color(1, 1, 1, 0.5)`, the engine's fallback when an entity names no colour.
 *
 * What the five dwarf planets and Charon actually draw. Dimmer than a planet's
 * path and uncoloured, which reads as "a different class of object" — worth
 * keeping rather than inventing six colours Eyes does not have.
 */
export const DEFAULT_TRAIL_COLOUR = [1, 1, 1]
export const DEFAULT_TRAIL_ALPHA = 0.5

/**
 * `TrailManager._width`, as `[widthMin, widthMax]` in pixels.
 *
 * The trail shader does `width = mix(widthMin, widthMax, indexU)` with `indexU`
 * running 0 at the tail to 1 at the head, so a trail grows from nothing to two
 * pixels at the body. Its alpha does the same, via
 * `mix(alphaFade, 1.0, indexU)`.
 */
export const TRAIL_WIDTH = { default: [0, 2], hover: [2, 4] }

/** `TrailComponent._alphaFade`'s default: the tail fades away completely. */
export const TRAIL_ALPHA_FADE = 0

/**
 * Trail length, and what is still needed for spacecraft.
 *
 * In Eyes a trail's `length` is a span of *seconds* of simulated time, and
 * `undefined` means "work it out": `TrailComponent._getAutoLength` derives the
 * body's orbital period from its state vector. Every planet, moon and dwarf
 * planet leaves it undefined, so every natural body's trail is exactly one
 * revolution — which is why a moon's trail closes into its complete ellipse.
 * `BodyPath` gets that for free by drawing the sampled ellipse itself.
 *
 * Explicit lengths appear only on spacecraft, and they are the reason this note
 * exists. Measured from the bundle:
 *
 *   Voyager 1            94608e4 s   30 years
 *   New Horizons         94608e3 s    3 years
 *   Parker Solar Probe  12942631 s   ~150 days, which is one revolution
 *
 * Voyager 1 also carries `lengthCoverages`, switching to 5 years before its
 * Jupiter encounter and to 60 days across each flyby, so the trail tightens
 * where the trajectory is interesting.
 *
 * A trail shorter than one revolution is the one case `BodyPath` cannot draw
 * today: it builds a closed ellipse and rotates the taper over it, so the arc is
 * always the whole orbit. Supporting a partial arc needs the sampled path to
 * cover `[now - length, now]` in *time* rather than a full turn in eccentric
 * anomaly, and the ribbon's `indexU` to span only the samples inside that
 * window. Worth doing when spacecraft arrive, and not before — a trajectory with
 * flybys is not an ellipse at all, so it will want a sampled path rather than
 * elements regardless.
 */
export const SPACECRAFT_TRAIL_SECONDS = {
  voyager1: 94608e4,
  newHorizons: 94608e3,
  parkerSolarProbe: 12942631,
}

/**
 * How a trail fades as the camera closes on the body it belongs to.
 *
 * `TrailComponent._determineComponentVisibility` multiplies two factors, and
 * both are here because between them they are the whole rule:
 *
 *     alpha *= visibleInterval.getFadeMultiplier(viewport, normalSpaceRadius)
 *     alpha *= clamp01(1000 * cameraDistance / distanceFromFrameOrigin)
 *
 * **The apparent-size factor.** `TrailComponent`'s interval is
 * `VisibleInterval(0, 0.02, "normal")` with `fadeBlur` 0.5, and `min` of 0 makes
 * the lower half unconditionally 1, so only the upper edge does anything:
 *
 *     clamp01((1 - r / 0.02) / 0.5 + 1)   ==   clamp01(3 - 100 * r)
 *
 * Full strength until `r` reaches 0.02, gone by 0.03. `r` is *normal-space*
 * radius, which Eyes defines as `radius / distance / tan(fov / 2)` — a fraction
 * of the half-height of the view at that distance, not of the whole viewport.
 * Getting that convention wrong is a factor of two in where the fade lands.
 *
 * Note this is the same shape as `ORBIT_LINE_FADE_PX` and a different mechanism:
 * an orbit line fades on the body's radius *in pixels*, a trail on its radius as
 * a fraction of the view. They are not interchangeable.
 *
 * **The frame-proximity factor.** `cameraDistance` is the camera-to-craft
 * distance and the divisor is the craft's distance from the origin of the frame
 * it is currently held in. The trail only begins to dim once the camera is
 * inside a thousandth of that — parked at the craft itself, where a trail
 * stretching off to the Sun would fill the shot with a line you are sitting on.
 *
 * Both factors are close-range. Neither thins the view from outside, because in
 * Eyes nothing needs to: its trails are the bounded time window described above,
 * so the whole-mission tangle this app draws never forms there.
 */
export const TRAIL_NEAR_FADE = { max: 0.02, blur: 0.5 }

/** The `1e3` in the frame-proximity factor above. */
export const TRAIL_FRAME_PROXIMITY = 1000

/**
 * Bodies that draw an orbit line instead of a trail.
 *
 * `TrailManager._orbitLineEntityNames`, which is
 * `Entity.getEntityNamesInGroup("planets").add("moon")` — the eight planets and
 * then, alone among the moons, Earth's. Eyes gives it the static ellipse in
 * Earth's own blue while every other satellite gets a trail, and it is the one
 * deliberate exception in the whole scheme.
 */
export const ORBIT_LINE_BODIES = new Set([
  'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
  'luna',
])

/** Whether `id` draws a static ellipse (true) or a trail (false). */
export function drawsOrbitLine(id) {
  return ORBIT_LINE_BODIES.has(id)
}

/**
 * The colour and alpha a body's path is drawn in.
 *
 * One place to ask, so the two tables and their two different fallbacks cannot
 * drift apart. Returns `[r, g, b, a]` with the channels in 0..1.
 */
export function pathColour(id, parentId = null, minor = false) {
  if (drawsOrbitLine(id)) {
    const rgb = ORBIT_LINE_COLOURS[id]
    return rgb
      ? [...rgb, ORBIT_LINE_ALPHA.primary]
      : // Earth's Moon is the only body that lands here, and it is worth being
        // exact about: it draws an orbit line, but `_colors` names only the
        // eight planets, so `_colors[name] ?? _colors.default` hands it the
        // *default* — white at `secondary` alpha, not Earth's blue. The blue in
        // its entity definition is a `trail.color`, and `createOrbitLine`
        // removes the trail component before it ever draws.
        [...DEFAULT_ORBIT_LINE_COLOUR, ORBIT_LINE_ALPHA.secondary]
  }

  /*
   * A moon not named in the table takes its parent's colour.
   *
   * This is not a guess standing in for a missing value — it is the rule the
   * table above is an expansion of, and Eyes applies it to every satellite it
   * has. Checked against the bundle rather than assumed: Sycorax and Caliban
   * carry `[.67,.92,1]`, which is Uranus's exactly; Naiad and Halimede
   * `[.48,.69,1]`, Neptune's; Themisto `[.95,.71,.64]`, Jupiter's; Phoebe
   * `[.72,.65,.52]`, Saturn's. Every one is the same literal its planet's major
   * moons carry, with no distinction between regular and irregular or between
   * major and minor.
   *
   * Derived rather than transcribed because the alternative is four hundred more
   * lines restating one fact. The explicit entries above stay as they are, so
   * the transcription of Eyes' own table remains checkable line by line, and
   * this only catches what that table never named.
   *
   * The dwarf planets still fall through to the default below, which is correct:
   * they genuinely specify no colour in Eyes and they have no parent to inherit
   * from either.
   */
  const rgb = TRAIL_COLOURS[id] ?? (parentId ? TRAIL_COLOURS[parentId] : null)
  return rgb
    ? [...rgb, minor ? MINOR_TRAIL_ALPHA : TRAIL_ALPHA]
    : [...DEFAULT_TRAIL_COLOUR, minor ? MINOR_TRAIL_ALPHA : DEFAULT_TRAIL_ALPHA]
}
