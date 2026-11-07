import type { Store } from './store'
import { MED_LABELS } from './medicalLabels'
import { CHAPTERS } from './questions'
import type { CollectionMap, CollectionName, ID } from './types'

type Data = { [K in CollectionName]: CollectionMap[K][] }
const COLLECTIONS: CollectionName[] = ['answers', 'stories', 'people', 'relations', 'medical', 'messages', 'members', 'asks', 'insights', 'settings']
const today = () => new Date().toISOString().slice(0, 10)

/** Every recording/photo id referenced anywhere in the plan (including relatives' answers). */
export function collectMediaIds(value: unknown, out = new Set<ID>()): Set<ID> {
  if (Array.isArray(value)) value.forEach((v) => collectMediaIds(v, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'mediaIds' && Array.isArray(v)) v.forEach((id) => typeof id === 'string' && out.add(id))
      else if (k === 'photoId' && typeof v === 'string') out.add(v)
      else collectMediaIds(v, out)
    }
  }
  return out
}

/** Copy of a record with media ids swapped for new ones (dropping any that weren't carried over). */
export function remapMedia<T>(value: T, map: Map<ID, ID>): T {
  if (Array.isArray(value)) return value.map((v) => remapMedia(v, map)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => {
      if (k === 'mediaIds' && Array.isArray(v)) return [k, v.map((id) => map.get(id)).filter(Boolean)]
      if (k === 'photoId' && typeof v === 'string') return [k, map.get(v)]
      return [k, remapMedia(v, map)]
    })) as T
  }
  return value
}

/** Ids of media attached to medical items, which are stored with extra privacy. */
const medicalMedia = (data: any) => collectMediaIds(data?.medical ?? [])

const EXT: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' }
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]))
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)

/** A readable file name for each recording or photo, so the backup makes sense when opened in Files. */
function mediaNames(data: Data, ids: Set<ID>): Map<ID, string> {
  const names = new Map<ID, string>()
  const used = new Set<string>()
  const label = (id: ID, base: string) => {
    if (names.has(id) || !ids.has(id)) return
    let n = safe(base) || 'file', i = 1
    while (used.has(n.toLowerCase())) n = `${safe(base)} ${++i}`
    used.add(n.toLowerCase()); names.set(id, n)
  }
  for (const a of data.answers) {
    a.mediaIds.forEach((m) => label(m, `${CHAPTERS.find((c) => c.id === a.chapterId)?.title ?? 'Story'} - ${a.question}`))
    a.contributions?.forEach((c) => c.mediaIds.forEach((m) => label(m, `${c.from} - ${a.question}`)))
  }
  for (const m of data.medical) {
    m.mediaIds.forEach((x) => label(x, `Medical - ${m.title}`))
    m.contributions?.forEach((c) => c.mediaIds.forEach((x) => label(x, `Medical - ${m.title} - ${c.from}`)))
  }
  for (const k of data.messages) k.mediaIds.forEach((x) => label(x, `Words to Keep - ${k.text.slice(0, 40)}`))
  for (const p of data.people) {
    if (p.photoId) label(p.photoId, `Photo - ${p.name}`)
    p.contributions?.forEach((c) => c.mediaIds.forEach((x) => label(x, `${c.from} about ${p.name}`)))
  }
  ids.forEach((id) => label(id, 'Recording'))
  return names
}

/**
 * The whole plan in one ZIP file — stories, medical notes, family tree, messages, every recording and
 * photo (with readable names), and a PDF of everything that anyone can open. Restore from it on any phone.
 */
export async function makeBackup(store: Store, data: Data, includeMedia: boolean, onProgress?: (t: string) => void, readable?: Blob): Promise<File> {
  const { zipSync, strToU8 } = await import('fflate')
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {}
  const mediaPaths: Record<ID, string> = {}
  if (includeMedia) {
    const ids = collectMediaIds(data)
    const names = mediaNames(data, ids)
    let n = 0
    for (const id of ids) {
      onProgress?.(`Adding recordings and photos… ${++n} of ${ids.size}`)
      const url = await store.mediaUrl(id)
      if (!url) continue
      const blob = await (await fetch(url)).blob()
      const ext = EXT[blob.type.split(';')[0]] ?? (blob.type.split('/')[1] ?? 'bin').split(';')[0]
      const path = `Recordings and photos/${names.get(id) ?? id}.${ext}`
      files[path] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
      mediaPaths[id] = path
    }
  }
  if (readable) files['Everything (easy to read).pdf'] = [new Uint8Array(await readable.arrayBuffer()), { level: 0 }]
  files['plan.json'] = strToU8(JSON.stringify({ app: 'simple-forever-plan', version: 2, exportedAt: new Date().toISOString(), data, media: mediaPaths }))
  files['How to restore.txt'] = strToU8('To restore: open Simple Forever Plan, tap "Saved on this phone" on Home, then "Choose a saved copy" and pick this ZIP file. Everything comes back, recordings included.\n')
  onProgress?.('Packing your backup…')
  const zip = zipSync(files as any)
  return new File([zip], `Simple Forever Plan backup ${today()}.zip`, { type: 'application/zip' })
}

