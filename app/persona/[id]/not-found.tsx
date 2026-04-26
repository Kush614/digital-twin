import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold mb-2">Persona not found</h1>
      <p className="text-white/60 mb-6">
        That URL isn't a forged persona — yet.
      </p>
      <Link href="/" className="btn">Forge one →</Link>
    </main>
  );
}
