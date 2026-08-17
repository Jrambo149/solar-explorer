import { useFrame } from '@react-three/fiber'
import { useStore } from '../store/useStore'
import { VIEW } from './framePriority'
import { cosmicStageAt, discStageAt, setCosmicStage } from './cosmicStage'

/**
 * Publishes how far out the camera is, once a frame, before anything reads it.
 *
 * Draws nothing. It exists so that the six things which cross-fade on the way
 * out — see `cosmicStage.js` — all act on the same value in the same frame,
 * rather than each sampling the camera at its own point in the ladder and
 * disagreeing by one frame's worth of zoom.
 *
 * Measured against the camera's own pivot rather than against the Sun, which is
 * the same quantity `nearPlane` and `farPlane` are sized from. It answers "how
 * zoomed out is this shot", and it keeps the sky, the depth planes and the zoom
 * rate all keyed to one distance instead of three that usually agree.
 */
export default function SkyStage() {
  useFrame(({ camera, controls }) => {
    const distance = controls?.target
      ? camera.position.distanceTo(controls.target)
      : camera.position.length()
    const scaleMode = useStore.getState().scaleMode
    setCosmicStage(
      cosmicStageAt(distance, scaleMode),
      discStageAt(distance, scaleMode),
      distance,
    )
  }, VIEW)

  return null
}
