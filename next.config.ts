import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    // The Azure Speech SDK ships native bindings that don't survive Turbopack
    // bundling. Still used for TTS even after we dropped Azure STT + scoring.
    "microsoft-cognitiveservices-speech-sdk",
  ],
};

export default nextConfig;
