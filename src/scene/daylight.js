/**
 * How bright the sky is where the camera is standing, 0 to 1.
 *
 * A one-number registry, in the same spirit as `planetPositions` and the spin
 * map in `surface.js`: written by `SkyDome` every frame, read by `Starfield`
 * every frame, and never allowed near React.
 *
 * ## Why the stars need telling
 *
 * Daylight hides the stars by **contrast**, not by extinction. The air takes
 * perhaps a fifth of a magnitude out of a star's light at the zenith, which is
 * nothing; the reason you cannot see Vega at noon is that the sky next to it is
 * some fifteen magnitudes brighter, and the eye cannot hold both.
 *
 * That is a comparison this app cannot make on its own terms, because it has no
 * absolute photometry: the catalogue's magnitudes are mapped to a fixed on-
 * screen brightness chosen so the constellations read against black, and the
 * sky's brightness is a hand-set colour. The two numbers are not in the same
 * units and never were. So the transmittance pass alone left a full field of
 * stars shining through a blue midday sky — every one of them correctly placed,
 * correctly coloured, and impossible.
 *
 * Rather than pretend to a radiometry that is not there, the sky says how
 * bright it is and the stars stand down accordingly. It is one number and one
 * multiply, and it is honest about being a contrast rule rather than a physical
 * one.
 */

let brightness = 0

/** Called by `SkyDome`; 0 where there is no sky, or none lit. */
export const setDaylight = (value) => {
  brightness = value
}

export const getDaylight = () => brightness
