import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { BODIES_BY_ID, bodyRadius, bodyShown } from '../data/bodies'
import { LANDED_CRAFT } from '../data/landedCraft'
import { SITES_BY_BODY } from '../data/landingSites'
import { FEATURES_BY_BODY } from '../data/surfaceFeatures'
import { planetPositions, simClock, useStore } from '../store/useStore'
import { featureKey, featureNodes, publishSurface, siteKey } from './featureRegistry'
import { bodyBasis } from './pole'
import { surfaceDirection, surfaceSpin } from './surface'

/**
 * Names the ground, once you are close enough for the ground to have names —
 * and marks the places things have landed on it.
 *
 * The gazetteer holds fifteen thousand names and this app bakes four thousand,
 * so the whole problem is *which few* to draw. Two rules, and both are about the
 * viewer rather than about the feature:
 *
 *  1. **It has to be big enough to see.** A feature is labelled only when its
 *     own diameter covers enough pixels — so from a distance the Moon carries
 *     the maria and nothing else, and Tycho arrives as you close in. Distance
 *     thins the list, rather than a build script guessing what matters.
 *  2. **It has to be facing you.** A label on the far side of a sphere is
 *     nonsense that the depth buffer cannot save you from, because the label is
 *     DOM and floats over everything. The dot product of the surface normal
 *     with the direction to the camera decides it.
 *
 * ## Landing sites, in the same pass
 *
 * A landing site is the same geometry problem — a point at a latitude and a
 * longitude, facing the camera or not — so it runs through the same transform
 * rather than a second copy of it. Where it differs is in what decides whether
 * to draw it, and each difference is a fact about landings rather than a
 * setting:
 *
 *  - **A site has no size.** Nothing here is a kilometre across; Apollo 11 is
 *    a descent stage four metres wide. So the size test cannot apply, and the
 *    *body's* size stands in for it: sites appear once you are properly at the
 *    world rather than passing it.
 *  - **A site has a date.** Tycho has been there for a hundred million years
 *    and Chang'e 6 has been there since June 2024. Running the clock back to
 *    1968 and finding Apollo 11 already on the ground would be the app
 *    asserting something false, so the landing date gates it.
 *  - **A site may already be standing there.** The six Mars landers in
 *    `landedCraft.js` are drawn as models on the surface when the spacecraft
 *    layer is on, at the same coordinates. Labelling the ground beside them
 *    would be two marks for one object, so whichever is drawn wins and the
 *    site steps aside.
 *
 * ## Why the list goes through React and the positions do not
 *
 * The set of names on screen changes slowly — crossing a size threshold, or
 * turning the planet far enough to bring a new one over the limb. Their
 * *positions* change every frame. So the set is published to the store a few
 * times a second and rendered as ordinary DOM by `FeatureLayer`, while this
 * writes each node's transform directly in the frame loop. The same split, and
 * the same reasoning, as `LabelProjector` — see `labelRegistry.js`.
 */

/** How many pixels across a feature must be before it is worth naming. */
const MIN_PIXELS = 38

/**
 * How large the *body* has to be before its unsized features are named, as a
 * fraction of the viewport height.
 *
 * **A fraction, not a pixel count, and that distinction is load-bearing.** The
 * arrival framing is proportional to the window: flying to a body always parks
 * it at 0.283 of the viewport height, whatever the window. Written as an
 * absolute 220 px this gate was met on a tall window and missed on a short one
 * — the same flight to the same body, and on a 700 px-tall browser nothing was
 * ever named until you zoomed in by hand.
 */
const UNSIZED_BODY_HEIGHT = 0.24

/**
 * And how large before the landing sites are marked. Same units, same reason.
 *
 * **Measured against where the app actually parks.** Flying to a body frames it
 * at 0.283 of the viewport height — the same figure for the Moon and for Mars,
 * since the framing is a multiple of the drawn radius rather than a distance.
 * A threshold above that means arriving at the Moon and finding no landing
 * sites until you zoom further, which is exactly the moment someone wants them.
 *
 * So this sits just under the arrival framing: the marks are there when you get
 * there, and they leave when you back away. Since standing on the ground is
 * reached by clicking one, a gate set too high does not merely hide an
 * annotation — it hides the way in.
 */
const SITE_BODY_HEIGHT = 0.26

/** And how many names at once. Past this it stops being a map. */
const MAX_LABELS = 18

/**
 * How many sites at once.
 *
 * Lower than the features' cap and deliberately so: the near side of the Moon
 * holds twenty of these within about sixty degrees of longitude, and the
 * Apollo and Surveyor sites in particular sit almost on top of one another.
 * Past a dozen the labels overlap into a smear.
 */
const MAX_SITES = 12

/**
 * How far past the limb a feature may sit and still be labelled.
 *
 * Zero would mean exactly the terminator of the visible hemisphere, where a
 * label sits on a surface so foreshortened it points at nothing. A small
 * positive margin keeps them off the very edge.
 */
const FACING = 0.22

