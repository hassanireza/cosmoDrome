/** Shared mutable input snapshot. Controllers write it, the simulation reads it. */
export interface InputState {
  /** True while a finger (or mouse) is steering. */
  pointerActive: boolean;
  /** Target lane in [-1, 1] while `pointerActive`. */
  targetLane: number;
  /** Digital or tilt steering in [-1, 1], used when no pointer is steering. */
  axis: number;
  /** Set by gestures and keys, consumed by the simulation. */
  hopQueued: boolean;
}

export const createInputState = (): InputState => ({ pointerActive: false, targetLane: 0, axis: 0, hopQueued: false });
