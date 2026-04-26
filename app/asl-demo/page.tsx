import Link from "next/link";
import AslVideoDemo from "@/components/AslVideoDemo";

export const metadata = {
  title: "ASL Video Demo · ImpactLens",
};

export default function AslDemoPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <nav className="mb-6 flex items-center justify-between text-sm">
        <Link href="/" className="text-white/60 hover:text-white">← ImpactLens</Link>
        <Link href="/apply" className="text-white/60 hover:text-white">Submit application →</Link>
      </nav>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="tag">Voice & Vision</span>
          <span className="tag">Z.AI GLM-4.5V</span>
          <span className="tag">Add-on demo</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-bold leading-tight bg-gradient-to-br from-white via-accent2 to-accent bg-clip-text text-transparent">
          ASL Video Transcription
        </h1>
        <p className="mt-3 text-white/70 max-w-2xl">
          Upload any sign-language clip and watch the page fingerspell it back to you. Frames are sampled evenly across the video, sent to GLM-4.5V in parallel batches, and assembled into a transcript as the letters land.
        </p>
        <p className="mt-2 text-xs text-white/40 max-w-2xl">
          Tip — to use a YouTube clip, download it first with{" "}
          <code className="font-mono text-white/70">yt-dlp &lt;url&gt;</code> or any online converter, then drop the file here.
        </p>
      </header>

      <AslVideoDemo />
    </main>
  );
}
