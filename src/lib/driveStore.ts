import { FOLDER_NAME, gfetch } from './google'
import type { Store } from './store'
import type { CollectionName, ID } from './types'

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER = 'application/vnd.google-apps.folder'

const kindOf = (b: Blob) => {
  const t = b.type.split('/')[0]
  return t === 'audio' || t === 'video' || t === 'image' ? t : 'file'
}

async function findOrCreateFolder(name: string, parent?: string): Promise<string> {
  const q = [`name='${name.replace(/'/g, "\\'")}'`, `mimeType='${FOLDER}'`, 'trashed=false', parent ? `'${parent}' in parents` : null]
    .filter(Boolean).join(' and ')
  const found = await (await gfetch(`${API}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`)).json()
  if (found.files?.[0]) return found.files[0].id
  const made = await (await gfetch(`${API}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
  })).json()
  return made.id
}

async function upload(meta: object, blob: Blob, fileId?: string): Promise<string> {
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
  form.append('file', blob)
  const res = await gfetch(`${UPLOAD}${fileId ? `/${fileId}` : ''}?uploadType=multipart&fields=id`, { method: fileId ? 'PATCH' : 'POST', body: form })
  return (await res.json()).id
}

/**
 * Saves the plan in the person's own Google Drive:
 *   Simple Forever Plan/
 *     answers.json, stories.json, people.json, … (one file per section)
 *     Recordings & Photos/   (each recording, photo and document as its own file)
 * They can open, download or delete these files from Drive at any time.
 */
export async function createDriveStore(): Promise<Store & { folderId: string }> {
  const root = await findOrCreateFolder(FOLDER_NAME)
  let mediaFolder: Promise<string> | null = null
  const getMediaFolder = () => (mediaFolder ??= findOrCreateFolder('Recordings & Photos', root))

  // Each section is one JSON file. Keep it in memory and write changes one at a time so nothing is lost.
  const cache = new Map<CollectionName, { fileId: string | null; map: Record<ID, any> }>()
  const queues = new Map<CollectionName, Promise<unknown>>()
  const urls = new Map<ID, string>()

  async function load(c: CollectionName) {
    if (cache.has(c)) return cache.get(c)!
    const q = `name='${c}.json' and '${root}' in parents and trashed=false`
    const found = await (await gfetch(`${API}?q=${encodeURIComponent(q)}&fields=files(id)`)).json()
    const fileId: string | null = found.files?.[0]?.id ?? null
    const map = fileId ? await (await gfetch(`${API}/${fileId}?alt=media`)).json().catch(() => ({})) : {}
    const entry = { fileId, map: map ?? {} }
    cache.set(c, entry)
    return entry
  }

  function write(c: CollectionName, change: (map: Record<ID, any>) => void) {
    const run = async () => {
      const entry = await load(c)
      change(entry.map)
      const body = new Blob([JSON.stringify(entry.map, null, 1)], { type: 'application/json' })
      entry.fileId = await upload(entry.fileId ? {} : { name: `${c}.json`, parents: [root], mimeType: 'application/json' }, body, entry.fileId ?? undefined)
    }
    const next = (queues.get(c) ?? Promise.resolve()).then(run, run)
    queues.set(c, next.catch(() => null))
    return next
  }

  return {
    mode: 'drive',
    folderId: root,
    async list(c) { return Object.values((await load(c)).map) },
    async put(c, item) { await write(c, (m) => { m[(item as any).id] = item }) },
    async putMany(c, items) { await write(c, (m) => { for (const it of items) m[(it as any).id] = it }) },
    async remove(c, id) { await write(c, (m) => { delete m[id] }) },
    async putMedia(blob, scope) {
      const folder = await getMediaFolder()
      const ext = (blob.type.split('/')[1] ?? 'bin').split(';')[0]
      const name = (blob as File).name || `${scope === 'medical' ? 'medical-' : ''}${kindOf(blob)}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`
      const id = await upload({ name, parents: [folder] }, blob)
      return `${kindOf(blob)}:${id}`
    },
    async mediaUrl(id) {
      if (urls.has(id)) return urls.get(id)!
      const fileId = id.split(':')[1]
      try {
        const blob = await (await gfetch(`${API}/${fileId}?alt=media`)).blob()
        const url = URL.createObjectURL(blob)
        urls.set(id, url)
        return url
      } catch {
        return null
      }
    },
  }
}
