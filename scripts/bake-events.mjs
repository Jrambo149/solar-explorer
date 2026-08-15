#!/usr/bin/env node
/**
 * Bakes the solar system's calendar into `src/data/events.js`.
 *
 * Run with `npm run bake:events`. Committed, like everything else the app
 * reads — it makes no network requests, and this makes none either: every date
 * here is *searched for* using the app's own orbits, in `src/orbit/events.js`,
 * not copied from an almanac. That is the property worth having. Jump the clock
 * to an eclipse in this file and the eclipse is on screen, because the same
 * geometry decided both; a list transcribed from a published table would drift
 * away from the scene the moment either changed.
 *
 * ## Why bake at all
 *
 * Because the searches are sweeps. Finding every solar eclipse from 1800 to
 * 2050 evaluates the lunar series a third of a million times, which is a few
 * seconds — unremarkable in a build step and unacceptable in a page load, for a
 * panel most people will open once.
 *
 * Jupiter's shadow transits are deliberately *not* here. There are eight
 * hundred a year, so two centuries of them would be two hundred thousand rows
 * to save a search that takes milliseconds over the day actually on screen.
 * They are found live instead.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { PLANETS } from '../src/data/planetData.js'
import { ASTEROID_BODIES } from '../src/data/bodies.js'
import { EPOCH_RANGE } from '../src/data/orbitalElements.js'
import { bodyBasis, poleDirection, primeMeridianAt } from '../src/scene/pole.js'
import {
  closeApproaches,
  conjunctions,
  greatestElongations,
  lunarEclipses,
  oppositions,
  ringPlaneCrossings,
  solarEclipses,
} from '../src/orbit/events.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/data/events.js')

const FROM = EPOCH_RANGE.minJD
const TO = EPOCH_RANGE.maxJD

const elements = (id) => PLANETS.find((p) => p.id === id).elements
const earth = elements('earth')

/**
 * Planets that can be at opposition: the ones outside the Earth's orbit.
 *
 * Mercury and Venus are omitted because for them the event does not exist
 * rather than because it is uninteresting — they are never opposite the Sun.
 * They get greatest elongations instead, which is the corresponding thing an
 * inner planet does.
 */
const OUTER = ['mars', 'jupiter', 'saturn', 'uranus', 'neptune']
const INNER = ['mercury', 'venus']

/**
 * The bodies whose close approaches this app can honestly claim to have found.
 *
 * Not the comets, and that took a measurement to settle. They are the obvious
 * candidates — a comet on a steep eccentric orbit is exactly the thing that
 * cuts across a planet's path — and the search duly found Siding Spring near
 * Mars in October 2014, which really happened and is one of the closest
 * cometary passes ever observed.
 *
 * It found it **1.6 days late and fifteen times too far away**: 2.2 million
 * kilometres against the true 141,000. The comets carry *osculating* elements
 * from the Small-Body Database — one two-body ellipse, no secular rates, no
 * planetary perturbations — which is a fine way to draw a comet's path and a
 * poor way to say where it was on a given afternoon.
 *
 * The rule this app works to is that an event is *searched from its own
 * geometry*, not looked up and asserted. Geometry that puts a famous flyby a
 * day and a half out does not meet it, so the comets are left out rather than
 * quietly listed with a wrong distance beside them. If their elements are ever
 * fitted the way the asteroid bodies' are, they qualify automatically.
 */
const SMALL_BODIES = ASTEROID_BODIES

