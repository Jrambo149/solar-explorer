import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { BODIES_BY_ID, bodyRadius, bodyShown } from '../data/bodies'
import { FEATURES_BY_BODY } from '../data/surfaceFeatures'
import { planetPositions, useStore } from '../store/useStore'
import { featureNodes, publishFeatures } from './featureRegistry'
import { bodyBasis } from './pole'
import { surfaceDirection, surfaceSpin } from './surface'

/**
 * Names the ground, once you are close enough for the ground to have names.
 *
 * The gazetteer holds fifteen thousand of them and this app bakes four
 * thousand, so the whole problem is *which few* to draw. Two rules, and both
 * are about the viewer rather than about the feature:
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
 * How large the *body* has to be before its unsized features are named.
 *
 * A quarter of the viewport height, so they arrive when you are properly at
 * the moon rather than passing it.
 */
const UNSIZED_BODY_PIXELS = 220

/** And how many names at once. Past this it stops being a map. */
const MAX_LABELS = 18

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

export default function SurfaceFeatures() {
  const { camera, size } = useThree()
  const lastList = useRef({ at: 0, key: '' })
  const placed = useRef(new Map())

  useFrame(() => {
    const { layers, selectedId, scaleMode } = useStore.getState()

    /*
     * Only the selected body, and only a body that has names.
     *
     * Not "every body near the camera": at a moon system that would label
     * three worlds at once, and the labels of the one you are not looking at
     * would sit over the one you are.
     */
    const body = selectedId ? BODIES_BY_ID[selectedId] : null
    const features = body && layers.features ? FEATURES_BY_BODY[body.id] : null
    const position = body ? planetPositions.get(body.id) : null
    const spin = body ? surfaceSpin(body.id) : null

    if (!features || !position || spin === null || !bodyShown(body, layers)) {
      if (lastList.current.key !== '') {
        lastList.current = { at: 0, key: '' }
        publishFeatures([])
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

    // How big the body itself is, for the features the register never sized.
    const bodyPx = (radius / distance) * focalPx

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
      if (feature.km > 0 ? px < MIN_PIXELS : bodyPx < UNSIZED_BODY_PIXELS) continue

      surfaceDirection(feature.lat, feature.lon, _worldDir).applyQuaternion(_quaternion)
      _point.copy(_worldDir).multiplyScalar(radius).add(position)
      _toCamera.subVectors(camera.position, _point).normalize()
      if (_worldDir.dot(_toCamera) < FACING) continue

      shortlist.push({ feature, x: _point.x, y: _point.y, z: _point.z })
      if (shortlist.length > MAX_LABELS * 3) break
    }

    // The largest few, since the list is already in size order per body.
    const chosen = shortlist.slice(0, MAX_LABELS)

    /*
     * Publish the *set* only when it changes, and never more than a few times a
     * second: this crosses into React, and the positions below do not.
     */
    const key = chosen.map((c) => c.feature.name).join('|')
    const now = performance.now()
    if (key !== lastList.current.key && now - lastList.current.at > LIST_INTERVAL_MS) {
      lastList.current = { at: now, key }
      publishFeatures(chosen.map((c) => c.feature))
    }

    // And place whatever the overlay has actually rendered.
    placed.current.clear()
    for (const item of chosen) placed.current.set(item.feature.name, item)

    for (const [name, node] of featureNodes) {
      const item = placed.current.get(name)
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
