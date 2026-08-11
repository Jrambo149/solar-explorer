import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { warpSunRadius } from '../orbit/frames'
import { getTexture } from '../textures'
import { simClock, useStore } from '../store/useStore'
import { spinAt } from '../orbit/kepler'
import Prominences from './Prominences'
import SunShells from './SunShells'

/**
 * Draw the sun as the Blender model's three shells, or as the original sphere.
 *
 * The model gives the photosphere real relief — its limb is subtly irregular
 * rather than a drawn circle — and adds `Solar_Fire`, a shell displaced at full
 * strength that boils around the surface. It costs 956 KB and three draw calls
 * where the sphere cost none.
 *
 * Kept as a switch rather than a deletion because the two are a genuine matter
 * of taste, and the sphere is what the rest of the scene's lighting was tuned
 * against.
 */
const USE_MODEL_SHELLS = true

/**
 * How hard the photosphere emits.
 *
 * Was 2.6, which drove the red channel to a flat 255 across 97% of the disc:
 * every bit of surface detail in the map was clipped away and the sun read as a
 * blown-out orange blob rather than a star.
 *
 * The value is boxed in from both sides. ACES saturates a long way below 2.6 —
 * dropping to 1.9 changed the clipped fraction not at all — so it has to come
 * down near 1.0 before the peak falls back under 255. But it cannot go below
 * 1.0, because that is the bloom pass's luminance threshold, and the threshold
 * is what keeps the sun the only thing in the scene that blooms: a close-up of
 * Jupiter's lit face already reaches about 0.57.
 *
 * 1.15 sits in that gap. The disc keeps its granulation and its darker limb,
 * and it still blooms.
 */
const SUN_EMISSIVE = 1.15

/** The Sun's sidereal rotation at the equator: 25.38 days. */
const SUN_ROTATION_HOURS = 609.12

/**
 * Corona size, in solar radii.
 *
 * The sprite was written at 7 radii, but a scale bug meant it never actually
 * rendered at more than about one world unit, so nobody ever saw 7. Once fixed,
 * 7 radii reaches 25 units — three quarters of the way to Earth's orbit, and it
 * swamped the inner system in orange haze. This is sized to read as a corona
 * hugging the limb, which is also what the real one looks like.
 */
const CORONA_RADII = 2.2

/**
 * The smallest half-angle the corona is allowed to subtend, in radians.
 *
 * `CORONA_RADII` sizes the corona in solar radii, which is the right thing
 * right up until the sun stops being something you can resolve. Between diorama
 * and true scale the sun shrinks from 3.6 world units to 0.465 while an AU grows
 * from 33 to 100 — about twenty-three times smaller against the scene — so at
 * true scale the whole corona lands inside a single pixel and the sun sits at
 * the middle of the system with no glow whatever. Bloom cannot rescue it: a
 * pass with a 1.0 threshold given one aliased pixel produces a hard speck that
 * flickers as the pixel moves, which is what "not smooth" looked like.
 *
 * So the corona is floored in *angle* rather than in world units — the same move
 * the shadow system makes, and for the same reason: this scene spans nine orders
 * of magnitude and only angles mean anything across all of it. Below the floor
 * the sun is drawn as what it has become, a bright star with a soft glare around
 * it, and the falloff spans enough pixels to be smooth.
 *
 * 0.018 rad is about one degree — a soft warm point at the middle of the system
 * rather than a headlight over the inner planets, which is what twice this
 * looked like.
 *
 * The crossover sits at 440 units, so at diorama scale the true size still wins
 * everywhere inside the home framing at 264 and the familiar view is untouched.
 * Zoom right out towards the 900-unit limit and the floor does take over there
 * too. That is deliberate rather than tolerated: it is the same rule either way,
 * and a sun that keeps a faint glare when it is too far to resolve is better
 * than one that quietly disappears.
 */
const MIN_CORONA_ANGLE = 0.018

/**
 * A soft radial falloff drawn on a camera-facing quad, used for the corona.
 * Generated once as a canvas texture — cheaper and softer than a sprite sheet.
 */
