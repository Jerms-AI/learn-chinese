"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { PhraseCard } from "@/components/PhraseCard";
import { TonedPinyin } from "@/components/TonedPinyin";
import { MicButton } from "@/components/MicButton";
import { IntroducedList } from "@/components/IntroducedList";
import { TimerBar } from "@/components/TimerBar";
import { TutorPanel } from "@/components/TutorPanel";
import { applyEvent, initialState } from "@/lib/conversation/state";
import { saveState, loadState, clearState } from "@/lib/conversation/persistence";
import { fetchTurn, postTranscribe, postTts } from "@/lib/api-client";
import { MIN_SPEECH_BYTES, containsHanzi } from "@/lib/audio/speech-guards";
import { textMatchJudge } from "@/lib/tutor/judge";
import { TUTOR_TIMEOUT_MS, SUCCESSES_TO_EXIT, FAILS_TO_DEEPEN, DEEP_TTS_RATE } from "@/lib/tutor/config";

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
  const [hidePinyin, setHidePinyin] = useState(false);
  const [hideEnglish, setHideEnglish] = useState(false);
  const [userFreeFormPhrase, setUserFreeFormPhrase] = useState<{ hanzi: string; pinyin: string; english: string } | null>(null);
  const [tutorTip, setTutorTip] = useState<string | null>(null);
  /** True while the user is holding the mic — suspends the answer timer. */
  const [holding, setHolding] = useState(false);
  const [decks, setDecks] = useState<Array<{ id: string; title: string; pairCount: number }>>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("all");
  const hydratedRef = useRef(false);
  /** Recorder reset hook — invalidates a silently-dead mic stream. */
  const micResetRef = useRef<(() => void) | null>(null);

  // Hydrate state from localStorage AFTER mount so SSR + first client render agree.
  useEffect(() => {
    const saved = loadState();
    if (saved) dispatch({ type: "REHYDRATE", state: saved });
    // Migrate the old combined toggle: if it was hidden, hide both layers once.
    const legacyHide = localStorage.getItem("learn-chinese:hide-translations:v1") === "1";
    if (legacyHide || localStorage.getItem("learn-chinese:hide-pinyin:v1") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot hydration from localStorage
      setHidePinyin(true);
    }
    if (legacyHide || localStorage.getItem("learn-chinese:hide-english:v1") === "1") {
      setHideEnglish(true);
    }
    localStorage.removeItem("learn-chinese:hide-translations:v1");
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

  useEffect(() => {
    if (hydratedRef.current) {
      localStorage.setItem("learn-chinese:hide-pinyin:v1", hidePinyin ? "1" : "0");
    }
  }, [hidePinyin]);

  useEffect(() => {
    if (hydratedRef.current) {
      localStorage.setItem("learn-chinese:hide-english:v1", hideEnglish ? "1" : "0");
    }
  }, [hideEnglish]);

  async function playAudio(url: string) {
    return new Promise<void>((resolve) => {
      const audio = new Audio(url);
      // Resolve only when playback finishes — audio.play() alone resolves on
      // start, which would let the next audio overlap this one.
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
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

  /** Run the guard gauntlet on a recording. Returns the clean transcript, or
   * null after setting the appropriate retry hint. */
  async function transcribeGuarded(blob: Blob): Promise<string | null> {
    // Near-empty audio makes the STT model hallucinate filler ("bravo.") —
    // catch it client-side before wasting an API call.
    if (blob.size < MIN_SPEECH_BYTES) {
      setRetryHint("I didn't catch that — hold space while you speak, release after.");
      return null;
    }
    const { transcript } = await postTranscribe(blob);
    const trimmed = transcript.trim();
    if (!trimmed) {
      // Audio reached the server but transcribed to nothing — classic sign of
      // a mic stream that went silent while still "live". Drop the cached
      // stream so the next press re-acquires a healthy one.
      micResetRef.current?.();
      setRetryHint("I didn't catch that. Hold space and try again.");
      return null;
    }
    // No hanzi in a Mandarin transcription = the model guessed (hallucinated
    // filler or an English rendering). Don't submit the turn — ask for a retry.
    if (!containsHanzi(trimmed)) {
      setRetryHint("I couldn't make out the Mandarin — give it another try.");
      return null;
    }
    setRetryHint(null);
    return trimmed;
  }

  /** Submit a transcript as the user's conversational turn (shared by the
   * normal mic path and tutor-exit, which submits the practiced phrase).
   * hideYouSaidCard: tutor-exit suppresses the big "you said" card — the
   * learner just drilled the phrase; the screen should reset to question +
   * timer + mic. (The phrase library still records the response.) */
  async function submitTranscript(trimmed: string, opts?: { hideYouSaidCard?: boolean }) {
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
      if (!opts?.hideYouSaidCard) setUserFreeFormPhrase(out.userAugmented);
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
  }

  async function userSpoke(blob: Blob) {
    setHolding(false);
    const inTutor = state.mode === "tutor-listening" || state.mode === "tutor-deep";
    if (inTutor) return tutorAttempt(blob);
    if (state.mode !== "awaiting-user-question") return;

    setBusy(true);
    try {
      const trimmed = await transcribeGuarded(blob);
      if (trimmed) await submitTranscript(trimmed);
    } finally { setBusy(false); }
  }

  /** The 15s answer window elapsed — tutor takes over: fetch a suggested
   * answer to the pending question, say it, and start the practice loop. */
  async function tutorTakeover() {
    dispatch({ type: "TUTOR_TIMEOUT" });
    // The "you said" card shows the answer to the PREVIOUS question — stale
    // context once the tutor takes over this one. Clear it; tutor success
    // repopulates it with the practiced answer via submitTranscript.
    setUserFreeFormPhrase(null);
    setBusy(true);
    try {
      const out = await fetchTurn({
        history: state.history,
        lastUserScore: null,
        activeDeckIds: expandSelectedDeck(selectedDeckId),
        metaIntent: "tutor-suggest",
        tutorContext: { question: state.pendingPhrase },
      });
      const target = out.tutorSuggestion;
      if (!target) {
        // Couldn't get a suggestion — release back to conversation rather
        // than stranding the user with a paused mic.
        dispatch({ type: "TUTOR_EXIT", reason: "skip" });
        return;
      }
      const url = await postTts(`试试说：${target.hanzi}`);
      dispatch({ type: "TUTOR_SUGGESTED", target });
      await playAudio(url);
    } catch {
      dispatch({ type: "TUTOR_EXIT", reason: "skip" });
    } finally { setBusy(false); }
  }

  /** One tutor repetition: judge the transcript against the target. */
  async function tutorAttempt(blob: Blob) {
    const tutor = state.tutor;
    if (!tutor) return;
    setBusy(true);
    try {
      const trimmed = await transcribeGuarded(blob);
      if (!trimmed) return; // guard-rejected audio doesn't count as an attempt

      const { pass } = textMatchJudge({ transcript: trimmed, target: tutor.target.hanzi });
      dispatch({ type: "TUTOR_ATTEMPT", transcript: trimmed, pass });

      if (pass) {
        const successes = tutor.successes + 1;
        if (successes >= SUCCESSES_TO_EXIT) {
          // Done practicing — the practiced phrase becomes the user's answer
          // to the pending question (they just said it; no third repetition).
          setTutorTip(null);
          dispatch({ type: "TUTOR_EXIT", reason: "success" });
          await submitTranscript(tutor.target.hanzi, { hideYouSaidCard: true });
        }
        return;
      }

      const fails = tutor.consecutiveFails + 1;
      const alreadyDeep = state.mode === "tutor-deep";
      if (!alreadyDeep && fails >= FAILS_TO_DEEPEN) {
        // Escalate: the coach SAYS the tip aloud (bilingual TTS), then the
        // phrase plays slowly. Tip text stays on the panel for reference.
        dispatch({ type: "TUTOR_DEEPEN" });
        const [tipOut, slowUrl] = await Promise.all([
          fetchTurn({
            history: [],
            lastUserScore: null,
            activeDeckIds: [],
            metaIntent: "tutor-tip",
            tutorContext: { target: tutor.target, attempts: [...tutor.attempts, trimmed] },
          }).catch(() => null),
          postTts(tutor.target.hanzi, DEEP_TTS_RATE),
        ]);
        if (tipOut?.tutorTip) {
          setTutorTip(tipOut.tutorTip);
          // Bilingual voice: the English coaching gets a native American
          // accent; the hanzi examples stay native Mandarin.
          const tipUrl = await postTts(tipOut.tutorTipSpeak ?? tipOut.tutorTip, undefined, { bilingual: true }).catch(() => null);
          if (tipUrl) await playAudio(tipUrl);
        }
        await playAudio(slowUrl);
      } else {
        // Replay the target so they hear it again before the next try —
        // slow when already in deep mode.
        const url = await postTts(tutor.target.hanzi, alreadyDeep ? DEEP_TTS_RATE : undefined);
        await playAudio(url);
      }
    } finally { setBusy(false); }
  }

  async function tutorReplay(slow: boolean) {
    if (!state.tutor) return;
    const url = await postTts(state.tutor.target.hanzi, slow ? DEEP_TTS_RATE : undefined);
    await playAudio(url);
  }

  function tutorSkip() {
    setTutorTip(null);
    setRetryHint(null);
    dispatch({ type: "TUTOR_EXIT", reason: "skip" });
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
                setTutorTip(null);
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
              hidePinyin={hidePinyin}
              hideEnglish={hideEnglish}
              onTogglePinyin={() => setHidePinyin((v) => !v)}
              onToggleEnglish={() => setHideEnglish((v) => !v)}
              onReplay={() => audioUrl && playAudio(audioUrl)}
            />
          )}

          {userFreeFormPhrase && !state.mode.startsWith("tutor") && (
            <div className="rounded-2xl bg-card p-10 shadow-sm text-center ring-1 ring-ink-soft/10">
              <div className="font-serif text-6xl leading-tight tracking-wide">{userFreeFormPhrase.hanzi}</div>
              {!hidePinyin && (
                <div className="mt-3 text-xl"><TonedPinyin text={userFreeFormPhrase.pinyin} /></div>
              )}
              {!hideEnglish && <div className="mt-1 text-ink-soft">{userFreeFormPhrase.english}</div>}
            </div>
          )}

          {(state.mode === "tutor-listening" || state.mode === "tutor-deep") && state.tutor && (
            <TutorPanel
              target={state.tutor.target}
              deep={state.mode === "tutor-deep"}
              successes={state.tutor.successes}
              required={SUCCESSES_TO_EXIT}
              tip={tutorTip}
              onReplay={tutorReplay}
              onSkip={tutorSkip}
              hidePinyin={hidePinyin}
              hideEnglish={hideEnglish}
            />
          )}

          {retryHint && (
            <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-ink-soft">
              {retryHint}
            </div>
          )}

          <TimerBar
            active={state.mode === "awaiting-user-question"}
            paused={busy || holding}
            durationMs={TUTOR_TIMEOUT_MS}
            onTimeout={tutorTakeover}
            resetKey={state.history.length}
          />

          <MicButton
            onAudio={userSpoke}
            onRecordStart={() => setHolding(true)}
            disabled={state.mode === "tutor-prompting"}
            micResetRef={micResetRef}
          />
        </div>

        <IntroducedList
          introducedIds={state.introducedIds}
          phraseLibrary={state.phraseLibrary}
          mastery={state.mastery}
          currentPairId={state.currentPairId}
          hidePinyin={hidePinyin}
          hideEnglish={hideEnglish}
        />
      </div>
    </main>
  );
}
