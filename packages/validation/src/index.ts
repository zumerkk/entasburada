import { z } from "zod";

export const dealerApplicationSchema = z.object({
  companyTitle: z.string().trim().min(2, "Firma ünvanı zorunludur.").max(180),
  taxOffice: z.string().trim().min(2, "Vergi dairesi zorunludur.").max(100),
  taxNumber: z.string().regex(/^\d{10,11}$/, "Vergi numarası 10 veya 11 haneli olmalıdır."),
  tradeRegistryNumber: z.string().trim().max(80).optional(),
  mersisNumber: z.string().trim().max(32).optional(),
  authorizedPerson: z.string().trim().min(2, "Yetkili kişi adı zorunludur.").max(120),
  phone: z.string().trim().min(10, "Telefon numarası zorunludur.").max(32),
  whatsapp: z.string().trim().max(32).optional(),
  email: z.string().trim().email("Geçerli bir e-posta girin.").max(254),
  invoiceAddress: z.string().trim().min(10, "Fatura adresi zorunludur.").max(600),
  deliveryAddress: z.string().trim().min(10, "Teslimat adresi zorunludur.").max(600),
  city: z.string().trim().min(2, "İl seçimi zorunludur.").max(80),
  district: z.string().trim().min(2, "İlçe seçimi zorunludur.").max(80),
  activityArea: z.string().trim().min(2, "Faaliyet alanı zorunludur.").max(160),
  companyType: z.enum(["dealer", "industrial", "construction", "workshop", "corporate_purchase"]),
  annualPurchaseVolume: z.string().trim().max(80).optional(),
  website: z.string().url().optional().or(z.literal("")),
  referenceCompany: z.string().trim().max(180).optional(),
  dealershipType: z.enum(["standard", "regional", "project", "wholesale"]),
  kvkkAccepted: z.literal(true, {
    errorMap: () => ({ message: "KVKK onayı zorunludur." })
  }),
  commercialConsent: z.boolean().default(false)
});

export const quoteRequestSchema = z.object({
  companyTitle: z.string().min(2),
  authorizedPerson: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email(),
  projectName: z.string().optional(),
  deliveryCity: z.string().min(2),
  paymentPreference: z.enum(["bank_transfer", "credit_card", "open_account", "term_payment"]),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(
    z.object({
      sku: z.string().trim().min(1).max(160),
      quantity: z.number().int().positive().max(999_999),
      unit: z.enum(["adet", "koli", "paket", "metre", "kg", "litre", "takim"]),
      targetPrice: z.string().trim().max(40).optional(),
      targetDeliveryDate: z.string().trim().max(40).optional()
    })
  ).min(1).max(200)
}).strict();

export const productFilterSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  brand: z.array(z.string()).optional(),
  stockStatus: z.array(z.enum(["in_stock", "low_stock", "incoming", "out_of_stock"])).optional(),
  minOrderQuantity: z.coerce.number().int().positive().optional(),
  technical: z.record(z.string()).optional()
});

export type DealerApplicationInput = z.infer<typeof dealerApplicationSchema>;
export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;
export type ProductFilterInput = z.infer<typeof productFilterSchema>;
