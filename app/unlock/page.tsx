export const metadata = { title: "Unlock · Learn Chinese" };

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="min-h-dvh flex items-center justify-center px-6">
      <form
        method="POST"
        action="/api/unlock"
        className="w-full max-w-xs rounded-2xl bg-card p-8 shadow-sm ring-1 ring-ink-soft/10 space-y-5 text-center"
      >
        <div className="font-serif text-4xl">学中文</div>
        <p className="text-sm text-ink-soft">Enter the passcode to continue.</p>
        <input
          name="passcode"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          inputMode="text"
          aria-label="Passcode"
          className="w-full rounded-md border border-ink-soft/30 bg-parchment px-3 py-2 text-center text-lg tracking-widest focus:outline-none focus:ring-1 focus:ring-terracotta"
        />
        {error && <p className="text-sm text-terracotta">That wasn&rsquo;t it — try again.</p>}
        <button type="submit" className="w-full rounded-full bg-terracotta px-6 py-3 text-white text-lg">
          Unlock
        </button>
      </form>
    </main>
  );
}