function main() {
  const events = []
  const note = (label, rows) => {
    console.log(`[events] ${String(rows.length).padStart(5)}  ${label}`)
    events.push(...rows)
  }

  note(
    'solar eclipses',
    solarEclipses(FROM, TO, earth, {
      basis: bodyBasis('earth'),
      meridian: (jd) => primeMeridianAt('earth', jd),
    }),
  )

  note('lunar eclipses', lunarEclipses(FROM, TO, earth))

  for (const id of OUTER) {
    note(`${id} oppositions`, oppositions(elements(id), earth, FROM, TO).map((e) => ({ ...e, body: id })))
  }

  for (const id of INNER) {
    note(
      `${id} elongations`,
      greatestElongations(elements(id), earth, FROM, TO).map((e) => ({ ...e, body: id })),
    )
  }

  note(
    'Jupiter–Saturn conjunctions',
    conjunctions(elements('jupiter'), elements('saturn'), earth, FROM, TO).map((e) => ({
      ...e,
      body: 'jupiter',
      with: 'saturn',
    })),
  )

  /*
   * Close approaches: a small body passing near a planet.
   *
   * Every pair of the app's own comets and named asteroids against every
   * planet, which is 160 searches and the reason this is baked rather than
   * computed at load. Most pairs never come within the threshold at all — the
   * search is cheap per step and the sweep is what costs.
   *
   * 0.05 AU is about 7.5 million kilometres, nineteen times the distance to the
   * Moon. It is the conventional bar for a "close approach" in the near-Earth
   * literature and it keeps the list to the ones worth marking on a timeline.
   */
  for (const small of SMALL_BODIES) {
    /*
     * Clipped to the window the elements were actually fitted over.
     *
     * Apophis is fitted from 2000 because it was found in 2004 and its orbit is
     * chaotic — it passes close to the Earth repeatedly, and each pass makes the
     * one before it harder to integrate through. Searching the full 1800–2050
     * range produced five approaches in the nineteenth century, at three to
     * seven million kilometres, every one of them an artefact of extrapolating
     * a fit past its own evidence. They looked exactly as plausible as the real
     * one.
     */
    const from = Math.max(FROM, small.elements.validFrom ?? FROM)
    const to = Math.min(TO, small.elements.validTo ?? TO)

    for (const planet of PLANETS) {
      const rows = closeApproaches(small.elements, planet.elements, from, to, { within: 0.05 })
      if (rows.length === 0) continue
      note(
        `${small.name} near ${planet.name}`,
        rows.map((e) => ({ ...e, body: small.id, with: planet.id })),
      )
    }
  }

  note(
    'ring-plane crossings',
    ringPlaneCrossings(elements('saturn'), earth, poleDirection('saturn'), FROM, TO).map((e) => ({
      ...e,
      body: 'saturn',
    })),
  )

  events.sort((a, b) => a.jd - b.jd)

  const round = (n, places) => Number(n.toFixed(places))
  const rows = events
    .map((e) => {
      const fields = [`kind: '${e.kind}'`, `jd: ${round(e.jd, 5)}`]
      if (e.body) fields.push(`body: '${e.body}'`)
      if (e.with) fields.push(`with: '${e.with}'`)
      if (e.type) fields.push(`type: '${e.type}'`)
      if (e.side) fields.push(`side: '${e.side}'`)
      if (e.degrees !== undefined) fields.push(`degrees: ${round(e.degrees, 2)}`)
      // Kilometres rather than AU: an approach is a human-scale distance, and
      // the number is the app's own — see the note on `closeApproaches` about
      // what it is worth.
      if (e.km !== undefined) fields.push(`km: ${Math.round(e.km)}`)
      if (e.umbralMagnitude !== undefined) {
        fields.push(`umbralMagnitude: ${round(e.umbralMagnitude, 3)}`)
      }
      if (e.latitude !== null && e.latitude !== undefined) {
        fields.push(`latitude: ${round(e.latitude, 2)}`, `longitude: ${round(e.longitude, 2)}`)
      }
      return `  { ${fields.join(', ')} },`
    })
    .join('\n')

  writeFileSync(
    OUT,
    `/**
 * Everything worth setting the clock to, ${new Date(
   (FROM - 2440587.5) * 86400000,
 ).getUTCFullYear()}–${new Date((TO - 2440587.5) * 86400000).getUTCFullYear()}.
 *
 * GENERATED by \`scripts/bake-events.mjs\` — do not hand-edit; rerun
 * \`npm run bake:events\` instead. Generated ${new Date().toISOString().slice(0, 10)}.
 *
 * Not transcribed from an almanac. Every date here was *found* by searching the
 * app's own orbits and orientations (\`src/orbit/events.js\`), which is what
 * makes the list and the scene incapable of disagreeing: set the clock to an
 * eclipse in this file and the eclipse is on screen, because one geometry
 * decided both.
 *
 * Sorted by date, across the window the orbital elements are valid for. Jupiter's
 * shadow transits are not here — there are eight hundred a year — and are found
 * live for whatever day is on screen.
 *
 * \`jd\` is a Julian Date in UT. Solar eclipse latitude and longitude are the
 * point of greatest eclipse, geodetic, degrees east.
 */

/**
 * @typedef {{
 *   kind: 'solar-eclipse' | 'lunar-eclipse' | 'opposition' | 'greatest-elongation'
 *       | 'conjunction' | 'ring-plane-crossing',
 *   jd: number,
 *   body?: string,
 *   with?: string,
 *   type?: string,
 *   side?: 'east' | 'west',
 *   degrees?: number,
 *   umbralMagnitude?: number,
 *   latitude?: number,
 *   longitude?: number,
 * }} SkyEvent
 */

/** @type {SkyEvent[]} */
export const EVENTS = [
${rows}
]
`,
  )

  console.log(`[events] ${events.length} total, wrote ${OUT}`)
}

main()
