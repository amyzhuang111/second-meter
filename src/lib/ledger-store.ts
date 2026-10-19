import { FIRST_RUN_NUMBER, SAMPLE_RUNS } from "./script";
import { LEDGER_KEY, parseLedger, serializeLedger, type LedgerFile } from "./ledger";

export type LedgerSnapshot = LedgerFile & {
  note: string | null;
};

const LEDGER_EVENT = "second-meter-ledger";

export const SERVER_LEDGER: LedgerSnapshot = {
  runs: [...SAMPLE_RUNS],
  nextNumber: FIRST_RUN_NUMBER,
  note: null,
};

const BLOCKED_LEDGER: LedgerSnapshot = {
  ...SERVER_LEDGER,
  note: "This browser blocked local storage. The ledger lasts for this tab only.",
};

const UNREADABLE = "Saved ledger was unreadable. Showing the sample runs.";

let clientRaw: string | null | undefined;
let clientSnapshot: LedgerSnapshot = SERVER_LEDGER;
let storageBlocked = false;

export function subscribeLedger(onChange: () => void): () => void {
  window.addEventListener(LEDGER_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LEDGER_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readLedger(): LedgerSnapshot {
  if (storageBlocked) return BLOCKED_LEDGER;
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (clientRaw === raw) return clientSnapshot;
    clientRaw = raw;
    if (!raw) {
      clientSnapshot = SERVER_LEDGER;
      return clientSnapshot;
    }
    const parsed = parseLedger(raw);
    clientSnapshot = parsed
      ? { runs: parsed.runs, nextNumber: parsed.nextNumber, note: null }
      : { ...SERVER_LEDGER, note: UNREADABLE };
    return clientSnapshot;
  } catch {
    storageBlocked = true;
    return BLOCKED_LEDGER;
  }
}

export function serverLedger(): LedgerSnapshot {
  return SERVER_LEDGER;
}

export function writeLedger(file: LedgerFile): void {
  const raw = serializeLedger(file);
  localStorage.setItem(LEDGER_KEY, raw);
  clientRaw = raw;
  clientSnapshot = { runs: file.runs, nextNumber: file.nextNumber, note: null };
  storageBlocked = false;
  window.dispatchEvent(new Event(LEDGER_EVENT));
}

export function resetLedger(): void {
  localStorage.removeItem(LEDGER_KEY);
  clientRaw = null;
  clientSnapshot = SERVER_LEDGER;
  storageBlocked = false;
  window.dispatchEvent(new Event(LEDGER_EVENT));
}
