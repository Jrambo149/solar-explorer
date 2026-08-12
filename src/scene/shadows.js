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

      // 1 at full overlap, 0 once the discs have pulled apart. Edges in
      // increasing order and the result inverted, because GLSL leaves
      // \`smoothstep\` undefined when the first edge is the larger — see the note
      // in \`eclipseVisibility\`, where relying on it produced no shadow at all.
      float overlap =
        1.0 - smoothstep(max(occAngle - sunAngle, 0.0), occAngle + sunAngle, separation);
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

/**
 * The uniforms an eclipse needs, in kilometres.
 *
 * Kilometres, and not world units, because an eclipse is the one shadow in this
 * app that must not be computed from what is drawn. See `orbit/eclipse.js`: at
 * diorama scale the bodies are enormous and the lunar orbit squeezed, so the
 * drawn geometry produces eclipses several times a month and in the wrong
 * places. That is the honest shadow *of the diorama*, and it is the wrong
 * answer to "where was the eclipse".
 *
 * `uEclipseRadius` is the body's drawn radius in world units, which is the only
 * thing needed to move between the two: a fragment's real offset from the
 * centre is its drawn offset divided by that and multiplied by the body's true
 * radius.
 */
export function eclipseUniforms() {
  return {
    uEclipseOcculters: {
      value: Array.from({ length: MAX_ECLIPSE_OCCULTERS }, () => new THREE.Vector4(0, 0, 0, 0)),
    },
    uEclipseAir: { value: new Float32Array(MAX_ECLIPSE_OCCULTERS) },
    uEclipseCount: { value: 0 },
    uEclipseSun: { value: new THREE.Vector3() },
    uEclipseCentre: { value: new THREE.Vector3() },
    uEclipseRadius: { value: 1 },
    uEclipseSunR: { value: 1 },
  }
}

/**
 * Real-geometry occluder slots.
 *
 * Four, set by Jupiter: the Galileans are the only group in this app that can
 * put more than one shadow on the same face at once, and the sight of two or
 * three black dots crossing together is the whole reason to compute them from
 * real geometry rather than from the diorama. Earth and the Moon use one.
 */
export const MAX_ECLIPSE_OCCULTERS = 4

/**
 * What is left of the sunlight that grazes an atmosphere, at full depth.
 *
 * This is the copper colour of a totally eclipsed Moon, and it is the one value
 * in this file chosen by eye rather than derived. Two reasons it has to be.
 *
 * The brightness is an exposure choice. A Moon in totality is something like
 * ten thousand times fainter than a full Moon, and rendered at that ratio
 * against a lit scene it would be indistinguishable from black — the copper
 * everyone has seen is what a dark-adapted eye or a long exposure makes of it,
 * not what a linear camera sees beside a sunlit Earth.
 *
 * The colour is not a constant in nature either. How red and how dark a
 * totality goes depends on how much dust and cloud is in the Earth's limb that
 * year, which is why observers grade them on the Danjon scale from a nearly
 * invisible grey to a bright coppery orange. Pinatubo made the December 1992
 * eclipse so dark the Moon almost vanished. A single value is a portrait of a
 * typical one, not a prediction.
 *
 * What *is* physical is the shape of the transition — see `eclipseVisibility`.
 */
const REFRACTED_LIGHT = /* glsl */ 'vec3(0.42, 0.11, 0.045)'