/** Republish the list at most this often. */
const LIST_INTERVAL_MS = 180

/**
 * How much room a label needs, in pixels, before another may be drawn.
 *
 * A screen-space rule and not a great one in theory — proper label placement
 * would move them off their anchors with leader lines. In practice the anchors
 * are the point: a mark on the ground is a claim about *that spot*, and a
 * displaced one is worse than an absent one.
 *
 * So overlapping labels are dropped rather than nudged. Without this the Moon
 * drew "Apollo 12" through the middle of "Apollo 14" — they are 350 km apart,
 * which at the distance these appear is about twenty pixels — and Mars drew
 * "Opportunity" over "Meridiani Planum".
 *
 * Wide and short, because that is the shape of a word.
 */
const CLEAR_X = 92
const CLEAR_Y = 16

const _worldDir = new THREE.Vector3()
const _point = new THREE.Vector3()
const _toCamera = new THREE.Vector3()
const _basis = new THREE.Matrix4()
const _quaternion = new THREE.Quaternion()
const _axisX = new THREE.Vector3()
const _axisY = new THREE.Vector3()
const _axisZ = new THREE.Vector3()
const _spin = new THREE.Quaternion()
const AXIS_Y = new THREE.Vector3(0, 1, 0)

const NO_FEATURES = []
const NO_SITES = []

/**
 * Which site wins when two want the same patch of screen.
 *
 * Facing alone was the first rule and it is arbitrary in a way that shows:
 * Surveyor 5 and Apollo 11 are fifty kilometres apart, which at this distance
 * is the same pixel, and Surveyor 5 happened to sit a degree nearer the middle
 * of the disc — so the Moon drew Surveyor 5 and dropped the Apollo 11 landing.
 * Surveyor 3 and Apollo 12 are 155 metres apart and have the same argument.
 *
 * This is an editorial rule and there is no avoiding that. It is at least made
 * out of a field the data already carries rather than out of a list of missions
 * someone decided were famous: a crewed landing over a returned sample, a
 * returned sample over a rover, a rover over a lander, and anything that
 * arrived intact over anything that hit.
 */
const KIND_RANK = {
  crewed: 5,
  'sample return': 4,
  rover: 3,
  lander: 2,
  probe: 2,
  impact: 1,
  crash: 1,
}

/** Would a label here run through one already placed? */
const collides = (taken, [x, y]) =>
  taken.some(([tx, ty]) => Math.abs(tx - x) < CLEAR_X && Math.abs(ty - y) < CLEAR_Y)

