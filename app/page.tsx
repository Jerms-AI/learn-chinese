"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { pinyin as toPinyin } from "pinyin-pro";
import { PhraseCard } from "@/components/PhraseCard";
import { TonedPinyin } from "@/components/TonedPinyin";
import { MicButton } from "@/components/MicButton";
import { IntroducedList } from "@/components/IntroducedList";
import { applyEvent, initialState } from "@/lib/conversation/state";
import { saveState, loadState, clearState } from "@/lib/conversation/persistence";
import { fetchTurn, postTts } from "@/lib/api-client";

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
  const [liveTranscript, setLiveTranscript] = useState("");
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
        activeDeckIds: expandSelectedDeck(selectedDeckId),
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

  async function userSpoke(_blob: Blob, capturedTranscript: string) {
    setLiveTranscript(""); // hide the "you're saying" interim box once mic releases
    const inFreeForm = state.mode === "awaiting-user-question";

    // FREE-FORM PATH: use the Web Speech transcript captured during mic hold —
    // no Azure round-trip. Azure couldn't reliably hear Mandarin tones anyway
    // and the network hop added ~1-2s per turn.
    if (inFreeForm) {
      setBusy(true);
      try {
        const transcript = capturedTranscript.trim();
        if (!transcript) {
          // Browser heard nothing — keep the user in free-form mode and prompt retry.
          setRetryHint("I didn't catch that. Hold space and try again.");
          return;
        }
        dispatch({ type: "USER_FREEFORM", transcript });
        const out = await fetchTurn({
          history: state.history,
          lastUserScore: null,
          activeDeckIds: expandSelectedDeck(selectedDeckId),
          metaIntent: null,
          currentPairId: state.currentPairId,
          introducedIds: state.introducedIds,
          mastery: state.mastery,
          userFreeFormTranscript: transcript,
        });
        if (out.userAugmented) setUserFreeFormPhrase(out.userAugmented);
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
          });
          if (url) await playAudio(url);
        }
      } finally { setBusy(false); }
      return;
    }

    // Pure free-form is the only path now. The scripted-scoring + tutor flow
    // was removed alongside Azure pronunciation assessment. If we ever didn't
    // hit the free-form branch above, just return silently.
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

          {liveTranscript && (
            <div className="rounded-2xl bg-terracotta/5 ring-1 ring-terracotta/20 p-6 text-center">
              <div className="text-[10px] uppercase tracking-widest text-terracotta mb-1">you&apos;re saying</div>
              <div className="font-serif text-3xl leading-tight">{liveTranscript}</div>
              {!hideTranslations && (
                <div className="mt-2 text-base text-ink-soft">
                  <TonedPinyin text={toPinyin(liveTranscript, { toneType: "symbol", type: "string" })} />
                </div>
              )}
            </div>
          )}

          <MicButton onAudio={userSpoke} onLiveTranscript={setLiveTranscript} />
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
