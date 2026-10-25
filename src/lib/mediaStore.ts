"use client";

// Thin IndexedDB wrapper (via idb-keyval) used to persist the actual media
// binary blobs locally in the browser. Project structure/metadata is kept in
// localStorage (see projectStore.ts); the heavy binary data lives here so
// projects can be reloaded after a refresh without any server or database.
import { createStore, get, set, del, keys } from "idb-keyval";

const store = typeof window !== "undefined" ? createStore("tunix-studio", "media-blobs") : undefined;

export async function saveMediaBlob(id: string, blob: Blob): Promise<void> {
  if (!store) return;
  await set(id, blob, store);
}

export async function loadMediaBlob(id: string): Promise<Blob | undefined> {
  if (!store) return undefined;
  return (await get(id, store)) as Blob | undefined;
}

export async function deleteMediaBlob(id: string): Promise<void> {
  if (!store) return;
  await del(id, store);
}

export async function listMediaIds(): Promise<IDBValidKey[]> {
  if (!store) return [];
  return keys(store);
}
