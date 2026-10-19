import { SAMPLE_PRICE_TABLE, openLog, type PriceRate } from "./attempt-log";

export const IMPORT_KEY = "second-meter-import-v1";

const IMPORT_EVENT = "second-meter-import";
const BLOCKED = "This browser blocked local storage. The imported log lasts for this tab only.";

export type ImportSnapshot = {
  sampleData: boolean;
  filename: string | null;
  text: string | null;
  prices: PriceRate[];
  priceOrigin: "sample" | "user";
  note: string | null;
};

export const EMPTY_IMPORT: ImportSnapshot = {
  sampleData: false,
  filename: null,
  text: null,
  prices: [],
  priceOrigin: "user",
  note: null,
};

let clientRaw: string | null | undefined;
let clientSnapshot: ImportSnapshot = EMPTY_IMPORT;
let storageBlocked = false;

export function subscribeImport(onChange: () => void): () => void {
  window.addEventListener(IMPORT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(IMPORT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readImport(): ImportSnapshot {
  if (storageBlocked) return clientSnapshot;
  try {
    const raw = localStorage.getItem(IMPORT_KEY);
    if (clientRaw === raw) return clientSnapshot;
    clientRaw = raw;
    clientSnapshot = raw ? decode(raw) : EMPTY_IMPORT;
    return clientSnapshot;
  } catch {
    storageBlocked = true;
    clientSnapshot = { ...clientSnapshot, note: BLOCKED };
    return clientSnapshot;
  }
}

export function serverImport(): ImportSnapshot {
  return EMPTY_IMPORT;
}

export function saveSampleData(sampleData: boolean): void {
  commit({ ...readImport(), sampleData });
}

export function saveImport(filename: string, text: string): void {
  const current = readImport();
  const probe = openLog(filename, text, []);
  const sample = probe.label === "sample";
  commit({
    sampleData: current.sampleData,
    filename,
    text,
    prices: sample ? SAMPLE_PRICE_TABLE.map((rate) => ({ ...rate })) : current.priceOrigin === "user" ? current.prices : [],
    priceOrigin: sample ? "sample" : "user",
    note: null,
  });
}

export function savePrices(prices: PriceRate[]): void {
  commit({ ...readImport(), prices, priceOrigin: "user" });
}

export function clearImport(): void {
  const current = readImport();
  commit({ ...EMPTY_IMPORT, sampleData: current.sampleData });
}

function commit(snapshot: ImportSnapshot): void {
  const stored = { ...snapshot, note: null };
  const raw = JSON.stringify({ version: 1, ...stored });
  try {
    localStorage.setItem(IMPORT_KEY, raw);
    storageBlocked = false;
    clientRaw = raw;
    clientSnapshot = stored;
  } catch {
    storageBlocked = true;
    clientRaw = raw;
    clientSnapshot = { ...stored, note: BLOCKED };
  }
  window.dispatchEvent(new Event(IMPORT_EVENT));
}

function decode(raw: string): ImportSnapshot {
  try {
    const value = JSON.parse(raw) as Partial<ImportSnapshot> & { version?: number };
    if (!value || value.version !== 1) {
      return { ...EMPTY_IMPORT, note: "Saved import could not be read. Starting from an empty log." };
    }
    return {
      sampleData: value.sampleData === true,
      filename: typeof value.filename === "string" ? value.filename : null,
      text: typeof value.text === "string" ? value.text : null,
      prices: Array.isArray(value.prices) ? value.prices.filter(isPrice) : [],
      priceOrigin: value.priceOrigin === "sample" ? "sample" : "user",
      note: null,
    };
  } catch {
    return { ...EMPTY_IMPORT, note: "Saved import could not be read. Starting from an empty log." };
  }
}

function isPrice(value: unknown): value is PriceRate {
  if (!value || typeof value !== "object") return false;
  const rate = value as PriceRate;
  return typeof rate.model === "string" && rate.model.length > 0;
}
