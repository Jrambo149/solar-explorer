/**
 * Every baked model opens, in a browser with a real GPU.
 *
 * The one thing nothing else in this suite checked, and the gap has cost the
 * app twice.
 *
 * Once when `Spacecraft` handed the roster's model path straight to the loader
 * — `sc_themis/themis.gltf` against a file baked as `themis.glb` — so **all 57**
 * models 404'd and every craft in the app drew as its fallback octahedron. And
 * again with Artemis, Danuri, ESCAPADE and Mariner 2, which declare
 * `KHR_draco_mesh_compression` and `KHR_texture_basisu` under
 * `extensionsRequired`: a loader without those decoders does not read them at
 * lower quality, it rejects the file outright.
 *
 * Both failures are silent by design. The marker is always drawn, so a craft
 * whose mesh never arrives is still in the right place, still labelled, still
 * selectable — which is the right behaviour at runtime and useless as a signal.
 * Nothing throws, nothing looks broken, and the only symptom is a diamond where
 * a spacecraft should be.
 *
 * So this asserts the two things a marker cannot fake: the file parses, and what
 * comes out has geometry. Textures are checked separately, because Basis is the
 * half of the compression that a Draco-only loader would still get wrong — the
 * meshes would decode and every surface would come out untextured.
 *
 * Run the dev server first: `npm run dev`.
 */

import { openPage } from './lib/browser.mjs'
import { SPACECRAFT_RAW } from '../src/data/spacecraftData.js'

/** The same rule as `modelSlug`; see the note there. */
const slugFor = (modelPath) =>
  modelPath.split('/')[0].replace(/^sc_/, '').replace(/_v\d+$/, '').replace(/_/g, '-')

const slugs = [...new Set(SPACECRAFT_RAW.filter((c) => c.model).map((c) => slugFor(c.model)))]

/**
 * The four that need the decoders, named rather than discovered.
 *
 * They are the point of the test. Without them a run over "every model" would
 * still pass if the decoders were dropped and those four quietly stopped being
 * in the roster — the check has to fail when the capability goes, not merely
 * when a file does.
 */
const COMPRESSED = ['artemis', 'danuri', 'escapade', 'mariner-2']

let failures = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/*
 * The dev server, and only the dev server.
 *
 * This needs two things a production build deliberately does not have:
 * `window.__solar`, which is published under `import.meta.env.DEV`, and
 * `/src/gltf.js` as a servable module rather than a bundled chunk.
 *
 * Which leaves one gap worth naming. three points at its own wasm with
 * `new URL('../libs/draco/…', import.meta.url)`; Vite's dev server resolves that
 * into `node_modules`, while the bundler rewrites it to a content-hashed file in
 * `assets/`. Those are different mechanisms, and this exercises the first. What
 * covers the second is the build itself — the decoders appear in `dist/assets/`,
 * and there is no external URL anywhere in the bundle for them to fall back to.
 */
const page = await openPage({ url: 'http://localhost:5173', width: 400, height: 300 })
await page.waitFor('document.readyState === "complete"')
// `__solar.gl` is published by `Scene` once the canvas exists, so this waits for
// the app to be running rather than merely served.
await page.waitFor('!!window.__solar?.gl')

try {
  /*
   * Imported from the dev server so Vite rewrites the bare `three` specifiers
   * inside `src/gltf.js` — the same reason `tools/thumbs.js` is loaded this way.
   * The page cannot resolve `three` itself, which is why the renderer is taken
   * from the running app rather than constructed here.
   *
   * Using the app's own renderer is the stronger check anyway: KTX2 transcodes
   * to whichever compressed format the GPU reports, so the format under test is
   * the one the app will actually receive.
   *
   * And it is `createGLTFLoader`, deliberately, rather than a loader assembled
   * here: a test that configures its own decoders proves the decoders exist and
   * proves nothing at all about the app.
   */
  await page.evaluate(`(async () => {
    const { createGLTFLoader } = await import('/src/gltf.js')
    const loader = createGLTFLoader(window.__solar.gl)
    /*
     * The deadline is not belt-and-braces; it is the failure mode.
     *
     * Removing the decoder payloads to confirm this test discriminates did not
     * produce a rejection — it produced a hang. The loader hands the file to a
     * worker, the worker fetches a wasm that 404s, and nothing ever settles the
     * promise. Without this the suite waits forever on precisely the regression
     * it was written to catch, which is worse than not having the test.
     *
     * Thirty seconds against a local file on a warm dev server: BioSentinel is
     * the largest at 32 MB and 768 meshes, and lands well inside a second.
     */
    const DEADLINE = 30000
    window.__probe = async (slug) => {
      try {
        const gltf = await Promise.race([
          loader.loadAsync('/models/spacecraft/' + slug + '.glb'),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timed out — decoder never answered')), DEADLINE)),
        ])
        let meshes = 0
        let vertices = 0
        let textured = 0
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return
          meshes++
          vertices += o.geometry.getAttribute('position')?.count ?? 0
          const m = o.material
          if (m && (m.map || m.normalMap || m.roughnessMap || m.emissiveMap)) textured++
        })
        return { ok: true, meshes, vertices, textured }
      } catch (error) {
        return { ok: false, error: String(error?.message ?? error).slice(0, 120) }
      }
    }
    return true
  })()`)

  const results = {}
  for (const slug of slugs) {
    results[slug] = await page.evaluate(`window.__probe(${JSON.stringify(slug)})`)
  }

  const broken = slugs.filter((s) => !results[s].ok)
  check(
    `all ${slugs.length} spacecraft models parse`,
    broken.length === 0,
    broken.map((s) => `${s}: ${results[s].error}`).slice(0, 4).join(' | '),
  )

  // A glTF that parses to nothing is a pass on "it loaded" and a diamond on
  // screen, which is the failure this test exists to catch.
  const empty = slugs.filter((s) => results[s].ok && results[s].vertices === 0)
  check('and every one of them has geometry', empty.length === 0, empty.join(', '))

  for (const slug of COMPRESSED) {
    const r = results[slug]
    check(
      `${slug} decodes (Draco + KTX2)`,
      r?.ok && r.vertices > 0,
      r?.ok ? `${r.meshes} meshes, ${r.vertices} vertices` : r?.error ?? 'not in the roster',
    )
    // Draco alone would decode the geometry and leave every surface bare, which
    // looks like a lighting problem rather than a missing decoder.
    check(`and its Basis textures transcode`, r?.ok && r.textured > 0,
      r?.ok ? `${r.textured} textured meshes` : '')
  }

  const errors = page.errors.filter((e) => !e.startsWith('warning:'))
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await page.close()
}

console.log(failures === 0 ? '\nall model checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
