/**
 * Keplerian orbital elements for the major planets.
 *
 * Source: JPL Solar System Dynamics, "Keplerian Elements for Approximate
 * Positions of the Major Planets", the 1800 AD – 2050 AD table.
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *
 * Each body gets six elements at the J2000 epoch plus six linear rates per
 * Julian century. That is a straight-line fit to the slow precession of each
 * orbit, and across the stated window it holds the planets to within about an
 * arcminute — several orders of magnitude finer than a screen pixel here, and
 * far better than this app needs.
 *
 * Two things follow from that, and both matter:
 *
 *  - **The window is real.** Outside 1800–2050 the linear fit degrades quickly,
 *    which is why the time control clamps to it rather than quietly
 *    extrapolating. JPL publishes a separate table with quadratic terms for
 *    3000 BC – 3000 AD if the range ever needs to grow.
 *  - **This is not an ephemeris.** It is an excellent visualisation, not
 *    Horizons. Nothing here should be used to point a telescope.
 *
 * Units are as published: `a` in AU, angles in degrees, rates per century.
 * Earth's row is really the Earth–Moon barycentre, which is what the table
 * provides; the two differ by under 5000 km, roughly a thousandth of the
 * smallest gap this scene ever renders.
 */

/**
 * @typedef {object} Elements
 * @property {number} a semi-major axis, AU
 * @property {number} e eccentricity
 * @property {number} i inclination to the ecliptic, degrees
 * @property {number} L mean longitude, degrees
 * @property {number} varpi longitude of perihelion (ϖ), degrees
 * @property {number} Omega longitude of the ascending node (Ω), degrees
 * ...plus `aDot`, `eDot`, `iDot`, `LDot`, `varpiDot`, `OmegaDot` per century.
 */

/** @type {Record<string, Elements>} */
export const ORBITAL_ELEMENTS = {
  mercury: {
    a: 0.38709927, aDot: 0.00000037,
    e: 0.20563593, eDot: 0.00001906,
    i: 7.00497902, iDot: -0.00594749,
    L: 252.25032350, LDot: 149472.67411175,
    varpi: 77.45779628, varpiDot: 0.16047689,
    Omega: 48.33076593, OmegaDot: -0.12534081,
  },

  venus: {
    a: 0.72333566, aDot: 0.00000390,
    e: 0.00677672, eDot: -0.00004107,
    i: 3.39467605, iDot: -0.00078890,
    L: 181.97909950, LDot: 58517.81538729,
    varpi: 131.60246718, varpiDot: 0.00268329,
    Omega: 76.67984255, OmegaDot: -0.27769418,
  },

  earth: {
    a: 1.00000261, aDot: 0.00000562,
    e: 0.01671123, eDot: -0.00004392,
    // Earth's inclination to the ecliptic is zero by definition — the ecliptic
    // *is* Earth's orbital plane. The tiny value here is the drift of the
    // J2000-fixed reference plane away from the orbit of the day.
    i: -0.00001531, iDot: -0.01294668,
    L: 100.46457166, LDot: 35999.37244981,
    varpi: 102.93768193, varpiDot: 0.32327364,
    Omega: 0.0, OmegaDot: 0.0,
  },

  mars: {
    a: 1.52371034, aDot: 0.00001847,
    e: 0.09339410, eDot: 0.00007882,
    i: 1.84969142, iDot: -0.00813131,
    L: -4.55343205, LDot: 19140.30268499,
    varpi: -23.94362959, varpiDot: 0.44441088,
    Omega: 49.55953891, OmegaDot: -0.29257343,
  },

  jupiter: {
    a: 5.20288700, aDot: -0.00011607,
    e: 0.04838624, eDot: -0.00013253,
    i: 1.30439695, iDot: -0.00183714,
    L: 34.39644051, LDot: 3034.74612775,
    varpi: 14.72847983, varpiDot: 0.21252668,
    Omega: 100.47390909, OmegaDot: 0.20469106,
  },

  saturn: {
    a: 9.53667594, aDot: -0.00125060,
    e: 0.05386179, eDot: -0.00050991,
    i: 2.48599187, iDot: 0.00193609,
    L: 49.95424423, LDot: 1222.49362201,
    varpi: 92.59887831, varpiDot: -0.41897216,
    Omega: 113.66242448, OmegaDot: -0.28867794,
  },

  uranus: {
    a: 19.18916464, aDot: -0.00196176,
    e: 0.04725744, eDot: -0.00004397,
    i: 0.77263783, iDot: -0.00242939,
    L: 313.23810451, LDot: 428.48202785,
    varpi: 170.95427630, varpiDot: 0.40805281,
    Omega: 74.01692503, OmegaDot: 0.04240589,
  },

  neptune: {
    a: 30.06992276, aDot: 0.00026291,
    e: 0.00859048, eDot: 0.00005105,
    i: 1.77004347, iDot: 0.00035372,
    L: -55.12002969, LDot: 218.45945325,
    varpi: 44.96476227, varpiDot: -0.32241464,
    Omega: 131.78422574, OmegaDot: -0.00508664,
  },

  // Published in the same table and transcribed now rather than later, since
  // splitting one table across two edits is how rows get mistyped. Not yet
  // rendered — dwarf planets are a later phase.
  pluto: {
    a: 39.48211675, aDot: -0.00031596,
    e: 0.24882730, eDot: 0.00005170,
    i: 17.14001206, iDot: 0.00004818,
    L: 238.92903833, LDot: 145.20780515,
    varpi: 224.06891629, varpiDot: -0.04062942,
    Omega: 110.30393684, OmegaDot: -0.01183482,
  },
}

/**
 * The window the table above is fitted for, as Julian Dates.
 *
 * The time control clamps to this. Beyond it the linear rates diverge fast —
 * Saturn's semi-major axis rate alone would have shifted it by a full AU after
 * eight centuries — so letting the user scrub past the edge would hand them
 * confidently wrong positions with nothing on screen to say so.
 */
export const EPOCH_RANGE = {
  /** 1800 January 1 */
  minJD: 2378496.5,
  /** 2050 January 1 */
  maxJD: 2469807.5,
}
