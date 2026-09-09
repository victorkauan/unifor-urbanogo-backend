export interface PricingConfig {
  currency: string;
  baseFareCents: number;
  perKmCents: number;
  serviceFeeCents: number;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  currency: "BRL",
  baseFareCents: 500,
  perKmCents: 180,
  serviceFeeCents: 200,
};
