import Link from "next/link";
import { notFound } from "next/navigation";
import { getApplication } from "@/lib/store";
import ApplicationView from "@/components/ApplicationView";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const app = await getApplication(id);
  if (!app) notFound();
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <nav className="mb-6 flex items-center justify-between text-sm">
        <Link href="/" className="text-white/60 hover:text-white">← ImpactLens</Link>
        <Link href="/review" className="text-white/60 hover:text-white">Reviewer panel →</Link>
      </nav>
      <ApplicationView initial={app} />
    </main>
  );
}
