import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * ZiraatPay (Payten API v2) ödeme sağlayıcısı — izole entegrasyon modülü.
 *
 * Platform: Payten / Paratika / MSU ailesi (VakıfPayS ile aynı API).
 * Akış: Hosted Payment Page (HPP) 3D Secure.
 *   1. createPaymentSession()  -> sunucudan-sunucuya ACTION=SESSIONTOKEN POST, sessionToken al
 *   2. bayiyi  https://vpos.ziraatpay.com.tr/payment/{sessionToken}  adresine YÖNLENDİR
 *   3. bayi kart + 3D ile öder
 *   4. ZiraatPay RETURNURL'e POST eder -> verifyReturn() ile sdSha512 imzasını DOĞRULA
 *
 * GÜVENLİK: MERCHANTPASSWORD ve secretKey SADECE env'den okunur, asla koda/git'e yazılmaz.
 * İmza doğrulanmadan hiçbir işlem "ödendi" sayılmaz.
 *
 * Kaynak: https://vpos.ziraatpay.com.tr/ziraatpay/api/v2/doc
 */

export type ZiraatPayMode = "test" | "prod";

export interface ZiraatPayConfig {
  merchant: string; // MERCHANT — üye iş yeri kodu
  merchantUser: string; // MERCHANTUSER — API kullanıcısı (panel girişinden AYRI)
  merchantPassword: string; // MERCHANTPASSWORD — SESSIONTOKEN isteği için ZORUNLU
  secretKey: string; // Gizli Anahtar — dönüş imzası (sdSha512) doğrulaması için
  mode: ZiraatPayMode;
  apiBaseUrl: string; // ACTION=SESSIONTOKEN POST edilecek taban URL
  paymentPageBaseUrl: string; // HPP tabanı; sessionToken sonuna eklenir
}

const API_BASE: Record<ZiraatPayMode, string> = {
  test: "https://test.ziraatpay.com.tr/ziraatpay/api/v2",
  prod: "https://entegrasyon.ziraatpay.com.tr/ziraatpay/api/v2"
};

// HPP, API host'undan farklı bir host'ta sunulabiliyor. Panelden teyit edilecek (⚠️).
const PAYMENT_PAGE_BASE: Record<ZiraatPayMode, string> = {
  test: "https://test.ziraatpay.com.tr/payment",
  prod: "https://vpos.ziraatpay.com.tr/payment"
};

let cachedConfig: ZiraatPayConfig | null = null;

export function getZiraatPayConfig(): ZiraatPayConfig {
  if (cachedConfig) return cachedConfig;

  const mode: ZiraatPayMode = process.env.ZIRAATPAY_MODE === "prod" ? "prod" : "test";

  cachedConfig = {
    merchant: requireEnv("ZIRAATPAY_MERCHANT"),
    merchantUser: requireEnv("ZIRAATPAY_MERCHANT_USER"),
    merchantPassword: requireEnv("ZIRAATPAY_MERCHANT_PASSWORD"),
    secretKey: requireEnv("ZIRAATPAY_SECRET_KEY"),
    mode,
    apiBaseUrl: process.env.ZIRAATPAY_API_URL?.trim() || API_BASE[mode],
    paymentPageBaseUrl: process.env.ZIRAATPAY_PAYMENT_PAGE_URL?.trim() || PAYMENT_PAGE_BASE[mode]
  };
  return cachedConfig;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`ZiraatPay yapılandırması eksik: ${name} tanımlı değil.`);
  }
  return value.trim();
}

export interface SessionOrderItem {
  productCode: string;
  name: string;
  quantity: number;
  amount: number;
}

export interface CreateSessionInput {
  /** Bizim benzersiz referansımız — siparişin orderNo/trackingCode'u. MERCHANTPAYMENTID olur. */
  merchantPaymentId: string;
  /** Ondalık TL, KDV dahil. Örn "18.75". Kuruş DEĞİL. */
  amount: string;
  currency?: "TRY" | "USD" | "EUR" | "GBP";
  /** Ödeme bitince ZiraatPay'in POST edeceği bizim URL'imiz. */
  returnUrl: string;
  /** Bayi/müşteri kimliği — ZORUNLU (istek HASH'ine ve dönüş imzasına giriyor). */
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerIp?: string;
  /** Sipariş satırları — Paratika PAYMENTSESSION için ORDERITEMS olarak gönderilir. */
  orderItems?: SessionOrderItem[];
}

