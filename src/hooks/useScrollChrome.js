import { useEffect } from 'react'
import { viewScroll } from '../store/useStore'

/**
 * How far down the first screen the chrome has fully handed over.
 *
 * As a fraction of the viewport height, so it scales with the window rather
 * than being a pixel count that means one thing on a laptop and another on a
 * 27-inch display. 0.45 puts the handover a little before the dossier's top
 * edge reaches the middle of the screen — early enough that the timeline is
 * gone before the reading arrives under it, late enough that a small
 * exploratory scroll does not blank the controls.
 */
const HANDOVER = 0.45

/**
 * Below this width the shot stays centred.
 *
 * The split view needs somewhere for a column of text to go *beside* the
 * planet. On a phone there is nowhere, so the dossier stacks and the planet
 * keeps the middle of the frame with the reading laid over it. Matches the
 * `max-width: 900px` breakpoint in `InfoPanel.css` — the two have to agree or
 * the shot would slide aside with no column to make room for.
 */
const SPLIT_MIN_WIDTH = 901

/**
 * Treat the page as being at the top within this many pixels of it.
 *
 * `viewScroll.p` is not only a number the shot is interpolated by — every
 * "whose gesture is this" test in `CameraController` reads `p > 0` — so a
 * fractional `scrollY` left behind by a trackpad or a fling would leave `p` at
 * something like 1e-6: the page owning a wheel it has nowhere to spend, with the
 * camera's zoom switched off waiting for a zero that never quite arrives. A
 * pixel of deadzone makes the handover land exactly.
 */
const TOP_DEADZONE = 1

/** Ease at both ends, so the shot does not start and stop dead. */
const smoothstep = (t) => t * t * (3 - 2 * t)

/**
 * Fades the scene's chrome out as the dossier rises over it.
 *
 * The stage is sticky, so the scene itself never leaves — but the controls
 * pinned to its edges would otherwise sit on top of the reading, and the
 * timeline in particular runs the full width of exactly the edge the dossier
 * arrives from. Scrolling down is a statement that you are done with the scene
 * for the moment, so the chrome goes with the gesture.
 *
 * Two channels, because they are two different problems. `--chrome` is the
 * opacity and wants to be continuous, so the controls dissolve rather than
 * blink. `is-scrolled` is a hard switch that takes the layer out of hit
 * testing: an invisible timeline is still a timeline as far as the pointer is
 * concerned, and it would eat every click along the bottom of the dossier.
 *
 * Written straight to the DOM rather than held in React state. This fires on
 * every scroll event, and a `setState` per event would re-render the entire UI
 * tree for a number that only ever feeds two style properties.
 */
export function useScrollChrome(ref) {
  useEffect(() => {
    const node = ref.current
    if (!node) return

    let scrolled = false

    const update = () => {
      const top = window.scrollY <= TOP_DEADZONE ? 0 : window.scrollY
      const distance = Math.max(1, window.innerHeight * HANDOVER)
      const progress = Math.min(1, top / distance)

      node.style.setProperty('--chrome', String(1 - progress))

      /*
       * The framing runs over a whole viewport, not the chrome's 45%.
       *
       * They are two different jobs on one gesture: the controls should be out
       * of the way early, while the shot should still be travelling when the
       * split view arrives flush at the top of the screen — that is what makes
       * the planet look like it moved *into* the layout rather than having
       * already been parked there waiting.
       */
      const framing = Math.min(1, top / Math.max(1, window.innerHeight))
      viewScroll.p =
        window.innerWidth >= SPLIT_MIN_WIDTH ? smoothstep(framing) : 0

      // Only touched when it changes: `classList.toggle` with the same value is
      // cheap but not free, and this runs at scroll frequency.
      const next = progress >= 1
      if (next !== scrolled) {
        scrolled = next
        node.classList.toggle('is-scrolled', next)
      }
    }

    update()
    // Passive: this never calls `preventDefault`, and saying so lets the
    // browser scroll without waiting to find out.
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [ref])
}
