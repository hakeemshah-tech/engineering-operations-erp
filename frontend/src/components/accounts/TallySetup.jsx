import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import TallyExportSummaryModal from './TallyExportSummaryModal'
import TallyReconciliationDashboard from './TallyReconciliationDashboard'

function SetupCard({ title, subtitle, count, accent, color, icon, alterHint, onDownload, onSummary, disabled, busy, step }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div style={{ background: accent, color, width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', fontWeight: 700 }}>{step}</div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, color: 'var(--text)' }}>{title}</h3>
          <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>{subtitle}</p>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
          {count === undefined ? '—' : count}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {onSummary ? (
          // Chart of Accounts routes through the pre-flight summary modal.
          <button
            onClick={onSummary}
            disabled={disabled || count === 0}
            style={{
              padding: '10px 16px', borderRadius: 8, border: 'none',
              background: '#1F4788', color: 'white', fontWeight: 600, fontSize: 13,
              cursor: (disabled || count === 0) ? 'not-allowed' : 'pointer',
              opacity: (disabled || count === 0) ? 0.5 : 1
            }}
          >
            📤 Export to Tally
          </button>
        ) : (
          <>
            <button
              onClick={() => onDownload(false)}
              disabled={disabled || busy || count === 0}
              style={{
                padding: '10px 16px', borderRadius: 8, border: 'none',
                background: '#1F4788', color: 'white', fontWeight: 600, fontSize: 13,
                cursor: (disabled || busy || count === 0) ? 'not-allowed' : 'pointer',
                opacity: (disabled || busy || count === 0) ? 0.5 : 1
              }}
            >
              {busy === 'create' ? 'Generating...' : `⬇ Download (Create)`}
            </button>
            <button
              onClick={() => onDownload(true)}
              disabled={disabled || busy || count === 0}
              style={{
                padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--primary)', fontWeight: 600, fontSize: 13,
                cursor: (disabled || busy || count === 0) ? 'not-allowed' : 'pointer',
                opacity: (disabled || busy || count === 0) ? 0.5 : 1
              }}
            >
              {busy === 'alter' ? 'Generating...' : `⬇ Download (Alter mode)`}
            </button>
          </>
        )}
      </div>
      {alterHint && (
        <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
          {alterHint}
        </p>
      )}
    </div>
  )
}

