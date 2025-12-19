import { openDB, IDBPDatabase } from 'https://esm.sh/idb@8';

const DB_NAME = 'mtg-image-cache';
const STORE_NAME = 'images';
const MAX_CACHE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

interface CachedImage {
  name: string;
  blob: Blob;
  size: number;
  lastUsed: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'name' });
        store.createIndex('lastUsed', 'lastUsed');
      },
    });
  }
  return dbPromise;
};

export const ImageCache = {
  async get(name: string): Promise<string | null> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const entry = (await store.get(name)) as CachedImage | undefined;

    if (entry) {
      // Update lastUsed timestamp (LRU logic)
      entry.lastUsed = Date.now();
      await store.put(entry);
      return URL.createObjectURL(entry.blob);
    }
    return null;
  },

  async set(name: string, blob: Blob): Promise<string> {
    const db = await getDB();
    const size = blob.size;

    // 1. Manage Quota
    await this.prune(size);

    // 2. Save new entry
    const entry: CachedImage = {
      name,
      blob,
      size,
      lastUsed: Date.now()
    };

    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.objectStore(STORE_NAME).put(entry);
    await tx.done;

    return URL.createObjectURL(blob);
  },

  async prune(incomingSize: number) {
    const db = await getDB();
    let tx = db.transaction(STORE_NAME, 'readwrite');
    let store = tx.objectStore(STORE_NAME);
    
    // Calculate total current size
    let allEntries = await store.getAll() as CachedImage[];
    let currentTotal = allEntries.reduce((sum, e) => sum + e.size, 0);

    if (currentTotal + incomingSize > MAX_CACHE_SIZE_BYTES) {
      // Sort by lastUsed (ascending = oldest first)
      allEntries.sort((a, b) => a.lastUsed - b.lastUsed);

      for (const entry of allEntries) {
        if (currentTotal + incomingSize <= MAX_CACHE_SIZE_BYTES) break;
        await store.delete(entry.name);
        currentTotal -= entry.size;
        console.debug(`[Cache] Pruned ${entry.name} to free up space.`);
      }
    }
    await tx.done;
  }
};
