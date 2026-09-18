import { isAdminAuthenticated } from "../../../../lib/admin-auth";
import { buildOrderAlertText, orderAlertRecipients, type OrderAlertInput } from "../../../../lib/order-alerts";
import { isWhatsAppConfigured, resolveWhatsAppProvider, sendWhatsAppTemplate } from "../../../../lib/whatsapp";

export const dynamic = "force-dynamic";

// Kurulum dogrulamasi: WhatsApp yapilandirmasini gosterir (GET) ve
// gercek siparis mesajinin aynisini ornek veriyle gonderir (POST).

export async function GET(): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({
    provider: resolveWhatsAppProvider(),
    configured: isWhatsAppConfigured(),
    template: process.env.WHATSAPP_TEMPLATE_NEW_ORDER?.trim() || "yeni_siparis",
    language: process.env.WHATSAPP_TEMPLATE_LANG?.trim() || "tr",
    recipients: orderAlertRecipients()
  });
}

export async function POST(): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = resolveWhatsAppProvider();
  if (provider === "off") {
    return Response.json(
      { error: "WhatsApp saglayicisi tanimli degil. WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID veya WHATSAPP_BRIDGE_URL girin." },
      { status: 400 }
    );
  }

  const recipients = orderAlertRecipients();
  if (recipients.length === 0) {
    return Response.json({ error: "ORDER_ALERT_WHATSAPP icinde gecerli numara yok." }, { status: 400 });
  }

  const sample = sampleOrder();
  const template = process.env.WHATSAPP_TEMPLATE_NEW_ORDER?.trim() || "yeni_siparis";
  const fallbackText = buildOrderAlertText(sample);
  const results = await Promise.all(
    recipients.map((to) =>
      sendWhatsAppTemplate({
        to,
        template,
        params: ["TEST-SIPARIS", "ENTAŞBURADA test", "1.234,56 TRY", "3 adet / 1 kalem", "Kurulum testi"],
        urlButtonParam: sample.id,
        fallbackText
      })
    )
  );

  return Response.json({ provider, template, results }, { status: results.some((row) => row.ok) ? 200 : 502 });
}

function sampleOrder(): OrderAlertInput {
  return {
    id: "test-order",
    orderNo: "TEST-SIPARIS",
    companyName: "ENTAŞBURADA test",
    dealerUser: "Kurulum testi",
    phone: "",
    totalAmount: "1234.56",
    currency: "TRY",
    source: "WhatsApp kurulum testi",
    deliveryAddress: "-",
    items: [{ quantity: 3 }]
  };
}
