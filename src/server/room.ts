import { WebSocket } from "ws";
import { nextBeat, pickSequential, pickTarget, type Bound } from "../lib/motion";
import { placementsFor } from "../lib/placement";
import {
  DEFAULT_CONFIG,
  MAX_CENTER,
  MAX_GAP,
  MAX_PERIPHERAL_TRAVEL,
  MAX_PERIPHERALS,
  MIN_CENTER,
  MIN_GAP,
  MIN_PERIPHERAL_TRAVEL,
  MIN_PERIPHERALS,
  SPEED_PRESETS,
  matchPreset,
  snapStep,
  type DisplayInfo,
  type Phase,
  type PlayPackage,
  type PlayPhase,
  type RoomConfig,
  type RoomSnapshot,
  type RunMode,
} from "../lib/types";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_MS = 90 * 60 * 1000;
const ADJUST_PHASES = 48;

function randomCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export type ClientSocket = WebSocket & {
  role?: "controller" | "display";
  deviceId?: string;
  roomCode?: string;
};

interface DisplayClient {
  id: string;
  label: string;
  place: number;
  socket: ClientSocket | null;
}

export class Room {
  code: string;
  config: RoomConfig = { ...DEFAULT_CONFIG };
  displays = new Map<string, DisplayClient>();
  controllers = new Set<ClientSocket>();
  startedAt: number | null = null;
  endsAt: number | null = null;
  finishedAt: number | null = null;
  playPackage: PlayPackage | null = null;
  lastActivity = Date.now();
  rng: () => number = Math.random;

  private phase: Phase = "center";
  private bound: Bound = "out";
  private phaseStartedAt: number | null = null;
  private phaseDurationMs = 1000;
  private fromAngle = 0;
  private toAngle = 0;
  private targetId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private packageIndex = 0;

