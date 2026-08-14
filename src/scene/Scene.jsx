import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { spacecraftAttitudes } from './attitude'
import { surfaceDirection, surfaceOffset, surfaceSpin } from './surface'
import { bodyBasis, primeMeridianAt } from './pole'
import { BODIES, bodyShown } from '../data/bodies'
import { useClassLayers } from '../hooks/useClassLayers'
import { cameraLimits, farPlane, homeCameraPosition, nearPlane } from '../orbit/frames'
import { useStore, viewScroll } from '../store/useStore'
import Sun from './Sun'
import Body from './Body'
import Spacecraft from './Spacecraft'
import SpacecraftPath from './SpacecraftPath'
import Starfield from './Starfield'
import Constellations from './Constellations'
import MilkyWay from './MilkyWay'
import BodyPath from './BodyPath'
import AsteroidBelt from './AsteroidBelt'
import SkyDome from './SkyDome'
import EclipsePath from './EclipsePath'
import SurfaceFeatures from './SurfaceFeatures'
import CameraController from './CameraController'
import { SIDE_SHIFT } from './splitFraming'
import SimulationClock from './SimulationClock'
import LabelProjector from './LabelProjector'
import { wasDragged } from './dragGuard'
import { constellationAtDirection } from './constellationLookup'

/**
 * Holds ACES tone mapping on while the bloom pass is mounted.
 *
 * `EffectComposer` sets `renderer.toneMapping = NoToneMapping` on mount and
 * restores it on unmount — the usual arrangement, where the composer owns the
 * final tone map and you add a `ToneMapping` effect to its chain. The trouble is
 * that the composer only exists while the sun-glow toggle is on, so the toggle
 * was silently switching tone mapping off for the *whole scene*. It read as a
 * hue and saturation shift on every planet: Earth's oceans went from washed grey
 * blue to deep saturated blue, and nothing about that is glow.
 *
 * A `ToneMapping` effect in the chain would fix the shift, but it tone maps the
 * finished frame, which would take Earth's exemption below away with it. So tone
 * mapping stays where it was — in each material — and this simply puts the
 * renderer's setting back.
 *
 * That normally breaks bloom, because ACES output never exceeds 1.0 and the
 * pass's threshold is exactly 1.0. It survives here because the only thing meant
 * to bloom is the sun, and every one of the sun's materials already sets
 * `toneMapped={false}` (see `Sun.jsx` and `SunShells.jsx`). Its pixels reach the
 * composer un-tone-mapped and still clear the threshold; everything else is
 * mapped and safely under it.
 *
 * Written from `useFrame` rather than an effect so the ordering is explicit: the
 * composer renders at `renderPriority` 1 and this runs at the default 0, so the
 * value is correct before every frame it draws, whatever order React happened to
 * mount the two in.
 */
/**
 * Publishes the live scene graph to the dev handle. Dev builds only.
 *
 * `__solar` already exposes the state the app keeps out of React — the clock,
 * the position registry — for exactly the reason this adds one more: the
 * interesting values are written sixty times a second and are therefore
 * unreachable from anywhere that can ask a question. The scene graph is the
 * largest remaining blind spot. Trail opacity, ribbon widths, every shader
 * uniform and every drawn radius live on materials that no module holds a
 * reference to, so the only way to check one has ever been to look at a picture
 * and judge, which is how a spider-web of trails passed review more than once.
 *
 * r3f used to hang its root off the canvas element, and in v9 it does not — the
 * only route left from outside is walking the React fiber tree, which is both
 * fragile and undocumented. Three lines here beat that.
 *
 * `import.meta.env.DEV` is false in a production build, so this component's
 * body compiles to nothing shipped.
 */
function DevHandle() {
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined' || !window.__solar) return undefined
    /*
     * `three` and `attitudes` ride along with the renderer handles because
     * every probe that asks a question about orientation needs both: the
     * registry to read a craft's attitude, and the library to do arithmetic
     * with what comes back. Building either by hand from the console is
     * possible and tedious.
     */
    /*
     * The surface transform, from *this* module instance.
     *
     * Not a convenience. A probe that reaches for these with a dynamic
     * `import('/src/scene/surface.js')` gets a second copy of the module —
     * Vite's dev server hands out a fresh instance once HMR has touched the
     * graph — and that copy's spin registry is empty, so every placement it
     * computes silently uses a spin of zero. An entire round of lunar
     * measurements came back wrong that way, and looked like a bug in the
     * placement rather than in the measuring.
     */
    Object.assign(window.__solar, {
      scene,
      gl,
      camera,
      three: THREE,
      attitudes: spacecraftAttitudes,
      surface: { surfaceDirection, surfaceOffset, surfaceSpin, bodyBasis, primeMeridianAt },
    })
    return () => {
      delete window.__solar.scene
      delete window.__solar.gl
      delete window.__solar.camera
      delete window.__solar.three
      delete window.__solar.attitudes
      delete window.__solar.surface
    }
  }, [scene, gl, camera])

  return null
}

