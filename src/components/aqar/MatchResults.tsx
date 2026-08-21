"use client";

// MatchResults — shown after the engine finishes computing.
//
// Layout:
//  • Summary header (count of matches, request ref, "edit criteria" button)
//  • Grid of BlindMatchCard (1 col mobile, 2 col desktop)
//  • Empty state if no matches ≥ threshold

import { motion } from "framer-motion";
import { Sparkles, ArrowLeft, ShieldCheck, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BlindMatchCard } from "./BlindMatchCard";
import { formatDZD } from "./store";
import type { BlindMatch } from "@/lib/schemas";

interface Props {
  matches: BlindMatch[];
  requestRef: string;
  onRestart: () => void;
}

export function MatchResults({ matches, onRestart }: Props) {
  const bestScore = matches[0]?.score ?? 0;
  const avgScore = matches.length
    ? Math.round(matches.reduce((s, m) => s + m.score, 0) / matches.length)
    : 0;

  return (
    <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 text-sm text-primary mb-2">
          <Sparkles className="w-4 h-4" />
          <span>اكتملت المطابقة الذكية</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
          {matches.length > 0
            ? `وجدنا ${matches.length} عروض تطابق معاييرك`
            : "لم نجد عروضاً مطابقة بدرجة كافية"}
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base">
          {matches.length > 0
            ? "كل عرض معروض بنسبة توافق خوارزمية — لم نكشف أي معلومات اتصال بعد. اختر عرضاً لبدء التفاوض المغلق."
            : "جرّب توسيع نطاق الميزانية أو المساحة أو تغيير المدينة للحصول على نتائج أكثر."}
        </p>
      </motion.div>

      {/* Stats strip */}
      {matches.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard
            label="عدد العروض"
            value={String(matches.length)}
            icon={<Sparkles className="w-4 h-4" />}
          />
          <StatCard
            label="أعلى توافق"
            value={`${bestScore}%`}
            icon={<ShieldCheck className="w-4 h-4" />}
            accent
          />
          <StatCard
            label="متوسط التوافق"
            value={`${avgScore}%`}
            icon={<EyeOff className="w-4 h-4" />}
          />
        </div>
      )}

      {/* Cards grid */}
      {matches.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {matches.map((m, i) => (
            <BlindMatchCard
              key={m.matchId}
              match={m}
              index={i}
              onReject={() => {/* local state handled inside card */}}
            />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-4">
            <EyeOff className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            لا توجد عروض كافية حالياً
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            محركنا بحث في قاعدة بياناتنا ولم يجد عروضاً تصل لنسبة التوافق
            الدنيا (55%). يمكنك تعديل المعايير وإعادة المحاولة.
          </p>
        </Card>
      )}

      {/* Footer actions */}
      <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          onClick={onRestart}
          variant="outline"
          size="lg"
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          تعديل المعايير وإعادة المطابقة
        </Button>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card
      className={`p-4 flex items-center gap-3 ${
        accent ? "border-primary/40 bg-primary/5" : ""
      }`}
    >
      <div
        className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${
          accent ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
        }`}
      >
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
      </div>
    </Card>
  );
}
