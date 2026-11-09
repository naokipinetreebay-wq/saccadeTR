import { nextBeat, pickTarget, type Bound } from "./motion";
import { placementsFor } from "./placement";
import type {
  Phase,
  PlayPackage,
  PlayPhase,
  RoomConfig,
  RoomSnapshot,
  RunMode,
} from "./types";

/** adjust は端末時計でループするので十分長く一括生成 */
export const ADJUST_PACKAGE_PHASES = 240;
const TRAIN_MAX_PHASES = 500;

export type HostOverlay = {
  playPackage: PlayPackage | null;
  phase: Phase | null;
  phaseStartedAt: number | null;
  phaseDurationMs: number;
  fromAngle: number;
  toAngle: number;
  targetId: string | null;
  startedAt: number | null;
  endsAt: number | null;
  finishedAt: number | null;
  hostNow: number;
};

export function idsFromSnapshot(snapshot: RoomSnapshot): string[] {
  return [...snapshot.displays]
    .filter((d) => d.connected)
    .sort((a, b) => a.place - b.place)
    .map((d) => d.id);
}

function angleOf(snapshot: RoomSnapshot, id: string): number {
  const display = snapshot.displays.find((d) => d.id === id);
  if (!display) return 0;
  return (
    placementsFor(snapshot.displays.length).find((slot) => slot.no === display.place)
      ?.angle ?? 0
  );
}

function durationFor(config: RoomConfig, phase: Phase): number {
  const seconds =
    phase === "center"
      ? config.centerSeconds
      : phase === "peripheral"
        ? config.peripheralSeconds
        : config.gapSeconds;
  return Math.max(200, Math.round(seconds * 1000));
}

/** 調整: place 順に外周を一周。トレーニング: 直前以外からランダム。 */
function nextTarget(
  ids: string[],
  previous: string | null,
  mode: RunMode,
  rng: () => number
): string {
  if (ids.length === 0) return "";
  if (mode === "adjust") {
    if (!previous) return ids[0];
    const idx = ids.indexOf(previous);
    return ids[(idx < 0 ? 0 : idx + 1) % ids.length];
  }
  return pickTarget(ids, previous, rng);
}

export function buildLocalPlayPackage(
  snapshot: RoomSnapshot,
  mode: "adjust" | "train",
  opts?: { startAt?: number; endsAt?: number | null }
): PlayPackage {
  const ids = idsFromSnapshot(snapshot);
  const config = snapshot.config;
  const startAt = opts?.startAt ?? Date.now();
  const endsAt =
    opts?.endsAt !== undefined
      ? opts.endsAt
      : mode === "train"
        ? startAt + config.durationSeconds * 1000
        : null;

  const phases: PlayPhase[] = [];
  let phase: Phase = "center";
  let bound: Bound = "out";
  let at = startAt;
  let targetId = nextTarget(ids, null, mode, Math.random);
  let toAngle = angleOf(snapshot, targetId);
  let fromAngle = (toAngle + 180) % 360;
  let previous: string | null = null;

  const maxPhases = endsAt != null ? TRAIN_MAX_PHASES : ADJUST_PACKAGE_PHASES;
  while (phases.length < maxPhases) {
    if (endsAt != null && at >= endsAt) break;
    const phaseDurationMs = durationFor(config, phase);
    phases.push({
      phase,
      phaseStartedAt: at,
      phaseDurationMs,
      fromAngle,
      toAngle,
      targetId: phase === "peripheral" || phase === "center" ? targetId : null,
    });
    at += phaseDurationMs;
    if (endsAt != null && at >= endsAt) break;
    const next = nextBeat(phase, bound);
    bound = next.bound;
    phase = next.phase;
    if (phase === "center") {
      previous = targetId;
      targetId = nextTarget(ids, previous, mode, Math.random);
      fromAngle = previous ? angleOf(snapshot, previous) : toAngle;
      toAngle = angleOf(snapshot, targetId);
    }
  }
  return { endsAt, phases };
}

export function overlayFromPackage(
  pkg: PlayPackage,
  hostNow = Date.now()
): HostOverlay {
  const first = pkg.phases[0];
  return {
    playPackage: pkg,
    phase: first?.phase ?? null,
    phaseStartedAt: first?.phaseStartedAt ?? null,
    phaseDurationMs: first?.phaseDurationMs ?? 1000,
    fromAngle: first?.fromAngle ?? 0,
    toAngle: first?.toAngle ?? 0,
    targetId: first?.targetId ?? null,
    startedAt: first?.phaseStartedAt ?? hostNow,
    endsAt: pkg.endsAt,
    finishedAt: null,
    hostNow,
  };
}
