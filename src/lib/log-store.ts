import { SAMPLE_PRICE_TABLE, openLog, type PriceRate } from "./attempt-log";

export const IMPORT_KEY = "second-meter-import-v1";

/**
 * Raw file text above this size is not written to localStorage.
 * Browsers commonly allow about 5 MB for the whole origin, and the saved value
 * is JSON around the file text, so 1.5 MB of file text stays under that quota
 * with room for the rest of this origin.
 */
export const PERSIST_LIMIT_BYTES = 1_500_000;

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
let memoryOnly = false;

export function formatByteSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} bytes`;
  if (bytes < 1_000_000) {
    const kb = bytes / 1_000;
    return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  }
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function unsavedLogNotice(bytes: number, reason: "limit" | "quota"): string {
  const size = formatByteSize(bytes);
  const limit = `${formatByteSize(PERSIST_LIMIT_BYTES)} (${groupDigits(PERSIST_LIMIT_BYTES)} bytes)`;
  if (reason === "limit") {
    return `This log is ${size}, over the ${limit} save limit. Every row still counts in the rates. It stays in this tab and is not written to browser storage. A reload clears it.`;
  }
  return `This browser refused to save this ${size} log (storage quota). The app limit is ${limit}. Every row still counts in the rates. It stays in this tab and is not written to browser storage. A reload clears it.`;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function groupDigits(bytes: number): string {
  return bytes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function subscribeImport(onChange: () => void): () => void {
  window.addEventListener(IMPORT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(IMPORT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readImport(): ImportSnapshot {
  if (memoryOnly || storageBlocked) return clientSnapshot;
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
  const bytes = snapshot.text == null ? 0 : utf8Bytes(snapshot.text);
  if (snapshot.text != null && bytes > PERSIST_LIMIT_BYTES) {
    keepInMemory(snapshot, unsavedLogNotice(bytes, "limit"));
    return;
  }
  const stored = { ...snapshot, note: null };
  const raw = JSON.stringify({ version: 1, ...stored });
  try {
    localStorage.setItem(IMPORT_KEY, raw);
    storageBlocked = false;
    memoryOnly = false;
    clientRaw = raw;
    clientSnapshot = stored;
  } catch {
    keepInMemory(snapshot, unsavedLogNotice(bytes, "quota"));
    return;
  }
  window.dispatchEvent(new Event(IMPORT_EVENT));
}

function keepInMemory(snapshot: ImportSnapshot, note: string): void {
  memoryOnly = true;
  storageBlocked = false;
  clientRaw = null;
  clientSnapshot = { ...snapshot, note };
  try {
    localStorage.removeItem(IMPORT_KEY);
  } catch {
    storageBlocked = true;
    clientSnapshot = { ...clientSnapshot, note: `${note} ${BLOCKED}` };
  }
  window.dispatchEvent(new Event(IMPORT_EVENT));
}

/** Test hook. Production code does not call this. */
export function resetImportStateForTests(): void {
  clientRaw = undefined;
  clientSnapshot = EMPTY_IMPORT;
  storageBlocked = false;
  memoryOnly = false;
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
