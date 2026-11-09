import type { Phase } from "./types";

export type Bound = "out" | "back";
export const DOT_DIAMETER_CM = 2.5;
export const CSS_PX_PER_CM = 96 / 2.54;

export interface Point {
  x: number;
  y: number;
}

/** 12時を0度、時計回り。画面は x が右、y が下。 */
export function angleVector(angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.sin(rad), y: -Math.cos(rad) };
}

export function edgePoint(dir: Point, width: number, height: number, inset: number): Point {
  const cx = width / 2;
  const cy = height / 2;
  const hw = Math.max(1, width / 2 - inset);
  const hh = Math.max(1, height / 2 - inset);
  let reach = Infinity;
  if (Math.abs(dir.x) > 1e-6) reach = Math.min(reach, hw / Math.abs(dir.x));
  if (Math.abs(dir.y) > 1e-6) reach = Math.min(reach, hh / Math.abs(dir.y));
  if (!Number.isFinite(reach)) return { x: cx, y: cy };
  return { x: cx + dir.x * reach, y: cy + dir.y * reach };
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 入ってくる端から真ん中を経由し、出ていく端へ。画面の中では速さを一定にする。 */
export function centerPoint(
  fromAngle: number,
  toAngle: number,
  t: number,
  width: number,
  height: number,
  inset: number
): Point {
  const enter = edgePoint(angleVector(fromAngle), width, height, inset);
  const exit = edgePoint(angleVector(toAngle), width, height, inset);
  const center = { x: width / 2, y: height / 2 };
  const d1 = dist(enter, center);
  const d2 = dist(center, exit);
  const total = d1 + d2 || 1;
  const along = Math.min(1, Math.max(0, t)) * total;
  if (along <= d1) return lerp(enter, center, d1 ? along / d1 : 1);
  return lerp(center, exit, d2 ? (along - d1) / d2 : 1);
}

/** 内側から外側へ進み、端ではね返って内側へ戻る。 */
export function peripheralPoint(
  deviceAngle: number,
  t: number,
  width: number,
  height: number,
  inset: number
): Point {
  const outer = edgePoint(angleVector(deviceAngle), width, height, inset);
  const inner = edgePoint(angleVector((deviceAngle + 180) % 360), width, height, inset);
  const u = Math.min(1, Math.max(0, t));
  if (u < 0.5) return lerp(inner, outer, u / 0.5);
  return lerp(outer, inner, (u - 0.5) / 0.5);
}

export function nextBeat(phase: Phase, bound: Bound): { phase: Phase; bound: Bound } {
  if (phase === "center") return { phase: "gap", bound: "out" };
  if (phase === "gap" && bound === "out") return { phase: "peripheral", bound: "out" };
  if (phase === "peripheral") return { phase: "gap", bound: "back" };
  return { phase: "center", bound: "out" };
}

/** 直前の端末以外から次を選ぶ。1台しかないときは同じ端末でよい。 */
export function pickTarget(ids: string[], previous: string | null, rng: () => number): string {
  const pool = previous ? ids.filter((id) => id !== previous) : ids;
  const choices = pool.length > 0 ? pool : ids;
  const index = Math.min(choices.length - 1, Math.floor(rng() * choices.length));
  return choices[Math.max(0, index)];
}

/** 調整モード: place 順（device1 → device2 → …）で外周を一周。 */
export function pickSequential(ids: string[], previous: string | null): string {
  if (!ids.length) return "";
  if (!previous) return ids[0];
  const idx = ids.indexOf(previous);
  return ids[(idx < 0 ? 0 : idx + 1) % ids.length];
}
