import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'

function MaterialDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const materialId = searchParams.get('id')
  
  const [material, setMaterial] = useState(null)
  const [projectUsage, setProjectUsage] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  useEffect(() => {
    if (materialId) {
      fetchMaterialData()
    }
  }, [materialId])

  const fetchMaterialData = async () => {
    try {
      // Fetch material details
      const matRes = await api.get(`/api/materials/${materialId}`)
      setMaterial(matRes.data)
      
      // Fetch material requests that used this material (fulfilled or received)
      // Fetch all and filter client-side to include both statuses
      const mrRes = await api.get('/api/material-requests')
      const allRequests = (mrRes.data.requests || []).filter(r => 
        ['fulfilled', 'received'].includes(r.status)
      )
      
      // Separate regular requests and return requests
      // Separate regular requests and return requests
      const regularRequests = allRequests.filter(r => !r.requestType || r.requestType === 'request')
      const returnRequests = allRequests.filter(r => (r.requestType === 'return' || r.requestType === 'remaining_return') && r.status === 'received')
      
      // Group by project and sum assigned quantities
      const usageMap = {}
      
      // Add quantities from regular requests
      for (const req of regularRequests) {
        for (const item of req.items || []) {
          // Handle both populated and non-populated materialId
          const itemMatId = item.materialId?._id || item.materialId
          const compareId = String(itemMatId)
          const targetId = String(materialId)
          
          if (compareId === targetId && item.assignedQuantity > 0) {
            const projectId = req.projectId?._id || 'unknown'
            const projectName = req.projectId?.name || 'Unknown Project'
            
            if (!usageMap[projectId]) {
              usageMap[projectId] = { 
                projectId, 
                projectName, 
                totalAssigned: 0,
                totalReturned: 0,
                requests: [] 
              }
            }
            usageMap[projectId].totalAssigned += item.assignedQuantity
            usageMap[projectId].requests.push({
              requestNumber: req.requestNumber,
              quantity: item.assignedQuantity,
              date: req.fulfilledAt || req.receivedAt,
              type: 'assigned'
            })
          }
        }
      }
      
      // Subtract quantities from received return requests
      for (const req of returnRequests) {
        for (const item of req.items || []) {
          const itemMatId = item.materialId?._id || item.materialId
          const compareId = String(itemMatId)
          const targetId = String(materialId)
          
          const returnedQty = item.assignedQuantity || 0
          if (compareId === targetId && returnedQty > 0) {
            const projectId = req.projectId?._id || 'unknown'
            const projectName = req.projectId?.name || 'Unknown Project'
            
            if (!usageMap[projectId]) {
              usageMap[projectId] = { 
                projectId, 
                projectName, 
                totalAssigned: 0,
                totalReturned: 0,
                requests: [] 
              }
            }
            usageMap[projectId].totalAssigned -= returnedQty
            usageMap[projectId].totalReturned += returnedQty
            usageMap[projectId].requests.push({
              requestNumber: req.requestNumber,
              quantity: -returnedQty,
              date: req.receivedAt,
              type: 'returned'
            })
          }
        }
      }
      
      // Filter out projects with 0 or negative net usage
      const filteredUsage = Object.values(usageMap)
        .filter(p => p.totalAssigned > 0)
        .sort((a, b) => b.totalAssigned - a.totalAssigned)
      
      setProjectUsage(filteredUsage)
      
      // Fetch purchase orders that include this material
      try {
        const poRes = await api.get('/api/purchase-requests')
        const allOrders = poRes.data.requests || []
        const materialPOs = allOrders.filter(order => 
          order.items?.some(item => 
            String(item.materialId?._id || item.materialId) === String(materialId)
          )
        ).map(order => {
          const materialItem = order.items.find(item => 
            String(item.materialId?._id || item.materialId) === String(materialId)
          )
          const receivedItem = order.receivedItems?.find(item => 
            String(item.materialId) === String(materialId)
          )
          return {
            requestNumber: order.requestNumber,
            grnNumber: order.grnNumber,
            supplier: order.supplier?.name || '-',
            requestedQty: materialItem?.quantity || 0,
            receivedQty: receivedItem?.receivedQty || 0,
            status: order.status,
            date: order.createdAt
          }
        })
        setPurchaseOrders(materialPOs)
      } catch (err) {
        console.error('Error fetching purchase orders:', err)
      }
    } catch (error) {
      console.error('Error fetching material data:', error)
      setNotify({ open: true, title: 'Error', message: 'Failed to load material details.' })
    } finally {
      setLoading(false)
    }
  }

  const getCategoryBadge = (category) => {
    const styles = {
      project_items: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'Project Items' },
      staff_items: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1', label: 'Staff Items' }
    }
    const s = styles[category] || styles.project_items
    return (
      <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', background: s.bg, color: s.color }}>
        {s.label}
      </span>
    )
  }

  const getStockStatus = (quantity, minStock) => {
    if (quantity <= 0) {
      return { color: '#ef4444', label: 'Out of Stock', bg: 'rgba(239,68,68,0.1)' }
    }
    if (quantity <= minStock) {
      return { color: '#f59e0b', label: 'Low Stock', bg: 'rgba(251,191,36,0.1)' }
    }
    return { color: '#10b981', label: 'In Stock', bg: 'rgba(16,185,129,0.1)' }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading material details...</p>
      </div>
    )
  }

  if (!material) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '48px', maxWidth: '500px', margin: '0 auto' }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>📦</div>
          <h2 style={{ color: 'var(--text)', marginBottom: '16px' }}>Material Not Found</h2>
          <p style={{ color: 'var(--text-muted)' }}>The material you are looking for does not exist or you don't have permission to view it.</p>
          <button className="save-btn" style={{ marginTop: '24px' }} onClick={() => navigate('/inventory')}>Back to Inventory</button>
        </div>
      </div>
    )
  }

  const stockStatus = getStockStatus(material.quantity, material.minStockLevel)
  const totalUsed = projectUsage.reduce((sum, p) => sum + p.totalAssigned, 0)

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <button className="link-btn" onClick={() => navigate(-1)} style={{ marginBottom: '8px' }}>← Back</button>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>{material.name}</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--primary)', fontSize: '14px', fontWeight: '600' }}>
            SKU: {material.sku}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {getCategoryBadge(material.category)}
          <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', background: stockStatus.bg, color: stockStatus.color }}>
            {stockStatus.label}
          </span>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: stockStatus.color }}>{material.quantity}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Current Stock</div>
        </div>
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text)' }}>{material.minStockLevel || 0}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Min Stock Level</div>
        </div>
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#6366f1' }}>{totalUsed}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Total Used</div>
        </div>
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text)' }}>{projectUsage.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Projects Using</div>
        </div>
      </div>

      {/* Material Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📋 Material Information</h3>
          
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name</label>
            <div style={{ fontWeight: '600', color: 'var(--text)' }}>{material.name}</div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SKU</label>
            <div style={{ fontWeight: '600', color: 'var(--primary)' }}>{material.sku}</div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Unit of Measure</label>
            <div style={{ color: 'var(--text)' }}>{material.uom}</div>
          </div>

          {material.description && (
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Description</label>
              <div style={{ color: 'var(--text)', fontSize: '14px' }}>{material.description}</div>
            </div>
          )}
        </div>

        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>🏪 Store Information</h3>
          
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Store Name</label>
            <div style={{ fontWeight: '600', color: 'var(--text)' }}>{material.storeId?.name || 'N/A'}</div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Location</label>
            <div style={{ color: 'var(--text)' }}>{material.storeId?.location || 'N/A'}</div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Created By</label>
            <div style={{ color: 'var(--text)' }}>{material.createdBy?.name || 'N/A'}</div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Created At</label>
            <div style={{ color: 'var(--text)', fontSize: '13px' }}>{new Date(material.createdAt).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Project Usage Breakdown */}
      <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📊 Usage by Project</h3>
        
        {projectUsage.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
            <p>No usage recorded for this material yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Project</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Net Usage</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Returned</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Transactions</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {projectUsage.map((usage, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px' }}>
                      <span 
                        style={{ 
                          color: 'var(--primary)', 
                          fontWeight: '500', 
                          cursor: 'pointer',
                          textDecoration: 'none'
                        }}
                        onClick={() => navigate(`/project-detail?id=${usage.projectId}`)}
                        onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                        onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                        title="View Project Details"
                      >
                        {usage.projectName}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <span style={{ fontWeight: '700', color: '#6366f1', fontSize: '16px' }}>
                        {usage.totalAssigned}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '4px' }}>
                        {material.uom}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {usage.totalReturned > 0 ? (
                        <span style={{ fontWeight: '600', color: '#f59e0b', fontSize: '14px' }}>
                          ↩ {usage.totalReturned}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {usage.requests.filter(r => r.type === 'assigned').length > 0 && (
                          <span style={{ padding: '4px 8px', background: 'rgba(16,185,129,0.1)', borderRadius: '4px', fontSize: '11px', color: '#059669' }}>
                            +{usage.requests.filter(r => r.type === 'assigned').length}
                          </span>
                        )}
                        {usage.requests.filter(r => r.type === 'returned').length > 0 && (
                          <span style={{ padding: '4px 8px', background: 'rgba(245,158,11,0.1)', borderRadius: '4px', fontSize: '11px', color: '#f59e0b' }}>
                            ↩{usage.requests.filter(r => r.type === 'returned').length}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      {usage.requests.length > 0 ? new Date(usage.requests[usage.requests.length - 1].date).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg)' }}>
                  <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text)' }}>Total</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--text)', fontSize: '16px' }}>
                    {totalUsed} {material.uom}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#f59e0b', fontSize: '14px' }}>
                    {projectUsage.reduce((sum, p) => sum + (p.totalReturned || 0), 0) > 0 
                      ? `↩ ${projectUsage.reduce((sum, p) => sum + (p.totalReturned || 0), 0)}` 
                      : '-'}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Purchase Orders */}
      {purchaseOrders.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📦 Purchase Requests</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Order #</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Supplier</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Ordered</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Received</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((po, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px' }}>
                      <span style={{ color: 'var(--primary)', fontWeight: '600' }}>{po.requestNumber}</span>
                      {po.grnNumber && (
                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>{po.grnNumber}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{po.supplier}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: 'var(--text)' }}>
                      {po.requestedQty} {material.uom}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {po.status === 'received' ? (
                        <span style={{ fontWeight: '600', color: '#22c55e' }}>{po.receivedQty} {material.uom}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        background: po.status === 'received' ? 'rgba(34,197,94,0.1)' : 
                                    po.status === 'fulfilled' ? 'rgba(99,102,241,0.1)' :
                                    po.status === 'approved' ? 'rgba(16,185,129,0.1)' :
                                    po.status === 'pending' ? 'rgba(251,191,36,0.1)' : 'rgba(107,114,128,0.1)',
                        color: po.status === 'received' ? '#22c55e' : 
                               po.status === 'fulfilled' ? '#6366f1' :
                               po.status === 'approved' ? '#10b981' :
                               po.status === 'pending' ? '#f59e0b' : '#6b7280'
                      }}>
                        {po.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      {new Date(po.date).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg)' }}>
                  <td colSpan={2} style={{ padding: '12px', fontWeight: '600', color: 'var(--text)' }}>Total</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--text)', fontSize: '16px' }}>
                    {purchaseOrders.reduce((sum, po) => sum + po.requestedQty, 0)} {material.uom}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: '#22c55e', fontSize: '16px' }}>
                    {purchaseOrders.reduce((sum, po) => sum + po.receivedQty, 0)} {material.uom}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Edit History */}
      {material.edits && material.edits.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📝 Edit History</h3>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {material.edits.slice().reverse().map((edit, index) => (
              <div key={index} style={{ padding: '12px', background: 'var(--bg)', borderRadius: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text)', fontWeight: '500', fontSize: '13px' }}>
                    {edit.editedBy?.name || 'System'}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    {new Date(edit.editedAt).toLocaleString()}
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  {edit.changes?.map((change, i) => (
                    <li key={i}>
                      <strong>{change.field}:</strong> {String(change.from)} → {String(change.to)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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

export default MaterialDetail
