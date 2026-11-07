export interface DurationLimits {
  seconds?: readonly number[];
  min?: number;
  max?: number;
  step?: number;
  frameRate?: number;
  frameOffset?: number;
}
export interface DurationPlan {
  requiredSeconds: number;
  requestedSeconds: number;
  excessSeconds: number;
  durationSeconds?: number;
  numFrames?: number;
  frameRate?: number;
}
export function minimumDuration(requiredSeconds: number, limits: DurationLimits): DurationPlan;
