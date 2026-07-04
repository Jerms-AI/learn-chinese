"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { PhraseCard } from "@/components/PhraseCard";
import { TonedPinyin } from "@/components/TonedPinyin";
import { MicButton } from "@/components/MicButton";
import { IntroducedList } from "@/components/IntroducedList";
import { applyEvent, initialState } from "@/lib/conversation/state";
import { saveState, loadState, clearState } from "@/lib/conversation/persistence";
import { fetchTurn, postTranscribe, postTts, postAsk, type AskAnswer } from "@/lib/api-client";
import { MIN_SPEECH_BYTES, containsHanzi } from "@/lib/audio/speech-guards";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { deriveVisualizerState } from "@/lib/visualizer/state-map";
import {
  resumeAudio,
  attachMicStream,
  detachMicStream,
  routeElement,
  unrouteElement,
} from "@/lib/visualizer/audio";

function reducer(s: ReturnType<typeof initialState>, e: Parameters<typeof applyEvent>[1]) {
  return applyEvent(s, e);
}

/** Expand the user's deck selection into the cumulative pool. Picking Pimsleur 2
 * means "the learner is at level 2, so include 1 + 2." Same idea for HSK levels. */
function expandSelectedDeck(id: string): string[] {
  if (id === "all") return [];
  const pimsleur = ["pimsleur-l1", "pimsleur-l2", "pimsleur-l3", "pimsleur-l4", "pimsleur-l5"];
  const pIdx = pimsleur.indexOf(id);
  if (pIdx >= 0) return pimsleur.slice(0, pIdx + 1);
  const hsk = ["hsk1", "hsk2"];
  const hIdx = hsk.indexOf(id);
  if (hIdx >= 0) return hsk.slice(0, hIdx + 1);
  return [id];
}

// Labels for the organic slider (index = level 0-3).
const ORGANIC_LABELS = ["On lesson", "Barely", "More", "Much more"] as const;

