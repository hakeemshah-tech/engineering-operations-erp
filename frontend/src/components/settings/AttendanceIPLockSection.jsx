import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '../../lib/api'
import './AttendanceIPLockSection.css'

/* ----------------- Client-side IP / CIDR validation ----------------- */
function isIpv4(s) {
  if (typeof s !== 'string') return false
  const p = s.split('.')
  if (p.length !== 4) return false
  for (const part of p) {
    if (!/^\d{1,3}$/.test(part)) return false
    const n = Number(part)
    if (n < 0 || n > 255) return false
  }
  return true
}
function validateEntry(raw) {
  const s = String(raw || '').trim()
  if (!s) return 'Entry is empty.'
  if (s.includes('/')) {
    const [base, pfx] = s.split('/')
    if (!isIpv4(base)) return `"${base}" is not a valid IPv4 address.`
    const n = Number(pfx)
    if (!Number.isInteger(n) || n < 0 || n > 32) return `"/${pfx}" is not a valid CIDR prefix (0–32).`
    return null
  }
  if (!isIpv4(s)) return `"${s}" is not a valid IPv4 address.`
  return null
}

/* ----------------- Small UI atoms ----------------- */

function Callout({ tone = 'info', icon, title, children }) {
  const tones = {
    info:    { bg: 'rgba(99, 102, 241, 0.08)',  border: 'rgba(99, 102, 241, 0.3)',  fg: 'var(--text)' },
    warning: { bg: 'rgba(245, 158, 11, 0.10)',  border: 'rgba(245, 158, 11, 0.40)', fg: '#b45309' },
    danger:  { bg: 'rgba(239, 68, 68, 0.10)',   border: 'rgba(239, 68, 68, 0.40)',  fg: '#b91c1c' },
    success: { bg: 'rgba(16, 185, 129, 0.10)',  border: 'rgba(16, 185, 129, 0.40)', fg: '#047857' }
  }
  const t = tones[tone] || tones.info
  return (
    <div className="ipl-callout" style={{ background: t.bg, borderColor: t.border, color: t.fg }}>
      <div className="ipl-callout-icon" aria-hidden="true">{icon}</div>
      <div className="ipl-callout-body">
        {title && <div className="ipl-callout-title">{title}</div>}
        <div className="ipl-callout-text">{children}</div>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, disabled, label, srLabel }) {
  return (
    <label className={`ipl-toggle ${checked ? 'on' : 'off'} ${disabled ? 'disabled' : ''}`}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={srLabel || label}
      />
      <span className="ipl-toggle-track">
        <span className="ipl-toggle-thumb" />
      </span>
      {label && <span className="ipl-toggle-label">{label}</span>}
    </label>
  )
}

/* ----------------- Confirm modal for enabling the lock ----------------- */

function ConfirmEnableModal({ open, onCancel, onConfirm, currentIp, willMatch, draftCounts }) {
  if (!open) return null
  return (
    <div className="ipl-modal-overlay" onClick={onCancel}>
      <div className="ipl-modal" onClick={e => e.stopPropagation()}>
        <h3>⚠ Enable IP Lock?</h3>
        <p>
          This adds a network-level check <strong>on top of</strong> the GPS geofence for Office
          employees. From this moment on, an Office punch must pass <em>both</em> checks —
          even an in-geofence punch will be rejected if it arrives from a network not on your
          allowlist.
        </p>
        <div className="ipl-modal-checklist">
          <div>You currently have:</div>
          <ul>
            <li>{draftCounts.office} office network{draftCounts.office === 1 ? '' : 's'}</li>
            <li>{draftCounts.remote} remote / WFH network{draftCounts.remote === 1 ? '' : 's'}</li>
            <li>{draftCounts.exempt} user{draftCounts.exempt === 1 ? '' : 's'} fully exempted</li>
          </ul>
        </div>
        {currentIp && (
          <Callout tone={willMatch ? 'success' : 'warning'} icon={willMatch ? '✓' : '⚠'}>
            {willMatch
              ? <>Your current IP <code>{currentIp}</code> matches the allowlist — you will not be blocked.</>
              : <>Your current IP <code>{currentIp}</code> does <strong>not</strong> match the allowlist. You may lock yourself out!</>}
          </Callout>
        )}
        <Callout tone="warning" icon="🔁">
          Recommended: keep an admin signed in on a non-office network (e.g. mobile data)
          so you can disable the lock if something goes wrong.
        </Callout>
        <div className="ipl-modal-actions">
          <button className="ipl-btn ipl-btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className={`ipl-btn ${willMatch ? 'ipl-btn-primary' : 'ipl-btn-danger'}`}
            onClick={onConfirm}
          >
            Yes, enable IP Lock
          </button>
        </div>
      </div>
    </div>
  )
}

