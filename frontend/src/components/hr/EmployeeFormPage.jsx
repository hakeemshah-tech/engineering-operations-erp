import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import LocationPicker from '../locations/LocationPicker'
import LocationGroupPicker from '../locations/LocationGroupPicker'
import './hr.css'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
const photoSrc = (url) => {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
}

const DEFAULT_FORM = {
  fullName: '',
  email: '',
  phone: '',
  dob: '',
  nationality: '',
  gender: '',
  photoUrl: '',
  category: 'office',
  otEligible: false,
  position: '',
  department: '',
  joiningDate: '',
  probationEndDate: '',
  notes: '',
  baseLocationId: '',
  additionalLocationIds: [],
  locationGroupId: '',
  workflow: { type: 'overseas' },
  offerLetter: {
    basicSalary: '',
    housingAllowance: '',
    transportAllowance: '',
    otherAllowances: '',
    issueDate: '',
    acceptanceDate: '',
    signed: false
  },
  contract: {
    mohreContractNumber: '',
    type: 'limited',
    startDate: '',
    endDate: ''
  },
  documents: {
    passport: { number: '', expiryDate: '' },
    visa: { number: '', type: '', issueDate: '', expiryDate: '' },
    labourCard: { number: '', expiryDate: '' },
    emiratesId: { number: '', expiryDate: '' },
    insurance: { provider: '', policyNumber: '', expiryDate: '' }
  }
}

function toDateInput(v) {
  if (!v) return ''
  return new Date(v).toISOString().slice(0, 10)
}

