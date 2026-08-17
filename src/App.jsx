import { useEffect, useRef } from 'react'
import Scene from './scene/Scene'
import LoadingScreen from './ui/LoadingScreen'
import InfoPanel from './ui/InfoPanel'
import NavBar from './ui/NavBar'
import Controls from './ui/Controls'
import Timeline from './ui/Timeline'
import LayerPanel from './ui/LayerPanel'
import EventPanel from './ui/EventPanel'
import SearchPalette from './ui/SearchPalette'
import LabelLayer from './ui/LabelLayer'
import FeatureLayer from './ui/FeatureLayer'
import SurfaceBar from './ui/SurfaceBar'
import ConstellationPanel from './ui/ConstellationPanel'
import StarPanel from './ui/StarPanel'
import ConstellationLabels from './ui/ConstellationLabels'
import Header from './ui/Header'
import PlanetTitle from './ui/PlanetTitle'
import ScrollHint from './ui/ScrollHint'
import { preloadTextures } from './textures'
import { preloadModels } from './models'
import { useScrollChrome } from './hooks/useScrollChrome'
import { useStore } from './store/useStore'

/** Keep the loading screen up at least this long so it doesn't flash. */
const MIN_LOADING_MS = 1100

export default function App() {
  const loaded = useStore((s) => s.loaded)
  const appRef = useRef(null)

  useScrollChrome(appRef)

  // Load every texture and mesh before the scene mounts, so nothing appears
  // untextured or half-built and the progress bar reflects real work.
  useEffect(() => {
    let cancelled = false
    let timer

    const startedAt = performance.now()

    // Weighted by bytes, not averaged, so the bar moves at something like a
    // constant rate rather than parking and jumping.
    //
    // This number has moved a long way. It was 0.92 when the meshes were one
    // 360 KB sun and the textures were the bulk of the download; then 0.3 when
    // the NASA body models arrived at ~41 MB against ~18 MB of textures. Eleven
    // more moon models took `public/models/` to 64 MB against 24 MB of textures,
    // so it comes down again. Worth re-checking whenever either set changes size.
    const TEXTURE_SHARE = 0.27
    let textureProgress = 0
    let modelProgress = 0

    const report = () => {
      if (cancelled) return
      useStore
        .getState()
        .setProgress(textureProgress * TEXTURE_SHARE + modelProgress * (1 - TEXTURE_SHARE))
    }

    Promise.all([
      preloadTextures((p) => {
        textureProgress = p
        report()
      }),
      preloadModels((p) => {
        modelProgress = p
        report()
      }),
    ]).then(() => {
      // On a warm cache every texture resolves in a single tick, which would
      // flash the loading screen for one frame at 0%. Holding it briefly lets
      // the progress bar actually read as progress.
      const remaining = Math.max(0, MIN_LOADING_MS - (performance.now() - startedAt))
      timer = setTimeout(() => {
        if (!cancelled) useStore.getState().setLoaded()
      }, remaining)
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className="app" ref={appRef}>
      {/* One screenful: the scene and everything pinned to its edges. Sticky,
          so it stays in view while the dossier scrolls up over it. */}
      <div className="stage">
        {loaded && <Scene />}

        <div className="ui-layer">
          {loaded && (
            <>
              <Header />
              <PlanetTitle />
              <Controls />
              <LayerPanel />
              <EventPanel />
              <LabelLayer />
              <FeatureLayer />
              <SurfaceBar />
              <ConstellationLabels />
              <ConstellationPanel />
              <StarPanel />
              <ScrollHint />
              <NavBar />
              <Timeline />
              {/* Last, so it lays over everything else it takes the keyboard
                  from. */}
              <SearchPalette />
            </>
          )}
        </div>
      </div>

      {/* In normal flow after the stage, so it begins exactly one viewport
          down. Renders nothing until a body is selected, which is what keeps
          the page a single screen tall the rest of the time. */}
      {loaded && <InfoPanel />}

      <LoadingScreen />
    </div>
  )
}
