import { useEffect, useState } from 'react'
import './LeadManagement.css'
import './LeadDetail.css'
import { setTheme } from '../utils/theme'
import { apiFetch, api } from '../lib/api'
import { CreateQuotationModal } from './CreateQuotationModal'
import logo from '../assets/logo/app-logo.png'

function LeadDetail() {
  const [lead, setLead] = useState(null)
  const [quotations, setQuotations] = useState([])
  const [showQuotationModal, setShowQuotationModal] = useState(false)
  const [selectedLeadForQuotation, setSelectedLeadForQuotation] = useState(null)
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  const [showLeadHistory, setShowLeadHistory] = useState(false)
  const [editVisit, setEditVisit] = useState(null)
  const [visitEditData, setVisitEditData] = useState({
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
  const [visitHistoryOpen, setVisitHistoryOpen] = useState({})
  const [quotationHistoryOpen, setQuotationHistoryOpen] = useState({})
  const [profileUser, setProfileUser] = useState(null)
  const [editLeadOpen, setEditLeadOpen] = useState(false)
  const [quotationEditBlockModal, setQuotationEditBlockModal] = useState({ open: false })
  const [siteVisitEditBlockModal, setSiteVisitEditBlockModal] = useState({ open: false })
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark'
  })
  const [leadEditData, setLeadEditData] = useState({
    customerName: '',
    projectTitle: '',
    enquiryNumber: '',
    enquiryDate: '',
    scopeSummary: '',
    submissionDueDate: ''
  })
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewFiles, setPreviewFiles] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attachmentsToRemove, setAttachmentsToRemove] = useState([])
  const [newVisitOpen, setNewVisitOpen] = useState(false)
  const [newVisitData, setNewVisitData] = useState({
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
  const [newVisitFiles, setNewVisitFiles] = useState([])
  const [newVisitPreviewFiles, setNewVisitPreviewFiles] = useState([])
  const [editVisitFiles, setEditVisitFiles] = useState([])
  const [editVisitPreviewFiles, setEditVisitPreviewFiles] = useState([])
  const [editVisitAttachmentsToRemove, setEditVisitAttachmentsToRemove] = useState([])
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [deleteModal, setDeleteModal] = useState({ open: false })
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteSiteVisitModal, setDeleteSiteVisitModal] = useState({ open: false, visit: null })
  const [isDeletingSiteVisit, setIsDeletingSiteVisit] = useState(false)
  const [printPreviewModal, setPrintPreviewModal] = useState({ open: false, visit: null, pdfUrl: null })

  // Helpers for PDF export
  const ensurePdfMake = async () => {
    if (window.pdfMake) return
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/pdfmake.min.js'
      script.onload = resolve
      script.onerror = reject
      document.body.appendChild(script)
    })
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/vfs_fonts.js'
      script.onload = resolve
      script.onerror = reject
      document.body.appendChild(script)
    })
  }

  const toDataURL = async (url) => {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
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

  const fetchQuotationsForLead = async (leadId) => {
    try {
      const qRes = await apiFetch('/api/quotations')
      const allQ = await qRes.json()
      const list = Array.isArray(allQ)
        ? allQ.filter((q) => {
            const qLeadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
            return qLeadId === leadId
          })
        : []
      setQuotations(list)
    } catch {}
  }

  const handleQuotationSave = async (payload, editing) => {
    try {
      if (editing) {
        await api.put(`/api/quotations/${editing._id}`, payload)
        setNotify({ open: true, title: 'Success', message: 'Quotation updated successfully.' })
      } else {
        await api.post('/api/quotations', payload)
        setNotify({ open: true, title: 'Success', message: 'Quotation created successfully.' })
      }
      setShowQuotationModal(false)
      setSelectedLeadForQuotation(null)
      if (lead?._id) {
        await fetchQuotationsForLead(lead._id)
      }
    } catch (e) {
      setNotify({ open: true, title: 'Save Failed', message: e?.response?.data?.message || 'We could not save the quotation. Please try again.' })
    }
  }

  const handleVisitFileChange = (e, isEdit = false) => {
    const files = Array.from(e.target.files)
    if (isEdit) {
      setEditVisitFiles(prev => [...prev, ...files])
    } else {
      setNewVisitFiles(prev => [...prev, ...files])
    }
    
    // Create previews for images and videos
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          if (isEdit) {
            setEditVisitPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'image' }])
          } else {
            setNewVisitPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'image' }])
          }
        }
        reader.readAsDataURL(file)
      } else if (file.type.startsWith('video/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          if (isEdit) {
            setEditVisitPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'video' }])
          } else {
            setNewVisitPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'video' }])
          }
        }
        reader.readAsDataURL(file)
      } else {
        if (isEdit) {
          setEditVisitPreviewFiles(prev => [...prev, { file, preview: null, type: 'document' }])
        } else {
          setNewVisitPreviewFiles(prev => [...prev, { file, preview: null, type: 'document' }])
        }
      }
    })
  }

  const removeVisitFile = (index, isEdit = false) => {
    if (isEdit) {
      setEditVisitFiles(prev => prev.filter((_, i) => i !== index))
      setEditVisitPreviewFiles(prev => prev.filter((_, i) => i !== index))
    } else {
      setNewVisitFiles(prev => prev.filter((_, i) => i !== index))
      setNewVisitPreviewFiles(prev => prev.filter((_, i) => i !== index))
    }
  }

  const exportVisitPDF = async (visit) => {
    try {
      await ensurePdfMake()
      const logoDataUrl = await toDataURL(logo)
      const reportTitle = 'Site Visit Report'
      const filename = `${(lead.projectTitle || lead.name || 'Lead')}_Visit_${visit.visitAt ? new Date(visit.visitAt).toISOString().slice(0,10) : 'Date'}.pdf`

      const leadFields = [
        ['Customer', lead.customerName || 'N/A'],
        ['Project Title', lead.projectTitle || 'N/A'],
        ['Enquiry #', lead.enquiryNumber || 'N/A'],
        ['Enquiry Date', lead.enquiryDate ? new Date(lead.enquiryDate).toLocaleDateString() : 'N/A'],
        ['Submission Due', lead.submissionDueDate ? new Date(lead.submissionDueDate).toLocaleDateString() : 'N/A'],
        ['Scope Summary', lead.scopeSummary || 'N/A']
      ]

      const visitFields = [
        ['Date & Time', visit.visitAt ? new Date(visit.visitAt).toLocaleString() : 'N/A'],
        ['Engineer', visit.engineerName || 'N/A'],
        ['Added By', visit.createdBy?.name ? `${visit.createdBy.name}${visit.createdBy.email ? ' (' + visit.createdBy.email + ')' : ''}` : 'N/A'],
        ['Site Location', visit.siteLocation || 'N/A'],
        ['Work Progress', visit.workProgressSummary || 'N/A'],
        ['Safety Observations', visit.safetyObservations || 'N/A'],
        ['Quality & Material Check', visit.qualityMaterialCheck || 'N/A'],
        ['Issues / Non-Conformities', visit.issuesFound || 'N/A'],
        ['Action Items / Follow-up', visit.actionItems || 'N/A'],
        ['Weather Conditions', visit.weatherConditions || 'N/A'],
        ['Description / Remarks', visit.description || 'N/A']
      ]

      const professionalParagraphs = [
        { text: 'Executive Summary', style: 'h2', margin: [0, 16, 0, 8] },
        { text: `The site visit was conducted by ${visit.engineerName || 'the assigned engineer'} on ${visit.visitAt ? new Date(visit.visitAt).toLocaleString() : 'N/A'}. The overall progress is summarized below with key observations and recommended follow-up actions for maintaining momentum and quality across on‑site operations.`, margin: [0,0,0,8] },
        { text: 'Observations & Insights', style: 'h2', margin: [0, 12, 0, 8] },
        { text: `Work on site is progressing ${visit.workProgressSummary ? 'as follows: ' + visit.workProgressSummary : 'according to plan'}.
${visit.safetyObservations ? 'Safety: ' + visit.safetyObservations : 'Safety standards appear to be upheld with no critical deviations reported at the time of visit.'}
${visit.qualityMaterialCheck ? 'Quality & Materials: ' + visit.qualityMaterialCheck : 'Materials inspected met expected quality benchmarks; workmanship aligns with design intent.'}`, margin: [0,0,0,8] },
        { text: 'Risks & Recommendations', style: 'h2', margin: [0, 12, 0, 8] },
        { text: `${visit.issuesFound ? 'Issues identified: ' + visit.issuesFound : 'No material issues were identified that could impact schedule or quality.'}
${visit.actionItems ? 'Recommended follow‑up: ' + visit.actionItems : 'Continue with current plan, monitor progress and perform targeted spot checks on critical path items.'}`, margin: [0,0,0,0] }
      ]

      const docDefinition = {
        pageMargins: [40, 60, 40, 60],
        content: [
          {
            columns: [
              { image: logoDataUrl, width: 90 },
              [
                { text: 'Engineering Operations ERP', style: 'brand' },
                { text: reportTitle, style: 'h1' }
              ],
              { text: new Date().toLocaleDateString(), alignment: 'right', color: '#64748b' }
            ]
          },
          { text: '\n' },
          { text: 'Lead Details', style: 'h2', margin: [0, 8, 0, 6] },
          {
            table: {
              widths: ['30%', '70%'],
              body: [
                [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                ...leadFields.map(([k,v]) => [{ text: k, style: 'tdKey' }, { text: v, style: 'tdVal' }])
              ]
            },
            layout: 'lightHorizontalLines'
          },
          { text: 'Site Visit Details', style: 'h2', margin: [0, 14, 0, 6] },
          {
            table: {
              widths: ['30%', '70%'],
              body: [
                [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                ...visitFields.map(([k,v]) => [{ text: k, style: 'tdKey' }, { text: v, style: 'tdVal' }])
              ]
            },
            layout: 'lightHorizontalLines'
          },
          ...professionalParagraphs
        ],
        styles: {
          brand: { fontSize: 14, color: '#6366f1', bold: true, margin: [0, 0, 0, 2] },
          h1: { fontSize: 20, bold: true, margin: [0, 2, 0, 0] },
          h2: { fontSize: 14, bold: true, color: '#0f172a' },
          th: { bold: true, fillColor: '#f1f5f9' },
          tdKey: { color: '#64748b' },
          tdVal: { color: '#0f172a' }
        },
        defaultStyle: { fontSize: 10 }
      }

      window.pdfMake.createPdf(docDefinition).download(filename)
    } catch (e) {
      setNotify({ open: true, title: 'Export Failed', message: 'We could not generate the site visit PDF. Please try again.' })
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const storedUser = localStorage.getItem('user')
        if (storedUser) setCurrentUser(JSON.parse(storedUser))
        let storedLead = null
        const stored = localStorage.getItem('leadDetail')
        if (stored) {
          storedLead = JSON.parse(stored)
          setLead(storedLead)
        }
        let id = localStorage.getItem('leadId') || storedLead?._id
        if (id) {
          const leadRes = await apiFetch(`/api/leads/${id}`)
          const leadData = await leadRes.json()
          const visitsRes = await apiFetch(`/api/leads/${id}/site-visits`)
          const visitsData = await visitsRes.json()
          setLead({ ...leadData, siteVisits: visitsData })
          try {
            const qRes = await apiFetch('/api/quotations')
            const allQ = await qRes.json()
            const list = Array.isArray(allQ) ? allQ.filter(q => {
              const qLeadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
              return qLeadId === id
            }) : []
            setQuotations(list)
          } catch {}
        }
      } catch {}
    }
    load()
  }, [])

  useEffect(() => {
    setTheme(isDark)
  }, [isDark])

  if (!lead) return (
    <div className="lead-management" style={{ padding: 24 }}>
      <h2>Lead Details</h2>
      <p>Nothing to display.</p>
    </div>
  )

  return (
    <div className="lead-detail">
      <div className="ld-header">
        <div className="ld-title">
          <div className="title-row">
            <h1>{lead.projectTitle || lead.name}</h1>
          </div>
          <span className="ld-subtitle">Enquiry #{lead.enquiryNumber || 'N/A'}</span>
        </div>
        <div className="ld-sticky-actions">
          <span className={`status-pill ${lead.status}`}>{lead.status}</span>
          <button className="theme-toggle-dash" onClick={() => setIsDark(!isDark)}>
            {isDark ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd"/>
              </svg>
            )}
          </button>
          {currentUser?.roles?.includes('project_engineer') && (
            <button
              className="save-btn"
              onClick={() => setNewVisitOpen(true)}
            >
              New Site Visit
            </button>
          )}
          {currentUser?.roles?.includes('estimation_engineer') && (
            <button
              className="save-btn"
              onClick={() => {
                setSelectedLeadForQuotation(lead._id)
                setShowQuotationModal(true)
              }}
            >
              Create Quotation
            </button>
          )}
          {lead.status === 'draft' && (currentUser?.roles?.includes('sales_engineer') || currentUser?.roles?.includes('estimation_engineer') || currentUser?.id === lead.createdBy?._id) && (
            <button
              className="save-btn"
              onClick={() => {
                setLeadEditData({
                  customerName: lead.customerName || '',
                  projectTitle: lead.projectTitle || '',
                  enquiryNumber: lead.enquiryNumber || '',
                  enquiryDate: lead.enquiryDate ? lead.enquiryDate.substring(0,10) : '',
                  scopeSummary: lead.scopeSummary || '',
                  submissionDueDate: lead.submissionDueDate ? lead.submissionDueDate.substring(0,10) : ''
                })
                // Check if quotations exist for this lead
                if (quotations && quotations.length > 0) {
                  setQuotationEditBlockModal({ open: true })
                  return
                }
                // Reset file selections when opening edit modal
                setSelectedFiles([])
                setPreviewFiles([])
                setAttachmentsToRemove([])
                setEditLeadOpen(true)
              }}
            >
              Edit Lead
            </button>
          )}
          {lead.status === 'draft' && (currentUser?.id === lead.createdBy?._id || currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin')) && (
            <button
              className="cancel-btn"
              onClick={() => setDeleteModal({ open: true })}
            >
              Delete Lead
            </button>
          )}
          {lead.projectId && (
            <button className="link-btn" onClick={() => { try { localStorage.setItem('projectsFocusId', lead.projectId) } catch {}; window.location.href = '/projects' }}>View Project</button>
          )}
        </div>
      </div>

      <div className="ld-grid">
        <div className="ld-card ld-section">
          <h3>Lead Overview</h3>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Field">Customer</td>
                  <td data-label="Value">{lead.customerName || 'N/A'}</td>
                </tr>
                <tr>
                  <td data-label="Field">Project Title</td>
                  <td data-label="Value">{lead.projectTitle || 'N/A'}</td>
                </tr>
                <tr>
                  <td data-label="Field">Enquiry Date</td>
                  <td data-label="Value">{lead.enquiryDate ? new Date(lead.enquiryDate).toLocaleDateString() : 'N/A'}</td>
                </tr>
                <tr>
                  <td data-label="Field">Submission Due</td>
                  <td data-label="Value">{lead.submissionDueDate ? new Date(lead.submissionDueDate).toLocaleDateString() : 'N/A'}</td>
                </tr>
                <tr>
                  <td data-label="Field">Scope</td>
                  <td data-label="Value">{lead.scopeSummary || 'N/A'}</td>
                </tr>
                <tr>
                  <td data-label="Field">Quotations</td>
                  <td data-label="Value">{quotations.length || 0}</td>
                </tr>
                <tr>
                  <td data-label="Field">Created By</td>
                  <td data-label="Value">{lead.createdBy?.name || 'N/A'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Attachments Section */}
      {lead.attachments && lead.attachments.length > 0 && (
        <div className="ld-card ld-section">
          <h3>Attachments ({lead.attachments.length})</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
            gap: '20px',
            marginTop: '15px'
          }}>
            {lead.attachments.map((attachment, index) => {
              const isImage = attachment.mimetype && attachment.mimetype.startsWith('image/')
              const isVideo = attachment.mimetype && attachment.mimetype.startsWith('video/')
              const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
              const fileUrl = attachment.path.startsWith('http') 
                ? attachment.path 
                : `${apiBase}${attachment.path}`

              return (
                <div 
                  key={index} 
                  style={{ 
                    border: '1px solid #ddd', 
                    borderRadius: '8px', 
                    padding: '12px',
                    backgroundColor: '#fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    cursor: (isImage || isVideo) ? 'pointer' : 'default'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                  onClick={(isImage || isVideo) ? () => {
                    // Open image or video in new window/modal
                    const newWindow = window.open('', '_blank')
                    if (isImage) {
                      newWindow.document.write(`
                        <html>
                          <head>
                            <title>${attachment.originalName}</title>
                            <style>
                              body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
                              img { max-width: 100%; max-height: 90vh; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
                            </style>
                          </head>
                          <body>
                            <img src="${fileUrl}" alt="${attachment.originalName}" />
                          </body>
                        </html>
                      `)
                    } else if (isVideo) {
                      newWindow.document.write(`
                        <html>
                          <head>
                            <title>${attachment.originalName}</title>
                            <style>
                              body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #000; }
                              video { max-width: 100%; max-height: 90vh; border-radius: 8px; }
                            </style>
                          </head>
                          <body>
                            <video src="${fileUrl}" controls autoplay style="width: 100%; max-width: 1200px;"></video>
                          </body>
                        </html>
                      `)
                    }
                  } : undefined}
                >
                  {isImage ? (
                    <div style={{ position: 'relative', width: '100%', marginBottom: '10px' }}>
                      <img 
                        src={fileUrl} 
                        alt={attachment.originalName}
                        style={{ 
                          width: '100%', 
                          height: '150px', 
                          objectFit: 'cover', 
                          borderRadius: '4px',
                          border: '1px solid #eee'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none'
                          const fallback = e.target.nextSibling
                          if (fallback) fallback.style.display = 'flex'
                        }}
                      />
                      <div style={{ 
                        display: 'none',
                        width: '100%', 
                        height: '150px', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        backgroundColor: '#f5f5f5',
                        borderRadius: '4px',
                        border: '1px solid #eee'
                      }}>
                        <span style={{ fontSize: '12px', textAlign: 'center', color: '#666' }}>Image not available</span>
                      </div>
                    </div>
                  ) : isVideo ? (
                    <div style={{ position: 'relative', width: '100%', marginBottom: '10px' }}>
                      <video 
                        src={fileUrl}
                        style={{ 
                          width: '100%', 
                          height: '150px', 
                          objectFit: 'cover', 
                          borderRadius: '4px',
                          border: '1px solid #eee'
                        }}
                        controls={false}
                        muted
                        onError={(e) => {
                          e.target.style.display = 'none'
                          const fallback = e.target.nextSibling
                          if (fallback) fallback.style.display = 'flex'
                        }}
                      />
                      <div style={{ 
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none'
                      }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                      <div style={{ 
                        display: 'none',
                        width: '100%', 
                        height: '150px', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        backgroundColor: '#f5f5f5',
                        borderRadius: '4px',
                        border: '1px solid #eee'
                      }}>
                        <span style={{ fontSize: '12px', textAlign: 'center', color: '#666' }}>Video not available</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ 
                      width: '100%', 
                      height: '150px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '4px',
                      marginBottom: '10px',
                      border: '1px solid #eee'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#666', marginBottom: '8px' }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <div style={{ fontSize: '11px', color: '#666', wordBreak: 'break-word' }}>
                          {attachment.originalName.length > 20 
                            ? attachment.originalName.substring(0, 20) + '...' 
                            : attachment.originalName}
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ 
                      fontSize: '13px', 
                      fontWeight: '500', 
                      color: '#333',
                      marginBottom: '4px',
                      wordBreak: 'break-word'
                    }}>
                      {attachment.originalName.length > 25 
                        ? attachment.originalName.substring(0, 25) + '...' 
                        : attachment.originalName}
                    </div>
                    <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
                      {formatFileSize(attachment.size)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px' }}>
                      {attachment.uploadedAt ? new Date(attachment.uploadedAt).toLocaleDateString() : 'N/A'}
                    </div>
                    <a 
                      href={fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'inline-block',
                        padding: '6px 12px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
                    >
                      {isImage ? 'View Full Size' : isVideo ? 'Play Video' : 'Download'}
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lead edit history (toggle) */}
      {lead.edits?.length > 0 && (
        <div className="ld-card ld-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Edit History</h3>
            <button className="link-btn" onClick={() => setShowLeadHistory(!showLeadHistory)}>
              {showLeadHistory ? 'Hide History' : 'View History'}
            </button>
          </div>
          {showLeadHistory && (
            <div className="edits-list">
            {lead.edits.slice().reverse().map((edit, idx) => (
              <div key={idx} className="edit-item">
                <div className="edit-header">
                  <span>By {edit.editedBy?._id === currentUser?.id ? 'You' : (edit.editedBy?.name || 'N/A')}</span>
                  <span>{new Date(edit.editedAt).toLocaleString()}</span>
                  {edit.editedBy?._id !== currentUser?.id && edit.editedBy && (
                    <button className="link-btn" onClick={() => setProfileUser(edit.editedBy)}>View Profile</button>
                  )}
                </div>
                <ul className="changes-list">
                  {edit.changes.map((c, i) => (
                    <li key={i}><strong>{c.field}:</strong> {String(c.from || '')} → {String(c.to || '')}</li>
                  ))}
                </ul>
              </div>
            ))}
            </div>
          )}
        </div>
      )}

      {lead.siteVisits?.length > 0 && (
        <div className="ld-card ld-section">
          <h3>Site Visits ({lead.siteVisits.length})</h3>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Engineer</th>
                  <th>Location</th>
                  <th>Progress</th>
                  <th>Added By</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {lead.siteVisits.map((v) => (
                  <>
                    <tr key={v._id}>
                      <td data-label="Date & Time">{v.visitAt ? new Date(v.visitAt).toLocaleString() : 'N/A'}</td>
                      <td data-label="Engineer">{v.engineerName || 'N/A'}</td>
                      <td data-label="Location">{v.siteLocation || 'N/A'}</td>
                      <td data-label="Progress">{v.workProgressSummary || 'N/A'}</td>
                      <td data-label="Added By">
                        {v.createdBy?._id === currentUser?.id ? 'You' : (v.createdBy?.name || 'N/A')}
                        {v.createdBy?._id !== currentUser?.id && v.createdBy && (
                          <button className="link-btn" onClick={() => setProfileUser(v.createdBy)} style={{ marginLeft: 6 }}>View Profile</button>
                        )}
                      </td>
                      <td data-label="Description">{v.description || 'N/A'}</td>
                      <td data-label="Actions">
                        <div className="ld-actions">
                          <button className="assign-btn" onClick={async () => {
                            try {
                              localStorage.setItem('siteVisitDetail', JSON.stringify(v))
                              localStorage.setItem('siteVisitId', v._id)
                              localStorage.setItem('leadDetail', JSON.stringify(lead))
                              localStorage.setItem('leadId', lead._id)
                              window.location.href = '/site-visit-detail'
                            } catch (e) {
                              setNotify({ open: true, title: 'Open Failed', message: 'We could not open the site visit detail. Please try again.' })
                            }
                          }}>View</button>
                          {(currentUser?.roles?.includes('project_engineer') || currentUser?.roles?.includes('estimation_engineer')) && (
                            <button className="save-btn" onClick={() => {
                              // Check if quotations exist for this lead
                              if (quotations && quotations.length > 0) {
                                setSiteVisitEditBlockModal({ open: true })
                                return
                              }
                              setEditVisit(v)
                              setVisitEditData({
                                visitAt: v.visitAt ? new Date(v.visitAt).toISOString().slice(0,16) : '',
                                siteLocation: v.siteLocation || '',
                                engineerName: v.engineerName || '',
                                workProgressSummary: v.workProgressSummary || '',
                                safetyObservations: v.safetyObservations || '',
                                qualityMaterialCheck: v.qualityMaterialCheck || '',
                                issuesFound: v.issuesFound || '',
                                actionItems: v.actionItems || '',
                                weatherConditions: v.weatherConditions || '',
                                description: v.description || ''
                              })
                              setEditVisitFiles([])
                              setEditVisitPreviewFiles([])
                              setEditVisitAttachmentsToRemove([])
                            }}>Edit</button>
                          )}
                          {((currentUser?.roles?.includes('project_engineer') && v.createdBy?._id === currentUser?.id) || currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin')) && (
                            <button 
                              className="cancel-btn" 
                              onClick={() => setDeleteSiteVisitModal({ open: true, visit: v })}
                              disabled={isDeletingSiteVisit && deleteSiteVisitModal.visit?._id === v._id}
                              style={{ marginLeft: '6px' }}
                            >
                              {isDeletingSiteVisit && deleteSiteVisitModal.visit?._id === v._id ? 'Deleting...' : 'Delete'}
                            </button>
                          )}
                        <button className="save-btn" onClick={async () => {
                          try {
                            await ensurePdfMake()
                            const logoDataUrl = await toDataURL(logo)
                            const reportTitle = 'Site Visit Report'
                            
                            const leadFields = [
                              ['Customer', lead.customerName || 'N/A'],
                              ['Project Title', lead.projectTitle || 'N/A'],
                              ['Enquiry #', lead.enquiryNumber || 'N/A'],
                              ['Enquiry Date', lead.enquiryDate ? new Date(lead.enquiryDate).toLocaleDateString() : 'N/A'],
                              ['Submission Due', lead.submissionDueDate ? new Date(lead.submissionDueDate).toLocaleDateString() : 'N/A'],
                              ['Scope Summary', lead.scopeSummary || 'N/A']
                            ]

                            const visitFields = [
                              ['Date & Time', v.visitAt ? new Date(v.visitAt).toLocaleString() : 'N/A'],
                              ['Engineer', v.engineerName || 'N/A'],
                              ['Added By', v.createdBy?.name ? `${v.createdBy.name}${v.createdBy.email ? ' (' + v.createdBy.email + ')' : ''}` : 'N/A'],
                              ['Site Location', v.siteLocation || 'N/A'],
                              ['Work Progress', v.workProgressSummary || 'N/A'],
                              ['Safety Observations', v.safetyObservations || 'N/A'],
                              ['Quality & Material Check', v.qualityMaterialCheck || 'N/A'],
                              ['Issues / Non-Conformities', v.issuesFound || 'N/A'],
                              ['Action Items / Follow-up', v.actionItems || 'N/A'],
                              ['Weather Conditions', v.weatherConditions || 'N/A'],
                              ['Description / Remarks', v.description || 'N/A']
                            ]

                            const professionalParagraphs = [
                              { text: 'Executive Summary', style: 'h2', margin: [0, 16, 0, 8] },
                              { text: `The site visit was conducted by ${v.engineerName || 'the assigned engineer'} on ${v.visitAt ? new Date(v.visitAt).toLocaleString() : 'N/A'}. The overall progress is summarized below with key observations and recommended follow-up actions for maintaining momentum and quality across on‑site operations.`, margin: [0,0,0,8] },
                              { text: 'Observations & Insights', style: 'h2', margin: [0, 12, 0, 8] },
                              { text: `Work on site is progressing ${v.workProgressSummary ? 'as follows: ' + v.workProgressSummary : 'according to plan'}.
${v.safetyObservations ? 'Safety: ' + v.safetyObservations : 'Safety standards appear to be upheld with no critical deviations reported at the time of visit.'}
${v.qualityMaterialCheck ? 'Quality & Materials: ' + v.qualityMaterialCheck : 'Materials inspected met expected quality benchmarks; workmanship aligns with design intent.'}`, margin: [0,0,0,8] },
                              { text: 'Risks & Recommendations', style: 'h2', margin: [0, 12, 0, 8] },
                              { text: `${v.issuesFound ? 'Issues identified: ' + v.issuesFound : 'No material issues were identified that could impact schedule or quality.'}
${v.actionItems ? 'Recommended follow‑up: ' + v.actionItems : 'Continue with current plan, monitor progress and perform targeted spot checks on critical path items.'}`, margin: [0,0,0,0] }
                            ]

                            const docDefinition = {
                              pageMargins: [40, 60, 40, 60],
                              content: [
                                {
                                  columns: [
                                    { image: logoDataUrl, width: 90 },
                                    [
                                      { text: 'Engineering Operations ERP', style: 'brand' },
                                      { text: reportTitle, style: 'h1' }
                                    ],
                                    { text: new Date().toLocaleDateString(), alignment: 'right', color: '#64748b' }
                                  ]
                                },
                                { text: '\n' },
                                { text: 'Lead Details', style: 'h2', margin: [0, 8, 0, 6] },
                                {
                                  table: {
                                    widths: ['30%', '70%'],
                                    body: [
                                      [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                                      ...leadFields.map(([k,v]) => [{ text: k, style: 'tdKey' }, { text: v, style: 'tdVal' }])
                                    ]
                                  },
                                  layout: 'lightHorizontalLines'
                                },
                                { text: 'Site Visit Details', style: 'h2', margin: [0, 14, 0, 6] },
                                {
                                  table: {
                                    widths: ['30%', '70%'],
                                    body: [
                                      [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                                      ...visitFields.map(([k,v]) => [{ text: k, style: 'tdKey' }, { text: v, style: 'tdVal' }])
                                    ]
                                  },
                                  layout: 'lightHorizontalLines'
                                },
                                ...professionalParagraphs
                              ],
                              styles: {
                                brand: { fontSize: 14, color: '#6366f1', bold: true, margin: [0, 0, 0, 2] },
                                h1: { fontSize: 20, bold: true, margin: [0, 2, 0, 0] },
                                h2: { fontSize: 14, bold: true, color: '#0f172a' },
                                th: { bold: true, fillColor: '#f1f5f9' },
                                tdKey: { color: '#64748b' },
                                tdVal: { color: '#0f172a' }
                              },
                              defaultStyle: { fontSize: 10 }
                            }

                            const pdfDoc = window.pdfMake.createPdf(docDefinition)
                            pdfDoc.getDataUrl((dataUrl) => {
                              setPrintPreviewModal({ open: true, visit: v, pdfUrl: dataUrl })
                            })
                          } catch (e) {
                            setNotify({ open: true, title: 'Preview Failed', message: 'We could not generate the PDF preview. Please try again.' })
                          }
                        }}>Print Preview</button>
                        {v.edits?.length > 0 && (
                            <button className="link-btn" onClick={() => setVisitHistoryOpen(prev => ({ ...prev, [v._id]: !prev[v._id] }))}>
                              {visitHistoryOpen[v._id] ? 'Hide History' : 'View History'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {visitHistoryOpen[v._id] && v.edits?.length > 0 && (
                      <tr className="history-row">
                        <td colSpan={7}>
                          <div className="history-panel">
                            {v.edits.slice().reverse().map((e, j) => (
                              <div key={j} className="edit-item" style={{ marginTop: 8 }}>
                                <div className="edit-header">
                                  <span>By {e.editedBy?._id === currentUser?.id ? 'You' : (e.editedBy?.name || 'N/A')}</span>
                                  <span>{new Date(e.editedAt).toLocaleString()}</span>
                                  {e.editedBy?._id !== currentUser?.id && e.editedBy && (
                                    <button className="link-btn" onClick={() => setProfileUser(e.editedBy)}>View Profile</button>
                                  )}
                                </div>
                                <ul className="changes-list">
                                  {e.changes.map((c, k) => (
                                    <li key={k}><strong>{c.field}:</strong> {String(c.from || '')} → {String(c.to || '')}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    {v.attachments && v.attachments.length > 0 && (
                      <tr className="history-row">
                        <td colSpan={7}>
                          <div className="history-panel">
                            <h4 style={{ marginTop: 0, marginBottom: '15px' }}>Attachments ({v.attachments.length})</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                              {v.attachments.map((attachment, idx) => {
                                const isImage = attachment.mimetype && attachment.mimetype.startsWith('image/')
                                const isVideo = attachment.mimetype && attachment.mimetype.startsWith('video/')
                                const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
                                const fileUrl = attachment.path.startsWith('http') 
                                  ? attachment.path 
                                  : `${apiBase}${attachment.path}`
                                return (
                                  <div key={idx} style={{
                                    border: '1px solid #ddd',
                                    borderRadius: '8px',
                                    padding: '10px',
                                    width: '200px',
                                    backgroundColor: '#fff'
                                  }}>
                                    {isImage ? (
                                      <img 
                                        src={fileUrl} 
                                        alt={attachment.originalName}
                                        style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }}
                                        onError={(e) => {
                                          e.target.style.display = 'none'
                                        }}
                                      />
                                    ) : isVideo ? (
                                      <video 
                                        src={fileUrl}
                                        style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }}
                                        controls
                                      />
                                    ) : (
                                      <div style={{
                                        width: '100%',
                                        height: '150px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: '#f5f5f5',
                                        borderRadius: '4px',
                                        marginBottom: '8px'
                                      }}>
                                        <span style={{ fontSize: '14px' }}>📄 {attachment.originalName}</span>
                                      </div>
                                    )}
                                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px', wordBreak: 'break-word' }}>
                                      {attachment.originalName}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
                                      {formatFileSize(attachment.size)}
                                    </div>
                                    <a
                                      href={fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: 'inline-block',
                                        padding: '6px 12px',
                                        backgroundColor: '#007bff',
                                        color: 'white',
                                        textDecoration: 'none',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        fontWeight: '500',
                                        transition: 'background-color 0.2s'
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
                                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
                                    >
                                      {isImage ? 'View Full Size' : isVideo ? 'Play Video' : 'Download'}
                                    </a>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {Array.isArray(quotations) && quotations.length > 0 && (
        <div className="ld-card ld-section">
          <h3>Quotations ({quotations.length})</h3>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Offer Ref</th>
                  <th>Offer Date</th>
                  <th>Grand Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((q) => (
                  <>
                    <tr key={q._id}>
                      <td data-label="Offer Ref">{q.offerReference || 'N/A'}</td>
                      <td data-label="Offer Date">{q.offerDate ? new Date(q.offerDate).toLocaleDateString() : 'N/A'}</td>
                      <td data-label="Grand Total">{(q.priceSchedule?.currency || 'AED')} {Number(q.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                      <td data-label="Status">{q.managementApproval?.status || 'pending'}</td>
                      <td data-label="Actions">
                        <div className="ld-actions">
                          <button className="save-btn" onClick={() => {
                            try {
                              localStorage.setItem('quotationId', q._id)
                              localStorage.setItem('quotationDetail', JSON.stringify(q))
                              localStorage.setItem('leadId', lead._id)
                            } catch {}
                            window.location.href = '/quotation-detail'
                          }}>View Quotation</button>
                          {q.edits?.length > 0 && (
                            <button className="link-btn" onClick={() => setQuotationHistoryOpen(prev => ({ ...prev, [q._id]: !prev[q._id] }))}>
                              {quotationHistoryOpen[q._id] ? 'Hide History' : 'View History'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {quotationHistoryOpen[q._id] && q.edits?.length > 0 && (
                      <tr className="history-row">
                        <td colSpan={5}>
                          <div className="history-panel">
                            {q.edits.slice().reverse().map((e, j) => (
                              <div key={j} className="edit-item" style={{ marginTop: 8 }}>
                                <div className="edit-header">
                                  <span>By {e.editedBy?._id === currentUser?.id ? 'You' : (e.editedBy?.name || 'N/A')}</span>
                                  <span>{new Date(e.editedAt).toLocaleString()}</span>
                                </div>
                                <ul className="changes-list">
                                  {e.changes.map((c, k) => (
                                    <li key={k}><strong>{c.field}:</strong> {String(c.from || '')} → {String(c.to || '')}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {profileUser && (
        <div className="modal-overlay" onClick={() => setProfileUser(null)}>
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

      {editLeadOpen && (
        <div className="modal-overlay" onClick={() => {
          setEditLeadOpen(false)
          setSelectedFiles([])
          setPreviewFiles([])
          setAttachmentsToRemove([])
        }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Lead</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (lead && lead._id) {
                      window.open(`/leads/edit/${lead._id}`, '_blank')
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
                    if (lead && lead._id) {
                      window.location.href = `/leads/edit/${lead._id}`
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
                <button onClick={() => {
                  setEditLeadOpen(false)
                  setSelectedFiles([])
                  setPreviewFiles([])
                  setAttachmentsToRemove([])
                }} className="close-btn">×</button>
              </div>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (isSubmitting) return
                setIsSubmitting(true)
                try {
                  const formDataToSend = new FormData()
                  
                  // Append form fields
                  Object.keys(leadEditData).forEach(key => {
                    formDataToSend.append(key, leadEditData[key])
                  })
                  
                  // Append files
                  selectedFiles.forEach(file => {
                    formDataToSend.append('attachments', file)
                  })

                  // Append attachments to remove
                  if (attachmentsToRemove.length > 0) {
                    attachmentsToRemove.forEach(index => {
                      formDataToSend.append('removeAttachments', index)
                    })
                  }

                  const updated = await api.put(`/api/leads/${lead._id}`, formDataToSend)
                  setLead(prev => ({ ...prev, ...updated.data }))
                  setEditLeadOpen(false)
                  setSelectedFiles([])
                  setPreviewFiles([])
                  setAttachmentsToRemove([])
                  setNotify({ open: true, title: 'Success', message: 'Lead updated successfully.' })
                } catch (err) {
                  setNotify({ open: true, title: 'Update Failed', message: err.response?.data?.message || 'We could not update this lead. Please try again.' })
                } finally {
                  setIsSubmitting(false)
                }
              }}
              className="assign-form"
            >
              <div className="form-group">
                <label>Customer Name *</label>
                <input type="text" value={leadEditData.customerName} onChange={e => setLeadEditData({ ...leadEditData, customerName: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Project Title *</label>
                <input type="text" value={leadEditData.projectTitle} onChange={e => setLeadEditData({ ...leadEditData, projectTitle: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Enquiry Number *</label>
                <input type="text" value={leadEditData.enquiryNumber} onChange={e => setLeadEditData({ ...leadEditData, enquiryNumber: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Enquiry Date *</label>
                <input type="date" value={leadEditData.enquiryDate} onChange={e => setLeadEditData({ ...leadEditData, enquiryDate: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Scope Summary *</label>
                <textarea value={leadEditData.scopeSummary} onChange={e => setLeadEditData({ ...leadEditData, scopeSummary: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Submission Due Date *</label>
                <input type="date" value={leadEditData.submissionDueDate} onChange={e => setLeadEditData({ ...leadEditData, submissionDueDate: e.target.value })} required />
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
                {lead && lead.attachments && lead.attachments.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>Existing Attachments:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {lead.attachments.map((attachment, index) => {
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
                                  onClick={() => setAttachmentsToRemove(prev => [...prev, index.toString()])}
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
                    {lead && lead.attachments && lead.attachments.length > 0 && (
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

              <div className="form-actions">
                <button 
                  type="button" 
                  onClick={() => {
                    setEditLeadOpen(false)
                    setSelectedFiles([])
                    setPreviewFiles([])
                    setAttachmentsToRemove([])
                  }} 
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="save-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editVisit && (
        <div className="modal-overlay" onClick={() => {
          setEditVisit(null)
          setEditVisitFiles([])
          setEditVisitPreviewFiles([])
          setEditVisitAttachmentsToRemove([])
        }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Site Visit</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (lead && lead._id && editVisit && editVisit._id) {
                      window.open(`/leads/${lead._id}/site-visits/edit/${editVisit._id}`, '_blank')
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
                    if (lead && lead._id && editVisit && editVisit._id) {
                      window.location.href = `/leads/${lead._id}/site-visits/edit/${editVisit._id}`
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
                <button onClick={() => {
                  setEditVisit(null)
                  setEditVisitFiles([])
                  setEditVisitPreviewFiles([])
                  setEditVisitAttachmentsToRemove([])
                }} className="close-btn">×</button>
              </div>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  const formDataToSend = new FormData()
                  
                  // Append form fields
                  Object.keys(visitEditData).forEach(key => {
                    formDataToSend.append(key, visitEditData[key])
                  })
                  
                  // Append files
                  editVisitFiles.forEach(file => {
                    formDataToSend.append('attachments', file)
                  })

                  // Append attachments to remove
                  if (editVisitAttachmentsToRemove.length > 0) {
                    editVisitAttachmentsToRemove.forEach(index => {
                      formDataToSend.append('removeAttachments', index)
                    })
                  }

                  const updated = await api.put(`/api/leads/${lead._id}/site-visits/${editVisit._id}`, formDataToSend)
                  setLead(prev => ({
                    ...prev,
                    siteVisits: prev.siteVisits.map(v => v._id === updated.data._id ? updated.data : v)
                  }))
                  setEditVisit(null)
                  setEditVisitFiles([])
                  setEditVisitPreviewFiles([])
                  setEditVisitAttachmentsToRemove([])
                  setNotify({ open: true, title: 'Success', message: 'Site visit updated successfully.' })
                } catch (err) {
                  setNotify({ open: true, title: 'Update Failed', message: err.response?.data?.message || 'We could not update the site visit. Please try again.' })
                }
              }}
              className="assign-form"
            >
              <div className="form-group">
                <label>Date and Time of Visit *</label>
                <input type="datetime-local" value={visitEditData.visitAt} onChange={e => setVisitEditData({ ...visitEditData, visitAt: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Site Location *</label>
                <input type="text" value={visitEditData.siteLocation} onChange={e => setVisitEditData({ ...visitEditData, siteLocation: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Engineer / Inspector Name *</label>
                <input type="text" value={visitEditData.engineerName} onChange={e => setVisitEditData({ ...visitEditData, engineerName: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Work Progress Summary *</label>
                <textarea value={visitEditData.workProgressSummary} onChange={e => setVisitEditData({ ...visitEditData, workProgressSummary: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Safety Observations</label>
                <textarea value={visitEditData.safetyObservations} onChange={e => setVisitEditData({ ...visitEditData, safetyObservations: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Quality and Material Check</label>
                <textarea value={visitEditData.qualityMaterialCheck} onChange={e => setVisitEditData({ ...visitEditData, qualityMaterialCheck: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Issues / Non-Conformities Found</label>
                <textarea value={visitEditData.issuesFound} onChange={e => setVisitEditData({ ...visitEditData, issuesFound: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Action Items / Follow-up</label>
                <textarea value={visitEditData.actionItems} onChange={e => setVisitEditData({ ...visitEditData, actionItems: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Weather Conditions</label>
                <input type="text" value={visitEditData.weatherConditions} onChange={e => setVisitEditData({ ...visitEditData, weatherConditions: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Detailed Description / Remarks *</label>
                <textarea value={visitEditData.description} onChange={e => setVisitEditData({ ...visitEditData, description: e.target.value })} required />
              </div>

              <div className="form-group">
                <label>Attachments (Documents, Images & Videos)</label>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,video/*"
                  onChange={(e) => handleVisitFileChange(e, true)}
                  className="file-input"
                />
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  Accepted: Images (JPEG, PNG, GIF, WebP), Documents (PDF, DOC, DOCX, XLS, XLSX), Videos (MP4, MOV, AVI, WMV, WebM, etc.). Max 10MB per file.
                </small>
                
                {/* Display existing attachments when editing */}
                {editVisit && editVisit.attachments && editVisit.attachments.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>Existing Attachments:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {editVisit.attachments.map((attachment, index) => {
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
                              {!editVisitAttachmentsToRemove.includes(index.toString()) && (
                                <button
                                  type="button"
                                  onClick={() => setEditVisitAttachmentsToRemove(prev => [...prev, index.toString()])}
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
                              {editVisitAttachmentsToRemove.includes(index.toString()) && (
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
                {editVisitPreviewFiles.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    {editVisit && editVisit.attachments && editVisit.attachments.length > 0 && (
                      <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>New Attachments:</div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {editVisitPreviewFiles.map((item, index) => (
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
                            onClick={() => removeVisitFile(index, true)}
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
                    setEditVisit(null)
                    setEditVisitFiles([])
                    setEditVisitPreviewFiles([])
                    setEditVisitAttachmentsToRemove([])
                  }} 
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button type="submit" className="save-btn">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {newVisitOpen && (
        <div className="modal-overlay" onClick={() => {
          setNewVisitOpen(false)
          setNewVisitFiles([])
          setNewVisitPreviewFiles([])
        }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Site Visit</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (lead && lead._id) {
                      window.open(`/leads/${lead._id}/site-visits/create`, '_blank')
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
                    if (lead && lead._id) {
                      window.location.href = `/leads/${lead._id}/site-visits/create`
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
                <button onClick={() => {
                  setNewVisitOpen(false)
                  setNewVisitFiles([])
                  setNewVisitPreviewFiles([])
                }} className="close-btn">×</button>
              </div>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  const formDataToSend = new FormData()
                  
                  // Append form fields
                  Object.keys(newVisitData).forEach(key => {
                    formDataToSend.append(key, newVisitData[key])
                  })
                  
                  // Append files
                  newVisitFiles.forEach(file => {
                    formDataToSend.append('attachments', file)
                  })

                  const created = await api.post(`/api/leads/${lead._id}/site-visits`, formDataToSend)
                  
                  // Refresh visits list to include createdBy populated
                  const visitsRes = await apiFetch(`/api/leads/${lead._id}/site-visits`)
                  const visits = await visitsRes.json()
                  setLead(prev => ({ ...prev, siteVisits: visits }))
                  setNewVisitOpen(false)
                  setNewVisitData({ visitAt: '', siteLocation: '', engineerName: '', workProgressSummary: '', safetyObservations: '', qualityMaterialCheck: '', issuesFound: '', actionItems: '', weatherConditions: '', description: '' })
                  setNewVisitFiles([])
                  setNewVisitPreviewFiles([])
                  setNotify({ open: true, title: 'Success', message: 'Site visit created successfully.' })
                } catch (err) {
                  setNotify({ open: true, title: 'Create Failed', message: err.response?.data?.message || err.message || 'We could not create the site visit. Please try again.' })
                }
              }}
              className="assign-form"
            >
              <div className="form-group">
                <label>Date and Time of Visit *</label>
                <input type="datetime-local" value={newVisitData.visitAt} onChange={e => setNewVisitData({ ...newVisitData, visitAt: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Site Location *</label>
                <input type="text" value={newVisitData.siteLocation} onChange={e => setNewVisitData({ ...newVisitData, siteLocation: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Engineer / Inspector Name *</label>
                <input type="text" value={newVisitData.engineerName} onChange={e => setNewVisitData({ ...newVisitData, engineerName: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Work Progress Summary *</label>
                <textarea value={newVisitData.workProgressSummary} onChange={e => setNewVisitData({ ...newVisitData, workProgressSummary: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Safety Observations</label>
                <textarea value={newVisitData.safetyObservations} onChange={e => setNewVisitData({ ...newVisitData, safetyObservations: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Quality and Material Check</label>
                <textarea value={newVisitData.qualityMaterialCheck} onChange={e => setNewVisitData({ ...newVisitData, qualityMaterialCheck: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Issues / Non-Conformities Found</label>
                <textarea value={newVisitData.issuesFound} onChange={e => setNewVisitData({ ...newVisitData, issuesFound: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Action Items / Follow-up</label>
                <textarea value={newVisitData.actionItems} onChange={e => setNewVisitData({ ...newVisitData, actionItems: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Weather Conditions</label>
                <input type="text" value={newVisitData.weatherConditions} onChange={e => setNewVisitData({ ...newVisitData, weatherConditions: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Detailed Description / Remarks *</label>
                <textarea value={newVisitData.description} onChange={e => setNewVisitData({ ...newVisitData, description: e.target.value })} required />
              </div>

              <div className="form-group">
                <label>Attachments (Documents, Images & Videos)</label>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,video/*"
                  onChange={(e) => handleVisitFileChange(e, false)}
                  className="file-input"
                />
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  Accepted: Images (JPEG, PNG, GIF, WebP), Documents (PDF, DOC, DOCX, XLS, XLSX), Videos (MP4, MOV, AVI, WMV, WebM, etc.). Max 10MB per file.
                </small>
                
                {/* Display new files being uploaded */}
                {newVisitPreviewFiles.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {newVisitPreviewFiles.map((item, index) => (
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
                            onClick={() => removeVisitFile(index, false)}
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
                    setNewVisitOpen(false)
                    setNewVisitFiles([])
                    setNewVisitPreviewFiles([])
                  }} 
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button type="submit" className="save-btn">Save Visit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteSiteVisitModal.open && deleteSiteVisitModal.visit && (
        <div className="modal-overlay" onClick={() => !isDeletingSiteVisit && setDeleteSiteVisitModal({ open: false, visit: null })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001 }}>
            <div className="modal-header">
              <h2>Delete Site Visit</h2>
              <button 
                onClick={() => !isDeletingSiteVisit && setDeleteSiteVisitModal({ open: false, visit: null })} 
                className="close-btn"
                disabled={isDeletingSiteVisit}
              >
                ×
              </button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to delete this site visit? This action cannot be undone.</p>
              <div className="form-actions">
                <button 
                  type="button" 
                  className="cancel-btn" 
                  onClick={() => setDeleteSiteVisitModal({ open: false, visit: null })}
                  disabled={isDeletingSiteVisit}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="reject-btn" 
                  onClick={async () => {
                    if (isDeletingSiteVisit) return
                    setIsDeletingSiteVisit(true)
                    try {
                      const res = await apiFetch(`/api/leads/${lead._id}/site-visits/${deleteSiteVisitModal.visit._id}`, {
                        method: 'DELETE'
                      })
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        throw new Error(err.message || 'Error deleting site visit')
                      }
                      setDeleteSiteVisitModal({ open: false, visit: null })
                      // Refresh site visits
                      const visitsRes = await apiFetch(`/api/leads/${lead._id}/site-visits`)
                      const visitsData = await visitsRes.json()
                      setLead(prev => ({ ...prev, siteVisits: visitsData }))
                      setNotify({ open: true, title: 'Deleted', message: 'Site visit deleted successfully.' })
                    } catch (e) {
                      setDeleteSiteVisitModal({ open: false, visit: null })
                      setNotify({ open: true, title: 'Delete Failed', message: e.message || 'We could not delete the site visit. Please try again.' })
                    } finally {
                      setIsDeletingSiteVisit(false)
                    }
                  }}
                  disabled={isDeletingSiteVisit}
                >
                  {isDeletingSiteVisit ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModal.open && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeleteModal({ open: false })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001 }}>
            <div className="modal-header">
              <h2>Delete Lead</h2>
              <button 
                onClick={() => !isDeleting && setDeleteModal({ open: false })} 
                className="close-btn"
                disabled={isDeleting}
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
                  onClick={() => setDeleteModal({ open: false })}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="reject-btn" 
                  onClick={async () => {
                    if (isDeleting) return
                    setIsDeleting(true)
                    try {
                      // Ensure no site visits
                      const resVisits = await apiFetch(`/api/leads/${lead._id}/site-visits`)
                      const visits = await resVisits.json()
                      if (Array.isArray(visits) && visits.length > 0) {
                        setDeleteModal({ open: false })
                        setNotify({ open: true, title: 'Delete Blocked', message: 'Cannot delete lead with existing site visits.' })
                        return
                      }
                      const res = await apiFetch(`/api/leads/${lead._id}`, {
                        method: 'DELETE'
                      })
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        throw new Error(err.message || 'Error deleting lead')
                      }
                      setDeleteModal({ open: false })
                      setNotify({ open: true, title: 'Deleted', message: 'Lead deleted successfully.' })
                      window.location.href = '/'
                    } catch (e) {
                      setDeleteModal({ open: false })
                      setNotify({ open: true, title: 'Delete Failed', message: e.message || 'We could not delete the lead. Please try again.' })
                    } finally {
                      setIsDeleting(false)
                    }
                  }}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {printPreviewModal.open && printPreviewModal.pdfUrl && (
        <div className="modal-overlay" onClick={() => setPrintPreviewModal({ open: false, visit: null, pdfUrl: null })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001, maxWidth: '95%', width: '100%', height: '95vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
              <h2>PDF Preview - Site Visit Report</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="save-btn" 
                  onClick={async () => {
                    if (printPreviewModal.visit) {
                      try {
                        await exportVisitPDF(printPreviewModal.visit)
                      } catch (e) {
                        setNotify({ open: true, title: 'Export Failed', message: 'We could not generate the PDF. Please try again.' })
                      }
                    }
                  }}
                >
                  Download PDF
                </button>
                <button 
                  className="save-btn" 
                  onClick={() => {
                    if (printPreviewModal.pdfUrl) {
                      const printWindow = window.open('', '_blank')
                      printWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <title>Site Visit Report</title>
                            <style>
                              body { margin: 0; padding: 0; }
                              iframe { width: 100%; height: 100vh; border: none; }
                            </style>
                          </head>
                          <body>
                            <iframe src="${printPreviewModal.pdfUrl}"></iframe>
                          </body>
                        </html>
                      `)
                      printWindow.document.close()
                      setTimeout(() => {
                        printWindow.frames[0].print()
                      }, 500)
                    }
                  }}
                >
                  Print
                </button>
                <button onClick={() => setPrintPreviewModal({ open: false, visit: null, pdfUrl: null })} className="close-btn">×</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', background: '#525252', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <iframe 
                src={printPreviewModal.pdfUrl}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  border: 'none',
                  background: 'white'
                }}
                title="PDF Preview"
              />
            </div>
          </div>
        </div>
      )}

      {notify.open && (
        <div className="modal-overlay" onClick={() => setNotify({ open: false, title: '', message: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{notify.title || 'Notice'}</h2>
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

      <CreateQuotationModal
        isOpen={showQuotationModal}
        onClose={() => {
          setShowQuotationModal(false)
          setSelectedLeadForQuotation(null)
        }}
        source="leads"
        editing={null}
        leads={lead ? [lead] : []}
        preselectedLeadId={selectedLeadForQuotation}
        onSave={handleQuotationSave}
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

      {siteVisitEditBlockModal.open && (
        <div className="modal-overlay" onClick={() => setSiteVisitEditBlockModal({ open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cannot Edit Site Visit</h2>
              <button onClick={() => setSiteVisitEditBlockModal({ open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p style={{ marginBottom: '16px', color: 'var(--text)' }}>
                This site visit cannot be edited because the associated lead has quotations. Site visits for leads with quotations are locked to maintain data integrity and ensure consistency with existing quotations.
              </p>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                If you need to make changes, please create a new site visit or contact an administrator.
              </p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => setSiteVisitEditBlockModal({ open: false })}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LeadDetail


