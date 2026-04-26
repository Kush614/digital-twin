import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold mb-2">Application not found</h1>
      <Link href="/apply" className="btn">Submit one →</Link>
    </main>
  );
}
