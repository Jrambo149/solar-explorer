/**
 * Proof that two differently-patched materials cannot share a compiled program.
 *
 * This exists because they did, and it cost Earth its city lights.
 *
 * `onBeforeCompile` is not a per-material shader. three.js runs it, then asks
 * `WebGLPrograms.acquireProgram` for a program matching the material's cache
 * key — and if one already exists anywhere in the renderer, that one is handed
 * back and the source `onBeforeCompile` just produced is discarded. The default
 * key is `Material.customProgramCacheKey()`, which is `onBeforeCompile
 * .toString()`.
 *
 * Every body in this scene gets its `onBeforeCompile` from the single closure
 * inside `attachShadows`, so every body stringified to the same key. Earth,
 * Mars and Neptune are otherwise identical — MeshStandardMaterial, a colour map,
 * no normal map — so all three hashed to one program, and whichever compiled
 * first decided whether the night-lights code was in it. Toggling the bloom
 * pass flips `renderer.toneMapping`, which invalidates every program and reruns
 * that race in render order. Hence: the sun-glow button turning Earth's cities
 * on and off.
 *
 * The three assertions below are the whole contract. Note that the third one
 * matters as much as the first two — collapsing every body onto its own program
 * would fix the bug and cost twenty-odd redundant shader compiles.
 *
 * Run with: npm run verify:shaders
 */

import * as THREE from 'three'
import { attachShadows, shadowUniforms, tagShaderVariant } from '../src/scene/shadows.js'
import { attachNightLights } from '../src/scene/nightLights.js'

let failures = 0

function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

/** A body as `Body.jsx` builds it: shadows always, night lights only on Earth. */
function body({ night = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: new THREE.Texture() })
  if (night) attachNightLights(mat, new THREE.Texture())
  attachShadows(mat, shadowUniforms())
  return mat
}

const earth = body({ night: true })
const mars = body()
const neptune = body()

console.log('\nProgram cache keys')
console.log(`  earth    ${earth.customProgramCacheKey()}`)
console.log(`  mars     ${mars.customProgramCacheKey()}`)

check(
  'Earth does not share a cache key with an ordinary mapped body',
  earth.customProgramCacheKey() !== mars.customProgramCacheKey(),
  'if these match, Earth silently inherits Mars’s shader',
)

check(
  'two ordinary bodies still share one key',
  mars.customProgramCacheKey() === neptune.customProgramCacheKey(),
  'distinct keys here would mean a redundant compile per body',
)

/*
 * And the patches themselves still land. A cache key that merely *differs* is
 * no use if the injection points have drifted out from under the string
 * replacements — that failure mode is silent in exactly the same way.
 */
function patch(material) {
  const shader = {
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader:
      '#include <common>\n#include <lights_fragment_end>\n#include <tonemapping_fragment>',
    uniforms: {},
  }
  material.onBeforeCompile(shader)
  return shader
}

const earthShader = patch(earth)
const marsShader = patch(mars)

check(
  'Earth’s fragment shader carries both patches',
  earthShader.fragmentShader.includes('uNightMap') &&
    earthShader.fragmentShader.includes('sunVisibility'),
  'night lights and shadows must survive being chained',
)

check(
  'an ordinary body carries shadows only',
  marsShader.fragmentShader.includes('sunVisibility') &&
    !marsShader.fragmentShader.includes('uNightMap'),
)

/* The tag helper itself: order-independent, and idempotent. */
const a = new THREE.MeshStandardMaterial()
tagShaderVariant(a, 'shadows')
tagShaderVariant(a, 'shadows')
check('tagging twice is idempotent', a.customProgramCacheKey() === 'shadows')

console.log(`\n${failures === 0 ? 'All shader-variant checks passed.' : `${failures} failed.`}`)
process.exit(failures === 0 ? 0 : 1)
