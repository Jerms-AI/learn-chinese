import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "ffmpeg-static",
    "fluent-ffmpeg",
    "microsoft-cognitiveservices-speech-sdk",
  ],
};

export default nextConfig;
