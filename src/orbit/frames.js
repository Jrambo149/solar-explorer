/**
 * Reference frames and the scale warp.
 *
 * The orbital maths in `kepler.js` works in AU, because that is what the
 * physics is. But a scene drawn at true scale is almost entirely empty: Earth
 * would be 4.3e-5 AU across at 1 AU out, so at any zoom that fits the orbit,
 * the planet is a ten-thousandth of a pixel. That emptiness is honest — it is
 * genuinely what the solar system looks like — but it is not what anyone wants
 * to look at first.
 *
 * So position and size are warped on the way to the screen, and `scaleMode`
 * says how much:
 *
 *   scaleMode = 0   the diorama. Reproduces the layout this app has always had.
 *   scaleMode = 1   true scale, everything in proportion.
 *
 * Two properties make this work rather than merely function:
 *
 *  1. **The warp is radial.** Only the *length* of a position vector inside its
 *     frame changes; the direction is untouched. So an orbit stays a closed
 *     curve, inclinations stay correct, and a body's angular position around
 *     the Sun is always the real one — only its distance is compressed. The
 *     picture is never lying about *where* something is, only about how far.
 *
 *  2. **Frames nest.** A moon's position is warped inside its planet's frame,
 *     not the Sun's. Warping a 0.0026 AU lunar orbit with a curve tuned for
 *     Neptune's 30 AU would collapse it to nothing; each frame gets a curve
 *     suited to the distances it actually contains, and the two never interact.
 */

/** World units per AU at true scale. */
export const UNITS_PER_AU = 100

export const KM_PER_AU = 149597870.7

/** Semi-major axis of the outermost planet, for sizing the overview camera. */
const OUTER_AU = 30.07

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)

/* ---- distance ---- */

/**
 * The diorama curve, unchanged from the original `renderDistance`.
 *
 * The additive 9 is what opens up the middle of the scene: without it Mercury
 * sits almost on top of the Sun. The 0.55 exponent compresses the outer system
 * hard enough that Neptune stays on screen while the inner planets keep
 * visible gaps between them.
 */
const compressedSunDistance = (au) => 9 + 24 * au ** 0.55

/**
 * Heliocentric distance in world units.
 * @param {number} au distance from the Sun, AU
 * @param {number} scaleMode 0 = diorama, 1 = true scale
 */
export function warpSunDistance(au, scaleMode) {
  return lerp(compressedSunDistance(au), au * UNITS_PER_AU, clamp01(scaleMode))
}

/**
 * A heliocentric ecliptic position in AU → a world-space position.
 *
 * Does the whole trip: warp the radius, swap ecliptic Z-up for three.js Y-up.
 * Allocation-free, since this runs once per body per frame and again for every
 * vertex of every orbit line.
 */
export function warpHeliocentric(ecliptic, scaleMode, out = { x: 0, y: 0, z: 0 }) {
  const r = Math.hypot(ecliptic.x, ecliptic.y, ecliptic.z)
  // Scaling by a ratio rather than rebuilding from angles is what keeps the
  // direction bit-for-bit intact — no trig, no round trip through atan2.
  const k = r > 0 ? warpSunDistance(r, scaleMode) / r : 0

  out.x = ecliptic.x * k
  out.y = ecliptic.z * k
  out.z = -ecliptic.y * k
  return out
}

/**
 * Clearance a satellite system needs from its parent's surface, in parent
 * radii, when the parent has no rings.
 *
 * Enough that the innermost moon reads as orbiting rather than as a bump on
 * the planet, without pushing the whole system out.
 */
export const BARE_CLEARANCE = 1.35

/**
 * How much of a gap to leave outside a ring system.
 *
 * A ringed planet's moons have to start beyond the rings, and not because it
 * looks tidier: it is *checkable*. Enceladus really does orbit outside
 * Saturn's main rings — it is the source of the E ring — so drawing it inside
 * them would be a visible, falsifiable error rather than a matter of taste.
 * The clearance is therefore taken from where the rings are actually drawn.
 */
