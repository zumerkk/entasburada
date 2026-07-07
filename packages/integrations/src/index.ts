export interface PaymentProviderAdapter {
  provider: "iyzico" | "paytr" | "param" | "stripe";
  createPaymentIntent(input: {
    orderId: string;
    amount: string;
    currency: "TRY" | "EUR" | "USD";
    customerEmail: string;
  }): Promise<{ externalId: string; redirectUrl?: string }>;
}

export interface EInvoiceAdapter {
  provider: string;
  createInvoice(input: { orderId: string; companyId: string; invoiceNumber?: string }): Promise<{ invoiceId: string; pdfUrl?: string }>;
}