export default function TallySetup() {
  const [counts, setCounts] = useState({ coa: undefined, suppliers: undefined, customers: undefined, coaPendingRenames: 0 })
  const [busy, setBusy] = useState({ coa: null, suppliers: null, customers: null })
  const [ackBusy, setAckBusy] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showReconcile, setShowReconcile] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  useEffect(() => { loadCounts() }, [])

  async function loadCounts() {
    try {
      const res = await api.get('/api/accounts/masters/counts')
      setCounts(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  async function download(kind, alter) {
    const paths = {
      coa: '/api/accounts/masters/chart-of-accounts-xml',
      suppliers: '/api/accounts/masters/suppliers-xml',
      customers: '/api/accounts/masters/customers-xml'
    }
    const prefix = { coa: 'CoA', suppliers: 'Suppliers', customers: 'Customers' }[kind]

    try {
      setBusy(b => ({ ...b, [kind]: alter ? 'alter' : 'create' }))
      const res = await api.get(`${paths[kind]}${alter ? '?alter=true' : ''}`, { responseType: 'blob' })
      const disposition = res.headers?.['content-disposition'] || ''
      const m = disposition.match(/filename="?([^"]+)"?/i)
      const fileName = m ? m[1] : `Tally-${prefix}-Masters.xml`
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }))
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      const n = res.headers?.['x-ledger-count'] || '?'
      const renamed = parseInt(res.headers?.['x-renamed-count'] || '0', 10)
      let msg = `${n} ${prefix} ledger(s) exported. Import this file in Tally via Gateway → Import → Masters.`
      if (kind === 'coa' && renamed > 0) {
        msg += ` This file renames ${renamed} existing master(s). After the import succeeds in Tally, click "Mark renames as applied" so they are not re-sent (which would create duplicates).`
      }
      setNotify({ open: true, title: 'Downloaded', message: msg })
      loadCounts()
    } catch (err) {
      let msg = 'Failed'
      if (err.response?.data instanceof Blob) {
        const t = await err.response.data.text()
        try { msg = JSON.parse(t).message || msg } catch { msg = t.slice(0, 200) }
      } else {
        msg = err.response?.data?.message || msg
      }
      setNotify({ open: true, title: 'Error', message: msg })
    } finally {
      setBusy(b => ({ ...b, [kind]: null }))
    }
  }

  async function ackRenames() {
    try {
      setAckBusy(true)
      const res = await api.post('/api/accounts/masters/chart-of-accounts-renames-ack')
      setNotify({ open: true, title: 'Done', message: `Cleared ${res.data?.cleared ?? 0} rename marker(s). Future exports will use the new names as normal updates.` })
      loadCounts()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to clear rename markers.' })
    } finally {
      setAckBusy(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: 'var(--text)' }}>Tally Setup — One-Time Master Export</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
          Before you can import any Purchase or Sales vouchers, the client's Tally company needs matching ledgers.
          Download each file below and import into Tally once (in the order shown).
        </p>
      </div>

      <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid #3b82f6', borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <strong style={{ color: '#3b82f6' }}>ℹ How to import in Tally</strong>
        <ol style={{ margin: '8px 0 0 20px', color: 'var(--text)', fontSize: 13, lineHeight: 1.8 }}>
          <li>Open the target Tally company.</li>
          <li>Go to <strong>Gateway of Tally → Import Data → Masters</strong>.</li>
          <li>Browse to the downloaded XML file and confirm.</li>
          <li>Use <strong>Create</strong> mode on first import, <strong>Alter</strong> mode if you need to re-sync names/details later.</li>
        </ol>
      </div>

      {/* Step 0 - reconcile against an existing Tally company before exporting */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowReconcile(v => !v)}
          style={{
            width: '100%', textAlign: 'left', padding: '12px 16px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)',
            fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>{showReconcile ? '▼' : '▶'}</span>
          🔀 Step 0 — Reconcile with an existing Tally company
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>
            recommended before your first export
          </span>
        </button>
        {showReconcile && (
          <div style={{ marginTop: 12 }}>
            <TallyReconciliationDashboard onSynced={loadCounts} />
          </div>
        )}
      </div>

      <SetupCard
        step="1"
        title="Chart of Accounts"
        subtitle="Creates all 32 system ledgers (Trade Debtors, Input VAT 5%, Direct Labour, etc.)"
        count={counts.coa}
        accent="rgba(168,85,247,0.1)"
        color="#a855f7"
        busy={busy.coa}
        onSummary={() => setShowExportModal(true)}
        alterHint="Opens a pre-flight summary showing exactly what will be exported (new vs updated groups/ledgers) plus validation warnings, then lets you download the Create/Alter XML. Renamed ledgers/groups are sent as ACTION=&quot;Alter&quot; using their old name + GUID so Tally renames in place instead of duplicating."
      />

      {counts.coaPendingRenames > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid #f59e0b', borderRadius: 8, padding: 16, marginTop: -6, marginBottom: 16 }}>
          <strong style={{ color: '#f59e0b' }}>⚠ {counts.coaPendingRenames} pending rename(s)</strong>
          <p style={{ margin: '6px 0 10px', color: 'var(--text)', fontSize: 13, lineHeight: 1.5 }}>
            One or more ledgers/groups were renamed since the last Tally sync. Download the Chart of Accounts in
            <strong> Alter mode</strong> and import it into Tally — this renames them in place. Once the import succeeds,
            click below so the same renames are not sent again (re-sending a completed rename is what creates duplicates).
          </p>
          <button
            onClick={ackRenames}
            disabled={ackBusy}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', background: '#f59e0b',
              color: 'white', fontWeight: 600, fontSize: 13, cursor: ackBusy ? 'not-allowed' : 'pointer', opacity: ackBusy ? 0.6 : 1
            }}
          >
            {ackBusy ? 'Clearing…' : '✓ Mark renames as applied in Tally'}
          </button>
        </div>
      )}

      <SetupCard
        step="2"
        title="Supplier Ledgers"
        subtitle="One ledger per active supplier under Sundry Creditors, with TRN mapped to PARTYGSTIN"
        count={counts.suppliers}
        accent="rgba(239,68,68,0.1)"
        color="#ef4444"
        busy={busy.suppliers}
        onDownload={a => download('suppliers', a)}
        alterHint="Required before posting any Purchase Voucher. Re-run in Alter mode when suppliers are added or updated."
      />

      <SetupCard
        step="3"
        title="Customer Ledgers"
        subtitle="Deduped from Leads + Sales Claims, under Sundry Debtors"
        count={counts.customers}
        accent="rgba(16,185,129,0.1)"
        color="#10b981"
        busy={busy.customers}
        onDownload={a => download('customers', a)}
        alterHint="Required before posting any Sales Voucher. TRNs (when present on claims) carry through as PARTYGSTIN."
      />

      <div style={{ background: 'var(--card)', borderRadius: 12, padding: 16, border: '1px solid var(--border)', marginTop: 24 }}>
        <h4 style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: 13 }}>After setup</h4>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
          Once the masters are imported, the Purchase and Sales vouchers generated by Supplier Bills, Sales Claims, and
          Salary Preparation will resolve cleanly inside Tally — each voucher's PARTYLEDGERNAME will already exist.
          You only need to re-run these exports when new suppliers or customers are added.
        </p>
      </div>

      <TallyExportSummaryModal
        open={showExportModal}
        onClose={(refresh) => {
          setShowExportModal(false)
          if (refresh) loadCounts()
        }}
      />

      {notify.open && (
        <div className="modal-overlay" onClick={() => setNotify({ ...notify, open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2>{notify.title}</h2><button onClick={() => setNotify({ ...notify, open: false })} className="close-btn">×</button></div>
            <div className="lead-form"><p>{notify.message}</p><div className="form-actions"><button type="button" className="save-btn" onClick={() => setNotify({ ...notify, open: false })}>OK</button></div></div>
          </div>
        </div>
      )}
    </div>
  )
}
