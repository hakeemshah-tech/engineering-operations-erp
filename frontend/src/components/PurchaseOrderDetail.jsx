import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'
import AccountHeadSelect from './accounts/AccountHeadSelect'

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

function PurchaseOrderDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('id')

  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  // Fulfill modal
  const [fulfillModal, setFulfillModal] = useState(false)
  const [fulfillItems, setFulfillItems] = useState([])
  const [fulfilling, setFulfilling] = useState(false)

  // GRN Receive modal
  const [receiveModal, setReceiveModal] = useState(false)
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
  const [rejectModal, setRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // Attachments
  const [attachmentFiles, setAttachmentFiles] = useState([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, attachmentIndex: null })

  // Approval confirmation
  const [approvalConfirm, setApprovalConfirm] = useState({ open: false, action: null, title: '', message: '', body: {} })

  // Account Manager approval - editable Account Heads (Chart of Accounts).
  // Per-item for 'other' POs; a single PO-level head for standard POs.
  const [poTypeMap, setPoTypeMap] = useState({})
  const [amOtherHeads, setAmOtherHeads] = useState([]) // codes aligned to otherItems
  const [amOverallHead, setAmOverallHead] = useState('')

  // Edit modal (full flow mirroring create)
  const [editModal, setEditModal] = useState(false)
  const [editAvailablePRs, setEditAvailablePRs] = useState([])
  const [editLoadingPRs, setEditLoadingPRs] = useState(false)
  const [editSelectedPRItems, setEditSelectedPRItems] = useState([])
  const [editPoItems, setEditPoItems] = useState([])
  const [editSuppliers, setEditSuppliers] = useState([])
  const [editSupplierId, setEditSupplierId] = useState('')
  const [editSupplierSearch, setEditSupplierSearch] = useState('')
  const [editSupplierDropdownOpen, setEditSupplierDropdownOpen] = useState(false)
  const [editSupplier, setEditSupplier] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '' })
  const [editDeliveryDate, setEditDeliveryDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editPriority, setEditPriority] = useState('normal')
  const [editVatEnabled, setEditVatEnabled] = useState(false)
  const [editVatPercentage, setEditVatPercentage] = useState('')
  const [saving, setSaving] = useState(false)
  const [editPrSearch, setEditPrSearch] = useState('')
  const [editPrPriorityFilter, setEditPrPriorityFilter] = useState('all')
  const [editPrPage, setEditPrPage] = useState(1)
  const EDIT_PR_PAGE_SIZE = 5
  // Direct materials in edit mode
  const [editDirectItems, setEditDirectItems] = useState([])
  const [editAvailableMaterials, setEditAvailableMaterials] = useState([])
  const [editLoadingMaterials, setEditLoadingMaterials] = useState(false)
  const [editMaterialSearch, setEditMaterialSearch] = useState('')
  const [editMaterialCategoryFilter, setEditMaterialCategoryFilter] = useState('all')
  const [editMaterialBrandFilter, setEditMaterialBrandFilter] = useState('')
  const [editMaterialBrandSearch, setEditMaterialBrandSearch] = useState('')
  const [editMaterialBrandDropdownOpen, setEditMaterialBrandDropdownOpen] = useState(false)
  const [editBrands, setEditBrands] = useState([])
  const [editMaterialPage, setEditMaterialPage] = useState(1)
  const EDIT_MATERIAL_PAGE_SIZE = 10

  // Payment request modal
  const [paymentRequestModal, setPaymentRequestModal] = useState(false)
  const [processPaymentConfirm, setProcessPaymentConfirm] = useState({ open: false, paymentId: null, amount: 0, type: '' })
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [paymentType, setPaymentType] = useState('full')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [requestingPayment, setRequestingPayment] = useState(false)
  // Edit mode service items and new fields
  const [editServiceItems, setEditServiceItems] = useState([])
  const [editPaymentTermsType, setEditPaymentTermsType] = useState('full_after_completion')
  const [editAdvancePercentage, setEditAdvancePercentage] = useState(0)
  const [editPaymentTermsNotes, setEditPaymentTermsNotes] = useState('')
  const [editAnnexure, setEditAnnexure] = useState('')
  // Edit mode for other PO items and tax/discount
  const [editOtherItems, setEditOtherItems] = useState([])
  const [editPoTaxType, setEditPoTaxType] = useState('percentage')
  const [editPoTaxRate, setEditPoTaxRate] = useState(0)
  const [editPoDiscountType, setEditPoDiscountType] = useState('percentage')
  const [editPoDiscountRate, setEditPoDiscountRate] = useState(0)
  // Fulfill choice modal for other POs
  const [fulfillChoiceModal, setFulfillChoiceModal] = useState(false)
  const [completionFiles, setCompletionFiles] = useState([])
  const [uploadingCompletion, setUploadingCompletion] = useState(false)
  const [deleteCompletionConfirm, setDeleteCompletionConfirm] = useState({ open: false, attachmentIndex: null })

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

  const isServicePO = order && ['manpower', 'subcontracting', 'machine_rental'].includes(order.poType)
  const isOtherPO = order && order.poType === 'other'
  const poTypeLabels = { material: 'Material', manpower: 'Manpower Hiring', subcontracting: 'Subcontracting', machine_rental: 'Machine Rental', other: 'Other Services/Products' }
  const poTypeBadgeColors = {
    material: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
    manpower: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
    subcontracting: { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b' },
    machine_rental: { bg: 'rgba(168,85,247,0.1)', color: '#a855f7' },
    other: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' }
  }
  const completionDocLabels = { timesheet: 'Timesheet', work_completion_report: 'Work Completion Report', machine_hire_sheet: 'Machine Hire Sheet' }
  const rateTypeLabels = { hourly: 'Hourly', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', lump_sum: 'Lump Sum' }

  useEffect(() => {
    if (orderId) fetchOrder()
  }, [orderId])

  // Load the PO type → account mapping once so the AM approval dropdowns can be
  // pre-populated with the configured default when an item has no head yet.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get('/api/system-settings')
        if (!cancelled) setPoTypeMap(res.data?.accounts?.poTypeAccountMap || {})
      } catch { /* defaults are optional */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Seed the editable Account Head state. Pre-populate with the currently-selected
  // head, falling back to the PO type's configured default. A full seed runs once
  // per order; if the mapping (poTypeMap) resolves later it only fills slots the
  // AM hasn't already edited, so a slow settings fetch never clobbers their work.
  const seededOrderRef = useRef(null)
  useEffect(() => {
    if (!order) return
    const firstSeed = seededOrderRef.current !== order._id
    if (order.poType === 'other') {
      const items = order.otherItems || []
      setAmOtherHeads(prev => items.map((it, i) => {
        const existing = firstSeed ? '' : (prev[i] || '')
        return existing || it.accountHead || poTypeMap.other || ''
      }))
    } else {
      setAmOverallHead(prev => {
        const existing = firstSeed ? '' : (prev || '')
        return existing || order.accountingDetails?.overallAccountHead || poTypeMap[order.poType] || ''
      })
    }
    seededOrderRef.current = order._id
  }, [order, poTypeMap])

  const fetchOrder = async () => {
    try {
      setLoading(true)
      const res = await api.get(`/api/purchase-orders/${orderId}`)
      setOrder(res.data)
    } catch (error) {
      console.error('Error fetching PO:', error)
      setNotify({ open: true, title: 'Error', message: 'Failed to load purchase order.' })
    } finally {
      setLoading(false)
    }
  }

  const toggleEditMaterialForPO = (material) => {
    const id = material._id
    const existing = editDirectItems.find(p => p.materialId === id)
    if (existing) {
      setEditDirectItems(prev => prev.filter(p => p.materialId !== id))
    } else {
      setEditDirectItems(prev => [...prev, {
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

  const updateEditDirectItemQty = (materialId, qty) => {
    const val = Math.max(1, Number(qty) || 1)
    setEditDirectItems(prev => prev.map(p =>
      p.materialId === materialId
        ? { ...p, quantity: val, totalPrice: val * p.unitPrice }
        : p
    ))
  }

  const updateEditDirectItemPrice = (materialId, price) => {
    const val = Number(price) || 0
    setEditDirectItems(prev => prev.map(p =>
      p.materialId === materialId
        ? { ...p, unitPrice: val, totalPrice: p.quantity * val }
        : p
    ))
  }

  // Edit modal: open with full flow
  const openEditModal = async () => {
    if (!order) return
    setEditModal(true)
    setEditPrSearch('')
    setEditPrPriorityFilter('all')
    setEditPrPage(1)
    setEditMaterialSearch('')
    setEditMaterialPage(1)

    // Pre-fill supplier/details
    setEditSupplier({ ...(order.supplier || { name: '', contactPerson: '', phone: '', email: '', address: '' }) })
    setEditSupplierId(order.supplierId?._id || order.supplierId || '')
    setEditSupplierSearch('')
    setEditSupplierDropdownOpen(false)
    setEditDeliveryDate(order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : '')
    setEditNotes(order.notes || '')
    setEditPriority(order.priority || 'normal')
    setEditVatEnabled(order.vatPercentage > 0)
    setEditVatPercentage(order.vatPercentage ? String(order.vatPercentage) : '')
    setEditServiceItems((order.serviceItems || []).map((item, i) => ({ ...item, id: item._id || Date.now() + i })))
    setEditPaymentTermsType(order.paymentTerms?.type || 'full_after_completion')
    setEditAdvancePercentage(order.paymentTerms?.advancePercentage || 0)
    setEditPaymentTermsNotes(order.paymentTerms?.notes || '')
    setEditAnnexure(order.annexure || '')
    setEditOtherItems((order.otherItems || []).map((item, i) => ({ ...item, id: item._id || Date.now() + i })))
    setEditPoTaxType(order.taxType || 'percentage')
    setEditPoTaxRate(order.taxRate || 0)
    setEditPoDiscountType(order.discountType || 'percentage')
    setEditPoDiscountRate(order.discountRate || 0)

    // Fetch suppliers, available PRs, and materials in parallel
    setEditLoadingPRs(true)
    setEditLoadingMaterials(true)
    try {
      const [supRes, prRes, matRes] = await Promise.all([
        api.get('/api/suppliers?status=active').catch(() => ({ data: [] })),
        api.get(`/api/purchase-orders/available-pr-items?excludePoId=${orderId}`),
        api.get('/api/materials')
      ])
      setEditSuppliers(Array.isArray(supRes.data) ? supRes.data : [])
      setEditAvailablePRs(prRes.data || [])
      setEditAvailableMaterials(matRes.data || [])
      try {
        const brandsRes = await api.get('/api/brands')
        setEditBrands(Array.isArray(brandsRes.data) ? brandsRes.data : [])
      } catch { /* brands optional */ }

      // Determine which existing items are PR-sourced vs direct
      const prSourcedMaterialIds = new Set()
      const preSelected = []
      for (const src of (order.sourceRequests || [])) {
        for (const srcItem of (src.items || [])) {
          prSourcedMaterialIds.add(String(srcItem.materialId))
          const pr = (prRes.data || []).find(p => String(p.requestId) === String(src.requestId?._id || src.requestId))
          if (pr) {
            const availItem = pr.items.find(i => String(i.itemId) === String(srcItem.requestItemId))
            if (availItem) {
              preSelected.push({
                requestId: pr.requestId,
                requestNumber: pr.requestNumber,
                itemId: availItem.itemId,
                materialId: String(availItem.materialId),
                materialName: availItem.materialName,
                sku: availItem.sku,
                uom: availItem.uom,
                remainingQty: availItem.remainingQty,
                allocatedQty: srcItem.allocatedQty || availItem.remainingQty
              })
            }
          }
        }
      }
      setEditSelectedPRItems(preSelected)

      // Pre-fill direct items (items not linked to any PR source)
      const existingDirectItems = (order.items || [])
        .filter(item => !prSourcedMaterialIds.has(String(item.materialId?._id || item.materialId)))
        .map(item => ({
          materialId: String(item.materialId?._id || item.materialId),
          materialName: item.materialName || item.materialId?.name || '',
          sku: item.sku || item.materialId?.sku || '',
          uom: item.uom || '',
          quantity: item.quantity || 0,
          unitPrice: item.unitPrice || 0,
          totalPrice: (item.quantity || 0) * (item.unitPrice || 0),
          notes: item.notes || ''
        }))
      setEditDirectItems(existingDirectItems)

      // Pre-fill PO items (PR-sourced) for price retention
      const existingPoItems = (order.items || [])
        .filter(item => prSourcedMaterialIds.has(String(item.materialId?._id || item.materialId)))
        .map(item => ({
          materialId: String(item.materialId?._id || item.materialId),
          materialName: item.materialName || item.materialId?.name || '',
          sku: item.sku || item.materialId?.sku || '',
          uom: item.uom || '',
          quantity: item.quantity || 0,
          unitPrice: item.unitPrice || 0,
          totalPrice: (item.quantity || 0) * (item.unitPrice || 0),
          notes: item.notes || '',
          source: 'pr'
        }))
      setEditPoItems(existingPoItems)
    } catch (error) {
      console.error('Error fetching edit data:', error)
    } finally {
      setEditLoadingPRs(false)
      setEditLoadingMaterials(false)
    }
  }

  const closeEditModal = () => {
    setEditModal(false)
    setEditSelectedPRItems([])
    setEditPoItems([])
    setEditDirectItems([])
    setEditAvailablePRs([])
    setEditAvailableMaterials([])
    setEditMaterialSearch('')
    setEditMaterialPage(1)
    setEditOtherItems([])
    setEditPoTaxType('percentage')
    setEditPoTaxRate(0)
    setEditPoDiscountType('percentage')
    setEditPoDiscountRate(0)
  }

  // Toggle PR item selection (edit mode)
  const toggleEditPRItem = (pr, item) => {
    const key = `${pr.requestId}_${item.itemId}`
    const existing = editSelectedPRItems.find(s => `${s.requestId}_${s.itemId}` === key)

    if (existing) {
      setEditSelectedPRItems(prev => prev.filter(s => `${s.requestId}_${s.itemId}` !== key))
    } else {
      setEditSelectedPRItems(prev => [...prev, {
        requestId: pr.requestId,
        requestNumber: pr.requestNumber,
        itemId: item.itemId,
        materialId: String(item.materialId),
        materialName: item.materialName,
        sku: item.sku,
        uom: item.uom,
        remainingQty: item.remainingQty,
        allocatedQty: item.remainingQty
      }])
    }
  }

  const updateEditAllocatedQty = (requestId, itemId, qty) => {
    setEditSelectedPRItems(prev => prev.map(s =>
      s.requestId === requestId && s.itemId === itemId
        ? { ...s, allocatedQty: Math.min(Number(qty), s.remainingQty) }
        : s
    ))
  }

  // Merge PR-derived items + direct items into editPoItems
  useEffect(() => {
    if (!editModal) return
    // Build PR-sourced items
    const prItems = []
    const materialMap = {}
    for (const s of editSelectedPRItems) {
      if (!materialMap[s.materialId]) {
        materialMap[s.materialId] = {
          materialId: s.materialId,
          materialName: s.materialName,
          sku: s.sku,
          uom: s.uom,
          quantity: 0,
          unitPrice: editPoItems.find(p => p.materialId === s.materialId)?.unitPrice || 0,
          notes: editPoItems.find(p => p.materialId === s.materialId)?.notes || '',
          source: 'pr'
        }
      }
      materialMap[s.materialId].quantity += (s.allocatedQty || 0)
    }
    for (const item of Object.values(materialMap)) {
      prItems.push({ ...item, totalPrice: item.quantity * item.unitPrice })
    }
    // Combine: PR items + direct items (excluding duplicates)
    const prMaterialIds = new Set(prItems.map(p => p.materialId))
    const filteredDirect = editDirectItems.filter(d => !prMaterialIds.has(d.materialId)).map(d => ({ ...d, source: 'direct' }))
    setEditPoItems([...prItems, ...filteredDirect])
  }, [editSelectedPRItems, editDirectItems])

  const updateEditPoItemPrice = (materialId, price) => {
    setEditPoItems(prev => prev.map(p =>
      p.materialId === materialId
        ? { ...p, unitPrice: Number(price), totalPrice: p.quantity * Number(price) }
        : p
    ))
  }

  // Other PO items helpers (edit mode)
  const addEditOtherItem = () => {
    setEditOtherItems(prev => [...prev, {
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

  const updateEditOtherItem = (id, field, value) => {
    setEditOtherItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }
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

  const removeEditOtherItem = (id) => {
    setEditOtherItems(prev => prev.filter(item => item.id !== id))
  }

  const editOtherItemsSubtotal = editOtherItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0)
  const editOtherPOTax = editPoTaxType === 'percentage'
    ? (editOtherItemsSubtotal * (Number(editPoTaxRate) || 0) / 100)
    : (Number(editPoTaxRate) || 0)
  const editOtherPODiscount = editPoDiscountType === 'percentage'
    ? (editOtherItemsSubtotal * (Number(editPoDiscountRate) || 0) / 100)
    : (Number(editPoDiscountRate) || 0)
  const editOtherGrandTotal = editOtherItemsSubtotal + editOtherPOTax - editOtherPODiscount
  const editServiceItemsTotal = editServiceItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0)

  const handleEditSubmit = async () => {
    const hasItems = isServicePO
      ? editServiceItems.length > 0
      : isOtherPO
        ? editOtherItems.length > 0
        : editPoItems.length > 0
    if (!hasItems) {
      setNotify({ open: true, title: 'Error', message: 'Add at least one item.' })
      return
    }
    if (isOtherPO && editOtherItems.some(oi => !oi.description.trim())) {
      setNotify({ open: true, title: 'Error', message: 'All items must have a description.' })
      return
    }
    try {
      setSaving(true)
      // Build sourceRequests from any selected PR items (material POs only)
      const sourceMap = {}
      if (!isServicePO && !isOtherPO) {
        for (const s of editSelectedPRItems) {
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
      const payload = {
        sourceRequests: isServicePO || isOtherPO ? [] : Object.values(sourceMap),
        items: isServicePO || isOtherPO ? [] : editPoItems.map(({ source, ...item }) => ({
          materialId: item.materialId,
          materialName: item.materialName,
          sku: item.sku,
          uom: item.uom,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.quantity) * Number(item.unitPrice),
          notes: item.notes || ''
        })),
        otherItems: isOtherPO ? editOtherItems.map(({ id, ...item }) => item) : [],
        vatPercentage: editVatEnabled && editVatPercentage ? Number(editVatPercentage) : 0,
        supplierId: editSupplierId || undefined,
        supplier: editSupplier,
        deliveryDate: editDeliveryDate || null,
        notes: editNotes,
        priority: editPriority,
        paymentTerms: {
          type: editPaymentTermsType,
          advancePercentage: editPaymentTermsType === 'partial_advance' ? Number(editAdvancePercentage) : 0,
          notes: editPaymentTermsNotes
        },
        annexure: editAnnexure,
        serviceItems: isServicePO ? editServiceItems.map(({ id, ...item }) => item) : undefined,
        ...(isOtherPO && {
          taxType: editPoTaxType,
          taxRate: Number(editPoTaxRate),
          discountType: editPoDiscountType,
          discountRate: Number(editPoDiscountRate)
        })
      }
      await api.put(`/api/purchase-orders/${orderId}`, payload)
      setNotify({ open: true, title: 'Success', message: 'Purchase Order updated successfully.' })
      closeEditModal()
      fetchOrder()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to update.' })
    } finally {
      setSaving(false)
    }
  }

  const actionLabels = {
    submit: 'Purchase Order submitted for approval',
    'approve/am': 'Approved by Account Manager',
    'approve/gm': 'Approved by General Manager',
    reject: 'Purchase Order rejected',
    revise: 'Purchase Order revised and reset to draft',
    'send-to-supplier': 'Purchase Order sent to supplier',
    confirm: 'Purchase Order confirmed'
  }

  const handleAction = async (action, body = {}) => {
    try {
      await api.patch(`/api/purchase-orders/${orderId}/${action}`, body)
      setNotify({ open: true, title: 'Success', message: actionLabels[action] || 'Action completed.' })
      fetchOrder()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Action failed.' })
    }
  }

  const openRejectModal = () => {
    setRejectReason('')
    setRejectModal(true)
  }

  const handleRejectSubmit = () => {
    if (!rejectReason.trim()) return
    handleAction('reject', { notes: rejectReason })
    setRejectModal(false)
    setRejectReason('')
  }

  // Collect the Account Head selections to persist on AM approval.
  const buildAmApprovalBody = () => {
    if (!order) return {}
    if (order.poType === 'other') {
      return { otherItemAccountHeads: amOtherHeads }
    }
    return { overallAccountHead: amOverallHead }
  }

  // Approval confirmation handlers
  const openApprovalConfirm = (action, body) => {
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
    }
    setApprovalConfirm({ open: true, action, title, message, body: body || {} })
  }

  const confirmApproval = () => {
    if (approvalConfirm.action) {
      handleAction(approvalConfirm.action, approvalConfirm.body || {})
      setApprovalConfirm({ open: false, action: null, title: '', message: '', body: {} })
    }
  }

  const handleDownloadPDF = async () => {
    if (!order) return
    try {
      const token = localStorage.getItem('token')
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
      const response = await fetch(`${apiBase}/api/purchase-orders/${order._id}/download-pdf`, {
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
      link.download = `PO-${order.poNumber || order._id}.pdf`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[PDF] Download Error:', error)
      setNotify({ open: true, title: 'Error', message: `Failed to download PDF: ${error.message}` })
    }
  }

  const handleRequestPayment = async () => {
    try {
      setRequestingPayment(true)
      await api.patch(`/api/purchase-orders/${orderId}/request-payment`, {
        amount: paymentAmount,
        paymentType,
        notes: paymentNotes
      })
      setNotify({ open: true, title: 'Success', message: 'Payment request submitted.' })
      setPaymentRequestModal(false)
      setPaymentAmount(0)
      setPaymentType('full')
      setPaymentNotes('')
      fetchOrder()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to request payment.' })
    } finally {
      setRequestingPayment(false)
    }
  }

  const handleProcessPayment = async (paymentId) => {
    try {
      await api.patch(`/api/purchase-orders/${orderId}/process-payment/${paymentId}`, {
        notes: 'Payment processed'
      })
      setNotify({ open: true, title: 'Success', message: 'Payment processed successfully.' })
      fetchOrder()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to process payment.' })
    }
  }

  const handleUploadCompletion = async () => {
    if (!completionFiles.length) return
    try {
      setUploadingCompletion(true)
      const formData = new FormData()
      completionFiles.forEach(file => formData.append('completionAttachments', file))
      await api.post(`/api/purchase-orders/${orderId}/completion-attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setNotify({ open: true, title: 'Success', message: 'Completion document uploaded.' })
      setCompletionFiles([])
      fetchOrder()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to upload.' })
    } finally {
      setUploadingCompletion(false)
    }
  }

  const handleDeleteCompletionAttachment = async (index) => {
    try {
      await api.delete(`/api/purchase-orders/${orderId}/completion-attachments/${index}`)
      setNotify({ open: true, title: 'Success', message: 'Completion document removed.' })
      setDeleteCompletionConfirm({ open: false, attachmentIndex: null })
      fetchOrder()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to delete.' })
    }
  }

  // Attachments: Upload files
  const handleAttachmentUpload = async (e) => {
    try {
      const files = e.target.files
      if (!files || files.length === 0) return

      setUploadingAttachments(true)
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) {
        formData.append('attachments', files[i])
      }

      const res = await api.post(`/api/purchase-orders/${orderId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      setOrder(res.data ? { ...order, attachments: res.data.attachments, edits: res.data.edits } : order)
      setAttachmentFiles([])
      setNotify({ open: true, title: 'Success', message: `${files.length} file(s) uploaded successfully` })
    } catch (error) {
      console.error('Attachment upload error:', error)
      setNotify({ open: true, title: 'Error', message: `Failed to upload attachments: ${error.message}` })
    } finally {
      setUploadingAttachments(false)
      e.target.value = ''
    }
  }

  // Attachments: Remove file - open confirmation modal
  const handleRemoveAttachment = (index) => {
    setDeleteConfirm({ open: true, attachmentIndex: index })
  }

  // Attachments: Confirm deletion
  const confirmDeleteAttachment = async () => {
    if (deleteConfirm.attachmentIndex === null) return
    try {
      const res = await api.delete(`/api/purchase-orders/${orderId}/attachments/${deleteConfirm.attachmentIndex}`)
      setOrder(res.data ? { ...order, attachments: res.data.attachments, edits: res.data.edits } : order)
      setNotify({ open: true, title: 'Success', message: 'Attachment removed' })
      setDeleteConfirm({ open: false, attachmentIndex: null })
    } catch (error) {
      console.error('Attachment removal error:', error)
      setNotify({ open: true, title: 'Error', message: `Failed to remove attachment: ${error.message}` })
    }
  }

  // Attachments: Get file icon based on type
  const getFileIcon = (mimetype) => {
    if (mimetype.startsWith('image/')) return '🖼️'
    if (mimetype.startsWith('video/')) return '🎥'
    if (mimetype.includes('pdf')) return '📄'
    if (mimetype.includes('word') || mimetype.includes('document')) return '📝'
    if (mimetype.includes('sheet') || mimetype.includes('excel')) return '📊'
    return '📎'
  }

  // Attachments: Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  // Fulfill modal
  const openFulfillModal = () => {
    if (!order) return

    const isServicePOType = ['manpower', 'subcontracting', 'machine_rental'].includes(order.poType)
    const isOtherPOType = order.poType === 'other'

    if (isOtherPOType) {
      // For other POs, show fulfillment choice modal
      setFulfillChoiceModal(true)
    } else if (isServicePOType) {
      // Service items for manpower/subcontracting/machine rental
      const items = (order.serviceItems || []).map(item => ({
        id: `service-${item._id || Math.random()}`,
        description: item.description,
        quantity: item.quantity,
        duration: item.duration,
        rate: item.rate,
        rateType: item.rateType,
        isServiceItem: true
      }))
      setFulfillItems(items)
      setFulfillModal(true)
    } else {
      // Material items for material POs
      const items = (order.items || []).map(item => ({
        materialId: item.materialId?._id || item.materialId,
        materialName: item.materialName || item.materialId?.name || 'Unknown',
        sku: item.sku || item.materialId?.sku || '',
        orderedQty: item.quantity,
        deliveredQty: item.quantity,
        uom: item.uom
      }))
      setFulfillItems(items)
      setFulfillModal(true)
    }

    setFulfillModal(true)
  }

  const handleFulfillSubmit = async () => {
    try {
      setFulfilling(true)
      const isServicePOType = ['manpower', 'subcontracting', 'machine_rental'].includes(order.poType)
      const isOtherPOType = order.poType === 'other'

      const payload = isServicePOType || (isOtherPOType && fulfillChoiceModal === false)
        ? {} // Service POs and other POs in completion mode don't have item delivery tracking
        : {
            // Material POs and other POs in delivery mode require delivery quantities
            ...(isOtherPOType && { fulfillmentType: 'delivery' }),
            deliveredItems: fulfillItems.map(item => ({
              materialId: item.materialId || item.id,
              deliveredQty: item.deliveredQty
            }))
          }

      await api.patch(`/api/purchase-orders/${orderId}/fulfill`, payload)
      const successMsg = isServicePOType
        ? 'PO marked as complete — awaiting completion documents.'
        : isOtherPOType
        ? 'PO fulfilled — awaiting completion.'
        : 'PO fulfilled — awaiting GRN.'
      setNotify({ open: true, title: 'Success', message: successMsg })
      setFulfillModal(false)
      setFulfillChoiceModal(false)
      setFulfillItems([])
      fetchOrder()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed.' })
    } finally {
      setFulfilling(false)
    }
  }

  // Handle fulfillment choice for other POs
  const handleFulfillChoice = (mode) => {
    setFulfillChoiceModal(false)
    if (mode === 'delivery') {
      // Show items table for delivery tracking
      const items = (order.otherItems || []).map(item => ({
        id: item._id || `item-${Math.random()}`,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        orderedQty: item.quantity,
        deliveredQty: item.quantity,
        lineTotal: item.lineTotal
      }))
      setFulfillItems(items)
      setFulfillModal(true)
    } else {
      // Direct completion - just submit
      handleFulfillSubmitDirect()
    }
  }

  const handleFulfillSubmitDirect = async () => {
    try {
      setFulfilling(true)
      await api.patch(`/api/purchase-orders/${orderId}/fulfill`, { fulfillmentType: 'completion' })
      setNotify({ open: true, title: 'Success', message: 'PO marked as complete.' })
      setFulfillChoiceModal(false)
      fetchOrder()
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed.' })
    } finally {
      setFulfilling(false)
    }
  }

  // GRN Receive modal
  const openReceiveModal = () => {
    if (!order) return
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
    setReceiveModal(true)
  }

  const handleReceiveSubmit = async () => {
    try {
      setReceiving(true)
      await api.patch(`/api/purchase-orders/${orderId}/receive`, {
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
      setReceiveModal(false)
      setReceiveItems([])
      fetchOrder()
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
      cancelled: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
      payment_requested: { bg: 'rgba(251,146,60,0.1)', color: '#f97316' },
      payment_completed: { bg: 'rgba(34,197,94,0.15)', color: '#16a34a' }
    }
    const labels = {
      draft: 'Draft', pending_am: 'Pending AM', pending_gm: 'Pending GM',
      approved: 'Approved', rejected: 'Rejected', sent_to_supplier: 'Sent to Supplier',
      fulfilled: 'Fulfilled', received: 'Received', confirmed: 'Confirmed', cancelled: 'Cancelled',
      payment_requested: 'Payment Requested', payment_completed: 'Payment Completed'
    }
    const s = styles[status] || styles.draft
    return (
      <span style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: s.bg, color: s.color, textTransform: 'uppercase' }}>
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

  const auditActionLabels = {
    created: '📝 Created',
    edited: '✏️ Edited',
    submitted_for_approval: '📤 Submitted for Approval',
    approved_by_am: '✅ Approved by Account Manager',
    approved_by_gm: '✅ Approved by General Manager',
    rejected: '❌ Rejected',
    revised: '🔄 Revised',
    sent_to_supplier: '📧 Sent to Supplier',
    fulfilled: '🚚 Fulfilled',
    received: '📥 GRN Received',
    confirmed: '✔️ Confirmed',
    cancelled: '🚫 Cancelled',
    revision_requested: '🔄 Revision Requested'
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading purchase order...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--text)' }}>Purchase Order Not Found</h2>
        <button className="save-btn" onClick={() => navigate('/purchase-orders')} style={{ marginTop: '16px' }}>
          Back to Purchase Orders
        </button>
      </div>
    )
  }

  const otherItemsSubtotal = isOtherPO
    ? (order.otherItems?.reduce((sum, item) => sum + (item.lineTotal || 0), 0) || 0)
    : 0
  const otherPOTax = isOtherPO
    ? (order.taxType === 'percentage'
        ? otherItemsSubtotal * (Number(order.taxRate) || 0) / 100
        : (Number(order.taxRate) || 0))
    : 0
  const otherPODiscount = isOtherPO
    ? (order.discountType === 'percentage'
        ? otherItemsSubtotal * (Number(order.discountRate) || 0) / 100
        : (Number(order.discountRate) || 0))
    : 0
  const totalValue = isServicePO
    ? (order.serviceItems?.reduce((sum, item) => sum + (item.totalPrice || 0), 0) || 0)
    : isOtherPO
      ? (otherItemsSubtotal + otherPOTax - otherPODiscount)
      : (order.items?.reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 0)), 0) || 0)
  const vatAmt = totalValue * (order.vatPercentage || 0) / 100
  const grandTotal = totalValue + vatAmt

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <button
            onClick={() => navigate('/purchase-orders')}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            ← Back to Purchase Orders
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, color: 'var(--text)', fontSize: '28px' }}>{order.poNumber}</h1>
            {getStatusBadge(order.status)}
            {getPriorityBadge(order.priority)}
            {order.revision > 1 && (
              <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
                Revision {order.revision}
              </span>
            )}
            {(() => {
              const tc = poTypeBadgeColors[order.poType] || poTypeBadgeColors.material
              return (
                <span style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: tc.bg, color: tc.color }}>
                  {poTypeLabels[order.poType] || 'Material'}
                </span>
              )
            })()}
          </div>
          {order.grnNumber && (
            <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
              GRN: <strong style={{ color: 'var(--text)' }}>{order.grnNumber}</strong>
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Status-based action buttons */}
          {canCreate && ['draft', 'rejected'].includes(order.status) && (
            <button className="save-btn" style={{ background: '#f59e0b', padding: '10px 20px', fontSize: '14px' }} onClick={openEditModal}>✏️ Edit</button>
          )}
          {canCreate && order.status === 'draft' && (
            <button className="save-btn" style={{ background: '#3b82f6', padding: '10px 20px', fontSize: '14px' }} onClick={() => openApprovalConfirm('submit')}>📤 Submit</button>
          )}
          {canApproveAM && order.status === 'pending_am' && (
            <>
              <button className="save-btn" style={{ background: '#10b981', padding: '10px 20px', fontSize: '14px' }} onClick={() => openApprovalConfirm('approve/am', buildAmApprovalBody())}>✅ Approve (AM)</button>
              <button className="save-btn" style={{ background: '#ef4444', padding: '10px 20px', fontSize: '14px' }} onClick={openRejectModal}>❌ Reject</button>
            </>
          )}
          {canApproveGM && order.status === 'pending_gm' && (
            <>
              <button className="save-btn" style={{ background: '#10b981', padding: '10px 20px', fontSize: '14px' }} onClick={() => openApprovalConfirm('approve/gm')}>✅ Approve (GM)</button>
              <button className="save-btn" style={{ background: '#ef4444', padding: '10px 20px', fontSize: '14px' }} onClick={openRejectModal}>❌ Reject</button>
            </>
          )}
          {canCreate && order.status === 'rejected' && (
            <button className="save-btn" style={{ background: '#a855f7', padding: '10px 20px', fontSize: '14px' }} onClick={() => openApprovalConfirm('revise', { reason: 'Revision after review' })}>🔄 Revise</button>
          )}
          {['approved', 'sent_to_supplier', 'fulfilled', 'received', 'confirmed', 'payment_requested', 'payment_completed'].includes(order.status) && (
            <button className="save-btn" style={{ background: '#3b82f6', padding: '10px 20px', fontSize: '14px' }} onClick={handleDownloadPDF}>⬇️ Download PDF</button>
          )}
          {order.status === 'approved' && (
            <button className="save-btn" style={{ background: '#f59e0b', padding: '10px 20px', fontSize: '14px' }} onClick={() => openApprovalConfirm('send-to-supplier')}>📤 Send to Supplier</button>
          )}
          {canFulfill && order.status === 'sent_to_supplier' && (
            <button className="save-btn" style={{ background: '#6366f1', padding: '10px 20px', fontSize: '14px' }} onClick={openFulfillModal}>
              {isServicePO ? '✅ Mark Complete' : '🚚 Fulfill'}
            </button>
          )}
          {!isServicePO && canReceive && order.status === 'fulfilled' && (
            <button className="save-btn" style={{ background: '#10b981', padding: '10px 20px', fontSize: '14px' }} onClick={openReceiveModal}>📥 Receive (GRN)</button>
          )}
          {!isServicePO && canCreate && order.status === 'received' && (
            <button className="save-btn" style={{ background: '#059669', padding: '10px 20px', fontSize: '14px' }} onClick={() => openApprovalConfirm('confirm')}>✔️ Confirm</button>
          )}
          {canFulfill && (
            (isServicePO && order.status === 'fulfilled') ||
            (!isServicePO && order.status === 'confirmed') ||
            (['approved', 'sent_to_supplier'].includes(order.status) && order.paymentTerms?.type !== 'full_after_completion')
          ) && (
            <button className="save-btn" style={{ background: '#f97316', padding: '10px 20px', fontSize: '14px' }} onClick={() => {
              const total = isServicePO
                ? order.serviceItems?.reduce((s, i) => s + (i.totalPrice || 0), 0) || 0
                : order.items?.reduce((s, i) => s + (i.quantity * i.unitPrice || 0), 0) || 0
              const vatAmount = total * (order.vatPercentage || 0) / 100
              const gt = total + vatAmount
              let suggestedType = 'full'
              let suggestedAmount = gt
              if (['approved', 'sent_to_supplier'].includes(order.status)) {
                suggestedType = 'advance'
                if (order.paymentTerms?.type === 'partial_advance') {
                  suggestedAmount = gt * (order.paymentTerms.advancePercentage || 0) / 100
                }
              } else if (order.paymentTerms?.type === 'partial_advance') {
                suggestedType = 'final'
                const advancePaid = order.paymentRequests?.filter(p => p.paymentType === 'advance' && p.status === 'processed')
                  .reduce((s, p) => s + (p.amount || 0), 0) || 0
                suggestedAmount = gt - advancePaid
              }
              setPaymentAmount(suggestedAmount)
              setPaymentType(suggestedType)
              setPaymentNotes('')
              setPaymentRequestModal(true)
            }}>💳 Request Payment</button>
          )}
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>Created</p>
            <p style={{ margin: '4px 0', color: 'var(--text)', fontWeight: '600' }}>
              {new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            {totalValue > 0 && !isIM && (
              <p style={{ margin: '8px 0 0', color: 'var(--primary)', fontWeight: '700', fontSize: '20px' }}>
                AED {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {order.vatPercentage > 0 && <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)', marginLeft: '6px' }}>incl. {order.vatPercentage}% VAT</span>}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>

        {/* Supplier */}
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>🏢 Supplier</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Company</p>
              <p style={{ margin: '4px 0 0', color: 'var(--text)', fontWeight: '600' }}>{order.supplier?.name || '-'}</p>
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Contact Person</p>
              <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>{order.supplier?.contactPerson || '-'}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Phone</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>{order.supplier?.phone || '-'}</p>
              </div>
              <div>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Email</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>{order.supplier?.email || '-'}</p>
              </div>
            </div>
            {order.supplier?.address && (
              <div>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Address</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>{order.supplier.address}</p>
              </div>
            )}
          </div>
        </div>

        {/* Details & Approvals */}
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📋 Details & Approvals</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Created By</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>{order.createdBy?.name || '-'}</p>
              </div>
              <div>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Priority</p>
                <p style={{ margin: '4px 0 0' }}>{getPriorityBadge(order.priority)}</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Expected Delivery</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>
                  {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : '-'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Created</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>
                  {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '-'}
                </p>
              </div>
            </div>
            {/* Dual Approval Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '8px', borderRadius: '6px', background: order.approvals?.accountManager?.approvedAt ? 'rgba(16,185,129,0.05)' : order.status === 'rejected' ? 'rgba(239,68,68,0.05)' : 'var(--bg)' }}>
                <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Account Manager</p>
                {order.status === 'rejected' ? (
                  <>
                    <p style={{ margin: '4px 0 0', color: '#ef4444', fontWeight: '600', fontSize: '12px' }}>❌ Rejected</p>
                    {order.approvals?.accountManager?.notes && (
                      <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '11px' }}>
                        {order.approvals.accountManager.notes}
                      </p>
                    )}
                  </>
                ) : order.approvals?.accountManager?.approvedAt ? (
                  <>
                    <p style={{ margin: '4px 0 0', color: '#10b981', fontWeight: '600', fontSize: '12px' }}>✅ Approved</p>
                    <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '11px' }}>
                      {order.approvals.accountManager.userId?.name} — {new Date(order.approvals.accountManager.approvedAt).toLocaleDateString()}
                    </p>
                  </>
                ) : (
                  <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>⏳ Pending</p>
                )}
              </div>
              <div style={{ padding: '8px', borderRadius: '6px', background: order.approvals?.generalManager?.approvedAt ? 'rgba(16,185,129,0.05)' : order.status === 'rejected' ? 'rgba(239,68,68,0.05)' : 'var(--bg)' }}>
                <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>General Manager</p>
                {order.status === 'rejected' ? (
                  <>
                    <p style={{ margin: '4px 0 0', color: '#ef4444', fontWeight: '600', fontSize: '12px' }}>❌ Rejected</p>
                    {order.approvals?.generalManager?.notes && (
                      <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '11px' }}>
                        {order.approvals.generalManager.notes}
                      </p>
                    )}
                  </>
                ) : order.approvals?.generalManager?.approvedAt ? (
                  <>
                    <p style={{ margin: '4px 0 0', color: '#10b981', fontWeight: '600', fontSize: '12px' }}>✅ Approved</p>
                    <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '11px' }}>
                      {order.approvals.generalManager.userId?.name} — {new Date(order.approvals.generalManager.approvedAt).toLocaleDateString()}
                    </p>
                  </>
                ) : (
                  <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>⏳ Pending</p>
                )}
              </div>
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

      {/* Source PRs */}
      <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>Source</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {order.sourceRequests?.length > 0 && order.sourceRequests.map((src, idx) => (
            <div key={idx} style={{
              padding: '8px 16px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid var(--border)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
            }}
              onClick={() => navigate(`/purchase-request-detail?id=${src.requestId?._id || src.requestId}`)}
            >
              <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>PR</span>
              <span style={{ color: 'var(--primary)', fontWeight: '600' }}>
                {src.requestId?.requestNumber || src.requestNumber || 'PR'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {src.items?.length} items
              </span>
            </div>
          ))}
          {(() => {
            const prMaterialIds = new Set()
            for (const src of (order.sourceRequests || [])) {
              for (const srcItem of (src.items || [])) {
                prMaterialIds.add(String(srcItem.materialId))
              }
            }
            const directCount = (order.items || []).filter(item => !prMaterialIds.has(String(item.materialId?._id || item.materialId))).length
            return directCount > 0 ? (
              <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>Direct</span>
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>{directCount} direct item{directCount !== 1 ? 's' : ''}</span>
              </div>
            ) : null
          })()}
          {(!order.sourceRequests || order.sourceRequests.length === 0) && (!order.items || order.items.length === 0) && (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No sources</span>
          )}
        </div>
      </div>

      {/* Account Head (Chart of Accounts) - finance assigns the expense ledger */}
      {canApproveAM && order.status === 'pending_am' ? (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 6px', color: 'var(--text)', fontSize: '16px' }}>🏦 Account Head (Chart of Accounts)</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Confirm or override the expense ledger before approving — finance has the final say on how this PO is posted.
          </p>
          {isOtherPO ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(order.otherItems || []).map((it, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
                  <div style={{ color: 'var(--text)', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span> {it.description || 'Item'}
                  </div>
                  <AccountHeadSelect
                    value={amOtherHeads[i] || ''}
                    onChange={(code) => setAmOtherHeads(prev => { const next = [...prev]; next[i] = code; return next })}
                    placeholder="Select expense account…"
                  />
                </div>
              ))}
              {(!order.otherItems || order.otherItems.length === 0) && (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>No items.</p>
              )}
            </div>
          ) : (
            <div style={{ maxWidth: 440 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                Account Head — applies to all items on this PO
              </label>
              <AccountHeadSelect
                value={amOverallHead}
                onChange={setAmOverallHead}
                placeholder="Select expense account…"
              />
            </div>
          )}
        </div>
      ) : (!isOtherPO && order.accountingDetails?.overallAccountHead && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '16px 20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Account Head</span>
          <div style={{ color: 'var(--text)', fontWeight: 600, fontFamily: 'monospace', marginTop: 2 }}>
            {order.accountingDetails.overallAccountHead}
          </div>
        </div>
      ))}

      {/* Items Table */}
      {isOtherPO ? (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>⚙️ Other Items</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>#</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Description</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Rate Type</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Unit Price</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Qty</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Duration</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Tax</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Discount</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {(order.otherItems || []).map((item, i) => {
                  const taxLabel = item.taxRate
                    ? `${Number(item.taxRate).toLocaleString()}${item.taxType === 'percentage' ? '%' : ' AED'}`
                    : '-'
                  const discountLabel = item.discountRate
                    ? `${Number(item.discountRate).toLocaleString()}${item.discountType === 'percentage' ? '%' : ' AED'}`
                    : '-'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td style={{ padding: '12px', color: 'var(--text)', fontWeight: '500' }}>
                        <div>{item.description}</div>
                        {(item.hsn || item.accountHead) && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {item.hsn && <span>HSN: {item.hsn}</span>}
                            {item.hsn && item.accountHead && <span> · </span>}
                            {item.accountHead && <span>Acct: {item.accountHead}</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>{rateTypeLabels[item.rateType] || item.rateType || 'Fixed'}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>AED {Number(item.unitPrice || 0).toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>{item.quantity}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>{item.rateType === 'fixed' || !item.duration || item.duration === 1 ? '-' : item.duration}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>{taxLabel}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>{discountLabel}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--primary)' }}>AED {Number(item.lineTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  )
                })}
                {(!order.otherItems || order.otherItems.length === 0) && (
                  <tr>
                    <td colSpan={9} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>No items</td>
                  </tr>
                )}
                {otherItemsSubtotal > 0 && !isIM && (
                  <>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td colSpan={8} style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--text)' }}>Subtotal:</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: 'var(--text)', fontSize: '16px' }}>
                        AED {otherItemsSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    {otherPOTax > 0 && (
                      <tr>
                        <td colSpan={8} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)', fontSize: '14px' }}>
                          PO Tax{order.taxType === 'percentage' && order.taxRate ? ` (${order.taxRate}%)` : ''}:
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '600', color: 'var(--text-muted)', fontSize: '14px' }}>
                          AED {otherPOTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                    {otherPODiscount > 0 && (
                      <tr>
                        <td colSpan={8} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)', fontSize: '14px' }}>
                          PO Discount{order.discountType === 'percentage' && order.discountRate ? ` (${order.discountRate}%)` : ''}:
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '600', color: 'var(--text-muted)', fontSize: '14px' }}>
                          − AED {otherPODiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                    {order.vatPercentage > 0 && (
                      <tr>
                        <td colSpan={8} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)', fontSize: '14px' }}>VAT ({order.vatPercentage}%):</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '600', color: 'var(--text-muted)', fontSize: '14px' }}>
                          AED {vatAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                    <tr style={{ borderTop: '1px solid var(--border)' }}>
                      <td colSpan={8} style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--text)' }}>Grand Total:</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: 'var(--primary)', fontSize: '18px' }}>
                        AED {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : isServicePO ? (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>🛠️ Service Items</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>#</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Description</th>
                  {order.poType === 'machine_rental' && (
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Machine Type</th>
                  )}
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Rate Type</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Rate</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Qty</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Duration</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.serviceItems?.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ padding: '12px', color: 'var(--text)', fontWeight: '500' }}>{item.description}</td>
                    {order.poType === 'machine_rental' && (
                      <td style={{ padding: '12px', color: 'var(--text)' }}>{item.machineType || '-'}</td>
                    )}
                    <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>{rateTypeLabels[item.rateType] || item.rateType}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>AED {item.rate?.toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>{item.quantity}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>{item.rateType === 'lump_sum' ? '-' : item.duration}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--primary)' }}>AED {item.totalPrice?.toLocaleString()}</td>
                  </tr>
                ))}
                {totalValue > 0 && !isIM && (
                  <>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td colSpan={order.poType === 'machine_rental' ? 7 : 6} style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--text)' }}>Subtotal:</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: 'var(--text)', fontSize: '16px' }}>
                        AED {totalValue.toLocaleString()}
                      </td>
                    </tr>
                    {order.vatPercentage > 0 && (
                      <tr>
                        <td colSpan={order.poType === 'machine_rental' ? 7 : 6} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)', fontSize: '14px' }}>VAT ({order.vatPercentage}%):</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '600', color: 'var(--text-muted)', fontSize: '14px' }}>
                          AED {vatAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                    <tr style={{ borderTop: '1px solid var(--border)' }}>
                      <td colSpan={order.poType === 'machine_rental' ? 7 : 6} style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--text)' }}>Grand Total:</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: 'var(--primary)', fontSize: '18px' }}>
                        AED {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📦 Order Items</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Material</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>SKU</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Qty</th>
                  {!isIM && (
                    <>
                      <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Unit Price</th>
                      <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Total</th>
                    </>
                  )}
                  {order.fulfillmentDetails?.length > 0 && (
                    <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Delivered</th>
                  )}
                  {order.receivedItems?.length > 0 && (
                    <>
                      <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Received</th>
                      <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>Condition</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item, index) => {
                  const fulfillment = order.fulfillmentDetails?.find(f => String(f.materialId) === String(item.materialId?._id || item.materialId))
                  const received = order.receivedItems?.find(r => String(r.materialId) === String(item.materialId?._id || item.materialId))
                  return (
                    <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', color: 'var(--text)', fontWeight: '500' }}>
                        {item.materialName || item.materialId?.name || 'Unknown'}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--primary)' }}>{item.sku || item.materialId?.sku || '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>
                        {item.quantity} {item.uom}
                      </td>
                      {!isIM && (
                        <>
                          <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>
                            {item.unitPrice ? `AED ${item.unitPrice.toLocaleString()}` : '-'}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: 'var(--primary)' }}>
                            {item.unitPrice ? `AED ${(item.quantity * item.unitPrice).toLocaleString()}` : '-'}
                          </td>
                        </>
                      )}
                      {order.fulfillmentDetails?.length > 0 && (
                        <td style={{ padding: '12px', textAlign: 'center', color: fulfillment ? '#6366f1' : 'var(--text-muted)' }}>
                          {fulfillment ? `${fulfillment.deliveredQty} ${item.uom}` : '-'}
                        </td>
                      )}
                      {order.receivedItems?.length > 0 && (
                        <>
                          <td style={{ padding: '12px', textAlign: 'center', color: received ? '#22c55e' : 'var(--text-muted)', fontWeight: received ? '600' : '400' }}>
                            {received ? `${received.receivedQty} ${item.uom}` : '-'}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {received?.condition ? getConditionBadge(received.condition) : '-'}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                {totalValue > 0 && !isIM && (
                  <>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td colSpan={4} style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--text)' }}>Subtotal:</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: 'var(--text)', fontSize: '16px' }}>
                        AED {totalValue.toLocaleString()}
                      </td>
                      {order.fulfillmentDetails?.length > 0 && <td></td>}
                      {order.receivedItems?.length > 0 && <td colSpan={2}></td>}
                    </tr>
                    {order.vatPercentage > 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)', fontSize: '14px' }}>VAT ({order.vatPercentage}%):</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '600', color: 'var(--text-muted)', fontSize: '14px' }}>
                          AED {vatAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        {order.fulfillmentDetails?.length > 0 && <td></td>}
                        {order.receivedItems?.length > 0 && <td colSpan={2}></td>}
                      </tr>
                    )}
                    <tr style={{ borderTop: '1px solid var(--border)' }}>
                      <td colSpan={4} style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'var(--text)' }}>Grand Total:</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: 'var(--primary)', fontSize: '18px' }}>
                        AED {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      {order.fulfillmentDetails?.length > 0 && <td></td>}
                      {order.receivedItems?.length > 0 && <td colSpan={2}></td>}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attachments */}
      <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📎 Attachments</h3>

        {/* Upload Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'var(--bg)', borderRadius: '8px', border: '2px dashed var(--primary)', cursor: uploadingAttachments ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '600', color: 'var(--primary)', opacity: uploadingAttachments ? 0.6 : 1 }}>
            <input
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleAttachmentUpload}
              disabled={uploadingAttachments}
              style={{ display: 'none' }}
            />
            {uploadingAttachments ? (
              <>
                <span>⏳</span> Uploading...
              </>
            ) : (
              <>
                <span>⬆️</span> Click to upload or drag files
              </>
            )}
          </label>
          <p style={{ margin: '0', color: 'var(--text-muted)', fontSize: '12px' }}>Supported: Images, Videos, PDF, Word, Excel (Max 10MB per file)</p>
        </div>

        {/* Attachments List */}
        {order.attachments && order.attachments.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {order.attachments.map((attachment, index) => {
              const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
              const fileUrl = attachment.path.startsWith('http')
                ? attachment.path
                : `${apiBase}${attachment.path}`

              return (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '18px' }}>{getFileIcon(attachment.mimetype)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 4px', color: 'var(--text)', fontWeight: '600', wordBreak: 'break-word', fontSize: '14px' }}>
                        {attachment.originalName}
                      </p>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px' }}>
                        {formatFileSize(attachment.size)} • Uploaded {new Date(attachment.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
                    <a
                      href={fileUrl}
                      download={attachment.originalName}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ padding: '6px 12px', background: '#3b82f6', color: 'white', borderRadius: '4px', textDecoration: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      ⬇️ Download
                    </a>
                    <button
                      onClick={() => handleRemoveAttachment(index)}
                      style={{ padding: '6px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
            No attachments yet. Upload files to get started.
          </p>
        )}
      </div>

      {/* Payment Terms (hidden for IM) */}
      {!isIM && order.paymentTerms && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 12px', color: 'var(--text)', fontSize: '16px' }}>💰 Payment Terms</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Payment Type</span>
              <p style={{ fontWeight: '600', margin: '4px 0' }}>
                {order.paymentTerms.type === 'full_advance' ? 'Full Advance Payment' : order.paymentTerms.type === 'partial_advance' ? 'Partial Advance' : 'Full Payment After Completion'}
              </p>
            </div>
            {order.paymentTerms.type === 'partial_advance' && (
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Advance Percentage</span>
                <p style={{ fontWeight: '600', margin: '4px 0' }}>{order.paymentTerms.advancePercentage}%</p>
              </div>
            )}
          </div>
          {order.paymentTerms.notes && (
            <div style={{ marginTop: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Notes</span>
              <p style={{ margin: '4px 0', fontSize: '14px' }}>{order.paymentTerms.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Annexure */}
      {order.annexure && order.annexure.trim() && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 12px', color: 'var(--text)', fontSize: '16px' }}>📑 Annexure</h3>
          <div style={{ fontSize: '14px', lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: order.annexure }} />
        </div>
      )}

      {/* Completion Documents (Service POs) */}
      {isServicePO && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 12px', color: 'var(--text)', fontSize: '16px' }}>
            📋 {completionDocLabels[order.completionDocType] || 'Completion Documents'}
          </h3>
          {order.status === 'fulfilled' && canFulfill && (
            <div style={{ border: '2px dashed var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '12px', textAlign: 'center' }}>
              <input type="file" multiple onChange={e => setCompletionFiles(Array.from(e.target.files))}
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" />
              {completionFiles.length > 0 && (
                <button className="save-btn" style={{ marginTop: '8px' }} onClick={handleUploadCompletion} disabled={uploadingCompletion}>
                  {uploadingCompletion ? 'Uploading...' : `Upload ${completionFiles.length} file(s)`}
                </button>
              )}
            </div>
          )}
          {order.completionAttachments?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {order.completionAttachments.map((att, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg)', borderRadius: '6px' }}>
                  <div>
                    <span style={{ fontWeight: '500' }}>{att.originalName}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {(att.size / 1024).toFixed(1)} KB
                    </span>
                    {att.uploadedBy && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        by {att.uploadedBy?.name || 'Unknown'}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <a href={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}${att.path}`} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--primary)', fontSize: '12px', textDecoration: 'none' }}>View</a>
                    {canFulfill && (
                      <button className="link-btn" style={{ color: '#ef4444', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
                        onClick={() => setDeleteCompletionConfirm({ open: true, attachmentIndex: index })}>Remove</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No completion documents uploaded yet.</p>
          )}
        </div>
      )}

      {/* Payment Requests (hidden for IM) */}
      {!isIM && order.paymentRequests?.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 12px', color: 'var(--text)', fontSize: '16px' }}>💳 Payment Requests</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Type</th>
                  <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid var(--border)' }}>Amount</th>
                  <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Requested By</th>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {order.paymentRequests.map((pr, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px', textTransform: 'capitalize' }}>{pr.paymentType}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>AED {pr.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                        background: pr.status === 'processed' ? 'rgba(34,197,94,0.1)' : 'rgba(251,191,36,0.1)',
                        color: pr.status === 'processed' ? '#22c55e' : '#f59e0b'
                      }}>{pr.status === 'processed' ? 'Processed' : 'Pending'}</span>
                    </td>
                    <td style={{ padding: '8px', fontSize: '12px' }}>{pr.requestedBy?.name || '-'}</td>
                    <td style={{ padding: '8px', fontSize: '12px' }}>{pr.requestedAt ? new Date(pr.requestedAt).toLocaleDateString() : '-'}</td>
                    <td style={{ padding: '8px' }}>
                      {pr.status === 'pending' && (isAM || isAdmin) && (
                        <button className="save-btn" style={{ color: '#10b981', fontSize: '12px', padding: '4px 10px', background: 'rgba(16,185,129,0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
                          onClick={() => setProcessPaymentConfirm({ open: true, paymentId: pr._id, amount: pr.amount || 0, type: pr.paymentType || '' })}>Process</button>
                      )}
                      {pr.status === 'processed' && pr.processedBy && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>by {pr.processedBy?.name || '-'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Trail */}
      {order.auditTrail?.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📅 Audit Trail</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {(() => {
              const paymentActions = ['payment_requested', 'payment_processed'];
              const visibleTrail = isIM
                ? order.auditTrail.filter(e => !paymentActions.includes(e.action))
                : order.auditTrail;
              return visibleTrail.map((entry, index) => {
              const actionColors = {
                created: '#3b82f6', edited: '#f59e0b', submitted_for_approval: '#8b5cf6',
                approved_by_am: '#10b981', approved_by_gm: '#10b981', rejected: '#ef4444',
                revised: '#a855f7', sent_to_supplier: '#06b6d4', fulfilled: '#6366f1',
                received: '#14b8a6', confirmed: '#059669', cancelled: '#dc2626',
                revision_requested: '#a855f7', attachments_added: '#64748b', attachment_removed: '#64748b',
                payment_requested: '#f97316', payment_processed: '#16a34a'
              };
              const color = actionColors[entry.action] || '#3b82f6';
              const isLast = index === visibleTrail.length - 1;
              return (
                <div key={index} style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
                  {/* Timeline line + dot */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '32px', flexShrink: 0 }}>
                    <div style={{
                      width: '12px', height: '12px', borderRadius: '50%',
                      background: color, border: `3px solid ${color}22`,
                      flexShrink: 0, marginTop: '4px'
                    }} />
                    {!isLast && <div style={{ width: '2px', flex: 1, background: 'var(--border)' }} />}
                  </div>
                  {/* Content */}
                  <div style={{ paddingBottom: isLast ? '0' : '20px', flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text)' }}>
                        {auditActionLabels[entry.action] || entry.action}
                      </span>
                      {entry.revision > 1 && (
                        <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
                          v{entry.revision}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(entry.performedAt).toLocaleString()} by {entry.performedBy?.name || 'System'}
                    </p>
                    {entry.notes && (
                      <p style={{ margin: '4px 0 0', color: 'var(--text)', fontSize: '13px', fontStyle: 'italic' }}>
                        "{entry.notes}"
                      </p>
                    )}

                    {/* Edit Changes - Before/After comparison */}
                    {entry.details?.changes?.length > 0 && (
                      <div style={{ marginTop: '8px', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                        <div style={{ background: 'var(--bg)', padding: '6px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                          Changes
                        </div>
                        {entry.details.changes.map((change, ci) => {
                          const sampleItem = (Array.isArray(change.from) && change.from[0]) || (Array.isArray(change.to) && change.to[0]) || null;
                          const isServiceItems = change.type === 'items' && sampleItem && sampleItem.rate !== undefined;
                          const isOtherItems = change.type === 'items' && sampleItem && sampleItem.unitPrice !== undefined && sampleItem.rateType !== undefined;
                          const isMaterialItems = change.type === 'items' && !isServiceItems && !isOtherItems;
                          return (
                          <div key={ci} style={{ padding: '8px 12px', borderBottom: ci < entry.details.changes.length - 1 ? '1px solid var(--border)' : 'none', fontSize: '13px' }}>
                            <span style={{ fontWeight: '600', color: 'var(--text)', marginRight: '8px' }}>{change.field}</span>
                            {isServiceItems ? (
                              /* Service Items Display */
                              <div style={{ marginTop: '6px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                  <div style={{ padding: '8px', borderRadius: '6px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#ef4444', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Before</div>
                                    {(Array.isArray(change.from) ? change.from : []).map((item, ii) => (
                                      <div key={ii} style={{ fontSize: '12px', color: 'var(--text)', padding: '2px 0', marginBottom: ii < (Array.isArray(change.from) ? change.from.length : 0) - 1 ? '4px' : '0', borderBottom: ii < (Array.isArray(change.from) ? change.from.length : 0) - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none', paddingBottom: ii < (Array.isArray(change.from) ? change.from.length : 0) - 1 ? '4px' : '0' }}>
                                        <div style={{ fontWeight: '600', marginBottom: '2px' }}>{item.description}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rate: AED {(item.rate || 0).toLocaleString()}/{item.rateType || 'unit'}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Qty: {item.quantity || 1} {item.duration ? `× ${item.duration} days` : ''}</div>
                                      </div>
                                    ))}
                                    {(!change.from || change.from.length === 0) && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(no items)</div>}
                                  </div>
                                  <div style={{ padding: '8px', borderRadius: '6px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#10b981', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>After</div>
                                    {(Array.isArray(change.to) ? change.to : []).map((item, ii) => (
                                      <div key={ii} style={{ fontSize: '12px', color: 'var(--text)', padding: '2px 0', marginBottom: ii < (Array.isArray(change.to) ? change.to.length : 0) - 1 ? '4px' : '0', borderBottom: ii < (Array.isArray(change.to) ? change.to.length : 0) - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none', paddingBottom: ii < (Array.isArray(change.to) ? change.to.length : 0) - 1 ? '4px' : '0' }}>
                                        <div style={{ fontWeight: '600', marginBottom: '2px' }}>{item.description}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rate: AED {(item.rate || 0).toLocaleString()}/{item.rateType || 'unit'}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Qty: {item.quantity || 1} {item.duration ? `× ${item.duration} days` : ''}</div>
                                      </div>
                                    ))}
                                    {(!change.to || change.to.length === 0) && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(no items)</div>}
                                  </div>
                                </div>
                              </div>
                            ) : isOtherItems ? (
                              /* Other Items Display (poType: 'other') */
                              <div style={{ marginTop: '6px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                  <div style={{ padding: '8px', borderRadius: '6px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#ef4444', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Before</div>
                                    {(Array.isArray(change.from) ? change.from : []).map((item, ii) => {
                                      const last = ii < change.from.length - 1;
                                      const taxLabel = item.taxRate ? `Tax: ${item.taxRate}${item.taxType === 'percentage' ? '%' : ''}` : null;
                                      const discLabel = item.discountRate ? `Disc: ${item.discountRate}${item.discountType === 'percentage' ? '%' : ''}` : null;
                                      const meta = [taxLabel, discLabel].filter(Boolean).join(' · ');
                                      return (
                                        <div key={ii} style={{ fontSize: '12px', color: 'var(--text)', padding: '2px 0', marginBottom: last ? '4px' : '0', borderBottom: last ? '1px solid rgba(0,0,0,0.1)' : 'none', paddingBottom: last ? '4px' : '0' }}>
                                          <div style={{ fontWeight: '600', marginBottom: '2px' }}>{item.description}</div>
                                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rate: AED {(item.unitPrice || 0).toLocaleString()}/{item.rateType || 'fixed'}</div>
                                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Qty: {item.quantity || 1}{item.duration > 1 ? ` × ${item.duration}` : ''}</div>
                                          {meta && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{meta}</div>}
                                          {item.lineTotal !== undefined && item.lineTotal !== null && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Line Total: AED {Number(item.lineTotal).toLocaleString()}</div>}
                                        </div>
                                      );
                                    })}
                                    {(!change.from || change.from.length === 0) && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(no items)</div>}
                                  </div>
                                  <div style={{ padding: '8px', borderRadius: '6px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#10b981', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>After</div>
                                    {(Array.isArray(change.to) ? change.to : []).map((item, ii) => {
                                      const last = ii < change.to.length - 1;
                                      const taxLabel = item.taxRate ? `Tax: ${item.taxRate}${item.taxType === 'percentage' ? '%' : ''}` : null;
                                      const discLabel = item.discountRate ? `Disc: ${item.discountRate}${item.discountType === 'percentage' ? '%' : ''}` : null;
                                      const meta = [taxLabel, discLabel].filter(Boolean).join(' · ');
                                      return (
                                        <div key={ii} style={{ fontSize: '12px', color: 'var(--text)', padding: '2px 0', marginBottom: last ? '4px' : '0', borderBottom: last ? '1px solid rgba(0,0,0,0.1)' : 'none', paddingBottom: last ? '4px' : '0' }}>
                                          <div style={{ fontWeight: '600', marginBottom: '2px' }}>{item.description}</div>
                                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rate: AED {(item.unitPrice || 0).toLocaleString()}/{item.rateType || 'fixed'}</div>
                                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Qty: {item.quantity || 1}{item.duration > 1 ? ` × ${item.duration}` : ''}</div>
                                          {meta && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{meta}</div>}
                                          {item.lineTotal !== undefined && item.lineTotal !== null && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Line Total: AED {Number(item.lineTotal).toLocaleString()}</div>}
                                        </div>
                                      );
                                    })}
                                    {(!change.to || change.to.length === 0) && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(no items)</div>}
                                  </div>
                                </div>
                              </div>
                            ) : isMaterialItems ? (
                              /* Material Items Display */
                              <div style={{ marginTop: '6px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                  <div style={{ padding: '8px', borderRadius: '6px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#ef4444', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Before</div>
                                    {(Array.isArray(change.from) ? change.from : []).map((item, ii) => (
                                      <div key={ii} style={{ fontSize: '12px', color: 'var(--text)', padding: '2px 0' }}>
                                        {item.materialName} — {item.quantity} {item.uom} @ AED {(item.unitPrice || 0).toLocaleString()}
                                      </div>
                                    ))}
                                    {(!change.from || change.from.length === 0) && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(no items)</div>}
                                  </div>
                                  <div style={{ padding: '8px', borderRadius: '6px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#10b981', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>After</div>
                                    {(Array.isArray(change.to) ? change.to : []).map((item, ii) => (
                                      <div key={ii} style={{ fontSize: '12px', color: 'var(--text)', padding: '2px 0' }}>
                                        {item.materialName} — {item.quantity} {item.uom} @ AED {(item.unitPrice || 0).toLocaleString()}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.08)', color: '#dc2626', fontSize: '12px', textDecoration: 'line-through' }}>
                                  {change.from}
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>→</span>
                                <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.08)', color: '#059669', fontSize: '12px' }}>
                                  {change.to}
                                </span>
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Revision Snapshot */}
                    {entry.details?.snapshot && (
                      <div style={{ marginTop: '8px', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                        <div style={{ background: 'var(--bg)', padding: '6px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                          State at time of revision
                        </div>
                        <div style={{ padding: '10px 12px', fontSize: '13px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>Status:</span>
                            <span style={{ color: 'var(--text)' }}>{entry.details.snapshot.status}</span>
                            <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>Supplier:</span>
                            <span style={{ color: 'var(--text)' }}>{entry.details.snapshot.supplier || '(none)'}</span>
                            <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>Priority:</span>
                            <span style={{ color: 'var(--text)' }}>{entry.details.snapshot.priority}</span>
                            <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>Delivery:</span>
                            <span style={{ color: 'var(--text)' }}>{entry.details.snapshot.deliveryDate || '(none)'}</span>
                            {entry.details.snapshot.vatPercentage > 0 && (
                              <>
                                <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>VAT:</span>
                                <span style={{ color: 'var(--text)' }}>{entry.details.snapshot.vatPercentage}%</span>
                              </>
                            )}
                            {entry.details.snapshot.notes && (
                              <>
                                <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>Notes:</span>
                                <span style={{ color: 'var(--text)' }}>{entry.details.snapshot.notes}</span>
                              </>
                            )}
                          </div>
                          {entry.details.snapshot.items?.length > 0 && (
                            <div style={{ marginTop: '8px', padding: '8px', borderRadius: '6px', background: 'var(--bg)' }}>
                              <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Items</div>
                              {entry.details.snapshot.items.map((item, ii) => (
                                <div key={ii} style={{ fontSize: '12px', color: 'var(--text)', padding: '2px 0' }}>
                                  {item.materialName} — {item.quantity} {item.uom} @ AED {(item.unitPrice || 0).toLocaleString()}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
            })()}
          </div>
        </div>
      )}

      {/* Revision History */}
      {order.revisionHistory?.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>🔄 Revision History</h3>
          {order.revisionHistory.map((rev, idx) => (
            <div key={idx} style={{ padding: '8px 0', borderBottom: idx < order.revisionHistory.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontWeight: '600', color: 'var(--text)' }}>v{rev.revision}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: '12px', fontSize: '13px' }}>
                {new Date(rev.revisedAt).toLocaleString()} by {rev.revisedBy?.name || 'Unknown'}
              </span>
              {rev.reason && <p style={{ margin: '4px 0 0', color: 'var(--text)', fontSize: '13px' }}>{rev.reason}</p>}
            </div>
          ))}
        </div>
      )}

      {/* GRN Details */}
      {order.status === 'received' || order.status === 'confirmed' ? (
        <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>📋 GRN Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>GRN Number</p>
              <p style={{ margin: '4px 0 0', color: 'var(--primary)', fontWeight: '700', fontSize: '18px' }}>{order.grnNumber}</p>
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Delivery Date</p>
              <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>
                {order.grnDeliveryDate ? new Date(order.grnDeliveryDate).toLocaleDateString() : '-'}
              </p>
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Delivery Person</p>
              <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>{order.grnDeliveryPersonName || '-'}</p>
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Vehicle</p>
              <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>{order.grnVehicleNumber || '-'}</p>
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Overall Condition</p>
              <p style={{ margin: '4px 0 0' }}>{order.grnOverallCondition ? getConditionBadge(order.grnOverallCondition) : '-'}</p>
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Receiver</p>
              <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>{order.grnReceiverName || '-'}</p>
            </div>
          </div>
          {order.grnNotes && (
            <div style={{ marginTop: '16px' }}>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>GRN Notes</p>
              <p style={{ margin: '4px 0 0', color: 'var(--text)' }}>{order.grnNotes}</p>
            </div>
          )}
        </div>
      ) : null}

      {/* =================== EDIT MODAL (Full Flow) =================== */}
      {editModal && order && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '1000px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>Edit Purchase Order — {order.poNumber}</h2>
              <button onClick={closeEditModal} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>

              {/* Service Items Editor (for service POs) */}
              {isServicePO && (
                <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, color: 'var(--text)' }}>
                      {order.poType === 'manpower' ? '👷 Manpower Details' : order.poType === 'subcontracting' ? '🔧 Service Details' : '🏗️ Machine Rental Details'}
                    </h4>
                    <button type="button" onClick={() => setEditServiceItems(prev => [...prev, { id: Date.now(), description: '', rateType: order.poType === 'subcontracting' ? 'per_item' : 'monthly', rate: 0, quantity: 1, duration: 1, totalPrice: 0 }])}
                      className="link-btn" style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '13px' }}>
                      + Add Line
                    </button>
                  </div>

                  {editServiceItems.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                      No service items added. Click "+ Add Line" to start.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {editServiceItems.map((item, index) => (
                        <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: 'var(--card)', position: 'relative' }}>
                          <button type="button" onClick={() => setEditServiceItems(prev => prev.filter(i => i.id !== item.id))}
                            style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '16px', fontWeight: '700' }}>×</button>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>#{index + 1}</span>
                          </div>
                          <div className="form-group" style={{ margin: '0 0 8px' }}>
                            <label style={{ fontSize: '12px' }}>Description *</label>
                            <input type="text" value={item.description || ''} onChange={e => setEditServiceItems(prev => prev.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))}
                              placeholder={order.poType === 'manpower' ? 'e.g., Skilled electrician for site wiring' : order.poType === 'machine_rental' ? 'e.g., Excavator rental for foundation work' : 'e.g., Painting and finishing work'}
                              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                          </div>
                          {order.poType === 'machine_rental' && (
                            <div className="form-group" style={{ margin: '0 0 8px' }}>
                              <label style={{ fontSize: '12px' }}>Machine Type</label>
                              <input type="text" value={item.machineType || ''} onChange={e => setEditServiceItems(prev => prev.map(i => i.id === item.id ? { ...i, machineType: e.target.value } : i))}
                                placeholder="e.g., Excavator, Crane, Loader"
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: order.poType === 'subcontracting' ? '1fr 1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '8px' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label style={{ fontSize: '12px' }}>Rate Type</label>
                              <select value={item.rateType || 'monthly'} onChange={e => {
                                const rt = e.target.value
                                setEditServiceItems(prev => prev.map(i => {
                                  if (i.id !== item.id) return i
                                  const dur = rt === 'lump_sum' ? 1 : (i.duration || 1)
                                  return { ...i, rateType: rt, duration: dur, totalPrice: (i.rate || 0) * (i.quantity || 1) * dur }
                                }))
                              }}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                {order.poType === 'subcontracting' ? (
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
                              <input type="number" min="0" step="0.01" value={item.rate || 0} onChange={e => {
                                const rate = Number(e.target.value)
                                setEditServiceItems(prev => prev.map(i => i.id === item.id ? { ...i, rate, totalPrice: rate * (i.quantity || 1) * (i.rateType === 'lump_sum' ? 1 : (i.duration || 1)) } : i))
                              }}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                            </div>
                            {item.rateType !== 'lump_sum' && (
                              <>
                                <div className="form-group" style={{ margin: 0 }}>
                                  <label style={{ fontSize: '12px' }}>{order.poType === 'manpower' ? 'No. of Workers' : order.poType === 'machine_rental' ? 'No. of Machines' : 'Quantity'}</label>
                                  <input type="number" min="1" value={item.quantity || 1} onChange={e => {
                                    const qty = Number(e.target.value)
                                    setEditServiceItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: qty, totalPrice: (i.rate || 0) * qty * (i.rateType === 'lump_sum' ? 1 : (i.duration || 1)) } : i))
                                  }}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                  <label style={{ fontSize: '12px' }}>Duration ({item.rateType === 'hourly' ? 'hours' : item.rateType === 'daily' ? 'days' : 'months'})</label>
                                  <input type="number" min="1" value={item.duration || 1} onChange={e => {
                                    const dur = Number(e.target.value)
                                    setEditServiceItems(prev => prev.map(i => i.id === item.id ? { ...i, duration: dur, totalPrice: (i.rate || 0) * (i.quantity || 1) * dur } : i))
                                  }}
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

                      {/* Service items totals & VAT */}
                      <div style={{ borderTop: '2px solid var(--border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600' }}>
                          {editVatEnabled ? 'Subtotal:' : 'Total:'} AED {editServiceItemsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
                            <input type="checkbox" checked={editVatEnabled} onChange={e => { setEditVatEnabled(e.target.checked); if (!e.target.checked) setEditVatPercentage(''); }} />
                            Apply VAT
                          </label>
                          {editVatEnabled && (
                            <>
                              <input type="number" min="0" max="100" step="0.1" placeholder="%" value={editVatPercentage} onChange={e => setEditVatPercentage(e.target.value)}
                                style={{ width: '70px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', textAlign: 'center' }} />
                              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>%</span>
                            </>
                          )}
                        </div>
                        {editVatEnabled && Number(editVatPercentage) > 0 && (
                          <>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                              VAT ({editVatPercentage}%): AED {(editServiceItemsTotal * Number(editVatPercentage) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary)' }}>
                              Grand Total: AED {(editServiceItemsTotal + editServiceItemsTotal * Number(editVatPercentage) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Section A: Select from Purchase Requests (material POs only) */}
              {!isServicePO && !isOtherPO && (
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Select Items from Purchase Requests</h4>

                {/* Search & Filter Bar */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Search by PR#, material, project..."
                    value={editPrSearch}
                    onChange={e => { setEditPrSearch(e.target.value); setEditPrPage(1) }}
                    style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}
                  />
                  <select
                    value={editPrPriorityFilter}
                    onChange={e => { setEditPrPriorityFilter(e.target.value); setEditPrPage(1) }}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}
                  >
                    <option value="all">All Priorities</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                {editLoadingPRs ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>Loading available items...</p>
                ) : (() => {
                  const filteredPRs = editAvailablePRs.filter(pr => {
                    const matchesSearch = !editPrSearch || 
                      pr.requestNumber?.toLowerCase().includes(editPrSearch.toLowerCase()) ||
                      pr.project?.toLowerCase().includes(editPrSearch.toLowerCase()) ||
                      pr.items?.some(i => i.materialName?.toLowerCase().includes(editPrSearch.toLowerCase()))
                    const matchesPriority = editPrPriorityFilter === 'all' || pr.priority === editPrPriorityFilter
                    return matchesSearch && matchesPriority
                  })
                  const totalPages = Math.ceil(filteredPRs.length / EDIT_PR_PAGE_SIZE) || 1
                  const pagedPRs = filteredPRs.slice((editPrPage - 1) * EDIT_PR_PAGE_SIZE, editPrPage * EDIT_PR_PAGE_SIZE)

                  return (
                    <>
                      {pagedPRs.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>No available PR items found.</p>
                      ) : pagedPRs.map(pr => (
                        <div key={pr.requestId} style={{ background: 'var(--card)', borderRadius: '8px', padding: '12px', marginBottom: '10px', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div>
                              <span style={{ fontWeight: '600', color: 'var(--primary)' }}>{pr.requestNumber}</span>
                              <span style={{ color: 'var(--text-muted)', marginLeft: '10px', fontSize: '12px' }}>{pr.project}</span>
                            </div>
                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                              background: pr.priority === 'urgent' ? 'rgba(239,68,68,0.1)' : pr.priority === 'high' ? 'rgba(251,191,36,0.1)' : 'rgba(59,130,246,0.1)',
                              color: pr.priority === 'urgent' ? '#ef4444' : pr.priority === 'high' ? '#f59e0b' : '#3b82f6'
                            }}>
                              {pr.priority}
                            </span>
                          </div>
                          <table style={{ width: '100%', fontSize: '12px' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>Select</th>
                                <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>Material</th>
                                <th style={{ textAlign: 'center', padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>Available</th>
                                <th style={{ textAlign: 'center', padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>Allocate</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pr.items.map(item => {
                                const isSelected = editSelectedPRItems.some(s => s.requestId === pr.requestId && s.itemId === item.itemId)
                                const selectedItem = editSelectedPRItems.find(s => s.requestId === pr.requestId && s.itemId === item.itemId)
                                return (
                                  <tr key={item.itemId}>
                                    <td style={{ padding: '4px 8px' }}>
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleEditPRItem(pr, item)}
                                      />
                                    </td>
                                    <td style={{ padding: '4px 8px' }}>
                                      {item.materialName}
                                      <span style={{ color: 'var(--primary)', fontSize: '10px', marginLeft: '4px' }}>({item.sku})</span>
                                    </td>
                                    <td style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                      {item.remainingQty} {item.uom}
                                    </td>
                                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                      {isSelected ? (
                                        <input
                                          type="number"
                                          min="1"
                                          max={item.remainingQty}
                                          value={selectedItem?.allocatedQty || 0}
                                          onChange={e => updateEditAllocatedQty(pr.requestId, item.itemId, e.target.value)}
                                          style={{ width: '60px', padding: '4px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px' }}
                                        />
                                      ) : '-'}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ))}
                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
                          <button
                            disabled={editPrPage <= 1}
                            onClick={() => setEditPrPage(p => p - 1)}
                            style={{ padding: '4px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--card)', cursor: editPrPage <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                          >← Prev</button>
                          <span style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            {editPrPage} / {totalPages}
                          </span>
                          <button
                            disabled={editPrPage >= totalPages}
                            onClick={() => setEditPrPage(p => p + 1)}
                            style={{ padding: '4px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--card)', cursor: editPrPage >= totalPages ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                          >Next →</button>
                        </div>
                      )}
                    </>
                  )
                })()}

                {editSelectedPRItems.length > 0 && (
                  <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(99,102,241,0.1)', borderRadius: '6px', fontSize: '13px', color: '#6366f1', fontWeight: '600' }}>
                    {editSelectedPRItems.length} item(s) selected from {[...new Set(editSelectedPRItems.map(s => s.requestNumber))].length} PR(s)
                  </div>
                )}
              </div>
              )}

              {/* Section B: Add Materials Directly from Inventory (material POs only) */}
              {!isServicePO && !isOtherPO && (
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Add Materials Directly from Inventory</h4>
                {editLoadingMaterials ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>Loading materials...</p>
                ) : editAvailableMaterials.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No materials found in inventory.</p>
                ) : (() => {
                  const q = editMaterialSearch.toLowerCase().trim()
                  const filtered = editAvailableMaterials.filter(m => {
                    if (editMaterialCategoryFilter !== 'all' && m.category !== editMaterialCategoryFilter) return false
                    if (editMaterialBrandFilter && String(m.brand?._id || m.brand || '') !== editMaterialBrandFilter) return false
                    if (!q) return true
                    return m.name?.toLowerCase().includes(q) || m.sku?.toLowerCase().includes(q) || m.uom?.toLowerCase().includes(q)
                  })
                  const totalPages = Math.max(1, Math.ceil(filtered.length / EDIT_MATERIAL_PAGE_SIZE))
                  const safePage = Math.min(editMaterialPage, totalPages)
                  const paginated = filtered.slice((safePage - 1) * EDIT_MATERIAL_PAGE_SIZE, safePage * EDIT_MATERIAL_PAGE_SIZE)

                  return (
                    <>
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          placeholder="Search material name, SKU, UOM..."
                          value={editMaterialSearch}
                          onChange={e => { setEditMaterialSearch(e.target.value); setEditMaterialPage(1) }}
                          style={{ flex: '1 1 200px', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)' }}
                        />
                        <select
                          value={editMaterialCategoryFilter}
                          onChange={e => { setEditMaterialCategoryFilter(e.target.value); setEditMaterialPage(1) }}
                          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', cursor: 'pointer' }}
                        >
                          <option value="all">All Categories</option>
                          <option value="project_specific">Project</option>
                          <option value="staff_specific">Staff</option>
                        </select>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {filtered.length} material{filtered.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Brand Filter - Searchable */}
                      {editBrands.length > 0 && (
                        <div style={{ marginBottom: '12px', position: 'relative' }}>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
                            <input
                              type="text"
                              value={editMaterialBrandSearch}
                              onChange={e => { setEditMaterialBrandSearch(e.target.value); setEditMaterialBrandDropdownOpen(true) }}
                              onFocus={() => setEditMaterialBrandDropdownOpen(true)}
                              onBlur={() => setTimeout(() => setEditMaterialBrandDropdownOpen(false), 150)}
                              placeholder={editMaterialBrandFilter ? editBrands.find(b => b._id === editMaterialBrandFilter)?.name : 'Filter by brand...'}
                              style={{ width: '100%', padding: '8px 36px 8px 30px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }}
                            />
                            {editMaterialBrandFilter && (
                              <button
                                type="button"
                                onClick={() => { setEditMaterialBrandFilter(''); setEditMaterialBrandSearch(''); setEditMaterialPage(1) }}
                                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
                                title="Clear brand filter"
                              >×</button>
                            )}
                          </div>
                          {editMaterialBrandDropdownOpen && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: '2px', maxHeight: '200px', overflowY: 'auto' }}>
                              <div
                                onMouseDown={() => { setEditMaterialBrandFilter(''); setEditMaterialBrandSearch(''); setEditMaterialBrandDropdownOpen(false); setEditMaterialPage(1) }}
                                style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: !editMaterialBrandFilter ? 'var(--primary)' : 'var(--text)', fontWeight: !editMaterialBrandFilter ? '600' : '400', borderBottom: '1px solid var(--border)' }}
                              >
                                All Brands
                              </div>
                              {editBrands
                                .filter(b => !editMaterialBrandSearch || b.name.toLowerCase().includes(editMaterialBrandSearch.toLowerCase()))
                                .map(b => (
                                  <div
                                    key={b._id}
                                    onMouseDown={() => { setEditMaterialBrandFilter(b._id); setEditMaterialBrandSearch(''); setEditMaterialBrandDropdownOpen(false); setEditMaterialPage(1) }}
                                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', background: editMaterialBrandFilter === b._id ? 'rgba(99,102,241,0.08)' : 'transparent', color: editMaterialBrandFilter === b._id ? 'var(--primary)' : 'var(--text)', fontWeight: editMaterialBrandFilter === b._id ? '600' : '400' }}
                                  >
                                    {b.name}
                                  </div>
                                ))}
                              {editBrands.filter(b => !editMaterialBrandSearch || b.name.toLowerCase().includes(editMaterialBrandSearch.toLowerCase())).length === 0 && (
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
                                <th style={{ textAlign: 'center', padding: '8px' }}>Stock</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginated.map(mat => {
                                const isDirectSelected = editDirectItems.some(p => p.materialId === mat._id)
                                const isFromPR = editSelectedPRItems.some(s => s.materialId === mat._id)
                                return (
                                  <tr
                                    key={mat._id}
                                    onClick={() => !isFromPR && toggleEditMaterialForPO(mat)}
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
                                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: '600' }}>{mat.quantity || 0}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>

                          {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                              <button
                                onClick={() => setEditMaterialPage(p => Math.max(1, p - 1))}
                                disabled={safePage <= 1}
                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: safePage <= 1 ? 'var(--bg)' : 'var(--card)', cursor: safePage <= 1 ? 'default' : 'pointer', fontSize: '12px' }}
                              >Prev</button>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Page {safePage} of {totalPages}</span>
                              <button
                                onClick={() => setEditMaterialPage(p => Math.min(totalPages, p + 1))}
                                disabled={safePage >= totalPages}
                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: safePage >= totalPages ? 'var(--bg)' : 'var(--card)', cursor: safePage >= totalPages ? 'default' : 'pointer', fontSize: '12px' }}
                              >Next</button>
                            </div>
                          )}
                        </>
                      )}

                      {editDirectItems.length > 0 && (
                        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(59,130,246,0.06)', borderRadius: '6px', fontSize: '12px', color: 'var(--primary)', fontWeight: '600' }}>
                          {editDirectItems.length} direct material{editDirectItems.length !== 1 ? 's' : ''} added
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
              )}

              {/* Step 2: PO Items with Pricing */}
              {editPoItems.length > 0 && (
                <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Step 2: PO Items & Pricing</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '13px', minWidth: '500px' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Material</th>
                          <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Source</th>
                          <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Qty</th>
                          <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Unit Price (AED)</th>
                          <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editPoItems.map((item, index) => (
                          <tr key={index}>
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
                            <td style={{ padding: '8px', textAlign: 'center', fontWeight: '600', color: 'var(--text)' }}>
                              {item.source === 'direct' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={e => updateEditDirectItemQty(item.materialId, e.target.value)}
                                    style={{ width: '70px', padding: '6px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border)', fontWeight: '600' }}
                                  />
                                  {item.uom}
                                </span>
                              ) : (
                                <>{item.quantity} {item.uom}</>
                              )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <input type="number" min="0" step="0.01" value={item.unitPrice}
                                onChange={e => item.source === 'direct' ? updateEditDirectItemPrice(item.materialId, e.target.value) : updateEditPoItemPrice(item.materialId, e.target.value)}
                                style={{ width: '90px', padding: '6px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border)' }} />
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center', fontWeight: '600', color: 'var(--primary)' }}>
                              {item.totalPrice > 0 ? `AED ${item.totalPrice.toLocaleString()}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {editPoItems.some(i => i.unitPrice > 0) && (() => {
                    const subtotal = editPoItems.reduce((sum, i) => sum + (i.totalPrice || 0), 0)
                    const vatAmt = editVatEnabled ? subtotal * (Number(editVatPercentage) || 0) / 100 : 0
                    return (
                      <div style={{ marginTop: '8px', textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>
                          {editVatEnabled ? 'Subtotal' : 'Total'}: AED {subtotal.toLocaleString()}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', margin: '6px 0', fontSize: '13px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '600', color: 'var(--text)' }}>
                            <input type="checkbox" checked={editVatEnabled} onChange={e => { setEditVatEnabled(e.target.checked); if (!e.target.checked) setEditVatPercentage(''); }} />
                            Apply VAT
                          </label>
                          {editVatEnabled && (
                            <>
                              <input type="number" min="0" max="100" step="0.1" placeholder="%" value={editVatPercentage} onChange={e => setEditVatPercentage(e.target.value)}
                                style={{ width: '70px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', textAlign: 'center' }} />
                              <span style={{ color: 'var(--text-muted)' }}>%</span>
                            </>
                          )}
                        </div>
                        {editVatEnabled && Number(editVatPercentage) > 0 && (
                          <>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0' }}>
                              VAT ({editVatPercentage}%): AED {vatAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>
                              Grand Total: AED {(subtotal + vatAmt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Other Items Editor (for other POs) */}
              {isOtherPO && (
                <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, color: 'var(--text)' }}>⚙️ Other Items</h4>
                    <button type="button" onClick={addEditOtherItem} className="link-btn" style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '13px' }}>
                      + Add Item
                    </button>
                  </div>

                  {editOtherItems.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                      No items added. Click "+ Add Item" to start.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                      {editOtherItems.map((item, idx) => (
                        <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', background: 'var(--card)' }}>
                          {/* Row 1: Description */}
                          <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Item Description <span style={{ color: '#ef4444' }}>*</span></label>
                            <input type="text" placeholder="e.g., Software License, Consulting Services, Office Supplies..." value={item.description} onChange={e => updateEditOtherItem(item.id, 'description', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                          </div>

                          {/* Row 2: Quantity & Unit Price */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Quantity <span style={{ color: '#ef4444' }}>*</span></label>
                              <input type="number" placeholder="1" min="0.01" step="0.01" value={item.quantity} onChange={e => updateEditOtherItem(item.id, 'quantity', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Unit Price (AED) <span style={{ color: '#ef4444' }}>*</span></label>
                              <input type="number" placeholder="0.00" min="0" step="0.01" value={item.unitPrice} onChange={e => updateEditOtherItem(item.id, 'unitPrice', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                          </div>

                          {/* Row 3: Rate Type & Duration */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Rate Type</label>
                              <select value={item.rateType} onChange={e => updateEditOtherItem(item.id, 'rateType', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', boxSizing: 'border-box' }}>
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
                                <input type="number" placeholder="1" min="1" step="0.5" value={item.duration} onChange={e => updateEditOtherItem(item.id, 'duration', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                              </div>
                            )}
                          </div>

                          {/* Row 4: Item-Level Tax */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Item Tax Type</label>
                              <select value={item.taxType} onChange={e => updateEditOtherItem(item.id, 'taxType', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', boxSizing: 'border-box' }}>
                                <option value="percentage">Percentage (%)</option>
                                <option value="amount">Fixed Amount (AED)</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Item Tax Rate</label>
                              <input type="number" placeholder="0" min="0" step="0.01" value={item.taxRate} onChange={e => updateEditOtherItem(item.id, 'taxRate', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                          </div>

                          {/* Row 5: Item-Level Discount */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Item Discount Type</label>
                              <select value={item.discountType} onChange={e => updateEditOtherItem(item.id, 'discountType', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', boxSizing: 'border-box' }}>
                                <option value="percentage">Percentage (%)</option>
                                <option value="amount">Fixed Amount (AED)</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Item Discount Rate</label>
                              <input type="number" placeholder="0" min="0" step="0.01" value={item.discountRate} onChange={e => updateEditOtherItem(item.id, 'discountRate', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                          </div>

                          {/* Row 6: HSN Code & Account Head */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>HSN/SAC Code <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(optional)</span></label>
                              <input type="text" placeholder="e.g., 6211, 7319..." value={item.hsn || ''} onChange={e => updateEditOtherItem(item.id, 'hsn', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Account Head <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(optional)</span></label>
                              <input type="text" placeholder="e.g., IT-001, MAINT-005..." value={item.accountHead || ''} onChange={e => updateEditOtherItem(item.id, 'accountHead', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                          </div>

                          {/* Row 7: Start Date & End Date */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Start Date <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(optional)</span></label>
                              <input type="date" value={item.startDate ? item.startDate.split('T')[0] : ''} onChange={e => updateEditOtherItem(item.id, 'startDate', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>End Date <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(optional)</span></label>
                              <input type="date" value={item.endDate ? item.endDate.split('T')[0] : ''} onChange={e => updateEditOtherItem(item.id, 'endDate', e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }} />
                            </div>
                          </div>

                          {/* Row 8: Notes */}
                          <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Notes <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(optional)</span></label>
                            <textarea value={item.notes || ''} onChange={e => updateEditOtherItem(item.id, 'notes', e.target.value)} placeholder="Any additional notes about this item..." rows="2" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                          </div>

                          {/* Row 9: Line Total & Delete Button */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                              Line Total: <span style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '14px' }}>AED {(item.lineTotal || 0).toFixed(2)}</span>
                            </span>
                            <button type="button" onClick={() => removeEditOtherItem(item.id)} title="Delete item" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: '700', fontSize: '20px', lineHeight: 1, padding: '0' }}>×</button>
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
                        <select value={editPoTaxType} onChange={e => setEditPoTaxType(e.target.value)} style={{ flex: '0 0 50px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--card)', color: 'var(--text)' }}>
                          <option value="percentage">%</option>
                          <option value="amount">AED</option>
                        </select>
                        <input type="number" placeholder="Tax" min="0" value={editPoTaxRate} onChange={e => setEditPoTaxRate(e.target.value)} style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--card)', color: 'var(--text)' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <select value={editPoDiscountType} onChange={e => setEditPoDiscountType(e.target.value)} style={{ flex: '0 0 50px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--card)', color: 'var(--text)' }}>
                          <option value="percentage">%</option>
                          <option value="amount">AED</option>
                        </select>
                        <input type="number" placeholder="Discount" min="0" value={editPoDiscountRate} onChange={e => setEditPoDiscountRate(e.target.value)} style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--card)', color: 'var(--text)' }} />
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                      <span>Subtotal: <strong style={{ color: 'var(--text)' }}>AED {editOtherItemsSubtotal.toFixed(2)}</strong></span>
                      <span>Tax: <strong style={{ color: 'var(--text)' }}>AED {editOtherPOTax.toFixed(2)}</strong></span>
                      <span>Discount: <strong style={{ color: 'var(--text)' }}>AED {editOtherPODiscount.toFixed(2)}</strong></span>
                      <span style={{ color: 'var(--primary)', fontWeight: '600' }}>Total: AED {editOtherGrandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Supplier & Details */}
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Step 3: Supplier & Details</h4>
                <div style={{ marginBottom: '12px', position: 'relative' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '500', color: 'var(--text)' }}>Supplier</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
                    <input
                      type="text"
                      value={editSupplierSearch}
                      onChange={e => { setEditSupplierSearch(e.target.value); setEditSupplierDropdownOpen(true) }}
                      onFocus={() => setEditSupplierDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setEditSupplierDropdownOpen(false), 150)}
                      placeholder={editSupplierId ? editSuppliers.find(s => s._id === editSupplierId)?.name || editSupplier.name || 'Search supplier...' : 'Search supplier...'}
                      style={{ width: '100%', padding: '8px 36px 8px 30px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }}
                    />
                    {editSupplierId && (
                      <button
                        type="button"
                        onClick={() => { setEditSupplierId(''); setEditSupplier({ name: '', contactPerson: '', phone: '', email: '', address: '' }); setEditSupplierSearch('') }}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
                        title="Clear supplier"
                      >×</button>
                    )}
                  </div>
                  {editSupplierDropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: '2px', maxHeight: '200px', overflowY: 'auto' }}>
                      {editSuppliers
                        .filter(s => !editSupplierSearch || s.name.toLowerCase().includes(editSupplierSearch.toLowerCase()) || s.trn.toLowerCase().includes(editSupplierSearch.toLowerCase()) || (s.contactPerson || '').toLowerCase().includes(editSupplierSearch.toLowerCase()))
                        .map(s => (
                          <div
                            key={s._id}
                            onMouseDown={() => {
                              setEditSupplierId(s._id)
                              setEditSupplier({ name: s.name, contactPerson: s.contactPerson || '', phone: s.phone || '', email: s.email || '', address: s.address || '' })
                              setEditSupplierSearch('')
                              setEditSupplierDropdownOpen(false)
                            }}
                            style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', background: editSupplierId === s._id ? 'rgba(99,102,241,0.08)' : 'transparent', color: editSupplierId === s._id ? 'var(--primary)' : 'var(--text)', fontWeight: editSupplierId === s._id ? '600' : '400' }}
                          >
                            {s.name} — TRN: {s.trn}{s.contactPerson ? ` · ${s.contactPerson}` : ''}
                          </div>
                        ))}
                      {editSuppliers.filter(s => !editSupplierSearch || s.name.toLowerCase().includes(editSupplierSearch.toLowerCase()) || s.trn.toLowerCase().includes(editSupplierSearch.toLowerCase()) || (s.contactPerson || '').toLowerCase().includes(editSupplierSearch.toLowerCase())).length === 0 && (
                        <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '13px' }}>No suppliers found</div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Priority</label>
                    <select value={editPriority} onChange={e => setEditPriority(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Delivery Date</label>
                    <input type="date" value={editDeliveryDate} onChange={e => setEditDeliveryDate(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Notes</label>
                    <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                      placeholder="Notes..." style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                  </div>
                </div>
              </div>

              {/* Payment Terms (Edit) */}
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Payment Terms</h4>
                <div style={{ display: 'grid', gridTemplateColumns: editPaymentTermsType === 'partial_advance' ? '1fr 1fr' : '1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Payment Type</label>
                    <select value={editPaymentTermsType} onChange={e => setEditPaymentTermsType(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <option value="full_after_completion">Full Payment After Completion</option>
                      <option value="full_advance">Full Advance Payment</option>
                      <option value="partial_advance">Partial Advance</option>
                    </select>
                  </div>
                  {editPaymentTermsType === 'partial_advance' && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px' }}>Advance Percentage (%)</label>
                      <input type="number" min="0" max="100" value={editAdvancePercentage} onChange={e => setEditAdvancePercentage(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px' }}>Payment Notes</label>
                  <textarea value={editPaymentTermsNotes} onChange={e => setEditPaymentTermsNotes(e.target.value)} rows={2}
                    placeholder="Payment terms notes..."
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                </div>
              </div>

              {/* Annexure (Edit) */}
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Annexure</h4>
                <div style={{ background: 'var(--card)', borderRadius: '6px' }} className="annexure-editor">
                  <ReactQuill
                    value={editAnnexure}
                    onChange={setEditAnnexure}
                    placeholder="Additional terms, conditions, specifications, or scope of work..."
                    modules={annexureModules}
                    theme="snow"
                    ref={(el) => {
                      if (el) {
                        window.quillDetailEditorRef = el
                        setTimeout(() => applyToolbarTooltips(el.getEditor()?.root), 100)
                      }
                    }}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={closeEditModal}>Cancel</button>
                <button type="button" className="save-btn" onClick={handleEditSubmit} disabled={saving || (isServicePO ? editServiceItems.length === 0 : isOtherPO ? editOtherItems.length === 0 : editPoItems.length === 0)}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== FULFILL CHOICE MODAL (for Other POs) =================== */}
      {fulfillChoiceModal && order && isOtherPO && (
        <div className="modal-overlay" onClick={() => setFulfillChoiceModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>How would you like to fulfill this PO?</h2>
              <button onClick={() => setFulfillChoiceModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '14px' }}>
                Choose whether to track delivery quantities or mark as directly completed.
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => handleFulfillChoice('delivery')}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.target.style.background = 'rgba(99,102,241,0.08)'}
                  onMouseLeave={e => e.target.style.background = 'var(--card)'}
                >
                  📦 Track Delivery Quantities
                </button>
                <button
                  type="button"
                  onClick={() => handleFulfillChoice('completion')}
                  disabled={fulfilling}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                    transition: 'all 0.2s',
                    opacity: fulfilling ? 0.6 : 1
                  }}
                  onMouseEnter={e => !fulfilling && (e.target.style.background = 'rgba(16,185,129,0.08)')}
                  onMouseLeave={e => e.target.style.background = 'var(--card)'}
                >
                  {fulfilling ? '⏳ Completing...' : '✅ Mark as Complete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== FULFILL MODAL =================== */}
      {fulfillModal && order && (
        <div className="modal-overlay" onClick={() => setFulfillModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>{isServicePO ? '✅ Mark Complete' : '🚚 Fulfill Purchase Order'}</h2>
              <button onClick={() => setFulfillModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <div style={{ background: 'var(--bg)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                <span style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '16px' }}>{order.poNumber}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '12px', fontSize: '13px' }}>{order.supplier?.name || ''}</span>
              </div>
              <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>
                  {isServicePO ? 'Service Items' : 'Materials Delivered'}
                </h4>
                {isServicePO ? (
                  /* Service Items Table */
                  <table style={{ width: '100%', fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border)' }}>Description</th>
                        <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Rate</th>
                        <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--border)' }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fulfillItems.map((item, index) => (
                        <tr key={index}>
                          <td style={{ padding: '8px' }}>{item.description}</td>
                          <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            AED {(item.rate || 0).toLocaleString()}/{item.rateType}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            {item.quantity} {item.duration ? `× ${item.duration}d` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  /* Material Items Table */
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
                )}
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setFulfillModal(false)}>Cancel</button>
                <button type="button" className="save-btn" onClick={handleFulfillSubmit} disabled={fulfilling}>
                  {fulfilling ? (isServicePO ? 'Marking Complete...' : 'Fulfilling...') : (isServicePO ? 'Mark Complete' : 'Confirm Fulfillment')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== GRN RECEIVE MODAL =================== */}
      {receiveModal && order && (
        <div className="modal-overlay" onClick={() => setReceiveModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>Goods Receipt Note (GRN)</h2>
              <button onClick={() => setReceiveModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <div style={{ background: 'var(--bg)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                <span style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '16px' }}>{order.poNumber}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '12px', fontSize: '13px' }}>{order.supplier?.name || ''}</span>
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
                <button type="button" className="cancel-btn" onClick={() => setReceiveModal(false)}>Cancel</button>
                <button type="button" className="save-btn" onClick={handleReceiveSubmit} disabled={receiving}>
                  {receiving ? 'Submitting...' : 'Submit GRN'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== REJECT MODAL =================== */}
      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Reject Purchase Order</h2>
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
                  Reject PO
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Attachment Confirmation Modal */}
      {deleteConfirm.open && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm({ open: false, attachmentIndex: null })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Delete Attachment</h2>
              <button onClick={() => setDeleteConfirm({ open: false, attachmentIndex: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <p style={{ color: 'var(--text)', marginBottom: '20px' }}>Are you sure you want to delete this attachment? This action cannot be undone.</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setDeleteConfirm({ open: false, attachmentIndex: null })}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: '#ef4444' }} onClick={confirmDeleteAttachment}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approval Confirmation Modal */}
      {approvalConfirm.open && (
        <div className="modal-overlay" onClick={() => setApprovalConfirm({ open: false, action: null, title: '', message: '', body: {} })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>{approvalConfirm.title}</h2>
              <button onClick={() => setApprovalConfirm({ open: false, action: null, title: '', message: '', body: {} })} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <p style={{ color: 'var(--text)', marginBottom: '20px' }}>{approvalConfirm.message}</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setApprovalConfirm({ open: false, action: null, title: '', message: '', body: {} })}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: { 'send-to-supplier': '#f59e0b', confirm: '#059669', submit: '#3b82f6', revise: '#a855f7' }[approvalConfirm.action] || '#10b981' }} onClick={confirmApproval}>
                  {{ 'send-to-supplier': 'Send', confirm: 'Confirm', submit: 'Submit', revise: 'Revise' }[approvalConfirm.action] || 'Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Request Modal */}
      {paymentRequestModal && (
        <div className="modal-overlay" onClick={() => setPaymentRequestModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Request Payment</h2>
              <button onClick={() => setPaymentRequestModal(false)} className="close-btn">x</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <div className="form-group">
                <label>Payment Type</label>
                <select value={paymentType} onChange={e => setPaymentType(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <option value="advance">Advance Payment</option>
                  <option value="final">Final Payment</option>
                  <option value="full">Full Payment</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount (AED)</label>
                <input type="number" min="0" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Payment details..." rows={3}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setPaymentRequestModal(false)}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: '#f97316' }} onClick={handleRequestPayment} disabled={requestingPayment || paymentAmount <= 0}>
                  {requestingPayment ? 'Submitting...' : 'Submit Payment Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Completion Attachment Confirmation */}
      {deleteCompletionConfirm.open && (
        <div className="modal-overlay" onClick={() => setDeleteCompletionConfirm({ open: false, attachmentIndex: null })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Delete Completion Document</h2>
              <button onClick={() => setDeleteCompletionConfirm({ open: false, attachmentIndex: null })} className="close-btn">x</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <p>Are you sure you want to delete this completion document?</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setDeleteCompletionConfirm({ open: false, attachmentIndex: null })}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: '#ef4444' }} onClick={() => handleDeleteCompletionAttachment(deleteCompletionConfirm.attachmentIndex)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Process Payment Confirmation Modal */}
      {processPaymentConfirm.open && (
        <div className="modal-overlay" onClick={() => setProcessPaymentConfirm({ open: false, paymentId: null, amount: 0, type: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>Confirm Payment Processing</h2>
              <button onClick={() => setProcessPaymentConfirm({ open: false, paymentId: null, amount: 0, type: '' })} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ padding: '20px' }}>
              <p style={{ color: 'var(--text)', marginBottom: '12px' }}>
                Are you sure you want to process this payment? This action cannot be undone.
              </p>
              <div style={{ background: 'var(--bg)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Type</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', textTransform: 'capitalize' }}>{processPaymentConfirm.type} Payment</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Amount</span>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--primary)' }}>AED {processPaymentConfirm.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setProcessPaymentConfirm({ open: false, paymentId: null, amount: 0, type: '' })}>Cancel</button>
                <button type="button" className="save-btn" style={{ background: '#10b981' }} onClick={() => {
                  handleProcessPayment(processPaymentConfirm.paymentId)
                  setProcessPaymentConfirm({ open: false, paymentId: null, amount: 0, type: '' })
                }}>Confirm & Process</button>
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
      <style>{`
        /* Annexure editor toolbar styling */
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

        .annexure-editor .ql-toolbar button:hover {
          background-color: rgba(0, 0, 0, 0.1);
          border-color: rgba(0, 0, 0, 0.2);
        }

        .annexure-editor .ql-toolbar button.ql-active,
        .annexure-editor .ql-toolbar.ql-snow button.ql-active,
        .annexure-editor .ql-toolbar.ql-snow button:hover {
          background-color: rgba(0, 0, 0, 0.15);
        }

        /* Undo/Redo button specific styling */
        .annexure-editor .ql-toolbar .ql-undo,
        .annexure-editor .ql-toolbar .ql-redo {
          display: inline-flex !important;
          visibility: visible !important;
          opacity: 1 !important;
        }

        /* Undo/Redo button custom icons */
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

        .annexure-editor .ql-toolbar .ql-undo svg,
        .annexure-editor .ql-toolbar .ql-redo svg {
          display: none;
        }

        /* Custom tooltips for toolbar buttons */
        .annexure-editor .ql-toolbar button[title]:hover {
          position: relative;
        }

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
      `}</style>
    </div>
  )
}

export default PurchaseOrderDetail
