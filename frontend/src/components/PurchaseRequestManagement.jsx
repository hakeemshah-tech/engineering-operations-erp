import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'

function PurchaseRequestManagement() {
  const [orders, setOrders] = useState([])
  const [materials, setMaterials] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [approveConfirm, setApproveConfirm] = useState({ open: false, orderId: null })
  const [rejectModal, setRejectModal] = useState({ open: false, orderId: null })
  const [rejectReason, setRejectReason] = useState('')
  const [listSearch, setListSearch] = useState('')
  const [listPage, setListPage] = useState(1)
  const LIST_PAGE_SIZE = 10

  const navigate = useNavigate()
  
  const [form, setForm] = useState({
    projectId: '',
    items: [],
    deliveryDate: '',
    notes: '',
    priority: 'normal'
  })

  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [selectedQty, setSelectedQty] = useState(1)
  const [brands, setBrands] = useState([])
  const [brandFilter, setBrandFilter] = useState('')
  const [brandSearch, setBrandSearch] = useState('')
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false)
  
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const isIM = roles.includes('inventory_manager')
  const isPE = roles.includes('procurement_engineer')
  const isAdmin = roles.includes('admin')
  const isManager = roles.includes('manager')
  const canCreate = isIM || isAdmin || isManager
  const canReview = isPE || isAdmin || isManager


  useEffect(() => {
    fetchData()
  }, [filter])

  const fetchData = async () => {
    try {
      setLoading(true)
      const params = filter !== 'all' ? `?status=${filter}` : ''
      const [ordersRes, materialsRes, projectsRes] = await Promise.all([
        api.get(`/api/purchase-requests${params}`),
        api.get('/api/materials'),
        api.get('/api/projects')
      ])
      setOrders(ordersRes.data.requests || [])
      setMaterials(Array.isArray(materialsRes.data) ? materialsRes.data : [])
      setProjects(Array.isArray(projectsRes.data) ? projectsRes.data : [])
      // Fetch brands separately
      try {
        const brandsRes = await api.get('/api/brands')
        setBrands(Array.isArray(brandsRes.data) ? brandsRes.data : [])
      } catch { /* brands optional */ }
    } catch (error) {
      console.error('Error fetching data:', error)
      setNotify({ open: true, title: 'Error', message: 'Failed to load data.' })
    } finally {
      setLoading(false)
    }
  }

  const addItem = () => {
    if (!selectedMaterial) return
    const mat = materials.find(m => m._id === selectedMaterial)
    if (!mat) return
    
    // Check if already added
    if (form.items.some(i => i.materialId === selectedMaterial)) {
      setNotify({ open: true, title: 'Warning', message: 'Material already added.' })
      return
    }
    
    setForm(prev => ({
      ...prev,
      items: [...prev.items, {
        materialId: mat._id,
        materialName: mat.name,
        sku: mat.sku,
        quantity: selectedQty,
        uom: mat.uom
      }]
    }))
    setSelectedMaterial('')
    setSelectedQty(1)
  }

  const removeItem = (index) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }))
  }

  const updateItemQty = (index, qty) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, quantity: Number(qty) } : item)
    }))
  }

  const handleSubmit = async () => {
    if (form.items.length === 0) {
      setNotify({ open: true, title: 'Error', message: 'Please add at least one item.' })
      return
    }
    
    try {
      setSaving(true)
      await api.post('/api/purchase-requests', form)
      setNotify({ open: true, title: 'Success', message: 'Purchase request created successfully.' })
      setShowModal(false)
      setForm({
        projectId: '',
        items: [],
        deliveryDate: '',
        notes: '',
        priority: 'normal'
      })
      fetchData()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to create order.' })
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async (id) => {
    try {
      await api.patch(`/api/purchase-requests/${id}/approve`)
      setNotify({ open: true, title: 'Success', message: 'Order approved.' })
      fetchData()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to approve.' })
    }
  }

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) return
    try {
      await api.patch(`/api/purchase-requests/${rejectModal.orderId}/reject`, { reason: rejectReason })
      setNotify({ open: true, title: 'Success', message: 'Order rejected.' })
      setRejectModal({ open: false, orderId: null })
      setRejectReason('')
      fetchData()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to reject.' })
    }
  }



  const getStatusBadge = (status) => {
    const styles = {
      draft: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
      pending: { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b' },
      approved: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
      rejected: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
      fulfilled: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1' },
      received: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' },
      cancelled: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' }
    }
    const s = styles[status] || styles.pending
    return (
      <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: s.bg, color: s.color, textTransform: 'uppercase' }}>
        {status}
      </span>
    )
  }

  const getPriorityBadge = (priority) => {
    const styles = {
      low: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
      normal: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
      high: { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b' },
      urgent: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' }
    }
    const s = styles[priority] || styles.normal
    return (
      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: s.bg, color: s.color, textTransform: 'uppercase' }}>
        {priority}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading purchase requests...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>Purchase Requests</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
            {canCreate ? 'Create and manage purchase requests for materials.' : 'Review and process purchase requests.'}
          </p>
        </div>
        {canCreate && (
          <button className="save-btn" onClick={() => setShowModal(true)}>
            + Create Purchase Request
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="Search by PR#, project, material..."
          value={listSearch}
          onChange={e => { setListSearch(e.target.value); setListPage(1) }}
          style={{ width: '100%', maxWidth: '400px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)' }}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['all', 'pending', 'approved', 'fulfilled', 'rejected'].map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setListPage(1) }}
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

      {/* Orders Table */}
      {(() => {
        const sq = listSearch.toLowerCase().trim()
        const filteredOrders = sq ? orders.filter(o =>
          o.requestNumber?.toLowerCase().includes(sq) ||
          o.projectId?.name?.toLowerCase().includes(sq) ||
          o.items?.some(i => i.materialName?.toLowerCase().includes(sq) || i.sku?.toLowerCase().includes(sq)) ||
          o.createdBy?.name?.toLowerCase().includes(sq)
        ) : orders
        const totalPages = Math.max(1, Math.ceil(filteredOrders.length / LIST_PAGE_SIZE))
        const safePage = Math.min(listPage, totalPages)
        const paginatedOrders = filteredOrders.slice((safePage - 1) * LIST_PAGE_SIZE, safePage * LIST_PAGE_SIZE)

        return filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', background: 'var(--card)', borderRadius: '12px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <h3 style={{ color: 'var(--text)', marginBottom: '8px' }}>No Purchase Requests</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            {listSearch ? 'No matching purchase requests found.' : filter !== 'all' ? `No ${filter} requests found.` : 'No purchase requests yet.'}
          </p>
        </div>
      ) : (
        <>
        <div className="table" style={{ background: 'var(--card)', borderRadius: '12px', overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Request #</th>
                <th>Project</th>
                <th>Items</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map(order => (
                <tr key={order._id}>
                  <td>
                    <span
                      style={{ color: 'var(--primary)', fontWeight: '600', cursor: 'pointer' }}
                      onClick={() => navigate(`/purchase-request-detail?id=${order._id}`)}
                      onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                    >
                      {order.requestNumber}
                    </span>
                  </td>
                  <td>{order.projectId?.name || '-'}</td>
                  <td>{order.items?.length || 0} items</td>
                  <td>{getPriorityBadge(order.priority)}</td>
                  <td>{getStatusBadge(order.status)}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {canReview && order.status === 'pending' && (
                        <>
                          <button className="link-btn" style={{ color: '#10b981' }} onClick={() => setApproveConfirm({ open: true, orderId: order._id })}>Approve</button>
                          <button className="link-btn" style={{ color: '#ef4444' }} onClick={() => { setRejectReason(''); setRejectModal({ open: true, orderId: order._id }) }}>Reject</button>
                        </>
                      )}

                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
            <button
              onClick={() => setListPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: safePage <= 1 ? 'var(--bg)' : 'var(--card)', cursor: safePage <= 1 ? 'default' : 'pointer', fontSize: '13px', color: 'var(--text)' }}
            >Prev</button>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Page {safePage} of {totalPages} ({filteredOrders.length} result{filteredOrders.length !== 1 ? 's' : ''})
            </span>
            <button
              onClick={() => setListPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: safePage >= totalPages ? 'var(--bg)' : 'var(--card)', cursor: safePage >= totalPages ? 'default' : 'pointer', fontSize: '13px', color: 'var(--text)' }}
            >Next</button>
          </div>
        )}
      </>
      )
      })()}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>Create Purchase Request</h2>
              <button onClick={() => setShowModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              {/* Project Reference */}
              <div className="form-group">
                <label>Project Reference (Optional)</label>
                <select 
                  value={form.projectId} 
                  onChange={e => setForm({ ...form, projectId: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                >
                  <option value="">-- No Project --</option>
                  {projects.map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </div>


              {/* Materials */}
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Materials</h4>

                {/* Brand Filter - Searchable */}
                {brands.length > 0 && (
                  <div style={{ marginBottom: '10px', position: 'relative' }}>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
                      <input
                        type="text"
                        value={brandSearch}
                        onChange={e => { setBrandSearch(e.target.value); setBrandDropdownOpen(true) }}
                        onFocus={() => setBrandDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setBrandDropdownOpen(false), 150)}
                        placeholder={brandFilter ? brands.find(b => b._id === brandFilter)?.name : 'Filter by brand...'}
                        style={{ width: '100%', padding: '8px 36px 8px 30px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }}
                      />
                      {brandFilter && (
                        <button
                          type="button"
                          onClick={() => { setBrandFilter(''); setBrandSearch(''); setSelectedMaterial('') }}
                          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
                          title="Clear brand filter"
                        >×</button>
                      )}
                    </div>
                    {brandDropdownOpen && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: '2px', maxHeight: '200px', overflowY: 'auto' }}>
                        <div
                          onMouseDown={() => { setBrandFilter(''); setBrandSearch(''); setSelectedMaterial(''); setBrandDropdownOpen(false) }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: !brandFilter ? 'var(--primary)' : 'var(--text)', fontWeight: !brandFilter ? '600' : '400', borderBottom: '1px solid var(--border)' }}
                        >
                          🏷️ All Brands
                        </div>
                        {brands
                          .filter(b => !brandSearch || b.name.toLowerCase().includes(brandSearch.toLowerCase()))
                          .map(b => (
                            <div
                              key={b._id}
                              onMouseDown={() => { setBrandFilter(b._id); setBrandSearch(''); setSelectedMaterial(''); setBrandDropdownOpen(false) }}
                              style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', background: brandFilter === b._id ? 'rgba(99,102,241,0.08)' : 'transparent', color: brandFilter === b._id ? 'var(--primary)' : 'var(--text)', fontWeight: brandFilter === b._id ? '600' : '400' }}
                            >
                              {b.name}
                            </div>
                          ))}
                        {brands.filter(b => !brandSearch || b.name.toLowerCase().includes(brandSearch.toLowerCase())).length === 0 && (
                          <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '13px' }}>No brands found</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <select 
                    value={selectedMaterial} 
                    onChange={e => setSelectedMaterial(e.target.value)}
                    style={{ flex: 1, minWidth: '200px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  >
                    <option value="">-- Select Material --</option>
                    {materials
                      .filter(m => !brandFilter || String(m.brand?._id || m.brand || '') === brandFilter)
                      .map(m => (
                        <option key={m._id} value={m._id}>{m.name} ({m.sku}){m.brand?.name ? ` · ${m.brand.name}` : ''} - {m.quantity} {m.uom} in stock</option>
                      ))}
                  </select>
                  <input 
                    type="number" 
                    min="1"
                    value={selectedQty} 
                    onChange={e => setSelectedQty(Number(e.target.value))}
                    style={{ width: '80px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                  <button type="button" className="save-btn" onClick={addItem} style={{ padding: '10px 16px' }}>Add</button>
                </div>
                
                {form.items.length > 0 && (
                  <table style={{ width: '100%', fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Material</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>SKU</th>
                        <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Qty</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>UOM</th>
                        <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((item, index) => (
                        <tr key={index}>
                          <td style={{ padding: '8px' }}>{item.materialName}</td>
                          <td style={{ padding: '8px', color: 'var(--primary)' }}>{item.sku}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <input 
                              type="number" 
                              min="1"
                              value={item.quantity} 
                              onChange={e => updateItemQty(index, e.target.value)}
                              style={{ width: '60px', padding: '4px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border)' }}
                            />
                          </td>
                          <td style={{ padding: '8px' }}>{item.uom}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button type="button" className="link-btn" style={{ color: '#ef4444' }} onClick={() => removeItem(index)}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Delivery & Notes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Delivery Date</label>
                  <input 
                    type="date" 
                    value={form.deliveryDate} 
                    onChange={e => setForm({ ...form, deliveryDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <select 
                    value={form.priority} 
                    onChange={e => setForm({ ...form, priority: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label>Notes</label>
                <textarea 
                  value={form.notes} 
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="button" className="save-btn" onClick={handleSubmit} disabled={saving}>
                  {saving ? 'Creating...' : 'Create Purchase Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Approve Confirmation Modal */}
      {approveConfirm.open && (
        <div className="modal-overlay" onClick={() => setApproveConfirm({ open: false, orderId: null })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>Approve Purchase Request</h2>
              <button onClick={() => setApproveConfirm({ open: false, orderId: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <p style={{ color: 'var(--text)', marginBottom: '20px' }}>Are you sure you want to approve this purchase request? Once approved, it will be available for Purchase Order creation.</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setApproveConfirm({ open: false, orderId: null })}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: '#10b981' }} onClick={() => {
                  handleApprove(approveConfirm.orderId)
                  setApproveConfirm({ open: false, orderId: null })
                }}>Approve</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.open && (
        <div className="modal-overlay" onClick={() => setRejectModal({ open: false, orderId: null })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Reject Purchase Request</h2>
              <button onClick={() => setRejectModal({ open: false, orderId: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <div className="form-group">
                <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Rejection Reason <span style={{ color: '#ef4444' }}>*</span></label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Please provide a reason for rejection..."
                  rows={4}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '14px', resize: 'vertical' }}
                  autoFocus
                />
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setRejectModal({ open: false, orderId: null })}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: '#ef4444' }} onClick={handleRejectSubmit} disabled={!rejectReason.trim()}>
                  Reject PR
                </button>
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

export default PurchaseRequestManagement
