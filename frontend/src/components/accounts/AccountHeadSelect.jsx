import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../lib/api'

/**
 * AccountHeadSelect - a collapsing, searchable, paginated single-select for
 * picking a ChartOfAccounts ledger ("Account Head") by its CODE.
 *
 * The dropdown panel is rendered in a PORTAL with fixed positioning so it is
 * never clipped by a modal/scroll container (overflow:auto/hidden). Search,
 * group filtering and pagination are all server-side via
 * GET /api/accounts/chart-of-accounts/options so it scales as the chart grows.
 *
 * Props:
 *   value        current account CODE (string)
 *   onChange     (code: string) => void - '' when cleared
 *   group        COA group to filter by (default 'Expenses')
 *   pageSize     results per page (default 8)
 *   placeholder  input placeholder when nothing selected
 *   disabled     disables the control
 *   allowClear   show a clear (×) button (default true)
 *   style        extra wrapper styles
 */
export default function AccountHeadSelect({
  value = '',
  onChange,
  group = 'Expenses',
  pageSize = 8,
  placeholder = 'Search account head…',
  disabled = false,
  allowClear = true,
  style = {}
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const [coords, setCoords] = useState(null)

  const wrapRef = useRef(null)
  const blurTimer = useRef(null)
  const reqId = useRef(0)

  // Resolve a human-readable label ("CODE - Name") for the current value. The
  // selected ledger may not be on the current page of results, so look it up
  // directly by code.
  useEffect(() => {
    let cancelled = false
    if (!value) { setSelectedLabel(''); return undefined }
    ;(async () => {
      try {
        const res = await api.get('/api/accounts/chart-of-accounts/options', {
          params: { search: value, group, page: 1, limit: 10 }
        })
        const list = Array.isArray(res.data) ? res.data : (res.data?.items || [])
        const match = list.find(a => String(a.code) === String(value))
        if (!cancelled) setSelectedLabel(match ? `${match.code} — ${match.name}` : value)
      } catch {
        if (!cancelled) setSelectedLabel(value)
      }
    })()
    return () => { cancelled = true }
  }, [value, group])

  const fetchOptions = useCallback(async (q, p) => {
    const myId = ++reqId.current
    setLoading(true)
    try {
      const res = await api.get('/api/accounts/chart-of-accounts/options', {
        params: { group, search: q || undefined, page: p, limit: pageSize }
      })
      if (myId !== reqId.current) return // a newer request superseded this one
      const data = res.data
      if (Array.isArray(data)) {
        setItems(data); setPages(1); setTotal(data.length)
      } else {
        setItems(data?.items || []); setPages(data?.pages || 1); setTotal(data?.total || 0)
      }
    } catch {
      if (myId === reqId.current) { setItems([]); setPages(1); setTotal(0) }
    } finally {
      if (myId === reqId.current) setLoading(false)
    }
  }, [group, pageSize])

  // Debounced fetch whenever the dropdown is open and the query/page changes.
  // Typing resets page to 1 (see the input onChange) so both updates batch into
  // a single fetch.
  useEffect(() => {
    if (!open) return undefined
    const t = setTimeout(() => fetchOptions(query, page), 200)
    return () => clearTimeout(t)
  }, [open, query, page, fetchOptions])

  // Keep the portalled dropdown anchored to the input as the page/modal scrolls.
  const updateCoords = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setCoords({ left: r.left, top: r.bottom + 4, width: r.width })
  }, [])

  useEffect(() => {
    if (!open) return undefined
    updateCoords()
    const onMove = () => updateCoords()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, updateCoords])

  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current) }, [])

  const commit = (acct) => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    onChange?.(acct.code)
    setSelectedLabel(`${acct.code} — ${acct.name}`)
    setOpen(false)
    setQuery('')
  }

  const clear = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    onChange?.('')
    setSelectedLabel('')
    setQuery('')
  }

  const inputStyle = {
    width: '100%', padding: '8px 28px 8px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--card)',
    color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
    cursor: disabled ? 'not-allowed' : 'text'
  }

  const dropdown = open && coords && createPortal(
    <div
      // Commit on mousedown keeps focus on the input (preventDefault), so the
      // input's blur-close never fires while interacting with the panel.
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'fixed', left: coords.left, top: coords.top, width: coords.width,
        zIndex: 9999, background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden'
      }}
    >
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12 }}>Searching…</div>
        )}
        {!loading && items.length === 0 && (
          <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12 }}>No matching accounts.</div>
        )}
        {!loading && items.map(acct => {
          const isSel = String(acct.code) === String(value)
          return (
            <div
              key={acct._id || acct.code}
              onMouseDown={(e) => { e.preventDefault(); commit(acct) }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                background: isSel ? 'rgba(99,102,241,0.12)' : 'transparent',
                borderBottom: '1px solid var(--border)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isSel ? 'rgba(99,102,241,0.12)' : 'transparent' }}
            >
              <div style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'monospace' }}>{acct.code}</div>
              <div style={{ color: 'var(--text)' }}>{acct.name}</div>
              {acct.subGroup && (
                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{acct.subGroup}</div>
              )}
            </div>
          )
        })}
      </div>
      {pages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', borderTop: '1px solid var(--border)', background: 'var(--bg)'
        }}>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1) }}
            disabled={page <= 1}
            style={{
              border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)',
              borderRadius: 6, padding: '4px 10px', fontSize: 12,
              cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1
            }}
          >‹ Prev</button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Page {page} / {pages} · {total} total
          </span>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); if (page < pages) setPage(page + 1) }}
            disabled={page >= pages}
            style={{
              border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)',
              borderRadius: 6, padding: '4px 10px', fontSize: 12,
              cursor: page >= pages ? 'not-allowed' : 'pointer', opacity: page >= pages ? 0.5 : 1
            }}
          >Next ›</button>
        </div>
      )}
    </div>,
    document.body
  )

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <input
        type="text"
        disabled={disabled}
        value={open ? query : selectedLabel}
        placeholder={selectedLabel || placeholder}
        onFocus={() => { if (!disabled) { setOpen(true); setQuery(''); setPage(1) } }}
        onChange={e => { setQuery(e.target.value); setPage(1) }}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
        style={inputStyle}
      />
      {allowClear && value && !disabled && (
        <button
          type="button"
          aria-label="Clear account head"
          onMouseDown={(e) => { e.preventDefault(); clear() }}
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            border: 'none', background: 'transparent', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2
          }}
        >×</button>
      )}
      {dropdown}
    </div>
  )
}
