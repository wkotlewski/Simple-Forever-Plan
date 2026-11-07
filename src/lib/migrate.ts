import { getLocalBlob, localStore, wipeLocal, type Store } from './store'
import { collectMediaIds, remapMedia } from './backup'
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

  // Upload each recording/photo once (including relatives' recordings) and remember its new Drive id.
  const renamed = new Map<ID, ID>()
  const allMedia = collectMediaIds(data)
  const medical = collectMediaIds(data.medical)
  let done = 0
  for (const id of allMedia) {
    onProgress?.(`Moving recordings and photos… ${++done} of ${allMedia.size}`)
    const blob = await getLocalBlob(id)
    if (blob) renamed.set(id, await drive.putMedia(blob, medical.has(id) ? 'medical' : undefined))
  }
  // Only clear this device if every file made it.
  if (renamed.size < [...allMedia].filter(Boolean).length) {
    const missing = await Promise.all([...allMedia].map(async (id) => !renamed.has(id) && (await getLocalBlob(id)) !== undefined))
    if (missing.some(Boolean)) throw new Error('Some recordings or photos could not be copied to Google Drive, so nothing was removed from this phone.')
  }

  for (const c of COLLECTIONS) {
    onProgress?.('Moving your stories, notes and family tree…')
    const items = data[c].map((item) => remapMedia(item, renamed))
    if (!items.length) continue
    if (drive.putMany) await drive.putMany(c, items)
    else for (const it of items) await drive.put(c, it)
  }
  await wipeLocal()
  return total
}
