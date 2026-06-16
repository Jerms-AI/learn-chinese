"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { PhraseCard } from "@/components/PhraseCard";
import { TonedPinyin } from "@/components/TonedPinyin";
import { MicButton } from "@/components/MicButton";
import { IntroducedList } from "@/components/IntroducedList";
import { applyEvent, initialState } from "@/lib/conversation/state";
import { saveState, loadState, clearState } from "@/lib/conversation/persistence";
import { fetchTurn, postTranscribe, postTts } from "@/lib/api-client";
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

export default function Page() {
  const [state, dispatch] = useReducer(reducer, initialState());
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryHint, setRetryHint] = useState<string | null>(null);
  const [hideTranslations, setHideTranslations] = useState(false);
  const [userFreeFormPhrase, setUserFreeFormPhrase] = useState<{ hanzi: string; pinyin: string; english: string } | null>(null);
  const [decks, setDecks] = useState<Array<{ id: string; title: string; pairCount: number }>>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("all");
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
    const savedDeck = localStorage.getItem("learn-chinese:active-deck:v1");
    if (savedDeck) {
      setSelectedDeckId(savedDeck);
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

  useEffect(() => { if (hydratedRef.current) saveState(state); }, [state]);

  // Release the analyser's mic tap once recording ends.
  useEffect(() => { if (!recording) detachMicStream(); }, [recording]);

  useEffect(() => {
    if (hydratedRef.current) {
      localStorage.setItem("learn-chinese:hide-translations:v1", hideTranslations ? "1" : "0");
    }
  }, [hideTranslations]);

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

  async function aiTurn(metaIntent: string | null = null) {
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
    const url = await postTts(text);
    setAudioUrl(url);
    return url;
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
              if (confirm("Reset all progress (mastery, history, introduced phrases)?")) {
                clearState();
                setRetryHint(null);
                setUserFreeFormPhrase(null);
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
              onReplay={() => audioUrl && playAudio(audioUrl)}
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

          {retryHint && (
            <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-ink-soft">
              {retryHint}
            </div>
          )}

          <MicButton
            onAudio={userSpoke}
            onRecordingChange={setRecording}
            onStream={(stream) => { resumeAudio(); attachMicStream(stream); }}
          />

          <VoiceVisualizer state={visualizerState} />
        </div>

        <IntroducedList
          introducedIds={state.introducedIds}
          phraseLibrary={state.phraseLibrary}
          mastery={state.mastery}
          currentPairId={state.currentPairId}
          hideTranslations={hideTranslations}
        />
      </div>
    </main>
  );
}
