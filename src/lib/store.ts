import { createStore, get, set, del, update, keys as idbKeys } from 'idb-keyval'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CollectionMap, CollectionName, ID } from './types'
import { getSupabase } from './supabase'

/**
 * Everything the app saves goes through this one small interface, so the same screens work
 * in "this device only" mode (IndexedDB) and in cloud mode (Supabase, shared with family).
 */
export interface Store {
  mode: 'local' | 'cloud' | 'drive'
  list<K extends CollectionName>(c: K): Promise<CollectionMap[K][]>
  put<K extends CollectionName>(c: K, item: CollectionMap[K]): Promise<void>
  remove(c: CollectionName, id: ID): Promise<void>
  /** Saves many items in one write where the storage supports it. */
  putMany?<K extends CollectionName>(c: K, items: CollectionMap[K][]): Promise<void>
  /** `scope: 'medical'` keeps the file visible only to family allowed to see the medical binder. */
  putMedia(blob: Blob, scope?: 'medical'): Promise<ID>
  mediaUrl(id: ID): Promise<string | null>
}

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '')

/** Media ids carry their kind so screens know how to show them without another lookup. */
export type MediaKind = 'audio' | 'video' | 'image' | 'file'
export const mediaKind = (id: ID): MediaKind => (id.split(':')[0] as MediaKind) ?? 'file'
const kindOf = (blob: Blob): MediaKind => {
  const t = blob.type.split('/')[0]
  return t === 'audio' || t === 'video' || t === 'image' ? t : 'file'
}

// ---------- This-device mode ----------

const db = createStore('simple-forever-plan', 'kv')
const urlCache = new Map<ID, string>()

export const localStore: Store = {
  mode: 'local',
  async list(c) {
    const map = ((await get(c, db)) ?? {}) as Record<ID, any>
    return Object.values(map)
  },
  // Each change reads and writes in one step, so two saves at the same moment can't overwrite each other.
  async put(c, item) {
    await update(c, (map: Record<ID, any> | undefined) => ({ ...(map ?? {}), [(item as any).id]: item }), db)
  },
  async putMany(c, items) {
    await update(c, (map: Record<ID, any> | undefined) => {
      const next = { ...(map ?? {}) }
      for (const it of items) next[(it as any).id] = it
      return next
    }, db)
  },
  async remove(c, id) {
    await update(c, (map: Record<ID, any> | undefined) => {
      const next = { ...(map ?? {}) }
      delete next[id]
      return next
    }, db)
  },
  async putMedia(blob) {
    const id = `${kindOf(blob)}:${uid()}`
    // Stored as plain bytes + type: every browser can keep that (some can't store file objects directly).
    await set(`media:${id}`, { type: blob.type, data: await blob.arrayBuffer() }, db)
    return id
  },
  async mediaUrl(id) {
    if (urlCache.has(id)) return urlCache.get(id)!
    const blob = await getLocalBlob(id)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urlCache.set(id, url)
    return url
  },
}

/** Every recording, photo and file saved on this phone (used to find recordings never attached to an answer). */
export async function listLocalMediaIds(): Promise<ID[]> {
  return (await idbKeys(db)).map(String).filter((k) => k.startsWith('media:')).map((k) => k.slice('media:'.length))
}

/** The original saved file behind a this-device media id (used when moving everything to Google Drive). */
export async function getLocalBlob(id: ID): Promise<Blob | undefined> {
  const v = (await get(`media:${id}`, db)) as Blob | { type: string; data: ArrayBuffer } | undefined
  if (!v) return undefined
  return v instanceof Blob ? v : new Blob([v.data], { type: v.type })
}

export async function wipeLocal() {
  const keys: CollectionName[] = ['answers', 'stories', 'people', 'relations', 'medical', 'messages', 'members', 'asks', 'insights', 'settings']
  await Promise.all(keys.map((k) => del(k, db)))
  const media = (await idbKeys(db)).filter((k) => String(k).startsWith('media:'))
  await Promise.all(media.map((k) => del(k, db)))
}

// ---------- Cloud mode (Supabase) ----------

/**
 * Files are stored as <vault>/<shared|medical>/<kind>_<name>, so the database rules can keep
 * medical photos and notes away from family members who weren't given medical access.
 */
const pathFor = (vaultId: string, id: ID) => {
  const [kind, rest] = id.split(':')
  const [scope, name] = rest.includes('~') ? rest.split('~') : ['shared', rest]
  return `${vaultId}/${scope}/${kind}_${name}`
}

export function cloudStore(vaultId: string): Store {
  const sb = getSupabase() as SupabaseClient
  const ext = (b: Blob) => (b.type.split('/')[1] ?? 'bin').split(';')[0]
  return {
    mode: 'cloud',
    async list(c) {
      const { data, error } = await sb.from('records').select('data').eq('vault_id', vaultId).eq('collection', c)
      if (error) throw error
      return (data ?? []).map((r: { data: any }) => r.data)
    },
    async put(c, item) {
      const { error } = await sb
        .from('records')
        .upsert({ vault_id: vaultId, collection: c, id: (item as any).id, data: item, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    async remove(c, id) {
      const { error } = await sb.from('records').delete().eq('vault_id', vaultId).eq('collection', c).eq('id', id)
      if (error) throw error
    },
    async putMedia(blob, scope) {
      const id = `${kindOf(blob)}:${scope ? `${scope}~` : ''}${uid()}.${ext(blob)}`
      const { error } = await sb.storage.from('media').upload(pathFor(vaultId, id), blob, { contentType: blob.type })
      if (error) throw error
      return id
    },
    async mediaUrl(id) {
      if (urlCache.has(id)) return urlCache.get(id)!
      const { data } = await sb.storage.from('media').createSignedUrl(pathFor(vaultId, id), 60 * 60)
      if (!data?.signedUrl) return null
      urlCache.set(id, data.signedUrl)
      return data.signedUrl
    },
  }
}
