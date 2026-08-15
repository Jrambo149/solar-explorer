import { memo, useEffect, useMemo, useState } from 'react'
import {
  ASTEROID_BODIES,
  DWARF_PLANETS,
  MOONS,
  COMETS,
  SPACECRAFT,
  MINOR_MOONS,
  BODIES_BY_ID,
  bodyShown,
  moonsOf,
  majorMoonsOf,
  minorMoonsOf,
} from '../data/bodies'
import { SECTION_KEYNOTES, SYSTEM_KEYNOTES } from '../data/keynotes'
import { PLANETS } from '../data/planetData'
import { useStore } from '../store/useStore'
import { useNamer } from './useBodyName'
import { playSelectSound } from '../hooks/useAmbientAudio'
import { getTextureURL } from '../textures'
import { getSpacecraftThumb } from '../scene/spacecraftModels'
import './NavBar.css'

/**
 * The body selector.
 *
 * It began as one flat row of every body, which worked at eight and was already
 * straining at twenty-three: the bar ran wider than most screens and turned
 * into a horizontal scroller, so half the solar system was somewhere off the
 * edge with nothing to say it was there. The remaining moons would have taken
 * it to thirty-eight.
 *
 * Two changes fixed it, in that order. First, stop treating the solar system as
 * a flat list, because it isn't one: the bar shows a single class at a time —
 * planets, dwarf planets, or moons — and moons are reached through the body
 * they orbit. Nothing scrolls, and nothing gets longer when a moon is added; a
 * new moon of Saturn lengthens Saturn's row and no other.
 *
 * Second, stop showing it at all until it is wanted. Even one class at a time
 * is a permanent strip of thumbnails across a view whose subject is the place
 * you are already at, so it now collapses to a single control that names where
 * you are and expands on a click — the same shape as the layers panel.
 *
 * `layers` names the visibility switches that govern each section, so a section
 * disappears when its bodies leave the scene. A chip that flies you to
 * something that is not drawn is a broken control.
 *
 * A list rather than one key because Moons is now governed by two: the section
 * is worth showing if *either* tier is switched on, and which tiers a host
 * offers is decided per host further down.
 */
const SECTIONS = [
  { key: 'planets', label: 'Planets', bodies: PLANETS, layers: ['planets'], base: 20, span: 16 },
  {
    key: 'dwarfs',
    label: 'Dwarf planets',
    bodies: DWARF_PLANETS,
    layers: ['dwarfPlanets'],
    base: 13,
    span: 6,
  },
  { key: 'moons', label: 'Moons', bodies: MOONS, layers: ['moons', 'minorMoons'], base: 12, span: 7 },
  /*
   * The asteroids that are places rather than population.
   *
   * A narrow spread — 222 to 525 km — so a small span, like the comets. The
   * belt itself has no section and should not have one: three and a half
   * thousand rocks is a population, and a bar of chips is a way of getting to a
   * body.
   */
  {
    key: 'asteroids',
    label: 'Asteroids',
    bodies: ASTEROID_BODIES,
    layers: ['asteroids'],
    base: 11,
    span: 5,
  },
  /*
   * Comets last, and on the smallest chip scale in the bar.
   *
   * Thirteen bodies of 2 to 6 km, which is a narrower spread than any other
   * section — Hartley 2 and NEOWISE differ by a factor of three where the
   * planets differ by fifty. A small base with a small span keeps them
   * distinguishable without pretending the differences are dramatic.
   */
  { key: 'comets', label: 'Comets', bodies: COMETS, layers: ['comets'], base: 10, span: 5 },
  /*
   * Spacecraft last, and on the same chip scale as the comets even though they
   * are six orders of magnitude smaller.
   *
   * Sizing these honestly against anything else in the bar is impossible:
   * Voyager is four metres and Jupiter is 70,000 km, so a chip proportional to
   * radius would be an invisible dot. The bar's job is to be a way of getting
   * to a body, not a size chart — the scale slider and the scene itself are
   * where true proportions live — so these take a legible minimum and the
   * section heading says what they are.
   */
  {
    key: 'spacecraft',
    label: 'Spacecraft',
    bodies: SPACECRAFT,
    layers: ['spacecraft'],
    /*
     * One size for all of them, which is the honest answer rather than a
     * shortcut. Every other section sizes its chips by radius, and for craft
     * that spans four metres to twenty — a difference nobody can read at chip
     * size and which means nothing anyway, since a big bus is not a more
     * important destination than a small one. The old 10-13px range was also
     * far too small to show the model: a Voyager at thirteen pixels is a smudge.
     */
    base: 26,
    span: 0,
  },
]

