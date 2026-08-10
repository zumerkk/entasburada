import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createCustomerAccount: vi.fn(),
  findCustomerByEmail: vi.fn(),
  sendMail: vi.fn()
}));

vi.mock("./customer-auth", () => ({
  createCustomerAccount: mocks.createCustomerAccount,
  findCustomerByEmail: mocks.findCustomerByEmail,
  updateCustomerAccount: vi.fn()
}));

vi.mock("./mailer", () => ({ sendMail: mocks.sendMail }));

import type { DealerApplication } from "./dealer-application-repository";
import { buildCredentialsWhatsappHref, provisionDealerAccount } from "./dealer-provisioning";

const application: DealerApplication = {
  id: "dealer-test",
  reference: "BSV-20260810-0001",
  createdAt: "2026-08-10T08:00:00.000Z",
  updatedAt: "2026-08-10T08:00:00.000Z",
  status: "approved",
  companyTitle: "Test Hırdavat Ltd.",
  taxOffice: "Kırıkkale",
  taxNumber: "1234567890",
  companyType: "Hırdavat bayisi",
  authorizedPerson: "Test Yetkili",
  phone: "0532 111 22 33",
  whatsapp: "0532 111 22 33",
  email: "bayi@example.com",
  invoiceAddress: "Test fatura adresi",
  deliveryAddress: "Test teslimat adresi",
  city: "Kırıkkale",
  district: "Merkez",
  activityArea: "Hırdavat",
  kvkkAccepted: true,
  commercialConsent: true,
  history: []
};

describe("dealer provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCustomerByEmail.mockResolvedValue(null);
    mocks.createCustomerAccount.mockImplementation(async (account) => ({ ...account, password: "stored-hash" }));
    mocks.sendMail.mockResolvedValue(true);
  });

  it("returns the generated temporary password and emails the same credential", async () => {
    const result = await provisionDealerAccount(application);
    const temporaryPassword = result.temporaryPassword;
    if (!temporaryPassword) throw new Error("Geçici şifre üretilmedi.");

    expect(result.status).toBe("created");
    expect(temporaryPassword).toMatch(/^Entas-[A-Z2-9]{4}-[A-Z2-9]{3}\d!$/);
    expect(result.mailSent).toBe(true);
    expect(result.passwordChangeRequired).toBe(true);
    expect(mocks.createCustomerAccount).toHaveBeenCalledWith(
      expect.objectContaining({ plainPassword: temporaryPassword, mustChangePassword: true })
    );
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: application.email,
        html: expect.stringContaining(temporaryPassword)
      })
    );
  });

  it("builds a WhatsApp message containing login, email and temporary password", () => {
    const href = buildCredentialsWhatsappHref(application, application.email, "Entas-K7KM-Q4T7!");
    const url = new URL(href);

    expect(url.hostname).toBe("wa.me");
    expect(url.pathname).toBe("/905321112233");
    expect(url.searchParams.get("text")).toContain("https://entasburada.com/login");
    expect(url.searchParams.get("text")).toContain(application.email);
    expect(url.searchParams.get("text")).toContain("Entas-K7KM-Q4T7!");
  });
});
