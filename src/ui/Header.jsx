import Breadcrumb from './Breadcrumb'
import './Header.css'

/**
 * Mostly static chrome — the entrance is a CSS animation rather than a Framer
 * one. These elements mount once and never leave, so there's nothing for
 * AnimatePresence to do, and a compositor-driven animation can't leave them
 * stuck at `opacity: 0` if the JS animation loop is ever throttled.
 *
 * The wordmark is the one part that moves now: it has become the first crumb of
 * the breadcrumb, so the title and the path are one control. See `Breadcrumb`.
 */
export default function Header() {
  return (
    <>
      <header className="header">
        <Breadcrumb />
        <p className="header__hint">
          Drag to orbit · Right-drag to move · Scroll to zoom · Click a planet
        </p>
        {/* The Solar System Scope maps are CC BY 4.0, which requires visible
            attribution. This used to sit in the bottom-left corner; the
            timeline owns the full width of that edge now, so it joins the
            header stack.

            Both sources are named because both are now load-bearing: twenty of
            the twenty-three bodies wear a surface from NASA's 3D models, and
            Earth, Mars and Neptune still wear Solar System Scope's. Crediting
            only one of them would have been wrong in either direction. */}
        <p className="credit">
          Surfaces{' '}
          <a href="https://science.nasa.gov/3d-resources/" target="_blank" rel="noreferrer noopener">
            NASA
          </a>{' '}
          ·{' '}
          <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer noopener">
            Solar System Scope
          </a>{' '}
          CC BY 4.0
        </p>
        {/* The sky is two more sources with attribution terms of their own: HYG
            is CC BY-SA 4.0 and Stellarium's skycultures are GPL-2. Its own line
            rather than a longer first one, because these credit a different
            thing — where the stars are, not what the planets look like. */}
        <p className="credit">
          Sky{' '}
          <a
            href="https://github.com/astronexus/HYG-Database"
            target="_blank"
            rel="noreferrer noopener"
          >
            HYG
          </a>{' '}
          CC BY-SA 4.0 ·{' '}
          <a href="https://stellarium.org/" target="_blank" rel="noreferrer noopener">
            Stellarium
          </a>{' '}
          figures
        </p>
      </header>
    </>
  )
}
