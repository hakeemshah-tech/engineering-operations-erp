import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../lib/api'
import SyncResultModal from './SyncResultModal'

const IMPORT_URL = '/api/accounts/masters/import-tally-masters'
const SYNC_URL = '/api/accounts/masters/sync-guids'
const BULK_URL = '/api/accounts/masters/bulk-import-unlinked'

/**
 * Compact client-side searchable single-select. The dropdown is portalled with
 * fixed positioning so it's never clipped by a scrolling list container.
 */
function SearchableSelect({ value, onChange, options, placeholder = 'Search…', disabled }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [coords, setCoords] = useState(null)
  const wrapRef = useRef(null)
  const blurRef = useRef(null)
  const selected = options.find(o => o.value === value)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? options.filter(o => o.label.toLowerCase().includes(needle)) : options
    return list.slice(0, 50)
  }, [q, options])

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
    return () => { window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove) }
  }, [open, updateCoords])

  const dropdown = open && coords && createPortal(
    <div
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'fixed', left: coords.left, top: coords.top, width: coords.width, zIndex: 9999,
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)', maxHeight: 240, overflowY: 'auto'
      }}
    >
      {filtered.length === 0 && <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 12 }}>No matches</div>}
      {filtered.map(o => (
        <div
          key={o.value}
          onMouseDown={e => { e.preventDefault(); clearTimeout(blurRef.current); onChange(o.value); setOpen(false) }}
          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          {o.label}
        </div>
      ))}
    </div>,
    document.body
  )

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        disabled={disabled}
        value={open ? q : (selected?.label || '')}
        placeholder={selected?.label || placeholder}
        onFocus={() => { if (!disabled) { setOpen(true); setQ('') } }}
        onChange={e => setQ(e.target.value)}
        onBlur={() => { blurRef.current = setTimeout(() => setOpen(false), 150) }}
        style={{
          width: '100%', padding: '7px 26px 7px 10px', borderRadius: 8, fontSize: 13,
          border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)', boxSizing: 'border-box'
        }}
      />
      {value && !disabled && (
        <button
          type="button" aria-label="Clear"
          onMouseDown={e => { e.preventDefault(); onChange(null) }}
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15 }}
        >×</button>
      )}
      {dropdown}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 120, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)', fontFamily: 'monospace' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

/**
 * One row in the "Already Synced & Matched" tab. Shows the full identity of each
 * match: ERP code · name with its Group › Sub-Group, the Tally ledger it matched
 * with its Tally parent group, and the captured GUID + status.
 */
function MatchRow({ m, icon, iconColor, iconTitle, status, statusColor, bg, topBorder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderTop: topBorder ? '1px solid var(--border)' : 'none', fontSize: 13, background: bg || 'transparent' }}>
      <span style={{ color: iconColor || '#10b981', paddingTop: 1 }} title={iconTitle}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text)' }}><code style={{ color: 'var(--primary)' }}>{m.code}</code> · {m.erpName}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.group || '—'} › {m.subGroup || '—'}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text)' }}>→ {m.tallyName}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tally group: {m.parent || 'Primary'}</div>
      </div>
      <div style={{ width: 130, textAlign: 'right', paddingTop: 1 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }} title={m.tallyGuid}>{m.tallyGuid ? m.tallyGuid.slice(0, 8) + '…' : 'no GUID'}</div>
        <div style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>{status}</div>
      </div>
    </div>
  )
}

/**
 * Upload a client's existing Tally masters XML and reconcile it against our
 * Chart of Accounts. Auto-matches by name, lets the user manually link the rest,
 * and syncs the Tally GUIDs back so future exports update in place.
 */
