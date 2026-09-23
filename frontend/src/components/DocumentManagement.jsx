import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'
import { Modal } from '../design-system/Modal'
import ExpiryBadge from './ExpiryBadge'
import './DocumentManagement.css'

export default function DocumentManagement() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canManage = roles.includes('admin') || roles.includes('manager')

  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [notify, setNotify] = useState(null)

  const [filters, setFilters] = useState({
    status: '',
    documentType: '',
    priority: '',
    expiringWithin: '',
    search: ''
  })

  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    documentName: '',
    documentType: 'trade_license',
    description: '',
    category: '',
    tags: '',
    issueDate: '',
    expiryDate: '',
    noExpiry: false,
    priority: 'normal',
    reminderDaysBefore: 30,
    owner: user._id || ''
  })

  const [files, setFiles] = useState([])
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    fetchDocuments()
  }, [filters, page])

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page,
        limit: 10,
        ...(filters.status && { status: filters.status }),
        ...(filters.documentType && { documentType: filters.documentType }),
        ...(filters.priority && { priority: filters.priority }),
        ...(filters.expiringWithin && { expiringWithin: filters.expiringWithin }),
        ...(filters.search && { search: filters.search })
      })

      const res = await api.get(`/api/company-documents?${params}`)
      setDocuments(res.data.items || [])
      setTotal(res.data.total || 0)
      setPages(res.data.pages || 0)
    } catch (error) {
      console.error('Error fetching documents:', error)
      setNotify({ type: 'error', message: 'Failed to load documents.' })
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }))
    setPage(1)
  }

  const handleClearFilters = () => {
    setFilters({ status: '', documentType: '', priority: '', expiringWithin: '', search: '' })
    setPage(1)
  }

  const handleCreateClick = () => {
    setEditingId(null)
    setFormData({
      documentName: '',
      documentType: 'trade_license',
      description: '',
      category: '',
      tags: '',
      issueDate: '',
      expiryDate: '',
      noExpiry: false,
      priority: 'normal',
      reminderDaysBefore: 30,
      owner: user._id || ''
    })
    setFiles([])
    setShowModal(true)
  }

  const handleEditClick = async (docId) => {
    try {
      const res = await api.get(`/api/company-documents/${docId}`)
      const doc = res.data
      setEditingId(docId)
      setFormData({
        documentName: doc.documentName || '',
        documentType: doc.documentType || 'trade_license',
        description: doc.description || '',
        category: doc.category || '',
        tags: (doc.tags || []).join(', '),
        issueDate: doc.issueDate ? doc.issueDate.split('T')[0] : '',
        expiryDate: doc.expiryDate ? doc.expiryDate.split('T')[0] : '',
        noExpiry: doc.noExpiry || false,
        priority: doc.priority || 'normal',
        reminderDaysBefore: doc.reminderDaysBefore || 30,
        owner: doc.owner?._id || user._id || ''
      })
      setFiles([])
      setShowModal(true)
    } catch (error) {
      setNotify({ type: 'error', message: 'Failed to load document.' })
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

  const handleSaveDocument = async () => {
    if (!formData.documentName) {
      setNotify({ type: 'error', message: 'Document name is required.' })
      return
    }

    try {
      const submitData = {
        documentName: formData.documentName,
        documentType: formData.documentType,
        description: formData.description,
        category: formData.category || undefined,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : [],
        issueDate: formData.issueDate || undefined,
        expiryDate: formData.expiryDate || undefined,
        noExpiry: formData.noExpiry,
        priority: formData.priority,
        reminderDaysBefore: parseInt(formData.reminderDaysBefore) || 30,
        owner: formData.owner || undefined
      }

      let docId = editingId
      if (!docId) {
        const res = await api.post('/api/company-documents', submitData)
        docId = res.data._id
      } else {
        await api.put(`/api/company-documents/${docId}`, submitData)
      }

      // Upload files if any
      if (files.length > 0) {
        const formDataFiles = new FormData()
        files.forEach(f => formDataFiles.append('files', f))
        await api.post(`/api/company-documents/${docId}/attachments`, formDataFiles, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }

      setShowModal(false)
      setNotify({ type: 'success', message: editingId ? 'Document updated successfully.' : 'Document created successfully.' })
      fetchDocuments()
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: error.response?.data?.message || 'Error saving document.' })
    }
  }

  const handleDeleteClick = (docId) => {
    setDeleteConfirm(docId)
  }

  const handleConfirmDelete = async (docId) => {
    try {
      await api.delete(`/api/company-documents/${docId}`)
      setDeleteConfirm(null)
      setNotify({ type: 'success', message: 'Document deleted successfully.' })
      fetchDocuments()
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: 'Error deleting document.' })
    }
  }

  const handleArchive = async (docId) => {
    try {
      await api.patch(`/api/company-documents/${docId}/archive`)
      setNotify({ type: 'success', message: 'Document archived.' })
      fetchDocuments()
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: 'Error archiving document.' })
    }
  }

  if (!canManage) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>You do not have permission to manage company documents.</p>
      </div>
    )
  }

  if (loading && page === 1) return <Spinner />

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)', margin: '0 0 4px 0' }}>
            Company Documents
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
            Manage compliance and corporate documents
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
          + Add Document
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
            placeholder="Search documents..."
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
            <option value="archived">Archived</option>
          </select>

          <select
            value={filters.documentType}
            onChange={(e) => handleFilterChange('documentType', e.target.value)}
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
            <option value="trade_license">Trade License</option>
            <option value="tax_certificate">Tax Certificate</option>
            <option value="contract">Contract</option>
            <option value="policy">Policy</option>
            <option value="compliance">Compliance</option>
            <option value="other">Other</option>
          </select>

          <select
            value={filters.priority}
            onChange={(e) => handleFilterChange('priority', e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'var(--input-bg)',
              color: 'var(--text)'
            }}
          >
            <option value="">All Priority</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>

          <select
            value={filters.expiringWithin}
            onChange={(e) => handleFilterChange('expiringWithin', e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'var(--input-bg)',
              color: 'var(--text)'
            }}
          >
            <option value="">All Expirations</option>
            <option value="7">Within 7 days</option>
            <option value="30">Within 30 days</option>
            <option value="90">Within 90 days</option>
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

      {/* Documents Table */}
      {documents.length > 0 ? (
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
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Document #</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Type</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Issue Date</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Expiry</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Priority</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc, idx) => (
                  <tr
                    key={doc._id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)'
                    }}
                  >
                    <td style={{ padding: '12px', color: 'var(--text)', fontSize: '13px', fontWeight: '600' }}>
                      {doc.documentNumber}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{doc.documentName}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>{doc.documentType}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      {doc.issueDate ? new Date(doc.issueDate).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <ExpiryBadge
                        expiryDate={doc.expiryDate}
                        noExpiry={doc.noExpiry}
                        reminderDaysBefore={doc.reminderDaysBefore}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        background: doc.priority === 'critical' ? 'rgba(239, 68, 68, 0.1)' :
                                   doc.priority === 'high' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                        color: doc.priority === 'critical' ? '#ef4444' :
                               doc.priority === 'high' ? '#f59e0b' : '#6b7280',
                        fontSize: '12px',
                        fontWeight: '600',
                        borderRadius: '4px'
                      }}>
                        {doc.priority}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleEditClick(doc._id)}
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
                          onClick={() => handleArchive(doc._id)}
                          title="Archive"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            color: '#f59e0b'
                          }}
                        >
                          📦
                        </button>
                        <button
                          onClick={() => handleDeleteClick(doc._id)}
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
          <p style={{ fontSize: '40px', margin: '0 0 12px 0' }}>📄</p>
          <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: '0 0 4px 0' }}>
            No documents yet
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
            Create your first company document to get started
          </p>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Document' : 'New Document'}
        size="large"
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Document Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              name="documentName"
              value={formData.documentName}
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
                Document Type
              </label>
              <select
                name="documentType"
                value={formData.documentType}
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
                <option value="trade_license">Trade License</option>
                <option value="tax_certificate">Tax Certificate</option>
                <option value="nda">NDA</option>
                <option value="contract">Contract</option>
                <option value="policy">Policy</option>
                <option value="certificate">Certificate</option>
                <option value="compliance">Compliance</option>
                <option value="insurance">Insurance</option>
                <option value="agreement">Agreement</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Priority
              </label>
              <select
                name="priority"
                value={formData.priority}
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
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
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

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Reminder Days Before
            </label>
            <input
              type="number"
              name="reminderDaysBefore"
              value={formData.reminderDaysBefore}
              onChange={handleFormChange}
              min="1"
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
              onClick={handleSaveDocument}
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
              {editingId ? 'Update Document' : 'Create Document'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal
          isOpen={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Document"
          size="small"
        >
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '16px' }}>
              Are you sure you want to delete this document? This action cannot be undone.
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
