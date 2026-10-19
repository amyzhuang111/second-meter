/** Plain dollar amounts as integer micro-dollars (1 USD = 1,000,000). */

export function parseUsdMicro(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  if (whole.length > 12) return null;
  const digits = (frac + "0000000").slice(0, 7);
  const base = Number(whole) * 1_000_000 + Number(digits.slice(0, 6));
  if (!Number.isSafeInteger(base)) return null;
  return base + (digits[6] >= "5" ? 1 : 0);
}

export function microFromNumber(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return parseUsdMicro(value.toFixed(6));
}

export function formatUsdPlain(micro: number): string {
  const rounded = Math.round(micro);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const whole = Math.floor(abs / 1_000_000);
  const frac = String(abs % 1_000_000).padStart(6, "0");
  return `${sign}${whole}.${frac}`;
}
