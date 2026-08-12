/**
 * Which way a spacecraft faces.
 *
 * Transcribed from Eyes on the Solar System's `AlignController`, and kept free
 * of React and the scene graph for the same reason `followMath.js` is: an
 * orientation that is subtly wrong looks like a modelling choice rather than a
 * bug, so it has to be checkable as a number.
 *
 * ## The rule
 *
 * A spacecraft's attitude is two constraints, not one. The **primary** aims a
 * chosen model axis at something — the high-gain antenna at Earth, the thruster
 * along the velocity vector — and that fixes two of the three degrees of
 * freedom. The craft is still free to roll about that axis, and the
 * **secondary** spends that last freedom: it twists until a second model axis
 * comes as close as it can to a second direction, which is almost always the
 * Sun, because that is where the solar panels have to look.
 *
 * Eyes' own solve, from `AlignController._update`:
 *
 *     i = base * primaryAxis                  the aimed axis, in world
 *     r = rotationFromTo(i, primaryDir)        swing it onto the target
 *     t = r * base                             primary solved
 *
 *     a = t * primaryAxis                      (== primaryDir)
 *     l = t * secondaryAxis                    where the second axis landed
 *     c = angleAround(l -> secondaryDir, a)    the roll still available
 *     t = axisAngle(a, c) * t                  spend it
 *
 * `base` is the model's own axis correction, and its place in that first line is
 * load-bearing: Eyes gives the axes in the model's *authored* space, so the
 * correction has to be applied to the axis before it is aimed, not to the result
 * afterwards. Swap the order and every craft with a correction — forty of the
 * seventy-five — points somewhere plausible and wrong.
 *
 * ## What the secondary cannot do
 *
 * Nothing, if the two directions are parallel: the roll is undefined and the
 * craft keeps whatever roll the primary left it with. That is the correct
 * answer rather than a degenerate one — when the Sun is directly behind Earth
 * there is no roll that favours the panels — and it is why the angle is taken
 * about the primary axis rather than by a second shortest-arc rotation, which
 * would break the primary aim to satisfy the secondary.
 */

import * as THREE from 'three'

const _aimed = new THREE.Vector3()
const _primary = new THREE.Vector3()
const _secondary = new THREE.Vector3()
const _swing = new THREE.Quaternion()
const _twist = new THREE.Quaternion()
const _projected = new THREE.Vector3()
const _target = new THREE.Vector3()
const _cross = new THREE.Vector3()

/**
 * The rotation to apply *outside* the axis correction, given the two aims.
 *
 * `primaryDir` and `secondaryDir` are unit vectors in world space; either may be
 * null, and a null primary means there is nothing to solve and the craft keeps
 * its corrected attitude.
 *
 * Returns `out`, which is the quaternion for the group that wraps the corrected
 * model — so the full orientation is `out * correction`, matching Eyes' `t`.
 */
export function aimQuaternion(correction, aim, primaryDir, secondaryDir, out) {
  out.identity()
  if (!aim || !primaryDir) return out

  // The aimed axis, carried through the correction into world space.
  _aimed.fromArray(aim.primary.axis).applyQuaternion(correction)
  _swing.setFromUnitVectors(_aimed, primaryDir)
  out.copy(_swing)

  if (!aim.secondary || !secondaryDir) return out

  // Where the two axes ended up after the swing.
  _primary.fromArray(aim.primary.axis).applyQuaternion(correction).applyQuaternion(out)
  _secondary.fromArray(aim.secondary.axis).applyQuaternion(correction).applyQuaternion(out)

  /*
   * The roll, measured about the primary axis.
   *
   * Both the secondary axis and its target are projected onto the plane
   * perpendicular to the primary before the angle is taken — that is what
   * `angleAroundAxis` means, and doing it with a plain `angleTo` instead gives
   * the angle in three dimensions, which is not a roll and cannot be applied as
   * one.
   */
  _projected.copy(_secondary).addScaledVector(_primary, -_secondary.dot(_primary))
  _target.copy(secondaryDir).addScaledVector(_primary, -secondaryDir.dot(_primary))

  // Parallel to the primary: no roll is better than any other. Leave it.
  if (_projected.lengthSq() < 1e-12 || _target.lengthSq() < 1e-12) return out

  _projected.normalize()
  _target.normalize()

  // Signed, via the cross product's component along the axis — `acos` alone
  // cannot tell a roll of +40° from one of -40°, and rolling the wrong way puts
  // the panels as far from the Sun as they were going to be close to it.
  const cos = THREE.MathUtils.clamp(_projected.dot(_target), -1, 1)
  const sin = _cross.crossVectors(_projected, _target).dot(_primary)
  _twist.setFromAxisAngle(_primary, Math.atan2(sin, cos))

  return out.premultiply(_twist)
}

