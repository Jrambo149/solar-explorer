import * as THREE from 'three'
import { poleDirection } from './pole.js'

/**
 * How the split view frames the body it is about.
 *
 * Plain module, no React and no scene-graph imports, following the
 * `followMath.js` precedent — the numbers here decide whether a planet is
 * cropped, and that is worth being able to check headlessly at every window
 * shape rather than by dragging a browser window about. `scripts/verify-framing.mjs`
 * imports this file directly.
 *
 * Ring radii are passed in rather than imported: `RING_PRESETS` lives in
 * `Rings.jsx` and a `.jsx` file cannot be loaded by Node. Same arrangement
 * `satelliteFrame.js` uses, for the same reason.
 */

/**
 * How far right the shot slides, as a fraction of the viewport width.
 *
 * Puts the body's centre at 72% across: clear of the text column, and far
 * enough from the right edge that a large disc keeps its limb in frame.
 *
 * Read by `ViewFraming`, which does the sliding, and by the distance maths
 * below, which has to know how much room is left to the right of the body. The
 * two would silently disagree if this were written down twice.
 */
export const SIDE_SHIFT = 0.22

/**
 * How much of the viewport's *height* a globe should span.
 *
 * 0.56 is not a fresh guess: it is the fraction a ringless body already covers
 * when parked at `FOCUS_RADII`, so a user who never touched the zoom sees the
 * framing they always saw.
 */
export const SPLIT_FRAME_FRACTION = 0.56

/**
 * The same, for the outer edge of a ring system, and deliberately much larger.
 *
 * Framing Saturn's rings as though they were the globe pushes the camera out to
 * eight radii and leaves the planet a quarter the height Earth gets —
 * technically fitting, visibly a smaller subject. Letting the rings run wider
 * brings it back to about a third, which is as close as the two can be
 * reconciled: you cannot have all of Saturn's rings *and* a globe the size of
 * Earth's.
 */
export const RINGED_FRAME_FRACTION = 0.76

/** Fraction of the room right of the body that its widest point may use. */
const SIDE_MARGIN = 0.88

/**
 * Distance at which this body is comfortably framed for the split view.
 *
 * The visible world height at distance d is `2·d·tan(fov/2)`, so something of
 * radius R covers `R / (d·tan(fov/2))` of it — invert for d. Width is the same
 * with an extra factor of the aspect ratio.
 *
 * Three constraints, and the binding one wins:
 *
 *  1. the globe fills `SPLIT_FRAME_FRACTION` of the height;
 *  2. any rings stay inside `RINGED_FRAME_FRACTION` of it;
 *  3. the widest point fits the room left to the *right* of the body.
 *
 * The third is the one that is easy to forget and the only one that fails
 * loudly. `SIDE_SHIFT` moves the body to 72% across, so it has 28% of the width
 * to its right rather than 50% — and that room shrinks with the aspect ratio,
 * which the height-based numbers know nothing about. Left out, Saturn's rings
 * ran 22% past the right edge of a 901x1180 window while every 16:9 shape
 * looked perfect.
 */
export function splitFramingDistance({ radius, ringOuter = 1, fovDegrees, aspect }) {
  const tanHalfFov = Math.tan((fovDegrees * Math.PI) / 180 / 2)
  const widest = radius * ringOuter

  const byGlobeHeight = radius / (SPLIT_FRAME_FRACTION * tanHalfFov)
  const byRingHeight = ringOuter > 1 ? widest / (RINGED_FRAME_FRACTION * tanHalfFov) : 0

  // Room to the right of the body, as a fraction of half the frame width.
  const roomRight = 2 * SIDE_MARGIN * (0.5 - SIDE_SHIFT)
  const byWidth = widest / (roomRight * tanHalfFov * Math.max(aspect, 0.05))

  return Math.max(byGlobeHeight, byRingHeight, byWidth)
}

/* ---- where the camera looks from ---- */

/**
 * Angle off the sunlight for a presented shot.
 *
 * The visible lit fraction of a sphere is `(1 + cos θ) / 2`, so 44° leaves the
 * disc ~86% lit: the whole face reads as photographic, with the terminator kept
 * as a thin shaded crescent along one limb for depth. (At 75° the disc was only
 * ~63% lit, which is what made close-ups look like half a planet.)
 */
export const SHOT_THETA = (44 * Math.PI) / 180

