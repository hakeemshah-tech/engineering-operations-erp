import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Modal } from '../../design-system/Modal'
import { FormField, FormRow, FormSection } from '../../design-system/FormField'
import { getUser } from '../../lib/roles'
import { userRoleWeight } from '../../lib/roleWeights'
import { api } from '../../lib/api'
import LocationPicker from './LocationPicker'
import DependencyConfirmationModal from './DependencyConfirmationModal'
import './locations.css'

const TYPE_OPTIONS = [
  { value: 'mixed',  label: 'Mixed (offices + sites + remote)' },
  { value: 'office', label: 'Office locations only' },
  { value: 'site',   label: 'Project sites only' },
  { value: 'remote', label: 'Remote / WFH only' }
]

const STATUS_OPTIONS = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
]

const emptyForm = {
  name: '',
  description: '',
  type: 'mixed',
  locationIds: [],
  status: 'active'
}

export default function LocationGroupForm({ isOpen, mode = 'create', initial = null, locations = [], onClose, onSubmit }) {
  const currentUser = useMemo(() => getUser(), [])
  const myWeight = useMemo(() => userRoleWeight(currentUser), [currentUser])
  const lockedAgainstMe = !!(initial && initial.lockedByRoleWeight > myWeight)

  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')

  // Edit-mode confirmation modal - same pattern as LocationForm. Pending
  // payload is parked in a ref so the modal's confirm handler can save
  // without retraversing the form state.
  const [depsOpen, setDepsOpen] = useState(false)
  const [depsLoading, setDepsLoading] = useState(false)
  const [depsData, setDepsData] = useState(null)
  const pendingPayloadRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    if (mode === 'edit' && initial) {
      setForm({
        name: initial.name ?? '',
        description: initial.description ?? '',
        type: initial.type ?? 'mixed',
        locationIds: (initial.locationIds || []).map(l => typeof l === 'object' ? String(l._id) : String(l)),
        status: initial.status ?? 'active'
      })
    } else {
      setForm(emptyForm)
    }
    setError('')
    setSearch('')
  }, [isOpen, mode, initial])

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const toggleLocation = (locId) => {
    setForm(prev => {
      const has = prev.locationIds.includes(locId)
      return {
        ...prev,
        locationIds: has
          ? prev.locationIds.filter(id => id !== locId)
          : [...prev.locationIds, locId]
      }
    })
  }

  const visibleLocations = useMemo(() => {
    const term = search.trim().toLowerCase()
    let list = locations
    // When type is restricted, only show locations of that type
    if (form.type !== 'mixed') {
      list = list.filter(l => l.type === form.type)
    }
    if (term) {
      list = list.filter(l =>
        (l.name || '').toLowerCase().includes(term) ||
        (l.address || '').toLowerCase().includes(term)
      )
    }
    return list
  }, [locations, search, form.type])

  const doSave = useCallback(async (payload) => {
    setSubmitting(true)
    try {
      await onSubmit(payload)
      setDepsOpen(false)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.message || 'Save failed.')
      setDepsOpen(false)
    } finally {
      setSubmitting(false)
    }
  }, [onSubmit, onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (lockedAgainstMe) return
    if (!form.name.trim()) { setError('Name is required.'); return }
    setError('')

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      type: form.type,
      locationIds: form.locationIds,
      status: form.status
    }

    if (mode !== 'edit' || !initial?._id) {
      await doSave(payload)
      return
    }

    setDepsLoading(true)
    try {
      const { data } = await api.get(`/api/location-groups/${initial._id}/dependencies`)
      pendingPayloadRef.current = payload
      setDepsData(data)
      setDepsOpen(true)
    } catch (err) {
      console.warn('[LocationGroupForm] dependency probe failed, saving without confirmation:', err)
      await doSave(payload)
    } finally {
      setDepsLoading(false)
    }
  }

  const confirmSave = useCallback(() => {
    const payload = pendingPayloadRef.current
    if (!payload) {
      setDepsOpen(false)
      return
    }
    doSave(payload)
  }, [doSave])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit location group' : 'New location group'}
      size="large"
    >
      {lockedAgainstMe && (
        <div className="loc-banner loc-banner-error">
          🔒 This group was set by a higher-ranked role (weight {initial.lockedByRoleWeight}). You can view it but cannot save changes.
        </div>
      )}

      <form onSubmit={handleSubmit} className="loc-form">
        <FormSection title="Identity">
          <FormRow>
            <FormField label="Name" required>
              <input
                type="text"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                disabled={lockedAgainstMe || submitting}
                placeholder="e.g. All UAE Offices"
                required
              />
            </FormField>
            <FormField label="Type">
              <select
                value={form.type}
                onChange={e => update('type', e.target.value)}
                disabled={lockedAgainstMe || submitting}
              >
                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormField>
            <FormField label="Status">
              <select
                value={form.status}
                onChange={e => update('status', e.target.value)}
                disabled={lockedAgainstMe || submitting}
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormField>
          </FormRow>
          <FormField label="Description">
            <textarea
              rows={2}
              value={form.description}
              onChange={e => update('description', e.target.value)}
              disabled={lockedAgainstMe || submitting}
              placeholder="When to use this group, who it covers, etc."
            />
          </FormField>
        </FormSection>

        <FormSection title={`Member locations (${form.locationIds.length} selected)`}>
          <div style={{
            padding: '10px 12px',
            background: 'var(--input)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
            marginBottom: 12,
            lineHeight: 1.5
          }}>
            Employees assigned to this group can punch in at any of these locations. Use the type chips, search, and pagination to find the right ones quickly when the catalog is large. When this group's <strong>Type</strong> is restricted (e.g. "Office locations only"), the picker is locked to that type below.
          </div>
          <LocationPicker
            mode="multi"
            selectedIds={form.locationIds}
            onChange={(ids) => setForm(prev => ({ ...prev, locationIds: ids }))}
            typeFilter={form.type === 'mixed' ? 'mixed' : form.type}
            pageSize={20}
            disabled={lockedAgainstMe || submitting}
            emptyText="No matching locations."
          />
        </FormSection>

        {error && <div className="loc-banner loc-banner-error">{error}</div>}

        <div className="loc-form-actions">
          <button type="button" className="loc-btn loc-btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="loc-btn loc-btn-primary" disabled={lockedAgainstMe || submitting || depsLoading}>
            {depsLoading
              ? 'Checking…'
              : submitting
                ? 'Saving...'
                : (mode === 'edit' ? 'Save changes' : 'Create group')}
          </button>
        </div>
      </form>

      <DependencyConfirmationModal
        isOpen={depsOpen}
        onClose={() => { if (!submitting) setDepsOpen(false) }}
        onConfirm={confirmSave}
        loading={submitting}
        entityType="group"
        entityName={initial?.name || form.name}
        deps={depsData}
      />
    </Modal>
  )
}
