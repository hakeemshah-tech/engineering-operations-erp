import { useState } from 'react'
import { api } from '../../../lib/api'

/**
 * Shared "Download to Tally" action button. Handles:
 *   - Fetching the XML as a blob
 *   - Triggering a browser download with a sensible filename
 *   - Error extraction from blob responses
 *
 * Props:
 *   journalEntryId  (string, required)
 *   fileName        (string, optional - overrides the server-suggested filename)
 *   label           (string, default "Download XML")
 *   variant         ('primary' | 'ghost', default 'primary')
 *   disabled        (boolean)
 *   onDownloaded    (fn - called on success)
 *   onError         (fn(message) - called on error)
 */
export default function DownloadToTallyButton({
  journalEntryId,
  fileName,
  label = 'Download XML',
  variant = 'primary',
  disabled = false,
  onDownloaded,
  onError
}) {
  const [busy, setBusy] = useState(false)

  async function go() {
    if (!journalEntryId) return
    setBusy(true)
    try {
      const res = await api.get(`/api/accounts/tally/${journalEntryId}/xml`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }))
      const a = document.createElement('a')
      a.href = url

      let suggested = fileName
      if (!suggested) {
        const cd = res.headers?.['content-disposition'] || ''
        const m = cd.match(/filename="?([^"]+)"?/i)
        suggested = m ? m[1] : `Voucher-${journalEntryId}.xml`
      }
      a.download = suggested
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      onDownloaded && onDownloaded()
    } catch (err) {
      let msg = 'Failed to download XML'
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text()
        try { msg = JSON.parse(text).message || msg } catch { msg = text.slice(0, 200) }
      } else {
        msg = err.response?.data?.message || msg
      }
      onError ? onError(msg) : console.error('DownloadToTallyButton:', msg)
    } finally {
      setBusy(false)
    }
  }

  const baseStyle = {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    fontWeight: 600,
    fontSize: 13,
    cursor: busy || disabled ? 'not-allowed' : 'pointer',
    opacity: busy || disabled ? 0.6 : 1
  }
  const style = variant === 'primary'
    ? { ...baseStyle, background: '#10b981', color: 'white' }
    : { ...baseStyle, background: 'transparent', color: 'var(--primary)', border: '1px solid var(--border)' }

  return (
    <button type="button" style={style} onClick={go} disabled={busy || disabled}>
      {busy ? 'Generating...' : `⬇ ${label}`}
    </button>
  )
}
