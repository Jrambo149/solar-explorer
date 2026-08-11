# Solar Explorer

An interactive 3D tour of the solar system, built with React, Vite and React Three Fiber.
Fly between the eight planets, orbit them up close, and read real astronomical data
about each one.

<!-- Run `npm run dev` and open http://localhost:5173 -->

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Then open **http://localhost:5173**.

`npm install` also downloads the planet textures (about 10 MB — see
[Textures](#textures) below). That is the only network access the project makes; once the
textures are on disk the app itself issues **no runtime requests** and works offline.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run textures` | Download any missing planet textures |
| `npm run textures:force` | Re-download every texture |
| `npm run textures:procedural` | Draw the offline procedural set instead |
| `npm run verify` | Run every verification suite |
| `npm run verify:orbits` | Check the eight planets against JPL Horizons |
| `npm run verify:bodies` | Check the dwarf planets and the satellite frames |
| `npm run verify:shaders` | Check that differently-patched materials get their own shader program |
| `npm run verify:framing` | Check the split view's size, position and camera angle, at every window shape |
| `npm run fetch:dwarfs` | Re-fit dwarf-planet elements from Horizons |
| `npm run fetch:moons` | Re-fetch satellite elements from Horizons |
| `npm run fetch:reference` | Re-bake the dwarf-planet verification fixture |
| `npm run model:sun` | Re-export the sun's prominence meshes from the .blend (needs Blender) |
| `npm run model:nasa` | Repack every NASA model into `public/models/` (add a body name for one) |
| `npm run maps:earth` | Resample Earth's cube-map atlas to equirectangular in `public/maps/` |

Requires Node 20.19+ or 22.12+ (Vite 8's minimum).

## Controls

| Action | Result |
| --- | --- |
| **Drag** | Orbit the view |
| **Right-drag** | Move the camera through the scene (screen-space pan) |
| **Scroll** | Zoom in and out, smoothly damped. Scroll **down to go in** — the same direction that takes you down the page |
| **Scroll toward a planet** | Once it's about 2.2 degrees across, the camera locks on and flies to it |
| **Click a planet** | Fly to it, and load its dossier a screen below |
| **"More about ___"** | Scroll down to the dossier — click it, the wheel belongs to the camera |
| **Body selector (bottom left)** | Expands to jump to any planet, dwarf planet or moon |
| **Back to Solar System** | Return to the overview |
| **Top-right buttons** | Layers panel · toggle sun glow · ambient sound |
| **Click a label or icon** | Fly to that body |
| **O / L / I / C / N** | Toggle orbits, labels, icons, coloured orbits, moon orbits |
| **D / M** | Show or hide the dwarf planets and the moons |
| **Drag the timeline** | Scrub anywhere between 1800 and 2050; the planets move to where they were |
| **Arrow keys on the timeline** | Nudge by a day; Page Up/Down by a year; hold Shift for 30x |
| **Date field** | Type or pick an exact moment |
| **Space** | Play / pause — the clock **starts paused**, on the present moment |
| **Transport** | Pause, reverse, and a rate from 1 sec/s to 100 yr/s |
| **"Now"** | Jump the clock back to the present |

The rate control sets `timeRate`, in simulated days per real second, and one simulation
clock drives everything from it. Both a body's position and its spin are pure functions of
the Julian Date rather than accumulated angles, so scrubbing, pausing, reversing or dropping
frames can never desynchronise a planet's spin from its orbit.

Manual input always wins: grabbing the mouse or scrolling mid-flight cancels the
automatic camera move rather than fighting you for control.

Clicks and drags are told apart by how far the pointer travelled
(`scene/dragGuard.js`). React Three Fiber synthesises `onClick` from a pointerup
regardless of intervening movement, so without that guard every orbit gesture
that ended over empty space registered as a click on the background and snapped
the camera back to the overview.

On tablets, pinch to zoom and drag with one finger to orbit.

## Project structure

```
scripts/
  generate-textures.mjs   Procedural texture generator (zero dependencies)
  fetch-textures.mjs      Downloads the photographic maps, draws the rest
  fetch-dwarf-elements.mjs   Fits dwarf-planet elements from Horizons
  fetch-moon-elements.mjs    Fetches satellite elements from Horizons
  verify-orbits.mjs       56 checks on the eight planets
  verify-bodies.mjs       61 checks on the dwarfs, the moons and the frames
  export-sun-model.py     Blender: converts Models/*.blend to glTF geometry
  nasa-models.mjs         Which NASA model each body wears, and what to do with it
  prepare-nasa-model.mjs  Repacks them: unit radius, JPEG maps, baked transforms
  smooth-normals.mjs      Rebuilds smooth normals for a mesh that shipped faceted
  equirect.mjs            PNG codec + cube-map-cross -> equirectangular resampler
  prepare-earth-maps.mjs  Builds Earth's equirectangular maps from NASA's model
  verify-shaders.mjs      5 checks that shader patches get their own program
  verify-framing.mjs      12 checks on the split view's size, position and camera angle
public/
  verify-shadows.html     11 GPU checks on the shadow shader (dev server only)
  maps/                   Earth's maps, resampled from NASA's model. Committed
src/
  data/bodies.js          The registry: planets + dwarf planets + moons, one shape
  data/planetData.js      Physical facts and the info-panel copy, the eight planets
  data/dwarfPlanetData.js The same for the five dwarf planets
  data/moonData.js        The same for the twenty-five moons
  data/orbitalElements.js JPL Keplerian elements for the planets, 1800-2050
  data/dwarfElements.js   GENERATED - dwarf elements fitted from Horizons
  data/moonElements.js    GENERATED - satellite elements from Horizons
  orbit/kepler.js         Orbit solver. No React, no three - testable in Node
  orbit/frames.js         The scale warp and every distance derived from it
  store/useStore.js       Zustand store, plus the non-reactive clock and position registry
  textures.js             Texture preloading and cache
  models.js               Mesh preloading and cache, alongside textures.js
  scene/
    Scene.jsx             Canvas, lighting, starfield, post-processing, ViewFraming
    SimulationClock.jsx   Advances the Julian Date once per frame
    LabelProjector.jsx    Projects bodies to screen space, positions the markers
    labelRegistry.js      The id -> DOM node bridge the two share
    Sun.jsx               Sun assembly: shells, loops, corona sprite, point light
    SunShells.jsx         Photosphere and flame shell from the Blender model
    Prominences.jsx       Plasma loops from the Blender model, relit in three.js
    Body.jsx              Any body with a surface: position, spin, textures, hit target
    nightLights.js        Earth's city lights, as a material patch
    shadows.js            Analytic eclipse and ring shadows, as a material patch
    satelliteFrame.js     Places a moon in its parent's frame. React-free and testable
    OrbitRing.jsx         Faint hairline orbit paths
    Rings.jsx             Ring mesh with radius-mapped UVs (Saturn + Uranus)
    AsteroidBelt.jsx      Instanced belt between Mars and Jupiter
    CameraController.jsx  Orbit controls, focus flights, scroll-to-focus
    followMath.js         The per-frame camera maths, React-free and testable
    splitFraming.js       How big, how far across and from what angle a body is framed
    dragGuard.js          Tells a click apart from the end of a drag
  ui/
    InfoPanel.jsx         The dossier: the split screen, then the facts
    NavBar.jsx            Collapsible body selector, grouped by class
    ScrollHint.jsx        The way down to the dossier
    glideTo.js            The shared 1200ms page tween, React-free
    Controls.jsx          Toggles and the reset button
    LayerPanel.jsx        Layer switches and the scale control
    LabelLayer.jsx        The DOM markers themselves
    Timeline.jsx          Scrubbable 1800-2050 timeline, transport and date picker
    LoadingScreen.jsx     Progress bar
    Header.jsx            Title and hint
  hooks/
    useAmbientAudio.js    Synthesized ambient drone + selection blip
    useMediaQuery.js      Breakpoint-aware animation switching
    useScrollChrome.js    Fades the scene's controls out as the dossier rises
```

## Textures

No image files are committed to this repository. `scripts/fetch-textures.mjs` downloads
them into `public/textures/` on `postinstall`: 2K maps for every body, plus an 8K day map
for Earth (the planet you get closest to) and its night-lights and cloud layers. About
10 MB in total.

Venus uses the **Magellan radar surface** rather than the cloud deck. Venus really is
wrapped in featureless yellow-white cloud, so the deck is the honest choice for "what you
would see" — but every recognisable picture of Venus, including the reference this was
matched against, is the golden mapped surface, so that is what it wears.

### Colour grading

The Solar System Scope maps are accurate but noticeably flatter than photographs of the
same bodies. Rather than ship hand-edited copies of a CC BY texture set, `src/textures.js`
grades four of them once at load, on a canvas, before they reach the GPU. The numbers are
measured, not eyeballed: each planet's reference photo was sampled for its lit albedo and
mean chroma, and compared against the same statistics for the current map.

| Planet | Correction |
| --- | --- |
| Mercury | luminance→hue ramp (see below) |
| Venus | chroma ×1.3 |
| Uranus | red ×0.97, chroma ×1.3 — pale cyan toward the reference turquoise |
| Neptune | green ×1.3, blue ×1.09 — violet-navy toward azure |

**Mercury is the interesting one.** Its map is effectively greyscale: measured mean chroma
0.44, against 6.41 for the reference. There is no colour there to amplify, and multiplying
it would only bring up JPEG noise. What actually gives the MESSENGER enhanced-colour view
its look is a relationship between *brightness and hue* — dark low-lying terrain runs cool
and violet, bright rayed material runs warm and creamy. So the grade rebuilds colour from
luminance through a ramp sampled straight out of the reference photo in eight brightness
bins, then rescales each result to the pixel's original luminance. Every crater and ray
survives untouched; only the hue is new. It runs at 72% strength, because the reference is
a deliberately colour-enhanced product and at full strength it reads as a novelty.

Grading also produces a small thumbnail data URL per planet, which is what the nav chips
and the info-panel disc use — otherwise those CSS backgrounds would still point at the
ungraded file and visibly disagree with the planet on screen.

### Rings

Saturn's ring strip is downloaded. Uranus's is **generated** (`scene/Rings.jsx`) — Solar
System Scope has no Uranus ring texture. Its thirteen narrow threads are placed at their
real radii in planetary radii, which is what produces the uneven, clustered spacing: three
tight rings low down, widening out to the bright epsilon ring on the outside. The widths
are *not* real. Even epsilon is under 100 km against a 25,559 km planet — roughly 0.004 of
a radius, far below a pixel at any zoom this app reaches — so each is widened enough to
survive rasterisation while keeping the relative order and brightness. Because Uranus is
tipped 97.8°, the rings hang almost vertically.

**Attribution — required.** The maps come from
[Solar System Scope](https://www.solarsystemscope.com/textures/) and are licensed
**CC BY 4.0**. They are built from NASA elevation and imagery data. The credit is shown
in the bottom-left of the app and must stay there (or somewhere equally visible) if you
redistribute this.

### Offline fallback

If a download fails — no network, host unreachable — the install does **not** break. Any
texture that could not be fetched is drawn procedurally instead by
`scripts/generate-textures.mjs`, and the app loads normally with stylised planets. Run
`npm run textures` once you are online to pick up the real maps.

That generator is worth a look in its own right: it has **no dependencies at all**. It
encodes PNGs by hand (IHDR/IDAT/IEND chunks plus `node:zlib`) and builds each planet from
seeded 3D value noise sampled directly on the sphere, so there is no seam at the
wrap-around and no smearing at the poles. Crater fields for Mercury and Mars, a
land/ocean threshold with polar ice for Earth, latitude-banded flow with a Great Red Spot
for Jupiter. Everything is seeded, so it is identical on every machine.

Beyond that, any texture that still fails to load at runtime falls back to a flat shaded
sphere in the planet's own colour, so the scene can never end up with a hole in it.

## How the planets are rendered

The photoreal look comes from four things layered on top of the textures:

- **Atmospheric limb glow** (`scene/Atmosphere.jsx`) — **no longer drawn.** The shader and
  each planet's `glow` field are still here, unread by `Body.jsx`, because the effect is
  worth keeping buildable; what follows describes it as written. It came out as a coloured
  tint standing off the limb — most obviously a light blue ring around Earth — and reading
  as a hue hanging around the body rather than as air, so it was cut. Everything below the
  bullet is retained for whoever puts it back or offers it as a layer.

  The glow is a *volume* of air seen
  edge-on, so the shader models how much air each view ray passes through: it measures the
  ray's closest approach to the planet's centre and fades the result exponentially with
  altitude above the surface, the way atmospheric density really falls off. Across the disc
  it instead ramps toward the limb, which is the haze that banks up over the horizon and
  which stops the glow from switching on abruptly at the silhouette. All of it is
  multiplied by how sunlit that piece of limb is, so the halo blazes along the lit edge and
  dies out around the night side rather than ringing the planet evenly. Colour and strength
  are per planet, and the scale height is a fraction of the radius: thickest on Venus's
  deep cloud deck, barely there on Mars — and **none at all for Mercury**, which has no
  atmosphere to scatter.

  The glow also fades as the camera closes in — full strength beyond 12 planet radii, down
  to 16% at `FOCUS_RADII` — the near threshold is imported from `planetData.js` rather than
  written out separately, so the glow bottoms out at exactly the distance a close-up parks
  at and re-framing the shot can't quietly slide the camera back up the fade curve. The far
  threshold sits well outside anything a close-up reaches, so the curve is still shallow on
  arrival and the halo eases away across the whole approach rather than dropping off at the
  end of it. Being a fixed fraction of the radius keeps it
  correctly *proportioned* at every zoom, but proportion is not impact: the band that reads
  as a few pixels from the overview is several hundred pixels with the planet filling the
  frame, bright enough to push the lit limb over the bloom threshold and wash out the
  surface underneath. Dimming it pulls it tighter too, since the visible edge is wherever
  the exponential crosses the eye's threshold.

  The carrier mesh is 1.45x the planet's radius, far larger than the visible glow, so the
  falloff always reaches zero well inside it. That matters: the first version was a Fresnel
  term on a shell only 1.035x the radius, which confined every lit pixel to a hairline
  annulus whose outer boundary was the mesh's own silhouette ending against space. The glow
  stopped dead instead of fading. Sub-pixel at overview distance, but with the planet
  filling the frame it became a band of near-constant colour with a hard edge on each side
  — a drawn hoop around the planet rather than a haze. **Never let the geometry's edge be
  the thing that ends an atmospheric effect.**
- **Night-side city lights** — Earth's night map is blended into the stock
  `MeshStandardMaterial` via `onBeforeCompile`, masked by the dot product of the world
  normal and the Sun direction so it fades in through the terminator.
- **A visible terminator** — ambient light is low (0.075) against a strong point light at
  the Sun, so the shadow side stays clearly in shadow without going pure black.
- **Close-up framing** — flying to a planet parks the camera 44° off the sunlight rather
  than face-on. The visible lit fraction of a sphere is `(1 + cos θ) / 2`, so that leaves
  the disc about 86% lit: the whole face reads as photographic, with the terminator kept
  as a thin shaded crescent along one limb for depth. A front-lit planet reads completely
  flat; much past 60° and it starts to look like half a planet.

  It parks at `FOCUS_RADII` (3.4) planet radii, which puts the disc about 34° across — full
  in the frame but with a margin of space around it. A sphere at distance `d` subtends
  `2·asin(r/d)`, so the earlier 2.7 gave ~44° and arrived too tight to take the planet in
  at a glance.

Orbit rings fade out entirely while you are focused on a planet — up close the path passes
metres from the camera and would cut a bright line across the frame.

## Tracking a moving planet

`scene/followMath.js` holds the per-frame camera maths, deliberately free of React and of
Three's scene graph so it can be reasoned about — and simulated headlessly — on its own.

The subtlety it exists for: an exponential ease toward a *moving* target settles at a
permanent standing lag of `speed / lambda` and never arrives. Mercury covers 11.3 world
units a second, so at `lambda = 3.4` the camera sat 3.2 units behind it forever — 64x the
arrival tolerance. The flight never completed, follow mode never engaged, and the planet
slid steadily out of frame.

Both the flight and the parked follow therefore start by translating the camera and the
orbit target by however far the planet moved since the last frame. That cancels the
orbital velocity exactly, and everything downstream gets to treat the planet as if it were
standing still. A parked shot then eases away any residual offset between the target and
the planet, which recovers from a pan or from a flight the user cancelled mid-air.

Simulated over 30 seconds at 60 fps, all eight planets arrive in about 2.5 s and then hold
the planet within 0.005° of frame centre.

### Taking hold of a body, and letting go of it

Zooming in acquires whatever you are pointing at once it looks bigger than
`SNAP_ACQUIRE_DEG` (2.2°) and falls within an 11° cone of the cursor's ray — an
angular size rather than a distance in world units, because it has to mean the
same thing at both scales and it is what the user is actually judging.

Letting go is a different question, and it took two goes to say so. It was an
angle too, releasing at 1.4°, which sounds small and is: it works out at **24x the
parked distance** for every body, so a planet's title and the rest of its chrome
stayed up until the camera was most of the way back to the system view. The
question being asked on the way out is not "how big is it" but "have we left", so
`SNAP_RELEASE_FACTOR` asks that directly — release once the camera is more than
**7x** the distance the shot parks at. That lets go about three and a half times
sooner, and it follows a body that parks further out for its rings without needing
a second number.

`RELEASE` still has to sit *inside* `ACQUIRE` or the two chatter — the original
pair was inverted (acquire within 38 units, release beyond 30) and only a 700ms
cooldown was hiding it. Checked rather than assumed: acquire fires at least 2.19x
further out than release for every body at both scale ends, so the dead band is
wide, and release is always inside `maxDistance`, so it can always be reached.

## Where the planets are

Positions are real. Each planet carries the six Keplerian elements plus their per-century
rates from JPL's [Keplerian Elements for Approximate Positions of the Major
Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html), and `src/orbit/kepler.js`
solves Kepler's equation at the simulated instant to place it. Eccentricity, inclination
and the longitude of perihelion all apply, so Mercury's orbit is visibly off-centre and
the planets do not share a plane.

Nothing accumulates. A planet's position and its rotation are both pure functions of the
Julian Date, so pausing, scrubbing, changing rate or dropping frames cannot cause drift —
which the previous `angle += speed * dt` model could not promise.

`npm run verify:orbits` checks this against 48 reference vectors fetched from JPL Horizons
across 1800–2050. Errors run from 8" for Mercury to about 10' for Saturn, which is the
documented accuracy of a linear-rate fit; a sign error or a transposed element would show
up as degrees. It also checks orbital periods, Earth's perihelion distance and date, the
Kepler residual out to e = 0.967, and that every orbit runs prograde.

**This is a visualisation, not an ephemeris.** The element table is a straight-line fit
valid over 1800–2050, and the time control stops at those edges rather than extrapolating.
Don't point a telescope with it.

## Scale

The physics is in AU; the *drawing* is compressed, because at true scale Earth is 4.3e-5 AU
across at 1 AU out — a ten-thousandth of a pixel at any zoom that fits the orbit. A single
`scaleMode` in the store runs from 0 (the diorama this app has always shown) to 1 (true
scale), and `src/orbit/frames.js` owns everything that follows from it.

Two properties make the warp safe:

- **It is radial.** Only the length of a position vector changes, never its direction. So
  orbits stay closed curves, inclinations stay correct, and a planet's angular position
  around the Sun is always the real one. The picture is never lying about *where* a body
  is, only about how far.
- **Frames nest.** A moon's position is warped inside its planet's frame, not the Sun's.
  Warping a 0.0026 AU lunar orbit with a curve tuned for Neptune would collapse it to
  nothing.

At `scaleMode = 0` the curves are exactly the originals — radius `0.63 · (r/r_earth)^0.42`,
orbital radius `9 + 24 · AU^0.55` — so the default view is unchanged. Every camera distance
(near and far planes, zoom limits, the overview position, the scroll-to-focus thresholds)
is derived from the current scale rather than hardcoded, and the camera rescales itself
when the setting moves so the shot holds.

The depth buffer is logarithmic. The scene spans six orders of magnitude at diorama scale
and nine at true scale; a standard buffer concentrates its precision so heavily near the
camera that the far half of that range collapses into z-fighting.

Spin rates come from real sidereal day lengths and keep the retrograde sign for Venus and
Uranus. Axial tilts are real, so Uranus really does roll on its side.

## Time

One clock drives everything: a Julian Date advanced once per frame by `SimulationClock`,
living outside React because it changes 60 times a second and React renders none of it.

The timeline spans the element table's full 1800–2050 validity window. Because every body's
position is a pure function of that date, dragging the playhead is not a playback control —
it re-solves the entire solar system at whatever instant you land on. Scrub left and the
planets are where they were; scrub right and they are where they will be.

There are two controls for the same thing, deliberately. 250 years across roughly a
thousand pixels works out to three months per pixel, which is right for "somewhere in the
1970s" and useless for "the morning of the Apollo 11 launch". The track handles the first,
the date field handles the second, and arrow keys cover the gap between them.

There is no rate at which both rotation and orbits look good, and that is physics rather
than a tuning failure — Earth spins 365 times per orbit. The default of **1 day/second**
resolves it toward rotation: Earth turns about once a second and Mercury still laps in 88
seconds. Watching the outer planets go round is what the rate control is for; Neptune
genuinely takes 165 years.

## Coloured orbits

Off by default, and that's deliberate: the plain white hairline is what this
scene was tuned to. An earlier tinted version read as blurry and blue, which is
what drove the rewrite to a plain line in the first place. Colour comes back as
something you switch on.

Each orbit is tinted with its planet's colour normalised in HSL — every hue
pinned to one saturation cap (0.72) and one lightness (0.68) — rather than blended
toward white. The planet colours span a wide range of intensity: Earth's
`#2b6cb0` is a dark heavy blue while Venus's `#e3b25c` is a bright gold, so a
uniform white blend would leave Venus shouting and Earth barely visible.
Normalising gives a soft family where no orbit is louder than its neighbours.

It does *not* try to make the eight tell each other apart, because it can't:
Venus, Saturn and Jupiter sit at hues 38°, 40° and 30°, so they are genuinely
the same warm gold. Pushing saturation until they separated would only make all
eight bold.

Coloured lines carry far more alpha than white ones (1.0 against 0.16), which
sounds backwards for something meant to be softer. A tinted line has well under
white's luminance at equal alpha, so the orbits would visibly recede the moment
colour was switched on; and a one-pixel line is a small budget for conveying hue
— at 0.16 the channels sit within about 20 levels of each other and it reads as
grey.

The coloured resting alpha has walked 0.28 → 0.5 → 1.0, the last step being "make
the hover brightness the default". Saturation and lightness went up with it (0.6
→ 0.72 and 0.6 → 0.68) — raising them together is what actually shows, since
lightness alone washes the hue back out and alpha alone leaves a dim tint. Only
the coloured path ever moved; the white hairline is the scene's default look and
is untouched at 0.16.

**Hover, once the alpha is spent.** At full opacity there is no headroom left to
brighten a coloured line with, so pointing at a planet would have done nothing to
its orbit. The lift moved into the colour instead: the line washes toward white
by 50%, which reads as brighter without needing an alpha it no longer has. Going
above 1.0 per channel is safe here because the material is `toneMapped: false`,
so the value clamps at display rather than being rolled off — and clamping a tint
toward white is exactly the effect wanted. It also stays under the bloom
threshold, so a hovered orbit brightens without acquiring a halo. White lines
skip the lift entirely; 0.16 → 0.7 is already a clearer signal.

## Moon orbits

A moon's ellipse has its own switch (**N**, nested under Orbits) and its own
rule about close-ups, because it behaves nothing like a heliocentric one.

The blanket rule used to be "something is selected, so fade every orbit out",
and for the Sun-centred rings that is still right: up close they pass within
metres of the camera and would cut a bright line across the shot. Applied to a
moon it threw away the one view where its orbit means anything — parked at
Jupiter, watching the Galileans go round is the entire reason to draw those
ellipses.

So a moon's ring stays lit while the camera is anywhere in its own system: on
the parent, or on one of its siblings. It hides in two cases only — the
selection is somewhere else entirely, or the selection is that very moon, where
the ring runs straight through the camera.

## The dossier, and why the page scrolls

Body details used to be a panel pinned to the right edge, and the trouble with
that was arithmetic. A 400px column took a third of the window away from the
thing the app is for, and everything else on screen had to be told about it —
the timeline, the nav bar, the planet title and the control cluster each carried
a `.app:has(.info-panel)` rule insetting them by `--panel-width`. So did the
camera: `CameraController` called `setViewOffset` to shift the *projection* 200px
left whenever a body was selected, so the planet was not centred behind the
panel. Adding a section meant taking width from the solar system.

So it moved below the fold. `.app` is a scrolling document now: `.stage` is one
viewport tall and **sticky**, and the dossier follows it in normal flow. Sticky
rather than fixed, and the difference is load-bearing — a fixed stage would be
out of flow, the dossier would start at the top of the document, and there would
be no first screen to scroll past. This way the stage occupies its own 100vh
*and* pins to the viewport while the dossier rides up over it, so the planet you
flew to is still there behind the reading.

The dossier only mounts when something is selected, which is also what keeps the
page exactly one screen tall the rest of the time.

**Every one of those insets had to go with it, and one nearly didn't.** The
`setViewOffset` above survived the move and quietly became the bug it had been
the fix for: a planet thrown 200px off-centre in a viewport with nothing in the
way. `--panel-width` is deleted rather than left unread, so nothing can start
insetting itself against a panel that no longer exists.

### Two screens, and the shot moves between them

The dossier is not one long page. Screen one is **the split**: no surface at
all, the scene showing through, the shot slid right, and the body's name and
description sitting in the space that opened on the left — the planet is *in*
the layout rather than behind a panel. Screen two is **the rest**: facts, moons
and links on a proper surface at full width, where a table can be a table.

Moving the shot aside is the interesting half, and the naive implementation is
the wrong one. Moving the camera does not work: OrbitControls owns it and orbits
it around `controls.target`, so a displacement gets pulled straight back — and
if it did stick, the user's orbit would then pivot around a point that is no
longer what they are looking at. `ViewFraming` uses **`setViewOffset`** instead,
which renders a *window* inside a larger virtual frame. The camera does not move
at all; the projection is asked for a different rectangle of the same view.
Negative x takes a window left of centre, which pushes the contents right.

The same call that used to be the panel-dodging bug, in other words — now doing
the job it is actually good at, driven by scroll instead of a constant. It runs
`0 → 0.22 × viewport width` across one screen of scroll, smoothstepped, which
carries the body from 50% to **72%** across. Verified headlessly against real
three.js rather than by eye: monotonic, lands on 72.0%, and the disc never
leaves the frame. Below 900px the offset is skipped entirely — there is nowhere
for a column of text to go beside the planet on a phone, so the dossier stacks
and the shot keeps the middle. `SPLIT_MIN_WIDTH` and the CSS breakpoint have to
agree.

One honest consequence: this slides the whole scene, not the selected body. At
overview distances every orbit and label would go with it — but the dossier only
exists when something is selected and the camera is parked at it, where the body
is essentially all that is on screen.

### And the size stops being an accident

Sliding the shot aside is only half of it. How big the body *looked* over there
was whatever distance the user happened to leave the camera at: fly in close and
it overflowed the frame, hang back and it was a dot beside a page of text. The
size of the subject in a designed layout should not be a side effect of the last
gesture before scrolling.

The same went for the **angle**. Whatever the last drag left — edge-on, looking
up from underneath, staring into the night side — was the portrait you got. So
both are eased across the same 0..1 the shot slides on: the distance toward the
framing below, and the direction toward `framingDirection`, which is front-lit
and tilted to show some of the pole. It is the same shot the arrival flight aims
for, so the two agree by construction rather than by coincidence.

It reverses exactly: `restDistance` and `restDir` are refreshed every frame the
page sits at the top, so scrolling back up returns to the camera the user chose
rather than a canned one, and because the whole thing is a lerp on scroll
position rather than an animation, it is reversible mid-gesture. The orientation
is **slerped**, not lerped — interpolating two directions component-wise sends
the camera through the inside of the sphere when they are far apart. Rotate, pan
and zoom are all disabled while the page is scrolled, since this code owns the
camera outright there and a drag would be overwritten on the next frame; better
that the scene not respond than that it spring back.

**The elevation had to become explicit, and that was a bug.** The lift used to
be `perp += 0.38 × up`, renormalised — which raises an equatorial viewpoint by
exactly the intended amount and does almost nothing to one already looking up
from underneath. Approach a planet from below and the "3/4 view showing the
pole" was a 3/4 view showing the *south* pole, still tilted away. The direction
is now built in an explicit frame — north and east within the plane
perpendicular to the sunlight — so the elevation is set rather than nudged. The
constant became `atan(0.38)` precisely so the common case is unchanged: for an
approach in the plane of the sunlight it produces the identical vector, to
twelve decimal places. All the user's approach still decides is *which side* of
the body the shot lands on, which is enough to stop the camera whipping round to
a canned azimuth.

`npm run verify:framing` checks the direction from 60 viewpoints spread over the
sphere × every body × four orbital positions: always a unit vector, always
exactly 44° off the sunlight, always on the lit side, and always lifted above
the sun-line plane. The lit-side one is the check that matters — get a sign
wrong and the portrait is a silhouette, technically framed and entirely black.

`splitFraming.js` decides the distance, and it is a plain module with no React
and no scene-graph imports — the `followMath.js` arrangement, for the same
reason: these numbers decide whether a planet is cropped, and that is worth
checking headlessly at every window shape rather than by dragging a browser
about. Ring radii are passed in, since `RING_PRESETS` lives in a `.jsx` file
Node cannot load (`satelliteFrame.js` already does this).

Three constraints, binding one wins:

1. the globe fills **56%** of the viewport height — not a fresh guess, but the
   fraction a ringless body already covered when parked at `FOCUS_RADII`, so
   anyone who never touched the zoom sees the framing they always saw;
2. rings stay inside **76%** of it. Two numbers rather than one because framing
   Saturn's rings as though they were the globe pushes the camera to eight radii
   and leaves the planet a *quarter* the height Earth gets — technically
   fitting, visibly a smaller subject. At 76% it is back to a third, which is as
   close as the two reconcile: you cannot have all of Saturn's rings and a globe
   the size of Earth's;
3. the widest point fits the room left to the **right** of the body.

The third is the one that is easy to forget and the only one that fails loudly.
`SIDE_SHIFT` moves the body to 72% across, so it has 28% of the width to its
right rather than 50% — and that room shrinks with the aspect ratio, which the
height-based numbers know nothing about. Left out, every 16:9 window looked
perfect while Saturn's rings ran **22% past the right edge** of a 901×1180 one.
`npm run verify:framing` sweeps nine window shapes × every body × both ends of
the scale slider; the worst right edge now lands at 97.6%.

### The background stops and the subject starts

The split view is a *portrait* of one body, and a portrait with the rest of the
solar system wheeling about behind it reads as a mistake — most of all at the
high time rates, where the background visibly swirls while you try to read.

So `SimulationClock` scales the time rate by `1 - p`: time eases to a stop over
the same scroll the shot moves on, and comes back the same way. Scaling rather
than latching a pause is what keeps it from lurching, and because the clock is
only ever *advanced* — never assigned a target — nothing has to be restored on
the way up. The date on the timeline is simply where you left it.

That alone would leave the subject dead still, showing one face and never the
rest of a model that has a whole surface worth looking at. So the selected body
gets a **turntable**: 48 seconds per turn, decoupled from the simulation
entirely — the same sedate rate for Jupiter's ten hours as for Venus's 243 days,
because this is a product shot rather than a fact about the body. It no longer
matters whether the timeline was playing, or how fast.

Two details that are not arbitrary:

- **The turntable accumulates; it is not folded into the date.** `spinAt`
  returns an absolute angle, so scaling *that* by the scroll would run the body
  backwards on the way down. Adding a rate the scroll scales means the angle
  only ever advances, and scrolling up and down eases the spin instead of
  rewinding it.
- **It unwinds when you leave the body — and only then.** The offset is a
  presentation device but still a lie about where the body is pointing, and left
  in place this planet's rotation would disagree with the date, permanently,
  because you once looked at it. Zeroing it outright would snap the surface
  round, so it eases out.

  The condition is `isSelected`, not "is the turntable running", and the
  difference is the whole point. Gated on the latter — which is how it was
  written first — scrolling back up to the scene started a two-second unwind
  with the camera still parked a few radii away, and you watched the planet
  drift backwards to a stop. Scrolling up should simply stop it: the rate
  already scales with `p`, so the turntable eases to a halt on the way up and
  holds there, picking up again if you scroll down a second time. The unwind
  belongs to the flight home, where the body is a handful of pixels.

`clearSelection` resets `viewScroll.p` directly, which is belt and braces rather
than ceremony: `p` is only recomputed on scroll and resize, and deselecting
destroys the dossier. If the browser's own scroll clamp ever failed to raise an
event, `p` would be left high with nothing below the fold — and since the time
rate is scaled by `1 - p`, the clock would stop and never start again.

### The reveal

Content in the dossier blurs into focus as it arrives and back out as it leaves.
The defocus is doing real work rather than decorating: the split view has no
panel behind it, so the text sits directly on the scene, and something arriving
*out of focus* reads as depth — copy resolving in front of the planet rather
than a label switched on over it.

An IntersectionObserver rather than a scroll-linked animation, because CSS
`animation-timeline: view()` is Chromium-only and a class toggle reverses just
as correctly when you scroll back up.

**Note which way round the CSS is.** The bare `.reveal` is *visible*; the hidden
state hangs off `.is-armed`, which JavaScript adds only once the observer has
actually reported. Styled hidden by default, any failure to observe would leave
the page blank — and that is not hypothetical, since IntersectionObserver
delivers during the rendering steps and a document that is never rendered never
gets a callback. A missing flourish is a much smaller problem than missing
content.

### One wheel direction, one meaning

three's `OrbitControls` zooms **in** on `deltaY < 0`, which is the convention
everywhere in 3D. The trouble is that `deltaY < 0` is also the direction that
scrolls a page **up**. So the same physical gesture meant "go deeper" to the
camera and "back out" to the document, and the seam showed exactly where the two
meet: scroll up out of the dossier, keep going to pull away from the planet, and
you had to reverse the wheel mid-gesture.

There is no arrangement in which both keep their own convention — this is a
scrolling document with a 3D scene in it, and one axis cannot mean two things.
So the scene defers to the document: **the direction that scrolls the page down
also moves the camera in.** The whole app now reads as one depth axis, and a
single unbroken scroll takes you from the solar system, into a planet, and on
into its dossier — or all the way back out.

The cost, stated plainly: zoom is now inverted relative to most 3D apps. That is
the price of the app agreeing with itself, and it is one line to put back.

It is done by **flipping the event**, not by reimplementing dolly, so
OrbitControls keeps its own damping and momentum. A capture-phase listener takes
the wheel before the bubble-phase listeners — OrbitControls' own, and the
snap-focus one — stops it, and dispatches an identical event with `deltaY`
negated. Everything downstream then reads a consistent sign, the snap-focus test
included, which is why that needed no separate flip. Three things it must not
do, each of which would be its own bug:

- **flip the clone again** — it carries a marker, or it would ping-pong forever;
- **flip a trackpad pinch**, which arrives as a wheel with ctrl held. Pinch
  already agrees with itself: out is out;
- **call `preventDefault` once the page owns the wheel.** Past the hero
  OrbitControls has already stood down, and preventing the default there would
  block the very page scroll being handed over.

**The listener sits on the stage, not the canvas**, and that is the same idea
seen from the other side. The canvas is only the part of the first screen with
nothing drawn over it — the bottom ~140px is the timeline, and there are controls
in every corner. A wheel over any of them missed the flip entirely, so the page
crept down a few pixels, which was enough to put `viewScroll.p` above zero, stand
the camera's zoom down and hand the wheel to the document. A small unasked-for
scroll and a wheel that had stopped zooming, from nothing more than where the
cursor happened to be resting. The whole hero screen is the scene, so the whole
hero screen zooms: the flip listens on `.stage`, and dispatches the clone on the
canvas wherever the original landed. It keeps the cursor's coordinates, because
the cursor really is over that point of the scene — the timeline is simply in
front of it — and snap-focus fires its ray through exactly that point.

A control that genuinely scrolls keeps its own wheel. `scrollsItself` walks from
the event's target up to the stage looking for an element that is scrollable in
the wheel's axis *and* has somewhere left to go in the wheel's direction — the
body switcher scrolls sideways on a narrow window, and taking that away to zoom
instead would be this same bug with the axes swapped. The direction half matters
too: a control that has hit its end passes the gesture on rather than swallowing
it at the stop.

**The handover has to land exactly.** `viewScroll.p` is not only the number the
shot is interpolated by — every "whose gesture is this" test reads `p > 0` — so a
fractional `scrollY` left behind by a trackpad would leave `p` at something like
1e-6: the page owning a wheel it has nowhere to spend, with the camera's zoom
switched off waiting for a zero that never quite arrives. So `useScrollChrome`
treats anything within a pixel of the top as the top, and the flip snaps the page
to 0 when it takes a wheel, rather than leaving the dossier a hair up the screen.

**The wheel cannot do both jobs.** `OrbitControls` binds the wheel on the canvas
and calls `preventDefault()` — that is what zoom *is* — so a wheel anywhere over
the scene moves the camera and never the page. There is no arrangement in which
one wheel event does both, so the first move down is a click on the "More
about ___" control. Two things then keep the page scrollable while the split
view deliberately leaves the scene showing: `.dossier` is a full-width block, so
past the hero every pixel of the window belongs to it rather than to the canvas;
and `CameraController` sets `controls.enableZoom = false` for as long as the
page is scrolled at all. Belt and braces, because the failure mode — a wheel
that silently does nothing — is one people report as "scrolling is broken".

Both cues share one tween, rather than using `scroll-behavior: smooth`.
The native one is genuinely animated, it just runs to a fixed ~300ms whatever
the distance, so a full viewport of travel arrives as a snap. The whole point of
the control is that clicking it should feel like the scroll it stands in for, so
it eases in and out over **1200ms** instead. A wheel covers a screen in about a
second, which is where the first attempt at 900ms came from — but matching a
wheel is not quite the goal: this is a guided move between two views, and the
unhurried version reads as the scene handing over rather than as the page being
yanked. Every step passes `behavior: 'instant'`, so that a `scroll-behavior`
someone sets later cannot smooth each hop of an already-smooth tween and
compound the two easings. A wheel, touch or key cancels it mid-flight: past the
first screen the gesture is the user's again and a tween still running would be
fighting them. `prefers-reduced-motion` is checked in JS here, since this never
goes through `scroll-behavior` at all. It lives in `ui/glideTo.js` and is used
by both the "More about ___" button on the scene and the "Key facts" cue in the
split, so moving down a screen is one gesture rather than two — which is also
why that cue is a button and not an `href="#..."` anchor.

**The chrome hands over rather than sitting on top.** `useScrollChrome` fades
`.ui-layer` out across the first 45% of a viewport of scroll, on two channels:
`--chrome` is a continuous opacity so the controls dissolve rather than blink,
and an `is-scrolled` class then sets `visibility: hidden`, because an invisible
timeline is still a timeline as far as the pointer is concerned and would eat
every click along the bottom of the dossier. Both are written straight to the
DOM from the scroll handler — a `setState` per scroll event would re-render the
whole UI tree for a number that feeds two style properties.

Switching bodies jumps to the top with `behavior: 'instant'`, not `'auto'`, which
defers to whatever `scroll-behavior` is in force and would glide a thousand pixels
through content that has already been replaced.

**`scroll-behavior: smooth` is not set on the root, and its absence is
deliberate.** It used to be, back when the scroll hint jumped the page with a bare
`scrollTo` and needed the browser to soften the landing. `glideTo` replaced that
and tweens the scroll itself, passing `'instant'` on every step precisely so it
does *not* go through the property — so the rule had stopped doing the job it was
added for, and was only still affecting the one kind of scrolling it should never
have touched: the user's own wheel. That was the "caught" feeling coming out of
the dossier. Chrome animates a smooth scroll over a fixed ~300ms however far it
is going and each new notch retargets the animation in flight, so `scrollY` lagged
the gesture by a third of a second — and while it was above zero the page still
owned the wheel. You were winding the wheel back with the camera not yet
listening, and then it would let go all at once. Native scrolling tracks the
gesture; the tween is only for the transitions the app starts itself.
`overscroll-behavior-y: none` goes with it, since this document is usually exactly
one screen tall and a rubber-band at either end reads as the seam slipping.

## The body selector

Collapsed by default now, the same shape as the layers panel: one control naming
where you are, which expands into the class-grouped chip panel. Even one class at
a time was a permanent strip of thumbnails across a view whose subject is the
place you are already at.

It also moved to the bottom-left corner, which quietly deleted a bug. Centred, a
short bar had to know about the info panel — a row centred on the whole window is
visibly off-centre when a 400px column covers the right of it. Anchored to a
corner, nothing about its position depends on what else is on screen.

## Labels and icons

Names and markers are DOM, not canvas: they need real text rendering, real hit
targets and real accessibility. But their positions come from the camera, which
only exists inside the R3F tree — so something has to carry screen coordinates
across that boundary sixty times a second.

`LabelLayer` renders its nodes once and registers them in a plain `Map`
(`labelRegistry.js`); `LabelProjector`, inside the Canvas, projects each body and
writes `transform` straight onto those nodes. No state, no re-renders, no
reconciliation — a matrix multiply and a style write per body. The obvious
alternative, drei's `<Html>`, mounts a separate React root per body; at eight
planets that is merely wasteful, and at the thirty-odd bodies that arrive with
dwarf planets and moons it would be thirty roots each transforming themselves
every frame.

The icon is a hollow ring anchored on the body, so the body shows through its own
marker rather than being hidden by it, and it fades out once the planet is more
than about 13 px across and can speak for itself. The name sits above the disc,
lifted by a `--body-radius` custom property the projector publishes each frame,
so it moves clear as you approach rather than being swallowed.

This is what keeps the app usable at true scale, where Earth is four thousandths
of a world unit across and there is otherwise nothing on screen to aim at.

A moon gets no label until it is at least 30 px from its planet on screen. Without
that rule the overview is unreadable: at the default zoom all ten moons land within
16 px of their parent — the Moon 6 px from Earth, Deimos 1 px from Mars — so the
scene would open with ten names piled onto four planets. The rule is also how you
actually use the thing. You fly to Jupiter, and its moons resolve and name
themselves as you arrive.

## Dwarf planets and moons

Thirty-eight bodies now: the eight planets, five dwarf planets (Ceres, Pluto,
Haumea, Makemake, Eris) and twenty-five moons. `bodies.js` unifies them behind one
shape so the renderer, the camera and the label overlay never ask what kind of
thing they are looking at.

The moons are **complete systems** wherever a system is small enough to finish:
all seven of Saturn's round icy moons, all five large Uranian ones, and the whole
Pluto system including Styx, Nix, Kerberos and Hydra. A system read whole shows
something a highlights reel cannot — the resonances tying the orbits together,
and how much emptier the outer systems are than Jupiter's.

Pluto hosting five of them is worth noting because nothing needed changing to
allow it: a parent needs a radius and an axial tilt, which a dwarf planet has, so
the renderer never cared. The only code that had assumed parents were planets was
`verify-bodies.mjs`, which crashed on Charon and was corrected.

### Where the dwarf planets come from

JPL's approximate-positions table covers the eight planets and Pluto, and nothing
else — so Pluto uses the official fit and the other four needed one built.

The first attempt took a single set of osculating elements from the Small-Body
Database and propagated them as two-body motion. It was wrong by **11 degrees**
for Ceres in 1850. Osculating elements describe the ellipse a body is on at one
instant; Jupiter is steadily changing Ceres's, and a frozen ellipse accumulates
two centuries of that change as phase error.

`fetch-dwarf-elements.mjs` now does what JPL did: it asks Horizons for elements
once a year across the whole 1800–2050 window and least-squares fits each one to
a line in time. The perturbations average out and the secular drift is what the
rates carry. Worst case is now **16.5 arcminutes** (Ceres), against 11 degrees —
a fortyfold improvement, and far under a pixel at these distances.

### The satellite frame, which is the whole design

A moon does not orbit in the ecliptic. It orbits close to its parent's equatorial
plane, held there by the planet's oblateness, and that is *why* Titan runs flat
through Saturn's rings.

So satellite elements are fetched in Horizons' body-equator frame, and
`satelliteFrame.js` rotates the resulting offset by the parent's `axialTilt` —
the very same angle that orients the planet's surface and its rings. Titan and
the rings are coplanar by construction rather than by coincidence, and no
separate IAU pole model is needed.

The Moon is the exception and has to be. Its orbit is inclined 5.15° to the
**ecliptic**, not to Earth's equator; its inclination to the equator swings
between about 18° and 28° across the 18.6-year nodal cycle. It carries
`plane: 'ecliptic'` and skips the tilt rotation, with Meeus' real nodal
regression and apsidal advance.

`verify-bodies.mjs` measures each orbital plane against the ecliptic pole and
asserts what it should be — Titan at Saturn's 26.73°, the Moon at 5.145° rather
than Earth's 23.44°. That check is the one worth having: everything else would
still pass if the tilt rotation were quietly dropped, and the moons would orbit
tidily in the ecliptic looking entirely reasonable.

### The four moons Horizons cannot be asked for

Styx, Nix, Kerberos and Hydra came back from Horizons with orbits that were not
theirs. Kerberos arrived as `a = 133,084 km, e = 0.556, P = 119.7 d` against a true
`a = 57,783 km, e = 0.003, P = 32.2 d`. The hand-written table of published periods
in `verify-bodies.mjs` is what caught it — 272% off, on a check that exists for
exactly this.

The cause is that osculating elements are fitted from a state vector measured
relative to *the centre you asked for*, and Pluto's centre is not an inertial
point. Charon is a tenth of Pluto's mass, not a rounding error, so Pluto circles
their common barycentre at about 24 m/s — while these four moons orbit at only
120–150 m/s. Elements taken about Pluto's centre therefore carry a ~20% velocity
error, and a two-body fit absorbs it as eccentricity. The damage grows with
distance, because the further out a moon is the slower it goes, which is why
Kerberos and Hydra are wrecked and Styx is merely wrong.

Charon is immune and is fetched normally: Pluto's wobble *is* Charon's orbit
mirrored, so measured from Pluto's centre Charon traces a clean ellipse. It comes
back within 5 km of the published semi-major axis.

The barycentre is not the way out either. `CENTER=@9` is the physically right
point, but Horizons answers `Body frame output not available for this center` — a
barycentre has no equator, so it cannot serve `REF_PLANE=B`, and the body-equator
frame is the entire basis of how moons are placed here.

So each half is taken from where it is sound. **The plane** (`i`, `Omega`) comes
from Horizons and is exact: an orbital plane is the direction of `r × v`, and the
wobble lies in that same plane, since all five moons are coplanar to within a
degree. **The position** comes from Horizons' argument of latitude, `w + TA`, which
is likewise pure geometry of the state vector. **The size and period** come from
the published mean elements (Brozović et al. 2015), which is precisely what the
corrupted fit gets wrong. The one thing given up is the direction of periapsis,
pinned to the node — at e = 0.002–0.006 that shifts the moon along its orbit by
under half a degree.

### Compression, and what it is allowed to break

Moon distances warp on their own curve inside their parent's frame,
`clearance + 0.58·r^0.53`. That is a severe squeeze — the Moon's 60 Earth radii
become about 6 — and it has to be: a system keeping even a quarter of Callisto's
true separation would reach far enough that Jupiter's and Saturn's moons tangled
at conjunction.

Two things the curve is *not* allowed to break, both checkable by eye:

- **The Galileans stay in separate lanes.** Anything that saturates — a log, an
  exponential — flattens them into one shell, and their spacing is the most
  recognisable arrangement in the solar system. The coefficient was 0.45 until
  the verification measured the result: the Io–Europa gap came out at 0.35 world
  units while the moons are 0.44 across, so they would have overlapped on screen.
- **Enceladus orbits outside Saturn's rings.** It is the source of the E ring, so
  drawing it inside them would be a falsifiable error rather than a matter of
  taste. The clearance is read from where the rings are actually drawn, so
  retuning a ring preset carries the moons with it.

Moons also get their own size curve. The planet curve floors at 0.4 world units to
keep Mercury visible; applied to an 11 km rock that floor makes Phobos the same
size as Mercury and **larger than Mars**, the planet it is orbiting.

**Fifteen more moons broke that tuning, and the fix came out of both numbers.**
The exponent was 0.42 and the checks were built around systems of four. Saturn's
seven and Pluto's five are a different problem:

- Enceladus and Tethys are only 1.24 apart in true distance, and at 0.42 their
  lanes came out 0.157 units apart while the two bodies are 0.211 across — an
  overlap at every conjunction.
- Pluto's four small moons span a true distance ratio of just **1.5 end to end**,
  the tightest packing in the app, and all four sit on the minimum drawn size. At
  the old 0.08 floor they overlapped permanently rather than occasionally.

So the exponent went to **0.53**, which widens exactly the gaps that were too
tight because a higher exponent preserves more of the ratio between neighbouring
orbits. That is bounded, though: Jupiter's and Saturn's systems now occupy 20.5 of
the 23.7 units between the two planets, and they must never touch. With no room
left to spend on spacing, the last of it came out of size — `MOON_SIZE_FACTOR`
from 0.55 to 0.51, and the small-moon floor from 0.08 to **0.03**.

Dropping the floor is a correction as much as a fix. At 0.08 Phobos was drawn at
17% of Mars's width against a true 0.33% — fifty times oversized; at 0.03 it is
twelve times oversized, which is the honest cost of seeing an 11 km rock at all.
Nothing depends on that floor for visibility anyway, because `LabelProjector`
gives every body a screen-space marker that stays clickable at any size.

The check that found all of this was itself wrong, and worth describing. It
compared the tightest gap in a system against the widest moon *anywhere in that
system* — so it judged the Mimas–Enceladus gap by the size of Titan, eleven lanes
away. It now runs pairwise against the two bodies actually involved, which is the
claim that matters: **two neighbours' discs must not touch when they line up.**
The tightest pair in the app is Enceladus–Tethys, clearing by 22%.

### Which surfaces are real

Not all of them, and the info panel says so per body. The Moon wears its real map.
Ceres, Eris, Haumea and Makemake wear Solar System Scope's *fictional* surfaces —
nobody has imaged them.

Eleven of the fifteen moons added last wear real NASA models, and the measurement
that decides which are complete sorted them into three groups.

**Complete.** Tethys, Dione, Rhea and Iapetus measured **0%** blank — full Cassini
mosaics, and they get no note.

**Complete, but easy to misread.** Mimas measured **43%** blank, which on an
equirectangular map would mean half a missing moon. It is a cube-map atlas, and
that is unused corner. The filenames give it away: `Mimas_diff.jpg` +
`Mimas_norm.png` at 2048x2048, where every other moon here ships a single
`color_YYYY_MM_DD.jpg` at 2:1. It is also the only moon in the set with a normal
map.

**Genuinely half-missing.** The Uranian five run 41% (Ariel) to 56% (Oberon), and
Charon 32% — and *where* the blank falls is what confirms the reason rather than
merely asserting it. For the Uranian moons it sits in the northern latitude bands,
evenly across all longitudes: Voyager 2 passed in 1986, Uranus lies almost on its
side, and only the southern hemispheres were in sunlight. The north was in the
middle of a decades-long winter night, and nothing has been back. Charon's blank is
in the *south* — 96% of its bottom quarter is flat — because New Horizons met the
same polar night that hid Pluto's southern hemisphere. A missing *side* would show
in the longitude quarters instead, and in no case does.

The visible consequence is honest and worth knowing about: fly to Ariel and the
southern half is cratered while the north is smooth grey, with a boundary near the
equator. That is not a rendering fault. The info panel says so per body.

**The four that keep procedural spheres** are Styx, Nix, Kerberos and Hydra, and
NASA has no model of them because New Horizons resolved them into a handful of
pixels each. Their note says the **shape** is invented as well as the terrain,
since a body tens of kilometres across is lumpy and double-lobed and is being drawn
as a sphere. Nix keeps the one detail actually seen — a reddish crater on an
otherwise grey-white surface.

Two of the procedural recipes took some care and are still used as the fallback
behind every model. Iapetus is two-toned by hemisphere, not by latitude, so the
dark side uses the same `patch` mechanism as Pluto's Tombaugh Regio — a "spot" 92°
wide in both directions is a hemisphere, and reusing it means the boundary gets
broken up by the terrain noise, which is right, since the real edge is ragged.
Charon's cap needed the same treatment for the opposite reason: `capLat` works on
the *absolute* latitude and so paints both poles, and Mordor Macula is only in the
north.

Pluto is the interesting case: its map is real, but only half of it is sharp, and
the panel says so. Measuring local contrast across the mosaic itself, the northern
and equatorial encounter side runs 11–13 and it collapses to 0.1–0.4 south of
about 33°S. New Horizons flew past once, in 2015: it photographed one hemisphere
in detail, caught the far side from millions of kilometres out as Pluto turned,
and could not photograph the southern hemisphere at all — it was in polar night,
and will stay there for over a century. The large soft patch on the globe is
interpolation, not terrain, and nothing is done to disguise it.

Each recipe aims at the one thing that makes its body recognisable and stops
there. Io is sulphur yellow with no craters at all, because it resurfaces itself
faster than they form. Callisto is nothing but craters. Titan is a smooth orange
blank, because its surface has never been seen in visible light from orbit. An
invented crater in the wrong place is worse than no crater.

## The sun, from the Blender model

The plasma loops arching off the limb come from a Blender model in `Models/`.
Getting them into the browser needed a real conversion, and the interesting part
is what could *not* come across.

**None of the materials survive.** glTF defines one PBR metallic-roughness
material with image textures, full stop. That model's entire appearance is
procedural Cycles nodes — Noise and Musgrave through ColorRamps into Blackbody
and Emission, mixed against a Transparent BSDF by Layer Weight — and there is
not a single image texture in the file. Exported as-is, every part arrives flat
grey.

Baking would not rescue it either, and that is the useful thing to know: Layer
Weight and the Geometry node's incoming vector are **view-dependent**. They are
what make a prominence glow along its edges, where the line of sight passes
along the gas rather than through it. A baked texture is view-independent by
definition, so it would flatten exactly the effect worth keeping.
`Prominences.jsx` rebuilds it live instead, as a fresnel term — a few lines of
shader against a thirty-node graph.

**Three of the six parts are used**, in two files totalling 1.1 MB:
`Star_Surface` (the photosphere), `Solar_Fire` (a flame shell), and the
prominence loops. What the photosphere buys over the sphere it replaces is
*relief* — a baked displacement makes its limb subtly irregular rather than a
drawn circle. `Solar_Fire` is displaced at full strength, so its silhouette is
genuinely lumpy, which is not something a sprite can fake.

`Corona` is left out. It is a smooth sphere at 1.21 radii, and a sphere has a
hard silhouette: however softly its rim is shaded, the shell still *ends*
somewhere, and against black that edge reads as a bubble drawn around the sun.
The radial sprite already in `Sun.jsx` has no edge at all, which is the right
tool for haze thinning into space. `Solar_Prominences` is left out too — it sits
at the photosphere's own radius and is only the emitter surface its scatter ran
across.

**The flame shell needed a different technique than the corona did.** A fresnel
alone does not work on `Solar_Fire`: on a heavily displaced shell it traces the
outline of every lump, so the sun ends up inside a cage of bright edges, and at
moderate angles it leaves a dim wash across the whole disc that reads as dull
brown. (Two false starts here — `BackSide` made it worse by lighting the
*interior* creases, and the normals turned out to be smooth, measured at 14
degrees of genuine curvature between adjacent faces, so it was never a shading
problem.) What works is cutting the shell into patches with animated noise and
keeping the fresnel steep, so only true grazing contributes. That turns lump
outlines into tongues of flame.

**The model's own scatter could not be used.** `Solar_Prominences` places its
loops with a Geometry Nodes graph that evaluates to *zero* geometry in
background Blender, linked collections or not. So placement happens in the app —
which is what we want regardless, since the loops have to sit on a sphere whose
radius changes with the scale setting.

Twenty-two instances across four shapes, four draw calls. That is more than it
sounds like it should need, and the reason is where a loop actually reads:
scattered over a whole sphere, half face away and are hidden by the photosphere,
and most of the near half sit face-on against the bright disc where additive
blending washes them out. Only the ones near the limb silhouette against black.

Both GLBs under `public/models/` are committed rather than generated at
install, unlike the textures: regenerating them needs Blender, which most
environments will not have. `Sun.jsx` carries a `USE_MODEL_SHELLS` constant that
switches the photosphere and flame shell back to the original sphere in one
line — the prominence loops are independent of it and stay either way.

## Surfaces, from NASA's 3D models

NASA publishes 3D models of the planets, the dwarf planets and most major moons
at [science.nasa.gov/3d-resources](https://science.nasa.gov/3d-resources/). Each
is offered as glTF and as USDZ; glTF is the one taken, because USDZ is Apple's AR
container and three.js has no loader for it.

**Twenty-one of the thirty-eight bodies now wear one.** Mars and Neptune keep the
Solar System Scope maps, the Sun keeps its own Blender model, and the fifteen
moons added last have no NASA model to wear — they are drawn procedurally, and the
info panel says so.

Earth is the odd one out. Its model is a cube-map cross on a 3,072-triangle
sphere, and both halves of that are wrong for the one body the camera actually
lands on: a quarter of the app's own sphere density shows at close range, and
Earth is the only body reading a *second* map — the night lights — through the
same coordinates. So `npm run maps:earth` resamples the atlas to an ordinary
equirectangular map ahead of time, by asking the mesh which direction each of
its texture coordinates points at, and Earth keeps its 96x64 sphere. The output
lands in `public/maps/`, committed for the same reason `public/models/` is. The
cloud deck comes composited into that map, which is why Earth no longer draws a
separate cloud shell — and why its clouds no longer drift.

The sources live in `Models/`, gitignored — 220 MB of Blender exports across the
31 bodies that use one. What ships is `public/models/`, 64 MB, committed because it
cannot be regenerated without the sources. `scripts/nasa-models.mjs` is the one list
of which file each body comes from; `npm run model:nasa` repacks them all.

Eleven moon models account for the last 23 MB of that, and five of them — Mimas,
Tethys, Dione, Rhea, Iapetus — are 3–5 MB each because Cassini mapped them at
4096x2048. That is the same weight already carried for Luna and Enceladus, but it is
worth being explicit: **everything preloads before the scene mounts**, so the whole
64 MB is on the critical path, and adding these moons made the first load slower.
Loading a body's mesh on demand is the obvious fix and is not done.

### What this actually bought

Nine bodies that the app had to invent now wear real spacecraft imagery. Ceres has
Dawn's mosaic, the Galilean moons have Galileo's, Enceladus and Titan have
Cassini's, Phobos and Deimos have Mars orbiter imagery, and the Moon has LRO's —
46,464 vertices of displaced lunar terrain, the only body in the set with genuine
relief rather than a photograph on a sphere.

Which of those are real was measured rather than assumed: the share of each
shipped map carrying no local detail, ignoring the blank regions of the cube-map
atlases. Ceres came out at 2%, Ganymede 1%, Callisto and Enceladus 0%. Pluto at
35% and Triton at 41% did not, and both carry a note in the info panel saying
which part of them is interpolation. Titan measures 99% featureless, which is not
a gap but Titan: an unbroken orange smog with no visible surface at all.

Three bodies stay marked as invented. Eris, Haumea and Makemake are points of
light in the best telescope ever pointed at them, and NASA's models of them are
artist's impressions exactly as the textures they replace were. Swapping one
guess for another is not progress.

### Why the mesh, and not just the texture

For a body NASA modelled as a smooth sphere, the geometry adds nothing over the
`sphereGeometry` the scene already draws. The meshes are used anyway, and for
several bodies they are not optional at all.

**Mercury, Venus, Jupiter, Saturn, Makemake and the Moon are textured with
cube-map atlases** — six square faces laid out in a cross, which is why their
images are 4:3 or 1:1 rather than the 2:1 of an equirectangular map. There is no
way to put a cube cross on a sphere's UVs. It has to be sampled through the
unwrap it was authored against. (This was checked, not assumed: plotting UV
occupancy for Jupiter, Mercury and Saturn gives the cross; Pluto's fills the
square, so Pluto is genuinely equirectangular.)

Beyond that, several meshes carry real shape — Phobos, Deimos and Haumea are
genuinely irregular, and the gas giants are visibly oblate — and using the mesh
everywhere is one rule instead of two.

### What the build step does

`scripts/prepare-nasa-model.mjs` repacks each file, and most of what it does is
undo Blender.

**The exporter re-encodes every embedded image as PNG.** Pluto's map is named
`pluto_equi.jpg` inside the file and stored as a 6.2 MB PNG — a lossless copy of
a photograph, which is the one thing PNG is worst at. Re-encoding the colour maps
as JPEG at quality 90 takes the whole set from 220 MB to 64 MB — Dione alone goes
from 17.6 MB to 4.3 MB.

That quality was chosen by measurement. At 82, a re-encode costs 4% of a map's
mean local contrast, measured block by block against the source; at 90 it costs
about 1% for roughly half again the bytes. Since the point of shipping these at
full resolution is sharpness, spending there is the consistent choice.

**Normal maps are never re-encoded.** They are not pictures — each pixel is a
unit vector, and JPEG's chroma subsampling turns small errors into visible
shading artifacts across a lit sphere. They pass through as PNG, capped at their
colour map's resolution. Haumea is why that cap exists: NASA ships a 2048x2048
normal map against a 1024x1024 colour map, at 9.2 MB, for a dwarf planet a few
pixels across. A normal map finer than the colour it accompanies is detail
nothing can sample. Capped, it is 2.3 MB.

Two more corrections happen on the way through. Vertices are divided by the
mesh's bounding radius so every body arrives at radius 1 — the same "unit
geometry scaled by a radius" contract the spheres follow, so the scale slider
keeps working. And NASA's `metallicFactor: 0.5` is reset to 0, because under this
scene's single point light it makes a planet look like a snooker ball.

Node transforms are baked into the vertices rather than carried. Uranus and
Neptune are the reason: both sit under a node rotated 90 degrees about X because
they were modelled Z-up, and since `models.js` reads `object.geometry` straight
off the node and hands it to a mesh of its own, an unbaked rotation would have
laid Uranus on its side. Which, for Uranus, would have been very hard to notice.

### Saturn

Body only. NASA's file carries three meshes — the globe and two ring planes — and
the ring nodes are dropped, because the app's own rings are a radius-mapped mesh
with a proper alpha texture where NASA's ring map is 4096x16: a single strip, one
pixel row per gap. Dropping them also fixes the normalisation, since bounding
radius is measured over the meshes that survive the filter. Measured over the
rings, Saturn's globe would have come out 1165x too small and rendered as a dot.

### Known rough edge

The nav-bar chips and the info-panel thumbnail are plain `<img>` tags reading
`public/textures/`, so for these twenty bodies the chip still shows the old
surface while the globe shows the new one. The two are close enough not to jar
for most bodies, and the texture set is still needed — for Earth, Mars and
Neptune, for the chips, and as the fallback if a model fails to load. Rendering
the chips from the model maps would fix it, but a cube cross does not crop into a
circular thumbnail, so it is not a one-liner.

## Shadows

Nothing here casts a shadow through a shadow map, and that is deliberate rather
than a shortcut. A shadow map is a depth render from the light's point of view,
and the light is a point light at the Sun covering a scene that runs from a moon
a fraction of a unit across out past Neptune. One cube map spanning that would
give Phobos a shadow a few millionths of a texel wide. Cascades or per-object
maps would fix it by rendering the scene many more times over — for shapes whose
shadows have exact closed forms.

Every occluder in this scene is a sphere or a flat annulus, so `scene/shadows.js`
solves the shadow per fragment instead, as a patch onto the stock material:

**Spheres** are worked in angles rather than distances — the angular radius of
the occluder against the angular radius of the Sun, from the fragment's own
point of view. That is what makes it behave correctly at every zoom and what
gives a real penumbra for free: the Sun is not a point, so a shadow edge is one
disc sliding across another, and the width of that transition depends on how far
away both are. The final clamp is the part worth keeping — an occluder whose
angular radius is smaller than the Sun's can never black it out however exactly
it lines up, only take a bite out of it. That is an annular eclipse, and it is
why a small moon crossing a planet dims it rather than punching a black hole in
it.

**Rings** trace from the fragment toward the Sun and ask where the ray crosses
the ring plane. Inside the annulus, the ring texture's own alpha at that radius
says how much light gets through — so the Cassini Division draws itself as a
bright stripe across Saturn without being modelled anywhere, which is what it
does in a photograph. The same sphere test run on the ring mesh gives the other
half: the planet's shadow thrown outward across the rings, the wedge that makes
a ringed planet read as a solid object rather than a decal.

Only direct light is attenuated. Ambient stands in for starlight, so a shadowed
surface falls to that rather than to pure black — enough to keep a dark limb
separate from the sky behind it, and no more.

### Why the night side used to be brown

Adding the shadows exposed a second problem that had nothing to do with them.
A planet's unlit hemisphere was rendering at about a third of full brightness in
its own colour: not a shadow, dusk. Measured off a real render, a selected Venus
came out at rgb(81, 60, 27) right across its night side.

Two causes, and the larger one was a surprise. Hover and selection used to
brighten a body by raising its **emissive** term — and emissive is added after
lighting, so it lifts the night side exactly as much as the day side. Roughly
two thirds of that brown was the selection glow, permanently on for whichever
body you had flown to. The other third was an ambient light of 0.075, set back
when a near-black crescent looked like the planet had been cut in half.

The fix for the first is to brighten the **diffuse** colour instead, which is
multiplied by incoming light: the same feedback where it is visible, and none
where there is nothing to reflect. Ambient then came down to 0.02, which is
about right for a place with no air to scatter light around a planet.

Together those take Venus's night side from rgb(81, 60, 27) to rgb(5, 1, 0) —
roughly ten times darker, and no longer tinted. It also stops the terminator
being the only thing separating day from night: bodies now show real crescents
across the scene.

rgb(5, 1, 0) turned out to be a touch too austere to look at, so ambient settled
at 0.045, which measures rgb(11, 3, 0). Still 4% of full brightness, so a shadow
still reads as a shadow, but a dark limb is separable from the sky rather than
swallowed by it.

### The sun

Trimmed at the same time: emissive from 2.6 to 1.15, bloom from 1.35 to 0.55,
and the corona sprite from 0.5 to 0.22 opacity.

The emissive is boxed in from both sides. ACES saturates a long way below 2.6,
so the value has to come down near 1.0 before the peak stops clipping — but it
cannot go below 1.0, because that is the bloom pass's luminance threshold, and
that threshold is the only thing keeping the sun the one object in the scene
that blooms. A close-up of Jupiter's lit face already reaches about 0.57.

A note on how that was tuned, because the measurement misled me: the metric
anchored on the most saturated red pixel near the sun, which is not the disc at
all — it is `Solar_Fire`, the additive flame shell, at the limb. So the
"percentage of the disc clipping" it reported was really tracking the shell, and
the drop it showed cannot be read as a statement about the photosphere. The
values above were settled by looking.

A body is only ever tested against occluders in its own system: a planet against
its own moons, a moon against its planet and its siblings. Nothing else can come
between a body and the Sun, so nothing else is worth a per-fragment test.

**These are shadows of what is drawn, not of the real solar system.** At the
default compressed scale a moon's orbit is squeezed and the bodies are drawn far
larger than life, so eclipses happen much more often here than they do in the
sky. That is the right call for this app: the alternative is a body visibly
passing in front of another in full sunlight. The lighting agrees with the
geometry on screen, and at true scale the geometry is real, so the shadows become
real with it.

### Verifying it

The other verifications in this project are Node scripts, because the maths they
check lives in React-free modules Node can import. This one cannot be — the
shadows are GLSL, and the only honest way to test GLSL is to run it. So
`public/verify-shadows.html` renders single pixels through the shipped shader on
the GPU and reads them back: eleven checks covering the umbra, the penumbra, the
annular clamp, occluders behind or beyond the point, and the ring plane
intersection. Run `npm run dev` and open
[/verify-shadows.html](http://localhost:5173/verify-shadows.html). It is
dev-only, since it imports from `/src`.

The source is not copied into that page. `attachShadows` is asked to patch a
throwaway shader object and the injected functions are lifted straight back out,
so it tests the real thing and fails loudly if the patch's injection points ever
move.

One of those checks caught a mistake — mine, in the test rather than the shader.
The first ring case put the Sun exactly in the ring plane and expected a shadow.
The shader returned none and was right to: edge-on rings cast a line, not a band.

## Performance notes

- All animation runs through refs inside `useFrame`; nothing animates via React state.
- Planet world positions and the simulation clock live outside the store, so the camera can
  follow a moving planet without re-rendering anything. Only the date *readout* is pushed
  into React, four times a second.
- Bodies are unit spheres with a `scale`, not geometry built at a radius, so dragging the
  scale control doesn't rebuild eight 96x64 spheres every frame.
- Labels move by direct style writes from inside the frame loop, skipping sub-pixel
  changes, so the marker overlay costs no React renders at all.
- The asteroid belt is a single instanced mesh whose transforms are baked once at mount;
  the belt drifts as one group rather than updating 1,200 matrices per frame.
- Textures are 1024×512 and preloaded before the scene mounts, so nothing pops in.
- Bloom is a single pass, thresholded above 1.0 so only the sun blooms, and can be turned
  off from the toolbar.

## Attribution

- **Planet textures** — [Solar System Scope](https://www.solarsystemscope.com/textures/),
  licensed **CC BY 4.0**, built from NASA elevation and imagery data. Credited in-app in
  the bottom-left corner.
- **Pluto's surface and mesh** — NASA's [3D Resources](https://science.nasa.gov/3d-resources/),
  by NASA Visualization Technology Applications and Development (VTAD). The map is the
  New Horizons global mosaic.
- **Planet facts** — NASA's public planetary fact sheets. Each info panel links out to the
  relevant NASA pages.
