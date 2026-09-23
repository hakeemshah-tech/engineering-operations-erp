import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'
import AccountHeadSelect from './accounts/AccountHeadSelect'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'

// Stable modules object outside component to prevent re-initialization on every render
const annexureModules = {
  toolbar: {
    container: [
      ['undo', 'redo'],
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['image', 'link'],
      ['clean']
    ],
    handlers: {
      'undo': function() {
        this.quill.history.undo()
      },
      'redo': function() {
        this.quill.history.redo()
      }
    }
  },
  history: {
    delay: 1000,
    maxStack: 50,
    userOnly: true
  }
}

const annexureToolbarTitles = {
  '.ql-undo': 'Undo', '.ql-redo': 'Redo',
  '.ql-bold': 'Bold', '.ql-italic': 'Italic', '.ql-underline': 'Underline',
  '.ql-list[value="ordered"]': 'Ordered List', '.ql-list[value="bullet"]': 'Bullet List',
  '.ql-image': 'Image', '.ql-link': 'Link', '.ql-clean': 'Clear Formatting'
}

function applyToolbarTooltips(editorElement) {
  if (!editorElement) return
  const toolbar = editorElement.closest('.annexure-editor')?.querySelector('.ql-toolbar')
  if (!toolbar) return
  Object.entries(annexureToolbarTitles).forEach(([sel, title]) => {
    const btn = toolbar.querySelector(sel)
    if (btn) btn.setAttribute('title', title)
  })
}