export default function SurfaceFeatures() {
  const { camera, size } = useThree()
  const lastList = useRef({ at: 0, key: '' })
  const placed = useRef(new Map())

  useFrame(() => {
    const { layers, selectedId, scaleMode } = useStore.getState()

    /*
     * Only the selected body, and only a body that has something to say.
     *
     * Not "every body near the camera": at a moon system that would label
     * three worlds at once, and the labels of the one you are not looking at
     * would sit over the one you are.
     */
    const body = selectedId ? BODIES_BY_ID[selectedId] : null
    const features = body && layers.features ? (FEATURES_BY_BODY[body.id] ?? NO_FEATURES) : NO_FEATURES
    const sites = body && layers.landingSites ? (SITES_BY_BODY[body.id] ?? NO_SITES) : NO_SITES
    const position = body ? planetPositions.get(body.id) : null
    const spin = body ? surfaceSpin(body.id) : null

    if (
      (features.length === 0 && sites.length === 0) ||
      !position ||
      spin === null ||
      !bodyShown(body, layers)
    ) {
      if (lastList.current.key !== '') {
        lastList.current = { at: 0, key: '' }
        publishSurface(NO_FEATURES, NO_SITES)
      }
      placed.current.clear()
      return
    }

    const radius = bodyRadius(body, scaleMode)
    const focalPx = size.height / (2 * Math.tan((camera.fov * Math.PI) / 360))

    // `basis · R_y(spin)`, the same composition `surfaceOffset` uses.
    const basis = bodyBasis(body.id)
    _axisX.set(basis.x.x, basis.x.y, basis.x.z)
    _axisY.set(basis.y.x, basis.y.y, basis.y.z)
    _axisZ.set(basis.z.x, basis.z.y, basis.z.z)
    _basis.makeBasis(_axisX, _axisY, _axisZ)
    _quaternion.setFromRotationMatrix(_basis)
    _spin.setFromAxisAngle(AXIS_Y, spin)
    _quaternion.multiply(_spin)

    const distance = camera.position.distanceTo(position)
    const kmPerWorld = body.radiusKm / radius

    // How big the body itself is, for the features the register never sized
    // and for the sites, which have no size at all.
    const bodyPx = (radius / distance) * focalPx

    /** Where a body-fixed coordinate lands, and how squarely it faces us. */
    const place = (lat, lon) => {
      surfaceDirection(lat, lon, _worldDir).applyQuaternion(_quaternion)
      _point.copy(_worldDir).multiplyScalar(radius).add(position)
      _toCamera.subVectors(camera.position, _point).normalize()
      return _worldDir.dot(_toCamera)
    }

    /**
     * Where a label would sit on screen, in pixels.
     *
     * Called with `_point` already holding a world position, which `place`
     * leaves there.
     */
    const screen = () => {
      _point.project(camera)
      return [(_point.x * 0.5 + 0.5) * size.width, (-_point.y * 0.5 + 0.5) * size.height]
    }

    /*
     * The sites go first, and everything else works around them.
     *
     * The other order was the obvious one and was wrong on the Moon: the
     * features are picked by size, the maria are the largest things there are,
     * and the Apollo sites sit *in* them — so Mare Tranquillitatis took the
     * space and Apollo 11 was dropped for lack of room, which is precisely
     * backwards. A name for a piece of ground is the commoner claim; a place
     * someone landed is the rarer one.
     */
    const taken = []
    const siteList = []
    if (bodyPx >= SITE_BODY_HEIGHT * size.height) {
      const jd = simClock.jd
      for (const site of sites) {
        // Nothing is there before it lands.
        if (jd < site.jd) continue
        /*
         * And nothing is labelled twice. `landedCraft.js` puts a model on this
         * exact coordinate once the craft is down and the spacecraft layer is
         * on; the object beats the annotation.
         */
        const craft = site.craft ? LANDED_CRAFT[site.craft] : null
        if (craft && layers.spacecraft && jd >= craft.landed) continue

        const facing = place(site.lat, site.lon)
        if (facing < FACING) continue
        siteList.push({ key: siteKey(site.name), site, facing, x: _point.x, y: _point.y, z: _point.z })
      }
      /*
       * By what happened there, and then by how squarely it faces us. Sites
       * have no size to rank by and several of them share a pixel; see
       * `KIND_RANK`.
       */
      siteList.sort(
        (a, b) =>
          (KIND_RANK[b.site.kind] ?? 0) - (KIND_RANK[a.site.kind] ?? 0) || b.facing - a.facing,
      )

      // And then whatever still has room to be read.
      const clear = []
      for (const item of siteList) {
        if (clear.length >= MAX_SITES) break
        _point.set(item.x, item.y, item.z)
        const at = screen()
        if (collides(taken, at)) continue
        taken.push(at)
        clear.push(item)
      }
      siteList.length = 0
      siteList.push(...clear)
    }

    const shortlist = []
    for (const feature of features) {
      /*
       * Pixels across, from the feature's own diameter — or, for the ones the
       * register leaves unsized, from the body's. "No diameter" is common on
       * the small moons and on linear features, and it means nobody has
       * published an extent rather than that the feature is small; the honest
       * rule is to show them once you are close to the body itself.
       */
      const px = feature.km > 0 ? (feature.km / kmPerWorld / distance) * focalPx : 0
      if (feature.km > 0 ? px < MIN_PIXELS : bodyPx < UNSIZED_BODY_HEIGHT * size.height) continue
      if (place(feature.lat, feature.lon) < FACING) continue
      /*
       * Against the sites only, not against the other features. Crater names
       * have always been free to crowd each other here and thinning them is a
       * separate question with a separate answer — this is about not drawing
       * two different *kinds* of claim through one another.
       */
      if (collides(taken, screen())) continue

      // `screen` projected `_point` in place, so the world position has to
      // come back off the direction rather than out of the scratch vector.
      _point.copy(_worldDir).multiplyScalar(radius).add(position)
      shortlist.push({ key: featureKey(feature.name), feature, x: _point.x, y: _point.y, z: _point.z })
      if (shortlist.length > MAX_LABELS * 3) break
    }

    // The largest few, since the list is already in size order per body.
    const chosenFeatures = shortlist.slice(0, MAX_LABELS)

    /*
     * Publish the *set* only when it changes, and never more than a few times a
     * second: this crosses into React, and the positions below do not.
     */
    const key = `${chosenFeatures.map((c) => c.key).join('|')}#${siteList.map((c) => c.key).join('|')}`
    const now = performance.now()
    if (key !== lastList.current.key && now - lastList.current.at > LIST_INTERVAL_MS) {
      lastList.current = { at: now, key }
      publishSurface(
        chosenFeatures.map((c) => c.feature),
        siteList.map((c) => c.site),
      )
    }

    // And place whatever the overlay has actually rendered.
    placed.current.clear()
    for (const item of chosenFeatures) placed.current.set(item.key, item)
    for (const item of siteList) placed.current.set(item.key, item)

    for (const [nodeKey, node] of featureNodes) {
      const item = placed.current.get(nodeKey)
      if (!item) {
        node.style.opacity = '0'
        continue
      }
      _point.set(item.x, item.y, item.z).project(camera)
      const x = (_point.x * 0.5 + 0.5) * size.width
      const y = (-_point.y * 0.5 + 0.5) * size.height
      node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      node.style.opacity = _point.z > 1 ? '0' : '1'
    }
  })

  return null
}
