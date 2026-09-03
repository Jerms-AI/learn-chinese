import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serverless bundling only traces files that are statically imported. The
  // decks (YAML read via fs at request time) and the TTS mock clip must be
  // shipped with every function explicitly.
  outputFileTracingIncludes: {
    "/**": ["./decks/**", "./public/mocks/**"],
  },
  serverExternalPackages: [
    "ffmpeg-static",
    "fluent-ffmpeg",
    "microsoft-cognitiveservices-speech-sdk",
  ],
};

export default nextConfig;
