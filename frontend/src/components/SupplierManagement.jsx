import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'

function SupplierManagement() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const emptyForm = {
    name: '',
    trn: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    status: 'active'
  }
  const [form, setForm] = useState({ ...emptyForm })

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const isPE = roles.includes('procurement_engineer')
  const isIM = roles.includes('inventory_manager')
  const isAdmin = roles.includes('admin')
  const isManager = roles.includes('manager')
  const canManage = isPE || isIM || isAdmin || isManager

  useEffect(() => {
    fetchSuppliers()
  }, [filter, search])

  const fetchSuppliers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filter !== 'all') params.append('status', filter)
      if (search.trim()) params.append('search', search.trim())
      const queryString = params.toString() ? `?${params.toString()}` : ''
      const res = await api.get(`/api/suppliers${queryString}`)
      setSuppliers(Array.isArray(res.data) ? res.data : [])
    } catch (error) {
      console.error('Error fetching suppliers:', error)
      setNotify({ open: true, title: 'Error', message: 'Failed to load suppliers.' })
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  const openEditModal = (supplier) => {
    setEditingId(supplier._id)
    setForm({
      name: supplier.name || '',
      trn: supplier.trn || '',
      contactPerson: supplier.contactPerson || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      status: supplier.status || 'active'
    })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setNotify({ open: true, title: 'Error', message: 'Supplier name is required.' })
      return
    }
    if (!form.trn.trim()) {
      setNotify({ open: true, title: 'Error', message: 'TRN (Tax Registration Number) is required.' })
      return
    }

    try {
      setSaving(true)
      if (editingId) {
        await api.put(`/api/suppliers/${editingId}`, form)
        setNotify({ open: true, title: 'Success', message: 'Supplier updated successfully.' })
      } else {
        await api.post('/api/suppliers', form)
        setNotify({ open: true, title: 'Success', message: 'Supplier created successfully.' })
      }
      setShowModal(false)
      setForm({ ...emptyForm })
      setEditingId(null)
      fetchSuppliers()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to save supplier.' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/suppliers/${id}`)
      setNotify({ open: true, title: 'Success', message: 'Supplier deleted successfully.' })
      setDeleteConfirm(null)
      fetchSuppliers()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to delete supplier.' })
      setDeleteConfirm(null)
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      active: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
      inactive: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' }
    }
    const s = styles[status] || styles.active
    return (
      <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: s.bg, color: s.color, textTransform: 'uppercase' }}>
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading suppliers...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>Suppliers</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
            Manage your supplier directory. TRN is unique per supplier.
          </p>
        </div>
        {canManage && (
          <button className="save-btn" onClick={openCreateModal}>
            + Add Supplier
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, TRN, or contact person..."
          style={{
            flex: 1,
            minWidth: '220px',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text)',
            fontSize: '13px'
          }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          {['all', 'active', 'inactive'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: filter === f ? 'var(--primary)' : 'var(--card)',
                color: filter === f ? 'white' : 'var(--text)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '13px',
                textTransform: 'capitalize'
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Suppliers Table */}
      {suppliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', background: 'var(--card)', borderRadius: '12px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
          <h3 style={{ color: 'var(--text)', marginBottom: '8px' }}>No Suppliers Found</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            {search ? 'No suppliers match your search.' : filter !== 'all' ? `No ${filter} suppliers.` : 'No suppliers added yet.'}
          </p>
        </div>
      ) : (
        <div className="table" style={{ background: 'var(--card)', borderRadius: '12px', overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Supplier Name</th>
                <th>TRN</th>
                <th>Contact Person</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {suppliers.map(supplier => (
                <tr key={supplier._id}>
                  <td style={{ fontWeight: '600', color: 'var(--text)' }}>{supplier.name}</td>
                  <td style={{ color: 'var(--primary)', fontWeight: '500', fontFamily: 'monospace' }}>{supplier.trn}</td>
                  <td>{supplier.contactPerson || '-'}</td>
                  <td>{supplier.phone || '-'}</td>
                  <td>{supplier.email || '-'}</td>
                  <td>{getStatusBadge(supplier.status)}</td>
                  {canManage && (
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="link-btn" style={{ color: 'var(--primary)' }} onClick={() => openEditModal(supplier)}>Edit</button>
                        <button className="link-btn" style={{ color: '#ef4444' }} onClick={() => setDeleteConfirm(supplier._id)}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Supplier' : 'Add Supplier'}</h2>
              <button onClick={() => setShowModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Supplier Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter supplier name"
                  />
                </div>
                <div className="form-group">
                  <label>TRN (Tax Registration Number) *</label>
                  <input
                    type="text"
                    value={form.trn}
                    onChange={e => setForm({ ...form, trn: e.target.value })}
                    placeholder="Enter TRN"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Contact Person</label>
                  <input
                    type="text"
                    value={form.contactPerson}
                    onChange={e => setForm({ ...form, contactPerson: e.target.value })}
                    placeholder="Enter contact person name"
                  />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="Enter phone number"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="Enter email address"
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Address</label>
                <textarea
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  placeholder="Enter full address"
                  rows={3}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="button" className="save-btn" onClick={handleSubmit} disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update Supplier' : 'Add Supplier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Confirm Delete</h2>
              <button onClick={() => setDeleteConfirm(null)} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to delete this supplier? This action cannot be undone.</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: '#ef4444' }} onClick={() => handleDelete(deleteConfirm)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {notify.open && (
        <div className="modal-overlay" onClick={() => setNotify({ open: false, title: '', message: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>{notify.title}</h2>
              <button onClick={() => setNotify({ open: false, title: '', message: '' })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>{notify.message}</p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => setNotify({ open: false, title: '', message: '' })}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SupplierManagement
