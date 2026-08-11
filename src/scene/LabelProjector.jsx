import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { BODIES, BODIES_BY_ID, bodyRadius } from '../data/bodies'
import { warpSunRadius } from '../orbit/frames'
import { planetPositions, useStore } from '../store/useStore'
import { labelNodes } from './labelRegistry'

const _world = new THREE.Vector3()
const _ndc = new THREE.Vector3()
const _toBody = new THREE.Vector3()
const _toSun = new THREE.Vector3()

/** Don't rewrite a transform for sub-pixel movement. */
const MOVE_EPSILON = 0.4

/** Above this on-screen radius in pixels, the body speaks for itself. */
const ICON_HIDE_RADIUS = 13

/**
 * How far a moon must sit from its planet, in pixels, before it gets a marker.
 *
 * Without this the overview is unreadable. Measured at the default zoom, every
 * moon lands within 16px of its planet — the Moon 6px from Earth, Deimos 1px
 * from Mars — so the scene would open with twenty-five names piled on top of six
 * planets and Pluto, and the pile is the first thing you would see. Saturn alone
 * would stack seven, and Pluto's five land inside a handful of pixels of each
 * other.
 *
 * The rule is the honest one: a moon earns a label once it is far enough from
 * its planet to be told apart from it. That is also how you actually use the
 * thing — you fly to Jupiter, and its moons resolve and name themselves as you
 * arrive. 30px is roughly where the marker ring stops overlapping its parent's.
 */
const MOON_SEPARATION_PX = 30

/**
 * How far past the edge a marker may sit before it is hidden.
 *
 * Not zero, because the name is drawn beside the dot rather than on it: a body
 * a little way off the right edge still has a readable name pointing at where
 * it is, and popping that away exactly at the boundary would be worse than
 * letting it run off. Wide enough for the name, and no wider.
 */
const OFFSCREEN_MARGIN_PX = 120

/**
 * How far in from the edge a pinned spacecraft marker sits, in pixels.
 *
 * Wide enough that the hexagon and its name are wholly on screen rather than
 * half-cropped, since a clipped mark reads as a rendering fault rather than as a
 * deliberate signal.
 */
const PIN_INSET_PX = 74

/**
 * Pins a point to the edge of the viewport along the direction it lies in.
 *
 * A ray-box intersection from the centre rather than a per-axis clamp, and the
 * difference is the whole value of it: clamping x and y independently drags a
 * marker along one edge and then the other, so two craft in quite different
 * directions can land in the same corner. Along the ray the mark stays on the
 * true bearing, so its position on the rim tells you which way to turn.
 */
function pinToEdge(x, y, width, height, out) {
  const cx = width / 2
  const cy = height / 2
  const dx = x - cx
  const dy = y - cy
  const length = Math.hypot(dx, dy)
  if (length < 1e-3) return false

  const halfW = Math.max(cx - PIN_INSET_PX, 1)
  const halfH = Math.max(cy - PIN_INSET_PX, 1)
  const t = Math.min(halfW / Math.abs(dx || 1e-6), halfH / Math.abs(dy || 1e-6))

  out.x = cx + dx * t
  out.y = cy + dy * t
  return true
}

const _pinned = { x: 0, y: 0 }

/**
 * The box a name occupies, in pixels, for the crowding test below.
 *
 * Deliberately a fixed size rather than the node's measured width: reading
 * `offsetWidth` for three hundred and fifty markers every frame would force a
 * layout pass per body, which is the exact cost this whole projector is built to
 * avoid. 84px is a little over the mean name length at the label's font size, so
 * short names reserve slightly too much room and long ones slightly too little.
 * Erring wide is the right way round — it drops a borderline label rather than
 * letting two overlap.
 */
const NAME_W = 84
const NAME_H = 16

/**
 * Priority for the crowding test: which name survives when two collide.
 *
 * Static, and computed once. It could be sorted by on-screen size instead, which
 * sounds better and is much worse — the order would change as the camera moved,
 * so two labels fighting over the same spot would swap every few frames and both
 * would flicker. A fixed order means the winner is always the same body, so a
 * label that is showing stays showing.
 *
 * Planets first, then dwarf planets, then the moons that are places, then the
 * rest. Within a rank, the larger body wins, which is stable because a radius
 * does not change.
 */
const PRIORITY = new Map(
  [...BODIES]
    .sort((a, b) => {
      const rank = (body) =>
        body.kind === 'planet'
          ? 0
          : body.kind === 'dwarf'
            ? 1
            : // Spacecraft rank below every natural body. They are the smallest
              // things here by a wide margin and there are 63 of them, so when
              // labels compete for room a probe should never crowd out a moon.
              body.kind === 'spacecraft'
              ? 4
              : body.tier === 'minor'
                ? 3
                : 2
      return rank(a) - rank(b) || b.radiusKm - a.radiusKm
    })
    .map((body, index) => [body.id, index]),
)

