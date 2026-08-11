/**
 * Bakes each spacecraft's trail length out of Eyes' bundle.
 *
 * ## What a trail length is
 *
 * `TrailComponent` holds `_startTime`, `_endTime = 0` and `_relativeStartTime`,
 * so a trail is the span **`[now - length, now]`** — a window of simulated time
 * ending at the craft, not the whole flight. That one fact is the difference
 * between Eyes' view and a spider's web: this app drew every sample from launch
 * to the present, so sixty-four missions' worth of trajectory sat on screen at
 * once and the inner system disappeared under it.
 *
 * `length` is in **seconds** and `undefined` means "work it out" — see
 * `autoTrailDays` in `trajectory.js` for the formula Eyes uses instead.
 *
 * ## `lengthCoverages`, which is why this is a table and not a constant
 *
 * Half the fleet changes trail length partway through the mission. The entry is
 * `[seconds, etStart, etEnd]`, wired up in Eyes as a `CoverageController` whose
 * enter function calls `setStartTime(seconds)` and whose exit function puts the
 * default back. So the rule is: the *last* coverage window containing the
 * current instant wins, otherwise `length`.
 *
 * It is what makes the trails read as a story rather than as a smear. Voyager 1
 * carries five years of trail through the cruise, sixty days across the Jupiter
 * and Saturn encounters — tightening exactly where the trajectory bends — and
 * thirty years afterwards, when nothing is happening but distance. Curiosity
 * drops to 3,000 seconds through entry, descent and landing. Mars Odyssey runs
 * 10 million seconds on the way there and 6,727 once it is in orbit, which is
 * one revolution.
 *
 * The times are ET seconds past J2000, the same convention as the segment
 * boundaries — see `spacecraft-roster.mjs`. `trajectory.js` compares them in
 * Julian Days, so they are converted here rather than at every frame.
 *
 * Run: node scripts/fetch-spacecraft-trails.mjs
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SPACECRAFT } from './spacecraft-roster.mjs'

const APP_JS = 'https://eyes.nasa.gov/apps/solar-system/app.js'
// `fileURLToPath`, not `.pathname` — this checkout lives under "Solar
// Explorer" and a raw URL pathname keeps the space percent-encoded.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'src', 'data', 'spacecraftTrails.js')

/** J2000 as a Julian Day. ET seconds past it convert by 86400. */
const J2000_JD = 2451545.0
const SECONDS_PER_DAY = 86400

const jdFromEt = (et) => J2000_JD + et / SECONDS_PER_DAY

/**
 * The object literal that follows `key:`, by brace matching.
 *
 * Eyes' entity table is minified with unquoted keys, so there is no JSON to
 * parse and no regex that survives a nested object. Counting braces is the only
 * thing that reliably finds the end of `sc_voyager_1:{...}` when the value
 * contains `lengthCoverages:[[...],[...]]` and a dozen sibling components.
 */
