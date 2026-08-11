/**
 * Mesh preloading, alongside `textures.js`.
 *
 * Deliberately mirrors the texture loader rather than using drei's `useGLTF`.
 * That hook suspends, and this app has no Suspense boundaries anywhere by
 * design — every asset is loaded up front behind the progress bar so that
 * components can read synchronously and nothing ever pops in half-built. One
 * async loading mechanism is enough; adding a second with different failure
 * modes would be the start of two.
 *
 * A failure here is survivable. The prominences are decoration on a sun that
 * already draws without them, so a missing mesh logs and the sun renders bare.
 */

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MINOR_MOONS_RAW } from './data/minorMoonData.js'
import { COMETS_RAW } from './data/cometData.js'

/**
 * Meshes to load, by node name inside the file.
 *
 * The names are the *object* names from Blender. glTF also carries the mesh
 * *data* names, which for this file are the modelling leftovers `Torus`,
 * `Torus.001` and `Plane` — accurate to how it was built and useless to read.
 */
const SOURCES = {
  'sun-prominences': {
    url: 'models/sun-prominences.glb',
    nodes: ['Prominence_01', 'Prominence_02', 'Prominence_03', 'Flare'],
  },
  /**
   * Two of the sun's four shells:
   *
   *   Star_Surface  the photosphere, 1.00 radii, displaced by 1.5%
   *   Solar_Fire    a ragged flame shell, 1.12-1.25, displaced at full strength
   *
   * The other two are left out of the export rather than merely unused.
   * `Solar_Prominences` sits at the same radius as the photosphere and exists
   * only as the emitter surface its Geometry Nodes graph scattered loops
   * across, so drawing it would put a second sphere exactly on the first.
   * `Corona` is a smooth sphere at 1.21 radii, and a sphere has a hard
   * silhouette — however softly its rim is shaded, the shell still *ends*
   * somewhere, and against black that edge reads as a bubble drawn around the
   * sun. The radial sprite in `Sun.jsx` has no edge at all, which is the right
   * tool for haze thinning into space. Dropping both saved 260 KB.
   */
  'sun-body': {
    url: 'models/sun-body.glb',
    nodes: ['Star_Surface', 'Solar_Fire'],
  },
}

/**
 * Bodies that draw a NASA mesh instead of a sphere.
 *
 * Unlike the sun, these keep their materials — because unlike the sun's, NASA's
 * materials are image textures, which is exactly what glTF is for. Each file
 * carries a colour map and, for two of them, a normal map.
 *
 * **The mesh is not optional for most of these.** Mercury, Venus, Jupiter,
 * Saturn, Makemake, the Moon and Mimas are textured with *cube-map atlases* — a
 * 4:3 or 1:1 image holding six square faces, not an equirectangular projection —
 * which can only be sampled through the UV unwrap they were authored against.
 * There is no way to put that image on a `sphereGeometry`. The rest are
 * equirectangular and could in principle be sampled on the app's own sphere, but
 * they are drawn from the mesh too, for one rule rather than two, and because
 * several carry real shape: Phobos, Deimos and Haumea are genuinely irregular,
 * the gas giants are visibly oblate, and the Moon's 46,464 vertices carry
 * displaced terrain.
 *
 * Mimas is worth spotting from its filenames alone. It arrives as
 * `Mimas_diff.jpg` + `Mimas_norm.png` at 2048x2048, where every other moon here
 * is a single `color_YYYY_MM_DD.jpg` at 2:1 — the square aspect and the `_diff`
 * suffix are the atlas signature, the same one Luna's `Cube_diffuse` carries. It
 * matters for more than tidiness: measuring the map for blank regions reports 43%
 * of it empty, which for an equirectangular map would mean half the moon had
 * never been photographed. It is unused atlas corners.
 *
 * Absent from this list, and drawing the app's own sphere: the Sun, which has
 * its own Blender model; Earth, Mars and Neptune, which keep the texture set; and
 * Styx, Nix, Kerberos and Hydra, which NASA has no model of — New Horizons
 * resolved them into a handful of pixels each, so there is no shape or map to
 * publish and they keep their procedural spheres.
 *
 * Every file here is written by `npm run model:nasa` and holds exactly one mesh,
 * so the loader takes the first it finds rather than naming nodes. The names in
 * the source files are modelling residue — `Cube.008`, `cubemap`,
 * `cylindrically_mapped_sphere` — and pinning to them would be pinning to noise.
 */
const BODY_MODEL_IDS = [
  'mercury', 'venus', 'jupiter', 'saturn', 'uranus',
  'ceres', 'pluto', 'haumea', 'makemake', 'eris',
  'luna', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto',
  'mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus',
  'miranda', 'ariel', 'umbriel', 'titania', 'oberon',
  'triton', 'proteus', 'hyperion', 'phoebe',
  'charon',
  /*
   * The comets with a real shape are *derived*, not listed.
   *
   * `cometData.js` already records which of them has a mesh and what it is
   * called, and restating that here is how ʻOumuamua shipped as a smooth
   * procedural sphere: its file was downloaded, prepared and sitting in
   * `public/models/`, its `mesh` field was set, `SURFACE_ALIAS` resolved it —
   * and this one hand-written list did not name it, so it was never registered
   * as a source and never loaded. Nothing errored; the fallback simply took
   * over, which is the same silent-hiding failure `useClassLayers` had.
   *
   * One declaration, in the generated data, where it cannot fall out of step
   * with the roster it belongs to.
   */
  ...COMETS_RAW.filter((c) => c.mesh !== null).map((c) => c.mesh),
]

