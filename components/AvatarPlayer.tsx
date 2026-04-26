"use client";

import { useEffect, useRef } from "react";

type Props = {
  name: string;
  speaking: boolean;
  avatarId: string | null;
};

export default function AvatarPlayer({ name, speaking, avatarId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    function resize() {
      const r = canvas!.getBoundingClientRect();
      canvas!.width = r.width * dpr;
      canvas!.height = r.height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    let t = 0;
    function draw() {
      const r = canvas!.getBoundingClientRect();
      ctx!.clearRect(0, 0, r.width, r.height);

      const cx = r.width / 2;
      const cy = r.height / 2;
      const baseR = Math.min(r.width, r.height) * 0.28;
      const pulse = speaking ? Math.sin(t / 6) * 8 + Math.random() * 4 : Math.sin(t / 30) * 2;

      const grad = ctx!.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, baseR + 80);
      grad.addColorStop(0, "rgba(124,92,255,0.7)");
      grad.addColorStop(0.5, "rgba(34,211,238,0.18)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx!.fillStyle = grad;
      ctx!.beginPath();
      ctx!.arc(cx, cy, baseR + pulse + 60, 0, Math.PI * 2);
      ctx!.fill();

      // rings
      for (let i = 0; i < 3; i++) {
        const ringR = baseR + 14 + i * 14 + Math.sin(t / (10 + i * 4)) * 4 + (speaking ? pulse / 2 : 0);
        ctx!.strokeStyle = `rgba(245,243,238,${0.18 - i * 0.05})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx!.stroke();
      }

      // core
      ctx!.fillStyle = "rgba(245,243,238,0.95)";
      ctx!.beginPath();
      ctx!.arc(cx, cy, baseR + pulse, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.fillStyle = "#0a0a0f";
      ctx!.font = "600 14px 'Space Grotesk', sans-serif";
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      ctx!.fillText(name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase(), cx, cy);

      t++;
      rafRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [name, speaking]);

  if (avatarId && process.env.NEXT_PUBLIC_SPATIALREAL_EMBED_URL) {
    return (
      <iframe
        title={`${name} avatar`}
        src={`${process.env.NEXT_PUBLIC_SPATIALREAL_EMBED_URL}/${avatarId}`}
        className="w-full aspect-video"
        allow="microphone; camera"
      />
    );
  }

  return (
    <div className="relative w-full aspect-[16/10] bg-gradient-to-br from-[#180e2c] to-black">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute bottom-2 right-3 text-[10px] uppercase tracking-widest text-white/40">
        {speaking ? "Speaking" : "Idle"} · placeholder avatar (configure SpatialReal in .env)
      </div>
    </div>
  );
}