export const RING_CLEARANCE = 0.25

/**
 * Distance from a parent body, for moons, in world units.
 *
 * Expressed in *parent radii*, which is the unit a satellite system is
 * naturally described in — the Moon is 60 Earth radii out, Io is 6.
 *
 * The compressed curve is `clearance + 0.58·r^0.42`, which maps the Moon's 60
 * radii to under 5 and Callisto's 27 to about 3.6. That is a severe squeeze,
 * and it has to be: a system keeping even a quarter of Callisto's true
 * separation would reach far enough that Jupiter's and Saturn's moons tangled
 * at conjunction.
 *
 * The exponent is what earns its keep. Something that saturates — a log or an
 * exponential — flattens the Galileans into a single shell, and their spacing
 * is one of the most recognisable arrangements in the solar system. A shallow
 * power law keeps Io, Europa, Ganymede and Callisto in visibly separate lanes
 * while still pulling the far end in hard.
 *
 * The coefficient was 0.45 until `verify-bodies.mjs` measured the result: the
 * gap between Io's and Europa's lanes came out at 0.35 world units while the
 * moons themselves are 0.44 across, so the two would have overlapped on
 * screen. 0.58 opens the lanes past the width of the bodies in them, which is
 * the actual requirement — and is why that check asserts a ratio rather than
 * merely that the order is right.
 *
 * The exponent was 0.42 for as long as no system had more than four moons, and
 * four moons spanning 6 to 27 Jupiter radii is a gentle test. Saturn's seven
 * broke it: Enceladus and Tethys are only 1.24 apart in true distance, and at
 * 0.42 their lanes came out 0.157 units apart while the two bodies are 0.211
 * across — a permanent overlap at every conjunction. 0.53 widens exactly the
 * gaps that were too tight, because a higher exponent preserves more of the
 * *ratio* between neighbouring orbits, and leaves the well-separated pairs
 * roughly where they were.
 *
 * It costs a wider system all round: the Moon moves from 4.5 to 6.3 Earth radii
 * and Callisto's lane opens by about a fifth. The bound on it is the check that
 * Jupiter's and Saturn's systems cannot touch at conjunction — after the change
 * they occupy 20.5 of the 23.7 units between the two planets, so there is little
 * room left to spend and any further widening has to come out of moon *size*
 * instead. `MOON_SIZE_FACTOR` is where that was paid: 0.55 to 0.51, which is
 * what finally opened Enceladus and Tethys to 1.22x their combined width.
 *
 * @param {number} au distance from the parent, AU
 * @param {number} parentRadiusAU the parent's true radius, AU
 * @param {number} parentRenderRadius the parent's warped radius, world units
 * @param {number} clearance innermost orbit, in parent radii
 */
export function warpMoonDistance(
  au,
  parentRadiusAU,
  parentRenderRadius,
  clearance,
  scaleMode,
) {
  const trueRadii = au / parentRadiusAU
  const compressed = parentRenderRadius * (clearance + 0.58 * trueRadii ** 0.53)
  return lerp(compressed, au * UNITS_PER_AU, clamp01(scaleMode))
}

