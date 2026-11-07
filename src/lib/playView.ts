import type { Phase, PlayPhase, RoomSnapshot } from "./types";

export type SaccadePlayView = {
  phase: Phase | null;
  phaseStartedAt: number | null;
  phaseDurationMs: number;
  fromAngle: number;
  toAngle: number;
  targetId: string | null;
  usingPackage: boolean;
};

/** パッケージがあるときは端末時計で位相を選ぶ */
export function resolveSaccadeView(snapshot: RoomSnapshot, now: number): SaccadePlayView {
  const pkg = snapshot.playPackage;
  if (!pkg?.phases.length || !snapshot.config.running) {
    return {
      phase: snapshot.phase,
      phaseStartedAt: snapshot.phaseStartedAt,
      phaseDurationMs: snapshot.phaseDurationMs,
      fromAngle: snapshot.fromAngle,
      toAngle: snapshot.toAngle,
      targetId: snapshot.targetId,
      usingPackage: false,
    };
  }
  if (pkg.endsAt != null && now >= pkg.endsAt) {
    return {
      phase: null,
      phaseStartedAt: null,
      phaseDurationMs: snapshot.phaseDurationMs,
      fromAngle: snapshot.fromAngle,
      toAngle: snapshot.toAngle,
      targetId: null,
      usingPackage: true,
    };
  }
  let current: PlayPhase = pkg.phases[0];
  for (const p of pkg.phases) {
    if (p.phaseStartedAt <= now) current = p;
    else break;
  }
  return {
    phase: current.phase,
    phaseStartedAt: current.phaseStartedAt,
    phaseDurationMs: current.phaseDurationMs,
    fromAngle: current.fromAngle,
    toAngle: current.toAngle,
    targetId: current.targetId,
    usingPackage: true,
  };
}
