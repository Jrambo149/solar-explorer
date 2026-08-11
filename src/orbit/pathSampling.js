/**
 * Choosing *where* along a curve to put a fixed budget of samples.
 *
 * ## The problem this solves
 *
 * A trail is a window of time, and the obvious way to fill it is to step through
 * that window in equal slices. That is what every path in this app did, and it
 * is wrong for the same reason Kepler's second law is interesting: a body on an
 * eccentric orbit does not cover equal angle in equal time. It crawls through
 * apoapsis and whips through periapsis, so equal time slices land far apart
 * exactly where the curve is bending hardest.
 *
 * Measured on ARTEMIS P2, whose lunar orbit runs from 0.216 to 0.503 world
 * units: with 256 samples over one revolution the mean turn between segments was
 * well under a degree, and yet thirteen consecutive joints near periapsis turned
 * more than five degrees, peaking at **17.3°**. That run of a dozen sharp corners
 * is the faceted arc you see wrapped around the Moon — the rest of the ellipse is
 * perfectly smooth, which is why raising the budget is such a poor fix. It would
 * spend hundreds of extra samples on the 94% of the curve that never needed
 * them to buy a few on the part that did.
 *
 * ## What it does instead
 *
 * Sample the window evenly, measure where the resulting polyline is long and
 * where it bends, then re-sample with the times pulled towards the parts that
 * scored high on either. Same number of points, spent where they show.
 *
 * ## Why that is repeated rather than done once
 *
 * The measurement is made on the distribution it is about to replace, so it can
 * only see structure the current points already resolve. That is fine until the
 * orbit is extreme. Juno's is e = 0.975, and it moves about five thousand times
 * faster at perijove than at apojove — so an even-in-time first pass puts
 * *one* segment across the whole perijove passage, and while the redistribution
 * duly pours a large share of the budget into that segment, it spreads them
 * evenly in time *within* it, which is the original problem again at higher
 * density. Measured, one pass of it took Juno's worst joint from 8.8° to 8.8°:
 * fourteen joints above three degrees, all of them at perijove.
 *
 * Repeating it fixes that, because the second measurement is made on points
 * that now exist where the curve is sharp. Juno lands at 2.7° with no joint over
 * three, and is converged by the fourth pass. Everything else in the roster
 * moves by tenths of a degree, because everything else was already resolved.
 *
 * ## Why it stops when it stops getting better
 *
 * Chasing curvature is only sound where more samples would help, and at a
 * genuine discontinuity they never do. OSIRIS-REx's trail window contains its
 * Earth gravity assist, where the modelled path steps from one orbit to
 * another — and turned loose on that, the redistribution pours an ever larger
 * share of the budget into a joint that does not improve, starving the rest of
 * the curve to pay for it. Measured across passes it ran 6.9°, 7.7°, 14.4°,
 * 152°, 168°: not slow convergence but a runaway.
 *
 * So each pass has to earn its place. The worst joint is measured every time,
 * the best distribution is kept, and the first pass that fails to improve on it
 * ends the loop — which leaves the converging cases converged and the
 * discontinuous ones at the best they ever reached.
 *
 * ## Why the metric is length *and* bend
 *
 * Equalising arc length alone is the intuitive answer and it only half works. It
 * gives every segment the same chord, but the turn at a joint is roughly chord
 * times curvature, so the tight end of an ellipse is still the faceted end —
 * just less so. Measured on the same ARTEMIS pair, arc length on its own takes
 * the worst joint from 17.3° to 3.5°, which is a real improvement and still a
 * visible corner; adding bend takes it to 2.0°, which is the mean.
 * Equalising turning alone has the opposite failure: a long
 * straight run scores zero and collapses to two points, so a cruise leg would be
 * drawn as a single chord through whatever it was actually doing.
 *
 * Adding the two normalised measures keeps both honest. Neither can starve the
 * other, because each is a fraction of its own total.
 *
 * ## Why this is not in the component
 *
 * Same reason `spacecraftFrame.js` is not: it is arithmetic that can be wrong in
 * a way that looks fine in a still frame, so it has to be drivable from Node.
 * It also has no idea what it is sampling — it takes a callback and works on
 * whatever comes back, so orbits, trails and trajectories can all use it.
 */

/**
 * How much bending counts against length when spreading the samples.
 *
 * At 1 the two measures carry equal weight. Higher values chase curvature harder
 * and start thinning the straights noticeably; 0 is plain arc length, which
 * leaves ARTEMIS P2 with a 3.5° corner. There is no principled value — this is
 * the number that takes the worst joint down to 2.0°, equal to the mean, without
 * visibly sparsening anything else.
 */
const BEND_WEIGHT = 1

/**
 * Fills `buffer` with `count` xyz samples spanning [t0, t1], spaced for evenness.
 *
 * `evaluate(t, out)` must write a world-space position into `out` — the caller
 * owns what that means, including any frame offset or scale warp. That matters
 * more than it looks: measuring in world space means the diorama's radial
 * compression is part of what gets equalised, so a path is smoothed as it is
 * actually drawn rather than as it exists in AU.
 *
 * Returns the number of samples written, which is `count` unless the window is
 * degenerate.
 */
