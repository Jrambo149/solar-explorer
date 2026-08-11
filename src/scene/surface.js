/**
 * Putting a thing on a planet's surface and keeping it there.
 *
 * Everything else in this app is placed by solving where it is in space. A rover
 * is placed by *where it is on the ground*, and then carried by the planet — the
 * difference is the whole of this file.
 *
 * ## The transform, which has to match `Body.jsx` exactly
 *
 * A body is drawn as
 *
 *     <group quaternion={orientation}>          // the IAU pole frame
 *       <mesh rotation.y={spin} scale={radius}> // R_y(spin)
 *
 * so a point sitting at body-fixed direction `d` on the unit sphere ends up at
 * `bodyPosition + B · R_y(spin) · d · radius`, where `B` is the body's basis
 * from `pole.js`. Anything that disagrees with that composition by so much as
 * an axis leaves the rover hovering beside the planet or buried inside it, and
 * both look like a placement bug rather than a transform bug.
 *
 * `B` was `R_z(axialTilt)` until the poles landed, and the reason it is now a
 * basis passed in rather than an angle recomputed here is the same reason
 * `spin` already was: two copies of a transform drift, and a degree of drift is
 * a hundred kilometres of rover.
 *
 * The rover is deliberately **not** put through `spacecraftOffset`. That warps a
 * craft's distance from its planet so a close orbiter is visible against a body
 * drawn far too large, and it is exactly wrong here: a rover's distance from the
 * centre is the planet's own radius, and inflating it would lift the rover off
 * the ground it is standing on.
 *
 * ## Which longitude is drawn where
 *
 * `LONGITUDE_ZERO` is measured rather than derived, and it has to be. Mars is
 * drawn with NASA's own mesh, whose UVs came with it — so where the prime
 * meridian falls on screen is a property of an asset, not of a formula. See the
 * constant.
 */

import * as THREE from 'three'
import { applyBasis } from './pole.js'

const DEG = Math.PI / 180

/**
 * Planet spin angles, written by `Body` and read by anything standing on one.
 *
 * A registry in the same spirit as `planetPositions`, and for the same reason:
 * it changes every frame and no React state should be involved. Recomputing the
 * angle instead would mean copying `Body`'s expression — `spinAt` plus the
 * showcase turntable plus the paused-clock special case — and a copy that drifts
 * by a degree slides the rover a hundred kilometres across the surface.
 *
 * Safe to read from `SPACECRAFT` priority, which runs after `BODIES`; see
 * `framePriority.js`.
 */
const spins = new Map()

export const setPlanetSpin = (id, angle) => {
  spins.set(id, angle)
}

export const getPlanetSpin = (id) => spins.get(id) ?? null

/**
 * Where longitude zero sits on the drawn body, in degrees.
 *
 * Zero, and measured rather than assumed.
 *
 * Mars is not one of the bodies drawn from a NASA mesh — it takes the texture
 * path, so its UVs are `SphereGeometry`'s own and the mapping can be derived
 * rather than guessed at. What still had to be measured is the *texture's*
 * convention, which is a property of the image.
 *
 * Read off `public/textures/mars.jpg` (2048x1024) at three landmarks chosen to
 * be unmistakable and far apart in longitude:
 *
 *     Olympus Mons        x 250   u 0.125   226.2°E
 *     Valles Marineris    x 583   u 0.292   ~285°E
 *     Hellas basin        x 1400  u 0.684    70.5°E
 *
 * All three fit `u = ((lon - 180) / 360) mod 1` — the usual equirectangular
 * layout with longitude zero at the centre of the image. Latitude agrees too:
 * Olympus Mons sits at y 390, which is 19.8°N against a true 18.65°N.
 *
 * `SphereGeometry` places `uv.x = u` at `(-cos 2πu, 0, sin 2πu)` on the
 * equator. Substituting the mapping above gives `(cos lon, 0, -sin lon)`, which
 * is what `surfaceDirection` computes with this constant at zero. So the offset
 * is genuinely nothing, and the sign on `z` is confirmed with it — three
 * landmarks spread over 215° of longitude cannot all be satisfied by a sign
 * error or a 180° shift.
 */
const LONGITUDE_ZERO = 0

/**
 * The body-fixed unit direction of a surface point.
 *
 * Planetocentric latitude and **east** longitude, the convention modern Mars
 * products use and the one the landing coordinates are quoted in.
 *
 * `+Y` is the spin axis, because that is the axis `Body` turns about. East
 * longitude increases in the direction the body turns, which for a prograde
 * spin about `+Y` in three.js's right-handed frame means `-Z` at the prime
 * meridian sweeping toward `+X` — hence the sign on `z`.
 */
export function surfaceDirection(latDeg, lonDeg, out = new THREE.Vector3()) {
  const lat = latDeg * DEG
  const lon = (lonDeg + LONGITUDE_ZERO) * DEG
  const c = Math.cos(lat)
  return out.set(c * Math.cos(lon), Math.sin(lat), -c * Math.sin(lon))
}

const _dir = new THREE.Vector3()
const _spinQ = new THREE.Quaternion()
const AXIS_Y = new THREE.Vector3(0, 1, 0)

/**
 * The offset from a body's centre to a point on its surface, in world units.
 *
 * `radius` is the body's *drawn* radius, so the point lands on the sphere the
 * viewer can see rather than on the real one.
 */
export function surfaceOffset(latDeg, lonDeg, basis, spin, radius, out = { x: 0, y: 0, z: 0 }) {
  surfaceDirection(latDeg, lonDeg, _dir)
  _spinQ.setFromAxisAngle(AXIS_Y, spin)
  _dir.applyQuaternion(_spinQ)
  applyBasis(basis, _dir, _dir)
  _dir.multiplyScalar(radius)
  // Written as plain fields rather than into a `Vector3`, because the scratch
  // objects the placement code passes around are plain — see `offset` in
  // `Spacecraft`. A `Vector3` here throws on `out.copy` the first time it runs.
  out.x = _dir.x
  out.y = _dir.y
  out.z = _dir.z
  return out
}

const _up = new THREE.Vector3()
const _from = new THREE.Vector3(0, 1, 0)

/**
 * The orientation that stands a model up on the surface.
 *
 * Its own `+Y` is turned to point along the outward normal, which for a sphere
 * is the surface direction itself. Without this a rover is drawn in whatever
 * attitude its file was authored in — upright at the north pole and lying on its
 * side at the equator, which reads as a broken model rather than as a missing
 * rotation.
 *
 * The heading about that normal is left unspecified, because nothing here knows
 * which way a rover was facing and inventing one would be a fact this app does
 * not have.
 */
export function surfaceUpright(latDeg, lonDeg, basis, spin, out = new THREE.Quaternion()) {
  surfaceDirection(latDeg, lonDeg, _up)
  _spinQ.setFromAxisAngle(AXIS_Y, spin)
  _up.applyQuaternion(_spinQ)
  applyBasis(basis, _up, _up)
  _up.normalize()
  return out.setFromUnitVectors(_from, _up)
}