/**
 * The same warp, made **linear** below a reference distance.
 *
 * ## Why a spacecraft cannot use the curve above
 *
 * `warpMoonDistance` is strongly concave: it maps 6,600 km from Earth to 0.372
 * world units and 412,000 km to 3.330, so the near end is drawn seven times
 * further out, proportionally, than the far end. For a moon that is invisible —
 * a moon sits at one distance and never moves off that point on the curve. A
 * spacecraft trajectory sweeps three decades of radial range in a single pass,
 * and a curve that bends by 7x across that range bends the trajectory with it.
 * Measured over the fleet, 59 of 64 craft came out distorted by more than 2x and
 * the worst by 17x, which is why Artemis II's free return did not look like a
 * free return.
 *
 * The cause is the diorama drawing Earth 11.8x too large relative to its own
 * moon system. The curve has to lift satellites clear of that inflated sphere,
 * and all of that lifting happens at the near end.
 *
 * ## What this does instead
 *
 * Below `referenceAU` the mapping is a straight multiplication, so every
 * distance ratio inside it is exactly true and the shape of the path is Eyes'
 * shape. At and above `referenceAU` it is the original curve, unchanged. The two
 * agree exactly at the join, because the linear factor is defined as the curve's
 * own value there divided by the distance — so there is no seam to blend.
 *
 * `referenceAU` is the frame's satellite system: the outermost major moon, which
 * puts every encounter and every capture orbit inside the exact region. A craft
 * further out than that is on an approach or a departure, where the path is
 * nearly a straight line and the curve's bend does not read as a wrong shape.
 *
 * ## The cost, which is real
 *
 * A craft in low orbit is now drawn *inside* the planet's inflated sphere — at
 * diorama scale Earth's drawn radius is 0.63 world units and a 6,600 km orbit
 * maps to 0.055. That is the honest consequence of asking for true proportions
 * against a planet drawn twelve times too big, and it was chosen deliberately
 * over a bent trajectory. At true scale it does not arise: the warp is already
 * linear there, and this function reduces to it exactly.
 */
export function warpSpacecraftDistance(
  au,
  parentRadiusAU,
  parentRenderRadius,
  clearance,
  referenceAU,
  scaleMode,
  surfaceFloor = 0,
) {
  if (!(referenceAU > 0) || au >= referenceAU * JOIN_BAND) {
    return warpMoonDistance(au, parentRadiusAU, parentRenderRadius, clearance, scaleMode)
  }
  const atReference = warpMoonDistance(
    referenceAU,
    parentRadiusAU,
    parentRenderRadius,
    clearance,
    scaleMode,
  )

  /*
   * The floor, and why the mapping is affine rather than purely linear.
   *
   * A straight multiplication has exact proportions and one fatal problem: the
   * body it orbits is drawn far larger than its own satellite system. The Moon
   * is 0.186 world units across against a reference of 2.05, an inflation of
   * 5.4x, so LRO — which really does skim 106 km above the surface, 1.06 lunar
   * radii out — landed at 0.036 and was drawn *inside* the Moon. Invisible.
   * Every close orbiter has the same problem, and it is the whole reason
   * `warpMoonDistance` has a clearance term in the first place; the linear
   * branch threw that term away.
   *
   * So the near end is lifted clear of the surface and the rest scales from
   * there. The two ends still meet the curve exactly at `referenceAU`.
   *
   * What this costs is proportion on *eccentric* orbits, and only those. A
   * circular orbit has one radius, so adding a constant to it leaves a circle of
   * the same shape in the same place — LRO, Danuri, Odyssey, MRO and TGO are all
   * near-circular and come through untouched. An ellipse gets rounder, because
   * its near end is lifted more, proportionally, than its far end.
   *
   * At true scale this does not arise: `scaleMode` 1 makes `warpMoonDistance`
   * linear and the floor is scaled away with everything else.
   */
  const floor = surfaceFloor * (1 - clamp01(scaleMode))
  if (floor <= 0 || floor >= atReference) {
    return joinToCurve(
      au * (atReference / referenceAU),
      au,
      parentRadiusAU,
      parentRenderRadius,
      clearance,
      referenceAU,
      scaleMode,
    )
  }

  /*
   * Added in quadrature rather than straight, so the floor fades out.
   *
   * A plain offset — `floor + au * k` — lifts everything by the same amount, and
   * on a large frame that amount is not small: Earth's drawn radius is 22% of
   * the Moon's drawn distance, so a constant lift threw the Earth frame's
   * proportions out by a fifth and bent OSIRIS-REx's launch leg 33x. The floor
   * is only needed where a craft would otherwise be swallowed by the body, and
   * it should stop mattering once it is clear of it.
   *
   * `hypot` does exactly that. Near the surface the floor dominates and the
   * craft is lifted clear; far from it the linear term dominates and the
   * proportions are the true ones, approaching them as the square of the ratio
   * rather than linearly. `k` is solved so the two still meet the curve exactly
   * at `referenceAU`.
   */
  const k = Math.sqrt(atReference * atReference - floor * floor) / referenceAU
  return joinToCurve(
    Math.hypot(au * k, floor),
    au,
    parentRadiusAU,
    parentRenderRadius,
    clearance,
    referenceAU,
    scaleMode,
  )
}

