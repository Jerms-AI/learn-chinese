// Local HTTPS dev server so a phone on the same Wi-Fi can use the mic
// (getUserMedia needs a secure context). Next's --experimental-https alone
// runs `mkcert -install`, which wants a sudo password and fails silently
// in non-interactive shells — so we generate the cert ourselves (no CA
// install) with the machine's LAN IPs as SANs, then hand it to Next.
import { existsSync, mkdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(process.cwd(), "certificates");
const key = join(dir, "localhost-key.pem");
const cert = join(dir, "localhost.pem");
const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => n.address);

if (!existsSync(key) || !existsSync(cert) || process.argv.includes("--regen")) {
  const mkcert = findMkcert();
  mkdirSync(dir, { recursive: true });
  execFileSync(mkcert, ["-key-file", key, "-cert-file", cert, "localhost", "127.0.0.1", "::1", "0.0.0.0", ...lanIps], { stdio: "inherit" });
}

const port = process.env.PORT ?? "3000";
console.log(`\nPhone URL(s): ${lanIps.map((ip) => `https://${ip}:${port}`).join("  ")}\n(accept the self-signed cert warning once)\n`);

const child = spawn(
  "npx",
  ["next", "dev", "-H", "0.0.0.0", "-p", port, "--experimental-https", "--experimental-https-key", key, "--experimental-https-cert", cert],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 0));

function findMkcert() {
  try { return execFileSync("which", ["mkcert"]).toString().trim(); } catch { /* not on PATH */ }
  // Next downloads mkcert here on first --experimental-https run.
  const cache = join(homedir(), ".cache", "mkcert");
  if (existsSync(cache)) {
    const bin = execFileSync("ls", [cache]).toString().split("\n").find((f) => f.startsWith("mkcert-"));
    if (bin) return join(cache, bin);
  }
  throw new Error("mkcert not found — install it (https://github.com/FiloSottile/mkcert) or run `npx next dev --experimental-https` once to let Next download it.");
}
