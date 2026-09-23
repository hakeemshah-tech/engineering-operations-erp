import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Spinner, ButtonLoader } from './LoadingComponents'

function MaterialRequestDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestId = searchParams.get('id')
  
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [fulfillModal, setFulfillModal] = useState({ open: false, assignedItems: [], notes: '', materialQuantities: {} })
  const [receiveModal, setReceiveModal] = useState({ 
    open: false, 
    deliveryDate: '', 
    deliveryPersonName: '', 
    deliveryPersonContact: '', 
    vehicleNumber: '',
    materialCondition: 'good',
    conditionNotes: '',
    receivedItems: [],
    receiverSignatureName: '',
    acknowledgmentNotes: ''
  })
  const [cancelModal, setCancelModal] = useState({ open: false })
  const [currentUser, setCurrentUser] = useState(null)

  const isAdmin = currentUser?.roles?.includes('admin')
  const isManager = currentUser?.roles?.includes('manager')
  const isInventoryManager = currentUser?.roles?.includes('inventory_manager')
  const isProjectEngineer = currentUser?.roles?.includes('project_engineer')
  const isReturnRequest = request?.requestType === 'return'
  const isRemainingReturn = request?.requestType === 'remaining_return'
  
  // Fulfill:
  // - Regular: IM
  // - Return (IM->Project): PE (Fulfills return request by sending materials)
  // - Remaining (Project->IM): IM (Acknowledge/Confirm)
  const canFulfill = isAdmin || isManager || (isReturnRequest ? isProjectEngineer : isInventoryManager)
  
  // Receive:
  // - Regular: Requester (PE)
  // - Return (IM->Project): Requester (IM) 
  // - Remaining (Project->IM): IM receives.
  const isRequester = request?.requestedBy?._id === currentUser?.id || request?.requestedBy === currentUser?.id
  const canReceive = isAdmin || isManager || (isRemainingReturn ? isInventoryManager : isRequester)

  useEffect(() => {
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}')
      setCurrentUser(userData)
    } catch {
      setCurrentUser(null)
    }
  }, [])

  useEffect(() => {
    if (requestId) {
      fetchRequest()
    }
  }, [requestId])

  const fetchRequest = async () => {
    try {
      const res = await api.get(`/api/material-requests/${requestId}`)
      setRequest(res.data)
    } catch (error) {
      console.error('Error fetching material request:', error)
      setNotify({ open: true, title: 'Error', message: 'Failed to load material request.' })
    } finally {
      setLoading(false)
    }
  }



  // Open fulfill modal and fetch material quantities
  const openFulfillModal = async () => {
    const quantities = {}
    const isRemainingReturn = request?.requestType === 'remaining_return'
    const isReturnRequest = request?.requestType === 'return'
    
    // Both 'remaining_return' and 'return' are Project -> Inventory
    // So we need to calculate Available Project Stock for both.
    if ((isRemainingReturn || isReturnRequest) && request.projectId) {
      // For return requests (Project -> Inventory): 
      // Get materials assigned to the project (Incoming) MINUS materials already returned (Outgoing)
      try {
        const projectId = request.projectId._id || request.projectId
        console.log('=== RETURN MODAL DEBUG ===')
        console.log('Project ID:', projectId)
        
        const mrRes = await api.get(`/api/material-requests?projectId=${projectId}`)
        const allRequests = mrRes.data.requests || []
        
        // Revised Logic:
        // Incoming: 'request' (Standard Issue)
        // Outgoing: 'remaining_return' OR 'return' (Project -> Inventory)
        const requests = allRequests || []
        const incoming = requests.filter(r => r.status === 'received' && r.requestType === 'request')
        const outgoing = requests.filter(r => r.status === 'received' && (r.requestType === 'remaining_return' || r.requestType === 'return'))
        
        const projectMaterials = {}
        
        // Add Incoming
        for (const req of incoming) {
          for (const item of req.items || []) {
            if (item.assignedQuantity > 0) {
              const matId = item.materialId?._id || item.materialId
              const key = String(matId)
              if (!projectMaterials[key]) projectMaterials[key] = 0
              projectMaterials[key] += item.assignedQuantity
            }
          }
        }
        
        // Subtract Outgoing
        for (const req of outgoing) {
          for (const item of req.items || []) {
            const returnedQty = item.assignedQuantity || 0
            if (returnedQty > 0) {
              const matId = item.materialId?._id || item.materialId
              const key = String(matId)
              if (projectMaterials[key]) projectMaterials[key] -= returnedQty
            }
          }
        }
        
        // Set quantities based on what's still available in the project
        for (const item of request.items || []) {
          if (item.materialId) {
            const matId = typeof item.materialId === 'object' ? item.materialId._id : item.materialId
            const available = Math.max(0, projectMaterials[String(matId)] || 0)
            quantities[matId] = available
          }
        }
      } catch (err) {
        console.error('Error fetching project materials for return:', err)
        // Fallback to 0
        for (const item of request.items || []) {
          if (item.materialId) {
            const matId = typeof item.materialId === 'object' ? item.materialId._id : item.materialId
            quantities[matId] = 0
          }
        }
      }
    } else {
      // For regular requests ('request') AND standard returns ('return'): Get available INVENTORY stock
      for (const item of request.items || []) {
        if (item.materialId) {
          try {
            const matId = typeof item.materialId === 'object' ? item.materialId._id : item.materialId
            const res = await api.get(`/api/materials/${matId}`)
            quantities[matId] = res.data?.quantity || 0
          } catch {
            const matId = typeof item.materialId === 'object' ? item.materialId._id : item.materialId
            quantities[matId] = 0
          }
        }
      }
    }
    
    const assignedItems = (request.items || []).map(item => ({
      itemId: item._id,
      materialId: typeof item.materialId === 'object' ? item.materialId._id : item.materialId,
      materialName: item.materialName,
      requestedQuantity: item.quantity,
      uom: item.uom,
      assignedQuantity: item.quantity
    }))
    
    setFulfillModal({ 
      open: true, 
      assignedItems,
      notes: '',
      materialQuantities: quantities 
    })
  }

  const handleFulfill = async () => {
    setSaving(true)
    try {
      await api.patch(`/api/material-requests/${requestId}/fulfill`, {
        assignedItems: fulfillModal.assignedItems.map(item => ({
          itemId: item.itemId,
          materialId: item.materialId,
          assignedQuantity: item.assignedQuantity
        })),
        fulfillmentNotes: fulfillModal.notes
      })
      setNotify({ open: true, title: 'Success', message: 'Request fulfilled. Inventory updated.' })
      setFulfillModal({ open: false, assignedItems: [], notes: '', materialQuantities: {} })
      fetchRequest()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to fulfill request.' })
    } finally {
      setSaving(false)
    }
  }

  // Open receive modal with items pre-populated
  const openReceiveModal = () => {
    const receivedItems = (request.items || []).map(item => ({
      materialName: item.materialName,
      requestedQuantity: item.assignedQuantity || item.quantity,
      receivedQuantity: item.assignedQuantity || item.quantity,
      uom: item.uom,
      remarks: ''
    }))
    
    setReceiveModal({
      open: true,
      deliveryDate: new Date().toISOString().split('T')[0],
      deliveryPersonName: '',
      deliveryPersonContact: '',
      vehicleNumber: '',
      materialCondition: 'good',
      conditionNotes: '',
      receivedItems,
      receiverSignatureName: currentUser?.name || '',
      acknowledgmentNotes: ''
    })
  }

  const handleReceive = async () => {
    // Validate required fields
    if (!receiveModal.deliveryDate) {
      setNotify({ open: true, title: 'Error', message: 'Delivery date is required.' })
      return
    }
    if (!receiveModal.receiverSignatureName.trim()) {
      setNotify({ open: true, title: 'Error', message: 'Receiver signature name is required.' })
      return
    }

    setSaving(true)
    try {
      await api.patch(`/api/material-requests/${requestId}/receive`, {
        receivedNotes: receiveModal.acknowledgmentNotes,
        deliveryNote: {
          deliveryDate: receiveModal.deliveryDate,
          deliveryPersonName: receiveModal.deliveryPersonName,
          deliveryPersonContact: receiveModal.deliveryPersonContact,
          vehicleNumber: receiveModal.vehicleNumber,
          materialCondition: receiveModal.materialCondition,
          conditionNotes: receiveModal.conditionNotes,
          receivedItems: receiveModal.receivedItems,
          receiverSignatureName: receiveModal.receiverSignatureName,
          acknowledgmentNotes: receiveModal.acknowledgmentNotes
        }
      })
      setNotify({ open: true, title: 'Success', message: `${isReturnRequest || isRemainingReturn ? 'Goods Receipt Note' : 'Delivery Note'} submitted. Materials marked as received!` })
      setReceiveModal({ open: false, deliveryDate: '', deliveryPersonName: '', deliveryPersonContact: '', vehicleNumber: '', materialCondition: 'good', conditionNotes: '', receivedItems: [], receiverSignatureName: '', acknowledgmentNotes: '' })
      fetchRequest()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || `Failed to submit ${isReturnRequest || isRemainingReturn ? 'Goods Receipt Note' : 'Delivery Note'}.` })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    setSaving(true)
    try {
      await api.patch(`/api/material-requests/${requestId}/cancel`, {})
      setNotify({ open: true, title: 'Success', message: 'Request cancelled.' })
      setCancelModal({ open: false })
      fetchRequest()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to cancel request.' })
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
      <span style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', background: s.bg, color: s.color }}>
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
      <span style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', background: s.bg, color: s.color }}>
        {priority?.toUpperCase()}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading material request...</p>
      </div>
    )
  }

  if (!request) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '48px', maxWidth: '500px', margin: '0 auto' }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>📭</div>
          <h2 style={{ color: 'var(--text)', marginBottom: '16px' }}>Request Not Found</h2>
          <p style={{ color: 'var(--text-muted)' }}>The material request you are looking for does not exist or you don't have permission to view it.</p>
          <button className="save-btn" style={{ marginTop: '24px' }} onClick={() => navigate('/material-requests')}>Back to Material Requests</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <button className="link-btn" onClick={() => navigate(-1)} style={{ marginBottom: '8px' }}>← Back</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ margin: 0, color: 'var(--text)' }}>
              {request.requestType === 'remaining_return' ? 'Remaining Material Return' : 
               request.requestType === 'return' ? 'Material Return Request' : 'Material Request'} {request.requestNumber}
            </h2>
            {request.requestType === 'return' && (
              <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>🔄 RETURN</span>
            )}
            {request.requestType === 'remaining_return' && (
              <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>📦 RETURN TO INVENTORY</span>
            )}
          </div>
          <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
            Created on {new Date(request.createdAt).toLocaleString()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {getPriorityBadge(request.priority)}
          {getStatusBadge(request.status)}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {canFulfill && request.status === 'pending' && !isRemainingReturn && (
          <button className="save-btn" style={{ background: isReturnRequest ? '#f59e0b' : '#6366f1' }} onClick={openFulfillModal} disabled={saving}>
            {isReturnRequest ? '🔄 Fulfill Return' : 'Fulfill & Assign Materials'}
          </button>
        )}
        {canReceive && isRemainingReturn && request.status === 'pending' && (
          <button className="save-btn" style={{ background: '#059669' }} onClick={openReceiveModal} disabled={saving}>
            📋 Accept with GRN
          </button>
        )}
        {canReceive && request.status === 'fulfilled' && (
          <button className="save-btn" style={{ background: '#059669' }} onClick={openReceiveModal} disabled={saving}>
            {(isReturnRequest || isRemainingReturn) ? '📋 Accept with GRN' : 'Mark as Received'}
          </button>
        )}
        {(isRequester || isAdmin || isManager) && request.status === 'pending' && (
          <button className="cancel-btn" onClick={() => setCancelModal({ open: true })} disabled={saving}>Cancel Request</button>
        )}
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Project & Requester Info */}
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📋 Request Details</h3>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Project</label>
            <div style={{ fontWeight: '600', color: 'var(--text)' }}>{request.projectId?.name || 'N/A'}</div>
          </div>

          {request.purpose && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Purpose</label>
              <div style={{ color: 'var(--text)' }}>{request.purpose}</div>
            </div>
          )}

          {request.requiredDate && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Required By</label>
              <div style={{ color: 'var(--text)' }}>{new Date(request.requiredDate).toLocaleDateString()}</div>
            </div>
          )}

          {request.notes && (
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Additional Notes</label>
              <div style={{ color: 'var(--text)', fontSize: '14px' }}>{request.notes}</div>
            </div>
          )}
        </div>

        {/* Requester Info */}
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>👤 Requester Information</h3>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name</label>
            <div style={{ fontWeight: '600', color: 'var(--text)' }}>{request.requesterName || request.requestedBy?.name || 'N/A'}</div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Email</label>
            <div style={{ color: 'var(--text)' }}>
              <a href={`mailto:${request.requesterEmail || request.requestedBy?.email}`} style={{ color: 'var(--primary)' }}>
                {request.requesterEmail || request.requestedBy?.email || 'N/A'}
              </a>
            </div>
          </div>

          {request.requesterPhone && (
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Phone</label>
              <div style={{ color: 'var(--text)' }}>
                <a href={`tel:${request.requesterPhone}`} style={{ color: 'var(--primary)' }}>{request.requesterPhone}</a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Requested Materials */}
      <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>
          {request.status === 'fulfilled' ? '✅ Fulfilled Materials' : '📦 Requested Materials'} ({request.items?.length || 0})
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>#</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Material Name</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>SKU</th>
                <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Requested</th>
                {request.status === 'fulfilled' && (
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Assigned</th>
                )}
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>UOM</th>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {request.items?.map((item, index) => {
                const hasDiscrepancy = request.status === 'fulfilled' && item.assignedQuantity !== item.quantity
                return (
                  <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{index + 1}</td>
                    <td style={{ padding: '12px', color: 'var(--text)', fontWeight: '500' }}>{item.materialName}</td>
                    <td style={{ padding: '12px', color: 'var(--primary)', fontSize: '13px' }}>{item.sku || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: 'var(--text)' }}>{item.quantity}</td>
                    {request.status === 'fulfilled' && (
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>
                        <span style={{ 
                          color: hasDiscrepancy ? '#f59e0b' : '#10b981',
                          background: hasDiscrepancy ? 'rgba(251,191,36,0.1)' : 'rgba(16,185,129,0.1)',
                          padding: '4px 8px',
                          borderRadius: '4px'
                        }}>
                          {item.assignedQuantity || 0}
                        </span>
                      </td>
                    )}
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{item.uom}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>{item.notes || '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workflow History */}
      {(request.fulfilledBy || request.receivedBy) && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📝 Workflow History</h3>
          
          {request.fulfilledBy && (
            <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600', color: 'var(--text)' }}>📦 Fulfilled</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(request.fulfilledAt).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                By {request.fulfilledBy?.name || 'N/A'}
              </div>
              {request.fulfillmentNotes && (
                <div style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text)' }}>{request.fulfillmentNotes}</div>
              )}
            </div>
          )}

          {request.receivedBy && (
            <div style={{ padding: '12px', background: 'rgba(16,185,129,0.1)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600', color: '#059669' }}>✅ Received</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(request.receivedAt).toLocaleString()}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                By {request.receivedBy?.name || 'N/A'}
              </div>
              {request.receivedNotes && (
                <div style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text)' }}>{request.receivedNotes}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Receipt Document Details */}
      {request.deliveryNote && request.deliveryNote.deliveryDate && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📋 {isReturnRequest || isRemainingReturn ? 'Goods Receipt Note' : 'Delivery Note'}</h3>
          
          {/* Delivery Information */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>🚚 Delivery Information</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', background: 'var(--bg)', padding: '12px', borderRadius: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Delivery Date</label>
                <div style={{ fontWeight: '600', color: 'var(--text)' }}>{new Date(request.deliveryNote.deliveryDate).toLocaleDateString()}</div>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Vehicle Number</label>
                <div style={{ color: 'var(--text)' }}>{request.deliveryNote.vehicleNumber || '-'}</div>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Delivery Person</label>
                <div style={{ color: 'var(--text)' }}>{request.deliveryNote.deliveryPersonName || '-'}</div>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Contact</label>
                <div style={{ color: 'var(--text)' }}>{request.deliveryNote.deliveryPersonContact || '-'}</div>
              </div>
            </div>
          </div>

          {/* Material Condition */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>📦 Material Condition</h4>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--bg)', padding: '12px', borderRadius: '8px' }}>
              <span style={{ 
                padding: '6px 12px', 
                borderRadius: '6px', 
                fontSize: '13px', 
                fontWeight: '600',
                background: request.deliveryNote.materialCondition === 'excellent' ? 'rgba(16,185,129,0.2)' :
                           request.deliveryNote.materialCondition === 'good' ? 'rgba(59,130,246,0.2)' :
                           request.deliveryNote.materialCondition === 'acceptable' ? 'rgba(251,191,36,0.2)' :
                           'rgba(239,68,68,0.2)',
                color: request.deliveryNote.materialCondition === 'excellent' ? '#059669' :
                       request.deliveryNote.materialCondition === 'good' ? '#3b82f6' :
                       request.deliveryNote.materialCondition === 'acceptable' ? '#d97706' :
                       '#dc2626'
              }}>
                {request.deliveryNote.materialCondition?.replace('_', ' ').toUpperCase() || 'GOOD'}
              </span>
              {request.deliveryNote.conditionNotes && (
                <span style={{ color: 'var(--text)', fontSize: '14px' }}>{request.deliveryNote.conditionNotes}</span>
              )}
            </div>
          </div>

          {/* Received Items */}
          {request.deliveryNote.receivedItems && request.deliveryNote.receivedItems.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>✅ Received Items Verification</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Material</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Assigned</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Received</th>
                      <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.deliveryNote.receivedItems.map((item, index) => {
                      const hasDiscrepancy = item.receivedQuantity !== item.requestedQuantity
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px' }}>
                            <div style={{ color: 'var(--text)', fontWeight: '500' }}>{item.materialName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.uom}</div>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>
                            {item.requestedQuantity}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{ 
                              padding: '4px 8px', 
                              borderRadius: '4px',
                              fontWeight: '600',
                              background: hasDiscrepancy ? 'rgba(251,191,36,0.2)' : 'rgba(16,185,129,0.2)',
                              color: hasDiscrepancy ? '#d97706' : '#059669'
                            }}>
                              {item.receivedQuantity}
                            </span>
                          </td>
                          <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>
                            {item.remarks || '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Receiver Acknowledgment */}
          <div>
            <h4 style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>✍️ Receiver Acknowledgment</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: 'var(--bg)', padding: '12px', borderRadius: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Received By</label>
                <div style={{ fontWeight: '600', color: 'var(--text)' }}>{request.deliveryNote.receiverSignatureName || request.receivedBy?.name || '-'}</div>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Received At</label>
                <div style={{ color: 'var(--text)' }}>{request.receivedAt ? new Date(request.receivedAt).toLocaleString() : '-'}</div>
              </div>
              {request.deliveryNote.acknowledgmentNotes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Notes</label>
                  <div style={{ color: 'var(--text)', fontSize: '14px' }}>{request.deliveryNote.acknowledgmentNotes}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}



      {/* Cancel Confirmation Modal */}
      {cancelModal.open && (
        <div className="modal-overlay" onClick={() => setCancelModal({ open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>Cancel Request</h2>
              <button onClick={() => setCancelModal({ open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
                <p style={{ color: 'var(--text)', fontSize: '16px', margin: 0 }}>
                  Are you sure you want to cancel this material request?
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>
                  This action cannot be undone.
                </p>
              </div>
              
              <div className="form-actions" style={{ justifyContent: 'center' }}>
                <button type="button" className="save-btn" onClick={() => setCancelModal({ open: false })}>No, Keep Request</button>
                <button 
                  type="button" 
                  className="cancel-btn" 
                  onClick={handleCancel} 
                  disabled={saving}
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid #ef4444' }}
                >
                  <ButtonLoader loading={saving}>{saving ? 'Cancelling...' : 'Yes, Cancel Request'}</ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fulfill Modal with Assign Materials */}
      {fulfillModal.open && (
        <div className="modal-overlay" onClick={() => setFulfillModal({ open: false, assignedItems: [], notes: '', materialQuantities: {} })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>{isReturnRequest ? '🔄 Return Materials' : 'Fulfill Request'} {request.requestNumber}</h2>
              <button onClick={() => setFulfillModal({ open: false, assignedItems: [], notes: '', materialQuantities: {} })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <h4 style={{ margin: '0 0 16px', color: 'var(--text)' }}>
                {isReturnRequest ? '🔄 Return Materials to Inventory' : '📦 Assign Materials'}
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Material</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{(request.requestType === 'remaining_return' || request.requestType === 'return') ? 'In Project' : 'In Stock'}</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{request.requestType === 'return' ? 'Return Qty' : 'Requested'}</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{request.requestType === 'return' ? 'Sending Qty' : 'Assign Qty'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fulfillModal.assignedItems.map((item, index) => {
                      console.log(`Modal row ${index}:`, { materialId: item.materialId, type: typeof item.materialId, quantities: fulfillModal.materialQuantities })
                      const available = fulfillModal.materialQuantities[item.materialId] || 0
                      console.log(`  Lookup result: ${available}`)
                      const isInsufficient = item.assignedQuantity > available
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px' }}>
                            <div style={{ color: 'var(--text)', fontWeight: '500' }}>{item.materialName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.uom}</div>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{ color: available > 0 ? '#10b981' : '#ef4444', fontWeight: '600' }}>
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
                              <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px' }}>
                                {(request.requestType === 'remaining_return' || request.requestType === 'return') ? 'Exceeds project stock!' : 'Exceeds inventory!'}
                              </div>
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
                <button type="button" className="cancel-btn" onClick={() => setFulfillModal({ open: false, assignedItems: [], notes: '', materialQuantities: {} })}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  onClick={handleFulfill} 
                  disabled={saving || fulfillModal.assignedItems.some(item => item.assignedQuantity > (fulfillModal.materialQuantities[item.materialId] || 0) || item.assignedQuantity > item.requestedQuantity)}
                  style={{ background: isReturnRequest ? '#f59e0b' : '#6366f1' }}
                >
                  <ButtonLoader loading={saving}>
                    {saving ? 'Processing...' : (isReturnRequest ? 'Confirm Return' : 'Confirm & Update Inventory')}
                  </ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Document Form Modal */}
      {receiveModal.open && (
        <div className="modal-overlay" onClick={() => setReceiveModal({ ...receiveModal, open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>📋 {isReturnRequest || isRemainingReturn ? 'Goods Receipt Note' : 'Delivery Note'} - {request.requestNumber}</h2>
              <button onClick={() => setReceiveModal({ ...receiveModal, open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              {/* Delivery Details Section */}
              <h4 style={{ margin: '0 0 16px', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                🚚 Delivery Information
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Delivery Date *</label>
                  <input 
                    type="date" 
                    value={receiveModal.deliveryDate} 
                    onChange={e => setReceiveModal({ ...receiveModal, deliveryDate: e.target.value })}
                    style={{ borderColor: !receiveModal.deliveryDate ? '#ef4444' : undefined }}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Vehicle Number</label>
                  <input 
                    type="text" 
                    value={receiveModal.vehicleNumber} 
                    onChange={e => setReceiveModal({ ...receiveModal, vehicleNumber: e.target.value })}
                    placeholder="e.g., ABC-1234"
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Delivery Person Name</label>
                  <input 
                    type="text" 
                    value={receiveModal.deliveryPersonName} 
                    onChange={e => setReceiveModal({ ...receiveModal, deliveryPersonName: e.target.value })}
                    placeholder="Name of delivery personnel"
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Delivery Person Contact</label>
                  <input 
                    type="text" 
                    value={receiveModal.deliveryPersonContact} 
                    onChange={e => setReceiveModal({ ...receiveModal, deliveryPersonContact: e.target.value })}
                    placeholder="Phone number"
                  />
                </div>
              </div>

              {/* Material Condition Section */}
              <h4 style={{ margin: '0 0 16px', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                📦 Material Condition
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '24px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Overall Condition</label>
                  <select 
                    value={receiveModal.materialCondition} 
                    onChange={e => setReceiveModal({ ...receiveModal, materialCondition: e.target.value })}
                  >
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="acceptable">Acceptable</option>
                    <option value="partially_damaged">Partially Damaged</option>
                    <option value="damaged">Damaged</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Condition Notes</label>
                  <input 
                    type="text" 
                    value={receiveModal.conditionNotes} 
                    onChange={e => setReceiveModal({ ...receiveModal, conditionNotes: e.target.value })}
                    placeholder="Any damage or issues to note..."
                  />
                </div>
              </div>

              {/* Received Items Verification */}
              <h4 style={{ margin: '0 0 16px', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                ✅ Received Quantity Verification
              </h4>
              <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Material</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Assigned</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Received</th>
                      <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveModal.receivedItems.map((item, index) => {
                      const hasDiscrepancy = item.receivedQuantity !== item.requestedQuantity
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px' }}>
                            <div style={{ color: 'var(--text)', fontWeight: '500' }}>{item.materialName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.uom}</div>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>
                            {item.requestedQuantity}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <input
                              type="number"
                              min="0"
                              value={item.receivedQuantity}
                              onChange={e => {
                                const newItems = [...receiveModal.receivedItems]
                                newItems[index].receivedQuantity = parseInt(e.target.value) || 0
                                setReceiveModal({ ...receiveModal, receivedItems: newItems })
                              }}
                              style={{ 
                                width: '80px', 
                                textAlign: 'center', 
                                padding: '6px',
                                border: hasDiscrepancy ? '2px solid #f59e0b' : '1px solid var(--border)',
                                borderRadius: '4px',
                                background: 'var(--card)',
                                color: 'var(--text)'
                              }}
                            />
                          </td>
                          <td style={{ padding: '10px' }}>
                            <input
                              type="text"
                              value={item.remarks}
                              onChange={e => {
                                const newItems = [...receiveModal.receivedItems]
                                newItems[index].remarks = e.target.value
                                setReceiveModal({ ...receiveModal, receivedItems: newItems })
                              }}
                              placeholder="e.g., Damaged, Short..."
                              style={{ 
                                width: '100%', 
                                padding: '6px',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                background: 'var(--card)',
                                color: 'var(--text)'
                              }}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Receiver Acknowledgment */}
              <h4 style={{ margin: '0 0 16px', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                ✍️ Receiver Acknowledgment
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Receiver Name / Signature *</label>
                  <input 
                    type="text" 
                    value={receiveModal.receiverSignatureName} 
                    onChange={e => setReceiveModal({ ...receiveModal, receiverSignatureName: e.target.value })}
                    placeholder="Your full name"
                    style={{ borderColor: !receiveModal.receiverSignatureName.trim() ? '#ef4444' : undefined }}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date & Time</label>
                  <input 
                    type="text" 
                    value={new Date().toLocaleString()}
                    disabled
                    style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Additional Notes</label>
                <textarea 
                  value={receiveModal.acknowledgmentNotes} 
                  onChange={e => setReceiveModal({ ...receiveModal, acknowledgmentNotes: e.target.value })}
                  placeholder="Any additional notes or comments..."
                  rows={2}
                />
              </div>

              <div style={{ 
                background: 'rgba(16,185,129,0.1)', 
                border: '1px solid rgba(16,185,129,0.2)', 
                borderRadius: '8px', 
                padding: '12px', 
                marginBottom: '16px',
                fontSize: '13px',
                color: '#059669'
              }}>
                ℹ️ By submitting this form, you confirm that you have received and verified the materials listed above.
              </div>
              
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setReceiveModal({ ...receiveModal, open: false })}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  onClick={handleReceive} 
                  disabled={saving || !receiveModal.deliveryDate || !receiveModal.receiverSignatureName.trim()}
                  style={{ background: '#059669' }}
                >
                  <ButtonLoader loading={saving}>{saving ? 'Submitting...' : `Submit ${isReturnRequest || isRemainingReturn ? 'Goods Receipt Note' : 'Delivery Note'}`}</ButtonLoader>
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

export default MaterialRequestDetail
