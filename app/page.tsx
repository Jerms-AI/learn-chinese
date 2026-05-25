"use client";
import { useEffect, useReducer, useState } from "react";
import { PhraseCard } from "@/components/PhraseCard";
import { MicButton } from "@/components/MicButton";
import { ConversationRail } from "@/components/ConversationRail";
import { MetaBar } from "@/components/MetaBar";
import { TutorPanel, type TutorPayload } from "@/components/TutorPanel";
import { applyEvent, initialState } from "@/lib/conversation/state";
import { saveState, loadState } from "@/lib/conversation/persistence";
import { fetchTurn, postScore, postTts } from "@/lib/api-client";

function reducer(s: ReturnType<typeof initialState>, e: Parameters<typeof applyEvent>[1]) {
  return applyEvent(s, e);
}

export default function Page() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? initialState());
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutor, setTutor] = useState<TutorPayload | null>(null);

  useEffect(() => { saveState(state); }, [state]);

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
        dispatch({ type: "AI_SPOKE", utterance: out.aiUtterance });
      }
    } finally { setBusy(false); }
  }

  async function userSpoke(blob: Blob) {
    const ref = state.pendingPhrase?.hanzi ?? "";
    setBusy(true);
    try {
      const score = await postScore(blob, ref);
      dispatch({
        type: "USER_UTTERANCE",
        transcript: score.transcript,
        score: { accuracy: score.accuracy, tonesOk: score.tonesOk, words: score.words },
      });
      const out = await fetchTurn({
        history: state.history,
        lastUserScore: { accuracy: score.accuracy, tonesOk: score.tonesOk, words: score.words },
        activeDeckIds: [],
        metaIntent: null,
      });
      if (out.routeTo === "tutor" && out.tutorPayload) {
        setTutor(out.tutorPayload);
      } else {
        dispatch({ type: "AI_CONFIRMED" });
        setTutor(null);
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
        <PhraseCard phrase={state.pendingPhrase} onReplay={() => audioUrl && playAudio(audioUrl)} />
      )}

      {tutor && (
        <TutorPanel
          key={tutor.targetWord}
          payload={tutor}
          onRetry={userSpoke}
          onSkip={() => { setTutor(null); dispatch({ type: "TUTOR_RESOLVED" }); }}
        />
      )}

      {!tutor && <MicButton onAudio={userSpoke} />}

      <MetaBar onMeta={(intent) => aiTurn(intent)} />

      <section className="border-t pt-6">
        <h2 className="text-sm uppercase tracking-wider text-muted mb-3">Conversation</h2>
        <ConversationRail turns={state.history} />
      </section>
    </main>
  );
}
