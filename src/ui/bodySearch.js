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
import { CONSTELLATION_REGIONS } from '../data/constellations.js'
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
/**
 * Constellations rank below every body, and the collisions are why.
 *
 * Two names belong to both a body and a region of sky: **Hydra** is one of
 * Pluto's moons as well as the largest constellation, and **Phoenix** landed on
 * Mars in 2008. Both are exact matches on both readings, so the tie is decided
 * here and nowhere else.
 *
 * This first placed them above spacecraft, on the reasoning that a
 * constellation is one of 88 while a craft is one of fifty known mainly to
 * people who already know them. Phoenix says otherwise: the lander has a
 * dossier, a trajectory and a landing site in this app, and the constellation
 * is a faint southern figure with no bright star. Ranking the sky above it
 * meant a solar-system app answering a solar-system question with a patch of
 * sky.
 *
 * So the rule is the simple one, and it can be stated in a sentence: on an
 * equally good match, **the solar system comes first**. The constellation is
 * always in the list — `verify-search` asserts that for every collision — it
 * just is not the first answer when a body answers to the same name.
 */
const CLASS_RANK = {
  planet: 6,
  dwarf: 5,
  asteroid: 4.5,
  moon: 4,
  comet: 3,
  spacecraft: 2,
  constellation: 1.5,
}
const classBonus = (entry) =>
  (entry.kind === 'moon' && entry.tier === 'minor' ? 1 : CLASS_RANK[entry.kind]) ?? 0

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

/**
 * Every string a constellation answers to, and the three tiers are the point.
 *
 * The **name** is what someone types. The **English name and the genitive** are
 * worth matching — "great bear" should find Ursa Major, and "Orionis" is what a
 * star chart actually prints — but must not outrank a body's own name.
 *
 * The **abbreviation** is the awkward one and gets its own, much weaker tier.
 * Three letters collide with the front of real names: `cha` is Chamaeleon's
 * abbreviation and the first three letters of Charon, `ari` is Aries and the
 * start of Ariel. Scored as a secondary term, an exact abbreviation hit (90)
 * would beat a body's name prefix (80) and put a faint southern constellation
 * above one of Pluto's moons. At −30 it lands at 70, below every name prefix
 * and above a word-start — which is where "the three-letter code, if you happen
 * to know it" belongs.
 */
function constellationTerms(region) {
  return {
    primary: [region.name],
    secondary: [region.english, region.genitive],
    tertiary: [region.abbr],
  }
}

/**
 * Built once: 515 bodies and 88 regions of sky, and none of them arrive later.
 *
 * One index rather than two, because the two have to be *ranked together*. A
 * separate constellation search would produce a second list with its own scores
 * and no principled way to interleave them — and interleaving is the whole
 * question, since `phoenix` is a lander and a constellation and `hydra` is a
 * moon and a constellation.
 */
const INDEX = [
  ...BODIES.map((body) => ({
    kind: body.kind,
    tier: body.tier,
    id: body.id,
    name: body.name,
    body,
    ...termsFor(body),
  })),
  ...CONSTELLATION_REGIONS.map((region, index) => ({
    kind: 'constellation',
    id: `constellation:${region.abbr}`,
    name: region.name,
    region,
    constellation: index,
    ...constellationTerms(region),
  })),
]

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
  if (body.kind === 'asteroid') return 'Asteroid'
  return 'Planet'
}

/**
 * The second line of any result, body or region.
 *
 * A constellation says plainly what it is. This first said what it *depicts*
 * and how large it is — "Hunter · 594 sq°" — on the reasoning that the class is
 * already carried by the mark beside it, so the line should spend itself on
 * something new. That is the right argument for a *body*, where the classes are
 * six and the marks are learnable, and the wrong one here: a reader scanning a
 * list of Mars, Monoceros and Mars Odyssey needs to know which of them is a
 * constellation before they need to know that Monoceros is a unicorn.
 *
 * The English name and the area are both a click away in the panel, which is
 * where a thing you have to read belongs. A result row is scanned, not read.
 */
export function resultContext(entry) {
  if (entry.kind !== 'constellation') return bodyContext(entry.body)
  return 'Constellation'
}

/**
 * Which heading a result belongs under.
 *
 * Minor moons are their own category rather than being folded in with the
 * major ones, because that is how the app already thinks about them everywhere
 * else — they are a separate layer, scoped to one host at a time, and there are
 * 413 of them against 25. A list that put Phoebe and Europa under one word
 * would be claiming a similarity the rest of the app spends real effort
 * denying.
 */
export function resultCategory(entry) {
  if (entry.kind === 'constellation') return { key: 'constellation', label: 'Constellations' }
  if (entry.kind === 'moon' && entry.tier === 'minor') {
    return { key: 'minorMoon', label: 'Minor moons' }
  }
  return {
    key: entry.kind,
    label: {
      planet: 'Planets',
      dwarf: 'Dwarf planets',
      asteroid: 'Asteroids',
      moon: 'Moons',
      comet: 'Comets',
      spacecraft: 'Spacecraft',
    }[entry.kind] ?? 'Other',
  }
}

