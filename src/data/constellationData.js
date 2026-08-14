/**
 * What each of the 88 constellations is, and why anyone should care.
 *
 * `constellations.js` is generated and says where each one *is* — its
 * boundaries, its area, its stars. This file is the half no dataset carries:
 * what the figure depicts, who put it there, and what is worth looking at
 * inside it. It is hand-written, in the same spirit as `planetData.js`.
 *
 * ## What is claimed here, and what is not
 *
 * Everything measurable lives in the generated file and is derived from
 * catalogues — areas, star counts, brightest members, which constellation a
 * point is in. Nothing in this file is a measurement, so nothing in it can put
 * a star in the wrong place.
 *
 * What it does claim is history, and history is where the confident wrong
 * answer lives. The dates and attributions here follow the conventional
 * account: Ptolemy's 48 are the ones listed in the Almagest around AD 150,
 * themselves inherited from Babylonian and Greek astronomy centuries older;
 * the southern figures are credited to the observers who first recorded them
 * for European charts, which is a narrower claim than inventing them, since the
 * southern sky had been named for millennia by people who lived under it.
 *
 * ## Why the stories are here at all
 *
 * Because they are the reason the constellations exist. A constellation is not
 * a structure — the stars of Orion are nowhere near each other and share
 * nothing but a line of sight — so what is actually being looked at is a
 * four-thousand-year-old habit of seeing. Stating the myth is stating what the
 * figure *is*; leaving it out and printing only the area in square degrees
 * would describe the box and not the thing in it.
 */

/**
 * Who introduced each figure, expanded from the `origin` key in the generated
 * file. Six sources account for all 88.
 */
export const CONSTELLATION_ORIGINS = {
  ptolemy: {
    label: 'Ancient — listed by Ptolemy, c. AD 150',
    note: 'One of the 48 in Ptolemy’s Almagest, and older than that book: most came to Greek astronomy from Babylon, some of them already more than two thousand years old when he wrote them down.',
  },
  lacaille: {
    label: 'Nicolas-Louis de Lacaille, 1756',
    note: 'One of fourteen Lacaille added after two years at the Cape of Good Hope, where he catalogued nearly ten thousand southern stars. He named almost all of them after instruments of the arts and sciences, which is why the southern sky holds a Furnace, an Air Pump and a Telescope.',
  },
  argo: {
    label: 'A piece of Argo Navis, divided in 1756',
    note: 'Argo Navis, the ship of the Argonauts, was the forty-eighth of Ptolemy’s constellations and by far the largest ever recognised — so large that Lacaille broke it into the keel, the stern and the sails. It is the only classical constellation to have been abolished, and its stars kept their original Greek letters through the division, which is why two of the three pieces have no Alpha.',
  },
  keyser: {
    label: 'Keyser and de Houtman, 1598',
    note: 'One of twelve figures charted by two Dutch navigators on the first Dutch voyage to the East Indies, filling in a region of sky no European had recorded. Most are exotic animals, which is what a sailor newly arrived in the tropics had to hand.',
  },
  plancius: {
    label: 'Petrus Plancius, 1592–1613',
    note: 'Introduced by the Dutch cartographer and clergyman Petrus Plancius, who commissioned the southern observations of Keyser and de Houtman and put the results on his globes.',
  },
  hevelius: {
    label: 'Johannes Hevelius, 1687',
    note: 'One of seven still-used figures Hevelius drew from faint stars left over between the ancient constellations, published in his star atlas three years after his death. He observed with open sights to the end, refusing the telescope for measuring positions.',
  },
  vopel: {
    label: 'Caspar Vopel, 1536',
    note: 'Placed on a globe by Caspar Vopel and made standard by Tycho Brahe, from stars Ptolemy had counted as part of Leo.',
  },
}

/**
 * The twelve of the zodiac.
 *
 * A property of the sky rather than of astrology: these are the constellations
 * the ecliptic — the Sun's path — passes through. The list is famously wrong by
 * one, and the boundaries prove it: the ecliptic crosses **thirteen** regions,
 * spending about three weeks of every year in Ophiuchus. That is not a modern
 * revision or a discovery, it is a consequence of the 1930 boundaries being
 * drawn as boxes rather than to fit the old figures.
 *
 * `verify-constellations` walks the ecliptic and checks this list against the
 * regions it actually crosses, so the claim is measured rather than asserted.
 */
export const ZODIAC = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc']

/**
 * The dossiers, by IAU abbreviation.
 *
 * `meaning` is what the name denotes, in a few words. `description` is two or
 * three sentences on what it is. `facts` are the things worth knowing, one per
 * line, and they are where the deep-sky objects, the record holders and the
 * good stories go.
 */