/* ----------------- The main section ----------------- */

const EMPTY_REMOTE = { cidr: '', label: '', userId: '' }

export default function AttendanceIPLockSection({ settings, onSaved }) {
  // Draft state - separate from saved settings so we can validate and confirm
  // before committing to the server.
  const initialDraft = useMemo(() => {
    const a = settings?.attendance || {}
    return {
      ipLockEnabled: !!a.ipLockEnabled,
      allowedOfficeNetworks: [...(a.allowedOfficeNetworks || [])],
      allowedRemoteNetworks: (a.allowedRemoteNetworks || []).map(r => ({
        cidr: r.cidr || '',
        label: r.label || '',
        userId: r.userId ? String(r.userId._id || r.userId) : ''
      })),
      ipLockExemptUserIds: (a.ipLockExemptUserIds || []).map(id => String(id._id || id))
    }
  }, [settings])

  const [draft, setDraft] = useState(initialDraft)
  const [savedSnapshot, setSavedSnapshot] = useState(initialDraft)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Helper data
  const [myIp, setMyIp] = useState('')
  const [employees, setEmployees] = useState([])     // active employees for pickers
  const [testIp, setTestIp] = useState('')
  const [testResult, setTestResult] = useState(null)

  /* ----- Bootstrap helpers ----- */
  useEffect(() => {
    // Reset draft whenever the saved settings prop changes (e.g. after fetch)
    setDraft(initialDraft)
    setSavedSnapshot(initialDraft)
  }, [initialDraft])

  useEffect(() => {
    api.get('/api/system-settings/my-ip').then(res => {
      setMyIp(res.data?.ip || '')
    }).catch(() => setMyIp(''))
    api.get('/api/employees', { params: { status: 'active' } }).then(res => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || [])
      setEmployees(list.filter(e => e.userId))   // only employees linked to a user can be exempted
    }).catch(() => setEmployees([]))
  }, [])

  /* ----- Mutators ----- */

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedSnapshot), [draft, savedSnapshot])

  const updateDraft = (patch) => setDraft(prev => ({ ...prev, ...patch }))

  const addOffice = (raw) => {
    const err = validateEntry(raw)
    if (err) { setError(err); return false }
    if (draft.allowedOfficeNetworks.includes(raw.trim())) {
      setError(`"${raw.trim()}" is already in the office list.`); return false
    }
    setError('')
    updateDraft({ allowedOfficeNetworks: [...draft.allowedOfficeNetworks, raw.trim()] })
    return true
  }
  const removeOffice = (i) => updateDraft({
    allowedOfficeNetworks: draft.allowedOfficeNetworks.filter((_, idx) => idx !== i)
  })

  const addRemote = (entry) => {
    const err = validateEntry(entry.cidr)
    if (err) { setError(err); return false }
    if (draft.allowedRemoteNetworks.some(r => r.cidr === entry.cidr.trim())) {
      setError(`"${entry.cidr.trim()}" is already in the remote list.`); return false
    }
    setError('')
    updateDraft({
      allowedRemoteNetworks: [...draft.allowedRemoteNetworks, {
        cidr: entry.cidr.trim(),
        label: (entry.label || '').trim(),
        userId: entry.userId || ''
      }]
    })
    return true
  }
  const removeRemote = (i) => updateDraft({
    allowedRemoteNetworks: draft.allowedRemoteNetworks.filter((_, idx) => idx !== i)
  })

  const addExempt = (userId) => {
    if (!userId) return
    if (draft.ipLockExemptUserIds.includes(userId)) return
    updateDraft({ ipLockExemptUserIds: [...draft.ipLockExemptUserIds, userId] })
  }
  const removeExempt = (userId) => updateDraft({
    ipLockExemptUserIds: draft.ipLockExemptUserIds.filter(id => id !== userId)
  })

  /* ----- "Test this IP" against the SAVED config ----- */
  const runTest = useCallback(async () => {
    setTestResult(null)
    try {
      const res = await api.get('/api/system-settings/attendance/test-ip', {
        params: testIp ? { ip: testIp } : {}
      })
      setTestResult(res.data)
    } catch (err) {
      setTestResult({ error: err?.response?.data?.message || 'Test failed.' })
    }
  }, [testIp])

  /* ----- Save ----- */

  // Predict whether *my current IP* would pass the DRAFT (not saved) config
  const wouldDraftMatch = useMemo(() => {
    if (!myIp) return false
    const all = [
      ...draft.allowedOfficeNetworks,
      ...draft.allowedRemoteNetworks.map(r => r.cidr).filter(Boolean)
    ]
    // Tiny inline IPv4 CIDR matcher reused here to avoid a second round-trip
    if (all.length === 0) return false
    const ipParts = myIp.split('.').map(Number)
    if (ipParts.length !== 4 || ipParts.some(p => Number.isNaN(p))) return false
    const ipInt = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0
    for (const e of all) {
      if (e.includes('/')) {
        const [base, pfx] = e.split('/')
        if (!isIpv4(base)) continue
        const n = Number(pfx)
        const bParts = base.split('.').map(Number)
        const bInt = ((bParts[0] << 24) | (bParts[1] << 16) | (bParts[2] << 8) | bParts[3]) >>> 0
        if (n === 0) return true
        const mask = (0xFFFFFFFF << (32 - n)) >>> 0
        if ((ipInt & mask) === (bInt & mask)) return true
      } else if (e === myIp) {
        return true
      }
    }
    return false
  }, [draft.allowedOfficeNetworks, draft.allowedRemoteNetworks, myIp])

  const draftCounts = useMemo(() => ({
    office: draft.allowedOfficeNetworks.length,
    remote: draft.allowedRemoteNetworks.length,
    exempt: draft.ipLockExemptUserIds.length
  }), [draft])

  const requestEnable = () => {
    if (draftCounts.office + draftCounts.remote + draftCounts.exempt === 0) {
      setError('Add at least one network or exempt user before enabling the lock.')
      return
    }
    setConfirmOpen(true)
  }

  const doSave = async (overrideEnabled) => {
    setSaving(true)
    setError('')
    setSuccess('')
    setConfirmOpen(false)
    try {
      const payload = {
        attendance: {
          ipLockEnabled: typeof overrideEnabled === 'boolean' ? overrideEnabled : draft.ipLockEnabled,
          allowedOfficeNetworks: draft.allowedOfficeNetworks,
          allowedRemoteNetworks: draft.allowedRemoteNetworks.map(r => ({
            cidr: r.cidr,
            label: r.label,
            userId: r.userId || null
          })),
          ipLockExemptUserIds: draft.ipLockExemptUserIds
        }
      }
      const res = await api.put('/api/system-settings', payload)
      setSuccess('Saved.')
      setSavedSnapshot({ ...draft, ipLockEnabled: payload.attendance.ipLockEnabled })
      if (typeof overrideEnabled === 'boolean') {
        setDraft(prev => ({ ...prev, ipLockEnabled: overrideEnabled }))
      }
      if (onSaved) onSaved(res.data)
    } catch (err) {
      setError(err?.response?.data?.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleEnableToggleRequest = (next) => {
    if (next === true) {
      requestEnable()
    } else {
      updateDraft({ ipLockEnabled: false })
    }
  }

  return (
    <div className="ipl-root">
      {/* ============================================================== */}
      {/*  Status banner                                                  */}
      {/* ============================================================== */}
      <div className={`ipl-status ipl-status-${savedSnapshot.ipLockEnabled ? 'on' : 'off'}`}>
        <div className="ipl-status-light" />
        <div className="ipl-status-body">
          <div className="ipl-status-title">
            IP Lock is currently <strong>{savedSnapshot.ipLockEnabled ? 'ENABLED' : 'DISABLED'}</strong>
          </div>
          <div className="ipl-status-sub">
            {savedSnapshot.ipLockEnabled
              ? 'Office-employee punches must pass both the GPS geofence AND your network allowlist. Site employees continue to be validated by GPS only.'
              : 'Network-level enforcement is off. All employees are still validated by the GPS geofence on their assigned location — Office punches can come from any Wi-Fi as long as the geofence passes.'}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/*  How it works - short intro                                     */}
      {/* ============================================================== */}
      <Callout tone="info" icon="ℹ️" title="What this controls">
        <strong>Every employee passes a GPS geofence check first</strong> — site, office, and remote
        alike. IP Lock adds a <strong>second layer</strong> for Office employees (whose category is
        <code>office</code>): when enabled, their punch must arrive from an approved network <em>in
        addition to</em> being within the geofence of their assigned location. Site / field staff
        are not affected by IP Lock — they continue to be validated by GPS alone.
      </Callout>

      {/* ============================================================== */}
      {/*  Before enabling - checklist                                    */}
      {/* ============================================================== */}
      <Callout tone="warning" icon="⚠️" title="IMPORTANT — read before enabling">
        <ol className="ipl-list-ol">
          <li>
            <strong>Add at least one allowed IP first.</strong> Enabling with an empty list will
            block every office employee on their next punch.
          </li>
          <li>
            <strong>Confirm the office public IP.</strong> What you see on your laptop
            (<code>192.168.x.x</code>) is the LAN address — the server sees your office router's
            <em> public</em> IP. Use the "Your current IP" helper below from the office network.
          </li>
          <li>
            <strong>Stay on a fallback channel.</strong> Keep one admin session active on a phone /
            mobile data while testing, so you can disable the lock if it breaks.
          </li>
          <li>
            <strong>Plan for remote workers.</strong> Either add their home IPs to the "Remote / WFH"
            list below, or mark them as exempt — both options are documented in this page.
          </li>
        </ol>
      </Callout>

      {/* ============================================================== */}
      {/*  Your current IP helper                                         */}
      {/* ============================================================== */}
      <div className="ipl-card">
        <div className="ipl-card-header">
          <h4>Your current public IP</h4>
          <p>This is the IP address the server sees from your current connection. Use it to discover
            what to whitelist when you're sitting at the office, or to check whether you'd pass the
            lock from home.</p>
        </div>
        <div className="ipl-myip">
          <code className="ipl-myip-value">{myIp || '— detecting —'}</code>
          {myIp && (
            <>
              <button
                type="button"
                className="ipl-btn ipl-btn-ghost"
                onClick={() => addOffice(myIp)}
                title="Add as a single office IP"
              >
                + Add as Office IP
              </button>
              <button
                type="button"
                className="ipl-btn ipl-btn-ghost"
                onClick={() => {
                  const parts = myIp.split('.')
                  if (parts.length === 4) addOffice(`${parts[0]}.${parts[1]}.${parts[2]}.0/24`)
                }}
                title="Add the whole /24 range (256 addresses)"
              >
                + Add as /24 range
              </button>
            </>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/*  Office networks                                                */}
      {/* ============================================================== */}
      <OfficeNetworksEditor
        list={draft.allowedOfficeNetworks}
        onAdd={addOffice}
        onRemove={removeOffice}
      />

      {/* ============================================================== */}
      {/*  Remote / WFH networks                                          */}
      {/* ============================================================== */}
      <RemoteNetworksEditor
        list={draft.allowedRemoteNetworks}
        employees={employees}
        onAdd={addRemote}
        onRemove={removeRemote}
      />

      {/* ============================================================== */}
      {/*  User exemptions                                                */}
      {/* ============================================================== */}
      <UserExemptionsEditor
        exemptIds={draft.ipLockExemptUserIds}
        employees={employees}
        onAdd={addExempt}
        onRemove={removeExempt}
      />

      {/* ============================================================== */}
      {/*  "Test an IP" tool                                              */}
      {/* ============================================================== */}
      <div className="ipl-card">
        <div className="ipl-card-header">
          <h4>Test an IP against the saved allowlist</h4>
          <p>
            Verifies whether a specific IP <em>would</em> pass the currently <strong>saved</strong>
            settings (not the unsaved draft). Use this to confirm a home IP before you tell an
            employee to start working remotely.
          </p>
        </div>
        <div className="ipl-test">
          <input
            type="text"
            placeholder={`Leave blank to test your current IP (${myIp || '...'})`}
            value={testIp}
            onChange={e => setTestIp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runTest() }}
          />
          <button className="ipl-btn ipl-btn-ghost" onClick={runTest}>Test</button>
        </div>
        {testResult && (
          testResult.error ? (
            <Callout tone="danger" icon="✗">{testResult.error}</Callout>
          ) : (
            <Callout
              tone={testResult.matched ? 'success' : 'warning'}
              icon={testResult.matched ? '✓' : '⚠'}
            >
              <code>{testResult.ip}</code>{' '}
              {testResult.matched ? 'WOULD pass' : 'would NOT pass'} the lock.{' '}
              {testResult.matchedAgainstOffice.length > 0 && <>(office match: <code>{testResult.matchedAgainstOffice[0]}</code>) </>}
              {testResult.matchedAgainstRemote.length > 0 && <>(remote match: <code>{testResult.matchedAgainstRemote[0]}</code>) </>}
              {!testResult.ipLockEnabled && (
                <div style={{ marginTop: 6, fontSize: '0.85rem', opacity: 0.85 }}>
                  Note: the network lock is currently disabled, so this network test isn't enforced —
                  but the GPS geofence is still required for every punch.
                </div>
              )}
            </Callout>
          )
        )}
      </div>

      {/* ============================================================== */}
      {/*  Real-world guidance                                            */}
      {/* ============================================================== */}
      <details className="ipl-card ipl-collapsible">
        <summary>How to handle common situations</summary>
        <div className="ipl-card-body">
          <h5>Single IP vs IP range — which should I add?</h5>
          <p>
            Add a <strong>single IP</strong> if your office router has a static public IP from your
            ISP (most common). Add a <strong>range</strong> (e.g. <code>203.0.113.0/24</code>) only
            if the ISP gave you a static block. CIDR notation <code>/24</code> means "256 consecutive
            addresses"; <code>/32</code> means a single address; <code>/16</code> means 65,536.
          </p>
          <h5>What to do if the office IP changes</h5>
          <p>
            Public IPs can change after ISP outages, router reboots, or service upgrades. If office
            employees suddenly start getting <code>IP_NOT_WHITELISTED</code> errors, an admin should:
          </p>
          <ol>
            <li>Open this Settings page from inside the office and check "Your current public IP" — that's the new value.</li>
            <li>Add it to the Office list and remove the stale entry.</li>
            <li>Notify HR if it might happen frequently — consider asking the ISP for a static IP.</li>
          </ol>
          <h5>Work-from-home — strategies</h5>
          <ul>
            <li>
              <strong>Stable home IP:</strong> add the employee's home IP to the "Remote" list and
              link it to their user. Best for employees with static residential ISPs.
            </li>
            <li>
              <strong>Dynamic home IP:</strong> if the IP changes daily, IP allowlisting is not the
              right tool — use the <strong>User Exemption</strong> list instead. Exempt users still
              capture a selfie and GPS coordinates, just no IP check.
            </li>
            <li>
              <strong>VPN gateway:</strong> if your office requires VPN, whitelist the VPN egress
              IP (single value), not each home IP.
            </li>
            <li>
              <strong>Travelling staff:</strong> always exempt — they roam between cafés, hotels, mobile data.
            </li>
          </ul>
          <h5>GPS geofence is always enforced — IP is the extra layer</h5>
          <p>
            Every employee — Office, Site, and Remote — passes a GPS geofence check on every
            punch. IP Lock runs only <em>after</em> the GPS check, and only for Office
            employees. Even an IP-exempt user must still be within their assigned location's
            geofence and their selfie is still captured. Disabling IP Lock does <strong>not</strong>
            disable the GPS check.
          </p>
          <h5>If you get locked out</h5>
          <p>
            Use a phone on mobile data to log in as admin, open this page, and either disable the
            lock or add your current IP. The toggle takes effect immediately — no server restart.
          </p>
        </div>
      </details>

      {/* ============================================================== */}
      {/*  Master enable/disable + Save                                   */}
      {/* ============================================================== */}
      <div className="ipl-card ipl-master">
        <div className="ipl-master-row">
          <div>
            <h4>Enable IP Lock for office employees</h4>
            <p>
              When <strong>ON</strong>, Office employees must punch from an allowed network in
              addition to passing their GPS geofence. When <strong>OFF</strong>, the network check
              is skipped — but the GPS geofence still applies to every employee, including Office.
            </p>
          </div>
          <Toggle
            checked={draft.ipLockEnabled}
            onChange={handleEnableToggleRequest}
            disabled={saving}
            label={draft.ipLockEnabled ? 'On' : 'Off'}
            srLabel="Enable IP Lock"
          />
        </div>
        {draft.ipLockEnabled && draftCounts.office + draftCounts.remote + draftCounts.exempt === 0 && (
          <Callout tone="danger" icon="⛔">
            You cannot save with the lock enabled and no entries.
            Add at least one allowed IP or an exempt user first.
          </Callout>
        )}

        {error   && <Callout tone="danger"  icon="✗">{error}</Callout>}
        {success && <Callout tone="success" icon="✓">{success}</Callout>}

        <div className="ipl-actions">
          <button
            className="ipl-btn ipl-btn-ghost"
            onClick={() => { setDraft(savedSnapshot); setError(''); setSuccess('') }}
            disabled={!dirty || saving}
          >Reset</button>
          <button
            className="ipl-btn ipl-btn-primary"
            onClick={() => doSave()}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <ConfirmEnableModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { updateDraft({ ipLockEnabled: true }); doSave(true) }}
        currentIp={myIp}
        willMatch={wouldDraftMatch}
        draftCounts={draftCounts}
      />
    </div>
  )
}

