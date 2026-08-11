/**
 * The per-frame camera maths, kept free of React and Three's scene graph so it
 * can be reasoned about — and simulated — on its own.
 *
 * Everything here takes plain THREE.Vector3s and mutates them in place. No
 * allocation happens per call.
 */

import * as THREE from 'three'

const ORIGIN = new THREE.Vector3(0, 0, 0)

const _offset = new THREE.Vector3()
const _targetOffset = new THREE.Vector3()
const _correction = new THREE.Vector3()

/** Frame-rate independent exponential ease toward a target vector. */
export function dampVector(current, target, lambda, dt) {
  current.x = THREE.MathUtils.damp(current.x, target.x, lambda, dt)
  current.y = THREE.MathUtils.damp(current.y, target.y, lambda, dt)
  current.z = THREE.MathUtils.damp(current.z, target.z, lambda, dt)
  return current
}

/**
 * Translates the camera and its orbit target by however far the planet moved
 * since the last frame, and records the new position. Everything downstream
 * then gets to treat the planet as if it were standing still.
 *
 * `lastPlanetPos` is updated in place.
 */
function carryAlong(cameraPos, target, planetPos, lastPlanetPos) {
  const dx = planetPos.x - lastPlanetPos.x
  const dy = planetPos.y - lastPlanetPos.y
  const dz = planetPos.z - lastPlanetPos.z

  cameraPos.x += dx
  cameraPos.y += dy
  cameraPos.z += dz
  target.x += dx
  target.y += dy
  target.z += dz
  lastPlanetPos.copy(planetPos)
}

/**
 * Cubic ease, in and out. Still at both ends, quickest through the middle.
 *
 * The same curve `glideTo` scrolls the page with, deliberately: selecting a body
 * moves the camera and often the page too, and two different motion curves in
 * one gesture read as two separate things happening.
 */
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/**
 * Flies the camera to a viewpoint on a planet over a fixed duration.
 * Returns true on arrival.
 *
 * ## Why this is not exponential damping
 *
 * It was, and the whole flight was a lurch. Exponential damping closes a fixed
 * *fraction* of the remaining gap per second, so its velocity is proportional to
 * what is left: fastest at the instant you click and slowing from there. There
 * is no acceleration phase at all.
 *
 * Measured on Earth to Mars, a trip of about 54 world units, in units travelled
 * per fifth of a second:
 *
 *     27.86  13.86  6.77  3.32  1.64  0.80  0.40  0.19  0.10  0.05  0.02
 *
 * Over half the journey is gone in the first 0.2 s — before the eye has
 * registered that anything began — and the remaining two seconds are spent
 * creeping through a few percent. It arrives on schedule and reads as a cut.
 * The rate was even solved per trip so that every flight took the same time,
 * which made the opening jump *worse* for longer trips, not better.
 *
 * A fixed duration with an ease at both ends is what "flying there" means: the
 * camera pulls away, covers ground in the middle where the motion is legible,
 * and settles. It also arrives exactly, rather than asymptotically, so there is
 * no tolerance to tune and no standing lag to hand to the follow.
 *
 * ## What is preserved
 *
 * Carrying the camera by the planet's own motion first, which is what lets this
 * work at any orbital speed — see `carryAlong`. Everything below runs in the
 * planet's moving frame, so the ease is over a *relative* offset and the planet
 * can be doing whatever it likes meanwhile.
 */
export function stepFlightToPlanetEased({
  cameraPos,
  target,
  planetPos,
  lastPlanetPos,
  fromOffset,
  fromTargetOffset,
  desiredOffset,
  elapsed,
  duration,
}) {
  carryAlong(cameraPos, target, planetPos, lastPlanetPos)

  const t = duration > 0 ? Math.min(1, elapsed / duration) : 1
  const k = easeInOut(t)

  _offset.lerpVectors(fromOffset, desiredOffset, k)
  cameraPos.addVectors(planetPos, _offset)

  // The pivot converges on the planet on the same curve, so the shot does not
  // swing round separately from the approach.
  _targetOffset.copy(fromTargetOffset).multiplyScalar(1 - k)
  target.addVectors(planetPos, _targetOffset)

  return t >= 1
}

/** The overview trip, on the same curve. The destination does not move. */
export function stepFlightHomeEased({
  cameraPos,
  target,
  fromPos,
  fromTarget,
  homePos,
  elapsed,
  duration,
}) {
  const t = duration > 0 ? Math.min(1, elapsed / duration) : 1
  const k = easeInOut(t)

  cameraPos.lerpVectors(fromPos, homePos, k)
  _targetOffset.copy(fromTarget).multiplyScalar(1 - k)
  target.copy(_targetOffset)

  return t >= 1
}

/**
 * Keeps a parked camera framed on its planet.
 *
 * Two things happen. First the camera and the orbit target are translated by
 * the planet's own motion, which preserves whatever angle and zoom the user
 * chose — the view is being carried along, not steered. Then any residual gap
 * between the target and the planet is eased away, because the translation
 * alone can't fix a target that has already drifted (a pan moves it, and a
 * flight cancelled mid-air hands over wherever it had got to). Without that
 * second step the planet creeps toward the edge of frame and eventually leaves.
 *
 * `lastFollow` is updated in place to the planet's current position, and must
 * be the same vector the flight was carrying, so the handover is seamless.
 *
 * `deadzone` is the drift small enough to leave alone, and it has to be given
 * rather than assumed. It was a fixed 1e-4 world units, which is nothing at
 * diorama scale and enormous at true scale — a minor moon parks between 2.4e-4
 * and 2.7e-7 from the camera, so drift the recentring declined to correct could
 * be hundreds of times the whole framing distance, and the body would wander
 * out of shot and simply stay there. The caller passes a scale-relative length.
 */
export function stepFollow({
  cameraPos,
  target,
  planetPos,
  lastFollow,
  recentreLambda,
  dt,
  deadzone,
}) {
  carryAlong(cameraPos, target, planetPos, lastFollow)

  _targetOffset.subVectors(target, planetPos)
  if (_targetOffset.lengthSq() > deadzone * deadzone) {
    _correction.copy(_targetOffset)
    dampVector(_targetOffset, ORIGIN, recentreLambda, dt)
    // Move the camera by the same amount the target moved, so recentring
    // slides the view rather than swinging the camera around the planet.
    _correction.sub(_targetOffset)
    cameraPos.sub(_correction)
    target.addVectors(planetPos, _targetOffset)
  }
}
