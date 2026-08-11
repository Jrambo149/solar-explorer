import * as THREE from 'three'
import { tagShaderVariant } from './shadows.js'

/**
 * Adds night-side city lights to a standard material.
 *
 * The lights have to appear only where the surface faces away from the Sun, so
 * we need the world normal and the Sun direction in the fragment shader —
 * neither of which MeshStandardMaterial provides. Rather than hand-write a
 * whole PBR shader, we patch the stock one: a world-normal varying goes in,
 * and the emissive term is added just before tone mapping so it lands in
 * linear space along with everything else.
 *
 * Lives in its own module rather than in `Body.jsx` so `verify-shaders.mjs` can
 * import it in Node and check it against the real `attachShadows`. It is the
 * pairing of the two that went wrong, so a test that could only see one of them
 * would have proved nothing.
 */
export function attachNightLights(material, nightMap) {
  // Without this Earth shares a compiled program with any other plain mapped
  // sphere and loses the lights entirely. See `tagShaderVariant`.
  tagShaderVariant(material, 'night-lights')

  material.userData.uSunDirection = { value: new THREE.Vector3(0, 0, 1) }
  // Pushed well above 1 because the squaring below crushes the map's dim
  // airglow; this brings the actual cities back up to where they read.
  material.userData.uNightIntensity = { value: 2.6 }

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNightMap = { value: nightMap }
    shader.uniforms.uSunDirection = material.userData.uSunDirection
    shader.uniforms.uNightIntensity = material.userData.uNightIntensity

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNightNormal;')
      // objectNormal is set up by <beginnormal_vertex>, which runs earlier.
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvNightNormal = normalize(mat3(modelMatrix) * objectNormal);',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uNightMap;
         uniform vec3 uSunDirection;
         uniform float uNightIntensity;
         varying vec3 vNightNormal;`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `{
           float lambert = dot(normalize(vNightNormal), uSunDirection);
           // Fades in through the terminator rather than switching on at it.
           float nightMask = smoothstep(0.08, -0.24, lambert);
           vec3 lights = texture2D(uNightMap, vMapUv).rgb;
           // Squaring approximates sRGB->linear and crushes the dim airglow,
           // so only actual city lights survive.
           gl_FragColor.rgb += lights * lights * nightMask * uNightIntensity;
         }
         #include <tonemapping_fragment>`,
      )
  }

  // Changing onBeforeCompile after first compile needs a new program.
  material.needsUpdate = true
}