/**
 * How far past `referenceAU` the linear branch is faded into the curve.
 *
 * ## Why there is a fade at all
 *
 * The two branches were made to agree in *value* at the join, which is enough
 * for a moon — a moon sits at one distance and never sees the other side. It is
 * not enough for a trajectory that crosses it. They do not agree in *slope*:
 * measured in Jupiter's frame the radial scale runs at 303 world units per AU
 * just inside the join and 165 just outside, a factor of 1.83, so a path
 * crossing it is bent through a fixed angle at the crossing.
 *
 * That is a corner in the mapping, not in the data, and it behaves like one.
 * Juno crosses the join four times inside its trail window and came out with a
 * 15° joint that did not move at 256, 512, 1024 or 2048 points — while every
 * other craft halved its worst joint with each doubling, exactly as resolution
 * should. A defect that ignores resolution is a discontinuity, and no amount of
 * resampling was ever going to touch it.
 *
 * ## Why the fade goes outward
 *
 * Everything the linear branch exists for is *inside* the join: true
 * proportions across a satellite system, which is where encounters and capture
 * orbits happen. So the region below `referenceAU` is left exactly as it was and
 * the blend is spent above it, where the curve's own concavity already means the
 * shape is approximate. A craft that never leaves the satellite system is
 * unaffected, and so is one that never enters it.
 *
 * 1.6 is chosen from both ends. Narrower concentrates the whole 1.83x slope
 * change into less room, and the blend's own bend becomes the new corner —
 * pushed far enough it also turns the mapping non-monotonic, which would fold
 * space back on itself. Wider spreads it more gently but takes the departure
 * from the curve further out than it needs to go.
 */
const JOIN_BAND = 1.6

/**
 * Fades the linear branch's `value` into the curve across the join band.
 *
 * Smoothstep rather than a straight lerp, and that is the whole point: its
 * derivative is zero at both ends, so the result meets the linear branch at
 * `referenceAU` and the curve at `referenceAU * JOIN_BAND` in slope as well as
 * in value. A plain lerp would remove one corner by creating two smaller ones.
 */
function joinToCurve(
  value,
  au,
  parentRadiusAU,
  parentRenderRadius,
  clearance,
  referenceAU,
  scaleMode,
) {
  if (au <= referenceAU) return value
  const t = (au / referenceAU - 1) / (JOIN_BAND - 1)
  const w = t * t * (3 - 2 * t)
  const curve = warpMoonDistance(au, parentRadiusAU, parentRenderRadius, clearance, scaleMode)
  return value + (curve - value) * w
}

/* ---- size ---- */

const EARTH_RADIUS_KM = 6371

/** The diorama size curve, unchanged from the original `renderRadius`. */
const compressedRadius = (km) => Math.min(2.9, Math.max(0.4, 0.63 * (km / EARTH_RADIUS_KM) ** 0.42))

/** A body's rendered radius in world units. */
export function warpRadius(km, scaleMode) {
  return lerp(compressedRadius(km), (km / KM_PER_AU) * UNITS_PER_AU, clamp01(scaleMode))
}

/**
 * A satellite's rendered radius. Same curve, lower floor and a size penalty.
 *
 * Moons need their own treatment because `compressedRadius` bottoms out at
 * 0.4 world units, and that floor exists to stop Mercury vanishing. Applied to
 * a moon it is absurd: Phobos is 11 km across and would come out the same size
 * as Mercury, and larger than Mars, the planet it is orbiting.
 *
 * The size factor is the other half. Run through the planet curve unmodified,
 * the Moon lands at 58% of Earth's drawn width against a true 27%, and the
 * pair reads as a double planet. Multiplying moons down restores the sense
 * that they are the smaller partner while leaving them comfortably visible.
 *
 * It was 0.55 until Saturn's seven arrived. Enceladus and Tethys sit so close
 * that no affordable amount of extra lane spacing separated them — see the note
 * on the exponent in `warpMoonDistance` — so the last 8% came out of size
 * instead. Every moon is 8% smaller than it was, and the tightest pair in the
 * app now clears by 22%.
 */
