import { useEffect, useState, useMemo } from 'react'
import { api } from '../../lib/api'

/**
 * Attendance v3 - Schedules & Status Engine settings.
 *
 * Surfaces:
 *   - 6 boolean toggles that gate the v3 behaviour (master + per-rule)
 *   - Office schedule card (workdays, start/end, grace, earliest in, latest out)
 *   - Site schedule card (same fields)
 *
 * Keeps things minimal - no per-employee or per-location schedule overrides.
 * Employee category alone picks office vs site at punch time.
 */

const DOW = [
  { value: 0, short: 'Sun' },
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' }
]

const TOGGLES = [
  {
    key: 'autoStatusEnabled',
    label: 'Auto-status engine (nightly status + leave sync)',
    hint: 'Controls the BACKGROUND status engine. When ON, the nightly cron (23:55) walks every active employee and auto-marks Holiday / Weekend / Leave / Absent for the day, and approved leaves automatically write matching attendance rows. When OFF, those two background jobs do not run — attendance stays a manual ledger and approved leaves do not push rows. The individual punch-time rules below (Geofence, Holiday block, Weekend block, Punch window, Late classification) work independently of this switch — toggle each one on or off based on policy.'
  },
  { key: 'enforceGeofence',       label: 'Enforce GPS geofence',            hint: 'When OFF, GPS coordinates are still recorded for audit but punches are not refused based on distance from the assigned location. Selfie + IP Lock + schedule windows still apply. Trade-off: removes the main anti-fraud check.', danger: true },
  { key: 'blockPunchOnHoliday',   label: 'Block GPS punch on holidays',     hint: 'Workers see a holiday banner instead of the Punch button. HR can still add a row via Manual Entry.' },
  { key: 'blockPunchOnWeekend',   label: 'Block GPS punch on weekends',     hint: 'Defined per schedule (Office vs Site). HR can still add a row via Manual Entry.' },
  { key: 'enforcePunchWindow',    label: 'Block too-early punch-in',        hint: 'Refuses punches before "Earliest punch-in". Main control against pre-shift OT fishing.' },
  { key: 'autoClassifyLate',      label: 'Auto-classify Late',              hint: 'Stamps lateMinutes on each punch-in and flips the row to "Late" when minutes exceed the grace period.' },
  { key: 'integrateLeaveRequests', label: 'Auto-mark Leave on approval',     hint: 'When a Leave Request is approved, the matching Attendance rows are upserted to status="leave". Punch wins if the day already has timeLogs.' }
]

