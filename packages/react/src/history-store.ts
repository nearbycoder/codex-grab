import type { GrabTurnHistoryRecord } from "./history-types.js";
import type { GrabPersistedWidgetRecord } from "./widget-types.js";

const DB_NAME = "codex-grab-history";
const DB_VERSION = 2;
const TURN_STORE = "turns";
const WIDGET_STORE = "widgets";

export class HistoryStorageUnavailableError extends Error {
  constructor(message = "IndexedDB is unavailable in this browser.") {
    super(message);
    this.name = "HistoryStorageUnavailableError";
  }
}

const ensureIndexedDb = (): IDBFactory => {
  if (typeof window === "undefined" || !("indexedDB" in window) || !window.indexedDB) {
    throw new HistoryStorageUnavailableError();
  }

  return window.indexedDB;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });

const transactionToPromise = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });

const ensureTurnStore = (database: IDBDatabase, transaction: IDBTransaction | null) => {
  const store = database.objectStoreNames.contains(TURN_STORE)
    ? transaction?.objectStore(TURN_STORE) ?? null
    : database.createObjectStore(TURN_STORE, { keyPath: "id" });

  if (!store) {
    return;
  }

  if (!store.indexNames.contains("updatedAt")) {
    store.createIndex("updatedAt", "updatedAt");
  }

  if (!store.indexNames.contains("status")) {
    store.createIndex("status", "status");
  }
};

const ensureWidgetStore = (database: IDBDatabase, transaction: IDBTransaction | null) => {
  const store = database.objectStoreNames.contains(WIDGET_STORE)
    ? transaction?.objectStore(WIDGET_STORE) ?? null
    : database.createObjectStore(WIDGET_STORE, { keyPath: "id" });

  if (!store) {
    return;
  }

  if (!store.indexNames.contains("viewId")) {
    store.createIndex("viewId", "viewId");
  }

  if (!store.indexNames.contains("updatedAt")) {
    store.createIndex("updatedAt", "updatedAt");
  }

  if (!store.indexNames.contains("status")) {
    store.createIndex("status", "turnStatus");
  }
};

const openDatabase = async (): Promise<IDBDatabase> => {
  const indexedDb = ensureIndexedDb();
  const request = indexedDb.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = () => {
    const database = request.result;
    const transaction = request.transaction;
    ensureTurnStore(database, transaction);
    ensureWidgetStore(database, transaction);
  };

  return requestToPromise(request);
};

export interface CodexGrabStore {
  listTurns(): Promise<GrabTurnHistoryRecord[]>;
  putTurn(record: GrabTurnHistoryRecord): Promise<void>;
  deleteTurn(id: string): Promise<void>;
  clearTurns(): Promise<void>;
  listWidgets(): Promise<GrabPersistedWidgetRecord[]>;
  putWidget(record: GrabPersistedWidgetRecord): Promise<void>;
  deleteWidget(id: string): Promise<void>;
  clearWidgets(): Promise<void>;
}

export const createCodexGrabStore = (): CodexGrabStore => {
  let databasePromise: Promise<IDBDatabase> | null = null;

  const getDatabase = async () => {
    if (!databasePromise) {
      databasePromise = openDatabase();
    }

    return databasePromise;
  };

  return {
    async listTurns() {
      const database = await getDatabase();
      const transaction = database.transaction(TURN_STORE, "readonly");
      const store = transaction.objectStore(TURN_STORE);
      const records = (await requestToPromise(store.getAll())) as GrabTurnHistoryRecord[];
      await transactionToPromise(transaction);
      return [...records].sort((left, right) => right.updatedAt - left.updatedAt);
    },
    async putTurn(record) {
      const database = await getDatabase();
      const transaction = database.transaction(TURN_STORE, "readwrite");
      transaction.objectStore(TURN_STORE).put(record);
      await transactionToPromise(transaction);
    },
    async deleteTurn(id) {
      const database = await getDatabase();
      const transaction = database.transaction(TURN_STORE, "readwrite");
      transaction.objectStore(TURN_STORE).delete(id);
      await transactionToPromise(transaction);
    },
    async clearTurns() {
      const database = await getDatabase();
      const transaction = database.transaction(TURN_STORE, "readwrite");
      transaction.objectStore(TURN_STORE).clear();
      await transactionToPromise(transaction);
    },
    async listWidgets() {
      const database = await getDatabase();
      const transaction = database.transaction(WIDGET_STORE, "readonly");
      const store = transaction.objectStore(WIDGET_STORE);
      const records = (await requestToPromise(store.getAll())) as GrabPersistedWidgetRecord[];
      await transactionToPromise(transaction);
      return [...records].sort((left, right) => right.updatedAt - left.updatedAt);
    },
    async putWidget(record) {
      const database = await getDatabase();
      const transaction = database.transaction(WIDGET_STORE, "readwrite");
      transaction.objectStore(WIDGET_STORE).put(record);
      await transactionToPromise(transaction);
    },
    async deleteWidget(id) {
      const database = await getDatabase();
      const transaction = database.transaction(WIDGET_STORE, "readwrite");
      transaction.objectStore(WIDGET_STORE).delete(id);
      await transactionToPromise(transaction);
    },
    async clearWidgets() {
      const database = await getDatabase();
      const transaction = database.transaction(WIDGET_STORE, "readwrite");
      transaction.objectStore(WIDGET_STORE).clear();
      await transactionToPromise(transaction);
    }
  };
};

export const createTurnHistoryStore = (): CodexGrabStore => createCodexGrabStore();