function ToneMappingGuard() {
  const gl = useThree((state) => state.gl)
  useFrame(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
  })
  return null
}

/**
 * Slides the shot aside as the dossier rises.
 *
 * The obvious implementation is to move the camera, and it is the wrong one:
 * OrbitControls owns the camera and orbits it around `controls.target`, so
 * anything that displaces it gets pulled straight back — and if it did stick,
 * the user's orbit would then pivot around a point that is no longer what they
 * are looking at.
 *
 * `setViewOffset` instead renders a *window* inside a larger virtual frame. The
 * camera does not move at all: the projection is simply asked for a different
 * rectangle of the same view, which slides everything on screen. Negative x
 * takes a window to the left of centre, which pushes the contents right.
 *
 * A consequence worth being clear about: this slides the whole scene, not the
 * selected body. In a close-up the body is essentially all there is on screen,
 * so it reads as the planet moving — but at overview distances every orbit and
 * label would go with it. That is not a case that arises, because the dossier
 * only exists when something is selected and the camera is parked at it.
 *
 * `SIDE_SHIFT` is imported rather than written here because `CameraController`
 * needs the same number: how far the body moves across decides how much room is
 * left to its right, which is what sizes it. Two copies would drift.
 */
function ViewFraming() {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const applied = useRef(-1)

  useFrame(() => {
    const p = viewScroll.p
    // The projection matrix is rebuilt only when the number actually moves.
    // Parked at either end — which is where this sits almost all the time —
    // the whole callback is a compare.
    if (p === applied.current) return
    applied.current = p

    if (p <= 0) camera.clearViewOffset()
    else {
      camera.setViewOffset(
        size.width,
        size.height,
        -SIDE_SHIFT * size.width * p,
        0,
        size.width,
        size.height,
      )
    }
    camera.updateProjectionMatrix()
  })

  // A stale offset would outlive the scene — on a scale change, say, which
  // remounts the tree with the page still scrolled.
  useEffect(
    () => () => {
      camera.clearViewOffset()
      camera.updateProjectionMatrix()
    },
    [camera],
  )

  return null
}

/**
 * Everything inside the Canvas. Split out from `Scene` so it can read the
 * store without re-creating the Canvas.
 */
