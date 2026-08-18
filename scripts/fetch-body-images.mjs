#!/usr/bin/env node
/**
 * Bakes a small gallery of real NASA photographs for each body that has any.
 *
 * Run with:
 *     npm run fetch:body-images
 *
 * ## Why they are baked
 *
 * The app makes no network requests at run time, and that rule does not bend
 * for pictures. Everything here is downloaded once, written into
 * `public/images/bodies`, and shipped.
 *
 * ## Why the IDs are curated rather than searched
 *
 * The obvious version asks the NASA image library for "Jupiter" and shows the
 * first few results. Run today that returns an artist's concept of a spacecraft
 * as the top hit for the Great Red Spot; run next year it returns something
 * else. A gallery whose contents change when a search index is reindexed is not
 * a gallery, and there would be nothing to check it against.
 *
 * So each entry below is a specific `nasa_id` — a NASA/JPL PIA number or a
 * Goddard archive ID — chosen for what it shows. The `why` line beside each is
 * editorial and is the caption's subject: a picture in a dossier should earn
 * its place by showing something the text claims.
 *
 * Metadata is *not* curated. The title, the date, the centre that produced it
 * and the description all come from the API, so the credit line is whatever
 * NASA says it is rather than whatever this file remembers.
 *
 * ## Licence
 *
 * NASA still and moving images are generally not copyrighted and may be used
 * for any purpose, with the usual conditions: do not imply NASA endorsement,
 * and note that a few images carry third-party rights.
 *
 * Not all of these are NASA's, and the comets are why. The only close images of
 * Halley's nucleus are Giotto's and the best of 67P are Rosetta's — both ESA
 * missions, whose pictures NASA's library hosts and credits to ESA. ESA
 * releases those under a Creative Commons attribution licence, which this app
 * satisfies the same way it satisfies NASA's terms: the credit line is the
 * API's own `secondary_creator`, printed unchanged, and every picture links to
 * its source record. Nothing here is recaptioned as ours.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'images', 'bodies')
const OUT = join(ROOT, 'src', 'data', 'bodyImages.js')

const SEARCH = 'https://images-api.nasa.gov/search'
const ASSET = 'https://images-api.nasa.gov/asset'

const log = (...args) => console.log('[body-images]', ...args)

/**
 * Three per planet, and the three do different jobs: one that shows the whole
 * world, one that shows the feature the dossier talks about, and one that shows
 * it as a place rather than as a disc.
 *
 * Moons get two rather than three, and not for lack of care — for most of them
 * two is all that exists. Umbriel was photographed once, by Voyager 2, in 1986;
 * Styx has never been resolved into more than a few pixels. Padding those out
 * to three would mean reaching for artists' impressions, and an illustration in
 * a section called "Seen for real" is the one thing it must not contain.
 */