/**
 * The minor moons get their own chip scale, not a place on the bar.
 *
 * They are never a top-level section — "Moons" opens the hosts, and a host opens
 * its own two tiers — so this is not in `SECTIONS`. But they do need their own
 * sizer, because run through the major-moon scale they would all collapse onto
 * the floor: the majors span Ganymede at 2,631 km down to Phobos at 11, and every
 * minor moon in the app sits inside the bottom sliver of that. On their own scale
 * Puck reads as visibly larger than Cupid, which is true and otherwise invisible.
 */
const MINOR_SIZER = { key: 'minorMoons', bodies: MINOR_MOONS, base: 10, span: 6 }

/**
 * How a dynamical group is written, and the order the groups are offered in.
 *
 * Saturn is why this exists. Its minor moons come to two hundred and seventy-six,
 * and a single row of that many chips is not a list, it is a wall — nineteen
 * thousand pixels of identical grey dots with no way to tell where you are in
 * it. Eyes solves this by grouping, and the groups are real rather than a
 * convenience: an irregular family is a set of fragments believed to come from
 * one captured parent body, which is why they cluster so tightly in orbit.
 *
 * Order is inner to outer, so scanning the tabs walks outward from the rings.
 * `null` sorts last under its own label: a hundred and thirty of Saturn's have
 * not been assigned to a family by anybody yet, and saying so is better than
 * inventing a bucket name that implies they have.
 */
const GROUP_ORDER = [
  'ring moonlet',
  'ring shepherd',
  'co-orbital',
  'alkyonides',
  'trojan',
  'amalthea',
  'galilean',
  'himalia',
  'carpo',
  'inuit',
  'gallic',
  'ananke',
  'carme',
  'pasiphae',
  'norse',
]

const GROUP_LABELS = {
  'ring moonlet': 'Ring moonlets',
  'ring shepherd': 'Ring shepherds',
  'co-orbital': 'Co-orbitals',
  alkyonides: 'Alkyonides',
  trojan: 'Trojans',
  amalthea: 'Amalthea group',
  galilean: 'Galileans',
  himalia: 'Himalia group',
  carpo: 'Carpo group',
  inuit: 'Inuit',
  gallic: 'Gallic',
  ananke: 'Ananke group',
  carme: 'Carme group',
  pasiphae: 'Pasiphae group',
  norse: 'Norse',
}

/** The bucket for a moon nobody has placed in a family. */
const UNGROUPED = '\u0000ungrouped'

/**
 * Above this many minor moons, a host's row is split by group first.
 *
 * Below it there is nothing to gain: Uranus's twenty-three fit in one scrolling
 * row and none of them carry a group anyway. Saturn is the only system that
 * currently crosses the line, and Jupiter will.
 */
const GROUP_THRESHOLD = 40

/** The groups present in a set of moons, innermost first, with counts. */
function groupsOf(moons) {
  const counts = new Map()
  for (const moon of moons) {
    const key = moon.group ?? UNGROUPED
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => {
      const ia = a[0] === UNGROUPED ? Infinity : GROUP_ORDER.indexOf(a[0])
      const ib = b[0] === UNGROUPED ? Infinity : GROUP_ORDER.indexOf(b[0])
      return ia - ib
    })
    .map(([key, n]) => ({
      key,
      n,
      label: key === UNGROUPED ? 'Unassigned' : (GROUP_LABELS[key] ?? key),
    }))
}

const SECTIONS_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s]))

