import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getBody } from '../data/bodies'
import { useStore } from '../store/useStore'
import { useAmbientAudio } from '../hooks/useAmbientAudio'
import './Controls.css'

function IconButton({ label, active, onClick, children }) {
  return (
    <button
      type="button"
      className={`ctrl-btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

/* Inline SVGs keep the app free of icon-font or image dependencies. */
const Icon = {
  layers: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M8 1.8l6 3.1-6 3.1-6-3.1z" />
      <path d="M2 8.4l6 3.1 6-3.1" />
      <path d="M2 11.5l6 3.1 6-3.1" />
    </svg>
  ),
  bloom: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <circle cx="8" cy="8" r="2.7" />
      <path d="M8 1v1.8M8 13.2V15M1 8h1.8M13.2 8H15M3.1 3.1l1.3 1.3M11.6 11.6l1.3 1.3M12.9 3.1l-1.3 1.3M4.4 11.6l-1.3 1.3" />
    </svg>
  ),
  soundOn: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6H2v4h2l3.2 2.6V3.4z" fill="currentColor" />
      <path d="M10.4 5.8a3 3 0 0 1 0 4.4M12.5 3.9a5.8 5.8 0 0 1 0 8.2" />
    </svg>
  ),
  soundOff: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M4 6H2v4h2l3.2 2.6V3.4z" fill="currentColor" />
      <path d="M10.4 6.2l3.4 3.6M13.8 6.2l-3.4 3.6" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.4 10.4L14.2 14.2" />
    </svg>
  ),
  /* A craft seen from behind and above: the shot the ride puts you in. */
  ride: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.6l2.4 4.1-2.4 1.5-2.4-1.5z" />
      <path d="M5.6 6.7L2.4 8.6M10.4 6.7l3.2 1.9" />
      <path d="M8 8.2v5.2M6.3 12l1.7 1.5 1.7-1.5" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 3.5L5 8l4.5 4.5" />
    </svg>
  ),
}

export default function Controls() {
  const searchOpen = useStore((s) => s.searchOpen)
  const toggleSearch = useStore((s) => s.toggleSearch)
  const panelOpen = useStore((s) => s.panelOpen)
  const togglePanel = useStore((s) => s.togglePanel)
  const bloom = useStore((s) => s.bloom)
  const toggleBloom = useStore((s) => s.toggleBloom)
  const musicOn = useStore((s) => s.musicOn)
  const toggleMusic = useStore((s) => s.toggleMusic)
  const selectedId = useStore((s) => s.selectedId)
  const clearSelection = useStore((s) => s.clearSelection)
  const rideAlong = useStore((s) => s.rideAlong)
  const toggleRide = useStore((s) => s.toggleRide)

  useAmbientAudio(musicOn)

  /*
   * Only a spacecraft has an attitude to ride, so the control only exists while
   * one is selected. The store refuses the toggle for anything else anyway —
   * this is so the capsule does not carry a button that would do nothing.
   */
  const isCraft = getBody(selectedId)?.kind === 'spacecraft'

  /*
   * `R` for ride. Its own listener rather than a line in `LayerPanel`'s table,
   * which is for the visibility layers; this is a camera mode. Same guards as
   * that table keeps: no modifiers, and nothing while a field has the focus.
   */
  useEffect(() => {
    if (!isCraft) return undefined
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 'r' || e.key === 'R') toggleRide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isCraft, toggleRide])

  return (
    <>
      {/* One glass capsule holding borderless buttons, rather than four
          separate slabs — a single continuous surface is what makes it read
          as glass rather than as chrome. */}
      <div className="controls glass">
        {/* First in the capsule because it is the only one that goes somewhere;
            the other three change how the scene is drawn. The palette is
            keyboard-first — `/` or ⌘K — and this is what makes it findable by
            someone who never presses either. */}
        <IconButton label="Find a body  ( / )" active={searchOpen} onClick={toggleSearch}>
          {Icon.search}
        </IconButton>

        {isCraft && (
          <IconButton label="Ride along  ( R )" active={rideAlong} onClick={toggleRide}>
            {Icon.ride}
          </IconButton>
        )}

        <IconButton label="Layers and scale" active={panelOpen} onClick={togglePanel}>
          {Icon.layers}
        </IconButton>

        <IconButton label="Toggle sun glow" active={bloom} onClick={toggleBloom}>
          {Icon.bloom}
        </IconButton>

        <IconButton
          label={musicOn ? 'Mute ambient sound' : 'Play ambient sound'}
          active={musicOn}
          onClick={toggleMusic}
        >
          {musicOn ? Icon.soundOn : Icon.soundOff}
        </IconButton>
      </div>

      <AnimatePresence>
        {selectedId && (
          <motion.button
            type="button"
            className="back-btn glass"
            onClick={clearSelection}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            {Icon.back}
            <span>Back to Solar System</span>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}
