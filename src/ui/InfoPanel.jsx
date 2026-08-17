import { useEffect, useRef } from 'react'
import { getBody, majorMoonsOf } from '../data/bodies'
import { useStore } from '../store/useStore'
import { useBodyName } from './useBodyName'
import { hasPole } from '../scene/pole'
import { PLANET_IMAGES } from '../data/planetImages'
import { derivedFacts } from './planetFacts'
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

  const derived = derivedFacts(planet)
  const gallery = PLANET_IMAGES[planet.id] ?? []

  return (
    <section className="dossier" aria-label={`${name} details`}>
      {/* Keyed by body so every reveal replays on a switch. */}
      <div key={planet.id}>
        {/* ---- screen one: the split ---- */}
        <div className="dossier__split">
          <div className="dossier__lede">
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
          </div>
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

            {/*
              The long read, above the two columns and across the full width.

              A column of prose set beside a column of numbers turns both into
              a form: the eye starts comparing rows that have nothing to do
              with each other. This is the part meant to be *read*, so it gets
              its own measure — capped near 68 characters a line, which is
              where continuous text stops being comfortable.
            */}
            {planet.story?.length > 0 && (
              <div className="dossier__story-wrap">
                <section className="dossier__section">
                  {planet.story.map((paragraph) => (
                    <p className="dossier__story" key={paragraph.slice(0, 40)}>
                      {paragraph}
                    </p>
                  ))}
                </section>
              </div>
            )}

            <div className="dossier__columns">
              <div className="dossier__column">
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

                {/*
                  Worked out rather than written down — see `planetFacts`.
                  Everything here comes from the mass, radius and orbit the app
                  already carries, which is what makes it both free to add and
                  impossible to let drift out of step with the rest of the file.

                  It answers a different question from the table above it too.
                  "Mass: 6.42 × 10²³ kg" is a number nobody has intuition for;
                  "you would weigh 38% of what you weigh here" is the same
                  number, answered.
                */}
                {derived && (
                  <section className="dossier__section">
                    <h3 className="dossier__section-title">By the numbers</h3>
                    <dl className="derived-grid">
                      {derived.map((row) => (
                        <div className="derived-grid__row" key={row.label}>
                          <dt>{row.label}</dt>
                          <dd>
                            <span className="derived-grid__value">{row.value}</span>
                            {row.note && <span className="derived-grid__note">{row.note}</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
              </div>

              <div className="dossier__column">
                <section className="dossier__section">
                  <h3 className="dossier__section-title">Atmosphere</h3>
                  <p className="dossier__atmosphere">{planet.atmosphere}</p>
                </section>

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
              </div>
            </div>

            {/*
              Real photographs, and the captions are doing two different jobs.

              `why` is this project's line — what the picture is here to show,
              which is the only reason it was chosen. Everything under it is
              NASA's own metadata carried through unchanged, so the credit is
              theirs rather than a label we wrote about their work.

              Lazy, because three full-width photographs per planet is a lot to
              load for a section most of the way down a page that many people
              will never scroll to.
            */}
            {gallery.length > 0 && (
              <div className="dossier__gallery-wrap">
                <section className="dossier__section">
                  <h3 className="dossier__section-title">Seen for real</h3>
                  <div className="dossier__gallery">
                    {gallery.map((shot) => (
                      <figure className="shot" key={shot.file}>
                        {/*
                          The picture is a link to its own source.

                          What ships here is a few hundred kilobytes of a
                          photograph that exists at full resolution, with NASA's
                          entire caption and every other rendition, at the other
                          end of this. Sending people there is the least the
                          gallery can do for images it did not take.
                        */}
                        <a
                          className="shot__link"
                          href={shot.source}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <img
                            className="shot__image"
                            src={`${import.meta.env.BASE_URL}images/planets/${shot.file}`}
                            alt={shot.title}
                            loading="lazy"
                            decoding="async"
                          />
                          <span className="shot__open" aria-hidden="true">
                            <svg viewBox="0 0 16 16" width="11" height="11" fill="none"
                              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                              strokeLinejoin="round">
                              <path d="M6 3h7v7M13 3L4 12" />
                            </svg>
                          </span>
                        </a>
                        <figcaption className="shot__caption">
                          <p className="shot__why">{shot.why}</p>
                          {/* NASA's own words about the picture, not ours. */}
                          {shot.description && (
                            <p className="shot__description">{shot.description}</p>
                          )}
                          <p className="shot__meta">
                            <span className="shot__title">{shot.title}</span>
                            <span className="shot__credit">
                              {shot.credit}
                              {shot.date ? ` · ${shot.date.slice(0, 4)}` : ''}
                              {' · '}
                              <a
                                className="shot__source"
                                href={shot.source}
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                {shot.nasaId}
                              </a>
                            </span>
                          </p>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
