import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Access } from './auth'
import type { CollectionMap, CollectionName, ID, Settings } from './types'

type Data = { [K in CollectionName]: CollectionMap[K][] }
const empty: Data = { answers: [], stories: [], people: [], relations: [], medical: [], messages: [], members: [], asks: [], settings: [] }

interface Ctx extends Access {
  data: Data
  loading: boolean
  loadError: string
  isOwner: boolean
  settings: Settings
  save<K extends CollectionName>(c: K, item: CollectionMap[K]): Promise<void>
  remove(c: CollectionName, id: ID): Promise<void>
}

const DataContext = createContext<Ctx | null>(null)

export function DataProvider({ access, children }: { access: Access; children: ReactNode }) {
  const [data, setData] = useState<Data>(empty)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const { store, session } = access

  useEffect(() => {
    let alive = true
    const names = Object.keys(empty) as CollectionName[]
    // Family members only see medical notes if the storyteller allowed it (the server enforces this too).
    const visible = names.filter((n) => (n === 'members' || n === 'asks' ? session.role === 'owner' : n !== 'medical' || session.canViewMedical))
    Promise.all(visible.map(async (n) => [n, await store.list(n)] as const))
      .then((pairs) => alive && setData({ ...empty, ...Object.fromEntries(pairs) }))
      .catch((e) => alive && setLoadError(e?.message ?? 'Could not load your plan.'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [store, session])

  const save = useCallback(async <K extends CollectionName>(c: K, item: CollectionMap[K]) => {
    await store.put(c, item)
    setData((d) => ({ ...d, [c]: [...(d[c] as any[]).filter((x) => x.id !== (item as any).id), item] }))
  }, [store])

  const remove = useCallback(async (c: CollectionName, id: ID) => {
    await store.remove(c, id)
    setData((d) => ({ ...d, [c]: (d[c] as any[]).filter((x) => x.id !== id) }))
  }, [store])

  const settings: Settings = data.settings[0] ?? { id: 'settings', storytellerName: session.role === 'owner' ? session.name : '', voice: 'first' }

  // Save the storyteller's name once so family members see whose plan they are opening.
  useEffect(() => {
    if (!loading && !loadError && session.role === 'owner' && !data.settings.length) save('settings', settings).catch(() => null)
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DataContext.Provider value={{ ...access, data, loading, loadError, isOwner: session.role === 'owner', settings, save, remove }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const c = useContext(DataContext)
  if (!c) throw new Error('useData outside DataProvider')
  return c
}