/**
 * Which section a body's class belongs to.
 *
 * Built by asking each section what it holds rather than by writing the mapping
 * down twice. `kind` is the registry's own word for a class — `planet`, `dwarf`,
 * `moon`, `comet`, `spacecraft` — and every body in a section shares one, so the
 * first body's kind names the section.
 *
 * Moons are the exception and are handled separately in the effect below,
 * because a moon needs its *host* opened as well as its section.
 */
const SECTION_FOR_KIND = new Map(
  SECTIONS.flatMap((s) => (s.bodies.length ? [[s.bodies[0].kind, s.key]] : [])),
)

/**
 * The bodies that have a moon in the app, in bar order.
 *
 * Derived from the moons themselves rather than from each planet's `moons`
 * count, which is the number of moons the body really has — Jupiter's 95 — and
 * would offer to open rows that mostly do not exist.
 */
const HOSTS = [...PLANETS, ...DWARF_PLANETS]
  .filter((body) => moonsOf(body.id).length > 0)
  .map((body) => ({ body, moons: moonsOf(body.id) }))

/**
 * Chip diameters, normalised *within* each class rather than across all of them.
 *
 * Sized from the render radii but flattened further, so the smallest body in a
 * class stays a comfortable click target next to the largest. Doing it per class
 * matters with Phobos on the bar: on one shared scale it and Jupiter differ by a
 * factor of 36, which would either shrink the rocks to nothing or blow the
 * planets past the edge. Each class instead spans its own modest range, and the
 * *classes* differ in size — which is the comparison actually worth making.
 *
 * All of it runs off `chipRadius`, frozen at diorama scale, rather than whatever
 * the 3D scene is currently using. Chips are navigation: they need to stay the
 * same size and stay clickable however the scene is scaled.
 */
function sizerFor({ bodies, base, span }) {
  const min = Math.min(...bodies.map((b) => b.chipRadius))
  const max = Math.max(...bodies.map((b) => b.chipRadius))
  const range = max - min
  return (radius) => base + (range > 0 ? (radius - min) / range : 0) * span
}

const SIZERS = Object.fromEntries(
  [...SECTIONS, MINOR_SIZER].map((s) => [s.key, sizerFor(s)]),
)

/**
 * Which sizer a body belongs under, wherever it happens to be shown.
 *
 * Spacecraft used to be sent to the comets' sizer, which quietly made the
 * spacecraft section's own `base` and `span` dead data — they were declared,
 * they looked authoritative, and nothing read them. It did not show while every
 * craft was a plain disc, because one grey circle at ten pixels looks much like
 * another at thirteen. It shows immediately once the chip is a picture.
 */
const SIZER_FOR_KIND = {
  dwarf: 'dwarfs',
  asteroid: 'asteroids',
  comet: 'comets',
  spacecraft: 'spacecraft',
  planet: 'planets',
}

const sizeOf = (body) =>
  SIZERS[
    body.kind === 'moon'
      ? body.tier === 'minor'
        ? 'minorMoons'
        : 'moons'
      : (SIZER_FOR_KIND[body.kind] ?? 'planets')
  ](body.chipRadius)

// `name` rather than `body.name`: five of these answer to two names, and which
// one is right depends on the date. See `useNamer`.
const NavChip = memo(function NavChip({ body, name, size, active, sublabel, onSelect }) {
  // The same photographic map the 3D body is wearing, so the chip is a real
  // thumbnail rather than a coloured dot. Already in the browser cache from the
  // preload, so this costs nothing.
  const url = getTextureURL(body.id)

  /*
   * A spacecraft's chip is a picture of its model instead.
   *
   * Not a map on a sphere, so it takes neither the coloured disc behind it nor
   * the spherical shading over it: both exist to make a flat rectangle read as a
   * lit globe, and applied to a probe they put a hard terminator across a solar
   * array and a circular clip through its booms.
   */
  const model = body.kind === 'spacecraft' ? getSpacecraftThumb(body.model) : null

  return (
    <button
      type="button"
      className={
        `nav-chip${active ? ' is-active' : ''}${sublabel ? ' is-host' : ''}` +
        (model ? ' nav-chip--craft' : '')
      }
      onClick={() => onSelect(body.id)}
      onPointerEnter={() => useStore.getState().setHovered(body.id)}
      onPointerLeave={() => useStore.getState().setHovered(null)}
      title={name}
      aria-label={sublabel ? `${name} — show its moons` : `Fly to ${name}`}
      aria-current={active ? 'true' : undefined}
    >
      <span
        className={`nav-chip__dot${model ? ' nav-chip__dot--model' : ''}`}
        style={{ width: size, height: size, background: model ? 'none' : body.color }}
      >
        {model ? (
          <span className="nav-chip__model" style={{ backgroundImage: `url(${model})` }} />
        ) : (
          <>
            {url && <span className="nav-chip__map" style={{ backgroundImage: `url(${url})` }} />}
            {/* Spherical shading over the flat map: a highlight up and to the
                left, shadow falling away bottom-right. Without it the chip reads
                as a disc of wallpaper instead of a planet. */}
            <span className="nav-chip__shade" />
          </>
        )}
      </span>
      <span className="nav-chip__name">{name}</span>
      {sublabel && <span className="nav-chip__sub">{sublabel}</span>}
    </button>
  )
})

