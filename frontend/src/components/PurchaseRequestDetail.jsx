import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'

function PurchaseRequestDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('id')
  
  const [order, setOrder] = useState(null)
  const [linkedPOs, setLinkedPOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [approveConfirm, setApproveConfirm] = useState(false)
  const [rejectModal, setRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const isPE = roles.includes('procurement_engineer')
  const isAdmin = roles.includes('admin')
  const isManager = roles.includes('manager')
  const canReview = isPE || isAdmin || isManager
  
  useEffect(() => {
    if (orderId) {
      fetchData()
    }
  }, [orderId])
  
  const fetchData = async () => {
    try {
      setLoading(true)
      const [orderRes, posRes] = await Promise.all([
        api.get(`/api/purchase-requests/${orderId}`),
        api.get(`/api/purchase-requests/${orderId}/linked-pos`).catch(() => ({ data: [] }))
      ])
      setOrder(orderRes.data)
      setLinkedPOs(posRes.data || [])
    } catch (error) {
      console.error('Error fetching data:', error)
      setNotify({ open: true, title: 'Error', message: 'Failed to load purchase request.' })
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    try {
      await api.patch(`/api/purchase-requests/${orderId}/approve`)
      setNotify({ open: true, title: 'Success', message: 'Purchase request approved.' })
      fetchData()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to approve.' })
    }
  }

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) return
    try {
      await api.patch(`/api/purchase-requests/${orderId}/reject`, { reason: rejectReason })
      setNotify({ open: true, title: 'Success', message: 'Purchase request rejected.' })
      setRejectModal(false)
      setRejectReason('')
      fetchData()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to reject.' })
    }
  }

  // Compute delivery data from linked POs for each PR item
  const getItemDeliveryData = (prItem) => {
    const materialId = String(prItem.materialId?._id || prItem.materialId)
    let totalAllocated = 0
    let totalReceived = 0
    const conditions = []

    for (const po of linkedPOs) {
      // How much was allocated from this PR for this material
      for (const ai of po.allocatedItems) {
        if (String(ai.requestItemId) === String(prItem._id)) {
          totalAllocated += (ai.allocatedQty || 0)
        }
      }
      // How much was received (GRN) for this material
      if (['received', 'confirmed'].includes(po.status)) {
        for (const ri of po.receivedItems) {
          if (String(ri.materialId) === materialId) {
            totalReceived += (ri.receivedQty || 0)
            if (ri.condition) conditions.push(ri.condition)
          }
        }
      }
    }

    const overallCondition = conditions.length === 0 ? null :
      conditions.every(c => c === 'good') ? 'good' :
      conditions.some(c => c === 'damaged') ? 'damaged' : 'partial'

    return { totalAllocated, totalReceived, overallCondition }
  }
  
  const getStatusBadge = (status) => {
    const styles = {
      draft: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
      pending: { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b' },
      approved: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
      rejected: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
      fulfilled: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1' },
      pending_am: { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b' },
      pending_gm: { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b' },
      sent_to_supplier: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
      received: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' },
      confirmed: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' },
      cancelled: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' }
    }
    const s = styles[status] || styles.pending
    const label = status?.replace(/_/g, ' ') || 'unknown'
    return (
      <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: s.bg, color: s.color, textTransform: 'uppercase' }}>
        {label}
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
      <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: s.bg, color: s.color, textTransform: 'uppercase' }}>
        {priority}
      </span>
    )
  }
  
  const getConditionBadge = (condition) => {
    const styles = {
      good: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' },
      damaged: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
      partial: { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b' }
    }
    const s = styles[condition] || styles.good
    return (
      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: s.bg, color: s.color, textTransform: 'uppercase' }}>
        {condition}
      </span>
    )
  }
  
  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading purchase request...</p>
      </div>
    )
  }
  
  if (!order) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--text)' }}>Purchase Request Not Found</h2>
        <button className="save-btn" onClick={() => navigate('/purchase-requests')} style={{ marginTop: '16px' }}>
          Back to Purchase Requests
        </button>
      </div>
    )
  }
  
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <button 
            onClick={() => navigate('/purchase-requests')} 
            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            ← Back to Purchase Requests
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, color: 'var(--text)', fontSize: '28px' }}>{order.requestNumber}</h1>
            {getStatusBadge(order.status)}
            {getPriorityBadge(order.priority)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {canReview && order.status === 'pending' && (
            <>
              <button
                className="save-btn"
                style={{ background: '#10b981', padding: '10px 20px', fontSize: '14px' }}
                onClick={() => setApproveConfirm(true)}
              >
                Approve
              </button>
              <button
                className="save-btn"
                style={{ background: '#ef4444', padding: '10px 20px', fontSize: '14px' }}
                onClick={() => { setRejectReason(''); setRejectModal(true) }}
              >
                Reject
              </button>
            </>
          )}
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>Created</p>
            <p style={{ margin: '4px 0', color: 'var(--text)', fontWeight: '600' }}>
              {new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>
      
      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        
        

        {/* Order Details */}
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📋 Order Details</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {order.projectId && (
              <div>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Project</p>
                <p style={{ margin: '4px 0 0', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer' }}
                   onClick={() => navigate(`/project-detail?id=${order.projectId._id}`)}>
                  {order.projectId.name}
                </p>
              </div>
            )}
            <div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Expected Delivery</p>
              <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>
                {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : '-'}
              </p>
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Created By</p>
              <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>{order.createdBy?.name || '-'}</p>
            </div>
            {order.notes && (
              <div>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Notes</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>{order.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Items Table - delivery data from linked POs */}
      <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📦 Request Items</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Material</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>SKU</th>
                <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Requested</th>
                <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Allocated (POs)</th>
                <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Received (GRN)</th>
                <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Condition</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => {
                const delivery = getItemDeliveryData(item)
                return (
                  <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px', color: 'var(--text)', fontWeight: '500' }}>
                      {item.materialName || item.materialId?.name || 'Unknown'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--primary)' }}>{item.sku || item.materialId?.sku || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>
                      {item.quantity} {item.uom}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', color: delivery.totalAllocated > 0 ? '#6366f1' : 'var(--text-muted)', fontWeight: delivery.totalAllocated > 0 ? '600' : '400' }}>
                      {delivery.totalAllocated > 0 ? `${delivery.totalAllocated} ${item.uom}` : '-'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', color: delivery.totalReceived > 0 ? '#22c55e' : 'var(--text-muted)', fontWeight: delivery.totalReceived > 0 ? '600' : '400' }}>
                      {delivery.totalReceived > 0 ? `${delivery.totalReceived} ${item.uom}` : '-'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {delivery.overallCondition ? getConditionBadge(delivery.overallCondition) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Linked Purchase Orders */}
      {linkedPOs.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>🔗 Linked Purchase Orders</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>PO #</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Supplier</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Items</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>GRN</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {linkedPOs.map(po => (
                  <tr key={po._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <span 
                        style={{ color: 'var(--primary)', fontWeight: '600', cursor: 'pointer' }}
                        onClick={() => navigate(`/purchase-order-detail?id=${po._id}`)}
                        onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                        onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                      >
                        {po.poNumber}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{po.supplierName}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{getStatusBadge(po.status)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text)' }}>
                      {po.allocatedItems.map(ai => `${ai.materialName}: ${ai.allocatedQty}`).join(', ')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: po.grnNumber ? '#22c55e' : 'var(--text-muted)', fontWeight: po.grnNumber ? '600' : '400', fontSize: '12px' }}>
                      {po.grnNumber || '-'}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(po.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Timeline */}
      <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📅 Timeline</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Created */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '14px' }}>📝</div>
            <div>
              <p style={{ margin: 0, color: 'var(--text)', fontWeight: '600' }}>Created</p>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                {new Date(order.createdAt).toLocaleString()} by {order.createdBy?.name || 'Unknown'}
              </p>
            </div>
          </div>
          
          {/* Reviewed */}
          {order.reviewedAt && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: order.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: order.status === 'rejected' ? '#ef4444' : '#10b981', fontSize: '14px' }}>
                {order.status === 'rejected' ? '❌' : '✅'}
              </div>
              <div>
                <p style={{ margin: 0, color: 'var(--text)', fontWeight: '600' }}>{order.status === 'rejected' ? 'Rejected' : 'Approved'}</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {new Date(order.reviewedAt).toLocaleString()} by {order.reviewedBy?.name || 'Unknown'}
                </p>
                {order.reviewNotes && <p style={{ margin: '4px 0 0', color: 'var(--text)', fontSize: '13px' }}>{order.reviewNotes}</p>}
              </div>
            </div>
          )}
          
          {/* Fulfilled (auto via POs) */}
          {order.status === 'fulfilled' && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontSize: '14px' }}>✅</div>
              <div>
                <p style={{ margin: 0, color: 'var(--text)', fontWeight: '600' }}>Fulfilled</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                  All materials have been received via Purchase Orders
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Reject Modal */}
      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Reject Purchase Request</h2>
              <button onClick={() => setRejectModal(false)} className="close-btn">×</button>
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
                <button type="button" className="cancel-btn" onClick={() => setRejectModal(false)}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: '#ef4444' }} onClick={handleRejectSubmit} disabled={!rejectReason.trim()}>
                  Reject PR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {approveConfirm && (
        <div className="modal-overlay" onClick={() => setApproveConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>Approve Purchase Request</h2>
              <button onClick={() => setApproveConfirm(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <p style={{ color: 'var(--text)', marginBottom: '20px' }}>Are you sure you want to approve this purchase request? Once approved, it will be available for Purchase Order creation.</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setApproveConfirm(false)}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: '#10b981' }} onClick={() => {
                  handleApprove()
                  setApproveConfirm(false)
                }}>Approve</button>
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

export default PurchaseRequestDetail