const MOON_SIZE_FACTOR = 0.51

/**
 * Smallest radius a moon may be drawn at, and why it came down.
 *
 * It was 0.08, set so Phobos stayed visible when the smallest moons in the app
 * were Phobos and Deimos. Pluto's four small moons made that untenable: Styx,
 * Nix, Kerberos and Hydra all fall on this floor, and their lanes are only
 * 0.095 units apart — the tightest packing anywhere here, because the four span
 * a true distance ratio of just 1.5 from end to end. At 0.08 they overlapped
 * permanently rather than merely at conjunction.
 *
 * 0.03 clears them, and it is a better number on its own terms. The floor is a
 * visibility fudge, and at 0.08 it was drawing Phobos at 17% of Mars's width
 * against a true 0.33% — fifty times oversized. At 0.03 it is still twelve times
 * oversized, which is the honest cost of being able to see an 11 km rock at all.
 *
 * Visibility does not rest on this anyway: `LabelLayer` draws a screen-space
 * marker for every body, so a moon too small to resolve is still labelled and
 * still clickable.
 */
const MOON_MIN_RADIUS = 0.03

export function warpMoonRadius(km, scaleMode) {
  const curve = 0.63 * (km / EARTH_RADIUS_KM) ** 0.42
  const compressed = Math.max(MOON_MIN_RADIUS, Math.min(2.9, curve) * MOON_SIZE_FACTOR)
  return lerp(compressed, (km / KM_PER_AU) * UNITS_PER_AU, clamp01(scaleMode))
}

/**
 * The Sun is hand-sized rather than curve-sized.
 *
 * `compressedRadius(696000)` clips at the 2.9 ceiling along with Jupiter, which
 * would leave the star the same size as a planet. 3.6 is the value the scene
 * has always used: unmistakably the largest object present without dominating
 * the overview.
 */
export function warpSunRadius(scaleMode) {
  return lerp(3.6, (696340 / KM_PER_AU) * UNITS_PER_AU, clamp01(scaleMode))
}

/* ---- camera ---- */

/**
 * Every distance the camera cares about, derived from the current scale.
 *
 * These were previously literals in `CameraController.jsx` — `minDistance
 * 0.35`, `maxDistance 900`, a hardcoded home position, and snap thresholds
 * built from `Math.max(38, radius * 30)`. All of them silently assumed
 * scaleMode 0. Gathering them here means exactly one module knows what a world
 * unit is worth.
 */
export function cameraLimits(scaleMode) {
  const outer = warpSunDistance(OUTER_AU, scaleMode)
  /*
   * Aegaeon, at 0.12 km the smallest body drawn.
   *
   * Was Mercury, which left the near limit sitting almost exactly where a
   * close-up of the smallest moon parks — the camera would have arrived clamped,
   * a few hundredths of a unit from where it was asked to be, which reads as the
   * flight simply stopping short. Then Phobos, then Styx at 5.2 km when Pluto's
   * moons arrived, and now one of Uranus's unnamed irregulars.
   *
   * Saturn's arrival moved it by a factor of forty. Aegaeon is 240 metres
   * across, orbits inside the G ring, and is there because it is the source of
   * the ring — so it is not a rounding error in the roster, it is one of the few
   * bodies in the app doing something visible. Several of its neighbours are
   * one or two kilometres.
   *
   * The title will keep moving downward: a minor moon's size is worked out from
   * how bright it is, and the ones still being found are the faint ones.
   *
   * A literal rather than a scan over `BODIES`, because `bodies.js` imports this
   * module and the cycle would be worse than the duplication. `verify-bodies.mjs`
   * asserts that nothing in the registry is smaller, so an addition that takes
   * the title fails loudly instead of quietly clamping.
   */
  const smallest = warpMoonRadius(0.0005, scaleMode)

  return {
    /** Closer than this and OrbitControls would let you through the surface. */
    minDistance: smallest * 0.55,
    /**
     * Comfortably outside Neptune, without letting the system shrink to a dot.
     *
     * Eris reaches 97.7 AU at aphelion, well past the 30 AU this is built
     * from, and that is fine: the multiplier leaves room for it. The limit is
     * about keeping the *view* usable, not about bounding the contents.
     */
    maxDistance: outer * 5.5,
    /**
     * Overview distance. 1.6x Neptune's orbit frames the whole planetary
     * system — which is what "the solar system" means to most people, and the
     * right thing to open on. The scattered dwarfs sit outside it and have to
     * be zoomed out to, exactly as they do in reality.
     */
    homeDistance: outer * 1.6,
  }
}

