"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inviteCompanyMember, requireCustomer, type CompanyUserRole } from "../../../lib/customer-auth";
import { sendMail } from "../../../lib/mailer";

const ROLES: CompanyUserRole[] = ["COMPANY_OWNER", "PURCHASE_MANAGER", "PURCHASE_STAFF", "FINANCE_OFFICER", "APPROVER", "WAREHOUSE_RECEIVER", "VIEWER"];

export async function inviteCompanyMemberAction(formData: FormData): Promise<void> {
  const inviter = await requireCustomer();
  let successMessage = "Kullanıcı eklendi.";
  try {
    const roleValue = value(formData, "companyRole") as CompanyUserRole;
    const result = await inviteCompanyMember(inviter, {
      email: value(formData, "email"),
      authorizedPerson: value(formData, "authorizedPerson"),
      phone: value(formData, "phone"),
      companyRole: ROLES.includes(roleValue) ? roleValue : "VIEWER",
      approvalLimit: value(formData, "approvalLimit"),
      orderApprovalRequired: value(formData, "orderApprovalRequired") === "on"
    });
    const mailSent = await sendMail({
      to: result.account.email,
      subject: `${inviter.companyName} ENTAŞBURADA hesabınıza davet`,
      html: `<div style="font-family:Arial,sans-serif"><h2>ENTAŞBURADA firma hesabınıza davet</h2><p>${escapeHtml(inviter.authorizedPerson)}, sizi <strong>${escapeHtml(inviter.companyName)}</strong> hesabına ekledi.</p><p>Giriş: <a href="http://localhost:3000/login">ENTAŞBURADA giriş</a></p><p>Kullanıcı: <strong>${escapeHtml(result.account.email)}</strong></p><p>Geçici şifre: <code>${escapeHtml(result.temporaryPassword)}</code></p><p>İlk girişte şifrenizi değiştirmeniz gerekir.</p></div>`
    });
    successMessage = mailSent ? "Kullanıcı eklendi ve davet e-postası gönderildi." : "Kullanıcı eklendi. E-posta servisi lokal ortamda kapalı olduğu için giriş bilgisi gönderilemedi.";
  } catch (error) {
    redirect(`/account/team?error=${encodeURIComponent(error instanceof Error ? error.message : "Kullanıcı eklenemedi.")}`);
  }
  revalidatePath("/account/team");
  redirect(`/account/team?ok=${encodeURIComponent(successMessage)}`);
}

function value(formData: FormData, key: string) { const raw = formData.get(key); return typeof raw === "string" ? raw.trim() : ""; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char); }