const ECLIPSE_DECLARATIONS = /* glsl */ `
  uniform vec4 uEclipseOcculters[${MAX_ECLIPSE_OCCULTERS}];
  uniform float uEclipseAir[${MAX_ECLIPSE_OCCULTERS}];
  uniform int uEclipseCount;
  uniform vec3 uEclipseSun;
  uniform vec3 uEclipseCentre;
  uniform float uEclipseRadius;
  uniform float uEclipseSunR;

  /**
   * How much of the Sun survives at a point on the surface, in real geometry.
   *
   * The same overlapping-discs solution as \`sunVisibility\`, which is what makes
   * the penumbra a genuine gradient and an annular eclipse a partial dimming
   * rather than a black spot — but evaluated at the real sizes and distances,
   * so the answer is the eclipse that actually happened rather than the one the
   * diorama would have.
   *
   * Returns a **colour**, not a fraction, because one of the three cases this
   * serves is not a plain dimming. An airless occulter — our Moon on the Earth,
   * Io on Jupiter — blocks every wavelength alike and all three channels come
   * back equal. The Earth on the Moon does not: its atmosphere refracts
   * sunlight into its own shadow, and the long grazing path through it scatters
   * the blue out, so what reaches the Moon in totality is the light of every
   * sunrise and sunset on Earth at once. That is why a totally eclipsed Moon is
   * copper rather than black, and it cannot be expressed as a scalar.
   */
  vec3 eclipseVisibility(vec3 P) {
    if (uEclipseCount == 0) return vec3(1.0);

    /*
     * Everything here is in *body radii*, and that is not a stylistic choice.
     *
     * The obvious units are kilometres, and in kilometres the Sun sits at
     * 1.5e8. A GLSL float is only guaranteed 16 bits of exponent-and-mantissa
     * range in a fragment shader — the floor for \`mediump\` is 65504 — so a
     * distance like that can arrive as infinity, and every direction derived
     * from it as a NaN. The symptom is not a wrong shadow, it is *no* shadow at
     * all, and it survives every check that looks at the JavaScript side.
     *
     * Rescaled, the largest number in this function is the Sun's distance at
     * about 23,500 body radii, and the smallest is the Moon's radius at 0.27.
     * That range is safe under any precision a fragment shader can offer.
     *
     * The fragment's own offset needs no conversion at all: it is the drawn
     * offset over the drawn radius, which is one body radius by construction.
     */
    vec3 q = (P - uEclipseCentre) / uEclipseRadius;

    vec3 toSun = uEclipseSun - q;
    float sunDist = length(toSun);
    if (sunDist < 1e-4) return vec3(1.0);

    vec3 L = toSun / sunDist;
    float sunAngle = uEclipseSunR / sunDist;

    vec3 light = vec3(1.0);

    for (int i = 0; i < ${MAX_ECLIPSE_OCCULTERS}; i++) {
      if (i >= uEclipseCount) break;

      vec3 toOcc = uEclipseOcculters[i].xyz - q;
      float occDist = length(toOcc);
      float occRadius = uEclipseOcculters[i].w;
      if (occRadius <= 0.0 || occDist < 1e-4) continue;

      vec3 M = toOcc / occDist;
      float occAngle = occRadius / occDist;

      /*
       * The occulter has to be on the Sun's side of this fragment.
       *
       * The separation below is an *unsigned* angle — it comes from a cross
       * product, which is just as small for two directions that are exactly
       * opposite as for two that coincide. So without this test a body directly
       * *behind* the fragment reads as perfectly aligned with the Sun in front
       * of it, and blots it out.
       *
       * That is a fake eclipse at every full Moon, and at every new Moon seen
       * from the Moon. It has been harmless only by luck: the anti-solar
       * direction is the middle of the night side, where there is no direct
       * light left to remove, so the wrong answer has always been multiplied by
       * zero. It stops being lucky the moment anything reads this for something
       * other than shading. \`sunVisibility\` has always had the equivalent test.
       */
      if (dot(M, L) <= 0.0) continue;
      /*
       * The angle between two nearly-parallel directions, via a cross product.
       *
       * "acos(dot(L, M))" is the obvious way to write this and it is the wrong
       * way. An eclipse happens when the two directions differ by about 0.005
       * radians, where the dot product is 1 - 1.1e-5 — and a float near 1.0
       * cannot hold that difference with any precision, so the angle comes out
       * as noise. That is why this drew no shadow at all while the identical
       * arithmetic in double-precision JavaScript gave a clean umbra.
       *
       * "asin(length(cross(L, M)))" is exact in the same place: the cross
       * product of two nearly-parallel unit vectors is small, and small floats
       * have plenty of precision.
       */
      float separation = asin(clamp(length(cross(L, M)), 0.0, 1.0));

      // Ordered edges. \`smoothstep(a, b, x)\` is *undefined* in GLSL when a > b,
      // and the natural way to write "1 when the discs overlap, 0 once they
      // have pulled apart" puts the larger edge first. Written that way this
      // returned no shadow at all on Metal while the identical arithmetic in JS
      // gave a clean umbra and penumbra. Inverting a correctly-ordered
      // smoothstep is the same function with defined behaviour.
      float overlap =
        1.0 - smoothstep(max(occAngle - sunAngle, 0.0), occAngle + sunAngle, separation);
      float deepest = clamp((occAngle * occAngle) / (sunAngle * sunAngle), 0.0, 1.0);
      float blocked = overlap * deepest;

      /*
       * What the atmosphere puts back.
       *
       * \`blocked\` is already the depth of immersion: it saturates at 1 once the
       * occulter's disc covers the Sun's — inside the umbra — and tapers to 0
       * across exactly the range of separations where the two discs overlap
       * partially, which is the penumbra. So the shape of the transition comes
       * out of the geometry rather than being drawn on.
       *
       * The **cube** is not geometry, and it is a correction rather than a
       * flourish. Fading the copper in linearly with immersion tinted the whole
       * penumbral gradient red, and a partial lunar eclipse does not look like
       * that: the penumbral part of the disc is plainly grey, because the
       * refracted light is feeble next to the direct sunlight still arriving
       * there and only wins once the direct light is gone. Rendered linearly,
       * the 28 October 2023 eclipse — 12% of the Moon's diameter in the umbra —
       * came out coppery across nearly half its face. The cube confines the
       * colour to where the umbra actually is while leaving the *dimming*
       * untouched, which is the part the geometry does know.
       *
       * For an airless occulter \`uEclipseAir\` is zero and this whole term
       * vanishes, leaving exactly the scalar dimming a black rock casts.
       */
      float deep = blocked * blocked * blocked;
      vec3 refracted = uEclipseAir[i] * ${REFRACTED_LIGHT} * deep;

      light = min(light, vec3(1.0 - blocked) + refracted);
    }

    return light;
  }
`

