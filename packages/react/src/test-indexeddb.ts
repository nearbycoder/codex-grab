type RequestListener = ((this: IDBRequest, ev: Event) => unknown) | null;

interface FakeStoreState {
  records: Map<string, unknown>;
  indexes: Set<string>;
}

interface FakeDatabaseState {
  version: number;
  stores: Map<string, FakeStoreState>;
}

class FakeIdbRequest<T = unknown> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: RequestListener = null;
  onerror: RequestListener = null;
  onupgradeneeded: ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown) | null = null;
  transaction: IDBTransaction | null = null;

  succeed(result: T) {
    this.result = result;
    queueMicrotask(() => {
      this.onsuccess?.call(this as unknown as IDBRequest, new Event("success"));
    });
  }
}

class FakeNameList {
  constructor(private readonly values: Set<string>) {}

  contains(name: string) {
    return this.values.has(name);
  }
}

class FakeIdbObjectStore {
  indexNames: FakeNameList;

  constructor(
    private readonly store: FakeStoreState,
    private readonly transaction: FakeIdbTransaction | null,
  ) {
    this.indexNames = new FakeNameList(this.store.indexes);
  }

  createIndex(name: string) {
    this.store.indexes.add(name);
    return undefined;
  }

  put(value: Record<string, unknown>) {
    const request = new FakeIdbRequest<IDBValidKey>();
    queueMicrotask(() => {
      this.store.records.set(String(value.id), value);
      request.succeed(String(value.id));
      this.transaction?.scheduleComplete();
    });
    return request as unknown as IDBRequest<IDBValidKey>;
  }

  getAll() {
    const request = new FakeIdbRequest<unknown[]>();
    queueMicrotask(() => {
      request.succeed(Array.from(this.store.records.values()));
      this.transaction?.scheduleComplete();
    });
    return request as unknown as IDBRequest<unknown[]>;
  }

  clear() {
    const request = new FakeIdbRequest<undefined>();
    queueMicrotask(() => {
      this.store.records.clear();
      request.succeed(undefined);
      this.transaction?.scheduleComplete();
    });
    return request as unknown as IDBRequest<undefined>;
  }

  delete(id: string) {
    const request = new FakeIdbRequest<undefined>();
    queueMicrotask(() => {
      this.store.records.delete(id);
      request.succeed(undefined);
      this.transaction?.scheduleComplete();
    });
    return request as unknown as IDBRequest<undefined>;
  }
}

class FakeIdbTransaction {
  error: DOMException | null = null;
  oncomplete: ((this: IDBTransaction, ev: Event) => unknown) | null = null;
  onerror: ((this: IDBTransaction, ev: Event) => unknown) | null = null;
  onabort: ((this: IDBTransaction, ev: Event) => unknown) | null = null;
  private completionScheduled = false;

  constructor(private readonly database: FakeDatabaseState) {}

  objectStore(name: string) {
    const store = this.database.stores.get(name);
    if (!store) {
      throw new Error(`Unknown object store: ${name}`);
    }

    return new FakeIdbObjectStore(store, this) as unknown as IDBObjectStore;
  }

  scheduleComplete() {
    if (this.completionScheduled) {
      return;
    }

    this.completionScheduled = true;
    setTimeout(() => {
      this.oncomplete?.call(this as unknown as IDBTransaction, new Event("complete"));
    }, 0);
  }
}

class FakeIdbDatabase {
  objectStoreNames: FakeNameList;

  constructor(private readonly state: FakeDatabaseState) {
    this.objectStoreNames = new FakeNameList(new Set(this.state.stores.keys()));
  }

  createObjectStore(name: string) {
    const store: FakeStoreState = {
      records: new Map(),
      indexes: new Set()
    };
    this.state.stores.set(name, store);
    this.objectStoreNames = new FakeNameList(new Set(this.state.stores.keys()));
    return new FakeIdbObjectStore(store, null) as unknown as IDBObjectStore;
  }

  transaction() {
    return new FakeIdbTransaction(this.state) as unknown as IDBTransaction;
  }
}

export const installMockIndexedDb = (options?: {
  version?: number;
  stores?: Array<{ name: string; indexes?: string[]; records?: Array<Record<string, unknown>> }>;
}) => {
  const databaseState: FakeDatabaseState = {
    version: options?.version ?? 0,
    stores: new Map(
      (options?.stores ?? []).map((store) => [
        store.name,
        {
          records: new Map((store.records ?? []).map((record) => [String(record.id), record])),
          indexes: new Set(store.indexes ?? [])
        }
      ]),
    )
  };

  const indexedDb = {
    open(_name: string, version?: number) {
      const request = new FakeIdbRequest<IDBDatabase>();
      const database = new FakeIdbDatabase(databaseState) as unknown as IDBDatabase;
      queueMicrotask(() => {
        request.result = database;
        const nextVersion = version ?? databaseState.version;
        if (nextVersion > databaseState.version) {
          databaseState.version = nextVersion;
          request.transaction = new FakeIdbTransaction(databaseState) as unknown as IDBTransaction;
          request.onupgradeneeded?.call(
            request as unknown as IDBOpenDBRequest,
            new Event("upgradeneeded") as IDBVersionChangeEvent,
          );
        }
        request.succeed(database);
      });
      return request as unknown as IDBOpenDBRequest;
    }
  };

  Object.defineProperty(window, "indexedDB", {
    configurable: true,
    value: indexedDb
  });

  return {
    databaseState
  };
};
