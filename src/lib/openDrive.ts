import { openDrive, rememberDriveSession, type Access } from './auth'
import { connectGoogle } from './google'
import { moveLocalToDrive } from './migrate'

/**
 * Runs after the person agrees and taps "Connect Google Drive":
 * signs in with Google, opens (or creates) their plan folder, moves anything already saved on
 * this device into it, and records when they agreed.
 */
export async function connectAndOpenDrive(name?: string, onProgress?: (t: string) => void): Promise<Access> {
  await connectGoogle()
  onProgress?.('Opening your Google Drive folder…')
  const { store } = await openDrive(rememberDriveSession(name || 'Me'))
  const existing = (await store.list('settings'))[0]
  await moveLocalToDrive(store, onProgress)
  const storytellerName = existing?.storytellerName || name || 'Me'
  await store.put('settings', {
    ...(existing ?? { voice: 'first' as const }),
    id: 'settings',
    storytellerName,
    driveConsentAt: new Date().toISOString(),
  })
  return { session: rememberDriveSession(storytellerName), store }
}
