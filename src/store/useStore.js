import { create } from 'zustand'
import * as THREE from 'three'
import { julianDate } from '../orbit/kepler'
import { EPOCH_RANGE } from '../data/orbitalElements'
import { BODIES, BODIES_BY_ID, bodyLayer, bodyShown } from '../data/bodies'
import { isFlying, trajectoryWindow } from '../orbit/trajectory'
import { landedCraft } from '../data/landedCraft'

/**
 * id -> 'planet' | 'dwarf' | 'moon'.
 *
 * Just enough of the registry for `toggleLayer` to know whether the selected
 * body is about to be hidden. Importing the whole of `bodies.js` here is safe
 * — nothing in that chain imports the store back — but flattening it to this
 * one lookup keeps the store from growing a dependency on the shape of a body.
 */
/**
 * id → the visibility layer that governs whether that body is drawn.
 *
 * Was `BODY_KINDS`, mapping id to kind, which worked while kind and layer were
 * the same thing. They stopped being the same when the moons split into two
 * switchable tiers: a minor moon's kind is still `'moon'`, but the switch that
 * governs it is `minorMoons`. Keying on the layer directly means `toggleLayer`
 * below asks the question it actually needs answered.
 *
 * The mapping itself now lives beside `bodyShown`, which is the other half of
 * the same question. It was written out twice, and the two copies drifted: this
 * one knew about `asteroids` and the drawing rule did not, so the switch
 * deselected Vesta perfectly well and left it on screen.
 */
const BODY_LAYERS = Object.fromEntries(BODIES.map((b) => [b.id, bodyLayer(b)]))

/** The layers that populate the scene rather than annotate it. */
export const CLASS_LAYERS = [
  'planets',
  'dwarfPlanets',
  'asteroids',
  'moons',
  'minorMoons',
  'comets',
  'spacecraft',
]

/** id → parent id, for deciding whether a hidden host takes the selection with it. */
const BODIES_BY_PARENT = Object.fromEntries(BODIES.map((b) => [b.id, b.parent ?? null]))

/**
 * Which planet "minor moons" means right now.
 *
 * The nav bar's open host first, because if the user is looking at a list of
 * Saturn's moons then Saturn is unambiguously what they mean. Failing that, the
 * host of whatever is selected — so the switch still works when a moon was
 * picked from the scene rather than from the bar, and so that selecting a
 * planet and hitting `N` does the obvious thing.
 */
function minorMoonHost(state) {
  if (state.navHost) return state.navHost
  const selected = state.selectedId
  if (!selected) return null
  return BODIES_BY_PARENT[selected] ?? selected
}

/**
 * Minor moons are lit only while you are still *in* the host they belong to.
 *
 * "In" means one of two things: the nav bar is drilled into that planet, or the
 * selection is inside it. Leave by either route — click out to the whole solar
 * system, fly to something in another system, back the bar out to the planet
 * list — and the swarm is put away.
 *
 * Written as one rule applied at every exit rather than as a clear at each of
 * them, because the exits are not a closed set: selection changes arrive from
 * the nav bar, the breadcrumb, a click in the scene and the wheel-release, and
 * a rule that had to be remembered at each would eventually be forgotten at one.
 * That is the whole value of scoping — leaving 278 bodies drawn around a planet
 * nobody is looking at is the hitch this was meant to remove.
 *
 * Takes the patch being built, so it reads the *outgoing* state where the patch
 * sets it and the current state where it does not.
 */
function anchorMinorMoons(state, patch) {
  const layers = patch.layers ?? state.layers
  const lit = layers.minorMoons
  if (!lit) return patch

  const navHost = 'navHost' in patch ? patch.navHost : state.navHost
  const selectedId = 'selectedId' in patch ? patch.selectedId : state.selectedId
  const selectedHost = selectedId ? (BODIES_BY_PARENT[selectedId] ?? selectedId) : null

  if (navHost !== lit && selectedHost !== lit) {
    patch.layers = { ...layers, minorMoons: null }
  }
  return patch
}

/**
 * Live world positions of the bodies, keyed by id.
 *
 * Deliberately *not* part of the reactive store: these change every frame, and
 * pushing them through React state would re-render the whole tree 60 times a
 * second. Bodies write into this map from their own `useFrame`, and the camera
 * controller reads from it in its `useFrame`.
 */
export const planetPositions = new Map()

export function registerPlanetPosition(id) {
  if (!planetPositions.has(id)) planetPositions.set(id, new THREE.Vector3())
  return planetPositions.get(id)
}

