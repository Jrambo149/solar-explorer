import { memo, useCallback, useMemo, useRef } from 'react'
import { BODIES, bodyShown } from '../data/bodies'
import { useClassLayers } from '../hooks/useClassLayers'
import { registerLabelNode } from '../scene/labelRegistry'
import { useStore } from '../store/useStore'
import { useBodyName } from './useBodyName'
import { playSelectSound } from '../hooks/useAmbientAudio'
import './LabelLayer.css'

/**
 * One body's marker: an icon, a name, or both.
 *
 * Rendered once and then left alone — `LabelProjector` moves it every frame by
 * writing `transform` directly. Nothing in here re-renders as the scene moves,
 * which is the entire point of the design; React only gets involved when a
 * toggle changes or the selection does.
 */
/**
 * The spacecraft glyph: a hollow hexagon, drawn at the craft.
 *
 * A different shape from the natural bodies' ring on purpose, and the purpose is
 * Eyes'. A probe is not a small world — it is a made thing, it is the only class
 * here whose mesh you can fly right up to, and at any wider framing it is far
 * under a pixel. Giving it its own mark means a hexagon in the distance reads as
 * "spacecraft" before the name is legible, which a second ring would not.
 *
 * SVG rather than a `clip-path` because this is an outline. `clip-path` cuts a
 * filled box to a shape and has no notion of a stroke, so a hollow hexagon would
 * need two stacked clipped boxes sized to fake a border — and the inner one
 * would have to be opaque, which defeats the reason the ring is hollow: at this
 * size the marker would hide the very thing it points at.
 *
 * `vector-effect` keeps the stroke a hairline under the hover scale, so the
 * outline does not thicken as it grows.
 */
function HexIcon() {
  return (
    <svg className="marker__hex" viewBox="0 0 12 14" aria-hidden="true">
      <polygon
        points="6,0.6 11.4,3.8 11.4,10.2 6,13.4 0.6,10.2 0.6,3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

const Marker = memo(function Marker({ planet, showLabel, showIcon }) {
  const selectPlanet = useStore((s) => s.selectPlanet)
  const setHovered = useStore((s) => s.setHovered)
  const isCraft = planet.kind === 'spacecraft'
  const name = useBodyName(planet)

  const onClick = useCallback(() => {
    playSelectSound()
    selectPlanet(planet.id)
  }, [planet.id, selectPlanet])

  return (
    <button
      type="button"
      ref={(node) => registerLabelNode(planet.id, node)}
      className={isCraft ? 'marker marker--craft' : 'marker'}
      // Starts hidden. The projector reveals it on the first frame, once it
      // knows where the body actually is — otherwise every label would flash
      // at the top-left corner for a frame on mount.
      style={{ visibility: 'hidden' }}
      onClick={onClick}
      onPointerEnter={() => setHovered(planet.id)}
      onPointerLeave={() => setHovered(null)}
      aria-label={`Go to ${name}`}
    >
      {showIcon && (isCraft ? <HexIcon /> : <span className="marker__icon" aria-hidden="true" />)}
      {showLabel && <span className="marker__name">{name}</span>}
    </button>
  )
})

/**
 * Names and markers drawn over the scene.
 *
 * These are what keep a body reachable once it stops being a meaningful number
 * of pixels. At true scale Earth is four thousandths of a world unit across; at
 * any zoom that fits its orbit there is nothing on screen to aim at, and without
 * a marker the planet is simply gone. The icon is the hit target that the
 * geometry can no longer provide.
 */
/**
 * Hands a wheel event over a marker back to the canvas.
 *
 * Markers are DOM buttons pinned on top of the bodies they name, and they have
 * to take pointer events or they could not be clicked. The side effect was that
 * they took the *wheel* too: OrbitControls listens on the canvas, a marker sits
 * in the overlay beside it rather than inside it, and a wheel event bubbles up
 * to the document without ever passing through the canvas on the way. So the
 * zoom died wherever you pointed at a planet — precisely where you were most
 * likely to be pointing.
 *
 * There is no CSS for "take clicks but not scroll", so the event is forwarded.
 * The canvas is not inside the label layer, so the copy cannot bubble back here
 * and start a loop.
 *
 * Forwarding rather than suppressing also fixes something else quietly: the
 * scroll-to-focus handler in `CameraController` fires a ray through the cursor
 * to find what you are zooming toward, and it too had never once seen a wheel
 * event aimed straight at a planet's marker.
 */
function forwardWheelToCanvas(event, canvasRef) {
  const canvas =
    canvasRef.current ??
    (canvasRef.current = document.querySelector('.scene-layer canvas'))
  if (!canvas) return

  canvas.dispatchEvent(
    new WheelEvent('wheel', {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      deltaMode: event.deltaMode,
      clientX: event.clientX,
      clientY: event.clientY,
      // Trackpad pinch arrives as a wheel with ctrl held; dropping it here
      // would turn a pinch into a scroll.
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      bubbles: true,
      cancelable: true,
    }),
  )
}

export default function LabelLayer() {
  const canvasRef = useRef(null)
  const labels = useStore((s) => s.layers.labels)
  const icons = useStore((s) => s.layers.icons)
  const classLayers = useClassLayers()

  // Has to mirror the filter in `Scene`, and not merely for tidiness: a hidden
  // body stops updating its entry in `planetPositions`, but the entry is still
  // there holding wherever it was when it vanished. A marker left behind would
  // sit frozen in space, naming something that is no longer drawn.
  //
  // Shared with `Scene` through `bodyShown` rather than repeated, which is how
  // the two came apart: both had this same predicate written out by hand, and
  // neither dropped a satellite whose parent was hidden. Pluto's moons were
  // therefore labelled at the origin as well as drawn there.
  const bodies = useMemo(
    () => BODIES.filter((body) => bodyShown(body, classLayers)),
    [classLayers],
  )

  if (!labels && !icons) return null

  return (
    // Caught on the container rather than on each marker: wheel events bubble,
    // and one listener is cheaper than thirty-eight.
    <div className="label-layer" onWheel={(event) => forwardWheelToCanvas(event, canvasRef)}>
      {bodies.map((body) => (
        <Marker key={body.id} planet={body} showLabel={labels} showIcon={icons} />
      ))}
    </div>
  )
}
