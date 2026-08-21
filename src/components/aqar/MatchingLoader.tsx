"use client";

// MatchingLoader — full-screen overlay shown while the engine computes matches.
// Uses oasis-themed animated orbits + status text rotation.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const STATUS_MESSAGES = [
  "نمسح قاعدة بيانات العروض المتاحة...",
  "نطبّق معاييرك بدقة عالية...",
  "نحسب نسب التوافق الخوارزمية...",
  "نرتّب أفضل النتائج لك...",
  "نجهّز البطاقات العمياء للمطابقة...",
];

export function MatchingLoader() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % STATUS_MESSAGES.length), 1100);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center py-12 px-4">
      {/* Orbits */}
      <div className="relative w-48 h-48 mb-8">
        {/* Center pulse */}
        <motion.div
          className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-primary" />
          </div>
        </motion.div>

        {/* Outer ring with orbiting dot */}
        <div className="absolute inset-0 rounded-full border-2 border-dashed border-primary/20 animate-orbit">
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary shadow-lg shadow-primary/40" />
        </div>

        {/* Mid ring reverse */}
        <div className="absolute inset-4 rounded-full border border-accent/30 animate-orbit-reverse">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-accent" />
        </div>

        {/* Outermost soft glow */}
        <div className="absolute -inset-4 rounded-full bg-emerald-glow animate-oasis-pulse" />
      </div>

      {/* Status text */}
      <motion.div
        key={idx}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-md"
      >
        <p className="text-lg font-bold text-foreground mb-1">
          محرك التوفيق الذكي يعمل
        </p>
        <p className="text-sm text-muted-foreground">
          {STATUS_MESSAGES[idx]}
        </p>
      </motion.div>

      {/* Progress shimmer bar */}
      <div className="mt-8 w-full max-w-xs h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-l from-primary via-accent to-primary bg-[length:200%_100%]"
          animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}