/**
 * The overview camera's direction — an angled three-quarter view, well above
 * the ecliptic so the orbits read as ellipses rather than as a single line.
 * Normalised from the original `[0, 132, 228]`.
 */
export const HOME_DIRECTION = [0, 0.5017, 0.8650]

export function homeCameraPosition(scaleMode) {
  const { homeDistance } = cameraLimits(scaleMode)
  return HOME_DIRECTION.map((c) => c * homeDistance)
}

/**
 * How big a body has to look before zooming in snaps onto it.
 *
 * An angular size rather than a distance in world units, which cannot survive a
 * variable scale — and was subtly wrong even at a fixed one. The old code
 * acquired a planet inside `max(38, r*30)` and released it beyond
 * `max(30, r*42)`; for Earth that is acquire-within-38, release-beyond-30, so
 * the release threshold sat *inside* the acquire threshold. That is inverted
 * hysteresis, and only the 700 ms cooldown was stopping it from chattering.
 *
 * Angular size is scale-invariant by construction and matches what the user is
 * actually judging: "that is big enough to be worth looking at".
 */
export const SNAP_ACQUIRE_DEG = 2.2

/**
 * How far out the selection survives, as a multiple of the parked distance.
 *
 * Measured against the shot rather than as an angle of its own, because that is
 * the question being asked: not "how big is it" but "have we left". Multiples of
 * `focusDistance` say that directly, and they follow a body that parks further
 * out for its rings without needing a second number.
 *
 * The angular version of this released at 1.4°, which sounds small and is: it
 * works out at **24x the parked distance** for every body, so the title, the
 * scroll hint and the rest of a body's chrome stayed up until the camera was
 * most of the way back to the system view. 7x lets go about three and a half
 * times sooner, at roughly where the body stops being the subject of the shot.
 *
 * Still a wide dead band against `SNAP_ACQUIRE_DEG`, which fires at about 15x
 * parked — release happens *closer* than acquire, so the two cannot chatter.
 */
export const SNAP_RELEASE_FACTOR = 7

/** Angular diameter of a sphere of `radius` seen from `distance`, in degrees. */
export function angularSizeDeg(radius, distance) {
  if (distance <= radius) return 180
  return 2 * Math.asin(radius / distance) * (180 / Math.PI)
}

/**
 * Far plane for the given scale.
 *
 * With `logarithmicDepthBuffer` enabled the far plane costs almost nothing in
 * precision, so this is generous — it is what leaves room for the star sphere,
 * and later for the galaxy, without a second camera.
 */
export function farPlane(scaleMode) {
  return cameraLimits(scaleMode).maxDistance * 40
}

/**
 * The near plane as a fraction of how far the camera is from what it is on.
 *
 * Small enough that the subject is never anywhere near being clipped — a body
 * parks at `FOCUS_RADII` = 3.4 of its own radii, so at this fraction the near
 * plane sits at 0.17 of that radius, and the globe fills a quarter of the frame
 * with the plane a long way in front of it. Large enough that the far:near
 * ratio stays inside what the depth buffer can resolve at every distance the
 * camera can actually be.
 */
