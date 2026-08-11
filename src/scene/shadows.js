/**
 * Analytic shadows.
 *
 * Nothing in this scene casts a shadow through a shadow map, and that is a
 * deliberate choice rather than a shortcut. A shadow map is a depth render from
 * the light's point of view, and the light here is a point light at the Sun
 * covering a scene that runs from a moon a fraction of a unit across out past
 * Neptune. One cube map spanning that would give Phobos a shadow a few
 * millionths of a texel wide. The usual fixes — cascades, per-object maps — all
 * amount to rendering the scene many more times for shapes whose shadows have
 * exact closed forms.
 *
 * Because every occluder here is a sphere or a flat annulus, the shadow can be
 * solved per fragment instead:
 *
 *   sphere    the angular radius of the occluder against the angular radius of
 *             the Sun, from the fragment's own point of view
 *   ring      trace toward the Sun, intersect the ring plane, sample the ring
 *             texture's alpha at that radius
 *
 * Both are a handful of instructions, exact at any zoom, and free of the
 * resolution, acne and peter-panning problems a shadow map brings.
 *
 * ## These are shadows of what is *drawn*, not of the real solar system
 *
 * At the default compressed scale a moon's orbit is squeezed and the bodies are
 * drawn far larger than life, so eclipses happen much more often here than they
 * do in the sky. That is correct for this app: the alternative is a body that
 * visibly passes in front of another in full sunlight. The lighting agrees with
 * the geometry on screen, and at true scale the geometry is real, so the
 * shadows become real with it.
 */

import * as THREE from 'three'
import { poleDirection } from './pole.js'

/**
 * Occluder slots per material.
 *
 * A body is only ever shadowed by something in its own system — a moon by its
 * planet or a sibling, a planet by its own moons — so this never needs to be
 * the whole scene. Eight covers Jupiter's four Galileans with room for the
 * moons still to be added, and unused slots cost nothing because the loop
 * breaks at the live count.
 */
export const MAX_OCCLUDERS = 8

/** Fraction of light a fully opaque patch of ring blocks. */
const RING_OPACITY = 0.9

export function shadowUniforms() {
  return {
    uOccluders: {
      value: Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector4(0, 0, 0, 0)),
    },
    uOccluderCount: { value: 0 },
    uSunRadius: { value: 1 },

    uRingMap: { value: null },
    uRingCentre: { value: new THREE.Vector3() },
    uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
    uRingInner: { value: 0 },
    uRingOuter: { value: 0 },
    uHasRings: { value: 0 },
  }
}

const DECLARATIONS = /* glsl */ `
  uniform vec4 uOccluders[${MAX_OCCLUDERS}];
  uniform int uOccluderCount;
  uniform float uSunRadius;

  uniform sampler2D uRingMap;
  uniform vec3 uRingCentre;
  uniform vec3 uRingNormal;
  uniform float uRingInner;
  uniform float uRingOuter;
  uniform float uHasRings;

  varying vec3 vShadowWorld;

  /**
   * How much of the Sun's disc survives, at a point in world space.
   *
   * Worked in angles rather than distances, which is what makes it behave
   * correctly at every scale and gives a real penumbra for free: the Sun is not
   * a point, so a shadow edge is the occluder's disc sliding across the Sun's
   * disc, and the width of that transition depends on how far away both are.
   *
   * The final clamp is the part worth keeping. An occluder whose angular radius
   * is smaller than the Sun's can never black it out completely no matter how
   * exactly it lines up — it can only take a bite out of it, and the biggest
   * bite is the ratio of the two areas. That is an annular eclipse, and it is
   * why a small moon crossing a planet dims it slightly rather than punching a
   * black hole in it.
   */
  float sunVisibility(vec3 P) {
    vec3 toSun = -P;
    float sunDist = length(toSun);
    if (sunDist < 1e-5) return 1.0;

    vec3 L = toSun / sunDist;
    float sunAngle = uSunRadius / sunDist;
    float visible = 1.0;

    for (int i = 0; i < ${MAX_OCCLUDERS}; i++) {
      if (i >= uOccluderCount) break;

      vec3 delta = uOccluders[i].xyz - P;
      float dist = length(delta);
      float radius = uOccluders[i].w;
      if (radius <= 0.0 || dist < 1e-5) continue;

      vec3 dir = delta / dist;
      float align = dot(dir, L);
      // Behind the fragment, or further away than the Sun: cannot occlude.
      if (align <= 0.0 || dist - radius > sunDist) continue;

      float occAngle = radius / dist;
      float separation = acos(clamp(align, -1.0, 1.0));

      // 1 at full overlap, 0 once the discs have pulled apart.
      float overlap = smoothstep(occAngle + sunAngle, max(occAngle - sunAngle, 0.0), separation);
      float deepest = clamp((occAngle * occAngle) / (sunAngle * sunAngle), 0.0, 1.0);

      visible = min(visible, 1.0 - overlap * deepest);
    }

    return visible;
  }

  /**
   * The rings' shadow on the planet they belong to.
   *
   * Traces from the fragment toward the Sun and asks where that ray crosses the
   * ring plane. Inside the annulus, the ring texture's own alpha at that radius
   * says how much light gets through — so the Cassini Division draws itself as
   * a bright stripe across the planet without being modelled anywhere, which is
   * exactly what it does in a photograph.
   */
  float ringVisibility(vec3 P) {
    if (uHasRings < 0.5) return 1.0;

    vec3 L = normalize(-P);
    float denom = dot(L, uRingNormal);
    // Sun in the ring plane: the rings are edge-on and cast a line, not a band.
    if (abs(denom) < 1e-4) return 1.0;

    float t = dot(uRingCentre - P, uRingNormal) / denom;
    if (t <= 0.0) return 1.0;

    float r = length(P + L * t - uRingCentre);
    if (r < uRingInner || r > uRingOuter) return 1.0;

    float u = (r - uRingInner) / (uRingOuter - uRingInner);
    return 1.0 - texture2D(uRingMap, vec2(u, 0.5)).a * ${RING_OPACITY.toFixed(2)};
  }
`

