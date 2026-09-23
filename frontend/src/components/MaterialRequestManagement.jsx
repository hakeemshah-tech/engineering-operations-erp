import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Spinner, ButtonLoader } from './LoadingComponents'

function MaterialRequestManagement() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  
  // Pagination
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 })
  
  // Filters
  const [filters, setFilters] = useState({ status: '', priority: '', search: '' })
  
  // Fulfill modal with assigned quantities
  const [fulfillModal, setFulfillModal] = useState({ open: false, request: null, assignedItems: [], notes: '', materialQuantities: {} })
  const [saving, setSaving] = useState(false)

  const isAdmin = currentUser?.roles?.includes('admin')
  const isManager = currentUser?.roles?.includes('manager')
  const isInventoryManager = currentUser?.roles?.includes('inventory_manager')
  const isProjectEngineer = currentUser?.roles?.includes('project_engineer')
  const hasAccess = isAdmin || isManager || isInventoryManager || isProjectEngineer
  const canFulfill = isAdmin || isManager || isInventoryManager

  useEffect(() => {
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}')
      setCurrentUser(userData)
    } catch {
      setCurrentUser(null)
    }
  }, [])

  useEffect(() => {
    if (currentUser && hasAccess) {
      fetchRequests()
    } else if (currentUser && !hasAccess) {
      setLoading(false)
    }
  }, [currentUser, pagination.page, filters])

  const fetchRequests = async () => {
    try {
      const params = new URLSearchParams()
      params.append('page', pagination.page)
      params.append('limit', pagination.limit)
      if (filters.status) params.append('status', filters.status)
      if (filters.priority) params.append('priority', filters.priority)
      if (filters.search) params.append('search', filters.search)

      const res = await api.get(`/api/material-requests?${params.toString()}`)
      setRequests(res.data.requests || [])
      setPagination(prev => ({ ...prev, ...res.data.pagination }))
    } catch (error) {
      console.error('Error fetching material requests:', error)
    } finally {
      setLoading(false)
    }
  }



  // Open fulfill modal and fetch material quantities
  const openFulfillModal = async (request) => {
    // Fetch available quantities for each material
    const quantities = {}
    for (const item of request.items) {
      if (item.materialId) {
        try {
          const matId = typeof item.materialId === 'object' ? item.materialId._id : item.materialId
          const res = await api.get(`/api/materials/${matId}`)
          quantities[matId] = res.data?.quantity || 0
        } catch {
          quantities[item.materialId] = 0
        }
      }
    }
    
    // Initialize assigned items with requested quantities as default
    const assignedItems = request.items.map(item => ({
      itemId: item._id,
      materialId: typeof item.materialId === 'object' ? item.materialId._id : item.materialId,
      materialName: item.materialName,
      requestedQuantity: item.quantity,
      uom: item.uom,
      assignedQuantity: item.quantity // Default to requested quantity
    }))
    
    setFulfillModal({ 
      open: true, 
      request, 
      assignedItems,
      notes: '',
      materialQuantities: quantities 
    })
  }

  const handleFulfill = async () => {
    setSaving(true)
    try {
      await api.patch(`/api/material-requests/${fulfillModal.request._id}/fulfill`, {
        assignedItems: fulfillModal.assignedItems.map(item => ({
          itemId: item.itemId,
          materialId: item.materialId,
          assignedQuantity: item.assignedQuantity
        })),
        fulfillmentNotes: fulfillModal.notes
      })
      setNotify({ open: true, title: 'Success', message: 'Request fulfilled. Inventory updated.' })
      setFulfillModal({ open: false, request: null, assignedItems: [], notes: '', materialQuantities: {} })
      fetchRequests()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to fulfill request.' })
    } finally {
      setSaving(false)
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b' },
      fulfilled: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1' },
      received: { bg: 'rgba(16,185,129,0.1)', color: '#059669' },
      cancelled: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' }
    }
    const s = styles[status] || styles.pending
    return (
      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: s.bg, color: s.color }}>
        {status?.replace('_', ' ').toUpperCase()}
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
      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: s.bg, color: s.color }}>
        {priority?.toUpperCase()}
      </span>
    )
  }

  // Access Denied
  if (!loading && currentUser && !hasAccess) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '48px', maxWidth: '500px', margin: '0 auto' }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>🚫</div>
          <h2 style={{ color: 'var(--text)', marginBottom: '16px' }}>Access Denied</h2>
          <p style={{ color: 'var(--text-muted)' }}>You do not have permission to access Material Requests.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading material requests...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h3 style={{ margin: 0, color: 'var(--text)' }}>Material Requests</h3>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <select
          value={filters.status}
          onChange={e => { setFilters({ ...filters, status: e.target.value }); setPagination(p => ({ ...p, page: 1 })) }}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={filters.priority}
          onChange={e => { setFilters({ ...filters, priority: e.target.value }); setPagination(p => ({ ...p, page: 1 })) }}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}
        >
          <option value="">All Priorities</option>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <input
          type="text"
          placeholder="Search by request #, name, purpose..."
          value={filters.search}
          onChange={e => setFilters({ ...filters, search: e.target.value })}
          onKeyPress={e => e.key === 'Enter' && fetchRequests()}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', minWidth: '250px' }}
        />
        <button className="link-btn" onClick={fetchRequests}>Search</button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--card)', borderRadius: '8px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Request #</th>
              <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Type</th>
              <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Project</th>
              <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Requester</th>
              <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Items</th>
              <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Priority</th>
              <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Status</th>
              <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Date</th>
              <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(req => (
              <tr key={req._id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '13px' }}>{req.requestNumber}</span>
                  </div>
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: '700',
                    background: req.requestType === 'return' || req.requestType === 'remaining_return' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
                    color: req.requestType === 'return' || req.requestType === 'remaining_return' ? '#f59e0b' : '#6366f1'
                  }}>
                    {req.requestType === 'remaining_return' ? '📦 RETURN TO INVENTORY' : 
                     req.requestType === 'return' ? '🔄 RETURN' : '📦 REQUEST'}
                  </span>
                </td>
                <td style={{ padding: '12px', color: 'var(--text)' }}>{req.projectId?.name || '-'}</td>
                <td style={{ padding: '12px' }}>
                  <div style={{ color: 'var(--text)', fontSize: '13px' }}>{req.requesterName || req.requestedBy?.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{req.requesterEmail || req.requestedBy?.email}</div>
                </td>
                <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>{req.items?.length || 0}</td>
                <td style={{ padding: '12px' }}>{getPriorityBadge(req.priority)}</td>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {getStatusBadge(req.status)}
                    {req.deliveryNote && req.deliveryNote.deliveryDate && (
                      <span title={req.requestType === 'return' || req.requestType === 'remaining_return' ? 'Has GRN' : 'Has Delivery Note'} style={{ cursor: 'help' }}>📋</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  {new Date(req.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button className="link-btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => navigate(`/material-request-detail?id=${req._id}`)}>View</button>
                    {canFulfill && req.status === 'pending' && req.requestType !== 'remaining_return' && (
                      <button className="save-btn" style={{ padding: '4px 8px', fontSize: '11px', background: req.requestType === 'return' ? '#f59e0b' : '#6366f1' }} onClick={() => openFulfillModal(req)}>{req.requestType === 'return' ? 'Fulfill Return' : 'Fulfill'}</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {requests.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <p>No material requests found.</p>
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
          <button 
            className="cancel-btn" 
            disabled={pagination.page === 1}
            onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
            style={{ padding: '8px 16px' }}
          >
            Previous
          </button>
          <span style={{ padding: '8px 16px', color: 'var(--text)' }}>
            Page {pagination.page} of {pagination.pages}
          </span>
          <button 
            className="cancel-btn" 
            disabled={pagination.page === pagination.pages}
            onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
            style={{ padding: '8px 16px' }}
          >
            Next
          </button>
        </div>
      )}



      {/* Fulfill Modal with Assign Materials */}
      {fulfillModal.open && (
        <div className="modal-overlay" onClick={() => setFulfillModal({ open: false, request: null, assignedItems: [], notes: '', materialQuantities: {} })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>Fulfill Request {fulfillModal.request?.requestNumber}</h2>
              <button onClick={() => setFulfillModal({ open: false, request: null, assignedItems: [], notes: '', materialQuantities: {} })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <h4 style={{ margin: '0 0 16px', color: 'var(--text)' }}>📦 Assign Materials</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Material</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Available</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Requested</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Assign</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fulfillModal.assignedItems.map((item, index) => {
                      const available = fulfillModal.materialQuantities[item.materialId] || 0
                      const isInsufficient = item.assignedQuantity > available
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px' }}>
                            <div style={{ color: 'var(--text)', fontWeight: '500' }}>{item.materialName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.uom}</div>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{ 
                              color: available > 0 ? '#10b981' : '#ef4444', 
                              fontWeight: '600' 
                            }}>
                              {available}
                            </span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center', color: 'var(--text)', fontWeight: '500' }}>
                            {item.requestedQuantity}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <input
                              type="number"
                              min="0"
                              max={Math.min(available, item.requestedQuantity)}
                              value={item.assignedQuantity}
                              onChange={e => {
                                const newItems = [...fulfillModal.assignedItems]
                                newItems[index].assignedQuantity = parseInt(e.target.value) || 0
                                setFulfillModal({ ...fulfillModal, assignedItems: newItems })
                              }}
                              style={{ 
                                width: '80px', 
                                textAlign: 'center', 
                                padding: '6px',
                                border: isInsufficient ? '2px solid #ef4444' : '1px solid var(--border)',
                                borderRadius: '4px',
                                background: 'var(--card)',
                                color: 'var(--text)'
                              }}
                            />
                            {isInsufficient && (
                              <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px' }}>Exceeds stock!</div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="form-group">
                <label>Fulfillment Notes</label>
                <textarea 
                  value={fulfillModal.notes} 
                  onChange={e => setFulfillModal({ ...fulfillModal, notes: e.target.value })}
                  placeholder="Add any notes about this fulfillment..."
                  rows={3}
                />
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setFulfillModal({ open: false, request: null, assignedItems: [], notes: '', materialQuantities: {} })}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  onClick={handleFulfill} 
                  disabled={saving || fulfillModal.assignedItems.some(item => item.assignedQuantity > (fulfillModal.materialQuantities[item.materialId] || 0) || item.assignedQuantity > item.requestedQuantity)}
                  style={{ background: '#6366f1' }}
                >
                  <ButtonLoader loading={saving}>{saving ? 'Processing...' : 'Confirm & Update Inventory'}</ButtonLoader>
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

export default MaterialRequestManagement
