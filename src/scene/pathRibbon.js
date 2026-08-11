/**
 * A polyline drawn at a width measured in pixels, tapering along its length.
 *
 * Shared by orbit lines and trails, which differ only in their uniforms. Both
 * are the same object in Eyes too — a ribbon of quads expanded in the vertex
 * shader — and the reason is the same in both engines: `THREE.Line` compiles to
 * `gl.LINES`, and WebGL ignores `linewidth` entirely. Every core desktop driver
 * draws exactly one pixel no matter what the material asks for, which is why
 * `lineBasicMaterial` cannot express "1.2 px" or "taper from 0 to 2 px". The
 * only way to get a controllable width is to build the ribbon yourself and
 * offset its edges perpendicular to the path, in screen space, per frame.
 *
 * The geometry is a strip: two vertices per path sample, `side` -1 and +1, which
 * the shader pushes apart by half the local width along the screen-space normal
 * of the segment. Each vertex also carries its neighbours' positions, because
 * the normal at a sample is the average of the two adjoining segments' normals —
 * mitring the joins so that a tight bend (Mercury at perihelion) does not tear
 * open on the outside of the turn.
 *
 * ## Where the taper comes from
 *
 * `index` is the vertex's position along the path, and `uIndexStart` is where
 * the *tail* of the trail currently sits — the point the taper counts up from.
 * The shader derives
 *
 *     indexU = fract((index - uIndexStart) / uIndexLength)   // 0 tail, 1 head
 *
 * so the head is the vertex just *below* `uIndexStart`, and setting it to the
 * body's own station puts the head on the body. This comment used to call
 * `uIndexStart` the head, and `BodyPath` duly offset it by one station to
 * compensate — which pushed the bright tip a whole segment past the body it was
 * supposed to be trailing.
 *
 * and interpolates both width and alpha over it. Because the head is a uniform
 * rather than a property of the geometry, a trail sweeps around its orbit
 * without a single vertex being rewritten: the ellipse is built once at mount
 * and the taper rotates over it. That is exactly Eyes' `indexStart` scheme, and
 * it is what makes twenty-odd trails cost twenty-odd uniform writes a frame.
 *
 * An orbit line is the degenerate case: equal widths, `uAlphaFade` of 1, so the
 * interpolation is flat and `uIndexStart` is irrelevant.
 */

import * as THREE from 'three'

/**
 * Builds the ribbon geometry for a closed path.
 *
 * @param {Array<{x:number,y:number,z:number}>} points path samples, in order,
 *   not repeating the first point at the end — the loop is closed here.
 * @param {boolean} closed false for a path with two ends rather than none.
 *
 * ## Open paths
 *
 * The comets brought these. Four of the thirteen are on hyperbolic
 * trajectories, which arrive from one direction and leave in another and never
 * join up — `sampleOrbit` cuts them off at a fixed distance, so the samples are
 * a curve with two ends rather than a ring.
 *
 * Two things change. The strip stops one segment short, because the segment
 * that would close a ring here is a straight chord between the two asymptotes —
 * a line drawn clean across the solar system, joining the point where the comet
 * entered to the point where it left. And the end samples clamp their
 * neighbours instead of wrapping, so the mitre at each tip is computed against
 * the segment that is really there rather than against the far end of the path.
 */
