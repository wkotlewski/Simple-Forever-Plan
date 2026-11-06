import { getLocalBlob, localStore, wipeLocal, type Store } from './store'
import type { CollectionName, ID } from './types'

const COLLECTIONS: CollectionName[] = ['answers', 'stories', 'people', 'relations', 'medical', 'messages', 'members', 'asks', 'insights', 'settings']

/**
 * Copies everything saved on this device into Google Drive — recordings and photos included —
 * then clears the copy on this device so private information isn't left behind.
 * Returns how many items were moved.
 */
export async function moveLocalToDrive(drive: Store, onProgress?: (text: string) => void): Promise<number> {
  const data = Object.fromEntries(await Promise.all(COLLECTIONS.map(async (c) => [c, await localStore.list(c)] as const))) as Record<CollectionName, any[]>
  const total = COLLECTIONS.reduce((n, c) => n + data[c].length, 0)
  if (!total) return 0

  // Upload each recording/photo once and remember its new Drive id.
  const renamed = new Map<ID, ID>()
  const allMedia = new Set<ID>([
    ...data.answers.flatMap((a) => a.mediaIds ?? []),
    ...data.medical.flatMap((m) => m.mediaIds ?? []),
    ...data.messages.flatMap((m) => m.mediaIds ?? []),
    ...data.people.map((p) => p.photoId).filter(Boolean),
  ])
  const medicalMedia = new Set<ID>(data.medical.flatMap((m) => m.mediaIds ?? []))
  let done = 0
  for (const id of allMedia) {
    onProgress?.(`Moving recordings and photos… ${++done} of ${allMedia.size}`)
    const blob = await getLocalBlob(id)
    if (blob) renamed.set(id, await drive.putMedia(blob, medicalMedia.has(id) ? 'medical' : undefined))
  }
  const fix = (ids: ID[] = []) => ids.map((i) => renamed.get(i)).filter(Boolean) as ID[]

  for (const c of COLLECTIONS) {
    onProgress?.('Moving your stories, notes and family tree…')
    const items = data[c].map((item) => {
      const copy = { ...item }
      if ('mediaIds' in copy) copy.mediaIds = fix(copy.mediaIds)
      if (copy.photoId) copy.photoId = renamed.get(copy.photoId)
      return copy
    })
    if (!items.length) continue
    if (drive.putMany) await drive.putMany(c, items)
    else for (const it of items) await drive.put(c, it)
  }
  await wipeLocal()
  return total
}
