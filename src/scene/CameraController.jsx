import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import {
  BODIES,
  bodyRadius,
  bodyShown,
  focusDistance,
  getBody,
  systemMoonsOf,
} from '../data/bodies'
import {
  SNAP_ACQUIRE_DEG,
  SNAP_RELEASE_FACTOR,
  angularSizeDeg,
  cameraLimits,
  degenerateLength,
  farPlane,
  homeCameraPosition,
  nearPlane,
} from '../orbit/frames'
import { FOCUS_RADII } from '../data/planetData'
import { planetPositions, useStore, viewScroll } from '../store/useStore'
import { attachDragGuard } from './dragGuard'
import { RING_PRESETS } from './Rings'
import { satelliteClearance, satelliteSystemRadius } from './satelliteFrame'
import { getDrawnRadius } from './spacecraftModels'
import {
  framingDirection,
  splitFramingDistance,
  systemFramingDirection,
} from './splitFraming'
import { stepFlightHomeEased, stepFlightToPlanetEased, stepFollow } from './followMath'
import { getAttitude } from './attitude'

/**
 * How much of the frame a satellite system's full width should take up.
 *
 * Under 1 by a clear margin because the thing being framed is a *disc seen at
 * an angle*, and the number here bounds its widest axis. The shot sits 32°
 * above the orbit plane, so the system has depth on screen as well as width;
 * leaving a quarter of the frame spare is what keeps the outermost moon from
 * riding the edge at the point in its orbit where it swings widest.
 */
const SYSTEM_FRAME_FRACTION = 0.72

/** Scratch for the dev-only flight error readout below. */
const _errorScratch = new THREE.Vector3()

/**
 * How far back to sit to see everything orbiting a body.
 *
 * Framed on the *smaller* of the two field-of-view angles, so the system fits
 * in a portrait window as well as a landscape one — on a tall phone the
 * horizontal angle is the tighter of the two, and framing on the vertical would
 * quietly crop the system's widest axis off both sides.
 *
 * Floored at the body's own focus distance, so that "Moons" can never zoom
 * *in* — a control that does the opposite of its name is worse than one that
 * does nothing. The floor is a guard rather than a working part: measured
 * across every host at both scales, the tightest system shot is Mars at 2.33x
 * its own close-up, so nothing reaches it today. It is here because the moon
 * distance curve has been retuned twice already, and a tighter one would find
 * Phobos — which orbits at 2.8 Mars radii — before anyone found it by eye.
 */
function systemFramingDistance(parent, moons, camera, scaleMode) {
  const renderRadius = bodyRadius(parent, scaleMode)
  const radius = satelliteSystemRadius(
    parent,
    moons,
    renderRadius,
    satelliteClearance(parent, RING_PRESETS),
    scaleMode,
  )
  if (radius <= 0) return parkDistance(parent, scaleMode)

  const halfV = (camera.fov * Math.PI) / 360
  const halfH = Math.atan(Math.tan(halfV) * camera.aspect)
  const half = Math.min(halfV, halfH)

  return Math.max(
    radius / (SYSTEM_FRAME_FRACTION * Math.tan(half)),
    parkDistance(parent, scaleMode),
  )
}

/**
 * Where the camera parks for a body.
 *
 * `focusDistance` measures from `bodyRadius`, which for a spacecraft is the
 * marker's floored size rather than the mesh's — twenty times larger at diorama
 * scale. Parking off that flew you to a craft and stopped well short of it, so
 * every arrival needed a manual zoom. The mesh publishes its own drawn radius;
 * where there is one, park off that instead.
 */
/**
 * Radii to park at for a spacecraft, against `FOCUS_RADII`'s 3.4 for a body.
 *
 * Tighter because the two are not measuring the same thing. A planet is a
 * sphere and fills its own bounding sphere; a spacecraft is a bus with panels
 * and booms, normalised by a bounding sphere that is mostly empty space, so at
 * the same number of radii it reads as a speck in the middle of the frame. 1.8
 * puts the mesh's extremities near the edge of the shot, which is where a planet
 * lands at 3.4.
 */
const SPACECRAFT_FOCUS_RADII = 1.8

function parkDistance(body, scaleMode) {
  const drawn = getDrawnRadius(body.id)
  if (drawn === null) return focusDistance(body, scaleMode)
  return drawn * SPACECRAFT_FOCUS_RADII
}

/**
 * The closest the controls may come, given what is selected.
 *
 * `cameraLimits` derives one floor for the whole scene from the smallest *body*,
 * and at diorama scale that is 0.0165 world units. A spacecraft's mesh is now
 * two orders of magnitude below that, so the flight would ask to park at 0.0091
 * and `OrbitControls` would clamp it to 0.0165 — the camera stopped short of its
 * own target and no amount of tuning the framing constant could close the gap,
 * because the constant was not what was in the way.
 *
 * So the floor drops to whatever the selection needs. It is a quarter of the
 * park distance rather than the park distance itself, so there is still room to
 * scroll closer by hand once you arrive.
 */
function closestApproach(limits, body) {
  const drawn = body ? getDrawnRadius(body.id) : null
  if (drawn === null) return limits.minDistance
  return Math.min(limits.minDistance, drawn * SPACECRAFT_FOCUS_RADII * 0.25)
}

/**
 * How long a flight takes, in seconds, whatever it is flying to.
 *
 * A duration rather than a rate, and that is the substance of it rather than a
 * detail. This was exponential damping, whose velocity is proportional to the
 * gap still to close: fastest at the instant of the click and slowing from
 * there, with no acceleration phase anywhere. Measured on Earth to Mars, a trip
 * of about 54 world units, in units travelled per fifth of a second:
 *
 *     27.86  13.86  6.77  3.32  1.64  0.80  0.40  0.19  0.10  0.05  0.02
 *
 * Over half the journey is gone in the first 0.2 s, before the eye registers
 * that anything has started, and the last two seconds creep through a few
 * percent. The trip took its full 2.1 s and still read as a cut, because what is
 * legible as travel is the middle of the motion and there was none.
 *
 * The rate used to be solved per trip so that every flight took the same time,
 * which made the opening jump worse the further you were going. A fixed duration
 * with `easeInOut` gets the same equal-time property for free and spends it on
 * the part you can see.
 *
 * 2.1 s. 1.6 was the first value tried and read as slightly clipped — the travel
 * is part of the sense of distance, and cutting it too far turns an approach
 * into a cut.
 */