const NEAR_FRACTION = 0.05

/**
 * Near plane, sized from where the camera actually is.
 *
 * ## Why not a constant
 *
 * A fixed 0.001 was the original, and at true scale it is enormous: a
 * one-kilometre body is 6.7e-7 world units across and Aegaeon is 8.0e-8, so the
 * camera was allowed to fly thousands of times closer than it could see and
 * every small body was clipped away on arrival. Anything under about 39 km of
 * radius could never reach even twenty pixels.
 *
 * ## Why not the smallest body either
 *
 * The first fix tied it to `minDistance` — the closest approach to the smallest
 * body in the app — giving 2.2e-8 at true scale and a far:near ratio of 3e13.
 * That fixed the close-ups and broke everything distant: **the orbit lines and
 * trails came out dashed**, whole quads missing at regular intervals, right
 * across the scene. It was not the depth *test* (turning it off changed
 * nothing), not the mitre maths (clean in float32), and not sub-pixel coverage
 * (a 6 px ribbon dashed identically). It was the ratio. Measured by stepping it
 * against a lit-pixel count, the render is clean to 1e9 and drops at 1e10.
 *
 * The mistake was thinking a logarithmic buffer is ratio-proof. It spreads
 * precision evenly across the *decades*, which is not the same as having enough
 * of it: pushing the near plane down by five more decades spends resolution the
 * distant geometry needed.
 *
 * ## What it does instead
 *
 * Tracks the camera. Precision in a log buffer is best close to the near plane,
 * so putting the plane a fixed fraction of the way to the subject keeps the
 * interesting geometry — which is always near the camera — in the well-resolved
 * part of the range, and keeps the ratio modest wherever paths are on screen.
 * Parked at the overview it is about 1e4; parked at a planet, under 1e9.
 *
 * It goes back over 1e9 only when parked on a sub-kilometre body at true scale,
 * where the ratio is meaningless: the only path in frame is that body's own
 * trail, a few of its own radii away and therefore in the best-resolved part of
 * the buffer. The dashing was always distant geometry seen past a tiny near
 * plane, which is exactly the case this removes.
 *
 * `distance` is the camera's distance to what it is looking at. Callers pass
 * the live value every frame; the fallback keeps the mount-time call honest
 * before any camera exists.
 */
export function nearPlane(scaleMode, distance) {
  const d = distance > 0 ? distance : cameraLimits(scaleMode).homeDistance
  return d * NEAR_FRACTION
}

/**
 * Shorter than this and a camera offset is noise rather than a direction.
 *
 * The camera code has several "is this vector effectively zero" guards, which
 * exist so that normalising an offset cannot produce garbage when the camera
 * and its subject are on top of each other. They were written as absolute
 * world lengths — 1e-3 and 1e-6 — and that is the same mistake `nearPlane`
 * fixes: a world length means completely different things at the two scales.
 *
 * At diorama they were unreachable. The camera can never approach closer than
 * `minDistance` = 0.0165, so an offset was always far longer than either
 * threshold and the guards never fired — they were dead code protecting
 * against an impossible state.
 *
 * At true scale they came alive and started firing on correct input. A minor
 * moon parks 2.4e-4 (Phoebe) to 2.7e-7 (Aegaeon) from the camera, all of it
 * below the 1e-3 the approach guard treats as zero — so flying between minor
 * moons threw the real approach direction away and substituted a canned angle,
 * whipping the camera to a fixed side on every hop.
 *
 * Tying it to `minDistance` restores the property the absolute numbers were
 * reaching for: a legitimate offset is never shorter than the closest the
 * controls allow, so a thousandth of that is unambiguously degenerate at any
 * scale, and is still eleven orders of magnitude above float64 epsilon.
 */
export function degenerateLength(scaleMode) {
  return cameraLimits(scaleMode).minDistance * 1e-3
}