/**
 * How far the page has scrolled into the dossier, as 0..1 across one viewport.
 *
 * Same reasoning as `planetPositions`: it changes with every scroll event and
 * is read every frame by the renderer, so it lives outside React entirely.
 * `useScrollChrome` writes it; `ViewFraming` in the scene reads it to slide the
 * shot aside, and `CameraController` reads it to know the wheel is no longer
 * its to take.
 *
 * Deliberately not the same number as the chrome fade, which finishes much
 * earlier — the controls should be gone well before the planet has finished
 * moving.
 */
export const viewScroll = { p: 0 }

/**
 * Deselecting takes the page back to the top, so the framing goes with it.
 *
 * Belt and braces rather than ceremony. `p` is only recomputed on scroll and
 * resize events, and deselecting destroys the dossier — the document collapses
 * to one screen and the browser clamps `scrollY` itself. If that clamp ever
 * failed to raise a scroll event, `p` would be left high with nothing below the
 * fold, which does not merely look wrong: `SimulationClock` scales the time rate
 * by `1 - p`, so the clock would stop and never start again.
 */
function releaseView(patch) {
  viewScroll.p = 0
  return patch
}

/**
 * The simulation clock.
 *
 * Same reasoning as `planetPositions`: the Julian Date advances every frame and
 * every body reads it every frame, so it lives outside React entirely. The
 * store carries a *copy* for the UI (`displayJD`), updated a few times a second
 * — enough for a date readout to look live, nowhere near often enough to matter
 * for rendering.
 */
export const simClock = {
  jd: julianDate(new Date()),
}

/** Clamp to the window the orbital element table is actually valid for. */
export function setSimulationDate(jd) {
  simClock.jd = Math.min(EPOCH_RANGE.maxJD, Math.max(EPOCH_RANGE.minJD, jd))
  useStore.getState().setDisplayJD(simClock.jd)
}

/**
 * Choosing a mission that has ended takes the clock to it.
 *
 * The nav lists every craft on the roster whatever the date says, so the Galileo
 * Probe is one click away in 2026 — and it stopped existing in December 1995,
 * when it was dropped into Jupiter. Selecting it used to set the title, the
 * dossier and the highlight, and move the camera nowhere at all, because there
 * was no such object to move to. Nothing was broken and nothing appeared to
 * happen, which is the worst version of both.
 *
 * A body cannot be shown at a date it does not exist, so the only thing a click
 * can honestly mean is "show me this" — and that requires the clock. So it goes,
 * and the camera flies once the craft appears.
 *
 * The **midpoint** of the mission rather than its start or end. Clamping to the
 * nearer edge lands on the first or last instant the craft exists, which is a
 * launch with no trail behind it or a craft one frame from vanishing; the middle
 * is the mission underway, with history behind it and somewhere still to go.
 *
 * Only for a body that has a trajectory window and is outside it. A planet has
 * no window, and a craft still flying is already here.
 */
function carryClockToMission(id) {
  const body = BODIES_BY_ID[id]
  if (!body || body.kind !== 'spacecraft') return

  /*
   * A landed craft's mission is not its trajectory window.
   *
   * That window is the extent of a JPL ephemeris, and for a rover the ephemeris
   * stops being propagated long before the rover stops working — Perseverance's
   * ends 2026-02-18 while the rover is still driving. Nothing draws it either:
   * a landed craft is placed from its coordinates. Asking `isFlying` here sent
   * the clock to 2023 for a click on a rover that is there today.
   *
   * It has two lives and both count. Before touchdown it is a cruise stage on
   * an ordinary trajectory, drawn from ordinary samples, and the window governs
   * that half exactly as it governs any other craft — clicking Perseverance a
   * month out from Mars must leave you watching the approach, not jump you to
   * the middle of the surface mission. Only the far end is special, and only
   * `ended` closes it: InSight's samples run to 2050 and InSight stopped
   * answering in 2022.
   */
  const site = landedCraft(id)
  if (site) {
    /*
     * It has two lives and both count. Before touchdown it is a cruise stage on
     * an ordinary trajectory, drawn from ordinary samples, and the window
     * governs that half exactly as it governs any other craft — clicking
     * Perseverance a month out from Mars must leave you watching the approach,
     * not jump you to the middle of the surface mission. Only the far end is
     * special, and only `ended` closes it: InSight's samples run to 2050 and
     * InSight stopped answering in 2022.
     */
    const over = site.ended !== null && simClock.jd > site.ended
    if (!over && (simClock.jd >= site.landed || isFlying(body, simClock.jd))) return
    setSimulationDate((site.landed + (site.ended ?? julianDate(new Date()))) / 2)
    return
  }

  if (isFlying(body, simClock.jd)) return
  const window = trajectoryWindow(body)
  if (!window) return
  setSimulationDate((window.start + window.end) / 2)
}

