"use client";

import { motion } from "framer-motion";
import { ClipboardList, Cpu, Lock, Handshake } from "lucide-react";

const STEPS = [
  {
    num: "01",
    icon: ClipboardList,
    title: "أدخل معاييرك بدقة",
    desc: "معالج تفاعلي من 4 خطوات: نوع العقار، الموقع، الميزانية، والمزايا. لا صور، لا ضجيج — فقط ما يهمك فعلاً.",
  },
  {
    num: "02",
    icon: Cpu,
    title: "المحرك يطابق خوارزمياً",
    desc: "نطبّق معاييرك على قاعدة بياناتنا الكاملة، نحسب نسب التوافق لكل عرض (ميزانية، مساحة، غرف، مزايا)، ونرتّبها تنازلياً.",
  },
  {
    num: "03",
    icon: Lock,
    title: "نتائج عمياء (Blind)",
    desc: "ترى أفضل 6 نتائج بنسب توافق عالية — لكن العنوان الدقيق وبيانات الاتصال تظل مشفّرة. أنت تختار أي عرض تريد فتحه.",
  },
  {
    num: "04",
    icon: Handshake,
    title: "تفاوض مغلق ثم فتح",
    desc: "تقدّم عرضك على السعر، البائع يرد دون رؤية هويتك. عند التوافق (فرق ≤ 2%)، تُفتح بيانات الاتصال تلقائياً.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-24 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 mb-4">
            <span className="text-xs font-medium text-primary">
              آلية العمل
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            أربع خطوات من الفكرة إلى العقار
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            صُمّمت كل خطوة لتقليل النقرات وزيادة الدقة — هدفنا إيصالك لنتيجة
            مطابقة حقيقية خلال أقل من دقيقتين.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="relative rounded-2xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-lg transition-all"
              >
                {/* Step number */}
                <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center shadow-lg">
                  {s.num}
                </div>

                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
                  <Icon className="w-6 h-6" />
                </div>

                <h3 className="font-bold text-foreground mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {s.desc}
                </p>

                {/* Arrow connector (desktop) */}
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -left-3 -translate-y-1/2 z-10">
                    <svg
                      className="w-6 h-6 text-primary/30"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M19 12H5M5 12l6-6M5 12l6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
