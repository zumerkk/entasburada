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

export interface DirectDealerAccountInput {
  email: string;
  companyName: string;
  authorizedPerson: string;
  phone: string;
  city: string;
  deliveryAddress: string;
  segment?: CustomerAccount["segment"] | undefined;
  baseDiscountRate?: number | undefined;
  temporaryPassword?: string | undefined;
  sendWelcomeEmail?: boolean | undefined;
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

export async function provisionDirectDealerAccount(input: DirectDealerAccountInput): Promise<ProvisionResult> {
  const email = input.email.trim().toLocaleLowerCase("tr-TR");
  const existing = await findCustomerByEmail(email);
  if (existing) {
    return { status: "already-exists", accountId: existing.id, email: existing.email, mailSent: false };
  }

  const segment = input.segment ?? "standard";
  const profile = dealerProfile(segment);
  const tempPassword = input.temporaryPassword?.trim() || generateTempPassword();
  const record = await createCustomerAccount({
    id: `cust-${randomUUID()}`,
    email,
    plainPassword: tempPassword,
    companyName: input.companyName.trim(),
    authorizedPerson: input.authorizedPerson.trim(),
    phone: input.phone.trim(),
    city: input.city.trim(),
    deliveryAddress: input.deliveryAddress.trim(),
    status: "approved",
    segment,
    ...profile,
    baseDiscountRate: input.baseDiscountRate ?? profile.baseDiscountRate,
    brandDiscounts: {},
    categoryDiscounts: {},
    specialNetPrices: {}
  });
  const mailSent = input.sendWelcomeEmail === false
    ? false
    : await sendMail({
        to: record.email,
        subject: "ENTAŞBURADA bayi hesabınız açıldı",
        html: buildDirectWelcomeEmail(record, tempPassword)
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

function buildDirectWelcomeEmail(account: CustomerAccount, tempPassword: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#14342b">
    <h2 style="color:#0d3f35">ENTAŞBURADA bayi hesabınız açıldı</h2>
    <p>Sayın ${escapeHtml(account.authorizedPerson)},</p>
    <p><strong>${escapeHtml(account.companyName)}</strong> bayi hesabınız kullanıma hazırdır.</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px 12px;background:#f3f7f5">Adres</td><td style="padding:6px 12px"><a href="https://entasburada.com/login">entasburada.com/login</a></td></tr>
      <tr><td style="padding:6px 12px;background:#f3f7f5">Kullanıcı</td><td style="padding:6px 12px">${escapeHtml(account.email)}</td></tr>
      <tr><td style="padding:6px 12px;background:#f3f7f5">Geçici şifre</td><td style="padding:6px 12px"><code>${escapeHtml(tempPassword)}</code></td></tr>
    </table>
    <p>Güvenliğiniz için ilk girişten sonra <strong>Hesabım</strong> sayfasından şifrenizi değiştirmenizi öneririz.</p>
    <p>Sorularınız için: +90 532 385 51 18</p>
    <p style="color:#6b7c76;font-size:13px">ENTAŞBURADA — Türkiye'nin Yapı Marketi</p>
  </div>`;
}

function dealerProfile(segment: CustomerAccount["segment"]): Pick<
  CustomerAccount,
  | "tierName"
  | "tierRank"
  | "accountManager"
  | "supportLevel"
  | "paymentTermDays"
  | "creditLimit"
  | "approvalLimit"
  | "freeShippingThreshold"
  | "priorityLevel"
  | "perks"
  | "baseDiscountRate"
> {
  if (segment === "industrial") {
    return {
      tierName: "Sanayi Pro",
      tierRank: "Gümüş",
      accountManager: "Endüstriyel Satış Ekibi",
      supportLevel: "Öncelikli teknik destek",
      paymentTermDays: 21,
      creditLimit: "250000",
      approvalLimit: "100000",
      freeShippingThreshold: "7500",
      priorityLevel: 2,
      perks: ["Öncelikli teklif dönüşü", "Kısmi sevkiyat planlama", "Stok ayırma önceliği"],
      baseDiscountRate: 18
    };
  }
  if (segment === "project") {
    return {
      tierName: "Kurumsal Proje",
      tierRank: "Platin",
      accountManager: "Proje Satış Lideri",
      supportLevel: "Acil proje hattı",
      paymentTermDays: 45,
      creditLimit: "750000",
      approvalLimit: "300000",
      freeShippingThreshold: "0",
      priorityLevel: 3,
      perks: ["Proje bazlı vade", "Ayrılmış stok planı", "Hızlandırılmış sevkiyat"],
      baseDiscountRate: 22
    };
  }
  return {
    tierName: "Standart Bayi",
    tierRank: "Bronz",
    accountManager: "Satış Operasyon",
    supportLevel: "Mesai içi destek",
    paymentTermDays: 7,
    creditLimit: "75000",
    approvalLimit: "25000",
    freeShippingThreshold: "15000",
    priorityLevel: 1,
    perks: ["Bayi fiyatları", "CSV hızlı sipariş", "Teklif takibi", "Standart sevkiyat planı"],
    baseDiscountRate: 12
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