export function sampleEvenly(t0, t1, count, evaluate, buffer, scratch) {
  if (count < 2) return 0

  const segments = count - 1
  const point = scratch.point
  const times = scratch.times
  const chord = scratch.chord
  const bend = scratch.bend
  const cumulative = scratch.cumulative
  const best = scratch.best

  // Even in time, which is also the answer for anything that turns out to be
  // uniform already.
  const step = (t1 - t0) / segments
  for (let i = 0; i < count; i++) times[i] = t0 + step * i

  let bestTurn = Infinity

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    for (let i = 0; i < count; i++) {
      evaluate(times[i], point)
      buffer[i * 3] = point.x
      buffer[i * 3 + 1] = point.y
      buffer[i * 3 + 2] = point.z
    }

    let totalChord = 0
    for (let i = 0; i < segments; i++) {
      const dx = buffer[(i + 1) * 3] - buffer[i * 3]
      const dy = buffer[(i + 1) * 3 + 1] - buffer[i * 3 + 1]
      const dz = buffer[(i + 1) * 3 + 2] - buffer[i * 3 + 2]
      chord[i] = Math.hypot(dx, dy, dz)
      totalChord += chord[i]
      bend[i] = 0
    }

    // A path that never moved. Real: the clock is paused on a craft whose window
    // has collapsed, and the normalisation below would be a divide by zero.
    if (totalChord === 0) return count

    /*
     * Turning at each interior joint, charged half to each of its two segments.
     *
     * The joint is where the corner actually is, but the redistribution works on
     * segments, so the cost has to be spread onto the pair that meet there. The
     * two ends have no joint and stay at zero, which is correct — nothing is
     * known about how the curve behaves past them.
     */
    let totalBend = 0
    let worstTurn = 0
    for (let i = 1; i < segments; i++) {
      const ax = buffer[i * 3] - buffer[(i - 1) * 3]
      const ay = buffer[i * 3 + 1] - buffer[(i - 1) * 3 + 1]
      const az = buffer[i * 3 + 2] - buffer[(i - 1) * 3 + 2]
      const bx = buffer[(i + 1) * 3] - buffer[i * 3]
      const by = buffer[(i + 1) * 3 + 1] - buffer[i * 3 + 1]
      const bz = buffer[(i + 1) * 3 + 2] - buffer[i * 3 + 2]

      const la = chord[i - 1]
      const lb = chord[i]
      if (la === 0 || lb === 0) continue

      const cos = (ax * bx + ay * by + az * bz) / (la * lb)
      const turn = Math.acos(Math.min(1, Math.max(-1, cos)))
      bend[i - 1] += turn * 0.5
      bend[i] += turn * 0.5
      totalBend += turn
      if (turn > worstTurn) worstTurn = turn
    }

    /*
     * Keep this distribution only if it beat everything before it.
     *
     * The comparison is the whole safeguard — see the note above on OSIRIS-REx.
     * A pass that made the worst joint worse is discarded outright and the loop
     * ends, so the caller always receives the best arrangement that was reached
     * rather than the last one attempted.
     */
    if (worstTurn < bestTurn) {
      bestTurn = worstTurn
      best.set(buffer.subarray(0, count * 3))
    } else {
      buffer.set(best.subarray(0, count * 3))
      return count
    }

    // Straight, or near enough. A cruise leg between two planets is genuinely
    // this, and redistributing over it would be pure cost for no change.
    if (totalBend < 1e-6) return count

    /*
     * Cumulative cost along the path, normalised to end at exactly 1.
     *
     * Forcing the last value rather than trusting the sum is not defensive
     * tidiness — the search below walks until it passes a target, and a
     * cumulative that ends at 0.9999999 through float drift leaves the final
     * target unreachable and the last sample at whatever the loop happened to
     * leave.
     */
    let running = 0
    for (let i = 0; i < segments; i++) {
      running += chord[i] / totalChord + (BEND_WEIGHT * bend[i]) / totalBend
      cumulative[i] = running
    }
    for (let i = 0; i < segments; i++) cumulative[i] /= running
    cumulative[segments - 1] = 1

    /*
     * Walk the cost axis in equal strides and take the time that lands there.
     *
     * The new times are interpolated between the *current* ones rather than off
     * a uniform grid, which is what makes repeating this meaningful: each pass
     * refines the distribution it inherited instead of starting over. The ends
     * are pinned, so the window stays exactly [t0, t1] — a trail whose head
     * drifted off the craft would be a worse bug than a facet.
     */
    let seg = 0
    for (let k = 1; k < segments; k++) {
      const target = k / segments
      while (seg < segments - 1 && cumulative[seg] < target) seg++

      const before = seg === 0 ? 0 : cumulative[seg - 1]
      const width = cumulative[seg] - before
      const within = width > 0 ? (target - before) / width : 0
      scratch.next[k] = times[seg] + (times[seg + 1] - times[seg]) * within
    }
    for (let k = 1; k < segments; k++) times[k] = scratch.next[k]
  }

  buffer.set(best.subarray(0, count * 3))
  return count
}

/**
 * How many times the redistribution may be repeated.
 *
 * Four. Juno is the case that needs more than two and it is converged by the
 * fourth — 8.8°, 2.7°, 2.63°, 2.62° — and nothing else in the roster moves
 * measurably after the second. Passes are only paid for when the trail window
 * has actually moved, and the loop exits early the moment a pass stops helping,
 * so the ceiling is reached by almost nothing.
 */
const MAX_PASSES = 4

/** The scratch `sampleEvenly` needs, allocated once per path. */
export function allocSampling(maxPoints) {
  return {
    point: { x: 0, y: 0, z: 0 },
    times: new Float64Array(maxPoints),
    next: new Float64Array(maxPoints),
    chord: new Float64Array(maxPoints),
    bend: new Float64Array(maxPoints),
    cumulative: new Float64Array(maxPoints),
    best: new Float64Array(maxPoints * 3),
  }
}