/* ============== Office networks editor ============== */
function OfficeNetworksEditor({ list, onAdd, onRemove }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)
  const submit = () => {
    if (!input.trim()) return
    if (onAdd(input.trim())) {
      setInput('')
      inputRef.current?.focus()
    }
  }
  return (
    <div className="ipl-card">
      <div className="ipl-card-header">
        <h4>Office networks <span className="ipl-count">({list.length})</span></h4>
        <p>
          IPs (or CIDR ranges) where your <strong>office Wi-Fi</strong> appears to the server.
          This is the public IP of your office router, <em>not</em> the LAN address shown on a
          laptop. Add one IP per office location.
        </p>
      </div>
      {list.length === 0 ? (
        <div className="ipl-empty">No office networks yet. Use "Add as Office IP" above, or type one below.</div>
      ) : (
        <ul className="ipl-entry-list">
          {list.map((cidr, i) => (
            <li key={i} className="ipl-entry-row">
              <code>{cidr}</code>
              <span className="ipl-entry-meta">{cidr.includes('/') ? 'range' : 'single IP'}</span>
              <button type="button" className="ipl-btn ipl-btn-danger-ghost" onClick={() => onRemove(i)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="ipl-add-row">
        <input
          ref={inputRef}
          type="text"
          placeholder="e.g. 203.0.113.45  or  203.0.113.0/24"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        <button className="ipl-btn ipl-btn-ghost" onClick={submit}>+ Add</button>
      </div>
      <div className="ipl-hint">
        Format examples: <code>203.0.113.45</code> (single) · <code>203.0.113.0/24</code> (whole subnet, 256 IPs)
      </div>
    </div>
  )
}

/* ============== Remote / WFH networks editor ============== */
function RemoteNetworksEditor({ list, employees, onAdd, onRemove }) {
  const [entry, setEntry] = useState({ cidr: '', label: '', userId: '' })
  const submit = () => {
    if (!entry.cidr.trim()) return
    if (onAdd(entry)) setEntry({ cidr: '', label: '', userId: '' })
  }
  const empName = (uid) => {
    const e = employees.find(x => String(x.userId?._id || x.userId) === String(uid))
    return e ? `${e.fullName} (${e.employeeId})` : null
  }
  return (
    <div className="ipl-card">
      <div className="ipl-card-header">
        <h4>Remote / Work-from-home networks <span className="ipl-count">({list.length})</span></h4>
        <p>
          Approved home or VPN IPs for employees who work remotely on a regular basis.
          Each entry is labelled and (optionally) linked to a specific employee so you can clean
          up the list as people change addresses or leave.
        </p>
      </div>
      <Callout tone="info" icon="💡">
        Use this list when an employee has a <strong>stable</strong> home IP. If their IP changes
        frequently (most residential ISPs), prefer the User Exemption section below — it's safer
        and lower-maintenance.
      </Callout>
      {list.length === 0 ? (
        <div className="ipl-empty">No remote networks configured yet.</div>
      ) : (
        <ul className="ipl-entry-list">
          {list.map((r, i) => (
            <li key={i} className="ipl-entry-row ipl-entry-row-stack">
              <div className="ipl-entry-main">
                <code>{r.cidr}</code>
                {r.label && <span className="ipl-entry-label">{r.label}</span>}
              </div>
              <div className="ipl-entry-sub">
                {r.userId ? <>linked to <strong>{empName(r.userId) || 'Unknown user'}</strong></> : <em>not linked to a specific user</em>}
              </div>
              <button type="button" className="ipl-btn ipl-btn-danger-ghost" onClick={() => onRemove(i)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="ipl-add-grid">
        <input
          type="text"
          placeholder="IP or CIDR (e.g. 102.45.78.12)"
          value={entry.cidr}
          onChange={e => setEntry(p => ({ ...p, cidr: e.target.value }))}
        />
        <input
          type="text"
          placeholder="Label (e.g. Ahmad – home)"
          value={entry.label}
          onChange={e => setEntry(p => ({ ...p, label: e.target.value }))}
        />
        <select
          value={entry.userId}
          onChange={e => setEntry(p => ({ ...p, userId: e.target.value }))}
        >
          <option value="">(no specific user)</option>
          {employees.map(emp => (
            <option key={emp._id} value={String(emp.userId?._id || emp.userId)}>
              {emp.fullName} · {emp.employeeId}
            </option>
          ))}
        </select>
        <button className="ipl-btn ipl-btn-ghost" onClick={submit}>+ Add remote IP</button>
      </div>
    </div>
  )
}

/* ============== User exemptions editor ============== */
function UserExemptionsEditor({ exemptIds, employees, onAdd, onRemove }) {
  const [picker, setPicker] = useState('')
  const exemptDetails = exemptIds.map(uid => {
    const e = employees.find(x => String(x.userId?._id || x.userId) === String(uid))
    return { uid, label: e ? `${e.fullName} · ${e.employeeId}` : `User ${uid}` }
  })
  return (
    <div className="ipl-card">
      <div className="ipl-card-header">
        <h4>User exemptions <span className="ipl-count">({exemptIds.length})</span></h4>
        <p>
          Users on this list <strong>bypass the IP check entirely</strong>. They still capture a
          selfie and have their punch coordinates logged. Use for consultants, salesfolk, mobile-only
          staff, and anyone whose home/mobile IP changes too often for the Remote list.
        </p>
      </div>
      <Callout tone="warning" icon="⚠">
        Use sparingly. Each exempt user is a small reduction in the protection IP Lock provides,
        so review this list periodically.
      </Callout>
      {exemptDetails.length === 0 ? (
        <div className="ipl-empty">No exempted users.</div>
      ) : (
        <ul className="ipl-entry-list">
          {exemptDetails.map(({ uid, label }) => (
            <li key={uid} className="ipl-entry-row">
              <span>{label}</span>
              <button type="button" className="ipl-btn ipl-btn-danger-ghost" onClick={() => onRemove(uid)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="ipl-add-row">
        <select value={picker} onChange={e => setPicker(e.target.value)}>
          <option value="">— pick an employee —</option>
          {employees
            .filter(e => !exemptIds.includes(String(e.userId?._id || e.userId)))
            .map(emp => (
              <option key={emp._id} value={String(emp.userId?._id || emp.userId)}>
                {emp.fullName} · {emp.employeeId}
              </option>
            ))}
        </select>
        <button
          className="ipl-btn ipl-btn-ghost"
          onClick={() => { if (picker) { onAdd(picker); setPicker('') } }}
          disabled={!picker}
        >+ Exempt user</button>
      </div>
    </div>
  )
}