const GALLERY = {
  mercury: [
    ['PIA11403', 'The whole disc in enhanced colour, where the mineral differences show'],
    ['PIA11219', 'Colour differences that a grey world turns out to have'],
    ['PIA10187', 'Toward the south pole, where crater floors never see the Sun'],
  ],
  venus: [
    ['PIA00271', 'The cloud deck, which is all that can be seen from outside'],
    ['PIA00254', 'Maat Mons, built from radar because the clouds never open'],
    ['PIA00104', 'The surface itself, mapped through the atmosphere by Magellan'],
  ],
  earth: [
    ['PIA18033', 'Home, at the only scale that shows all of it at once'],
    ['GSFC_20171208_Archive_e001386', 'The Blue Marble, composited from a day of orbits'],
    ['as08-14-2383', 'Earthrise — the first time anyone saw it from another world'],
  ],
  mars: [
    ['PIA02653', 'The globe, with Valles Marineris across the middle'],
    ['PIA02982', 'Olympus Mons, the tallest volcano in the solar system'],
    ['PIA23971', 'The view from the ground, where it stops being a dot'],
  ],
  jupiter: [
    ['PIA22946', 'The banded atmosphere, which is all weather and no surface'],
    ['PIA21773', 'The Great Red Spot, a storm wider than the Earth'],
    ['PIA01400', 'The four Galilean moons that broke geocentrism'],
  ],
  saturn: [
    ['PIA06193', 'The portrait — the rings at the angle that made them famous'],
    ['PIA08329', 'Backlit, with the Sun behind the planet and Earth in the frame'],
    ['PIA17199', 'The rings edge-on, where their real thinness shows'],
  ],
  uranus: [
    ['PIA18182', 'A featureless blue disc, which is what Voyager 2 found'],
    ['PIA00346', 'The crescent, on the way out — nobody has been back since'],
    ['PIA01977', 'The rings, which are there and very nearly invisible'],
  ],
  neptune: [
    ['PIA00049', 'The Great Dark Spot, a storm that had gone by the next look'],
    ['PIA01493', 'The rings, and the arcs in them nothing fully explains'],
    ['PIA02245', 'The blue-green of it, which is methane soaking up the red'],
  ],

  /* ---- dwarf planets and named asteroids ---- */

  /*
   * Only three of the eleven appear here, and the eight that do not are the
   * point of this comment.
   *
   * Haumea, Makemake and Eris have never been resolved into more than a few
   * pixels by anything, and Pallas, Hygiea, Juno, Psyche and Apophis have never
   * been visited. NASA publishes artists' impressions of every one of them,
   * some of them very good — and an illustration in a section titled "Seen for
   * real" is the single thing it must not contain. So they get no gallery, and
   * their dossiers say in `bodies.js` that the globe on screen is an artist's
   * impression or a bare sphere. Absence is the honest answer.
   */
  ceres: [
    ['PIA21906', 'The whole dwarf planet, centred on the crater with the bright spots'],
    ['PIA20350', 'Those spots close up — salt left behind by brine that reached the surface'],
    ['PIA11240', 'Ahuna Mons on the limb: a four-kilometre mountain thought to be an ice volcano'],
  ],
  pluto: [
    ['PIA19857', 'Pluto in the colours a person would see, on the day of the flyby'],
    ['PIA19842', 'Mountains at the edge of the heart — water ice, which out here is bedrock'],
    ['PIA19856', 'Pluto and Charon together, at their true relative sizes and colours'],
  ],
  vesta: [
    ['PIA14778', 'The whole body, and it is visibly not round'],
    ['PIA15667', 'The south polar basin, nearly as wide as Vesta itself'],
    ['PIA15494', 'The wall of that basin, close enough to see the layering in it'],
  ],

  /* ---- comets ---- */

  /*
   * Six have been visited and photographed as objects; four more were bright
   * enough to be photographed from Earth or from orbit. ʻOumuamua, 3I/ATLAS,
   * Elenin and C/2019 Y4 have nothing — the first two were never more than
   * points of light, and the other two came apart before anyone with a large
   * telescope had a reason to point it at them.
   */
  '1p_halley': [
    ['PIA17485', 'The nucleus, from 596 km — the first close look at any comet, in 1986'],
  ],
  '67p_churyumov_gerasimenko': [
    ['PIA18423', 'Two lobes joined at a neck, from 1,950 km out'],
    ['PIA18823', 'The jets firing, which is the comet taking itself apart'],
    ['PIA19095', 'From the surface: Philae’s view from where it came to rest, on its side'],
  ],
  '9p_tempel_1': [
    ['PIA02119', 'The nucleus, seconds before the impactor reached it'],
    ['PIA02137', 'The moment of impact, 67 seconds after the projectile was destroyed'],
    ['PIA13855', 'The crater, six years later — before and after, from two different spacecraft'],
  ],
  '81p_wild_2': [
    ['PIA05004', 'The nucleus during the pass that collected the dust brought back to Earth'],
  ],
  '103p_hartley_2': [
    ['PIA13622', 'The peanut: two rough ends, a smooth waist, 2.2 km end to end'],
    ['PIA13625', 'Chunks of ice being carried off the surface by carbon dioxide'],
    ['PIA13566', 'What that looks like from further out — all coma, no visible nucleus'],
  ],
  '19p_borrelly': [
    ['PIA03500', 'The sharpest cometary image of its era, from a spacecraft steering by camera'],
    ['PIA03505', 'The same nucleus overexposed, to bring out the jet coming off it'],
  ],
  'c_1995_o1': [
    ['sts084-389-024', 'Hale-Bopp over the Earth’s limb, photographed from the Space Shuttle'],
  ],
  'c_2020_f3': [
    ['PIA23792', 'The discovery frames — infrared, months before it was visible to anyone'],
    ['AFRC2020-0073-1', 'What it looked like by July 2020, from a lake in the Sierra Nevada'],
    ['NHQ202007180001', 'The comet and the space station in one ten-second exposure'],
  ],
  'c_2013_a1': [
    ['GSFC_20171208_Archive_e000941', 'Hubble’s view in March 2014, while it was still inside Jupiter’s orbit'],
    ['PIA17802', 'The Mars encounter, composited — a third of the Earth–Moon distance away'],
  ],
  'c_2012_s1': [
    ['GSFC_20171208_Archive_e001315', 'Hubble’s last look, early November 2013, with the comet still intact'],
    ['GSFC_20171208_Archive_e001300', 'Going in and coming out, 28–29 November 2013, from an observatory built to watch the Sun'],
  ],

  /* ---- moons ---- */

  luna: [
    ['GSFC_20171208_Archive_e001861', 'The face it always shows us, and the only one it ever will'],
    ['PIA03793', 'Wrinkle ridges — a sea of frozen lava, seen close'],
  ],
  phobos: [
    ['PIA22249', 'A 22 km lump of rubble, and the largest thing in the Martian sky'],
    ['GSFC_20171208_Archive_e000505', 'The grooves down its side, from a moon being slowly pulled apart'],
  ],
  deimos: [
    ['PIA17305', 'Both moons at once, and the smaller one is barely a dot'],
    ['PIA05518', 'Crossing the Sun — an eclipse too small to darken anything'],
  ],
  io: [
    ['PIA00282', 'Yellow with sulphur, and without a single impact crater'],
    ['PIA00899', 'A volcanic hot spot, caught erupting from orbit'],
  ],
  europa: [
    ['PIA19048', 'The smoothest surface in the solar system, cracked all over'],
    ['PIA17737', 'Ridges and cracks — ice floating on something that moves'],
  ],
  ganymede: [
    ['PIA25028', 'The largest moon in the solar system, bigger than Mercury'],
    ['PIA00519', 'Dark ancient ground beside bright grooved terrain'],
  ],
  callisto: [
    ['PIA03456', 'The most heavily cratered surface known — nothing has resurfaced it'],
    ['PIA00514', 'A chain of craters, from a comet torn up before it hit'],
  ],
  mimas: [
    ['PIA11540', 'Herschel, a crater a third the width of the moon it is on'],
    ['PIA20523', 'The impact that nearly broke it apart'],
  ],
  enceladus: [
    ['PIA08954', 'Water venting into space from an ocean under the ice'],
    ['PIA14599', 'The plumes lit from behind, which is how they were found'],
  ],
  tethys: [
    ['PIA19638', 'Almost pure water ice — one of the whitest bodies anywhere'],
    ['PIA14622', 'Odysseus, an impact basin two fifths of its diameter'],
  ],
  dione: [
    ['PIA07743', 'Bright ice cliffs that Voyager mistook for wisps of cloud'],
    ['PIA17195', 'The cratered surface, close up'],
  ],
  rhea: [
    ['PIA11630', 'Saturn’s second largest moon, and almost entirely ice'],
    ['PIA12546', 'A crescent of craters, on a world with no weather to erase them'],
  ],
  titan: [
    ['PIA21923', 'Under the haze, in infrared — the only way to see the ground'],
    ['PIA23174', 'The first geological map of it: dunes, plains, and lakes'],
  ],
  iapetus: [
    ['PIA11608', 'One side black, one side white, and nobody expected that'],
    ['PIA12556', 'The ridge around its equator, which nothing else has'],
  ],
  miranda: [
    ['PIA01490', 'Cliffs 20 km high — the tallest anywhere in the solar system'],
    ['PIA18185', 'A surface that looks assembled out of mismatched pieces'],
  ],
  ariel: [
    ['PIA00037', 'The brightest of Uranus’s moons, and the least cratered'],
    ['PIA01356', 'Valleys cut across it, floored with something that flowed'],
  ],
  umbriel: [
    ['PIA00040', 'The darkest of them, photographed once, in 1986, and never again'],
  ],
  titania: [
    ['PIA01978', 'The largest moon of Uranus, scarred by a huge rift'],
    ['PIA00039', 'The best picture anyone has of it'],
  ],
  oberon: [
    ['PIA00034', 'The outermost large moon, with a mountain on its limb'],
    ['PIA01361', 'All five of Uranus’s large moons, to scale'],
  ],
  triton: [
    ['PIA00317', 'A moon going the wrong way round, captured from the Kuiper belt'],
    ['PIA00059', 'The south polar cap, with nitrogen geysers streaking it'],
  ],
  charon: [
    ['PIA19968', 'Half Pluto’s diameter — the two orbit a point in the space between'],
    ['PIA19690', 'The dark red cap, made of gas that escaped from Pluto'],
  ],
  styx: [
    ['PIA20033', 'The family portrait: four small moons, all of them faint'],
  ],
  nix: [
    ['PIA19847', 'Nix and Hydra, resolved for the first time in 2015'],
    ['PIA20152', 'Tumbling, because nothing has locked its rotation'],
  ],
  kerberos: [
    ['PIA20033', 'The smallest and darkest of Pluto’s four small moons'],
  ],
  hydra: [
    ['PIA19847', 'The outermost of Pluto’s moons, a lumpy shard of water ice'],
    ['PIA20152', 'Its rotation is chaotic — the day length genuinely varies'],
  ],
}

