"use client";

import { SaccadeStage } from "@/components/SaccadeStage";
import type { RoomSnapshot } from "@/lib/types";

export function CenterScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  return <SaccadeStage snapshot={snapshot} role="center" />;
}