/**
 * Default rate, in simulated days per real second.
 *
 * There is no rate at which both rotation and orbits look good, and that is
 * physics rather than a tuning failure: Earth spins 365 times per orbit. The
 * old scene dodged it by running spin and orbit off unrelated hand-tuned
 * constants — 18 spins per orbit instead of 365 — which looked fine and was
 * fiction. With one clock driving both, the trade-off becomes real.
 *
 * 1 day/s resolves it toward rotation: Earth turns once a second, close to the
 * 0.78/s the scene used to run at, and Mercury still laps in 88 seconds so the
 * overview stays alive. Seeing the outer planets move is what the rate control
 * is for — Neptune genuinely takes 165 years.
 */
export const DEFAULT_RATE_DAYS_PER_SEC = 1

export const useStore = create((set, get) => ({
  /* ---- selection ---- */
  selectedId: null,
  hoveredId: null,

  /**
   * Bumped every time the user asks to go somewhere. The camera controller
   * watches this so that re-selecting the planet you are already on (or
   * clicking "Back to Solar System" twice) still triggers a fresh flight.
   */
  flightNonce: 0,

  /**
   * The body whose *moon system* is framed, rather than the body itself.
   *
   * A satellite system is a place you can be — Jupiter with the Galileans
   * spread around it is a different view from Jupiter filling the frame — but
   * it is not a body, so it cannot be a `selectedId`. It rides alongside one
   * instead: `systemId` is always either null or equal to `selectedId`, and it
   * means "you are at this body, pulled back far enough to see what orbits it".
   *
   * Kept as a separate field rather than a mode baked into `selectedId` so that
   * everything reading the selection — the dossier, the title, the label
   * highlight — carries on naming Jupiter without knowing this exists. The
   * camera is the only part that has to care.
   */
  systemId: null,

  /**
   * Riding along with the selected craft, rather than watching it go past.
   *
   * The difference is which frame the camera holds still in. Following a craft
   * keeps it centred while the world stays the right way up; riding it holds
   * the *craft* the right way up, so as it turns to point an instrument the
   * stars and the planet wheel around you. That is the whole of what a
   * ride-along is, and it is why this is a camera mode rather than a distance.
   *
   * Cleared by any change of selection, because it means nothing away from a
   * spacecraft: there is no attitude to ride. Kept in the store rather than in
   * the camera because the button that turns it on lives in the chrome.
   */
  rideAlong: false,
  toggleRide: () =>
    set((s) => {
      const body = s.selectedId ? BODIES_BY_ID[s.selectedId] : null
      if (!body || body.kind !== 'spacecraft') return { rideAlong: false }
      return { rideAlong: !s.rideAlong, rideNonce: s.rideNonce + 1 }
    }),
  /** Bumped on every entry, so the camera re-seats even if it is already on. */
  rideNonce: 0,

  /**
   * Standing on the ground somewhere, or null.
   *
   * `{ body, lat, lon, name }` — where — and `{ azimuth, altitude, fov }`, which
   * way you are looking and how much of the sky you can see at once. The look
   * angles live here rather than in the camera because the readout names the
   * direction you are facing, and because leaving and coming back should put you
   * back where you were looking.
   *
   * ## Standing up takes the scale dial to true, and it has to
   *
   * A view from orbit is a picture; a view from the ground is a claim about
   * *angles*, and the diorama cannot support one. Measured from the Earth's
   * surface, the Moon subtends:
   *
   *     diorama (0)     6.342°     twelve times too big
   *     mid-dial (0.5) 13.244°     worse than either end
   *     true (1)        0.548°     against a real 0.518° at mean distance
   *
   * The mid-dial being the worst of the three is not a bug either: body radii
   * and orbital distances are warped on different curves, so they cross over
   * somewhere in the middle and the ratio between them is at its furthest from
   * the truth there. There is exactly one setting at which standing on a planet
   * and looking up shows you the sky that is actually over that spot, so
   * standing sets it.
   *
   * The dial is left where it is put on the way back out. Restoring it would be
   * tidier and would also undo a change the user can see happening, which reads
   * as the app fighting them.
   */
  surface: null,

  /**
   * Stand at a latitude and longitude on a body.
   *
   * Selects the body too, so the breadcrumb and the title agree with where you
   * are — and because the camera's follow works off the selection.
   */
  standOn: (body, lat, lon, name = null) =>
    set((s) => ({
      ...anchorMinorMoons(s, { selectedId: body, systemId: null, rideAlong: false }),
      scaleMode: 1,
      surface: {
        body,
        lat,
        lon,
        name,
        // Facing north, level with the horizon: the one starting direction that
        // is a statement about the place rather than about the last camera.
        azimuth: 0,
        altitude: 12,
        fov: 60,
      },
    })),

  /** Where you are looking from where you are standing. */
  lookAround: (azimuth, altitude) =>
    set((s) => (s.surface ? { surface: { ...s.surface, azimuth, altitude } } : {})),

  setSurfaceFov: (fov) =>
    set((s) => (s.surface ? { surface: { ...s.surface, fov } } : {})),

  leaveSurface: () => set({ surface: null }),

  selectPlanet: (id) => {
    // Before the selection lands, so the craft already exists on the frame the
    // camera controller arms its flight. See `carryClockToMission`.
    carryClockToMission(id)
    set((s) =>
      anchorMinorMoons(s, {
        // Picking a body always leaves the system view, including when it is the
        // same body: clicking Jupiter while framing its moons is a request to go
        // to Jupiter.
        systemId: null,
        // And always leaves the ride: it belongs to the craft you were on.
        rideAlong: false,
        // And the ground: standing somewhere is a place, and this is a request
        // to go to a different one.
        surface: null,
        ...(s.selectedId === id ? null : { selectedId: id }),
        flightNonce: s.flightNonce + 1,
      }),
    )
  },

  /**
   * Select a body, switching on whatever it takes to see it.
   *
   * `selectPlanet` assumes the body is already drawn, which is true of every
   * caller that got the id from something on screen — a chip, a label, a click
   * in the scene. Search is the first caller that does not: four of the six
   * classes are off by default, and the whole point of typing a name is to
   * reach something you cannot currently see.
   *
   * With the class switched off the failure is silent and total. The body is
   * never mounted, so it never writes a position, so `armFlight` returns false
   * every frame and the camera never moves — the title changes, the dossier
   * opens, and the view sits exactly where it was.
   *
   * Up the whole parent chain, because `bodyShown` is recursive: reaching a
   * moon of Pluto needs the dwarf planets on as well as the moons, and without
   * that rule it would be selected, hidden, and collapsed onto the origin.
   *
   * One `set`, rather than a `toggleLayer` per class followed by a
   * `selectPlanet`. `anchorMinorMoons` puts the swarm away whenever the lit
   * host is neither the nav's nor the selection's, so a lit-then-select
   * sequence would switch the minor moons on and straight back off again.
   */
  revealAndSelect: (id) => {
    const body = BODIES_BY_ID[id]
    if (!body) return
    carryClockToMission(id)
    set((s) => {
      const layers = { ...s.layers }
      for (let b = body; b; b = b.parent ? BODIES_BY_ID[b.parent] : null) {
        if (b.kind === 'moon') {
          if (b.tier === 'minor') layers.minorMoons = b.parent
          else layers.moons = true
        } else if (BODY_LAYERS[b.id]) layers[BODY_LAYERS[b.id]] = true
        else if (b.kind === 'spacecraft') layers.spacecraft = true
      }
      const patch = {
        layers,
        selectedId: id,
        systemId: null,
        rideAlong: false,
        surface: null,
        flightNonce: s.flightNonce + 1,
      }
      // The bar follows the selection anyway; setting the host here keeps the
      // minor-moon anchor honest if the next action is a bare `toggleLayer`.
      if (body.kind === 'moon' && body.tier === 'minor') patch.navHost = body.parent
      return patch
    })
  },

  /**
   * Pull back to frame everything orbiting `id`.
   *
   * Selects the parent as well, so the dossier and the title name the body the
   * moons belong to. The camera controller reads `systemId` to know it should
   * frame the system's width instead of the globe.
   */
  frameSystem: (id) =>
    set((s) =>
      anchorMinorMoons(s, {
        selectedId: id,
        systemId: id,
        rideAlong: false,
        surface: null,
        flightNonce: s.flightNonce + 1,
      }),
    ),

  clearSelection: () =>
    set((s) =>
      anchorMinorMoons(
        s,
        releaseView({
          selectedId: null,
          systemId: null,
          rideAlong: false,
          surface: null,
          flightNonce: s.flightNonce + 1,
        }),
      ),
    ),

  setHovered: (id) => set((s) => (s.hoveredId === id ? s : { hoveredId: id })),

  /* ---- simulation clock ----
   *
   * Starts paused. The app opens on the solar system as it is *right now*, and
   * letting the clock run immediately means the first thing it does is walk
   * away from that instant — by the time you have read the date it is no longer
   * the date. Time is the thing this app is about, so starting it is a
   * deliberate act rather than the default.
   */
  paused: true,
  togglePaused: () => set((s) => ({ paused: !s.paused })),

  /** Simulated days per real second. Negative runs time backwards. */
  timeRate: DEFAULT_RATE_DAYS_PER_SEC,
  setTimeRate: (timeRate) => set({ timeRate }),

  /** Throttled mirror of `simClock.jd`, for the date readout. */
  displayJD: simClock.jd,
  setDisplayJD: (displayJD) => set({ displayJD }),

  /**
   * 0 = the diorama the app has always shown, 1 = true scale.
   *
   * See `src/orbit/frames.js`. Kept at 0 by default: true scale is honest but
   * nearly empty, and it should be something the user chooses to look at rather
   * than what greets them.
   */
  scaleMode: 0,
  setScaleMode: (scaleMode) => set({ scaleMode }),

  /* ---- display layers ----
   *
   * Grouped rather than kept as loose booleans, the way Eyes groups them: they
   * are the same *kind* of thing (annotation drawn over the scene, independently
   * switchable) and the set grows as spacecraft and small bodies arrive.
   */
  layers: {
    /*
     * Orbits and trails are two switches because they drive two different
     * renderers over two disjoint sets of bodies, exactly as in Eyes — the eight
     * planets and Earth's Moon draw a static ellipse, everything else draws a
     * tapering trail, and no body ever draws both. See `scene/eyesPalette.js`.
     *
     * This replaced a single `orbits` switch with two dependent sub-switches,
     * `orbitColours` and `moonOrbits`. Both are gone: colour is no longer
     * optional now that the palette is Eyes' own rather than something derived
     * from the body colours, and "moon orbits" was a nested special case for
     * what is really just the other renderer.
     */
    /** Static closed ellipses: the planets, and the Moon. */
    orbits: true,
    /**
     * Tapering paths behind the body: the other moons, the dwarfs, Charon.
     *
     * On to open with, which only became worth doing once `moons` was too.
     * *Every* body that draws a trail is a dwarf planet or a moon other than
     * ours — so while both class switches were off, this one opened with an
     * empty set and appeared to be a control that did nothing. Turning it on
     * alongside the major moons is what gives it something to act on: the moons
     * arrive already tracing their orbits rather than as unexplained dots beside
     * their planets.
     */
    trails: true,
    /** Name text beside each body. */
    labels: true,
    /**
     * Named places on a surface — craters, seas, mountains.
     *
     * On, and it costs nothing at the overview: nothing is drawn until you are
     * close enough to a body for its features to be several tens of pixels
     * across, which never happens from the outside. See `SurfaceFeatures`.
     */
    features: true,
    /**
     * Where things have landed — and where things have hit.
     *
     * On, and beside the features rather than under them because it is a
     * different claim about the same ground: a crater name says what the
     * surface is called, and a landing site says something happened here. It
     * costs even less than the features do, since nothing is drawn until the
     * body itself fills a good part of the screen and only five bodies in the
     * app have a site at all. See `SurfaceFeatures`.
     */
    landingSites: true,
    /** Screen-space markers, so a body stays findable once it's sub-pixel. */
    icons: true,
    /**
     * The 88 constellation figures, over the stars that are always drawn.
     *
     * Off by default, and it is the only annotation switch that is. The other
     * three annotate the *subject* — a planet's orbit, its name, its marker —
     * and this one draws over the backdrop, which is exactly where the eye is
     * not meant to be. It is a thing to turn on when the sky is the question.
     */
    constellations: false,
    /**
     * The Milky Way band across the sky.
     *
     * On, unlike the figures, because it is not an annotation — it is the
     * largest real thing in the view, and leaving it off would be drawing a
     * night sky with its most obvious feature switched off. A switch at all
     * because a photographic band across the frame is exactly the kind of thing
     * you want out of the way while looking at an orbit.
     */
    milkyWay: true,

    /* Which classes of body exist at all. Unlike the four above these do not
       annotate the scene, they populate it — switching one off removes the
       geometry rather than hiding a label over it.

       These three used to be off together, on the argument that the opening shot
       should read at a glance and everything past the eight planets was contents
       rather than overture. That still holds for two of them and no longer holds
       for the majors, which are the part of the contents most people came for —
       an app that opens with no Moon, no Europa and no Titan is hiding its own
       subject behind a switch nobody knows to look for.

       The two that stay off are off for reasons that have not changed: the
       scattered dwarfs drag the useful zoom range out past Eris at 97 AU, and
       the minor moons are hundreds of unresolved specks whose orbits sprawl
       across the outer system. */
    /**
     * The eight, on by default — they are the furniture of the scene.
     *
     * Worth having a switch at all because hiding them is the only way to see
     * what else is out there on its own terms: Saturn's captured swarm, or the
     * comets' orbits, without eight bright ellipses across the middle of it.
     *
     * Turning it off takes the moons with it, and that is `bodyShown`'s existing
     * parent rule rather than anything new — a satellite of a body that is not
     * drawn is not drawn either. It is also the honest reading: "hide the
     * planets" cannot sensibly leave Europa orbiting nothing.
     */
    planets: true,
    dwarfPlanets: false,
    /**
     * The moons that are places: the twenty-five in `moonData.js`.
     *
     * Peers with the switch below rather than a parent of it. A minor moon is
     * not a detail of a major one — they are two different populations that
     * happen to orbit the same planet, and either is worth seeing without the
     * other. Turning this off with `minorMoons` on leaves Jupiter surrounded by
     * its captured swarm and no Galileans, which is a strange sight and an
     * honest one.
     */
    moons: true,
    /**
     * The unresolved ones: `minorMoonData.js` — and **not a boolean**.
     *
     * This holds the id of the *one host* whose minor moons are drawn, or null
     * for none. Everything else in `layers` is on or off; this is on for one
     * planet at a time, which is how Eyes does it and is the only version that
     * stays usable now the roster is 413 bodies.
     *
     * A global switch was the original design and it does not survive contact
     * with Saturn. Turning it on meant 413 extra bodies, orbits and labels
     * arriving at once — a visible hitch, most of it drawn around planets the
     * viewer is nowhere near. Scoped to a host it is at most 278 and usually
     * far fewer, and it matches what the request actually is: not "show me
     * every minor moon in the solar system" but "show me Saturn's".
     *
     * Kept under the same key, rather than promoted to its own piece of state,
     * so `bodyShown` still answers from one object and the section filters that
     * test `layers[k]` for truthiness keep working — a host id is truthy, null
     * is not.
     */
    minorMoons: null,
    /**
     * The thirteen comets, off by default.
     *
     * Off for the same reason the dwarf planets are: they are a population you
     * go looking for rather than the furniture of the scene. It matters more
     * here than there, because a comet's orbit is not like anything else in the
     * app — Hale-Bopp's ellipse is 360 AU end to end and the hyperbolic ones
     * run off past Neptune and never come back, so switching them on redraws
     * the *scale* of the view, not just its contents.
     *
     * A single switch rather than the per-host arrangement the minor moons
     * needed: thirteen bodies is not a crowd, and there is no host to scope
     * them to — they orbit the Sun.
     */
    comets: false,

    /**
     * The five asteroids drawn as worlds — Vesta, Pallas, Hygiea, Juno, Psyche.
     *
     * On, unlike the comets and the dwarfs, and the reason is that they are
     * already there. The belt is drawn whatever this says; these five are the
     * handful of rocks in it big enough to have a name, a size and a page, and
     * hiding them would leave the belt with no way in. Five bodies in the inner
     * system is not a crowd — it is fewer than the moons of Uranus.
     */
    asteroids: true,

    /**
     * The spacecraft. Off by default, like the comets and for one of the same
     * reasons and one new one.
     *
     * The shared reason: they are a population you go looking for. The new one
     * is that a spacecraft is *physically* different from everything else in
     * the app — Voyager is four metres across where the smallest moon here is a
     * kilometre — so at any view wider than a close-up they are markers and
     * trails rather than objects, and 65 more trails across the inner solar
     * system is a busy scene to hand someone who did not ask for it.
     *
     * One switch rather than the minor moons' per-host arrangement, and this is
     * a closer call than it was for the comets. 65 is a crowd, and they do have
     * hosts to scope to. But a spacecraft's host *changes over the mission* —
     * Voyager 1 belongs to Earth, then the Sun, then Jupiter, then Saturn — so
     * scoping by host would mean a craft appearing and vanishing from the panel
     * as the clock ran, which is worse than a long list.
     */
    spacecraft: false,
  },

  /**
   * The host whose moons the nav bar is drilled into, or null.
   *
   * Lifted out of `NavBar` because it is no longer only the nav bar's business:
   * with minor moons scoped to a host, the layer panel and the `N` shortcut both
   * need to know which host "minor moons" currently means.
   */
  navHost: null,
  setNavHost: (navHost) => set((s) => anchorMinorMoons(s, { navHost })),

  /**
   * Flip a layer.
   *
   * Turning off a *class* of body has one extra job: if the user is currently
   * parked at one of them, the camera would go on tracking a body that is no
   * longer drawn — following an invisible point through empty space, with the
   * info panel still open on it.
   *
   * Where it goes instead is **up, not out**. Hiding the minor moons while
   * parked at Phoebe leaves you at Saturn, not adrift in the solar system: the
   * planet is still drawn, it is where the camera already is, and it is the
   * honest answer to "where am I" once the moon is gone. Backing out to the
   * overview threw that away, and took the breadcrumb path with it — the whole
   * trail vanished at the moment the user was most likely to want it, since
   * switching a class off is often how you go back to looking at the planet.
   *
   * This is the same call the `systemId` branch below already made for the same
   * reason; it was only the selection that was still jumping to the overview.
   * Falling back to the overview remains right when there is no parent left to
   * fall back to — a dwarf planet, or a moon whose planet is itself hidden.
   */
  toggleLayer: (key, host = null) =>
    set((s) => {
      /*
       * `minorMoons` holds a host id, so "off" is null and "on" is a planet —
       * and switching straight from one host to another counts as switching the
       * first one off, which is what the guard below has to see.
       *
       * The host comes from the caller because only the caller knows which
       * planet the user meant: the nav bar's open host, or the parent of
       * whatever is selected. With neither, there is no such thing as "minor
       * moons on" any more and the toggle does nothing.
       */
      let value
      if (key === 'minorMoons') {
        const target = host ?? minorMoonHost(s)
        value = !target || s.layers.minorMoons === target ? null : target
      } else {
        value = !s.layers[key]
      }

      const next = { layers: { ...s.layers, [key]: value } }

      // Was this class showing, and is it about to stop showing *for the body
      // the camera is on*? For the booleans that is just "was it on".
      const wasShowing =
        key === 'minorMoons' ? s.layers.minorMoons && s.layers.minorMoons !== value : s.layers[key]

      if (wasShowing && CLASS_LAYERS.includes(key)) {
        const selectedGoverned =
          BODY_LAYERS[s.selectedId] === key &&
          (key !== 'minorMoons' || BODIES_BY_PARENT[s.selectedId] === s.layers.minorMoons)
        if (s.selectedId && selectedGoverned) {
          // Up to the parent if it is still drawn, out to the overview if not.
          const parentId = BODIES_BY_PARENT[s.selectedId]
          const parent = parentId ? BODIES_BY_ID[parentId] : null
          next.selectedId = parent && bodyShown(parent, next.layers) ? parentId : null
          next.systemId = null
          next.flightNonce = s.flightNonce + 1
          // The dossier is either going or changing body; either way the reader
          // should be back at the top of it rather than mid-way down the last
          // one's text.
          releaseView(next)
        } else if (s.systemId) {
          // Framing a satellite system whose satellites are about to stop being
          // drawn. The parent is still there and still worth being at, so this
          // does not back out to the overview — it closes in on the planet,
          // which is what the view becomes once the moons are gone.
          next.systemId = null
          next.flightNonce = s.flightNonce + 1
        }
      }
      return next
    }),

  /** Whether the layer panel is open. */
  panelOpen: false,
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  /**
   * Whether the events panel is open, and which kinds it is showing.
   *
   * The filter is remembered rather than reset on close, because it is a
   * statement about what you came for — someone who opened this to find
   * eclipses is looking for the next one too, and having to re-narrow a list of
   * four thousand every time would make the filter worse than useless.
   */
  eventsOpen: false,
  toggleEvents: () => set((s) => ({ eventsOpen: !s.eventsOpen })),

  /**
   * Whether the search palette is up.
   *
   * Not remembered the way the event filter is: a search is a question you have
   * already had answered by the time it closes, and re-opening onto the last
   * one would put a stale list between you and the scene.
   */
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  eventFilter: 'all',
  setEventFilter: (eventFilter) => set({ eventFilter }),

  /**
   * Whether the body switcher is expanded.
   *
   * Collapsed by default, the way the layer panel is. The bar used to be
   * permanently open along the bottom edge, which was fine at eight planets
   * and is a wall of thumbnails at thirty-eight — a persistent list of every
   * destination, in a view whose subject is the one place you already are.
   * Expanding it is a decision to go somewhere.
   */
  navOpen: false,
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
  closeNav: () => set((s) => (s.navOpen ? { navOpen: false } : s)),

  /*
   * Off by default. The bloom pass is a genuine extra — a halo around the sun —
   * but for a long time it was also, accidentally, the scene's tone-mapping
   * switch, and the scene was tuned with it on. Now that the two are separate
   * (`ToneMappingGuard` in `Scene.jsx`) the planets read better without it, so
   * the glow is what it says it is: an option.
   */
  bloom: false,
  toggleBloom: () => set((s) => ({ bloom: !s.bloom })),

  musicOn: false,
  toggleMusic: () => set((s) => ({ musicOn: !s.musicOn })),

  /* ---- loading ---- */
  progress: 0,
  loaded: false,
  setProgress: (progress) => set({ progress }),
  setLoaded: () => set({ loaded: true, progress: 1 }),
}))

