import { useStore } from '../store/useStore'
import { useNamer } from './useBodyName'
import { lineageOf } from '../data/bodies'
import { playSelectSound } from '../hooks/useAmbientAudio'
import './Breadcrumb.css'

/**
 * Where you are, as a path you can walk back up.
 *
 * NASA's Eyes puts one of these in the top-left corner with the wordmark as its
 * first crumb, and this sits in the same place for the same reason: it is the
 * one piece of chrome that is always true, so it belongs where the eye goes
 * first and nothing else competes for the spot.
 *
 * It differs from Eyes in what it actually contains, deliberately. Eyes builds
 * its crumbs from the URL route, and a body is a single route segment, so
 * selecting Europa there reads `Eyes on the Solar System > Europa` and Jupiter
 * is never named. This one is built from `lineageOf`, the containment chain, so
 * it reads `Solar Explorer > Jupiter > Europa` — the middle level being the
 * whole point of having the control.
 *
 * Everything but the last crumb is a link. The last one is where you already
 * are, and a control that does nothing is worse than no control, so it is
 * rendered as text.
 *
 * Deliberately not a browsing surface: no sibling dropdowns, no way to reach a
 * body that is not on the current path. That is the nav bar's job, and two
 * controls that both open the same list of moons would be one too many.
 */
export default function Breadcrumb() {
  const selectedId = useStore((s) => s.selectedId)
  const systemId = useStore((s) => s.systemId)
  const selectPlanet = useStore((s) => s.selectPlanet)
  const frameSystem = useStore((s) => s.frameSystem)
  const clearSelection = useStore((s) => s.clearSelection)
  const setHovered = useStore((s) => s.setHovered)
  const namer = useNamer()
  const musicOn = useStore((s) => s.musicOn)

  const go = (run) => {
    // Only chirp if the user has opted into sound at all — same rule the nav
    // bar follows.
    if (musicOn) playSelectSound()
    // Leaving the hover set behind would keep the body you clicked *through*
    // highlighted in the scene after the pointer has gone.
    setHovered(null)
    run()
  }

  /*
   * The crumbs after the root, built from the containment chain.
   *
   * A moon gets a `Moons` crumb inserted ahead of it, naming the system it
   * belongs to. It is not decoration: it is a destination in its own right,
   * and the one the chain was missing. `Jupiter` frames the planet, `Callisto`
   * frames the moon, and neither of them is the shot where you can see the
   * Galileans strung out around the planet — which is the view that makes the
   * arrangement legible, and the reason to have the crumb at all.
   *
   * Only satellites get one. Planets and dwarf planets sit directly in the
   * solar system, so the root crumb already is their category and a second one
   * would be a longer way to click home.
   */
  const items = []

  for (const body of lineageOf(selectedId)) {
    if (body.kind === 'moon') {
      items.push({
        key: `system-${body.parent}`,
        label: 'Moons',
        go: () => frameSystem(body.parent),
      })
    }
    items.push({
      key: body.id,
      label: namer(body),
      hoverId: body.id,
      go: () => selectPlanet(body.id),
    })
  }

  // Already framing a system: the trail ends at `Moons` rather than at a body,
  // since that is genuinely where the camera is. `systemId` is only ever equal
  // to `selectedId`, so the body it belongs to is the crumb just pushed.
  if (systemId && systemId === selectedId) {
    items.push({ key: `system-${systemId}`, label: 'Moons' })
  }

  return (
    <nav className={`crumbs${items.length ? ' has-path' : ''}`} aria-label="Location">
      {/* The wordmark is the home crumb, exactly as the NASA logo is in Eyes.
          It stays an `h1` because it is still the page's heading; the button is
          inside it rather than around it so the document outline is unchanged
          by making the title clickable. */}
      <h1 className="crumbs__home">
        <button
          type="button"
          className="crumb crumb--home"
          onClick={() => go(clearSelection)}
          aria-current={items.length === 0 ? 'true' : undefined}
          aria-label="Back to the whole solar system"
        >
          {/* Three labels for one control, swapped by width — see `has-path`
              in the stylesheet. All are always in the DOM so the swap is a CSS
              media query rather than a resize listener re-rendering the tree.
              The screen reader is given the `aria-label` above instead, so it
              never hears the hidden ones, or several at once. */}
          <span className="crumb__brand" aria-hidden="true">
            Solar<span>Explorer</span>
          </span>
          {/* The narrow-screen root: the Sun with something in orbit around it,
              which is the whole of what the crumb means. Eyes does the same
              thing with the NASA meatball — on a phone the path is worth more
              than the name of the app. */}
          <svg className="crumb__glyph" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            {/* Deliberately flat. At 13px a rounder ring around a filled centre
                reads as an eye — which is the glyph on the nav bar's own toggle,
                a few hundred pixels away and meaning something else entirely. */}
            <circle cx="8" cy="8" r="2.6" fill="currentColor" />
            <ellipse
              cx="8"
              cy="8"
              rx="7.2"
              ry="2.3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.1"
              opacity="0.55"
            />
            <circle cx="15.2" cy="8" r="1.2" fill="currentColor" />
          </svg>
        </button>
      </h1>

      {items.map((item, i) => {
        // The last crumb is where you already are, and a control that does
        // nothing is worse than no control — so it is rendered as text whatever
        // it would otherwise have done.
        const last = i === items.length - 1

        return (
          // Keyed by identity so a crumb that survives a selection change —
          // Jupiter and its `Moons`, when you go from Europa to Io — keeps its
          // DOM node and does not replay its entrance. Only the crumbs that
          // actually changed animate.
          <span className="crumbs__step" key={item.key}>
            <span className="crumbs__sep" aria-hidden="true">
              ›
            </span>

            {last ? (
              <span className="crumb crumb--current" aria-current="true">
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                className="crumb"
                onClick={() => go(item.go)}
                // Only a body can be highlighted in the scene. `Moons` names a
                // view, so it has no `hoverId` and hovering it does nothing.
                onPointerEnter={item.hoverId ? () => setHovered(item.hoverId) : undefined}
                onPointerLeave={item.hoverId ? () => setHovered(null) : undefined}
              >
                {item.label}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
