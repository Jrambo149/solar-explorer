import { useEffect, useMemo } from 'react'
import { BODIES_BY_ID, minorMoonsOf } from '../data/bodies'
import { useStore } from '../store/useStore'
import './LayerPanel.css'

function Toggle({ label, hint, checked, onChange, nested, disabled }) {
  return (
    <label
      className={`layer-row${nested ? ' layer-row--nested' : ''}${disabled ? ' is-disabled' : ''}`}
    >
      <span className="layer-row__text">
        <span className="layer-row__label">{label}</span>
        {hint && <span className="layer-row__hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="layer-row__input"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="layer-row__switch" aria-hidden="true" />
    </label>
  )
}

/**
 * What is drawn over the scene, and at what scale.
 *
 * Grouped into one panel rather than added to the top-right button cluster:
 * that cluster is for things you flip constantly, and it was already at four
 * icons with nothing to say what any of them did. Layers are a set that keeps
 * growing — spacecraft trails and small-body filters are still to come — so
 * they need somewhere with room and with words.
 */
export default function LayerPanel() {
  const open = useStore((s) => s.panelOpen)
  const layers = useStore((s) => s.layers)
  const toggleLayer = useStore((s) => s.toggleLayer)
  const scaleMode = useStore((s) => s.scaleMode)
  const setScaleMode = useStore((s) => s.setScaleMode)

  /* Which planet the minor-moon switch currently means. Mirrors `minorMoonHost`
     in the store — the nav bar's open host, else the selected body's own host —
     but read reactively here so the row's label follows the drill. */
  const navHost = useStore((s) => s.navHost)
  const selectedId = useStore((s) => s.selectedId)
  const minorHost = useMemo(() => {
    const id = navHost ?? (selectedId ? (BODIES_BY_ID[selectedId]?.parent ?? selectedId) : null)
    const body = id ? BODIES_BY_ID[id] : null
    return body && minorMoonsOf(body.id).length > 0 ? body : null
  }, [navHost, selectedId])

  /* O, L and I, as in Eyes.
   *
   * Only *text entry* swallows these. Guarding on `INPUT` wholesale seemed
   * safer but was actively wrong: clicking one of the switches below leaves
   * focus on its checkbox, so every shortcut would go dead the moment you used
   * the panel once. A checkbox has no use for the letter O. The date field
   * does. */
  useEffect(() => {
    const TEXT_ENTRY = new Set([
      'text', 'search', 'url', 'email', 'password', 'number', 'tel',
      'date', 'datetime-local', 'month', 'week', 'time',
    ])

    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const active = document.activeElement
      const tag = active?.tagName
      if (tag === 'TEXTAREA' || tag === 'SELECT') return
      if (tag === 'INPUT' && TEXT_ENTRY.has(active.type)) return

      const key = event.key.toLowerCase()
      const state = useStore.getState()
      if (key === 'o') state.toggleLayer('orbits')
      else if (key === 'l') state.toggleLayer('labels')
      else if (key === 'i') state.toggleLayer('icons')
      else if (key === 'p') state.toggleLayer('planets')
      else if (key === 'd') state.toggleLayer('dwarfPlanets')
      else if (key === 'm') state.toggleLayer('moons')
      else if (key === 'n') state.toggleLayer('minorMoons')
      else if (key === 'c') state.toggleLayer('comets')
      // A for asteroids — the five drawn as worlds. The belt itself is not a
      // layer: it is the scene, the way the stars are.
      else if (key === 'a') state.toggleLayer('asteroids')
      // S, not the more obvious first letter of "spacecraft" being taken —
      // it is free, and the panel lists the shortcut anyway.
      else if (key === 's') state.toggleLayer('spacecraft')
      // T for trails. Independent of O now rather than nested under it: they are
      // two renderers over disjoint sets of bodies, so neither switch can
      // meaningfully disable the other.
      else if (key === 't') state.toggleLayer('trails')
      // K for the sky, because C is the comets' and every other letter in
      // "constellations" is worse.
      else if (key === 'k') state.toggleLayer('constellations')
      // W for the Way, M being the moons'.
      else if (key === 'w') state.toggleLayer('milkyWay')
      // F for the named ground, and G for what came down on it — "L" for
      // landings being the labels'.
      else if (key === 'f') state.toggleLayer('features')
      else if (key === 'g') state.toggleLayer('landingSites')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    /* Its own wheel too — see the dock in `NavBar`. A column of toggles is a
       control surface, and a wheel over one should never reach the camera. */
    <div
      className={`layer-panel glass${open ? ' is-open' : ''}`}
      data-wheel="ui"
      aria-hidden={!open}
    >
      <p className="layer-panel__heading">Layers</p>

      {/* Two peers, not a parent and a child. Orbits draws the planets' and the
          Moon's closed ellipses; Trails draws the tapering path behind every
          other satellite, the dwarf planets and Charon. No body is covered by
          both, which is why neither can sensibly grey the other out. */}
      <Toggle
        label="Orbits"
        hint="O"
        checked={layers.orbits}
        onChange={() => toggleLayer('orbits')}
      />
      <Toggle
        label="Trails"
        hint="T"
        checked={layers.trails}
        onChange={() => toggleLayer('trails')}
      />
      <Toggle
        label="Labels"
        hint="L"
        checked={layers.labels}
        onChange={() => toggleLayer('labels')}
      />
      <Toggle
        label="Icons"
        hint="I"
        checked={layers.icons}
        onChange={() => toggleLayer('icons')}
      />
      {/* Two switches for the ground, and they are two because they are two
          different claims. A feature name says what a piece of surface is
          called; a landing site says something arrived there on a particular
          day. Someone reading the Moon as a map may well want one without the
          other. Neither draws anything until you are close to a body, so both
          are free at the overview. */}
      <Toggle
        label="Surface features"
        hint="F"
        checked={layers.features}
        onChange={() => toggleLayer('features')}
      />
      <Toggle
        label="Landing sites"
        hint="G"
        checked={layers.landingSites}
        onChange={() => toggleLayer('landingSites')}
      />
      {/* The only annotation switch that opens off. The other four draw on the
          subject — an orbit, a name, a marker — and this one draws on the
          backdrop, which is where the eye is deliberately not meant to be. */}
      <Toggle
        label="Milky Way"
        hint="W"
        checked={layers.milkyWay}
        onChange={() => toggleLayer('milkyWay')}
      />
      <Toggle
        label="Constellations"
        hint="K"
        checked={layers.constellations}
        onChange={() => toggleLayer('constellations')}
      />
      {/* The one piece of chrome that says the sky can be clicked.
          Nothing else could: the figures give no sign of being interactive, and
          a click on empty space has meant "back out to the overview" since long
          before they existed — so without a word here, the only way to discover
          this is to click the sky *while the figures happen to be on* and
          notice that something different happened. Shown only while the layer
          is on, because that is exactly when the claim is true. */}
      {layers.constellations && (
        <p className="layer-panel__note">Click anywhere in the sky to name the constellation.</p>
      )}

      {/* A separate heading because these are a different kind of switch. The
          four above decide what is *drawn over* the scene; these two decide
          what is in it. */}
      <p className="layer-panel__heading layer-panel__heading--spaced">Bodies</p>

      {/* First in the class list because it is the one that is on by default,
          and because hiding it is how you look at everything else on its own —
          the eight bright ellipses otherwise sit across the middle of any view
          of the comets or of a captured swarm. */}
      <Toggle
        label="Planets"
        hint="P"
        checked={layers.planets}
        onChange={() => toggleLayer('planets')}
      />
      <Toggle
        label="Dwarf planets"
        hint="D"
        checked={layers.dwarfPlanets}
        onChange={() => toggleLayer('dwarfPlanets')}
      />
      {/* Two peers again, for the reason set out beside them in `useStore`:
          a minor moon is not a detail of a major one. */}
      <Toggle
        label="Major moons"
        hint="M"
        checked={layers.moons}
        onChange={() => toggleLayer('moons')}
      />
      {/* Scoped to one host, so the row says which. There are 413 minor moons
          and no view wants them all; the switch means "this planet's", and
          without a planet in view there is nothing for it to mean — so it goes
          disabled and says where to find one rather than silently doing
          nothing. */}
      {/* Off by default and its own row rather than a sub-toggle of anything:
          a comet is not a variety of planet or of small moon, and switching
          them on changes the scale of the view as much as its contents. */}
      {/* Between the dwarfs and the comets, which is where they belong: bodies
          of the inner system that are neither planets nor ice. This switches
          the five *named* asteroids, not the belt — three and a half thousand
          rocks are drawn regardless, and are no more optional than the stars. */}
      <Toggle
        label="Asteroids"
        hint="A"
        checked={layers.asteroids}
        onChange={() => toggleLayer('asteroids')}
      />
      <Toggle
        label="Comets"
        hint="C"
        checked={layers.comets}
        onChange={() => toggleLayer('comets')}
      />
      {/* Its own row beside the comets, and last in the class list because it
          is the one population that is not natural. Everything above this line
          was here before anyone was. */}
      <Toggle
        label="Spacecraft"
        hint="S"
        checked={layers.spacecraft}
        onChange={() => toggleLayer('spacecraft')}
      />
      <Toggle
        label={minorHost ? `Minor moons — ${minorHost.name}` : 'Minor moons'}
        // Short enough to sit on one line beside the label. A sentence here
        // wrapped the row and pushed it into the one below.
        hint={minorHost ? 'N' : 'no planet open'}
        checked={!!layers.minorMoons}
        disabled={!minorHost}
        onChange={() => toggleLayer('minorMoons')}
      />

      <p className="layer-panel__heading layer-panel__heading--spaced">Scale</p>

      <div className="layer-scale">
        <input
          id="scale-range"
          className="layer-scale__range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={scaleMode}
          onChange={(event) => setScaleMode(Number(event.target.value))}
          style={{ '--fill': `${scaleMode * 100}%` }}
          aria-label="Scale, from diorama to true scale"
          aria-valuetext={scaleMode < 0.02 ? 'Diorama' : scaleMode > 0.98 ? 'True scale' : `${Math.round(scaleMode * 100)}% toward true scale`}
        />
        <div className="layer-scale__ends" aria-hidden="true">
          <span>Diorama</span>
          <span>True</span>
        </div>
        {/* Worth saying plainly, because the far end looks like a bug: at true
            scale the planets really are invisible specks. That is what the
            solar system is actually like. */}
        <p className="layer-scale__note">
          {scaleMode > 0.6
            ? 'Real proportions — the planets are almost too small to see. They really are.'
            : 'Distances and sizes compressed so everything fits on screen.'}
        </p>
      </div>
    </div>
  )
}
