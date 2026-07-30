import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

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
  merchantPassword: string; // MERCHANTPASSWORD — "Merchant Api User" rolünde; "Session Token" rolünde boş
  secretKey: string; // Gizli Anahtar — hem RANDOM+HASH istek kimliği hem dönüş imzası (sdSha512) için
  mode: ZiraatPayMode;
  apiBaseUrl: string; // ACTION=SESSIONTOKEN POST edilecek taban URL
  paymentPageBaseUrl: string; // HPP tabanı; sessionToken sonuna eklenir
}

// Prod API host'u vpos.ziraatpay.com.tr'dir (canlı test ile doğrulandı: responseCode 00).
// entegrasyon.ziraatpay.com.tr aynı kimlikleri ERR10020 ile reddediyor — oraya GÖNDERME.
const API_BASE: Record<ZiraatPayMode, string> = {
  test: "https://test.ziraatpay.com.tr/ziraatpay/api/v2",
  prod: "https://vpos.ziraatpay.com.tr/ziraatpay/api/v2"
};

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
    // Opsiyonel: "Session Token" rolünde şifre yoktur; o zaman RANDOM+HASH kullanılır.
    merchantPassword: process.env.ZIRAATPAY_MERCHANT_PASSWORD?.trim() || "",
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

/**
 * Her ödeme denemesi için BENZERSİZ MERCHANTPAYMENTID üretir.
 *
 * NEDEN: ZiraatPay bir sipariş numarasına ait oturumu ilk tutara kilitler; aynı ID ile
 * farklı tutar (ör. müşteri taksit sayısını değiştirdi) gönderilirse ERR10118 döner.
 * Bu yüzden ID = "{takipKodu}-{denemeJetonu}". Takip kodu tire içermez, callback
 * tarafında ilk tireye kadarki kısım alınarak sipariş bulunur.
 */
export function buildMerchantPaymentId(trackingCode: string): string {
  const token = `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;
  return `${trackingCode}-${token}`;
}

/** MERCHANTPAYMENTID'den sipariş takip kodunu çıkarır (eski, tiresiz ID'lerle de uyumlu). */
export function trackingCodeFromMerchantPaymentId(merchantPaymentId: string): string {
  const value = (merchantPaymentId ?? "").trim();
  const dashIndex = value.indexOf("-");
  return dashIndex === -1 ? value : value.slice(0, dashIndex);
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
  /** Taksit sayısı (1 = tek çekim). 1'den büyükse INSTALLMENTS olarak gönderilir. */
  installments?: number;
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
 * Kimlik doğrulama iki yöntem:
 *  - Şifre varsa (ZIRAATPAY_MERCHANT_PASSWORD): MERCHANTPASSWORD gönderilir ("Merchant Api User").
 *  - Şifre yoksa: RANDOM + HASH gönderilir ("Merchant API User For Session Token", Gizli Anahtar ile).
 */
export async function createPaymentSession(input: CreateSessionInput): Promise<CreateSessionResult> {
  const config = getZiraatPayConfig();

  const body = new URLSearchParams();
  body.set("ACTION", "SESSIONTOKEN");
  body.set("SESSIONTYPE", "PAYMENTSESSION"); // HPP oturumu
  body.set("MERCHANT", config.merchant);
  body.set("MERCHANTUSER", config.merchantUser);
  if (config.merchantPassword) {
    body.set("MERCHANTPASSWORD", config.merchantPassword);
  } else {
    const random = generateRandom();
    body.set("RANDOM", random);
    body.set(
      "HASH",
      buildRequestHash({ action: "SESSIONTOKEN", customer: input.customerId, merchantPaymentId: input.merchantPaymentId, random }, config)
    );
  }
  body.set("MERCHANTPAYMENTID", input.merchantPaymentId);
  body.set("AMOUNT", input.amount);
  body.set("CURRENCY", input.currency ?? "TRY");
  body.set("RETURNURL", input.returnUrl);
  body.set("CUSTOMER", input.customerId);
  if (input.customerName) body.set("CUSTOMERNAME", input.customerName);
  if (input.customerEmail) body.set("CUSTOMEREMAIL", input.customerEmail);
  if (input.customerPhone) body.set("CUSTOMERPHONE", input.customerPhone);
  if (input.customerIp) body.set("CUSTOMERIP", input.customerIp);
  if (input.installments && input.installments > 1) {
    body.set("INSTALLMENTS", String(Math.trunc(input.installments)));
  }
  if (input.orderItems && input.orderItems.length > 0) {
    // ZiraatPay ORDERITEMS toplamının AMOUNT'a birebir eşit olmasını şart koşar (ERR10022).
    // Satırlar ayrı ayrı yuvarlandığında kuruş farkı oluşabilir; farkı son satıra yazarak
    // eşitliği burada GARANTİ ediyoruz — çağıranların bunu ayrıca düzeltmesi gerekmez.
    const items = input.orderItems.map((item) => ({
      productCode: item.productCode,
      name: item.name,
      description: item.name,
      quantity: item.quantity,
      amount: round2(item.amount)
    }));
    const target = round2(parseFloat(input.amount));
    const sum = round2(items.reduce((total, item) => total + item.amount, 0));
    const diff = round2(target - sum);
    const last = items[items.length - 1]!;
    if (diff !== 0 && round2(last.amount + diff) > 0) {
      last.amount = round2(last.amount + diff);
    }
    body.set("ORDERITEMS", JSON.stringify(items));
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
    errorCode?: string;
    errorMsg?: string;
    sessionToken?: string;
  };

  if (data.responseCode !== "00" || !data.sessionToken) {
    const reason = data.errorMsg || data.responseMsg || `responseCode=${data.responseCode}`;
    const code = data.errorCode ? ` [${data.errorCode}]` : "";
    throw new Error(`ZiraatPay oturum açılamadı: ${reason}${code}`);
  }

  return {
    sessionToken: data.sessionToken,
    redirectUrl: `${config.paymentPageBaseUrl}/${data.sessionToken}`
  };
}

/** 8-64 karakter arası, sadece rakam+harf, tekil rastgele değer (panel şartı). */
function generateRandom(): string {
  return randomBytes(16).toString("hex"); // 32 hex karakter → alfanümerik, aralıkta
}

/**
 * İstek imzası ("API Hash doğrulama"), şifresiz "Session Token" rolü için:
 *   HASH = HEX( SHA-256( ACTION + MERCHANT + CUSTOMER + MERCHANTPAYMENTID + secretKey + RANDOM ) )
 * Ayraç yok; secretKey parametre olarak GÖNDERİLMEZ, sadece hash'te kullanılır.
 */
export function buildRequestHash(
  parts: { action: string; customer: string; merchantPaymentId: string; random: string },
  config: Pick<ZiraatPayConfig, "merchant" | "secretKey">
): string {
  const payload =
    parts.action + config.merchant + parts.customer + parts.merchantPaymentId + config.secretKey + parts.random;
  return createHash("sha256").update(payload, "utf8").digest("hex");
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

function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
