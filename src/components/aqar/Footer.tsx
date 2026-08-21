"use client";

import { ShieldCheck, Lock, Sparkles } from "lucide-react";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-card">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl overflow-hidden">
                <Image src="/logo.svg" alt="عقار Match" width={36} height={36} className="w-full h-full" />
              </div>
              <div>
                <div className="font-bold text-foreground text-lg">عقار ماتش</div>
                <div className="text-xs text-muted-foreground">
                  AqarMatch — Blind Matching
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md mb-4">
              منصة عقارية رقمية تعتمد نموذج التوفيق الذكي العميق — لا تصفح عشوائي،
              لا إعلانات، لا كشف بيانات قبل التوافق. مدعومة بمحرك خوارزمي وتشفير
              AES-256 على مستوى الحقل.
            </p>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground">
                <ShieldCheck className="w-3.5 h-3.5" />
                خصوصية أولاً
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground">
                <Lock className="w-3.5 h-3.5" />
                تشفير AES-256-GCM
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground">
                <Sparkles className="w-3.5 h-3.5" />
                محرك خوارزمي
              </span>
            </div>
          </div>

          {/* Tech stack */}
          <div>
            <h4 className="font-semibold text-foreground mb-3 text-sm">
              البنية التقنية
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Next.js 16 (App Router)</li>
              <li>TypeScript 5</li>
              <li>Tailwind CSS 4 + shadcn/ui</li>
              <li>Prisma ORM (PostgreSQL)</li>
              <li>React Hook Form + Zod</li>
              <li>AES-256-GCM Web Crypto</li>
            </ul>
          </div>

          {/* Concept */}
          <div>
            <h4 className="font-semibold text-foreground mb-3 text-sm">
              المنطق
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>· Zero-Browsing</li>
              <li>· Blind-Matching Engine</li>
              <li>· Blind Negotiation</li>
              <li>· Privacy-First UX</li>
              <li>· Mobile-First RTL</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-muted-foreground">
          <p>© 2026 عقار ماتش — نموذج توضيحي. جميع الحقوق محفوظة.</p>
          <p className="flex items-center gap-1.5">
            صُمّم بـ
            <span className="text-primary">♥</span>
            للمستخدم العربي
          </p>
        </div>
      </div>
    </footer>
  );
}
