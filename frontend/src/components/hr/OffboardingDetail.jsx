import { useEffect, useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import './hr.css'

const STAGES = [
  {
    key: 'initiated',
    label: 'Initiated',
    description: 'Case opened. Notice period running. Nothing has happened on the clearance side yet.',
    next: 'in_clearance',
    primary: { action: 'start-clearance', label: 'Start Clearance', kind: 'success' },
    instructions: [
      'Confirm exit type, notice period and the planned last working date.',
      'When the employee actually begins handing things over, press "Start Clearance" to advance the case to the In Clearance stage.'
    ]
  },
  {
    key: 'in_clearance',
    label: 'In Clearance',
    description: 'Asset return, handovers and final-settlement prep are in progress.',
    next: 'completed',
    primary: { action: 'finalize', label: 'Finalize', kind: 'success' },
    instructions: [
      'Tick every clearance item as the employee returns assets and completes handovers.',
      'Calculate Gratuity once the basic wage and final exit date are known.',
      'Once every clearance item is ticked AND gratuity has been calculated, press "Finalize" to complete the case.'
    ]
  },
  {
    key: 'completed',
    label: 'Completed',
    description: 'Exit fully processed. Employee status is now resigned/terminated and their user account has been deactivated.',
    next: null,
    primary: null,
    instructions: [
      'The employee account no longer has access — any open session is revoked within seconds.',
      'Download the experience certificate for the employee record.',
      'No further changes can be made to clearance items.'
    ]
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
    description: 'The case was cancelled before completion. No exit was processed.',
    next: null,
    primary: null,
    instructions: ['Case is closed. Re-initiate from Offboarding if needed.']
  }
]

function getStageConfig(status) {
  return STAGES.find(s => s.key === status) || STAGES[0]
}

const STAGE_BADGE_CLASS = {
  initiated: 'hr-badge-info',
  in_clearance: 'hr-badge-warning',
  completed: 'hr-badge-success',
  cancelled: 'hr-badge-neutral'
}

export default function OffboardingDetail() {
  const location = useLocation()
  const navigate = useNavigate()
  const offboardingId = location.state?.offboardingId

  const [kase, setKase] = useState(null)
  const [showGratuity, setShowGratuity] = useState(false)
  const [gratuityForm, setGratuityForm] = useState({ basicWage: '', exitDate: '' })
  const [calcLoading, setCalcLoading] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '', tone: 'info' })
  const [confirmState, setConfirmState] = useState({ open: false, action: null })
  // Cancel-offboarding modal needs a reason - separate from the stage-action
  // confirm modal so we don't tangle two unrelated forms together.
  const [cancelState, setCancelState] = useState({ open: false, reason: '', loading: false })

  const load = async () => {
    if (!offboardingId) return
    try {
      const res = await api.get(`/api/offboarding/${offboardingId}`)
      setKase(res.data)
    } catch (err) {
      setNotify({ open: true, title: 'Could not load case', tone: 'error', message: err.response?.data?.message || 'Failed' })
    }
  }

  useEffect(() => { load() }, [offboardingId])

  const stage = useMemo(() => kase ? getStageConfig(kase.status) : STAGES[0], [kase])
  const allChecklistDone = useMemo(() => {
    if (!kase || !Array.isArray(kase.clearanceChecklist) || kase.clearanceChecklist.length === 0) return false
    return kase.clearanceChecklist.every(c => c.returned)
  }, [kase])
  const checklistDoneCount = useMemo(() =>
    (kase?.clearanceChecklist || []).filter(c => c.returned).length
  , [kase])
  const checklistTotal = (kase?.clearanceChecklist || []).length
  const gratuityDone = !!kase?.gratuityCalc?.calculatedAt

  // Why is Finalize blocked right now? Compose a precise reason so the
  // tooltip / disabled message tells HR exactly what to do next, not just
  // a generic "not allowed yet".
  const finalizeBlockedReason = (() => {
    if (!kase) return ''
    if (kase.status === 'initiated') return 'Start Clearance first — the case is still in the Initiated stage.'
    if (kase.status !== 'in_clearance') return ''
    if (!allChecklistDone) return `Tick all clearance items first (${checklistDoneCount} of ${checklistTotal} done).`
    if (!gratuityDone) return 'Calculate gratuity before finalising.'
    return ''
  })()

  const toggleClearance = async (item) => {
    try {
      const target = kase.clearanceChecklist.find(c => c.item === item)
      await api.patch(`/api/offboarding/${kase._id}/clearance/${encodeURIComponent(item)}`, {
        returned: !target.returned
      })
      load()
    } catch (err) {
      setNotify({
        open: true,
        title: 'Could not update item',
        tone: 'error',
        message: err.response?.data?.message || 'Failed'
      })
    }
  }

  const calculate = async (e) => {
    e.preventDefault()
    setCalcLoading(true)
    try {
      const res = await api.post(`/api/offboarding/${kase._id}/calculate-gratuity`, {
        basicWage: gratuityForm.basicWage ? Number(gratuityForm.basicWage) : undefined,
        exitDate: gratuityForm.exitDate || undefined
      })
      const updated = res?.data
      setKase(updated || kase)
      setShowGratuity(false)
      const final = updated?.gratuityCalc?.finalGratuity ?? 0
      const years = updated?.gratuityCalc?.yearsOfService ?? 0
      setNotify({
        open: true,
        title: 'Gratuity calculated',
        tone: 'success',
        message: years < 1
          ? `No gratuity payable — service is less than 1 year (${years} years). The figure of AED ${final} has been saved against the case.`
          : `Final gratuity: AED ${final} (based on ${years} years of service). The figure has been saved against the case.`
      })
    } catch (err) {
      setNotify({
        open: true,
        title: 'Gratuity calculation failed',
        tone: 'error',
        message: err.response?.data?.message || err.message || 'Failed'
      })
    } finally {
      setCalcLoading(false)
    }
  }

  const downloadCertificate = async () => {
    try {
      const res = await api.get(`/api/offboarding/${kase._id}/experience-certificate`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `Experience-Certificate-${kase.employee?.employeeId || kase.caseNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setNotify({ open: true, title: 'Download failed', tone: 'error', message: err.response?.data?.message || 'Download failed' })
    }
  }

  const stageActionTitle = (action) => {
    if (action === 'start-clearance') return 'Start Clearance?'
    if (action === 'finalize') return 'Finalize this case?'
    return 'Confirm action'
  }

  const stageActionDescription = (action) => {
    const empName = kase?.employee?.fullName || 'the employee'
    if (action === 'start-clearance') {
      return `This will move the case from Initiated → In Clearance. After this you can tick clearance items as ${empName} returns assets and completes handovers. The employee's account stays active until the case is finalised.`
    }
    if (action === 'finalize') {
      return `This will mark the case as Completed and revoke ${empName}'s account access immediately. Their employee status changes to ${kase?.exitType === 'termination' ? 'terminated' : 'resigned'}. Make sure final settlement figures are correct before continuing.`
    }
    return ''
  }

  const runStageAction = async () => {
    const action = confirmState.action
    if (!action || !kase) return
    setConfirmState(s => ({ ...s, loading: true }))
    try {
      const res = await api.post(`/api/offboarding/${kase._id}/${action}`, {})
      const updated = res?.data
      if (updated) setKase(updated)
      setConfirmState({ open: false, action: null })
      if (action === 'start-clearance') {
        setNotify({ open: true, title: 'Clearance started', tone: 'success', message: 'The case is now in the In Clearance stage. You can begin ticking checklist items.' })
      } else if (action === 'finalize') {
        setNotify({ open: true, title: 'Case finalised', tone: 'success', message: 'The case is completed. The employee\'s account has been deactivated; any open session will be revoked on their next request.' })
      }
      load()
    } catch (err) {
      setConfirmState(s => ({ ...s, loading: false }))
      setNotify({ open: true, title: 'Action failed', tone: 'error', message: err.response?.data?.message || err.message || 'Failed' })
    }
  }

  const cancelCase = async () => {
    const reason = (cancelState.reason || '').trim()
    if (!reason) {
      setNotify({ open: true, title: 'Reason required', tone: 'error', message: 'Please enter a short reason before cancelling the offboarding case.' })
      return
    }
    setCancelState(s => ({ ...s, loading: true }))
    try {
      const res = await api.post(`/api/offboarding/${kase._id}/cancel`, { reason })
      const updated = res?.data
      if (updated) setKase(updated)
      setCancelState({ open: false, reason: '', loading: false })
      setNotify({
        open: true,
        title: 'Offboarding cancelled',
        tone: 'success',
        message: 'The case moved to the Cancelled stage. The employee\'s status was restored to Active so they keep their access.'
      })
      load()
    } catch (err) {
      setCancelState(s => ({ ...s, loading: false }))
      setNotify({
        open: true,
        title: 'Cancel failed',
        tone: 'error',
        message: err.response?.data?.message || err.message || 'Failed'
      })
    }
  }

  if (!kase) return <div className="hr-page"><div className="hr-empty">Loading…</div></div>

  const primaryDisabled = stage.primary?.action === 'finalize' && !!finalizeBlockedReason
  const stepperStages = STAGES.filter(s => s.key !== 'cancelled')
  const isCancelled = kase.status === 'cancelled'

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h2>{kase.employee?.fullName}</h2>
          <p>
            {kase.caseNumber} · {(kase.exitType || '').replace('_', ' ')} ·{' '}
            <span className={`hr-badge ${STAGE_BADGE_CLASS[kase.status] || 'hr-badge-info'}`}>{stage.label}</span>
          </p>
        </div>
        <div>
          <button className="hr-btn hr-btn-secondary" onClick={() => navigate('/hr/offboarding')}>Back</button>
          <button className="hr-btn hr-btn-secondary" style={{ marginLeft: 8 }} onClick={downloadCertificate}>
            Download Experience Certificate
          </button>
          {stage.primary && !isCancelled && (
            <button
              className={`hr-btn hr-btn-${stage.primary.kind}`}
              style={{ marginLeft: 8 }}
              onClick={() => setConfirmState({ open: true, action: stage.primary.action })}
              disabled={primaryDisabled}
              title={primaryDisabled ? finalizeBlockedReason : ''}
            >
              {stage.primary.label}
            </button>
          )}
          {/* Cancel button - available while the case is still pre-Completed.
              Captures a reason and reverts the employee back to Active. */}
          {(kase.status === 'initiated' || kase.status === 'in_clearance') && (
            <button
              className="hr-btn hr-btn-danger"
              style={{ marginLeft: 8 }}
              onClick={() => setCancelState({ open: true, reason: '', loading: false })}
              title="Cancel this case and restore the employee"
            >
              Cancel Offboarding
            </button>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="hr-card hr-stage-card">
        <div className="hr-stage-stepper" role="list">
          {stepperStages.map((s, idx) => {
            const currentIdx = stepperStages.findIndex(x => x.key === kase.status)
            const state = idx < currentIdx ? 'done' : idx === currentIdx ? 'current' : 'upcoming'
            return (
              <div key={s.key} className={`hr-stage-step hr-stage-step-${state}`} role="listitem">
                <div className="hr-stage-bullet">{idx < currentIdx ? '✓' : idx + 1}</div>
                <div className="hr-stage-step-label">{s.label}</div>
                {idx < stepperStages.length - 1 && <div className="hr-stage-connector" />}
              </div>
            )
          })}
        </div>

        <div className="hr-stage-guidance">
          <div className="hr-stage-guidance-title">
            Current stage: <strong>{stage.label}</strong>
            {stage.next && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                → Next: {getStageConfig(stage.next).label}
              </span>
            )}
          </div>
          <p className="hr-stage-guidance-desc">{stage.description}</p>
          <ul className="hr-stage-guidance-list">
            {stage.instructions.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
          {primaryDisabled && (
            <div className="hr-stage-block">
              ⚠ Finalize is blocked: <strong>{finalizeBlockedReason}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="hr-card">
        <div className="hr-section-header">Case Details</div>
        <div className="hr-form-row">
          <div><strong>Employee ID:</strong> {kase.employee?.employeeId}</div>
          <div><strong>Position:</strong> {kase.employee?.position || '—'}</div>
          <div><strong>Joining:</strong> {kase.employee?.joiningDate ? new Date(kase.employee.joiningDate).toLocaleDateString() : '—'}</div>
          <div><strong>Notice Period:</strong> {kase.noticePeriodDays} days</div>
          <div><strong>Last Working Date:</strong> {kase.lastWorkingDate ? new Date(kase.lastWorkingDate).toLocaleDateString() : '—'}</div>
          <div><strong>Actual Exit:</strong> {kase.actualExitDate ? new Date(kase.actualExitDate).toLocaleDateString() : '—'}</div>
        </div>
        {kase.reason && <p style={{ marginTop: 10 }}><strong>Reason:</strong> {kase.reason}</p>}
        {kase.status === 'cancelled' && kase.cancellation && (
          <div className="hr-stage-block" style={{ marginTop: 10 }}>
            <div><strong>Cancellation reason:</strong> {kase.cancellation.reason || '—'}</div>
            {kase.cancellation.cancelledAt && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Cancelled {new Date(kase.cancellation.cancelledAt).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="hr-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="hr-section-header" style={{ margin: 0 }}>
            Gratuity Calculation
            {gratuityDone && (
              <span className="hr-badge hr-badge-success" style={{ marginLeft: 8, fontSize: 11 }}>Calculated</span>
            )}
          </div>
          <button
            className="hr-btn hr-btn-primary"
            onClick={() => {
              setGratuityForm({
                basicWage: kase.gratuityCalc?.basicWage ? String(kase.gratuityCalc.basicWage) : '',
                exitDate: kase.lastWorkingDate ? new Date(kase.lastWorkingDate).toISOString().slice(0, 10) : ''
              })
              setShowGratuity(true)
            }}
            disabled={kase.status === 'completed' || kase.status === 'cancelled'}
            title={kase.status === 'completed' ? 'Case is already completed' : kase.status === 'cancelled' ? 'Case is cancelled' : ''}
          >
            {gratuityDone ? 'Recalculate' : 'Calculate'}
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '6px 0 10px' }}>
          UAE EOSB rule: 21 days basic per year for the first 5 years, 30 days per year after, capped at 24 months. Less than 1 year of service ⇒ no gratuity. The figure is saved against the case and used in the final settlement.
        </p>
        {gratuityDone ? (
          <div className="hr-form-row" style={{ marginTop: 10 }}>
            <div><strong>Years of Service:</strong> {kase.gratuityCalc.yearsOfService}</div>
            <div><strong>Basic Wage:</strong> AED {kase.gratuityCalc.basicWage}</div>
            <div><strong>First 5 yr days:</strong> {kase.gratuityCalc.first5YearsDays}</div>
            <div><strong>After 5 yr days:</strong> {kase.gratuityCalc.after5YearsDays}</div>
            <div><strong>Gross:</strong> AED {kase.gratuityCalc.grossGratuity}</div>
            <div><strong>Cap (24 months):</strong> AED {kase.gratuityCalc.capAmount}</div>
            <div style={{ gridColumn: '1 / -1' }}>
              <strong>Final Gratuity:</strong>{' '}
              <span style={{ color: '#10b981', fontWeight: 600 }}>AED {kase.gratuityCalc.finalGratuity}</span>
              {kase.gratuityCalc.calculatedAt && (
                <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}>
                  · calculated {new Date(kase.gratuityCalc.calculatedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>Not calculated yet — press Calculate when you have the final basic wage and exit date.</p>
        )}
      </div>

      <div className="hr-card">
        <div className="hr-section-header">
          Clearance Checklist
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
            {checklistDoneCount} of {checklistTotal} returned
          </span>
        </div>
        {kase.status === 'initiated' && (
          <div className="hr-stage-block" style={{ marginBottom: 12 }}>
            Items are locked until you press <strong>Start Clearance</strong>. This keeps the Initiated → In Clearance transition explicit.
          </div>
        )}
        {kase.clearanceChecklist.map(c => (
          <div key={c.item} className={`hr-checklist-item ${c.returned ? 'done' : ''}`}>
            <input
              type="checkbox"
              checked={c.returned}
              onChange={() => toggleClearance(c.item)}
              disabled={kase.status === 'initiated' || kase.status === 'completed' || kase.status === 'cancelled'}
            />
            <span className="hr-checklist-label">{c.item}</span>
            {c.returnedAt && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {new Date(c.returnedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        ))}
      </div>

      {showGratuity && (
        <div className="hr-modal-overlay" onClick={() => !calcLoading && setShowGratuity(false)}>
          <div className="hr-modal" onClick={e => e.stopPropagation()}>
            <h3>Calculate Gratuity</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Leave fields empty to use the employee's offer-letter basic salary and the case's last working date. The calculated figure is saved against the case and shown above.
            </p>
            <form onSubmit={calculate}>
              <div className="hr-form-row">
                <div className="hr-form-field">
                  <label>Basic Wage (AED)</label>
                  <input
                    type="number"
                    placeholder={kase.employee?.offerLetter?.basicSalary || ''}
                    value={gratuityForm.basicWage}
                    onChange={e => setGratuityForm({ ...gratuityForm, basicWage: e.target.value })}
                  />
                </div>
                <div className="hr-form-field">
                  <label>Exit Date</label>
                  <input
                    type="date"
                    value={gratuityForm.exitDate}
                    onChange={e => setGratuityForm({ ...gratuityForm, exitDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="hr-form-actions">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setShowGratuity(false)} disabled={calcLoading}>Cancel</button>
                <button type="submit" className="hr-btn hr-btn-primary" disabled={calcLoading}>
                  {calcLoading ? 'Calculating…' : 'Calculate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmState.open && (
        <div className="hr-modal-overlay" onClick={() => !confirmState.loading && setConfirmState({ open: false, action: null })}>
          <div className="hr-modal" onClick={e => e.stopPropagation()}>
            <h3>{stageActionTitle(confirmState.action)}</h3>
            <p style={{ lineHeight: 1.5 }}>{stageActionDescription(confirmState.action)}</p>
            <div className="hr-form-actions">
              <button
                type="button"
                className="hr-btn hr-btn-secondary"
                onClick={() => setConfirmState({ open: false, action: null })}
                disabled={confirmState.loading}
              >Cancel</button>
              <button
                type="button"
                className="hr-btn hr-btn-success"
                onClick={runStageAction}
                disabled={confirmState.loading}
              >{confirmState.loading ? 'Working…' : 'Continue'}</button>
            </div>
          </div>
        </div>
      )}

      {cancelState.open && (
        <div className="hr-modal-overlay" onClick={() => !cancelState.loading && setCancelState({ open: false, reason: '', loading: false })}>
          <div className="hr-modal" onClick={e => e.stopPropagation()}>
            <h3>Cancel offboarding?</h3>
            <p style={{ lineHeight: 1.5 }}>
              This will close the case without completing the exit. The case moves to the <strong>Cancelled</strong> stage and <strong>{kase.employee?.fullName || 'the employee'}</strong>'s status is restored from <em>Offboarding</em> back to <em>Active</em> so they keep their access. Already calculated gratuity and ticked clearance items remain on the record for audit purposes.
            </p>
            <div className="hr-form-field" style={{ marginTop: 10 }}>
              <label>Reason for cancellation <span style={{ color: '#dc2626' }}>*</span></label>
              <textarea
                rows={3}
                value={cancelState.reason}
                onChange={e => setCancelState(s => ({ ...s, reason: e.target.value }))}
                placeholder="e.g. Employee withdrew resignation, termination rescinded, error during initiation…"
              />
            </div>
            <div className="hr-form-actions">
              <button
                type="button"
                className="hr-btn hr-btn-secondary"
                onClick={() => setCancelState({ open: false, reason: '', loading: false })}
                disabled={cancelState.loading}
              >Back</button>
              <button
                type="button"
                className="hr-btn hr-btn-danger"
                onClick={cancelCase}
                disabled={cancelState.loading || !cancelState.reason.trim()}
              >{cancelState.loading ? 'Cancelling…' : 'Cancel Offboarding'}</button>
            </div>
          </div>
        </div>
      )}

      {notify.open && (
        <div className="hr-modal-overlay" onClick={() => setNotify({ ...notify, open: false })}>
          <div className="hr-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{
              color: notify.tone === 'error' ? '#dc2626' : notify.tone === 'success' ? '#15803d' : 'inherit'
            }}>{notify.title}</h3>
            <p style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{notify.message}</p>
            <div className="hr-form-actions">
              <button className="hr-btn hr-btn-primary" onClick={() => setNotify({ ...notify, open: false })}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
