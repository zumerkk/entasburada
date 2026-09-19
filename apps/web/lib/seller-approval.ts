import "server-only";
import { verifyPassword } from "./password-hash";
import { findCustomerByEmail, getCustomers } from "./customer-auth";
import { getDealerApplication, getApplicationTemporaryPassword, recordApplicationProvisioning, updateDealerApplicationStatus, type DealerApplication } from "./dealer-application-repository";
import { provisionDealerAccount } from "./dealer-provisioning";
import { requireReferralSeller } from "./seller-dashboard";

let approvals: Promise<unknown> = Promise.resolve();
export async function approveOwnDealer(applicationId: string) {
  const seller = await requireReferralSeller();
  const operation = approvals.then(async () => {
    const application = await getDealerApplication(applicationId);
    if (!application || application.referral?.sellerId !== seller.id)
      throw new Error("Bu başvuruyu onaylama yetkiniz yok.");
    if (application.status === "approved") return;
    if (!["pending", "reviewing"].includes(application.status))
      throw new Error("Bu başvuru onaya uygun değil. Yöneticiyle iletişime geçin.");

    if (application.accountId) {
      const account = (await getCustomers()).find(c => c.id === application.accountId);
      if (!account || account.referral?.sellerId !== seller.id || account.status !== "approved")
        throw new Error("Hesap eşleşmesi doğrulanamadı. Yöneticiyle iletişime geçin.");
      await updateDealerApplicationStatus(application.id, "approved", seller.email, `Yetkili Panel: ${seller.authorizedPerson} tarafından onaylandı.`);
      return;
    }
    if (await findCustomerByEmail(application.email))
      throw new Error("Bu e-posta için hesap mevcut. Yöneticiyle iletişime geçin.");
    const result = await provisionDealerAccount(application, { sendWelcomeEmail: false });
    if (result.status !== "created") throw new Error("Hesap zaten mevcut. Yöneticiyle iletişime geçin.");
    await recordApplicationProvisioning(application.id, {
      accountId: result.accountId, accountEmail: result.email,
      ...(result.temporaryPassword ? { temporaryPassword: result.temporaryPassword } : {}),
      welcomeMailSent: false, note: `Yetkili Panel: ${seller.authorizedPerson} (${seller.id}) bayi hesabını oluşturdu.`,
    });
    await updateDealerApplicationStatus(application.id, "approved", seller.email, `Yetkili Panel: ${seller.authorizedPerson} tarafından onaylandı.`);
  });
  approvals = operation.catch(() => undefined);
  await operation;
}

export async function ownDealerCredentials(application: DealerApplication, sellerId: string) {
  if (application.referral?.sellerId !== sellerId || !application.accountId || application.status !== "approved") return null;
  const account = (await getCustomers()).find(c => c.id === application.accountId);
  if (!account || account.referral?.sellerId !== sellerId || account.status !== "approved" || !account.mustChangePassword) return null;
  const password = getApplicationTemporaryPassword(application);
  return password && verifyPassword(password, account.password) ? { email: account.email, password } : null;
}
