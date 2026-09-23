import { useState } from 'react'
import { api } from '../../lib/api'
import { Spinner } from '../LoadingComponents'

function iso(d) { return d.toISOString().slice(0, 10) }

function presets() {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const firstOfMonth = new Date(y, m, 1)
  const lastOfMonth = new Date(y, m + 1, 0)
  const firstOfLastMonth = new Date(y, m - 1, 1)
  const lastOfLastMonth = new Date(y, m, 0)
  // Quarter: UAE VAT returns are commonly quarterly for smaller businesses
  const currentQuarter = Math.floor(m / 3)
  const qStart = new Date(y, currentQuarter * 3, 1)
  const qEnd = new Date(y, currentQuarter * 3 + 3, 0)
  const lastQStart = new Date(y, (currentQuarter - 1) * 3, 1)
  const lastQEnd = new Date(y, currentQuarter * 3, 0)
  return [
    { label: 'This Month', from: iso(firstOfMonth), to: iso(lastOfMonth) },
    { label: 'Last Month', from: iso(firstOfLastMonth), to: iso(lastOfLastMonth) },
    { label: 'This Quarter', from: iso(qStart), to: iso(qEnd) },
    { label: 'Last Quarter', from: iso(lastQStart), to: iso(lastQEnd) },
    { label: 'YTD', from: `${y}-01-01`, to: iso(now) }
  ]
}

function money(v) {
  const n = typeof v === 'number' ? v : parseFloat(v || 0)
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function VATReport() {
  const now = new Date()
  const firstOfMonth = iso(new Date(now.getFullYear(), now.getMonth(), 1))
  const lastOfMonth = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))

  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(lastOfMonth)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  async function run() {
    try {
      setLoading(true)
      const res = await api.get(`/api/accounts/reports/vat201?from=${from}&to=${to}`)
      setReport(res.data)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  async function downloadCsv() {
    try {
      const res = await api.get(`/api/accounts/reports/vat201?from=${from}&to=${to}&format=csv`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `VAT201-${from}-to-${to}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: 'CSV export failed' })
    }
  }

  function applyPreset(p) {
    setFrom(p.from)
    setTo(p.to)
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: 'var(--text)' }}>UAE FTA VAT 201 Report</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
          Period-wise tax summary for filing with the Federal Tax Authority. Computed from all posted journal entries.
        </p>
      </div>

      <div style={{ background: 'var(--card)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <button className="save-btn" onClick={run} disabled={loading || !from || !to}>
            {loading ? 'Computing...' : 'Generate Report'}
          </button>
          {report && (
            <button className="cancel-btn" onClick={downloadCsv}>⬇ Download CSV</button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, alignSelf: 'center' }}>Presets:</span>
          {presets().map(p => (
            <button key={p.label} onClick={() => applyPreset(p)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: (from === p.from && to === p.to) ? 'var(--primary)' : 'var(--card)',
                color: (from === p.from && to === p.to) ? 'white' : 'var(--text)',
                fontSize: 12, cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spinner />
          <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Aggregating journal entries...</p>
        </div>
      )}

      {report && !loading && (
        <>
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: 'var(--text)' }}>Period: {report.period.label}</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {report.meta.journalsTouched} of {report.meta.journalsScanned} journals have VAT-relevant lines
              </span>
            </div>

            <h4 style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, margin: '16px 0 8px' }}>Outputs (Sales)</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'left' }}>
                  <th style={{ padding: 8, width: 60 }}>Box</th>
                  <th style={{ padding: 8 }}>Label</th>
                  <th style={{ padding: 8, textAlign: 'right', width: 180 }}>Taxable (AED)</th>
                  <th style={{ padding: 8, textAlign: 'right', width: 180 }}>VAT (AED)</th>
                </tr>
              </thead>
              <tbody>
                <BoxRow box="1" data={report.boxes.box1} />
                <BoxRow box="3" data={report.boxes.box3} />
                <BoxRow box="4" data={report.boxes.box4} />
                <BoxRow box="5" data={report.boxes.box5} />
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td style={{ padding: 8 }}></td>
                  <td style={{ padding: 8 }}>Total Outputs</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{money(report.summary.totalOutputSupplies)}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{money(report.summary.totalOutputVat)}</td>
                </tr>
              </tbody>
            </table>

            <h4 style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, margin: '24px 0 8px' }}>Inputs (Purchases)</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'left' }}>
                  <th style={{ padding: 8, width: 60 }}>Box</th>
                  <th style={{ padding: 8 }}>Label</th>
                  <th style={{ padding: 8, textAlign: 'right', width: 180 }}>Taxable (AED)</th>
                  <th style={{ padding: 8, textAlign: 'right', width: 180 }}>Recoverable VAT (AED)</th>
                </tr>
              </thead>
              <tbody>
                <BoxRow box="9" data={report.boxes.box9} />
                <BoxRow box="10" data={report.boxes.box10} />
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td style={{ padding: 8 }}></td>
                  <td style={{ padding: 8 }}>Total Inputs</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{money(report.summary.totalInputsRecoverable)}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace' }}>{money(report.summary.totalInputVat)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{
            background: report.summary.netPayable >= 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
            border: `2px solid ${report.summary.netPayable >= 0 ? '#ef4444' : '#10b981'}`,
            borderRadius: 12, padding: 20, marginBottom: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, color: report.summary.netPayable >= 0 ? '#ef4444' : '#10b981' }}>
                  {report.summary.netPayable >= 0 ? 'Net VAT Payable to FTA' : 'Net VAT Refundable from FTA'}
                </h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  Output VAT (AED {money(report.summary.totalOutputVat)}) − Input VAT (AED {money(report.summary.totalInputVat)})
                </p>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 32, fontWeight: 700, color: report.summary.netPayable >= 0 ? '#ef4444' : '#10b981' }}>
                AED {money(Math.abs(report.summary.netPayable))}
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--card)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: 13 }}>Source Breakdown</h4>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
              <span>Sales claims: <strong>{report.meta.sourceBreakdown.SALES_CLAIM}</strong></span>
              <span>Supplier bills: <strong>{report.meta.sourceBreakdown.SUPPLIER_BILL}</strong></span>
              <span>Manual journals: <strong>{report.meta.sourceBreakdown.MANUAL}</strong></span>
              {report.meta.sourceBreakdown.OTHER > 0 && <span>Other: <strong>{report.meta.sourceBreakdown.OTHER}</strong></span>}
            </div>
            <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
              {report.meta.note}
            </p>
          </div>
        </>
      )}

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

function BoxRow({ box, data }) {
  return (
    <tr>
      <td style={{ padding: 8, fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{box}</td>
      <td style={{ padding: 8, color: 'var(--text)' }}>{data.label}</td>
      <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace', color: data.taxable > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
        {data.taxable > 0 ? parseFloat(data.taxable).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
      </td>
      <td style={{ padding: 8, textAlign: 'right', fontFamily: 'monospace', color: data.vat > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
        {data.vat > 0 ? parseFloat(data.vat).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
      </td>
    </tr>
  )
}
