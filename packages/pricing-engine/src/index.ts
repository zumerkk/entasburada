import Decimal from "decimal.js";

export type DealerVisibility = "guest" | "pending" | "approved" | "suspended";

export type PriceRuleKind =
  | "customer_manual_price"
  | "customer_discount"
  | "quote_approved_price"
  | "customer_group_price"
  | "product_campaign_price"
  | "brand_category_campaign"
  | "quantity_carton_pallet_price"
  | "standard_dealer_price"
  | "list_price";

export type PriceRuleScope = "customer" | "segment" | "brand" | "category" | "product" | "variant" | "cart";

export interface PriceContext {
  dealerStatus: DealerVisibility;
  customerId?: string;
  segmentId?: string;
  productId: string;
  variantId?: string;
  brandId?: string;
  categoryId?: string;
  quantity: number;
  taxRate: string | number;
  displayTaxIncluded: boolean;
  now?: Date;
}

export interface PriceRule {
  id: string;
  kind: PriceRuleKind;
  scope: PriceRuleScope;
  targetId?: string;
  startsAt?: Date;
  endsAt?: Date;
  minQuantity?: number;
  fixedNetPrice?: string | number;
  discountRate?: string | number;
  priorityOverride?: number;
  label: string;
}

export interface PriceInput {
  listNetPrice: string | number;
  rules: PriceRule[];
  context: PriceContext;
}

export interface PriceAuditStep {
  ruleId?: string;
  label: string;
  decision: "hidden" | "eligible" | "skipped" | "applied";
  reason: string;
}

export interface HiddenPriceResult {
  visible: false;
  cta: "Bayi fiyatlarını görmek ve sipariş oluşturmak için giriş yapın.";
  auditTrail: PriceAuditStep[];
}

export interface VisiblePriceResult {
  visible: true;
  appliedRule: PriceRule;
  listNetPrice: string;
  netPrice: string;
  grossPrice: string;
  taxAmount: string;
  discountRate: string;
  displayPrice: string;
  displayTaxIncluded: boolean;
  auditTrail: PriceAuditStep[];
}

export type PriceResult = HiddenPriceResult | VisiblePriceResult;

const PRIORITY: Record<PriceRuleKind, number> = {
  customer_manual_price: 10,
  customer_discount: 20,
  quote_approved_price: 30,
  customer_group_price: 40,
  product_campaign_price: 50,
  brand_category_campaign: 60,
  quantity_carton_pallet_price: 70,
  standard_dealer_price: 80,
  list_price: 90
};

const PRICE_CTA = "Bayi fiyatlarını görmek ve sipariş oluşturmak için giriş yapın." as const;

export function calculateB2BPrice(input: PriceInput): PriceResult {
  const auditTrail: PriceAuditStep[] = [];

  if (input.context.dealerStatus !== "approved") {
    auditTrail.push({
      label: "Bayi fiyat kilidi",
      decision: "hidden",
      reason: "Fiyat yalnızca onaylı bayi oturumunda gösterilir."
    });

    return {
      visible: false,
      cta: PRICE_CTA,
      auditTrail
    };
  }

  const listNetPrice = new Decimal(input.listNetPrice);
  const eligibleRules = input.rules
    .filter((rule) => isRuleEligible(rule, input.context, auditTrail))
    .sort((a, b) => getPriority(a) - getPriority(b));

  const appliedRule =
    eligibleRules[0] ??
    ({
      id: "implicit-list-price",
      kind: "list_price",
      scope: "product",
      targetId: input.context.productId,
      fixedNetPrice: listNetPrice.toString(),
      label: "Liste fiyatı"
    } satisfies PriceRule);

  auditTrail.push({
    ruleId: appliedRule.id,
    label: appliedRule.label,
    decision: "applied",
    reason: `Öncelik sırası ${getPriority(appliedRule)} ile fiyat uygulandı.`
  });

  const netPrice = applyRule(listNetPrice, appliedRule);
  const taxRate = new Decimal(input.context.taxRate).div(100);
  const taxAmount = netPrice.mul(taxRate);
  const grossPrice = netPrice.plus(taxAmount);
  const discountRate = listNetPrice.isZero()
    ? new Decimal(0)
    : listNetPrice.minus(netPrice).div(listNetPrice).mul(100);

  return {
    visible: true,
    appliedRule,
    listNetPrice: money(listNetPrice),
    netPrice: money(netPrice),
    grossPrice: money(grossPrice),
    taxAmount: money(taxAmount),
    discountRate: percent(discountRate),
    displayPrice: input.context.displayTaxIncluded ? money(grossPrice) : money(netPrice),
    displayTaxIncluded: input.context.displayTaxIncluded,
    auditTrail
  };
}

function isRuleEligible(rule: PriceRule, context: PriceContext, auditTrail: PriceAuditStep[]): boolean {
  const now = context.now ?? new Date();

  if (rule.startsAt && rule.startsAt > now) {
    auditTrail.push(skip(rule, "Kural başlangıç tarihi henüz gelmedi."));
    return false;
  }

  if (rule.endsAt && rule.endsAt < now) {
    auditTrail.push(skip(rule, "Kuralın geçerlilik tarihi sona erdi."));
    return false;
  }

  if (rule.minQuantity && context.quantity < rule.minQuantity) {
    auditTrail.push(skip(rule, `Minimum adet ${rule.minQuantity}; mevcut adet ${context.quantity}.`));
    return false;
  }

  const targetMatched =
    rule.targetId == null ||
    (rule.scope === "customer" && rule.targetId === context.customerId) ||
    (rule.scope === "segment" && rule.targetId === context.segmentId) ||
    (rule.scope === "brand" && rule.targetId === context.brandId) ||
    (rule.scope === "category" && rule.targetId === context.categoryId) ||
    (rule.scope === "product" && rule.targetId === context.productId) ||
    (rule.scope === "variant" && rule.targetId === context.variantId) ||
    rule.scope === "cart";

  if (!targetMatched) {
    auditTrail.push(skip(rule, "Kural hedefi bu müşteri veya ürünle eşleşmedi."));
    return false;
  }

  auditTrail.push({
    ruleId: rule.id,
    label: rule.label,
    decision: "eligible",
    reason: "Kural öncelik değerlendirmesine dahil edildi."
  });
  return true;
}

function applyRule(listNetPrice: Decimal, rule: PriceRule): Decimal {
  if (rule.fixedNetPrice != null) {
    return new Decimal(rule.fixedNetPrice);
  }

  if (rule.discountRate != null) {
    return listNetPrice.mul(new Decimal(100).minus(rule.discountRate).div(100));
  }

  return listNetPrice;
}

function getPriority(rule: PriceRule): number {
  return rule.priorityOverride ?? PRIORITY[rule.kind];
}

function money(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function percent(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function skip(rule: PriceRule, reason: string): PriceAuditStep {
  return {
    ruleId: rule.id,
    label: rule.label,
    decision: "skipped",
    reason
  };
}
