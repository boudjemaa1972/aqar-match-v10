# AqarMatch — Geographic Expansion Roadmap

> This document defines the staged rollout plan for expanding AqarMatch
> beyond the initial 3-wilaya Phase 1 coverage. Each phase has explicit
> success metrics that MUST be met before advancing to the next.

## Current State — Phase 1 (launched)

**Coverage:** 3 wilayas
- الجزائر / Alger (57 communes)
- البليدة / Blida (25 communes)
- المدية / Médéa (64 communes)

**Total communes:** 146

**Why these 3 first:**
- Highest population density in the country (~10M combined).
- Strongest real-estate transaction volume.
- Geographic clustering around the capital makes seller/buyer
  liquidity viable from day one.
- All three are connected by highway — buyers often search across
  wilayas (e.g., live in Blida, work in Alger).

## Phase 2 — Central Algeria expansion

**Target wilayas (5 new):**
- Boumerdès (بومرداس)
- Tipaza (تيبازة)
- Aïn Defla (عين الدفلى)
- Bouira (البويرة)
- Djelfa (الجلفة)

**Trigger criteria (must meet ALL before Phase 2 launch):**
- [ ] Phase 1 has ≥ 500 active listings.
- [ ] Phase 1 has ≥ 50 successful matches (status=BUYER_FEE_PAID).
- [ ] Phase 1 NPS ≥ 40 (measured via post-match review form).
- [ ] Server uptime ≥ 99.5% over 30 consecutive days.
- [ ] Average match latency < 2 seconds p95.

**Estimated timeline:** 3-4 months after Phase 1 launch.

## Phase 3 — Eastern Algeria

**Target wilayas (6 new):**
- Constantine (قسنطينة)
- Annaba (عنابة)
- Skikda (سكيكدة)
- Batna (باتنة)
- Sétif (سطيف)
- Béjaïa (بجاية)

**Trigger criteria (in addition to Phase 2 criteria):**
- [ ] Phase 2 has ≥ 1,500 active listings.
- [ ] Cross-wilaya matching feature tested and stable.
- [ ] Local customer support capacity for eastern region.

**Estimated timeline:** 6-8 months after Phase 1 launch.

## Phase 4 — Western Algeria + National coverage

**Target wilayas (8+ new):**
- Oran (وهران)
- Mostaganem (مستغانم)
- Tlemcen (تلمسان)
- Sidi Bel Abbès (سيدي بلعباس)
- Mascara (معسكر)
- Tiaret (تيارت)
- Tizi Ouzou (تيزي وزو)
- Béchar (بشار)

**Goal:** Complete national coverage (all 58 wilayas) by end of Phase 4.

**Trigger criteria:**
- [ ] Phase 3 has ≥ 5,000 active listings.
- [ ] National launch marketing campaign ready.
- [ ] Payment gateway integrations (CCP, BaridiMob, Edahabia) live.

## Monitoring

The `/api/stats` endpoint exposes real-time listing counts by intent
(SELL/RENT/SEASONAL_RENT). These counts feed directly into the trigger
criteria above. A weekly cron job should snapshot these metrics into a
`metrics_history` table (TODO: implement) for trend analysis.

## Why staged rollout?

1. **Liquidity:** A matching platform needs buyer+seller density in each
   region. Launching all 58 wilayas at once would spread listings too
   thin — most searches would return "no match".
2. **Support:** Customer support capacity scales linearly with headcount,
   not with geography. Phased rollout lets us hire/train region by region.
3. **Trust:** Word-of-mouth in real estate is local. Establishing a
   strong reputation in 3 wilayas first creates case studies that make
   expansion to the next wilayas faster.
4. **Operational risk:** Each phase surfaces new edge cases (commune
   name spellings, dialect differences, local legal-status terminology)
   that are easier to fix in a small rollout than a national one.
