/**
 * Google sign-in and Google Drive access.
 *
 * The app asks only for the `drive.file` permission: it can see and change the files it creates
 * (one "Simple Forever Plan" folder) and nothing else in the person's Drive.
 */

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''
export const driveConfigured = Boolean(GOOGLE_CLIENT_ID)
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const FOLDER_NAME = 'Simple Forever Plan'

declare global {
  interface Window { google?: any }
}

let gisLoading: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { gisLoading = null; reject(new Error('Could not reach Google. Check your connection and try again.')) }
    document.head.appendChild(s)
  })
  return gisLoading
}

let token: { value: string; expires: number } | null = null

/** Opens Google's sign-in and permission window. Must be called from a button tap. */
export async function connectGoogle(hint?: string): Promise<string> {
  if (!driveConfigured) throw new Error('Google Drive is not set up for this app yet.')
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      hint,
      callback: (r: any) => {
        if (r.error) return reject(new Error(r.error === 'access_denied' ? 'Google Drive access was not allowed.' : r.error_description || r.error))
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) {
          return reject(new Error('Please tick the box that lets Simple Forever Plan save files to your Google Drive.'))
        }
        token = { value: r.access_token, expires: Date.now() + (Number(r.expires_in) - 60) * 1000 }
        resolve(r.access_token)
      },
      error_callback: (e: any) => reject(new Error(e?.type === 'popup_closed' ? 'The Google window was closed before finishing.' : 'Could not open Google sign-in. Allow pop-ups and try again.')),
    })
    client.requestAccessToken({ prompt: '' })
  })
}

export const hasValidToken = () => Boolean(token && token.expires > Date.now())

/** Called when the hour-long Google session runs out; the app shows a "Reconnect" button. */
let onExpired: (() => void) | null = null
export const setOnExpired = (fn: (() => void) | null) => { onExpired = fn }

export async function disconnectGoogle() {
  const t = token?.value
  token = null
  if (t && window.google?.accounts?.oauth2) await new Promise<void>((r) => window.google.accounts.oauth2.revoke(t, () => r()))
}

/** Authorized request to the Drive API. */
export async function gfetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!hasValidToken()) {
    onExpired?.()
    throw new Error('Your Google Drive connection timed out. Tap Reconnect to keep going.')
  }
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token!.value}` } })
  if (res.status === 401) {
    token = null
    onExpired?.()
    throw new Error('Your Google Drive connection timed out. Tap Reconnect to keep going.')
  }
  if (!res.ok) throw new Error(`Google Drive error (${res.status}). Please try again.`)
  return res
}
