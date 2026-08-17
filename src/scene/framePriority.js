/**
 * What runs before what, inside a frame.
 *
 * ## Why this is not left to mount order
 *
 * React Three Fiber runs `useFrame` callbacks in ascending priority and, within
 * one priority, in *subscription* order — which is mount order. This app leaned
 * on that: `Scene` mounts every planet and moon, then the spacecraft, then
 * `CameraController`, and the comments in those files describe the resulting
 * order as the contract that makes the position registry work.
 *
 * It holds only for bodies that are mounted when the scene is. A body class
 * behind a layer toggle is mounted *later*, so its callback is appended after
 * everything already subscribed — including the camera, which sits at the end of
 * the JSX and is therefore last only until something joins after it. Spacecraft
 * are off by default, so in practice they are always in that position.
 *
 * The camera then flies to a position one frame stale. That is invisible at
 * ordinary speeds and ruinous at orbital ones. Measured on LRO with the clock at
 * one day a second: the craft advances a fifth of its two-hour orbit between
 * frames, and the camera chased a point 0.25 world units from where the craft
 * was drawn — 92 times the distance it parks at. The flight cannot converge, the
 * follow never takes over, and what you see is the camera lurching and then
 * being somewhere, rather than flying anywhere. The same latent fault applies to
 * comets, dwarf planets and minor moons, all likewise behind toggles.
 *
 * ## Why negative
 *
 * Because positive priorities mean something else entirely. r3f counts
 * subscribers with `priority > 0` and, if any exist, stops rendering the scene
 * automatically on the assumption that something is rendering by hand — this
 * app's `EffectComposer` is exactly that, at priority 1, and it is behind the
 * bloom toggle. Ordering the camera with a positive number would black the
 * screen out the moment bloom was switched off.
 *
 * Negative priorities sort first and are excluded from that count
 * (`priority > 0 ? 1 : 0` in r3f's `subscribe`), so they order the frame without
 * touching how it is drawn.
 *
 * ## The ladder
 *
 * Each rung may read what the rung above it wrote, and nothing more.
 */

/**
 * How far out the camera is, expressed as *which view we are in*.
 *
 * Above the clock because it depends on nothing the frame computes — only on
 * where the camera already is — and because almost everything that draws the
 * sky reads it: the star dome and the deep field cross-fade on it, the band
 * and the Galaxy's disc hand over on it, and the near and far planes are sized
 * from it. Written once, read everywhere, and never mid-frame stale.
 */
export const VIEW = -40

/** The clock. Everything else reads the julian date it sets. */
export const CLOCK = -30

/**
 * Bodies solving their own position: the Sun, planets, moons.
 *
 * One rung for all of them because a moon reads its parent's position, and
 * parents are still mounted before their satellites within this rung — that part
 * of the mount-order contract is real, since both are mounted together.
 */
export const BODIES = -20

/** Spacecraft, which are placed relative to a body's frame. */
export const SPACECRAFT = -10

/**
 * The camera, which must finish moving before anything that rides on it.
 *
 * Its own rung, one ahead of the rest of the consumers, because the sky is
 * pinned to the camera: `Starfield`, `MilkyWay` and the constellation figures
 * all copy `camera.position` into their own so the sky sits at infinity. Those
 * are mounted before `CameraController` in `Scene`, so at a shared priority
 * they ran *first* and pinned the sky to where the camera was last frame.
 *
 * That was harmless for as long as the camera moved in jumps: the wheel
 * dollied once and then held still for several frames, so almost every frame
 * sampled a camera that had already arrived. Smoothing the zoom made the camera
 * move on *every* frame of a gesture, and the one-frame lag turned into 1.35
 * degrees of parallax on a dome that is supposed to have none — the sky
 * visibly swimming against the stars during a zoom.
 *
 * Still negative, for the reason the whole ladder is: a positive priority makes
 * r3f stop rendering the scene automatically. See above.
 */
export const CAMERA = -1

/**
 * Everything that consumes finished positions: the trails, the label
 * projector, and the sky that rides on the camera. Left at r3f's default so
 * nothing has to opt in.
 */
export const CONSUMERS = 0

/**
 * Spacecraft *attitude*, which reads the position the rung above just wrote.
 *
 * Its own rung because it lives in a child component — `ModelInstance` inside
 * `Spacecraft` — and React runs a child's effects before its parent's. So the
 * model would otherwise subscribe first and orient the craft from the position
 * it held last frame, which is the same one-frame lag that broke the camera,
 * arrived at from the other direction.
 */
export const SPACECRAFT_ATTITUDE = -5
