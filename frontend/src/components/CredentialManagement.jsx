import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'
import { Modal } from '../design-system/Modal'
import ExpiryBadge from './ExpiryBadge'
import './CredentialManagement.css'

export default function CredentialManagement() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canManage = roles.includes('admin') || roles.includes('manager')

  const [credentials, setCredentials] = useState([])
  const [loading, setLoading] = useState(true)
  const [notify, setNotify] = useState(null)

  const [filters, setFilters] = useState({
    status: '',
    credentialType: '',
    verificationStatus: '',
    search: ''
  })

  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    credentialName: '',
    credentialType: 'iso_certification',
    issuingAuthority: '',
    description: '',
    issueDate: '',
    expiryDate: '',
    noExpiry: false,
    renewalDate: '',
    coverageScope: '',
    level: '',
    reminderDaysBefore: 30,
    responsiblePerson: user._id || '',
    ownerDepartment: ''
  })

  const [files, setFiles] = useState([])
  const [showRenewModal, setShowRenewModal] = useState(false)
  const [renewData, setRenewData] = useState({ credId: null, newExpiryDate: '', notes: '', renewalFee: '' })
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    fetchCredentials()
  }, [filters, page])

  const fetchCredentials = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page,
        limit: 10,
        ...(filters.status && { status: filters.status }),
        ...(filters.credentialType && { credentialType: filters.credentialType }),
        ...(filters.verificationStatus && { verificationStatus: filters.verificationStatus }),
        ...(filters.search && { search: filters.search })
      })

      const res = await api.get(`/api/credentials?${params}`)
      setCredentials(res.data.items || [])
      setTotal(res.data.total || 0)
      setPages(res.data.pages || 0)
    } catch (error) {
      console.error('Error fetching credentials:', error)
      setNotify({ type: 'error', message: 'Failed to load credentials.' })
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }))
    setPage(1)
  }

  const handleClearFilters = () => {
    setFilters({ status: '', credentialType: '', verificationStatus: '', search: '' })
    setPage(1)
  }

  const handleCreateClick = () => {
    setEditingId(null)
    setFormData({
      credentialName: '',
      credentialType: 'iso_certification',
      issuingAuthority: '',
      description: '',
      issueDate: '',
      expiryDate: '',
      noExpiry: false,
      renewalDate: '',
      coverageScope: '',
      level: '',
      reminderDaysBefore: 30,
      responsiblePerson: user._id || '',
      ownerDepartment: ''
    })
    setFiles([])
    setShowModal(true)
  }

  const handleEditClick = async (credId) => {
    try {
      const res = await api.get(`/api/credentials/${credId}`)
      const cred = res.data
      setEditingId(credId)
      setFormData({
        credentialName: cred.credentialName || '',
        credentialType: cred.credentialType || 'iso_certification',
        issuingAuthority: cred.issuingAuthority || '',
        description: cred.description || '',
        issueDate: cred.issueDate ? cred.issueDate.split('T')[0] : '',
        expiryDate: cred.expiryDate ? cred.expiryDate.split('T')[0] : '',
        noExpiry: cred.noExpiry || false,
        renewalDate: cred.renewalDate ? cred.renewalDate.split('T')[0] : '',
        coverageScope: cred.coverageScope || '',
        level: cred.level || '',
        reminderDaysBefore: cred.reminderDaysBefore || 30,
        responsiblePerson: cred.responsiblePerson?._id || user._id || '',
        ownerDepartment: cred.ownerDepartment || ''
      })
      setFiles([])
      setShowModal(true)
    } catch (error) {
      setNotify({ type: 'error', message: 'Failed to load credential.' })
    }
  }

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleFileSelect = (e) => {
    setFiles(Array.from(e.target.files || []))
  }

  const handleSaveCredential = async () => {
    if (!formData.credentialName || !formData.issuingAuthority) {
      setNotify({ type: 'error', message: 'Credential name and issuing authority are required.' })
      return
    }

    try {
      const submitData = {
        credentialName: formData.credentialName,
        credentialType: formData.credentialType,
        issuingAuthority: formData.issuingAuthority,
        description: formData.description || undefined,
        issueDate: formData.issueDate || undefined,
        expiryDate: formData.expiryDate || undefined,
        noExpiry: formData.noExpiry,
        renewalDate: formData.renewalDate || undefined,
        coverageScope: formData.coverageScope || undefined,
        level: formData.level || undefined,
        reminderDaysBefore: parseInt(formData.reminderDaysBefore) || 30,
        responsiblePerson: formData.responsiblePerson || undefined,
        ownerDepartment: formData.ownerDepartment || undefined
      }

      let credId = editingId
      if (!credId) {
        const res = await api.post('/api/credentials', submitData)
        credId = res.data._id
      } else {
        await api.put(`/api/credentials/${credId}`, submitData)
      }

      if (files.length > 0) {
        const formDataFiles = new FormData()
        files.forEach(f => formDataFiles.append('files', f))
        await api.post(`/api/credentials/${credId}/attachments`, formDataFiles, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }

      setShowModal(false)
      setNotify({ type: 'success', message: editingId ? 'Credential updated successfully.' : 'Credential created successfully.' })
      fetchCredentials()
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: error.response?.data?.message || 'Error saving credential.' })
    }
  }

  const handleVerify = async (credId) => {
    try {
      await api.post(`/api/credentials/${credId}/verify`)
      setNotify({ type: 'success', message: 'Credential verified.' })
      fetchCredentials()
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: 'Error verifying credential.' })
    }
  }

  const handleRenewClick = (credId) => {
    setRenewData({ credId, newExpiryDate: '', notes: '', renewalFee: '' })
    setShowRenewModal(true)
  }

  const handleRenew = async () => {
    if (!renewData.newExpiryDate) {
      setNotify({ type: 'error', message: 'Please enter a new expiry date.' })
      return
    }

    try {
      await api.post(`/api/credentials/${renewData.credId}/renew`, {
        newExpiryDate: renewData.newExpiryDate,
        notes: renewData.notes || undefined,
        renewalFee: renewData.renewalFee ? parseFloat(renewData.renewalFee) : undefined
      })
      setShowRenewModal(false)
      setNotify({ type: 'success', message: 'Credential renewed successfully.' })
      fetchCredentials()
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: error.response?.data?.message || 'Error renewing credential.' })
    }
  }

  const handleDeleteClick = (credId) => {
    setDeleteConfirm(credId)
  }

  const handleConfirmDelete = async (credId) => {
    try {
      await api.delete(`/api/credentials/${credId}`)
      setDeleteConfirm(null)
      setNotify({ type: 'success', message: 'Credential deleted successfully.' })
      fetchCredentials()
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: 'Error deleting credential.' })
    }
  }

  if (!canManage) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>You do not have permission to manage company credentials.</p>
      </div>
    )
  }

  if (loading && page === 1) return <Spinner />

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)', margin: '0 0 4px 0' }}>
            Credentials & Certifications
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
            Manage licenses, certifications, and professional credentials
          </p>
        </div>

        <button
          onClick={handleCreateClick}
          style={{
            padding: '10px 20px',
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          + Add Credential
        </button>
      </div>

      {notify && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '16px',
          background: notify.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: notify.type === 'success' ? '#10b981' : '#ef4444',
          fontSize: '14px'
        }}>
          {notify.message}
        </div>
      )}

      {/* Filters */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Search credentials..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'var(--input-bg)',
              color: 'var(--text)'
            }}
          />

          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'var(--input-bg)',
              color: 'var(--text)'
            }}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="expiring_soon">Expiring Soon</option>
            <option value="expired">Expired</option>
            <option value="renewed">Renewed</option>
          </select>

          <select
            value={filters.credentialType}
            onChange={(e) => handleFilterChange('credentialType', e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'var(--input-bg)',
              color: 'var(--text)'
            }}
          >
            <option value="">All Types</option>
            <option value="iso_certification">ISO Certification</option>
            <option value="trade_license">Trade License</option>
            <option value="professional_license">Professional License</option>
            <option value="membership">Membership</option>
            <option value="accreditation">Accreditation</option>
            <option value="certification">Certification</option>
            <option value="permit">Permit</option>
            <option value="other">Other</option>
          </select>

          <select
            value={filters.verificationStatus}
            onChange={(e) => handleFilterChange('verificationStatus', e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'var(--input-bg)',
              color: 'var(--text)'
            }}
          >
            <option value="">All Verification</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="unverified">Unverified</option>
          </select>

          <button
            onClick={handleClearFilters}
            style={{
              padding: '8px 12px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              color: 'var(--text)',
              cursor: 'pointer'
            }}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Credentials Table */}
      {credentials.length > 0 ? (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px'
            }}>
              <thead>
                <tr style={{ background: 'var(--input-bg)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Credential #</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Type</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Authority</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Expiry</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Verification</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((cred, idx) => (
                  <tr
                    key={cred._id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)'
                    }}
                  >
                    <td style={{ padding: '12px', color: 'var(--text)', fontSize: '13px', fontWeight: '600' }}>
                      {cred.credentialNumber}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{cred.credentialName}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>{cred.credentialType}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>{cred.issuingAuthority}</td>
                    <td style={{ padding: '12px' }}>
                      <ExpiryBadge
                        expiryDate={cred.expiryDate}
                        noExpiry={cred.noExpiry}
                        reminderDaysBefore={cred.reminderDaysBefore}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        background: cred.verificationStatus === 'verified' ? 'rgba(16, 185, 129, 0.1)' :
                                   cred.verificationStatus === 'pending' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                        color: cred.verificationStatus === 'verified' ? '#10b981' :
                               cred.verificationStatus === 'pending' ? '#f59e0b' : '#6b7280',
                        fontSize: '12px',
                        fontWeight: '600',
                        borderRadius: '4px'
                      }}>
                        {cred.verificationStatus}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        {cred.verificationStatus !== 'verified' && (
                          <button
                            onClick={() => handleVerify(cred._id)}
                            title="Verify"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '16px',
                              color: '#10b981'
                            }}
                          >
                            ✓
                          </button>
                        )}

                        <button
                          onClick={() => handleRenewClick(cred._id)}
                          title="Renew"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            color: '#3b82f6'
                          }}
                        >
                          🔄
                        </button>

                        <button
                          onClick={() => handleEditClick(cred._id)}
                          title="Edit"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            color: '#6366f1'
                          }}
                        >
                          ✏️
                        </button>

                        <button
                          onClick={() => handleDeleteClick(cred._id)}
                          title="Delete"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            color: '#ef4444'
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'center', gap: '8px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                style={{
                  padding: '6px 12px',
                  background: page === 1 ? 'var(--input-bg)' : '#6366f1',
                  color: page === 1 ? 'var(--text-muted)' : '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '13px'
                }}
              >
                Previous
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Page {page} of {pages}
              </div>

              <button
                onClick={() => setPage(Math.min(pages, page + 1))}
                disabled={page === pages}
                style={{
                  padding: '6px 12px',
                  background: page === pages ? 'var(--input-bg)' : '#6366f1',
                  color: page === pages ? 'var(--text-muted)' : '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: page === pages ? 'not-allowed' : 'pointer',
                  fontSize: '13px'
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '48px 24px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '40px', margin: '0 0 12px 0' }}>🎓</p>
          <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: '0 0 4px 0' }}>
            No credentials yet
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
            Add your first credential to get started
          </p>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Credential' : 'New Credential'}
        size="large"
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Credential Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              name="credentialName"
              value={formData.credentialName}
              onChange={handleFormChange}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'var(--input-bg)',
                color: 'var(--text)'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Credential Type
              </label>
              <select
                name="credentialType"
                value={formData.credentialType}
                onChange={handleFormChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              >
                <option value="iso_certification">ISO Certification</option>
                <option value="trade_license">Trade License</option>
                <option value="professional_license">Professional License</option>
                <option value="membership">Membership</option>
                <option value="accreditation">Accreditation</option>
                <option value="certification">Certification</option>
                <option value="permit">Permit</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Issuing Authority <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                name="issuingAuthority"
                value={formData.issuingAuthority}
                onChange={handleFormChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleFormChange}
              rows="3"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Issue Date
              </label>
              <input
                type="date"
                name="issueDate"
                value={formData.issueDate}
                onChange={handleFormChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Expiry Date
              </label>
              <input
                type="date"
                name="expiryDate"
                value={formData.expiryDate}
                onChange={handleFormChange}
                disabled={formData.noExpiry}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: formData.noExpiry ? 'var(--input-bg)' : 'var(--input-bg)',
                  color: 'var(--text)',
                  opacity: formData.noExpiry ? 0.5 : 1,
                  cursor: formData.noExpiry ? 'not-allowed' : 'text'
                }}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              name="noExpiry"
              checked={formData.noExpiry}
              onChange={handleFormChange}
              style={{ cursor: 'pointer' }}
            />
            No expiry date
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Coverage Scope
              </label>
              <input
                type="text"
                name="coverageScope"
                value={formData.coverageScope}
                onChange={handleFormChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Level
              </label>
              <input
                type="text"
                name="level"
                value={formData.level}
                onChange={handleFormChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '8px' }}>
              Upload Files
            </label>
            <label style={{
              display: 'block',
              border: '2px dashed var(--border)',
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'var(--input-bg)',
              transition: 'all 0.2s'
            }}
              onDragOver={(e) => { e.preventDefault() }}
              onDrop={(e) => {
                e.preventDefault()
                setFiles(Array.from(e.dataTransfer.files))
              }}
            >
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <p style={{ color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                Drag and drop files here or click to browse
              </p>
              {files.length > 0 && (
                <p style={{ fontSize: '12px', color: '#6366f1', margin: '8px 0 0 0' }}>
                  {files.length} file(s) selected
                </p>
              )}
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              onClick={() => setShowModal(false)}
              style={{
                padding: '10px 20px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleSaveCredential}
              style={{
                padding: '10px 20px',
                background: '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              {editingId ? 'Update Credential' : 'Create Credential'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Renew Modal */}
      <Modal
        isOpen={showRenewModal}
        onClose={() => setShowRenewModal(false)}
        title="Renew Credential"
        size="small"
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              New Expiry Date <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="date"
              value={renewData.newExpiryDate}
              onChange={(e) => setRenewData({ ...renewData, newExpiryDate: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'var(--input-bg)',
                color: 'var(--text)'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Renewal Fee
            </label>
            <input
              type="number"
              value={renewData.renewalFee}
              onChange={(e) => setRenewData({ ...renewData, renewalFee: e.target.value })}
              step="0.01"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'var(--input-bg)',
                color: 'var(--text)'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Notes
            </label>
            <textarea
              value={renewData.notes}
              onChange={(e) => setRenewData({ ...renewData, notes: e.target.value })}
              rows="3"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              onClick={() => setShowRenewModal(false)}
              style={{
                padding: '10px 20px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleRenew}
              style={{
                padding: '10px 20px',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Renew Credential
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal
          isOpen={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Credential"
          size="small"
        >
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '16px' }}>
              Are you sure you want to delete this credential? This action cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '10px 20px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                onClick={() => handleConfirmDelete(deleteConfirm)}
                style={{
                  padding: '10px 20px',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
