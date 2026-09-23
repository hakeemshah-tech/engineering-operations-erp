import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import './dashboards.css'

/* Status palette for material requests and POs */
const MR_STATUS_COLORS = {
  pending: 'amber',
  fulfilled: 'blue',
  received: 'green',
  cancelled: 'slate'
}
const MR_TYPE_COLORS = {
  request: 'violet',
  return: 'amber',
  remaining_return: 'blue'
}
const PRIORITY_COLORS = {
  urgent: 'red',
  high: 'amber',
  normal: 'blue',
  low: 'slate'
}
const PO_INFLOW_STATUS_COLORS = {
  fulfilled: 'blue',
  received: 'green',
  confirmed: 'green',
  sent_to_supplier: 'amber',
  approved: 'violet'
}

function formatDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return String(d) }
}

function daysBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
}

function pickStatusPill(map, key) {
  const color = map[key] || 'slate'
  return `dash-pill dash-pill-${color}`
}

export default function InventoryDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [materials, setMaterials] = useState([])
  const [stores, setStores] = useState([])
  const [materialRequests, setMaterialRequests] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [projects, setProjects] = useState([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [matRes, storeRes, mrRes, poRes, projRes] = await Promise.all([
          api.get('/api/materials').catch(() => ({ data: [] })),
          api.get('/api/stores').catch(() => ({ data: [] })),
          api.get('/api/material-requests', { params: { limit: 500 } }).catch(() => ({ data: { data: [] } })),
          api.get('/api/purchase-orders', { params: { limit: 200 } }).catch(() => ({ data: { data: [] } })),
          api.get('/api/projects').catch(() => ({ data: [] }))
        ])
        if (!alive) return
        const mrData = mrRes.data?.data || mrRes.data || []
        const poData = poRes.data?.data || poRes.data || []
        setMaterials(Array.isArray(matRes.data) ? matRes.data : (matRes.data?.data || []))
        setStores(Array.isArray(storeRes.data) ? storeRes.data : [])
        setMaterialRequests(Array.isArray(mrData) ? mrData : [])
        setPurchaseOrders(Array.isArray(poData) ? poData : [])
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

  const storeNameById = useMemo(() => {
    const m = new Map()
    stores.forEach(s => m.set(String(s._id), s.name))
    return m
  }, [stores])

  /* ------- Material / stock KPIs ------- */
  const materialKpis = useMemo(() => {
    const total = materials.length
    let lowStock = 0
    let zeroStock = 0
    let projectSpecific = 0
    let staffSpecific = 0
    const byStore = new Map()
    const lowList = []

    for (const m of materials) {
      const qty = Number(m.quantity) || 0
      const min = Number(m.minStockLevel) || 0
      if (qty <= 0) zeroStock++
      else if (qty <= min) lowStock++
      if (m.category === 'project_specific') projectSpecific++
      else if (m.category === 'staff_specific') staffSpecific++
      const sid = String(m.storeId?._id || m.storeId || '')
      byStore.set(sid, (byStore.get(sid) || 0) + 1)
      if (qty <= min && qty > 0) lowList.push(m)
    }

    // Sort low-stock by deficit (most urgent first)
    lowList.sort((a, b) => (Number(a.quantity) - Number(a.minStockLevel)) - (Number(b.quantity) - Number(b.minStockLevel)))

    const storeBreakdown = Array.from(byStore.entries()).map(([sid, count]) => ({
      storeId: sid,
      storeName: storeNameById.get(sid) || 'Unknown',
      count
    })).sort((a, b) => b.count - a.count)

    return { total, lowStock, zeroStock, projectSpecific, staffSpecific, storeBreakdown, lowList: lowList.slice(0, 8) }
  }, [materials, storeNameById])

  /* ------- Material Request analytics ------- */
  const mrAnalytics = useMemo(() => {
    const byStatus = { pending: 0, fulfilled: 0, received: 0, cancelled: 0 }
    const byType = { request: 0, return: 0, remaining_return: 0 }
    const byPriority = { urgent: 0, high: 0, normal: 0, low: 0 }
    const byProject = new Map()
    const now = new Date()
    let recent7 = 0, recent30 = 0
    let pendingOld = 0 // pending more than 7 days

    const sortedByDate = [...materialRequests].sort((a, b) =>
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    )

    for (const r of materialRequests) {
      if (byStatus[r.status] !== undefined) byStatus[r.status]++
      if (byType[r.requestType] !== undefined) byType[r.requestType]++
      if (byPriority[r.priority] !== undefined) byPriority[r.priority]++
      const pid = String(r.projectId?._id || r.projectId || '')
      if (pid) byProject.set(pid, (byProject.get(pid) || 0) + 1)
      const created = new Date(r.createdAt || 0)
      const age = daysBetween(created, now)
      if (age <= 7) recent7++
      if (age <= 30) recent30++
      if (r.status === 'pending' && age > 7) pendingOld++
    }

    const topProjects = Array.from(byProject.entries())
      .map(([pid, count]) => ({ projectId: pid, projectName: projectNameById.get(pid) || 'Unknown', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      total: materialRequests.length,
      byStatus, byType, byPriority,
      recent7, recent30, pendingOld,
      topProjects,
      recent: sortedByDate.slice(0, 8)
    }
  }, [materialRequests, projectNameById])

  /* ------- Procurement Inflow (POs that affect inventory) ------- */
  const poInflow = useMemo(() => {
    // POs in states relevant to inventory: fulfilled (awaiting GRN), received, confirmed
    const awaitingGRN = purchaseOrders.filter(po => po.status === 'fulfilled')
    const receivedThisMonth = purchaseOrders.filter(po => {
      if (!['received', 'confirmed'].includes(po.status)) return false
      const ra = po.receivedAt || po.confirmedAt
      if (!ra) return false
      const d = new Date(ra)
      const now = new Date()
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const sortedRecent = [...purchaseOrders]
      .filter(po => ['fulfilled', 'received', 'confirmed', 'sent_to_supplier'].includes(po.status))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 6)

    return { awaitingGRN, receivedThisMonth, recent: sortedRecent }
  }, [purchaseOrders])

  if (loading) {
    return (
      <div className="dash-page">
        <div className="dash-loading">Loading inventory dashboard…</div>
      </div>
    )
  }

  return (
    <div className="dash-page">
      <div className="dash-page-header">
        <div>
          <h1 className="dash-page-title">Inventory Dashboard</h1>
          <p className="dash-page-subtitle">
            Real-time snapshot of stock health, warehouse coverage, project demand and incoming goods. All counts are live.
          </p>
        </div>
      </div>

      {error && (
        <div className="dash-section" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* ---- Top-level KPI tiles ---- */}
      <div className="dash-kpi-grid">
        <KpiTile
          label="Total materials"
          value={materialKpis.total}
          sub={`Across ${stores.length} store${stores.length === 1 ? '' : 's'}`}
          accent="#6366f1"
          onClick={() => navigate('/inventory')}
        />
        <KpiTile
          label="Low stock"
          value={materialKpis.lowStock}
          sub="Below minimum level"
          accent="#f59e0b"
          onClick={() => navigate('/inventory')}
        />
        <KpiTile
          label="Zero stock"
          value={materialKpis.zeroStock}
          sub="Out of stock — replenish"
          accent="#ef4444"
          onClick={() => navigate('/inventory')}
        />
        <KpiTile
          label="Open material requests"
          value={mrAnalytics.byStatus.pending}
          sub={`${mrAnalytics.recent7} in last 7 days`}
          accent="#3b82f6"
          onClick={() => navigate('/material-requests')}
        />
        <KpiTile
          label="To fulfill"
          value={mrAnalytics.byStatus.pending + mrAnalytics.byStatus.fulfilled}
          sub={`${mrAnalytics.pendingOld} pending > 7 days`}
          accent="#10b981"
          onClick={() => navigate('/material-requests')}
        />
        <KpiTile
          label="POs awaiting GRN"
          value={poInflow.awaitingGRN.length}
          sub="Supplier fulfilled, not yet received"
          accent="#8b5cf6"
          onClick={() => navigate('/purchase-orders')}
        />
      </div>

      <div className="dash-grid-2">
        {/* ---- Material Request status breakdown ---- */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h3 className="dash-section-title">Material requests — status</h3>
            <button className="dash-section-link" onClick={() => navigate('/material-requests')}>
              View all →
            </button>
          </div>
          <StatusBars
            data={mrAnalytics.byStatus}
            colorMap={MR_STATUS_COLORS}
            total={mrAnalytics.total}
          />
        </div>

        {/* ---- Material Request type breakdown ---- */}
        <div className="dash-section">
          <h3 className="dash-section-title" style={{ marginBottom: 12 }}>Movement types</h3>
          <StatusBars
            data={mrAnalytics.byType}
            colorMap={MR_TYPE_COLORS}
            total={mrAnalytics.total}
            labelMap={{ request: 'Out (to project)', return: 'In (return)', remaining_return: 'In (remaining)' }}
          />
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 8 }}>
              Priority distribution
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(mrAnalytics.byPriority).map(([prio, count]) => (
                <span key={prio} className={`dash-pill dash-pill-${PRIORITY_COLORS[prio]}`}>
                  {prio}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dash-grid-2">
        {/* ---- Low stock alerts ---- */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h3 className="dash-section-title">Low-stock alerts</h3>
            <button className="dash-section-link" onClick={() => navigate('/inventory')}>View inventory →</button>
          </div>
          {materialKpis.lowList.length === 0 ? (
            <div className="dash-empty">No items below minimum level. 🎉</div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>SKU</th>
                    <th>Store</th>
                    <th className="dash-num">Qty</th>
                    <th className="dash-num">Min</th>
                  </tr>
                </thead>
                <tbody>
                  {materialKpis.lowList.map(m => (
                    <tr key={m._id}>
                      <td><strong>{m.name}</strong></td>
                      <td><span className="dash-pill dash-pill-slate">{m.sku}</span></td>
                      <td>{m.storeId?.name || storeNameById.get(String(m.storeId)) || '—'}</td>
                      <td className="dash-num"><span className="dash-pill dash-pill-red">{m.quantity}</span></td>
                      <td className="dash-num">{m.minStockLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---- Warehouse coverage ---- */}
        <div className="dash-section">
          <h3 className="dash-section-title" style={{ marginBottom: 12 }}>Warehouse coverage</h3>
          {materialKpis.storeBreakdown.length === 0 ? (
            <div className="dash-empty">No stores configured.</div>
          ) : (
            <div className="dash-metric-stack">
              {materialKpis.storeBreakdown.map(s => (
                <div key={s.storeId} className="dash-metric-row">
                  <span className="dash-metric-name">📦 {s.storeName}</span>
                  <span className="dash-metric-value">{s.count} SKUs</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="dash-pill dash-pill-violet">Project-specific: {materialKpis.projectSpecific}</span>
            <span className="dash-pill dash-pill-blue">Staff-specific: {materialKpis.staffSpecific}</span>
          </div>
        </div>
      </div>

      {/* ---- Recent material requests ---- */}
      <div className="dash-section">
        <div className="dash-section-header">
          <h3 className="dash-section-title">Recent material requests</h3>
          <button className="dash-section-link" onClick={() => navigate('/material-requests')}>View all →</button>
        </div>
        {mrAnalytics.recent.length === 0 ? (
          <div className="dash-empty">No requests yet.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Request #</th>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {mrAnalytics.recent.map(r => (
                  <tr key={r._id} onClick={() => navigate('/material-request-detail', { state: { id: r._id } })} style={{ cursor: 'pointer' }}>
                    <td><strong>{r.requestNumber}</strong></td>
                    <td>{r.projectId?.name || projectNameById.get(String(r.projectId)) || '—'}</td>
                    <td><span className={pickStatusPill(MR_TYPE_COLORS, r.requestType)}>{r.requestType?.replace('_', ' ')}</span></td>
                    <td><span className={`dash-pill dash-pill-${PRIORITY_COLORS[r.priority] || 'slate'}`}>{r.priority}</span></td>
                    <td className="dash-num">{(r.items || []).length}</td>
                    <td><span className={pickStatusPill(MR_STATUS_COLORS, r.status)}>{r.status}</span></td>
                    <td>{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="dash-grid-2">
        {/* ---- Project demand ---- */}
        <div className="dash-section">
          <h3 className="dash-section-title" style={{ marginBottom: 12 }}>Top projects by demand</h3>
          {mrAnalytics.topProjects.length === 0 ? (
            <div className="dash-empty">No project-linked requests yet.</div>
          ) : (
            <div className="dash-metric-stack">
              {mrAnalytics.topProjects.map((p, i) => (
                <div key={p.projectId} className="dash-metric-row">
                  <span className="dash-metric-name">
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 22, display: 'inline-block' }}>#{i + 1}</span>
                    🏗️ {p.projectName}
                  </span>
                  <span className="dash-metric-value">{p.count} request{p.count === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Incoming from procurement ---- */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h3 className="dash-section-title">Incoming from procurement</h3>
            <button className="dash-section-link" onClick={() => navigate('/purchase-orders')}>View POs →</button>
          </div>
          {poInflow.recent.length === 0 ? (
            <div className="dash-empty">No active procurement orders.</div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>PO #</th>
                    <th>Supplier</th>
                    <th>Status</th>
                    <th>Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {poInflow.recent.map(po => (
                    <tr key={po._id} onClick={() => navigate('/purchase-order-detail', { state: { id: po._id } })} style={{ cursor: 'pointer' }}>
                      <td><strong>{po.poNumber}</strong></td>
                      <td>{po.supplier?.name || po.supplierId?.name || '—'}</td>
                      <td><span className={pickStatusPill(PO_INFLOW_STATUS_COLORS, po.status)}>{po.status?.replace(/_/g, ' ')}</span></td>
                      <td>{formatDate(po.deliveryDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="dash-pill dash-pill-blue">Awaiting GRN: {poInflow.awaitingGRN.length}</span>
            <span className="dash-pill dash-pill-green">Received this month: {poInflow.receivedThisMonth.length}</span>
          </div>
        </div>
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
