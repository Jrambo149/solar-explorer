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
 * Everything that consumes finished positions: the camera, the trails, the
 * label projector. Left at r3f's default so nothing has to opt in.
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