/*
 * A dev-only window handle, for diagnosing what the camera is actually doing.
 *
 * Nothing in the app reads this. It exists because the symptoms that matter
 * here — "the camera won't zoom", "everything is piled on the Sun" — are all
 * about state that is deliberately kept *out* of React so it can be written
 * sixty times a second, which also puts it out of reach of the console. Without
 * a handle the only way to tell a selected-body follow from a disabled wheel is
 * to guess.
 *
 * `import.meta.env.DEV` is false in a production build, so this is stripped.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__solar = {
    state: () => useStore.getState(),
    viewScroll,
    simClock,
    /*
     * The same setter the date picker calls, rather than `simClock.jd = x`.
     *
     * Writing the field direct skips the clamp to `EPOCH_RANGE` and leaves
     * `displayJD` stale, so the scene would be at one date and the readout at
     * another — which is exactly the confusion a verifier scrubbing to a
     * historic mission would then have to debug.
     */
    setSimulationDate,
    positions: planetPositions,
    /** The one-line answer to "why won't it zoom / why is everything moving". */
    why: () => {
      const s = useStore.getState()
      const at = planetPositions.get(s.selectedId)
      return {
        selected: s.selectedId,
        selectedKind: s.selectedId ? (s.selectedId.startsWith('sc_') ? 'SPACECRAFT' : 'body') : null,
        selectedAt: at ? [at.x, at.y, at.z].map((v) => +v.toFixed(2)) : null,
        // Zoom is disabled outright once the page scrolls into the dossier.
        zoomEnabled: viewScroll.p <= 0,
        viewScrollP: viewScroll.p,
        // If this is advancing, planets move on their own — that is the clock,
        // not the camera.
        jd: simClock.jd,
        timeRate: s.timeRate,
        paused: s.paused,
        spacecraftLayer: s.layers.spacecraft,
        spacecraftWithPositions: [...planetPositions.keys()].filter((k) => k.startsWith('sc_')).length,
      }
    },
    /** Where the fleet is being lost: registered → shown → flying now. */
    fleet: () => {
      const s = useStore.getState()
      const craft = BODIES.filter((b) => b.kind === 'spacecraft')
      const shown = craft.filter((b) => bodyShown(b, s.layers))
      /*
       * Passing the layer filter is not the same as being on screen.
       *
       * A mission that has ended is still `shown` — it is a spacecraft and the
       * spacecraft layer is on — and is still drawn nowhere, because Eyes ends a
       * craft at its terminal segment and this app does the same. The two counts
       * were the same number while every craft on the roster was still flying,
       * which made `shown` look like the answer to "how many should I see".
       */
      const flying = shown.filter((b) => isFlying(b, simClock.jd))
      return {
        registered: craft.length,
        shown: shown.length,
        flying: flying.length,
        firstShown: shown.slice(0, 3).map((b) => b.id),
        withSegments: craft.filter((b) => b.segments && b.segments.length).length,
        positioned: [...planetPositions.keys()].filter((k) => k.startsWith('sc_')),
      }
    },
  }
}