function SceneContents() {
  const bloom = useStore((s) => s.bloom)
  const clearSelection = useStore((s) => s.clearSelection)
  const selectConstellation = useStore((s) => s.selectConstellation)
  const scaleMode = useStore((s) => s.scaleMode)
  const limits = cameraLimits(scaleMode)

  const classLayers = useClassLayers()
  const showConstellations = useStore((s) => s.layers.constellations)
  const showMilkyWay = useStore((s) => s.layers.milkyWay)

  /*
   * Standing on the ground puts the orbit lines away.
   *
   * Not a preference and not a performance measure: from a surface they are
   * *false*. An orbit is a path drawn through space to show where a body has
   * been and will go, and it is a useful fiction seen from outside. Standing
   * in Gale Crater at sunrise with Earth's ellipse arcing over the horizon is
   * a picture of something nobody has ever seen and nothing could ever see.
   *
   * The labels and the markers stay, because they annotate objects that are
   * genuinely up there: "that speck is Earth" is the question a person actually
   * has standing on Mars, and it is the one thing the view cannot answer for
   * itself.
   *
   * Read here rather than by switching `layers` off in the store, so the user's
   * own settings are untouched and come back exactly as they were.
   */
  const standing = useStore((s) => s.surface !== null)

  // Which bodies exist at all this frame. Filtering here rather than hiding
  // inside each body means a switched-off class costs nothing: no geometry, no
  // material, no `useFrame` subscriber solving an orbit nobody will see. With
  // twenty-five moons that is twenty-five Kepler solves a frame reclaimed.
  //
  // `bodyShown` also drops a satellite whose parent is hidden, which is not a
  // refinement but a correctness fix — see its own doc comment.
  const visible = useMemo(
    () => BODIES.filter((body) => bodyShown(body, classLayers)),
    [classLayers],
  )

  return (
    <>
      {/* Mounted first so it advances the clock before any body reads it — see
          SimulationClock. */}
      <SimulationClock />

      {/* Ahead of everything that draws, so the projection is settled before
          the frame it applies to. */}
      <ViewFraming />

      <DevHandle />

      {/* Starlight, and nothing more.

          This was 0.075 for a long time, on the reasoning that a near-black
          unlit crescent made a planet look cut in half. Measured against a real
          render that was far too generous: the night side of Venus came out at
          rgb(81, 60, 27), a third of full brightness, which is not a shadow but
          dusk. What actually caused the cut-in-half look was the selection glow
          in `Body.jsx`, which lifted the night side harder than this ever did.

          With that gone, 0.02 was measured at rgb(5, 1, 0) — correct, and a
          little too austere to look at. 0.045 roughly doubles it to rgb(11, 3,
          0): still only 4% of full brightness, so the shadow reads as a shadow,
          but a planet's dark limb is now separable from the sky rather than
          being swallowed by it. */}
      <ambientLight intensity={0.045} />

      {/* Deliberately given nothing that depends on the scale. The sky is the
          same sky at diorama and at true scale — same shell, same star for star —
          which it cannot be if its radius is derived from `maxDistance`. See the
          note on `DOME_RADIUS` in Starfield.

          `starPixels` is the *average* star's size in CSS pixels, and with a
          real catalogue the average is a much fainter star than it used to be:
          the median naked-eye star is magnitude 5.9, and the size ramp gives it
          almost nothing. 1.8 was tuned when every star was drawn from the same
          random distribution; against the sky it left Orion's belt at three
          pixels and the field looking thin. 2.1 is still under the 2.6 the
          shimmer maths asks for, and the brightest stars now reach it on their
          own. */}
      {/* Behind the stars, and the thing the zoom-out arrives at: pull back
          past the Kuiper belt and this is what is left filling the view. */}
      {showMilkyWay && <MilkyWay />}

      <Starfield starPixels={2.1} />
      {/* Under the same roof as the stars: both ride with the camera, so the
          figures stay on the stars they connect however far the camera flies. */}
      {showConstellations && <Constellations />}

      <Sun />

      {/* Spacecraft paths are excluded here and drawn by `Spacecraft` itself:
          `BodyPath` samples a Keplerian orbit, and a trajectory is neither
          closed nor in a single frame. */}
      {!standing &&
        visible
          .filter((body) => body.kind !== 'spacecraft')
          .map((body) => <BodyPath key={`path-${body.id}`} planet={body} />)}

      {/* Primaries before satellites, and this is load-bearing rather than
          tidy: a moon's world position is its parent's plus an offset, and
          `useFrame` runs its subscribers in mount order. Interleave these two
          lists and every moon would trail its planet by one frame — invisible
          when the clock is slow, a visible lag at 100 years a second.

          Spacecraft are excluded here, and the exclusion is the whole reason
          this filter names `kind` at all. A craft's `parent` is null — not
          because it orbits the Sun, but because it has no *fixed* parent, and
          the honest value for "it depends on the date" is nothing. That made
          all sixty-four of them look like primaries, so each one mounted a
          second time as a `Body`: `registerPlanetPosition` seeded a zero vector
          into the shared registry, `Body` then reached for Keplerian `elements`
          that are null, and the fleet sat piled on the Sun with no trails at
          all. The satellite branch below was guarded from the start — against
          the case a spacecraft can never take — and this one, which every
          spacecraft takes, was not. */}
      {visible
        .filter((body) => body.parent === null && body.kind !== 'spacecraft')
        .map((body) => (
          <Body key={body.id} planet={body} />
        ))}

      {visible
        .filter((body) => body.parent !== null && body.kind !== 'spacecraft')
        .map((body) => (
          <Body key={body.id} planet={body} />
        ))}

      {/* Last of the three, and for the same mount-order reason the moons come
          after the planets — only more so. A spacecraft's reference frame
          changes over its mission, so on any given frame it may need Earth's
          position, or Jupiter's, or Io's. Mounting these after every planet and
          every moon is what guarantees whichever one it asks for has already
          written its position this frame. */}
      {visible
        .filter((body) => body.kind === 'spacecraft')
        .map((body) => (
          <Spacecraft key={body.id} craft={body} />
        ))}

      {/* Trails, after the craft themselves so a path reads its frame body's
          position in the same frame it was written. */}
      {!standing &&
        visible
          .filter((body) => body.kind === 'spacecraft')
          .map((body) => <SpacecraftPath key={`path-${body.id}`} craft={body} />)}

      {/* And the belt, which is the other thing that cannot be there. It is a
          procedural cloud standing in for a real population, drawn at a size
          that reads from across the solar system — which from the surface of
          Mars puts boulder-sized specks across the whole sky. */}
      {!standing && <AsteroidBelt />}

      {/* Last of everything, because it acts on everything: the sky multiplies
          and then adds over the whole frame. Only drawn while standing on a
          body that has air. */}
      <SkyDome />

      {/* The eclipse track, laid on the Earth while one is happening. Mounted
          after the bodies so `getPlanetSpin` has this frame's angle, not last
          frame's — the same ordering rule the rovers live by. */}
      <EclipsePath />

      {/* Named places on whichever surface you are at. After the bodies, so the
          spin it reads is this frame's. */}
      <SurfaceFeatures />

      <CameraController />

      {/* After the bodies, so it projects positions this frame rather than last. */}
      <LabelProjector />

      {/* Clicking empty space backs out to the overview. Sits behind
          everything and never blocks a planet, since planets stop propagation.
          The drag guard is essential here: without it every orbit gesture that
          ended over empty space counted as a click and yanked the camera back
          to the overview.

          With the constellations switched on it does something else instead —
          it names the patch of sky you clicked. Both behaviours on the same
          gesture would be unusable: identifying a figure would fling the camera
          back to the overview every time, so asking "what is that?" would cost
          you the view you were asking about.

          Gated on the layer rather than offered always, which is the rule the
          rest of the app already follows: you cannot select what is not drawn.
          With the figures switched off there is nothing on screen to suggest
          the sky is clickable, and the click means what it has always meant. */}
      <mesh
        onClick={(event) => {
          if (wasDragged()) return
          if (!showConstellations) {
            clearSelection()
            return
          }
          /*
           * The ray's *direction*, not the point it struck.
           *
           * This sphere is a finite backdrop parked at the far clip plane, and
           * the sky is not on it — the stars ride with the camera, at infinity.
           * The hit point is therefore a position on an arbitrary shell whose
           * radius changes with the scale dial, while the direction is exactly
           * the question being asked: which way is the user pointing.
           */
          const { x, y, z } = event.ray.direction
          const index = constellationAtDirection(x, y, z)
          if (index !== null) selectConstellation(index)
        }}
        scale={limits.maxDistance}
        renderOrder={-1}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial side={THREE.BackSide} transparent opacity={0} depthWrite={false} />
      </mesh>

      {bloom && (
        <>
          <EffectComposer disableNormalPass multisampling={0}>
            <Bloom
              mipmapBlur
              // Dialled back from 1.35. The sun's disc was clipping its red
              // channel flat at 255 and the bloom was piling more light on top
              // of an already-saturated core, so the glow read as blown out
              // rather than bright.
              intensity={0.55}
              // High enough that only the sun's own additive shells reach it.
              //
              // This was 1.0, on the reasoning that ACES output never exceeds
              // 1.0 so every tone-mapped surface lands safely under. That stops
              // being true now that the bodies render untone-mapped: the sun's
              // point light delivers 3.4 with no decay, which comes off a white
              // surface at roughly 3.4/pi ≈ 1.08 near the subsolar point. Bright
              // cloud tops were therefore clearing a 1.0 threshold and picking
              // up a halo of their own — the light blue ring around Earth, which
              // is the one thing this glow was never meant to do.
              //
              // 1.25 sits above that ceiling and well below the corona, so the
              // glow stays the sun's and nothing else acquires a hue.
              luminanceThreshold={1.25}
              luminanceSmoothing={0.22}
              radius={0.72}
            />
          </EffectComposer>
          {/* After the composer, and deliberately so — see the component. */}
          <ToneMappingGuard />
        </>
      )}
    </>
  )
}