function useGlowTexture() {
  return useMemo(() => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0.0, 'rgba(255, 240, 200, 0.95)')
    g.addColorStop(0.18, 'rgba(255, 190, 90, 0.55)')
    g.addColorStop(0.45, 'rgba(255, 130, 40, 0.18)')
    g.addColorStop(1.0, 'rgba(255, 100, 20, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])
}

export default function Sun() {
  const coreRef = useRef()
  const prominenceRef = useRef()
  const materialRef = useRef()
  const glowRef = useRef()
  const glowTexture = useGlowTexture()
  const map = getTexture('sun')
  const scaleMode = useStore((s) => s.scaleMode)
  const radius = warpSunRadius(scaleMode)

  useFrame((state) => {
    const t = state.clock.elapsedTime

    // Surface rotation, from the simulation clock like everything else. The Sun
    // is not a rigid body — the equator laps the poles by a third — so this is
    // the equatorial rate and is honest only near the middle of the disc.
    const spin = spinAt(simClock.jd, SUN_ROTATION_HOURS)
    if (coreRef.current) coreRef.current.rotation.y = spin
    // Same angle, so a loop stays over the patch of photosphere it erupted
    // from instead of sliding across it.
    if (prominenceRef.current) prominenceRef.current.rotation.y = spin

    // Two out-of-phase sine waves so the pulse never looks perfectly periodic.
    const pulse = Math.sin(t * 0.7) * 0.5 + Math.sin(t * 1.9 + 1.1) * 0.25
    if (materialRef.current) {
      // Held well above 1.0 so the bloom pass always picks the sun up — and
      // only the sun, since nothing else in the scene gets near that luminance.
      materialRef.current.emissiveIntensity = SUN_EMISSIVE + pulse * 0.17
    }
    if (glowRef.current) {
      // Multiply the base size rather than assigning to it. Assigning a bare
      // `1 + pulse` here used to overwrite the sprite's `scale` prop outright,
      // which quietly shrank the corona from 7 solar radii to one world unit
      // after the very first frame.
      //
      // The sun is at the origin, so the camera's distance from it is just the
      // length of its position. `Math.max` rather than a blend: the floor is a
      // floor, and while the true size is the larger of the two it is the one
      // that should be drawn, exactly as before.
      const trueSize = radius * CORONA_RADII
      const floorSize = state.camera.position.length() * MIN_CORONA_ANGLE
      const s = Math.max(trueSize, floorSize) * (1 + pulse * 0.03)
      glowRef.current.scale.set(s, s, 1)
    }
  })

  return (
    <group>
      <group ref={coreRef} scale={radius}>
        {USE_MODEL_SHELLS ? (
          <SunShells materialRef={materialRef} />
        ) : (
          <mesh>
            <sphereGeometry args={[1, 64, 48]} />
            <meshStandardMaterial
              ref={materialRef}
              map={map || undefined}
              color={map ? '#ffffff' : '#ffb03a'}
              emissive="#ff9a2e"
              emissiveMap={map || undefined}
              emissiveIntensity={SUN_EMISSIVE}
              toneMapped={false}
            />
          </mesh>
        )}
      </group>

      {/* Inside its own group rather than the core mesh, because the core is a
          unit sphere scaled by `radius` and the loops need that same scale
          without inheriting the sphere's geometry. Carries the photosphere's
          rotation so the loops turn with the surface they are rooted in. */}
      <group ref={prominenceRef} scale={radius}>
        <Prominences />
      </group>

      {/* Corona: additive, depth-write off so it layers over the core cleanly.

          Opacity came down from 0.5 in two steps, and it turned out to be the
          real reason the disc was blown out. Being additive and camera-facing,
          this sprite lays its full centre brightness over the *whole* disc, not
          just the halo — so it was adding roughly 0.38 on top of a photosphere
          already near 1.0. Cutting the bloom pass barely touched the clipping
          (61% to 62%); cutting this is what let the surface come back. */}
      <sprite ref={glowRef} scale={[radius * CORONA_RADII, radius * CORONA_RADII, 1]}>
        <spriteMaterial
          map={glowTexture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0.22}
          toneMapped={false}
        />
      </sprite>

      {/* Decay 0 keeps the outer planets from going pitch black — physically
          wrong, but the alternative is an invisible Neptune. Pushed up to
          compensate for the near-zero ambient, so day sides stay bright while
          night sides fall away hard. */}
      <pointLight intensity={3.4} distance={0} decay={0} color="#fff4e2" />
    </group>
  )
}
