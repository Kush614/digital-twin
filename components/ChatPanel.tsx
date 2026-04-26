"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

type Props = {
  personaId: string;
  personaName: string;
  onSpeakingChange: (s: boolean) => void;
  onReply: (text: string) => void;
};

export default function ChatPanel({ personaId, personaName, onSpeakingChange, onReply }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, messages: next }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        setMessages((m) => [...m, { role: "assistant", content: `[error] ${err.slice(0, 200)}` }]);
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }

      onReply(acc);
      await speak(acc);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `[error] ${e?.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function speak(text: string) {
    if (!text) return;
    onSpeakingChange(true);
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, text }),
      });
      if (r.ok && r.headers.get("content-type")?.startsWith("audio/")) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => onSpeakingChange(false);
        await audio.play();
        return;
      }
      // fallback to browser TTS
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.onend = () => onSpeakingChange(false);
        window.speechSynthesis.speak(u);
        return;
      }
    } catch {}
    onSpeakingChange(false);
  }

  function toggleVoice() {
    if (voiceMode) {
      recognitionRef.current?.stop?.();
      setVoiceMode(false);
      return;
    }
    const SR =
      (typeof window !== "undefined" && (window as any).SpeechRecognition) ||
      (typeof window !== "undefined" && (window as any).webkitSpeechRecognition);
    if (!SR) {
      alert("Browser speech recognition not supported. Try Chrome/Edge.");
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript;
      if (transcript) send(transcript);
    };
    rec.onend = () => setVoiceMode(false);
    rec.onerror = () => setVoiceMode(false);
    recognitionRef.current = rec;
    setVoiceMode(true);
    rec.start();
  }

  return (
    <div className="flex flex-col flex-1 min-h-[280px]">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scroll-fade space-y-3 pr-2 mb-3"
        style={{ maxHeight: "320px" }}
      >
        {messages.length === 0 && (
          <div className="text-sm text-white/40 italic">
            Say hi to {personaName}. They'll reply in their own voice.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[80%] bg-accent/20 border border-accent/30 px-3 py-2 rounded-lg text-sm"
                : "mr-auto max-w-[85%] bg-white/5 border border-white/10 px-3 py-2 rounded-lg text-sm whitespace-pre-wrap"
            }
          >
            {m.content || (busy && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2"
      >
        <input
          className="input flex-1"
          placeholder={`Message ${personaName}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          onClick={toggleVoice}
          className={voiceMode ? "btn" : "btn-ghost"}
          aria-label="Toggle voice mode"
        >
          {voiceMode ? "● listening" : "🎙"}
        </button>
        <button className="btn" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
