import { AnimatePresence, motion } from 'framer-motion'
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
  back: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 3.5L5 8l4.5 4.5" />
    </svg>
  ),
}

export default function Controls() {
  const panelOpen = useStore((s) => s.panelOpen)
  const togglePanel = useStore((s) => s.togglePanel)
  const bloom = useStore((s) => s.bloom)
  const toggleBloom = useStore((s) => s.toggleBloom)
  const musicOn = useStore((s) => s.musicOn)
  const toggleMusic = useStore((s) => s.toggleMusic)
  const selectedId = useStore((s) => s.selectedId)
  const clearSelection = useStore((s) => s.clearSelection)

  useAmbientAudio(musicOn)

  return (
    <>
      {/* One glass capsule holding borderless buttons, rather than four
          separate slabs — a single continuous surface is what makes it read
          as glass rather than as chrome. */}
      <div className="controls glass">
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