/**
 * How far the shot lifts out of the plane of the sunlight, to show some pole.
 *
 * An explicit elevation, not a nudge, and that distinction was a bug. It used
 * to be `perp += 0.38 * up`, renormalised — which lifts an equatorial viewpoint
 * by exactly this much, and does almost nothing to one that was already looking
 * up from underneath. Approach a planet from below and the "3/4 view showing
 * the pole" was a 3/4 view showing the *south* pole, still tilted away. Setting
 * the elevation outright makes the shot the same every time.
 *
 * `atan(0.38)` rather than a round number so the common case is unchanged: for
 * an approach in the plane of the sunlight this produces exactly the vector the
 * old nudge did.
 */
export const SHOT_TILT = Math.atan(0.38)

const DEG = Math.PI / 180

/**
 * How high above the moon plane the system shot sits.
 *
 * 32° is Saturn's, and Saturn is the reference on purpose: it is the system the
 * old shot happened to frame well, and the one worth reproducing everywhere.
 *
 * The point of fixing it is that the old shot did not fix it. That direction is
 * built from the *sunlight* — 44° off it, lifted — so how high above a moon
 * plane it lands is an accident of where the planet is in its orbit and which
 * way its axis leans. Measured across 2026 it gave Saturn 30–34°, Neptune 34°
 * and Pluto 38°, but Jupiter and Earth only 14°, near enough edge-on that the
 * orbits collapse into overlapping slivers. Mars was the case that settles it:
 * 38° at one point in its year and 2.4° at another. Same planet, same control,
 * flat one season and angled the next.
 *
 * Pinning the elevation to the plane rather than to the sunlight makes the shot
 * a property of the system being framed, so `Moons` means one thing wherever it
 * is clicked and whenever.
 *
 * A pole-on shot — which this was briefly — is the other defensible answer, and
 * it is the wrong one: circles are easier to read than ellipses, but they cost
 * every sense of the system being a disc in space rather than a diagram, and
 * the planet at the centre goes half dark because the shot is then square to
 * the sunlight.
 */
export const SYSTEM_PLANE_ELEVATION = 32 * DEG

/**
 * A shot looking across a body's moon system at a fixed angle to its plane.
 *
 * The default framing is built around the *body*: 44° off the sunlight and
 * lifted, which is the angle that makes a globe look like a globe. It is the
 * wrong reference for a system, because it says nothing about where the moons
 * actually are — see `SYSTEM_PLANE_ELEVATION` for what it produced.
 *
 * So the shot is built from the orbit plane instead, and where that plane sits
 * is not a matter of taste: all but one set of moons orbit in their parent's
 * *equatorial* plane, so the normal is the planet's own pole — read from
 * `pole.js`, the same source `satelliteOffset` builds its basis from, so the
 * plane the shot is measured against and the plane the moons are placed in
 * cannot disagree. Earth's Moon is the exception and tracks the ecliptic.
 *
 * Uranus is what makes the difference visible: its axis lies 98° over, so its
 * moons orbit in a plane almost perpendicular to everything else's. Under the
 * old shot that put it at 13–16° — nearly edge-on, and nothing like the face-on
 * view it is usually seen in. It now gets the same 32° every other system does,
 * measured against its own plane rather than against the ecliptic.
 *
 * Two free choices remain, and both are spent on the picture rather than left
 * arbitrary: the azimuth leans toward the Sun, so the planet at the centre is
 * lit rather than a crescent, and the side of the plane is taken from wherever
 * the camera already was — so clicking `Moons` never swings the long way round
 * to look at the same disc from the other face.
 */
