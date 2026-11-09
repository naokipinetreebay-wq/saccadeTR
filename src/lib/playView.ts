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

/** パッケージがあるときは端末時計で位相を選ぶ。adjust（endsAt=null）は尽きたらループ。 */
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

  const first = pkg.phases[0];
  const last = pkg.phases[pkg.phases.length - 1];
  const pkgEnd = last.phaseStartedAt + last.phaseDurationMs;
  const span = Math.max(1, pkgEnd - first.phaseStartedAt);
  let t = now;
  let loopOffset = 0;
  if (pkg.endsAt == null && now >= pkgEnd) {
    const elapsed = now - first.phaseStartedAt;
    loopOffset = Math.floor(elapsed / span) * span;
    t = first.phaseStartedAt + (elapsed % span);
  }

  let current: PlayPhase = first;
  for (const p of pkg.phases) {
    if (p.phaseStartedAt <= t) current = p;
    else break;
  }
  return {
    phase: current.phase,
    phaseStartedAt: current.phaseStartedAt + loopOffset,
    phaseDurationMs: current.phaseDurationMs,
    fromAngle: current.fromAngle,
    toAngle: current.toAngle,
    targetId: current.targetId,
    usingPackage: true,
  };
}
