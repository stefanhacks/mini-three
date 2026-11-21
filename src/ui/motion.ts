/** Duration of the mobile detail pane's slide. */
export const SLIDE_MS = 250;
/** Time constant of a fling's exponential slowdown: it covers `velocity * MOMENTUM_TAU` px in total. */
export const MOMENTUM_TAU = 325;
/** A fling stops below this speed, in px per ms. */
export const MIN_FLING_SPEED = 0.02;
/** Only the pointer's last moments before release count towards the fling speed. */
const VELOCITY_WINDOW = 100;

export const easeOutCubic = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** The value of an ease-out tween from `from` to `to` after `elapsed` of `duration` ms. */
export const tweenAt = (from: number, to: number, elapsed: number, duration: number): number =>
  from + (to - from) * easeOutCubic(duration > 0 ? elapsed / duration : 1);

export interface MotionSample {
  /** ms */
  time: number;
  value: number;
}

/**
 * Speed at release, in value units per ms, from the samples within the last 100 ms before `now`. Pass a final
 * sample at `now`: a finger that stopped before lifting then gives (close to) zero instead of the earlier speed.
 */
export const releaseVelocity = (samples: MotionSample[], now: number): number => {
  const recent = samples.filter((sample) => now - sample.time <= VELOCITY_WINDOW);
  if (recent.length < 2) {
    return 0;
  }
  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsed = last.time - first.time;
  return elapsed > 0 ? (last.value - first.value) / elapsed : 0;
};

/**
 * One step of a fling: the distance covered in `dt` ms and the speed after it. The decay is exponential and the
 * distance its exact integral, so the path is the same at any frame rate. Speed drops to 0 under the minimum.
 */
export const flingStep = (velocity: number, dt: number): { distance: number; velocity: number } => {
  const keep = Math.exp(-dt / MOMENTUM_TAU);
  const next = velocity * keep;
  return {
    distance: velocity * MOMENTUM_TAU * (1 - keep),
    velocity: Math.abs(next) < MIN_FLING_SPEED ? 0 : next,
  };
};
