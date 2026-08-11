import { useEffect, useRef, useState } from 'react'
import { getBody, majorMoonsOf } from '../data/bodies'
import { useStore } from '../store/useStore'
import { useBodyName } from './useBodyName'
import { hasPole } from '../scene/pole'
import { cancelGlide, glideTo } from './glideTo'
import './InfoPanel.css'

/**
 * Rows are skipped when the body has nothing to put in them, rather than
 * printed empty.
 *
 * Moons are why. They have no `dayLength` — every one here is tidally locked,
 * so its day *is* its year and stating both would be saying the same number
 * twice — and "Moons: 0" on Europa is noise. The `distance` label likewise
 * cannot be "from Sun" any more: a moon's distance is quoted from its planet,
 * and the values themselves already name it.
 */
const FACT_ROWS = [
  ['Diameter', 'diameter'],
  ['Mass', 'mass'],
  ['Distance', 'distance'],
  ['Length of day', 'dayLength'],
  ['Axial tilt', 'axialTilt'],
  ['Length of year', 'yearLength'],
  ['Moons', 'moons'],
  ['Avg. temperature', 'temperature'],
]

/**
 * Axial tilt is shown only where the app actually knows which way the axis
 * points, which is a narrower claim than having a number for it.
 *
 * Every body in the registry carries an `axialTilt`, and for most of them it is
 * a placeholder zero — every moon, every comet, Eris, Makemake. Printing
 * "Axial tilt: 0°" on Europa would state as a measurement what is really an
 * absence of one, and it is the kind of wrong that is impossible to spot,
 * because zero is a perfectly plausible answer.
 *
 * So the row appears for exactly the bodies in `BODY_POLES` — the ones with a
 * published IAU pole, which are the ones this scene orients from a real
 * direction rather than leaving upright. See `scene/pole.js`.
 */
const formatTilt = (degrees) => `${degrees}°`

/** What sits above the name: class, and for a moon, whose moon it is. */
function eyebrowFor(body) {
  if (body.kind === 'moon') return `Moon of ${getBody(body.parent)?.name ?? body.parent}`
  if (body.kind === 'dwarf') return 'Dwarf planet'
  // The designation, which is more informative than the word "comet" and avoids
  // asserting it: 1I/2017 U1 never grew a coma and whether it was a comet at all
  // is still argued over. The prefix says what is actually known — an `I`
  // designation means it came from outside the solar system.
  if (body.kind === 'comet') return body.designation
  // Without this a spacecraft falls through to the planet line and is announced
  // as "Planet undefined" — `order` is a planet's place from the Sun and a
  // probe has none.
  if (body.kind === 'spacecraft') return 'Spacecraft'
  return `Planet ${body.order}`
}

/**
 * Content that blurs into focus as it arrives, and back out as it leaves.
 *
 * The defocus is doing real work rather than decorating: the split view has no
 * panel behind it, so the text sits directly on the scene, and something
 * arriving *out of focus* reads as depth — as copy resolving in front of the
 * planet rather than a label switched on over it.
 *
 * An IntersectionObserver rather than a scroll-linked animation. CSS
 * `animation-timeline: view()` would tie it to scroll position exactly, which
 * is what the source material does, but it is Chromium-only — a class toggle
 * and a transition reverse just as correctly when you scroll back up, and work
 * everywhere.
 */
