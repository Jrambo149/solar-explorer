import { useEffect } from 'react'
import { getBody } from '../data/bodies'
import { useStore } from '../store/useStore'
import { useBodyName } from './useBodyName'
import { cancelGlide, glideTo } from './glideTo'
import './ScrollHint.css'

/**
 * The way down to the dossier.
 *
 * Needed because the obvious gesture does not work here, and could not be made
 * to. `OrbitControls` binds the wheel on the canvas and calls
 * `preventDefault()` on it — that is what zoom *is* — so a wheel over the scene
 * moves the camera and never the page. There is no arrangement in which one
 * wheel event does both.
 *
 * So the first move down is a click. After that the ordinary gesture takes
 * over: the dossier covers the viewport, the pointer is over page content, and
 * `CameraController` has handed the wheel back for as long as the page is
 * scrolled at all.
 */
export default function ScrollHint() {
  const selectedId = useStore((s) => s.selectedId)
  const planet = getBody(selectedId)
  const name = useBodyName(planet)

  // A glide left running after unmount would go on scrolling a page whose
  // content has gone.
  useEffect(() => cancelGlide, [])

  if (!planet) return null

  return (
    <button
      type="button"
      className="scroll-hint"
      onClick={() => glideTo(window.innerHeight)}
    >
      <span className="scroll-hint__label">More about {name}</span>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M8 3.5v9M4 8.5l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
