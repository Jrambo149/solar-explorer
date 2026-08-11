/**
 * How each spacecraft is *oriented*, taken from Eyes on the Solar System.
 *
 * Position and attitude are separate problems and this app had only solved the
 * first. A craft was drawn in exactly the right place pointing whichever way its
 * modeller happened to author it — which for a spacecraft is more wrong than it
 * sounds, because the shape carries the meaning: a high-gain dish faces Earth, a
 * solar array faces the Sun, and a spin-stabilised probe spins.
 *
 * ## What Eyes stores
 *
 * Every entity carries a `controllers` array. Most entries are `dynamo` — the
 * trajectory streams `fetch-spacecraft.mjs` already bakes — and the rest are the
 * attitude chain, applied in order:
 *
 *     {type:"spin",   axis, periodInHours, relativeToTime?, axisInFrameSpace?}
 *     {type:"align",  primary:{type:"point"|"velocity", target, axis}, secondary}
 *     {type:"fixed",  orientation}
 *     {type:"coverage", ...}   the time window a controller applies over
 *
 * Counted across the 75 craft in the roster: 86 `align`, 61 `point`, 29 `fixed`,
 * 17 `velocity` — and **7 `spin`**. Spinning is the exception, not the rule, and
 * that is worth knowing before building anything: the interesting general case
 * is pointing, not rotation.
 *
 * ## What this bakes, and what it does not
 *
 * The two pieces that stand alone: the **axis correction** and the **spin**.
 * Both are constants per craft; neither needs to know where anything else is.
 *
 * `align`/`point`/`velocity` are deliberately left out. They are not constants —
 * they resolve against another body's position at the current instant, or
 * against the craft's own velocity — so they belong in the frame loop next to
 * the position solve rather than in a baked table. That is a larger piece of
 * work and it is not what this file is for.
 *
 * ## The axis correction was already scraped, and already dropped
 *
 * `rotate` has been in `spacecraft-roster.mjs` since the roster was first read
 * out of Eyes, on 40 of the 75 craft, and nothing has ever consumed it — it is
 * not carried into `spacecraftData.js` and `Spacecraft.jsx` never asks for it.
 * So every one of those 40 has been drawn in its authored attitude rather than
 * the corrected one: Voyager, both Pioneers, Lucy, Psyche, New Horizons and LRO
 * among the ten currently on screen. Reading it here is less a new feature than
 * finishing a job that was started.
 *
 * Usage: `npm run fetch:attitude`. Needs the network; writes
 * `src/data/spacecraftAttitude.js`.
 */

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { BODIES } from '../src/data/bodies.js'
import { SPACECRAFT } from './spacecraft-roster.mjs'

const APP_JS = 'https://eyes.nasa.gov/apps/solar-system/app.js'

/*
 * A browser user agent, which is load-bearing rather than cargo-culted: the
 * bare request is answered with a 403 and a 243-byte error page. The same
 * bundle in a browser tab serves fine, so the block is on the client string.
 */
const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
}

/** Eyes' axis constants, as unit vectors in its own frame. */
const AXES = {
  XAxis: [1, 0, 0],
  YAxis: [0, 1, 0],
  ZAxis: [0, 0, 1],
  XAxisNeg: [-1, 0, 0],
  YAxisNeg: [0, -1, 0],
  ZAxisNeg: [0, 0, -1],
}

/**
 * Eyes' name for a body, translated to this app's.
 *
 * One entry, and it cost an afternoon. Eyes calls Earth's moon `moon`; the
 * registry here calls it `luna`. `planetPositions.get('moon')` is therefore
 * `undefined`, `resolve` returns null, and the arm is skipped — so LRO kept
 * whatever roll the primary aim happened to leave it with and sat 57° off the
 * nadir it is supposed to be looking at, with nothing logged anywhere.
 *
 * Translated at bake time rather than at runtime so the data file speaks one
 * vocabulary and the frame loop has no dictionary in it.
 */
const RENAMED = { moon: 'luna' }

/** Seconds past J2000 (SPICE ET, which is what Eyes stores) to julian date. */
const J2000_JD = 2451545.0
const etToJD = (et) => J2000_JD + et / 86400

