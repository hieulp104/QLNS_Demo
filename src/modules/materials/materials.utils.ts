type NumericValue = number | string | { toString(): string };

type MaterialAmount = {
  quantity: NumericValue;
  unitPrice?: NumericValue | null;
  additionalCost?: NumericValue | null;
};

export function materialTotal({
  quantity,
  unitPrice,
  additionalCost,
}: MaterialAmount) {
  return Number(quantity) * Number(unitPrice ?? 0) + Number(additionalCost ?? 0);
}
