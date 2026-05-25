"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { PhraseCard } from "@/components/PhraseCard";
import { MicButton } from "@/components/MicButton";
import { ConversationRail } from "@/components/ConversationRail";
import { MetaBar } from "@/components/MetaBar";
import { TutorPanel, type TutorPayload } from "@/components/TutorPanel";
import { applyEvent, initialState, type Score } from "@/lib/conversation/state";
import { saveState, loadState } from "@/lib/conversation/persistence";
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
  const hydratedRef = useRef(false);

  // Hydrate state from localStorage AFTER mount so SSR + first client render agree.
  useEffect(() => {
    const saved = loadState();
    if (saved) dispatch({ type: "REHYDRATE", state: saved });
    hydratedRef.current = true;
  }, []);

  useEffect(() => { if (hydratedRef.current) saveState(state); }, [state]);

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
      });
      if (out.aiUtterance) {
        const url = await postTts(out.aiUtterance.hanzi);
        setAudioUrl(url);
        await playAudio(url);
        dispatch({ type: "AI_SPOKE", utterance: out.aiUtterance, expectedResponse: out.expectedUserResponse });
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

      dispatch({
        type: "USER_UTTERANCE",
        transcript: score.transcript,
        score: scoreShape,
      });
      const out = await fetchTurn({
        history: state.history,
        lastUserScore: scoreShape,
        activeDeckIds: [],
        metaIntent: null,
        isRetry: inTutor,
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
        dispatch({ type: "AI_SPOKE", utterance: out.aiUtterance, expectedResponse: out.expectedUserResponse });
      }
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <header className="flex items-baseline justify-between">
        <h1 className="font-serif text-3xl">学中文</h1>
        <button onClick={() => aiTurn()} disabled={busy} className="text-sm underline">
          {state.mode === "idle" ? "Start" : "Skip to next"}
        </button>
      </header>

      {state.pendingPhrase && (
        <PhraseCard
          phrase={state.pendingPhrase}
          expectedResponse={state.expectedResponse}
          lastScore={lastScore}
          onReplay={() => audioUrl && playAudio(audioUrl)}
        />
      )}

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
    </main>
  );
}