async function json(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

/**
 * The largest JPEG that is still sensible to ship.
 *
 * The asset endpoint lists every rendition, `~orig` included, and originals run
 * to tens of megabytes — a 24-image gallery would outweigh the rest of the app.
 * The order below is a preference, not a fallback chain for failures: `~medium`
 * is a few hundred kilobytes and is more resolution than a dossier column can
 * show.
 */
const PREFERRED = ['~medium.jpg', '~small.jpg', '~large.jpg', '~orig.jpg']

function pickRendition(hrefs) {
  for (const suffix of PREFERRED) {
    const found = hrefs.find((h) => h.toLowerCase().endsWith(suffix))
    if (found) return found
  }
  return hrefs.find((h) => /\.jpe?g$/i.test(h)) ?? null
}

/**
 * NASA's own description of the picture, trimmed to a readable paragraph.
 *
 * These run from a sentence to several screens — the Cassini captions in
 * particular carry full observation geometry, spacecraft range and phase angle
 * — so they need a limit. 700 characters is two or three sentences, which is
 * where they stop being about the picture and start being about the exposure.
 *
 * Cut at a **sentence** end, never at a character count. The first version cut
 * at 300 and left "The image was taken on July 10, 2017 at 07:10 p.m. PDT
 * (10:10 p.m…" — a truncation that reads as a bug rather than as an excerpt.
 * If no sentence ends in the window the whole thing is dropped instead: a
 * caption that trails off mid-clause is worse than no caption.
 */
function summarise(text) {
  if (!text) return null
  const clean = text
    .replace(/<[^>]*>/g, ' ')
    /*
     * Bare URLs out.
     *
     * Many of these captions end with a link to the same image on
     * photojournal.jpl.nasa.gov, sometimes followed by a fragment of credit
     * ("Enhanced image by Kevin M."). Printed as prose it is a wall of raw URL
     * in the middle of a paragraph, and it is redundant: the picture is already
     * a link to its own source, and the credit already has its own line.
     */
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= 700) return clean
  const cut = clean.slice(0, 700)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\u201d'))
  return stop > 200 ? cut.slice(0, stop + 1) : null
}