/**
 * The balanced `[...]` or `{...}` starting at `from`.
 *
 * A brace match rather than a regex for the same reason the roster parse uses
 * one: these are nested object literals in a minified bundle, and a regex that
 * appears to work on them is a regex that has not met a nested array yet.
 */
function balanced(text, from, open, close) {
  let depth = 0
  for (let i = from; i < text.length; i++) {
    if (text[i] === open) depth++
    else if (text[i] === close) {
      depth--
      if (depth === 0) return text.slice(from, i + 1)
    }
  }
  return null
}

/** The controllers array for one craft, or null. */
function controllersFor(js, id) {
  // Keys are unquoted in the bundle — `sc_themis_b:{groups:` — so a search for
  // the quoted form finds nothing at all, quietly, for all 75.
  const at = js.indexOf(`${id}:{groups:`)
  if (at === -1) return null
  const list = js.indexOf('controllers:[', at)
  if (list === -1) return null
  return balanced(js, list + 'controllers:'.length, '[', ']')
}

/** The spin controller's fields, or null if this craft does not spin. */
function spinFrom(controllers) {
  const at = controllers.indexOf('type:"spin"')
  if (at === -1) return null
  const block = balanced(controllers, controllers.lastIndexOf('{', at), '{', '}')
  if (!block) return null

  const axisName = block.match(/axis:s\.Vector3\.(\w+)/)?.[1]
  const axis = AXES[axisName]
  if (!axis) throw new Error(`unknown spin axis ${axisName}`)

  // `periodInHours` is written both as a literal and as an expression — Galileo
  // is `1/624`. Evaluating the slice is safe here and honest: it is a number
  // written the way its author found clearest.
  const periodText = block.match(/periodInHours:([^,}]+)/)?.[1]
  const hours = Number(periodText.includes('/') ? eval(periodText) : periodText)
  if (!(hours > 0)) throw new Error(`bad spin period ${periodText}`)

  const epoch = block.match(/relativeToTime:(-?[\d.e+-]+)/)?.[1]

  return {
    axis,
    periodDays: hours / 24,
    // Where phase zero sits. Absent means the epoch does not matter, which is
    // true of anything spinning fast enough that no one could tell.
    epochJD: epoch === undefined ? null : etToJD(Number(epoch)),
    // Eyes distinguishes an axis in the *reference frame* from one in the
    // model's own space. Only Galileo sets it.
    inFrame: /axisInFrameSpace:!0/.test(block),
  }
}

/**
 * One arm of an align controller — the primary or the secondary.
 *
 * `type` is how the target direction is found, and Eyes' `_getAxis` gives all
 * four meanings plainly:
 *
 *     point     the direction from *this craft* to the target's position
 *     velocity  the target's velocity, normalised (the target is the craft itself)
 *     align     an axis of the target's own orientation, `targetAxis`
 *     position  the direction from the origin to the target
 *
 * `axis` is always the **model's** axis that gets aimed, in the model's authored
 * space — Eyes rotates it by the model's base rotation before use, which is the
 * axis correction, so the two compose in that order and only that order.
 */
function armFrom(text) {
  if (!text) return null
  const type = text.match(/type:"(\w+)"/)?.[1]
  const axis = AXES[text.match(/axis:s\.Vector3\.(\w+)/)?.[1]]
  if (!type || !axis) return null

  const target = text.match(/target:"([^"]+)"/)?.[1] ?? null
  const arm = { type, axis, target: target === null ? null : (RENAMED[target] ?? target) }

  const targetAxis = text.match(/targetAxis:s\.Vector3\.(\w+)/)?.[1]
  if (targetAxis) arm.targetAxis = AXES[targetAxis]
  return arm
}

/** The `{...}` value of `key:` inside `text`, or null. */
function member(text, key) {
  const at = text.indexOf(`${key}:{`)
  if (at === -1) return null
  return balanced(text, at + key.length + 1, '{', '}')
}

