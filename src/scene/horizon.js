/**
 * Up, north and east, at a point on a planet.
 *
 * Everything else in this app looks *at* a body from outside, where the only
 * frame that matters is the world's. Standing on one needs a local frame, and
 * that frame is what makes "look north" and "20° above the horizon" mean
 * anything at all.
 *
 * Kept out of the camera and free of three.js so that the checks can import it,
 * exactly as `sky.js` is kept out of `Starfield` and for the same reason: a
 * horizon can be silently, plausibly wrong. A frame with east and west swapped
 * runs the sky backwards across it and looks entirely normal until you notice
 * the Sun setting in the east.
 *
 * ## The three axes
 *
 * **Up** is the outward surface normal, which on a sphere is the surface
 * direction itself — the same vector `surfaceOffset` uses to place a rover, put
 * through the same body-fixed transform, so a person standing here stands on
 * exactly the ground the labels name.
 *
 * **North** is the body's spin axis, with the part of it along `up` removed —
 * the direction you would walk to reach the north pole, projected into the
 * ground under your feet. It is undefined at the poles themselves, where every
 * direction is south, and the caller has to say what to do about that.
 *
 * **East** is the third, and the only one with a sign to get wrong. It follows
 * from the other two: `east = north × up` in a right-handed frame, and the
 * check that this is the right way round is that the sky must drift *west* for
 * a prograde spin — the Sun rises in the east everywhere except Venus.
 */

const DEG = Math.PI / 180

/** Length of a vector-like `{x, y, z}`. */
const norm = (v) => Math.hypot(v.x, v.y, v.z)

/**
 * The local frame at a point, given the outward normal and the spin axis.
 *
 * Both are world-space unit vectors. `up` is what `surfaceOffset` returns,
 * normalised; `pole` is the body's rotation axis, which is the `y` column of
 * its basis.
 *
 * Near the poles `north` degenerates — the projection of the axis into the
 * tangent plane goes to zero length — so above `POLE_LIMIT` this falls back to
 * a fixed reference direction rather than returning something that flips wildly
 * with rounding. Standing at the north pole and being told which way is north
 * has no answer; being spun on the spot by floating point has the wrong one.
 */
export const POLE_LIMIT = 0.9995

export function horizonFrame(up, pole, out) {
  const along = up.x * pole.x + up.y * pole.y + up.z * pole.z

  let nx = pole.x - along * up.x
  let ny = pole.y - along * up.y
  let nz = pole.z - along * up.z
  let length = Math.hypot(nx, ny, nz)

  if (Math.abs(along) > POLE_LIMIT || length < 1e-9) {
    /*
     * At a pole. Any tangent direction is as good as any other, so take a
     * fixed one and be stable about it: cross `up` with whichever world axis it
     * is least aligned with, which can never be degenerate.
     */
    const ax = Math.abs(up.x) < 0.9 ? 1 : 0
    const az = Math.abs(up.x) < 0.9 ? 0 : 1
    const dot = ax * up.x + az * up.z
    nx = ax - dot * up.x
    ny = -dot * up.y
    nz = az - dot * up.z
    length = Math.hypot(nx, ny, nz)
  }

  out.north.x = nx / length
  out.north.y = ny / length
  out.north.z = nz / length

  // east = north × up. Right-handed, and the sign that decides whether the
  // Sun rises or sets in the east.
  out.east.x = out.north.y * up.z - out.north.z * up.y
  out.east.y = out.north.z * up.x - out.north.x * up.z
  out.east.z = out.north.x * up.y - out.north.y * up.x

  out.up.x = up.x
  out.up.y = up.y
  out.up.z = up.z
  return out
}

/**
 * A look direction, from an azimuth and an altitude in degrees.
 *
 * Azimuth is measured **from north, through east** — 0 north, 90 east, 180
 * south, 270 west — which is the convention every almanac and every compass
 * uses. Altitude is degrees above the horizon, negative below.
 */
export function lookDirection(frame, azimuthDeg, altitudeDeg, out) {
  const az = azimuthDeg * DEG
  const alt = altitudeDeg * DEG
  const c = Math.cos(alt)
  const n = c * Math.cos(az)
  const e = c * Math.sin(az)
  const u = Math.sin(alt)

  out.x = frame.north.x * n + frame.east.x * e + frame.up.x * u
  out.y = frame.north.y * n + frame.east.y * e + frame.up.y * u
  out.z = frame.north.z * n + frame.east.z * e + frame.up.z * u
  return out
}

/**
 * The reverse: where in the sky a world direction is, from here.
 *
 * `{ azimuth, altitude }` in degrees, azimuth wrapped to 0–360. This is what
 * the checks are made of — "the Sun is 43° above the south-west horizon" is a
 * statement anyone can look up, where "the camera quaternion is (…)" is not.
 */
/**
 * The inverse: a direction in the world, as a heading and an altitude here.
 *
 * What it is for is turning to look at something whose position is known in the
 * sky but not in the local frame — a constellation picked from the search, a
 * planet, the Sun. "Face Orion" is a well-posed request from anywhere on any
 * body, and this is the only thing that can answer it, because the answer
 * depends entirely on where you are standing and which way the ground is
 * pointing at that instant.
 *
 * Azimuth comes back in `[0, 360)` measured from north through east, matching
 * `lookDirection` and `compassPoint`, so the two round-trip.
 */
export function lookAngles(frame, direction) {
  const n = direction.x * frame.north.x + direction.y * frame.north.y + direction.z * frame.north.z
  const e = direction.x * frame.east.x + direction.y * frame.east.y + direction.z * frame.east.z
  const u = direction.x * frame.up.x + direction.y * frame.up.y + direction.z * frame.up.z

  let azimuth = Math.atan2(e, n) / DEG
  if (azimuth < 0) azimuth += 360
  // Clamped before the arcsine: `direction` is normalised by its caller and a
  // dot product of unit vectors can still land at 1.0000000000000002, which
  // returns NaN and freezes the camera at whatever it was last looking at.
  return { azimuth, altitude: Math.asin(Math.max(-1, Math.min(1, u))) / DEG }
}

export function skyPosition(frame, direction) {
  const length = norm(direction) || 1
  const x = direction.x / length
  const y = direction.y / length
  const z = direction.z / length

  const u = x * frame.up.x + y * frame.up.y + z * frame.up.z
  const n = x * frame.north.x + y * frame.north.y + z * frame.north.z
  const e = x * frame.east.x + y * frame.east.y + z * frame.east.z

  return {
    altitude: Math.asin(Math.max(-1, Math.min(1, u))) / DEG,
    azimuth: ((Math.atan2(e, n) / DEG) % 360 + 360) % 360,
  }
}

/** North-east-south-west, for a readout. Sixteen points is enough to steer by. */
const POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]

export const compassPoint = (azimuthDeg) =>
  POINTS[Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16]
