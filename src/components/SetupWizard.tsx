"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { PlacementMap } from "@/components/PlacementMap";
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

const STEPS = ["説明", "設定", "配置", "確認"] as const;

export function SetupWizard({
  snapshot,
  connected,
  send,
  onDone,
}: {
  snapshot: RoomSnapshot;
  connected: boolean;
  send: (msg: ClientMessage) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const cfg = snapshot.config;
  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/d/?code=${snapshot.code}`;
  }, [snapshot.code]);
  const joined = snapshot.displays.length;
  const online = snapshot.displays.filter((d) => d.connected).length;
  const roster = online + (connected ? 1 : 0);
  const slots = placementsFor(joined);
  const placeByNo = new Map(slots.map((slot) => [slot.no, slot.clock]));

  const patch = (partial: Partial<RoomConfig>) => {
    send({ type: "updateConfig", config: partial });
  };

  return (
    <div className="wizard">
      <header className="wizard-top">
        <div>
          <p className="eyebrow">Saccade · セットアップ</p>
          <h1>ルーム {snapshot.code}</h1>
        </div>
        <div className="wizard-top-actions">
          <SessionExit compact />
          <div className={`pill ${connected ? "ok" : "bad"}`}>{connected ? "接続中" : "再接続中…"}</div>
        </div>
      </header>

      <ol className="wizard-steps" aria-label="手順">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "active" : i < step ? "done" : ""}>
            <span className="n">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <section className="panel wizard-panel">
        {step === 0 ? (
          <div className="wizard-body">
            <h2>サッケード</h2>
            <ul className="explain-list">
              <li>この端末を真ん中に置きます。顔は動かさず、目だけで黒い丸を追います。</li>
              <li>丸は必ず真ん中を通り、周囲のどれかの端末へ向かいます。</li>
              <li>向かった端末の外側ではね返り、また真ん中に戻ります。</li>
              <li>端末と端末のあいだでは丸は消えます。距離は現場で秒数を合わせます。</li>
              <li>まず調整モードで動きを見て、合ったらトレーニングを始めます。</li>
              <li>トレーニングは20秒か30秒で終わります。点数はありません。</li>
            </ul>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="wizard-body">
            <h2>速さと時間</h2>
            <div className="btn-row">
              <button
                type="button"
                className={`btn ${cfg.speed === "normal" ? "primary" : ""}`}
                onClick={() => patch({ speed: "normal" })}
              >
                通常
              </button>
              <button
                type="button"
                className={`btn ${cfg.speed === "fast" ? "primary" : ""}`}
                onClick={() => patch({ speed: "fast" })}
              >
                早め
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
                onChange={(e) => patch({ peripheralSeconds: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>端末のあいだで消える: {cfg.gapSeconds.toFixed(1)}秒</span>
              <input
                type="range"
                min={MIN_GAP}
                max={MAX_GAP}
                step={0.5}
                value={cfg.gapSeconds}
                onChange={(e) => patch({ gapSeconds: Number(e.target.value) })}
              />
            </label>
            <div className="btn-row">
              <button
                type="button"
                className={`btn ${cfg.durationSeconds === 20 ? "primary" : ""}`}
                onClick={() => patch({ durationSeconds: 20 })}
              >
                20秒
              </button>
              <button
                type="button"
                className={`btn ${cfg.durationSeconds === 30 ? "primary" : ""}`}
                onClick={() => patch({ durationSeconds: 30 })}
              >
                30秒
              </button>
            </div>
            <p className="muted">通常は真ん中3秒、端5秒。早めは真ん中2秒、端3.5秒です。画面の中の速さは一定です。</p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-body">
            <h2>周囲の端末を置く</h2>
            <p className="join-meter">接続中 {roster} 台（コントローラを含む）。3台そろうまで開始できません。</p>
            <PlacementMap count={joined} />
            <div className="qr-wrap">{displayUrl ? <QRCodeSVG value={displayUrl} size={180} /> : null}</div>
            <p className="mono url">{displayUrl}</p>
            {joined > 0 ? (
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
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="wizard-body">
            <h2>準備完了</h2>
            <ul className="summary-list">
              <li>この端末を真ん中に置く</li>
              <li>接続中 {roster} 台（コントローラを含む）</li>
              <li>
                真ん中 {cfg.centerSeconds.toFixed(1)}秒、端 {cfg.peripheralSeconds.toFixed(1)}秒、消える{" "}
                {cfg.gapSeconds.toFixed(1)}秒
              </li>
              <li>トレーニング {cfg.durationSeconds}秒</li>
            </ul>
            <p className="muted">次の画面で、調整モードかトレーニングを選びます。</p>
          </div>
        ) : null}
      </section>

      <footer className="wizard-nav">
        <button type="button" className="btn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          戻る
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn primary"
            disabled={step === 2 && (roster < 3 || joined > 6)}
            onClick={() => setStep((s) => s + 1)}
          >
            {step === 2 && roster < 3 ? "3台そろうまで進めません" : "次へ"}
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={roster < 3} onClick={onDone}>
            {roster < 3 ? "3台そろうまで開始できません" : "操作へ"}
          </button>
        )}
      </footer>
      <SessionExit onStop={() => send({ type: "stop" })} />
    </div>
  );
}
