export type NotificationChannel = "email" | "sms" | "whatsapp" | "panel" | "push";

export type NotificationTrigger =
  | "dealer_application_received"
  | "dealer_approved"
  | "password_reset"
  | "order_received"
  | "order_shipped"
  | "quote_received"
  | "stock_arrived"
  | "abandoned_cart"
  | "payment_due"
  | "import_completed"
  | "import_failed";

export interface NotificationEnvelope {
  trigger: NotificationTrigger;
  channels: NotificationChannel[];
  recipientId: string;
  templateKey: string;
  variables: Record<string, string | number | boolean>;
}
