/** Minimal async key/value storage used by the local draft and floor-reference stores (R41). */
export interface KeyValueStore<T> {
  get(key: string): Promise<T | undefined>
  put(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
}

export function createMemoryStore<T>(): KeyValueStore<T> {
  const map = new Map<string, T>()
  return {
    async get(key) {
      return map.get(key)
    },
    async put(key, value) {
      map.set(key, value)
    },
    async delete(key) {
      map.delete(key)
    },
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

/** One object store in its own database; opened lazily on first use. */
export function createIndexedDbStore<T>(
  dbName: string,
  storeName: string,
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
): KeyValueStore<T> {
  let opened: Promise<IDBDatabase> | null = null

  function open(): Promise<IDBDatabase> {
    if (!factory) return Promise.reject(new Error('IndexedDB is not available in this browser'))
    opened ??= new Promise((resolve, reject) => {
      const request = factory.open(dbName, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        opened = null
        reject(request.error ?? new Error('IndexedDB open failed'))
      }
    })
    return opened
  }

  async function run<R>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<R>): Promise<R> {
    const db = await open()
    const transaction = db.transaction(storeName, mode)
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    })
    const result = await requestResult(action(transaction.objectStore(storeName)))
    await done
    return result
  }

  return {
    get: (key) => run('readonly', (store) => store.get(key) as IDBRequest<T | undefined>),
    put: async (key, value) => {
      await run('readwrite', (store) => store.put(value, key))
    },
    delete: async (key) => {
      await run('readwrite', (store) => store.delete(key))
    },
  }
}
