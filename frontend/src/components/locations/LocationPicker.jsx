import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'

/**
 * Reusable paginated, searchable, filterable location picker.
 *
 *   <LocationPicker
 *     mode="multi" | "single"      Default 'multi'
 *     selectedIds={['…']}           For multi
 *     selectedId="…"                For single
 *     onChange={(ids|id) => …}      Multi → array; single → string|null
 *     typeFilter="mixed"            Restrict catalog: 'mixed'|'office'|'site'|'remote'|'all'
 *     statusFilter="active"         Default 'active' - hides inactive
 *     pageSize={20}
 *     disabled={bool}
 *     allowClear={bool}             Single mode only - show " - None - " row
 *   />
 *
 * Server side: relies on GET /api/locations?page=&limit=&q=&type=&status=
 * paginated response shape, and GET /api/locations?ids=… for selected
 * rows that might not be on the current page.
 */

const TYPE_CHIPS = [
  { value: 'all',    label: 'All' },
  { value: 'office', label: '🏢 Office' },
  { value: 'site',   label: '📍 Site' },
  { value: 'remote', label: '🌐 Remote' },
  { value: 'other',  label: '· Other' }
]

export default function LocationPicker({
  mode = 'multi',
  selectedIds = [],
  selectedId = '',
  onChange,
  typeFilter = 'mixed',
  statusFilter = 'active',
  pageSize = 20,
  disabled = false,
  allowClear = true,
  emptyText = 'No locations match the current filters.'
}) {
  // Internal type filter - initialised from prop, but user can change
  // unless `typeFilter` forces a specific type.
  const typeForced = typeFilter !== 'mixed' && typeFilter !== 'all'
  const [activeType, setActiveType] = useState(() => typeForced ? typeFilter : 'all')

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Selected docs - fetched separately so chips show even when the
  // selection isn't on the current page.
  const selKey = mode === 'multi' ? selectedIds.join(',') : (selectedId || '')
  const [selectedDocs, setSelectedDocs] = useState([])
  const lastSelKeyRef = useRef('')

  /* Debounce search input */
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(id)
  }, [search])

  /* Re-fetch on filter/search/page change */
  const fetchPage = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: pageSize }
      if (activeType !== 'all') params.type = activeType
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter
      if (debounced) params.q = debounced
      const res = await api.get('/api/locations', { params })
      const body = res.data
      if (Array.isArray(body)) {
        // Backwards-compat - server returned full list when pagination
        // params weren't honored. Slice client-side.
        const total = body.length
        const start = (page - 1) * pageSize
        setData({
          items: body.slice(start, start + pageSize),
          total,
          pages: Math.max(1, Math.ceil(total / pageSize))
        })
      } else {
        setData({
          items: body.items || [],
          total: body.total || 0,
          pages: body.pages || 1
        })
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load locations.')
      setData({ items: [], total: 0, pages: 1 })
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, activeType, statusFilter, debounced])

  useEffect(() => { fetchPage() }, [fetchPage])

  /* Reset to page 1 whenever filters/search change */
  useEffect(() => { setPage(1) }, [activeType, debounced, statusFilter])

  /* Fetch the selected docs (by id) so chips can render names + meta */
  useEffect(() => {
    if (selKey === lastSelKeyRef.current) return
    lastSelKeyRef.current = selKey
    const ids = mode === 'multi'
      ? selectedIds.filter(Boolean)
      : (selectedId ? [selectedId] : [])
    if (ids.length === 0) {
      setSelectedDocs([])
      return
    }
    api.get('/api/locations', { params: { ids: ids.join(',') } })
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : (res.data?.items || [])
        setSelectedDocs(list)
      })
      .catch(() => setSelectedDocs([]))
  }, [selKey, mode, selectedIds, selectedId])

  /* Helpers */
  const toggleMulti = (id) => {
    if (disabled) return
    const idStr = String(id)
    const isOn = selectedIds.map(String).includes(idStr)
    const next = isOn
      ? selectedIds.filter(x => String(x) !== idStr)
      : [...selectedIds, idStr]
    onChange && onChange(next)
  }

  const pickSingle = (id) => {
    if (disabled) return
    onChange && onChange(id ? String(id) : null)
  }

  const isSelected = (loc) => mode === 'multi'
    ? selectedIds.map(String).includes(String(loc._id))
    : String(selectedId || '') === String(loc._id)

  const selectedCount = mode === 'multi' ? selectedIds.length : (selectedId ? 1 : 0)

  return (
    <div style={{
      border: '1px solid var(--border, #cbd5e1)',
      borderRadius: 10,
      background: 'var(--card, #ffffff)',
      overflow: 'hidden',
      // Keep the picker tall enough that the list area is visible even
      // when there are no results yet - prevents the "collapsed" look in
      // forms whose surrounding CSS strips theme variables.
      minHeight: 220
    }}>
      {/* ===== Toolbar: type chips + search ===== */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--input, #f8fafc)',
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {!typeForced && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TYPE_CHIPS.map(c => {
              const on = activeType === c.value
              return (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setActiveType(c.value)}
                  disabled={disabled}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: `1px solid ${on ? 'rgba(99,102,241,.55)' : 'var(--border)'}`,
                    background: on ? 'rgba(99,102,241,.15)' : 'transparent',
                    color: on ? 'var(--text)' : 'var(--text-muted)',
                    fontWeight: on ? 600 : 500,
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >{c.label}</button>
              )
            })}
          </div>
        )}
        <input
          type="text"
          placeholder="Search by name or address…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={disabled}
          style={{
            flex: '1 1 220px',
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text)',
            fontSize: 13
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {selectedCount} selected · {data.total} total
        </span>
      </div>

      {/* ===== Selected chips (multi mode) ===== */}
      {mode === 'multi' && selectedDocs.length > 0 && (
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(99,102,241,.04)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6
        }}>
          {selectedDocs.map(loc => (
            <span
              key={loc._id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 4px 3px 10px',
                borderRadius: 999,
                background: 'rgba(99,102,241,.14)',
                border: '1px solid rgba(99,102,241,.40)',
                fontSize: 12,
                color: 'var(--text)'
              }}
            >
              {loc.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggleMulti(loc._id)}
                  title="Remove"
                  style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: 'none', background: 'rgba(0,0,0,.10)',
                    color: 'var(--text)', cursor: 'pointer',
                    fontSize: 12, lineHeight: '16px', padding: 0
                  }}
                >×</button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* ===== List ===== */}
      <div style={{
        minHeight: 160,
        maxHeight: 320,
        overflowY: 'auto'
      }}>
        {mode === 'single' && allowClear && (
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
              onChange={() => pickSingle(null)}
              disabled={disabled}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
              — None —
            </span>
          </label>
        )}
        {loading && <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>}
        {error && !loading && (
          <div style={{ padding: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>
        )}
        {!loading && !error && data.items.length === 0 && (
          <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
            {emptyText}
          </div>
        )}
        {!loading && !error && data.items.map(loc => {
          const on = isSelected(loc)
          return (
            <label
              key={loc._id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: on ? 'rgba(99,102,241,.08)' : 'transparent'
              }}
            >
              <input
                type={mode === 'multi' ? 'checkbox' : 'radio'}
                checked={on}
                onChange={() => mode === 'multi' ? toggleMulti(loc._id) : pickSingle(loc._id)}
                disabled={disabled}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  {loc.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {loc.type}
                  {loc.noGeofence ? ' · no geofence' : (loc.geofenceRadiusMeters ? ` · ${loc.geofenceRadiusMeters}m` : '')}
                  {loc.address ? ` · ${loc.address}` : ''}
                </div>
              </div>
              {loc.status && loc.status !== 'active' && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 999,
                  background: 'rgba(148,163,184,.20)',
                  color: 'var(--text-muted)'
                }}>{loc.status}</span>
              )}
            </label>
          )
        })}
      </div>

      {/* ===== Pagination ===== */}
      {data.pages > 1 && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          background: 'var(--input, #f8fafc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: 12,
          color: 'var(--text-muted)'
        }}>
          <span>Page {page} of {data.pages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              style={btnStyle(page <= 1 || loading)}
            >‹ Prev</button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(data.pages, p + 1))}
              disabled={page >= data.pages || loading}
              style={btnStyle(page >= data.pages || loading)}
            >Next ›</button>
          </div>
        </div>
      )}
    </div>
  )
}

function btnStyle(isDisabled) {
  return {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: isDisabled ? 'transparent' : 'var(--card)',
    color: isDisabled ? 'var(--text-muted)' : 'var(--text)',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    fontSize: 12
  }
}
