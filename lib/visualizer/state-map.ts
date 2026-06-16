// Maps the app's real status onto a visualizer state.
//
// Order matters: while the AI is speaking the page is still `busy`, so speaking
// must win over processing. And recording wins over everything.

import type { VisualizerState } from "./profile";

export type AppSignals = {
  recording: boolean; // mic is actively capturing
  busy: boolean; // a request (transcribe/turn/tts) is in flight
  speaking: boolean; // TTS audio is currently playing
};

export function deriveVisualizerState(s: AppSignals): VisualizerState {
  if (s.recording) return "listening";
  if (s.speaking) return "speaking";
  if (s.busy) return "processing";
  return "idle";
}