/** Bodies in the order the crowding test resolves them. */
const BODIES_BY_PRIORITY = [...BODIES].sort(
  (a, b) => PRIORITY.get(a.id) - PRIORITY.get(b.id),
)

/**
 * Claimed label space for this frame, as a coarse grid.
 *
 * A name is drawn only if its box is clear of every name already placed. Testing
 * each against all the others would be 60,000 comparisons a frame at this body
 * count; bucketing into cells the size of one label makes it a handful of
 * lookups each, and the grid is cleared rather than reallocated.
 *
 * Saturn is why this exists. Two hundred and seventy-eight of its moons sit
 * inside a couple of hundred pixels at the overview, and every one of them was
 * drawing its name — a solid block of overlapping text with the planet somewhere
 * underneath it.
 */
const claimed = new Set()

const claimKey = (cx, cy) => cx * 100000 + cy

function nameFits(x, y) {
  const cx0 = Math.floor((x - NAME_W / 2) / NAME_W)
  const cx1 = Math.floor((x + NAME_W / 2) / NAME_W)
  const cy0 = Math.floor((y - NAME_H / 2) / NAME_H)
  const cy1 = Math.floor((y + NAME_H / 2) / NAME_H)

  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      if (claimed.has(claimKey(cx, cy))) return false
    }
  }
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) claimed.add(claimKey(cx, cy))
  }
  return true
}

/** Screen positions written this frame, so satellites can find their parents. */
const screenX = new Map()
const screenY = new Map()

/**
 * Values written last frame, so unchanged nodes can be skipped entirely.
 *
 * Keyed by the *node*, not the body id, and that is the whole point. Turning
 * both layers off unmounts every marker; turning them back on mounts new ones,
 * which start at `visibility: hidden` and hold no transform. A cache keyed by id
 * would survive that and report the body as already visible and already placed,
 * so the guards below would skip all three writes and the marker would stay
 * invisible for good. A new node simply has no entry here.
 */
const written = new WeakMap()

/** The memo slot for a node, created on first sight. */
function slotFor(node) {
  let slot = written.get(node)
  if (!slot) {
    slot = { x: NaN, y: NaN, radius: -1, visible: null, crowded: null, pinned: null, flipped: null }
    written.set(node, slot)
  }
  return slot
}

/**
 * Projects every body to screen space and positions its DOM label.
 *
 * Lives inside the Canvas because that is where the camera is, but touches no
 * React state — it writes directly to the nodes the overlay registered. A
 * `setState` here would re-render the label list every frame, which is exactly
 * the cost this design exists to avoid.
 */
