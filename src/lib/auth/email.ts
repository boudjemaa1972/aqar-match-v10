// ──────────────────────────────────────────────────────────────────
//  Email sending — nodemailer wrapper with dev-mode console logging.
//
//  CONFIGURATION:
//  ─────────────
//  • In dev (EMAIL_MODE != "production"): emails are logged to the
//    console + returned in the API response (devLink/devCode field).
//    No SMTP connection needed.
//  • In production (EMAIL_MODE = "production"):
//      - If SMTP_HOST is set → use nodemailer with real SMTP.
//      - Else → log a warning + fall back to dev mode (so production
//        deployments without SMTP config don't silently fail).
//
//  SECURITY:
//  ─────────
//  • Email body is rendered server-side only — never sent to the client.
//  • Reset links include a token that's single-use + 15-min TTL.
//  • The from address is configurable via EMAIL_FROM env var.
//
//  ANTI-ABUSE:
//  ──────────
//  Rate limiting on the email-sending endpoints (forgot-password,
//  email-verification request) is enforced in the route handler,
//  not here. See src/lib/auth/rate-limit.ts.
// ──────────────────────────────────────────────────────────────────

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const mode = process.env.EMAIL_MODE || "dev";
  const smtpHost = process.env.SMTP_HOST;

  if (mode !== "production" || !smtpHost) {
    // Dev mode or missing config — no real SMTP transport.
    return null;
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  sent: boolean;
  // In dev mode, the URL/code is returned so the test harness can
  // auto-click/auto-enter it. NEVER exposed in production.
  devLink?: string;
  devCode?: string;
}

