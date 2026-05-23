'use client';

import { Sparkles } from 'lucide-react';

// Tiny "AI · drafting…" pill rendered into the chat area between a lead
// message arriving and the outbound AI reply coming back over realtime.
// ChatWindow shows this purely based on local timing — we don't have a
// server-side "AI is thinking" signal. The heuristic: a lead message
// landed less than 30s ago AND the conversation is in AI mode AND no
// outbound has arrived since. Good enough for the common case where
// Groq + Meta send completes in 3-12s.

export default function AiTypingIndicator() {
  return (
    <div className="flex justify-end mb-2" aria-live="polite">
      <div className="bg-brand-soft/70 rounded-lg rounded-tr-sm px-3 py-2 inline-flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-brand" aria-hidden />
        <span className="text-[12px] text-text-secondary">AI · drafting</span>
        <span className="inline-flex gap-0.5" aria-hidden>
          <span className="w-1 h-1 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '900ms' }} />
          <span className="w-1 h-1 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '900ms' }} />
          <span className="w-1 h-1 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '900ms' }} />
        </span>
      </div>
    </div>
  );
}
