import { systemEdge, unitsPerParsec } from '../orbit/frames.js'

/**
 * How far out we are, as a single number the whole sky reads.
 *
 * 0 means *inside*: the solar system fills the view, the sky is a dome around
 * it, and the Galaxy is the band overhead. 1 means *outside*: the planets have
 * closed into a knot around the Sun, the stars are real points at real
 * distances, and the Galaxy is a disc you are looking at rather than a glow you
 * are inside. In between the two are cross-faded.
 *
 * ## Why one number, published, rather than each component working it out
 *
 * Six things depend on it — the star dome, the deep field, the constellation
 * figures, the picking backdrop, the panorama band and the Galaxy's disc — and
 * four of those are pairs that must sum to exactly one. Two representations of
 * the sky both drawn at full strength is a doubled sky; both at zero is no sky
 * at all. Any of the six computing its own from the camera would be six copies
 * of one rule, which is the mistake `bodyLayer` was extracted to stop making:
 * a rule written twice drifts, and the drift here is silent.
 *
 * So `CosmicStage` writes it once a frame, above the clock, and everything else
 * reads it. Exactly the arrangement `daylight.js` already uses, and for the
 * same reason.
 *
 * ## Where the handover happens, and why it is safe there
 *
 * It starts at `systemEdge` — 165 AU, which is precisely where the camera used
 * to stop — and finishes eight times further out.
 *
 * The dome and the deep field draw the same 8,922 stars in the same directions,
 * but the dome puts them all at one radius and rides with the camera, so it has
 * no parallax at all, while the deep field has the real thing. They agree only
 * while the real parallax is negligible, and across this band it is: the
 * nearest star is 1.325 pc, which is 273,000 AU, so at the start of the fade it
 * shifts by 0.035 degrees and at the end by 0.28. Both are under a pixel at any
 * sane field of view, so the two skies are interchangeable exactly where they
 * are being interchanged, and the handover has nothing to show.
 *
 * Push the fade much further out and that stops being true — the dome would
 * still be visibly holding Orion together while the real Orion had begun to
 * come apart.
 */

/** Where the fade begins, in multiples of `systemEdge`. */
const FADE_FROM = 1

/**
 * And where it ends. Eight times out is 1,320 AU at true scale.
 *
 * Far enough that the cross-fade is a gentle stretch of the journey rather than
 * a switch, and near enough that the dome is gone long before its lack of
 * parallax could be noticed. See above for the arithmetic.
 */
const FADE_TO = 8

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)

/**
 * The stage for a camera distance.
 *
 * Logarithmic in distance, because zooming is multiplicative: a wheel notch
 * multiplies the camera's distance by a constant, so equal notches are equal
 * *ratios*. A fade linear in distance would crawl for the first half of the
 * gesture and then rush, which reads as the sky changing its mind. In log space
 * the fade takes the same number of notches wherever it is.
 */
export function cosmicStageAt(cameraDistance, scaleMode) {
  const edge = systemEdge(scaleMode)
  if (!(cameraDistance > edge * FADE_FROM)) return 0
  return clamp01(Math.log(cameraDistance / (edge * FADE_FROM)) / Math.log(FADE_TO / FADE_FROM))
}

/**
 * The *second* handover, and the reason there are two.
 *
 * Treating "leaving the solar system" and "leaving the Galaxy" as one journey
 * with one fade was the first version of this, and it is wrong by four decades.
 * The two questions it answers are not the same question:
 *
 *   - *Does the sky still have no parallax?* Fails at a few thousand AU, where
 *     the nearest stars begin to shift. That is `starStage`, above.
 *   - *Are we still inside the disc?* Does not fail until kiloparsecs out.
 *
 * Tie them together and the band — the Milky Way as seen from within — would be
 * switched off at 1,320 AU, which is 0.0064 parsecs from here and about as
 * deeply inside the Galaxy as it is possible to be. The overhead glow would
 * vanish while the camera was still, by any measure, in the solar
 * neighbourhood, and be replaced by a face-on disc seen from inside it.
 *
 * So this one runs on its own schedule, in kiloparsecs: the band holds until
 * the camera is genuinely leaving, and the disc is not asserted until it is
 * genuinely outside. In between both are drawn, which is the honest answer for
 * a viewpoint that is neither.
 */
const DISC_FROM_KPC = 2
/**
 * The disc is drawn to 16 kpc and the Sun sits 8.15 kpc off centre, so its far
 * rim is 24 kpc from here. Past 25 there is nothing left to be inside of.
 */
