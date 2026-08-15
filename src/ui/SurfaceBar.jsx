import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BODIES_BY_ID } from '../data/bodies'
import { compassPoint } from '../scene/horizon'
import { useStore } from '../store/useStore'
import './SurfaceBar.css'

/**
 * Where you are standing, which way you are facing, and the way back up.
 *
 * The surface view is the only mode in the app with no visible controls of its
 * own, and it needs three things said out loud:
 *
 *  - **Where.** A view of the sky is the same view from anywhere on a small
 *    world; what makes it *this* place is the label.
 *  - **Which way.** From the ground a heading is the difference between the sky
 *    making sense and not. Given as a compass point and degrees, because "SW"
 *    is what a person thinks in and "237°" is what they would check.
 *  - **How to leave**, since dragging no longer flies anywhere and there is
 *    nothing on screen to click.
 *
 * The scale note is here rather than in the layer panel because standing up
 * *moved the dial* — the app changed a setting the user had chosen, and saying
 * so where they can see it is the least it owes them. See `standOn`.
 */

const format = (lat, lon) => {
  const ns = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`
  // East longitude, as everything else in this app quotes it.
  const ew = `${(((lon % 360) + 360) % 360).toFixed(1)}°E`
  return `${ns} ${ew}`
}

export default function SurfaceBar() {
  const surface = useStore((s) => s.surface)
  const leaveSurface = useStore((s) => s.leaveSurface)

  /* Escape leaves, which is the one key everybody tries. Registered only while
     standing, so it cannot shadow the search palette's own Escape. */
  useEffect(() => {
    if (!surface) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') leaveSurface()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [surface, leaveSurface])

  const body = surface ? BODIES_BY_ID[surface.body] : null

  return (
    <AnimatePresence>
      {surface && (
        <motion.div
          className="surface-bar glass"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.28 }}
        >
          <div className="surface-bar__where">
            <span className="surface-bar__label">Standing on</span>
            <span className="surface-bar__place">
              {surface.name ?? format(surface.lat, surface.lon)}
              {body && <em className="surface-bar__body">{body.name}</em>}
            </span>
          </div>

          <div className="surface-bar__facing">
            <span className="surface-bar__label">Facing</span>
            <span className="surface-bar__heading">
              {compassPoint(surface.azimuth)}
              {/* Wrapped into 0–359, because the stored heading is not.

                  Nothing keeps it in range: a drag westward from north takes it
                  negative and a few turns eastward take it past 720, since both
                  the drag and the swing toward a constellation work in *change*
                  from where you were looking — which is what makes them
                  continuous, and what stops a turn from 350° to 10° going the
                  long way round. A bearing on screen has no such excuse.
                  `compassPoint` has always wrapped; the number beside it did
                  not, and would read "−99° SE". */}
              <em>{Math.round(((surface.azimuth % 360) + 360) % 360)}°</em>
            </span>
          </div>

          <button type="button" className="surface-bar__leave" onClick={leaveSurface}>
            Back to orbit
            <kbd>esc</kbd>
          </button>

          {/* Said plainly, because the app moved a control the user had set.
              It is also the reason the view is worth anything: at any other
              setting the Moon over your head is the wrong size. */}
          <p className="surface-bar__note">
            Drag to look around · scroll to zoom · at true scale, so the sky is
            the size it really is
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
