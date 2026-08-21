// ──────────────────────────────────────────────────────────────────
//  Message filter — SECURITY-CRITICAL server-side content filter.
//
//  This is the ONLY barrier between users and contact-info leakage
//  in DEVELOPER matches (where contact reveal is structurally blocked).
//  Any failure here defeats the entire business model's safety promise.
//
//  BLOCKING RULES (message is REJECTED entirely, not redacted):
//    (a) Phone numbers — Algerian + international, in any format
//    (b) External contact links — WhatsApp, Telegram, Instagram, Facebook
//    (c) Email addresses
//    (d) Social media handles (@username)
//
//  FLAGGING RULES (message is ALLOWED but flagged for human review):
//    (e) Arabic contact phrases ("رقمي", "واتساب", "اتصل بي", etc.)
//        — these could be legitimate questions, so we don't block them
//        automatically. They're flagged for audit review.
//
//  NORMALIZATION PIPELINE (before regex):
//    1. Convert Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to Latin (0123456789)
//    2. Strip separators (spaces, dashes, dots, parentheses) from
//       digit sequences to detect split phone numbers like "0 5 5 1..."
// ──────────────────────────────────────────────────────────────────

export interface FilterResult {
  allowed: boolean;
  reason?: string;        // user-facing rejection reason (Arabic)
  blockedReason?: string; // internal code: "phone_number" | "external_link" | "email" | "social_handle"
  flagged: boolean;       // true = allowed but flagged for review
}

// ── Arabic-Indic digit normalization ───────────────────────────
const ARABIC_INDIC: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  // Extended Arabic-Indic (Persian, used in some Algerian contexts)
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_INDIC[ch] || ch);
}

// ── Strip separators from digit sequences ──────────────────────
// Removes spaces, dashes, dots, parentheses between digits so
// "05-51-23-45-67" becomes "0551234567" for phone detection.
function stripSeparators(s: string): string {
  return s.replace(/[\s\-.\(\)]+/g, "");
}

// ── Phone number detection ─────────────────────────────────────
// Tests BOTH the raw content AND the separator-stripped version.
// We don't use \b (word boundary) on the stripped version because
// stripping can merge words with digits (e.g., "call me at 055..." →
// "callmeat055...") which removes word boundaries.
//
// CRITICAL: We ONLY match exact Algerian phone number patterns.
// We do NOT use a generic /\d{8,}/ fallback because that would
// block legitimate messages containing prices (18500000), land
// parcel numbers, dates (20250315), etc.
function detectPhoneNumber(content: string): boolean {
  const normalized = normalizeDigits(content);
  const stripped = stripSeparators(normalized);

  // Algerian mobile: 0[5-7] + exactly 8 digits = exactly 10 digits total.
  // The (?!\d) lookahead ensures the 10th digit is NOT followed by another
  // digit (prevents matching 10 digits inside a longer number like a 12-digit ID).
  // The (?<!\d) lookbehind ensures the 0 is NOT preceded by a digit.
  //
  // On raw normalized content (may have spaces/separators around the number):
  if (/(?<!\d)0[5-7]\d{8}(?!\d)/.test(normalized)) return true;
  // On stripped content (separators removed, words may merge with digits):
  if (/(?<!\d)0[5-7]\d{8}(?!\d)/.test(stripped)) return true;

  // International Algerian: +213 or 00213 + [5-7] + exactly 8 digits.
  // Total: 13 digits with +213, 14 digits with 00213.
  // Same boundary checks to prevent partial matches inside longer numbers.
  if (/(?<!\d)(?:\+?213|00213)[5-7]\d{8}(?!\d)/.test(stripped)) return true;
  if (/(?<!\d)(?:\+?213|00213)[5-7]\d{8}(?!\d)/.test(normalized)) return true;

  // NO generic /\d{8,}/ fallback — it would block prices, dates, land numbers.
  return false;
}

// ── External link detection ────────────────────────────────────
const EXTERNAL_LINK_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /wa\.me\/\S+/i, name: "whatsapp" },
  { pattern: /whatsapp\.com\/\S+/i, name: "whatsapp" },
  { pattern: /api\.whatsapp\.com\/\S+/i, name: "whatsapp" },
  { pattern: /t\.me\/\S+/i, name: "telegram" },
  { pattern: /telegram\.me\/\S+/i, name: "telegram" },
  { pattern: /instagram\.com\/\S+/i, name: "instagram" },
  { pattern: /facebook\.com\/\S+/i, name: "facebook" },
];

function detectExternalLink(content: string): string | null {
  for (const { pattern, name } of EXTERNAL_LINK_PATTERNS) {
    if (pattern.test(content)) return name;
  }
  return null;
}

