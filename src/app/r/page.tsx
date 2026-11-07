"use client";

import { useEffect, useState } from "react";
import { CenterScreen } from "@/components/CenterScreen";
import { ControllerPanel } from "@/components/ControllerPanel";
import { SetupWizard } from "@/components/SetupWizard";
import { useRoomCode } from "@/lib/roomCode";
import { useDeviceId, useRoomSocket } from "@/lib/ws";

export default function ControllerPage() {
  const code = useRoomCode();
  const deviceId = useDeviceId(`controller-${code}`);
  const { snapshot, error, connected, send } = useRoomSocket(code, "controller", deviceId);

  const wizardKey = `sc-wizard-done-${code}`;
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<"control" | "center">("control");

  useEffect(() => {
    setReady(sessionStorage.getItem(wizardKey) === "1");
    setHydrated(true);
  }, [wizardKey]);

  if (error && !snapshot) {
    return (
      <main className="error-page">
        <div>
          <h1>接続できません</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!snapshot || !hydrated) {
    return (
      <main className="error-page">
        <p>ルームに接続中…</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <SetupWizard
        snapshot={snapshot}
        connected={connected}
        send={send}
        onDone={() => {
          sessionStorage.setItem(wizardKey, "1");
          setReady(true);
          setView("control");
        }}
      />
    );
  }

  const showCenter = view === "center" && (snapshot.config.running || snapshot.finishedAt != null);

  if (showCenter) {
    return (
      <div className="ctrl-display-shell">
        <CenterScreen snapshot={snapshot} />
        <button type="button" className="saccade-back" onClick={() => setView("control")}>
          操作
        </button>
      </div>
    );
  }

  return (
    <ControllerPanel
      snapshot={snapshot}
      connected={connected}
      send={send}
      clearSessionKeys={[wizardKey]}
      onShowCenter={() => setView("center")}
    />
  );
}