/**
 * The same results, gathered under headings.
 *
 * ## It reorders, and that is the point
 *
 * The list has to be *read* in the order it is walked. Leaving the array flat
 * and only drawing headings around it would produce a list whose groups
 * interleave — a spacecraft matched at rank 1 and another at rank 4 belong
 * under one heading, and pulling the second one up is what a heading means. If
 * the array kept its old order while the screen showed the new one, the arrow
 * keys would walk the list invisibly, jumping backwards up the screen.
 *
 * So this returns the entries in the order they are drawn, and the palette
 * indexes that. The *set* is untouched — grouping decides arrangement, never
 * membership, and the twelve results are the same twelve `searchAll` chose.
 *
 * ## Groups are ordered by their best member, not by class
 *
 * A fixed order — planets, then moons, then the rest — would throw away the
 * ranking this module exists for: searching "voyager" would head the list with
 * whatever planet happened to contain those letters, because Planets is
 * always first. Ordering the groups by the best rank inside each keeps the
 * overall first result first, which is the one the Enter key takes.
 */
/**
 * The categories, in the order they are offered when nothing has been typed.
 *
 * Roughly outward and then away from the natural: the planets, the things that
 * orbit with them, the small bodies, what we sent, and finally the sky the lot
 * of it sits against. Not the ranking order — that decides which of two
 * *matches* wins, which is a different question from how to lay out a menu.
 *
 * Counted from the index rather than written down, so a class that grows
 * cannot leave a stale number on screen.
 */
export const CATEGORIES = [
  'planet',
  'dwarf',
  'moon',
  'minorMoon',
  'asteroid',
  'comet',
  'spacecraft',
  'constellation',
].map((key) => {
  const entries = INDEX.filter((entry) => resultCategory(entry).key === key)
  return { key, label: resultCategory(entries[0]).label, count: entries.length, entries }
})

const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]))

/**
 * Everything in one category, in the order its source list holds them.
 *
 * Deliberately not alphabetical. The rosters are already in orders that mean
 * something — the planets run outward from the Sun, the moons are grouped by
 * the planet they belong to and ordered by distance from it — and sorting that
 * into an alphabet would destroy information to gain nothing, since anyone who
 * knows the name they want is typing it rather than reading down a list of 413.
 * The constellations arrive alphabetical already, which is the right order for
 * 88 names with no other structure between them.
 */
export const categoryEntries = (key) => CATEGORY_BY_KEY[key]?.entries ?? []

export function groupResults(entries) {
  const groups = []
  const byKey = new Map()

  for (const entry of entries) {
    const { key, label } = resultCategory(entry)
    let group = byKey.get(key)
    if (!group) {
      group = { key, label, entries: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }

  // `groups` is already in order of first appearance, which is order of best
  // rank: a group is created the first time one of its members is reached.
  return groups
}

/**
 * The best `limit` bodies for `query`, best first.
 *
 * An empty query returns nothing rather than everything: a list of the first
 * twelve of five hundred bodies in array order is not an answer to a question
 * nobody has asked yet, and the palette shows a hint instead.
 */
export function searchAll(query, limit = 12, category = null) {
  const q = squash(query ?? '')
  if (!q) return []

  /*
   * Scoped to one category, when browsing inside one. The ranking is unchanged
   * — the same ladder over a smaller index — so a search within Spacecraft
   * orders its answers exactly as the full search would, minus everything that
   * is not a spacecraft.
   */
  const index = category ? categoryEntries(category) : INDEX

  const hits = []
  for (const entry of index) {
    let score = 0
    for (const term of entry.primary) score = Math.max(score, scoreTerm(term, q))
    // Ten below the same rung on a name, which is less than the gap between
    // rungs — so a designation prefix still beats a name substring.
    for (const term of entry.secondary) score = Math.max(score, scoreTerm(term, q) - 10)
    // And thirty below, which *is* more than the gap between rungs: this tier
    // is deliberately demoted by a whole rung. See `constellationTerms`.
    for (const term of entry.tertiary ?? []) score = Math.max(score, scoreTerm(term, q) - 30)
    if (score > 0) hits.push({ entry, score })
  }

  const ranked = (rows) =>
    rows.sort(
      (a, b) =>
        b.score - a.score ||
        classBonus(b.entry) - classBonus(a.entry) ||
        // A shorter name containing the query is more likely to be the thing
        // meant: `Io` over `Iocaste` for `io`.
        a.entry.name.length - b.entry.name.length ||
        a.entry.name.localeCompare(b.entry.name),
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
  if (literal.length >= limit) return literal.slice(0, limit).map((h) => h.entry)

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
  return [...literal, ...guesses.slice(0, room)].map((h) => h.entry)
}

/**
 * The bodies alone, in the same order they would appear in the full list.
 *
 * Kept because the ranking of *bodies against each other* is the part with two
 * hundred lines of hard-won ordering behind it — `pho` for Phobos over Phoenix,
 * `mar` for Mars over Mars 2020 — and `verify-search` exercises that directly.
 * Asking those questions through a list that also contains constellations would
 * mean every one of them silently became a question about two things at once.
 *
 * Not `filter` on the result: that would ask for twelve, throw the
 * constellations away and return nine. It searches the same index and skips
 * them, so a caller that wants twelve bodies gets twelve.
 */
export function searchBodies(query, limit = 12) {
  return searchAll(query, limit + CONSTELLATION_REGIONS.length)
    .filter((entry) => entry.kind !== 'constellation')
    .slice(0, limit)
    .map((entry) => entry.body)
}
