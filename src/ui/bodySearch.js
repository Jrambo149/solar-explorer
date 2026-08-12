/**
 * Finding one body among five hundred and fifteen.
 *
 * The nav bar browses; this finds. They are different acts and the bar is bad
 * at the second one: reaching Phoebe from a cold start is Moons → Saturn →
 * Minor → Norse → a chip in a row of forty-six, and that is only possible at
 * all because someone already knew Phoebe is a Saturnian irregular. Nobody
 * types a name in order to be told where it lives in a taxonomy.
 *
 * Kept apart from the component that draws it because the ranking is the part
 * that can be wrong, and a ranking is testable without a browser — see
 * `scripts/verify-search.mjs`. The component is then only a list.
 */

import { BODIES, BODIES_BY_ID } from '../data/bodies.js'
import { LANDED_CRAFT } from '../data/landedCraft.js'

/**
 * Case, accents and punctuation, all removed.
 *
 * `ʻOumuamua` opens with U+02BB, a modifier letter rather than a combining
 * mark, so NFD leaves it standing and nobody types it: it has to be stripped as
 * punctuation. The same pass is what makes `67p` match `67P/Churyumov–
 * Gerasimenko` (an en dash, not a hyphen) and `s1989n6` match `S/1989 N6`.
 */
const squash = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** The words of a name, folded but not squashed together. */
const words = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/**
 * Is `q` scattered through `text` in order?
 *
 * The last resort, and deliberately the weakest: it is what catches `gnmd` for
 * Ganymede and a name typed with a letter missing. Across five hundred names a
 * subsequence match will hit almost anything, which is why it scores below
 * every literal match and is refused below three characters.
 */
function subsequence(text, q) {
  let i = 0
  for (const ch of text) {
    if (ch === q[i]) i++
    if (i === q.length) return true
  }
  return false
}

/**
 * How well one term answers the query, or 0.
 *
 * The ladder is ordered by how sure the person typing is likely to be, and the
 * gaps between rungs are wide enough that no combination of tie-breaks below
 * can push a weaker kind of match above a stronger one.
 */
function scoreTerm(term, q) {
  const flat = squash(term)
  if (!flat) return 0
  if (flat === q) return 100
  if (flat.startsWith(q)) return 80
  // A word-start inside the name: `gerasimenko`, `ATLAS`, `Science Laboratory`.
  if (words(term).some((w) => w.startsWith(q))) return 60
  if (flat.includes(q)) return 40
  /*
   * A subsequence sees a letter *dropped*, never one typed twice — `ganymde`
   * finds Ganymede and `ganymeed` does not, because the second `e` has nothing
   * left to match against. Collapsing runs in the query is the whole of the
   * repair: it costs one pass, it is the commonest typo there is, and it does
   * not weaken anything above, since `oo` and `ll` in a real name are still
   * matched literally by the four rungs before this one.
   */
  if (q.length >= 3 && (subsequence(flat, q) || subsequence(flat, q.replace(/(.)\1+/g, '$1'))))
    return 20
  return 0
}

/**
 * The order a tie is broken in: what someone typing three letters most likely
 * meant. `mar` is Mars before Mars 2020 before S/2003 J 12.
 *
 * Major moons sit above spacecraft, which is not the order the classes were
 * first written in and is what `pho` settled: Phoenix, Phobos and Phoebe are
 * all prefix matches, and putting the craft first meant the lander that stopped
 * answering in 2010 outranked the moon of Mars. A named moon is a place; the
 * fifty craft are mostly known to the people who already know their names, and
 * those people type more than three letters.
 */
const CLASS_RANK = { planet: 6, dwarf: 5, moon: 4, comet: 3, spacecraft: 2 }
const classBonus = (body) =>
  (body.kind === 'moon' && body.tier === 'minor' ? 1 : CLASS_RANK[body.kind]) ?? 0

/** Below this a match is a guess rather than a reading of the letters typed. */
const LITERAL = 30