export const CONSTELLATION_DOSSIERS = {
  And: {
    meaning: 'Andromeda, the chained princess',
    description:
      'The daughter of Cassiopeia and Cepheus, chained to a rock as a sacrifice to the sea monster Cetus and rescued by Perseus. All four of them, and the monster, are neighbours in this part of the sky — one of the very few places where a whole myth is laid out in adjacent constellations.',
    facts: [
      'Holds the Andromeda Galaxy, at 2.5 million light years the most distant thing the unaided eye can see. It is a genuinely naked-eye object from a dark site, and it looks like a smudge.',
      'That galaxy is approaching us at 110 km/s and will merge with the Milky Way in about four and a half billion years.',
      'Its brightest star, Alpheratz, is shared with Pegasus: it forms one corner of the Great Square, and was once catalogued as Delta Pegasi.',
    ],
  },
  Ant: {
    meaning: 'The air pump',
    description:
      'A faint patch of southern sky named by Lacaille for the air pump — the machine that made the study of vacuum possible in the seventeenth century. Nothing in it is brighter than magnitude 4.2.',
    facts: [
      'Named for Denis Papin’s pump, the instrument Robert Boyle used to show that sound will not travel through a vacuum.',
      'Contains the Antlia Dwarf, a small galaxy of the Local Group only recognised in 1997.',
    ],
  },
  Aps: {
    meaning: 'The bird of paradise',
    description:
      'A small, dim figure close to the south celestial pole, charted by the Dutch navigators from the tropics. The name is Greek for "without feet".',
    facts: [
      'The name records a mistake: bird-of-paradise skins reached Europe with the feet cut off, and the birds were long believed to stay permanently airborne, never landing.',
      'It lies far enough south that it has never been visible from Europe at any point in history.',
    ],
  },
  Aqr: {
    meaning: 'The water bearer',
    description:
      'One of the oldest constellations, a figure pouring water that was already the Babylonian "Great One" three thousand years ago. It sits in a region of sky the Greeks called the Sea, alongside the fish, the sea goat, the whale and the river.',
    facts: [
      'The Helix Nebula lies here — the nearest bright planetary nebula, a dying Sun-like star seen almost face-on, and one of the largest such objects in the sky.',
      'The Eta Aquariid meteors each May are debris from Halley’s Comet, which crosses this part of the sky.',
    ],
  },
  Aql: {
    meaning: 'The eagle',
    description:
      'The eagle that carried Zeus’s thunderbolts, and in another telling the bird that snatched Ganymede up to Olympus. It lies along the Milky Way, so a small telescope pointed anywhere in it lands on star fields.',
    facts: [
      'Altair, its brightest star, is one of the nearest naked-eye stars at 17 light years, and spins so fast — a full turn in nine hours — that it is measurably flattened, its equator a fifth wider than its poles.',
      'Altair forms the Summer Triangle with Vega and Deneb, the three brightest stars of the northern summer sky.',
    ],
  },
  Ara: {
    meaning: 'The altar',
    description:
      'The altar on which the gods swore their alliance before making war on the Titans, according to the Greeks; the smoke rising from it was said to be the Milky Way. It sits just south of the sting of Scorpius.',
    facts: [
      'It is one of Ptolemy’s 48 despite lying far enough south to sit on the horizon from Greece — the sky has precessed since, and it is lower now than it was then.',
      'The rich Milky Way star fields running through it are toward the inner galaxy.',
    ],
  },
  Ari: {
    meaning: 'The ram with the golden fleece',
    description:
      'The ram whose fleece Jason and the Argonauts went after — a small zodiac constellation of three modest stars that has kept an outsized importance for reasons of timing rather than brightness.',
    facts: [
      'Two thousand years ago the Sun crossed the celestial equator here each March, and the crossing point is still called the First Point of Aries. Precession has since carried it into Pisces, where it will not stay either.',
      'Its brightest star, Hamal, means "the ram" in Arabic, and the constellation was the ram in Babylonian charts too.',
    ],
  },
  Aur: {
    meaning: 'The charioteer',
    description:
      'A charioteer usually identified as Erichthonius of Athens, who invented the four-horse chariot; the figure is traditionally drawn carrying a goat and her kids on his shoulder. Its bright pentagon sits in the northern winter Milky Way.',
    facts: [
      'Capella, the sixth brightest star in the sky, is really four stars — two yellow giants orbiting each other in 104 days, and a distant pair of red dwarfs.',
      'Epsilon Aurigae is eclipsed for two entire years every twenty-seven, by something so large and so dark that its identity was argued over for a century. It is a disc of dust.',
      'Three bright open clusters — M36, M37 and M38 — lie in a row across it.',
    ],
  },
  Boo: {
    meaning: 'The herdsman',
    description:
      'A herdsman or ploughman driving the bear around the pole, and the constellation is shaped like a kite. Its brightest star is the easiest bright star in the sky to find: follow the curve of the Big Dipper’s handle and keep going.',
    facts: [
      'Arcturus is the fourth brightest star in the sky and the brightest in the northern half of it, a red giant twenty-five times the Sun’s diameter, 37 light years away.',
      'It is not one of the local crowd: Arcturus belongs to an older population of stars on a steeply inclined orbit, passing through the disc of the Galaxy rather than travelling with it.',
    ],
  },
  Cae: {
    meaning: 'The engraving chisel',
    description:
      'One of Lacaille’s instruments and one of the faintest constellations in the sky — eighth smallest, with nothing brighter than magnitude 4.4. It takes a dark night and a chart to find at all.',
    facts: [
      'Its stars are so sparse that the constellation is often described by what surrounds it rather than by anything in it.',
      'RR Caeli, an eclipsing binary here, has at least one planet orbiting the pair.',
    ],
  },
  Cam: {
    meaning: 'The giraffe',
    description:
      'A large, dim region filling the gap between Ursa Major, Perseus and Cassiopeia — a part of the northern sky the ancients left blank because there is so little in it. The name is Greek for "camel-leopard", which is what a giraffe was called.',
    facts: [
      'It is the eighteenth largest constellation and has no star brighter than magnitude 4.0 — by that measure the emptiest large area in the northern sky.',
      'Kemble’s Cascade, a chance line of a dozen faint stars running for five moon-widths, is one of the finest sights here in binoculars.',
    ],
  },
  Cnc: {
    meaning: 'The crab',
    description:
      'The crab that Hera sent to distract Hercules during his fight with the Hydra, and which he trod on. It is the faintest of the twelve zodiac constellations, a dim inverted Y between Gemini and Leo.',
    facts: [
      'The Beehive Cluster at its centre is one of the nearest open clusters at 590 light years, visible to the naked eye as a hazy patch. Galileo turned his telescope on it and resolved forty stars.',
      'The Tropic of Cancer is named for it: two thousand years ago the Sun stood here at the June solstice. It now stands in Taurus.',
    ],
  },
  CVn: {
    meaning: 'The hunting dogs',
    description:
      'Two dogs, Asterion and Chara, held on a leash by Boötes as he drives the bear around the pole. Hevelius made them out of faint stars beneath the handle of the Big Dipper.',
    facts: [
      'The Whirlpool Galaxy lies here, and it is where spiral structure was first ever seen: Lord Rosse drew its arms in 1845 through a six-foot reflector, decades before anyone knew what a galaxy was.',
      'Its brightest star, Cor Caroli, was named "Charles’s Heart" for the executed Charles I of England.',
    ],
  },
  CMa: {
    meaning: 'The greater dog',
    description:
      'Orion’s hunting dog, following at his heel, and the home of the brightest star in the sky. The Egyptians built a calendar on that star: its reappearance in the dawn sky each year announced the flooding of the Nile.',
    facts: [
      'Sirius is bright mostly for being close — 8.6 light years, the fifth nearest star system — though it is also genuinely 25 times the Sun’s luminosity.',
      'It has a white dwarf companion, Sirius B, the first ever found: an Earth-sized cinder with the mass of the Sun, predicted from a wobble in 1844 and seen in 1862.',
    ],
  },
  CMi: {
    meaning: 'The lesser dog',
    description:
      'Orion’s second dog, and one of the emptiest constellations that anyone can nonetheless find instantly — it is essentially two stars, one of them very bright.',
    facts: [
      'Procyon is the eighth brightest star in the sky and the seventh nearest system at 11.5 light years. Its name means "before the dog", because it rises shortly before Sirius.',
      'Like Sirius, it has a white dwarf companion inferred from its motion long before it was seen.',
    ],
  },
  Cap: {
    meaning: 'The sea goat',
    description:
      'A goat with a fish’s tail — a figure that came to Greece from Babylon, where it was already ancient, and which nobody has satisfactorily explained since. It is the smallest constellation of the zodiac and one of the faintest.',
    facts: [
      'The Tropic of Capricorn is named for it, from the days when the Sun stood here at the December solstice. It is now in Sagittarius.',
      'Its brightest star, Algedi, is a naked-eye double: two unrelated stars, one 109 and one 690 light years away, that happen to line up.',
    ],
  },
  Car: {
    meaning: 'The keel of the ship Argo',
    description:
      'One of the three pieces of Argo Navis, the ship of Jason and the Argonauts, which was by far the largest constellation in the sky until Lacaille broke it up. Carina keeps the keel, and with it the second brightest star in the sky.',
    facts: [
      'Eta Carinae is one of the most massive stars known, and in 1843 it erupted to become the second brightest star in the sky without exploding. The shell it threw off, the Homunculus Nebula, is still expanding.',
      'The Carina Nebula surrounding it is four times the size of the Orion Nebula and considerably brighter, and is almost unknown in the north because it never rises there.',
      'Canopus, its brightest star, is the standard reference for spacecraft attitude sensors — bright, isolated, and far from the ecliptic.',
    ],
  },
  Cas: {
    meaning: 'Cassiopeia, the boastful queen',
    description:
      'The queen who boasted that her daughter was more beautiful than the sea nymphs, bringing the monster Cetus down on her kingdom. She was set in the sky on a throne, circling the pole, and for half of every night she hangs upside down.',
    facts: [
      'Its five bright stars form a W that is one of the two great signposts of the northern sky, opposite the Big Dipper across the pole.',
      'Tycho Brahe’s supernova of 1572 appeared here, and the fact that it never moved against the stars was the observation that broke the ancient doctrine of an unchanging heaven.',
      'Cassiopeia A, the remnant of a star that exploded around 1680, is the brightest radio source in the sky beyond the solar system.',
    ],
  },
  Cen: {
    meaning: 'The centaur',
    description:
      'Usually identified as Chiron, the wise centaur who taught Achilles and Jason — a large, bright southern constellation that contains both the nearest star system to the Sun and the finest globular cluster in the sky.',
    facts: [
      'Alpha Centauri is the closest star system at 4.37 light years: two Sun-like stars, plus the red dwarf Proxima, which is marginally closer still and has a planet in its habitable zone.',
      'Omega Centauri is the brightest globular cluster in the sky and holds perhaps ten million stars. It is probably not a cluster at all but the stripped core of a small galaxy the Milky Way swallowed.',
    ],
  },
  Cep: {
    meaning: 'Cepheus, the king',
    description:
      'The king of Aethiopia, husband of Cassiopeia and father of Andromeda, drawn as a lopsided house near the pole. It is unremarkable to look at and carries one of the most important stars in the history of astronomy.',
    facts: [
      'Delta Cephei gave its name to the Cepheid variables — stars whose pulsation period tracks their true brightness exactly, which is how the distance to other galaxies was first measured. Almost every cosmic distance rests on this star’s family.',
      'Mu Cephei, the Garnet Star, is one of the largest stars known: put it where the Sun is and its surface would reach past Jupiter.',
    ],
  },
  Cet: {
    meaning: 'The sea monster',
    description:
      'The monster sent to devour Andromeda, and the fourth largest constellation in the sky. It is often drawn as a whale, which is what the word came to mean, though the figure on old charts is nothing of the kind.',
    facts: [
      'Mira was the first variable star ever recognised, in 1596: it swings from an easy naked-eye star to entirely invisible and back over 332 days. Its name means "the wonderful".',
      'Tau Ceti, 12 light years away, is one of the nearest single Sun-like stars, and was one of the two targets of the first search for interstellar radio signals in 1960.',
    ],
  },
  Cha: {
    meaning: 'The chameleon',
    description:
      'A small, faint southern figure near the pole, charted by the Dutch navigators and named for an animal newly startling to Europeans.',
    facts: [
      'The Chamaeleon complex, about 500 light years away, is one of the nearest regions where stars are actively forming — a favourite target for infrared telescopes studying how planetary systems begin.',
      'Nothing in it reaches magnitude 4, and it is one of the few constellations with no star bright enough to have been given a proper name.',
    ],
  },
  Cir: {
    meaning: 'The drafting compasses',
    description:
      'Lacaille’s pair of dividers, tucked beside Alpha Centauri. It is the fourth smallest constellation in the sky.',
    facts: [
      'Almost all of it is a narrow strip of Milky Way, so it is far richer in faint stars than its brightness suggests.',
      'It sits next to the brightest part of Centaurus, which is why an object this small is easy to find.',
    ],
  },
  Col: {
    meaning: 'The dove',
    description:
      'Introduced by Plancius as the dove Noah released from the ark — placed, fittingly, just beyond the ship Argo. It sits below Orion’s bright neighbours in the southern winter sky.',
    facts: [
      'Mu Columbae is a runaway star, flung out of the Orion Nebula region about two and a half million years ago and now crossing the sky at 200 km/s.',
      'It was made from stars Ptolemy had left as part of Canis Major.',
    ],
  },
  Com: {
    meaning: 'Berenice’s hair',
    description:
      'The only constellation named after a real historical person: Berenice II of Egypt, who cut off her celebrated hair as an offering for her husband’s safe return from war. The hair vanished from the temple, and the court astronomer explained that the gods had placed it in the sky.',
    facts: [
      'The north galactic pole lies here — looking at this constellation is looking straight up out of the plane of the Milky Way, through the least dust of any direction, which is why it is so full of galaxies.',
      'The Coma Cluster holds over a thousand of them. It is where Fritz Zwicky, in 1933, found the galaxies moving far too fast for the visible mass and first proposed dark matter.',
    ],
  },
  CrA: {
    meaning: 'The southern crown',
    description:
      'A neat arc of faint stars under the feet of Sagittarius, known since antiquity despite having nothing brighter than magnitude 4.1. Its shape is what earned it a name.',
    facts: [
      'The Corona Australis molecular cloud, about 430 light years away, is one of the nearest star-forming regions to the Sun.',
      'Ptolemy listed it, but it has been read as a crown, a wreath and a wheel at various times.',
    ],
  },
  CrB: {
    meaning: 'The northern crown',
    description:
      'The crown Dionysus gave Ariadne, thrown into the sky as a semicircle of seven stars — one of the few constellations that genuinely looks like the thing it is named for.',
    facts: [
      'T Coronae Borealis, the Blaze Star, is a recurrent nova: it erupts roughly every eighty years, jumping from invisibility to naked-eye brightness. It last did so in 1946 and is overdue.',
      'R Coronae Borealis does the reverse. It sits steady for years, then drops by eight magnitudes in weeks when it manufactures a cloud of soot in front of itself.',
    ],
  },
  Crv: {
    meaning: 'The crow',
    description:
      'Apollo sent the crow for water; it dawdled by a fig tree waiting for the fruit to ripen, then came back late with the water snake in its claws and a story about being delayed. Apollo, unimpressed, threw all three into the sky.',
    facts: [
      'The crow, the cup and the snake are still there together — and the crow is placed so that it can never reach the cup, which was the point.',
      'The Antennae Galaxies lie here: two spirals mid-collision, throwing out streamers of stars a hundred thousand light years long. It is the nearest and best-studied galactic merger.',
    ],
  },
  Crt: {
    meaning: 'The cup',
    description:
      'Apollo’s goblet, the second character in the story told next door in Corvus, drawn as a neat little bowl of faint stars on the back of the Hydra.',
    facts: [
      'It has no star brighter than magnitude 3.5 and no bright deep-sky objects — it is a shape, and that is all it has ever been.',
      'The Crater 2 dwarf galaxy, found here in 2016, is one of the largest and faintest satellites of the Milky Way — a "feeble giant" that had been hiding in plain sight.',
    ],
  },
  Cru: {
    meaning: 'The southern cross',
    description:
      'The smallest of the 88 constellations and one of the most recognised, four bright stars in a compact cross that has been the emblem of the southern hemisphere since Europeans first sailed into it. Its long axis points toward the south celestial pole, which is how it is used for navigation.',
    facts: [
      'At 68 square degrees it is the smallest constellation in the sky, less than a twentieth the size of Hydra.',
      'It appears on the flags of Australia, New Zealand, Brazil, Papua New Guinea and Samoa.',
      'It was visible from the Mediterranean in antiquity and was known to the Greeks as part of Centaurus. Precession has since carried it below the horizon there — it was lost to Europe for a thousand years and rediscovered by sailors.',
      'The Coalsack, the most prominent dark nebula in the sky, sits beside it: a cloud of dust blotting out the Milky Way behind it.',
    ],
  },
  Cyg: {
    meaning: 'The swan',
    description:
      'Zeus in the form of a swan, flying down the length of the Milky Way with its wings spread — also known as the Northern Cross, which is what it actually looks like. It lies along the richest stretch of the northern galaxy.',
    facts: [
      'Deneb is one of the most luminous stars known, perhaps two hundred thousand times the Sun. It looks no brighter than Altair only because it is roughly a hundred times further away.',
      'Cygnus X-1 was the first object widely accepted as a black hole, and the subject of a famous bet between Stephen Hawking and Kip Thorne which Hawking conceded in 1990.',
      'The Great Rift runs through it — a lane of dust splitting the Milky Way lengthways, dark not because there are no stars but because the dust hides them.',
    ],
  },
  Del: {
    meaning: 'The dolphin',
    description:
      'The dolphin that carried the poet Arion to safety after he leapt from a ship to escape a mutinous crew. It is small, compact and unmistakable — a tiny diamond with a tail.',
    facts: [
      'Its two brightest stars are named Sualocin and Rotanev. Read backwards they give Nicolaus Venator, the Latinised name of an assistant at Palermo Observatory who slipped himself into the sky in 1814 and was not caught for decades.',
      'The names stuck, and remain the official IAU designations.',
    ],
  },
  Dor: {
    meaning: 'The dolphinfish',
    description:
      'A southern figure named for the mahi-mahi, and one of the most valuable patches of sky there is: most of the Large Magellanic Cloud sits inside it.',
    facts: [
      'The Tarantula Nebula in that cloud is the most violent star-forming region known in the Local Group. Placed where the Orion Nebula is, it would cast shadows on Earth.',
      'Supernova 1987A went off here — the nearest supernova since the invention of the telescope, and the first from which neutrinos were ever detected.',
    ],
  },
  Dra: {
    meaning: 'The dragon',
    description:
      'A long chain of stars winding between the two bears and around the north celestial pole, usually identified as Ladon, the dragon guarding the golden apples that Hercules was sent to steal.',
    facts: [
      'Thuban, in the dragon’s tail, was the pole star when the Egyptian pyramids were built — the descending passage of the Great Pyramid at Giza points at where it stood.',
      'The north ecliptic pole lies within Draco, so the celestial pole traces its 26,000-year precession circle around a point inside this constellation.',
      'The Cat’s Eye Nebula here was the first planetary nebula to have its spectrum taken, in 1864, proving these objects were glowing gas and not clusters of unresolved stars.',
    ],
  },
  Equ: {
    meaning: 'The little horse',
    description:
      'The second smallest constellation in the sky, a handful of faint stars beside Pegasus, usually taken to be the horse Celeris, brother of Pegasus. It is one of Ptolemy’s and nobody is quite sure why.',
    facts: [
      'Nothing in it is brighter than magnitude 4.1, making it the faintest of the ancient constellations.',
      'Its brightest star, Kitalpha, is the only one with a proper name.',
    ],
  },
  Eri: {
    meaning: 'The river',
    description:
      'A river running from the foot of Orion all the way down into the far southern sky — the sixth largest constellation, and the longest, spanning nearly sixty degrees of declination. Its end is marked by Achernar, whose name means exactly that.',
    facts: [
      'Achernar is the flattest star known to be nearby: it spins so fast that its equatorial diameter is more than half again its polar one.',
      'Epsilon Eridani, 10.5 light years away, is one of the nearest Sun-like stars, with a debris disc and at least one planet. It was the other target of the first radio search for extraterrestrial signals in 1960.',
      'The river’s southern end was unknown to Ptolemy, whose Eridanus stopped short — the far end was added once Europeans sailed far enough south to see it.',
    ],
  },
  For: {
    meaning: 'The chemical furnace',
    description:
      'Lacaille’s furnace — specifically a chemist’s distilling apparatus, honouring Antoine Lavoisier. A faint constellation that repays a large telescope far better than the eye.',
    facts: [
      'The Fornax Cluster is the second richest galaxy cluster within a hundred million light years, after Virgo.',
      'The Hubble Ultra Deep Field was taken here, in a patch of apparently empty sky one tenth the width of the full Moon. It found ten thousand galaxies.',
    ],
  },
  Gem: {
    meaning: 'The twins',
    description:
      'Castor and Pollux, the twin sons of Leda — one mortal, one not. When Castor died Pollux asked to share his immortality, and the two were placed in the sky together.',
    facts: [
      'Pollux is the nearest giant star to the Sun and has a confirmed planet. Castor, slightly fainter, is six stars: three binary pairs bound together.',
      'Pluto was discovered here in 1930, on photographic plates taken a few degrees from Delta Geminorum.',
      'The Geminid meteors each December are unusual in coming not from a comet but from an asteroid, 3200 Phaethon.',
    ],
  },
  Gru: {
    meaning: 'The crane',
    description:
      'A wading bird charted by the Dutch navigators, made partly from stars that Ptolemy had counted as the tail of the Southern Fish.',
    facts: [
      'Its brightest star, Alnair, is a hot blue star 101 light years away; the second, Beta Gruis, is a red giant — the colour contrast is obvious to the naked eye.',
      'The Grus Quartet, four interacting galaxies, lies within it.',
    ],
  },
  Her: {
    meaning: 'Hercules, the kneeling hero',
    description:
      'The fifth largest constellation, and one of the oldest: the Greeks knew it simply as the Kneeler, a figure whose identity had already been forgotten, and attached Hercules to it later. It has no bright stars and a great deal of sky.',
    facts: [
      'M13, the Great Globular Cluster, holds several hundred thousand stars and is the finest such object in the northern sky. The 1974 Arecibo message — humanity’s first deliberate interstellar broadcast — was aimed at it.',
      'The solar apex lies here: the direction the Sun is travelling through the Galaxy, at about 20 km/s relative to the neighbouring stars.',
    ],
  },
  Hor: {
    meaning: 'The pendulum clock',
    description:
      'Lacaille’s clock, honouring Christiaan Huygens, whose pendulum made accurate timekeeping — and with it the measurement of longitude and of star positions — possible.',
    facts: [
      'A fitting instrument for the man who used it: Lacaille’s southern survey depended entirely on knowing the time precisely.',
      'R Horologii is a Mira-type variable with one of the largest brightness ranges known, swinging over six hundredfold.',
    ],
  },
  Hya: {
    meaning: 'The water snake',
    description:
      'The largest constellation in the sky, a thin chain of stars winding more than a hundred degrees from Cancer to Libra — over a quarter of the way around the celestial sphere. It is the many-headed monster Hercules killed as his second labour.',
    facts: [
      'At 1,303 square degrees it is the largest of the 88, nineteen times the size of Crux, and takes more than six hours to rise completely.',
      'Despite its size it has only one bright star, Alphard, whose name means "the solitary one" — an accurate description of an otherwise empty stretch of sky.',
    ],
  },
  Hyi: {
    meaning: 'The lesser water snake',
    description:
      'A southern figure charted by the Dutch navigators, winding between the two Magellanic Clouds. Not to be confused with Hydra, which is a different snake, much larger, and in the other hemisphere.',
    facts: [
      'Its stars are among the closest bright stars to the south celestial pole, making it useful for finding one’s bearings in the far south.',
      'Beta Hydri, 24 light years away, is one of the nearest Sun-like stars and is a good picture of what the Sun will look like in a few billion years.',
    ],
  },
  Ind: {
    meaning: 'The Indian',
    description:
      'A figure representing an indigenous person of the lands the Dutch navigators had sailed to — one of the very few constellations depicting a contemporary human being rather than a myth or an instrument.',
    facts: [
      'Epsilon Indi, 12 light years away, is one of the nearest star systems, with a pair of brown dwarfs and a giant planet.',
      'The figure is usually drawn holding spears, though which people it was meant to represent was never specified.',
    ],
  },
  Lac: {
    meaning: 'The lizard',
    description:
      'A small zig-zag of faint stars that Hevelius squeezed between Cygnus, Andromeda and Cassiopeia. He is said to have chosen a lizard because nothing larger would fit.',
    facts: [
      'BL Lacertae was catalogued as a variable star and turned out to be the blazing centre of a distant galaxy with a jet pointed at us. An entire class of active galaxies — BL Lac objects — is named after a supposed star in this constellation.',
      'Two earlier attempts to name this patch after royalty, including one for Frederick the Great, failed to stick. The lizard survived.',
    ],
  },
  Leo: {
    meaning: 'The lion',
    description:
      'The Nemean lion, killed by Hercules as the first of his labours, and one of the few constellations that genuinely resembles its animal: a crouching lion with a sickle-shaped mane. It has been a lion in every culture that named it, going back to Mesopotamia.',
    facts: [
      'Regulus, "the little king", sits almost exactly on the ecliptic — so the Moon and planets pass in front of it, and it is regularly occulted.',
      'The Leonid meteors come from comet Tempel–Tuttle. The storm of 1833 dropped a hundred thousand meteors an hour over North America and effectively founded the scientific study of meteors.',
    ],
  },
  LMi: {
    meaning: 'The lesser lion',
    description:
      'A small, faint triangle Hevelius made from the stars between Leo and Ursa Major. There was no lion here before 1687 and there is not much of one now.',
    facts: [
      'It has no Alpha. When Francis Baily assigned Greek letters to the southern and newer constellations in the 1840s he labelled its brightest star Beta and never got round to an Alpha — and the mistake was never corrected.',
      'Hanny’s Voorwerp, a glowing cloud lit by a quasar that has since switched off, was found here in 2007 by a Dutch schoolteacher taking part in an online galaxy classification project.',
    ],
  },
  Lep: {
    meaning: 'The hare',
    description:
      'A hare crouching under Orion’s feet, being chased by his dogs — a compact and reasonably bright constellation that is nonetheless almost never noticed, because of what is directly above it.',
    facts: [
      'Hind’s Crimson Star is one of the reddest objects in the sky: a carbon star wrapped in soot of its own making, described by its discoverer as a drop of blood on a black field.',
      'M79, a globular cluster here, is on the far side of the Galaxy from the centre — an odd place for one, and it probably arrived with a dwarf galaxy the Milky Way is eating.',
    ],
  },
  Lib: {
    meaning: 'The scales',
    description:
      'The only constellation of the zodiac that is not a living creature, and it did not start out as one: these stars were the claws of the scorpion until Roman times, when they were made into the balance held by the neighbouring figure of Justice.',
    facts: [
      'The two brightest stars are still called Zubenelgenubi and Zubeneschamali — "the southern claw" and "the northern claw" — a name that outlived the figure it described by two thousand years.',
      'Gliese 581, here, is a red dwarf whose planets were among the first found in a star’s habitable zone.',
    ],
  },
  Lup: {
    meaning: 'The wolf',
    description:
      'An animal impaled on the centaur’s spear, which is how the Greeks drew it — a beast being carried to the altar next door. The Babylonians had a similar figure long before.',
    facts: [
      'SN 1006 appeared here: the brightest supernova in recorded history, bright enough to read by and visible in daylight, recorded in China, Japan, Iraq, Egypt and Europe.',
      'It lies in a rich part of the Milky Way and holds one of the nearest large star-forming associations, the Scorpius–Centaurus complex.',
    ],
  },
  Lyn: {
    meaning: 'The lynx',
    description:
      'A faint zig-zag between Ursa Major and Auriga, named by Hevelius with the explanation that you would need the eyes of a lynx to see it. He was not exaggerating.',
    facts: [
      'Nothing in it is brighter than magnitude 3.1, and it is the faintest constellation of its size in the northern sky.',
      'The Lynx Arc, a distant star-forming region magnified by a gravitational lens, was for a time the hottest star-forming region known.',
    ],
  },
  Lyr: {
    meaning: 'The lyre',
    description:
      'The lyre of Orpheus, whose playing could charm anything living. Small, compact, and containing the second brightest star of the northern sky.',
    facts: [
      'Vega was the pole star around 12,000 BC and will be again around AD 14,000. It was the first star ever photographed, in 1850, and the first to have its spectrum recorded.',
      'It is the zero point of the magnitude system: the scale of stellar brightness was defined so that Vega is magnitude zero in every colour.',
      'The Ring Nebula here is the best-known planetary nebula in the sky — a dying star’s ejected shell, seen very nearly down the barrel.',
    ],
  },
  Men: {
    meaning: 'Table Mountain',
    description:
      'The only constellation named after a place on Earth: Table Mountain, above Cape Town, from whose slopes Lacaille surveyed the southern sky. He noted that the mountain was often capped by cloud, and put the constellation where part of the Large Magellanic Cloud would sit over it.',
    facts: [
      'It is the faintest constellation in the sky. Not one of its stars reaches magnitude 5.0, so under anything but a truly dark sky there is nothing there at all.',
      'The joke is deliberate and structural: the cloud over Lacaille’s mountain is the Magellanic Cloud, and it is drawn in the right place.',
    ],
  },
  Mic: {
    meaning: 'The microscope',
    description:
      'One of Lacaille’s instruments, in a barren patch of southern sky below Capricornus. It has nothing brighter than magnitude 4.7.',
    facts: [
      'AU Microscopii, 32 light years away, is a young red dwarf with an edge-on debris disc and planets — one of the best places to watch a planetary system being assembled.',
      'It was made entirely from stars that had never belonged to any constellation.',
    ],
  },
  Mon: {
    meaning: 'The unicorn',
    description:
      'A dim constellation in a spectacular place: it fills the space inside the Winter Triangle formed by Sirius, Betelgeuse and Procyon, and the Milky Way runs straight through it. There is far more here than the naked eye suggests.',
    facts: [
      'The Rosette Nebula, a five-moon-wide ring of glowing hydrogen with a young cluster hollowing out its centre, lies here.',
      'V838 Monocerotis flared in 2002 and produced the most famous light echo ever photographed — successive images showing the flash sweeping outward through the dust around it.',
    ],
  },
  Mus: {
    meaning: 'The fly',
    description:
      'A small southern constellation beneath the Southern Cross, and the only insect among the 88. The Dutch navigators charted it; it was briefly a bee.',
    facts: [
      'It contains the Dark Doodad Nebula, a remarkably straight ribbon of dust three moon-widths long.',
      'It is the only official insect in the sky — a distinction that survived several attempts to rename it.',
    ],
  },
  Nor: {
    meaning: 'The set square',
    description:
      'A carpenter’s square and rule, one of Lacaille’s, in a rich but obscured stretch of the southern Milky Way. It has no alpha or beta — those stars were later given to Scorpius.',
    facts: [
      'The Norma Cluster is the densest concentration of galaxies near the Great Attractor, the mass anomaly the Local Group is falling toward. It sits behind the plane of our own galaxy, which is why it took so long to find.',
      'Its own stars are so heavily dimmed by dust that the constellation looks far emptier than it is.',
    ],
  },
  Oct: {
    meaning: 'The octant',
    description:
      'Lacaille’s navigating instrument, and the constellation that holds the south celestial pole. The southern hemisphere has no Polaris, and this is where it would be if it had one.',
    facts: [
      'Sigma Octantis is the nearest naked-eye star to the south pole, and at magnitude 5.4 it is barely visible at all — useless for navigation, which is why southern sailors used the Southern Cross instead.',
      'The pole is drifting: precession is carrying it out of Octans and toward Carina over the next several thousand years.',
    ],
  },
  Oph: {
    meaning: 'The serpent bearer',
    description:
      'A man wrestling a snake, identified with Asclepius, the physician who learned to raise the dead and was killed by Zeus for it. His staff with its serpent is still the symbol of medicine.',
    facts: [
      'The Sun passes through Ophiuchus for about three weeks every year, which makes it a thirteenth constellation of the zodiac — a fact that is very old, entirely uncontroversial among astronomers, and periodically rediscovered as news.',
      'Barnard’s Star, six light years away, is here: the fastest-moving star in the sky, crossing a full moon-width every 180 years.',
      'Kepler’s Supernova of 1604 appeared in this constellation and remains the last supernova seen with the naked eye in our own galaxy.',
    ],
  },
  Ori: {
    meaning: 'Orion, the hunter',
    description:
      'The most recognisable constellation in the sky, and the only bright one visible from every inhabited place on Earth — it straddles the celestial equator, so it rises for everyone. A giant hunter with a belt of three stars, facing the charging bull.',
    facts: [
      'Betelgeuse is a red supergiant so large that if it replaced the Sun it would swallow Mars. It will explode as a supernova, and it is close enough that when it does it will be visible in daylight.',
      'Rigel, at the opposite corner, is a blue supergiant around 120,000 times the Sun’s luminosity — one of the most intrinsically brilliant stars anywhere near us.',
      'The Orion Nebula, hanging from the belt, is the nearest large stellar nursery at 1,300 light years and the most photographed object in the sky beyond the solar system.',
      'The three belt stars are a genuine physical group, not a chance alignment — all born from the same cloud.',
    ],
  },
  Pav: {
    meaning: 'The peacock',
    description:
      'A Dutch-navigator constellation of the far south, named for the bird sacred to Hera, whose tail carries the hundred eyes of the watchman Argus.',
    facts: [
      'Its brightest star is simply called Peacock, a name the Royal Air Force asked for in the 1930s so that its navigators would have a pronounceable label for it.',
      'NGC 6752, here, is the third brightest globular cluster in the sky.',
    ],
  },
  Peg: {
    meaning: 'The winged horse',
    description:
      'The winged horse sprung from Medusa’s blood, drawn upside down and, by convention, only the front half of him. His body is the Great Square, one of the easiest patterns to find in the autumn sky.',
    facts: [
      '51 Pegasi was the first Sun-like star found to have a planet, in 1995 — a gas giant orbiting in four days, which nobody had thought possible. It won the Nobel Prize in 2019.',
      'One corner of the Great Square is not in Pegasus at all: Alpheratz belongs to Andromeda, which borrowed it in the 1930 boundary settlement.',
    ],
  },
  Per: {
    meaning: 'Perseus, the hero',
    description:
      'The hero who killed Medusa and rescued Andromeda, drawn holding the severed head — and the head is marked by a star that visibly winks. It sits in a bright stretch of the northern Milky Way.',
    facts: [
      'Algol, the Demon Star, dims by a full magnitude every 2.87 days as a companion passes in front of it. It was the first eclipsing binary to be explained, in 1783, and the timing suggests the ancients knew it varied.',
      'The Double Cluster, two rich open clusters side by side, is visible to the naked eye and was catalogued by Hipparchus.',
      'The Perseid meteors each August, from comet Swift–Tuttle, are the most reliably watched shower of the year.',
    ],
  },
  Phe: {
    meaning: 'The phoenix',
    description:
      'The bird that burns and is reborn — the largest of the twelve constellations the Dutch navigators added, though still a modest one.',
    facts: [
      'Its brightest star, Ankaa, is an orange giant 85 light years away.',
      'The figure had been drawn in this region before, in both Arabic and Chinese astronomy, as a boat and as a net respectively.',
    ],
  },
  Pic: {
    meaning: 'The painter’s easel',
    description:
      'Lacaille’s easel — originally "the painter’s easel and palette", shortened later. A small faint constellation beside Canopus that turned out to matter enormously.',
    facts: [
      'Beta Pictoris was the first star to have its debris disc directly imaged, in 1984 — the first real picture of a planetary system being built. Planets have since been imaged orbiting inside it.',
      'The disc is seen almost exactly edge-on, which is why it was the first one found.',
    ],
  },
  Psc: {
    meaning: 'The fishes',
    description:
      'Two fish tied together by their tails, said to be Aphrodite and Eros escaping the monster Typhon. A large, dim V of faint stars that most people have never picked out despite it being a constellation everybody has heard of.',
    facts: [
      'The vernal equinox currently lies here — the point where the Sun crosses the celestial equator each March, and the origin of the coordinate system this whole app uses. Precession is carrying it toward Aquarius.',
      'The Pisces–Cetus Supercluster Complex, one of the largest known structures in the universe, is named partly for it.',
    ],
  },
  PsA: {
    meaning: 'The southern fish',
    description:
      'The parent of the two fish of Pisces, drawn drinking the water poured by Aquarius directly above it. It is nearly empty except for one very bright star in an otherwise blank patch of autumn sky.',
    facts: [
      'Fomalhaut is the eighteenth brightest star in the sky and appears to have no neighbours, which earned it the name "the Lonely One of the Autumn".',
      'It is ringed by a sharp-edged dust belt, and the object photographed inside it in 2008 was announced as the first planet ever directly imaged in visible light — then reinterpreted, after it faded, as an expanding cloud of debris from a collision.',
    ],
  },
  Pup: {
    meaning: 'The stern of the ship Argo',
    description:
      'The largest of the three pieces Argo Navis was broken into, carrying the stern of Jason’s ship. It lies in a dense part of the southern Milky Way and is full of clusters.',
    facts: [
      'Its stars still carry the Greek letters they were given as part of Argo, so Puppis begins at Zeta — the alpha, beta and gamma of the old ship ended up in Carina and Vela.',
      'Zeta Puppis is one of the hottest and most luminous naked-eye stars, a blue supergiant running at 40,000 K, and a runaway moving fast through the Galaxy.',
    ],
  },
  Pyx: {
    meaning: 'The mariner’s compass',
    description:
      'Lacaille’s compass, placed near the mast of the ship it belongs to — though the ship was Greek and the magnetic compass was not invented for another thousand years.',
    facts: [
      'T Pyxidis is a recurrent nova that erupted five times between 1890 and 1967, then went quiet for 44 years before erupting again in 2011.',
      'A rival proposal to rename this region the Mast of Argo was rejected, which is why the ship carries an anachronism.',
    ],
  },
  Ret: {
    meaning: 'The reticle',
    description:
      'The grid of crosshairs in a telescope eyepiece — the instrument Lacaille used to measure the positions of ten thousand southern stars, and the most self-referential name in the sky.',
    facts: [
      'Lacaille named it for his own equipment: the rhomboidal reticle he used at the Cape to time star transits.',
      'Zeta Reticuli, a pair of Sun-like stars 39 light years away, is well known for reasons that have nothing to do with astronomy and everything to do with a 1961 UFO story.',
    ],
  },
  Sge: {
    meaning: 'The arrow',
    description:
      'The third smallest constellation, and one of the oldest — a plain little arrow flying between the swan and the eagle, which Ptolemy listed and which nobody has ever mistaken for anything else.',
    facts: [
      'Despite its size it is genuinely arrow-shaped, which is why so small a group of faint stars survived four thousand years of chart-making.',
      'M71, a loose globular cluster here, was argued over for decades — it looks like a dense open cluster, and its true nature was settled only in the 1970s.',
    ],
  },
  Sgr: {
    meaning: 'The archer',
    description:
      'A centaur drawing a bow, aimed at the heart of the scorpion next door. Its brightest stars form the Teapot, and the steam from the teapot’s spout is the centre of the Milky Way.',
    facts: [
      'The centre of our galaxy lies in this constellation, 26,000 light years away, and with it Sagittarius A* — a black hole of four million solar masses, photographed in 2022.',
      'It holds more Messier objects than any other constellation: fifteen, including the Lagoon, Trifid and Omega nebulae.',
      'Looking at Sagittarius is looking straight into the thickest part of the Galaxy, which is why this is the richest area of sky for a pair of binoculars.',
    ],
  },
  Sco: {
    meaning: 'The scorpion',
    description:
      'The scorpion that killed Orion, placed on the opposite side of the sky so that one sets as the other rises. It is one of the few constellations that looks exactly like its name: a curved body ending in a raised sting.',
    facts: [
      'Antares is a red supergiant some seven hundred times the Sun’s diameter. Its name means "rival of Mars", for its colour and for the fact that Mars regularly passes close to it.',
      'The Sun spends only about a week in Scorpius each year — less than in any other zodiac constellation, because the 1930 boundaries left it a narrow crossing.',
      'It is a genuine physical group in part: many of its bright stars belong to the Scorpius–Centaurus association, the nearest region of massive star formation.',
    ],
  },
  Scl: {
    meaning: 'The sculptor’s studio',
    description:
      'Lacaille’s sculptor — originally "the sculptor’s studio", complete with a carved head on a tripod table. Faint in itself, and pointed at something important.',
    facts: [
      'The south galactic pole lies here, so this direction looks straight down out of the Milky Way through the least possible dust, and the constellation is thick with distant galaxies.',
      'The Sculptor Galaxy is one of the brightest galaxies in the sky and the nearest starburst galaxy, seven times more prolific at making stars than our own.',
    ],
  },
  Sct: {
    meaning: 'The shield',
    description:
      'A small constellation in a brilliant part of the Milky Way, and the only one named for a political figure that is still in use: Hevelius created it as Sobieski’s Shield, for the Polish king who relieved the siege of Vienna in 1683.',
    facts: [
      'The Scutum Star Cloud is the densest visible patch of the Milky Way outside Sagittarius — a genuine window onto the inner Galaxy through a gap in the dust.',
      'UY Scuti is one of the largest stars known: about 1,700 times the Sun’s radius, big enough to reach past Jupiter’s orbit.',
    ],
  },
  Ser: {
    meaning: 'The serpent',
    description:
      'The only constellation in the sky split into two separate pieces. Ophiuchus the serpent bearer holds it around the middle, and the 1930 boundaries cut the snake in half rather than break his grip — the head lies west of him, the tail east.',
    facts: [
      'The two halves are formally one constellation, Serpens Caput and Serpens Cauda, with a gap of nearly twenty degrees between them.',
      'The Eagle Nebula lies in the tail, containing the Pillars of Creation — columns of gas light years tall that are the most famous astronomical photograph ever taken.',
    ],
  },
  Sex: {
    meaning: 'The sextant',
    description:
      'A faint constellation Hevelius created in memory of the great sextant he used for measuring star positions, which was destroyed along with his observatory in a fire in 1679.',
    facts: [
      'He placed it between Leo and Hydra — between the lion and the snake, he wrote, because the instrument had been lost to fire, and Vulcan had got the better of Urania.',
      'The Spindle Galaxy here is a lenticular seen edge-on with a dramatic dust lane.',
    ],
  },
  Tau: {
    meaning: 'The bull',
    description:
      'The bull Zeus became to carry off Europa, charging at Orion with its head lowered — and one of the oldest figures in the sky: a bull is painted in the same arrangement of stars in caves at Lascaux, seventeen thousand years ago.',
    facts: [
      'The Pleiades and the Hyades, the two nearest open clusters, are both here. The Hyades makes the bull’s face and the Pleiades sits on its shoulder, and both are visible to the naked eye as groups.',
      'The Crab Nebula is the wreckage of a star seen to explode in 1054, recorded by Chinese and Japanese astronomers as a star bright enough to see in daylight for three weeks. At its centre is a neutron star spinning thirty times a second.',
      'Aldebaran, the bull’s red eye, looks like a member of the Hyades and is not — it lies less than half as far away, in front of the cluster.',
    ],
  },
  Tel: {
    meaning: 'The telescope',
    description:
      'Lacaille’s telescope, originally drawn as an enormous aerial refractor of the kind used in the seventeenth century, slung from a mast. It was later cut down considerably, losing stars back to Sagittarius and Ophiuchus.',
    facts: [
      'The original figure was so large it intruded into four neighbouring constellations, and later astronomers trimmed it repeatedly.',
      'It is now the fifty-seventh constellation by size, with nothing brighter than magnitude 3.5.',
    ],
  },
  Tri: {
    meaning: 'The triangle',
    description:
      'Three stars in a thin triangle, known to the Greeks as Deltoton for its resemblance to their letter delta. It is small and unremarkable and contains one of the most important galaxies in the sky.',
    facts: [
      'The Triangulum Galaxy is the third largest member of the Local Group after Andromeda and our own. Under a genuinely dark sky it is the most distant object visible to the unaided eye, at three million light years.',
      'It was in this galaxy, in 2019, that a black hole was weighed by watching it eclipse its companion star — one of very few measured that way.',
    ],
  },
  TrA: {
    meaning: 'The southern triangle',
    description:
      'A southern triangle brighter and more obvious than its northern namesake, charted by the Dutch navigators near Alpha Centauri.',
    facts: [
      'All three of its corner stars are brighter than magnitude 3, which makes it a far better triangle than Triangulum.',
      'It appeared on charts before the voyage that supposedly discovered it, sketched by Amerigo Vespucci from an earlier crossing.',
    ],
  },
  Tuc: {
    meaning: 'The toucan',
    description:
      'A tropical bird charted by the Dutch navigators, containing two of the finest objects in the southern sky.',
    facts: [
      'Most of the Small Magellanic Cloud lies within it — a satellite galaxy 200,000 light years away, visible to the naked eye as a detached piece of the Milky Way.',
      '47 Tucanae, next to it on the sky but forty times closer, is the second brightest globular cluster in the sky and one of the densest.',
    ],
  },
  UMa: {
    meaning: 'The great bear',
    description:
      'The third largest constellation, and the one nearly everyone can find — though what they find is usually the Big Dipper, which is only its hindquarters and tail. The bear has been a bear across Siberia and in North America as well as in Greece, which suggests the identification is tens of thousands of years old.',
    facts: [
      'The Big Dipper, or the Plough, is an asterism rather than a constellation: seven stars out of a hundred and twenty-five in the region.',
      'Five of those seven are moving together through space as a genuine cluster, the nearest one to us. The other two — the ones at each end — are unrelated and merely passing through, so the shape will visibly deform over the next fifty thousand years.',
      'Mizar, in the handle, has a naked-eye companion called Alcor that was used as an eyesight test for centuries. Mizar itself was the first double star ever photographed, and is really four stars.',
      'The two stars at the end of the bowl point at Polaris, which is how most people first learn to find north.',
    ],
  },
  UMi: {
    meaning: 'The lesser bear',
    description:
      'A small dipper of faint stars, of which almost nobody can see more than two — but one of those two is the pole star, which makes this the most navigationally useful constellation in the northern sky.',
    facts: [
      'Polaris sits within three quarters of a degree of the celestial pole, so the entire northern sky appears to turn about it. It has not always: precession carries the pole around a 26,000-year circle, and Polaris is nearest to it around AD 2100.',
      'It is a Cepheid variable — the brightest one in the sky — pulsating every four days, though the swing is small enough that nobody notices.',
      'The Greeks called it the Dog’s Tail, Cynosura, which is where the English word "cynosure" comes from: something everything else turns around.',
    ],
  },
  Vel: {
    meaning: 'The sails of the ship Argo',
    description:
      'The sails of Jason’s ship, and the third piece of the dismembered Argo Navis. It sits in a bright, complicated stretch of the southern Milky Way full of nebulosity and young stars.',
    facts: [
      'The Vela supernova remnant is the wreckage of a star that exploded about 11,000 years ago, close enough that it would have been brighter than the full Moon and visible in daylight.',
      'At its centre is the Vela Pulsar, the first pulsar shown to be the corpse of a supernova — the observation that connected the two.',
      'Like Puppis, it has no alpha or beta: those letters belong to the stars that ended up in Carina.',
    ],
  },
  Vir: {
    meaning: 'The maiden',
    description:
      'The second largest constellation, a woman usually identified with the harvest — she holds an ear of wheat, which is the star Spica. She has been a goddess of grain and of justice in turn, and Libra’s scales next door are hers.',
    facts: [
      'The Virgo Cluster, about 1,300 galaxies fifty-five million light years away, is the heart of the supercluster our own galaxy belongs to and is falling toward.',
      'The first image of a black hole ever made, released in 2019, was of the one at the centre of M87, a giant elliptical galaxy in that cluster.',
      'The Sun spends more time in Virgo than in any other constellation — about forty-five days — because it is so large along the ecliptic.',
    ],
  },
  Vol: {
    meaning: 'The flying fish',
    description:
      'A small constellation charted by the Dutch navigators, showing the flying fish that a ship in the tropics sees skipping ahead of the bows. It is drawn beside the ship Argo, being chased by it.',
    facts: [
      'It sits partly within the Large Magellanic Cloud’s outskirts and contains several notable galaxies for its size.',
      'The Meathook Galaxy here has a violently asymmetric shape, bent out of true by an encounter with a neighbour.',
    ],
  },
  Vul: {
    meaning: 'The little fox',
    description:
      'Hevelius’s fox, originally the fox and the goose — "a fox carrying a goose to Cerberus", which is a specific enough image that one wonders what he had in mind. The goose survives only in the name of its brightest star.',
    facts: [
      'The first pulsar was found here in 1967: a signal so regular that its discoverers labelled the chart LGM-1, for Little Green Men, before working out it was a spinning neutron star.',
      'The Dumbbell Nebula, in this constellation, was the first planetary nebula ever discovered — found by Messier in 1764, before anyone had any idea what such a thing could be.',
    ],
  },
}
