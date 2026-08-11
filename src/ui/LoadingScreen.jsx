import { useStore } from '../store/useStore'
import './LoadingScreen.css'

/**
 * Full-screen loading overlay.
 *
 * Deliberately *not* driven by AnimatePresence: this overlay covers the entire
 * UI, so its removal must never depend on an animation-completion callback
 * firing. It stays mounted and fades out via a plain CSS transition, with
 * `pointer-events: none` and `visibility: hidden` once it's done — so even if
 * the fade never runs, the app underneath is fully usable.
 */
export default function LoadingScreen() {
  const loaded = useStore((s) => s.loaded)
  const progress = useStore((s) => s.progress)
  const pct = Math.round(progress * 100)

  return (
    <div className={`loading${loaded ? ' is-done' : ''}`} aria-hidden={loaded}>
      <div className="loading__inner">
        <div className="loading__mark" aria-hidden="true">
          <span className="loading__orbit" />
          <span className="loading__star" />
        </div>

        <h1 className="loading__title">Solar Explorer</h1>
        <p className="loading__subtitle">Charting the neighbourhood…</p>

        <div
          className="loading__track"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Loading planet textures"
        >
          <div className="loading__fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="loading__pct">{pct}%</div>
      </div>
    </div>
  )
}