/**
 * Which way each craft is currently facing, in world space.
 *
 * The attitude has always existed only as a node in the scene graph — a
 * quaternion on the group that wraps the model — which is enough to *draw* the
 * craft and no use at all to anything that wants to know where it is pointing.
 * The ride-along camera does: riding a craft means turning as it turns, and
 * that is this value differenced between frames.
 *
 * The same shape as `planetPositions` and for the same reasons: it changes
 * every frame, so it lives outside React, and absent means absent rather than
 * identity. A craft with no entry is one whose model is not being drawn, and
 * the caller decides what to do about it — see `frameFromVelocity`.
 */
export const spacecraftAttitudes = new Map()

export function publishAttitude(id, quaternion) {
  const held = spacecraftAttitudes.get(id)
  if (held) held.copy(quaternion)
  else spacecraftAttitudes.set(id, quaternion.clone())
}

export const getAttitude = (id) => spacecraftAttitudes.get(id) ?? null
export const clearAttitude = (id) => spacecraftAttitudes.delete(id)

const _forward = new THREE.Vector3()
const _back = new THREE.Vector3()
const _up = new THREE.Vector3()
const _right = new THREE.Vector3()
const _basis = new THREE.Matrix4()
const WORLD_UP = new THREE.Vector3(0, 1, 0)

/**
 * A frame built from where the craft is going, for the twelve that have no
 * pointing rules.
 *
 * Thirty-eight of the fifty carry an `align` rule and are genuinely oriented;
 * the rest are drawn in whatever attitude their modeller authored, which is a
 * fixed rotation and would make a ride-along camera sit perfectly still while
 * the craft rounds a planet. Flying nose-first is not what those craft are
 * doing, but it is honest about the one thing that *is* known — the direction
 * of travel — and it makes the ride read as a ride.
 *
 * -Z forward, matching three's own camera convention, so the result can be
 * handed straight to a camera without a second correction.
 */
export function frameFromVelocity(velocity, out) {
  if (velocity.lengthSq() < 1e-12) return out.identity()

  _forward.copy(velocity).normalize()
  // Any up will do except one parallel to the heading, where the cross product
  // below collapses and the basis comes out as NaN.
  if (Math.abs(_forward.dot(WORLD_UP)) > 0.999) _up.set(1, 0, 0)
  else _up.copy(WORLD_UP)

  /*
   * Right-handed, and it has to be said out loud because the natural way to
   * write it is not.
   *
   * `makeBasis(x, y, z)` builds whatever three columns it is handed, proper
   * rotation or not, and `setFromRotationMatrix` assumes a proper one — it
   * picks a branch on the trace and reads the quaternion off the off-diagonal
   * terms. Hand it a *reflection* and both steps still succeed, and the
   * quaternion that comes back jumps between branches from frame to frame.
   *
   * Measured, with `right = up × forward`: Juno's frame turned by exactly
   * 120.00° every single frame, which is not a rotation rate — it is two
   * orientations alternating. The ride swung the camera through 15,700° in two
   * and a half seconds.
   *
   * So: `z` is *back*, since three's cameras look down -Z; `x = up × z`;
   * `y = z × x`. Check it on the identity case — forward -Z, up +Y gives
   * x = +X, y = +Y, z = +Z.
   */
  _back.copy(_forward).negate()
  _right.crossVectors(_up, _back).normalize()
  _up.crossVectors(_back, _right).normalize()

  _basis.makeBasis(_right, _up, _back)
  return out.setFromRotationMatrix(_basis)
}