/**
 * Every string a body answers to.
 *
 * Primary terms are names — the thing a person types. Secondary terms are
 * catalogue strings, worth matching but never worth outranking a name: `S/2003
 * J 12` should not beat Jupiter for `j`.
 *
 * Both names of a landed craft are indexed at once, and unconditionally. The
 * app calls the same object Mars 2020 before February 2021 and Perseverance
 * after — see `bodyNameFor` — but a search for a rover in 2005 is not a
 * mistake, and selecting it moves the clock to the mission anyway.
 */
function termsFor(body) {
  const primary = [body.name]
  const alias = LANDED_CRAFT[body.id]?.name
  if (alias && alias !== body.name) primary.push(alias)

  const secondary = []
  if (body.designation) secondary.push(body.designation)
  // Ids are searchable because they are what a URL or a console session shows,
  // and `sc_` is a prefix of the store rather than of anything anyone types.
  const id = body.id.replace(/^sc_/, '').replace(/_/g, ' ')
  if (squash(id) !== squash(body.name)) secondary.push(id)

  return { primary, secondary }
}

/** Built once. 515 bodies, and none of them arrive later. */
const INDEX = BODIES.map((body) => ({ body, ...termsFor(body) }))

/**
 * Where a body sits, as a person would say it — the second line of a result.
 *
 * Not the class name on its own: "Moon" under Ganymede tells you nothing you
 * did not get from the picture of Jupiter beside it. What is worth saying is
 * whose it is.
 */
export function bodyContext(body) {
  const parent = body.parent ? BODIES_BY_ID[body.parent] : null
  if (parent) return `${body.tier === 'minor' ? 'Minor moon' : 'Moon'} of ${parent.name}`
  if (body.kind === 'spacecraft') return 'Spacecraft'
  if (body.kind === 'comet') return body.open ? 'Interstellar object' : 'Comet'
  if (body.kind === 'dwarf') return 'Dwarf planet'
  return 'Planet'
}

/**
 * The best `limit` bodies for `query`, best first.
 *
 * An empty query returns nothing rather than everything: a list of the first
 * twelve of five hundred bodies in array order is not an answer to a question
 * nobody has asked yet, and the palette shows a hint instead.
 */
export function searchBodies(query, limit = 12) {
  const q = squash(query ?? '')
  if (!q) return []

  const hits = []
  for (const entry of INDEX) {
    let score = 0
    for (const term of entry.primary) score = Math.max(score, scoreTerm(term, q))
    // Ten below the same rung on a name, which is less than the gap between
    // rungs — so a designation prefix still beats a name substring.
    for (const term of entry.secondary) score = Math.max(score, scoreTerm(term, q) - 10)
    if (score > 0) hits.push({ body: entry.body, score })
  }

  const ranked = (rows) =>
    rows.sort(
      (a, b) =>
        b.score - a.score ||
        classBonus(b.body) - classBonus(a.body) ||
        // A shorter name containing the query is more likely to be the thing
        // meant: `Io` over `Iocaste` for `io`.
        a.body.name.length - b.body.name.length ||
        a.body.name.localeCompare(b.body.name),
    )

  /*
   * Guesses fill the list; they never lengthen it.
   *
   * A subsequence match will hit almost anything across five hundred names, and
   * ranking it merely *last* is not enough — `pho` found seven bodies whose
   * names contain those letters and then padded the list out with Danuri and
   * Churyumov–Gerasimenko, because `p…h…o` is scattered through both. Offering
   * a comet as an answer to a search for Phobos makes the whole list look
   * unreliable, so the fuzzy tier only appears when the literal one has left
   * room.
   */
  const literal = ranked(hits.filter((h) => h.score >= LITERAL))
  if (literal.length >= limit) return literal.slice(0, limit).map((h) => h.body)

  /*
   * And a short tail at that, once anything has matched properly. Filling all
   * twelve rows left `pho` — which three bodies answer to — showing nine more
   * that merely have a p, an h and an o somewhere in that order, so the true
   * answers looked like the top of a long list rather than the whole of a short
   * one. With nothing literal to show, the guesses are all there is and the
   * limit is the only cap: that is the misspelling case they exist for.
   */
  const room = literal.length ? Math.min(3, limit - literal.length) : limit
  const guesses = ranked(hits.filter((h) => h.score < LITERAL))
  return [...literal, ...guesses.slice(0, room)].map((h) => h.body)
}
