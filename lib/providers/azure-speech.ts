import "server-only";

export type AzureCreds = { key: string; region: string };

export function getAzureCreds(): AzureCreds {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error("AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set");
  }
  return { key, region };
}
