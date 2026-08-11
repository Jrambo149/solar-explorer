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
