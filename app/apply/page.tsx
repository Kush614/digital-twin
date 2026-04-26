import Link from "next/link";
import ApplyForm from "@/components/ApplyForm";

export default function ApplyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 flex items-center justify-between text-sm">
        <Link href="/" className="text-white/60 hover:text-white">← ImpactLens</Link>
        <Link href="/review" className="text-white/60 hover:text-white">Reviewer panel →</Link>
      </nav>

      <h1 className="text-3xl md:text-4xl font-bold mb-2">Submit your project</h1>
      <p className="text-white/60 mb-6">
        Pick whichever input mode works for you. Your pitch is one signal — your code is the other.
      </p>

      <ApplyForm />
    </main>
  );
}