export function buildRibbonGeometry(points, closed = true) {
  const n = points.length

  // One quad per segment. A ring has `n` of them and needs the first pair
  // repeated at the end to close it; an open path has `n - 1` and does not.
  const pairs = closed ? n + 1 : n
  const segments = closed ? n : n - 1
  const curr = new Float32Array(pairs * 2 * 3)
  const prev = new Float32Array(pairs * 2 * 3)
  const next = new Float32Array(pairs * 2 * 3)
  const side = new Float32Array(pairs * 2)
  const index = new Float32Array(pairs * 2)

  for (let i = 0; i < pairs; i++) {
    const at = i % n
    const p = points[at]
    const before = closed ? points[(at - 1 + n) % n] : points[Math.max(0, at - 1)]
    const after = closed ? points[(at + 1) % n] : points[Math.min(n - 1, at + 1)]

    for (let s = 0; s < 2; s++) {
      const v = (i * 2 + s) * 3
      curr[v] = p.x
      curr[v + 1] = p.y
      curr[v + 2] = p.z
      prev[v] = before.x
      prev[v + 1] = before.y
      prev[v + 2] = before.z
      next[v] = after.x
      next[v + 1] = after.y
      next[v + 2] = after.z
      side[i * 2 + s] = s === 0 ? -1 : 1
      // The closing pair carries index `n`, which the shader's `mod` resolves to
      // the same station as index 0 — they are the same point on the ellipse, so
      // they must taper identically. It also means the final segment is where
      // `indexU` wraps from ~1 back to 0: a hard cut from full width to nothing,
      // which is exactly what the head of a trail should look like.
      index[i * 2 + s] = i
    }
  }

  // Two triangles per segment, wound consistently. `side: DoubleSide` on the
  // material means winding does not actually matter for visibility, but getting
  // it right keeps the strip usable if that ever changes.
  const triangles = new Uint32Array(segments * 6)
  for (let i = 0; i < segments; i++) {
    const a = i * 2
    triangles[i * 6] = a
    triangles[i * 6 + 1] = a + 1
    triangles[i * 6 + 2] = a + 2
    triangles[i * 6 + 3] = a + 1
    triangles[i * 6 + 4] = a + 3
    triangles[i * 6 + 5] = a + 2
  }

  const geometry = new THREE.BufferGeometry()
  // `position` has to exist and hold the real coordinates: three.js computes the
  // bounding sphere from it for frustum culling, and the shader ignores it in
  // favour of the three explicit neighbour attributes.
  geometry.setAttribute('position', new THREE.BufferAttribute(curr, 3))
  geometry.setAttribute('aPrev', new THREE.BufferAttribute(prev, 3))
  geometry.setAttribute('aNext', new THREE.BufferAttribute(next, 3))
  geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
  geometry.setAttribute('aIndex', new THREE.BufferAttribute(index, 1))
  geometry.setIndex(new THREE.BufferAttribute(triangles, 1))
  geometry.computeBoundingSphere()

  return geometry
}

/**
 * An open ribbon whose points are rewritten every frame.
 *
 * `buildRibbonGeometry` bakes a fixed curve, which is right for an orbit: an
 * ellipse is the same ellipse next frame. A spacecraft trail is not — it is a
 * *window* of time sliding along the trajectory, so the points it covers change
 * continuously and a new geometry per frame would allocate four typed arrays per
 * craft per frame and hand the whole lot to the collector.
 *
 * So the buffers are allocated once at the maximum length and refilled in place.
 * The index buffer never changes at all: a strip's triangles depend only on
 * vertex *number*, so it is written once here and the draw range is narrowed to
 * however many points the window currently spans.
 */
export function allocRibbonGeometry(maxPoints) {
  const curr = new Float32Array(maxPoints * 2 * 3)
  const prev = new Float32Array(maxPoints * 2 * 3)
  const next = new Float32Array(maxPoints * 2 * 3)
  const side = new Float32Array(maxPoints * 2)
  const index = new Float32Array(maxPoints * 2)

  for (let i = 0; i < maxPoints; i++) {
    side[i * 2] = -1
    side[i * 2 + 1] = 1
    index[i * 2] = i
    index[i * 2 + 1] = i
  }

  const triangles = new Uint32Array((maxPoints - 1) * 6)
  for (let i = 0; i < maxPoints - 1; i++) {
    const a = i * 2
    triangles[i * 6] = a
    triangles[i * 6 + 1] = a + 1
    triangles[i * 6 + 2] = a + 2
    triangles[i * 6 + 3] = a + 1
    triangles[i * 6 + 4] = a + 3
    triangles[i * 6 + 5] = a + 2
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(curr, 3))
  geometry.setAttribute('aPrev', new THREE.BufferAttribute(prev, 3))
  geometry.setAttribute('aNext', new THREE.BufferAttribute(next, 3))
  geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
  geometry.setAttribute('aIndex', new THREE.BufferAttribute(index, 1))
  geometry.setIndex(new THREE.BufferAttribute(triangles, 1))
  geometry.setDrawRange(0, 0)
  return geometry
}

/**
 * Refills a geometry from `allocRibbonGeometry`. Always an open path.
 *
 * `points` is a flat `[x, y, z, x, y, z, ...]` rather than an array of vectors,
 * because the caller is producing it a few hundred entries at a time every frame
 * and objects would be the allocation this whole mechanism exists to avoid.
 */
