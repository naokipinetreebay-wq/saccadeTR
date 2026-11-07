"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { SessionExit } from "@/components/SessionExit";
import { placementsFor } from "@/lib/placement";
import {
  MAX_CENTER,
  MAX_GAP,
  MAX_PERIPHERAL_TRAVEL,
  MIN_CENTER,
  MIN_GAP,
  MIN_PERIPHERAL_TRAVEL,
  type ClientMessage,
  type RoomConfig,
  type RoomSnapshot,
} from "@/lib/types";

export function ControllerPanel({
  snapshot,
  connected,
  send,
  clearSessionKeys,
  onShowCenter,
}: {
  snapshot: RoomSnapshot;
  connected: boolean;
  send: (msg: ClientMessage) => void;
  clearSessionKeys?: string[];
  onShowCenter: () => void;
}) {
  const cfg = snapshot.config;
  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/d/?code=${snapshot.code}`;
  }, [snapshot.code]);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!cfg.running || cfg.mode !== "train") return;
    const id = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [cfg.mode, cfg.running]);

  const skewRef = useMemo(() => ({ skew: snapshot.serverNow - Date.now(), seen: snapshot.serverNow }), [snapshot.serverNow]);
  const leftMs =
    cfg.running && cfg.mode === "train" && snapshot.endsAt != null
      ? Math.max(0, snapshot.endsAt - (Date.now() + skewRef.skew))
      : null;
  const slots = placementsFor(snapshot.displays.length);
  const placeByNo = new Map(slots.map((slot) => [slot.no, slot.clock]));
  const online = snapshot.displays.filter((d) => d.connected).length;
  const canStart = connected && online >= 2 && snapshot.displays.length <= 6;
  const locked = cfg.running && cfg.mode === "train";

  const patch = (partial: Partial<RoomConfig>) => {
    if (locked) return;
    send({ type: "updateConfig", config: partial });
  };

  const status =
    cfg.mode === "adjust"
      ? "調整中"
      : cfg.mode === "train"
        ? "トレーニング中"
        : snapshot.finishedAt != null
          ? "終了"
          : "待機";

  return (
    <div className="controller">
      <header className="controller-header">
        <div>
          <p className="eyebrow">Saccade</p>
          <h1>ルーム {snapshot.code}</h1>
        </div>
        <div className={`pill ${connected ? "ok" : "bad"}`}>{connected ? "接続中" : "再接続中…"}</div>
      </header>

      <section className="panel">
        <h2>{status}</h2>
        <p className="time-read">
          {leftMs != null ? Math.ceil(leftMs / 1000) : cfg.durationSeconds}
          <span className="score-denom">秒</span>
        </p>
        <p className="muted">
          {leftMs != null
            ? "残り時間で終了します。"
            : cfg.mode === "adjust"
              ? "丸を見て、消え方と速さが自然になるまで秒数を変えてください。"
              : "調整で合わせてから、トレーニングを始めます。"}
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={!canStart}
            onClick={() => {
              send({ type: "start", mode: "adjust" });
              onShowCenter();
            }}
          >
            調整モード
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!canStart}
            onClick={() => {
              send({ type: "start", mode: "train" });
              onShowCenter();
            }}
          >
            {snapshot.finishedAt != null ? "もう一度" : "トレーニング"}
          </button>
          <button type="button" className="btn danger" onClick={() => send({ type: "stop" })}>
            停止
          </button>
        </div>
        {cfg.running || snapshot.finishedAt != null ? (
          <button type="button" className="btn ghost" onClick={onShowCenter}>
            真ん中の画面
          </button>
        ) : null}
      </section>

      <section className="panel">
        <h2>速さ</h2>
        <div className="btn-row">
          <button
            type="button"
            className={`btn ${cfg.speed === "normal" ? "primary" : ""}`}
            disabled={locked}
            onClick={() => patch({ speed: "normal" })}
          >
            通常
          </button>
          <button
            type="button"
            className={`btn ${cfg.speed === "fast" ? "primary" : ""}`}
            disabled={locked}
            onClick={() => patch({ speed: "fast" })}
          >
            早め
          </button>
          <button
            type="button"
            className={`btn ${cfg.durationSeconds === 20 ? "primary" : ""}`}
            disabled={locked}
            onClick={() => patch({ durationSeconds: 20 })}
          >
            20秒
          </button>
          <button
            type="button"
            className={`btn ${cfg.durationSeconds === 30 ? "primary" : ""}`}
            disabled={locked}
            onClick={() => patch({ durationSeconds: 30 })}
          >
            30秒
          </button>
        </div>
        <label className="field">
          <span>真ん中を通る: {cfg.centerSeconds.toFixed(1)}秒</span>
          <input
            type="range"
            min={MIN_CENTER}
            max={MAX_CENTER}
            step={0.5}
            value={cfg.centerSeconds}
            disabled={locked}
            onChange={(e) => patch({ centerSeconds: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>端で往復: {cfg.peripheralSeconds.toFixed(1)}秒</span>
          <input
            type="range"
            min={MIN_PERIPHERAL_TRAVEL}
            max={MAX_PERIPHERAL_TRAVEL}
            step={0.5}
            value={cfg.peripheralSeconds}
            disabled={locked}
            onChange={(e) => patch({ peripheralSeconds: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>消えている時間: {cfg.gapSeconds.toFixed(1)}秒</span>
          <input
            type="range"
            min={MIN_GAP}
            max={MAX_GAP}
            step={0.5}
            value={cfg.gapSeconds}
            disabled={locked}
            onChange={(e) => patch({ gapSeconds: Number(e.target.value) })}
          />
        </label>
        <p className="muted">
          {!canStart
            ? "コントローラを含めて3台つながるまで開始できません。"
            : "端末の間隔が違っても、消えている秒数で連続して見えるように合わせます。"}
        </p>
      </section>

      <section className="panel">
        <h2>周囲の端末</h2>
        <p className="muted">周囲 {snapshot.displays.length} 台</p>
        <div className="qr-wrap">{displayUrl ? <QRCodeSVG value={displayUrl} size={160} /> : null}</div>
        <p className="mono url">{displayUrl}</p>
        {snapshot.displays.length === 0 ? (
          <p className="muted">まだ端末がありません。QRを読み取ってください。</p>
        ) : (
          <ul className="device-list">
            {snapshot.displays.map((d) => (
              <li key={d.id}>
                <span className="place-badge">{d.place}</span>
                <input
                  className="label-input"
                  value={d.label}
                  onChange={(e) => send({ type: "setLabel", deviceId: d.id, label: e.target.value })}
                />
                <span className="clock-label">{placeByNo.get(d.place) ?? ""}</span>
                <span className={`dot ${d.connected ? "ok" : "bad"}`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <SessionExit onStop={() => send({ type: "stop" })} clearSessionKeys={clearSessionKeys} />
    </div>
  );
}