// ── Email detection ────────────────────────────────────────────
// DECISION: emails are ALSO blocked in this phase. Rationale: they
// can be used to share contact info just as effectively as phone
// numbers. If we decide to allow emails later, remove this check.
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

function detectEmail(content: string): boolean {
  return EMAIL_PATTERN.test(content);
}

// ── Social media handle detection ──────────────────────────────
// @username — but we must be careful not to block emails (which
// also contain @). We check for @ at the START of a word that is
// NOT preceded by an email-domain pattern.
function detectSocialHandle(content: string): boolean {
  // Match @username at word boundary, but NOT if it's part of an email
  // (i.e., preceded by alphanumeric chars without a space)
  const matches = content.match(/(?:^|\s)@([A-Za-z0-9._-]{3,})/g);
  if (!matches) return false;
  // Filter out email-like patterns
  for (const m of matches) {
    const handle = m.trim().slice(1); // remove @ and leading space
    // If this @ is part of an email (preceded by a domain char), skip
    // But our regex already requires ^ or \s before @, so emails like
    // "user@domain.com" won't match (no space before @).
    return true;
  }
  return false;
}

// ── Arabic contact phrase detection (FLAG, not BLOCK) ──────────
const ARABIC_CONTACT_PHRASES: RegExp[] = [
  /رقمي/i,
  /رقم الهاتف/i,
  /اتصل بي/i,
  /اتصلوا بي/i,
  /كلمني/i,
  /تواصل معي/i,
  /تواصلوا معي/i,
  /واتساب/i,
  /واتس/i,
  /راني فل/i, // "I'm at [number]" — Algerian dialect
  /حسابي/i, // "my account" — could refer to social media
];

function detectContactPhrase(content: string): boolean {
  return ARABIC_CONTACT_PHRASES.some((p) => p.test(content));
}

// ── Main filter function ───────────────────────────────────────
export function filterMessageContent(content: string): FilterResult {
  if (!content || content.trim().length === 0) {
    return { allowed: false, reason: "الرسالة فارغة", flagged: false };
  }

  if (content.length > 1000) {
    return { allowed: false, reason: "الرسالة طويلة جداً (الحد 1000 حرف)", flagged: false };
  }

  // ── (b) External links — BLOCK FIRST (before phone check) ──
  // Links like wa.me/213551234567 contain phone numbers inside them;
  // we want to classify these as external_link, not phone_number.
  const linkType = detectExternalLink(content);
  if (linkType) {
    return {
      allowed: false,
      reason: "تعذّر إرسال هذه الرسالة لأنها تحتوي على رابط تواصل خارجي. لأسباب أمنية، لا يمكن مشاركة روابط واتساب أو تيليجرام أو وسائل التواصل الاجتماعي هنا — المنصة ستنظّم موعد المعاينة نيابة عنكما.",
      blockedReason: "external_link",
      flagged: false,
    };
  }

  // ── (a) Phone numbers — BLOCK ──
  if (detectPhoneNumber(content)) {
    return {
      allowed: false,
      reason: "تعذّر إرسال هذه الرسالة لأنها تحتوي على معلومات تواصل مباشرة. لأسباب أمنية، لا يمكن مشاركة أرقام الهاتف هنا — المنصة ستنظّم موعد المعاينة نيابة عنكما.",
      blockedReason: "phone_number",
      flagged: false,
    };
  }

  // ── (c) Email — BLOCK ──
  if (detectEmail(content)) {
    return {
      allowed: false,
      reason: "تعذّر إرسال هذه الرسالة لأنها تحتوي على عنوان بريد إلكتروني. لأسباب أمنية، لا يمكن مشاركة عناوين البريد هنا.",
      blockedReason: "email",
      flagged: false,
    };
  }

  // ── (d) Social media handles — BLOCK ──
  if (detectSocialHandle(content)) {
    return {
      allowed: false,
      reason: "تعذّر إرسال هذه الرسالة لأنها تحتوي على معرّف تواصل اجتماعي. لأسباب أمنية، لا يمكن مشاركة حسابات التواصل الاجتماعي هنا.",
      blockedReason: "social_handle",
      flagged: false,
    };
  }

  // ── (e) Arabic contact phrases — FLAG only (don't block) ──
  const hasContactPhrase = detectContactPhrase(content);

  return {
    allowed: true,
    flagged: hasContactPhrase,
  };
}

// Backward compatibility — old name used by existing code
export function filterMessage(content: string): FilterResult {
  return filterMessageContent(content);
}