export function fillRibbonGeometry(geometry, points, count) {
  const position = geometry.getAttribute('position')
  const prev = geometry.getAttribute('aPrev')
  const next = geometry.getAttribute('aNext')

  const curr = position.array
  const before = prev.array
  const after = next.array

  for (let i = 0; i < count; i++) {
    // Ends clamp their neighbour instead of wrapping, so the mitre at each tip
    // is computed against the segment that is really there — the same reasoning
    // as the open branch of `buildRibbonGeometry`.
    const b = Math.max(0, i - 1) * 3
    const a = Math.min(count - 1, i + 1) * 3
    const p = i * 3

    for (let s = 0; s < 2; s++) {
      const v = (i * 2 + s) * 3
      curr[v] = points[p]
      curr[v + 1] = points[p + 1]
      curr[v + 2] = points[p + 2]
      before[v] = points[b]
      before[v + 1] = points[b + 1]
      before[v + 2] = points[b + 2]
      after[v] = points[a]
      after[v + 1] = points[a + 1]
      after[v + 2] = points[a + 2]
    }
  }

  position.needsUpdate = true
  prev.needsUpdate = true
  next.needsUpdate = true
  geometry.setDrawRange(0, Math.max(0, count - 1) * 6)
}

const VERTEX = /* glsl */ `
  attribute vec3 aPrev;
  attribute vec3 aNext;
  attribute float aSide;
  attribute float aIndex;

  uniform vec2 uViewport;
  uniform float uWidthMin;
  uniform float uWidthMax;
  uniform float uIndexStart;
  uniform float uIndexLength;
  uniform float uHeadIndex;
  uniform float uOpen;
  uniform vec3 uHeadPos;

  varying float vIndexU;

  /* The renderer uses a logarithmic depth buffer, and a hand-written
     ShaderMaterial has to opt in or it writes ordinary perspective depth into a
     buffer everything else fills logarithmically. At this scene's range that is
     not a subtle inconsistency: with a near plane of 0.001 the ordinary depth of
     a fragment 3,000 units away sits about five 24-bit quanta below the cleared
     value, so the outer planets' orbit lines start losing the depth test at true
     scale and simply disappear. See the fuller note in Starfield.jsx, where the
     same omission cost most of the sky.

     No backticks anywhere in these shader comments: this is a template literal,
     and one would end the string. */
  #include <common>
  #include <logdepthbuf_pars_vertex>

  /* Clip space to pixels. Dividing by w is the perspective divide; a vertex
     behind the camera comes back with w <= 0, which is handled by clamping
     rather than by branching, since both edges of a quad must agree. */
  vec2 toPixels(vec4 clip) {
    return (clip.xy / max(clip.w, 1e-6)) * uViewport * 0.5;
  }

  void main() {
    /* The taper, and why an open path cannot use the same wrap.

       The wrap is what makes a trail work on a closed orbit: three hundred
       samples forward of the head wraps around the ellipse and really is two
       hundred samples *behind* it, so it should be drawn at the brightness of a
       trail that old. There is no wrap on a hyperbola: a sample forward of the
       comet is its future, and the wrap was drawing it as though it were the
       oldest part of the trail. Measured over the five open comets, the leg
       ahead of the nucleus ran to 17% alpha for 3I/ATLAS and 6% for the rest —
       faint, but spread across tens of AU at true scale, which reads as a line
       continuing out past the body along a path it has not travelled yet.

       So an open path counts up to the head and stops. Everything beyond is
       collapsed onto the head below rather than merely faded, because a
       zero-alpha vertex still anchors a quad: left in place it stretched a
       degenerate sliver from the nucleus out to the next sample, which at true
       scale is its own visible spike. */
    float travelled = uOpen > 0.5
      ? aIndex - uIndexStart + uIndexLength
      : mod(aIndex - uIndexStart + uIndexLength, uIndexLength);
    vIndexU = clamp(travelled / uIndexLength, 0.0, 1.0);

    float ahead = uOpen > 0.5 && aIndex > uIndexStart ? 1.0 : 0.0;

    /* Pin the head of the trail to the body.

       The ribbon is a 512-point polyline sampled once at mount, so its brightest
       vertex is wherever a sample happens to fall, not where the body is. At
       diorama scale nobody could tell: one segment of Titan's orbit is six of
       its radii. At true scale the same segment is 1,642 radii for Himalia and
       459,900 for Valetudo, against a parked shot about seven radii wide — so
       the trail simply did not reach the moon it belonged to.

       Exactly one vertex satisfies this, the last one at or behind the body, and
       moving it costs two uniforms rather than a rewritten vertex buffer. Its
       neighbours still mitre against the un-snapped sample, which is a sub-pixel
       error in the joint and not worth four more attributes to remove. */
    vec3 pos = position;
    if (uHeadIndex >= 0.0 && aIndex > uHeadIndex - 1.0 && aIndex <= uHeadIndex) {
      pos = uHeadPos;
    }
    // Everything past the head on an open path collapses onto the nucleus, so
    // the future leg occupies no space at all rather than a zero-width sliver.
    if (ahead > 0.5 && uHeadIndex >= 0.0) pos = uHeadPos;

    vec4 clipCurr = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    vec4 clipPrev = projectionMatrix * modelViewMatrix * vec4(aPrev, 1.0);
    vec4 clipNext = projectionMatrix * modelViewMatrix * vec4(aNext, 1.0);

    vec2 pxCurr = toPixels(clipCurr);
    vec2 pxPrev = toPixels(clipPrev);
    vec2 pxNext = toPixels(clipNext);

    /* The mitred normal: average the two adjoining segment directions so the
       offset bisects the corner. Degenerate segments (two samples projecting to
       the same pixel, which happens when a path is nearly edge-on) fall back to
       whichever neighbour is still distinct. */
    vec2 dirIn = pxCurr - pxPrev;
    vec2 dirOut = pxNext - pxCurr;
    float lenIn = length(dirIn);
    float lenOut = length(dirOut);
    vec2 dir = vec2(1.0, 0.0);
    if (lenIn > 1e-6 && lenOut > 1e-6) dir = normalize(normalize(dirIn) + normalize(dirOut));
    else if (lenIn > 1e-6) dir = dirIn / lenIn;
    else if (lenOut > 1e-6) dir = dirOut / lenOut;

    vec2 normal = vec2(-dir.y, dir.x);

    float width = mix(uWidthMin, uWidthMax, vIndexU) * (1.0 - ahead);
    vec2 offset = normal * aSide * width * 0.5;

    /* Back to clip space. The offset is in pixels, so it scales by w to survive
       the perspective divide the GPU is about to perform — this is what keeps
       the width constant on screen however far away the path is. */
    gl_Position = clipCurr;
    gl_Position.xy += (offset / (uViewport * 0.5)) * max(clipCurr.w, 1e-6);

    /* After gl_Position is final. The chunk reads only its w component, which
       the pixel offset above leaves untouched, so the ribbon's depth is the
       path's own depth. */
    #include <logdepthbuf_vertex>
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColour;
  uniform float uAlpha;
  uniform float uAlphaFade;
  uniform float uAlphaMultiplier;

  varying float vIndexU;

  #include <common>
  #include <logdepthbuf_pars_fragment>

  void main() {
    #include <logdepthbuf_fragment>

    float fade = mix(uAlphaFade, 1.0, vIndexU);
    gl_FragColor = vec4(uColour, uAlpha * fade * uAlphaMultiplier);
    if (gl_FragColor.a <= 0.0) discard;
  }
`

