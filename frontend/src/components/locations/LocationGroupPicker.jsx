import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'

/**
 * Single-select Location Group picker with search + client-side pagination.
 *
 *   <LocationGroupPicker
 *     selectedId="…"
 *     onChange={(id|null) => …}
 *     pageSize={10}
 *     disabled={bool}
 *     allowClear={true}
 *   />
 */
export default function LocationGroupPicker({
  selectedId = '',
  onChange,
  pageSize = 10,
  disabled = false,
  allowClear = true,
  emptyText = 'No location groups defined yet.'
}) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')
  const [debounced, setDeb]   = useState('')
  const [page, setPage]       = useState(1)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await api.get('/api/location-groups', { params: { status: 'active' } })
      setItems(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load groups.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const id = setTimeout(() => setDeb(search.trim().toLowerCase()), 200)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => { setPage(1) }, [debounced])

  const filtered = useMemo(() => {
    if (!debounced) return items
    return items.filter(g =>
      (g.name || '').toLowerCase().includes(debounced) ||
      (g.description || '').toLowerCase().includes(debounced)
    )
  }, [items, debounced])

  const total      = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const selectedDoc = items.find(g => String(g._id) === String(selectedId))

  return (
    <div style={{
      border: '1px solid var(--border, #cbd5e1)',
      borderRadius: 10,
      background: 'var(--card, #ffffff)',
      overflow: 'hidden',
      minHeight: 180
    }}>
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--input, #f8fafc)',
        display: 'flex',
        gap: 8,
        alignItems: 'center'
      }}>
        <input
          type="text"
          placeholder="Search by group name or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={disabled}
          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total} match</span>
      </div>

      {selectedDoc && (
        <div style={{ padding: '6px 10px', background: 'rgba(99,102,241,.06)', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          ✓ <strong>{selectedDoc.name}</strong>
          <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>
            · {(selectedDoc.locationIds || []).length} location{(selectedDoc.locationIds || []).length === 1 ? '' : 's'}
          </span>
        </div>
      )}

      <div style={{ minHeight: 120, maxHeight: 240, overflowY: 'auto' }}>
        {allowClear && (
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderBottom: '1px solid var(--border)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            background: !selectedId ? 'rgba(99,102,241,.08)' : 'transparent'
          }}>
            <input
              type="radio"
              checked={!selectedId}
              onChange={() => onChange && onChange(null)}
              disabled={disabled}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
              — None —
            </span>
          </label>
        )}
        {loading && <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>}
        {error && !loading && <div style={{ padding: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
        {!loading && !error && pageItems.length === 0 && (
          <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>{emptyText}</div>
        )}
        {!loading && !error && pageItems.map(g => {
          const on = String(selectedId) === String(g._id)
          return (
            <label
              key={g._id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 12px',
                borderBottom: '1px solid var(--border)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: on ? 'rgba(99,102,241,.08)' : 'transparent'
              }}
            >
              <input
                type="radio"
                checked={on}
                onChange={() => onChange && onChange(String(g._id))}
                disabled={disabled}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {(g.locationIds || []).length} location{(g.locationIds || []).length === 1 ? '' : 's'}
                  {g.type && <> · {g.type}</>}
                  {g.description && <> · {g.description}</>}
                </div>
              </div>
            </label>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--input, #f8fafc)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
          <span>Page {safePage} of {totalPages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} style={pageBtn(safePage <= 1)}>‹ Prev</button>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} style={pageBtn(safePage >= totalPages)}>Next ›</button>
          </div>
        </div>
      )}
    </div>
  )
}

function pageBtn(disabled) {
  return {
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: disabled ? 'transparent' : 'var(--card)',
    color: disabled ? 'var(--text-muted)' : 'var(--text)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11
  }
}
