/**
 * Deletes an IndexedDB database, resolving once it's gone. A connection left
 * open holds the deletion back until it closes.
 */
export const deleteIndexedDB = (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`failed to delete ${name}`));
    };
  });