/**
 * Declares which shader patches a material carries, so three.js can tell two
 * differently-patched materials apart.
 *
 * This is not decoration. `WebGLPrograms.acquireProgram` matches on cache key
 * across the *entire* renderer: run `onBeforeCompile`, then hand back any
 * existing program with the same key and throw the patched source away. And the
 * default key is `Material.customProgramCacheKey()`, which is
 * `onBeforeCompile.toString()` — the same closure text for every body here,
 * because they all get it from the one `attachShadows` below.
 *
 * So Earth, Mars and Neptune — identical MeshStandardMaterials with a map and
 * no normal map — hashed to one key, and whichever compiled first supplied the
 * shader for all three. Earth kept its night lights only by winning that race.
 * Toggling the bloom pass flips `renderer.toneMapping`, which invalidates every
 * program and reruns the race in render order, so the city lights came and went
 * with the sun-glow button.
 *
 * Tagging makes the key describe the patches instead of the patcher. Bodies
 * with the same patches still share a program, which is what we want; Earth now
 * gets its own.
 */
export function tagShaderVariant(material, tag) {
  const tags = material.userData.shaderTags ?? (material.userData.shaderTags = [])
  if (!tags.includes(tag)) tags.push(tag)
  const key = tags.join('|')
  material.customProgramCacheKey = () => key
}

/**
 * Patches a stock material so its direct light is attenuated by both shadows.
 *
 * Only `directDiffuse` and `directSpecular` are touched. Ambient is what stands
 * in for starlight and scattered light here, and a shadowed surface should fall
 * to that rather than to black — which is also why an eclipsed moon goes deep
 * grey instead of vanishing.
 */
export function attachShadows(material, uniforms) {
  tagShaderVariant(material, 'shadows')
  const previous = material.onBeforeCompile

  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer)
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShadowWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvShadowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECLARATIONS}`)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
         {
           float shade = sunVisibility(vShadowWorld) * ringVisibility(vShadowWorld);
           reflectedLight.directDiffuse *= shade;
           reflectedLight.directSpecular *= shade;
         }`,
      )
  }

  material.needsUpdate = true
}

const scratch = new THREE.Vector3()

/**
 * Fills the occluder slots from a list of `{ position, radius }`.
 *
 * Called every frame, so it writes into the existing Vector4s rather than
 * allocating. Anything past `MAX_OCCLUDERS` is dropped, nearest first — with
 * eight slots against at most a handful of moons that never happens today.
 */
export function setOccluders(uniforms, occluders) {
  const slots = uniforms.uOccluders.value
  const count = Math.min(occluders.length, MAX_OCCLUDERS)

  for (let i = 0; i < count; i++) {
    const { position, radius } = occluders[i]
    slots[i].set(position.x, position.y, position.z, radius)
  }

  uniforms.uOccluderCount.value = count
}

/**
 * The ring plane's normal in world space, which is simply the planet's pole.
 *
 * Takes a body id rather than an angle. It used to reconstruct the normal from
 * `axialTilt` — `(-sin t, cos t, 0)`, correct for a lean about Z and correct
 * for nothing else once the orientation came from the IAU pole. Reading the
 * pole means the rings cannot end up in a different plane from the planet
 * wearing them, which is the failure this shape of duplication invites.
 */
export function ringNormal(bodyId, out = scratch) {
  const pole = poleDirection(bodyId)
  return out.set(pole.x, pole.y, pole.z)
}