/** Restores a backup (ZIP, or the older single .json file). Items with the same id are replaced; nothing else is removed. */
export async function restoreBackup(file: File, store: Store, onProgress?: (t: string) => void): Promise<number> {
  let parsed: any
  let readMedia: (ref: string) => Promise<Blob | null>
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const { unzipSync, strFromU8 } = await import('fflate')
    const entries = unzipSync(bytes)
    if (!entries['plan.json']) throw new Error('This ZIP isn’t a Simple Forever Plan backup.')
    parsed = JSON.parse(strFromU8(entries['plan.json']))
    readMedia = async (path) => {
      const u = entries[path]
      if (!u) return null
      const ext = path.split('.').pop()!.toLowerCase()
      return new Blob([u], { type: TYPE[ext] ?? 'application/octet-stream' })
    }
  } else {
    try { parsed = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new Error('This file isn’t a Simple Forever Plan backup.') }
    readMedia = async (url) => (await fetch(url)).blob()
  }
  if (parsed?.app !== 'simple-forever-plan' || !parsed.data) throw new Error('This file isn’t a Simple Forever Plan backup.')

  const renamed = new Map<ID, ID>()
  const medical = medicalMedia(parsed.data)
  const entries = Object.entries(parsed.media ?? {}) as [ID, string][]
  let n = 0
  for (const [id, ref] of entries) {
    onProgress?.(`Restoring recordings and photos… ${++n} of ${entries.length}`)
    const blob = await readMedia(ref)
    if (blob) renamed.set(id, await store.putMedia(blob, medical.has(id) ? 'medical' : undefined))
  }
  let count = 0
  for (const c of COLLECTIONS) {
    const items = (parsed.data[c] ?? []).map((it: any) => remapMedia(it, renamed))
    if (!items.length) continue
    onProgress?.('Restoring your stories, notes and family tree…')
    if (store.putMany) await store.putMany(c, items)
    else for (const it of items) await store.put(c, it)
    count += items.length
  }
  return count
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '').replace(/\r?\n/g, ' ')
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** A spreadsheet (CSV) that opens in Google Sheets, Numbers or Excel: one row per item, grouped by section. */
export function makeSpreadsheet(data: Data, includeMedical: boolean): File {
  const rows: unknown[][] = [['Section', 'Label', 'Name or title', 'Details', 'Dose / dates', 'When / relationship', 'Contact']]
  const name = (id: ID) => data.people.find((p) => p.id === id)?.name ?? ''
  if (includeMedical) {
    for (const m of data.medical) rows.push(['Medical', MED_LABELS[m.category], m.title, m.details, m.dosage, m.schedule, m.phone ?? m.prescriber])
  }
  for (const p of data.people) {
    const parents = data.relations.filter((r) => r.type === 'parent' && r.to === p.id).map((r) => name(r.from))
    const partners = data.relations.filter((r) => r.type === 'spouse' && (r.from === p.id || r.to === p.id)).map((r) => name(r.from === p.id ? r.to : r.from))
    const rel = [parents.length ? `Child of ${parents.join(' & ')}` : '', partners.length ? `Partner of ${partners.join(', ')}` : ''].filter(Boolean).join('; ')
    rows.push(['Family', p.isSelf ? 'Me' : 'Family member', p.name, p.notes, [p.born, p.died].filter(Boolean).join('–'), rel, ''])
  }
  for (const s of data.stories) rows.push(['Story', CHAPTERS.find((c) => c.id === s.id)?.title ?? s.title, s.title, s.body, '', s.approved ? 'Shared with family' : 'Draft', ''])
  for (const k of data.messages) rows.push(['Words to Keep', k.kind, k.source ?? '', k.text, '', k.occasions.join(', '), k.forWhom ?? ''])
  const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  return new File([csv], `Simple Forever Plan ${today()}.csv`, { type: 'text/csv' })
}

/**
 * Hands the file to the phone's share sheet so the person picks where it goes (Files, iCloud, Google Drive,
 * Dropbox, Mail…). Falls back to a regular download where sharing files isn't supported.
 */
/**
 * Opens the phone's save/share sheet for a file (Files, Google Drive, Voice Memos, email…).
 * Phones only open that sheet straight after a tap. If making the file took a while (a big backup), the tap has
 * "expired" and this returns 'needs-tap' — the caller then shows a button, and calls again with { afterTap: true }.
 */
export async function saveToApp(file: File, opts: { afterTap?: boolean } = {}): Promise<'shared' | 'downloaded' | 'cancelled' | 'needs-tap'> {
  // Inside a Claude preview, files can only be saved through the viewer's own save prompt.
  const claude = (window as any).claude
  if (claude?.use) {
    const downloads = await claude.use('downloads').catch(() => null)
    if (downloads) {
      try { await downloads.save({ filename: file.name, data: file }); return 'downloaded' }
      catch (e: any) { if (e?.code === 'declined') return 'cancelled'; throw new Error('Saving isn’t available here. Open the app at its web link instead.') }
    }
  }
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name })
      return 'shared'
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled'
      if (e?.name === 'NotAllowedError' && !opts.afterTap) return 'needs-tap'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