export default function Page() {
  const [state, dispatch] = useReducer(reducer, initialState());
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryHint, setRetryHint] = useState<string | null>(null);
  const [hideTranslations, setHideTranslations] = useState(false);
  // When on, all tutor audio (and replays) synthesize at a slower rate.
  const [slowSpeech, setSlowSpeech] = useState(false);
  // Drill mode: restrict the conversation to the learner's saved "My words".
  const [drillMyWords, setDrillMyWords] = useState(false);
  const [userFreeFormPhrase, setUserFreeFormPhrase] = useState<{ hanzi: string; pinyin: string; english: string } | null>(null);
  // Result of the most recent "ask in English" lookup (hold E). Shown until the
  // next action; also saved into state.myWords.
  const [askAnswer, setAskAnswer] = useState<AskAnswer | null>(null);
  const [decks, setDecks] = useState<Array<{ id: string; title: string; pairCount: number }>>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("all");
  // How far the tutor may stray from the active lesson (0 strict → 3 free).
  const [organicLevel, setOrganicLevel] = useState<number>(1);
  // Live signals for the voice visualizer state machine.
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const hydratedRef = useRef(false);

  const visualizerState = deriveVisualizerState({ recording, busy, speaking });

  // Hydrate state from localStorage AFTER mount so SSR + first client render agree.
  useEffect(() => {
    const saved = loadState();
    if (saved) dispatch({ type: "REHYDRATE", state: saved });
    const savedHide = localStorage.getItem("learn-chinese:hide-translations:v1");
    if (savedHide === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot hydration from localStorage
      setHideTranslations(true);
    }
    if (localStorage.getItem("learn-chinese:slow-speech:v1") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot hydration from localStorage
      setSlowSpeech(true);
    }
    if (localStorage.getItem("learn-chinese:drill-my-words:v1") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot hydration from localStorage
      setDrillMyWords(true);
    }
    const savedDeck = localStorage.getItem("learn-chinese:active-deck:v1");
    if (savedDeck) {
      setSelectedDeckId(savedDeck);
    }
    const savedOrganic = localStorage.getItem("learn-chinese:organic-level:v1");
    if (savedOrganic !== null) {
      const n = Number(savedOrganic);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot hydration from localStorage
      if (Number.isFinite(n) && n >= 0 && n <= 3) setOrganicLevel(n);
    }
    hydratedRef.current = true;
  }, []);

  // Load the available deck list once on mount.
  useEffect(() => {
    fetch("/api/decks")
      .then((r) => r.json())
      .then((data) => setDecks(data.decks ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (hydratedRef.current) {
      localStorage.setItem("learn-chinese:active-deck:v1", selectedDeckId);
    }
  }, [selectedDeckId]);

  useEffect(() => {
    if (hydratedRef.current) {
      localStorage.setItem("learn-chinese:organic-level:v1", String(organicLevel));
    }
  }, [organicLevel]);

  useEffect(() => { if (hydratedRef.current) saveState(state); }, [state]);

  // Release the analyser's mic tap once recording ends.
  useEffect(() => { if (!recording) detachMicStream(); }, [recording]);

  useEffect(() => {
    if (hydratedRef.current) {
      localStorage.setItem("learn-chinese:hide-translations:v1", hideTranslations ? "1" : "0");
    }
  }, [hideTranslations]);

  useEffect(() => {
    if (hydratedRef.current) {
      localStorage.setItem("learn-chinese:slow-speech:v1", slowSpeech ? "1" : "0");
    }
  }, [slowSpeech]);

  useEffect(() => {
    if (hydratedRef.current) {
      localStorage.setItem("learn-chinese:drill-my-words:v1", drillMyWords ? "1" : "0");
    }
  }, [drillMyWords]);

  async function playAudio(url: string) {
    return new Promise<void>((resolve) => {
      const audio = new Audio(url);
      // Route through the shared analyser so the visualizer reacts to the AI's
      // voice, then mark the speaking state for its duration.
      routeElement(audio);
      setSpeaking(true);
      const finish = () => {
        unrouteElement(audio);
        setSpeaking(false);
        resolve();
      };
      // Resolve only when playback finishes — audio.play() alone resolves on
      // start, which would let the next audio overlap this one.
      audio.onended = finish;
      audio.onerror = finish;
      audio.play().catch(finish);
    });
  }

  // forceDrill lets the drill toggle fire an immediate drill turn before the
  // drillMyWords state has flushed (React state isn't updated within the same
  // click handler that called this).
  async function aiTurn(metaIntent: string | null = null, forceDrill = false) {
    setRetryHint(null);
    setBusy(true);
    try {
      const out = await fetchTurn({
        history: state.history,
        lastUserScore: null,
        activeDeckIds: expandSelectedDeck(selectedDeckId),
        metaIntent,
        currentPairId: state.currentPairId,
        introducedIds: state.introducedIds,
        mastery: state.mastery,
        pairUsage: state.pairUsage,
        historyTurnCount: state.history.length,
        organicLevel,
        userPhrases: state.myWords.map((w) => ({ id: w.id, ...w.phrase })),
        drillMyWords: (forceDrill || drillMyWords) && state.myWords.length > 0,
      });
      if (out.aiUtterance) {
        const url = await prefetchTts(out.aiUtterance.hanzi);
        dispatch({
          type: "AI_SPOKE",
          utterance: out.aiUtterance,
          expectedResponse: out.expectedUserResponse,
          pairId: out.pairId,
          isNewPhrase: out.isNewPhrase,
          usedPairIds: out.usedPairIds,
        });
        await playAudio(url);
      }
    } finally { setBusy(false); }
  }

  /** Pre-fetch the TTS audio URL so we can dispatch the UI update + start
   * playback in the same tick (no silent gap while Azure synthesizes). */
  async function prefetchTts(text: string): Promise<string> {
    const url = await postTts(text, slowSpeech ? 0.7 : undefined);
    setAudioUrl(url);
    return url;
  }

  // "Ask in English" flow (hold E): transcribe the English question, look up the
  // Mandarin, show + speak it, and save it to the learner's word bank so it
  // resurfaces in future conversation.
  async function askInEnglish(blob: Blob) {
    if (blob.size < MIN_SPEECH_BYTES) {
      setRetryHint("I didn't catch that — hold E while you ask, release after.");
      return;
    }
    setBusy(true);
    setRetryHint(null);
    try {
      const { transcript } = await postTranscribe(blob, "en");
      const question = transcript.trim();
      if (!question) {
        setRetryHint("I didn't catch the question. Hold E and try again.");
        return;
      }
      const answer = await postAsk(question);
      setAskAnswer(answer);
      setUserFreeFormPhrase(null);
      dispatch({
        type: "ADD_USER_WORD",
        word: {
          id: `user-${answer.hanzi}`,
          phrase: { hanzi: answer.hanzi, pinyin: answer.pinyin, english: answer.english },
          addedAt: Date.now(),
        },
      });
      // Speak the new word so the learner hears its pronunciation.
      const url = await prefetchTts(answer.hanzi);
      await playAudio(url);
    } catch {
      setRetryHint("Couldn't look that up — try asking again.");
    } finally {
      setBusy(false);
    }
  }

  async function userSpoke(blob: Blob) {
    const inFreeForm = state.mode === "awaiting-user-question";
    if (!inFreeForm) return;

    // Near-empty audio makes the STT model hallucinate filler ("bravo.") —
    // catch it client-side before wasting an API call.
    if (blob.size < MIN_SPEECH_BYTES) {
      setRetryHint("I didn't catch that — hold space while you speak, release after.");
      return;
    }

    setBusy(true);
    try {
      const { transcript } = await postTranscribe(blob);
      const trimmed = transcript.trim();
      if (!trimmed) {
        setRetryHint("I didn't catch that. Hold space and try again.");
        return;
      }
      // No hanzi in a Mandarin transcription = the model guessed (hallucinated
      // filler or an English rendering). Don't submit the turn — ask for a retry.
      if (!containsHanzi(trimmed)) {
        setRetryHint("I couldn't make out the Mandarin — give it another try.");
        return;
      }
      setRetryHint(null);
      // Snapshot the pair we're responding to before USER_FREEFORM/AI_SPOKE
      // can rotate currentPairId — augmented data has to land on this entry,
      // not the next one.
      const pairIdForResponse = state.currentPairId;
      dispatch({ type: "USER_FREEFORM", transcript: trimmed });
      const out = await fetchTurn({
        history: state.history,
        lastUserScore: null,
        activeDeckIds: expandSelectedDeck(selectedDeckId),
        metaIntent: null,
        currentPairId: state.currentPairId,
        introducedIds: state.introducedIds,
        mastery: state.mastery,
        pairUsage: state.pairUsage,
        historyTurnCount: state.history.length,
        organicLevel,
        userPhrases: state.myWords.map((w) => ({ id: w.id, ...w.phrase })),
        drillMyWords: drillMyWords && state.myWords.length > 0,
        userFreeFormTranscript: trimmed,
      });
      if (out.userAugmented) {
        setUserFreeFormPhrase(out.userAugmented);
        if (pairIdForResponse) {
          dispatch({
            type: "USER_FREEFORM_AUGMENT",
            pairId: pairIdForResponse,
            hanzi: out.userAugmented.hanzi,
            english: out.userAugmented.english,
          });
        }
      }
      // Single combined utterance: AI's response + follow-up question in one
      // piece. No separate scripted Q to play afterward — pure ping-pong.
      if (out.aiUtterance) {
        const url = await prefetchTts(out.aiUtterance.hanzi);
        dispatch({
          type: "AI_SPOKE",
          utterance: out.aiUtterance,
          expectedResponse: out.expectedUserResponse,
          pairId: out.pairId,
          isNewPhrase: out.isNewPhrase,
          usedPairIds: out.usedPairIds,
        });
        if (url) await playAudio(url);
      }
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 space-y-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl">
            学中文
            <span className="ml-3 text-xs font-sans uppercase tracking-widest text-emerald-700 align-middle">OpenAI</span>
          </h1>
          {state.introducedIds.length > 0 && (
            <p className="text-xs text-ink-soft mt-1">
              {state.introducedIds.length} {state.introducedIds.length === 1 ? "phrase" : "phrases"} introduced
              {(() => {
                const mastered = state.introducedIds.filter((id) => {
                  const m = state.mastery[id];
                  if (!m || (m.lastTiers ?? []).length < 3) return false;
                  return m.lastTiers.every((t) => t !== "red");
                }).length;
                return mastered > 0 ? ` · ${mastered} mastered` : "";
              })()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div
            className="flex flex-col items-start"
            title="How far the tutor may stray from your lesson — 0 stays strictly on-lesson, 3 is free conversation"
          >
            <label htmlFor="organic" className="text-[10px] uppercase tracking-widest text-ink-soft">
              Organic · {ORGANIC_LABELS[organicLevel]}
            </label>
            <input
              id="organic"
              type="range"
              min={0}
              max={3}
              step={1}
              value={organicLevel}
              onChange={(e) => setOrganicLevel(Number(e.target.value))}
              // Drop focus after adjusting so the spacebar returns to push-to-talk
              // instead of staying captured by this slider.
              onMouseUp={(e) => e.currentTarget.blur()}
              onTouchEnd={(e) => e.currentTarget.blur()}
              disabled={busy}
              className="w-28 accent-terracotta cursor-pointer"
              aria-label="Organic level"
            />
          </div>
          <select
            value={selectedDeckId}
            onChange={(e) => setSelectedDeckId(e.target.value)}
            disabled={busy}
            className="text-xs bg-card border border-ink-soft/20 rounded-md px-2 py-1 text-ink hover:border-ink-soft/40 focus:outline-none focus:ring-1 focus:ring-terracotta"
            aria-label="Active deck"
          >
            <option value="all">All decks</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.pairCount})
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const next = !drillMyWords;
              setDrillMyWords(next);
              // Turning drill on immediately poses a drill question (forceDrill,
              // since state hasn't flushed yet in this handler).
              if (next && !busy && state.myWords.length > 0) aiTurn(null, true);
            }}
            disabled={busy || state.myWords.length === 0}
            aria-pressed={drillMyWords}
            title={state.myWords.length === 0 ? "Ask some words first (hold E), then drill them here" : "Practice only your saved words"}
            className={`text-xs underline ${
              state.myWords.length === 0
                ? "text-ink-soft/40 cursor-not-allowed no-underline"
                : drillMyWords ? "text-terracotta" : "text-ink-soft hover:text-ink"
            }`}
          >
            {drillMyWords ? "🎯 my words only: on" : "🎯 my words only"}
          </button>
          <button
            onClick={() => setSlowSpeech((v) => !v)}
            disabled={busy}
            aria-pressed={slowSpeech}
            title="Play the tutor's speech more slowly"
            className={`text-xs underline ${slowSpeech ? "text-terracotta" : "text-ink-soft hover:text-ink"}`}
          >
            {slowSpeech ? "🐢 slow speech: on" : "🐢 slow speech"}
          </button>
          <button
            onClick={() => {
              if (confirm("Reset all progress (mastery, history, introduced phrases)?")) {
                clearState();
                setRetryHint(null);
                setUserFreeFormPhrase(null);
                setAskAnswer(null);
                setDrillMyWords(false);
                dispatch({ type: "RESET" });
              }
            }}
            disabled={busy}
            className="text-xs text-ink-soft underline hover:text-ink"
          >
            reset
          </button>
          <button onClick={() => aiTurn()} disabled={busy} className="text-sm underline">
            {state.mode === "idle" ? "Start" : "Skip to next"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        <div className="space-y-8">
          {state.pendingPhrase && (
            <PhraseCard
              phrase={state.pendingPhrase}
              isNew={!state.currentPairId ? false : (state.mastery[state.currentPairId]?.attempts ?? 0) === 0}
              hideTranslations={hideTranslations}
              onToggleTranslations={() => setHideTranslations((v) => !v)}
              onReplay={async () => {
                if (state.pendingPhrase) await playAudio(await prefetchTts(state.pendingPhrase.hanzi));
              }}
            />
          )}

          {userFreeFormPhrase && (
            <div className="rounded-2xl bg-card p-10 shadow-sm text-center ring-1 ring-ink-soft/10">
              <div className="font-serif text-6xl leading-tight tracking-wide">{userFreeFormPhrase.hanzi}</div>
              {!hideTranslations && (
                <>
                  <div className="mt-3 text-xl"><TonedPinyin text={userFreeFormPhrase.pinyin} /></div>
                  <div className="mt-1 text-ink-soft">{userFreeFormPhrase.english}</div>
                </>
              )}
            </div>
          )}

          {askAnswer && (
            <div className="rounded-2xl bg-card p-10 shadow-sm text-center ring-1 ring-emerald-700/20">
              <div className="text-[10px] uppercase tracking-widest text-emerald-700">You asked how to say</div>
              <div className="mt-2 font-serif text-6xl leading-tight tracking-wide">{askAnswer.hanzi}</div>
              <div className="mt-3 text-xl"><TonedPinyin text={askAnswer.pinyin} /></div>
              <div className="mt-1 text-ink-soft">{askAnswer.english}</div>
              {askAnswer.note && <div className="mt-3 text-sm text-ink-soft italic">{askAnswer.note}</div>}
              <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                <button
                  onClick={async () => { await playAudio(await prefetchTts(askAnswer.hanzi)); }}
                  className="underline text-ink-soft hover:text-ink"
                >
                  ▶ hear it again
                </button>
                <button onClick={() => setAskAnswer(null)} className="underline text-ink-soft hover:text-ink">
                  dismiss
                </button>
              </div>
              <div className="mt-2 text-[11px] text-ink-soft">Saved to My words — it&rsquo;ll come up again in conversation.</div>
            </div>
          )}

          {retryHint && (
            <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-ink-soft">
              {retryHint}
            </div>
          )}

          <MicButton
            onAudio={userSpoke}
            onAsk={askInEnglish}
            onRecordingChange={setRecording}
            onStream={(stream) => { resumeAudio(); attachMicStream(stream); }}
          />

          <VoiceVisualizer state={visualizerState} />
        </div>

        <div className="space-y-6">
          <IntroducedList
            introducedIds={state.introducedIds}
            phraseLibrary={state.phraseLibrary}
            mastery={state.mastery}
            currentPairId={state.currentPairId}
            hideTranslations={hideTranslations}
          />

          {state.myWords.length > 0 && (
            <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-ink-soft/10">
              <div className="text-[10px] uppercase tracking-widest text-emerald-700 mb-3">
                My words ({state.myWords.length})
              </div>
              <ul className="space-y-3">
                {state.myWords.map((w) => (
                  <li key={w.id} className="flex items-baseline gap-3">
                    <span className="font-serif text-2xl leading-none">{w.phrase.hanzi}</span>
                    {!hideTranslations && (
                      <span className="text-sm text-ink-soft">
                        <TonedPinyin text={w.phrase.pinyin} /> · {w.phrase.english}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