function Reveal({ className = '', threshold = 0.25, children }) {
  const ref = useRef(null)
  /*
   * `armed` is the fail-safe, and it is not decoration.
   *
   * The hidden state is what the transition animates *from*, so if the observer
   * never reported, content styled hidden by default would simply never appear
   * — an invisible page, which is a far worse outcome than a missing flourish.
   * So the element starts plainly visible and only becomes hideable once a
   * callback has actually arrived, proving the mechanism works. Nothing here
   * can leave the dossier blank.
   *
   * Not a hypothetical: IntersectionObserver delivers during the rendering
   * steps, and a document that is never rendered never gets a callback.
   */
  const [state, setState] = useState({ armed: false, shown: false })

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => setState({ armed: true, shown: entry.isIntersecting }),
      { threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return (
    <div
      ref={ref}
      className={`reveal${state.armed ? ' is-armed' : ''}${state.shown ? ' is-in' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * The dossier: everything about the selected body, below the scene.
 *
 * It used to be a panel pinned to the right edge, and the trouble with that was
 * arithmetic. A 400px column took a third of the window away from the thing the
 * app is for, and everything else on screen had to be told about it — the
 * timeline, the nav bar, the planet title and the camera itself each carried a
 * rule insetting them by the panel's width.
 *
 * So it became a page. Two screens, and they are different in kind:
 *
 *  1. The split. No background at all: the scene shows through, the shot has
 *     slid right (see `ViewFraming`), and the body's name and description sit
 *     in the space that opened on the left. The planet you flew to is *in* the
 *     layout rather than behind it.
 *  2. The rest. Facts, moons and links, on a proper surface, full width, where
 *     a table can be a table.
 *
 * Mounted only when something is selected, which is also what makes the
 * document scrollable at all — with nothing selected the page is exactly one
 * viewport tall and behaves as it always did.
 */
export default function InfoPanel() {
  const selectedId = useStore((s) => s.selectedId)
  const clearSelection = useStore((s) => s.clearSelection)
  const selectPlanet = useStore((s) => s.selectPlanet)
  const planet = getBody(selectedId)
  const name = useBodyName(planet)

  /*
   * Switching bodies takes you back to the top.
   *
   * Without this, choosing Mars from halfway down Jupiter's page leaves you
   * halfway down Mars's — reading its fun facts while the camera flies
   * somewhere you cannot see. The jump is instant rather than smooth: this is
   * a change of subject, not a movement within one, and gliding a thousand
   * pixels through content that has already been replaced is just noise.
   *
   * `'instant'` rather than `'auto'`, and the difference is not cosmetic here:
   * `'auto'` defers to the element's CSS `scroll-behavior`, which is `smooth`
   * on the root, so it would have done the exact glide this is avoiding.
   */
  const previous = useRef(selectedId)
  useEffect(() => {
    if (selectedId === previous.current) return
    previous.current = selectedId
    // Any glide in flight belongs to the body you just left.
    cancelGlide()
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [selectedId])

  if (!planet) return null

  return (
    <section className="dossier" aria-label={`${name} details`}>
      {/* Keyed by body so every reveal replays on a switch. */}
      <div key={planet.id}>
        {/* ---- screen one: the split ---- */}
        <div className="dossier__split">
          <Reveal className="dossier__lede">
            <p className="dossier__eyebrow">{eyebrowFor(planet)}</p>
            <h2 className="dossier__title">{name}</h2>
            <span className="dossier__rule" />
            <p className="dossier__description">{planet.description}</p>
            {planet.surfaceNote && <p className="dossier__surface-note">{planet.surfaceNote}</p>}

            {/* A button rather than an `href="#dossier-facts"` anchor: a
                native jump would use the root's `scroll-behavior: smooth` and
                arrive in a fixed ~300ms, which is a different gesture from the
                one that brought you here. Both cues share `glideTo`. */}
            <button
              type="button"
              className="dossier__cue"
              onClick={() => glideTo(window.innerHeight * 2)}
            >
              <span>Key facts</span>
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
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
          </Reveal>
        </div>

        {/* ---- screen two: the rest, on a surface ---- */}
        <div className="dossier__more">
          <div className="dossier__inner">
            <div className="dossier__bar">
              <p className="dossier__bar-name">{name}</p>
              <button
                type="button"
                className="dossier__back"
                onClick={() => {
                  cancelGlide()
                  window.scrollTo({ top: 0, behavior: 'instant' })
                  clearSelection()
                }}
              >
                Back to the solar system
              </button>
            </div>

            <div className="dossier__columns">
              <Reveal className="dossier__column">
                <section className="dossier__section">
                  <h3 className="dossier__section-title">Key facts</h3>
                  <dl className="fact-grid">
                    {FACT_ROWS.filter(
                      ([, key]) =>
                        planet[key] !== undefined &&
                        !(key === 'moons' && planet.kind === 'moon') &&
                        !(key === 'axialTilt' && !hasPole(planet.id)),
                    ).map(([label, key]) => (
                      <div className="fact-grid__row" key={key}>
                        <dt>{label}</dt>
                        <dd>{key === 'axialTilt' ? formatTilt(planet[key]) : planet[key]}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="dossier__section">
                  <h3 className="dossier__section-title">Atmosphere</h3>
                  <p className="dossier__atmosphere">{planet.atmosphere}</p>
                </section>
              </Reveal>

              <Reveal className="dossier__column">
                <section className="dossier__section">
                  <h3 className="dossier__section-title">Fun facts</h3>
                  <ul className="dossier__facts">
                    {(planet.facts ?? []).map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </section>

                {/* The moons this body has *in the scene*, as links — the way
                    to get from Jupiter to Callisto without hunting along the
                    nav bar. Distinct from the "Moons" count above, which is how
                    many are known: Jupiter says 95 there and lists four here. */}
                {majorMoonsOf(planet.id).length > 0 && (
                  <section className="dossier__section">
                    <h3 className="dossier__section-title">Moons in view</h3>
                    <div className="dossier__moon-links">
                      {majorMoonsOf(planet.id).map((moon) => (
                        <button
                          key={moon.id}
                          type="button"
                          className="dossier__moon-link"
                          onClick={() => selectPlanet(moon.id)}
                        >
                          {moon.name}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section className="dossier__section">
                  <h3 className="dossier__section-title">Explore further</h3>
                  <div className="dossier__links">
                    {(planet.nasaLinks ?? []).map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="dossier__link"
                      >
                        <span>{link.label}</span>
                        <svg
                          viewBox="0 0 16 16"
                          width="12"
                          height="12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M6 3h7v7M13 3L4 12" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </section>
              </Reveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