/**
 * Adds the real-geometry eclipse shadow to a body that already has `attachShadows`.
 *
 * Separate from `attachShadows` rather than folded into it because only a few
 * bodies have an eclipse worth computing, and because the two answer different
 * questions — one is the lighting of the scene as drawn, the other is a fact
 * about the sky on a date. `tagShaderVariant` keeps them apart in the program
 * cache; without it Earth would silently inherit another planet's compiled
 * shader. See the note on `tagShaderVariant`.
 */
export function attachEclipse(material, uniforms) {
  tagShaderVariant(material, 'eclipse')
  const previous = material.onBeforeCompile

  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer)
    Object.assign(shader.uniforms, uniforms)

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ECLIPSE_DECLARATIONS}`)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
         {
           vec3 eclipse = eclipseVisibility(vShadowWorld);
           reflectedLight.directDiffuse *= eclipse;
           // Specular takes the luminance rather than the tint. A highlight is
           // an image of the source, and the refracted light does not arrive
           // from a disc — it comes from the whole ring of the Earth's lit limb,
           // which is far too diffuse to make a coloured glint of.
           reflectedLight.directSpecular *= dot(eclipse, vec3(0.2126, 0.7152, 0.0722));
         }`,
      )
  }

  material.needsUpdate = true
}

/**
 * Uploads a `realShadowsOn` result, plus where the body is drawn.
 *
 * `centre` and `drawnRadius` are the only two numbers that cross between the
 * real solar system and the diorama, and they are all that is needed: a
 * fragment's offset from the centre divided by the drawn radius is its offset
 * in body radii, which is the unit everything else here is already in.
 */
export function setEclipse(uniforms, shadows, centre, drawnRadius) {
  if (!shadows) {
    uniforms.uEclipseCount.value = 0
    return
  }

  const slots = uniforms.uEclipseOcculters.value
  const air = uniforms.uEclipseAir.value
  const count = Math.min(shadows.count, MAX_ECLIPSE_OCCULTERS)

  for (let i = 0; i < count; i++) {
    const o = shadows.occulters[i]
    slots[i].set(o.x, o.y, o.z, o.radius)
    air[i] = o.air
  }

  uniforms.uEclipseCount.value = count
  uniforms.uEclipseSun.value.set(shadows.sun.x, shadows.sun.y, shadows.sun.z)
  uniforms.uEclipseSunR.value = shadows.sun.radius
  uniforms.uEclipseCentre.value.copy(centre)
  uniforms.uEclipseRadius.value = drawnRadius
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
