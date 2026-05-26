"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { PhraseCard } from "@/components/PhraseCard";
import { MicButton } from "@/components/MicButton";
import { type TutorPayload } from "@/components/TutorPanel";
import { IntroducedList } from "@/components/IntroducedList";
import { applyEvent, initialState, tierFromAvgAccuracy, avgWordAccuracy, type Score } from "@/lib/conversation/state";
import { saveState, loadState, clearState } from "@/lib/conversation/persistence";
import { fetchTurn, postScore, postTts, postTranscribe } from "@/lib/api-client";

function reducer(s: ReturnType<typeof initialState>, e: Parameters<typeof applyEvent>[1]) {
  return applyEvent(s, e);
}

export default function Page() {
  const [state, dispatch] = useReducer(reducer, initialState());
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutor, setTutor] = useState<TutorPayload | null>(null);
  const [tutorRetries, setTutorRetries] = useState(0);
  const [lastScore, setLastScore] = useState<Score | null>(null);
  const [tutorAttempt, setTutorAttempt] = useState<Score | null>(null);
  const [retryHint, setRetryHint] = useState<string | null>(null);
  const [hideTranslations, setHideTranslations] = useState(false);
  const [userFreeFormPhrase, setUserFreeFormPhrase] = useState<{ hanzi: string; pinyin: string; english: string } | null>(null);
  const [decks, setDecks] = useState<Array<{ id: string; title: string; pairCount: number }>>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("all");
  const hydratedRef = useRef(false);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot hydration from localStorage
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
      localStorage.setItem("learn-chinese:hide-translations:v1", hideTranslations ? "1" : "0");
    }
  }, [hideTranslations]);

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
    setBusy(true);
    try {
      const out = await fetchTurn({
        history: state.history,
        lastUserScore: null,
        activeDeckIds: selectedDeckId === "all" ? [] : [selectedDeckId],
        metaIntent,
        currentPairId: state.currentPairId,
        introducedIds: state.introducedIds,
        mastery: state.mastery,
      });
      if (out.aiUtterance) {
        const url = await prefetchTts(out.aiUtterance.hanzi);
        dispatch({
          type: "AI_SPOKE",
          utterance: out.aiUtterance,
          expectedResponse: out.expectedUserResponse,
          pairId: out.pairId,
          isNewPhrase: out.isNewPhrase,
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
    const inTutor = !!tutor;
    const inFreeForm = !inTutor && state.mode === "awaiting-user-question";

    // FREE-FORM PATH: user is asking anything. Transcribe → ask orchestrator
    // for a natural reply + the next scripted Q.
    if (inFreeForm) {
      setBusy(true);
      try {
        const { transcript } = await postTranscribe(blob);
        if (!transcript || !transcript.trim()) {
          // Azure heard nothing — keep the user in free-form mode and prompt retry.
          setRetryHint("I didn't catch that. Hold space and try again.");
          return;
        }
        dispatch({ type: "USER_FREEFORM", transcript });
        const out = await fetchTurn({
          history: state.history,
          lastUserScore: null,
          activeDeckIds: selectedDeckId === "all" ? [] : [selectedDeckId],
          metaIntent: null,
          currentPairId: state.currentPairId,
          introducedIds: state.introducedIds,
          mastery: state.mastery,
          userFreeFormTranscript: transcript,
        });
        // Capture Claude's augmented version of what the user said (pinyin + english).
        if (out.userAugmented) {
          setUserFreeFormPhrase(out.userAugmented);
        }
        // Kick off BOTH TTS fetches in parallel — by the time the response
        // finishes playing, the next-phrase audio is almost certainly ready.
        const respPromise = out.aiResponse ? prefetchTts(out.aiResponse.hanzi) : Promise.resolve<string | null>(null);
        const utterPromise = out.aiUtterance ? prefetchTts(out.aiUtterance.hanzi) : Promise.resolve<string | null>(null);

        if (out.aiResponse) {
          const url = await respPromise;
          dispatch({ type: "AI_RESPONDED_FREEFORM", utterance: out.aiResponse });
          if (url) await playAudio(url);
          await new Promise((r) => setTimeout(r, 1200));
        }
        if (out.aiUtterance) {
          setLastScore(null);
          setUserFreeFormPhrase(null); // clear once we transition to next scripted Q
          const url = await utterPromise; // likely already resolved by now
          dispatch({
            type: "AI_SPOKE",
            utterance: out.aiUtterance,
            expectedResponse: out.expectedUserResponse,
            pairId: out.pairId,
            isNewPhrase: out.isNewPhrase,
          });
          if (url) await playAudio(url);
        }
      } finally { setBusy(false); }
      return;
    }

    // In tutor mode, the user is drilling a single character — score against THAT,
    // not the full sentence (otherwise the missing characters all score 0 and the
    // loop chases a different "worst word" each retry).
    const ref = inTutor
      ? tutor!.retryPrompt
      : state.expectedResponse?.hanzi ?? state.pendingPhrase?.hanzi ?? "";
    setRetryHint(null); // clear any prior "didn't catch that" while we score the new attempt
    setBusy(true);
    try {
      const score = await postScore(blob, ref);
      const scoreShape: Score = {
        accuracy: score.accuracy,
        completeness: score.completeness,
        tonesOk: score.tonesOk,
        words: score.words,
      };

      // RECOGNITION OVERRIDE: trust Azure's speech-to-text over its pronunciation
      // assessment. Per-word accuracy scoring is wildly inconsistent on Mandarin
      // (same audio can score 25 or 98 across re-runs), but the transcript is
      // reliable. If Azure heard the expected text, count as a pass — the user
      // genuinely said the thing. Per-word dots stay raw for honest feedback.
      const norm = (s: string) => s.replace(/[\s。，！？.,!?]/g, "");
      const recognizedTarget = inTutor
        ? (tutor ? norm(tutor.retryPrompt) : "")
        : norm(state.expectedResponse?.hanzi ?? "");
      const heard = norm(score.transcript);
      const recognized = !!recognizedTarget && heard.includes(recognizedTarget);
      if (recognized) {
        if (inTutor) {
          // Tutor retries also bump per-word so the small dot turns green-ish.
          scoreShape.accuracy = Math.max(scoreShape.accuracy, 70);
          scoreShape.tonesOk = true;
          if (scoreShape.words.length > 0) {
            scoreShape.words = scoreShape.words.map((w) => ({
              ...w,
              accuracy: Math.max(w.accuracy, 70),
            }));
          }
        } else {
          // Full-sentence: bump overall + tonesOk so the orchestrator advances,
          // but leave per-word accuracies untouched. The dots show real numbers
          // (so you see WHICH chars Azure had trouble with) but you still pass.
          scoreShape.accuracy = Math.max(scoreShape.accuracy, 80);
          scoreShape.tonesOk = true;
        }
      }

      // Only overwrite the full-sentence score chips on the PhraseCard when this
      // is a full-sentence attempt. Tutor retries shouldn't clobber that view.
      if (inTutor) setTutorAttempt(scoreShape);
      else setLastScore(scoreShape);

      // For full-sentence attempts, compute tier from per-character average accuracy.
      // Tutor retries don't push into the rolling-tier window (tier = null).
      // When recognized but raw accuracy would tier red, bump to orange so the
      // user's mastery streak can still advance (the dot honestly logs that it
      // was a marginal attempt, but progression isn't blocked).
      const avgChar = avgWordAccuracy(scoreShape);
      const rawTier = tierFromAvgAccuracy(avgChar);
      const tier = inTutor ? null : (recognized && rawTier === "red" ? "orange" : rawTier);
      const passed = !inTutor && tier !== "red" && scoreShape.completeness >= 50;
      dispatch({
        type: "USER_UTTERANCE",
        transcript: score.transcript,
        score: scoreShape,
        passed,
        tier,
      });

      // Compute what the mastery WILL be after the reducer applies this attempt,
      // and send THAT to the orchestrator. The state closure here is pre-dispatch,
      // so without this the orchestrator can't see the attempt that just landed
      // (e.g. won't recognize that the third green just made this pair mastered).
      const nextMastery = state.currentPairId && tier
        ? {
            ...state.mastery,
            [state.currentPairId]: {
              lastTiers: [...(state.mastery[state.currentPairId]?.lastTiers ?? []), tier].slice(-3),
              attempts: (state.mastery[state.currentPairId]?.attempts ?? 0) + 1,
              correct: (state.mastery[state.currentPairId]?.correct ?? 0) + (tier !== "red" ? 1 : 0),
              lastSeenAt: Date.now(),
            },
          }
        : state.mastery;

      const out = await fetchTurn({
        history: state.history,
        lastUserScore: scoreShape,
        activeDeckIds: selectedDeckId === "all" ? [] : [selectedDeckId],
        metaIntent: null,
        isRetry: inTutor,
        currentPairId: state.currentPairId,
        introducedIds: state.introducedIds,
        mastery: nextMastery,
      });

      if (out.routeTo === "tutor" && out.tutorPayload) {
        setRetryHint(null);
        const isSameTarget = tutor?.targetWord === out.tutorPayload.targetWord;
        const nextRetries = isSameTarget ? tutorRetries + 1 : 0;
        setTutorRetries(nextRetries);
        setTutor(out.tutorPayload);
        // Auto-play the target character so the user hears what to repeat.
        // Each consecutive retry on the same char slows down further (0.85, 0.7, 0.6 ...).
        const rate = Math.max(0.55, 1.0 - nextRetries * 0.15);
        try {
          const url = await postTts(out.tutorPayload.targetWord, nextRetries === 0 ? undefined : rate);
          await playAudio(url);
        } catch { /* swallow; user can still try */ }
        return;
      }

      if (out.routeTo === "retry-full") {
        setTutor(null);
        setTutorAttempt(null);
        setRetryHint(out.retryHint ?? "Try that again.");
        return;
      }

      // Pass branch. Pause briefly so the user can read their per-char accuracy.
      await new Promise((r) => setTimeout(r, 1500));

      setTutorAttempt(null);
      setTutor(null);
      setTutorRetries(0);
      setRetryHint(null);
      dispatch({ type: "AI_CONFIRMED" });
      if (out.aiUtterance) {
        setLastScore(null); // clear old score before next prompt
        const url = await prefetchTts(out.aiUtterance.hanzi);
        dispatch({
          type: "AI_SPOKE",
          utterance: out.aiUtterance,
          expectedResponse: out.expectedUserResponse,
          pairId: out.pairId,
          isNewPhrase: out.isNewPhrase,
        });
        await playAudio(url);
      }
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 space-y-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl">学中文</h1>
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
                setLastScore(null);
                setTutor(null);
                setTutorAttempt(null);
                setRetryHint(null);
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
          {state.pendingPhrase && (() => {
            const currentTiers = state.currentPairId ? state.mastery[state.currentPairId]?.lastTiers ?? [] : [];
            const latest = currentTiers[currentTiers.length - 1] ?? null;
            const isFreeForm = state.mode === "awaiting-user-question";
            return (
              <PhraseCard
                phrase={state.pendingPhrase}
                expectedResponse={state.expectedResponse}
                lastScore={isFreeForm ? null : lastScore}
                isNew={!state.currentPairId ? false : (state.mastery[state.currentPairId]?.attempts ?? 0) === 0}
                latestTier={latest}
                hideTranslations={hideTranslations}
                isFreeForm={isFreeForm}
                userJustAsked={userFreeFormPhrase}
                onToggleTranslations={() => setHideTranslations((v) => !v)}
                onReplay={() => audioUrl && playAudio(audioUrl)}
              />
            );
          })()}

          {tutor && (
            <div className="rounded-md border-l-4 border-terracotta bg-terracotta/5 px-4 py-3 flex items-center justify-between gap-3">
              <div className="text-sm text-ink-soft">
                <span className="text-xs uppercase tracking-widest text-terracotta font-medium mr-2">Drill</span>
                Repeat after me: <span className="font-serif text-2xl text-ink ml-1">{tutor.targetWord}</span>
                {tutorAttempt && (
                  <span className="ml-3 text-xs text-ink-soft">last: {tutorAttempt.accuracy}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-ink-soft">
                <button
                  onClick={async () => {
                    try {
                      const rate = Math.max(0.55, 1.0 - tutorRetries * 0.15);
                      const url = await postTts(tutor.targetWord, tutorRetries === 0 ? undefined : rate);
                      await playAudio(url);
                    } catch {}
                  }}
                  className="underline hover:text-ink"
                  disabled={busy}
                >
                  hear again
                </button>
                <button
                  onClick={() => { setTutor(null); setTutorAttempt(null); setTutorRetries(0); dispatch({ type: "TUTOR_RESOLVED" }); }}
                  className="underline hover:text-ink"
                  disabled={busy}
                >
                  skip
                </button>
              </div>
            </div>
          )}

          {!tutor && retryHint && (
            <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-ink-soft">
              {retryHint}
            </div>
          )}

          <MicButton onAudio={userSpoke} />
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
