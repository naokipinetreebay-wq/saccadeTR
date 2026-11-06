"use client";

import { SaccadeStage } from "@/components/SaccadeStage";
import type { ClientMessage, RoomSnapshot } from "@/lib/types";

export function DisplayScreen({
  snapshot,
  deviceId,
}: {
  snapshot: RoomSnapshot;
  deviceId: string;
  send?: (msg: ClientMessage) => void;
}) {
  return <SaccadeStage snapshot={snapshot} role="display" deviceId={deviceId} />;
}