function PurchaseOrderManagement() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [listSearch, setListSearch] = useState('')
  const [listPage, setListPage] = useState(1)
  const LIST_PAGE_SIZE = 10
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  // Create PO state
  const [availablePRs, setAvailablePRs] = useState([])
  const [loadingPRs, setLoadingPRs] = useState(false)
  const [selectedPRItems, setSelectedPRItems] = useState([]) // { requestId, requestNumber, itemId, materialId, materialName, sku, uom, remainingQty, allocatedQty }
  const [poItems, setPoItems] = useState([]) // consolidated items with quantities & prices
  const [suppliers, setSuppliers] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [supplier, setSupplier] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '' })
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState('normal')
  const [submitForApproval, setSubmitForApproval] = useState(false)
  const [vatEnabled, setVatEnabled] = useState(false)
  const [vatPercentage, setVatPercentage] = useState('')
  // PO Type (material or service)
  const [poType, setPoType] = useState('material')
  // Service items (for service POs)
  const [serviceItems, setServiceItems] = useState([])
  // Payment terms
  const [paymentTermsType, setPaymentTermsType] = useState('full_after_completion')
  const [advancePercentage, setAdvancePercentage] = useState(0)
  const [paymentTermsNotes, setPaymentTermsNotes] = useState('')
  // Annexure
  const [annexure, setAnnexure] = useState('')
  // Other PO items (for other/flexible POs)
  const [otherItems, setOtherItems] = useState([])
  // PO-level tax/discount (for other POs)
  const [poTaxType, setPoTaxType] = useState('percentage')
  const [poTaxRate, setPoTaxRate] = useState(0)
  const [poDiscountType, setPoDiscountType] = useState('percentage')
  const [poDiscountRate, setPoDiscountRate] = useState(0)
  // PO type filter for list
  const [poTypeFilter, setPoTypeFilter] = useState('all')

  // Direct materials (not from PR)
  const [directItems, setDirectItems] = useState([]) // { materialId, materialName, sku, uom, quantity, unitPrice, totalPrice }
  const [availableMaterials, setAvailableMaterials] = useState([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)
  const [materialSearch, setMaterialSearch] = useState('')
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState('all')
  const [materialBrandFilter, setMaterialBrandFilter] = useState('')
  const [materialBrandSearch, setMaterialBrandSearch] = useState('')
  const [materialBrandDropdownOpen, setMaterialBrandDropdownOpen] = useState(false)
  const [brands, setBrands] = useState([])
  const [materialPage, setMaterialPage] = useState(1)
  const MATERIAL_PAGE_SIZE = 10
  // Step 1 search/filter/pagination
  const [prSearch, setPrSearch] = useState('')
  const [prPriorityFilter, setPrPriorityFilter] = useState('all')
  const [prPage, setPrPage] = useState(1)
  const PR_PAGE_SIZE = 5
  
  // Fulfill modal
  const [fulfillModal, setFulfillModal] = useState({ open: false, order: null })
  const [fulfillItems, setFulfillItems] = useState([])
  const [fulfilling, setFulfilling] = useState(false)

  // GRN receive modal
  const [receiveModal, setReceiveModal] = useState({ open: false, order: null })
  const [receiveItems, setReceiveItems] = useState([])
  const [receiving, setReceiving] = useState(false)
  const [grnNotes, setGrnNotes] = useState('')
  const [grnDeliveryDate, setGrnDeliveryDate] = useState('')
  const [grnDeliveryPersonName, setGrnDeliveryPersonName] = useState('')
  const [grnDeliveryPersonContact, setGrnDeliveryPersonContact] = useState('')
  const [grnVehicleNumber, setGrnVehicleNumber] = useState('')
  const [grnOverallCondition, setGrnOverallCondition] = useState('good')
  const [grnConditionNotes, setGrnConditionNotes] = useState('')
  const [grnReceiverName, setGrnReceiverName] = useState('')
  const [grnAcknowledgmentNotes, setGrnAcknowledgmentNotes] = useState('')

  // Reject modal
  const [rejectModal, setRejectModal] = useState({ open: false, orderId: null })
  const [rejectReason, setRejectReason] = useState('')

  // Approval confirmation modal
  const [approvalConfirm, setApprovalConfirm] = useState({ open: false, orderId: null, action: null, title: '', message: '', body: {} })

  const navigate = useNavigate()

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const isPE = roles.includes('procurement_engineer')
  const isAM = roles.includes('account_manager')
  const isIM = roles.includes('inventory_manager')
  const isAdmin = roles.includes('admin')
  const isManager = roles.includes('manager')
  const canCreate = isPE || isAdmin
  const canApproveAM = isAM || isAdmin
  const canApproveGM = isManager || isAdmin
  const canFulfill = isPE || isAdmin
  const canReceive = isIM || isAdmin || isManager

  useEffect(() => { fetchData() }, [filter, poTypeFilter])

  const fetchData = async () => {
    try {
      setLoading(true)
      const queryParts = []
      if (filter !== 'all') queryParts.push(`status=${filter}`)
      if (poTypeFilter !== 'all') queryParts.push(`poType=${poTypeFilter}`)
      const params = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''
      const res = await api.get(`/api/purchase-orders${params}`)
      setOrders(res.data.orders || [])
    } catch (error) {
      console.error('Error fetching POs:', error)
    } finally {
      setLoading(false)
    }
  }

  const isServicePOType = (type) => ['manpower', 'subcontracting', 'machine_rental'].includes(type)
  const poTypeLabels = { material: 'Material', manpower: 'Manpower', subcontracting: 'Subcontracting', machine_rental: 'Machine Rental', other: 'Other' }
  const poTypeBadgeColors = {
    material: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
    manpower: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
    subcontracting: { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b' },
    machine_rental: { bg: 'rgba(168,85,247,0.1)', color: '#a855f7' }
  }

  const openCreateModal = async () => {
    setShowCreateModal(true)
    setPoType('material')
    setServiceItems([])
    setPaymentTermsType('full_after_completion')
    setAdvancePercentage(0)
    setPaymentTermsNotes('')
    setAnnexure('')

    setLoadingPRs(true)
    setLoadingMaterials(true)
    try {
      const [prRes, supRes, matRes] = await Promise.all([
        api.get('/api/purchase-orders/available-pr-items'),
        api.get('/api/suppliers?status=active'),
        api.get('/api/materials')
      ])
      setAvailablePRs(prRes.data || [])
      setSuppliers(Array.isArray(supRes.data) ? supRes.data : [])
      setAvailableMaterials(matRes.data || [])
      try {
        const brandsRes = await api.get('/api/brands')
        setBrands(Array.isArray(brandsRes.data) ? brandsRes.data : [])
      } catch { /* brands optional */ }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoadingPRs(false)
      setLoadingMaterials(false)
    }
    setPrSearch('')
    setPrPriorityFilter('all')
    setPrPage(1)
    setMaterialSearch('')
    setMaterialPage(1)
  }

  const closeCreateModal = () => {
    setShowCreateModal(false)
    setPoType('material')
    setSelectedPRItems([])
    setPoItems([])
    setDirectItems([])
    setServiceItems([])
    setSupplierId('')
    setSupplier({ name: '', contactPerson: '', phone: '', email: '', address: '' })
    setSupplierSearch('')
    setSupplierDropdownOpen(false)
    setDeliveryDate('')
    setNotes('')
    setPriority('normal')
    setSubmitForApproval(false)
    setVatEnabled(false)
    setVatPercentage('')
    setPaymentTermsType('full_after_completion')
    setAdvancePercentage(0)
    setPaymentTermsNotes('')
    setAnnexure('')
    setAvailableMaterials([])
    setMaterialSearch('')
    setMaterialCategoryFilter('all')
    setMaterialBrandFilter('')
    setMaterialBrandSearch('')
    setMaterialBrandDropdownOpen(false)
    setMaterialPage(1)
  }

  // Toggle PR item selection (poItems rebuilt via useEffect)
  const togglePRItem = (pr, item) => {
    const key = `${pr.requestId}_${item.itemId}`
    const existing = selectedPRItems.find(s => `${s.requestId}_${s.itemId}` === key)

    if (existing) {
      setSelectedPRItems(prev => prev.filter(s => `${s.requestId}_${s.itemId}` !== key))
    } else {
      setSelectedPRItems(prev => [...prev, {
        requestId: pr.requestId,
        requestNumber: pr.requestNumber,
        itemId: item.itemId,
        materialId: item.materialId,
        materialName: item.materialName,
        sku: item.sku,
        uom: item.uom,
        remainingQty: item.remainingQty,
        allocatedQty: item.remainingQty
      }])
    }
  }

  const updateAllocatedQty = (requestId, itemId, qty) => {
    setSelectedPRItems(prev => prev.map(s =>
      s.requestId === requestId && s.itemId === itemId
        ? { ...s, allocatedQty: Math.min(Number(qty), s.remainingQty) }
        : s
    ))
    // Recalculate PO item qty
    const allForMaterial = selectedPRItems.filter(s => {
      const updated = s.requestId === requestId && s.itemId === itemId
      if (updated) return true
      return true
    })
    // We'll recalculate after state updates via effect
  }

  // Toggle material selection for direct addition (without PR)
  const toggleMaterialForPO = (material) => {
    const id = material._id
    const existing = directItems.find(p => p.materialId === id)
    if (existing) {
      setDirectItems(prev => prev.filter(p => p.materialId !== id))
    } else {
      setDirectItems(prev => [...prev, {
        materialId: id,
        materialName: material.name,
        sku: material.sku,
        uom: material.uom,
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        notes: ''
      }])
    }
  }

  const updateDirectItemQty = (materialId, qty) => {
    const val = Math.max(1, Number(qty) || 1)
    setDirectItems(prev => prev.map(p =>
      p.materialId === materialId
        ? { ...p, quantity: val, totalPrice: val * p.unitPrice }
        : p
    ))
  }

  const updateDirectItemPrice = (materialId, price) => {
    const val = Number(price) || 0
    setDirectItems(prev => prev.map(p =>
      p.materialId === materialId
        ? { ...p, unitPrice: val, totalPrice: p.quantity * val }
        : p
    ))
  }

  // Merge PR-derived items + direct items into poItems
  useEffect(() => {
    // Build PR-sourced items
    const prItems = []
    const materialMap = {}
    for (const s of selectedPRItems) {
      if (!materialMap[s.materialId]) {
        materialMap[s.materialId] = {
          materialId: s.materialId,
          materialName: s.materialName,
          sku: s.sku,
          uom: s.uom,
          quantity: 0,
          unitPrice: poItems.find(p => p.materialId === s.materialId)?.unitPrice || 0,
          notes: poItems.find(p => p.materialId === s.materialId)?.notes || '',
          source: 'pr'
        }
      }
      materialMap[s.materialId].quantity += (s.allocatedQty || 0)
    }
    for (const item of Object.values(materialMap)) {
      prItems.push({ ...item, totalPrice: item.quantity * item.unitPrice })
    }
    // Combine: PR items first, then direct items (excluding duplicates with PR)
    const prMaterialIds = new Set(prItems.map(p => p.materialId))
    const filteredDirect = directItems.filter(d => !prMaterialIds.has(d.materialId)).map(d => ({ ...d, source: 'direct' }))
    setPoItems([...prItems, ...filteredDirect])
  }, [selectedPRItems, directItems])

  const updatePoItemPrice = (materialId, price) => {
    setPoItems(prev => prev.map(p =>
      p.materialId === materialId
        ? { ...p, unitPrice: Number(price), totalPrice: p.quantity * Number(price) }
        : p
    ))
  }

  // Service items helpers
  const addServiceItem = () => {
    setServiceItems(prev => [...prev, {
      id: Date.now(),
      description: '',
      rate: 0,
      rateType: poType === 'subcontracting' ? 'per_item' : 'daily',
      quantity: 1,
      duration: 1,
      machineType: '',
      totalPrice: 0,
      notes: ''
    }])
  }

  const updateServiceItem = (id, field, value) => {
    setServiceItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }
      // Recalculate total
      if (updated.rateType === 'lump_sum') {
        updated.totalPrice = Number(updated.rate) || 0
      } else {
        updated.totalPrice = (Number(updated.rate) || 0) * (Number(updated.quantity) || 1) * (Number(updated.duration) || 1)
      }
      return updated
    }))
  }

  const removeServiceItem = (id) => {
    setServiceItems(prev => prev.filter(item => item.id !== id))
  }

  // Other items management functions
  const addOtherItem = () => {
    setOtherItems(prev => [...prev, {
      id: Date.now(),
      description: '',
      quantity: 1,
      unitPrice: 0,
      rateType: 'fixed',
      duration: 1,
      taxType: 'percentage',
      taxRate: 0,
      discountType: 'percentage',
      discountRate: 0,
      lineTotal: 0,
      hsn: '',
      accountHead: '',
      startDate: '',
      endDate: '',
      notes: ''
    }])
  }

  const updateOtherItem = (id, field, value) => {
    setOtherItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }
      // Recalculate lineTotal
      const subtotal = (Number(updated.quantity) || 0) * (Number(updated.unitPrice) || 0) * (Number(updated.duration) || 1)
      const itemTax = updated.taxType === 'percentage'
        ? (subtotal * (Number(updated.taxRate) || 0) / 100)
        : (Number(updated.taxRate) || 0)
      const itemDiscount = updated.discountType === 'percentage'
        ? (subtotal * (Number(updated.discountRate) || 0) / 100)
        : (Number(updated.discountRate) || 0)
      updated.lineTotal = subtotal + itemTax - itemDiscount
      return updated
    }))
  }

  const removeOtherItem = (id) => {
    setOtherItems(prev => prev.filter(item => item.id !== id))
  }

  // Calculate totals for other items
  const otherItemsSubtotal = otherItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0)
  const otherPOTax = poTaxType === 'percentage'
    ? (otherItemsSubtotal * (Number(poTaxRate) || 0) / 100)
    : (Number(poTaxRate) || 0)
  const otherPODiscount = poDiscountType === 'percentage'
    ? (otherItemsSubtotal * (Number(poDiscountRate) || 0) / 100)
    : (Number(poDiscountRate) || 0)
  const otherGrandTotal = otherItemsSubtotal + otherPOTax - otherPODiscount

  const serviceItemsTotal = serviceItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0)

  const handleCreateSubmit = async () => {
    const isService = isServicePOType(poType)
    const isOther = poType === 'other'

    if (isService) {
      if (serviceItems.length === 0) {
        setNotify({ open: true, title: 'Error', message: 'Add at least one service item.' })
        return
      }
      if (serviceItems.some(si => !si.description.trim())) {
        setNotify({ open: true, title: 'Error', message: 'All service items must have a description.' })
        return
      }
    } else if (isOther) {
      if (otherItems.length === 0) {
        setNotify({ open: true, title: 'Error', message: 'Add at least one item.' })
        return
      }
      if (otherItems.some(oi => !oi.description.trim())) {
        setNotify({ open: true, title: 'Error', message: 'All items must have a description.' })
        return
      }
    } else {
      if (poItems.length === 0) {
        setNotify({ open: true, title: 'Error', message: 'Add at least one item.' })
        return
      }
    }

    try {
      setSaving(true)

      // Build sourceRequests from any selected PR items (material POs only)
      const sourceMap = {}
      if (!isService) {
        for (const s of selectedPRItems) {
          if (!sourceMap[s.requestId]) {
            sourceMap[s.requestId] = { requestId: s.requestId, requestNumber: s.requestNumber, items: [] }
          }
          sourceMap[s.requestId].items.push({
            requestItemId: s.itemId,
            materialId: s.materialId,
            materialName: s.materialName,
            sku: s.sku,
            uom: s.uom,
            allocatedQty: s.allocatedQty
          })
        }
      }

      await api.post('/api/purchase-orders', {
        poType,
        sourceRequests: isService || isOther ? [] : Object.values(sourceMap),
        items: isService || isOther ? [] : poItems.map(({ source, ...item }) => item),
        serviceItems: isService ? serviceItems.map(({ id, ...item }) => item) : [],
        otherItems: isOther ? otherItems.map(({ id, ...item }) => item) : [],
        vatPercentage: vatEnabled && vatPercentage ? Number(vatPercentage) : 0,
        supplierId: supplierId || undefined,
        supplier,
        deliveryDate: deliveryDate || undefined,
        notes,
        priority,
        submitForApproval,
        paymentTerms: {
          type: paymentTermsType,
          advancePercentage: paymentTermsType === 'partial_advance' ? Number(advancePercentage) : 0,
          notes: paymentTermsNotes
        },
        annexure,
        ...(isOther && {
          taxType: poTaxType,
          taxRate: Number(poTaxRate),
          discountType: poDiscountType,
          discountRate: Number(poDiscountRate)
        })
      })

      setNotify({ open: true, title: 'Success', message: submitForApproval ? 'PO created & submitted for approval.' : 'PO saved as draft.' })
      closeCreateModal()
      fetchData()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to create PO.' })
    } finally {
      setSaving(false)
    }
  }

  // Quick actions
  const actionLabels = {
    submit: 'Purchase Order submitted for approval',
    'approve/am': 'Purchase Order approved by Account Manager',
    'approve/gm': 'Purchase Order approved by General Manager',
    reject: 'Purchase Order rejected',
    revise: 'Purchase Order revised and reset to draft',
    'send-to-supplier': 'Purchase Order sent to supplier',
    fulfill: 'Service completed successfully',
    confirm: 'Purchase Order confirmed'
  }
  const handleAction = async (id, action, body = {}) => {
    try {
      await api.patch(`/api/purchase-orders/${id}/${action}`, body)
      setNotify({ open: true, title: 'Success', message: actionLabels[action] || 'Action completed successfully.' })
      fetchData()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Action failed.' })
    }
  }

  const openApprovalConfirm = (id, action, body) => {
    let title = ''
    let message = ''
    if (action === 'approve/am') {
      title = 'Approve PO (Account Manager)'
      message = 'Are you sure you want to approve this purchase order? This will move it to General Manager approval.'
    } else if (action === 'approve/gm') {
      title = 'Approve PO (General Manager)'
      message = 'Are you sure you want to approve this purchase order? After your approval, the PO will be sent to the supplier.'
    } else if (action === 'submit') {
      title = 'Submit for Approval'
      message = 'Are you sure you want to submit this purchase order for approval? It will be sent to Account Manager for review.'
    } else if (action === 'send-to-supplier') {
      title = 'Send to Supplier'
      message = 'Are you sure you want to send this purchase order to the supplier? This action will notify the supplier and lock the PO.'
    } else if (action === 'confirm') {
      title = 'Confirm Purchase Order'
      message = 'Are you sure you want to confirm this purchase order? This will finalize the PO and mark it as completed.'
    } else if (action === 'revise') {
      title = 'Revise Purchase Order'
      message = 'Are you sure you want to revise this purchase order? It will be reset to draft status for editing.'
    } else if (action === 'fulfill') {
      title = 'Mark Service Complete'
      message = 'Are you sure the service has been completed? You can upload completion documents from the detail page.'
    }
    setApprovalConfirm({ open: true, orderId: id, action, title, message, body: body || {} })
  }

  const confirmApproval = () => {
    if (approvalConfirm.action && approvalConfirm.orderId) {
      handleAction(approvalConfirm.orderId, approvalConfirm.action, approvalConfirm.body || {})
      setApprovalConfirm({ open: false, orderId: null, action: null, title: '', message: '', body: {} })
    }
  }

  const openRejectModal = (id) => {
    setRejectReason('')
    setRejectModal({ open: true, orderId: id })
  }

  const handleRejectSubmit = () => {
    if (!rejectReason.trim()) return
    handleAction(rejectModal.orderId, 'reject', { notes: rejectReason })
    setRejectModal({ open: false, orderId: null })
    setRejectReason('')
  }

  const handleDownloadPDF = async (poId, poNumber) => {
    try {
      const token = localStorage.getItem('token')
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
      const response = await fetch(`${apiBase}/api/purchase-orders/${poId}/download-pdf`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/pdf'
        }
      })

      // CRITICAL: Check response before processing
      console.log('[PDF] Response Status:', response.status)
      console.log('[PDF] Response Content-Type:', response.headers.get('content-type'))

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[PDF] Failed Response:', response.status, errorText.substring(0, 200))
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('application/pdf')) {
        const preview = await response.text()
        console.error('[PDF] Wrong Content-Type:', contentType)
        console.error('[PDF] Response preview:', preview.substring(0, 200))
        throw new Error(`Expected PDF, got ${contentType}`)
      }

      const blob = await response.blob()
      console.log('[PDF] Blob Type:', blob.type)
      console.log('[PDF] Blob Size:', blob.size)

      if (blob.size === 0) {
        throw new Error('Received empty PDF file')
      }

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `PO-${poNumber || poId}.pdf`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[PDF] Download Error:', error)
      setNotify({ open: true, title: 'Error', message: `Failed to download PDF: ${error.message}` })
    }
  }

  // Service PO quick fulfill (no modal needed for service POs)
  const handleServiceFulfill = async (order) => {
    openApprovalConfirm(order._id, 'fulfill', {})
  }

  // Fulfill modal
  const openFulfillModal = (order) => {
    const items = (order.items || []).map(item => ({
      materialId: item.materialId?._id || item.materialId,
      materialName: item.materialName || item.materialId?.name || 'Unknown',
      sku: item.sku || item.materialId?.sku || '',
      orderedQty: item.quantity,
      deliveredQty: item.quantity,
      uom: item.uom
    }))
    setFulfillItems(items)
    setFulfillModal({ open: true, order })
  }

  const handleFulfillSubmit = async () => {
    if (!fulfillModal.order) return
    try {
      setFulfilling(true)
      await api.patch(`/api/purchase-orders/${fulfillModal.order._id}/fulfill`, {
        deliveredItems: fulfillItems.map(item => ({
          materialId: item.materialId,
          deliveredQty: item.deliveredQty
        }))
      })
      setNotify({ open: true, title: 'Success', message: 'PO fulfilled — awaiting GRN.' })
      setFulfillModal({ open: false, order: null })
      setFulfillItems([])
      fetchData()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed.' })
    } finally {
      setFulfilling(false)
    }
  }

  // GRN Receive modal
  const openReceiveModal = (order) => {
    const items = (order.fulfillmentDetails || []).map(item => ({
      materialId: item.materialId,
      materialName: order.items?.find(i => String(i.materialId?._id || i.materialId) === String(item.materialId))?.materialName || 'Unknown',
      sku: order.items?.find(i => String(i.materialId?._id || i.materialId) === String(item.materialId))?.sku || '',
      deliveredQty: item.deliveredQty,
      receivedQty: item.deliveredQty,
      uom: order.items?.find(i => String(i.materialId?._id || i.materialId) === String(item.materialId))?.uom || '',
      condition: 'good',
      remarks: ''
    }))
    setReceiveItems(items)
    setGrnNotes('')
    setGrnDeliveryDate(new Date().toISOString().split('T')[0])
    setGrnDeliveryPersonName('')
    setGrnDeliveryPersonContact('')
    setGrnVehicleNumber('')
    setGrnOverallCondition('good')
    setGrnConditionNotes('')
    setGrnReceiverName('')
    setGrnAcknowledgmentNotes('')
    setReceiveModal({ open: true, order })
  }

  const handleReceiveSubmit = async () => {
    if (!receiveModal.order) return
    try {
      setReceiving(true)
      await api.patch(`/api/purchase-orders/${receiveModal.order._id}/receive`, {
        receivedItems: receiveItems.map(item => ({
          materialId: item.materialId,
          receivedQty: item.receivedQty,
          condition: item.condition,
          remarks: item.remarks
        })),
        notes: grnNotes,
        deliveryDate: grnDeliveryDate,
        deliveryPersonName: grnDeliveryPersonName,
        deliveryPersonContact: grnDeliveryPersonContact,
        vehicleNumber: grnVehicleNumber,
        overallCondition: grnOverallCondition,
        conditionNotes: grnConditionNotes,
        receiverName: grnReceiverName,
        acknowledgmentNotes: grnAcknowledgmentNotes
      })
      setNotify({ open: true, title: 'Success', message: 'GRN submitted — inventory updated.' })
      setReceiveModal({ open: false, order: null })
      setReceiveItems([])
      fetchData()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed.' })
    } finally {
      setReceiving(false)
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      draft: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
      pending_am: { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b' },
      pending_gm: { bg: 'rgba(168,85,247,0.1)', color: '#a855f7' },
      approved: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
      rejected: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
      sent_to_supplier: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
      fulfilled: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1' },
      received: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' },
      confirmed: { bg: 'rgba(16,185,129,0.15)', color: '#059669' },
      payment_requested: { bg: 'rgba(251,146,60,0.1)', color: '#f97316' },
      payment_completed: { bg: 'rgba(34,197,94,0.15)', color: '#16a34a' },
      cancelled: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' }
    }
    const labels = {
      draft: 'Draft', pending_am: 'Pending AM', pending_gm: 'Pending GM',
      approved: 'Approved', rejected: 'Rejected', sent_to_supplier: 'Sent to Supplier',
      fulfilled: 'Fulfilled', received: 'Received', confirmed: 'Confirmed',
      payment_requested: 'Payment Requested', payment_completed: 'Payment Completed',
      cancelled: 'Cancelled'
    }
    const s = styles[status] || styles.draft
    return (
      <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: s.bg, color: s.color, textTransform: 'uppercase' }}>
        {labels[status] || status}
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

  const totalValue = (order) => {
    if (isServicePOType(order?.poType)) {
      return order?.serviceItems?.reduce((sum, item) => sum + (item.totalPrice || 0), 0) || 0
    }
    return order?.items?.reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 0)), 0) || 0
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading purchase orders...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>Purchase Orders</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
            {canCreate ? 'Create POs from approved purchase requests.' : 'View and manage purchase orders.'}
          </p>
        </div>
        {canCreate && (
          <button className="save-btn" onClick={openCreateModal}>
            + Create Purchase Order
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="Search by PO#, supplier, material..."
          value={listSearch}
          onChange={e => { setListSearch(e.target.value); setListPage(1) }}
          style={{ width: '100%', maxWidth: '400px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)' }}
        />
      </div>

      {/* PO Type Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginRight: '4px' }}>Type:</span>
        {['all', 'material', 'manpower', 'subcontracting', 'machine_rental', 'other'].map(t => (
          <button
            key={t}
            onClick={() => { setPoTypeFilter(t); setListPage(1) }}
            style={{
              padding: '6px 12px', borderRadius: '8px', border: 'none',
              background: poTypeFilter === t ? 'var(--primary)' : 'var(--card)',
              color: poTypeFilter === t ? 'white' : 'var(--text)',
              cursor: 'pointer', fontWeight: '500', fontSize: '12px'
            }}
          >
            {t === 'all' ? 'All' : poTypeLabels[t]}
          </button>
        ))}
      </div>

      {/* Status Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['all', 'draft', 'pending_am', 'pending_gm', 'approved', 'sent_to_supplier', 'fulfilled', 'received', 'confirmed', 'payment_requested', 'payment_completed', 'rejected'].map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setListPage(1) }}
            style={{
              padding: '8px 14px', borderRadius: '8px', border: 'none',
              background: filter === f ? 'var(--primary)' : 'var(--card)',
              color: filter === f ? 'white' : 'var(--text)',
              cursor: 'pointer', fontWeight: '500', fontSize: '12px'
            }}
          >
            {f === 'all' ? 'All' : f === 'pending_am' ? 'Pending AM' : f === 'pending_gm' ? 'Pending GM' : f === 'sent_to_supplier' ? 'Sent' : f === 'payment_requested' ? 'Payment Req.' : f === 'payment_completed' ? 'Paid' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      {(() => {
        const sq = listSearch.toLowerCase().trim()
        const filteredOrders = sq ? orders.filter(o =>
          o.poNumber?.toLowerCase().includes(sq) ||
          o.supplier?.name?.toLowerCase().includes(sq) ||
          o.items?.some(i => i.materialName?.toLowerCase().includes(sq) || i.sku?.toLowerCase().includes(sq)) ||
          o.serviceItems?.some(i => i.description?.toLowerCase().includes(sq)) ||
          o.createdBy?.name?.toLowerCase().includes(sq)
        ) : orders
        const totalPages = Math.max(1, Math.ceil(filteredOrders.length / LIST_PAGE_SIZE))
        const safePage = Math.min(listPage, totalPages)
        const paginatedOrders = filteredOrders.slice((safePage - 1) * LIST_PAGE_SIZE, safePage * LIST_PAGE_SIZE)

        return filteredOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', background: 'var(--card)', borderRadius: '12px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
          <h3 style={{ color: 'var(--text)', marginBottom: '8px' }}>No Purchase Orders</h3>
          <p style={{ color: 'var(--text-muted)' }}>{listSearch ? 'No matching purchase orders found.' : filter !== 'all' ? `No ${filter} orders found.` : 'No purchase orders yet.'}</p>
        </div>
      ) : (
        <>
        <div className="table" style={{ background: 'var(--card)', borderRadius: '12px', overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>PO #</th>
                <th>Type</th>
                <th>Source PRs</th>
                <th>Supplier</th>
                <th>Items</th>
                <th>Value</th>
                <th>Rev</th>
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
                      onClick={() => navigate(`/purchase-order-detail?id=${order._id}`)}
                      onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.target.style.textDecoration = 'none'}
                    >
                      {order.poNumber}
                    </span>
                  </td>
                  <td>
                    {(() => {
                      const tc = poTypeBadgeColors[order.poType] || poTypeBadgeColors.material
                      return (
                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: tc.bg, color: tc.color }}>
                          {poTypeLabels[order.poType] || 'Material'}
                        </span>
                      )
                    })()}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {isServicePOType(order.poType)
                      ? <span style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '11px' }}>N/A</span>
                      : order.sourceRequests?.length > 0
                        ? order.sourceRequests.map(s => s.requestNumber || s.requestId?.requestNumber).filter(Boolean).join(', ')
                        : <span style={{ fontStyle: 'italic', color: 'var(--primary)', fontSize: '11px' }}>Direct</span>
                    }
                  </td>
                  <td>{order.supplier?.name || '-'}</td>
                  <td>{isServicePOType(order.poType) ? (order.serviceItems?.length || 0) : (order.items?.length || 0)} items</td>
                  <td style={{ fontWeight: '600', color: 'var(--text)' }}>
                    {totalValue(order) > 0 ? (() => {
                      const sub = totalValue(order)
                      const vat = sub * (order.vatPercentage || 0) / 100
                      return `AED ${(sub + vat).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    })() : '-'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {order.revision > 1 && (
                      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
                        v{order.revision}
                      </span>
                    )}
                  </td>
                  <td>{getPriorityBadge(order.priority)}</td>
                  <td>{getStatusBadge(order.status)}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {/* PE: Submit draft */}
                      {canCreate && order.status === 'draft' && (
                        <button className="link-btn" style={{ color: '#3b82f6', fontSize: '12px' }} onClick={() => openApprovalConfirm(order._id, 'submit')}>Submit</button>
                      )}
                      {/* PE: Revise rejected */}
                      {canCreate && order.status === 'rejected' && (
                        <button className="link-btn" style={{ color: '#a855f7', fontSize: '12px' }} onClick={() => openApprovalConfirm(order._id, 'revise', { reason: 'Revision after review' })}>Revise</button>
                      )}
                      {/* AM approval */}
                      {canApproveAM && order.status === 'pending_am' && (
                        <>
                          <button className="link-btn" style={{ color: '#10b981', fontSize: '12px' }} onClick={() => openApprovalConfirm(order._id, 'approve/am')}>Approve</button>
                          <button className="link-btn" style={{ color: '#ef4444', fontSize: '12px' }} onClick={() => openRejectModal(order._id)}>Reject</button>
                        </>
                      )}
                      {/* GM approval */}
                      {canApproveGM && order.status === 'pending_gm' && (
                        <>
                          <button className="link-btn" style={{ color: '#10b981', fontSize: '12px' }} onClick={() => openApprovalConfirm(order._id, 'approve/gm')}>Approve</button>
                          <button className="link-btn" style={{ color: '#ef4444', fontSize: '12px' }} onClick={() => openRejectModal(order._id)}>Reject</button>
                        </>
                      )}
                      {/* Download PDF - Available on all approved POs */}
                      {['approved', 'sent_to_supplier', 'fulfilled', 'received', 'confirmed', 'payment_requested', 'payment_completed'].includes(order.status) && (
                        <button className="link-btn" style={{ color: '#3b82f6', fontSize: '12px' }} onClick={() => handleDownloadPDF(order._id, order.poNumber)}>Download</button>
                      )}
                      {/* Send to Supplier - Only from approved status */}
                      {order.status === 'approved' && (
                        <button className="link-btn" style={{ color: '#f59e0b', fontSize: '12px' }} onClick={() => openApprovalConfirm(order._id, 'send-to-supplier')}>Send to Supplier</button>
                      )}
                      {/* PE: Fulfill */}
                      {canFulfill && order.status === 'sent_to_supplier' && (
                        <button className="link-btn" style={{ color: '#6366f1', fontSize: '12px' }} onClick={() => isServicePOType(order.poType) ? handleServiceFulfill(order) : openFulfillModal(order)}>
                          {isServicePOType(order.poType) ? 'Mark Complete' : 'Fulfill'}
                        </button>
                      )}
                      {/* IM: Receive GRN (material POs only) */}
                      {canReceive && order.status === 'fulfilled' && !isServicePOType(order.poType) && (
                        <button className="link-btn" style={{ color: '#10b981', fontSize: '12px' }} onClick={() => openReceiveModal(order)}>Receive (GRN)</button>
                      )}
                      {/* PE: Confirm after GRN (material POs only) */}
                      {canCreate && order.status === 'received' && !isServicePOType(order.poType) && (
                        <button className="link-btn" style={{ color: '#059669', fontSize: '12px' }} onClick={() => openApprovalConfirm(order._id, 'confirm')}>Confirm</button>
                      )}
                      {order.grnNumber && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{order.grnNumber}</span>
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

      {/* =================== CREATE PO MODAL =================== */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={closeCreateModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '950px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>Create Purchase Order</h2>
              <button onClick={closeCreateModal} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>

              {/* PO Type Selector */}
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>PO Type</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { value: 'material', label: 'Material / Product', icon: '📦' },
                    { value: 'manpower', label: 'Manpower Hiring', icon: '👷' },
                    { value: 'subcontracting', label: 'Subcontracting', icon: '🔧' },
                    { value: 'machine_rental', label: 'Machine Rental', icon: '🏗️' },
                    { value: 'other', label: 'Other Services/Products', icon: '⚙️' }
                  ].map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => { setPoType(t.value); setServiceItems([]); setSelectedPRItems([]); setDirectItems([]); setPoItems([]); setOtherItems([]); }}
                      style={{
                        padding: '10px 16px', borderRadius: '8px', border: `2px solid ${poType === t.value ? 'var(--primary)' : 'var(--border)'}`,
                        background: poType === t.value ? 'rgba(99,102,241,0.08)' : 'var(--card)',
                        color: poType === t.value ? 'var(--primary)' : 'var(--text)',
                        cursor: 'pointer', fontWeight: poType === t.value ? '600' : '400', fontSize: '13px',
                        transition: 'all 0.2s'
                      }}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Service Items Form (for service POs only) */}
              {isServicePOType(poType) && (
                <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, color: 'var(--text)' }}>
                      {poType === 'manpower' ? '👷 Manpower Details' : poType === 'subcontracting' ? '🔧 Service Details' : '🏗️ Machine Rental Details'}
                    </h4>
                    <button type="button" onClick={addServiceItem} className="link-btn" style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '13px' }}>
                      + Add Line
                    </button>
                  </div>

                  {serviceItems.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                      No service items added. Click "+ Add Line" to start.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {serviceItems.map((item, index) => (
                        <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: 'var(--card)', position: 'relative' }}>
                          <button type="button" onClick={() => removeServiceItem(item.id)}
                            style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '16px', fontWeight: '700' }}>×</button>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>#{index + 1}</span>
                          </div>
                          <div className="form-group" style={{ margin: '0 0 8px' }}>
                            <label style={{ fontSize: '12px' }}>Description *</label>
                            <input type="text" value={item.description} onChange={e => updateServiceItem(item.id, 'description', e.target.value)}
                              placeholder={poType === 'manpower' ? 'e.g., Skilled electrician for site wiring' : poType === 'machine_rental' ? 'e.g., Excavator rental for foundation work' : 'e.g., Painting and finishing work'}
                              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                          </div>
                          {poType === 'machine_rental' && (
                            <div className="form-group" style={{ margin: '0 0 8px' }}>
                              <label style={{ fontSize: '12px' }}>Machine Type</label>
                              <input type="text" value={item.machineType} onChange={e => updateServiceItem(item.id, 'machineType', e.target.value)}
                                placeholder="e.g., Excavator, Crane, Loader"
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: poType === 'subcontracting' ? '1fr 1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '8px' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label style={{ fontSize: '12px' }}>Rate Type</label>
                              <select value={item.rateType} onChange={e => updateServiceItem(item.id, 'rateType', e.target.value)}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                {poType === 'subcontracting' ? (
                                  <>
                                    <option value="per_item">Per Item</option>
                                    <option value="lump_sum">Lump Sum</option>
                                  </>
                                ) : (
                                  <>
                                    <option value="hourly">Hourly</option>
                                    <option value="daily">Daily</option>
                                    <option value="monthly">Monthly</option>
                                  </>
                                )}
                              </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label style={{ fontSize: '12px' }}>Rate (AED)</label>
                              <input type="number" min="0" step="0.01" value={item.rate} onChange={e => updateServiceItem(item.id, 'rate', Number(e.target.value))}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                            </div>
                            {item.rateType !== 'lump_sum' && (
                              <>
                                <div className="form-group" style={{ margin: 0 }}>
                                  <label style={{ fontSize: '12px' }}>{poType === 'manpower' ? 'No. of Workers' : poType === 'machine_rental' ? 'No. of Machines' : 'Quantity'}</label>
                                  <input type="number" min="1" value={item.quantity} onChange={e => updateServiceItem(item.id, 'quantity', Number(e.target.value))}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                  <label style={{ fontSize: '12px' }}>Duration ({item.rateType === 'hourly' ? 'hours' : item.rateType === 'daily' ? 'days' : 'months'})</label>
                                  <input type="number" min="1" value={item.duration} onChange={e => updateServiceItem(item.id, 'duration', Number(e.target.value))}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                                </div>
                              </>
                            )}
                          </div>
                          <div style={{ marginTop: '8px', textAlign: 'right', fontWeight: '600', color: 'var(--primary)' }}>
                            Total: AED {(item.totalPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      ))}

                      {/* Service items totals */}
                      <div style={{ borderTop: '2px solid var(--border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600' }}>
                          {vatEnabled ? 'Subtotal:' : 'Total:'} AED {serviceItemsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
                            <input type="checkbox" checked={vatEnabled} onChange={e => { setVatEnabled(e.target.checked); if (!e.target.checked) setVatPercentage(''); }} />
                            Apply VAT
                          </label>
                          {vatEnabled && (
                            <>
                              <input type="number" min="0" max="100" step="0.1" placeholder="%" value={vatPercentage} onChange={e => setVatPercentage(e.target.value)}
                                style={{ width: '70px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', textAlign: 'center' }} />
                              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>%</span>
                            </>
                          )}
                        </div>
                        {vatEnabled && Number(vatPercentage) > 0 && (
                          <>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                              VAT ({vatPercentage}%): AED {(serviceItemsTotal * Number(vatPercentage) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary)' }}>
                              Grand Total: AED {(serviceItemsTotal + serviceItemsTotal * Number(vatPercentage) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Section A: Select from Purchase Requests (material POs only) */}
              {poType === 'material' && (
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Select Items from Purchase Requests</h4>
                {loadingPRs ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}><Spinner /></div>
                ) : availablePRs.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No approved PRs with available items found.</p>
                ) : (() => {
                  // Filter
                  const q = prSearch.toLowerCase().trim()
                  const filtered = availablePRs.filter(pr => {
                    if (prPriorityFilter !== 'all' && pr.priority !== prPriorityFilter) return false
                    if (!q) return true
                    if (pr.requestNumber?.toLowerCase().includes(q)) return true
                    if (pr.project?.toLowerCase().includes(q)) return true
                    if (pr.createdBy?.toLowerCase().includes(q)) return true
                    if (pr.items.some(i => i.materialName?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q))) return true
                    return false
                  })
                  const totalPages = Math.max(1, Math.ceil(filtered.length / PR_PAGE_SIZE))
                  const safePage = Math.min(prPage, totalPages)
                  const paginated = filtered.slice((safePage - 1) * PR_PAGE_SIZE, safePage * PR_PAGE_SIZE)

                  return (
                    <>
                      {/* Search & Filter Bar */}
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Search PR#, material, SKU, project..."
                          value={prSearch}
                          onChange={e => { setPrSearch(e.target.value); setPrPage(1) }}
                          style={{ flex: '1 1 200px', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)' }}
                        />
                        <select
                          value={prPriorityFilter}
                          onChange={e => { setPrPriorityFilter(e.target.value); setPrPage(1) }}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', cursor: 'pointer' }}
                        >
                          <option value="all">All Priorities</option>
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {filtered.length} PR{filtered.length !== 1 ? 's' : ''} found
                        </span>
                      </div>

                      {filtered.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>No matching PRs found.</p>
                      ) : (
                        <>
                          <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                            {paginated.map(pr => (
                              <div key={pr.requestId} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '8px', background: 'var(--card)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <div>
                                    <span style={{ color: 'var(--primary)', fontWeight: '600' }}>{pr.requestNumber}</span>
                                    <span style={{ color: 'var(--text-muted)', marginLeft: '12px', fontSize: '12px' }}>{pr.project}</span>
                                    <span style={{ marginLeft: '8px' }}>{getPriorityBadge(pr.priority)}</span>
                                  </div>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>by {pr.createdBy}</span>
                                </div>
                                <table style={{ width: '100%', fontSize: '12px' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border)' }}></th>
                                      <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>Material</th>
                                      <th style={{ textAlign: 'center', padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>Available</th>
                                      <th style={{ textAlign: 'center', padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>Allocate</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pr.items.map(item => {
                                      const isSelected = selectedPRItems.some(s => s.requestId === pr.requestId && s.itemId === item.itemId)
                                      return (
                                        <tr key={item.itemId} style={{ background: isSelected ? 'rgba(59,130,246,0.05)' : 'transparent' }}>
                                          <td style={{ padding: '4px 8px' }}>
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => togglePRItem(pr, item)}
                                            />
                                          </td>
                                          <td style={{ padding: '4px 8px' }}>
                                            {item.materialName} <span style={{ color: 'var(--primary)', fontSize: '11px' }}>({item.sku})</span>
                                          </td>
                                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{item.remainingQty} {item.uom}</td>
                                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                            {isSelected && (
                                              <input
                                                type="number"
                                                min="1"
                                                max={item.remainingQty}
                                                value={selectedPRItems.find(s => s.requestId === pr.requestId && s.itemId === item.itemId)?.allocatedQty || 0}
                                                onChange={e => updateAllocatedQty(pr.requestId, item.itemId, e.target.value)}
                                                style={{ width: '60px', padding: '4px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border)' }}
                                              />
                                            )}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                          </div>

                          {/* Pagination */}
                          {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                              <button
                                onClick={() => setPrPage(p => Math.max(1, p - 1))}
                                disabled={safePage <= 1}
                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: safePage <= 1 ? 'var(--bg)' : 'var(--card)', cursor: safePage <= 1 ? 'default' : 'pointer', fontSize: '12px', color: 'var(--text)' }}
                              >← Prev</button>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                Page {safePage} of {totalPages}
                              </span>
                              <button
                                onClick={() => setPrPage(p => Math.min(totalPages, p + 1))}
                                disabled={safePage >= totalPages}
                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: safePage >= totalPages ? 'var(--bg)' : 'var(--card)', cursor: safePage >= totalPages ? 'default' : 'pointer', fontSize: '12px', color: 'var(--text)' }}
                              >Next →</button>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )
                })()}
              </div>
              )}

              {/* Section B: Add Materials Directly from Inventory (material POs only) */}
              {poType === 'material' && (
              <>
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Add Materials Directly from Inventory</h4>
                {loadingMaterials ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}><Spinner /></div>
                ) : availableMaterials.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No materials found in inventory.</p>
                ) : (() => {
                  const q = materialSearch.toLowerCase().trim()
                  const filtered = availableMaterials.filter(m => {
                    if (materialCategoryFilter !== 'all' && m.category !== materialCategoryFilter) return false
                    if (materialBrandFilter && String(m.brand?._id || m.brand || '') !== materialBrandFilter) return false
                    if (!q) return true
                    return m.name?.toLowerCase().includes(q) || m.sku?.toLowerCase().includes(q) || m.uom?.toLowerCase().includes(q)
                  })
                  const totalPages = Math.max(1, Math.ceil(filtered.length / MATERIAL_PAGE_SIZE))
                  const safePage = Math.min(materialPage, totalPages)
                  const paginated = filtered.slice((safePage - 1) * MATERIAL_PAGE_SIZE, safePage * MATERIAL_PAGE_SIZE)

                  return (
                    <>
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          placeholder="Search material name, SKU, UOM..."
                          value={materialSearch}
                          onChange={e => { setMaterialSearch(e.target.value); setMaterialPage(1) }}
                          style={{ flex: '1 1 200px', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)' }}
                        />
                        <select
                          value={materialCategoryFilter}
                          onChange={e => { setMaterialCategoryFilter(e.target.value); setMaterialPage(1) }}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', cursor: 'pointer' }}
                        >
                          <option value="all">All Categories</option>
                          <option value="project_specific">Project</option>
                          <option value="staff_specific">Staff</option>
                        </select>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {filtered.length} material{filtered.length !== 1 ? 's' : ''} found
                        </span>
                      </div>

                      {/* Brand Filter - Searchable */}
                      {brands.length > 0 && (
                        <div style={{ marginBottom: '12px', position: 'relative' }}>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
                            <input
                              type="text"
                              value={materialBrandSearch}
                              onChange={e => { setMaterialBrandSearch(e.target.value); setMaterialBrandDropdownOpen(true) }}
                              onFocus={() => setMaterialBrandDropdownOpen(true)}
                              onBlur={() => setTimeout(() => setMaterialBrandDropdownOpen(false), 150)}
                              placeholder={materialBrandFilter ? brands.find(b => b._id === materialBrandFilter)?.name : 'Filter by brand...'}
                              style={{ width: '100%', padding: '8px 36px 8px 30px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }}
                            />
                            {materialBrandFilter && (
                              <button
                                type="button"
                                onClick={() => { setMaterialBrandFilter(''); setMaterialBrandSearch(''); setMaterialPage(1) }}
                                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
                                title="Clear brand filter"
                              >×</button>
                            )}
                          </div>
                          {materialBrandDropdownOpen && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: '2px', maxHeight: '200px', overflowY: 'auto' }}>
                              <div
                                onMouseDown={() => { setMaterialBrandFilter(''); setMaterialBrandSearch(''); setMaterialBrandDropdownOpen(false); setMaterialPage(1) }}
                                style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: !materialBrandFilter ? 'var(--primary)' : 'var(--text)', fontWeight: !materialBrandFilter ? '600' : '400', borderBottom: '1px solid var(--border)' }}
                              >
                                All Brands
                              </div>
                              {brands
                                .filter(b => !materialBrandSearch || b.name.toLowerCase().includes(materialBrandSearch.toLowerCase()))
                                .map(b => (
                                  <div
                                    key={b._id}
                                    onMouseDown={() => { setMaterialBrandFilter(b._id); setMaterialBrandSearch(''); setMaterialBrandDropdownOpen(false); setMaterialPage(1) }}
                                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', background: materialBrandFilter === b._id ? 'rgba(99,102,241,0.08)' : 'transparent', color: materialBrandFilter === b._id ? 'var(--primary)' : 'var(--text)', fontWeight: materialBrandFilter === b._id ? '600' : '400' }}
                                  >
                                    {b.name}
                                  </div>
                                ))}
                              {brands.filter(b => !materialBrandSearch || b.name.toLowerCase().includes(materialBrandSearch.toLowerCase())).length === 0 && (
                                <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '13px' }}>No brands found</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {filtered.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '12px' }}>No materials match your search.</p>
                      ) : (
                        <>
                          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: 'var(--card)' }}>
                                <th style={{ padding: '8px', width: '40px' }}></th>
                                <th style={{ textAlign: 'left', padding: '8px' }}>Material</th>
                                <th style={{ textAlign: 'left', padding: '8px' }}>SKU</th>
                                <th style={{ textAlign: 'center', padding: '8px' }}>UOM</th>
                                <th style={{ textAlign: 'center', padding: '8px' }}>Category</th>
                                <th style={{ textAlign: 'center', padding: '8px' }}>Stock</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginated.map(mat => {
                                const isDirectSelected = directItems.some(p => p.materialId === mat._id)
                                const isFromPR = selectedPRItems.some(s => s.materialId === mat._id)
                                return (
                                  <tr
                                    key={mat._id}
                                    onClick={() => !isFromPR && toggleMaterialForPO(mat)}
                                    style={{ cursor: isFromPR ? 'default' : 'pointer', background: isDirectSelected ? 'rgba(59,130,246,0.06)' : isFromPR ? 'rgba(168,85,247,0.04)' : 'transparent', borderBottom: '1px solid var(--border)', opacity: isFromPR ? 0.6 : 1 }}
                                  >
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                      <input type="checkbox" checked={isDirectSelected} disabled={isFromPR} readOnly style={{ cursor: isFromPR ? 'default' : 'pointer' }} />
                                    </td>
                                    <td style={{ padding: '8px', fontWeight: isDirectSelected ? '600' : '400' }}>
                                      {mat.name}
                                      {isFromPR && <span style={{ fontSize: '10px', color: '#a855f7', marginLeft: '6px' }}>(from PR)</span>}
                                    </td>
                                    <td style={{ padding: '8px', color: 'var(--primary)', fontSize: '12px' }}>{mat.sku}</td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>{mat.uom}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontSize: '11px' }}>
                                      <span style={{ padding: '2px 8px', borderRadius: '4px', background: mat.category === 'project_specific' ? 'rgba(59,130,246,0.1)' : 'rgba(168,85,247,0.1)', color: mat.category === 'project_specific' ? '#3b82f6' : '#a855f7' }}>
                                        {mat.category === 'project_specific' ? 'Project' : 'Staff'}
                                      </span>
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: '600' }}>{mat.quantity || 0}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>

                          {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                              <button
                                onClick={() => setMaterialPage(p => Math.max(1, p - 1))}
                                disabled={safePage <= 1}
                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: safePage <= 1 ? 'var(--bg)' : 'var(--card)', cursor: safePage <= 1 ? 'default' : 'pointer', fontSize: '12px', color: 'var(--text)' }}
                              >Prev</button>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Page {safePage} of {totalPages}</span>
                              <button
                                onClick={() => setMaterialPage(p => Math.min(totalPages, p + 1))}
                                disabled={safePage >= totalPages}
                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: safePage >= totalPages ? 'var(--bg)' : 'var(--card)', cursor: safePage >= totalPages ? 'default' : 'pointer', fontSize: '12px', color: 'var(--text)' }}
                              >Next</button>
                            </div>
                          )}
                        </>
                      )}

                      {directItems.length > 0 && (
                        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(59,130,246,0.06)', borderRadius: '6px', fontSize: '12px', color: 'var(--primary)', fontWeight: '600' }}>
                          {directItems.length} direct material{directItems.length !== 1 ? 's' : ''} added
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* Step 2: PO Items with Pricing */}
              {poItems.length > 0 && (
                <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>💰 Step 2: Consolidated PO Items & Pricing</h4>
                  <table style={{ width: '100%', fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Material</th>
                        <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Source</th>
                        <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Qty</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>UOM</th>
                        <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Unit Price</th>
                        <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poItems.map(item => (
                        <tr key={item.materialId}>
                          <td style={{ padding: '8px' }}>
                            {item.materialName}
                            <div style={{ fontSize: '11px', color: 'var(--primary)' }}>{item.sku}</div>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                              background: item.source === 'pr' ? 'rgba(168,85,247,0.1)' : 'rgba(16,185,129,0.1)',
                              color: item.source === 'pr' ? '#a855f7' : '#10b981'
                            }}>
                              {item.source === 'pr' ? 'PR' : 'Direct'}
                            </span>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', fontWeight: '600' }}>
                            {item.source === 'direct' ? (
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => updateDirectItemQty(item.materialId, e.target.value)}
                                style={{ width: '70px', padding: '6px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border)', fontWeight: '600' }}
                              />
                            ) : item.quantity}
                          </td>
                          <td style={{ padding: '8px' }}>{item.uom}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={e => item.source === 'direct' ? updateDirectItemPrice(item.materialId, e.target.value) : updatePoItemPrice(item.materialId, e.target.value)}
                              style={{ width: '90px', padding: '6px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border)' }}
                            />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', fontWeight: '600', color: 'var(--primary)' }}>
                            AED {item.totalPrice.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td colSpan={5} style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>
                          {vatEnabled ? 'Subtotal:' : 'Total:'}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: '700', color: 'var(--primary)', fontSize: '16px' }}>
                          AED {poItems.reduce((sum, i) => sum + i.totalPrice, 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={6} style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
                              <input type="checkbox" checked={vatEnabled} onChange={e => { setVatEnabled(e.target.checked); if (!e.target.checked) setVatPercentage(''); }} />
                              Apply VAT
                            </label>
                            {vatEnabled && (
                              <>
                                <input type="number" min="0" max="100" step="0.1" placeholder="%" value={vatPercentage} onChange={e => setVatPercentage(e.target.value)}
                                  style={{ width: '70px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', textAlign: 'center' }} />
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>%</span>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {vatEnabled && Number(vatPercentage) > 0 && (
                        <>
                          <tr>
                            <td colSpan={5} style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)', fontSize: '14px' }}>VAT ({vatPercentage}%):</td>
                            <td style={{ padding: '8px', textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
                              AED {(poItems.reduce((sum, i) => sum + i.totalPrice, 0) * Number(vatPercentage) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr style={{ borderTop: '1px solid var(--border)' }}>
                            <td colSpan={5} style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>Grand Total:</td>
                            <td style={{ padding: '8px', textAlign: 'center', fontWeight: '700', color: 'var(--primary)', fontSize: '16px' }}>
                              AED {(() => { const sub = poItems.reduce((sum, i) => sum + i.totalPrice, 0); return (sub + sub * Number(vatPercentage) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); })()}
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              </>
              )}

              {/* Other Items Form (for other/flexible POs) */}
              {poType === 'other' && (
                <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, color: 'var(--text)' }}>⚙️ Other Items</h4>
                    <button type="button" onClick={addOtherItem} className="link-btn" style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '13px' }}>
                      + Add Item
                    </button>
                  </div>

                  {otherItems.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                      No items added. Click "+ Add Item" to start.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                      {otherItems.map((item, idx) => (
                        <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', background: 'var(--card)' }}>
                          {/* Row 1: Description */}
                          <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Item Description <span style={{ color: '#ef4444' }}>*</span></label>
                            <input type="text" placeholder="e.g., Software License, Consulting Services, Office Supplies..." value={item.description} onChange={e => updateOtherItem(item.id, 'description', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                          </div>

                          {/* Row 2: Quantity & Unit Price */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Quantity <span style={{ color: '#ef4444' }}>*</span></label>
                              <input type="number" placeholder="1" min="0.01" step="0.01" value={item.quantity} onChange={e => updateOtherItem(item.id, 'quantity', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Unit Price (AED) <span style={{ color: '#ef4444' }}>*</span></label>
                              <input type="number" placeholder="0.00" min="0" step="0.01" value={item.unitPrice} onChange={e => updateOtherItem(item.id, 'unitPrice', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                          </div>

                          {/* Row 3: Rate Type & Duration */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Rate Type</label>
                              <select value={item.rateType} onChange={e => updateOtherItem(item.id, 'rateType', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', boxSizing: 'border-box' }}>
                                <option value="fixed">Fixed Price</option>
                                <option value="hourly">Hourly</option>
                                <option value="daily">Daily</option>
                                <option value="monthly">Monthly</option>
                                <option value="per_item">Per Item</option>
                                <option value="lump_sum">Lump Sum</option>
                              </select>
                            </div>
                            {item.rateType !== 'fixed' && (
                              <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Duration (Multiplier)</label>
                                <input type="number" placeholder="1" min="1" step="0.5" value={item.duration} onChange={e => updateOtherItem(item.id, 'duration', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                              </div>
                            )}
                          </div>

                          {/* Row 4: Item-Level Tax */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Item Tax Type</label>
                              <select value={item.taxType} onChange={e => updateOtherItem(item.id, 'taxType', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', boxSizing: 'border-box' }}>
                                <option value="percentage">Percentage (%)</option>
                                <option value="amount">Fixed Amount (AED)</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Item Tax Rate</label>
                              <input type="number" placeholder="0" min="0" step="0.01" value={item.taxRate} onChange={e => updateOtherItem(item.id, 'taxRate', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                          </div>

                          {/* Row 5: Item-Level Discount */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Item Discount Type</label>
                              <select value={item.discountType} onChange={e => updateOtherItem(item.id, 'discountType', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', boxSizing: 'border-box' }}>
                                <option value="percentage">Percentage (%)</option>
                                <option value="amount">Fixed Amount (AED)</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Item Discount Rate</label>
                              <input type="number" placeholder="0" min="0" step="0.01" value={item.discountRate} onChange={e => updateOtherItem(item.id, 'discountRate', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                          </div>

                          {/* Row 6: HSN Code & Account Head */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>HSN/SAC Code <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(optional)</span></label>
                              <input type="text" placeholder="e.g., 6211, 7319..." value={item.hsn || ''} onChange={e => updateOtherItem(item.id, 'hsn', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Account Head <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(Chart of Accounts)</span></label>
                              <AccountHeadSelect
                                value={item.accountHead || ''}
                                onChange={(code) => updateOtherItem(item.id, 'accountHead', code)}
                                placeholder="Select expense account…"
                              />
                            </div>
                          </div>

                          {/* Row 7: Start Date & End Date */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Start Date <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(optional)</span></label>
                              <input type="date" value={item.startDate ? item.startDate.split('T')[0] : ''} onChange={e => updateOtherItem(item.id, 'startDate', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>End Date <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(optional)</span></label>
                              <input type="date" value={item.endDate ? item.endDate.split('T')[0] : ''} onChange={e => updateOtherItem(item.id, 'endDate', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                          </div>

                          {/* Row 8: Notes */}
                          <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Notes <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(optional)</span></label>
                            <textarea value={item.notes || ''} onChange={e => updateOtherItem(item.id, 'notes', e.target.value)} placeholder="Any additional notes about this item..." rows="2" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                          </div>

                          {/* Row 9: Line Total & Delete Button */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                              Line Total: <span style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '14px' }}>AED {(item.lineTotal || 0).toFixed(2)}</span>
                            </span>
                            <button type="button" onClick={() => removeOtherItem(item.id)} title="Delete item" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: '700', fontSize: '20px', lineHeight: 1, padding: '0' }}>×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PO-Level Tax & Discount */}
                  <div style={{ background: 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '8px', marginTop: '12px' }}>
                    <h5 style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>PO-Level Tax & Discount</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <select value={poTaxType} onChange={e => setPoTaxType(e.target.value)} style={{ flex: '0 0 50px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--card)', color: 'var(--text)' }}>
                          <option value="percentage">%</option>
                          <option value="amount">AED</option>
                        </select>
                        <input type="number" placeholder="Tax" min="0" value={poTaxRate} onChange={e => setPoTaxRate(e.target.value)} style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--card)', color: 'var(--text)' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <select value={poDiscountType} onChange={e => setPoDiscountType(e.target.value)} style={{ flex: '0 0 50px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--card)', color: 'var(--text)' }}>
                          <option value="percentage">%</option>
                          <option value="amount">AED</option>
                        </select>
                        <input type="number" placeholder="Discount" min="0" value={poDiscountRate} onChange={e => setPoDiscountRate(e.target.value)} style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--card)', color: 'var(--text)' }} />
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                      <span>Subtotal: <strong style={{ color: 'var(--text)' }}>AED {otherItemsSubtotal.toFixed(2)}</strong></span>
                      <span>Tax: <strong style={{ color: 'var(--text)' }}>AED {otherPOTax.toFixed(2)}</strong></span>
                      <span>Discount: <strong style={{ color: 'var(--text)' }}>AED {otherPODiscount.toFixed(2)}</strong></span>
                      <span style={{ color: 'var(--primary)', fontWeight: '600' }}>Total: AED {otherGrandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Supplier & Details */}
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>🏢 Step 3: Supplier & Delivery</h4>
                <div style={{ marginBottom: '12px', position: 'relative' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: 'var(--text)' }}>Supplier</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={e => { setSupplierSearch(e.target.value); setSupplierDropdownOpen(true) }}
                      onFocus={() => setSupplierDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setSupplierDropdownOpen(false), 150)}
                      placeholder={supplierId ? suppliers.find(s => s._id === supplierId)?.name : 'Search supplier...'}
                      style={{ width: '100%', padding: '8px 36px 8px 30px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }}
                    />
                    {supplierId && (
                      <button
                        type="button"
                        onClick={() => { setSupplierId(''); setSupplier({ name: '', contactPerson: '', phone: '', email: '', address: '' }); setSupplierSearch('') }}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
                        title="Clear supplier"
                      >×</button>
                    )}
                  </div>
                  {supplierDropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: '2px', maxHeight: '200px', overflowY: 'auto' }}>
                      {suppliers
                        .filter(s => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || s.trn.toLowerCase().includes(supplierSearch.toLowerCase()) || (s.contactPerson || '').toLowerCase().includes(supplierSearch.toLowerCase()))
                        .map(s => (
                          <div
                            key={s._id}
                            onMouseDown={() => {
                              setSupplierId(s._id)
                              setSupplier({ name: s.name, contactPerson: s.contactPerson || '', phone: s.phone || '', email: s.email || '', address: s.address || '' })
                              setSupplierSearch('')
                              setSupplierDropdownOpen(false)
                            }}
                            style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', background: supplierId === s._id ? 'rgba(99,102,241,0.08)' : 'transparent', color: supplierId === s._id ? 'var(--primary)' : 'var(--text)', fontWeight: supplierId === s._id ? '600' : '400' }}
                          >
                            {s.name} — TRN: {s.trn}{s.contactPerson ? ` · ${s.contactPerson}` : ''}
                          </div>
                        ))}
                      {suppliers.filter(s => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || s.trn.toLowerCase().includes(supplierSearch.toLowerCase()) || (s.contactPerson || '').toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                        <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '13px' }}>No suppliers found</div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
                  <div className="form-group">
                    <label>Delivery Date</label>
                    <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Priority</label>
                    <select value={priority} onChange={e => setPriority(e.target.value)}>
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
                </div>
              </div>

              {/* Payment Terms */}
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Payment Terms</h4>
                <div style={{ display: 'grid', gridTemplateColumns: paymentTermsType === 'partial_advance' ? '1fr 120px' : '1fr', gap: '12px', marginBottom: '8px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Payment Type</label>
                    <select value={paymentTermsType} onChange={e => setPaymentTermsType(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <option value="full_advance">Full Advance Payment</option>
                      <option value="partial_advance">Partial Advance</option>
                      <option value="full_after_completion">Full Payment After Delivery/Completion</option>
                    </select>
                  </div>
                  {paymentTermsType === 'partial_advance' && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px' }}>Advance %</label>
                      <input type="number" min="0" max="100" value={advancePercentage} onChange={e => setAdvancePercentage(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px' }}>Payment Notes</label>
                  <textarea value={paymentTermsNotes} onChange={e => setPaymentTermsNotes(e.target.value)}
                    placeholder="Payment terms details..." rows={2}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                </div>
              </div>

              {/* Annexure */}
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Annexure</h4>
                <div style={{ background: 'var(--card)', borderRadius: '6px' }} className="annexure-editor">
                  <ReactQuill
                    value={annexure}
                    onChange={setAnnexure}
                    placeholder="Additional terms, conditions, specifications, or scope of work..."
                    modules={annexureModules}
                    theme="snow"
                    ref={(el) => {
                      if (el) {
                        window.quillEditorRef = el
                        setTimeout(() => applyToolbarTooltips(el.getEditor()?.root), 100)
                      }
                    }}
                  />
                </div>
              </div>

              {/* Submit */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  <input type="checkbox" checked={submitForApproval} onChange={e => setSubmitForApproval(e.target.checked)} />
                  Submit for Account Manager approval immediately
                </label>
                <div className="form-actions">
                  <button type="button" className="cancel-btn" onClick={closeCreateModal}>Cancel</button>
                  <button type="button" className="save-btn" onClick={handleCreateSubmit} disabled={saving}>
                    {saving ? 'Creating...' : submitForApproval ? 'Create & Submit' : 'Save as Draft'}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* =================== FULFILL MODAL =================== */}
      {fulfillModal.open && fulfillModal.order && (
        <div className="modal-overlay" onClick={() => setFulfillModal({ open: false, order: null })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>Fulfill Purchase Order</h2>
              <button onClick={() => setFulfillModal({ open: false, order: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <div style={{ background: 'var(--bg)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                <span style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '16px' }}>{fulfillModal.order.poNumber}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '12px', fontSize: '13px' }}>{fulfillModal.order.supplier?.name || ''}</span>
              </div>
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Materials Delivered</h4>
                <table style={{ width: '100%', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Material</th>
                      <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Ordered</th>
                      <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Delivered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fulfillItems.map((item, index) => (
                      <tr key={index}>
                        <td style={{ padding: '8px' }}>{item.materialName} <span style={{ color: 'var(--primary)', fontSize: '11px' }}>({item.sku})</span></td>
                        <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>{item.orderedQty} {item.uom}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <input type="number" min="0" value={item.deliveredQty}
                            onChange={e => setFulfillItems(prev => prev.map((fi, i) => i === index ? { ...fi, deliveredQty: Number(e.target.value) } : fi))}
                            style={{ width: '70px', padding: '6px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border)' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setFulfillModal({ open: false, order: null })}>Cancel</button>
                <button type="button" className="save-btn" onClick={handleFulfillSubmit} disabled={fulfilling}>
                  {fulfilling ? 'Fulfilling...' : 'Confirm Fulfillment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== GRN RECEIVE MODAL =================== */}
      {receiveModal.open && receiveModal.order && (
        <div className="modal-overlay" onClick={() => setReceiveModal({ open: false, order: null })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>Goods Receipt Note (GRN)</h2>
              <button onClick={() => setReceiveModal({ open: false, order: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <div style={{ background: 'var(--bg)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                <span style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '16px' }}>{receiveModal.order.poNumber}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '12px', fontSize: '13px' }}>{receiveModal.order.supplier?.name || ''}</span>
              </div>

              {/* Delivery Info */}
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>🚚 Delivery Information</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Delivery Date</label>
                    <input type="date" value={grnDeliveryDate} onChange={e => setGrnDeliveryDate(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Delivery Person</label>
                    <input type="text" value={grnDeliveryPersonName} onChange={e => setGrnDeliveryPersonName(e.target.value)}
                      placeholder="Name" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Contact</label>
                    <input type="text" value={grnDeliveryPersonContact} onChange={e => setGrnDeliveryPersonContact(e.target.value)}
                      placeholder="Phone" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Vehicle Number</label>
                    <input type="text" value={grnVehicleNumber} onChange={e => setGrnVehicleNumber(e.target.value)}
                      placeholder="Plate" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                  </div>
                </div>
              </div>

              {/* Materials Received */}
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>📦 Materials Received</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '13px', minWidth: '600px' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Material</th>
                        <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Delivered</th>
                        <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Received</th>
                        <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Condition</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiveItems.map((item, index) => (
                        <tr key={index}>
                          <td style={{ padding: '8px' }}>
                            {item.materialName}
                            <div style={{ fontSize: '11px', color: 'var(--primary)' }}>{item.sku}</div>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>{item.deliveredQty} {item.uom}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <input type="number" min="0" value={item.receivedQty}
                              onChange={e => setReceiveItems(prev => prev.map((ri, i) => i === index ? { ...ri, receivedQty: Number(e.target.value) } : ri))}
                              style={{ width: '70px', padding: '6px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border)' }} />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <select value={item.condition}
                              onChange={e => setReceiveItems(prev => prev.map((ri, i) => i === index ? { ...ri, condition: e.target.value } : ri))}
                              style={{ padding: '4px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px' }}>
                              <option value="good">Good</option>
                              <option value="damaged">Damaged</option>
                              <option value="partial">Partial</option>
                            </select>
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input type="text" value={item.remarks}
                              onChange={e => setReceiveItems(prev => prev.map((ri, i) => i === index ? { ...ri, remarks: e.target.value } : ri))}
                              placeholder="..."
                              style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px' }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Condition & Acknowledgment */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px' }}>Overall Condition</label>
                  <select value={grnOverallCondition} onChange={e => setGrnOverallCondition(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <option value="good">Good</option>
                    <option value="damaged">Damaged</option>
                    <option value="partial">Partial</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px' }}>Receiver Name</label>
                  <input type="text" value={grnReceiverName} onChange={e => setGrnReceiverName(e.target.value)}
                    placeholder="Your name" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px' }}>GRN Notes</label>
                <textarea value={grnNotes} onChange={e => setGrnNotes(e.target.value)}
                  placeholder="Additional notes..." rows={2}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setReceiveModal({ open: false, order: null })}>Cancel</button>
                <button type="button" className="save-btn" onClick={handleReceiveSubmit} disabled={receiving}>
                  {receiving ? 'Submitting...' : 'Submit GRN'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== APPROVAL CONFIRMATION MODAL =================== */}
      {approvalConfirm.open && (
        <div className="modal-overlay" onClick={() => setApprovalConfirm({ open: false, orderId: null, action: null, title: '', message: '', body: {} })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>{approvalConfirm.title}</h2>
              <button onClick={() => setApprovalConfirm({ open: false, orderId: null, action: null, title: '', message: '', body: {} })} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <p style={{ color: 'var(--text)', marginBottom: '20px' }}>{approvalConfirm.message}</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setApprovalConfirm({ open: false, orderId: null, action: null, title: '', message: '', body: {} })}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: { 'send-to-supplier': '#f59e0b', confirm: '#059669', submit: '#3b82f6', revise: '#a855f7', fulfill: '#6366f1' }[approvalConfirm.action] || '#10b981' }} onClick={confirmApproval}>
                  {{ 'send-to-supplier': 'Send', confirm: 'Confirm', submit: 'Submit', revise: 'Revise', fulfill: 'Mark Complete' }[approvalConfirm.action] || 'Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== REJECT MODAL =================== */}
      {rejectModal.open && (
        <div className="modal-overlay" onClick={() => setRejectModal({ open: false, orderId: null })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Reject Purchase Order</h2>
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
                  Reject PO
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== NOTIFICATION MODAL =================== */}
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

      <style>{`
        /* Quill Editor Container Styling */
        .annexure-editor .ql-toolbar {
          border: 1px solid var(--border);
          border-bottom: 2px solid var(--border);
          background-color: var(--card);
          border-radius: 6px 6px 0 0;
          padding: 6px;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
        }

        .annexure-editor .ql-toolbar.ql-snow {
          padding: 6px;
        }

        .annexure-editor .ql-container {
          border: 1px solid var(--border);
          border-top: none;
          border-radius: 0 0 6px 6px;
          min-height: 200px;
        }

        .annexure-editor .ql-editor {
          padding: 12px;
          font-size: 13px;
          line-height: 1.6;
          color: var(--text);
          background-color: var(--card);
        }

        .annexure-editor .ql-editor.ql-blank::before {
          color: var(--text-muted);
          font-style: italic;
        }

        /* Toolbar button styling for visibility */
        .annexure-editor .ql-toolbar button {
          cursor: pointer;
          transition: background-color 0.2s ease;
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          min-height: 28px;
          padding: 4px 6px;
          border: 1px solid transparent;
          border-radius: 4px;
          background: transparent;
          color: var(--text);
        }

        .annexure-editor .ql-toolbar button svg {
          display: block;
          width: 16px;
          height: 16px;
        }

        .annexure-editor .ql-toolbar button:hover {
          background-color: rgba(0, 0, 0, 0.1);
          border-color: rgba(0, 0, 0, 0.2);
        }

        .annexure-editor .ql-toolbar button.ql-active,
        .annexure-editor .ql-toolbar.ql-snow button.ql-active,
        .annexure-editor .ql-toolbar.ql-snow button:hover {
          background-color: rgba(0, 0, 0, 0.15);
        }

        /* Undo/Redo button specific styling - always visible */
        .annexure-editor .ql-toolbar .ql-undo,
        .annexure-editor .ql-toolbar .ql-redo {
          display: inline-flex !important;
          visibility: visible !important;
          opacity: 1 !important;
        }

        /* Undo/Redo button custom icons using CSS */
        .annexure-editor .ql-toolbar .ql-undo::before {
          content: '↶';
          font-size: 16px;
          font-weight: bold;
        }

        .annexure-editor .ql-toolbar .ql-redo::before {
          content: '↷';
          font-size: 16px;
          font-weight: bold;
        }

        /* Hide the SVG content in undo/redo if present */
        .annexure-editor .ql-toolbar .ql-undo svg,
        .annexure-editor .ql-toolbar .ql-redo svg {
          display: none;
        }

        /* Browser native tooltip styling via title attribute */
        .annexure-editor .ql-toolbar button[title]:hover {
          position: relative;
        }

        /* Custom tooltip for all buttons */
        .annexure-editor .ql-toolbar button[title]::after {
          content: attr(title);
          position: absolute;
          bottom: -32px;
          left: 50%;
          transform: translateX(-50%);
          background-color: rgba(0, 0, 0, 0.92);
          color: white;
          padding: 6px 10px;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          z-index: 10000;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.15s ease;
        }

        .annexure-editor .ql-toolbar button[title]:hover::after {
          opacity: 1;
        }

        /* Picker styling */
        .annexure-editor .ql-toolbar .ql-formats {
          display: flex;
          gap: 4px;
          align-items: center;
          margin: 2px 0;
        }

        .annexure-editor .ql-picker {
          display: inline-block;
        }

        .annexure-editor .ql-picker-label {
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .annexure-editor .ql-picker-label:hover {
          background-color: rgba(0, 0, 0, 0.1);
        }

        /* Separator styling */
        .annexure-editor .ql-toolbar.ql-snow .ql-separator {
          width: 1px;
          height: 24px;
          background-color: var(--border);
          margin: 0 4px;
        }
      `}</style>
    </div>
  )
}

export default PurchaseOrderManagement

