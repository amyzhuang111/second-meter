export const PRICE_CARD = {
  model: "meter-sim-small",
  inputPerMillionUsd: 3,
  outputPerMillionUsd: 15,
} as const;

/**
 * Micro-dollars for one model call.
 * $3 per 1,000,000 tokens is 3 micro-dollars per token, so the per-million
 * rate is also the per-token micro-dollar rate. Tool calls are unpriced.
 */
export function modelCostMicro(tokensIn: number, tokensOut: number): number {
  return (
    tokensIn * PRICE_CARD.inputPerMillionUsd +
    tokensOut * PRICE_CARD.outputPerMillionUsd
  );
}

export function callCostMicro(call: {
  kind: "tool" | "model";
  tokensIn: number;
  tokensOut: number;
}): number {
  if (call.kind === "tool") return 0;
  return modelCostMicro(call.tokensIn, call.tokensOut);
}