/**
 * The craft's pointing rule, or null if it has none.
 *
 * The **first** align controller only. Several craft carry more than one, gated
 * by `coverage` windows — a different attitude during cruise than in orbit —
 * and honouring that means carrying the windows and choosing per frame. Left
 * out deliberately: the first is the one that covers the mission's long middle,
 * which is where these craft spend their time and where anyone will see them.
 */
function alignFrom(controllers) {
  const at = controllers.indexOf('type:"align"')
  if (at === -1) return null
  const block = balanced(controllers, controllers.lastIndexOf('{', at), '{', '}')
  if (!block) return null

  const primary = armFrom(member(block, 'primary'))
  if (!primary) return null

  return { primary, secondary: armFrom(member(block, 'secondary')) }
}

const js = await (async () => {
  const res = await fetch(APP_JS, { headers: HEADERS })
  if (!res.ok) throw new Error(`Eyes' app.js: HTTP ${res.status}`)
  return res.text()
})()

const out = {}
let spinning = 0
let pointing = 0
let corrected = 0
const missing = []

for (const craft of SPACECRAFT) {
  const controllers = controllersFor(js, craft.id)
  if (!controllers) {
    missing.push(craft.id)
    continue
  }

  const spin = spinFrom(controllers)
  const align = alignFrom(controllers)
  if (spin) spinning++
  if (align) pointing++
  if (craft.rotate) corrected++

  if (spin || align || craft.rotate) {
    out[craft.id] = { rotate: craft.rotate ?? null, spin, align }
  }
}

if (missing.length) {
  console.warn(`[attitude] not found in Eyes: ${missing.join(', ')}`)
}

/*
 * Every target has to name something this app can find, or the arm using it is
 * dead weight that fails silently at runtime — which is exactly how the
 * moon/luna rename hid.
 *
 * A spacecraft target is reported rather than treated as an error: those resolve
 * only while that craft is itself drawn, and the allowlist is deliberately
 * short. `resolve` degrades to the primary aim when one is missing, which is the
 * right behaviour; this is here so the reason is visible instead of guessed at.
 */
const known = new Set([...BODIES.map((b) => b.id), 'sun'])
const unresolved = new Set()
for (const spec of Object.values(out)) {
  for (const arm of [spec.align?.primary, spec.align?.secondary]) {
    if (arm?.target && !known.has(arm.target)) unresolved.add(arm.target)
  }
}
const craftTargets = [...unresolved].filter((t) => t.startsWith('sc_'))
const bodyTargets = [...unresolved].filter((t) => !t.startsWith('sc_'))

if (bodyTargets.length) {
  throw new Error(
    `[attitude] these targets name no body in the registry: ${bodyTargets.join(', ')}. ` +
      'Add them to RENAMED, or the arms using them will be skipped in silence.',
  )
}
if (craftTargets.length) {
  console.log(
    `[attitude] ${craftTargets.length} arms target craft outside the drawn roster ` +
      `(${craftTargets.slice(0, 4).join(', ')}${craftTargets.length > 4 ? ', …' : ''}) — ` +
      'those fall back to the primary aim until the craft are drawn.',
  )
}

const body = `/**
 * Spacecraft orientation, baked from Eyes on the Solar System.
 *
 * Generated by \`scripts/fetch-spacecraft-attitude.mjs\` — do not edit by hand.
 *
 * \`rotate\` is Eyes' correction from the model's authored axes into its scene,
 * applied in order, in degrees. \`spin\` is a constant rotation about one axis:
 * \`periodDays\` is the period, \`epochJD\` the instant phase zero is measured
 * from (null where Eyes gives none), and \`inFrame\` marks an axis expressed in
 * the reference frame rather than in the model's own space.
 *
 * ${spinning} of ${SPACECRAFT.length} craft spin, ${pointing} point, ${corrected} carry an axis correction.
 */

export const SPACECRAFT_ATTITUDE = ${JSON.stringify(out, null, 2)}
`

const here = dirname(fileURLToPath(import.meta.url))
const path = join(here, '..', 'src', 'data', 'spacecraftAttitude.js')
await writeFile(path, body)

console.log(`[attitude] ${spinning} spinning, ${pointing} pointing, ` +
  `${corrected} axis corrections, ${Object.keys(out).length} craft written`)
