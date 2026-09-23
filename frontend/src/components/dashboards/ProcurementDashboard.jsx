import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import './dashboards.css'

const PR_STATUS_COLORS = {
  draft: 'slate',
  pending: 'amber',
  approved: 'violet',
  rejected: 'red',
  fulfilled: 'blue',
  received: 'green',
  cancelled: 'slate'
}

const PO_STATUS_COLORS = {
  draft: 'slate',
  pending_am: 'amber',
  pending_gm: 'amber',
  approved: 'violet',
  rejected: 'red',
  sent_to_supplier: 'blue',
  fulfilled: 'blue',
  received: 'green',
  confirmed: 'green',
  payment_requested: 'amber',
  payment_completed: 'green',
  cancelled: 'slate'
}

const PO_TYPE_COLORS = {
  material: 'violet',
  manpower: 'blue',
  subcontracting: 'amber',
  machine_rental: 'green',
  other: 'slate'
}

const PRIORITY_COLORS = {
  urgent: 'red',
  high: 'amber',
  normal: 'blue',
  low: 'slate'
}

function formatDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return String(d) }
}

function formatMoney(n) {
  const v = Number(n) || 0
  return `AED ${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function poTotal(po) {
  // Material items
  if (Array.isArray(po.items) && po.items.length > 0) {
    return po.items.reduce((s, i) => s + (Number(i.totalPrice) || Number(i.quantity) * Number(i.unitPrice) || 0), 0)
  }
  // Service items
  if (Array.isArray(po.serviceItems) && po.serviceItems.length > 0) {
    return po.serviceItems.reduce((s, i) => s + (Number(i.totalPrice) || Number(i.lineTotal) || 0), 0)
  }
  // Other items
  if (Array.isArray(po.otherItems) && po.otherItems.length > 0) {
    return po.otherItems.reduce((s, i) => s + (Number(i.lineTotal) || Number(i.totalPrice) || 0), 0)
  }
  return Number(po.grandTotal) || 0
}

function daysBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
}

export default function ProcurementDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [purchaseRequests, setPurchaseRequests] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [projects, setProjects] = useState([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [prRes, poRes, supRes, projRes] = await Promise.all([
          api.get('/api/purchase-requests', { params: { limit: 500 } }).catch(() => ({ data: { data: [] } })),
          api.get('/api/purchase-orders', { params: { limit: 500 } }).catch(() => ({ data: { data: [] } })),
          api.get('/api/suppliers').catch(() => ({ data: [] })),
          api.get('/api/projects').catch(() => ({ data: [] }))
        ])
        if (!alive) return
        const prData = prRes.data?.data || prRes.data || []
        const poData = poRes.data?.data || poRes.data || []
        setPurchaseRequests(Array.isArray(prData) ? prData : [])
        setPurchaseOrders(Array.isArray(poData) ? poData : [])
        setSuppliers(Array.isArray(supRes.data) ? supRes.data : [])
        setProjects(Array.isArray(projRes.data) ? projRes.data : [])
      } catch (err) {
        if (!alive) return
        setError(err?.response?.data?.message || 'Failed to load dashboard data.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const projectNameById = useMemo(() => {
    const m = new Map()
    projects.forEach(p => m.set(String(p._id), p.name))
    return m
  }, [projects])

  const supplierNameById = useMemo(() => {
    const m = new Map()
    suppliers.forEach(s => m.set(String(s._id), s))
    return m
  }, [suppliers])

  /* ----- PR analytics ----- */
  const prAnalytics = useMemo(() => {
    const byStatus = Object.fromEntries(Object.keys(PR_STATUS_COLORS).map(k => [k, 0]))
    const byPriority = { urgent: 0, high: 0, normal: 0, low: 0 }
    const now = new Date()
    let pendingOld = 0 // pending > 7 days
    let recent7 = 0

    for (const pr of purchaseRequests) {
      if (byStatus[pr.status] !== undefined) byStatus[pr.status]++
      if (byPriority[pr.priority] !== undefined) byPriority[pr.priority]++
      const age = daysBetween(pr.createdAt || now, now)
      if (age <= 7) recent7++
      if (pr.status === 'pending' && age > 7) pendingOld++
    }

    const recent = [...purchaseRequests]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 8)

    return { total: purchaseRequests.length, byStatus, byPriority, recent, recent7, pendingOld }
  }, [purchaseRequests])

  /* ----- PO analytics ----- */
  const poAnalytics = useMemo(() => {
    const byStatus = Object.fromEntries(Object.keys(PO_STATUS_COLORS).map(k => [k, 0]))
    const byType = { material: 0, manpower: 0, subcontracting: 0, machine_rental: 0, other: 0 }
    let pendingApproval = 0 // pending_am + pending_gm
    let inTransit = 0 // sent_to_supplier
    let awaitingGRN = 0 // fulfilled
    let totalSpendCommitted = 0 // sum of approved + sent_to_supplier + fulfilled + received + confirmed
    let totalSpendCompleted = 0 // payment_completed
    let recent7 = 0
    const now = new Date()

    for (const po of purchaseOrders) {
      if (byStatus[po.status] !== undefined) byStatus[po.status]++
      if (byType[po.poType] !== undefined) byType[po.poType]++
      if (po.status === 'pending_am' || po.status === 'pending_gm') pendingApproval++
      if (po.status === 'sent_to_supplier') inTransit++
      if (po.status === 'fulfilled') awaitingGRN++

      const value = poTotal(po)
      if (['approved', 'sent_to_supplier', 'fulfilled', 'received', 'confirmed', 'payment_requested', 'payment_completed'].includes(po.status)) {
        totalSpendCommitted += value
      }
      if (po.status === 'payment_completed') totalSpendCompleted += value

      const age = daysBetween(po.createdAt || now, now)
      if (age <= 7) recent7++
    }

    const recent = [...purchaseOrders]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 8)

    return {
      total: purchaseOrders.length,
      byStatus, byType,
      pendingApproval, inTransit, awaitingGRN,
      totalSpendCommitted, totalSpendCompleted,
      recent, recent7
    }
  }, [purchaseOrders])

  /* ----- Supplier analytics ----- */
  const supplierAnalytics = useMemo(() => {
    const bySupplierCount = new Map()
    const bySupplierSpend = new Map()
    for (const po of purchaseOrders) {
      const sid = String(po.supplierId?._id || po.supplierId || '')
      if (!sid) continue
      bySupplierCount.set(sid, (bySupplierCount.get(sid) || 0) + 1)
      const val = poTotal(po)
      bySupplierSpend.set(sid, (bySupplierSpend.get(sid) || 0) + val)
    }
    const byCount = Array.from(bySupplierCount.entries())
      .map(([sid, count]) => {
        const supplier = supplierNameById.get(sid)
        return {
          supplierId: sid,
          name: supplier?.name || 'Unknown supplier',
          status: supplier?.status,
          count,
          spend: bySupplierSpend.get(sid) || 0
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const bySpend = Array.from(bySupplierSpend.entries())
      .map(([sid, spend]) => {
        const supplier = supplierNameById.get(sid)
        return {
          supplierId: sid,
          name: supplier?.name || 'Unknown supplier',
          status: supplier?.status,
          spend,
          count: bySupplierCount.get(sid) || 0
        }
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5)

    return {
      activeCount: suppliers.filter(s => s.status === 'active').length,
      total: suppliers.length,
      byCount,
      bySpend
    }
  }, [suppliers, purchaseOrders, supplierNameById])

  /* ----- Project demand (procurement view) ----- */
  const projectSpend = useMemo(() => {
    const m = new Map()
    for (const po of purchaseOrders) {
      const pid = String(po.projectId?._id || po.projectId || '')
      if (!pid) continue
      const v = poTotal(po)
      m.set(pid, (m.get(pid) || 0) + v)
    }
    return Array.from(m.entries())
      .map(([pid, spend]) => ({ projectId: pid, name: projectNameById.get(pid) || 'Unknown', spend }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5)
  }, [purchaseOrders, projectNameById])

  if (loading) {
    return (
      <div className="dash-page">
        <div className="dash-loading">Loading procurement dashboard…</div>
      </div>
    )
  }

  return (
    <div className="dash-page">
      <div className="dash-page-header">
        <div>
          <h1 className="dash-page-title">Procurement Dashboard</h1>
          <p className="dash-page-subtitle">
            Live view of supplier activity, purchase requisitions, order pipeline, approvals, spending and project allocations.
          </p>
        </div>
      </div>

      {error && (
        <div className="dash-section" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* ---- KPI tiles ---- */}
      <div className="dash-kpi-grid">
        <KpiTile
          label="Active suppliers"
          value={supplierAnalytics.activeCount}
          sub={`${supplierAnalytics.total} total`}
          accent="#6366f1"
          onClick={() => navigate('/suppliers')}
        />
        <KpiTile
          label="Open PRs"
          value={prAnalytics.byStatus.pending}
          sub={`${prAnalytics.pendingOld} pending > 7d`}
          accent="#f59e0b"
          onClick={() => navigate('/purchase-requests')}
        />
        <KpiTile
          label="POs awaiting approval"
          value={poAnalytics.pendingApproval}
          sub="AM + GM queue"
          accent="#3b82f6"
          onClick={() => navigate('/purchase-orders')}
        />
        <KpiTile
          label="POs in transit"
          value={poAnalytics.inTransit}
          sub="Sent to supplier"
          accent="#8b5cf6"
          onClick={() => navigate('/purchase-orders')}
        />
        <KpiTile
          label="Awaiting GRN"
          value={poAnalytics.awaitingGRN}
          sub="Supplier fulfilled, not received"
          accent="#10b981"
          onClick={() => navigate('/purchase-orders')}
        />
        <KpiTile
          label="Committed spend"
          value={formatMoney(poAnalytics.totalSpendCommitted)}
          sub={`Paid: ${formatMoney(poAnalytics.totalSpendCompleted)}`}
          accent="#ef4444"
        />
      </div>

      <div className="dash-grid-2">
        {/* ---- PR pipeline ---- */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h3 className="dash-section-title">Purchase requests — pipeline</h3>
            <button className="dash-section-link" onClick={() => navigate('/purchase-requests')}>
              View all →
            </button>
          </div>
          <StatusBars
            data={prAnalytics.byStatus}
            colorMap={PR_STATUS_COLORS}
            total={prAnalytics.total}
          />
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(prAnalytics.byPriority).map(([prio, count]) => (
              <span key={prio} className={`dash-pill dash-pill-${PRIORITY_COLORS[prio]}`}>
                {prio}: {count}
              </span>
            ))}
          </div>
        </div>

        {/* ---- PO pipeline ---- */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h3 className="dash-section-title">Purchase orders — pipeline</h3>
            <button className="dash-section-link" onClick={() => navigate('/purchase-orders')}>
              View all →
            </button>
          </div>
          <StatusBars
            data={poAnalytics.byStatus}
            colorMap={PO_STATUS_COLORS}
            total={poAnalytics.total}
          />
        </div>
      </div>

      <div className="dash-grid-2">
        {/* ---- PO types ---- */}
        <div className="dash-section">
          <h3 className="dash-section-title" style={{ marginBottom: 12 }}>PO type mix</h3>
          <StatusBars
            data={poAnalytics.byType}
            colorMap={PO_TYPE_COLORS}
            total={poAnalytics.total}
            labelMap={{ machine_rental: 'Machine rental', subcontracting: 'Subcontracting' }}
          />
          <div style={{ marginTop: 18, padding: '12px 14px', background: 'var(--input)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 4 }}>
              Approval bottlenecks
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="dash-pill dash-pill-amber">Pending AM: {poAnalytics.byStatus.pending_am}</span>
              <span className="dash-pill dash-pill-amber">Pending GM: {poAnalytics.byStatus.pending_gm}</span>
              <span className="dash-pill dash-pill-amber">Payment requested: {poAnalytics.byStatus.payment_requested}</span>
            </div>
          </div>
        </div>

        {/* ---- Spending by project ---- */}
        <div className="dash-section">
          <h3 className="dash-section-title" style={{ marginBottom: 12 }}>Top projects by PO spend</h3>
          {projectSpend.length === 0 ? (
            <div className="dash-empty">No project-linked POs yet.</div>
          ) : (
            <div className="dash-metric-stack">
              {projectSpend.map((p, i) => (
                <div key={p.projectId} className="dash-metric-row">
                  <span className="dash-metric-name">
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 22, display: 'inline-block' }}>#{i + 1}</span>
                    🏗️ {p.name}
                  </span>
                  <span className="dash-metric-value">{formatMoney(p.spend)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dash-grid-2">
        {/* ---- Top suppliers by order count ---- */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h3 className="dash-section-title">Top suppliers by orders</h3>
            <button className="dash-section-link" onClick={() => navigate('/suppliers')}>
              View suppliers →
            </button>
          </div>
          {supplierAnalytics.byCount.length === 0 ? (
            <div className="dash-empty">No supplier activity yet.</div>
          ) : (
            <div className="dash-metric-stack">
              {supplierAnalytics.byCount.map((s, i) => (
                <div key={s.supplierId} className="dash-metric-row">
                  <span className="dash-metric-name">
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 22, display: 'inline-block' }}>#{i + 1}</span>
                    🏢 {s.name}
                    {s.status === 'inactive' && (
                      <span className="dash-pill dash-pill-red" style={{ marginLeft: 6 }}>inactive</span>
                    )}
                  </span>
                  <span className="dash-metric-value">{s.count} POs</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Top suppliers by spend ---- */}
        <div className="dash-section">
          <h3 className="dash-section-title" style={{ marginBottom: 12 }}>Top suppliers by spend</h3>
          {supplierAnalytics.bySpend.length === 0 ? (
            <div className="dash-empty">No spend data yet.</div>
          ) : (
            <div className="dash-metric-stack">
              {supplierAnalytics.bySpend.map((s, i) => (
                <div key={s.supplierId} className="dash-metric-row">
                  <span className="dash-metric-name">
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 22, display: 'inline-block' }}>#{i + 1}</span>
                    💰 {s.name}
                  </span>
                  <span className="dash-metric-value">{formatMoney(s.spend)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- Recent PRs ---- */}
      <div className="dash-section">
        <div className="dash-section-header">
          <h3 className="dash-section-title">Recent purchase requests</h3>
          <button className="dash-section-link" onClick={() => navigate('/purchase-requests')}>View all →</button>
        </div>
        {prAnalytics.recent.length === 0 ? (
          <div className="dash-empty">No PRs yet.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Request #</th>
                  <th>Project</th>
                  <th>Supplier</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {prAnalytics.recent.map(pr => (
                  <tr key={pr._id} onClick={() => navigate('/purchase-request-detail', { state: { id: pr._id } })} style={{ cursor: 'pointer' }}>
                    <td><strong>{pr.requestNumber}</strong></td>
                    <td>{pr.projectId?.name || projectNameById.get(String(pr.projectId)) || '—'}</td>
                    <td>{pr.supplier?.name || pr.supplierId?.name || '—'}</td>
                    <td><span className={`dash-pill dash-pill-${PRIORITY_COLORS[pr.priority] || 'slate'}`}>{pr.priority}</span></td>
                    <td><span className={`dash-pill dash-pill-${PR_STATUS_COLORS[pr.status] || 'slate'}`}>{pr.status?.replace(/_/g, ' ')}</span></td>
                    <td>{formatDate(pr.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Recent POs ---- */}
      <div className="dash-section">
        <div className="dash-section-header">
          <h3 className="dash-section-title">Recent purchase orders</h3>
          <button className="dash-section-link" onClick={() => navigate('/purchase-orders')}>View all →</button>
        </div>
        {poAnalytics.recent.length === 0 ? (
          <div className="dash-empty">No POs yet.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>PO #</th>
                  <th>Type</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th className="dash-num">Value</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {poAnalytics.recent.map(po => (
                  <tr key={po._id} onClick={() => navigate('/purchase-order-detail', { state: { id: po._id } })} style={{ cursor: 'pointer' }}>
                    <td><strong>{po.poNumber}</strong></td>
                    <td><span className={`dash-pill dash-pill-${PO_TYPE_COLORS[po.poType] || 'slate'}`}>{po.poType?.replace(/_/g, ' ')}</span></td>
                    <td>{po.supplier?.name || po.supplierId?.name || '—'}</td>
                    <td><span className={`dash-pill dash-pill-${PO_STATUS_COLORS[po.status] || 'slate'}`}>{po.status?.replace(/_/g, ' ')}</span></td>
                    <td className="dash-num">{formatMoney(poTotal(po))}</td>
                    <td>{formatDate(po.deliveryDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function KpiTile({ label, value, sub, accent, onClick }) {
  return (
    <div
      className={`dash-kpi ${onClick ? 'dash-kpi-clickable' : ''}`}
      onClick={onClick}
    >
      <div className="dash-kpi-accent" style={{ background: accent }} />
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  )
}

function StatusBars({ data, colorMap, total, labelMap }) {
  const max = Math.max(1, ...Object.values(data))
  const entries = Object.entries(data)
  return (
    <div className="dash-status-list">
      {entries.map(([key, count]) => {
        const pct = (count / max) * 100
        const color = colorMap[key] || 'slate'
        return (
          <div key={key} className="dash-status-row">
            <span className="dash-status-label">{labelMap?.[key] || key.replace(/_/g, ' ')}</span>
            <div className="dash-status-bar-track">
              <div
                className="dash-status-bar-fill"
                style={{
                  width: `${pct}%`,
                  background: colorVar(color)
                }}
              />
            </div>
            <span className="dash-status-count">{count}</span>
          </div>
        )
      })}
      {total !== undefined && (
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Total {total}
        </div>
      )}
    </div>
  )
}

function colorVar(name) {
  switch (name) {
    case 'green':  return '#10b981'
    case 'amber':  return '#f59e0b'
    case 'red':    return '#ef4444'
    case 'blue':   return '#3b82f6'
    case 'violet': return '#8b5cf6'
    case 'slate':
    default:       return '#64748b'
  }
}
