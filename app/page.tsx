"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { PhraseCard } from "@/components/PhraseCard";
import { MicButton } from "@/components/MicButton";
import { ConversationRail } from "@/components/ConversationRail";
import { MetaBar } from "@/components/MetaBar";
import { TutorPanel, type TutorPayload } from "@/components/TutorPanel";
import { IntroducedList } from "@/components/IntroducedList";
import { applyEvent, initialState, tierFromAvgAccuracy, avgWordAccuracy, type Score } from "@/lib/conversation/state";
import { saveState, loadState, clearState } from "@/lib/conversation/persistence";
import { fetchTurn, postScore, postTts } from "@/lib/api-client";

function reducer(s: ReturnType<typeof initialState>, e: Parameters<typeof applyEvent>[1]) {
  return applyEvent(s, e);
}

export default function Page() {
  const [state, dispatch] = useReducer(reducer, initialState());
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutor, setTutor] = useState<TutorPayload | null>(null);
  const [lastScore, setLastScore] = useState<Score | null>(null);
  const [tutorAttempt, setTutorAttempt] = useState<Score | null>(null);
  const [retryHint, setRetryHint] = useState<string | null>(null);
  const [hideTranslations, setHideTranslations] = useState(false);
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
    hydratedRef.current = true;
  }, []);

  useEffect(() => { if (hydratedRef.current) saveState(state); }, [state]);

  useEffect(() => {
    if (hydratedRef.current) {
      localStorage.setItem("learn-chinese:hide-translations:v1", hideTranslations ? "1" : "0");
    }
  }, [hideTranslations]);

  async function playAudio(url: string) {
    const audio = new Audio(url);
    await audio.play();
  }

  async function aiTurn(metaIntent: string | null = null) {
    setBusy(true);
    try {
      const out = await fetchTurn({
        history: state.history,
        lastUserScore: null,
        activeDeckIds: [],
        metaIntent,
        currentPairId: state.currentPairId,
        introducedIds: state.introducedIds,
        mastery: state.mastery,
      });
      if (out.aiUtterance) {
        const url = await postTts(out.aiUtterance.hanzi);
        setAudioUrl(url);
        await playAudio(url);
        dispatch({
          type: "AI_SPOKE",
          utterance: out.aiUtterance,
          expectedResponse: out.expectedUserResponse,
          pairId: out.pairId,
          isNewPhrase: out.isNewPhrase,
        });
      }
    } finally { setBusy(false); }
  }

  async function userSpoke(blob: Blob) {
    const inTutor = !!tutor;
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

      // Only overwrite the full-sentence score chips on the PhraseCard when this
      // is a full-sentence attempt. Tutor retries shouldn't clobber that view.
      if (inTutor) setTutorAttempt(scoreShape);
      else setLastScore(scoreShape);

      // For full-sentence attempts, compute tier from per-character average accuracy.
      // Tutor retries don't push into the rolling-tier window (tier = null).
      const avgChar = avgWordAccuracy(scoreShape);
      const tier = inTutor ? null : tierFromAvgAccuracy(avgChar);
      const passed = !inTutor && tier !== "red" && scoreShape.completeness >= 50;
      dispatch({
        type: "USER_UTTERANCE",
        transcript: score.transcript,
        score: scoreShape,
        passed,
        tier,
      });
      const out = await fetchTurn({
        history: state.history,
        lastUserScore: scoreShape,
        activeDeckIds: [],
        metaIntent: null,
        isRetry: inTutor,
        currentPairId: state.currentPairId,
        introducedIds: state.introducedIds,
        mastery: state.mastery,
      });

      if (out.routeTo === "tutor" && out.tutorPayload) {
        setRetryHint(null);
        setTutor(out.tutorPayload);
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
      setRetryHint(null);
      dispatch({ type: "AI_CONFIRMED" });
      if (out.aiUtterance) {
        setLastScore(null); // clear old score before next prompt
        const url = await postTts(out.aiUtterance.hanzi);
        setAudioUrl(url);
        await playAudio(url);
        dispatch({
          type: "AI_SPOKE",
          utterance: out.aiUtterance,
          expectedResponse: out.expectedUserResponse,
          pairId: out.pairId,
          isNewPhrase: out.isNewPhrase,
        });
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
            return (
              <PhraseCard
                phrase={state.pendingPhrase}
                expectedResponse={state.expectedResponse}
                lastScore={lastScore}
                isNew={!state.currentPairId ? false : (state.mastery[state.currentPairId]?.attempts ?? 0) === 0}
                latestTier={latest}
                hideTranslations={hideTranslations}
                onToggleTranslations={() => setHideTranslations((v) => !v)}
                onReplay={() => audioUrl && playAudio(audioUrl)}
              />
            );
          })()}

          {tutor && (
            <TutorPanel
              key={tutor.targetWord}
              payload={tutor}
              attemptScore={tutorAttempt}
              passThreshold={65}
              onRetry={userSpoke}
              onSkip={() => { setTutor(null); setTutorAttempt(null); dispatch({ type: "TUTOR_RESOLVED" }); }}
            />
          )}

          {!tutor && state.mode === "awaiting-user-question" && (
            <p className="text-center text-sm text-ink-soft">
              Your turn — ask me something in Mandarin.
            </p>
          )}

          {!tutor && retryHint && (
            <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-ink-soft">
              {retryHint}
            </div>
          )}

          {!tutor && <MicButton onAudio={userSpoke} />}

          <MetaBar onMeta={(intent) => aiTurn(intent)} />

          <section className="border-t pt-6">
            <h2 className="text-sm uppercase tracking-wider text-ink-soft mb-3">Conversation</h2>
            <div className="max-h-64 overflow-y-auto pr-2 rounded-md">
              <ConversationRail turns={state.history} />
            </div>
          </section>
        </div>

        <IntroducedList
          introducedIds={state.introducedIds}
          phraseLibrary={state.phraseLibrary}
          mastery={state.mastery}
          currentPairId={state.currentPairId}
        />
      </div>
    </main>
  );
}