const DISC_TO_KPC = 25

export function discStageAt(cameraDistance, scaleMode) {
  const perKpc = unitsPerParsec(scaleMode) * 1000
  if (!(cameraDistance > DISC_FROM_KPC * perKpc)) return 0
  return clamp01(
    Math.log(cameraDistance / (DISC_FROM_KPC * perKpc)) / Math.log(DISC_TO_KPC / DISC_FROM_KPC),
  )
}

let starStage = 0
let discStage = 0
let pivot = 0

/**
 * How big to draw anything that rides with the camera, in world units.
 *
 * ## The bug this exists to fix
 *
 * The star dome sits at a radius of 1,000 world units and the Milky Way's band
 * at 1,080, and both were written as constants on purpose — `Starfield` argues
 * at length that a sky whose radius depends on the scale is a sky that can
 * differ between the two modes.
 *
 * A constant radius stops working the moment the near plane can exceed it. The
 * near plane is a twentieth of the camera's distance to its pivot, so past
 * about 21,600 world units it passes 1,080 and **the band is clipped away
 * entirely** — not faded, not hidden, simply in front of nothing. At diorama
 * that happens at 0.019 parsecs, and the disc does not begin to fade in until
 * two kiloparsecs, so the Milky Way was invisible across five decades of the
 * journey out. The screenshots showed a black sky with the catalogue stars in
 * it and no galaxy at all, which looked like the band had been switched off on
 * purpose and was in fact geometry falling out of the frustum.
 *
 * ## Why scaling it is free
 *
 * All three of these — the dome, the band, the figures — are centred on the
 * camera. Scaling a shell about the point you are viewing it from changes
 * every distance and no *angle*, so the picture is identical to the pixel. It
 * is the one transform that can be applied to a backdrop without lying about
 * anything, and the star sizes come out unchanged too because `uScale` divides
 * by the same radius it multiplies.
 *
 * So the radius becomes "the constant, or the camera's own distance, whichever
 * is larger" — always far outside the near plane, always well inside the far
 * one, and identical to the old behaviour everywhere the old behaviour worked.
 */
export function skyRadiusFor(base) {
  return Math.max(base, pivot)
}

/**
 * The dome-to-deep-field handover: 0 while the sky is a dome, 1 once the stars
 * are at their real distances.
 */
export const getCosmicStage = () => starStage

/** The band-to-disc handover: 0 while inside the Galaxy, 1 once outside it. */
export const getDiscStage = () => discStage

export function setCosmicStage(stars, disc, pivotDistance) {
  starStage = stars
  discStage = disc
  pivot = pivotDistance
}

/**
 * How fast the wheel zooms, given where the camera is.
 *
 * The reachable range used to be six decades, from a quarter of a kilometre off
 * Aegaeon out to 165 AU, and one speed covered it. It is now fourteen: 60 kpc
 * is 1.2e12 world units. At the old rate a wheel notch multiplies the distance
 * by 1.047, so crossing the whole range would take about seven hundred of them,
 * and the four hundred added would all be spent in the empty stretch between
 * the planets and the nearest star, where nothing changes on screen to show
 * that anything is happening.
 *
 * Raising the rate everywhere is not the answer: down at a moon the same notch
 * has to be a fine adjustment, and the delicacy of the close-up is worth more
 * than the convenience of the flight out. So the speed is tied to the stage —
 * unchanged, to the digit, everywhere the camera could reach before, and
 * opening up across exactly the two handovers the sky itself fades over.
 *
 * What it buys, measured at true scale, where the closest approach is 1.8e-10
 * world units because Aegaeon is 240 metres across:
 *
 *     1.8e-10 → 165 AU   13.9 decades   at 0.9      697 notches, unchanged
 *     165 AU  → 60 kpc    7.9 decades   0.9 → 8.0   110
 *
 * So the eight decades added to the far end cost a sixth of what the existing
 * range already cost, rather than the six hundred notches a flat rate would
 * have charged for them — and every one of those six hundred would have been
 * spent crossing the empty stretch between the planets and the nearest star,
 * where nothing on screen changes to show that anything is happening at all.
 *
 * `verify-galaxy` re-measures both rows, and asserts the first is untouched.
 */
export function zoomSpeedFor(stars, disc) {
  return 0.9 + 2.4 * clamp01(stars) + 4.7 * clamp01(disc)
}