mkdirSync(OUT_DIR, { recursive: true })

const out = {}
const missing = []
let bytes = 0

for (const [body, entries] of Object.entries(GALLERY)) {
  out[body] = []
  for (const [nasaId, why] of entries) {
    try {
      const found = await json(`${SEARCH}?nasa_id=${encodeURIComponent(nasaId)}`)
      const item = found.collection.items[0]
      if (!item) throw new Error('no such nasa_id')
      const meta = item.data[0]

      const assets = await json(`${ASSET}/${encodeURIComponent(nasaId)}`)
      const href = pickRendition(assets.collection.items.map((i) => i.href))
      if (!href) throw new Error('no JPEG rendition')

      const res = await fetch(href)
      if (!res.ok) throw new Error(`${res.status} fetching the image`)
      const buffer = Buffer.from(await res.arrayBuffer())

      const file = `${body}-${out[body].length + 1}.jpg`
      writeFileSync(join(OUT_DIR, file), buffer)
      bytes += buffer.length

      out[body].push({
        file,
        nasaId,
        why,
        title: meta.title?.replace(/\s+/g, ' ').trim() ?? nasaId,
        /*
         * The credit is the API's, not this file's — see the header.
         *
         * `secondary_creator` is already a full credit line ("NASA/JPL/MSSS")
         * where it exists, so joining it to `center` and prefixing "NASA" in
         * the panel printed the agency three times: "NASA · JPL ·
         * NASA/JPL/MSSS". Preferred whole, and only assembled from the centre
         * when it is missing.
         */
        credit: meta.secondary_creator?.trim() || `NASA/${meta.center ?? 'JPL'}`,
        /*
         * Null for one whole family of ids, and the reason is a trap worth
         * naming: `date_created` is when the record entered the library, not
         * when the picture was taken. For most entries those are close enough.
         * For everything ingested in Goddard's bulk archive load of 8 December
         * 2017 they are not remotely — that batch includes the Moon phase
         * renders, the Siding Spring images from the 2014 Mars pass, and ISON,
         * which ceased to exist in 2013. All of them report 2017.
         *
         * The panel prints this year in the credit line, so carrying it through
         * would caption a comet with a year it did not survive to see. Where
         * the date matters for one of these, the hand-written `why` line says
         * it, because that is a claim somebody checked.
         */
        date: nasaId.startsWith('GSFC_20171208_Archive_')
          ? null
          : meta.date_created?.slice(0, 10) ?? null,
        description: summarise(meta.description),
        /*
         * Where the picture came from, so a reader can go and see the original
         * at full resolution with NASA's whole caption around it. The app ships
         * a few hundred kilobytes of each; this is the rest of it.
         */
        source: `https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`,
      })
      log(`  ${body.padEnd(10)} ${nasaId.padEnd(30)} ${(buffer.length / 1024).toFixed(0)} KB`)
    } catch (error) {
      missing.push(`${body}/${nasaId}: ${error.message}`)
      log(`  ${body.padEnd(10)} ${nasaId.padEnd(30)} FAILED — ${error.message}`)
    }
  }
}

