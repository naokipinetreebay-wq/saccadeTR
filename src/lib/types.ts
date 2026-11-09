export type Role = "controller" | "display";
export type Speed = "normal" | "fast" | "custom";
export type RunMode = "idle" | "adjust" | "train";
export type Phase = "center" | "gap" | "peripheral";

export interface RoomConfig {
  /** トレーニングの長さ。20秒か30秒 */
  durationSeconds: number;
  speed: Speed;
  /** 真ん中を端から端まで通る秒数 */
  centerSeconds: number;
  /** 端の端末に入って、はね返って、出るまでの秒数 */
  peripheralSeconds: number;
  /** 端末と端末のあいだで丸が消えている秒数 */
  gapSeconds: number;
  running: boolean;
  mode: RunMode;
}

export interface DisplayInfo {
  id: string;
  label: string;
  place: number;
  connected: boolean;
}

/** 開始時に一度配り、端末時計で再生する位相一式 */
export interface PlayPhase {
  phase: Phase;
  phaseStartedAt: number;
  phaseDurationMs: number;
  fromAngle: number;
  toAngle: number;
  targetId: string | null;
}

export interface PlayPackage {
  endsAt: number | null;
  phases: PlayPhase[];
}

export interface RoomSnapshot {
  code: string;
  config: RoomConfig;
  displays: DisplayInfo[];
  phase: Phase | null;
  phaseStartedAt: number | null;
  phaseDurationMs: number;
  /** 12時を0度、時計回り。丸が入ってくる向き */
  fromAngle: number;
  /** 丸が出ていく向き。端の端末では、その端末がある向き */
  toAngle: number;
  targetId: string | null;
  startedAt: number | null;
  endsAt: number | null;
  finishedAt: number | null;
  /** あるときは端末側再生の正本 */
  playPackage: PlayPackage | null;
  serverNow: number;
}

export type ClientMessage =
  | { type: "hello"; role: Role; deviceId: string; label?: string }
  | { type: "updateConfig"; config: Partial<RoomConfig> }
  | { type: "setLabel"; deviceId: string; label: string }
  | { type: "start"; mode?: "adjust" | "train"; local?: boolean }
  | { type: "stop" }
  | {
      type: "hostPush";
      overlay: {
        playPackage?: PlayPackage | null;
        phase?: Phase | null;
        phaseStartedAt?: number | null;
        phaseDurationMs?: number;
        fromAngle?: number;
        toAngle?: number;
        targetId?: string | null;
        startedAt?: number | null;
        endsAt?: number | null;
        finishedAt?: number | null;
        hostNow?: number;
      };
    }
  | { type: "ping" };

export type ServerMessage =
  | { type: "snapshot"; snapshot: RoomSnapshot }
  | { type: "error"; message: string }
  | { type: "pong" };

export const DEFAULT_CONFIG: RoomConfig = {
  durationSeconds: 20,
  speed: "normal",
  centerSeconds: 3,
  peripheralSeconds: 5,
  gapSeconds: 2,
  running: false,
  mode: "idle",
};

export const MIN_PERIPHERALS = 2;
export const MAX_PERIPHERALS = 6;
export const MIN_GAP = 1;
export const MAX_GAP = 5;
export const MIN_CENTER = 1;
export const MAX_CENTER = 6;
export const MIN_PERIPHERAL_TRAVEL = 2;
export const MAX_PERIPHERAL_TRAVEL = 10;

export const SPEED_PRESETS: Record<"normal" | "fast", { centerSeconds: number; peripheralSeconds: number }> = {
  normal: { centerSeconds: 3, peripheralSeconds: 5 },
  fast: { centerSeconds: 2, peripheralSeconds: 3.5 },
};

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function snapStep(n: number, min: number, max: number, step: number): number {
  const snapped = Math.round(n / step) * step;
  return clamp(Number(snapped.toFixed(2)), min, max);
}

export function matchPreset(centerSeconds: number, peripheralSeconds: number): Speed {
  if (centerSeconds === SPEED_PRESETS.normal.centerSeconds && peripheralSeconds === SPEED_PRESETS.normal.peripheralSeconds) {
    return "normal";
  }
  if (centerSeconds === SPEED_PRESETS.fast.centerSeconds && peripheralSeconds === SPEED_PRESETS.fast.peripheralSeconds) {
    return "fast";
  }
  return "custom";
}
