/**
 * A line of context for whatever the body switcher is currently showing.
 *
 * The switcher sorts the solar system into planets, dwarf planets and moons,
 * and then never says what any of those words mean — which is the one question
 * the arrangement itself provokes. Pluto sits on a different row from Neptune
 * and the bar gives no reason. So each row carries a sentence or two saying
 * what it is, and each planet's moon row carries the most interesting true
 * thing about that particular system.
 *
 * Written to be read once and remembered, so: no numbers that are not doing
 * work, and the point of the sentence first rather than last. Everything here
 * is checkable — the resonances, the recession rate, the dates — and where a
 * figure is rounded it is rounded to something a person would say out loud.
 *
 * Kept out of `planetData.js` and friends because it is about *groups*, not
 * bodies. A per-body fact would belong on the body.
 */

/**
 * The three classes, keyed by the section keys in `NavBar`.
 *
 * The planet and dwarf-planet notes are deliberately two halves of one
 * explanation: the IAU's three tests, and then which of them a dwarf planet
 * fails. Read either way round they answer "why is Pluto not up there with the
 * others", which is the question the bar raises by having two rows at all.
 */
export const SECTION_KEYNOTES = {
  planets:
    'To be a planet, a body has to do three things: orbit the Sun, be heavy enough that its own gravity pulls it round, and sweep its orbital lane clear of everything else. Eight manage all three.',
  dwarfs:
    'A dwarf planet passes the first two tests and fails the third. It is round and it orbits the Sun, but it still shares its lane — Pluto with the Kuiper Belt, Ceres with the asteroid belt. That one missing condition is the whole of the difference.',
  moons:
    'Ganymede and Titan are each larger than the planet Mercury. Nothing about being a moon is a matter of size: it is only a question of what you orbit.',
  comets:
    'A comet is a few kilometres of ice and dust on an orbit that spends almost all of its time far from the Sun and almost none of it close. Four are not coming back: three were flung onto escape paths, and 3I/ATLAS was never bound to the Sun.',
  /*
   * The section had no note at all until now, which is not the same as having a
   * short one: the card is a fixed three lines tall and always mounted, so
   * Spacecraft opened onto an empty pane of glass beside the chips.
   */
  spacecraft:
    'Every other body here is six numbers and a solve, exact for any date forever. A spacecraft launches, burns, and is flung onto new orbits by the planets it passes — so these paths are looked up rather than calculated.',
}

/**
 * One per planet or dwarf planet that has moons here, keyed by body id.
 *
 * Shown when the bar has drilled into that body's moons, so it is about the
 * *system* rather than about the parent — what is worth knowing once you are
 * looking at several bodies going round one.
 */
export const SYSTEM_KEYNOTES = {
  earth:
    'The Moon is drifting away at about 4 cm a year, measured by bouncing lasers off reflectors the Apollo crews left behind. It is also the largest moon relative to its planet anywhere.',

  mars: 'Phobos goes round Mars faster than Mars turns, so from the surface it rises in the west and sets in the east, twice a day. It is also spiralling inward: in a few tens of millions of years it will be pulled apart into a ring.',

  jupiter:
    'Io, Europa and Ganymede are locked in a 1:2:4 rhythm — Io goes round four times for every one of Ganymede\'s, and always will. Galileo saw all four of these in 1610: the first things ever watched orbiting something other than Earth.',

  saturn:
    'Enceladus is only 500 km across and vents water into space through cracks at its south pole. That spray is where Saturn\'s outermost ring comes from — a moon actively building a ring out of itself.',

  uranus:
    'Uranus lies so far on its side that when Voyager 2 passed in 1986 — the only visit ever — half of each moon was in a decades-long night. Half of every map here is guesswork.',

  neptune:
    'Triton orbits backwards — the only large moon in the solar system that does. That is the giveaway that it did not form here: Neptune captured it from the Kuiper Belt, and it is slowly falling inward.',

  pluto:
    'Charon is half Pluto\'s width, and heavy enough to swing Pluto around in turn, so the two orbit a point in the empty space between them. Each keeps the same face permanently toward the other.',
}