function blockAfter(source, at) {
  const open = source.indexOf('{', at)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const c = source[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return null
}

/**
 * Eyes writes numbers the way a minifier does: `94608e4`, `1e7`,
 * `Number.NEGATIVE_INFINITY`. All three are valid JS, so this evaluates rather
 * than parses — the input is a numeric literal matched by the regex below and
 * nothing else ever reaches here.
 */
function num(text) {
  const t = text.trim()
  if (/^Number\.(NEGATIVE|POSITIVE)_INFINITY$/.test(t)) {
    return t.includes('NEGATIVE') ? -Infinity : Infinity
  }
  const n = Number(t)
  return Number.isNaN(n) ? null : n
}

async function main() {
  process.stdout.write('fetching Eyes app.js ... ')
  const source = await (await fetch(APP_JS)).text()
  console.log(`${(source.length / 1e6).toFixed(2)} MB`)

  const out = {}
  let auto = 0
  let fixed = 0
  let coveraged = 0

  for (const craft of SPACECRAFT) {
    const key = `${craft.id}:{`
    const at = source.indexOf(key)
    if (at < 0) {
      console.log(`  ${craft.id}: no entity block`)
      continue
    }
    const block = blockAfter(source, at + craft.id.length)
    if (!block) continue

    const trailAt = block.indexOf('trail:')
    if (trailAt < 0) {
      console.log(`  ${craft.id}: no trail`)
      continue
    }
    const trail = blockAfter(block, trailAt)
    if (!trail) continue

    const lengthMatch = /length:(void 0|[0-9.e+-]+)/.exec(trail)
    const length = lengthMatch && lengthMatch[1] !== 'void 0' ? num(lengthMatch[1]) : null
    if (length === null) auto++
    else fixed++

    const coverages = []
    const covAt = trail.indexOf('lengthCoverages:')
    if (covAt >= 0) {
      // Each entry is [seconds, etStart, etEnd]; the outer array ends at the
      // first `]` that closes it, which brace matching on `[` finds.
      const open = trail.indexOf('[', covAt)
      let depth = 0
      let close = open
      for (let i = open; i < trail.length; i++) {
        if (trail[i] === '[') depth++
        else if (trail[i] === ']') {
          depth--
          if (depth === 0) {
            close = i + 1
            break
          }
        }
      }
      const body = trail.slice(open, close)
      const entry = /\[\s*([0-9.e+-]+|Number\.[A-Z_]+)\s*,\s*([0-9.e+-]+|Number\.[A-Z_]+)\s*,\s*([0-9.e+-]+|Number\.[A-Z_]+)\s*\]/g
      let m
      while ((m = entry.exec(body))) {
        const seconds = num(m[1])
        const from = num(m[2])
        const to = num(m[3])
        if (seconds === null || from === null || to === null) continue
        coverages.push([seconds / SECONDS_PER_DAY, jdFromEt(from), jdFromEt(to)])
      }
      if (coverages.length) coveraged++
    }

    out[craft.id] = {
      days: length === null ? null : length / SECONDS_PER_DAY,
      coverages,
    }
  }

  const lines = []
  lines.push('/**')
  lines.push(' * How much of each spacecraft\'s flight is drawn behind it.')
  lines.push(' *')
  lines.push(' * Generated by `scripts/fetch-spacecraft-trails.mjs` from NASA\'s Eyes on the')
  lines.push(' * Solar System. Do not edit by hand.')
  lines.push(' *')
  lines.push(' * `days` is the trail\'s span of simulated time ending at the craft, converted')
  lines.push(' * from Eyes\' seconds. `null` means Eyes computes it from the state vector —')
  lines.push(' * see `autoTrailDays` in `trajectory.js`.')
  lines.push(' *')
  lines.push(' * `coverages` are `[days, jdFrom, jdTo]`, converted from ET seconds past')
  lines.push(' * J2000. The last one containing the current instant overrides `days`, which')
  lines.push(' * is how a trail tightens across a flyby and opens out again after it.')
  lines.push(' */')
  lines.push('export const SPACECRAFT_TRAILS = {')
  for (const [id, entry] of Object.entries(out)) {
    const days = entry.days === null ? 'null' : String(Number(entry.days.toPrecision(10)))
    if (!entry.coverages.length) {
      lines.push(`  ${id}: { days: ${days}, coverages: [] },`)
      continue
    }
    lines.push(`  ${id}: {`)
    lines.push(`    days: ${days},`)
    lines.push('    coverages: [')
    for (const [d, from, to] of entry.coverages) {
      const f = from === -Infinity ? '-Infinity' : String(Number(from.toPrecision(12)))
      const t = to === Infinity ? 'Infinity' : String(Number(to.toPrecision(12)))
      lines.push(`      [${Number(d.toPrecision(10))}, ${f}, ${t}],`)
    }
    lines.push('    ],')
    lines.push('  },')
  }
  lines.push('}')
  lines.push('')

  writeFileSync(OUT, lines.join('\n'))
  console.log(
    `\nwrote ${Object.keys(out).length} trails — ${fixed} explicit, ${auto} auto, ${coveraged} with coverages`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