/*
 * A failure is reported and does not stop the bake, but it is never silent: a
 * gallery quietly one image short looks exactly like a gallery that was meant
 * to have two.
 */
if (missing.length) {
  log(`\n${missing.length} image(s) could not be fetched:`)
  for (const line of missing) log(`  ${line}`)
}

/*
 * Every caption printed beside the title NASA gave the picture.
 *
 * `why` is written here and the image is fetched from over there, so the two
 * can disagree and nothing would notice: the gallery renders perfectly, and the
 * caption simply describes a different photograph. It has already happened
 * twice — PIA01519 was captioned as the four Galilean moons and is a disturbed
 * region west of the Great Red Spot, and PIA00046 was captioned as the Great
 * Dark Spot when its own description does not mention one.
 *
 * There is no way to check a claim like that automatically. Printing the pair
 * on every run is the next best thing: it costs a glance and it is the only
 * moment at which the mismatch is visible at all.
 */
log('\ncaption against NASA’s own title — these must agree:')
for (const [body, list] of Object.entries(out)) {
  for (const shot of list) {
    log(`  ${body.padEnd(10)} ${shot.why.slice(0, 52).padEnd(52)} | ${shot.title.slice(0, 46)}`)
  }
}

const counts = Object.entries(out).map(([k, v]) => `${k} ${v.length}`)
log(`\n${Object.values(out).flat().length} images, ${(bytes / 1024 / 1024).toFixed(1)} MB — ${counts.join(', ')}`)

const today = new Date().toISOString().slice(0, 10)

writeFileSync(
  OUT,
  `/**
 * A few real photographs of each planet and major moon.
 *
 * GENERATED by \`scripts/fetch-planet-images.mjs\` — do not hand-edit; rerun
 * \`npm run fetch:body-images\` instead. Generated ${today}.
 *
 * Images are NASA's, fetched from the NASA Image and Video Library by a
 * curated \`nasaId\` and stored under \`public/images/bodies\`. The app makes no
 * network requests at run time.
 *
 * \`why\` is this project's editorial line — what the picture is here to show.
 * Everything else (\`title\`, \`credit\`, \`date\`, \`description\`) is NASA's own
 * metadata, carried through unchanged so the credit is theirs rather than ours.
 */

export const BODY_IMAGES = ${JSON.stringify(out, null, 2)}
`,
)
log(`wrote ${OUT}`)
