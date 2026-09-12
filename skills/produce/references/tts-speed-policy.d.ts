export interface SpeedAuthorization {
  source: 'explicit-user-request';
  scope: 'generation' | 'final';
  factor: number;
  request: string;
  requestedAt: string;
}
export function authorizeSpeed(work: string, scope: 'generation' | 'final', factor: number): SpeedAuthorization | null;