  constructor(code: string) {
    this.code = code;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  isExpired(now = Date.now()) {
    if (this.config.running) return false;
    if (this.controllers.size > 0) return false;
    if ([...this.displays.values()].some((d) => d.socket)) return false;
    return now - this.lastActivity > ROOM_TTL_MS;
  }

  addController(socket: ClientSocket) {
    this.controllers.add(socket);
    this.touch();
    this.sendSnapshot(socket);
  }

  removeController(socket: ClientSocket) {
    this.controllers.delete(socket);
  }

  addDisplay(socket: ClientSocket, deviceId: string, label?: string) {
    this.touch();
    const existing = this.displays.get(deviceId);
    if (existing) {
      existing.socket = socket;
      if (label) existing.label = label;
      this.broadcast();
      return { ok: true as const };
    }
    if (this.displays.size >= MAX_PERIPHERALS) {
      return { ok: false as const, error: "周囲の端末は6台までです" };
    }
    const place = this.displays.size + 1;
    this.displays.set(deviceId, {
      id: deviceId,
      label: label || `No.${place}`,
      place,
      socket,
    });
    this.broadcast();
    return { ok: true as const };
  }

  removeDisplaySocket(socket: ClientSocket) {
    for (const d of this.displays.values()) {
      if (d.socket === socket) {
        d.socket = null;
        break;
      }
    }
    this.broadcast();
  }

  setLabel(deviceId: string, label: string) {
    const d = this.displays.get(deviceId);
    if (d) {
      d.label = label.slice(0, 24);
      this.touch();
      this.broadcast();
    }
  }

  updateConfig(partial: Partial<RoomConfig>) {
    if (this.config.running && this.config.mode === "train") {
      this.broadcast();
      return;
    }
    const next = { ...this.config, ...partial, running: this.config.running, mode: this.config.mode };
    if (partial.speed === "normal" || partial.speed === "fast") {
      next.centerSeconds = SPEED_PRESETS[partial.speed].centerSeconds;
      next.peripheralSeconds = SPEED_PRESETS[partial.speed].peripheralSeconds;
    }
    if (partial.centerSeconds != null) {
      next.centerSeconds = snapStep(partial.centerSeconds, MIN_CENTER, MAX_CENTER, 0.5);
    }
    if (partial.peripheralSeconds != null) {
      next.peripheralSeconds = snapStep(partial.peripheralSeconds, MIN_PERIPHERAL_TRAVEL, MAX_PERIPHERAL_TRAVEL, 0.5);
    }
    if (partial.gapSeconds != null) {
      next.gapSeconds = snapStep(partial.gapSeconds, MIN_GAP, MAX_GAP, 0.5);
    }
    if (partial.durationSeconds != null) {
      next.durationSeconds = partial.durationSeconds >= 25 ? 30 : 20;
    }
    next.centerSeconds = snapStep(next.centerSeconds, MIN_CENTER, MAX_CENTER, 0.5);
    next.peripheralSeconds = snapStep(next.peripheralSeconds, MIN_PERIPHERAL_TRAVEL, MAX_PERIPHERAL_TRAVEL, 0.5);
    next.gapSeconds = snapStep(next.gapSeconds, MIN_GAP, MAX_GAP, 0.5);
    next.speed = matchPreset(next.centerSeconds, next.peripheralSeconds);
    this.config = next;
    this.touch();
    this.broadcast();
  }

  private liveIds(): string[] {
    return [...this.displays.values()]
      .filter((d) => d.socket && d.socket.readyState === WebSocket.OPEN)
      .sort((a, b) => a.place - b.place)
      .map((d) => d.id);
  }

  private hasController(): boolean {
    return [...this.controllers].some((socket) => socket.readyState === WebSocket.OPEN);
  }

  private angleOf(id: string): number {
    const display = this.displays.get(id);
    if (!display) return 0;
    return placementsFor(this.displays.size).find((slot) => slot.no === display.place)?.angle ?? 0;
  }

  start(mode: RunMode = "train") {
    const ids = this.liveIds();
    const runMode = mode === "adjust" ? "adjust" : "train";
    if (!this.hasController() || ids.length < MIN_PERIPHERALS || this.displays.size > MAX_PERIPHERALS) {
      this.broadcast();
      return;
    }
    this.clearTimer();
    const now = Date.now();
    this.config.running = true;
    this.config.mode = runMode;
    this.startedAt = now;
    this.endsAt = runMode === "train" ? now + this.config.durationSeconds * 1000 : null;
    this.finishedAt = null;
    this.bound = "out";
    this.packageIndex = 0;
    this.playPackage = this.buildPlayPackage(ids, now, this.endsAt, runMode);
    this.touch();
    const first = this.playPackage.phases[0];
    if (!first) {
      this.finish();
      return;
    }
    this.applyPhase(first);
    this.armPackage();
    this.broadcast();
  }

  stop() {
    this.clearTimer();
    this.config.running = false;
    this.config.mode = "idle";
    this.finishedAt = null;
    this.phaseStartedAt = null;
    this.targetId = null;
    this.playPackage = null;
    this.packageIndex = 0;
    this.touch();
    this.broadcast();
  }

  private durationFor(phase: Phase): number {
    const seconds =
      phase === "center"
        ? this.config.centerSeconds
        : phase === "peripheral"
          ? this.config.peripheralSeconds
          : this.config.gapSeconds;
    return Math.max(200, Math.round(seconds * 1000));
  }

  private buildPlayPackage(
    ids: string[],
    startAt: number,
    endsAt: number | null,
    runMode: RunMode = "train"
  ): PlayPackage {
    const phases: PlayPhase[] = [];
    let phase: Phase = "center";
    let bound: Bound = "out";
    let at = startAt;
    let targetId =
      runMode === "adjust" ? pickSequential(ids, null) : pickTarget(ids, null, this.rng);
    let toAngle = this.angleOf(targetId);
    let fromAngle = (toAngle + 180) % 360;
    let previous: string | null = null;

    const maxPhases = endsAt != null ? 500 : ADJUST_PHASES;
    while (phases.length < maxPhases) {
      if (endsAt != null && at >= endsAt) break;
      const phaseDurationMs = this.durationFor(phase);
      phases.push({
        phase,
        phaseStartedAt: at,
        phaseDurationMs,
        fromAngle,
        toAngle,
        targetId: phase === "peripheral" ? targetId : phase === "center" ? targetId : null,
      });
      at += phaseDurationMs;
      if (endsAt != null && at >= endsAt) break;
      const next = nextBeat(phase, bound);
      bound = next.bound;
      phase = next.phase;
      if (phase === "center") {
        previous = targetId;
        targetId =
          runMode === "adjust"
            ? pickSequential(ids, previous)
            : pickTarget(ids, previous, this.rng);
        fromAngle = previous ? this.angleOf(previous) : toAngle;
        toAngle = this.angleOf(targetId);
      }
    }
    return { endsAt, phases };
  }

  private applyPhase(frame: PlayPhase) {
    this.phase = frame.phase;
    this.phaseStartedAt = frame.phaseStartedAt;
    this.phaseDurationMs = frame.phaseDurationMs;
    this.fromAngle = frame.fromAngle;
    this.toAngle = frame.toAngle;
    this.targetId = frame.targetId;
  }

  private armPackage() {
    this.clearTimer();
    if (!this.config.running || !this.playPackage) return;
    const nextIndex = this.packageIndex + 1;
    if (nextIndex >= this.playPackage.phases.length) {
      if (this.endsAt != null) {
        const wait = Math.max(0, this.endsAt - Date.now());
        this.timer = setTimeout(() => this.finish(), wait);
        return;
      }
      const last = this.playPackage.phases[this.playPackage.phases.length - 1];
      const ids = this.liveIds();
      if (ids.length === 0) {
        this.finish();
        return;
      }
      const more = this.buildPlayPackage(
        ids,
        last.phaseStartedAt + last.phaseDurationMs,
        null,
        this.config.mode
      );
      const kept = this.playPackage.phases.slice(-4);
      this.playPackage = { endsAt: null, phases: [...kept, ...more.phases] };
      this.packageIndex = Math.max(0, kept.length - 1);
    }
    const next = this.playPackage.phases[this.packageIndex + 1];
    if (!next) {
      if (this.endsAt != null) {
        const wait = Math.max(0, this.endsAt - Date.now());
        this.timer = setTimeout(() => this.finish(), wait);
      }
      return;
    }
    const wait = Math.max(0, next.phaseStartedAt - Date.now());
    this.timer = setTimeout(() => {
      if (!this.config.running || !this.playPackage) return;
      this.packageIndex += 1;
      const frame = this.playPackage.phases[this.packageIndex];
      if (!frame) return;
      this.applyPhase(frame);
      this.armPackage();
      this.broadcast();
    }, wait);
  }

  private finish() {
    this.clearTimer();
    this.config.running = false;
    this.config.mode = "idle";
    this.finishedAt = Date.now();
    this.phaseStartedAt = null;
    this.targetId = null;
    this.playPackage = null;
    this.packageIndex = 0;
    this.touch();
    this.broadcast();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  snapshot(): RoomSnapshot {
    const displays: DisplayInfo[] = [...this.displays.values()].map((d) => ({
      id: d.id,
      label: d.label,
      place: d.place,
      connected: !!d.socket && d.socket.readyState === WebSocket.OPEN,
    }));
    return {
      code: this.code,
      config: this.config,
      displays,
      phase: this.config.running ? this.phase : null,
      phaseStartedAt: this.config.running ? this.phaseStartedAt : null,
      phaseDurationMs: this.phaseDurationMs,
      fromAngle: this.fromAngle,
      toAngle: this.toAngle,
      targetId: this.config.running ? this.targetId : null,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      finishedAt: this.finishedAt,
      playPackage: this.config.running ? this.playPackage : null,
      serverNow: Date.now(),
    };
  }

  sendSnapshot(socket: ClientSocket) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "snapshot", snapshot: this.snapshot() }));
    }
  }

  broadcast() {
    const payload = JSON.stringify({ type: "snapshot", snapshot: this.snapshot() });
    for (const c of this.controllers) {
      if (c.readyState === WebSocket.OPEN) c.send(payload);
    }
    for (const d of this.displays.values()) {
      if (d.socket && d.socket.readyState === WebSocket.OPEN) d.socket.send(payload);
    }
  }

  destroy() {
    this.clearTimer();
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();

  createRoom(): Room {
    let code = randomCode();
    while (this.rooms.has(code)) code = randomCode();
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    const room = this.rooms.get(code.toUpperCase());
    if (room?.isExpired()) {
      room.destroy();
      this.rooms.delete(room.code);
      return undefined;
    }
    return room;
  }

  sweep() {
    for (const [code, room] of this.rooms) {
      if (room.isExpired()) {
        room.destroy();
        this.rooms.delete(code);
      }
    }
  }
}
