import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'
import { Modal } from '../design-system/Modal'
import ExpiryBadge from './ExpiryBadge'
import './VehicleDetail.css'

export default function VehicleDetail() {
  const [searchParams] = useSearchParams()
  const vehicleId = searchParams.get('id')

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canManage = roles.includes('admin') || roles.includes('manager')

  const [vehicle, setVehicle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [notify, setNotify] = useState(null)

  const [showDocModal, setShowDocModal] = useState(false)
  const [editingDocId, setEditingDocId] = useState(null)
  const [docFormData, setDocFormData] = useState({
    documentType: 'registration',
    documentNumber: '',
    issueDate: '',
    expiryDate: '',
    issuingAuthority: '',
    notes: ''
  })
  const [docFiles, setDocFiles] = useState([])
  const [deleteDocConfirm, setDeleteDocConfirm] = useState(null)

  useEffect(() => {
    if (vehicleId) fetchVehicle()
  }, [vehicleId])

  const fetchVehicle = async () => {
    try {
      setLoading(true)
      const res = await api.get(`/api/vehicles/${vehicleId}`)
      setVehicle(res.data)
    } catch (error) {
      console.error('Error fetching vehicle:', error)
      setNotify({ type: 'error', message: 'Failed to load vehicle details.' })
    } finally {
      setLoading(false)
    }
  }

  const handleAddDocClick = () => {
    setEditingDocId(null)
    setDocFormData({
      documentType: 'registration',
      documentNumber: '',
      issueDate: '',
      expiryDate: '',
      issuingAuthority: '',
      notes: ''
    })
    setDocFiles([])
    setShowDocModal(true)
  }

  const handleDocFormChange = (e) => {
    const { name, value } = e.target
    setDocFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleDocFileSelect = (e) => {
    setDocFiles(Array.from(e.target.files || []))
  }

  const handleSaveDocument = async () => {
    if (!docFormData.documentType) {
      setNotify({ type: 'error', message: 'Document type is required.' })
      return
    }

    try {
      const submitData = {
        documentType: docFormData.documentType,
        documentNumber: docFormData.documentNumber || undefined,
        issueDate: docFormData.issueDate || undefined,
        expiryDate: docFormData.expiryDate || undefined,
        issuingAuthority: docFormData.issuingAuthority || undefined,
        notes: docFormData.notes || undefined
      }

      if (!editingDocId) {
        const formData = new FormData()
        Object.keys(submitData).forEach(key => {
          if (submitData[key] !== undefined) {
            formData.append(key, submitData[key])
          }
        })
        docFiles.forEach(f => formData.append('files', f))

        await api.post(`/api/vehicles/${vehicleId}/documents`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      } else {
        await api.put(`/api/vehicles/${vehicleId}/documents/${editingDocId}`, submitData)

        if (docFiles.length > 0) {
          const formData = new FormData()
          docFiles.forEach(f => formData.append('files', f))
          await api.post(`/api/vehicles/${vehicleId}/documents/${editingDocId}/attachments`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
        }
      }

      setShowDocModal(false)
      setNotify({ type: 'success', message: editingDocId ? 'Document updated.' : 'Document added.' })
      fetchVehicle()
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: error.response?.data?.message || 'Error saving document.' })
    }
  }

  const handleDeleteDocument = async (docId) => {
    try {
      await api.delete(`/api/vehicles/${vehicleId}/documents/${docId}`)
      setDeleteDocConfirm(null)
      setNotify({ type: 'success', message: 'Document deleted.' })
      fetchVehicle()
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: 'Error deleting document.' })
    }
  }

  if (loading) return <Spinner />

  if (!vehicle) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>Vehicle not found.</p>
      </div>
    )
  }

  if (!canManage) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>You do not have permission to view vehicle details.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)', margin: '0 0 4px 0' }}>
          {vehicle.plateNumber} • {vehicle.make} {vehicle.model}
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
          {vehicle.vehicleId}
        </p>
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

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '24px',
        overflowX: 'auto'
      }}>
        {['overview', 'documents', 'history', 'service'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
              color: activeTab === tab ? '#6366f1' : 'var(--text-muted)',
              fontWeight: activeTab === tab ? '600' : '500',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                Vehicle Information
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Plate Number
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.plateNumber}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Make / Model
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.make} {vehicle.model}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Year
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.year || '—'}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Color
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.color || '—'}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Type
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.vehicleType}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Status
                </p>
                <span style={{
                  display: 'inline-block',
                  padding: '4px 8px',
                  background: vehicle.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                  color: vehicle.status === 'active' ? '#10b981' : '#6b7280',
                  fontSize: '14px',
                  fontWeight: '600',
                  borderRadius: '4px'
                }}>
                  {vehicle.status}
                </span>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Fuel Type
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.fuelType || '—'}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Transmission
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.transmission || '—'}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Seating Capacity
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.seatingCapacity || '—'}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Load Capacity
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.loadCapacity || '—'}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Purchase Date
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toLocaleDateString() : '—'}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Purchase Price
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.purchasePrice || '—'}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Category
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.category}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                  Ownership Status
                </p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {vehicle.ownershipStatus}
                </p>
              </div>

              {vehicle.vin && (
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                    VIN
                  </p>
                  <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                    {vehicle.vin}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={handleAddDocClick}
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

          {vehicle.vehicleDocuments && vehicle.vehicleDocuments.length > 0 ? (
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
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Type</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Number</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Issuing Authority</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Expiry</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>Files</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicle.vehicleDocuments.map((doc, idx) => (
                      <tr
                        key={doc._id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)'
                        }}
                      >
                        <td style={{ padding: '12px', color: 'var(--text)', fontWeight: '500' }}>
                          {doc.documentType}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                          {doc.documentNumber || '—'}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                          {doc.issuingAuthority || '—'}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {doc.expiryDate ? (
                            <ExpiryBadge expiryDate={doc.expiryDate} />
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                          {doc.attachments?.length || 0}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDeleteDocument(doc._id)}
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '48px 24px',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '40px', margin: '0 0 12px 0' }}>📋</p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: '0 0 4px 0' }}>
                No documents yet
              </p>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
                Add vehicle documents like registration, insurance, and permits
              </p>
            </div>
          )}
        </div>
      )}

      {/* Edit History Tab */}
      {activeTab === 'history' && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          {vehicle.edits && vehicle.edits.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {vehicle.edits.map((edit, idx) => (
                <div key={idx} style={{
                  paddingLeft: '16px',
                  borderLeft: '2px solid var(--border)',
                  paddingBottom: '12px'
                }}>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text)', margin: '0 0 4px 0' }}>
                    {edit.editedBy?.name || 'Unknown'} • {new Date(edit.editedAt).toLocaleString()}
                  </p>
                  {edit.changes?.map((change, cidx) => (
                    <p key={cidx} style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0' }}>
                      <strong>{change.field}:</strong> {change.from} → {change.to}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
              No edit history available
            </p>
          )}
        </div>
      )}

      {/* Service Info Tab */}
      {activeTab === 'service' && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                Last Service Date
              </p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                {vehicle.lastServiceDate ? new Date(vehicle.lastServiceDate).toLocaleDateString() : '—'}
              </p>
            </div>

            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                Next Service Date
              </p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                {vehicle.nextServiceDate ? new Date(vehicle.nextServiceDate).toLocaleDateString() : '—'}
              </p>
            </div>

            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                Odometer Reading
              </p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                {vehicle.odometerReading || '—'} km
              </p>
            </div>

            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                Current Value
              </p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                {vehicle.currentValue || '—'}
              </p>
            </div>

            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0', fontWeight: '500' }}>
                Current Location
              </p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                {vehicle.currentLocation || '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Document Modal */}
      <Modal
        isOpen={showDocModal}
        onClose={() => setShowDocModal(false)}
        title="Add Vehicle Document"
        size="large"
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Document Type <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="documentType"
                value={docFormData.documentType}
                onChange={handleDocFormChange}
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
                <option value="registration">Registration</option>
                <option value="insurance">Insurance</option>
                <option value="pollution">Pollution</option>
                <option value="inspection">Inspection</option>
                <option value="permit">Permit</option>
                <option value="road_tax">Road Tax</option>
                <option value="fitness_certificate">Fitness Certificate</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Document Number
              </label>
              <input
                type="text"
                name="documentNumber"
                value={docFormData.documentNumber}
                onChange={handleDocFormChange}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Issue Date
              </label>
              <input
                type="date"
                name="issueDate"
                value={docFormData.issueDate}
                onChange={handleDocFormChange}
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
                value={docFormData.expiryDate}
                onChange={handleDocFormChange}
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
              Issuing Authority
            </label>
            <input
              type="text"
              name="issuingAuthority"
              value={docFormData.issuingAuthority}
              onChange={handleDocFormChange}
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
              name="notes"
              value={docFormData.notes}
              onChange={handleDocFormChange}
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
                setDocFiles(Array.from(e.dataTransfer.files))
              }}
            >
              <input
                type="file"
                multiple
                onChange={handleDocFileSelect}
                style={{ display: 'none' }}
              />
              <p style={{ color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                Drag and drop files here or click to browse
              </p>
              {docFiles.length > 0 && (
                <p style={{ fontSize: '12px', color: '#6366f1', margin: '8px 0 0 0' }}>
                  {docFiles.length} file(s) selected
                </p>
              )}
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              onClick={() => setShowDocModal(false)}
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
              Add Document
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Document Confirmation */}
      {deleteDocConfirm && (
        <Modal
          isOpen={!!deleteDocConfirm}
          onClose={() => setDeleteDocConfirm(null)}
          title="Delete Document"
          size="small"
        >
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '16px' }}>
              Are you sure you want to delete this document?
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setDeleteDocConfirm(null)}
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
                onClick={() => handleDeleteDocument(deleteDocConfirm)}
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
