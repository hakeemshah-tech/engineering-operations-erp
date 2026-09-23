import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { hasAnyRole } from '../../lib/roles'
import AttendanceGrid from './AttendanceGrid'
import './hr.css'

export default function AttendanceManagement() {
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  }, [])
  const hasFullHR = hasAnyRole(currentUser, ['hr', 'manager', 'admin'])
  const isProjectScoped = !hasFullHR && hasAnyRole(currentUser, ['project_engineer', 'site_supervisor', 'supervisor'])

  const [tab, setTab] = useState('list')
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectReportData, setProjectReportData] = useState(null)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  useEffect(() => {
    const url = isProjectScoped ? '/api/projects?mine=true' : '/api/projects'
    api.get(url).then(res => setProjects(res.data || [])).catch(() => setProjects([]))
  }, [isProjectScoped])

  const loadProjectReport = async (projectId) => {
    if (!projectId) return
    try {
      const res = await api.get(`/api/attendance/project/${projectId}/cost-report`)
      setProjectReportData(res.data)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to load report' })
    }
  }

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h2>Attendance</h2>
          <p>
            {isProjectScoped
              ? 'Mark site attendance for workers on your projects using the bulk grid.'
              : 'Record site and office attendance in bulk, review project cost reports.'}
          </p>
        </div>
      </div>

      <div className="hr-tabs">
        <button className={`hr-tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>Records</button>
        {!isProjectScoped && (
          <button className={`hr-tab ${tab === 'report' ? 'active' : ''}`} onClick={() => setTab('report')}>Project Cost Report</button>
        )}
      </div>

      {tab === 'list' && <AttendanceGrid />}

      {tab === 'report' && (
        <>
          <div className="hr-filters">
            <select
              value={selectedProjectId}
              onChange={e => {
                setSelectedProjectId(e.target.value)
                loadProjectReport(e.target.value)
              }}
            >
              <option value="">Select project…</option>
              {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>

          {!projectReportData ? (
            <div className="hr-empty">Select a project to see its labour cost report.</div>
          ) : (
            <>
              <div className="hr-kpi-grid">
                <div className="hr-kpi">
                  <div className="hr-kpi-label">Actual Cost</div>
                  <div className="hr-kpi-value">AED {(projectReportData.totals.totalCost || 0).toFixed(0)}</div>
                </div>
                <div className="hr-kpi">
                  <div className="hr-kpi-label">Actual Hours</div>
                  <div className="hr-kpi-value">{(projectReportData.totals.totalHours || 0).toFixed(0)}</div>
                </div>
                <div className="hr-kpi">
                  <div className="hr-kpi-label">Labour Budget</div>
                  <div className="hr-kpi-value">AED {projectReportData.project.labourBudgetAmount || 'N/A'}</div>
                </div>
                <div className="hr-kpi">
                  <div className="hr-kpi-label">Status</div>
                  <div className="hr-kpi-value">
                    {projectReportData.overBudget
                      ? <span className="hr-badge hr-badge-danger">Over Budget</span>
                      : <span className="hr-badge hr-badge-success">Within Budget</span>}
                  </div>
                </div>
              </div>

              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Name</th>
                    <th>Hours</th>
                    <th>Cost (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  {projectReportData.breakdown.map(row => (
                    <tr key={row._id}>
                      <td>{row.employeeId}</td>
                      <td>{row.fullName}</td>
                      <td>{row.totalHours.toFixed(1)}</td>
                      <td>{row.totalCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      {notify.open && (
        <div className="hr-modal-overlay" onClick={() => setNotify({ ...notify, open: false })}>
          <div className="hr-modal" onClick={e => e.stopPropagation()}>
            <h3>{notify.title}</h3>
            <p>{notify.message}</p>
            <div className="hr-form-actions">
              <button className="hr-btn hr-btn-primary" onClick={() => setNotify({ ...notify, open: false })}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