export interface CreateSessionResult {
  sessionToken: string;
  /** Tarayıcıyı yönlendireceğimiz HPP adresi. */
  redirectUrl: string;
}

/**
 * ACTION=SESSIONTOKEN ile HPP oturumu açar. Başarılıysa sessionToken + yönlendirme
 * adresi döner; başarısızsa responseCode/errorMsg ile Error fırlatır.
 *
 * Kimlik doğrulama: MERCHANT + MERCHANTUSER + MERCHANTPASSWORD (Paratika/MSU standardı).
 */
export async function createPaymentSession(input: CreateSessionInput): Promise<CreateSessionResult> {
  const config = getZiraatPayConfig();

  const body = new URLSearchParams();
  body.set("ACTION", "SESSIONTOKEN");
  body.set("SESSIONTYPE", "PAYMENTSESSION"); // HPP oturumu
  body.set("MERCHANT", config.merchant);
  body.set("MERCHANTUSER", config.merchantUser);
  body.set("MERCHANTPASSWORD", config.merchantPassword);
  body.set("MERCHANTPAYMENTID", input.merchantPaymentId);
  body.set("AMOUNT", input.amount);
  body.set("CURRENCY", input.currency ?? "TRY");
  body.set("RETURNURL", input.returnUrl);
  body.set("CUSTOMER", input.customerId);
  if (input.customerName) body.set("CUSTOMERNAME", input.customerName);
  if (input.customerEmail) body.set("CUSTOMEREMAIL", input.customerEmail);
  if (input.customerPhone) body.set("CUSTOMERPHONE", input.customerPhone);
  if (input.customerIp) body.set("CUSTOMERIP", input.customerIp);
  if (input.orderItems && input.orderItems.length > 0) {
    body.set(
      "ORDERITEMS",
      JSON.stringify(
        input.orderItems.map((item) => ({
          productCode: item.productCode,
          name: item.name,
          description: item.name,
          quantity: item.quantity,
          amount: item.amount
        }))
      )
    );
  }

  const response = await fetch(config.apiBaseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    // Ödeme başlatma yavaşsa bile kullanıcıyı çok bekletmeyelim.
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`ZiraatPay oturum isteği HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    responseCode?: string;
    responseMsg?: string;
    errorMsg?: string;
    sessionToken?: string;
  };

  if (data.responseCode !== "00" || !data.sessionToken) {
    const reason = data.errorMsg || data.responseMsg || `responseCode=${data.responseCode}`;
    throw new Error(`ZiraatPay oturum açılamadı: ${reason}`);
  }

  return {
    sessionToken: data.sessionToken,
    redirectUrl: `${config.paymentPageBaseUrl}/${data.sessionToken}`
  };
}

export interface ReturnParams {
  merchantPaymentId: string;
  customerId: string;
  sessionToken: string;
  responseCode: string;
  random: string;
  sdSha512: string;
}

export interface ReturnResult {
  /** İmza geçerli mi? false ise ASLA ödemeyi kabul etme. */
  verified: boolean;
  /** İmza geçerli VE responseCode "00" ise ödeme onaylanmıştır. */
  approved: boolean;
  merchantPaymentId: string;
}

/**
 * RETURNURL'e gelen POST'un imzasını doğrular.
 * Formül (doküman): SHA512hex(
 *   merchantPaymentId +'|'+ customerId +'|'+ sessionToken +'|'+ responseCode +'|'+ random +'|'+ secretKey
 * )
 * Karşılaştırma timing-safe yapılır (imza sızıntısına karşı).
 */
export function verifyReturn(params: ReturnParams): ReturnResult {
  const { secretKey } = getZiraatPayConfig();

  const payload = [
    params.merchantPaymentId,
    params.customerId,
    params.sessionToken,
    params.responseCode,
    params.random,
    secretKey
  ].join("|");

  const expected = createHash("sha512").update(payload, "utf8").digest("hex");
  const verified = safeEqualHex(expected, params.sdSha512);

  return {
    verified,
    approved: verified && params.responseCode === "00",
    merchantPaymentId: params.merchantPaymentId
  };
}

/** Uzunluk/format farklarında da patlamadan sabit-zamanlı karşılaştırma. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b ?? "", "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
