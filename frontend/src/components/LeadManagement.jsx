import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { CreateQuotationModal } from './CreateQuotationModal'
import './LeadManagement.css'
import './LoadingComponents.css'
import { Spinner, SkeletonCard, SkeletonTableRow, ButtonLoader, PageSkeleton } from './LoadingComponents'

function LeadManagement() {
  const navigate = useNavigate()
  const location = useLocation()
  const [leads, setLeads] = useState([])
  const [quotationCounts, setQuotationCounts] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [editingLead, setEditingLead] = useState(null)
  const [formData, setFormData] = useState({
    customerName: '',
    projectTitle: '',
    enquiryNumber: '',
    enquiryDate: '',
    scopeSummary: '',
    submissionDueDate: ''
  })
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewFiles, setPreviewFiles] = useState([])
  const [attachmentsToRemove, setAttachmentsToRemove] = useState([])
  const [myOnly, setMyOnly] = useState(false)
  const [profileUser, setProfileUser] = useState(null)
  const [historyLead, setHistoryLead] = useState(null)
  const [showVisitModal, setShowVisitModal] = useState(false)
  const [visitData, setVisitData] = useState({
    visitAt: '',
    siteLocation: '',
    engineerName: '',
    workProgressSummary: '',
    safetyObservations: '',
    qualityMaterialCheck: '',
    issuesFound: '',
    actionItems: '',
    weatherConditions: '',
    description: ''
  })
  const [visitFiles, setVisitFiles] = useState([])
  const [visitPreviewFiles, setVisitPreviewFiles] = useState([])
  const [notify, setNotify] = useState({ open: false, title: '', message: '', onOk: null })
  const [quotationEditBlockModal, setQuotationEditBlockModal] = useState({ open: false })
  const [showQuotationModal, setShowQuotationModal] = useState(false)
  const [selectedLeadForQuotation, setSelectedLeadForQuotation] = useState(null)
  const [showQuotationsListModal, setShowQuotationsListModal] = useState(false)
  const [quotationsForLead, setQuotationsForLead] = useState([])
  const [selectedLeadForList, setSelectedLeadForList] = useState(null)
  const [deleteQuotationModal, setDeleteQuotationModal] = useState({ open: false, quotation: null })
  const [deleteLeadModal, setDeleteLeadModal] = useState({ open: false, leadId: null })
  const [showRevisionsModal, setShowRevisionsModal] = useState({ open: false, quotation: null })
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem('leadViewMode')
    return saved === 'table' ? 'table' : 'card' // default to 'card' if not set
  })
  const [expandedQuotationRows, setExpandedQuotationRows] = useState({}) // Track which rows have expanded quotations
  const [leadQuotationsMap, setLeadQuotationsMap] = useState({}) // Store quotations per lead ID
  const [expandedRevisionRows, setExpandedRevisionRows] = useState({}) // Track which rows have expanded revisions
  const [quotationRevisionsMap, setQuotationRevisionsMap] = useState({}) // Store revisions per quotation ID
  const [revisionProjectMap, setRevisionProjectMap] = useState({}) // Map revision ID to project info
  const [expandedProjectRows, setExpandedProjectRows] = useState({}) // Track which revision rows have expanded projects
  const [revisionProjectDetailsMap, setRevisionProjectDetailsMap] = useState({}) // Store full project details per revision ID
  const [expandedVariationRows, setExpandedVariationRows] = useState({}) // Track which rows have expanded variations
  const [projectVariationsMap, setProjectVariationsMap] = useState({}) // Store variations per project ID
  const [projectModal, setProjectModal] = useState({ open: false, project: null })
  const [variationsForProject, setVariationsForProject] = useState([])
  const [selectedProjectForList, setSelectedProjectForList] = useState(null)
  const [showVariationsListModal, setShowVariationsListModal] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [search, setSearch] = useState('')
  // New filter states
  const [nameFilter, setNameFilter] = useState('')
  const [dateModifiedFilter, setDateModifiedFilter] = useState('')
  const [dateCreatedFilter, setDateCreatedFilter] = useState('')
  // New sort states
  const [sortField, setSortField] = useState('dateCreated') // 'name', 'dateModified', 'dateCreated'
  const [sortDirection, setSortDirection] = useState('desc') // 'asc', 'desc'
  // Debounced filter values for performance
  const [debouncedNameFilter, setDebouncedNameFilter] = useState('')
  const [debouncedDateModifiedFilter, setDebouncedDateModifiedFilter] = useState('')
  const [debouncedDateCreatedFilter, setDebouncedDateCreatedFilter] = useState('')
  const [isFiltering, setIsFiltering] = useState(false) // Track filter operations
  const [filtersExpanded, setFiltersExpanded] = useState(false) // Mobile: collapsible filters
  const [isMobile, setIsMobile] = useState(false) // Track mobile viewport
  const [headerHeight, setHeaderHeight] = useState(80) // Header height for sticky positioning
  const headerRef = useRef(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingAction, setLoadingAction] = useState(null)

  // Detect mobile viewport and measure header height
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      // Auto-expand filters on desktop
      if (window.innerWidth >= 768) {
        setFiltersExpanded(true)
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Measure header height for sticky positioning
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight)
      }
    }
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      updateHeaderHeight()
    })
    window.addEventListener('resize', updateHeaderHeight)
    return () => window.removeEventListener('resize', updateHeaderHeight)
  }, [])

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user'))
    setCurrentUser(userData)
    const loadData = async () => {
      setIsLoading(true)
      await fetchLeads()
      setIsLoading(false)
    }
    void loadData()
  }, [])

  // Persist view mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('leadViewMode', viewMode)
  }, [viewMode])

  // Adjust itemsPerPage when switching views to ensure grid-friendly values for card view
  useEffect(() => {
    if (viewMode === 'card' && ![6, 9, 12, 15, 18, 21, 24].includes(itemsPerPage)) {
      // Find the nearest card-friendly value (multiple of 3)
      const cardValues = [6, 9, 12, 15, 18, 21, 24]
      const nearest = cardValues.reduce((prev, curr) => 
        Math.abs(curr - itemsPerPage) < Math.abs(prev - itemsPerPage) ? curr : prev
      )
      setItemsPerPage(nearest)
    } else if (viewMode === 'table' && ![5, 10, 20, 50].includes(itemsPerPage)) {
      // Find the nearest table-friendly value
      const tableValues = [5, 10, 20, 50]
      const nearest = tableValues.reduce((prev, curr) => 
        Math.abs(curr - itemsPerPage) < Math.abs(prev - itemsPerPage) ? curr : prev
      )
      setItemsPerPage(nearest)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]) // Only run when viewMode changes, not when itemsPerPage changes

  const fetchLeads = async () => {
    try {
      const response = await api.get('/api/leads')
      setLeads(response.data)
      
      // Fetch quotations and count per lead
      try {
        const qResponse = await api.get('/api/quotations')
        const allQuotations = Array.isArray(qResponse.data) ? qResponse.data : []
        const counts = {}
        allQuotations.forEach(q => {
          const qLeadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
          if (qLeadId) {
            counts[qLeadId] = (counts[qLeadId] || 0) + 1
          }
        })
        setQuotationCounts(counts)
      } catch (error) {
        console.error('Error fetching quotations:', error)
      }
    } catch (error) {
      console.error('Error fetching leads:', error)
    }
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    setSelectedFiles(prev => [...prev, ...files])
    
    // Create previews for images and videos
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'image' }])
        }
        reader.readAsDataURL(file)
      } else if (file.type.startsWith('video/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'video' }])
        }
        reader.readAsDataURL(file)
      } else {
        setPreviewFiles(prev => [...prev, { file, preview: null, type: 'document' }])
      }
    })
  }

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setPreviewFiles(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const handleRemoveAttachment = (index) => {
    setAttachmentsToRemove(prev => [...prev, index.toString()])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    setLoadingAction(editingLead ? 'update-lead' : 'create-lead')
    setIsSubmitting(true)
    try {
      const formDataToSend = new FormData()
      
      // Append form fields
      Object.keys(formData).forEach(key => {
        formDataToSend.append(key, formData[key])
      })
      
      // Append files
      selectedFiles.forEach(file => {
        formDataToSend.append('attachments', file)
      })

      // Append attachments to remove (only when editing)
      if (editingLead && attachmentsToRemove.length > 0) {
        attachmentsToRemove.forEach(index => {
          formDataToSend.append('removeAttachments', index)
        })
      }

      // No need to set Content-Type header - browser will set it automatically with boundary for FormData
      if (editingLead) {
        await api.put(`/api/leads/${editingLead._id}`, formDataToSend)
      } else {
        await api.post('/api/leads', formDataToSend)
      }
      await fetchLeads()
      setShowModal(false)
      setFormData({ customerName: '', projectTitle: '', enquiryNumber: '', enquiryDate: '', scopeSummary: '', submissionDueDate: '' })
      setSelectedFiles([])
      setPreviewFiles([])
      setAttachmentsToRemove([])
      setEditingLead(null)
      setNotify({ open: true, title: 'Success', message: editingLead ? 'Lead updated successfully.' : 'Lead created successfully.' })
    } catch (error) {
      setNotify({ open: true, title: 'Save Failed', message: error.response?.data?.message || 'We could not save this lead. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  // Lead approvals removed; handled at Quotation level

  const convertToProject = async (leadId) => {
    if (isSubmitting) return
    setLoadingAction(`convert-${leadId}`)
    setIsSubmitting(true)
    try {
      await api.post(`/api/leads/${leadId}/convert`, {})
      await fetchLeads()
      setNotify({ open: true, title: 'Converted', message: 'Lead converted to project successfully.' })
    } catch (error) {
      setNotify({ open: true, title: 'Convert Failed', message: error.response?.data?.message || 'We could not convert this lead. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  const handleEditLead = async (lead) => {
    // Check if quotations exist for this lead
    try {
      const qRes = await api.get('/api/quotations')
      const allQ = Array.isArray(qRes.data) ? qRes.data : []
      const quotationsForThisLead = allQ.filter(q => {
        const qLeadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
        return qLeadId === lead._id
      })
      if (quotationsForThisLead.length > 0) {
        setQuotationEditBlockModal({ open: true })
        return
      }
    } catch (e) {
      // If check fails, allow editing (fail open)
    }
    setEditingLead(lead)
    setFormData({
      customerName: lead.customerName || '',
      projectTitle: lead.projectTitle || '',
      enquiryNumber: lead.enquiryNumber || '',
      enquiryDate: lead.enquiryDate ? lead.enquiryDate.substring(0, 10) : '',
      scopeSummary: lead.scopeSummary || '',
      submissionDueDate: lead.submissionDueDate ? lead.submissionDueDate.substring(0, 10) : ''
    })
    // Reset file selections when editing
    setSelectedFiles([])
    setPreviewFiles([])
    setAttachmentsToRemove([])
    setShowModal(true)
  }

  const handleDeleteLead = async (leadId) => {
    if (isSubmitting) return
    setDeleteLeadModal({ open: false, leadId: null }) // Close modal immediately
    setLoadingAction(`delete-${leadId}`)
    setIsSubmitting(true)
    try {
      await api.delete(`/api/leads/${leadId}`)
      await fetchLeads()
      setNotify({ open: true, title: 'Deleted', message: 'Lead deleted successfully.' })
    } catch (error) {
      setNotify({ open: true, title: 'Delete Failed', message: error.response?.data?.message || 'We could not delete this lead. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  const handleDeleteQuotation = async (q) => {
    if (isSubmitting) return
    setLoadingAction(`delete-quotation-${q._id}`)
    setIsSubmitting(true)
    try {
      await api.delete(`/api/quotations/${q._id}`)
      // Refresh quotations for the lead
      const leadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
      if (leadId && leadQuotationsMap[leadId]) {
        setLeadQuotationsMap(prev => ({
          ...prev,
          [leadId]: (prev[leadId] || []).filter(qu => qu._id !== q._id)
        }))
      }
      // Refresh quotations in modal if open
      if (quotationsForLead.length > 0) {
        setQuotationsForLead(prev => prev.filter(qu => qu._id !== q._id))
      }
      // Refresh quotation counts
      await fetchLeads()
      setDeleteQuotationModal({ open: false, quotation: null })
      setNotify({ open: true, title: 'Deleted', message: 'Quotation deleted successfully.' })
    } catch (error) {
      setDeleteQuotationModal({ open: false, quotation: null })
      setNotify({ open: true, title: 'Delete Failed', message: error.response?.data?.message || 'We could not delete this quotation. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      draft: 'gray',
      submitted: 'blue',
      approved: 'green',
      rejected: 'red',
      converted: 'purple'
    }
    return colors[status] || 'gray'
  }

  const canCreateLead = () => {
    return currentUser?.roles?.some(role => ['supervisor', 'sales_engineer', 'estimation_engineer'].includes(role))
  }

  // Handler for View Quotations in table view (accordion)
  const handleViewQuotationsTable = async (lead) => {
    const leadId = lead._id
    const isExpanded = expandedQuotationRows[leadId]
    
    if (isExpanded) {
      // Collapse: remove from expanded rows
      setExpandedQuotationRows(prev => {
        const next = { ...prev }
        delete next[leadId]
        return next
      })
    } else {
      // Expand: fetch quotations if not already loaded
      if (!leadQuotationsMap[leadId]) {
        try {
          const qRes = await api.get('/api/quotations')
          const allQ = Array.isArray(qRes.data) ? qRes.data : []
          const list = allQ.filter(q => {
            const qLeadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
            return qLeadId === leadId
          })
          setLeadQuotationsMap(prev => ({ ...prev, [leadId]: list }))
          
          // Check which quotations have revisions with projects
          const projectChecks = {}
          for (const q of list) {
            try {
              const revRes = await api.get(`/api/revisions?parentQuotation=${q._id}`)
              const revisions = Array.isArray(revRes.data) ? revRes.data : []
              for (const rev of revisions) {
                try {
                  const projectRes = await api.get(`/api/projects/by-revision/${rev._id}`)
                  projectChecks[rev._id] = projectRes.data
                } catch {
                  // No project for this revision
                }
              }
            } catch {
              // No revisions for this quotation
            }
          }
          setRevisionProjectMap(prev => ({ ...prev, ...projectChecks }))
        } catch (e) {
          setNotify({ open: true, title: 'Load Failed', message: 'We could not load the quotations. Please try again.' })
          // Set empty array so accordion can show empty state
          setLeadQuotationsMap(prev => ({ ...prev, [leadId]: [] }))
        }
      }
      // Always set expanded state, even if fetch failed
      setExpandedQuotationRows(prev => ({ ...prev, [leadId]: true }))
    }
  }

  // Handler for View Revisions in table view (accordion)
  const handleViewRevisionsTable = async (q) => {
    const quotationId = q._id
    const isExpanded = expandedRevisionRows[quotationId]
    
    if (isExpanded) {
      // Collapse: remove from expanded rows
      setExpandedRevisionRows(prev => {
        const next = { ...prev }
        delete next[quotationId]
        return next
      })
    } else {
      // Expand: fetch revisions if not already loaded
      if (!quotationRevisionsMap[quotationId]) {
        try {
          const revRes = await api.get(`/api/revisions?parentQuotation=${quotationId}`)
          const revisions = Array.isArray(revRes.data) ? revRes.data : []
          setQuotationRevisionsMap(prev => ({ ...prev, [quotationId]: revisions }))
          
          // Check which revisions have projects
          const projectChecks = {}
          for (const rev of revisions) {
            try {
              const projectRes = await api.get(`/api/projects/by-revision/${rev._id}`)
              projectChecks[rev._id] = projectRes.data
            } catch {
              // No project for this revision
            }
          }
          setRevisionProjectMap(prev => ({ ...prev, ...projectChecks }))
        } catch (e) {
          setNotify({ open: true, title: 'Load Failed', message: 'We could not load the revisions. Please try again.' })
          return
        }
      }
      setExpandedRevisionRows(prev => ({ ...prev, [quotationId]: true }))
    }
  }

  const fetchRevisionProjectDetails = async (revisionId) => {
    try {
      const projectInfo = revisionProjectMap[revisionId]
      if (!projectInfo?._id) return null
      
      const res = await api.get(`/api/projects/${projectInfo._id}`)
      const project = res.data
      setRevisionProjectDetailsMap(prev => ({ ...prev, [revisionId]: project }))
      return project
    } catch {
      return null
    }
  }

  const handleViewProjectFromRevision = async (revision, isTable = false) => {
    if (isTable) {
      // Toggle accordion in table view
      const isExpanded = expandedProjectRows[revision._id]
      setExpandedProjectRows(prev => ({ ...prev, [revision._id]: !isExpanded }))
      
      // Fetch project details if not already loaded
      if (!isExpanded && !revisionProjectDetailsMap[revision._id]) {
        await fetchRevisionProjectDetails(revision._id)
      }
    } else {
      // Open modal in card view
      const project = await fetchRevisionProjectDetails(revision._id)
      if (project) {
        setProjectModal({ open: true, project })
      }
    }
  }

  // Handler for View Variations in table view (accordion)
  const handleViewVariationsTable = async (projectId) => {
    const isExpanded = expandedVariationRows[projectId]
    
    if (isExpanded) {
      // Collapse: remove from expanded rows
      setExpandedVariationRows(prev => {
        const next = { ...prev }
        delete next[projectId]
        return next
      })
    } else {
      // Expand: fetch variations if not already loaded
      if (!projectVariationsMap[projectId]) {
        try {
          const res = await api.get(`/api/project-variations?parentProject=${projectId}`)
          const list = Array.isArray(res.data) ? res.data : []
          setProjectVariationsMap(prev => ({ ...prev, [projectId]: list }))
        } catch (e) {
          setNotify({ open: true, title: 'Load Failed', message: 'We could not load the variations. Please try again.' })
          return
        }
      }
      setExpandedVariationRows(prev => ({ ...prev, [projectId]: true }))
    }
  }

  // Helper function to render lead actions (used in both card and table views)
  const renderLeadActions = (lead, isTableView = false) => (
    <div className="lead-actions">
      <button
        className="assign-btn"
        onClick={async () => {
          try {
            const res = await api.get(`/api/leads/${lead._id}`)
            const data = res.data
            const visitsRes = await api.get(`/api/leads/${lead._id}/site-visits`)
            const visits = visitsRes.data
            const detail = { ...data, siteVisits: visits }
            localStorage.setItem('leadDetail', JSON.stringify(detail))
            localStorage.setItem('leadId', lead._id)
            window.location.href = '/lead-detail'
          } catch (e) {
            setNotify({ open: true, title: 'Open Failed', message: 'We could not open the lead detail. Please try again.' })
          }
        }}
      >
        View
      </button>
      <button
        className="link-btn"
        onClick={async () => {
          if (isTableView) {
            // Table view: use accordion
            handleViewQuotationsTable(lead)
          } else {
            // Card view: use modal
            try {
              const qRes = await api.get('/api/quotations')
              const allQ = Array.isArray(qRes.data) ? qRes.data : []
              const list = allQ.filter(q => {
                const qLeadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
                return qLeadId === lead._id
              })
              if (list.length === 0) {
                setNotify({ open: true, title: 'No Quotations', message: 'No quotations found for this lead.' })
                return
              }
              setQuotationsForLead(list)
              setSelectedLeadForList(lead)
              setShowQuotationsListModal(true)
            } catch (e) {
              setNotify({ open: true, title: 'Open Failed', message: 'We could not load the quotations. Please try again.' })
            }
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
        </svg>
        View Quotations
        {isTableView && (
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="currentColor"
            className="accordion-chevron"
            style={{
              transform: expandedQuotationRows[lead._id] ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s ease',
              marginLeft: '4px'
            }}
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
          </svg>
        )}
      </button>
      {lead.status === 'approved' && (
        <button 
          onClick={() => convertToProject(lead._id)} 
          className="convert-btn"
          disabled={isSubmitting}
        >
          <ButtonLoader loading={loadingAction === `convert-${lead._id}`}>
            {isSubmitting && loadingAction === `convert-${lead._id}` ? 'Converting...' : 'Convert to Project'}
          </ButtonLoader>
        </button>
      )}
    </div>
  )

  // Approvals removed from lead module

  // Debounce name filter (300ms delay)
  useEffect(() => {
    setIsFiltering(true)
    const timer = setTimeout(() => {
      setDebouncedNameFilter(nameFilter)
      setIsFiltering(false)
    }, 300)
    return () => {
      clearTimeout(timer)
      setIsFiltering(false)
    }
  }, [nameFilter])

  // Date filters don't need debouncing (they're date inputs)
  useEffect(() => {
    setDebouncedDateModifiedFilter(dateModifiedFilter)
  }, [dateModifiedFilter])

  useEffect(() => {
    setDebouncedDateCreatedFilter(dateCreatedFilter)
  }, [dateCreatedFilter])

  // Calculate filtered leads count
  const filteredLeads = leads.filter(lead => {
    // Apply "My Leads" filter
    if (myOnly && lead.createdBy?._id !== currentUser?.id) return false
    
    // Apply search filter
    if (search.trim()) {
      const term = search.toLowerCase()
      const matches = (
        (lead.projectTitle || lead.name || '').toLowerCase().includes(term) ||
        (lead.customerName || '').toLowerCase().includes(term) ||
        (lead.enquiryNumber || '').toLowerCase().includes(term) ||
        (lead.scopeSummary || '').toLowerCase().includes(term)
      )
      if (!matches) return false
    }
    
    // Apply name filter (project title or customer name) - using debounced value
    if (debouncedNameFilter.trim()) {
      const term = debouncedNameFilter.toLowerCase()
      const projectTitle = (lead.projectTitle || lead.name || '').toLowerCase()
      const customerName = (lead.customerName || '').toLowerCase()
      if (!projectTitle.includes(term) && !customerName.includes(term)) return false
    }
    
    // Apply date modified filter - using debounced value
    if (debouncedDateModifiedFilter) {
      const filterDate = new Date(debouncedDateModifiedFilter)
      filterDate.setHours(0, 0, 0, 0)
      const leadDate = lead.updatedAt ? new Date(lead.updatedAt) : null
      if (!leadDate || leadDate.toDateString() !== filterDate.toDateString()) return false
    }
    
    // Apply date created filter - using debounced value
    if (debouncedDateCreatedFilter) {
      const filterDate = new Date(debouncedDateCreatedFilter)
      filterDate.setHours(0, 0, 0, 0)
      const leadDate = lead.createdAt ? new Date(lead.createdAt) : null
      if (!leadDate || leadDate.toDateString() !== filterDate.toDateString()) return false
    }
    
    return true
  })

  // Sort leads by selected field and direction
  const sortedLeads = [...filteredLeads].sort((a, b) => {
    let compareResult = 0
    
    switch (sortField) {
      case 'name':
        // Sort by project title, then customer name
        const aProjectTitle = (a.projectTitle || a.name || '').toLowerCase()
        const bProjectTitle = (b.projectTitle || b.name || '').toLowerCase()
        const projectTitleCompare = aProjectTitle.localeCompare(bProjectTitle)
        if (projectTitleCompare !== 0) {
          compareResult = projectTitleCompare
        } else {
          // If project titles are equal, sort by customer name
          const aCustomerName = (a.customerName || '').toLowerCase()
          const bCustomerName = (b.customerName || '').toLowerCase()
          compareResult = aCustomerName.localeCompare(bCustomerName)
        }
        break
      case 'dateModified':
        const aModified = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const bModified = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        compareResult = aModified > bModified ? 1 : aModified < bModified ? -1 : 0
        break
      case 'dateCreated':
      default:
        const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0
        compareResult = aCreated > bCreated ? 1 : aCreated < bCreated ? -1 : 0
        break
    }
    
    // Apply sort direction
    return sortDirection === 'asc' ? compareResult : -compareResult
  })

  const totalLeads = leads.length
  const displayedLeads = sortedLeads.length

  // Pagination calculations
  const totalPages = Math.ceil(sortedLeads.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedLeads = sortedLeads.slice(startIndex, endIndex)

  // Reset to page 1 when filters or sorting change
  useEffect(() => {
    setCurrentPage(1)
  }, [myOnly, search, debouncedNameFilter, debouncedDateModifiedFilter, debouncedDateCreatedFilter, sortField, sortDirection])

  return (
    <div className="lead-management">
      <div className="header" ref={headerRef}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1>Lead Management</h1>
          <span style={{ 
            padding: '4px 12px', 
            borderRadius: '12px', 
            background: 'var(--bg)', 
            color: 'var(--text-muted)', 
            fontSize: '14px', 
            fontWeight: 600,
            border: '1px solid var(--border)'
          }}>
            {(myOnly || search || debouncedNameFilter || debouncedDateModifiedFilter || debouncedDateCreatedFilter) ? `${displayedLeads} of ${totalLeads}` : totalLeads} {totalLeads === 1 ? 'Lead' : 'Leads'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="checkbox" checked={myOnly} onChange={() => setMyOnly(!myOnly)} />
            My Leads
          </label>
          <input 
            placeholder="Search..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: '14px',
              minWidth: '200px'
            }}
          />
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '8px', padding: '2px' }}>
            <button
              onClick={() => setViewMode('card')}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '6px',
                background: viewMode === 'card' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'card' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.2s ease'
              }}
            >
              Card
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '6px',
                background: viewMode === 'table' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'table' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.2s ease'
              }}
            >
              Table
            </button>
          </div>
          {canCreateLead() && (
            <button className="add-btn" onClick={() => setShowModal(true)}>
              Add New Lead
            </button>
          )}
        </div>
      </div>

      {/* Filters and Sorting Section - Sticky */}
      <div style={{ 
        position: 'sticky',
        top: `${headerHeight}px`,
        zIndex: 99,
        marginTop: '16px',
        marginBottom: '16px',
        padding: '16px', 
        background: 'var(--card)', 
        borderRadius: '8px', 
        border: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        alignSelf: 'flex-start',
        width: '100%'
      }}>
        {/* Mobile: Collapsible Header */}
        {isMobile && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Filters & Sorting</h3>
            <button
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: '14px',
                cursor: 'pointer'
              }}
              aria-expanded={filtersExpanded}
              aria-label={filtersExpanded ? 'Collapse filters' : 'Expand filters'}
            >
              {filtersExpanded ? '▼' : '▶'} {filtersExpanded ? 'Hide' : 'Show'} Filters
            </button>
          </div>
        )}
        
        {/* Filter Content - Hidden on mobile when collapsed */}
        {(!isMobile || filtersExpanded) && (
          <>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', position: 'relative' }}>
              {isFiltering && (
                <div style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  background: 'var(--card)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  zIndex: 1
                }}>
                  <span>Filtering...</span>
                </div>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 500 }}>
                Filter by Name:
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <input 
                    type="text"
                    placeholder="Project title or customer name..."
                    value={nameFilter} 
                    onChange={e => setNameFilter(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontSize: '14px',
                      minWidth: isMobile ? '100%' : '200px',
                      width: isMobile ? '100%' : 'auto'
                    }}
                    aria-label="Filter by project title or customer name"
                  />
                </div>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 500 }}>
                Filter by Date Modified:
                <input 
                  type="date"
                  value={dateModifiedFilter} 
                  onChange={e => setDateModifiedFilter(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    minWidth: isMobile ? '100%' : '160px',
                    width: isMobile ? '100%' : 'auto'
                  }}
                  aria-label="Filter by date modified"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 500 }}>
                Filter by Date Created:
                <input 
                  type="date"
                  value={dateCreatedFilter} 
                  onChange={e => setDateCreatedFilter(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    minWidth: isMobile ? '100%' : '160px',
                    width: isMobile ? '100%' : 'auto'
                  }}
                  aria-label="Filter by date created"
                />
              </label>
              {(nameFilter || dateModifiedFilter || dateCreatedFilter) && (
                <button
                  onClick={() => {
                    setNameFilter('')
                    setDateModifiedFilter('')
                    setDateCreatedFilter('')
                  }}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    marginTop: isMobile ? '8px' : '20px',
                    alignSelf: isMobile ? 'stretch' : 'flex-end',
                    width: isMobile ? '100%' : 'auto'
                  }}
                  aria-label="Clear all filters"
                >
                  Clear Filters
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
                Sort by:
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    minWidth: isMobile ? '100%' : '150px',
                    width: isMobile ? '100%' : 'auto',
                    flex: isMobile ? '1' : '0 0 auto'
                  }}
                  aria-label="Sort by field"
                >
                  <option value="name">Name</option>
                  <option value="dateModified">Date Modified</option>
                  <option value="dateCreated">Date Created</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
                Order:
                <select
                  value={sortDirection}
                  onChange={(e) => setSortDirection(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    minWidth: isMobile ? '100%' : '120px',
                    width: isMobile ? '100%' : 'auto',
                    flex: isMobile ? '1' : '0 0 auto'
                  }}
                  aria-label="Sort order"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </label>
            </div>
          </>
        )}
      </div>

      {isLoading ? (
        viewMode === 'card' ? (
          <div className="leads-grid">
            {Array.from({ length: itemsPerPage }).map((_, idx) => (
              <SkeletonCard key={idx} />
            ))}
          </div>
        ) : (
          <div className="table" style={{ marginTop: '24px' }}>
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Project Title</th>
                  <th>Enquiry #</th>
                  <th>Status</th>
                  <th>Quotations</th>
                  <th>Created By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: itemsPerPage }).map((_, idx) => (
                  <SkeletonTableRow key={idx} columns={7} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : viewMode === 'card' ? (
        <div className="leads-grid">
          {paginatedLeads.map(lead => (
          <div key={lead._id} className="lead-card">
            <div className="lead-header">
              <h3>{lead.projectTitle || lead.name}</h3>
              <span className={`status-badge ${getStatusColor(lead.status)}`}>
                {lead.status}
              </span>
            </div>
            
            <div className="lead-details">
              {(lead.customerName || lead.projectTitle) && (
                <>
                  <p><strong>Customer:</strong> {lead.customerName}</p>
                  <p><strong>Project Title:</strong> {lead.projectTitle}</p>
                  <p><strong>Enquiry #:</strong> {lead.enquiryNumber}</p>
                  <p><strong>Enquiry Date:</strong> {lead.enquiryDate ? new Date(lead.enquiryDate).toLocaleDateString() : 'N/A'}</p>
                  <p><strong>Scope:</strong> {lead.scopeSummary}</p>
                  <p><strong>Submission Due:</strong> {lead.submissionDueDate ? new Date(lead.submissionDueDate).toLocaleDateString() : 'N/A'}</p>
                </>
              )}
              {/* Removed legacy fields in UI */}
              <p><strong>Quotations:</strong> {quotationCounts[lead._id] || 0}</p>
              <p><strong>Created by:</strong> {lead.createdBy?._id === currentUser?.id ? 'You' : lead.createdBy?.name}</p>
              {lead.createdBy?._id !== currentUser?.id && (
              <button className="link-btn" onClick={() => setProfileUser(lead.createdBy)}>
                  View Profile
                </button>
              )}
            </div>

            {/* Lead approvals removed; use Quotation approvals instead */}

            {renderLeadActions(lead)}
            {/* Highlight own leads */}
            {lead.createdBy?._id === currentUser?.id && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--accent-color)' }}>
                Your lead
              </div>
            )}

          </div>
        ))}
        </div>
      ) : (
        <div className="table" style={{ marginTop: '24px' }}>
          <table>
            <thead>
                <th>Project Title</th>
                <th>Customer</th>
                <th>Enquiry Date</th>
                <th>Created By</th>
                <th>Actions</th>
            </thead>
            <tbody>
              {paginatedLeads.map(lead => (
                  <>
                    <tr key={lead._id}>
                      <td data-label="Project Title">{lead.projectTitle || lead.name || 'N/A'}</td>
                      <td data-label="Customer">{lead.customerName || 'N/A'}</td>
                      <td data-label="Enquiry Date">{lead.enquiryDate ? new Date(lead.enquiryDate).toLocaleDateString() : 'N/A'}</td>
                      <td data-label="Created By">
                        {lead.createdBy?._id === currentUser?.id ? 'You' : (lead.createdBy?.name || 'N/A')}
                        {lead.createdBy?._id !== currentUser?.id && lead.createdBy && (
                          <button className="link-btn" onClick={() => setProfileUser(lead.createdBy)} style={{ marginLeft: '6px' }}>
                            View Profile
                          </button>
                        )}
                      </td>
                      <td data-label="Actions">
                        {renderLeadActions(lead, true)}

                      </td>
                    </tr>
                    {expandedQuotationRows[lead._id] && (
                      <tr key={`${lead._id}-quotations`} className="history-row accordion-row" style={{ display: 'table-row', height: 'auto' }}>
                        <td colSpan={9} style={{ padding: '0', display: 'table-cell', height: 'auto', verticalAlign: 'top' }}>
                          <div className="history-panel accordion-content" style={{ height: 'auto', overflow: 'visible' }}>
                            <h4 style={{ marginTop: '0', marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>Quotations ({(leadQuotationsMap[lead._id] || []).length})</h4>
                            {(leadQuotationsMap[lead._id] || []).length === 0 ? (
                              <p style={{ margin: 0, color: 'var(--text-muted)' }}>No quotations found for this lead.</p>
                            ) : (
                              <div className="table">
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Project Title</th>
                                      <th>Offer Date</th>
                                      <th>Grand Total</th>
                                      <th>Status</th>
                                      <th>Created By</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(leadQuotationsMap[lead._id] || []).map((q) => (
                                      <>
                                        <tr key={q._id}>
                                          <td data-label="Project Title">{q.projectTitle || q.lead?.projectTitle || 'N/A'}</td>
                                          <td data-label="Offer Date">{q.offerDate ? new Date(q.offerDate).toLocaleDateString() : 'N/A'}</td>
                                          <td data-label="Grand Total">{(q.priceSchedule?.currency || 'AED')} {Number(q.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                                          <td data-label="Status">{q.managementApproval?.status || 'pending'}</td>
                                          <td data-label="Created By">{q.createdBy?._id === currentUser?.id ? 'You' : (q.createdBy?.name || 'N/A')}</td>
                                          <td data-label="Actions">
                                            <button
                                              className="save-btn"
                                              onClick={() => {
                                                try {
                                                  localStorage.setItem('quotationId', q._id)
                                                  localStorage.setItem('quotationDetail', JSON.stringify(q))
                                                  localStorage.setItem('leadId', lead._id)
                                                } catch {}
                                                window.location.href = '/quotation-detail'
                                              }}
                                            >
                                              View
                                            </button>
                                            <button
                                              className="link-btn"
                                              onClick={() => handleViewRevisionsTable(q)}
                                            >
                                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                              </svg>
                                              View Revisions
                                            </button>
                                            {(q.managementApproval?.status !== 'approved' || currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin')) && (
                                              <button
                                                className="reject-btn"
                                                onClick={() => setDeleteQuotationModal({ open: true, quotation: q })}
                                              >
                                                Delete
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                        {expandedRevisionRows[q._id] && (
                                          <tr key={`${q._id}-revisions`} className="history-row accordion-row">
                                            <td colSpan={6} style={{ padding: '0' }}>
                                              <div className="history-panel accordion-content" style={{ padding: '16px' }}>
                                                <h4 style={{ marginTop: '0', marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>Revisions ({(quotationRevisionsMap[q._id] || []).length})</h4>
                                                {(quotationRevisionsMap[q._id] || []).length === 0 ? (
                                                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>No revisions found for this quotation.</p>
                                                ) : (
                                                  <div className="table">
                                                    <table>
                                                      <thead>
                                                        <tr>
                                                          <th>Revision #</th>
                                                          <th>Offer Ref</th>
                                                          <th>Offer Date</th>
                                                          <th>Grand Total</th>
                                                          <th>Status</th>
                                                          <th>Created By</th>
                                                          <th>Actions</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        {(quotationRevisionsMap[q._id] || []).map((r) => (
                                                          <>
                                                            <tr key={r._id}>
                                                              <td data-label="Revision #">
                                                                {r.parentQuotation?._id || r.parentQuotation ? (
                                                                  <button
                                                                    className="link-btn"
                                                                    onClick={() => {
                                                                      try {
                                                                        const parentId = typeof r.parentQuotation === 'object' ? r.parentQuotation._id : r.parentQuotation;
                                                                        localStorage.setItem('quotationId', parentId);
                                                                        localStorage.setItem('quotationDetail', JSON.stringify(r.parentQuotation || {}));
                                                                      } catch {}
                                                                      window.location.href = '/quotation-detail';
                                                                    }}
                                                                    style={{
                                                                      fontSize: 'inherit',
                                                                      fontWeight: 600,
                                                                      padding: 0,
                                                                      textDecoration: 'underline'
                                                                    }}
                                                                  >
                                                                    {r.revisionNumber || 'N/A'}
                                                                  </button>
                                                                ) : (
                                                                  r.revisionNumber || 'N/A'
                                                                )}
                                                              </td>
                                                              <td data-label="Offer Ref">{r.offerReference || 'N/A'}</td>
                                                              <td data-label="Offer Date">{r.offerDate ? new Date(r.offerDate).toLocaleDateString() : 'N/A'}</td>
                                                              <td data-label="Grand Total">{(r.priceSchedule?.currency || 'AED')} {Number(r.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                                                              <td data-label="Status">{r.managementApproval?.status || 'pending'}</td>
                                                              <td data-label="Created By">{r.createdBy?._id === currentUser?.id ? 'You' : (r.createdBy?.name || 'N/A')}</td>
                                                              <td data-label="Actions">
                                                                <button
                                                                  className="save-btn"
                                                                  onClick={() => {
                                                                    try {
                                                                      localStorage.setItem('revisionId', r._id)
                                                                      localStorage.setItem('revisionDetail', JSON.stringify(r))
                                                                      const leadId = typeof r.lead === 'object' ? r.lead?._id : r.lead
                                                                      if (leadId) localStorage.setItem('leadId', leadId)
                                                                    } catch {}
                                                                    window.location.href = '/revision-detail'
                                                                  }}
                                                                >
                                                                  View
                                                                </button>
                                                                {revisionProjectMap[r._id] && (
                                                                  <button
                                                                    className="link-btn"
                                                                    onClick={() => handleViewProjectFromRevision(r, true)}
                                                                    style={{ marginLeft: '6px' }}
                                                                  >
                                                                    View Project
                                                                  </button>
                                                                )}
                                                              </td>
                                                            </tr>
                                                            {expandedProjectRows[r._id] && revisionProjectDetailsMap[r._id] && (
                                                              <tr className="accordion-row">
                                                                <td colSpan="7" style={{ padding: '0', borderTop: 'none' }}>
                                                                  <div className="accordion-content" style={{ padding: '20px', background: 'var(--bg)' }}>
                                                                    <h4 style={{ marginTop: 0, marginBottom: '16px' }}>Project Details</h4>
                                                                    <div className="ld-kv" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                                                                      <p><strong>Project Name:</strong> {revisionProjectDetailsMap[r._id].name || 'N/A'}</p>
                                                                      <p><strong>Status:</strong> {revisionProjectDetailsMap[r._id].status || 'N/A'}</p>
                                                                      <p><strong>Location:</strong> {revisionProjectDetailsMap[r._id].locationDetails || 'N/A'}</p>
                                                                      <p><strong>Working Hours:</strong> {revisionProjectDetailsMap[r._id].workingHours || 'N/A'}</p>
                                                                      <p><strong>Manpower Count:</strong> {revisionProjectDetailsMap[r._id].manpowerCount || 'N/A'}</p>
                                                                      <p><strong>Budget:</strong> {revisionProjectDetailsMap[r._id].budget ? `${revisionProjectDetailsMap[r._id].budget}` : 'N/A'}</p>
                                                                      <p><strong>Site Engineer:</strong> {revisionProjectDetailsMap[r._id].assignedSiteEngineer?.name || 'Not Assigned'}</p>
                                                                      <p><strong>Project Engineer:</strong> {revisionProjectDetailsMap[r._id].assignedProjectEngineer?.name || 'Not Assigned'}</p>
                                                                      <p><strong>Created At:</strong> {revisionProjectDetailsMap[r._id].createdAt ? new Date(revisionProjectDetailsMap[r._id].createdAt).toLocaleString() : 'N/A'}</p>
                                                                      <p><strong>Created By:</strong> {revisionProjectDetailsMap[r._id].createdBy?.name || 'N/A'}</p>
                                                                    </div>
                                                                    <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                                                                      <button className="assign-btn" onClick={() => {
                                                                        try {
                                                                          localStorage.setItem('projectsFocusId', revisionProjectDetailsMap[r._id]._id)
                                                                          localStorage.setItem('projectId', revisionProjectDetailsMap[r._id]._id)
                                                                        } catch {}
                                                                        window.location.href = '/project-detail'
                                                                      }}>
                                                                        View Full Project Details
                                                                      </button>
                                                                      <button
                                                                        className="link-btn"
                                                                        onClick={() => handleViewVariationsTable(revisionProjectDetailsMap[r._id]._id)}
                                                                      >
                                                                        View Variations
                                                                      </button>
                                                                    </div>
                                                                  </div>
                                                                </td>
                                                              </tr>
                                                            )}
                                                            {revisionProjectDetailsMap[r._id] && expandedVariationRows[revisionProjectDetailsMap[r._id]._id] && (
                                                              <tr key={`${r._id}-variations`} className="accordion-row">
                                                                <td colSpan={7} style={{ padding: '0', borderTop: 'none' }}>
                                                                  <div className="accordion-content" style={{ padding: '16px', background: 'var(--bg)' }}>
                                                                    <h4 style={{ marginTop: '0', marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>Variations ({(projectVariationsMap[revisionProjectDetailsMap[r._id]._id] || []).length})</h4>
                                                                    {(projectVariationsMap[revisionProjectDetailsMap[r._id]._id] || []).length === 0 ? (
                                                                      <p style={{ margin: 0, color: 'var(--text-muted)' }}>No variations found for this project.</p>
                                                                    ) : (
                                                                      <div className="table">
                                                                        <table>
                                                                          <thead>
                                                                            <tr>
                                                                              <th>Variation #</th>
                                                                              <th>Offer Ref</th>
                                                                              <th>Status</th>
                                                                              <th>Grand Total</th>
                                                                              <th>Created By</th>
                                                                              <th>Created At</th>
                                                                              <th>Actions</th>
                                                                            </tr>
                                                                          </thead>
                                                                          <tbody>
                                                                            {(projectVariationsMap[revisionProjectDetailsMap[r._id]._id] || []).sort((a,b)=> (a.variationNumber||0)-(b.variationNumber||0)).map((v) => (
                                                                              <tr key={v._id}>
                                                                                <td data-label="Variation #">{v.variationNumber || 'N/A'}</td>
                                                                                <td data-label="Offer Ref">{v.offerReference || 'N/A'}</td>
                                                                                <td data-label="Status">
                                                                                  <span className={`status-badge ${v.managementApproval?.status === 'approved' ? 'approved' : v.managementApproval?.status === 'rejected' ? 'rejected' : 'blue'}`}>
                                                                                    {v.managementApproval?.status || 'draft'}
                                                                                  </span>
                                                                                </td>
                                                                                <td data-label="Grand Total">{(v.priceSchedule?.currency || 'AED')} {Number(v.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                                                                                <td data-label="Created By">
                                                                                  {v.createdBy?._id === currentUser?.id ? 'You' : (v.createdBy?.name || 'N/A')}
                                                                                  {v.createdBy?._id !== currentUser?.id && v.createdBy && (
                                                                                    <button className="link-btn" onClick={() => setProfileUser(v.createdBy)} style={{ marginLeft: 6 }}>View Profile</button>
                                                                                  )}
                                                                                </td>
                                                                                <td data-label="Created At">{v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'N/A'}</td>
                                                                                <td data-label="Actions">
                                                                                  <button
                                                                                    className="save-btn"
                                                                                    onClick={() => {
                                                                                      try {
                                                                                        localStorage.setItem('variationId', v._id)
                                                                                      } catch {}
                                                                                      window.location.href = '/variation-detail'
                                                                                    }}
                                                                                  >
                                                                                    View
                                                                                  </button>
                                                                                </td>
                                                                              </tr>
                                                                            ))}
                                                                          </tbody>
                                                                        </table>
                                                                      </div>
                                                                    )}
                                                                  </div>
                                                                </td>
                                                              </tr>
                                                            )}
                                                          </>
                                                        ))}
                                                      </tbody>
                                                    </table>
                                                  </div>
                                                )}
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {filteredLeads.length > 0 && (
        <div className="pagination-container" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginTop: '24px',
          padding: '16px',
          background: 'var(--card)',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              Items per page:
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value))
                  setCurrentPage(1)
                }}
                style={{
                  padding: '4px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                {viewMode === 'card' ? (
                  <>
                    <option value={6}>6</option>
                    <option value={9}>9</option>
                    <option value={12}>12</option>
                    <option value={15}>15</option>
                    <option value={18}>18</option>
                    <option value={21}>21</option>
                    <option value={24}>24</option>
                  </>
                ) : (
                  <>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </>
                )}
              </select>
            </label>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Showing {startIndex + 1} to {Math.min(endIndex, filteredLeads.length)} of {filteredLeads.length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                background: currentPage === 1 ? 'var(--bg)' : 'var(--card)',
                color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text)',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: currentPage === 1 ? 0.5 : 1
              }}
            >
              Previous
            </button>
            <div style={{ display: 'flex', gap: '4px' }}>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      background: currentPage === pageNum ? 'var(--primary)' : 'var(--card)',
                      color: currentPage === pageNum ? 'white' : 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: currentPage === pageNum ? 600 : 400
                    }}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                background: currentPage === totalPages ? 'var(--bg)' : 'var(--card)',
                color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text)',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: currentPage === totalPages ? 0.5 : 1
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => {
          setShowModal(false)
          setSelectedFiles([])
          setPreviewFiles([])
          setAttachmentsToRemove([])
        }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingLead ? 'Edit Lead' : 'Create New Lead'}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    let url = ''
                    if (editingLead) {
                      url = `/leads/edit/${editingLead._id}`
                    } else {
                      url = '/leads/create'
                    }
                    window.open(url, '_blank')
                  }}
                  className="link-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '14px',
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title="Open in New Tab"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  Open in New Tab
                </button>
                <button
                  type="button"
                  onClick={() => {
                    let url = ''
                    if (editingLead) {
                      url = `/leads/edit/${editingLead._id}`
                    } else {
                      url = '/leads/create'
                    }
                    window.location.href = url
                  }}
                  className="link-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '14px',
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title="Open Full Form"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                  </svg>
                  Open Full Form
                </button>
                <button onClick={() => {
                  setShowModal(false)
                  setSelectedFiles([])
                  setPreviewFiles([])
                  setAttachmentsToRemove([])
                }} className="close-btn">×</button>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="lead-form">
              {(currentUser?.roles?.includes('sales_engineer') || currentUser?.roles?.includes('estimation_engineer')) && (
                <>
                  <div className="form-group">
                    <label>Customer Name *</label>
                    <input
                      type="text"
                      value={formData.customerName}
                      onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Project Title *</label>
                    <input
                      type="text"
                      value={formData.projectTitle}
                      onChange={(e) => setFormData({...formData, projectTitle: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Enquiry Number *</label>
                    <input
                      type="text"
                      value={formData.enquiryNumber}
                      onChange={(e) => setFormData({...formData, enquiryNumber: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Enquiry Date *</label>
                    <input
                      type="date"
                      value={formData.enquiryDate}
                      onChange={(e) => setFormData({...formData, enquiryDate: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Scope Summary *</label>
                    <textarea
                      value={formData.scopeSummary}
                      onChange={(e) => setFormData({...formData, scopeSummary: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Submission Due Date *</label>
                    <input
                      type="date"
                      value={formData.submissionDueDate}
                      onChange={(e) => setFormData({...formData, submissionDueDate: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Attachments (Documents, Images & Videos)</label>
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,video/*"
                      onChange={handleFileChange}
                      className="file-input"
                    />
                    <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                      Accepted: Images (JPEG, PNG, GIF, WebP), Documents (PDF, DOC, DOCX, XLS, XLSX), Videos (MP4, MOV, AVI, WMV, WebM, etc.). Max 10MB per file.
                    </small>
                    
                    {/* Display existing attachments when editing */}
                    {editingLead && editingLead.attachments && editingLead.attachments.length > 0 && (
                      <div style={{ marginTop: '15px' }}>
                        <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>Existing Attachments:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                          {editingLead.attachments.map((attachment, index) => {
                            const isImage = attachment.mimetype && attachment.mimetype.startsWith('image/')
                            const isVideo = attachment.mimetype && attachment.mimetype.startsWith('video/')
                            const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
                            const fileUrl = attachment.path.startsWith('http') 
                              ? attachment.path 
                              : `${apiBase}${attachment.path}`
                            return (
                              <div key={index} style={{ 
                                position: 'relative', 
                                border: '1px solid #ddd', 
                                borderRadius: '4px', 
                                padding: '8px',
                                maxWidth: '150px'
                              }}>
                                {isImage ? (
                                  <img 
                                    src={fileUrl} 
                                    alt={attachment.originalName}
                                    style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                                    onError={(e) => {
                                      e.target.style.display = 'none'
                                      e.target.nextSibling.style.display = 'flex'
                                    }}
                                  />
                                ) : isVideo ? (
                                  <div style={{ position: 'relative', width: '100%', height: '100px' }}>
                                    <video 
                                      src={fileUrl}
                                      style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                                      controls={false}
                                      muted
                                    />
                                    <div style={{ 
                                      position: 'absolute',
                                      top: '50%',
                                      left: '50%',
                                      transform: 'translate(-50%, -50%)',
                                      width: '30px',
                                      height: '30px',
                                      borderRadius: '50%',
                                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      pointerEvents: 'none'
                                    }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                                        <path d="M8 5v14l11-7z"/>
                                      </svg>
                                    </div>
                                  </div>
                                ) : null}
                                <div style={{ 
                                  width: '100%', 
                                  height: '100px', 
                                  display: (isImage || isVideo) ? 'none' : 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  backgroundColor: '#f5f5f5',
                                  borderRadius: '4px'
                                }}>
                                  <span style={{ fontSize: '12px', textAlign: 'center' }}>{attachment.originalName}</span>
                                </div>
                                <div style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
                                  {attachment.originalName.length > 15 ? attachment.originalName.substring(0, 15) + '...' : attachment.originalName}
                                </div>
                                <div style={{ fontSize: '10px', color: '#999' }}>
                                  {formatFileSize(attachment.size)}
                                </div>
                                <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                                  <a 
                                    href={fileUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: '11px',
                                      color: '#007bff',
                                      textDecoration: 'none'
                                    }}
                                  >
                                    View
                                  </a>
                                  {!attachmentsToRemove.includes(index.toString()) && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAttachment(index)}
                                      style={{
                                        fontSize: '11px',
                                        color: '#dc3545',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 0,
                                        textDecoration: 'underline'
                                      }}
                                    >
                                      Remove
                                    </button>
                                  )}
                                  {attachmentsToRemove.includes(index.toString()) && (
                                    <span style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>
                                      Will be removed
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Display new files being uploaded */}
                    {previewFiles.length > 0 && (
                      <div style={{ marginTop: '15px' }}>
                        {editingLead && editingLead.attachments && editingLead.attachments.length > 0 && (
                          <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>New Attachments:</div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                          {previewFiles.map((item, index) => (
                            <div key={index} style={{ 
                              position: 'relative', 
                              border: '1px solid #ddd', 
                              borderRadius: '4px', 
                              padding: '8px',
                              maxWidth: '150px'
                            }}>
                              {item.preview ? (
                                <img 
                                  src={item.preview} 
                                  alt={item.file.name}
                                  style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                                />
                              ) : (
                                <div style={{ 
                                  width: '100%', 
                                  height: '100px', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  backgroundColor: '#f5f5f5',
                                  borderRadius: '4px'
                                }}>
                                  <span style={{ fontSize: '12px', textAlign: 'center' }}>{item.file.name}</span>
                                </div>
                              )}
                              <div style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
                                {item.file.name.length > 15 ? item.file.name.substring(0, 15) + '...' : item.file.name}
                              </div>
                              <div style={{ fontSize: '10px', color: '#999' }}>
                                {formatFileSize(item.file.size)}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile(index)}
                                style={{
                                  position: 'absolute',
                                  top: '5px',
                                  right: '5px',
                                  background: 'rgba(255, 0, 0, 0.7)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '50%',
                                  width: '20px',
                                  height: '20px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
              {/* Removed legacy input fields from modal as requested */}
              
              <div className="form-actions">
                <button type="button" onClick={() => {
                  setShowModal(false)
                  setSelectedFiles([])
                  setPreviewFiles([])
                  setAttachmentsToRemove([])
                }} className="cancel-btn">
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="save-btn"
                  disabled={isSubmitting}
                >
                  <ButtonLoader loading={loadingAction === 'create-lead' || loadingAction === 'update-lead'}>
                    {isSubmitting ? (editingLead ? 'Saving...' : 'Creating...') : (editingLead ? 'Save Changes' : 'Create Lead')}
                  </ButtonLoader>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showVisitModal && editingLead && (
        <div className="modal-overlay" onClick={() => setShowVisitModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Site Visit</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (editingLead && editingLead._id) {
                      window.open(`/leads/${editingLead._id}/site-visits/create`, '_blank')
                    }
                  }}
                  className="link-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '14px',
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title="Open in New Tab"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  Open in New Tab
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editingLead && editingLead._id) {
                      window.location.href = `/leads/${editingLead._id}/site-visits/create`
                    }
                  }}
                  className="link-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '14px',
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title="Open Full Form"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                  </svg>
                  Open Full Form
                </button>
                <button onClick={() => setShowVisitModal(false)} className="close-btn">×</button>
              </div>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault()
              if (isSubmitting) return
              setLoadingAction('create-site-visit')
              setIsSubmitting(true)
              try {
                const formDataToSend = new FormData()
                
                // Append form fields
                Object.keys(visitData).forEach(key => {
                  formDataToSend.append(key, visitData[key])
                })
                
                // Append files
                visitFiles.forEach(file => {
                  formDataToSend.append('attachments', file)
                })

                await api.post(`/api/leads/${editingLead._id}/site-visits`, formDataToSend)
                setShowVisitModal(false)
                setVisitData({ visitAt: '', siteLocation: '', engineerName: '', workProgressSummary: '', safetyObservations: '', qualityMaterialCheck: '', issuesFound: '', actionItems: '', weatherConditions: '', description: '' })
                setVisitFiles([])
                setVisitPreviewFiles([])
                setNotify({ open: true, title: 'Saved', message: 'Site visit saved successfully.' })
                await fetchLeads()
              } catch (error) {
                setNotify({ open: true, title: 'Save Failed', message: error.response?.data?.message || 'We could not save the site visit. Please try again.' })
              } finally {
                setIsSubmitting(false)
                setLoadingAction(null)
              }
            }} className="lead-form">
              <div className="form-group">
                <label>Project Name</label>
                <input type="text" value={editingLead?.projectTitle || editingLead?.name || ''} readOnly />
              </div>
              <div className="form-group">
                <label>Date and Time of Visit *</label>
                <input type="datetime-local" value={visitData.visitAt} onChange={e => setVisitData({ ...visitData, visitAt: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Site Location *</label>
                <input type="text" value={visitData.siteLocation} onChange={e => setVisitData({ ...visitData, siteLocation: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Engineer / Inspector Name *</label>
                <input type="text" value={visitData.engineerName} onChange={e => setVisitData({ ...visitData, engineerName: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Work Progress Summary *</label>
                <textarea value={visitData.workProgressSummary} onChange={e => setVisitData({ ...visitData, workProgressSummary: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Safety Observations</label>
                <textarea value={visitData.safetyObservations} onChange={e => setVisitData({ ...visitData, safetyObservations: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Quality and Material Check</label>
                <textarea value={visitData.qualityMaterialCheck} onChange={e => setVisitData({ ...visitData, qualityMaterialCheck: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Issues / Non-Conformities Found</label>
                <textarea value={visitData.issuesFound} onChange={e => setVisitData({ ...visitData, issuesFound: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Action Items / Follow-up</label>
                <textarea value={visitData.actionItems} onChange={e => setVisitData({ ...visitData, actionItems: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Weather Conditions</label>
                <input type="text" value={visitData.weatherConditions} onChange={e => setVisitData({ ...visitData, weatherConditions: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Detailed Description / Remarks *</label>
                <textarea value={visitData.description} onChange={e => setVisitData({ ...visitData, description: e.target.value })} required />
              </div>

              <div className="form-group">
                <label>Attachments (Documents, Images & Videos)</label>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,video/*"
                  onChange={(e) => {
                    const files = Array.from(e.target.files)
                    setVisitFiles(prev => [...prev, ...files])
                    
                    files.forEach(file => {
                      if (file.type.startsWith('image/')) {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                          setVisitPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'image' }])
                        }
                        reader.readAsDataURL(file)
                      } else if (file.type.startsWith('video/')) {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                          setVisitPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'video' }])
                        }
                        reader.readAsDataURL(file)
                      } else {
                        setVisitPreviewFiles(prev => [...prev, { file, preview: null, type: 'document' }])
                      }
                    })
                  }}
                  className="file-input"
                />
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  Accepted: Images (JPEG, PNG, GIF, WebP), Documents (PDF, DOC, DOCX, XLS, XLSX), Videos (MP4, MOV, AVI, WMV, WebM, etc.). Max 10MB per file.
                </small>
                
                {/* Display new files being uploaded */}
                {visitPreviewFiles.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {visitPreviewFiles.map((item, index) => (
                        <div key={index} style={{ 
                          position: 'relative', 
                          border: '1px solid #ddd', 
                          borderRadius: '4px', 
                          padding: '8px',
                          maxWidth: '150px'
                        }}>
                          {item.type === 'image' && item.preview ? (
                            <img 
                              src={item.preview} 
                              alt={item.file.name}
                              style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                            />
                          ) : item.type === 'video' && item.preview ? (
                            <video 
                              src={item.preview}
                              style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                              controls={false}
                              muted
                            />
                          ) : (
                            <div style={{ 
                              width: '100%', 
                              height: '100px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              backgroundColor: '#f5f5f5',
                              borderRadius: '4px'
                            }}>
                              <span style={{ fontSize: '12px', textAlign: 'center' }}>{item.file.name}</span>
                            </div>
                          )}
                          <div style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
                            {item.file.name.length > 15 ? item.file.name.substring(0, 15) + '...' : item.file.name}
                          </div>
                          <div style={{ fontSize: '10px', color: '#999' }}>
                            {formatFileSize(item.file.size)}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setVisitFiles(prev => prev.filter((_, i) => i !== index))
                              setVisitPreviewFiles(prev => prev.filter((_, i) => i !== index))
                            }}
                            style={{
                              position: 'absolute',
                              top: '5px',
                              right: '5px',
                              background: 'rgba(255, 0, 0, 0.7)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '50%',
                              width: '20px',
                              height: '20px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowVisitModal(false)
                    setVisitFiles([])
                    setVisitPreviewFiles([])
                  }} 
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button type="submit" className="save-btn" disabled={isSubmitting}>
                  <ButtonLoader loading={loadingAction === 'create-site-visit'}>
                    {isSubmitting ? 'Saving...' : 'Save Visit'}
                  </ButtonLoader>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {profileUser && (
        <div className="modal-overlay profile" onClick={() => setProfileUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>User Profile</h2>
              <button onClick={() => setProfileUser(null)} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div className="form-group">
                <label>Name</label>
                <input type="text" value={profileUser?.name || ''} readOnly />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="text" value={profileUser?.email || ''} readOnly />
              </div>
            </div>
          </div>
        </div>
      )}

      {historyLead && (
        <div className="modal-overlay history" onClick={() => setHistoryLead(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit History</h2>
              <button onClick={() => setHistoryLead(null)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ maxHeight: '65vh', overflow: 'auto' }}>
              {historyLead.edits && historyLead.edits.length > 0 ? (
                historyLead.edits.slice().reverse().map((edit, idx) => (
                  <div key={idx} className="edit-item">
                    <div className="edit-header">
                      <span>By {edit.editedBy?._id === currentUser?.id ? 'You' : edit.editedBy?.name}</span>
                      <span>{new Date(edit.editedAt).toLocaleString()}</span>
                      {edit.editedBy?._id !== currentUser?.id && (
                        <button className="link-btn" onClick={() => setProfileUser(edit.editedBy)}>View Profile</button>
                      )}
                    </div>
                    <ul className="changes-list">
                      {edit.changes.map((c, i) => (
                        <li key={i}><strong>{c.field}:</strong> {String(c.from || '')} → {String(c.to || '')}</li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p>No edits recorded.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {notify.open && (
        <div className="modal-overlay" onClick={() => {
          if (notify.onOk) {
            notify.onOk()
          }
          setNotify({ open: false, title: '', message: '' })
        }} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001 }}>
            <div className="modal-header">
              <h2>{notify.title || 'Notice'}</h2>
              <button onClick={() => {
                if (notify.onOk) {
                  notify.onOk()
                }
                setNotify({ open: false, title: '', message: '' })
              }} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>{notify.message}</p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => {
                  if (notify.onOk) {
                    notify.onOk()
                  }
                  setNotify({ open: false, title: '', message: '' })
                }}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteLeadModal.open && deleteLeadModal.leadId && (
        <div className="modal-overlay" onClick={() => !isSubmitting && setDeleteLeadModal({ open: false, leadId: null })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001 }}>
            <div className="modal-header">
              <h2>Delete Lead</h2>
              <button 
                onClick={() => !isSubmitting && setDeleteLeadModal({ open: false, leadId: null })} 
                className="close-btn"
                disabled={isSubmitting && loadingAction === `delete-${deleteLeadModal.leadId}`}
              >
                ×
              </button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to delete this lead? This action cannot be undone.</p>
              <div className="form-actions">
                <button 
                  type="button" 
                  className="cancel-btn" 
                  onClick={() => setDeleteLeadModal({ open: false, leadId: null })}
                  disabled={isSubmitting && loadingAction === `delete-${deleteLeadModal.leadId}`}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="reject-btn" 
                  onClick={() => handleDeleteLead(deleteLeadModal.leadId)}
                  disabled={isSubmitting && loadingAction === `delete-${deleteLeadModal.leadId}`}
                >
                  <ButtonLoader loading={loadingAction === `delete-${deleteLeadModal.leadId}`}>
                    {isSubmitting && loadingAction === `delete-${deleteLeadModal.leadId}` ? 'Deleting...' : 'Delete'}
                  </ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteQuotationModal.open && deleteQuotationModal.quotation && (
        <div className="modal-overlay" onClick={() => setDeleteQuotationModal({ open: false, quotation: null })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001 }}>
            <div className="modal-header">
              <h2>Delete Quotation</h2>
              <button onClick={() => setDeleteQuotationModal({ open: false, quotation: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to delete this quotation? This action cannot be undone.</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setDeleteQuotationModal({ open: false, quotation: null })}>Cancel</button>
                <button 
                  type="button" 
                  className="reject-btn" 
                  onClick={() => handleDeleteQuotation(deleteQuotationModal.quotation)}
                  disabled={isSubmitting && loadingAction === `delete-quotation-${deleteQuotationModal.quotation._id}`}
                >
                  <ButtonLoader loading={loadingAction === `delete-quotation-${deleteQuotationModal.quotation._id}`}>
                    {isSubmitting && loadingAction === `delete-quotation-${deleteQuotationModal.quotation._id}` ? 'Deleting...' : 'Delete'}
                  </ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showQuotationsListModal && selectedLeadForList && (
        <div className="modal-overlay" onClick={() => {
          setShowQuotationsListModal(false)
          setSelectedLeadForList(null)
          setQuotationsForLead([])
        }} style={{ zIndex: 9998 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '90%', zIndex: 9999 }}>
            <div className="modal-header">
              <h2>Quotations for {selectedLeadForList.projectTitle || selectedLeadForList.name || 'Lead'}</h2>
              <button onClick={() => {
                setShowQuotationsListModal(false)
                setSelectedLeadForList(null)
                setQuotationsForLead([])
              }} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ maxHeight: '70vh', overflow: 'auto' }}>
              {quotationsForLead.length === 0 ? (
                <p>No quotations found for this lead.</p>
              ) : (
                <div className="table">
                  <table>
                    <thead>
                      <tr>
                        <th>Offer Ref</th>
                        <th>Offer Date</th>
                        <th>Grand Total</th>
                        <th>Status</th>
                        <th>Created By</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotationsForLead.map((q) => (
                        <tr key={q._id}>
                          <td data-label="Offer Ref">{q.offerReference || 'N/A'}</td>
                          <td data-label="Offer Date">{q.offerDate ? new Date(q.offerDate).toLocaleDateString() : 'N/A'}</td>
                          <td data-label="Grand Total">{(q.priceSchedule?.currency || 'AED')} {Number(q.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                          <td data-label="Status">{q.managementApproval?.status || 'pending'}</td>
                          <td data-label="Created By">{q.createdBy?._id === currentUser?.id ? 'You' : (q.createdBy?.name || 'N/A')}</td>
                          <td data-label="Actions">
                            <button
                              className="save-btn"
                              onClick={() => {
                                try {
                                  localStorage.setItem('quotationId', q._id)
                                  localStorage.setItem('quotationDetail', JSON.stringify(q))
                                  localStorage.setItem('leadId', selectedLeadForList._id)
                                } catch {}
                                window.location.href = '/quotation-detail'
                              }}
                            >
                              View
                            </button>
                            <button
                              className="link-btn"
                              onClick={async () => {
                                try {
                                  const revRes = await api.get(`/api/revisions?parentQuotation=${q._id}`)
                                  const revisions = Array.isArray(revRes.data) ? revRes.data : []
                                  if (revisions.length === 0) {
                                    setNotify({ open: true, title: 'No Revisions', message: 'No revisions found for this quotation.' })
                                    return
                                  }
                                  setQuotationRevisionsMap(prev => ({ ...prev, [q._id]: revisions }))
                                  
                                  // Check which revisions have projects
                                  const projectChecks = {}
                                  for (const rev of revisions) {
                                    try {
                                      const projectRes = await api.get(`/api/projects/by-revision/${rev._id}`)
                                      projectChecks[rev._id] = projectRes.data
                                    } catch {
                                      // No project for this revision
                                    }
                                  }
                                  setRevisionProjectMap(prev => ({ ...prev, ...projectChecks }))
                                  setShowRevisionsModal({ open: true, quotation: q })
                                } catch (e) {
                                  setNotify({ open: true, title: 'Open Failed', message: 'We could not load the revisions. Please try again.' })
                                }
                              }}
                              style={{ marginLeft: '6px' }}
                            >
                              View Revisions
                            </button>
                            {(q.managementApproval?.status !== 'approved' || currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin')) && (
                              <button
                                className="reject-btn"
                                onClick={() => setDeleteQuotationModal({ open: true, quotation: q })}
                                style={{ marginLeft: '6px' }}
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showRevisionsModal.open && showRevisionsModal.quotation && (
        <div className="modal-overlay" onClick={() => {
          setShowRevisionsModal({ open: false, quotation: null })
        }} style={{ zIndex: 10002 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '90%', zIndex: 10003 }}>
            <div className="modal-header">
              <h2>Revisions for {showRevisionsModal.quotation.projectTitle || showRevisionsModal.quotation.offerReference || 'Quotation'}</h2>
              <button onClick={() => {
                setShowRevisionsModal({ open: false, quotation: null })
              }} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ maxHeight: '70vh', overflow: 'auto' }}>
              {(quotationRevisionsMap[showRevisionsModal.quotation._id] || []).length === 0 ? (
                <p>No revisions found for this quotation.</p>
              ) : (
                <div className="table">
                  <table>
                    <thead>
                      <tr>
                        <th>Revision #</th>
                        <th>Offer Ref</th>
                        <th>Offer Date</th>
                        <th>Grand Total</th>
                        <th>Status</th>
                        <th>Created By</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(quotationRevisionsMap[showRevisionsModal.quotation._id] || []).map((r) => (
                        <tr key={r._id}>
                          <td data-label="Revision #">{r.revisionNumber || 'N/A'}</td>
                          <td data-label="Offer Ref">{r.offerReference || 'N/A'}</td>
                          <td data-label="Offer Date">{r.offerDate ? new Date(r.offerDate).toLocaleDateString() : 'N/A'}</td>
                          <td data-label="Grand Total">{(r.priceSchedule?.currency || 'AED')} {Number(r.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                          <td data-label="Status">{r.managementApproval?.status || 'pending'}</td>
                          <td data-label="Created By">{r.createdBy?._id === currentUser?.id ? 'You' : (r.createdBy?.name || 'N/A')}</td>
                          <td data-label="Actions">
                            <button
                              className="save-btn"
                              onClick={() => {
                                try {
                                  localStorage.setItem('revisionId', r._id)
                                  localStorage.setItem('revisionDetail', JSON.stringify(r))
                                  const leadId = typeof r.lead === 'object' ? r.lead?._id : r.lead
                                  if (leadId) localStorage.setItem('leadId', leadId)
                                } catch {}
                                window.location.href = '/revision-detail'
                              }}
                            >
                              View
                            </button>
                            {revisionProjectMap[r._id] && (
                              <button
                                className="link-btn"
                                onClick={() => handleViewProjectFromRevision(r, false)}
                                style={{ marginLeft: '6px' }}
                              >
                                View Project
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {projectModal.open && projectModal.project && (
        <div className="modal-overlay" onClick={() => setProjectModal({ open: false, project: null })} style={{ zIndex: 10004 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%', zIndex: 10005 }}>
            <div className="modal-header">
              <h2>Project Details</h2>
              <button onClick={() => setProjectModal({ open: false, project: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ maxHeight: '70vh', overflow: 'auto' }}>
              <div className="ld-kv" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                <p><strong>Project Name:</strong> {projectModal.project.name || 'N/A'}</p>
                <p><strong>Status:</strong> {projectModal.project.status || 'N/A'}</p>
                <p><strong>Location:</strong> {projectModal.project.locationDetails || 'N/A'}</p>
                <p><strong>Working Hours:</strong> {projectModal.project.workingHours || 'N/A'}</p>
                <p><strong>Manpower Count:</strong> {projectModal.project.manpowerCount || 'N/A'}</p>
                <p><strong>Budget:</strong> {projectModal.project.budget ? `${projectModal.project.budget}` : 'N/A'}</p>
                <p><strong>Site Engineer:</strong> {projectModal.project.assignedSiteEngineer?.name || 'Not Assigned'}</p>
                <p><strong>Project Engineer:</strong> {projectModal.project.assignedProjectEngineer?.name || 'Not Assigned'}</p>
                <p><strong>Created At:</strong> {projectModal.project.createdAt ? new Date(projectModal.project.createdAt).toLocaleString() : 'N/A'}</p>
                <p><strong>Created By:</strong> {projectModal.project.createdBy?.name || 'N/A'}</p>
              </div>
              <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
                <button className="assign-btn" onClick={() => {
                  try {
                    localStorage.setItem('projectsFocusId', projectModal.project._id)
                    localStorage.setItem('projectId', projectModal.project._id)
                  } catch {}
                  window.location.href = '/project-detail'
                }}>
                  View Full Project Details
                </button>
                <button
                  className="link-btn"
                  onClick={async () => {
                    try {
                      const res = await api.get(`/api/project-variations?parentProject=${projectModal.project._id}`)
                      const list = Array.isArray(res.data) ? res.data : []
                      if (list.length === 0) {
                        setNotify({ open: true, title: 'No Variations', message: 'No variations found for this project.' })
                        return
                      }
                      setVariationsForProject(list)
                      setSelectedProjectForList(projectModal.project)
                      setShowVariationsListModal(true)
                    } catch (e) {
                      setNotify({ open: true, title: 'Open Failed', message: 'We could not load the variations. Please try again.' })
                    }
                  }}
                >
                  View Variations
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showVariationsListModal && selectedProjectForList && (
        <div className="modal-overlay" onClick={() => {
          setShowVariationsListModal(false)
          setSelectedProjectForList(null)
          setVariationsForProject([])
        }} style={{ zIndex: 10006 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', width: '900px', zIndex: 10007 }}>
            <div className="modal-header">
              <h2>Variations for {selectedProjectForList.name}</h2>
              <button onClick={() => {
                setShowVariationsListModal(false)
                setSelectedProjectForList(null)
                setVariationsForProject([])
              }} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ maxHeight: '70vh', overflow: 'auto' }}>
              {variationsForProject.length === 0 ? (
                <p>No variations found for this project.</p>
              ) : (
                <div className="table">
                  <table>
                    <thead>
                      <tr>
                        <th>Variation #</th>
                        <th>Offer Ref</th>
                        <th>Status</th>
                        <th>Grand Total</th>
                        <th>Created By</th>
                        <th>Created At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variationsForProject.sort((a,b)=> (a.variationNumber||0)-(b.variationNumber||0)).map((v) => (
                        <tr key={v._id}>
                          <td data-label="Variation #">{v.variationNumber || 'N/A'}</td>
                          <td data-label="Offer Ref">{v.offerReference || 'N/A'}</td>
                          <td data-label="Status">
                            <span className={`status-badge ${v.managementApproval?.status === 'approved' ? 'approved' : v.managementApproval?.status === 'rejected' ? 'rejected' : 'blue'}`}>
                              {v.managementApproval?.status || 'draft'}
                            </span>
                          </td>
                          <td data-label="Grand Total">{(v.priceSchedule?.currency || 'AED')} {Number(v.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                          <td data-label="Created By">
                            {v.createdBy?._id === currentUser?.id ? 'You' : (v.createdBy?.name || 'N/A')}
                            {v.createdBy?._id !== currentUser?.id && v.createdBy && (
                              <button className="link-btn" onClick={() => setProfileUser(v.createdBy)} style={{ marginLeft: 6 }}>View Profile</button>
                            )}
                          </td>
                          <td data-label="Created At">{v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'N/A'}</td>
                          <td data-label="Actions">
                            <button
                              className="save-btn"
                              onClick={() => {
                                try {
                                  localStorage.setItem('variationId', v._id)
                                } catch {}
                                window.location.href = '/variation-detail'
                              }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <CreateQuotationModal
        isOpen={showQuotationModal}
        onClose={() => {
          setShowQuotationModal(false)
          setSelectedLeadForQuotation(null)
        }}
        source="leads"
        onSave={async (payload, editing) => {
          try {
            if (editing) {
              await api.put(`/api/quotations/${editing._id}`, payload)
              setShowQuotationModal(false)
              setSelectedLeadForQuotation(null)
              setNotify({ open: true, title: 'Success', message: 'Quotation updated successfully.' })
            } else {
              await api.post('/api/quotations', payload)
              setShowQuotationModal(false)
              setSelectedLeadForQuotation(null)
              setNotify({ 
                open: true, 
                title: 'Success', 
                message: 'Quotation created successfully.',
                onOk: () => {
                  navigate('/quotations')
                }
              })
            }
          } catch (error) {
            setNotify({ open: true, title: 'Save Failed', message: error.response?.data?.message || 'We could not save this quotation. Please try again.' })
          }
        }}
        preSelectedLeadId={selectedLeadForQuotation}
        leads={leads}
      />

      {quotationEditBlockModal.open && (
        <div className="modal-overlay" onClick={() => setQuotationEditBlockModal({ open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cannot Edit Lead</h2>
              <button onClick={() => setQuotationEditBlockModal({ open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p style={{ marginBottom: '16px', color: 'var(--text)' }}>
                This lead cannot be edited because it has associated quotations. Leads with quotations are locked to maintain data integrity and ensure consistency with existing quotations.
              </p>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                If you need to make changes, please create a new lead or contact an administrator.
              </p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => setQuotationEditBlockModal({ open: false })}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LeadManagement