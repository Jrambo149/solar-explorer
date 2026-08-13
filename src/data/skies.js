/**
 * What the sky looks like from the ground, on the four worlds that have one.
 *
 * ## Why this cannot be derived, and cannot be borrowed either
 *
 * `Atmosphere.jsx` already has a colour for every atmosphere in the app — the
 * limb glow seen from space. It is the wrong colour to reuse, and Mars is the
 * proof: its limb from orbit is a pale blue-white haze, and its sky from the
 * ground is butterscotch. Same air, two colours, because you are looking
 * through it along completely different paths.
 *
 * Nor does one scattering model cover them. Earth's sky is **Rayleigh
 * scattering off gas molecules**, which is strongest at short wavelengths — so
 * the sky is blue and the setting Sun is red, because the blue has been
 * scattered out of the direct beam. Mars' sky is **dust**: particles about a
 * micron across, comparable to the wavelength of light, which scatter forward
 * and slightly favour red. That gives the daytime sky its butterscotch cast and
 * produces the single most striking fact about the place —
 *
 * > **Mars' sunsets are blue.** Right around the Sun, where forward scattering
 * > dominates, the light that survives is bluer than the sky it sits in. Earth
 * > and Mars are exact opposites: blue sky with a red sunset, red sky with a
 * > blue sunset.
 *
 * That inversion is what `verify-daylight.mjs` checks, and it is a far better
 * test than any single colour, because it cannot be satisfied by a plausible
 * mistake. Getting it right requires both skies to be right in the right way.
 *
 * ## Sources
 *
 * These are hand-set colours read off published imagery, not a spectrum
 * integrated from an atmospheric model — this app has no radiative transfer and
 * pretending otherwise in a comment would be worse than saying so:
 *
 *  - **Earth** — clear-sky zenith and horizon, and the colour of a low Sun's
 *    aureole. The one everybody can check by walking outside.
 *  - **Mars** — the Pathfinder, Spirit, Opportunity and Curiosity panoramas,
 *    which is also where the blue sunset comes from. Curiosity's sunset
 *    sequence from Gale in April 2015 is the canonical picture of it.
 *  - **Titan** — Huygens' descent imager, January 2005: a thick orange haze
 *    with no Sun visible through it and a horizon that barely reads as one.
 *  - **Venus** — the Venera 13 and 14 surface panoramas, the only pictures ever
 *    taken from that surface. Dim, orange, and completely overcast.
 *
 * ## Bodies not here
 *
 * The Moon and Mercury have no atmosphere, so their sky is black in daylight
 * with the Sun blazing in it — which is exactly what the app already draws, and
 * the reason those two are absent rather than set to black. An entry here means
 * "there is air to see"; no entry means the vacuum is correct.
 */

/**
 * @typedef {{
 *   zenith: [number, number, number],
 *   horizon: [number, number, number],
 *   aureole: [number, number, number],
 *   brightness: number,
 *   extinction: [number, number, number],
 *   opacity: number,
 * }} Sky
 */

/**
 * `zenith` and `horizon` are the sky's colour straight up and at the horizon
 * with the Sun high. `aureole` is the colour it takes *around the Sun* when the
 * Sun is low — the sunset colour, and the field that carries the Earth/Mars
 * inversion.
 *
 * `brightness` scales the whole inscattered term. `extinction` is how strongly
 * each channel is absorbed along the line of sight, which is what reddens the
 * Sun itself near the horizon rather than merely painting the sky around it —
 * on Earth blue is removed hardest, which is the same fact that makes the sky
 * blue in the first place. `opacity` bounds how much the sky can hide: 1 means
 * a solid overcast that the stars and the Sun cannot get through at all.
 *
 * Colours are linear-ish 0–1 triples rather than hex, because they are used as
 * numbers by the shader and read as numbers by the checks.
 *
 * @type {Record<string, Sky>}
 */
export const SKIES = {
  earth: {
    // Deep blue overhead, paler and warmer where the air is thickest.
    zenith: [0.19, 0.36, 0.78],
    horizon: [0.62, 0.74, 0.92],
    // The low-Sun aureole: orange through to red.
    aureole: [1.0, 0.42, 0.16],
    brightness: 1.0,
    // Blue scattered out hardest — the reason for both the blue sky and the
    // red sunset, and the same coefficient doing both jobs.
    extinction: [0.28, 0.62, 1.35],
    opacity: 1.0,
  },

  mars: {
    /*
     * Butterscotch, and lighter near the horizon. The colour published for the
     * Martian sky has been argued over for fifty years — the first Viking
     * frames were released blue by mistake and corrected within a day — so
     * these lean on the recent rovers, which carry calibration targets for
     * exactly this reason.
     */
    zenith: [0.68, 0.47, 0.32],
    horizon: [0.80, 0.62, 0.46],
    /*
     * And the blue sunset. Not a stylistic choice and not a swapped constant:
     * dust scatters forward, so the light arriving from close to the Sun is
     * bluer than the sky around it. Every rover that has photographed a Martian
     * sunset has photographed this.
     */
    aureole: [0.42, 0.53, 0.72],
    // A thin atmosphere: about 0.6% of Earth's pressure, and the sky is
    // correspondingly dimmer against the same Sun, which is also further away.
    brightness: 0.42,
    // Dust is much greyer than gas — it dims all three channels nearly alike,
    // with a slight bias the other way from Earth's.
    extinction: [0.55, 0.48, 0.42],
    opacity: 0.82,
  },

  titan: {
    /*
     * Barely a sky at all: an orange haze so thick that Huygens saw no Sun and
     * almost no horizon on the way down. Zenith and horizon are nearly the same
     * colour, which is the honest description.
     */
    zenith: [0.52, 0.33, 0.13],
    horizon: [0.58, 0.39, 0.17],
    aureole: [0.62, 0.44, 0.20],
    // Dim: Saturn is nine and a half AU out, so the light arriving is about 1%
    // of Earth's before the haze takes its share. Noon on Titan is roughly an
    // Earth twilight.
    brightness: 0.30,
    extinction: [1.6, 1.7, 1.9],
    // Overcast. Nothing gets through — no stars, no Sun, no Saturn.
    opacity: 1.0,
  },

  venus: {
    /*
     * The Venera panoramas: an orange-brown overcast with no shadows and no
     * Sun. The cloud deck is 45 km up and completely closed, so the surface has
     * no sky in the sense the other three do — only a glow.
     */
    zenith: [0.55, 0.36, 0.14],
    horizon: [0.62, 0.43, 0.18],
    aureole: [0.62, 0.43, 0.18],
    brightness: 0.34,
    extinction: [2.4, 2.6, 3.0],
    opacity: 1.0,
  },
}

/** The sky at a body, or null where the honest answer is vacuum. */
export const skyOf = (id) => SKIES[id] ?? null