/**
 * The material for a path ribbon.
 *
 * `additive` selects a trail's blending, which is what Eyes uses for its trail
 * shader; orbit lines get normal blending, which is what its `LineMesh` uses and
 * also what this scene already settled on for a drawn path — an additively
 * blended line over black can only ever add light, so its faded tail glows
 * instead of receding.
 *
 * `toneMapped` has no effect on a `ShaderMaterial` (that flag patches the
 * built-in materials' output), so ACES never touches these colours and the
 * transcribed values reach the framebuffer as authored. Same reason
 * `Starfield.jsx` writes its colour straight out.
 */
export function makeRibbonMaterial({ colour, alpha, additive }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColour: { value: new THREE.Color(colour[0], colour[1], colour[2]) },
      uAlpha: { value: alpha },
      uAlphaFade: { value: 1 },
      uAlphaMultiplier: { value: 1 },
      uWidthMin: { value: 1 },
      uWidthMax: { value: 1 },
      uIndexStart: { value: 0 },
      uIndexLength: { value: 1 },
      /*
       * Where the body actually is, and which vertex should be moved onto it.
       *
       * `uHeadIndex` is the body's fractional station; negative disables the
       * whole mechanism, which is what an orbit line wants — it is a complete
       * static ellipse and denting one vertex of it would be a defect.
       */
      uHeadIndex: { value: -1 },
      /*
       * 1 for a path with two ends, 0 for a ring. Decides whether the taper
       * wraps — see the note in the vertex shader. A ring must wrap; a
       * hyperbola must not, or the comet's future is drawn as its past.
       */
      uOpen: { value: 0 },
      uHeadPos: { value: new THREE.Vector3() },
      uViewport: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
}
