import { CONSTELLATION_REGIONS } from '../data/constellations.js'

/**
 * Turning a catalogue row into something a person can read.
 *
 * Nothing here is a new fact. Every line is a restatement of a column already
 * in `stars.js` — which is exactly why it lives apart from the panel that shows
 * it, in the same way `constellationFacts.js` does: derivations that could be
 * wrong should be callable by the checks without rendering anything.
 */

/** Parsecs to light years. */
export const LIGHT_YEARS_PER_PARSEC = 3.261564

/**
 * The Harvard classes, hottest first, with the colour each actually looks.
 *
 * These are the first letter of an MK type. The colours are the honest ones —
 * an M star is orange rather than the red the letter suggests, and the eye sees
 * no colour at all in anything faint — so the wording says "-ish" where the
 * difference matters.
 */
const CLASSES = {
  O: { colour: 'blue', note: 'extremely hot and short-lived' },
  B: { colour: 'blue-white', note: 'hot and luminous' },
  A: { colour: 'white', note: 'hot' },
  F: { colour: 'yellow-white', note: 'a little hotter than the Sun' },
  G: { colour: 'yellow', note: 'much like the Sun' },
  K: { colour: 'orange', note: 'cooler than the Sun' },
  M: { colour: 'orange-red', note: 'cool' },
}

/**
 * The luminosity classes, which are the roman numeral after the letter.
 *
 * This is the half of a spectral type people skip and it carries most of the
 * meaning: it is the difference between Betelgeuse and a red dwarf, both M.
 * Matched longest-first, or `I` would swallow the `III` it starts.
 */
const LUMINOSITY = [
  ['Iab', 'supergiant'],
  ['Ia', 'supergiant'],
  ['Ib', 'supergiant'],
  ['III', 'giant'],
  ['II', 'bright giant'],
  ['IV', 'subgiant'],
  ['VI', 'subdwarf'],
  ['V', 'main-sequence star'],
  ['I', 'supergiant'],
]

/** HYG's three-letter Bayer abbreviations, written out. */
const GREEK = {
  Alp: 'Alpha', Bet: 'Beta', Gam: 'Gamma', Del: 'Delta', Eps: 'Epsilon',
  Zet: 'Zeta', Eta: 'Eta', The: 'Theta', Iot: 'Iota', Kap: 'Kappa',
  Lam: 'Lambda', Mu: 'Mu', Nu: 'Nu', Xi: 'Xi', Omi: 'Omicron', Pi: 'Pi',
  Rho: 'Rho', Sig: 'Sigma', Tau: 'Tau', Ups: 'Upsilon', Phi: 'Phi',
  Chi: 'Chi', Psi: 'Psi', Ome: 'Omega',
}

const BY_ABBR = new Map(CONSTELLATION_REGIONS.map((r, index) => [r.abbr, { ...r, index }]))

/** The constellation a `con` abbreviation names, with its genitive. */
export const constellationOf = (abbr) => BY_ABBR.get(abbr) ?? null

/**
 * How a sky map would name the star: "Alpha Canis Majoris".
 *
 * The genitive is the point — a star is named as belonging to its
 * constellation, which is why `constellations.js` carries one. Falls back to
 * the Flamsteed number where there is no Greek letter, and to nothing at all
 * where there is neither, since an invented designation would be worse than a
 * missing one.
 */
export function designation(bayer, flamsteed, abbr) {
  const region = constellationOf(abbr)
  if (!region) return null
  if (bayer) return `${GREEK[bayer] ?? bayer} ${region.genitive}`
  if (flamsteed) return `${flamsteed} ${region.genitive}`
  return null
}

/**
 * A spectral type in words: "a blue-white main-sequence star".
 *
 * Deliberately partial. Real MK types carry peculiarity codes — Sirius is
 * `A0m`, the `m` meaning strong metal lines — and expanding every one of them
 * would be a spectroscopy lesson in a side panel. The class and the luminosity
 * are what change the picture in someone's head; the raw type is shown beside
 * this for anyone who wants the rest.
 */
export function spectralSummary(spect) {
  if (!spect) return null
  const cls = CLASSES[spect[0]]
  if (!cls) return null
  const found = LUMINOSITY.find(([roman]) => spect.includes(roman))
  return `${cls.colour} ${found ? found[1] : 'star'}`
}

/** The one-line "so what": how it compares with the Sun. */
export function luminosityNote(lum) {
  if (!(lum > 0)) return null
  if (lum >= 1000) return `${Math.round(lum).toLocaleString('en-US')} times the Sun's output`
  if (lum >= 10) return `${Math.round(lum)} times the Sun's output`
  if (lum >= 1.15) return `${lum.toFixed(1)} times the Sun's output`
  if (lum > 0.85) return 'about as bright as the Sun'
  return `${(1 / lum).toFixed(lum > 0.1 ? 1 : 0)} times fainter than the Sun`
}

/**
 * How long light from it has been travelling, which is the fact people
 * actually want and the reason the distance is shown in light years first.
 */
export function lightYears(parsecs) {
  return parsecs > 0 ? parsecs * LIGHT_YEARS_PER_PARSEC : null
}
