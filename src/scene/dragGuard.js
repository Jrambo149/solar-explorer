/**
 * Tells a click apart from the end of a drag.
 *
 * React Three Fiber synthesises `onClick` from a pointerup on the object that
 * was under the cursor — it does not care how far the pointer travelled in
 * between. That makes every orbit gesture end in a click: releasing over empty
 * space hit the scene's background catcher and cleared the selection, which
 * flew the camera back to the overview. From the user's side the view simply
 * "resets" the moment you let go.
 *
 * So we watch the raw pointer ourselves and let scene handlers ask whether the
 * gesture that just ended was a drag.
 *
 * Ordering note: R3F listens on the canvas element, and the move/up listeners
 * here are on `window`. A pointerup on the canvas reaches R3F's handler (and
 * therefore fires onClick) before it bubbles up to window, so the flag is still
 * set to the correct value when the click handler reads it.
 */

/** Total pointer travel, in CSS pixels, past which the gesture is a drag. */
const DRAG_THRESHOLD = 5

let origin = null
let dragged = false

/** True if the gesture that just ended moved far enough to count as a drag. */
export function wasDragged() {
  return dragged
}

/** Wires the guard to a canvas. Returns the teardown. */
export function attachDragGuard(element) {
  const onDown = (event) => {
    origin = { x: event.clientX, y: event.clientY }
    dragged = false
  }

  const onMove = (event) => {
    if (!origin || dragged) return
    // Manhattan distance — cheaper than a hypot and plenty for a threshold.
    const travel = Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y)
    if (travel > DRAG_THRESHOLD) dragged = true
  }

  const onUp = () => {
    origin = null
  }

  element.addEventListener('pointerdown', onDown)
  // On window, not the canvas: a drag that leaves the canvas still has to be
  // tracked, or letting go outside would read as a click.
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)

  return () => {
    element.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
}