const FLIGHT_SECONDS = 2.1
/** How briskly a parked shot pulls the planet back to centre. Deliberately
 *  gentler, so it reads as the shot settling rather than the camera fighting. */
const RECENTRE_LAMBDA = 2.2

/**
 * Whether a wheel over `target` belongs to a control that actually scrolls.
 *
 * Walks from the event's target up to the stage looking for an element that is
 * both scrollable in the wheel's axis and has somewhere left to go in the
 * wheel's *direction* — the direction test being what lets a control that has
 * hit its end pass the gesture on rather than swallowing it at the stop.
 *
 * A few `getComputedStyle` reads per wheel over a handful of ancestors. Only
 * reached for wheels over the chrome, since the canvas is the stage's own child
 * and exits on the first step.
 */
function scrollsItself(target, stage, deltaX, deltaY) {
  let node = target instanceof Element ? target : null

  while (node && node !== stage) {
    const style = getComputedStyle(node)
    const room = (overflow, position, extent, delta) =>
      (overflow === 'auto' || overflow === 'scroll') &&
      extent > 1 &&
      (delta < 0 ? position > 1 : delta > 0 && position < extent - 1)

    if (
      room(style.overflowY, node.scrollTop, node.scrollHeight - node.clientHeight, deltaY) ||
      room(style.overflowX, node.scrollLeft, node.scrollWidth - node.clientWidth, deltaX)
    ) {
      return true
    }
    node = node.parentElement
  }
  return false
}

/**
 * The panel under the pointer that owns this wheel, marked `data-wheel="ui"`.
 *
 * ## Why this is geometric rather than a walk up from `event.target`
 *
 * Because the thing most in the way is invisible to hit testing. The nav's
 * keynote card is `pointer-events: none` on purpose — it is a 477x74 caption
 * laid over the scene, and taking events would mean it swallowed every drag
 * behind it. So a wheel over the card reports the *canvas* as its target, and no
 * amount of walking up from there can find the nav. Marking the dock did not
 * help for the same reason: the walk never starts inside it.
 *
 * That card sits directly above the chips, which is exactly where a pointer on
 * its way to the list already is. The row scrolled when you were low enough and
 * the comet behind it zoomed when you were not.
 *
 * "Is the pointer over a control surface" is a question about rectangles, not
 * about who would receive a click. Answering it that way costs a handful of
 * `getBoundingClientRect` calls per wheel — there are three marked panels in the
 * app — and is right for a transparent surface and an opaque one alike.
 *
 * Hidden panels are skipped rather than assumed absent: both the nav and the
 * layer panel stay mounted and are hidden with `visibility`, so they keep their
 * geometry when closed and would otherwise claim wheels over a shut panel.
 */
function wheelOwner(x, y) {
  for (const el of document.querySelectorAll('[data-wheel="ui"]')) {
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
      continue
    }
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el
  }
  return null
}

/**
 * Scrolls whatever is under the pointer inside an owning panel.
 *
 * Searched by rectangle for the same reason `wheelOwner` is: the pointer may be
 * over a surface that takes no events at all, so there is no hit-test result to
 * start from. Document order means descendants come after their ancestors, so
 * the last match is the innermost scroller containing the point.
 *
 * The vertical-to-horizontal mapping is done here rather than left to the
 * browser. Chrome will turn a vertical wheel into a sideways scroll over an
 * element that can only scroll horizontally, but only as the event's *default
 * action* — and the default action is the very thing being cancelled to keep the
 * page still. Applying it by hand is what lets both be true at once.
 */
function scrollPanel(owner, x, y, deltaX, deltaY) {
  let found = null

  for (const node of [owner, ...owner.querySelectorAll('*')]) {
    const roomY = node.scrollHeight - node.clientHeight
    const roomX = node.scrollWidth - node.clientWidth
    if (roomY <= 1 && roomX <= 1) continue

    const r = node.getBoundingClientRect()
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue

    const style = getComputedStyle(node)
    const scrolls = (overflow) => overflow === 'auto' || overflow === 'scroll'
    if (scrolls(style.overflowY) && roomY > 1) found = { node, axis: 'y' }
    // A row that only scrolls sideways takes the vertical wheel too: it is the
    // gesture people actually make, and there is nothing else it could mean.
    else if (scrolls(style.overflowX) && roomX > 1) found = { node, axis: 'x' }
  }

  if (!found) return
  if (found.axis === 'y') found.node.scrollTop += deltaY
  else found.node.scrollLeft += deltaX || deltaY
}

/** How tight the cone around the scroll direction has to be to snap-focus. */
const SNAP_CONE_COS = Math.cos(11 * (Math.PI / 180))
/** Wait this long between automatic snaps so zooming can't chatter. */
const SNAP_COOLDOWN_MS = 700

/**
 * Drives the camera.
 *
 * OrbitControls owns the camera by default — the user always has direct
 * control. This component layers three behaviours on top:
 *
 *  1. Flight: when a planet is selected, ease the camera and the orbit target
 *     toward it, then hand control back.
 *  2. Follow: once parked, translate the camera by the planet's own orbital
 *     motion so it stays framed without locking the user's orbit.
 *  3. Snap: scrolling toward a planet selects it; scrolling far enough away
 *     releases it. Hysteresis and a cooldown keep it from oscillating.
 *
 * Any manual input cancels an in-progress flight rather than fighting it.
 */
