import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import ExpiryBadge from './ExpiryBadge'
import ActivateUserModal from './ActivateUserModal'
import EmployeeAttendanceHistory from './EmployeeAttendanceHistory'
import { hasAnyRole } from '../../lib/roles'
import './hr.css'

const WORKFLOW_STAGES = {
  overseas: ['offer', 'mohre', 'visa', 'flight', 'arrival_medical', 'eid_visa_stamping', 'active'],
  uae_transfer: ['offer', 'mohre', 'old_employer_cancellation', 'status_change', 'medical', 'eid_visa_stamping', 'active'],
  emirati: ['offer', 'labour_card', 'gpssa_medical_registration', 'active']
}

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
const photoSrc = (url) => {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
}

const DOC_KEYS = [
  { key: 'offerLetter', label: 'Offer Letter', topLevel: true, expiryField: null },
  { key: 'contract', label: 'MOHRE Contract', topLevel: true, expiryField: 'endDate', expiryLabel: 'Ends' },
  { key: 'passport', label: 'Passport' },
  { key: 'visa', label: 'Visa' },
  { key: 'labourCard', label: 'Labour Card' },
  { key: 'emiratesId', label: 'Emirates ID' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'medical', label: 'Medical' }
]

// Build a reverse map: attachmentId → document label
function buildAttachmentLabelMap(employee) {
  const map = {}
  if (!employee) return map
  for (const d of DOC_KEYS) {
    const slot = d.topLevel ? employee[d.key] : employee.documents?.[d.key]
    if (slot?.attachmentId) {
      map[slot.attachmentId] = d.label
    }
  }
  return map
}

const TYPE_COLOR = {
  office: { bg: 'rgba(99, 102, 241, 0.10)',  border: 'rgba(99, 102, 241, 0.40)' },
  site:   { bg: 'rgba(34, 197, 94, 0.10)',   border: 'rgba(34, 197, 94, 0.40)'  },
  remote: { bg: 'rgba(56, 189, 248, 0.10)',  border: 'rgba(56, 189, 248, 0.40)' },
  other:  { bg: 'rgba(148, 163, 184, 0.10)', border: 'rgba(148, 163, 184, 0.40)' },
  mixed:  { bg: 'rgba(168, 85, 247, 0.10)',  border: 'rgba(168, 85, 247, 0.40)' }
}

function LocationChip({ loc, badge }) {
  if (!loc) return null
  const colors = TYPE_COLOR[loc.type] || TYPE_COLOR.other
  const isInactive = loc.status && loc.status !== 'active'
  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 10,
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      minWidth: 220,
      opacity: isInactive ? 0.65 : 1
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14 }}>
          {loc.noGeofence ? '🌐' : (loc.type === 'office' ? '🏢' : loc.type === 'site' ? '📍' : loc.type === 'remote' ? '🏠' : '📌')}
        </span>
        <strong style={{ fontSize: 14 }}>{loc.name || '—'}</strong>
        {badge && (
          <span className="hr-badge hr-badge-info" style={{ fontSize: 10, padding: '1px 8px' }}>
            {badge}
          </span>
        )}
        {isInactive && (
          <span className="hr-badge hr-badge-warning" style={{ fontSize: 10, padding: '1px 8px' }}>
            inactive
          </span>
        )}
      </div>
      {loc.address && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{loc.address}</div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {loc.type ? `${loc.type}` : ''}{loc.type ? ' · ' : ''}
        {loc.noGeofence
          ? 'no geofence'
          : (loc.geofenceRadiusMeters ? `${loc.geofenceRadiusMeters}m geofence` : 'no radius set')}
      </div>
    </div>
  )
}

