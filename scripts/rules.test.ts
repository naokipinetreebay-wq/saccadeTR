import { WebSocket } from "ws";
import { centerPoint, nextBeat, peripheralPoint, pickTarget } from "../src/lib/motion";
import { placementsFor } from "../src/lib/placement";
import { Room, type ClientSocket } from "../src/server/room";
import { SPEED_PRESETS, matchPreset } from "../src/lib/types";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function fakeSocket(): ClientSocket {
  return { readyState: WebSocket.OPEN, send() {} } as unknown as ClientSocket;
}

assert(matchPreset(3, 5) === "normal", "normal preset");
assert(matchPreset(2, 3.5) === "fast", "fast preset");
assert(SPEED_PRESETS.fast.centerSeconds === 2, "fast center");

let beat = nextBeat("center", "out");
assert(beat.phase === "gap" && beat.bound === "out", "leave center into the gap");
beat = nextBeat(beat.phase, beat.bound);
assert(beat.phase === "peripheral", "arrive at the outer phone");
beat = nextBeat(beat.phase, beat.bound);
assert(beat.phase === "gap" && beat.bound === "back", "return through the gap");
beat = nextBeat(beat.phase, beat.bound);
assert(beat.phase === "center", "come back through the center");

for (let i = 0; i < 40; i++) {
  const next = pickTarget(["a", "b", "c"], "b", Math.random);
  assert(next !== "b", "do not immediately return to the same phone");
}
assert(pickTarget(["only"], "only", () => 0) === "only", "a single phone can repeat");

const w = 200;
const h = 400;
const inset = 10;
let nearest = Infinity;
for (let i = 0; i <= 100; i++) {
  const point = centerPoint(0, 90, i / 100, w, h, inset);
  nearest = Math.min(nearest, Math.hypot(point.x - w / 2, point.y - h / 2));
}
assert(nearest < 1, "the path bends through the center");

const straight = centerPoint(0, 180, 0.5, w, h, inset);
assert(Math.hypot(straight.x - w / 2, straight.y - h / 2) < 1, "a straight pass is centered halfway");

const enter = peripheralPoint(90, 0, w, h, inset);
const bounce = peripheralPoint(90, 0.5, w, h, inset);
const leave = peripheralPoint(90, 1, w, h, inset);
assert(bounce.x > enter.x && bounce.x > w / 2, "bounce reaches the outer edge");
assert(Math.abs(enter.x - leave.x) < 0.5 && Math.abs(enter.y - leave.y) < 0.5, "it returns to the inner edge");

const clocks: Record<number, string[]> = {
  2: ["9時", "3時"],
  3: ["10時", "2時", "6時"],
  4: ["10時", "8時", "4時", "2時"],
  6: ["12時", "10時", "8時", "6時", "4時", "2時"],
};
for (const [count, expected] of Object.entries(clocks)) {
  const got = placementsFor(Number(count)).map((slot) => slot.clock);
  assert(got.join(",") === expected.join(","), `${count} clocks`);
}

const room = new Room("TEST01");
try {
  room.addDisplay(fakeSocket(), "a");
  room.start("train");
  assert(room.snapshot().config.running === false, "two phones and the controller are required");
  room.addDisplay(fakeSocket(), "b");
  room.start("adjust");
  assert(room.snapshot().config.running === false, "start waits for the controller");
  room.addController(fakeSocket());
  room.start("adjust");
  const adjust = room.snapshot();
  assert(adjust.config.running && adjust.config.mode === "adjust", "adjust mode runs");
  assert(adjust.endsAt == null && adjust.phase === "center" && adjust.targetId != null, "adjust has no time limit");
  assert((adjust.toAngle + 180) % 360 === adjust.fromAngle, "the first pass comes straight through");
  room.updateConfig({ speed: "fast", gapSeconds: 1 });
  assert(room.snapshot().config.centerSeconds === 2 && room.snapshot().config.peripheralSeconds === 3.5, "fast preset");
  assert(room.snapshot().config.gapSeconds === 1, "gap can be tuned while adjusting");
  room.start("train");
  const train = room.snapshot();
  const trainEnd = train.endsAt;
  const trainStart = train.startedAt;
  if (train.config.mode !== "train" || trainEnd == null || trainStart == null) {
    throw new Error("training has an end");
  }
  assert(trainEnd - trainStart === 20_000, "20 second training");
  room.updateConfig({ durationSeconds: 30 });
  assert(room.snapshot().config.durationSeconds === 20, "training locks the settings");
  room.stop();
  room.updateConfig({ durationSeconds: 30 });
  room.start("train");
  const longer = room.snapshot();
  const longerEnd = longer.endsAt;
  const longerStart = longer.startedAt;
  assert(longerEnd != null && longerStart != null && longerEnd - longerStart === 30_000, "30 second training");
  for (const extra of ["c", "d", "e", "f"]) room.addDisplay(fakeSocket(), extra);
  const rejected = room.addDisplay(fakeSocket(), "g");
  assert(!rejected.ok, "seventh peripheral is rejected");
} finally {
  room.destroy();
}

console.log("saccade rules ok");
