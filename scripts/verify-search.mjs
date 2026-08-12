/**
 * The search finds the thing you meant.
 *
 * A ranking cannot fail loudly. It always returns a list, the list is always
 * full of real bodies, and every entry in it genuinely contains the letters
 * typed — so a ranking that is wrong looks exactly like a ranking that is
 * right until you notice that `mars` offered Mars 2020 first, or that `io` led
 * with Iocaste. That is the whole reason the matcher lives in its own module
 * away from the component: this file is the only thing that can tell.
 *
 * Pure — no browser. `bodySearch` imports only the body tables.
 *
 *   node scripts/verify-search.mjs
 */

import { searchBodies } from '../src/ui/bodySearch.js'
import { BODIES, BODIES_BY_ID } from '../src/data/bodies.js'
import { LANDED_CRAFT } from '../src/data/landedCraft.js'

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const first = (q) => searchBodies(q, 1)[0]?.id ?? null
const ids = (q, n = 12) => searchBodies(q, n).map((b) => b.id)

console.log('\nWhat the first result is\n')

/*
 * The query, and the body the person typing it meant. Every one of these has a
 * plausible wrong answer that shares the letters — that is why it is on the
 * list. `mar` has 17 Mars missions and a dozen moons behind it; `europ` has
 * Europa and Europa Clipper; `io` is a two-letter name inside forty others.
 */
const MEANT = [
  ['mars', 'mars'],
  ['mar', 'mars'],
  ['io', 'io'],
  ['europa', 'europa'],
  ['titan', 'titan'],
  ['pluto', 'pluto'],
  ['ceres', 'ceres'],
  ['phobos', 'phobos'],
  ['phoebe', 'phoebe'],
  ['charon', 'charon'],
  ['jupiter', 'jupiter'],
  ['moon', 'luna'],
  ['voyager 1', 'sc_voyager_1'],
  ['cassini', 'sc_cassini'],
  ['juno', 'sc_juno'],
  ['halley', '1p_halley'],
]

for (const [q, id] of MEANT) {
  const got = first(q)
  check(`"${q}" → ${id}`, got === id, got === id ? null : `got ${got}`)
}

console.log('\nNames nobody can type as they are written\n')

/*
 * Three different kinds of character that a search must see through, and all
 * three are in the data rather than invented for this check.
 *
 * `ʻOumuamua` opens with U+02BB, a modifier letter — NFD does not decompose it
 * and no keyboard offers it. The comet designations carry slashes and en
 * dashes. And the provisional moon designations are half spaces.
 */
const FOLDED = [
  ['oumuamua', '1i_oumuamua'],
  ['67p', '67p_churyumov_gerasimenko'],
  ['churyumov', '67p_churyumov_gerasimenko'],
  ['hale bopp', 'c_1995_o1'],
  ['halebopp', 'c_1995_o1'],
]

for (const [q, id] of FOLDED) {
  const got = first(q)
  check(`"${q}" → ${id}`, got === id, got === id ? null : `got ${got}`)
}

console.log('\nBoth names of a landed craft\n')

/*
 * A rover and its mission are the same row under two names, and the app itself
 * switches between them at touchdown. The search has to answer to both at every
 * date, because someone typing "Curiosity" in 1990 has not made a mistake — the
 * selection carries the clock to the mission.
 */
for (const [id, site] of Object.entries(LANDED_CRAFT)) {
  const body = BODIES_BY_ID[id]
  for (const q of [site.name, body.name]) {
    const got = first(q)
    check(`"${q}" → ${id}`, got === id, got === id ? null : `got ${got}`)
  }
}

console.log('\nRanking rules\n')

/*
 * The tie-breaks, stated as the comparisons they exist to win. Each of these
 * was a real ordering before the rule that fixes it: a substring match on a
 * minor moon outranked an exact name, or a designation outranked a planet.
 */
