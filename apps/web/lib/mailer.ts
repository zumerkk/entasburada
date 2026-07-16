import "server-only";
import nodemailer from "nodemailer";

// E-posta gonderimi, oncelik sirasiyla:
// 1) SMTP (SMTP_HOST/SMTP_USER/SMTP_PASS tanimliysa — or. Gmail uygulama sifresi)
// 2) Resend API (RESEND_API_KEY tanimliysa; alan adi dogrulanana kadar yalniz
//    hesap sahibine teslim eder, o yuzden yedek konumunda)
// Hicbiri yoksa sessizce atlanir (false doner) — akisi kirmaz.

export interface MailInput {
  to: string;
  subject: string;
  html: string;
}

export function isMailerConfigured(): boolean {
  return isSmtpConfigured() || Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendMail(input: MailInput): Promise<boolean> {
  if (isSmtpConfigured()) {
    const sent = await sendViaSmtp(input);
    if (sent) {
      return true;
    }
  }

  return sendViaResend(input);
}

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

function defaultFrom(): string {
  return process.env.MAIL_FROM?.trim() || (process.env.SMTP_USER?.trim() ? `ENTAŞBURADA <${process.env.SMTP_USER.trim()}>` : "ENTAŞBURADA <onboarding@resend.dev>");
}

async function sendViaSmtp(input: MailInput): Promise<boolean> {
  try {
    const port = Number(process.env.SMTP_PORT ?? 465);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER!.trim(),
        pass: process.env.SMTP_PASS!.replace(/\s+/g, "")
      }
    });

    await transporter.sendMail({
      from: defaultFrom(),
      to: input.to,
      subject: input.subject,
      html: input.html
    });
    return true;
  } catch (error) {
    console.warn(`[mailer] SMTP gonderim hatasi: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

async function sendViaResend(input: MailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ from: defaultFrom(), to: [input.to], subject: input.subject, html: input.html }),
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      console.warn(`[mailer] Resend gonderim basarisiz (${response.status}): ${(await response.text()).slice(0, 200)}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`[mailer] Resend gonderim hatasi: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}
