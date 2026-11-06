import type { Store } from './store'
import { MED_LABELS } from './medicalLabels'
import { CHAPTERS } from './questions'
import type { CollectionMap, CollectionName, ID } from './types'

type Data = { [K in CollectionName]: CollectionMap[K][] }
const COLLECTIONS: CollectionName[] = ['answers', 'stories', 'people', 'relations', 'medical', 'messages', 'members', 'asks', 'insights', 'settings']
const today = () => new Date().toISOString().slice(0, 10)

const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(r.result as string)
  r.onerror = () => rej(r.error)
  r.readAsDataURL(b)
})

/**
 * One file holding the whole plan — stories, medical notes, family tree, messages, and every
 * recording and photo — so it can be kept in any app: Files, iCloud, Google Drive, Dropbox, email.
 */
export async function makeBackup(store: Store, data: Data, includeMedia: boolean, onProgress?: (t: string) => void): Promise<File> {
  const media: Record<ID, string> = {}
  if (includeMedia) {
    const ids = new Set<ID>([
      ...data.answers.flatMap((a) => a.mediaIds), ...data.medical.flatMap((m) => m.mediaIds),
      ...data.messages.flatMap((m) => m.mediaIds), ...data.people.map((p) => p.photoId).filter(Boolean) as ID[],
    ])
    let n = 0
    for (const id of ids) {
      onProgress?.(`Adding recordings and photos… ${++n} of ${ids.size}`)
      const url = await store.mediaUrl(id)
      if (url) media[id] = await toDataUrl(await (await fetch(url)).blob())
    }
  }
  const body = JSON.stringify({ app: 'simple-forever-plan', version: 1, exportedAt: new Date().toISOString(), data, media })
  return new File([body], `Simple Forever Plan backup ${today()}.json`, { type: 'application/json' })
}

/** Restores a backup file into the current plan. Items with the same id are replaced. */
export async function restoreBackup(file: File, store: Store, onProgress?: (t: string) => void): Promise<number> {
  const parsed = JSON.parse(await file.text())
  if (parsed?.app !== 'simple-forever-plan' || !parsed.data) throw new Error('This file is not a Simple Forever Plan backup.')
  const renamed = new Map<ID, ID>()
  const entries = Object.entries(parsed.media ?? {}) as [ID, string][]
  let n = 0
  for (const [id, url] of entries) {
    onProgress?.(`Restoring recordings and photos… ${++n} of ${entries.length}`)
    const blob = await (await fetch(url)).blob()
    renamed.set(id, await store.putMedia(blob, parsed.data.medical?.some((m: any) => m.mediaIds?.includes(id)) ? 'medical' : undefined))
  }
  const fix = (ids: ID[] = []) => ids.map((i) => renamed.get(i)).filter(Boolean) as ID[]
  let count = 0
  for (const c of COLLECTIONS) {
    const items = (parsed.data[c] ?? []).map((it: any) => {
      const copy = { ...it }
      if (Array.isArray(copy.mediaIds)) copy.mediaIds = fix(copy.mediaIds)
      if (copy.photoId) copy.photoId = renamed.get(copy.photoId)
      return copy
    })
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
export async function saveToApp(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name })
      return 'shared'
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled'
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