const BEFORE = [
  ['io', 'io', 'iocaste', 'an exact name beats a longer one containing it'],
  ['pho', 'phobos', 'sc_phoenix', 'a named moon beats a spacecraft on a tie'],
  ['j', 'jupiter', 's2003j12', 'a name beats a provisional designation'],
  ['sat', 'saturn', 'sao', 'a prefix beats a scattered subsequence'],
  ['tita', 'titan', 'titania', 'a shorter name first when both are prefixes'],
  ['gan', 'ganymede', 'ganymed', 'a major moon before a minor one'],
]

for (const [q, winner, loser, why] of BEFORE) {
  const list = ids(q, 40)
  const i = list.indexOf(winner)
  const j = list.indexOf(loser)
  const ok = i >= 0 && (j === -1 || i < j)
  check(`"${q}": ${winner} before ${loser} — ${why}`, ok, ok ? null : `order ${list.slice(0, 4)}`)
}

console.log('\nGuesses fill the list rather than lengthening it\n')

/*
 * A subsequence match hits almost anything across five hundred names. `pho`
 * offered Danuri and Churyumov–Gerasimenko below the seven bodies whose names
 * actually contain those letters — `p…h…o` is scattered through both — and one
 * unrelated comet in a list makes the whole list look like it is guessing.
 */
const literal = (q, id) => {
  const name = BODIES_BY_ID[id].name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return name.includes(q)
}

for (const q of ['pho', 'ura', 'ceres', 'tit']) {
  const list = ids(q)
  const guesses = list.filter((id) => !literal(q, id) && !BODIES_BY_ID[id].designation)
  // Fewer bodies contain the letters than the list can hold, so the guesses are
  // allowed — but only after every literal match, never in place of one.
  const firstGuess = list.findIndex((id) => !literal(q, id))
  const lastLiteral = list.reduce((acc, id, i) => (literal(q, id) ? i : acc), -1)
  check(
    `"${q}": every name containing the letters comes first`,
    firstGuess === -1 || firstGuess > lastLiteral,
    `${list.slice(0, 5).join(', ')} (${guesses.length} guesses)`,
  )
}

// A misspelling is the one case where the guesses are all there is, so the cap
// on them has to lift when nothing matched properly.
check(
  'a name typed with a letter missing still finds it',
  first('ganymeed') === 'ganymede' || ids('ganymeed').includes('ganymede'),
  ids('ganymeed').slice(0, 3).join(', '),
)
check('and a name typed with its vowels dropped', ids('gnmd').includes('ganymede'))

console.log('\nEverything is reachable\n')

/*
 * The point of the whole feature: every body in the app can be got to by typing
 * its own name. Five hundred and fifteen of them, and the ones that would fail
 * are exactly the ones nobody would notice — a moon whose name is a substring
 * of forty others, sitting at rank thirteen of a list that shows twelve.
 */
let unreachable = []
for (const body of BODIES) {
  if (!searchBodies(body.name, 12).some((b) => b.id === body.id)) unreachable.push(body.name)
}
check(
  `all ${BODIES.length} bodies found by their own name`,
  unreachable.length === 0,
  unreachable.length ? `missed ${unreachable.slice(0, 6).join(', ')}` : null,
)

// And by id, which is what a link or a console session hands you.
unreachable = []
for (const body of BODIES) {
  const q = body.id.replace(/^sc_/, '').replace(/_/g, ' ')
  if (!searchBodies(q, 12).some((b) => b.id === body.id)) unreachable.push(body.id)
}
check(
  `all ${BODIES.length} bodies found by their id`,
  unreachable.length === 0,
  unreachable.length ? `missed ${unreachable.slice(0, 6).join(', ')}` : null,
)

console.log('\nThe empty query\n')

// Not "everything": the first twelve of five hundred bodies in array order is
// not an answer to a question nobody has asked.
check('"" returns nothing', searchBodies('', 12).length === 0)
check('"   " returns nothing', searchBodies('   ', 12).length === 0)
check('a query matching nothing returns nothing', searchBodies('qqzz', 12).length === 0)
check('the limit is honoured', searchBodies('a', 5).length === 5)

console.log(failures ? `\n${failures} failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
