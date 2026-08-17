import { R0 } from '../data/galaxy.js'
import { SPRITE_MIRRORED, SPRITE_RADIUS_KPC, SPRITE_ROTATION } from '../data/galaxySprite.js'
import { galacticToWorld } from './sky.js'

/**
 * Where the face-on Milky Way image goes, and which way round.
 *
 * Kept out of the component so `verify-galaxy` can re-derive the same placement
 * without a browser. A check that computed the layout by calling the layout
 * function would be worthless; one that starts from galactic coordinates and
 * compares against what is drawn is a real test of the mapping.
 *
 * Everything here is in **kiloparsecs**.
 */

const D = Math.PI / 180

/** An arm's radius at a galactocentric azimuth, in kpc — Reid's log spiral. */
export const armRadius = (arm, beta) =>
  arm.Rref * Math.exp(-(beta - arm.betaref) * D * Math.tan(arm.psi * D))

/**
 * Galactocentric plane coordinates to a position on the image, in kpc.
 *
 * `x` runs from the Galactic centre toward the Sun, `y` toward galactic
 * rotation. The result is measured in the image's own frame — right and up as
 * the picture is drawn — with the Galactic centre at the origin.
 *
 * The rotation and the mirror are the ones `fetch-galaxy-sprite.mjs` measured
 * against Reid's arms, and the mirror is applied *before* the rotation to match
 * that fit exactly. Doing it after would be a different transform at every angle
 * but zero, which is the one place a spot check would be most tempted to look.
 */
export function galaxyImagePoint(x, y, out = { x: 0, y: 0 }) {
  const flipped = SPRITE_MIRRORED ? -y : y
  const t = SPRITE_ROTATION * D
  out.x = Math.cos(t) * x - Math.sin(t) * flipped
  out.y = Math.sin(t) * x + Math.cos(t) * flipped
  return out
}

/** The same point as a texture coordinate. */
export function galaxyUV(x, y, out = { u: 0, v: 0 }) {
  const p = galaxyImagePoint(x, y)
  out.u = 0.5 + p.x / (2 * SPRITE_RADIUS_KPC)
  out.v = 0.5 + p.y / (2 * SPRITE_RADIUS_KPC)
  return out
}

/**
 * The image's four corners, as world positions in **kiloparsecs**, with their
 * texture coordinates.
 *
 * World positions rather than a local quad, because the picture lies in the
 * galactic plane and therefore *has* a fixed attitude in the scene. It was a
 * camera-facing billboard for a while — which is what Eyes does — and that had
 * to go the moment the disc needed to be rotatable: a billboard turns to face
 * you, so orbiting it can never change how it looks, and dragging did nothing.
 *
 * Four vertices rather than a tessellated disc: the mapping across a flat quad
 * is affine, so subdividing adds nothing that linear interpolation does not
 * already get right to the float.
 *
 * Positions are heliocentric — the Sun at the origin, where the rest of the
 * scene is — so the centre of the image lands `R0` away in the direction of the
 * Galactic centre. That is what puts us two thirds of the way out on the inner
 * edge of a minor arm without anybody having to place us there, and it is why
 * the Sun's marker needs no position of its own.
 */
export function galaxyCorners() {
  const R = SPRITE_RADIUS_KPC
  const image = { x: 0, y: 0 }
  const point = { x: 0, y: 0, z: 0 }
  /*
   * The corners are given in the *image's* frame and mapped back into
   * galactocentric coordinates, which is the inverse of `galaxyImagePoint` —
   * rotate by minus the fitted angle, then undo the mirror. Going this way
   * round is what keeps the UVs exactly axis-aligned with the texture; mapping
   * galactocentric corners forward would leave the quad turned inside the
   * image and its edges sampling past the rim.
   */
  const t = -SPRITE_ROTATION * D
  return [
    [-R, -R],
    [R, -R],
    [-R, R],
    [R, R],
  ].map(([ix, iy]) => {
    image.x = Math.cos(t) * ix - Math.sin(t) * iy
    image.y = Math.sin(t) * ix + Math.cos(t) * iy
    const y = SPRITE_MIRRORED ? -image.y : image.y
    galacticToWorld(R0 - image.x, y, 0, point)
    return {
      position: [point.x, point.y, point.z],
      uv: [0.5 + ix / (2 * R), 0.5 + iy / (2 * R)],
    }
  })
}

/** The Galactic centre in world coordinates, kpc, heliocentric. */
export function galacticCentre() {
  return galacticToWorld(R0, 0, 0)
}
