/** Uploaded background images. Blobs live in IndexedDB on this device only; they are never synced. */

export interface StoredImage {
  id: string;
  name: string;
  blob: Blob;
}

export interface ImageStore {
  list(): Promise<StoredImage[]>;
  add(blob: Blob, name: string): Promise<StoredImage>;
  remove(id: string): Promise<void>;
}

const DB_NAME = 'tabloid-backgrounds';
const STORE = 'images';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Image storage failed.'));
  });
}

export function createIndexedDbImageStore(): ImageStore {
  let opened: Promise<IDBDatabase> | undefined;
  const open = () =>
    (opened ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open image storage.'));
    }));
  const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE);

  return {
    async list() {
      return (await request((await store('readonly')).getAll())) as StoredImage[];
    },
    async add(blob, name) {
      const image: StoredImage = { id: crypto.randomUUID(), name, blob };
      await request((await store('readwrite')).put(image));
      return image;
    },
    async remove(id) {
      await request((await store('readwrite')).delete(id));
    },
  };
}

export const MAX_IMAGE_EDGE = 2560;

/** Shrinks big photos (and normalizes the format) so a handful of uploads stays small. */
export async function downscaleImage(file: Blob, maxEdge = MAX_IMAGE_EDGE): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file couldn't be read as an image.");
  });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error("That image couldn't be processed.");
  return blob;
}