export default function LabelProjector() {
  const { camera, size } = useThree()

  useFrame(() => {
    const { layers, selectedId, scaleMode } = useStore.getState()
    const showAny = layers.labels || layers.icons

    // Distance at which a sphere of radius r covers the full viewport height,
    // used below to convert a world radius into a screen radius.
    const focalPx = size.height / (2 * Math.tan((camera.fov * Math.PI) / 360))
    const sunRadius = warpSunRadius(scaleMode)
    const cameraToSun = camera.position.length()
    claimed.clear()

    /*
     * Whether an off-screen spacecraft gets pinned to the rim this frame.
     *
     * Only while another spacecraft is the focus, and the restriction is what
     * keeps this from being clutter. Measured at the parked framing, a craft's
     * neighbours sit 27.6° and 42.1° off the view axis against a frustum of
     * 27.5° by 39.8° — so they are barely outside it, and whether any of them is
     * on screen comes down to which way the camera happened to arrive. That is
     * the case worth rescuing: you are among a group of craft and cannot tell
     * where the others are.
     *
     * At the overview it would be the opposite of useful. Every craft in the
     * fleet is off screen there in some direction, so pinning would ring the
     * viewport with hexagons that never go away and name things a whole solar
     * system distant.
     */
    const focus = selectedId ? BODIES_BY_ID[selectedId] : null
    const pinCraft = focus?.kind === 'spacecraft'

    /*
     * Priority order, not registry order, and the swap is safe: the ranking puts
     * planets and dwarf planets ahead of every moon, so a parent is still always
     * written before the satellites that read its position below.
     */
    for (const planet of BODIES_BY_PRIORITY) {
      const node = labelNodes.get(planet.id)
      if (!node) continue
      const slot = slotFor(node)

      /*
       * No position: hide the marker rather than leaving it where it was.
       *
       * This used to be a bare `continue`, which skipped the write at the bottom
       * of the loop and left the node holding its last visibility *and* its last
       * transform. That was harmless while the only bodies without a position
       * were ones that had never had one — a new node starts hidden, so nothing
       * showed.
       *
       * It stopped being harmless when the roster gained missions that end.
       * Scrub from today back to 1995 and every craft launched since is no
       * longer flying, so its entry disappears from the registry — and its
       * marker froze mid-air at whatever screen position it held a moment
       * earlier. Mars Express, Lucy and Parker were all labelled around Jupiter
       * during the Galileo Probe's descent, their names overprinting each other
       * because the crowding pass had stopped running for them too.
       *
       * It is the same hazard the filter in `LabelLayer` documents for a hidden
       * *layer*; a mission outside its window is the case that comment does not
       * reach.
       */
      const position = planetPositions.get(planet.id)
      if (!position) {
        if (slot.visible !== false) {
          slot.visible = false
          node.style.visibility = 'hidden'
        }
        continue
      }

      // The projection runs for every body, even ones that will not be
      // labelled. A hidden planet is still a moon's parent, and the separation
      // test below needs its screen position — flying to Jupiter hides
      // Jupiter's own label, and without this its four moons would then be
      // comparing themselves against a position from some earlier frame.
      _toBody.subVectors(position, camera.position)
      const distance = _toBody.length()
      _ndc.copy(position).project(camera)

      // The marker is anchored on the body itself, not above it: the icon is a
      // *marker*, so it has to sit where the thing is. The name is pushed clear
      // of the disc in CSS, using the radius published below.
      const x = (_ndc.x * 0.5 + 0.5) * size.width
      const y = (-_ndc.y * 0.5 + 0.5) * size.height

      // Primaries come first in `BODIES`, so a parent's entry is always written
      // before its satellites are read.
      screenX.set(planet.id, x)
      screenY.set(planet.id, y)

      let visible = showAny

      // The focused body has the big PlanetTitle over it already; a second name
      // tag beside it is just clutter.
      if (visible && planet.id === selectedId) visible = false

      /*
       * Where this marker is actually drawn, which is the body's own position
       * unless it gets pinned to the rim below.
       *
       * Separate from `x`/`y` on purpose: those two are published to
       * `screenX`/`screenY` for the moon-separation test, and that test is about
       * where bodies *are*. Feeding it a pinned position would have a craft at
       * the edge of the frame suppressing the label of whatever real body its
       * marker happened to land on.
       */
      let drawX = x
      let drawY = y
      let pinned = false

      const canPin = pinCraft && planet.kind === 'spacecraft' && planet.id !== selectedId

      if (visible) {
        // z > 1 means behind the camera, where `project` mirrors the point
        // through the origin and would place the label on the wrong side.
        if (_ndc.z > 1) {
          /*
           * Behind the camera. The mirroring is recoverable rather than fatal:
           * the perspective divide flips the sign of both NDC axes for a point
           * with negative w, so reflecting the projected point back through the
           * centre of the screen recovers the true bearing. That is enough to
           * pin it on the correct side, which is all a rim marker needs.
           */
          if (canPin) {
            pinned = pinToEdge(
              size.width - x,
              size.height - y,
              size.width,
              size.height,
              _pinned,
            )
            if (pinned) {
              drawX = _pinned.x
              drawY = _pinned.y
            } else {
              visible = false
            }
          } else {
            visible = false
          }
        } else if (
          canPin &&
          (x < PIN_INSET_PX ||
            x > size.width - PIN_INSET_PX ||
            y < PIN_INSET_PX ||
            y > size.height - PIN_INSET_PX)
        ) {
          // Outside the inset box but in front: pin it, rather than let it slide
          // off and vanish. The threshold is the inset itself so a marker moves
          // continuously onto the rim instead of jumping there from the edge.
          pinned = pinToEdge(x, y, size.width, size.height, _pinned)
          if (pinned) {
            drawX = _pinned.x
            drawY = _pinned.y
          }
        } else if (
          x < -OFFSCREEN_MARGIN_PX ||
          x > size.width + OFFSCREEN_MARGIN_PX ||
          y < -OFFSCREEN_MARGIN_PX ||
          y > size.height + OFFSCREEN_MARGIN_PX
        ) {
          /*
           * Off the edge of the screen, which until the comets arrived never
           * really happened.
           *
           * Being in front of the camera was treated as enough, so a body
           * outside the frustum still got a transform and stayed visible —
           * `translate3d(-6421px, 4526px, 0)` for NEOWISE in one measured
           * frame. Every other body in the app sits in a compact region, so
           * the labels only ever drifted a little past the edge. A comet on a
           * hyperbolic path spans a hundred AU, and zooming throws its label
           * thousands of pixels out.
           *
           * That leaves fragments of text behind on screen: the marker is
           * promoted to its own compositor layer by `translate3d`, and moving
           * one that far in a frame gives the compositor a layer far outside
           * the viewport to rasterise, which it does not always repaint
           * cleanly. What is left is a trail of half-erased names — four
           * pieces of "SIDING SPRING" scattered down the left of the frame,
           * none of them a real element and none of them findable in the DOM.
           *
           * Hiding is also simply correct: a label for something nowhere near
           * the screen is not information.
           */
          visible = false
        } else {
          // Occlusion by the Sun. Only the Sun is worth testing: it is by far
          // the largest thing in the scene and sits at the exact centre, so it
          // is the one object that routinely swallows a planet whole. Testing
          // every body against every other would be a raycast per label per
          // frame for a case that almost never arises.
          if (cameraToSun < distance) {
            _toSun.copy(camera.position).negate()
            // Perpendicular distance from the Sun's centre to the line of sight.
            const along = _toSun.dot(_toBody) / distance
            const perpSq = _toSun.lengthSq() - along * along
            if (along > 0 && perpSq < sunRadius * sunRadius) visible = false
          }
        }

        if (visible && planet.parent) {
          const px = screenX.get(planet.parent)
          const py = screenY.get(planet.parent)
          if (px !== undefined && Math.hypot(x - px, y - py) < MOON_SEPARATION_PX) {
            visible = false
          }
        }

        if (visible) {
          const screenRadius = (bodyRadius(planet, scaleMode) / distance) * focalPx

          if (
            !(
              Math.abs(slot.x - drawX) <= MOVE_EPSILON &&
              Math.abs(slot.y - drawY) <= MOVE_EPSILON
            )
          ) {
            slot.x = drawX
            slot.y = drawY
            // translate3d keeps this on the compositor; `left`/`top` would
            // force a layout pass for every body on every frame.
            node.style.transform = `translate3d(${drawX}px, ${drawY}px, 0)`
          }

          if (slot.pinned !== pinned) {
            slot.pinned = pinned
            node.classList.toggle('is-pinned', pinned)
          }

          /*
           * Which side the name sits on.
           *
           * A craft's name is drawn to the right of its hexagon, which is right
           * everywhere except the one place this feature puts it: pinned against
           * the right-hand rim, the name is the part that runs off. Flipping it
           * inboard is the only way the mark stays wholly on screen, and it is
           * also the readable one — the text then points back into the view
           * rather than out of it.
           */
          const flipped = pinned && drawX > size.width / 2
          if (slot.flipped !== flipped) {
            slot.flipped = flipped
            node.classList.toggle('is-flipped', flipped)
          }

          const rounded = Math.round(Math.min(screenRadius, 400))
          if (slot.radius !== rounded) {
            slot.radius = rounded
            node.style.setProperty('--body-radius', `${rounded}px`)
            // Once the planet is comfortably visible in its own right, the ring
            // stops helping and starts sitting on its face. The label stays.
            node.classList.toggle('is-large', rounded > ICON_HIDE_RADIUS)
          }

          /*
           * The name yields where there is no room for it; the icon does not.
           * Dropping the whole marker would take the body's hit target with it,
           * and in a crowd the dots are the useful part — they show the shape of
           * the swarm, and each one is still clickable and still names itself on
           * hover. Only the text is at stake.
           */
          const crowded = layers.labels && !nameFits(drawX, drawY)
          if (slot.crowded !== crowded) {
            slot.crowded = crowded
            node.classList.toggle('is-crowded', crowded)
          }
        }
      }

      /*
       * A hidden marker keeps no state it is no longer maintaining.
       *
       * Everything above is written inside `if (visible)`, so a marker that goes
       * invisible keeps whatever classes it had when it last drew. `is-pinned`
       * is the one that matters: back out of a spacecraft to the overview and
       * pinning stops — `canPin` is false with nothing selected — but the four
       * craft that were on the rim were still carrying the class, invisibly,
       * indefinitely.
       *
       * Nothing was on screen, so nothing looked wrong. It is the same shape as
       * the bug that left Cassini's position in the registry after it stopped
       * flying: a value that means "this is how the marker is being drawn"
       * outliving the drawing, waiting for something to read it as current.
       */
      if (!visible && slot.pinned) {
        slot.pinned = false
        slot.flipped = false
        node.classList.remove('is-pinned', 'is-flipped')
      }

      if (slot.visible !== visible) {
        slot.visible = visible
        node.style.visibility = visible ? 'visible' : 'hidden'
      }
    }
  })

  return null
}
