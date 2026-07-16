import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { createCustomerAccount, findCustomerByEmail, type CustomerAccount } from "./customer-auth";
import type { DealerApplication } from "./dealer-application-repository";
import { sendMail } from "./mailer";

export interface ProvisionResult {
  status: "created" | "already-exists";
  accountId: string;
  email: string;
  tempPassword?: string;
  mailSent: boolean;
}

// Okunabilir, karistirilmayan karakterlerle guclu gecici sifre (or. Entas-K7KM-Q4TX)
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateTempPassword(): string {
  const block = (length: number): string => {
    const bytes = randomBytes(length);
    let out = "";
    for (let index = 0; index < length; index += 1) {
      out += PASSWORD_ALPHABET[bytes[index]! % PASSWORD_ALPHABET.length];
    }
    return out;
  };

  return `Entas-${block(4)}-${block(4)}`;
}

export async function provisionDealerAccount(application: DealerApplication): Promise<ProvisionResult> {
  const existing = await findCustomerByEmail(application.email);
  if (existing) {
    return { status: "already-exists", accountId: existing.id, email: existing.email, mailSent: false };
  }

  const tempPassword = generateTempPassword();
  const account: Omit<CustomerAccount, "password"> & { plainPassword: string } = {
    id: `cust-${randomUUID()}`,
    email: application.email.trim().toLocaleLowerCase("tr-TR"),
    plainPassword: tempPassword,
    companyName: application.companyTitle,
    authorizedPerson: application.authorizedPerson,
    phone: application.phone,
    city: application.city,
    deliveryAddress: application.deliveryAddress,
    status: "approved",
    segment: "standard",
    baseDiscountRate: 0,
    brandDiscounts: {},
    categoryDiscounts: {},
    specialNetPrices: {}
  };

  const record = await createCustomerAccount(account);
  const mailSent = await sendMail({
    to: record.email,
    subject: "ENTAŞBURADA bayi hesabınız açıldı",
    html: buildWelcomeEmail(application, tempPassword)
  });

  return { status: "created", accountId: record.id, email: record.email, tempPassword, mailSent };
}

export function buildCredentialsWhatsappHref(application: DealerApplication, email: string, tempPassword: string): string {
  const phone = (application.whatsapp || application.phone || "").replace(/\D+/g, "");
  const international = phone.startsWith("0") ? `9${phone}` : phone.startsWith("5") ? `90${phone}` : phone;
  const message = [
    `${application.authorizedPerson} merhaba,`,
    `ENTAŞBURADA bayi hesabınız açıldı. 🎉`,
    ``,
    `Giriş: https://entasburada.com/login`,
    `Kullanıcı: ${email}`,
    `Geçici şifre: ${tempPassword}`,
    ``,
    `Girişten sonra Hesabım sayfasından şifrenizi değiştirmenizi öneririz.`
  ].join("\n");
  const text = `?text=${encodeURIComponent(message)}`;
  return international.length >= 12 ? `https://wa.me/${international}${text}` : `https://wa.me/${text}`;
}

function buildWelcomeEmail(application: DealerApplication, tempPassword: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#14342b">
    <h2 style="color:#0d3f35">ENTAŞBURADA bayi hesabınız açıldı</h2>
    <p>Sayın ${escapeHtml(application.authorizedPerson)},</p>
    <p><strong>${escapeHtml(application.companyTitle)}</strong> adına yaptığınız bayi başvurusu onaylandı. Giriş bilgileriniz:</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px 12px;background:#f3f7f5">Adres</td><td style="padding:6px 12px"><a href="https://entasburada.com/login">entasburada.com/login</a></td></tr>
      <tr><td style="padding:6px 12px;background:#f3f7f5">Kullanıcı</td><td style="padding:6px 12px">${escapeHtml(application.email)}</td></tr>
      <tr><td style="padding:6px 12px;background:#f3f7f5">Geçici şifre</td><td style="padding:6px 12px"><code>${escapeHtml(tempPassword)}</code></td></tr>
    </table>
    <p>Güvenliğiniz için ilk girişten sonra <strong>Hesabım</strong> sayfasından şifrenizi değiştirmenizi öneririz.</p>
    <p>Bayi fiyatlarınız, iskonto grubunuz ve satış temsilciniz hesabınıza tanımlanmıştır. Sorularınız için: +90 532 385 51 18</p>
    <p style="color:#6b7c76;font-size:13px">ENTAŞBURADA — Türkiye'nin Yapı Marketi</p>
  </div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