export default function CameraController() {
  const controlsRef = useRef()
  const { camera, gl, raycaster, pointer } = useThree()

  const selectedId = useStore((s) => s.selectedId)
  const systemId = useStore((s) => s.systemId)
  const flightNonce = useStore((s) => s.flightNonce)
  const scaleMode = useStore((s) => s.scaleMode)

  const limits = cameraLimits(scaleMode)
  // Re-evaluated on selection, which is the only thing that can change it — and
  // selection is already a render, so this costs nothing.
  const nearLimit = closestApproach(limits, getBody(selectedId))
  const homePos = useMemo(
    () => new THREE.Vector3(...homeCameraPosition(scaleMode)),
    [scaleMode],
  )

  /*
   * The ride, in refs: which craft is being ridden, its attitude last frame,
   * and scratch for the delta. Never rendered from — see the ride block in the
   * frame loop.
   */
  const ridden = useRef(null)
  const rideFrom = useRef(new THREE.Quaternion())
  const rideDelta = useRef(new THREE.Quaternion())
  const rideScratch = useRef(new THREE.Vector3())

  /** Live flight state. Refs only — none of this should cause a render. */
  const flight = useRef({
    active: false,
    /** Fixed world-space direction from the target to the camera. */
    dir: new THREE.Vector3(),
    distance: 10,
    /** Seconds since the flight was armed; the ease reads this. */
    elapsed: 0,
    /**
     * How long the flight takes. Constant, and published here so the verifier
     * can time its assertions against the flight rather than against a frame
     * count that quietly assumes sixty a second.
     */
    duration: FLIGHT_SECONDS,
    /*
     * Where the trip began, relative to the destination body.
     *
     * Captured once at arming rather than read per frame, because an ease is
     * defined between two fixed endpoints — that is exactly what it has that
     * damping does not. Relative to the body, so the two ends stay meaningful
     * while the body itself is moving.
     */
    fromOffset: new THREE.Vector3(),
    fromTargetOffset: new THREE.Vector3(),
    /** The same two, in world space, for the trip back to the overview. */
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
  })

  /*
   * The flight, on the dev handle.
   *
   * Same reasoning as the rest of `__solar`: this is state deliberately kept out
   * of React so it can be written sixty times a second, which also puts it out
   * of reach of every question worth asking about it. "Is a flight running, and
   * at what rate" cannot be inferred from the camera's position — a camera being
   * carried along by a fast orbiter and a camera sitting still look identical in
   * a single frame.
   */
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined' || !window.__solar) return undefined
    window.__solar.flight = flight.current
    window.__solar.lastFollow = lastFollow.current
    window.__solar.desiredPos = desiredPos.current
    /*
     * And the controls themselves, which is the only way to *aim* the camera
     * from outside.
     *
     * Writing `camera.lookAt` does nothing that survives a frame: the controls
     * own the orientation and recompute it from their own target on every
     * update, so an external rotation is overwritten before it is drawn. That
     * cost a set of sky screenshots that all came back showing the default view.
     * The checks need to point at a constellation and see what is there.
     */
    Object.defineProperty(window.__solar, 'controls', {
      // A getter rather than the value: this effect runs once, and whether the
      // ref is populated by then depends on the order drei attaches it.
      get: () => controlsRef.current,
      configurable: true,
    })
    return () => {
      delete window.__solar.flight
      delete window.__solar.lastFollow
      delete window.__solar.desiredPos
      delete window.__solar.controls
    }
  }, [])

  /** Where the camera should sit, relative to the planet. */
  const desiredPos = useRef(new THREE.Vector3())
  /** Previous position of the followed planet, for the carry-along delta.
   *  Shared by the flight and the follow, so the handover is seamless. */
  const lastFollow = useRef(new THREE.Vector3())
  /**
   * *Which* body the follow is locked to, or null.
   *
   * A boolean until it caused the worst camera bug in the app, and the id is
   * what makes that bug unrepresentable rather than merely fixed.
   *
   * `lastFollow` only means anything paired with the body it was measured from,
   * because the follow's whole job is to translate the camera by however far
   * that body moved since the last frame. A flag can say "we are following"; it
   * cannot say "following *what*". So when the selection changed, there was one
   * frame — after the store updated, before the effect armed the flight — where
   * the follow ran against the newly selected body while `lastFollow` still held
   * the old one's position. It dutifully carried the camera by the difference:
   * measured on Earth to Mars, a 56.7 unit teleport in a single frame, most of
   * the trip, before the flight had started. Whatever the flight then did was
   * decoration on a camera already at its destination.
   */
  const following = useRef(null)

  /**
   * The selection the current flight was armed for.
   *
   * A string rather than three refs because it is compared, never read apart —
   * and because `flightNonce` exists precisely so that re-picking the body you
   * are already on counts as a new trip, which an identity check on the id alone
   * would swallow.
   */
  const armed = useRef(null)
  const lastSnapAt = useRef(0)

  /* The camera the user left behind, held while the page is at the top, and the
     canonical shot to ease toward as it scrolls. Both are captured rather than
     recomputed mid-scroll: a moving target would drift as the camera closed on
     it, and would not retrace its path on the way back up. */
  const restDistance = useRef(0)
  const restDir = useRef(new THREE.Vector3(0, 0, 1))
  const shotDir = useRef(new THREE.Vector3(0, 0, 1))
  const framingScratch = useRef(new THREE.Vector3())
  const dirScratch = useRef(new THREE.Vector3())
  const turn = useRef(new THREE.Quaternion())
  const turnTo = useRef(new THREE.Quaternion())

  /** Set by the wheel handler so the effect below can tell why we deselected. */
  const wheelRelease = useRef(false)

  /**
   * Arms a flight for the current selection.
   *
   * ## Why this is not an effect any more
   *
   * It was, and being an effect is what made every arrival a teleport.
   *
   * The store updates the instant you click; a React effect runs after the
   * commit, one frame later. In between, exactly one frame is drawn in which
   * `selectedId` is already the new body and no flight has been armed — so the
   * frame loop falls through to the *follow*, which is designed to hold a camera
   * on a body it is already parked at. It carried the camera by the difference
   * between the two bodies' positions: Earth to Mars, a 56.7 unit jump in one
   * frame, most of the journey, before the flight existed. What the flight then
   * did was decoration on a camera already at its destination.
   *
   * Pairing `lastFollow` with the body it was measured from (see `following`)
   * removes the teleport, and leaves a smaller one — the follow is still the
   * wrong code to be running on that frame, and it still recentres the pivot on
   * a body the camera has not travelled to.
   *
   * There is no arrangement of the frame loop that fixes this while the arming
   * lags the selection by a frame, because the gap itself is the bug. Called
   * from the frame loop instead, the flight is armed on the same frame the
   * selection lands, and nothing ever observes the mismatched pair.
   */
  const armFlight = (selectedId, systemId, controls) => {
    const planet = getBody(selectedId)
    following.current = null

    if (!planet) {
      /*
       * Deselecting has two causes that want opposite things, and treating them
       * alike is what made zooming out lurch.
       *
       * Pressing "Back to Solar System", or clicking empty space, is a request to
       * *go somewhere* — the overview — so it flies there. Scrolling out past the
       * release threshold is not: the user is mid-gesture, moving the camera by
       * hand, and the only thing they asked for is to stop being locked to the
       * planet. Flying home in that case overrode the gesture with a jump to the
       * overview distance and swung the angle round to `HOME_DIRECTION` as well,
       * which is the snap-further-away this fixes.
       *
       * So a wheel release starts no flight at all. The camera stays exactly where
       * the gesture left it and OrbitControls carries on from there, which is what
       * a continuous zoom out should be.
       */
      if (wheelRelease.current) {
        wheelRelease.current = false
        flight.current.active = false
        /*
         * The pivot is deliberately left where it is, on the point the camera was
         * looking at when it let go.
         *
         * An earlier version eased it back to the Sun on the reasoning that an
         * off-centre pivot is untidy. That was the wrong call: OrbitControls zooms
         * along the camera-to-target axis, so moving the target to the origin
         * silently re-aims the zoom at the centre of the system, and pulling back
         * then recentres the Sun instead of simply retreating from whatever you
         * were looking at. Tidier, and not what zooming out means.
         *
         * Leaving it put means the wheel keeps doing exactly one thing: moving the
         * camera straight back along the line it is already on. Dragging afterwards
         * orbits the point you left, which is the honest consequence — you are
         * flying near that point, not near the Sun. The overview button is still
         * there for when the Sun is what you actually want to return to.
         */
        return
      }

      // Back to the overview.
      flight.current.active = true
      flight.current.dir.copy(homePos).normalize()
      flight.current.distance = homePos.length()
      flight.current.elapsed = 0
      flight.current.fromPos.copy(camera.position)
      flight.current.fromTarget.copy(controls.target)
      return
    }

    // A flight owns the target from here, so the wheel-release flag must not
    // survive into it — a stale one would suppress a later trip home.
    wheelRelease.current = false

    /*
     * No position yet: report that nothing was armed, so the caller retries.
     *
     * This was a bare `return`, and the caller latched the selection key
     * regardless — so a body selected while it had no position was never flown
     * to, however long you waited.
     *
     * Unreachable while every craft on the roster was always somewhere. It
     * became reachable with missions that end: pick the Galileo Probe out of the
     * nav at today's date, when it has not existed since 1995, and the selection
     * lands on a craft with no position. Scrubbing back to 1995 then brings the
     * craft into being with the camera still parked wherever it was — 264 units
     * away, pointed at nothing in particular.
     *
     * Returning false leaves the key unlatched, so the next frame tries again
     * and the flight arms on the first frame the craft exists.
     */
    const planetPos = planetPositions.get(planet.id)
    if (!planetPos) return false

    // Where the camera currently sits relative to the planet. Keeping this
    // component means the flight arrives on the side the user was already on
    // rather than whipping around to a canned angle.
    const approach = new THREE.Vector3().subVectors(camera.position, planetPos)
    const degenerate = degenerateLength(useStore.getState().scaleMode)
    if (approach.lengthSq() < degenerate * degenerate) approach.set(0, 0.4, 1)
    approach.normalize()

    const scale = useStore.getState().scaleMode

    flight.current.active = true

    // Same destination either way — the body — so the system view inherits the
    // follow and the recentring without either of them knowing about it. Only
    // where the camera sits relative to that body differs, and it differs in
    // both terms: further out, and looking down the system's pole rather than
    // across its plane.
    if (systemId === planet.id) {
      const moons = systemMoonsOf(planet.id)
      systemFramingDirection(planet, moons, planetPos, approach, flight.current.dir)
      flight.current.distance = systemFramingDistance(planet, moons, camera, scale)
    } else {
      framingDirection(planetPos, approach, flight.current.dir)
      flight.current.distance = parkDistance(planet, scale)
    }

    /*
     * The two endpoints of the ease, captured now.
     *
     * Both relative to the body, so a planet that moves during the trip carries
     * the whole flight with it — `carryAlong` keeps the frame, and these two stay
     * meaningful inside it.
     */
    flight.current.elapsed = 0
    flight.current.fromOffset.subVectors(camera.position, planetPos)
    flight.current.fromTargetOffset.subVectors(controls.target, planetPos)

    lastFollow.current.copy(planetPos)
  }

  /* --- Distinguish drags from clicks for every scene handler --- */
  useEffect(() => attachDragGuard(gl.domElement), [gl])

  /* --- The camera follows the scale ---
     Two things have to happen when the scale changes.

     The depth planes: the Canvas only reads its `camera` prop at mount, so
     without this they would stay sized for the old scale — the far plane
     clipping the outer system away, and the near plane, which at true scale
     has to reach twenty thousand times closer, swallowing every small body
     the camera flew up to.

     The position: every distance in the scene has just been multiplied, so a
     camera left where it was would keep its old framing of a system that is no
     longer that size — dialling toward true scale would strand it inside
     Earth's orbit while the planets flew off. Scaling the camera and its target
     by the same ratio holds the shot exactly where the user had it. */
  const lastScale = useRef(scaleMode)
  useEffect(() => {
    camera.far = farPlane(scaleMode)
    camera.updateProjectionMatrix()

    const previous = lastScale.current
    lastScale.current = scaleMode
    if (previous === scaleMode) return

    const controls = controlsRef.current
    const planet = getBody(useStore.getState().selectedId)

    if (planet && controls) {
      // Parked at a planet: the shot is framed on the *planet*, so the offset
      // from it should scale with the planet, not with the system. The follow
      // loop carries camera and target together by the planet's own movement
      // next frame, so all that is needed here is the right stand-off distance.
      //
      // Framing a satellite system is the exception, and it needs its own
      // ratio: moon distances run on a different curve from body radii — over
      // the full dial the Moon's orbit grows about 90x while Earth's globe
      // grows 350x — so the planet's ratio would leave the system either burst
      // out of frame or lost in the middle of it.
      const framing =
        useStore.getState().systemId === planet.id
          ? (scale) => systemFramingDistance(planet, systemMoonsOf(planet.id), camera, scale)
          : (scale) => bodyRadius(planet, scale)

      const ratio = framing(scaleMode) / framing(previous)
      camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target)
      return
    }

    // Out at the overview. The warp is not a uniform scaling — between the two
    // extremes Earth's orbit grows 3x while Neptune's grows 18x — so there is
    // no ratio that holds every distance. The home distance is the right one to
    // preserve, since that is what frames the system as a whole.
    const ratio = cameraLimits(scaleMode).homeDistance / cameraLimits(previous).homeDistance
    camera.position.multiplyScalar(ratio)
    if (controls) controls.target.multiplyScalar(ratio)
  }, [camera, scaleMode])

  /* --- Manual input cancels the current flight --- */
  useEffect(() => {
    const el = gl.domElement
    const cancel = () => {
      if (flight.current.active) {
        flight.current.active = false
        // If we were mid-flight to a planet, start following from here so the
        // handoff doesn't jump.
        const planet = getBody(useStore.getState().selectedId)
        if (planet) {
          const p = planetPositions.get(planet.id)
          if (p) {
            lastFollow.current.copy(p)
            following.current = planet.id
          }
        }
      }
    }
    el.addEventListener('pointerdown', cancel)
    return () => el.removeEventListener('pointerdown', cancel)
  }, [gl])

  /* --- One wheel direction, one meaning ---
   *
   * three's OrbitControls zooms *in* on `deltaY < 0`, which is the convention
   * everywhere in 3D. The trouble is that `deltaY < 0` is also the direction
   * that scrolls a page *up*. So one physical gesture meant "go deeper" to the
   * camera and "back out" to the document, and the seam showed exactly where
   * the two meet: scroll up out of the dossier, then keep going to pull away
   * from the planet, and you had to reverse the wheel mid-gesture.
   *
   * There is no arrangement in which both keep their own convention — the app
   * is a scrolling document with a 3D scene in it, and the axis has to mean one
   * thing. So the scene defers to the document: the direction that scrolls the
   * page down also moves the camera in.
   *
   * Done by flipping the event rather than by reimplementing dolly, so
   * OrbitControls keeps its own damping and momentum. The capture listener
   * takes the event before the bubble-phase listeners (OrbitControls' own, and
   * the snap-focus one below), stops it, and sends an identical one back with
   * `deltaY` negated. Everything downstream then reads a consistent sign — the
   * snap-focus test included, which is why it needs no flip of its own.
   *
   * Listening on the *stage* rather than the canvas, which is the other half of
   * the same idea. The canvas is only the part of the first screen with nothing
   * drawn over it: the bottom ~140px is the timeline, and there are controls in
   * every corner. A wheel over any of them missed this handler entirely, so the
   * page crept down a few pixels — enough to put `viewScroll.p` above zero,
   * which stands the camera's zoom down and hands the wheel to the document.
   * The result was a small unasked-for scroll and a wheel that had stopped
   * zooming, from nothing more than where the cursor happened to be resting.
   *
   * The whole hero screen is the scene, so the whole hero screen zooms.
   */
  useEffect(() => {
    const canvas = gl.domElement
    // The chrome is a sibling layer over the canvas, not a descendant of it, so
    // the listener has to sit on their common ancestor to see both.
    const stage = canvas.closest('.stage') ?? canvas

    const invert = (event) => {
      // The clone, coming back around. Without this it would flip forever.
      if (event.__inverted) return

      // Trackpad pinch arrives as a wheel with ctrl held, and pinch already
      // agrees with itself — out is out. Inverting it would be a second bug.
      if (event.ctrlKey) return

      /*
       * A panel that owns the wheel, ahead of everything else.
       *
       * Ahead of the `viewScroll` hand-off in particular: once the dossier is on
       * screen that branch gives every wheel to the page, and a wheel over the
       * nav would scroll the document out from under the list being read.
       */
      const owner = wheelOwner(event.clientX, event.clientY)
      if (owner) {
        scrollPanel(owner, event.clientX, event.clientY, event.deltaX, event.deltaY)
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }

      // Past the hero the wheel belongs to the page, and OrbitControls has
      // already stood down (`enableZoom` below). Calling `preventDefault` here
      // would stop the page scrolling — the very thing being handed over.
      if (viewScroll.p > 0) return

      // A control that genuinely scrolls keeps its own wheel — the body
      // switcher scrolls sideways on a narrow window, and taking that away to
      // zoom instead would be this bug over again with the axes swapped.
      if (scrollsItself(event.target, stage, event.deltaX, event.deltaY)) return

      /*
       * The camera has the wheel, so the page is done — but it may be a fraction
       * of a pixel short of the top, which is inside the deadzone `p` uses and
       * therefore invisible to it. Left there it would hold the dossier a hair
       * up the screen for as long as the user keeps zooming.
       */
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' })

      event.preventDefault()
      event.stopImmediatePropagation()

      const clone = new WheelEvent('wheel', {
        deltaX: event.deltaX,
        deltaY: -event.deltaY,
        deltaZ: event.deltaZ,
        deltaMode: event.deltaMode,
        // Kept from the original even when the wheel came from a control: the
        // snap-focus ray is fired through the cursor, and the cursor really is
        // over that point of the scene — the timeline is simply in front of it.
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        bubbles: true,
        cancelable: true,
      })
      clone.__inverted = true
      // Always on the canvas, wherever the original landed, so OrbitControls
      // and the snap-focus handler below see every wheel on the first screen.
      canvas.dispatchEvent(clone)
    }

    stage.addEventListener('wheel', invert, { capture: true, passive: false })
    return () => stage.removeEventListener('wheel', invert, { capture: true })
  }, [gl])

  /* --- Scroll-to-focus --- */
  useEffect(() => {
    const el = gl.domElement

    const onWheel = (event) => {
      // Past the hero the wheel is the page's, not the camera's — see the
      // `enableZoom` line in the frame callback for the other half of this.
      if (viewScroll.p > 0) return

      const zoomingIn = event.deltaY < 0
      const state = useStore.getState()
      const now = performance.now()

      // Cancel an in-flight animation — the user is taking over.
      if (flight.current.active) flight.current.active = false

      if (now - lastSnapAt.current < SNAP_COOLDOWN_MS) return

      if (zoomingIn && !state.selectedId) {
        // Fire a ray through the cursor and look for a planet close to it.
        // Zooming "toward what you're pointing at" is far more intuitive than
        // using the camera's forward axis, which always aims at the Sun.
        raycaster.setFromCamera(pointer, camera)
        const ray = raycaster.ray

        let best = null
        let bestCos = SNAP_CONE_COS

        for (const planet of BODIES) {
          // A switched-off class is not there to be flown to. Its last known
          // position is still in the map — the entry outlives the component —
          // so without this the camera would happily snap onto an invisible
          // moon that stopped moving several minutes ago.
          //
          // `bodyShown` rather than the two class tests this used to do, so a
          // satellite of a hidden parent is excluded too. That case was worse
          // here than anywhere: Pluto's moons sat at the world origin, dead
          // centre of the overview, so zooming in near the Sun could snap the
          // camera onto one of them and then *follow* it — the camera pinned to a
          // body that isn't drawn, holding its framing distance against the
          // wheel while everything else carried on moving.
          if (!bodyShown(planet, state.layers)) continue

          /*
           * Spacecraft are never acquired by the wheel.
           *
           * They are metres across, and `bodyRadius` floors them at the same
           * rendered size as a small moon so that they can be seen at all — so
           * the angular test below passes for a four-metre probe exactly as it
           * does for a real body. With the layer on, zooming anywhere through
           * the inner system would snap onto whichever craft happened to be near
           * the cursor and then *follow* it. A spacecraft moves fast, so the
           * camera would hold station on it and the planets would slide across
           * the screen — the camera looking wrong when it was the target that
           * had changed.
           *
           * The angular size is a lie told for visibility, and this is where
           * believing it does damage. Spacecraft are reached deliberately, from
           * the nav bar or by clicking one, which is also how Eyes treats them.
           */
          if (planet.kind === 'spacecraft') continue

          const pos = planetPositions.get(planet.id)
          if (!pos) continue

          const toPlanet = new THREE.Vector3().subVectors(pos, camera.position)
          const distance = toPlanet.length()
          // Guarding the divide below, not expressing a policy — the policy is
          // the angular test two lines down. An absolute length here meant that
          // at true scale every minor moon was closer than the guard and got
          // skipped, so the wheel could not snap onto the one being aimed at.
          if (distance < degenerateLength(state.scaleMode)) continue

          // Only acquire once the planet is big enough on screen to be worth
          // looking at. Angular size rather than a distance in world units: it
          // means the same thing at every scale, and it is what the user is
          // actually judging.
          const radius = bodyRadius(planet, state.scaleMode)
          if (angularSizeDeg(radius, distance) < SNAP_ACQUIRE_DEG) continue

          const cos = toPlanet.divideScalar(distance).dot(ray.direction)
          if (cos > bestCos) {
            bestCos = cos
            best = planet
          }
        }

        if (best) {
          lastSnapAt.current = now
          state.selectPlanet(best.id)
        }
        return
      }

      if (!zoomingIn && state.selectedId) {
        // Release once the camera has pulled back several times further than the
        // shot parks — see `SNAP_RELEASE_FACTOR`. Release is *closer* than
        // acquire, which is what stops the two fighting; the old pair was
        // inverted (acquire within 38 units, release beyond 30) and only the
        // cooldown was stopping them from chattering.
        const planet = getBody(state.selectedId)
        const pos = planetPositions.get(state.selectedId)
        if (!planet || !pos) return
        const parked = parkDistance(planet, state.scaleMode)
        if (camera.position.distanceTo(pos) > parked * SNAP_RELEASE_FACTOR) {
          lastSnapAt.current = now
          following.current = null
          // Tells the selection effect that this came from the wheel, so it
          // leaves the camera alone instead of flying to the overview.
          wheelRelease.current = true
          state.clearSelection()
        }
      }
    }

    el.addEventListener('wheel', onWheel, { passive: true })
    return () => el.removeEventListener('wheel', onWheel)
  }, [gl, camera, raycaster, pointer])

  /* --- No projection offset any more ---
     There used to be a `setViewOffset` here, sliding the whole scene 200px left
     whenever a body was selected on desktop. It was not a framing choice: the
     info panel covered the right 400px of the window, so a planet centred in the
     viewport was centred behind the panel, and shifting the *projection* dodged
     it without fighting OrbitControls' orbit-around-target model.

     The dossier moved below the fold and took the panel with it. The offset
     survived the move and became the bug it had been the fix for — a planet
     thrown 200px off-centre in a viewport with nothing in the way. Nothing
     replaces it: the scene owns the whole window now, so centred is centred. */

  /* --- Per-frame camera work --- */
  useFrame((_, delta) => {
    const controls = controlsRef.current
    if (!controls) return

    const dt = Math.min(delta, 0.1)

    /*
     * Arm before anything else looks at the selection.
     *
     * This is the whole point of arming here rather than in an effect: on the
     * frame a click lands, the flight is set up first, so the branches below
     * never see a selected body with no flight and never fall through to the
     * follow. See `armFlight`.
     */
    const store = useStore.getState()
    const key = `${store.selectedId}|${store.systemId}|${store.flightNonce}`
    if (armed.current !== key) {
      // Latched only when a flight was actually armed. `armFlight` returns false
      // when the selected body has no position yet — a mission selected outside
      // its window — and that has to be retried, not remembered as done.
      if (armFlight(store.selectedId, store.systemId, controls) !== false) {
        armed.current = key
      }
    }

    const selected = store.selectedId
    const planet = getBody(selected)
    const planetPos = planet ? planetPositions.get(planet.id) : null

    if (flight.current.active) {
      /*
       * The clock the ease runs on.
       *
       * `dt` rather than raw `delta` so a stalled frame — a texture decode, the
       * tab coming back — advances the trip by at most 0.1 s instead of
       * teleporting it to the end. That is the one way a fixed-duration ease can
       * still produce a cut, and it is worth spending a slightly long flight to
       * avoid.
       */
      flight.current.elapsed += dt

      /*
       * Keep the destination current, because it may not have been knowable when
       * the flight was armed.
       *
       * `parkDistance` reads the mesh's published radius, and that radius is a
       * function of the frame the craft is *currently* in — a spacecraft is
       * drawn in its planet's inflated frame near that planet and in the Sun's
       * out in the cruise, and the two differ by more than an order of
       * magnitude. `armFlight` samples it once, on the frame the selection
       * lands, and if the frame resolves a frame later the trip keeps flying to
       * a distance computed for the wrong one.
       *
       * Measured on Cassini, which is the case that exposed it: reaching it
       * through the nav parks at 1.800e-2, the Sun frame's floor, while clicking
       * it in the scene parks at 2.298e-2, Saturn's. Same craft, same code, two
       * answers, decided by which frame happened to be resolved at arm time.
       *
       * Recomputing is a Map lookup and a multiply, so it costs nothing to do it
       * every frame of a flight that lasts two seconds. The direction and the
       * ease are untouched — only how far along it the trip is aiming.
       */
      // Not while framing a system: that distance comes from the system's own
      // width via `systemFramingDistance`, and is not a park at all.
      if (planet && !store.systemId) {
        flight.current.distance = parkDistance(planet, store.scaleMode)
      }

      if (planet && planetPos) {
        desiredPos.current.copy(flight.current.dir).multiplyScalar(flight.current.distance)

        // `lastFollow` is carried by the flight as well as by the follow, so
        // handing over between them needs no resynchronisation.
        //
        // There is no arrival tolerance any more, and that is the quiet win of
        // easing over damping: the trip *ends*, exactly on its endpoint, instead
        // of approaching it forever and needing a threshold to call it done. The
        // old one was a fraction of the parking distance and had a long history
        // of being wrong at one scale or the other.
        const arrived = stepFlightToPlanetEased({
          cameraPos: camera.position,
          target: controls.target,
          planetPos,
          lastPlanetPos: lastFollow.current,
          fromOffset: flight.current.fromOffset,
          fromTargetOffset: flight.current.fromTargetOffset,
          desiredOffset: desiredPos.current,
          elapsed: flight.current.elapsed,
          duration: FLIGHT_SECONDS,
        })

        /*
         * The flight's own error term, for the verifier. Dev only.
         *
         * Recorded here rather than sampled from outside because a separate
         * `requestAnimationFrame` is not guaranteed to run on the same side of
         * r3f's frame every time, and an occasional read that straddles the
         * update looks exactly like the camera being moved by something else.
         * That is the one failure this quantity exists to detect, so it cannot
         * be measured with a method that manufactures it.
         */
        if (import.meta.env.DEV) {
          flight.current.error = _errorScratch
            .subVectors(camera.position, planetPos)
            .distanceTo(desiredPos.current)
        }

        if (arrived) {
          flight.current.active = false
          following.current = planet.id
        }
      } else if (
        stepFlightHomeEased({
          cameraPos: camera.position,
          target: controls.target,
          fromPos: flight.current.fromPos,
          fromTarget: flight.current.fromTarget,
          homePos,
          elapsed: flight.current.elapsed,
          duration: FLIGHT_SECONDS,
        })
      ) {
        flight.current.active = false
      }
    } else if (planet && planetPos) {
      /*
       * Re-sync rather than carry, whenever this is not the body the follow was
       * locked to. Covers the frame after a selection changes, and any other
       * route into here that skipped the effect.
       */
      if (following.current !== planet.id) {
        lastFollow.current.copy(planetPos)
        following.current = planet.id
      }

      /*
       * --- Riding along ---
       *
       * A follow keeps the craft centred while the world stays the right way
       * up. A ride keeps the *craft* the right way up: turn to point an
       * instrument and the stars wheel past, which is the thing a spacecraft
       * actually does and the one view this app could not show.
       *
       * The whole of it is one line of geometry — carry the camera through the
       * craft's rotation as well as its translation. `stepFollow` already
       * carries the translation, so riding is the same idea applied to the
       * other half of a rigid motion: take the rotation the craft has made
       * since the last frame, and apply it to the camera's offset from the
       * craft and to the pivot's.
       *
       * Done as a *delta* rather than by rebuilding the offset in body
       * coordinates every frame, so a drag stays exactly where the user left
       * it. The camera keeps whatever angle they chose; it is the frame that
       * angle is measured in that turns. OrbitControls never learns about any
       * of this, which is why its damping and its zoom keep working.
       */
      const riding = useStore.getState().rideAlong
      const attitude = riding ? getAttitude(planet.id) : null
      if (attitude) {
        if (ridden.current !== planet.id) {
          // First frame of a ride: no rotation has happened yet, so seed the
          // reference. Without this the camera would be swung by the craft's
          // whole absolute attitude on the frame the ride is switched on.
          rideFrom.current.copy(attitude)
          ridden.current = planet.id
        }
        // delta = now * before⁻¹, the world rotation made since the last frame.
        rideDelta.current.copy(rideFrom.current).invert().premultiply(attitude)
        rideFrom.current.copy(attitude)

        rideScratch.current.subVectors(camera.position, planetPos).applyQuaternion(rideDelta.current)
        camera.position.addVectors(planetPos, rideScratch.current)
        rideScratch.current.subVectors(controls.target, planetPos).applyQuaternion(rideDelta.current)
        controls.target.addVectors(planetPos, rideScratch.current)
      } else {
        ridden.current = null
      }

      stepFollow({
        cameraPos: camera.position,
        target: controls.target,
        planetPos,
        lastFollow: lastFollow.current,
        recentreLambda: RECENTRE_LAMBDA,
        dt,
        deadzone: degenerateLength(useStore.getState().scaleMode),
      })
    } else {
      // Nothing selected and no flight: the camera and its pivot are the user's
      // outright. Deliberately nothing here moves either of them — see the
      // wheel-release branch in the selection effect for why the pivot is left
      // wherever the gesture left it.
      following.current = null
    }

    /*
     * The wheel belongs to the page once the dossier is on screen.
     *
     * OrbitControls calls `preventDefault()` on every wheel it handles — that
     * is what zoom is — so with it enabled the page simply cannot scroll while
     * the cursor is over the canvas. Since the split view deliberately leaves
     * the scene showing beside the text, that would be most of the window.
     *
     * Rotate and pan go with it, for a different reason: past the hero the
     * block below owns the camera's angle and distance outright, so a drag
     * would be overwritten on the very next frame. Disabling them makes that
     * honest — the scene simply does not respond — rather than leaving the
     * user pushing against something that silently springs back.
     *
     * Set here rather than as props so it costs no render: this is read from a
     * plain object, not from React state.
     */
    const interactive = viewScroll.p <= 0
    controls.enableZoom = interactive
    controls.enableRotate = interactive
    controls.enablePan = interactive

    /*
     * --- Framing for the split view ---
     *
     * How big the body looks on the right was whatever distance the user
     * happened to leave the camera at: fly in close and it overflowed the
     * frame, hang back and it was a dot beside a page of text. The size of the
     * subject in a designed layout should not be a side effect of the last
     * gesture before scrolling.
     *
     * The same went for the angle. Whatever the last drag left — edge-on,
     * looking up from underneath, staring into the night side — was the
     * portrait you got, because this only moved the camera along the line it
     * was already on. So both are eased now, on the same 0..1 the shot slides
     * right on: the distance toward the framing above, and the direction toward
     * `framingDirection` — front-lit and tilted to show some of the pole, the
     * same shot the arrival flight aims for.
     *
     * It reverses exactly. `restDistance` and `restDir` are refreshed every
     * frame the page is at the top, so scrolling back up returns to the camera
     * they chose rather than to a canned one. And because the whole thing is a
     * lerp on scroll position rather than an animation, it is reversible
     * mid-gesture: scroll half way down and back and the camera is where it
     * started.
     *
     * The orientation is slerped, not lerped: interpolating two directions
     * component-wise sends the camera through the inside of the sphere when
     * they are far apart, and slows it in the middle when they are not.
     *
     * Guarded on a live flight, which owns the distance until it lands. The two
     * agree closely enough that the handover does not show — a flight parks at
     * `FOCUS_RADII`, which is the distance `SPLIT_FRAME_FRACTION` was derived
     * from.
     */
    const p = viewScroll.p
    /*
     * The split framing is suspended while riding.
     *
     * It rewrites `camera.position` from `controls.target` along its own
     * direction and distance, which is exactly the thing a ride is holding on
     * to: one scroll of the dossier and the camera would be yanked out to a
     * framing distance and lose the craft's frame entirely. The dossier still
     * opens and still slides the shot aside — that is `setViewOffset` in
     * `Scene`, a projection shift, and it leaves the camera where it is.
     */
    if (planet && planetPos && !flight.current.active && ridden.current === null) {
      const offset = framingScratch.current.subVectors(camera.position, controls.target)
      const current = offset.length()

      const degenerate = degenerateLength(useStore.getState().scaleMode)
      if (p <= 0) {
        restDistance.current = current
        if (current > degenerate) {
          restDir.current.copy(offset).divideScalar(current)
          framingDirection(planetPos, restDir.current, shotDir.current)
        }
      } else if (current > degenerate) {
        const rings = planet.rings ? RING_PRESETS[planet.rings] : null
        const framed = THREE.MathUtils.clamp(
          splitFramingDistance({
            radius: bodyRadius(planet, useStore.getState().scaleMode),
            ringOuter: rings ? rings.outer : 1,
            fovDegrees: camera.fov,
            aspect: camera.aspect,
          }),
          nearLimit,
          limits.maxDistance,
        )
        const from = restDistance.current > 0 ? restDistance.current : current

        // The shortest rotation taking the user's viewpoint to the shot, taken
        // a fraction `p` of the way.
        turnTo.current.setFromUnitVectors(restDir.current, shotDir.current)
        turn.current.identity().slerp(turnTo.current, p)
        dirScratch.current.copy(restDir.current).applyQuaternion(turn.current)

        camera.position
          .copy(controls.target)
          .addScaledVector(dirScratch.current, THREE.MathUtils.lerp(from, framed, p))
      }
    }

    /*
     * The near plane, resized to where the camera now is.
     *
     * Per frame rather than per scale change because it depends on the zoom,
     * which changes continuously. `nearPlane` explains the reasoning; the short
     * version is that a plane pinned to the smallest body in the app spends
     * depth resolution the distant geometry needs, and the orbit lines come out
     * dashed.
     *
     * Guarded on a relative change so the projection matrix is not rebuilt for
     * sub-pixel camera drift. A tenth of a decade is far finer than anything
     * visible and still lets a zoom follow smoothly.
     */
    const focusDist = camera.position.distanceTo(controls.target)
    const wantNear = nearPlane(useStore.getState().scaleMode, focusDist)
    if (wantNear > 0 && Math.abs(Math.log(wantNear / camera.near)) > 0.1) {
      camera.near = wantNear
      camera.updateProjectionMatrix()
    }

    controls.update()
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.62}
      zoomSpeed={0.9}
      // Panning is on: with it disabled the view could only pivot around a
      // fixed point, which is what made free movement impossible. Right-drag
      // (or two fingers) now slides the camera through the scene, and
      // screen-space panning keeps that motion parallel to the screen instead
      // of to the ground plane, which is what feels like flying.
      enablePan
      panSpeed={0.85}
      screenSpacePanning
      minDistance={nearLimit}
      maxDistance={limits.maxDistance}
      // Just shy of the poles, so the view can look almost straight down the
      // orbital plane without the azimuth flipping as it crosses over.
      minPolarAngle={0.02}
      maxPolarAngle={Math.PI - 0.02}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  )
}
