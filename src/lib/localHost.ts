"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  buildLocalPlayPackage,
  overlayFromPackage,
  type HostOverlay,
} from "./localEngine";
import type { ClientMessage, RoomSnapshot } from "./types";

const CLOCK_MS = 3000;

export function useSaccadeLocalHost(
  snapshot: RoomSnapshot | null,
  send: (msg: ClientMessage) => void
) {
  const overlayRef = useRef<HostOverlay | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback(
    (overlay: HostOverlay) => {
      overlayRef.current = overlay;
      send({ type: "hostPush", overlay });
    },
    [send]
  );

  useEffect(() => {
    return () => {
      if (finishTimer.current) clearTimeout(finishTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!snapshot?.config.running) return;
    const tick = () => {
      const prev = overlayRef.current;
      if (!prev) return;
      push({ ...prev, hostNow: Date.now() });
    };
    const id = setInterval(tick, CLOCK_MS);
    return () => clearInterval(id);
  }, [snapshot?.config.running, push]);

  const stopLocal = useCallback(() => {
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = null;
    overlayRef.current = null;
    send({ type: "stop" });
  }, [send]);

  const startLocal = useCallback(
    (mode: "adjust" | "train" = "train") => {
      if (!snapshot) return;
      if (finishTimer.current) clearTimeout(finishTimer.current);
      finishTimer.current = null;

      send({ type: "start", mode, local: true });
      const now = Date.now();
      const endsAt =
        mode === "train" ? now + snapshot.config.durationSeconds * 1000 : null;
      const pkg = buildLocalPlayPackage(snapshot, mode, { startAt: now, endsAt });
      const overlay = overlayFromPackage(pkg, now);
      push(overlay);

      if (endsAt != null) {
        finishTimer.current = setTimeout(() => {
          const done: HostOverlay = {
            playPackage: null,
            phase: null,
            phaseStartedAt: null,
            phaseDurationMs: overlay.phaseDurationMs,
            fromAngle: overlay.fromAngle,
            toAngle: overlay.toAngle,
            targetId: null,
            startedAt: overlay.startedAt,
            endsAt,
            finishedAt: Date.now(),
            hostNow: Date.now(),
          };
          push(done);
          overlayRef.current = null;
        }, Math.max(0, endsAt - Date.now()));
      }
    },
    [snapshot, send, push]
  );

  return { startLocal, stopLocal };
}
