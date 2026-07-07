import { z } from "zod";

export const dealerApplicationSchema = z.object({
  companyTitle: z.string().min(2, "Firma ünvanı zorunludur."),
  taxOffice: z.string().min(2, "Vergi dairesi zorunludur."),
  taxNumber: z.string().regex(/^\d{10,11}$/, "Vergi numarası 10 veya 11 haneli olmalıdır."),
  tradeRegistryNumber: z.string().optional(),
  mersisNumber: z.string().optional(),
  authorizedPerson: z.string().min(2, "Yetkili kişi adı zorunludur."),
  phone: z.string().min(10, "Telefon numarası zorunludur."),
  whatsapp: z.string().optional(),
  email: z.string().email("Geçerli bir e-posta girin."),
  invoiceAddress: z.string().min(10, "Fatura adresi zorunludur."),
  deliveryAddress: z.string().min(10, "Teslimat adresi zorunludur."),
  city: z.string().min(2, "İl seçimi zorunludur."),
  district: z.string().min(2, "İlçe seçimi zorunludur."),
  activityArea: z.string().min(2, "Faaliyet alanı zorunludur."),
  companyType: z.enum(["dealer", "industrial", "construction", "workshop", "corporate_purchase"]),
  annualPurchaseVolume: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  referenceCompany: z.string().optional(),
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
  notes: z.string().max(2000).optional(),
  items: z.array(
    z.object({
      sku: z.string().min(1),
      quantity: z.number().int().positive(),
      unit: z.enum(["adet", "koli", "paket", "metre", "kg", "litre", "takim"]),
      targetPrice: z.string().optional(),
      targetDeliveryDate: z.string().optional()
    })
  )
});

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
