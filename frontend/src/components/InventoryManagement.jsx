import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Spinner, ButtonLoader } from './LoadingComponents'

function InventoryManagement() {
  const [currentUser, setCurrentUser] = useState(null)
  const [activeTab, setActiveTab] = useState('materials')
  const [stores, setStores] = useState([])
  const [materials, setMaterials] = useState([])
  const [storeKeepers, setStoreKeepers] = useState([])
  const [brands, setBrands] = useState([])
  const [newBrandName, setNewBrandName] = useState('')
  const [addingBrand, setAddingBrand] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [storeCreationEnabled, setStoreCreationEnabled] = useState(true)
  
  // Store modal state
  const [storeModal, setStoreModal] = useState({ open: false, mode: 'create', data: null })
  const [storeForm, setStoreForm] = useState({ name: '', location: '', description: '', assignedStoreKeeper: '', status: 'active' })
  
  // Material modal state
  const [materialModal, setMaterialModal] = useState({ open: false, mode: 'create', data: null })
  const [materialForm, setMaterialForm] = useState({ name: '', sku: '', uom: 'Pcs', category: 'project_specific', storeId: '', quantity: 0, minStockLevel: 0, description: '', brand: '' })
  
  // Delete confirmation modal
  const [deleteModal, setDeleteModal] = useState({ open: false, type: '', id: '', name: '' })
  
  // Filters
  const [materialFilters, setMaterialFilters] = useState({ storeId: '', category: '', search: '', brand: '' })

  const isInventoryManager = currentUser?.roles?.includes('inventory_manager')
  const isStoreKeeper = currentUser?.roles?.includes('store_keeper')
  const isAdminOrManager = currentUser?.roles?.includes('admin') || currentUser?.roles?.includes('manager')
  const hasAccess = isInventoryManager || isStoreKeeper || isAdminOrManager

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
      fetchStores()
      fetchMaterials()
      fetchBrands()
      fetchInventorySettings()
      if (isInventoryManager) {
        fetchStoreKeepers()
      }
    } else if (currentUser && !hasAccess) {
      setLoading(false)
    }
  }, [currentUser])

  const fetchInventorySettings = async () => {
    try {
      const res = await api.get('/api/system-settings/inventory')
      setStoreCreationEnabled(res.data.storeCreationEnabled ?? true)
    } catch (error) {
      console.error('Error fetching inventory settings:', error)
    }
  }

  const fetchStores = async () => {
    try {
      const res = await api.get('/api/stores')
      setStores(res.data)
    } catch (error) {
      console.error('Error fetching stores:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMaterials = async () => {
    try {
      const params = new URLSearchParams()
      if (materialFilters.storeId) params.append('storeId', materialFilters.storeId)
      if (materialFilters.category) params.append('category', materialFilters.category)
      if (materialFilters.search) params.append('search', materialFilters.search)
      if (materialFilters.brand) params.append('brand', materialFilters.brand)
      
      const res = await api.get(`/api/materials?${params.toString()}`)
      setMaterials(res.data)
    } catch (error) {
      console.error('Error fetching materials:', error)
    }
  }

  const fetchStoreKeepers = async () => {
    try {
      const res = await api.get('/api/stores/users/store-keepers')
      setStoreKeepers(res.data)
    } catch (error) {
      console.error('Error fetching store keepers:', error)
    }
  }

  const fetchBrands = async () => {
    try {
      const res = await api.get('/api/brands')
      setBrands(res.data)
    } catch (error) {
      console.error('Error fetching brands:', error)
    }
  }

  const handleAddBrand = async () => {
    if (!newBrandName.trim()) return
    setAddingBrand(true)
    try {
      const res = await api.post('/api/brands', { name: newBrandName.trim() })
      setBrands(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)))
      setMaterialForm(prev => ({ ...prev, brand: res.data._id }))
      setNewBrandName('')
      setNotify({ open: true, title: 'Success', message: `Brand "${res.data.name}" created.` })
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to add brand.' })
    } finally {
      setAddingBrand(false)
    }
  }

  useEffect(() => {
    if (currentUser && hasAccess) {
      fetchMaterials()
    }
  }, [materialFilters])

  // Store CRUD
  const openStoreModal = (mode, store = null) => {
    if (mode === 'edit' && store) {
      setStoreForm({
        name: store.name || '',
        location: store.location || '',
        description: store.description || '',
        assignedStoreKeeper: store.assignedStoreKeeper?._id || '',
        status: store.status || 'active'
      })
      setStoreModal({ open: true, mode: 'edit', data: store })
    } else {
      setStoreForm({ name: '', location: '', description: '', assignedStoreKeeper: '', status: 'active' })
      setStoreModal({ open: true, mode: 'create', data: null })
    }
  }

  const handleSaveStore = async () => {
    if (!storeForm.name.trim()) {
      setNotify({ open: true, title: 'Validation Error', message: 'Store name is required.' })
      return
    }
    
    setSaving(true)
    try {
      if (storeModal.mode === 'create') {
        await api.post('/api/stores', storeForm)
        setNotify({ open: true, title: 'Success', message: 'Store created successfully.' })
      } else {
        await api.put(`/api/stores/${storeModal.data._id}`, storeForm)
        setNotify({ open: true, title: 'Success', message: 'Store updated successfully.' })
      }
      setStoreModal({ open: false, mode: 'create', data: null })
      fetchStores()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to save store.' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteStore = async () => {
    setSaving(true)
    try {
      await api.delete(`/api/stores/${deleteModal.id}`)
      setNotify({ open: true, title: 'Success', message: 'Store deleted successfully.' })
      setDeleteModal({ open: false, type: '', id: '', name: '' })
      fetchStores()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to delete store.' })
    } finally {
      setSaving(false)
    }
  }

  // Material CRUD
  const openMaterialModal = (mode, material = null) => {
    if (mode === 'edit' && material) {
      setMaterialForm({
        name: material.name || '',
        sku: material.sku || '',
        uom: material.uom || 'Pcs',
        category: material.category || 'project_specific',
        storeId: material.storeId?._id || '',
        quantity: material.quantity || 0,
        minStockLevel: material.minStockLevel || 0,
        description: material.description || '',
        brand: material.brand?._id || ''
      })
      setMaterialModal({ open: true, mode: 'edit', data: material })
    } else {
      const defaultStoreId = stores.length === 1 ? stores[0]._id : ''
      setMaterialForm({ name: '', sku: '', uom: 'Pcs', category: 'project_specific', storeId: defaultStoreId, quantity: 0, minStockLevel: 0, description: '', brand: '' })
      setMaterialModal({ open: true, mode: 'create', data: null })
    }
  }

  const handleSaveMaterial = async () => {
    if (!materialForm.name.trim() || !materialForm.sku.trim() || !materialForm.storeId) {
      setNotify({ open: true, title: 'Validation Error', message: 'Name, SKU, and Store are required.' })
      return
    }
    
    setSaving(true)
    try {
      if (materialModal.mode === 'create') {
        await api.post('/api/materials', materialForm)
        setNotify({ open: true, title: 'Success', message: 'Material created successfully.' })
      } else {
        await api.put(`/api/materials/${materialModal.data._id}`, materialForm)
        setNotify({ open: true, title: 'Success', message: 'Material updated successfully.' })
      }
      setMaterialModal({ open: false, mode: 'create', data: null })
      fetchMaterials()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to save material.' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteMaterial = async () => {
    setSaving(true)
    try {
      await api.delete(`/api/materials/${deleteModal.id}`)
      setNotify({ open: true, title: 'Success', message: 'Material deleted successfully.' })
      setDeleteModal({ open: false, type: '', id: '', name: '' })
      fetchMaterials()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to delete material.' })
    } finally {
      setSaving(false)
    }
  }

  // Access Denied
  if (!loading && currentUser && !hasAccess) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ 
          background: 'var(--card)', 
          borderRadius: '12px', 
          padding: '48px', 
          maxWidth: '500px', 
          margin: '0 auto',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>🚫</div>
          <h2 style={{ color: 'var(--text)', marginBottom: '16px' }}>Access Denied</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            You do not have permission to access the Inventory Management module.
            <br /><br />
            Required roles: <strong>Inventory Manager</strong> or <strong>Store Keeper</strong>
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading inventory data...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
        <button
          onClick={() => setActiveTab('materials')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: '8px',
            background: activeTab === 'materials' ? 'var(--primary)' : 'var(--bg)',
            color: activeTab === 'materials' ? 'white' : 'var(--text)',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          🏷️ Materials
        </button>
        <button
          onClick={() => setActiveTab('stores')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: '8px',
            background: activeTab === 'stores' ? 'var(--primary)' : 'var(--bg)',
            color: activeTab === 'stores' ? 'white' : 'var(--text)',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          📦 Stores
        </button>
      </div>

      {/* Stores Tab */}
      {activeTab === 'stores' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h3 style={{ margin: 0, color: 'var(--text)' }}>Store Locations</h3>
            {isInventoryManager && storeCreationEnabled && (
              <button className="save-btn" onClick={() => openStoreModal('create')}>
                + Add Store
              </button>
            )}
            {isInventoryManager && !storeCreationEnabled && (
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Store creation is disabled by admin
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {stores.map(store => (
              <div key={store._id} style={{
                background: 'var(--card)',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, color: 'var(--text)' }}>{store.name}</h4>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600',
                    background: store.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: store.status === 'active' ? '#10b981' : '#ef4444'
                  }}>
                    {store.status?.toUpperCase()}
                  </span>
                </div>
                
                {store.location && (
                  <p style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: '14px' }}>
                    📍 {store.location}
                  </p>
                )}
                
                {store.assignedStoreKeeper && (
                  <p style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: '14px' }}>
                    👤 {store.assignedStoreKeeper.name}
                  </p>
                )}

                {store.description && (
                  <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {store.description}
                  </p>
                )}

                {isInventoryManager && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                    <button className="link-btn" onClick={() => openStoreModal('edit', store)}>Edit</button>
                    <button className="cancel-btn" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => setDeleteModal({ open: true, type: 'store', id: store._id, name: store.name })}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {stores.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
              <p>No stores found. {isInventoryManager && 'Click "Add Store" to create one.'}</p>
            </div>
          )}
        </div>
      )}

      {/* Materials Tab */}
      {activeTab === 'materials' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, color: 'var(--text)' }}>Material Catalog</h3>
            <button className="save-btn" onClick={() => openMaterialModal('create')}>
              + Add Material
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {isInventoryManager && (
              <select
                value={materialFilters.storeId}
                onChange={e => setMaterialFilters({ ...materialFilters, storeId: e.target.value })}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}
              >
                <option value="">All Stores</option>
                {stores.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            )}
            <select
              value={materialFilters.category}
              onChange={e => setMaterialFilters({ ...materialFilters, category: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}
            >
              <option value="">All Categories</option>
              <option value="project_specific">Project-Specific</option>
              <option value="staff_specific">Staff-Specific</option>
            </select>
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={materialFilters.search}
              onChange={e => setMaterialFilters({ ...materialFilters, search: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', minWidth: '200px' }}
            />
            <select
              value={materialFilters.brand}
              onChange={e => setMaterialFilters({ ...materialFilters, brand: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}
            >
              <option value="">All Brands</option>
              {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>

          {/* Materials Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--card)', borderRadius: '8px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>SKU</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Category</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Store</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Brand</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Qty</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>UOM</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {materials.map(mat => (
                  <tr key={mat._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px', color: 'var(--primary)', fontWeight: '600', fontSize: '13px' }}>{mat.sku}</td>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>{mat.name}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        background: mat.category === 'project_specific' ? 'rgba(59,130,246,0.1)' : 'rgba(168,85,247,0.1)',
                        color: mat.category === 'project_specific' ? '#3b82f6' : '#a855f7'
                      }}>
                        {mat.category === 'project_specific' ? 'Project' : 'Staff'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>{mat.storeId?.name || '-'}</td>
                    <td style={{ padding: '12px', color: 'var(--text)', fontSize: '13px' }}>{mat.brand?.name || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: mat.quantity <= mat.minStockLevel ? '#ef4444' : 'var(--text)' }}>
                      {mat.quantity}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>{mat.uom}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button className="save-btn" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => window.location.href = `/material-detail?id=${mat._id}`}>View</button>
                        <button className="link-btn" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => openMaterialModal('edit', mat)}>Edit</button>
                        <button className="cancel-btn" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => setDeleteModal({ open: true, type: 'material', id: mat._id, name: mat.name })}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {materials.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
              <p>No materials found. Click "Add Material" to create one.</p>
            </div>
          )}
        </div>
      )}

      {/* Store Modal */}
      {storeModal.open && (
        <div className="modal-overlay" onClick={() => setStoreModal({ open: false, mode: 'create', data: null })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>{storeModal.mode === 'create' ? 'Add Store' : 'Edit Store'}</h2>
              <button onClick={() => setStoreModal({ open: false, mode: 'create', data: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div className="form-group">
                <label>Store Name *</label>
                <input type="text" value={storeForm.name} onChange={e => setStoreForm({ ...storeForm, name: e.target.value })} placeholder="e.g., Main Warehouse" />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input type="text" value={storeForm.location} onChange={e => setStoreForm({ ...storeForm, location: e.target.value })} placeholder="e.g., Building A, Ground Floor" />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={storeForm.description} onChange={e => setStoreForm({ ...storeForm, description: e.target.value })} placeholder="Brief description of the store..." rows={3} />
              </div>
              <div className="form-group">
                <label>Assigned Store Keeper</label>
                <select value={storeForm.assignedStoreKeeper} onChange={e => setStoreForm({ ...storeForm, assignedStoreKeeper: e.target.value })}>
                  <option value="">-- Select Store Keeper --</option>
                  {storeKeepers.map(sk => <option key={sk._id} value={sk._id}>{sk.name} ({sk.email})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={storeForm.status} onChange={e => setStoreForm({ ...storeForm, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setStoreModal({ open: false, mode: 'create', data: null })}>Cancel</button>
                <button type="button" className="save-btn" onClick={handleSaveStore} disabled={saving}>
                  <ButtonLoader loading={saving}>{saving ? 'Saving...' : 'Save Store'}</ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Material Modal */}
      {materialModal.open && (
        <div className="modal-overlay" onClick={() => setMaterialModal({ open: false, mode: 'create', data: null })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>{materialModal.mode === 'create' ? 'Add Material' : 'Edit Material'}</h2>
              <button onClick={() => setMaterialModal({ open: false, mode: 'create', data: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Material Name *</label>
                  <input type="text" value={materialForm.name} onChange={e => setMaterialForm({ ...materialForm, name: e.target.value })} placeholder="e.g., Steel Pipe 2 inch" />
                </div>
                <div className="form-group">
                  <label>SKU / Item Code *</label>
                  <input type="text" value={materialForm.sku} onChange={e => setMaterialForm({ ...materialForm, sku: e.target.value.toUpperCase() })} placeholder="e.g., SP-002" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Store *</label>
                  <select value={materialForm.storeId} onChange={e => setMaterialForm({ ...materialForm, storeId: e.target.value })}>
                    <option value="">-- Select Store --</option>
                    {stores.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Category *</label>
                  <select value={materialForm.category} onChange={e => setMaterialForm({ ...materialForm, category: e.target.value })}>
                    <option value="project_specific">Project-Specific</option>
                    <option value="staff_specific">Staff-Specific (Uniforms, Tools, etc.)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Unit of Measure</label>
                  <select value={materialForm.uom} onChange={e => setMaterialForm({ ...materialForm, uom: e.target.value })}>
                    <option value="Pcs">Pieces (Pcs)</option>
                    <option value="Mtrs">Meters (Mtrs)</option>
                    <option value="Kg">Kilograms (Kg)</option>
                    <option value="Sets">Sets</option>
                    <option value="Boxes">Boxes</option>
                    <option value="Ltrs">Liters (Ltrs)</option>
                    <option value="Rolls">Rolls</option>
                    <option value="Bags">Bags</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" min="0" value={materialForm.quantity} onChange={e => setMaterialForm({ ...materialForm, quantity: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label>Min Stock Level</label>
                  <input type="number" min="0" value={materialForm.minStockLevel} onChange={e => setMaterialForm({ ...materialForm, minStockLevel: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={materialForm.description} onChange={e => setMaterialForm({ ...materialForm, description: e.target.value })} placeholder="Additional details..." rows={2} />
              </div>
              <div className="form-group">
                <label>Brand</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select value={materialForm.brand} onChange={e => setMaterialForm({ ...materialForm, brand: e.target.value })} style={{ flex: 1 }}>
                    <option value="">-- No Brand --</option>
                    {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                  </select>
                </div>
                {isInventoryManager && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input
                      type="text"
                      value={newBrandName}
                      onChange={e => setNewBrandName(e.target.value)}
                      placeholder="New brand name..."
                      style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}
                      onKeyDown={e => e.key === 'Enter' && handleAddBrand()}
                    />
                    <button
                      type="button"
                      className="save-btn"
                      style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                      onClick={handleAddBrand}
                      disabled={addingBrand || !newBrandName.trim()}
                    >
                      {addingBrand ? '...' : '+ Add Brand'}
                    </button>
                  </div>
                )}
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setMaterialModal({ open: false, mode: 'create', data: null })}>Cancel</button>
                <button type="button" className="save-btn" onClick={handleSaveMaterial} disabled={saving}>
                  <ButtonLoader loading={saving}>{saving ? 'Saving...' : 'Save Material'}</ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.open && (
        <div className="modal-overlay" onClick={() => setDeleteModal({ open: false, type: '', id: '', name: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Confirm Delete</h2>
              <button onClick={() => setDeleteModal({ open: false, type: '', id: '', name: '' })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to delete <strong>{deleteModal.name}</strong>?</p>
              {deleteModal.type === 'store' && (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                  Note: Stores with materials cannot be deleted.
                </p>
              )}
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setDeleteModal({ open: false, type: '', id: '', name: '' })}>Cancel</button>
                <button 
                  type="button" 
                  className="reject-btn" 
                  onClick={deleteModal.type === 'store' ? handleDeleteStore : handleDeleteMaterial}
                  disabled={saving}
                >
                  <ButtonLoader loading={saving}>{saving ? 'Deleting...' : 'Delete'}</ButtonLoader>
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

export default InventoryManagement