/**
 * The three generic asteroids the minor moons wear, from NASA's Eyes.
 *
 * Not bodies, and that is the point: one mesh serves dozens of moons. Nobody has
 * resolved Halimede or Cupid into more than a point of light, so there is no
 * shape to ship for any of them, and Eyes' answer — three plausible lumps dealt
 * out round-robin — is the honest one. The alternative is a sphere, which would
 * be a specific claim about a body far too small to be round.
 *
 * Loaded once and **shared**. Three geometries and three pairs of maps cover the
 * whole set however many minor moons arrive, so adding Saturn's does not add a
 * byte. See `minor-moon-roster.mjs` for which body wears which.
 */
const GENERIC_MODEL_IDS = ['generic-asteroid-1', 'generic-asteroid-2', 'generic-asteroid-3']

for (const id of [...BODY_MODEL_IDS, ...GENERIC_MODEL_IDS]) {
  SOURCES[`body:${id}`] = { url: `models/${id}.glb`, body: true }
}

/**
 * body id → the surface key it actually draws with.
 *
 * Only minor moons appear, and only those without a real mesh of their own —
 * Proteus has one, so it is absent here and resolves to itself like any planet.
 *
 * Built from the data rather than listed, so a moon added to the roster is drawn
 * without touching this file. A `model` of `null` means "there is a real mesh",
 * and falls through to the identity path below.
 */
const SURFACE_ALIAS = new Map([
  ...MINOR_MOONS_RAW.filter((m) => m.model !== null).map((m) => [
    m.id,
    `generic-asteroid-${m.model}`,
  ]),
  // Comets share the same three meshes, and by the same reasoning: the number
  // is Eyes' round-robin assignment and says nothing about the body. Nine of
  // the thirteen, Halley among them.
  ...COMETS_RAW.filter((c) => c.mesh === null).map((c) => [
    c.id,
    `generic-asteroid-${c.model}`,
  ]),
  // The four with a real shape resolve to their own file, keyed by the id
  // `nasa-models.mjs` ships them under.
  ...COMETS_RAW.filter((c) => c.mesh !== null).map((c) => [c.id, c.mesh]),
])

export const BODY_MODELS = new Set([...BODY_MODEL_IDS, ...SURFACE_ALIAS.keys()])

/** `${file}:${node}` -> BufferGeometry. */
const geometries = new Map()

/** body id -> `{ geometry, map, normalMap }`. */
const surfaces = new Map()

let inflight = null

/**
 * Synchronous read. Returns null before preloading finishes or on failure.
 *
 * The sun's file is geometry only, because that model's appearance was entirely
 * procedural Cycles shader nodes and glTF has no way to express those —
 * `Prominences.jsx` and `SunShells.jsx` rebuild the look.
 */
export function getGeometry(file, node) {
  return geometries.get(`${file}:${node}`) ?? null
}

/**
 * The surface a body draws, or null if it draws a plain sphere.
 *
 * Nothing is stored unless the mesh loaded, so a failed load falls all the way
 * back to the sphere-and-texture path rather than rendering an untextured blob.
 */
export function getBodySurface(id) {
  return surfaces.get(SURFACE_ALIAS.get(id) ?? id) ?? null
}

/** The first mesh in a loaded scene, whatever it is called. */
function firstMesh(scene) {
  let found = null
  scene.traverse((object) => {
    if (!found && object.geometry) found = object
  })
  return found
}

function loadOne(loader, key, source) {
  return new Promise((resolve) => {
    loader.load(
      `${import.meta.env.BASE_URL}${source.url}`,
      (gltf) => {
        if (source.body) {
          const object = firstMesh(gltf.scene)
          if (object) {
            // GLTFLoader has already put the colour map in sRGB and set flipY
            // false to match glTF's UV convention — which is why the model's own
            // mesh has to be drawn with it rather than a three.js sphere. The
            // normal map is correctly left in linear space by the same loader.
            surfaces.set(key.slice('body:'.length), {
              geometry: object.geometry,
              map: object.material?.map ?? null,
              normalMap: object.material?.normalMap ?? null,
            })
          } else {
            console.warn(`[models] "${key}" holds no mesh`)
          }
          resolve(true)
          return
        }

        for (const name of source.nodes) {
          const object = gltf.scene.getObjectByName(name)
          if (object?.geometry) {
            geometries.set(`${key}:${name}`, object.geometry)
          } else {
            console.warn(`[models] "${key}" has no node named "${name}"`)
          }
        }
        resolve(true)
      },
      undefined,
      (error) => {
        console.warn(`[models] could not load "${key}" — ${error?.message ?? error}`)
        resolve(false)
      },
    )
  })
}

/**
 * Loads every mesh once. Safe to call repeatedly — subsequent calls return the
 * same promise.
 *
 * @param {(progress: number) => void} [onProgress] called with 0..1
 */
export function preloadModels(onProgress) {
  if (inflight) return inflight

  const loader = new GLTFLoader()
  const entries = Object.entries(SOURCES)
  let done = 0

  inflight = Promise.all(
    entries.map(([key, source]) =>
      loadOne(loader, key, source).then((ok) => {
        done += 1
        onProgress?.(done / entries.length)
        return ok
      }),
    ),
  )

  return inflight
}

export const MODEL_COUNT = Object.keys(SOURCES).length
