/**
 * How long a guided move down the page takes.
 *
 * Native `scroll-behavior: smooth` was the first attempt and it is genuinely
 * animated — it just runs to a fixed ~300ms whatever the distance, so a full
 * viewport of travel arrives as a snap. A wheel covers a screen in about a
 * second; this is an unhurried version of that, which reads as the page handing
 * over rather than jumping.
 */
const DURATION = 1200

/** Ease in and out, cubic — slow at both ends, quick through the middle. */
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

let frame = 0

/** Abandon any glide in progress. */
export function cancelGlide() {
  cancelAnimationFrame(frame)
}

/**
 * Scroll the page to `top` at a deliberate, human pace.
 *
 * Shared by every control that moves the reader down a screen — the "More
 * about ___" button on the scene and the "Key facts" cue in the dossier — so
 * the two feel like the same gesture rather than two different ones.
 *
 * Returns nothing and is safe to call again mid-flight: the module keeps a
 * single frame handle, so a second call replaces the first instead of two
 * tweens fighting over `scrollY`.
 */
export function glideTo(top) {
  cancelGlide()

  const from = window.scrollY
  const distance = top - from
  if (Math.abs(distance) < 1) return

  // Same preference the CSS honours, checked here because this tween does not
  // go through `scroll-behavior` at all.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo({ top, behavior: 'instant' })
    return
  }

  /*
   * Hand back the moment the user takes over.
   *
   * A tween still running while someone is scrolling themselves is just two
   * things fighting over the same number. `wheel` is passive here: this only
   * ever cancels, it never blocks.
   */
  const stop = () => {
    cancelGlide()
    detach()
  }
  const detach = () => {
    window.removeEventListener('wheel', stop)
    window.removeEventListener('touchstart', stop)
    window.removeEventListener('keydown', stop)
  }
  window.addEventListener('wheel', stop, { passive: true })
  window.addEventListener('touchstart', stop, { passive: true })
  window.addEventListener('keydown', stop)

  const started = performance.now()

  const step = (now) => {
    const t = Math.min(1, (now - started) / DURATION)
    // `instant` on every step, or the root's `scroll-behavior: smooth` would
    // smooth each individual hop of a tween that is already smooth — the two
    // easings compound into a drift that overshoots the end of the gesture.
    window.scrollTo({ top: from + distance * ease(t), behavior: 'instant' })
    if (t < 1) frame = requestAnimationFrame(step)
    else detach()
  }

  frame = requestAnimationFrame(step)
}
