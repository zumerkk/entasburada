import "server-only";

// Resend API ile bagimliliksiz e-posta gonderimi.
// RESEND_API_KEY tanimli degilse sessizce atlanir (false doner) — akisi kirmaz.
// Alan adi Resend'de dogrulanana kadar MAIL_FROM olarak onboarding@resend.dev kullanilabilir.

export interface MailInput {
  to: string;
  subject: string;
  html: string;
}

export function isMailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendMail(input: MailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return false;
  }

  const from = process.env.MAIL_FROM?.trim() || "ENTAŞBURADA <onboarding@resend.dev>";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      console.warn(`[mailer] gonderim basarisiz (${response.status}): ${(await response.text()).slice(0, 200)}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`[mailer] gonderim hatasi: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}
