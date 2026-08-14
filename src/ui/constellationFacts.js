/**
 * The two lines in the constellation panel that are worked out rather than
 * looked up.
 *
 * Everything else the panel shows is read straight from the generated data or
 * from the hand-written dossier. These two are restatements — "best seen" is
 * the region's right ascension said as a month, and "visible from" is its
 * declination range said as a band of latitudes — so they are derivations, and
 * a derivation can be wrong in a way that a stored value cannot.
 *
 * Kept out of the component and free of React for exactly that reason: the
 * checks import them and compare their answers against things that were true
 * before this app existed. The first version of `bestSeen` put Orion in
 * January, which is wrong by a fortnight and looks entirely reasonable.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Where the March equinox falls as a position in the year, in months.
 *
 * Late March, so 2.7 months in. Not a rounding of 3: the half-month difference
 * is enough to move Orion out of December, where anyone who has looked at it
 * knows it belongs, and into January, where it does not.
 */
const EQUINOX = 2.7

/**
 * The month a constellation is highest at midnight, from its right ascension.
 *
 * A constellation is best placed when it is opposite the Sun, which is when the
 * Sun's right ascension is twelve hours from its own. The Sun reaches RA 0h at
 * the March equinox and gains two hours of right ascension a month, so a
 * constellation at RA α is opposite the Sun α/2 + 6 months after that.
 *
 * The wording this feeds is deliberately loose, because the fact is: a
 * constellation is worth looking at for months either side of this, and the
 * rule ignores where the observer is standing entirely.
 */
export function bestSeen(raDegrees) {
  return MONTHS[Math.floor(oppositionMonth(raDegrees)) % 12]
}

/**
 * Where in the year that falls, in months, as a fraction — 11.44 being the
 * fourteenth of December.
 *
 * Exported for the check, which compares it against the date the app's own
 * Earth actually puts the Sun opposite each constellation. Across all 88 the
 * two agree to a few days.
 *
 * **Floor, not round**, and this was wrong first time round. The value is a
 * position in the year, so the month is the one it falls inside; rounding it
 * pushes anything past mid-month into the next one, which put Auriga — highest
 * at midnight on 19 December — into January.
 */
export function oppositionMonth(raDegrees) {
  const hours = raDegrees / 15
  return (hours / 2 + 6 + EQUINOX) % 12
}

/**
 * The band of latitudes some part of a region rises from, as a label.
 *
 * An object at declination δ gets above the horizon for an observer at latitude
 * φ when δ > φ − 90 and δ < φ + 90. Applied to the region's northern and
 * southern extremes, that gives the range of latitudes from which *something*
 * in it rises — the claim a star atlas makes when it prints "visible between
 * +90° and −60°".
 *
 * A rule of thumb about horizons rather than an ephemeris: it assumes a flat
 * horizon, ignores refraction, and says nothing about whether the sky happens
 * to be dark at the time.
 */
export function latitudeBand([south, north]) {
  const highest = Math.min(90, Math.round(north) + 90)
  const lowest = Math.max(-90, Math.round(south) - 90)
  const label = (v) => `${v > 0 ? '+' : ''}${v}°`
  return `${label(highest)} to ${label(lowest)}`
}
