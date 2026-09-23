import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

/**
 * Reusable user picker (search + role-chip filter + client-side pagination).
 *
 *   <UserPicker
 *     mode="multi" | "single"     Default 'multi'
 *     selectedIds={['…']}          For multi
 *     selectedId="…"               For single
 *     onChange={(ids|id) => …}
 *     roleKeys={['project_engineer']}    Roles to fetch (union)
 *     pageSize={15}
 *     disabled={bool}
 *     allowClear={bool}            Single mode only - show " - None - "
 *     showRoleChips={bool}         Optional filter chips when 2+ roles
 *   />
 *
 * The fetch is done once per `roleKeys` change. Filtering + paging is
 * client-side because /api/users/by-role returns the full set per role
 * and the company-scale here is small (tens to low hundreds of users).
 */

export default function UserPicker({
  mode = 'multi',
  selectedIds = [],
  selectedId = '',
  onChange,
  roleKeys = [],
  pageSize = 15,
  disabled = false,
  allowClear = true,
  showRoleChips = false,
  emptyText = 'No users match.'
}) {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [search, setSearch]     = useState('')
  const [debounced, setDeb]     = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [page, setPage]         = useState(1)

  const roleKey = roleKeys.join(',')

  /* Fetch the union of users across the requested roles. Each role is
   * a separate request; we de-dupe by user _id and tag each entry with
   * the role it came from for the optional chip filter. */
  const loadAll = useCallback(async () => {
    if (roleKeys.length === 0) {
      setItems([]); return
    }
    setLoading(true)
    setError('')
    try {
      const responses = await Promise.all(roleKeys.map(k =>
        api.get(`/api/users/by-role/${encodeURIComponent(k)}`)
          .then(r => ({ key: k, data: Array.isArray(r.data) ? r.data : [] }))
          .catch(() => ({ key: k, data: [] }))
      ))
      const seen = new Map()
      for (const r of responses) {
        for (const u of r.data) {
          const id = String(u._id)
          if (!seen.has(id)) {
            seen.set(id, { ...u, _roles: [r.key] })
          } else {
            seen.get(id)._roles.push(r.key)
          }
        }
      }
      setItems(Array.from(seen.values()))
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load users.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [roleKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll() }, [loadAll])

  /* Debounce search input */
  useEffect(() => {
    const id = setTimeout(() => setDeb(search.trim().toLowerCase()), 200)
    return () => clearTimeout(id)
  }, [search])

  /* Reset to page 1 when filters/search change */
  useEffect(() => { setPage(1) }, [debounced, roleFilter])

  const filtered = useMemo(() => {
    let out = items
    if (roleFilter !== 'all') {
      out = out.filter(u => (u._roles || []).includes(roleFilter))
    }
    if (debounced) {
      out = out.filter(u =>
        (u.name  || '').toLowerCase().includes(debounced) ||
        (u.email || '').toLowerCase().includes(debounced)
      )
    }
    return out
  }, [items, debounced, roleFilter])

  const total      = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

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
  const isSelected = (u) => mode === 'multi'
    ? selectedIds.map(String).includes(String(u._id))
    : String(selectedId || '') === String(u._id)

  const selectedDocs = useMemo(() => {
    const ids = mode === 'multi'
      ? selectedIds.map(String)
      : (selectedId ? [String(selectedId)] : [])
    return items.filter(u => ids.includes(String(u._id)))
  }, [items, selectedIds, selectedId, mode])

  return (
    <div style={{
      border: '1px solid var(--border, #cbd5e1)',
      borderRadius: 10,
      background: 'var(--card, #ffffff)',
      overflow: 'hidden',
      minHeight: 200
    }}>
      {/* Toolbar */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--input, #f8fafc)',
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {showRoleChips && roleKeys.length > 1 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[{ k: 'all', label: 'All' }, ...roleKeys.map(k => ({ k, label: k.replace(/_/g, ' ') }))].map(c => {
              const on = roleFilter === c.k
              return (
                <button
                  type="button"
                  key={c.k}
                  onClick={() => setRoleFilter(c.k)}
                  disabled={disabled}
                  style={{
                    padding: '3px 9px',
                    borderRadius: 999,
                    border: `1px solid ${on ? 'rgba(99,102,241,.55)' : 'var(--border)'}`,
                    background: on ? 'rgba(99,102,241,.15)' : 'transparent',
                    color: on ? 'var(--text)' : 'var(--text-muted)',
                    fontWeight: on ? 600 : 500,
                    fontSize: 10,
                    cursor: 'pointer',
                    textTransform: 'capitalize'
                  }}
                >{c.label}</button>
              )
            })}
          </div>
        )}
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={disabled}
          style={{
            flex: '1 1 200px',
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text)',
            fontSize: 13
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {(mode === 'multi' ? selectedIds.length : (selectedId ? 1 : 0))} selected · {total} match
        </span>
      </div>

      {/* Selected chips (multi) */}
      {mode === 'multi' && selectedDocs.length > 0 && (
        <div style={{
          padding: '6px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(99,102,241,.04)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6
        }}>
          {selectedDocs.map(u => (
            <span
              key={u._id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 4px 2px 10px',
                borderRadius: 999,
                background: 'rgba(99,102,241,.14)',
                border: '1px solid rgba(99,102,241,.40)',
                fontSize: 11,
                color: 'var(--text)'
              }}
            >
              {u.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggleMulti(u._id)}
                  title="Remove"
                  style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: 'none', background: 'rgba(0,0,0,.10)',
                    color: 'var(--text)', cursor: 'pointer',
                    fontSize: 11, lineHeight: '14px', padding: 0
                  }}
                >×</button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* List */}
      <div style={{ minHeight: 140, maxHeight: 280, overflowY: 'auto' }}>
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
        {error && !loading && <div style={{ padding: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
        {!loading && !error && pageItems.length === 0 && (
          <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
            {emptyText}
          </div>
        )}
        {!loading && !error && pageItems.map(u => {
          const on = isSelected(u)
          return (
            <label
              key={u._id}
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
                type={mode === 'multi' ? 'checkbox' : 'radio'}
                checked={on}
                onChange={() => mode === 'multi' ? toggleMulti(u._id) : pickSingle(u._id)}
                disabled={disabled}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  {u.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {u.email}
                  {u._roles && u._roles.length > 0 && roleKeys.length > 1 && (
                    <span style={{ marginLeft: 8 }}>
                      · {u._roles.map(r => r.replace(/_/g, ' ')).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </label>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
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