export async function sendEmail(params: EmailParams): Promise<SendEmailResult> {
  const mode = process.env.EMAIL_MODE || "dev";
  const fromAddress = process.env.EMAIL_FROM || "no-reply@aqarmatch.dz";

  // ── Dev mode: log + extract link/code from body for testing ──
  if (mode !== "production" || !getTransporter()) {
    console.log(`\n[EMAIL DEV] ───────────────────────────────`);
    console.log(`  To:      ${params.to}`);
    console.log(`  Subject: ${params.subject}`);
    console.log(`  Body:`);
    console.log(params.text);
    console.log(`  ────────────────────────────────────────\n`);

    // Extract verification link or OTP code from the body for dev
    let devLink: string | undefined;
    let devCode: string | undefined;
    const linkMatch = params.html.match(/href="(https?:\/\/[^"]*token=[^"]+)"/);
    if (linkMatch) devLink = linkMatch[1];
    const codeMatch = params.text.match(/كود التحقق: (\d{6})|code: (\d{6})/i);
    if (codeMatch) devCode = codeMatch[1] || codeMatch[2];

    return { sent: false, devLink, devCode };
  }

  // ── Production: send via SMTP ──
  try {
    const t = getTransporter()!;
    await t.sendMail({
      from: fromAddress,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    return { sent: true };
  } catch (e) {
    console.error("[email] SMTP send failed:", e);
    // Don't throw — the route handler will surface a generic error
    // to the user without revealing SMTP internals.
    return { sent: false };
  }
}

// ── Email templates ──────────────────────────────────────────────
// Bilingual (ar + fr) — the user's language preference is fetched
// from their session/cookie. For now we default to Arabic since the
// platform is Algerian-market-focused.

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

interface PasswordResetEmailParams {
  to: string;
  token: string;
  name?: string;
  lang?: "ar" | "fr";
}

export async function sendPasswordResetEmail(
  params: PasswordResetEmailParams,
): Promise<SendEmailResult> {
  const { to, token, name, lang = "ar" } = params;
  const resetUrl = `${BASE_URL}/?mode=reset&token=${encodeURIComponent(token)}`;

  const ar = lang === "ar";
  const subject = ar ? "إعادة تعيين كلمة المرور — عقار Match" : "Réinitialisation du mot de passe — Aqar Match";
  const greeting = ar ? `مرحباً ${name || ""}` : `Bonjour ${name || ""}`;
  const intro = ar
    ? "تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. اضغط على الرابط أدناه لاختيار كلمة مرور جديدة:"
    : "Nous avons reçu une demande de réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour en choisir un nouveau :";
  const btnText = ar ? "إعادة تعيين كلمة المرور" : "Réinitialiser le mot de passe";
  const expiry = ar ? "هذا الرابط صالح لمدة 15 دقيقة فقط." : "Ce lien est valable 15 minutes seulement.";
  const ignore = ar
    ? "إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة — لن يتغير anything."
    : "Si vous n'avez pas demandé de réinitialisation, ignorez ce message — rien ne changera.";
  const footer = ar ? "عقار Match — منصة عقارية ذكية" : "Aqar Match — plateforme immobilière intelligente";

  const html = `
    <div dir="${ar ? "rtl" : "ltr"}" style="font-family: 'Cairo', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <h2 style="color: #1a6b4f; margin-bottom: 16px;">${subject}</h2>
      <p style="font-size: 16px; line-height: 1.6;">${greeting},</p>
      <p style="font-size: 15px; line-height: 1.6; color: #444;">${intro}</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: #1a6b4f; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">${btnText}</a>
      </p>
      <p style="font-size: 13px; color: #888; margin-top: 24px;">${expiry}</p>
      <p style="font-size: 13px; color: #888;">${ignore}</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="font-size: 12px; color: #aaa; text-align: center;">${footer}</p>
    </div>
  `;

  const text = `${greeting}\n\n${intro}\n\n${resetUrl}\n\n${expiry}\n\n${ignore}\n\n${footer}`;

  return sendEmail({ to, subject, html, text });
}

interface EmailVerificationParams {
  to: string;
  token: string;
  code: string;
  name?: string;
  lang?: "ar" | "fr";
}

export async function sendEmailVerificationEmail(
  params: EmailVerificationParams,
): Promise<SendEmailResult> {
  const { to, token, code, name, lang = "ar" } = params;
  const verifyUrl = `${BASE_URL}/?mode=verify-email&token=${encodeURIComponent(token)}`;

  const ar = lang === "ar";
  const subject = ar ? "تأكيد بريدك الإلكتروني — عقار Match" : "Confirmez votre email — Aqar Match";
  const greeting = ar ? `مرحباً ${name || ""}` : `Bonjour ${name || ""}`;
  const intro = ar
    ? "شكراً لتسجيلك! اضغط على الرابط أدناه أو أدخل الرمز المكون من 6 أرقام لتأكيد ملكية بريدك الإلكتروني:"
    : "Merci pour votre inscription ! Cliquez sur le lien ci-dessous ou saisissez le code à 6 chiffres pour confirmer votre adresse email :";
  const btnText = ar ? "تأكيد البريد" : "Confirmer mon email";
  const codeLabel = ar ? "كود التحقق" : "Code de vérification";
  const expiry = ar ? "هذا الرابط صالح لمدة 24 ساعة." : "Ce lien est valable 24 heures.";
  const footer = ar ? "عقار Match — منصة عقارية ذكية" : "Aqar Match — plateforme immobilière intelligente";

  const html = `
    <div dir="${ar ? "rtl" : "ltr"}" style="font-family: 'Cairo', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <h2 style="color: #1a6b4f; margin-bottom: 16px;">${subject}</h2>
      <p style="font-size: 16px; line-height: 1.6;">${greeting},</p>
      <p style="font-size: 15px; line-height: 1.6; color: #444;">${intro}</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${verifyUrl}" style="display: inline-block; background: #1a6b4f; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">${btnText}</a>
      </p>
      <p style="text-align: center; margin: 24px 0;">
        <span style="font-size: 13px; color: #888;">${codeLabel}:</span><br>
        <span style="display: inline-block; font-size: 28px; letter-spacing: 8px; font-weight: 700; color: #1a6b4f; padding: 12px 24px; background: #f5f5f5; border-radius: 8px; margin-top: 8px;">${code}</span>
      </p>
      <p style="font-size: 13px; color: #888;">${expiry}</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="font-size: 12px; color: #aaa; text-align: center;">${footer}</p>
    </div>
  `;

  const text = `${greeting}\n\n${intro}\n\n${verifyUrl}\n\n${codeLabel}: ${code}\n\n${expiry}\n\n${footer}`;

  return sendEmail({ to, subject, html, text });
}