/** The collapsed control's glyph: three bodies on a shared orbit. */
function BodiesIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <ellipse
        cx="8"
        cy="8"
        rx="6.6"
        ry="3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.55"
      />
      <circle cx="8" cy="8" r="2.5" fill="currentColor" />
      <circle cx="14.2" cy="8" r="1.3" fill="currentColor" />
    </svg>
  )
}

export default function NavBar() {
  const selectedId = useStore((s) => s.selectedId)
  const selectPlanet = useStore((s) => s.selectPlanet)
  const musicOn = useStore((s) => s.musicOn)
  const layers = useStore((s) => s.layers)
  const toggleLayer = useStore((s) => s.toggleLayer)
  const open = useStore((s) => s.navOpen)
  const toggleNav = useStore((s) => s.toggleNav)
  const closeNav = useStore((s) => s.closeNav)
  const namer = useNamer()

  const [section, setSection] = useState('planets')
  /** The host whose moons are on the bar, or null while browsing a class. */
  const [openHost, setOpenHost] = useState(null)
  /**
   * Which tier of a host's moons is showing.
   *
   * Always resets to `'major'` on opening a host, which is the right default for
   * the same reason the split exists: Jupiter's four Galileans are why anyone
   * opens Jupiter, and putting them behind ninety-seven captured rocks in one
   * scrolling row would bury them.
   */
  const [tier, setTier] = useState('major')
  /**
   * Which dynamical group is open, for a system too large to show flat.
   *
   * A third level, and it earns its place only where the second one stops
   * working — see `GROUP_THRESHOLD`. Null means "show the groups themselves",
   * which is the same idiom the bar already uses one level up, where a planet
   * chip opens that planet's moons rather than flying to it.
   */
  const [openGroup, setOpenGroup] = useState(null)

  const visible = SECTIONS.filter((s) => s.layers.length === 0 || s.layers.some((k) => layers[k]))

  /*
   * Follow the scene rather than only driving it.
   *
   * A moon can be selected without touching this at all — by clicking it in the
   * scene, or through the dossier's "moons in view" links. When that happens
   * the switcher opens the moon's parent, so what it shows next time always
   * includes what is selected. Without this it would sit on Planets claiming
   * nothing was selected while Europa filled the viewport.
   */
  useEffect(() => {
    const body = selectedId ? BODIES_BY_ID[selectedId] : null
    /*
     * Clicking out to the whole solar system comes out of the host as well.
     *
     * This used to return early and leave the drill where it was, which was
     * harmless while the bar was only a list. It stopped being harmless once
     * the open host decided which planet's minor moons are drawn: backing out
     * to the overview with Saturn still drilled left its 278 in the scene and
     * the layer panel still offering to toggle them, for a planet no longer on
     * screen. The section is kept — it is still moons you were looking at.
     */
    if (!body) {
      setOpenHost(null)
      setOpenGroup(null)
      return
    }
    if (body.kind === 'moon') {
      setSection('moons')
      setOpenHost(body.parent)
      // Follow the selection into its own tier, so a minor moon picked in the
      // scene is a chip you can see rather than one behind an unpressed toggle.
      setTier(body.tier)
      // Follow the selection all the way in, so a moon picked in the scene is a
      // chip you can see rather than one behind two unpressed controls.
      setOpenGroup(body.tier === 'minor' ? (body.group ?? UNGROUPED) : null)
    } else {
      /*
       * Every other class opens its own section.
       *
       * This was a two-branch `if` — moons, dwarf planets, and an `else` that
       * said Planets — written when those were the only three things in the bar.
       * Comets and spacecraft arrived afterwards and fell into that `else`, so
       * selecting ARTEMIS P1 and then opening the nav showed the eight planets:
       * the bar claimed you were somewhere in the inner system while a probe
       * orbiting the Moon filled the screen and its name sat in the breadcrumb.
       *
       * Derived from `SECTIONS` rather than another branch per kind, so a class
       * added to the bar is followed here without anyone having to remember to
       * come back. The lookup is by identity — `bodies` is the same array the
       * section renders — so a body can never be shown a section it is not in.
       */
      setSection(SECTION_FOR_KIND.get(body.kind) ?? 'planets')
      setOpenHost(null)
    }
  }, [selectedId])

  // A section can vanish under the layer switches while it is open — turning
  // moons off with Europa's row showing, say. Fall back rather than render a bar
  // full of bodies that are no longer in the scene.
  useEffect(() => {
    if (!visible.some((s) => s.key === section)) {
      setSection('planets')
      setOpenHost(null)
    }
  }, [visible, section])

  // Escape closes it, as it does every other transient surface.
  useEffect(() => {
    if (!open) return
    const onKey = (event) => {
      if (event.key === 'Escape') closeNav()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeNav])

  const onSelect = (id) => {
    // Only chirp if the user has opted into sound at all.
    if (musicOn) playSelectSound()
    selectPlanet(id)
    // Picking a destination is the end of the errand. Opening a *host* is not,
    // which is why only this path closes — see the `onSelect` prop below.
    closeNav()
  }

  const host = openHost ? BODIES_BY_ID[openHost] : null
  const drilled = section === 'moons' && host

  /*
   * Publish the open host, because "minor moons" now names one.
   *
   * The layer panel's row and the `N` shortcut both have to resolve to a planet,
   * and this is where that planet is decided. Cleared when the bar is not
   * drilled into a host, so at the top level the switch has nothing to act on
   * and says so rather than quietly toggling the last planet visited.
   */
  const setNavHost = useStore((s) => s.setNavHost)
  useEffect(() => {
    setNavHost(drilled ? host.id : null)
  }, [drilled, host, setNavHost])

  /*
   * A host may have no moons of the open tier — Mars has two major and no
   * minor — so fall back rather than render an empty row.
   *
   * Sits below `drilled` rather than with the other effects because it reads it.
   */
  useEffect(() => {
    if (!drilled) return
    // Against the roster, not the scene. Filtering by `bodyShown` here would
    // bounce the user straight back to Major the instant they opened Minor,
    // because this effect runs before the switch it triggers has taken effect.
    if (tier === 'minor' && minorMoonsOf(host.id).length === 0) setTier('major')
    else if (tier === 'major' && majorMoonsOf(host.id).length === 0) setTier('minor')
  }, [drilled, host, tier])


  /*
   * Only bodies that are actually drawn. The `Moons` row is the one that needs
   * it: its hosts include Pluto, so with dwarf planets switched off the bar
   * offered a Pluto chip that opened a row of five moons which are not in the
   * scene — and flying to one parks the camera on nothing. `bodyShown` is the
   * same predicate the scene and the label layer filter by, so the bar cannot
   * disagree with them about what exists.
   */
  /** A host's minor moons that are drawn, and the groups they fall into. */
  const minorHere = useMemo(
    () => (drilled ? minorMoonsOf(host.id).filter((m) => bodyShown(m, layers)) : []),
    [drilled, host, layers],
  )

  /** Empty unless this system is large enough to be worth splitting by group. */
  const groups = useMemo(() => {
    if (tier !== 'minor' || minorHere.length <= GROUP_THRESHOLD) return []
    const found = groupsOf(minorHere)
    return found.length > 1 ? found : []
  }, [tier, minorHere])

  const chips = useMemo(() => {
    const shown = (body) => bodyShown(body, layers)
    if (drilled) {
      if (tier === 'major') return majorMoonsOf(host.id).filter(shown)
      if (!groups.length) return minorHere
      if (openGroup === null) return []
      return minorHere.filter((m) => (m.group ?? UNGROUPED) === openGroup)
    }
    if (section === 'moons') {
      // A host earns its chip only if it still has a moon in the scene. With
      // Minor moons off, a planet whose moons are all minor has nothing behind
      // its chip, and the chip would read "0 moons".
      return HOSTS.map((h) => h.body).filter(
        (body) => shown(body) && moonsOf(body.id).some((m) => bodyShown(m, layers)),
      )
    }
    return SECTIONS_BY_KEY[section].bodies.filter(shown)
  }, [drilled, host, section, tier, layers, groups, openGroup, minorHere])

  const openSection = (key) => {
    setSection(key)
    setOpenHost(null)
  }

  const openHostRow = (id) => {
    setOpenHost(id)
    setTier('major')
    setOpenGroup(null)
  }

  const openTier = (key) => {
    setTier(key)
    setOpenGroup(null)
    // Opening the Minor tab *is* the request to see them, so it switches this
    // host on rather than requiring the layer panel first. That also settles a
    // chicken-and-egg the old global switch had: the tab was hidden until minor
    // moons were on, so the one control that named a host could not be used to
    // choose one.
    if (key === 'minor' && layers.minorMoons !== host.id) toggleLayer('minorMoons', host.id)
  }

  /**
   * The tiers this host offers, counted over the roster rather than the scene.
   *
   * This used to filter by `bodyShown`, so a host's Minor tab vanished whenever
   * its minor moons were switched off — which was fine when one global switch
   * governed all of them and merely meant "you turned them off". Now that the
   * switch names a host, the tab is how you pick that host, and hiding it until
   * the moons are already showing makes it unreachable.
   *
   * The count still reflects the scene: it is what the host *has*, which is what
   * the user is choosing between. One tier means no tabs — nothing to choose,
   * and Mars would otherwise carry a lone "Major 2".
   */
  const tiers = useMemo(() => {
    if (!drilled) return []
    const counts = [
      { key: 'major', label: 'Major', n: majorMoonsOf(host.id).length },
      { key: 'minor', label: 'Minor', n: minorMoonsOf(host.id).length },
    ].filter((t) => t.n > 0)
    return counts.length > 1 ? counts : []
  }, [drilled, host])

  /*
   * What the row currently shown actually is.
   *
   * Drilled into a planet's moons it describes that system; otherwise it
   * describes the class. Every case is covered, so the line is never empty and
   * the card never changes height — see `navbar-keynote` in the stylesheet for
   * why that matters more than it sounds like it should.
   */
  const keynote = drilled ? SYSTEM_KEYNOTES[host.id] : SECTION_KEYNOTES[section]

  const current = selectedId ? BODIES_BY_ID[selectedId] : null

  return (
    /*
      The wheel belongs to this dock, not to the camera.

      `CameraController` listens for wheels on the whole stage and forwards
      anything that is not over a self-scrolling control to the canvas, so the
      chrome does not punch zoom-dead holes in the first screen. That is right
      for the timeline and the credits, which are thin things laid over the
      scene; it is wrong for an open list of bodies.

      On the *dock* rather than on the panel, and the difference is the keynote
      card. It is a sibling of the panel, not a child, and it sits directly above
      the chips — which is where a pointer on its way to the list already is. So
      marking only the panel left a strip of the same control surface still
      handing its wheel to the camera: the row scrolled when you were low enough
      and the comet behind it zoomed when you were not.

      `.navbar-dock` is `pointer-events: none` with only its two children taking
      events, so this claims exactly the keynote and the panel and none of the
      empty space they float in.
    */
    <div className={`navbar-dock${open ? ' is-open' : ''}`}>
      {/* Its own card, floating clear of the panel rather than sharing its box.
          Keyed so the line replays its fade when the row changes under it —
          without that, switching from Planets to Dwarf planets silently swaps
          one paragraph for another and it is easy to miss that it said
          anything new. */}
      <p
        className="navbar-keynote glass"
        data-wheel="ui"
        aria-hidden={!open}
        key={drilled ? `system-${host.id}` : section}
      >
        {keynote}
      </p>

      {/* The panel is always mounted and hidden with `visibility`, so the chips
          and their thumbnails are laid out once rather than on every open. */}
      <nav
        className="navbar glass"
        data-wheel="ui"
        aria-label="Body navigation"
        aria-hidden={!open}
      >
        <div className="navbar__main">
          <div className="navbar__lead">
            {drilled ? (
              <button
                type="button"
                className="navbar__back"
                onClick={() => (openGroup === null ? setOpenHost(null) : setOpenGroup(null))}
                aria-label={openGroup === null ? 'Back to all moons' : `Back to ${namer(host)}'s groups`}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path
                    d="M10 3L5 8l5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="navbar__back-label">
                  {openGroup === null
                    ? namer(host)
                    : (groups.find((g) => g.key === openGroup)?.label ?? namer(host))}
                </span>
              </button>
            ) : null}

            {drilled ? (
              tiers.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`navbar__tab${tier === t.key ? ' is-open' : ''}`}
                  onClick={() => openTier(t.key)}
                  aria-pressed={tier === t.key}
                >
                  {t.label}
                  <span className="navbar__tab-count">{t.n}</span>
                </button>
              ))
            ) : (
              visible.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`navbar__tab${section === s.key ? ' is-open' : ''}`}
                  onClick={() => openSection(s.key)}
                  aria-pressed={section === s.key}
                >
                  {s.label}
                </button>
              ))
            )}
          </div>

          <span className="navbar__divider" aria-hidden="true" />

          {/* Keyed so the row replays its transition when the contents change —
              switching class or opening a host should read as a move, not a
              silent swap. */}
          <div
            className="navbar__row"
            key={drilled ? `${host.id}-${tier}-${openGroup ?? ''}` : section}
          >
            {/* The group level, when there is one. Rendered as chips rather than
                tabs because it is a *drill*, the same move as opening a planet's
                moons — and because fifteen tabs would not fit the lead row. */}
            {drilled && tier === 'minor' && groups.length > 0 && openGroup === null
              ? groups.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    className="nav-chip nav-chip--group"
                    onClick={() => setOpenGroup(g.key)}
                    aria-label={`${g.label} — show its ${g.n} ${g.n === 1 ? 'moon' : 'moons'}`}
                  >
                    <span className="nav-chip__dot nav-chip__dot--group" aria-hidden="true">
                      {g.n}
                    </span>
                    <span className="nav-chip__name">{g.label}</span>
                    <span className="nav-chip__sub">
                      {g.n} moon{g.n > 1 ? 's' : ''}
                    </span>
                  </button>
                ))
              : null}
            {chips.map((body) => {
              const moons =
                section === 'moons' && !drilled
                  ? moonsOf(body.id).filter((m) => bodyShown(m, layers)).length
                  : 0
              return (
                <NavChip
                  key={body.id}
                  body={body}
                  name={namer(body)}
                  size={sizeOf(body)}
                  active={selectedId === body.id}
                  sublabel={moons ? `${moons} moon${moons > 1 ? 's' : ''}` : null}
                  onSelect={moons ? openHostRow : onSelect}
                />
              )
            })}
          </div>
        </div>
      </nav>

      {/* Names where you are rather than what it opens. "Bodies" would be
          accurate and tell you nothing; the current destination is the one
          piece of state worth spending a permanent control on. */}
      <button
        type="button"
        className="navbar-toggle glass"
        onClick={toggleNav}
        aria-expanded={open}
        aria-label={open ? 'Close the body selector' : 'Open the body selector'}
      >
        <BodiesIcon />
        <span className="navbar-toggle__label">{current?.name ?? 'Solar System'}</span>
        <svg className="navbar-toggle__caret" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <path
            d="M4 6.5l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}
