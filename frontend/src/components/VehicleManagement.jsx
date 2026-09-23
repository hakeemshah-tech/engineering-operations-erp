import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'
import { Modal } from '../design-system/Modal'
import './VehicleManagement.css'

export default function VehicleManagement() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canManage = roles.includes('admin') || roles.includes('manager')

  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [notify, setNotify] = useState(null)

  const [filters, setFilters] = useState({
    status: '',
    vehicleType: '',
    category: '',
    search: ''
  })

  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    plateNumber: '',
    make: '',
    model: '',
    year: '',
    color: '',
    vin: '',
    vehicleType: 'car',
    category: 'company',
    fuelType: 'petrol',
    transmission: 'manual',
    seatingCapacity: '',
    loadCapacity: '',
    purchaseDate: '',
    purchasePrice: '',
    ownershipStatus: 'owned',
    assignedDriver: '',
    status: 'active'
  })

  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    fetchVehicles()
  }, [filters, page])

  const fetchVehicles = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page,
        limit: 10,
        ...(filters.status && { status: filters.status }),
        ...(filters.vehicleType && { vehicleType: filters.vehicleType }),
        ...(filters.category && { category: filters.category }),
        ...(filters.search && { search: filters.search })
      })

      const res = await api.get(`/api/vehicles?${params}`)
      setVehicles(res.data.items || [])
      setTotal(res.data.total || 0)
      setPages(res.data.pages || 0)
    } catch (error) {
      console.error('Error fetching vehicles:', error)
      setNotify({ type: 'error', message: 'Failed to load vehicles.' })
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }))
    setPage(1)
  }

  const handleClearFilters = () => {
    setFilters({ status: '', vehicleType: '', category: '', search: '' })
    setPage(1)
  }

  const handleCreateClick = () => {
    setEditingId(null)
    setFormData({
      plateNumber: '',
      make: '',
      model: '',
      year: '',
      color: '',
      vin: '',
      vehicleType: 'car',
      category: 'company',
      fuelType: 'petrol',
      transmission: 'manual',
      seatingCapacity: '',
      loadCapacity: '',
      purchaseDate: '',
      purchasePrice: '',
      ownershipStatus: 'owned',
      assignedDriver: '',
      status: 'active'
    })
    setShowModal(true)
  }

  const handleEditClick = async (vehicleId) => {
    try {
      const res = await api.get(`/api/vehicles/${vehicleId}`)
      const vehicle = res.data
      setEditingId(vehicleId)
      setFormData({
        plateNumber: vehicle.plateNumber || '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        year: vehicle.year ? vehicle.year.toString() : '',
        color: vehicle.color || '',
        vin: vehicle.vin || '',
        vehicleType: vehicle.vehicleType || 'car',
        category: vehicle.category || 'company',
        fuelType: vehicle.fuelType || 'petrol',
        transmission: vehicle.transmission || 'manual',
        seatingCapacity: vehicle.seatingCapacity ? vehicle.seatingCapacity.toString() : '',
        loadCapacity: vehicle.loadCapacity || '',
        purchaseDate: vehicle.purchaseDate ? vehicle.purchaseDate.split('T')[0] : '',
        purchasePrice: vehicle.purchasePrice ? vehicle.purchasePrice.toString() : '',
        ownershipStatus: vehicle.ownershipStatus || 'owned',
        assignedDriver: vehicle.assignedDriver?.userId?._id || vehicle.assignedDriver?.userId || '',
        status: vehicle.status || 'active'
      })
      setShowModal(true)
    } catch (error) {
      setNotify({ type: 'error', message: 'Failed to load vehicle.' })
    }
  }

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSaveVehicle = async () => {
    if (!formData.plateNumber) {
      setNotify({ type: 'error', message: 'Plate number is required.' })
      return
    }

    try {
      const submitData = {
        plateNumber: formData.plateNumber.toUpperCase(),
        make: formData.make || undefined,
        model: formData.model || undefined,
        year: formData.year ? parseInt(formData.year) : undefined,
        color: formData.color || undefined,
        vin: formData.vin || undefined,
        vehicleType: formData.vehicleType,
        category: formData.category,
        fuelType: formData.fuelType || undefined,
        transmission: formData.transmission || undefined,
        seatingCapacity: formData.seatingCapacity ? parseInt(formData.seatingCapacity) : undefined,
        loadCapacity: formData.loadCapacity || undefined,
        purchaseDate: formData.purchaseDate || undefined,
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : undefined,
        ownershipStatus: formData.ownershipStatus,
        assignedDriver: formData.assignedDriver ? {
          userId: formData.assignedDriver
        } : undefined,
        status: formData.status
      }

      if (!editingId) {
        await api.post('/api/vehicles', submitData)
      } else {
        await api.put(`/api/vehicles/${editingId}`, submitData)
      }

      setShowModal(false)
      setNotify({ type: 'success', message: editingId ? 'Vehicle updated successfully.' : 'Vehicle created successfully.' })
      fetchVehicles()
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: error.response?.data?.message || 'Error saving vehicle.' })
    }
  }

  const handleViewDetails = (vehicleId) => {
    navigate(`/vehicle-detail?id=${vehicleId}`)
  }

  const handleDeleteClick = (vehicleId) => {
    setDeleteConfirm(vehicleId)
  }

  const handleConfirmDelete = async (vehicleId) => {
    try {
      await api.delete(`/api/vehicles/${vehicleId}`)
      setDeleteConfirm(null)
      setNotify({ type: 'success', message: 'Vehicle deleted successfully.' })
      fetchVehicles()
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: 'Error deleting vehicle.' })
    }
  }

  if (!canManage) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>You do not have permission to manage company vehicles.</p>
      </div>
    )
  }

  if (loading && page === 1) return <Spinner />

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)', margin: '0 0 4px 0' }}>
            Vehicle Fleet
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
            Manage company vehicles and fleet documentation
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
          + Add Vehicle
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
            placeholder="Search vehicles..."
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
            <option value="in_service">In Service</option>
            <option value="maintenance">Maintenance</option>
            <option value="idle">Idle</option>
            <option value="sold">Sold</option>
          </select>

          <select
            value={filters.vehicleType}
            onChange={(e) => handleFilterChange('vehicleType', e.target.value)}
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
            <option value="car">Car</option>
            <option value="suv">SUV</option>
            <option value="pickup">Pickup</option>
            <option value="van">Van</option>
            <option value="truck">Truck</option>
            <option value="bus">Bus</option>
            <option value="trailer">Trailer</option>
            <option value="other">Other</option>
          </select>

          <select
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'var(--input-bg)',
              color: 'var(--text)'
            }}
          >
            <option value="">All Categories</option>
            <option value="company">Company</option>
            <option value="rental">Rental</option>
            <option value="leased">Leased</option>
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

      {/* Vehicles Table */}
      {vehicles.length > 0 ? (
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
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Vehicle ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Plate</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Make / Model</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Type</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Assigned To</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: 'var(--text)' }}>Docs</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle, idx) => (
                  <tr
                    key={vehicle._id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)'}
                    onClick={() => handleViewDetails(vehicle._id)}
                  >
                    <td style={{ padding: '12px', color: 'var(--text)', fontSize: '13px', fontWeight: '600' }}>
                      {vehicle.vehicleId}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text)', fontWeight: '500' }}>
                      {vehicle.plateNumber}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>
                      {vehicle.make} {vehicle.model && vehicle.model}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      {vehicle.vehicleType}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        background: vehicle.status === 'active' ? 'rgba(16, 185, 129, 0.1)' :
                                   vehicle.status === 'maintenance' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                        color: vehicle.status === 'active' ? '#10b981' :
                               vehicle.status === 'maintenance' ? '#f59e0b' : '#6b7280',
                        fontSize: '12px',
                        fontWeight: '600',
                        borderRadius: '4px'
                      }}>
                        {vehicle.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      {vehicle.assignedDriver?.name || '—'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {vehicle.expiringDocumentsCount > 0 ? (
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          background: 'rgba(245, 158, 11, 0.1)',
                          color: '#f59e0b',
                          fontSize: '12px',
                          fontWeight: '600',
                          borderRadius: '4px'
                        }}>
                          {vehicle.expiringDocumentsCount} expiring
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>OK</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditClick(vehicle._id) }}
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
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(vehicle._id) }}
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
          <p style={{ fontSize: '40px', margin: '0 0 12px 0' }}>🚗</p>
          <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: '0 0 4px 0' }}>
            No vehicles yet
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
            Add your first vehicle to get started
          </p>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Vehicle' : 'New Vehicle'}
        size="xlarge"
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Plate Number <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                name="plateNumber"
                value={formData.plateNumber}
                onChange={handleFormChange}
                placeholder="e.g. ABC-1234"
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
                Vehicle Type
              </label>
              <select
                name="vehicleType"
                value={formData.vehicleType}
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
                <option value="car">Car</option>
                <option value="suv">SUV</option>
                <option value="pickup">Pickup</option>
                <option value="van">Van</option>
                <option value="truck">Truck</option>
                <option value="bus">Bus</option>
                <option value="trailer">Trailer</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Make
              </label>
              <input
                type="text"
                name="make"
                value={formData.make}
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
                Model
              </label>
              <input
                type="text"
                name="model"
                value={formData.model}
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
                Year
              </label>
              <input
                type="number"
                name="year"
                value={formData.year}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Color
              </label>
              <input
                type="text"
                name="color"
                value={formData.color}
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
                VIN (optional)
              </label>
              <input
                type="text"
                name="vin"
                value={formData.vin}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Fuel Type
              </label>
              <select
                name="fuelType"
                value={formData.fuelType}
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
                <option value="petrol">Petrol</option>
                <option value="diesel">Diesel</option>
                <option value="electric">Electric</option>
                <option value="hybrid">Hybrid</option>
                <option value="cng">CNG</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Transmission
              </label>
              <select
                name="transmission"
                value={formData.transmission}
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
                <option value="manual">Manual</option>
                <option value="automatic">Automatic</option>
                <option value="cvt">CVT</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Seating Capacity
              </label>
              <input
                type="number"
                name="seatingCapacity"
                value={formData.seatingCapacity}
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
                Load Capacity
              </label>
              <input
                type="text"
                name="loadCapacity"
                value={formData.loadCapacity}
                onChange={handleFormChange}
                placeholder="e.g. 500 kg"
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
                Category
              </label>
              <select
                name="category"
                value={formData.category}
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
                <option value="company">Company</option>
                <option value="rental">Rental</option>
                <option value="leased">Leased</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Ownership Status
              </label>
              <select
                name="ownershipStatus"
                value={formData.ownershipStatus}
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
                <option value="owned">Owned</option>
                <option value="leased">Leased</option>
                <option value="rented">Rented</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Status
              </label>
              <select
                name="status"
                value={formData.status}
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
                <option value="active">Active</option>
                <option value="in_service">In Service</option>
                <option value="maintenance">Maintenance</option>
                <option value="idle">Idle</option>
                <option value="decommissioned">Decommissioned</option>
                <option value="sold">Sold</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Purchase Price
              </label>
              <input
                type="number"
                name="purchasePrice"
                value={formData.purchasePrice}
                onChange={handleFormChange}
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
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Purchase Date
            </label>
            <input
              type="date"
              name="purchaseDate"
              value={formData.purchaseDate}
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
              onClick={handleSaveVehicle}
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
              {editingId ? 'Update Vehicle' : 'Create Vehicle'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal
          isOpen={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Vehicle"
          size="small"
        >
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '16px' }}>
              Are you sure you want to delete this vehicle? This action cannot be undone.
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
