import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { FOCUS_RADII } from '../data/planetData'

/**
 * Atmospheric limb glow.
 *
 * The glow is a *volume* of air seen edge-on, so what it needs to model is how
 * much air a given view ray passes through. For each pixel this measures the
 * ray's closest approach to the planet's centre — its impact parameter — and
 * fades the glow out exponentially with altitude above the surface, the way
 * atmospheric density actually falls off. The result is multiplied by how
 * sunlit that piece of limb is, so the halo blazes along the lit edge and dies
 * out around the night side instead of ringing the planet evenly.
 *
 * The previous version was a Fresnel term on a shell only 3.5% larger than the
 * planet. That confined every lit pixel to a hairline annulus whose *outer*
 * boundary was the shell's own geometry ending against space — so the glow
 * stopped dead instead of fading. At overview distance the band was sub-pixel
 * and nobody noticed; filling the frame it became ~20px of near-constant colour
 * with a hard edge on both sides, and read as a drawn hoop around the planet.
 *
 * Here the mesh is deliberately far larger than the visible glow (SHELL_SCALE),
 * so the falloff always reaches zero well inside it and its silhouette is never
 * something you can see.
 */

/**
 * Radius of the carrier mesh, as a multiple of the planet's radius.
 *
 * This is not the size of the halo — it is only the volume the shader is
 * allowed to draw in. It has to comfortably outrun the exponential falloff:
 * at the largest scale height used (0.075) the glow is down to 0.25% of its
 * peak by the time it reaches this edge, which is invisible.
 */
const SHELL_SCALE = 1.45

/* ---- distance fade ----
 *
 * The halo is a fixed fraction of the planet's radius, so it stays correctly
 * proportioned at every zoom — but proportion is not the same as impact. From
 * the overview it is a few pixels of additive light; with the planet filling
 * the frame the same band is several hundred pixels, bright enough to push the
 * lit limb over the bloom threshold and wash out the surface detail underneath.
 *
 * So the glow is dialled back as the camera closes in. Expressed in planet
 * radii, which keeps it consistent from Mercury to Jupiter.
 *
 * The far threshold sits well outside the range a close-up ever reaches, so the
 * curve is still shallow by the time the camera parks — the halo eases away
 * over the whole approach instead of dropping off at the end of it.
 */
/** Beyond this, the glow is at full strength. */
const FADE_FAR = 12
/**
 * At or inside this, the glow is at FADE_MIN.
 *
 * Tied to the distance a close-up actually parks at, rather than a separate
 * number: otherwise pulling the framing back would slide the camera up the
 * fade curve and quietly brighten the halo again.
 */
const FADE_NEAR = FOCUS_RADII
/** How much is left up close. Not zero — without some limb light the planet
 *  reads as a flat cutout pasted on the starfield. */
const FADE_MIN = 0.16

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vCenter;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    // The planet's centre in world space. Constant across the whole mesh, so
    // interpolation leaves it untouched.
    vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunDirection;
  uniform float uIntensity;
  uniform float uSurfaceRadius;
  uniform float uScaleHeight;
  uniform float uFade;

  varying vec3 vWorldPosition;
  varying vec3 vCenter;

  void main() {
    vec3 rayDir = normalize(vWorldPosition - cameraPosition);
    vec3 toCenter = vCenter - cameraPosition;

    // Closest approach of this view ray to the planet's centre. Everything
    // below keys off it: it is how far from the middle of the disc this pixel
    // lands, measured in world units rather than pixels, so the look is
    // identical at every zoom level.
    float along = dot(toCenter, rayDir);
    float impact = length(toCenter - along * rayDir);

    float density;
    if (impact > uSurfaceRadius) {
      // Beyond the limb: air thinning with altitude. Smooth all the way out,
      // with no geometric edge to give the effect away.
      density = exp(-(impact - uSurfaceRadius) / uScaleHeight);
    } else {
      // Across the disc: rays near the edge graze a long way through the
      // atmosphere, rays through the middle barely clip it. This is the haze
      // that banks up over the horizon, and it also means the glow rises out
      // of the planet instead of switching on at its silhouette.
      density = pow(impact / uSurfaceRadius, 4.0);
    }

    // Outward normal of the limb this ray grazes, for the sunlit term.
    vec3 grazePoint = cameraPosition + along * rayDir;
    vec3 normal = (grazePoint - vCenter) / max(impact, 1e-5);
    // The soft lower bound lets a sliver of glow wrap just past the terminator,
    // the way real scattering does.
    float lit = smoothstep(-0.3, 0.45, dot(normal, uSunDirection));

    // Scaling the intensity also draws the halo in: the visible edge is wherever
    // the exponential crosses the eye's threshold, so dimming it moves that
    // crossing point inward. The glow gets tighter as well as fainter.
    float alpha = density * lit * uIntensity * uFade;
    if (alpha < 0.002) discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`

export default function Atmosphere({ radius, glow }) {
  const materialRef = useRef()
  const sunDirection = useRef(new THREE.Vector3(0, 0, 1))
  const worldPosition = useRef(new THREE.Vector3())
  const meshRef = useRef()

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(glow.color) },
      uSunDirection: { value: new THREE.Vector3(0, 0, 1) },
      uIntensity: { value: glow.intensity },
      uSurfaceRadius: { value: radius },
      // `thickness` is expressed as a fraction of the planet's radius, so a
      // planet's halo stays in proportion to it.
      uScaleHeight: { value: radius * glow.thickness },
      uFade: { value: 1 },
    }),
    [glow.color, glow.intensity, glow.thickness, radius],
  )

  useFrame(({ camera }) => {
    if (!meshRef.current || !materialRef.current) return
    const uniformValues = materialRef.current.uniforms

    // The Sun sits at the origin, so the direction to it is simply the
    // negated world position of this planet.
    meshRef.current.getWorldPosition(worldPosition.current)
    sunDirection.current.copy(worldPosition.current).negate().normalize()
    uniformValues.uSunDirection.value.copy(sunDirection.current)

    // Distance in planet radii, so one pair of thresholds works for every body.
    const distance = camera.position.distanceTo(worldPosition.current) / radius
    const t = THREE.MathUtils.smoothstep(distance, FADE_NEAR, FADE_FAR)
    uniformValues.uFade.value = THREE.MathUtils.lerp(FADE_MIN, 1, t)
  })

  return (
    <mesh ref={meshRef} scale={radius * SHELL_SCALE} renderOrder={2}>
      <sphereGeometry args={[1, 48, 32]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.FrontSide}
      />
    </mesh>
  )
}