export function systemFramingDirection(parent, moons, planetPos, approach, out) {
  if ((moons[0]?.plane ?? 'equator') === 'ecliptic') out.set(0, 1, 0)
  else {
    // The parent's pole, which is the normal of the plane its moons orbit in.
    const pole = poleDirection(parent.id)
    out.set(pole.x, pole.y, pole.z)
  }
  out.normalize()

  /*
   * Which face of the plane to look at, and why it is not simply "the one the
   * camera is already on".
   *
   * It was, and that is the right answer while the two faces are lit alike:
   * clicking `Moons` should not swing the long way round to see the same disc
   * from behind. But once the poles became real, a system can be tipped nearly
   * *at* the Sun — Pluto is, right now, and Uranus is every 42 years — and then
   * the two faces are not alike at all. One is the summer hemisphere and the
   * other is in polar night, the in-plane lean has almost nothing left to
   * correct with, and honouring the approach hands you a planet 48% lit. That
   * was a real regression, caught by `verify-bodies` the moment the poles were
   * right, and it is not a hypothetical either: it is what "moons of Pluto"
   * would have shown for the rest of this decade.
   *
   * So the approach only decides it while the pole is well off the Sun line.
   * Within 40° of it the Sun decides instead, which is exactly the range where
   * the swing is short and the lighting difference is total.
   */
  const toSun = new THREE.Vector3().copy(planetPos).negate().normalize()
  const alongSun = out.dot(toSun)
  if (Math.abs(alongSun) > Math.cos(40 * DEG)) {
    if (alongSun < 0) out.negate()
  } else if (out.dot(approach) < 0) out.negate()

  /* The direction to lean, within the orbit plane: toward the Sun. The
     fallbacks are for a system whose pole points at the Sun — Uranus at
     solstice, which is a real configuration and not a hypothetical. */
  const lean = new THREE.Vector3().copy(toSun)
  lean.addScaledVector(out, -lean.dot(out))
  if (lean.lengthSq() < 1e-8) lean.copy(approach).addScaledVector(out, -approach.dot(out))
  if (lean.lengthSq() < 1e-8) lean.set(0, 1, 0).cross(out)
  if (lean.lengthSq() < 1e-8) lean.set(1, 0, 0).cross(out)
  lean.normalize()

  return out
    .multiplyScalar(Math.sin(SYSTEM_PLANE_ELEVATION))
    .addScaledVector(lean, Math.cos(SYSTEM_PLANE_ELEVATION))
    .normalize()
}

/* Scratch for `framingDirection`, which runs every frame. Module scope is safe:
   only one `CameraController` is ever mounted, and nothing else calls it. */
const _sun = new THREE.Vector3()
const _perp = new THREE.Vector3()
const _up = new THREE.Vector3()
const _side = new THREE.Vector3()
const _tmp = new THREE.Vector3()

/**
 * The canonical viewpoint for a body: front-lit, and lifted to show the pole.
 *
 * Used twice, and it has to be the same maths both times — once by the flight
 * that brings you in, and once by the split view, which eases the camera back
 * to this angle as the page scrolls so the portrait does not inherit whatever
 * the last drag happened to leave. Before that, a body dragged to edge-on or
 * lit from behind stayed that way in the dossier, which is not a portrait.
 *
 * `approach` is the direction the camera is currently on, and it is respected
 * to the extent that it decides *which side* the result lands on. So the shot
 * standardises the angle to the Sun and the elevation without whipping the
 * camera round to a canned azimuth.
 *
 * `planetPos` is the body's world position, and the Sun's being at the origin
 * is what makes this cheap: the direction to the light is just the negated
 * position.
 */
export function framingDirection(planetPos, approach, out) {
  _sun.copy(planetPos).negate().normalize()

  /*
   * A frame for the plane perpendicular to the sunlight: `_up` is north within
   * it, `_side` is east. Everything below is built in this frame rather than by
   * nudging the user's vector, which is what makes the elevation exact.
   *
   * Working in this plane, rather than lifting the finished direction, is also
   * what keeps the lighting intact: tilting the result would change its angle
   * to the Sun and undo the 44° the whole thing is for.
   */
  _up.set(0, 1, 0)
  _up.addScaledVector(_sun, -_up.dot(_sun))
  if (_up.lengthSq() < 1e-8) {
    // Sunlight running straight up the world axis — no meaningful "north" in
    // this plane. Cannot happen for a body anywhere near the ecliptic, but a
    // NaN here would be a black screen.
    _up.copy(_tmp.set(1, 0, 0).cross(_sun))
    if (_up.lengthSq() < 1e-8) _up.set(0, 0, 1)
  }
  _up.normalize()
  _side.crossVectors(_up, _sun).normalize()

  /*
   * The user's approach survives as one bit: which side of the body they were
   * on. That is enough to stop the camera whipping around to a canned azimuth
   * when they scroll, while the angle to the Sun and the elevation become the
   * shot's rather than theirs.
   */
  _perp.copy(approach).addScaledVector(_sun, -approach.dot(_sun))
  const east = _perp.dot(_side)
  const sign = east < 0 ? -1 : 1

  _perp
    .copy(_side)
    .multiplyScalar(sign * Math.cos(SHOT_TILT))
    .addScaledVector(_up, Math.sin(SHOT_TILT))

  return out
    .copy(_sun)
    .multiplyScalar(Math.cos(SHOT_THETA))
    .addScaledVector(_perp, Math.sin(SHOT_THETA))
    .normalize()
}
