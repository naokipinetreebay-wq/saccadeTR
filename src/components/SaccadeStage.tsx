"use client";

import { useEffect, useRef } from "react";
import { CSS_PX_PER_CM, DOT_DIAMETER_CM, centerPoint, peripheralPoint } from "@/lib/motion";
import { placementsFor } from "@/lib/placement";
import { resolveSaccadeView } from "@/lib/playView";
import type { RoomSnapshot } from "@/lib/types";

function useWakeLock() {
  useEffect(() => {
    let wake: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator) wake = await navigator.wakeLock.request("screen");
      } catch {
        /* ignore */
      }
    };
    request();
    const onVis = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      wake?.release().catch(() => undefined);
    };
  }, []);
}

export function SaccadeStage({
  snapshot,
  role,
  deviceId,
}: {
  snapshot: RoomSnapshot;
  role: "center" | "display";
  deviceId?: string;
}) {
  useWakeLock();
  const boxRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const skewRef = useRef(0);
  const seenServerNow = useRef<number | null>(null);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  if (seenServerNow.current !== snapshot.serverNow) {
    seenServerNow.current = snapshot.serverNow;
    skewRef.current = snapshot.serverNow - Date.now();
  }

  const mine = snapshot.displays.find((d) => d.id === deviceId);
  const clock = placementsFor(snapshot.displays.length).find((slot) => slot.no === mine?.place)?.clock;
  const finished = snapshot.finishedAt != null && !snapshot.config.running;
  const running = snapshot.config.running;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const box = boxRef.current;
      const dot = dotRef.current;
      const snap = snapRef.current;
      const now = Date.now() + skewRef.current;
      const view = resolveSaccadeView(snap, now);
      if (!box || !dot || !snap.config.running || !view.phase || view.phaseStartedAt == null) {
        if (dot) dot.style.opacity = "0";
        raf = requestAnimationFrame(tick);
        return;
      }
      if (snap.endsAt != null && now >= snap.endsAt) {
        dot.style.opacity = "0";
        raf = requestAnimationFrame(tick);
        return;
      }
      const duration = view.phaseDurationMs || 1;
      const t = (now - view.phaseStartedAt) / duration;
      const inset = (DOT_DIAMETER_CM / 2) * CSS_PX_PER_CM;
      const width = box.clientWidth;
      const height = box.clientHeight;
      let point: { x: number; y: number } | null = null;
      if (view.phase === "center" && role === "center" && t >= 0 && t <= 1) {
        point = centerPoint(view.fromAngle, view.toAngle, t, width, height, inset);
      } else if (
        view.phase === "peripheral" &&
        role === "display" &&
        view.targetId === deviceId &&
        t >= 0 &&
        t <= 1
      ) {
        point = peripheralPoint(view.toAngle, t, width, height, inset);
      }
      if (!point) {
        dot.style.opacity = "0";
      } else {
        dot.style.opacity = "1";
        dot.style.left = `${point.x}px`;
        dot.style.top = `${point.y}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [deviceId, role]);

  if (finished) {
    return (
      <div className="saccade-stage">
        <span className="peri-result-label">終了</span>
      </div>
    );
  }

  if (!running) {
    return (
      <div className="saccade-stage">
        {role === "display" ? (
          <span className="peri-wait">
            <span className="peri-wait-no">No.{mine?.place ?? ""}</span>
            <span className="peri-wait-clock">{clock}</span>
          </span>
        ) : (
          <span className="peri-wait-clock">真ん中</span>
        )}
      </div>
    );
  }

  return (
    <div className="saccade-stage" ref={boxRef}>
      <div className="saccade-dot" ref={dotRef} />
    </div>
  );
}
