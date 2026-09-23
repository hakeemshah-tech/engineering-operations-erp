import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { hasAnyRole } from '../../lib/roles'
import './dashboards.css'

function formatMoney(n) {
  const v = Number(n) || 0
  return `AED ${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) }
  catch { return String(d) }
}

function poTotal(po) {
  if (Array.isArray(po.items) && po.items.length > 0) {
    return po.items.reduce((s, i) => s + (Number(i.totalPrice) || Number(i.quantity) * Number(i.unitPrice) || 0), 0)
  }
  if (Array.isArray(po.serviceItems) && po.serviceItems.length > 0) {
    return po.serviceItems.reduce((s, i) => s + (Number(i.totalPrice) || Number(i.lineTotal) || 0), 0)
  }
  if (Array.isArray(po.otherItems) && po.otherItems.length > 0) {
    return po.otherItems.reduce((s, i) => s + (Number(i.lineTotal) || Number(i.totalPrice) || 0), 0)
  }
  return Number(po.grandTotal) || 0
}

/**
 * Main Dashboard - ERP-wide quick analysis for Admins / Managers / General users.
 * Aggregates KPIs across HR, Sales pipeline, Projects, Procurement, Inventory, Accounts,
 * and Company asset expiry.
 *
 * All data is computed client-side from existing list endpoints. Failures are
 * silently skipped (single-module outages don't break the dashboard).
 */
export default function MainDashboard() {
  const navigate = useNavigate()
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  }, [])
  const isAdmin = hasAnyRole(currentUser, ['admin', 'manager'])

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    employees: [],
    leaves: [],
    expiringEmpDocs: [],
    expiringCompDocs: 0,
    expiringCreds: 0,
    expiringVehicles: 0,
    leads: [],
    quotations: [],
    projects: [],
    materials: [],
    materialRequests: [],
    purchaseRequests: [],
    purchaseOrders: [],
    suppliers: [],
    bills: [],
    claims: [],
    salaryRun: null,
    hrAlerts: []
  })

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      const safe = (p) => p.catch(() => ({ data: [] }))
      try {
        const [
          empRes, leaveRes, empDocsRes,
          compDocsRes, credRes, vehRes,
          leadRes, quotRes, projRes,
          matRes, mrRes, prRes, poRes, supRes,
          billRes, claimRes, salaryRes, alertRes
        ] = await Promise.all([
          safe(api.get('/api/employees')),
          safe(api.get('/api/leave-requests?status=pending')),
          safe(api.get('/api/employees/expiring-documents?within=30')),
          safe(api.get('/api/company-documents?status=expiring_soon&limit=1')),
          safe(api.get('/api/credentials?status=expiring_soon&limit=1')),
          safe(api.get('/api/vehicles?documentsExpiringWithin=30&limit=1')),
          safe(api.get('/api/leads')),
          safe(api.get('/api/quotations')),
          safe(api.get('/api/projects')),
          safe(api.get('/api/materials')),
          safe(api.get('/api/material-requests', { params: { limit: 200 } })),
          safe(api.get('/api/purchase-requests', { params: { limit: 200 } })),
          safe(api.get('/api/purchase-orders', { params: { limit: 200 } })),
          safe(api.get('/api/suppliers')),
          safe(api.get('/api/accounts/supplier-bills?status=draft&limit=1')),
          safe(api.get('/api/accounts/sales-claims?status=draft&limit=1')),
          safe(api.get('/api/accounts/salary-runs?limit=1')),
          safe(api.get('/api/hr-alerts?status=open'))
        ])
        if (!alive) return

        const unwrap = (r) => Array.isArray(r.data) ? r.data : (r.data?.data || [])
        const totalOf = (r) => Number(r.data?.total) || (Array.isArray(r.data) ? r.data.length : 0)

        setData({
          employees: unwrap(empRes),
          leaves: unwrap(leaveRes),
          expiringEmpDocs: unwrap(empDocsRes),
          expiringCompDocs: totalOf(compDocsRes),
          expiringCreds: totalOf(credRes),
          expiringVehicles: totalOf(vehRes),
          leads: unwrap(leadRes),
          quotations: unwrap(quotRes),
          projects: unwrap(projRes),
          materials: unwrap(matRes),
          materialRequests: unwrap(mrRes),
          purchaseRequests: unwrap(prRes),
          purchaseOrders: unwrap(poRes),
          suppliers: unwrap(supRes),
          bills: unwrap(billRes),
          claims: unwrap(claimRes),
          salaryRun: (salaryRes.data?.data || salaryRes.data || [])[0] || null,
          hrAlerts: unwrap(alertRes)
        })
      } catch (err) {
        console.error('MainDashboard load failed', err)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  /* ----- Cross-module derived metrics ----- */
  const m = useMemo(() => {
    const activeEmployees = data.employees.filter(e => e.status === 'active').length
    const onboardingEmployees = data.employees.filter(e => e.status === 'onboarding').length
    const offboardingEmployees = data.employees.filter(e => e.status === 'offboarding').length

    const newLeads = data.leads.filter(l => (l.status || '').toLowerCase().includes('new')).length
    const convertedLeads = data.leads.filter(l => (l.status || '').toLowerCase().includes('convert')).length

    const draftQuotations = data.quotations.filter(q => (q.status || '').toLowerCase() === 'draft').length
    const approvedQuotations = data.quotations.filter(q => (q.status || '').toLowerCase() === 'approved').length

    const activeProjects = data.projects.filter(p => p.status === 'active').length
    const completedProjects = data.projects.filter(p => p.status === 'completed').length
    const onHoldProjects = data.projects.filter(p => p.status === 'on_hold').length

    const totalMaterials = data.materials.length
    const lowStockCount = data.materials.filter(mat => {
      const q = Number(mat.quantity) || 0
      const min = Number(mat.minStockLevel) || 0
      return q <= min
    }).length

    const openMRs = data.materialRequests.filter(r => r.status === 'pending' || r.status === 'fulfilled').length

    const openPRs = data.purchaseRequests.filter(r => r.status === 'pending' || r.status === 'approved').length

    const pendingApprovalPOs = data.purchaseOrders.filter(po =>
      po.status === 'pending_am' || po.status === 'pending_gm'
    ).length
    const inTransitPOs = data.purchaseOrders.filter(po => po.status === 'sent_to_supplier').length
    const awaitingGRN = data.purchaseOrders.filter(po => po.status === 'fulfilled').length

    const committedSpend = data.purchaseOrders
      .filter(po => ['approved', 'sent_to_supplier', 'fulfilled', 'received', 'confirmed', 'payment_requested', 'payment_completed'].includes(po.status))
      .reduce((s, po) => s + poTotal(po), 0)

    const activeSuppliers = data.suppliers.filter(s => s.status === 'active').length

    return {
      // HR
      activeEmployees, onboardingEmployees, offboardingEmployees,
      pendingLeaves: data.leaves.length,
      expiringEmpDocs: data.expiringEmpDocs.length,
      openHRAlerts: data.hrAlerts.length,
      // Sales
      totalLeads: data.leads.length, newLeads, convertedLeads,
      totalQuotations: data.quotations.length, draftQuotations, approvedQuotations,
      // Projects
      totalProjects: data.projects.length, activeProjects, completedProjects, onHoldProjects,
      // Inventory
      totalMaterials, lowStockCount, openMRs,
      // Procurement
      openPRs, pendingApprovalPOs, inTransitPOs, awaitingGRN,
      committedSpend, activeSuppliers,
      // Accounts (counts from total field of paginated responses)
      draftBills: Number(data.bills.length) || 0,
      draftClaims: Number(data.claims.length) || 0
    }
  }, [data])

  /* ----- Recent activity feed (latest entries across modules) ----- */
  const activity = useMemo(() => {
    const items = []
    for (const lead of data.leads.slice(0, 5)) {
      items.push({
        ts: lead.createdAt,
        icon: '🔍',
        label: `New lead: ${lead.projectTitle || lead.customerName || 'Untitled'}`,
        target: '/leads'
      })
    }
    for (const q of data.quotations.slice(0, 5)) {
      items.push({
        ts: q.createdAt,
        icon: '📄',
        label: `Quotation ${q.offerReference || ''}`.trim(),
        target: '/quotations'
      })
    }
    for (const p of data.projects.slice(0, 5)) {
      items.push({
        ts: p.createdAt,
        icon: '🏗️',
        label: `Project: ${p.name || 'Untitled'}`,
        target: '/projects'
      })
    }
    for (const po of data.purchaseOrders.slice(0, 5)) {
      items.push({
        ts: po.createdAt,
        icon: '🛒',
        label: `${po.poNumber || 'PO'} → ${po.supplier?.name || 'supplier'}`,
        target: '/purchase-orders'
      })
    }
    for (const mr of data.materialRequests.slice(0, 5)) {
      items.push({
        ts: mr.createdAt,
        icon: '📦',
        label: `${mr.requestNumber || 'MR'} (${(mr.items || []).length} items)`,
        target: '/material-requests'
      })
    }
    items.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
    return items.slice(0, 10)
  }, [data])

  if (loading) {
    return (
      <div className="dash-page">
        <div className="dash-loading">Loading main dashboard…</div>
      </div>
    )
  }

  return (
    <div className="dash-page">
      <div className="dash-page-header">
        <div>
          <h1 className="dash-page-title">Main Dashboard</h1>
          <p className="dash-page-subtitle">
            Live snapshot of the entire ERP — sales, projects, HR, inventory, procurement and accounts at a glance. Click any tile to drill in.
          </p>
        </div>
      </div>

      {/* ---- Top-line KPIs ---- */}
      <div className="dash-kpi-grid">
        <KpiTile
          label="Active projects"
          value={m.activeProjects}
          sub={`${m.totalProjects} total · ${m.onHoldProjects} on hold`}
          accent="#6366f1"
          onClick={() => navigate('/projects')}
        />
        <KpiTile
          label="Active leads"
          value={m.totalLeads}
          sub={`${m.convertedLeads} converted`}
          accent="#3b82f6"
          onClick={() => navigate('/leads')}
        />
        <KpiTile
          label="Active employees"
          value={m.activeEmployees}
          sub={`${m.onboardingEmployees} onboarding`}
          accent="#10b981"
          onClick={() => navigate('/hr/employees')}
        />
        <KpiTile
          label="Open POs"
          value={m.inTransitPOs + m.awaitingGRN}
          sub={`${m.pendingApprovalPOs} awaiting approval`}
          accent="#8b5cf6"
          onClick={() => navigate('/purchase-orders')}
        />
        <KpiTile
          label="Low-stock items"
          value={m.lowStockCount}
          sub={`${m.totalMaterials} SKUs total`}
          accent="#f59e0b"
          onClick={() => navigate('/inventory')}
        />
        <KpiTile
          label="Committed spend"
          value={formatMoney(m.committedSpend)}
          sub={`${m.activeSuppliers} active suppliers`}
          accent="#ef4444"
        />
      </div>

      {isAdmin && (
        <div className="dash-section">
          <h3 className="dash-section-title" style={{ marginBottom: 12 }}>Compliance — expiring within 30 days</h3>
          <div className="dash-kpi-grid">
            <KpiTile
              label="Employee documents"
              value={m.expiringEmpDocs}
              sub="Visas, IDs, contracts"
              accent="#f59e0b"
              onClick={() => navigate('/hr/employees')}
            />
            <KpiTile
              label="Company documents"
              value={data.expiringCompDocs}
              sub="Trade licences etc."
              accent="#a855f7"
              onClick={() => navigate('/company/documents?status=expiring_soon')}
            />
            <KpiTile
              label="Credentials"
              value={data.expiringCreds}
              sub="Logins & certifications"
              accent="#3b82f6"
              onClick={() => navigate('/company/credentials?status=expiring_soon')}
            />
            <KpiTile
              label="Vehicle documents"
              value={data.expiringVehicles}
              sub="Mulkiya, insurance"
              accent="#10b981"
              onClick={() => navigate('/company/vehicles?documentsExpiringWithin=30')}
            />
          </div>
        </div>
      )}

      <div className="dash-grid-2">
        {/* ---- Sales pipeline ---- */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h3 className="dash-section-title">Sales pipeline</h3>
            <button className="dash-section-link" onClick={() => navigate('/estimations-dashboard')}>
              Open estimations →
            </button>
          </div>
          <div className="dash-metric-stack">
            <Row label="🔍 Leads (open)" value={m.totalLeads} onClick={() => navigate('/leads')} />
            <Row label="📄 Quotations — draft" value={m.draftQuotations} onClick={() => navigate('/quotations')} />
            <Row label="✅ Quotations — approved" value={m.approvedQuotations} onClick={() => navigate('/quotations')} />
            <Row label="🏗️ Projects — active" value={m.activeProjects} onClick={() => navigate('/projects')} />
            <Row label="🏁 Projects — completed" value={m.completedProjects} onClick={() => navigate('/projects')} />
          </div>
        </div>

        {/* ---- HR snapshot ---- */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h3 className="dash-section-title">HR snapshot</h3>
            <button className="dash-section-link" onClick={() => navigate('/hr')}>
              Open HR →
            </button>
          </div>
          <div className="dash-metric-stack">
            <Row label="👤 Employees — active" value={m.activeEmployees} onClick={() => navigate('/hr/employees')} />
            <Row label="🆕 Onboarding" value={m.onboardingEmployees} onClick={() => navigate('/hr/employees')} />
            <Row label="🚪 Offboarding" value={m.offboardingEmployees} onClick={() => navigate('/hr/offboarding')} />
            <Row label="📋 Leaves pending approval" value={m.pendingLeaves} onClick={() => navigate('/hr/leave')} />
            <Row label="⚠️ Open HR alerts" value={m.openHRAlerts} onClick={() => navigate('/hr')} />
          </div>
        </div>
      </div>

      <div className="dash-grid-2">
        {/* ---- Procurement snapshot ---- */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h3 className="dash-section-title">Procurement snapshot</h3>
            <button className="dash-section-link" onClick={() => navigate('/purchase-orders')}>
              Open procurement →
            </button>
          </div>
          <div className="dash-metric-stack">
            <Row label="📝 Open purchase requests" value={m.openPRs} onClick={() => navigate('/purchase-requests')} />
            <Row label="⏳ POs awaiting approval (AM + GM)" value={m.pendingApprovalPOs} onClick={() => navigate('/purchase-orders')} />
            <Row label="🚚 POs in transit" value={m.inTransitPOs} onClick={() => navigate('/purchase-orders')} />
            <Row label="📥 Awaiting GRN" value={m.awaitingGRN} onClick={() => navigate('/purchase-orders')} />
            <Row label="🏢 Active suppliers" value={m.activeSuppliers} onClick={() => navigate('/suppliers')} />
          </div>
        </div>

        {/* ---- Inventory snapshot ---- */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h3 className="dash-section-title">Inventory snapshot</h3>
            <button className="dash-section-link" onClick={() => navigate('/inventory')}>
              Open inventory →
            </button>
          </div>
          <div className="dash-metric-stack">
            <Row label="📦 Total SKUs" value={m.totalMaterials} onClick={() => navigate('/inventory')} />
            <Row label="🔴 Low / out of stock" value={m.lowStockCount} onClick={() => navigate('/inventory')} />
            <Row label="📤 Open material requests" value={m.openMRs} onClick={() => navigate('/material-requests')} />
            <Row label="📥 POs awaiting GRN" value={m.awaitingGRN} onClick={() => navigate('/purchase-orders')} />
          </div>
        </div>
      </div>

      <div className="dash-grid-2">
        {/* ---- Accounts snapshot ---- */}
        <div className="dash-section">
          <div className="dash-section-header">
            <h3 className="dash-section-title">Accounts snapshot</h3>
            <button className="dash-section-link" onClick={() => navigate('/accounts')}>
              Open accounts →
            </button>
          </div>
          <div className="dash-metric-stack">
            <Row label="🧾 Supplier bills — draft" value={m.draftBills} onClick={() => navigate('/accounts/bills')} />
            <Row label="💼 Sales claims — draft" value={m.draftClaims} onClick={() => navigate('/accounts/claims')} />
            {data.salaryRun && (
              <Row
                label={`💰 Latest salary run — ${data.salaryRun.status || 'pending'}`}
                value={formatDate(data.salaryRun.createdAt)}
                onClick={() => navigate(`/accounts/salary-preparation/${data.salaryRun._id}`)}
              />
            )}
          </div>
        </div>

        {/* ---- Recent activity feed ---- */}
        <div className="dash-section">
          <h3 className="dash-section-title" style={{ marginBottom: 12 }}>Recent activity</h3>
          {activity.length === 0 ? (
            <div className="dash-empty">No recent activity.</div>
          ) : (
            <div className="dash-metric-stack">
              {activity.map((a, idx) => (
                <div
                  key={idx}
                  className="dash-metric-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(a.target)}
                >
                  <span className="dash-metric-name">{a.icon} {a.label}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatDate(a.ts)}</span>
                </div>
              ))}
            </div>
          )}
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

function Row({ label, value, onClick }) {
  return (
    <div
      className="dash-metric-row"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <span className="dash-metric-name">{label}</span>
      <span className="dash-metric-value">{value}</span>
    </div>
  )
}