export default function EmployeeFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [locations, setLocations] = useState([])
  const [locationGroups, setLocationGroups] = useState([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const [locRes, grpRes] = await Promise.all([
          api.get('/api/locations',       { params: { status: 'active' } }),
          api.get('/api/location-groups', { params: { status: 'active' } })
        ])
        setLocations(Array.isArray(locRes.data) ? locRes.data : [])
        setLocationGroups(Array.isArray(grpRes.data) ? grpRes.data : [])
      } catch {
        setLocations([])
        setLocationGroups([])
      }
    })()
  }, [])

  useEffect(() => {
    if (!isEdit) return
    ;(async () => {
      try {
        const res = await api.get(`/api/employees/${id}`)
        const e = res.data
        setForm({
          ...DEFAULT_FORM,
          ...e,
          dob: toDateInput(e.dob),
          joiningDate: toDateInput(e.joiningDate),
          probationEndDate: toDateInput(e.probationEndDate),
          workflow: { type: e.workflow?.type || 'overseas' },
          // Location fields may be populated objects on the server - normalize to ID strings
          baseLocationId: typeof e.baseLocationId === 'object' ? String(e.baseLocationId?._id || '') : (e.baseLocationId || ''),
          locationGroupId: typeof e.locationGroupId === 'object' ? String(e.locationGroupId?._id || '') : (e.locationGroupId || ''),
          additionalLocationIds: (e.additionalLocationIds || []).map(l => typeof l === 'object' ? String(l._id) : String(l)),
          offerLetter: {
            ...DEFAULT_FORM.offerLetter,
            ...(e.offerLetter || {}),
            issueDate: toDateInput(e.offerLetter?.issueDate),
            acceptanceDate: toDateInput(e.offerLetter?.acceptanceDate)
          },
          contract: {
            ...DEFAULT_FORM.contract,
            ...(e.contract || {}),
            startDate: toDateInput(e.contract?.startDate),
            endDate: toDateInput(e.contract?.endDate)
          },
          documents: {
            passport: { number: e.documents?.passport?.number || '', expiryDate: toDateInput(e.documents?.passport?.expiryDate) },
            visa: { number: e.documents?.visa?.number || '', type: e.documents?.visa?.type || '', issueDate: toDateInput(e.documents?.visa?.issueDate), expiryDate: toDateInput(e.documents?.visa?.expiryDate) },
            labourCard: { number: e.documents?.labourCard?.number || '', expiryDate: toDateInput(e.documents?.labourCard?.expiryDate) },
            emiratesId: { number: e.documents?.emiratesId?.number || '', expiryDate: toDateInput(e.documents?.emiratesId?.expiryDate) },
            insurance: { provider: e.documents?.insurance?.provider || '', policyNumber: e.documents?.insurance?.policyNumber || '', expiryDate: toDateInput(e.documents?.insurance?.expiryDate) }
          }
        })
      } catch (err) {
        setNotify({ open: true, title: 'Error', message: 'Failed to load employee' })
      }
    })()
  }, [id])

  const upd = (path, value) => {
    setForm(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const parts = path.split('.')
      let ref = next
      for (let i = 0; i < parts.length - 1; i++) {
        ref[parts[i]] = ref[parts[i]] || {}
        ref = ref[parts[i]]
      }
      ref[parts[parts.length - 1]] = value
      return next
    })
  }

  const onPickPhoto = async (file) => {
    if (!file) return
    if (!isEdit) {
      setPhotoError('Save the employee first, then you can upload a photo.')
      return
    }
    const maxBytes = 5 * 1024 * 1024
    if (file.size > maxBytes) {
      setPhotoError('Photo must be 5 MB or smaller.')
      return
    }
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      setPhotoError('Photo must be a JPEG, PNG, or WebP image.')
      return
    }
    setPhotoUploading(true)
    setPhotoError('')
    try {
      const fd = new FormData()
      fd.append('photo', file)
      const res = await api.post(`/api/employees/${id}/photo`, fd)
      setForm(prev => ({ ...prev, photoUrl: res.data.photoUrl || '' }))
    } catch (err) {
      setPhotoError(err?.response?.data?.message || 'Photo upload failed.')
    } finally {
      setPhotoUploading(false)
    }
  }

  const removePhoto = async () => {
    if (!isEdit || !form.photoUrl) return
    setPhotoUploading(true)
    setPhotoError('')
    try {
      await api.delete(`/api/employees/${id}/photo`)
      setForm(prev => ({ ...prev, photoUrl: '' }))
    } catch (err) {
      setPhotoError(err?.response?.data?.message || 'Could not delete photo.')
    } finally {
      setPhotoUploading(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.fullName || !form.category || !form.workflow.type) {
      setNotify({ open: true, title: 'Validation', message: 'Full name, category, and workflow type are required.' })
      return
    }
    try {
      setSaving(true)
      const payload = { ...form }
      if (isEdit) {
        await api.put(`/api/employees/${id}`, payload)
      } else {
        await api.post('/api/employees', payload)
      }
      navigate('/hr/employees')
    } catch (err) {
      setNotify({ open: true, title: 'Error', message: err.response?.data?.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h2>{isEdit ? 'Edit Employee' : 'New Employee'}</h2>
          <p>Capture employee details, offer letter, contract, and documents.</p>
        </div>
        <button className="hr-btn hr-btn-secondary" onClick={() => navigate('/hr/employees')}>Cancel</button>
      </div>

      <form onSubmit={submit}>
        <div className="hr-card">
          <div className="hr-section-header">Personal</div>

          <div className="hr-form-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 auto', marginRight: 14 }}>
              <label style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--text-muted)',
                marginBottom: 6
              }}>Profile Photo</label>
              <div style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: 'var(--input, #f1f5f9)',
                border: '1px solid var(--border)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: 36,
                fontWeight: 600,
                position: 'relative'
              }}>
                {form.photoUrl ? (
                  <img
                    src={photoSrc(form.photoUrl)}
                    alt={form.fullName || 'Employee photo'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span>{(form.fullName || '?').trim().charAt(0).toUpperCase()}</span>
                )}
                {photoUploading && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.45)',
                    color: '#fff',
                    fontSize: 11,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>Uploading…</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <label
                  className="hr-btn hr-btn-secondary"
                  style={{
                    cursor: isEdit && !photoUploading ? 'pointer' : 'not-allowed',
                    opacity: isEdit && !photoUploading ? 1 : 0.55,
                    fontSize: 12,
                    padding: '5px 10px'
                  }}
                  title={!isEdit ? 'Save the employee first to enable photo upload' : ''}
                >
                  {form.photoUrl ? 'Change' : 'Upload'}
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    style={{ display: 'none' }}
                    disabled={!isEdit || photoUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      onPickPhoto(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                {form.photoUrl && (
                  <button
                    type="button"
                    className="hr-btn hr-btn-danger"
                    style={{ fontSize: 12, padding: '5px 10px' }}
                    onClick={removePhoto}
                    disabled={photoUploading}
                  >
                    Remove
                  </button>
                )}
              </div>
              {!isEdit && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, maxWidth: 140 }}>
                  Save the employee first to enable photo upload.
                </div>
              )}
              {photoError && (
                <div style={{ fontSize: 11, color: '#dc2626', marginTop: 6, maxWidth: 140 }}>
                  {photoError}
                </div>
              )}
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {isEdit && form.userId && (
                <div style={{
                  gridColumn: '1 / -1',
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.25)',
                  fontSize: 12,
                  color: 'var(--text)',
                  lineHeight: 1.5
                }}>
                  🔗 This employee is linked to a user account. Changes to <strong>Full Name</strong> or <strong>Email</strong> will also update their login record in User Management.
                </div>
              )}
              <div className="hr-form-field">
                <label>Full Name *</label>
                <input value={form.fullName} onChange={e => upd('fullName', e.target.value)} required />
              </div>
              <div className="hr-form-field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => upd('email', e.target.value)} />
              </div>
              <div className="hr-form-field">
                <label>Phone</label>
                <input value={form.phone} onChange={e => upd('phone', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="hr-form-row">
            <div className="hr-form-field">
              <label>Date of Birth</label>
              <input type="date" value={form.dob} onChange={e => upd('dob', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Nationality</label>
              <input value={form.nationality} onChange={e => upd('nationality', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Gender</label>
              <select value={form.gender || ''} onChange={e => upd('gender', e.target.value)}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-section-header">Employment</div>
          <div className="hr-form-row">
            <div className="hr-form-field">
              <label>Category *</label>
              <select value={form.category} onChange={e => upd('category', e.target.value)} required>
                <option value="site_company_visa">Site — Company Visa</option>
                <option value="site_mission_visa">Site — Mission Visa</option>
                <option value="office">Office</option>
              </select>
            </div>
            <div className="hr-form-field">
              <label>Workflow Type *</label>
              <select value={form.workflow.type} onChange={e => upd('workflow.type', e.target.value)} required>
                <option value="overseas">Overseas</option>
                <option value="uae_transfer">UAE Transfer</option>
                <option value="emirati">Emirati</option>
              </select>
            </div>
            <div className="hr-form-field">
              <label>Position</label>
              <input value={form.position} onChange={e => upd('position', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Department</label>
              <input value={form.department} onChange={e => upd('department', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Joining Date</label>
              <input type="date" value={form.joiningDate} onChange={e => upd('joiningDate', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Probation End Date</label>
              <input type="date" value={form.probationEndDate} onChange={e => upd('probationEndDate', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.otEligible} onChange={e => upd('otEligible', e.target.checked)} />
                OT Eligible
              </label>
            </div>
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-section-header">Location & Punch Settings</div>
          <div className="hr-loc-grid">
            <div className="hr-loc-cell">
              <label className="hr-loc-label">Base Location (for GPS punch)</label>
              <LocationPicker
                mode="single"
                selectedId={form.baseLocationId || ''}
                onChange={(id) => upd('baseLocationId', id || '')}
                pageSize={8}
                allowClear={true}
                emptyText="No locations available — add one in Locations first."
              />
              <div className="hr-loc-hint">
                GPS anchor used when the employee has no active project site.
              </div>
            </div>
            <div className="hr-loc-cell">
              <label className="hr-loc-label">Location Group</label>
              <LocationGroupPicker
                selectedId={form.locationGroupId || ''}
                onChange={(id) => upd('locationGroupId', id || '')}
                pageSize={8}
                allowClear={true}
                emptyText="No location groups defined yet — create one in Location Groups first."
              />
              <div className="hr-loc-hint">
                Inherits punch eligibility from every location in the group. Best for multi-office or WFH staff.
              </div>
            </div>
            <div className="hr-loc-cell">
              <label className="hr-loc-label">Additional Locations (besides Base)</label>
              <LocationPicker
                mode="multi"
                selectedIds={form.additionalLocationIds || []}
                onChange={(ids) => upd('additionalLocationIds', ids)}
                pageSize={8}
                emptyText="No locations match the current filters."
              />
              <div className="hr-loc-hint">
                For employees who split time across a small set of specific locations. Use a Location Group for larger sets.
              </div>
            </div>
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-section-header">Offer Letter (AED)</div>
          <div className="hr-form-row">
            <div className="hr-form-field">
              <label>Basic Salary</label>
              <input type="number" value={form.offerLetter.basicSalary} onChange={e => upd('offerLetter.basicSalary', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Housing Allowance</label>
              <input type="number" value={form.offerLetter.housingAllowance} onChange={e => upd('offerLetter.housingAllowance', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Transport Allowance</label>
              <input type="number" value={form.offerLetter.transportAllowance} onChange={e => upd('offerLetter.transportAllowance', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Other Allowances</label>
              <input type="number" value={form.offerLetter.otherAllowances} onChange={e => upd('offerLetter.otherAllowances', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Issue Date</label>
              <input type="date" value={form.offerLetter.issueDate} onChange={e => upd('offerLetter.issueDate', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Acceptance Date</label>
              <input type="date" value={form.offerLetter.acceptanceDate} onChange={e => upd('offerLetter.acceptanceDate', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.offerLetter.signed} onChange={e => upd('offerLetter.signed', e.target.checked)} />
                Signed
              </label>
            </div>
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-section-header">MOHRE Contract</div>
          <div className="hr-form-row">
            <div className="hr-form-field">
              <label>Contract Number</label>
              <input value={form.contract.mohreContractNumber} onChange={e => upd('contract.mohreContractNumber', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Type</label>
              <select value={form.contract.type} onChange={e => upd('contract.type', e.target.value)}>
                <option value="limited">Limited</option>
                <option value="unlimited">Unlimited</option>
              </select>
            </div>
            <div className="hr-form-field">
              <label>Start Date</label>
              <input type="date" value={form.contract.startDate} onChange={e => upd('contract.startDate', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>End Date</label>
              <input type="date" value={form.contract.endDate} onChange={e => upd('contract.endDate', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-section-header">Documents</div>
          <div className="hr-form-row">
            <div className="hr-form-field">
              <label>Passport No.</label>
              <input value={form.documents.passport.number} onChange={e => upd('documents.passport.number', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Passport Expiry</label>
              <input type="date" value={form.documents.passport.expiryDate} onChange={e => upd('documents.passport.expiryDate', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Visa No.</label>
              <input value={form.documents.visa.number} onChange={e => upd('documents.visa.number', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Visa Expiry</label>
              <input type="date" value={form.documents.visa.expiryDate} onChange={e => upd('documents.visa.expiryDate', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Labour Card No.</label>
              <input value={form.documents.labourCard.number} onChange={e => upd('documents.labourCard.number', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Labour Card Expiry</label>
              <input type="date" value={form.documents.labourCard.expiryDate} onChange={e => upd('documents.labourCard.expiryDate', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Emirates ID No.</label>
              <input value={form.documents.emiratesId.number} onChange={e => upd('documents.emiratesId.number', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Emirates ID Expiry</label>
              <input type="date" value={form.documents.emiratesId.expiryDate} onChange={e => upd('documents.emiratesId.expiryDate', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Insurance Provider</label>
              <input value={form.documents.insurance.provider} onChange={e => upd('documents.insurance.provider', e.target.value)} />
            </div>
            <div className="hr-form-field">
              <label>Insurance Expiry</label>
              <input type="date" value={form.documents.insurance.expiryDate} onChange={e => upd('documents.insurance.expiryDate', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-section-header">Notes</div>
          <div className="hr-form-field">
            <textarea value={form.notes} onChange={e => upd('notes', e.target.value)} placeholder="Additional notes…" />
          </div>
        </div>

        <div className="hr-form-actions">
          <button type="button" className="hr-btn hr-btn-secondary" onClick={() => navigate('/hr/employees')}>Cancel</button>
          <button type="submit" className="hr-btn hr-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Update Employee' : 'Create Employee')}
          </button>
        </div>
      </form>

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
