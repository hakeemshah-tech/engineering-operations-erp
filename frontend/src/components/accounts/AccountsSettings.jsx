import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Spinner } from '../LoadingComponents'

const DEFAULTS = {
  price3WayTolerancePct: 2,
  qty3WayToleranceAbs: 0,
  vat3WayTolerancePct: 2,
  otWeekdayMultiplier: 1.25,
  otRestDayMultiplier: 1.50,
  workingHoursPerDay: 8
}

export default function AccountsSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...DEFAULTS })
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [updatedAt, setUpdatedAt] = useState(null)

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canEdit = ['admin', 'manager', 'account_manager'].some(r => roles.includes(r))

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const res = await api.get('/api/system-settings')
      const acc = res.data?.accounts || {}
      setForm({
        price3WayTolerancePct: acc.price3WayTolerancePct ?? DEFAULTS.price3WayTolerancePct,
        qty3WayToleranceAbs: acc.qty3WayToleranceAbs ?? DEFAULTS.qty3WayToleranceAbs,
        vat3WayTolerancePct: acc.vat3WayTolerancePct ?? DEFAULTS.vat3WayTolerancePct,
        otWeekdayMultiplier: acc.otWeekdayMultiplier ?? DEFAULTS.otWeekdayMultiplier,
        otRestDayMultiplier: acc.otRestDayMultiplier ?? DEFAULTS.otRestDayMultiplier,
        workingHoursPerDay: acc.workingHoursPerDay ?? DEFAULTS.workingHoursPerDay
      })
      setUpdatedAt(res.data?.updatedAt)
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    try {
      setSaving(true)
      const payload = { accounts: { ...form } }
      const res = await api.put('/api/system-settings', payload)
      setUpdatedAt(res.data?.updatedAt)
      setNotify({ open: true, title: 'Saved', message: 'Settings updated. Compute jobs pick this up within 30 seconds.' })
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Failed' })
    } finally {
      setSaving(false)
    }
  }

  function resetDefaults() {
    setForm({ ...DEFAULTS })
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /><p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Loading settings...</p></div>
  }

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: 'var(--text)' }}>Accounts Settings</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
          Tolerances for 3-way matching and UAE Labour Law overtime multipliers. Changes take effect on the next compute run.
        </p>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text)' }}>3-Way Match Tolerances</h3>
        <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13 }}>
          When a Supplier Bill is entered, these tolerances decide whether the bill's price / quantity / VAT is close enough to the PO + GRN to auto-match.
          Variances beyond tolerance create a match exception that blocks posting until resolved.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Field label="Price variance %" value={form.price3WayTolerancePct}
            onChange={v => setForm({ ...form, price3WayTolerancePct: v })}
            disabled={!canEdit} min={0} max={100} step={0.5}
            hint="Default 2% — supplier's unit price may differ from PO by up to this amount" />
          <Field label="Quantity absolute" value={form.qty3WayToleranceAbs}
            onChange={v => setForm({ ...form, qty3WayToleranceAbs: v })}
            disabled={!canEdit} min={0} step={0.1}
            hint="Default 0 — bill qty must match GRN exactly. Raise to allow partial deliveries." />
          <Field label="VAT variance %" value={form.vat3WayTolerancePct}
            onChange={v => setForm({ ...form, vat3WayTolerancePct: v })}
            disabled={!canEdit} min={0} max={100} step={0.5}
            hint="Default 2% — bill VAT amount may differ from expected by this much" />
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text)' }}>UAE Labour Law — Overtime</h3>
        <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13 }}>
          Used by Salary Preparation to compute OT pay. UAE Labour Law Article 65 specifies 1.25× on weekdays and 1.5× on rest days / public holidays.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Field label="Weekday OT multiplier" value={form.otWeekdayMultiplier}
            onChange={v => setForm({ ...form, otWeekdayMultiplier: v })}
            disabled={!canEdit} min={1} step={0.05}
            hint="1.25× standard; increase only with HR/legal sign-off" />
          <Field label="Rest-day OT multiplier" value={form.otRestDayMultiplier}
            onChange={v => setForm({ ...form, otRestDayMultiplier: v })}
            disabled={!canEdit} min={1} step={0.05}
            hint="1.50× standard for Saturday / Sunday / holidays" />
          <Field label="Working hours per day" value={form.workingHoursPerDay}
            onChange={v => setForm({ ...form, workingHoursPerDay: v })}
            disabled={!canEdit} min={1} max={24} step={0.5}
            hint="Default 8. Drives hourly-rate calculation and attendance OT threshold. Mirrored to Attendance → Standard workday cap on save — editing either field updates both." />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {updatedAt && `Last updated ${new Date(updatedAt).toLocaleString()}`}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {canEdit && (
            <>
              <button className="cancel-btn" onClick={resetDefaults} disabled={saving}>Reset to Defaults</button>
              <button className="save-btn" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </>
          )}
          {!canEdit && (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Read-only (needs admin / manager / account_manager to edit)
            </span>
          )}
        </div>
      </div>

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

function Field({ label, value, onChange, disabled, hint, min, max, step }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        min={min} max={max} step={step}
        style={{ fontFamily: 'monospace' }}
      />
      {hint && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{hint}</p>}
    </div>
  )
}