export default function TallyReconciliationDashboard({ onSynced }) {
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('link')
  const [links, setLinks] = useState({}) // erpId -> { tallyGuid, tallyName }
  const [syncing, setSyncing] = useState(false)
  // Bulk import of orphaned Tally ledgers
  const [orphanSel, setOrphanSel] = useState(() => new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulking, setBulking] = useState(false)
  // Success/error result modal for Sync + Bulk Import
  const [syncModal, setSyncModal] = useState({ open: false, result: null })
  // Per-ERP-row "Advanced Overrides" - bypasses the category filter for that row.
  const [overrides, setOverrides] = useState(() => new Set())
  // Pre-flight warning before saving cross-category (override) mappings.
  const [warnModal, setWarnModal] = useState({ open: false })
  const fileInputRef = useRef(null)

  async function handleFile(file) {
    if (!file) return
    if (!/\.xml$/i.test(file.name)) { setError('Please choose a .xml file exported from Tally.'); return }
    setError(''); setLinks({}); setUploading(true); setFileName(file.name)
    setOrphanSel(new Set()); setBulkConfirm(false); setSyncModal({ open: false, result: null })
    setOverrides(new Set()); setWarnModal({ open: false })
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post(IMPORT_URL, fd)
      setData(res.data?.data || null)
      // Land the user on the tab that needs action.
      const d = res.data?.data
      setTab(d?.unmatchedErpRecords?.length ? 'link' : (d?.autoMatched?.length ? 'matched' : 'orphan'))
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to parse the uploaded file.')
      setData(null)
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  // Tally options for the manual-link dropdowns, excluding ones already picked
  // for another ERP row (each Tally ledger links to at most one ERP ledger).
  const usedGuids = useMemo(() => new Set(Object.values(links).map(l => l.tallyGuid)), [links])

  function toggleOverride(erpId) {
    setOverrides(prev => { const n = new Set(prev); n.has(erpId) ? n.delete(erpId) : n.add(erpId); return n })
  }

  // Options for one ERP row's Tally dropdown.
  //   Rule 0 (scope, ALWAYS): never a pure-accounting / out-of-scope ledger
  //     (Equity, Fixed Assets, Depreciation, …) - the accountant's domain.
  //   Rule 1 (type safety, ALWAYS): only real postable leaf ledgers - never a
  //     Tally group or primary root account (Profit & Loss A/c, Primary, …).
  //   Rule 2 (category): by default only Tally ledgers whose mapped primary group
  //     equals this ERP ledger's group. The row's Advanced-Overrides toggle
  //     bypasses Rule 2 (but never Rule 0 or 1). The current pick is always kept
  //     so it stays visible even if it wouldn't pass the filter.
  function optionsFor(erpId, erpGroup) {
    const mineGuid = links[erpId]?.tallyGuid
    const override = overrides.has(erpId)
    return (data?.unmatchedTallyRecords || [])
      .filter(t => {
        if (!t.tallyGuid) return false
        if (t.tallyGuid === mineGuid) return true          // always show current pick
        if (usedGuids.has(t.tallyGuid)) return false        // taken by another row
        if (t.outOfScope) return false                      // Rule 0: out of ERP scope
        if (t.postable === false) return false              // Rule 1: no groups/roots
        if (override) return true                           // Rule 2 bypass
        return t.mappedGroup === erpGroup                   // Rule 2: category match
      })
      .map(t => ({ value: t.tallyGuid, label: `${t.tallyName}  (Group: ${t.parent || 'Primary'})` }))
  }

  function setLink(erpId, tallyGuid) {
    if (!tallyGuid) { setLinks(prev => { const n = { ...prev }; delete n[erpId]; return n }) ; return }
    const t = (data?.unmatchedTallyRecords || []).find(x => x.tallyGuid === tallyGuid)
    setLinks(prev => ({ ...prev, [erpId]: { tallyGuid, tallyName: t?.tallyName || '', tallyParent: t?.parent || '', mappedGroup: t?.mappedGroup || 'Uncategorized' } }))
  }

  // A manual link is CROSS-CATEGORY when the Tally ledger's mapped primary group
  // differs from the ERP ledger's group ('Uncategorized' is allowed since we
  // can't classify it). These are only reachable via Advanced Overrides and are
  // allowed after the user confirms the pre-flight warning.
  function mismatchFor(r) {
    const link = links[r.erpId]
    if (!link || !link.mappedGroup || link.mappedGroup === 'Uncategorized') return null
    if (link.mappedGroup !== r.group) return { erpGroup: r.group, tallyGroup: link.mappedGroup }
    return null
  }
  const crossLinks = (data?.unmatchedErpRecords || [])
    .map(r => { const mm = mismatchFor(r); return mm ? { code: r.code, erpName: r.erpName, tallyName: links[r.erpId]?.tallyName, ...mm } : null })
    .filter(Boolean)

  const manualCount = Object.keys(links).length
  // Rule 1 also guards auto-matches: never sync one whose Tally target is a group/root.
  const autoToSync = (data?.autoMatched || []).filter(m => m.tallyGuid && m.postable !== false)

  function downloadCleaned() {
    const xml = data?.sanitizedXmlString
    if (!xml) return
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Cleaned_Tally_Masters.xml'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function buildMappings() {
    return [
      ...autoToSync.map(m => ({ erpId: m.erpId, tallyGuid: m.tallyGuid, tallyName: m.tallyName, tallyParent: m.parent })),
      ...Object.entries(links).map(([erpId, l]) => ({ erpId, tallyGuid: l.tallyGuid, tallyName: l.tallyName, tallyParent: l.tallyParent }))
    ].filter(m => m.tallyGuid)
  }

  // Entry point: if any cross-category (override) links are staged, show the
  // pre-flight warning first; otherwise sync straight away.
  function confirmSync() {
    if (buildMappings().length === 0) { setError('Nothing to sync — no matched or linked ledgers.'); return }
    if (crossLinks.length > 0) { setWarnModal({ open: true }); return }
    proceedSync()
  }

  async function proceedSync() {
    const mappings = buildMappings()
    if (mappings.length === 0) { setError('Nothing to sync — no matched or linked ledgers.'); return }
    setWarnModal({ open: false }); setSyncing(true); setError('')
    try {
      const res = await api.post(SYNC_URL, { mappings })
      setSyncModal({ open: true, result: { success: true, title: `Synced ${res.data?.summary?.totalProcessed ?? res.data?.updated ?? 0} ledger GUID(s)`, summary: res.data?.summary } })
      onSynced?.()
    } catch (err) {
      setSyncModal({ open: true, result: { success: false, error: err.response?.data?.message || 'Failed to sync mappings.', mismatches: err.response?.data?.mismatches } })
    } finally {
      setSyncing(false)
    }
  }

  // --- Bulk import of orphaned Tally ledgers -------------------------------
  // Importable = orphaned Tally ledgers that carry a GUID, aren't already being
  // manually linked, are real postable leaf ledgers (never a group / root
  // account), AND are in ERP scope (never a pure-accounting ledger like Capital
  // or Fixed Assets - those stay the accountant's to manage).
  const importableOrphans = useMemo(
    () => (data?.unmatchedTallyRecords || []).filter(t => t.tallyGuid && !usedGuids.has(t.tallyGuid) && t.postable !== false && !t.outOfScope),
    [data, usedGuids]
  )

  // Breakdown of the still-linkable Tally pool - used to explain WHY a row's
  // dropdown is empty instead of a bare "No matches".
  const tallyPool = useMemo(() => {
    const free = (data?.unmatchedTallyRecords || []).filter(t => t.tallyGuid && !usedGuids.has(t.tallyGuid))
    return {
      free: free.length,
      linkable: free.filter(t => t.postable !== false && !t.outOfScope).length,
      nonPostable: free.filter(t => t.postable === false).length,
      outOfScope: free.filter(t => t.outOfScope).length
    }
  }, [data, usedGuids])

  // Human explanation for an empty dropdown, given the current row's category and
  // its Advanced-Overrides state.
  function emptyOptionsReason(erpGroup, override) {
    if (tallyPool.free === 0) return 'No unlinked Tally ledgers remain to link.'
    if (tallyPool.linkable === 0) {
      if (tallyPool.outOfScope > 0 && tallyPool.nonPostable === 0) {
        return `The ${tallyPool.free} remaining Tally target(s) are pure-accounting ledgers (Equity, Fixed Assets, Depreciation, …) outside the ERP’s scope — left untouched for your accountant.`
      }
      if (tallyPool.nonPostable > 0 && tallyPool.outOfScope === 0) {
        return `The ${tallyPool.free} remaining Tally target(s) are groups / root accounts (e.g. Profit & Loss A/c). An ERP ledger can only link to a real Tally ledger — “Show all categories” can’t override that.`
      }
      return `The ${tallyPool.free} remaining Tally target(s) are out-of-scope or group/root accounts and can’t be linked.`
    }
    if (!override) return `No Tally ledger in the ${erpGroup} category. Tick “Show all categories” to link across categories (${tallyPool.linkable} available).`
    return 'No matching Tally ledger.'
  }
  // Keep the selection truthful: drop any GUID that's no longer importable
  // (e.g. it just got manually linked in the Needs Linking tab).
  useEffect(() => {
    setOrphanSel(prev => {
      const valid = new Set(importableOrphans.map(t => t.tallyGuid))
      const next = new Set([...prev].filter(g => valid.has(g)))
      return next.size === prev.size ? prev : next
    })
  }, [importableOrphans])
  const selectedCount = useMemo(
    () => importableOrphans.filter(t => orphanSel.has(t.tallyGuid)).length,
    [importableOrphans, orphanSel]
  )
  const allSelected = importableOrphans.length > 0 && importableOrphans.every(t => orphanSel.has(t.tallyGuid))

  function toggleOrphan(guid) {
    if (!guid) return
    setOrphanSel(prev => { const n = new Set(prev); n.has(guid) ? n.delete(guid) : n.add(guid); return n })
  }
  function toggleSelectAll() {
    setOrphanSel(prev => {
      if (importableOrphans.every(t => prev.has(t.tallyGuid))) return new Set()
      return new Set(importableOrphans.map(t => t.tallyGuid))
    })
  }

  async function doBulkImport() {
    const chosen = importableOrphans.filter(t => orphanSel.has(t.tallyGuid))
    if (chosen.length === 0) return
    setBulking(true); setError('')
    try {
      const res = await api.post(BULK_URL, {
        ledgers: chosen.map(t => ({ name: t.tallyName, guid: t.tallyGuid, parent: t.parent }))
      })
      const created = res.data?.created || []
      const createdGuids = new Set(created.map(c => c.tallyGuid))
      // Move the newly-created ledgers into the Auto-Matched tab.
      setData(prev => {
        if (!prev) return prev
        const newAuto = created.map(c => ({
          erpId: c.erpId, code: c.code, erpName: c.tallyLedgerName || c.name,
          tallyName: c.name, tallyGuid: c.tallyGuid, parent: c.subGroup || 'Primary',
          group: c.group, subGroup: c.subGroup,
          alreadyLinked: true, bulkImported: true
        }))
        const remainingTally = (prev.unmatchedTallyRecords || []).filter(t => !createdGuids.has(t.tallyGuid))
        return {
          ...prev,
          autoMatched: [...newAuto, ...(prev.autoMatched || [])],
          unmatchedTallyRecords: remainingTally,
          summary: {
            ...prev.summary,
            autoMatched: (prev.summary?.autoMatched || 0) + newAuto.length,
            unmatchedTally: remainingTally.length
          }
        }
      })
      setOrphanSel(new Set())
      setBulkConfirm(false)
      setTab('matched')
      onSynced?.()
      setSyncModal({ open: true, result: { success: true, title: `Imported ${created.length} new ERP ledger(s)`, summary: res.data?.summary } })
    } catch (err) {
      setBulkConfirm(false)
      setSyncModal({ open: true, result: { success: false, error: err.response?.data?.message || 'Bulk import failed.', mismatches: err.response?.data?.mismatches } })
    } finally {
      setBulking(false)
    }
  }

  const s = data?.summary
  const matchedTabCount = (s?.alreadySynced ?? 0) + (s?.autoMatched ?? 0)
  const tabs = [
    { key: 'matched', label: `🟢 Already Synced & Matched (${matchedTabCount})` },
    { key: 'link', label: `🟡 Needs Linking (${s?.unmatchedErp ?? 0})` },
    { key: 'orphan', label: `🔵 Orphaned in Tally (${s?.unmatchedTally ?? 0})` }
  ]

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <h3 style={{ margin: '0 0 4px', color: 'var(--text)' }}>🔀 Reconcile with Existing Tally</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13 }}>
        Upload your current Tally masters XML (<em>Gateway → Display → List of Accounts → Export</em>). We match it
        against the Chart of Accounts and capture Tally's GUIDs, so future exports update in place instead of duplicating.
      </p>

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
          background: dragOver ? 'rgba(99,102,241,0.06)' : 'var(--bg)',
          borderRadius: 10, padding: 24, textAlign: 'center', cursor: 'pointer', marginBottom: 16
        }}
      >
        <input
          ref={fileInputRef} type="file" accept=".xml,text/xml,application/xml"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; handleFile(f) }}
        />
        <div style={{ fontSize: 28, marginBottom: 6 }}>📥</div>
        <div style={{ color: 'var(--text)', fontWeight: 600 }}>
          {uploading ? 'Parsing…' : 'Drag & drop your Tally XML here, or click to browse'}
        </div>
        {fileName && !uploading && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>Loaded: {fileName}</div>}
      </div>

      {error && (
        <div style={{ background: '#ef444414', border: '1px solid #ef4444', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      {data && (
        <>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <Stat label="Tally ledgers" value={s.tallyTotal} />
            <Stat label="Already synced" value={s.alreadySynced ?? 0} color="#10b981" />
            <Stat label="Auto-matched" value={s.autoMatched} color="#10b981" />
            <Stat label="Needs linking" value={s.unmatchedErp} color="#f59e0b" />
            <Stat label="Orphaned in Tally" value={s.unmatchedTally} color="#3b82f6" />
            {(s.outOfScopeTally ?? 0) > 0 && <Stat label="Out of scope" value={s.outOfScopeTally} color="#9ca3af" />}
            {(s.subGroupsIngested ?? 0) > 0 && <Stat label="Sub-groups synced" value={s.subGroupsIngested} color="#a855f7" />}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {tabs.map(t => (
              <button
                key={t.key} type="button" onClick={() => setTab(t.key)}
                style={{
                  padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  border: `1px solid ${tab === t.key ? 'var(--primary)' : 'var(--border)'}`,
                  background: tab === t.key ? 'rgba(99,102,241,0.10)' : 'var(--card)',
                  color: tab === t.key ? 'var(--primary)' : 'var(--text)', fontWeight: tab === t.key ? 600 : 400
                }}
              >{t.label}</button>
            ))}
          </div>

          {/* Already Synced & Matched */}
          {tab === 'matched' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {((data.alreadySynced || []).length + (data.autoMatched || []).length) === 0 && (
                <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13 }}>Nothing matched yet.</div>
              )}
              {((data.alreadySynced || []).length + (data.autoMatched || []).length) > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  <span style={{ width: 14 }} />
                  <span style={{ flex: 1 }}>Our ERP Ledger</span>
                  <span style={{ flex: 1 }}>Matching Tally Ledger</span>
                  <span style={{ width: 130, textAlign: 'right' }}>GUID · Status</span>
                </div>
              )}
              <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                {/* Already synced (GUID present in our DB) - read-only */}
                {(data.alreadySynced || []).map((m, i) => (
                  <MatchRow key={'as-' + m.erpId} m={m} icon="🔒" iconTitle="Already synced"
                    status="already synced" statusColor="#10b981" bg="rgba(16,185,129,0.04)"
                    topBorder={i !== 0} />
                ))}
                {/* Name-matched, not yet synced - will sync on Confirm, UNLESS the
                    Tally target is a group / reserved-name (postable === false):
                    those are excluded from the sync and flagged so the row is honest. */}
                {(data.autoMatched || []).map((m, i) => {
                  const blocked = m.postable === false
                  return (
                    <MatchRow key={m.erpId} m={m}
                      icon={blocked ? '🚫' : '✓'}
                      iconColor={blocked ? '#ef4444' : '#10b981'}
                      iconTitle={blocked
                        ? 'Tally target is a group / reserved name — an ERP ledger can’t link to it, so this won’t sync. Rename the ERP ledger so it isn’t named after a Tally group.'
                        : 'Name-matched'}
                      status={m.bulkImported ? 'imported' : (blocked ? 'can’t sync · group name' : 'will sync')}
                      statusColor={blocked ? '#ef4444' : 'var(--text-muted)'}
                      topBorder={!(i === 0 && (data.alreadySynced || []).length === 0)} />
                  )
                })}
              </div>
            </div>
          )}

          {/* Needs Linking */}
          {tab === 'link' && (
            <div>
              {importableOrphans.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(59,130,246,0.06)', border: '1px solid #3b82f6', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 13, color: 'var(--text)' }}>
                  <span><strong>{importableOrphans.length}</strong> Tally ledger(s) have no ERP match. Instead of linking one-by-one, create them all as new ERP ledgers.</span>
                  <button type="button" onClick={() => setTab('orphan')} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: 'none', background: '#3b82f6', color: 'white', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>➕ Bulk import →</button>
                </div>
              )}
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {/* Persistent column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '10px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  <div>Our ERP Ledger</div>
                  <div>Matching Tally Ledger</div>
                </div>
                {(data.unmatchedErpRecords || []).length === 0 ? (
                  <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13 }}>Every ERP ledger matched — nothing to link. 🎉</div>
                ) : (
                  <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                    {(data.unmatchedErpRecords || []).map((r, i) => {
                      const mm = mismatchFor(r)
                      const override = overrides.has(r.erpId)
                      const opts = optionsFor(r.erpId, r.group)
                      return (
                        <div key={r.erpId} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start', padding: '10px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                          <div style={{ fontSize: 13, color: 'var(--text)', paddingTop: 6 }}>
                            <div><code style={{ color: 'var(--primary)' }}>{r.code}</code> · {r.erpName}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.group} › {r.subGroup}</div>
                          </div>
                          <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: override ? '#f59e0b' : 'var(--text-muted)', marginBottom: 4, cursor: 'pointer' }} title="Bypass the category filter to link across financial categories (advanced)">
                              <input type="checkbox" checked={override} onChange={() => toggleOverride(r.erpId)} />
                              Show all categories (Advanced Overrides)
                            </label>
                            <SearchableSelect
                              value={links[r.erpId]?.tallyGuid || null}
                              onChange={g => setLink(r.erpId, g)}
                              options={opts}
                              placeholder={override ? 'Link to any Tally ledger…' : `Link to a Tally ${r.group} ledger…`}
                            />
                            {opts.length === 0 && (
                              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                                ℹ️ {emptyOptionsReason(r.group, override)}
                              </div>
                            )}
                            {mm && (
                              <div style={{ color: '#f59e0b', fontSize: 11, marginTop: 4 }}>
                                ⚠️ Cross-category: ERP [{mm.erpGroup}] → Tally [{mm.tallyGroup}]. You'll be asked to confirm on save.
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Orphaned in Tally */}
          {tab === 'orphan' && (
            <div>
              {/* Bulk import controls */}
              {importableOrphans.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                    Select all importable ({importableOrphans.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setBulkConfirm(true)}
                    disabled={selectedCount === 0 || bulking}
                    style={{
                      marginLeft: 'auto', padding: '10px 16px', borderRadius: 8, border: 'none',
                      background: '#059669', color: 'white', fontWeight: 600, fontSize: 13,
                      cursor: (selectedCount === 0 || bulking) ? 'not-allowed' : 'pointer',
                      opacity: (selectedCount === 0 || bulking) ? 0.5 : 1
                    }}
                  >
                    ➕ Bulk Import Remaining Tally Ledgers into ERP ({selectedCount})
                  </button>
                </div>
              )}

              {/* Confirmation */}
              {bulkConfirm && (
                <div style={{ background: '#f59e0b14', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 14px', marginBottom: 10, fontSize: 13, color: 'var(--text)' }}>
                  <div style={{ marginBottom: 8 }}>
                    Are you sure you want to create <strong>{selectedCount}</strong> new ledger(s) in the ERP based on this Tally data?
                    Each keeps its Tally GUID, so it stays permanently synced.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="cancel-btn" style={{ padding: '6px 14px' }} onClick={() => setBulkConfirm(false)} disabled={bulking}>Cancel</button>
                    <button type="button" onClick={doBulkImport} disabled={bulking || selectedCount === 0} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#059669', color: 'white', fontWeight: 600, cursor: (bulking || selectedCount === 0) ? 'not-allowed' : 'pointer' }}>
                      {bulking ? 'Importing…' : `Yes, create ${selectedCount}`}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                  These exist in Tally but not in our ERP. Tick the ones to create as new ERP ledgers (with their GUIDs).
                  Ledgers tagged <span style={{ color: '#9ca3af', fontWeight: 600 }}>out of scope</span> are pure-accounting (Equity, Fixed Assets, …) and stay with your accountant — they can’t be imported.
                </div>
                {(data.unmatchedTallyRecords || []).length === 0 && <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 13 }}>None.</div>}
                <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                  {(data.unmatchedTallyRecords || []).map((t, i) => {
                    const nonPostable = t.postable === false
                    const outOfScope = t.outOfScope === true
                    const canImport = !!t.tallyGuid && !usedGuids.has(t.tallyGuid) && !nonPostable && !outOfScope
                    const blockTitle = outOfScope
                      ? 'Out of ERP scope — a pure-accounting ledger (Equity, Fixed Assets, …) managed by your accountant. Left untouched.'
                      : nonPostable
                        ? 'Tally group / root account — not a postable ledger, cannot import'
                        : (t.tallyGuid ? 'Already linked to an ERP ledger' : 'No GUID — cannot import')
                    return (
                      <div key={t.tallyGuid || t.tallyName + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: 13, opacity: outOfScope ? 0.7 : 1 }}>
                        <input
                          type="checkbox"
                          disabled={!canImport}
                          checked={t.tallyGuid ? orphanSel.has(t.tallyGuid) : false}
                          onChange={() => toggleOrphan(t.tallyGuid)}
                          title={canImport ? 'Create as a new ERP ledger' : blockTitle}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ color: 'var(--text)' }}>
                            {t.tallyName}
                            {outOfScope && (
                              <span style={{ fontSize: 10, color: '#9ca3af', border: '1px solid #9ca3af', borderRadius: 4, padding: '1px 5px', marginLeft: 6, verticalAlign: 'middle' }} title="Managed by your accountant — never synced">out of scope</span>
                            )}
                            {!outOfScope && nonPostable && (
                              <span style={{ fontSize: 10, color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: 4, padding: '1px 5px', marginLeft: 6, verticalAlign: 'middle' }}>group / root</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.parent || 'Primary'}</div>
                        </div>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }} title={t.tallyGuid}>{t.tallyGuid ? t.tallyGuid.slice(0, 8) + '…' : 'no GUID'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Will sync <strong style={{ color: 'var(--text)' }}>{autoToSync.length}</strong> auto-matched + <strong style={{ color: 'var(--text)' }}>{manualCount}</strong> manually linked GUID(s).
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button" onClick={downloadCleaned}
                disabled={!data.sanitizedXmlString}
                title="Download the sanitized copy of your uploaded Tally XML"
                style={{
                  padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--primary)', fontWeight: 600, fontSize: 13,
                  cursor: data.sanitizedXmlString ? 'pointer' : 'not-allowed', opacity: data.sanitizedXmlString ? 1 : 0.5
                }}
              >
                ⬇️ Download Cleaned XML
              </button>
              <button
                type="button" onClick={confirmSync}
                disabled={syncing || (autoToSync.length + manualCount === 0)}
                title="Save the matched + linked GUIDs"
                style={{
                  padding: '10px 18px', borderRadius: 8, border: 'none',
                  background: '#1F4788', color: 'white', fontWeight: 600, fontSize: 13,
                  cursor: (syncing || (autoToSync.length + manualCount === 0)) ? 'not-allowed' : 'pointer',
                  opacity: (syncing || (autoToSync.length + manualCount === 0)) ? 0.5 : 1
                }}
              >
                {syncing ? 'Syncing…' : '✓ Confirm & Sync Mappings'}
              </button>
            </div>
          </div>

          {crossLinks.length > 0 && (
            <p style={{ margin: '8px 0 0', color: '#f59e0b', fontSize: 12, textAlign: 'right' }}>
              {crossLinks.length} cross-category mapping(s) staged — you'll confirm before they save.
            </p>
          )}
        </>
      )}

      <SyncResultModal
        open={syncModal.open}
        result={syncModal.result}
        onClose={() => setSyncModal({ open: false, result: null })}
      />

      {/* Pre-flight warning for cross-category (Advanced Override) mappings */}
      {warnModal.open && createPortal(
        <div className="modal-overlay" onClick={() => setWarnModal({ open: false })}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(520px, 92vw)', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: 17, color: '#f59e0b' }}>⚠️ Accounting Mismatch Warning</h2>
              <button type="button" onClick={() => setWarnModal({ open: false })} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 18 }}>
              <p style={{ marginTop: 0, color: 'var(--text)', fontSize: 14, lineHeight: 1.5 }}>
                You are mapping account(s) to a Tally ledger in a <strong>different financial category</strong>.
                This will skew Trial Balance reports and may fail during voucher synchronization.
              </p>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', margin: '12px 0' }}>
                {crossLinks.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: 12, color: 'var(--text)' }}>
                    <span>ERP <strong style={{ color: '#3b82f6' }}>[{c.erpGroup}]</strong> <code style={{ color: 'var(--primary)' }}>{c.code}</code></span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span>Tally <strong style={{ color: '#ef4444' }}>[{c.tallyGroup}]</strong> {c.tallyName}</span>
                  </div>
                ))}
              </div>
              <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>Are you sure you want to proceed?</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="cancel-btn" onClick={() => setWarnModal({ open: false })} disabled={syncing} style={{ padding: '8px 16px' }}>Cancel</button>
                <button type="button" onClick={proceedSync} disabled={syncing}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer' }}>
                  {syncing ? 'Syncing…' : 'Proceed anyway'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
