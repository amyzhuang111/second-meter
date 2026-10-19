import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  IMPORT_KEY,
  PERSIST_LIMIT_BYTES,
  clearImport,
  readImport,
  resetImportStateForTests,
  saveImport,
  unsavedLogNotice,
} from "./log-store";

const store = new Map<string, string>();
let failWrites = false;

function installBrowser() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) {
          const error = new Error("quota");
          error.name = "QuotaExceededError";
          throw error;
        }
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return true;
      },
    },
  });
}

const small = [
  "run_id,timestamp,model,input_tokens,output_tokens,cost_usd,success",
  "run-1,2026-04-11T15:00:00Z,meter-a,10,1,0.001000,true",
].join("\n");

describe("log persistence", () => {
  afterEach(() => {
    failWrites = false;
    store.clear();
    resetImportStateForTests();
  });

  it("saves a small log and keeps the sample bill available to read back", () => {
    installBrowser();
    saveImport("april.csv", small);
    const saved = readImport();
    assert.equal(saved.note, null);
    assert.equal(saved.filename, "april.csv");
    assert.equal(saved.text, small);
    assert.equal(store.has(IMPORT_KEY), true);
  });

  it("keeps a log over 1.5 MB in memory and does not write it", () => {
    installBrowser();
    saveImport("april.csv", small);
    const header = "run_id,timestamp,model,input_tokens,output_tokens,cost_usd,success\n";
    const padding = "x".repeat(PERSIST_LIMIT_BYTES);
    const text = `${header}${padding}`;
    assert.ok(text.length > PERSIST_LIMIT_BYTES);
    saveImport("huge.csv", text);
    const saved = readImport();
    assert.equal(saved.filename, "huge.csv");
    assert.equal(saved.text, text);
    assert.match(saved.note ?? "", /1\.5 MB \(1,500,000 bytes\)/);
    assert.match(saved.note ?? "", /not written to browser storage/);
    assert.equal(saved.note, unsavedLogNotice(text.length, "limit"));
    assert.equal(store.has(IMPORT_KEY), false);
    clearImport();
    assert.equal(readImport().text, null);
    assert.equal(store.has(IMPORT_KEY), true);
  });

  it("stays in memory when the browser quota throws", () => {
    installBrowser();
    failWrites = true;
    assert.doesNotThrow(() => saveImport("april.csv", small));
    const saved = readImport();
    assert.equal(saved.text, small);
    assert.match(saved.note ?? "", /storage quota/);
    assert.match(saved.note ?? "", /1\.5 MB \(1,500,000 bytes\)/);
    assert.equal(store.has(IMPORT_KEY), false);
  });
});
