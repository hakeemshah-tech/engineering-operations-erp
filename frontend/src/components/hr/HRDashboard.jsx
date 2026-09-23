import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import HRAlertsFeed from './HRAlertsFeed'
import './hr.css'

export default function HRDashboard() {
  const navigate = useNavigate()
  const [kpi, setKpi] = useState({
    expiringDocs: 0,
    pendingLeaves: 0,
    activeOffboardings: 0,
    openAlerts: 0,
    pendingPasswordResets: 0
  })

  useEffect(() => {
    const load = async () => {
      try {
        const [docRes, leaveRes, offRes, alertRes, resetRes] = await Promise.all([
          api.get('/api/employees/expiring-documents?within=30').catch(() => ({ data: [] })),
          api.get('/api/leave-requests?status=pending').catch(() => ({ data: [] })),
          api.get('/api/offboarding?status=in_clearance').catch(() => ({ data: [] })),
          api.get('/api/hr-alerts?status=open').catch(() => ({ data: [] })),
          api.get('/api/users/pending-password-resets').catch(() => ({ data: [] }))
        ])
        setKpi({
          expiringDocs: (docRes.data || []).length,
          pendingLeaves: (leaveRes.data || []).length,
          activeOffboardings: (offRes.data || []).length,
          openAlerts: (alertRes.data || []).length,
          pendingPasswordResets: (resetRes.data || []).length
        })
      } catch (err) {
        console.error('HR KPI load failed', err)
      }
    }
    load()
  }, [])

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h2>HR Dashboard</h2>
          <p>Overview of employee documents, leaves, offboarding, and alerts.</p>
        </div>
      </div>

      <div className="hr-kpi-grid">
        <div className="hr-kpi" onClick={() => navigate('/hr/employees')} style={{ cursor: 'pointer' }}>
          <div className="hr-kpi-label">Documents Expiring</div>
          <div className="hr-kpi-value">{kpi.expiringDocs}</div>
          <div className="hr-kpi-sub">Within 30 days</div>
        </div>
        <div className="hr-kpi" onClick={() => navigate('/hr/leave')} style={{ cursor: 'pointer' }}>
          <div className="hr-kpi-label">Pending Leaves</div>
          <div className="hr-kpi-value">{kpi.pendingLeaves}</div>
          <div className="hr-kpi-sub">Awaiting approval</div>
        </div>
        <div className="hr-kpi" onClick={() => navigate('/hr/offboarding')} style={{ cursor: 'pointer' }}>
          <div className="hr-kpi-label">Active Offboardings</div>
          <div className="hr-kpi-value">{kpi.activeOffboardings}</div>
          <div className="hr-kpi-sub">In clearance</div>
        </div>
        <div className="hr-kpi">
          <div className="hr-kpi-label">Open Alerts</div>
          <div className="hr-kpi-value">{kpi.openAlerts}</div>
          <div className="hr-kpi-sub">Requires attention</div>
        </div>
        <div className="hr-kpi" onClick={() => navigate('/hr/password-resets')} style={{ cursor: 'pointer' }}>
          <div className="hr-kpi-label">Pending Password Resets</div>
          <div className="hr-kpi-value">{kpi.pendingPasswordResets}</div>
          <div className="hr-kpi-sub">Forgot-password requests</div>
        </div>
      </div>

      <div className="hr-section-header">Open Alerts</div>
      <HRAlertsFeed limit={20} />
    </div>
  )
}
