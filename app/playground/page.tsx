"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { LeverControl } from "@/components/playground/LeverControl";
import { StatePicker, type PreviewMode } from "@/components/playground/StatePicker";
import { TriggerBar } from "@/components/playground/TriggerBar";
import {
  DEFAULT_PROFILES,
  PROFILE_SCHEMA,
  type Profile,
  type VisualizerState,
} from "@/lib/visualizer/profile";
import { DEFAULT_GLOBALS, GLOBAL_SCHEMA, type GlobalConfig } from "@/lib/visualizer/config";
import { deriveVisualizerState } from "@/lib/visualizer/state-map";
import {
  resumeAudio,
  attachMicStream,
  detachMicStream,
  routeElement,
  unrouteElement,
} from "@/lib/visualizer/audio";
import { postTts, fetchTurn } from "@/lib/api-client";
import {
  LEVER_GROUP,
  LEVER_HELP,
  GROUP_ICON,
  PROFILE_GROUPS,
  GLOBAL_GROUPS,
  DEFAULT_OPEN,
} from "@/components/playground/lever-meta";

const STORE_KEY = "learn-chinese:viz-playground:v2";

export default function PlaygroundPage() {
  const [profiles, setProfiles] = useState<Record<VisualizerState, Profile>>(() =>
    structuredClone(DEFAULT_PROFILES),
  );
  const [globals, setGlobals] = useState<GlobalConfig>({ ...DEFAULT_GLOBALS });
  const [mode, setMode] = useState<PreviewMode>("idle");
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.profiles) {
          // Merge onto current defaults so newly-added levers (e.g. freqMap)
          // are never missing from an older saved config.
          const merged = structuredClone(DEFAULT_PROFILES);
          (Object.keys(merged) as VisualizerState[]).forEach((k) => {
            merged[k] = { ...DEFAULT_PROFILES[k], ...(saved.profiles[k] ?? {}) };
          });
          setProfiles(merged);
        }
        if (saved.globals) setGlobals({ ...DEFAULT_GLOBALS, ...saved.globals });
      }
    } catch {
      /* ignore corrupt store */
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (hydrated.current) localStorage.setItem(STORE_KEY, JSON.stringify({ profiles, globals }));
  }, [profiles, globals]);

  useEffect(() => {
    if (!recording) detachMicStream();
  }, [recording]);

  // Which profile the sliders edit stays tied to the selected tab.
  const editState: VisualizerState = mode === "auto" ? "idle" : mode;
  // What we SHOW: an active trigger always wins over the static tab — holding
  // the mic jumps to listening, TTS to speaking, a real turn to processing.
  // With nothing active, show the picked tab so you can tune its static look.
  const liveState = deriveVisualizerState({ recording, busy, speaking });
  const previewState: VisualizerState =
    mode === "auto" ? liveState : recording || speaking || busy ? liveState : mode;

  function setLever(key: keyof Profile, v: unknown) {
    setProfiles((p) => ({ ...p, [editState]: { ...p[editState], [key]: v } as Profile }));
  }

  async function playAudio(url: string) {
    return new Promise<void>((resolve) => {
      const audio = new Audio(url);
      routeElement(audio);
      setSpeaking(true);
      const finish = () => {
        unrouteElement(audio);
        setSpeaking(false);
        resolve();
      };
      audio.onended = finish;
      audio.onerror = finish;
      audio.play().catch(finish);
    });
  }

  async function speak(text: string) {
    if (!text.trim()) return;
    resumeAudio();
    setBusy(true);
    try {
      const url = await postTts(text);
      await playAudio(url);
    } finally {
      setBusy(false);
    }
  }

  async function realTurn() {
    resumeAudio();
    setBusy(true);
    try {
      const out = await fetchTurn({
        history: [],
        lastUserScore: null,
        activeDeckIds: [],
        metaIntent: null,
      });
      if (out.aiUtterance) {
        const url = await postTts(out.aiUtterance.hanzi);
        await playAudio(url);
      }
    } finally {
      setBusy(false);
    }
  }

  function copyConfig() {
    const snippet =
      `// Paste into lib/visualizer/profile.ts and config.ts to promote this look.\n` +
      `export const DEFAULT_PROFILES = ${JSON.stringify(profiles, null, 2)};\n\n` +
      `export const DEFAULT_GLOBALS = ${JSON.stringify(globals, null, 2)};\n`;
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function reset() {
    setProfiles(structuredClone(DEFAULT_PROFILES));
    setGlobals({ ...DEFAULT_GLOBALS });
  }

  const editing = profiles[editState];

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_400px]">
      {/* Stage — dark so the glow reads */}
      <div className="relative flex min-h-[55vh] items-center justify-center bg-neutral-900">
        <VoiceVisualizer
          state={previewState}
          profiles={profiles}
          config={globals}
          width={480}
          height={420}
        />
        <div className="absolute left-4 top-4 text-xs text-white/55">
          previewing: <span className="text-white/90 capitalize">{previewState}</span>
          {mode === "auto" ? " · auto" : ""}
        </div>
      </div>

      {/* Control panel */}
      <aside className="max-h-screen space-y-5 overflow-y-auto bg-parchment p-5">
        <div>
          <h1 className="font-serif text-2xl">Visualizer Playground</h1>
          <p className="text-xs text-ink-soft">
            Pick a state, trigger it, tune every lever. Edits persist; “Copy config” promotes them.
          </p>
        </div>

        <StatePicker value={mode} onChange={setMode} />

        <TriggerBar
          onSpeak={speak}
          onRealTurn={realTurn}
          onRecordingChange={setRecording}
          onStream={(s) => {
            resumeAudio();
            attachMicStream(s);
          }}
          busy={busy}
        />

        <section>
          <h2 className="mb-2 text-xs uppercase tracking-wider text-ink-soft">
            {mode === "auto" ? "Editing: idle (auto preview)" : `Editing: ${editState}`}
          </h2>
          {PROFILE_GROUPS.map((group) => {
            const specs = PROFILE_SCHEMA.filter((s) => LEVER_GROUP[s.key] === group);
            if (!specs.length) return null;
            return (
              <details key={group} open={DEFAULT_OPEN.has(group)} className="border-b border-ink-soft/10">
                <summary className="cursor-pointer select-none py-2 text-xs font-medium text-ink">
                  <span className="mr-1">{GROUP_ICON[group]}</span>
                  {group}
                </summary>
                <div className="space-y-3 pb-3 pl-1">
                  {specs.map((spec) => (
                    <LeverControl
                      key={spec.key}
                      spec={spec}
                      help={LEVER_HELP[spec.key]}
                      value={editing[spec.key] as never}
                      onChange={(v) => setLever(spec.key, v)}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </section>

        <section>
          <h2 className="mb-2 text-xs uppercase tracking-wider text-ink-soft">Global engine</h2>
          {GLOBAL_GROUPS.map((group) => {
            const specs = GLOBAL_SCHEMA.filter((s) => LEVER_GROUP[s.key] === group);
            if (!specs.length) return null;
            return (
              <details key={group} open={DEFAULT_OPEN.has(group)} className="border-b border-ink-soft/10">
                <summary className="cursor-pointer select-none py-2 text-xs font-medium text-ink">
                  <span className="mr-1">{GROUP_ICON[group]}</span>
                  {group}
                </summary>
                <div className="space-y-3 pb-3 pl-1">
                  {specs.map((spec) => (
                    <label key={spec.key} className="block">
                      <div className="flex justify-between text-xs text-ink-soft">
                        <span>{spec.label}</span>
                        <span className="tabular-nums">{globals[spec.key].toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={spec.min}
                        max={spec.max}
                        step={spec.step}
                        value={globals[spec.key]}
                        onChange={(e) =>
                          setGlobals((g) => ({ ...g, [spec.key]: parseFloat(e.target.value) }))
                        }
                        className="w-full"
                      />
                      <p className="mt-0.5 text-[10px] leading-snug text-ink-soft/70">
                        {LEVER_HELP[spec.key]}
                      </p>
                    </label>
                  ))}
                </div>
              </details>
            );
          })}
        </section>

        <div className="flex gap-2 pt-1">
          <button
            onClick={copyConfig}
            className="rounded bg-terracotta px-3 py-1.5 text-xs text-white"
          >
            {copied ? "Copied!" : "Copy config"}
          </button>
          <button onClick={reset} className="rounded border border-ink-soft/20 px-3 py-1.5 text-xs">
            Reset to defaults
          </button>
        </div>
      </aside>
    </main>
  );
}