function LocationsPanel({ employee }) {
  const base       = employee?.baseLocationId  || null
  const additional = Array.isArray(employee?.additionalLocationIds) ? employee.additionalLocationIds : []
  const group      = employee?.locationGroupId || null
  const groupLocations = Array.isArray(group?.locationIds) ? group.locationIds : []

  const baseId = base && (base._id || base)
  // De-dupe: drop any group/additional entries that are the same Location as base.
  const dedupedAdditional = additional.filter(l => l && String(l._id || l) !== String(baseId))
  const dedupedGroupLocs  = groupLocations.filter(l => l && String(l._id || l) !== String(baseId))

  const empty = !base && additional.length === 0 && !group
  if (empty) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
        No locations are assigned. This employee will not be able to GPS-punch until HR sets a base location, location group, or additional location.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Base */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          Base Location
        </div>
        {base ? (
          <LocationChip loc={base} badge="primary" />
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
            No base location set.
          </div>
        )}
      </div>

      {/* Additional */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          Additional Locations
          {dedupedAdditional.length > 0 && (
            <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontWeight: 400 }}>
              ({dedupedAdditional.length})
            </span>
          )}
        </div>
        {dedupedAdditional.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
            None.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {dedupedAdditional.map(loc => (
              <LocationChip key={loc._id || loc} loc={loc} />
            ))}
          </div>
        )}
      </div>

      {/* Location group */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          Location Group
        </div>
        {!group ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
            None.
          </div>
        ) : (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 12,
            background: 'var(--card, transparent)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>👥</span>
              <strong>{group.name}</strong>
              {group.type && (
                <span className="hr-badge hr-badge-info" style={{ fontSize: 10, padding: '1px 8px', textTransform: 'capitalize' }}>
                  {group.type}
                </span>
              )}
              {group.status && group.status !== 'active' && (
                <span className="hr-badge hr-badge-warning" style={{ fontSize: 10, padding: '1px 8px' }}>
                  {group.status}
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                {groupLocations.length} location{groupLocations.length === 1 ? '' : 's'} in group
              </span>
            </div>
            {group.description && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                {group.description}
              </div>
            )}
            {dedupedGroupLocs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                Group has no member locations.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {dedupedGroupLocs.map(loc => (
                  <LocationChip key={loc._id || loc} loc={loc} badge="via group" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function EmployeeDetail() {
  const location = useLocation()
  const navigate = useNavigate()
  const employeeId = location.state?.employeeId

  const [employee, setEmployee] = useState(null)
  const [tab, setTab] = useState('overview')
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [uploadingDocType, setUploadingDocType] = useState('')
  const [showActivate, setShowActivate] = useState(false)
  const [workflowConfirm, setWorkflowConfirm] = useState(null) // { mode: 'advance' | 'revert', fromStage, toStage }
  const [workflowBusy, setWorkflowBusy] = useState(false)
  const fileInputRef = useRef(null)

  let currentUser = null
  try { currentUser = JSON.parse(localStorage.getItem('user') || 'null') } catch { currentUser = null }
  const canActivate = hasAnyRole(currentUser, ['hr', 'manager', 'admin'])

  const load = async () => {
    if (!employeeId) {
      setNotify({ open: true, title: 'Missing', message: 'No employee specified.' })
      return
    }
    try {
      const res = await api.get(`/api/employees/${employeeId}`)
      setEmployee(res.data)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed to load employee' })
    }
  }

  useEffect(() => {
    load()
  }, [employeeId])

  const toggleChecklistItem = async (item) => {
    try {
      const target = employee.onboardingChecklist.find(c => c.item === item)
      await api.patch(`/api/employees/${employee._id}/checklist/${encodeURIComponent(item)}`, {
        done: !target.done
      })
      load()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    }
  }

  const openAdvanceConfirm = () => {
    const stages = WORKFLOW_STAGES[employee.workflow.type] || []
    const currentIdx = stages.indexOf(employee.workflow.currentStage)
    const next = stages[currentIdx + 1]
    if (!next) {
      setNotify({ open: true, title: 'Workflow', message: 'Already at terminal stage.' })
      return
    }
    setWorkflowConfirm({ mode: 'advance', fromStage: employee.workflow.currentStage, toStage: next })
  }

  const openRevertConfirm = () => {
    const completed = employee.workflow?.stagesCompleted || []
    if (completed.length === 0) {
      setNotify({ open: true, title: 'Workflow', message: 'Already at the first stage — nothing to revert.' })
      return
    }
    const targetStage = completed[completed.length - 1].stage
    setWorkflowConfirm({ mode: 'revert', fromStage: employee.workflow.currentStage, toStage: targetStage })
  }

  const runWorkflowAction = async () => {
    if (!workflowConfirm) return
    const { mode, toStage } = workflowConfirm
    setWorkflowBusy(true)
    try {
      if (mode === 'advance') {
        await api.post(`/api/employees/${employee._id}/workflow/advance`, { stage: toStage })
      } else {
        await api.post(`/api/employees/${employee._id}/workflow/revert`, {})
      }
      setWorkflowConfirm(null)
      await load()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    } finally {
      setWorkflowBusy(false)
    }
  }

  const pickUpload = (docType) => {
    setUploadingDocType(docType)
    fileInputRef.current?.click()
  }

  const doUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('attachments', f))
      if (uploadingDocType) fd.append('docType', uploadingDocType)
      await api.post(`/api/employees/${employee._id}/documents`, fd)
      load()
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Upload failed' })
    } finally {
      e.target.value = ''
      setUploadingDocType('')
    }
  }

  if (!employee) return <div className="hr-page"><div className="hr-empty">Loading…</div></div>

  const stages = WORKFLOW_STAGES[employee.workflow?.type] || []
  const completedStages = new Set((employee.workflow?.stagesCompleted || []).map(s => s.stage))

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--input, #f1f5f9)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: 24,
            fontWeight: 600,
            flexShrink: 0
          }}>
            {employee.photoUrl ? (
              <img
                src={photoSrc(employee.photoUrl)}
                alt={employee.fullName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span>{(employee.fullName || '?').trim().charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <h2 style={{ margin: 0 }}>{employee.fullName}</h2>
            <p style={{ margin: '4px 0 0' }}>
              {employee.employeeId} · {employee.category?.replace(/_/g, ' ')} ·{' '}
              <span className={`hr-badge hr-badge-info`}>{employee.status}</span>
            </p>
          </div>
        </div>
        <div>
          <button className="hr-btn hr-btn-secondary" onClick={() => navigate('/hr/employees')}>Back</button>
          {canActivate && employee.status === 'active' && !employee.userId && (
            <button
              className="hr-btn hr-btn-primary"
              style={{ marginLeft: 8 }}
              onClick={() => setShowActivate(true)}
              title="Assign a login — either create a new user or link an existing one"
            >
              Activate &amp; Assign Role
            </button>
          )}
          <button
            className="hr-btn hr-btn-primary"
            style={{ marginLeft: 8 }}
            onClick={() => navigate(`/hr/employees/edit/${employee._id}`)}
          >
            Edit
          </button>
        </div>
      </div>

      <div className="hr-tabs">
        {['overview', 'documents', 'checklist', 'workflow', 'attendance', 'attachments'].map(t => (
          <button key={t} className={`hr-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="hr-card">
          <div className="hr-form-row">
            <div><strong>Email:</strong> {employee.email || '—'}</div>
            <div><strong>Phone:</strong> {employee.phone || '—'}</div>
            <div><strong>Nationality:</strong> {employee.nationality || '—'}</div>
            <div><strong>Position:</strong> {employee.position || '—'}</div>
            <div><strong>Department:</strong> {employee.department || '—'}</div>
            <div><strong>Joining:</strong> {employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString() : '—'}</div>
            <div><strong>Probation End:</strong> {employee.probationEndDate ? new Date(employee.probationEndDate).toLocaleDateString() : '—'}</div>
            <div><strong>OT Eligible:</strong> {employee.otEligible ? 'Yes' : 'No'}</div>
          </div>

          <div className="hr-section-header">Assigned Roles</div>
          {(() => {
            const empRoles = Array.isArray(employee.userId?.roles) ? employee.userId.roles : []
            if (!employee.userId) {
              return (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(245,158,11,.10)',
                  border: '1px solid rgba(245,158,11,.40)',
                  color: '#b45309',
                  fontSize: '0.9rem',
                  lineHeight: 1.55
                }}>
                  ⚠ <strong>No login linked.</strong> This employee cannot sign in. Use <em>Activate &amp; Assign Role</em> above to either create a new login or attach an existing unlinked user.
                </div>
              )
            }
            if (empRoles.length === 0) {
              return (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Linked user has no roles assigned.
                </div>
              )
            }
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {empRoles.map(r => (
                  <span key={r._id || r.key} className="hr-badge hr-badge-info">
                    {r.name || r.key}
                  </span>
                ))}
                {employee.userId?.isActive === false && (
                  <span className="hr-badge hr-badge-danger" style={{ marginLeft: 4 }}>
                    Account inactive
                  </span>
                )}
              </div>
            )
          })()}

          <div className="hr-section-header">Assigned Locations</div>
          <LocationsPanel employee={employee} />

          <div className="hr-section-header">Offer Letter</div>
          <div className="hr-form-row">
            <div><strong>Basic:</strong> AED {employee.offerLetter?.basicSalary || 0}</div>
            <div><strong>Housing:</strong> AED {employee.offerLetter?.housingAllowance || 0}</div>
            <div><strong>Transport:</strong> AED {employee.offerLetter?.transportAllowance || 0}</div>
            <div><strong>Other:</strong> AED {employee.offerLetter?.otherAllowances || 0}</div>
            <div><strong>Total Gross:</strong> AED {employee.offerLetter?.totalGrossSalary || 0}</div>
            <div><strong>Signed:</strong> {employee.offerLetter?.signed ? 'Yes' : 'No'}</div>
          </div>

          <div className="hr-section-header">Contract</div>
          <div className="hr-form-row">
            <div><strong>MOHRE #:</strong> {employee.contract?.mohreContractNumber || '—'}</div>
            <div><strong>Type:</strong> {employee.contract?.type || '—'}</div>
            <div><strong>Start:</strong> {employee.contract?.startDate ? new Date(employee.contract.startDate).toLocaleDateString() : '—'}</div>
            <div><strong>End:</strong> {employee.contract?.endDate ? <ExpiryBadge date={employee.contract.endDate} label="Ends" /> : '—'}</div>
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="hr-card">
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={doUpload} />
          {DOC_KEYS.map(({ key, label, topLevel, expiryField, expiryLabel }) => {
            const slot = topLevel ? (employee[key] || {}) : (employee.documents?.[key] || {})
            const expiryValue = expiryField ? slot[expiryField] : slot.expiryDate
            const hasExpiry = expiryField !== null
            const uploaded = !!slot.attachmentId
            return (
              <div key={key} className="hr-doc-tile">
                <div className="hr-doc-meta">
                  <div className="hr-doc-name">
                    {label}
                    {uploaded && <span className="hr-badge hr-badge-success" style={{ marginLeft: 8 }}>Uploaded</span>}
                  </div>
                  <div className="hr-doc-expiry">
                    {slot.number && <span>No: {slot.number} · </span>}
                    {slot.mohreContractNumber && <span>No: {slot.mohreContractNumber} · </span>}
                    {hasExpiry
                      ? (expiryValue ? <ExpiryBadge date={expiryValue} label={expiryLabel || 'Expires'} /> : 'No expiry set')
                      : (slot.issueDate ? `Issued ${new Date(slot.issueDate).toLocaleDateString()}` : '—')
                    }
                  </div>
                </div>
                <button className="hr-btn hr-btn-secondary" onClick={() => pickUpload(key)}>Upload</button>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'checklist' && (
        <div className="hr-card">
          {employee.onboardingChecklist.length === 0 ? (
            <div className="hr-empty">No checklist items for this category.</div>
          ) : (
            employee.onboardingChecklist.map(c => (
              <div key={c.item} className={`hr-checklist-item ${c.done ? 'done' : ''}`}>
                <input type="checkbox" checked={c.done} onChange={() => toggleChecklistItem(c.item)} />
                <span className="hr-checklist-label">{c.item}</span>
                {c.doneAt && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {new Date(c.doneAt).toLocaleDateString()}
                </span>}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'workflow' && (
        <div className="hr-card">
          <div style={{ marginBottom: 12, color: 'var(--text-muted)' }}>
            Workflow: <strong style={{ textTransform: 'capitalize' }}>{employee.workflow?.type?.replace('_', ' ')}</strong>
          </div>
          <div className="hr-workflow-stepper">
            {stages.map(stage => {
              const isCompleted = completedStages.has(stage)
              const isCurrent = employee.workflow?.currentStage === stage
              return (
                <span key={stage} className={`hr-stage ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}>
                  {stage.replace(/_/g, ' ')}
                </span>
              )
            })}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="hr-btn hr-btn-primary" onClick={openAdvanceConfirm}>
              Advance to Next Stage
            </button>
            {(employee.workflow?.stagesCompleted || []).length > 0 && (
              <button
                className="hr-btn hr-btn-secondary"
                onClick={openRevertConfirm}
                style={{ borderColor: 'rgba(245, 158, 11, 0.5)', color: '#b45309' }}
              >
                ↶ Revert to Previous Stage
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'attendance' && (
        <EmployeeAttendanceHistory
          employeeId={employee._id}
          employeeName={employee.fullName}
        />
      )}

      {tab === 'attachments' && (
        <div className="hr-card">
          {(employee.attachments || []).length === 0 ? (
            <div className="hr-empty">No attachments uploaded.</div>
          ) : (() => {
            const labelMap = buildAttachmentLabelMap(employee)
            return (
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Document Type</th>
                    <th>File</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employee.attachments.map(a => {
                    const label = labelMap[a._id?.toString?.() || a._id]
                    return (
                      <tr key={a._id}>
                        <td>
                          {label
                            ? <span className="hr-badge hr-badge-info">{label}</span>
                            : <span className="hr-badge hr-badge-neutral">Unlinked</span>}
                        </td>
                        <td>
                          <a href={`${api.defaults.baseURL}${a.path}`} target="_blank" rel="noreferrer" className="hr-link">
                            {a.originalName}
                          </a>
                        </td>
                        <td>{(a.size / 1024).toFixed(1)} KB</td>
                        <td>{new Date(a.uploadedAt).toLocaleString()}</td>
                        <td>
                          <button
                            className="hr-btn hr-btn-danger"
                            onClick={async () => {
                              try {
                                await api.delete(`/api/employees/${employee._id}/documents/${a._id}`)
                                load()
                              } catch {
                                setNotify({ open: true, title: 'Error', message: 'Delete failed' })
                              }
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          })()}
        </div>
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

      {showActivate && (
        <ActivateUserModal
          employee={employee}
          onClose={() => setShowActivate(false)}
          onActivated={() => load()}
        />
      )}

      {workflowConfirm && (
        <div
          onClick={() => !workflowBusy && setWorkflowConfirm(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(520px, 92vw)',
              padding: '28px 28px 22px',
              borderRadius: 20,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              color: 'var(--text)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
              <div
                aria-hidden="true"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: workflowConfirm.mode === 'advance'
                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                    : 'linear-gradient(135deg, #f59e0b, #ef4444)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 22,
                  fontWeight: 700,
                  flexShrink: 0,
                  boxShadow: workflowConfirm.mode === 'advance'
                    ? '0 8px 20px rgba(99, 102, 241, 0.35)'
                    : '0 8px 20px rgba(239, 68, 68, 0.35)'
                }}
              >
                {workflowConfirm.mode === 'advance' ? '→' : '↶'}
              </div>
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 600, color: 'var(--text)' }}>
                  {workflowConfirm.mode === 'advance' ? 'Advance to next stage?' : 'Revert to previous stage?'}
                </h2>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.93rem', lineHeight: 1.55 }}>
                  {workflowConfirm.mode === 'advance' ? (
                    <>This will move <strong style={{ color: 'var(--text)' }}>{employee.fullName}</strong> forward in the onboarding
                    workflow. The current stage will be marked complete and recorded on the timeline.</>
                  ) : (
                    <>This will move <strong style={{ color: 'var(--text)' }}>{employee.fullName}</strong> back to the previous
                    stage and remove the most recent completion entry from the workflow history.
                    {workflowConfirm.fromStage === 'active' && (
                      <> The employee status will also be downgraded from <strong style={{ color: 'var(--text)' }}>active</strong> to <strong style={{ color: 'var(--text)' }}>onboarding</strong>.</>
                    )}</>
                  )}
                </p>
              </div>
            </div>

            <div style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'var(--input)',
              border: '1px solid var(--border)',
              marginBottom: 18,
              fontSize: '0.9rem',
              color: 'var(--text)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {workflowConfirm.mode === 'advance' ? 'Current' : 'From'}
                  </div>
                  <div style={{ fontWeight: 600, textTransform: 'capitalize', color: 'var(--text)' }}>
                    {workflowConfirm.fromStage.replace(/_/g, ' ')}
                  </div>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '1.3rem', fontWeight: 500 }}>
                  {workflowConfirm.mode === 'advance' ? '→' : '←'}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {workflowConfirm.mode === 'advance' ? 'Next' : 'Back to'}
                  </div>
                  <div style={{ fontWeight: 600, textTransform: 'capitalize', color: 'var(--text)' }}>
                    {workflowConfirm.toStage.replace(/_/g, ' ')}
                  </div>
                </div>
              </div>
            </div>

            {workflowConfirm.mode === 'revert' && (
              <div style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
                fontSize: '0.85rem',
                marginBottom: 18,
                lineHeight: 1.45,
                border: '1px solid rgba(245, 158, 11, 0.35)'
              }}>
                <strong>Heads up:</strong> reverting removes the most recent completion record.
                This action will be logged in the audit trail.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setWorkflowConfirm(null)}
                disabled={workflowBusy}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--input)',
                  color: 'var(--text)',
                  cursor: workflowBusy ? 'default' : 'pointer',
                  fontWeight: 500
                }}
              >Cancel</button>
              <button
                type="button"
                onClick={runWorkflowAction}
                disabled={workflowBusy}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: workflowConfirm.mode === 'advance'
                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                    : 'linear-gradient(135deg, #f59e0b, #ef4444)',
                  color: 'white',
                  cursor: workflowBusy ? 'default' : 'pointer',
                  fontWeight: 600,
                  boxShadow: workflowConfirm.mode === 'advance'
                    ? '0 8px 20px rgba(99, 102, 241, 0.35)'
                    : '0 8px 20px rgba(239, 68, 68, 0.35)',
                  opacity: workflowBusy ? 0.7 : 1
                }}
              >
                {workflowBusy
                  ? 'Working…'
                  : workflowConfirm.mode === 'advance' ? 'Confirm advance' : 'Confirm revert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
