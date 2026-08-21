"use client";

// NegotiationPanel — blind negotiation interface shown inside a Dialog.
//
// Flow:
//  • Buyer enters offer → POST /api/negotiation/offer
//  • Server responds with seller counter-offer (or accepted=true)
//  • UI shows a timeline of rounds
//  • On agreement → onAgreed() callback (parent then unlocks contact)

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Handshake, TrendingDown, TrendingUp, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDZD } from "./store";

interface Round {
  buyer: number;
  seller: number;
}

interface Props {
  matchId: string;
  listingPrice: number;
  onAgreed: (agreedPrice: number) => void;
}

export function NegotiationPanel({ matchId, listingPrice, onAgreed }: Props) {
  const [offer, setOffer] = useState<string>(String(Math.round(listingPrice * 0.95)));
  const [note, setNote] = useState("");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState<number | null>(null);
  const [lastSeller, setLastSeller] = useState<number | null>(null);
  const { toast } = useToast();

  async function submitOffer() {
    const n = Number(offer);
    if (!n || n < 10000) {
      toast({
        title: "عرض غير صالح",
        description: "الحد الأدنى للعرض 10,000 دج.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/negotiation/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          offer: n,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "فشل إرسال العرض");

      // Round added (seller response will come async via polling)
      setRounds((r) => [...r, { buyer: n, seller: json.sellerOffer ?? 0 }]);

      if (json.status === "ACCEPTED") {
        setAgreed(json.agreedPrice);
        toast({
          title: "تم التوافق على السعر! 🎉",
          description: `السعر النهائي: ${formatDZD(json.agreedPrice)}`,
        });
        setTimeout(() => onAgreed(json.agreedPrice), 800);
      } else {
        toast({
          title: "تم إرسال العرض",
          description:
            json.message ||
            "تم إرسال عرضك إلى البائع — بدّل إلى وضع البائع للرد يدوياً.",
        });
      }
      setNote("");
    } catch (e) {
      toast({
        title: "خطأ في التفاوض",
        description: e instanceof Error ? e.message : "خطأ غير معروف",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="rounded-xl bg-secondary/60 p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">السعر المعروض</span>
          <span className="font-bold tabular-nums text-foreground">
            {formatDZD(listingPrice)}
          </span>
        </div>
        {lastSeller && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">آخر عرض بائع</span>
            <span className="font-bold tabular-nums text-primary">
              {formatDZD(lastSeller)}
            </span>
          </div>
        )}
      </div>

      {/* Rounds timeline */}
      {rounds.length > 0 && (
        <div className="space-y-2 max-h-44 overflow-y-auto scroll-slim">
          {rounds.map((r, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-lg border p-3 space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">الجولة {i + 1}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground">عرضك:</span>
                  <span className="font-semibold tabular-nums">
                    {formatDZD(r.buyer)}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-muted-foreground">رد البائع:</span>
                  <span className="font-semibold tabular-nums">
                    {formatDZD(r.seller)}
                  </span>
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Agreed banner */}
      {agreed && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-center gap-3"
        >
          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          <div>
            <div className="font-semibold text-foreground">تم الاتفاق!</div>
            <div className="text-sm text-muted-foreground">
              السعر النهائي: <span className="font-bold tabular-nums">{formatDZD(agreed)}</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Input form */}
      {agreed === null && (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              عرضك (دج)
            </label>
            <Input
              type="number"
              inputMode="numeric"
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              className="h-12 text-base tabular-nums"
              disabled={submitting}
            />
            <div className="flex gap-1.5">
              {[0.9, 0.93, 0.95, 0.97].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setOffer(String(Math.round(listingPrice * p)))}
                  className="px-2 py-1 text-xs rounded-md bg-secondary hover:bg-secondary/70 text-secondary-foreground transition"
                >
                  {Math.round(p * 100)}%
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              ملاحظة <span className="text-muted-foreground font-normal">(اختياري)</span>
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: لديّ سيولة جاهزة، أرغب بالإغلاق خلال أسبوع."
              maxLength={500}
              rows={2}
              disabled={submitting}
            />
          </div>

          <Button
            onClick={submitOffer}
            disabled={submitting}
            className="w-full gap-2"
            size="lg"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                جاري الإرسال...
              </>
            ) : (
              <>
                <Handshake className="w-4 h-4" />
                أرسل العرض
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