export default function Scene() {
  // The camera prop is only read when the Canvas first mounts, so this is the
  // *initial* scale, not a live one. `CameraController` owns the limits from
  // then on, which is where they need to be anyway: changing scale mid-session
  // has to move the camera smoothly rather than remount the renderer.
  const initialScale = useStore.getState().scaleMode

  return (
    <Canvas
      className="scene-layer"
      dpr={[1, 2]}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        // The scene has to hold a Mercury-sized sphere and Neptune's orbit in
        // one depth buffer — six orders of magnitude at diorama scale, and nine
        // at true scale. A standard buffer distributes its precision so heavily
        // toward the near plane that the far half of that range collapses into
        // z-fighting. A logarithmic buffer spreads it evenly in log space,
        // which is exactly how this scene's distances are distributed.
        logarithmicDepthBuffer: true,
      }}
      camera={{
        position: homeCameraPosition(initialScale),
        fov: 55,
        // With a log buffer the near plane can go very tight without eating the
        // far end of the range, which is what makes flying up to a surface
        // possible at all. Scale-dependent for the same reason `far` is — see
        // `nearPlane`, which is what lets a one-kilometre moon be looked at.
        near: nearPlane(initialScale, 0),
        far: farPlane(initialScale),
      }}
      onCreated={({ scene }) => {
        // True void. Anything with blue in it reads as "sky" rather than space.
        scene.background = new THREE.Color('#000000')
      }}
    >
      <SceneContents />
    </Canvas>
  )
}
