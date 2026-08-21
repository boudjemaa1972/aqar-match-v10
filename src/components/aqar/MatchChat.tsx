"use client";

// ──────────────────────────────────────────────────────────────────
//  MatchChat — internal chat component for matches.
//  Primarily for DEVELOPER matches (where contact reveal is blocked),
//  but can be used for any match.
//
//  Polls /api/messages/[matchId] every 5s for new messages.
//  Messages are filtered server-side — phone numbers, WhatsApp links,
//  emails, social media handles are BLOCKED.
// ──────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

interface Message {
  id: string;
  senderId: string;
  content: string;
  sentAt: string;
  isMine: boolean;
}

interface Props {
  matchId: string;
}

export function MatchChat({ matchId }: Props) {
  const { t, dir } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/${matchId}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setMessages(json.messages || []);
      }
    } catch {}
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000); // poll every 5s
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.trim() }),
      });
      const text = await res.text();
      let json: { ok?: boolean; error?: string; message?: Message; blocked?: boolean } | null = null;
      if (text) { try { json = JSON.parse(text); } catch { json = null; } }
      if (!res.ok || !json?.ok) {
        // Non-punitive error: show the rejection reason but DON'T clear the input
        // so the user can edit and retry.
        throw new Error(json?.error || t("chat.error"));
      }
      // Success — clear input + refresh
      setInput("");
      loadMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.error"));
      // DON'T clear input — let the user edit and retry
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("chat.loading")}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-2 bg-secondary/30">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold text-foreground">{t("chat.title")}</span>
      </div>

      {/* Security warning */}
      <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          {t("chat.warning")}
        </p>
      </div>

      {/* Messages */}
      <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto scroll-slim">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">{t("chat.empty")}</p>
        ) : (
          messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  msg.isMine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary text-foreground rounded-bl-sm"
                }`}
                dir={dir}
              >
                <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-[10px] mt-1 ${msg.isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {new Date(msg.sentAt).toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </motion.div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
          <p className="text-xs text-destructive flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </p>
        </div>
      )}

      {/* Input */}
      <div className="border-t p-3 flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !sending) handleSend(); }}
          placeholder={t("chat.placeholder")}
          className="h-10 flex-1"
          maxLength={1000}
          disabled={sending}
          dir={dir}
        />
        <Button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          size="icon"
          className="h-10 w-10 flex-shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