function Toggle({ checked, onChange, label, hint, danger }) {
  // The `danger` flag tints the hint amber - used for switches whose OFF
  // state weakens a defence (e.g. disabling the geofence). Visual nudge
  // only; the toggle itself works the same.
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <div>
        <div style={{ fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        <div style={{
          fontSize: 12,
          color: danger && !checked ? '#b45309' : 'var(--text-muted)',
          marginTop: 2
        }}>{hint}</div>
      </div>
    </label>
  )
}

function ScheduleCard({ title, icon, schedule, onChange, disabled }) {
  const toggleDay = (d) => {
    if (disabled) return
    const next = new Set(schedule.workdays || [])
    if (next.has(d)) next.delete(d)
    else next.add(d)
    onChange({ ...schedule, workdays: Array.from(next).sort((a, b) => a - b) })
  }
  const upd = (field, value) => {
    if (disabled) return
    onChange({ ...schedule, [field]: value })
  }
  return (
    <div style={{
      flex: 1,
      minWidth: 320,
      padding: 16,
      border: '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--card)',
      opacity: disabled ? 0.55 : 1
    }}>
      <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
        {icon} {title}
      </div>

      {/* Workdays */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Working days</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DOW.map(d => {
            const on = (schedule.workdays || []).includes(d.value)
            return (
              <button
                type="button"
                key={d.value}
                onClick={() => toggleDay(d.value)}
                disabled={disabled}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: `1px solid ${on ? 'rgba(99,102,241,.55)' : 'var(--border)'}`,
                  background: on ? 'rgba(99,102,241,.15)' : 'var(--input, #f8fafc)',
                  color: 'var(--text)',
                  fontWeight: on ? 600 : 500,
                  fontSize: 12,
                  cursor: disabled ? 'not-allowed' : 'pointer'
                }}
              >{d.short}</button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Shift start</div>
          <input type="time" value={schedule.startTime || ''} onChange={e => upd('startTime', e.target.value)} disabled={disabled}
                 style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input, #f8fafc)', color: 'var(--text)' }} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Shift end</div>
          <input type="time" value={schedule.endTime || ''} onChange={e => upd('endTime', e.target.value)} disabled={disabled}
                 style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input, #f8fafc)', color: 'var(--text)' }} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Earliest punch-in</div>
          <input type="time" value={schedule.earliestPunchIn || ''} onChange={e => upd('earliestPunchIn', e.target.value)} disabled={disabled}
                 style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input, #f8fafc)', color: 'var(--text)' }} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Latest punch-out</div>
          <input type="time" value={schedule.latestPunchOut || ''} onChange={e => upd('latestPunchOut', e.target.value)} disabled={disabled}
                 style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input, #f8fafc)', color: 'var(--text)' }} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            Grace period (minutes after start before "Late" kicks in)
          </div>
          <input type="number" min={0} max={120} value={schedule.graceMinutes ?? 10}
                 onChange={e => upd('graceMinutes', Number(e.target.value))}
                 disabled={disabled}
                 style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input, #f8fafc)', color: 'var(--text)' }} />
        </div>
      </div>
    </div>
  )
}

export default function AttendanceSchedulesSection({ settings, onSaved }) {
  const att = useMemo(() => settings?.attendance || {}, [settings])
  const [toggles, setToggles] = useState({})
  const [office,  setOffice]  = useState({})
  const [site,    setSite]    = useState({})
  // Standard workday cap - anything beyond this is OT. Mirrored on save to
  // Accounts → Working hours per day so attendance OT and payroll OT use
  // the same number (server handles the actual mirror; we send both fields).
  const [workdayHours, setWorkdayHours] = useState(8)
  // Lunch / break-skipped controls - see SystemSettings comment block.
  const [lunch, setLunch] = useState({
    autoDeductLunch: false,
    lunchDeductionMinutes: 60,
    lunchDeductionThresholdHours: 6,
    flagBreakSkipped: false,
    breakSkippedThresholdHours: 6
  })
  // GPS-acquire escape hatches - see SystemSettings comment block.
  const [gpsPolicy, setGpsPolicy] = useState({
    maxPunchAccuracyMeters: 1000,
    allowApproximatePunch: false,
    ipLockSatisfiesGeofence: false
  })
  const [busy,    setBusy]    = useState(false)
  const [msg,     setMsg]     = useState(null)

  useEffect(() => {
    setToggles({
      autoStatusEnabled:      att.autoStatusEnabled === true,
      // enforceGeofence is the only toggle that defaults ON - flip OFF
      // by an explicit `false` only. New settings (undefined) treated as ON.
      enforceGeofence:        att.enforceGeofence !== false,
      blockPunchOnHoliday:    att.blockPunchOnHoliday === true,
      blockPunchOnWeekend:    att.blockPunchOnWeekend === true,
      enforcePunchWindow:     att.enforcePunchWindow === true,
      autoClassifyLate:       att.autoClassifyLate === true,
      integrateLeaveRequests: att.integrateLeaveRequests !== false
    })
    setOffice(att.office || {
      workdays: [0, 1, 2, 3, 4], startTime: '09:00', endTime: '18:00',
      graceMinutes: 10, earliestPunchIn: '08:00', latestPunchOut: '20:00'
    })
    setSite(att.site || {
      workdays: [0, 1, 2, 3, 4, 5, 6], startTime: '07:00', endTime: '17:00',
      graceMinutes: 15, earliestPunchIn: '06:30', latestPunchOut: '19:00'
    })
    setWorkdayHours(Number(att.standardWorkdayHours) || 8)
    setLunch({
      autoDeductLunch:              att.autoDeductLunch === true,
      lunchDeductionMinutes:        Number(att.lunchDeductionMinutes)        || 60,
      lunchDeductionThresholdHours: Number(att.lunchDeductionThresholdHours) || 6,
      flagBreakSkipped:             att.flagBreakSkipped === true,
      breakSkippedThresholdHours:   Number(att.breakSkippedThresholdHours)   || 6
    })
    setGpsPolicy({
      maxPunchAccuracyMeters:   Number(att.maxPunchAccuracyMeters) || 1000,
      allowApproximatePunch:    att.allowApproximatePunch === true,
      ipLockSatisfiesGeofence:  att.ipLockSatisfiesGeofence === true
    })
  }, [att])

  const masterOff = !toggles.autoStatusEnabled

  const save = async () => {
    setBusy(true); setMsg(null)
    // Client-side validation for the workday cap - server checks too, but
    // failing fast keeps the round-trip cheap.
    const cap = Number(workdayHours)
    if (!Number.isFinite(cap) || cap < 1 || cap > 24) {
      setMsg({ type: 'error', text: 'Standard workday cap must be between 1 and 24 hours.' })
      setBusy(false)
      return
    }
    // Cross-validation on lunch - deduction can't exceed the threshold's
    // worth of minutes (e.g. don't deduct 90m from a 60m threshold).
    const dedMin = Number(lunch.lunchDeductionMinutes)
    const dedHrs = Number(lunch.lunchDeductionThresholdHours)
    const skipHrs = Number(lunch.breakSkippedThresholdHours)
    if (lunch.autoDeductLunch) {
      if (!Number.isFinite(dedMin) || dedMin < 0 || dedMin > 180) {
        setMsg({ type: 'error', text: 'Lunch deduction minutes must be 0..180.' })
        setBusy(false); return
      }
      if (!Number.isFinite(dedHrs) || dedHrs < 1 || dedHrs > 24) {
        setMsg({ type: 'error', text: 'Lunch threshold must be 1..24 hours.' })
        setBusy(false); return
      }
      if (dedMin >= dedHrs * 60) {
        setMsg({ type: 'error', text: 'Lunch deduction must be smaller than the threshold window.' })
        setBusy(false); return
      }
    }
    if (lunch.flagBreakSkipped) {
      if (!Number.isFinite(skipHrs) || skipHrs < 1 || skipHrs > 24) {
        setMsg({ type: 'error', text: '"Break skipped" threshold must be 1..24 hours.' })
        setBusy(false); return
      }
    }
    // GPS policy validation
    const maxAcc = Number(gpsPolicy.maxPunchAccuracyMeters)
    if (!Number.isFinite(maxAcc) || maxAcc < 50 || maxAcc > 5000) {
      setMsg({ type: 'error', text: 'Max GPS accuracy must be between 50 and 5000 meters.' })
      setBusy(false); return
    }
    try {
      const res = await api.put('/api/system-settings', {
        attendance: {
          ...toggles,
          office,
          site,
          standardWorkdayHours: cap,
          autoDeductLunch:              lunch.autoDeductLunch,
          lunchDeductionMinutes:        dedMin,
          lunchDeductionThresholdHours: dedHrs,
          flagBreakSkipped:             lunch.flagBreakSkipped,
          breakSkippedThresholdHours:   skipHrs,
          // GPS-acquire escape hatches
          maxPunchAccuracyMeters:       maxAcc,
          allowApproximatePunch:        gpsPolicy.allowApproximatePunch,
          ipLockSatisfiesGeofence:      gpsPolicy.ipLockSatisfiesGeofence
        },
        // Mirrored to payroll automatically by the server, but we also send
        // it here so a fresh load of /api/system-settings shows both fields
        // in sync immediately (no read-after-write race).
        accounts: {
          workingHoursPerDay: cap
        }
      })
      onSaved && onSaved(res.data)
      setMsg({ type: 'success', text: 'Saved.' })
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Save failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      marginTop: 24,
      padding: 18,
      border: '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--card, transparent)'
    }}>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ margin: '0 0 6px', color: 'var(--text)', fontSize: 16 }}>Schedules &amp; status engine</h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          Configure office and site shifts and turn on individual automation rules.
          Holidays are managed under <strong>HR → Holidays</strong>.
        </p>
      </div>

      {/* Master-switch callout - separated from the toggle list so people
          notice it is a kill-switch for the whole automation layer, not just
          another granular rule. */}
      <div style={{
        marginBottom: 14,
        padding: '12px 14px',
        borderRadius: 10,
        background: toggles.autoStatusEnabled ? 'rgba(16,185,129,.08)' : 'rgba(245,158,11,.10)',
        border: `1px solid ${toggles.autoStatusEnabled ? 'rgba(16,185,129,.35)' : 'rgba(245,158,11,.40)'}`,
        color: 'var(--text)',
        fontSize: 13,
        lineHeight: 1.55
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          {toggles.autoStatusEnabled ? '✓ Background status engine is ON' : '⚠ Background status engine is OFF'}
        </div>
        {toggles.autoStatusEnabled ? (
          <>
            The nightly cron (23:55 server time) auto-marks <strong>Holiday</strong>, <strong>Weekend</strong>, <strong>Leave</strong> and <strong>Absent</strong> for every active employee whose row is still blank, and approved leaves push matching attendance rows automatically. The individual punch-time rules below (Geofence, Holiday/Weekend block, Punch window, Late classification) work on their own — toggle each one for the policy you want.
          </>
        ) : (
          <>
            The nightly status cron is skipped — holidays, weekends, leaves and absences are <strong>not</strong> auto-filled; HR sees empty rows unless someone enters them manually, and approved leaves do not push attendance rows. The individual punch-time rules below still work independently — if <em>Block GPS punch on holidays</em> is ticked, punches on holidays are still refused.
          </>
        )}
      </div>

      {/* Toggles */}
      <div style={{ marginBottom: 18 }}>
        {TOGGLES.map(t => (
          <Toggle
            key={t.key}
            checked={toggles[t.key]}
            onChange={(v) => setToggles(prev => ({ ...prev, [t.key]: v }))}
            label={t.label}
            hint={t.hint}
            danger={t.danger}
          />
        ))}
      </div>

      {/* Standard workday cap - drives both attendance OT math and payroll
          hourly rate. Saved in two places (attendance.standardWorkdayHours +
          accounts.workingHoursPerDay) which the server keeps mirrored. */}
      <div style={{
        marginBottom: 18,
        padding: '12px 14px',
        borderRadius: 10,
        background: 'rgba(99,102,241,.06)',
        border: '1px solid rgba(99,102,241,.25)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: '1 1 260px', minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            Standard workday cap
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Worked hours above this become OT. Also used by Salary Preparation
            to convert monthly basic salary into an hourly rate — the two stay
            mirrored so attendance OT and payroll OT always agree.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            min={1}
            max={24}
            step={0.5}
            value={workdayHours}
            onChange={e => setWorkdayHours(e.target.value)}
            style={{
              width: 90,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--input, #f8fafc)',
              color: 'var(--text)',
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums'
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>hours / day</span>
        </div>
      </div>

      {/* ---- Lunch / break-skipped controls ---- *
       * Two independent toggles for the "worker stayed clocked in through
       * lunch" pattern. Auto-deduct silently rewrites payroll; the flag
       * surfaces the behaviour for HR review. Most orgs enable both. */}
      <div style={{
        marginBottom: 18,
        padding: '14px 16px',
        borderRadius: 10,
        background: 'rgba(245,158,11,.06)',
        border: '1px solid rgba(245,158,11,.25)'
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          Lunch &amp; missed-break handling
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          When a worker punches in at 09:00 and punches out at 18:00 without
          ever clocking out for lunch, the lunch hour silently becomes paid
          OT. These two controls address it without changing worker behaviour.
        </div>

        {/* Auto-deduct */}
        <Toggle
          checked={lunch.autoDeductLunch}
          onChange={(v) => setLunch(prev => ({ ...prev, autoDeductLunch: v }))}
          label="Auto-deduct lunch from long continuous sessions"
          hint="When a single uninterrupted punch-in / punch-out session exceeds the threshold below, subtract the lunch minutes from worked time (and add them to recorded break). Doesn't affect days where the worker explicitly punched out for lunch."
        />
        {lunch.autoDeductLunch && (
          <div style={{
            margin: '6px 0 14px 28px',
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--card, transparent)',
            border: '1px dashed var(--border)',
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            alignItems: 'center'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
              Deduct
              <input
                type="number"
                min={0}
                max={180}
                step={5}
                value={lunch.lunchDeductionMinutes}
                onChange={e => setLunch(p => ({ ...p, lunchDeductionMinutes: Number(e.target.value) }))}
                style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input, #f8fafc)', color: 'var(--text)', textAlign: 'right' }}
              />
              minutes
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
              when session ≥
              <input
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={lunch.lunchDeductionThresholdHours}
                onChange={e => setLunch(p => ({ ...p, lunchDeductionThresholdHours: Number(e.target.value) }))}
                style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input, #f8fafc)', color: 'var(--text)', textAlign: 'right' }}
              />
              hours
            </label>
          </div>
        )}

        {/* Flag-for-HR */}
        <Toggle
          checked={lunch.flagBreakSkipped}
          onChange={(v) => setLunch(prev => ({ ...prev, flagBreakSkipped: v }))}
          label="Flag rows where the worker never punched out for lunch"
          hint="Independent of auto-deduct. When the longest continuous session exceeds the threshold AND no break gap exists, the row gets a 'break skipped' flag visible in the Attendance Grid. HR can spot the pattern even when auto-deduct silently fixed the payroll number."
        />
        {lunch.flagBreakSkipped && (
          <div style={{
            margin: '6px 0 0 28px',
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--card, transparent)',
            border: '1px dashed var(--border)',
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            alignItems: 'center'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
              Flag when session ≥
              <input
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={lunch.breakSkippedThresholdHours}
                onChange={e => setLunch(p => ({ ...p, breakSkippedThresholdHours: Number(e.target.value) }))}
                style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input, #f8fafc)', color: 'var(--text)', textAlign: 'right' }}
              />
              hours
            </label>
          </div>
        )}
      </div>

      {/* ---- GPS acquire policy ---- *
       * Three knobs:
       *  1. max accuracy the server will accept on a normal punch
       *  2. opt-in escape hatch for the worker when GPS is too poor
       *  3. silent geofence bypass when the office IP Lock already
       *     proves the worker is on-premises (no need for GPS too) */}
      <div style={{
        marginBottom: 18,
        padding: '14px 16px',
        borderRadius: 10,
        background: 'rgba(56, 189, 248, .06)',
        border: '1px solid rgba(56, 189, 248, .25)'
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          GPS acquire policy
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          PunchPage uses a manual one-shot GPS fetch (worker taps "Get my location"). These settings
          control how strict the accuracy requirement is and what fallbacks workers have when GPS
          signal is weak — particularly important for indoor offices.
        </div>

        {/* Max accuracy - the only "magic number" exposed */}
        <div style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          padding: '8px 0',
          marginBottom: 10
        }}>
          <div style={{ flex: '1 1 280px', minWidth: 220 }}>
            <div style={{ fontWeight: 500, color: 'var(--text)' }}>Maximum acceptable GPS accuracy</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Server rejects punches with accuracy worse than this. 1000 m is a safe default that
              works for most outdoor sites and indoor offices. Tighten only if you have very small
              geofences and reliable outdoor GPS; loosen for predominantly-indoor staff.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              min={50}
              max={5000}
              step={50}
              value={gpsPolicy.maxPunchAccuracyMeters}
              onChange={e => setGpsPolicy(p => ({ ...p, maxPunchAccuracyMeters: Number(e.target.value) }))}
              style={{
                width: 100,
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--input, #f8fafc)',
                color: 'var(--text)',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums'
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>meters</span>
          </div>
        </div>

        <Toggle
          checked={gpsPolicy.allowApproximatePunch}
          onChange={(v) => setGpsPolicy(p => ({ ...p, allowApproximatePunch: v }))}
          label="Allow approximate-position punch when GPS is too imprecise"
          hint="Shows a secondary 'Punch with approximate position' option to workers whose GPS exceeds the max accuracy above. Rows punched this way are flagged for HR review. Recommended for indoor-only offices or sites in concrete buildings where GPS rarely gets a precise fix."
        />
        <Toggle
          checked={gpsPolicy.ipLockSatisfiesGeofence}
          onChange={(v) => setGpsPolicy(p => ({ ...p, ipLockSatisfiesGeofence: v }))}
          label="Office Wi-Fi (IP Lock match) satisfies the GPS geofence"
          hint="When an office worker's network IP matches the allowlist, skip the GPS geofence rejection — the IP is already proof they're on-premises. GPS coordinates are still recorded for audit. Only takes effect when IP Lock is enabled in the section below and the worker's IP matches a real allowlist entry."
        />
      </div>

      {/* Schedule cards */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <ScheduleCard
          title="Office shift"
          icon="🏢"
          schedule={office}
          onChange={setOffice}
          disabled={masterOff}
        />
        <ScheduleCard
          title="Site shift"
          icon="📍"
          schedule={site}
          onChange={setSite}
          disabled={masterOff}
        />
      </div>

      {masterOff && (
        <div style={{
          marginTop: 14,
          padding: '8px 12px',
          borderRadius: 8,
          background: 'rgba(99,102,241,.08)',
          border: '1px solid rgba(99,102,241,.30)',
          color: 'var(--text)',
          fontSize: 13
        }}>
          ℹ Schedules are visible but only take effect once <strong>Auto-status engine</strong> is enabled above.
        </div>
      )}

      {msg && (
        <div style={{
          marginTop: 14,
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 13,
          background: msg.type === 'success' ? 'rgba(34,197,94,.10)' : 'rgba(239,68,68,.10)',
          border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,.40)' : 'rgba(239,68,68,.40)'}`,
          color: 'var(--text)'
        }}>{msg.text}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}
