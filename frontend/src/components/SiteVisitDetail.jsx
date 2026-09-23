import { useEffect, useState } from 'react'
import './LeadManagement.css'
import './LeadDetail.css'
import { setTheme } from '../utils/theme'
import { apiFetch, api } from '../lib/api'
import logo from '../assets/logo/app-logo.png'

function SiteVisitDetail() {
  const [siteVisit, setSiteVisit] = useState(null)
  const [lead, setLead] = useState(null)
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  const [visitHistoryOpen, setVisitHistoryOpen] = useState(false)
  const [profileUser, setProfileUser] = useState(null)
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
  const [editVisitFiles, setEditVisitFiles] = useState([])
  const [editVisitPreviewFiles, setEditVisitPreviewFiles] = useState([])
  const [editVisitAttachmentsToRemove, setEditVisitAttachmentsToRemove] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [deleteModal, setDeleteModal] = useState({ open: false })
  const [isDeleting, setIsDeleting] = useState(false)
  const [printPreviewModal, setPrintPreviewModal] = useState({ open: false, pdfUrl: null })
  const [quotations, setQuotations] = useState([])
  const [siteVisitEditBlockModal, setSiteVisitEditBlockModal] = useState({ open: false })
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark'
  })

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const handleVisitFileChange = (e) => {
    const files = Array.from(e.target.files)
    setEditVisitFiles(prev => [...prev, ...files])
    
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setEditVisitPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'image' }])
        }
        reader.readAsDataURL(file)
      } else if (file.type.startsWith('video/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setEditVisitPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'video' }])
        }
        reader.readAsDataURL(file)
      } else {
        setEditVisitPreviewFiles(prev => [...prev, { file, preview: null, type: 'document' }])
      }
    })
  }

  const removeVisitFile = (index) => {
    setEditVisitFiles(prev => prev.filter((_, i) => i !== index))
    setEditVisitPreviewFiles(prev => prev.filter((_, i) => i !== index))
  }

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

  const exportVisitPDF = async (visit) => {
    try {
      await ensurePdfMake()
      const logoDataUrl = await toDataURL(logo)
      const reportTitle = 'Site Visit Report'
      const filename = `${(lead?.projectTitle || lead?.name || 'Lead')}_Visit_${visit.visitAt ? new Date(visit.visitAt).toISOString().slice(0,10) : 'Date'}.pdf`

      const leadFields = [
        ['Customer', lead?.customerName || 'N/A'],
        ['Project Title', lead?.projectTitle || 'N/A'],
        ['Enquiry #', lead?.enquiryNumber || 'N/A'],
        ['Enquiry Date', lead?.enquiryDate ? new Date(lead.enquiryDate).toLocaleDateString() : 'N/A'],
        ['Submission Due', lead?.submissionDueDate ? new Date(lead.submissionDueDate).toLocaleDateString() : 'N/A'],
        ['Scope Summary', lead?.scopeSummary || 'N/A']
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
        
        const storedVisit = localStorage.getItem('siteVisitDetail')
        const storedLead = localStorage.getItem('leadDetail')
        const visitId = localStorage.getItem('siteVisitId')
        const leadId = localStorage.getItem('leadId')
        
        if (storedVisit) {
          const visitData = JSON.parse(storedVisit)
          setSiteVisit(visitData)
        }
        
        if (storedLead) {
          const leadData = JSON.parse(storedLead)
          setLead(leadData)
          
          // Fetch quotations for this lead
          try {
            const qRes = await apiFetch('/api/quotations')
            const allQ = await qRes.json()
            const list = Array.isArray(allQ) ? allQ.filter(q => {
              const qLeadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
              return qLeadId === leadData._id
            }) : []
            setQuotations(list)
          } catch {}
        }
        
        // Fetch fresh data if IDs are available
        if (visitId && leadId) {
          try {
            const visitRes = await apiFetch(`/api/leads/${leadId}/site-visits`)
            const visits = await visitRes.json()
            const visit = visits.find(v => v._id === visitId)
            if (visit) {
              setSiteVisit(visit)
              localStorage.setItem('siteVisitDetail', JSON.stringify(visit))
            }
          } catch {}
          
          try {
            const leadRes = await apiFetch(`/api/leads/${leadId}`)
            const leadData = await leadRes.json()
            setLead(leadData)
            localStorage.setItem('leadDetail', JSON.stringify(leadData))
            
            // Fetch quotations for this lead
            try {
              const qRes = await apiFetch('/api/quotations')
              const allQ = await qRes.json()
              const list = Array.isArray(allQ) ? allQ.filter(q => {
                const qLeadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
                return qLeadId === leadId
              }) : []
              setQuotations(list)
            } catch {}
          } catch {}
        }
      } catch {}
    }
    load()
  }, [])

  useEffect(() => {
    setTheme(isDark)
  }, [isDark])

  if (!siteVisit) return (
    <div className="lead-management" style={{ padding: 24 }}>
      <h2>Site Visit Details</h2>
      <p>Nothing to display.</p>
    </div>
  )

  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

  return (
    <div className="lead-detail">
      <div className="ld-header">
        <div className="ld-title">
          <div className="title-row">
            <h1>Site Visit - {siteVisit.siteLocation || 'N/A'}</h1>
          </div>
          <span className="ld-subtitle">
            {siteVisit.visitAt ? new Date(siteVisit.visitAt).toLocaleString() : 'N/A'}
            {lead && ` • ${lead.projectTitle || lead.name || 'N/A'}`}
          </span>
        </div>
        <div className="ld-sticky-actions">
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
          {lead && (
            <button className="link-btn" onClick={async () => {
              try {
                const leadRes = await apiFetch(`/api/leads/${lead._id}`)
                const leadData = await leadRes.json()
                const visitsRes = await apiFetch(`/api/leads/${lead._id}/site-visits`)
                const visits = await visitsRes.json()
                localStorage.setItem('leadDetail', JSON.stringify({ ...leadData, siteVisits: visits }))
                localStorage.setItem('leadId', lead._id)
                window.location.href = '/lead-detail'
              } catch {
                setNotify({ open: true, title: 'Open Lead Failed', message: 'We could not open the linked lead. Please try again.' })
              }
            }}>
              View Lead
            </button>
          )}
          {(currentUser?.roles?.includes('project_engineer') || currentUser?.roles?.includes('estimation_engineer')) && (
            <button
              className="save-btn"
              onClick={() => {
                // Check if quotations exist for this lead
                if (quotations && quotations.length > 0) {
                  setSiteVisitEditBlockModal({ open: true })
                  return
                }
                setEditVisit(siteVisit)
                setVisitEditData({
                  visitAt: siteVisit.visitAt ? new Date(siteVisit.visitAt).toISOString().slice(0,16) : '',
                  siteLocation: siteVisit.siteLocation || '',
                  engineerName: siteVisit.engineerName || '',
                  workProgressSummary: siteVisit.workProgressSummary || '',
                  safetyObservations: siteVisit.safetyObservations || '',
                  qualityMaterialCheck: siteVisit.qualityMaterialCheck || '',
                  issuesFound: siteVisit.issuesFound || '',
                  actionItems: siteVisit.actionItems || '',
                  weatherConditions: siteVisit.weatherConditions || '',
                  description: siteVisit.description || ''
                })
                setEditVisitFiles([])
                setEditVisitPreviewFiles([])
                setEditVisitAttachmentsToRemove([])
              }}
            >
              Edit Visit
            </button>
          )}
          {((currentUser?.roles?.includes('project_engineer') && siteVisit.createdBy?._id === currentUser?.id) || currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin')) && (
            <button 
              className="cancel-btn" 
              onClick={() => setDeleteModal({ open: true })}
              disabled={isDeleting}
              style={{ marginLeft: '6px' }}
            >
              {isDeleting ? 'Deleting...' : 'Delete Visit'}
            </button>
          )}
          <button className="save-btn" onClick={async () => {
            try {
              await ensurePdfMake()
              const logoDataUrl = await toDataURL(logo)
              const reportTitle = 'Site Visit Report'
              
              const leadFields = lead ? [
                ['Customer', lead.customerName || 'N/A'],
                ['Project Title', lead.projectTitle || lead.name || 'N/A'],
                ['Enquiry #', lead.enquiryNumber || 'N/A'],
                ['Enquiry Date', lead.enquiryDate ? new Date(lead.enquiryDate).toLocaleDateString() : 'N/A'],
                ['Submission Due', lead.submissionDueDate ? new Date(lead.submissionDueDate).toLocaleDateString() : 'N/A'],
                ['Scope Summary', lead.scopeSummary || 'N/A']
              ] : []

              const visitFields = [
                ['Date & Time', siteVisit.visitAt ? new Date(siteVisit.visitAt).toLocaleString() : 'N/A'],
                ['Engineer', siteVisit.engineerName || 'N/A'],
                ['Added By', siteVisit.createdBy?.name ? `${siteVisit.createdBy.name}${siteVisit.createdBy.email ? ' (' + siteVisit.createdBy.email + ')' : ''}` : 'N/A'],
                ['Site Location', siteVisit.siteLocation || 'N/A'],
                ['Work Progress', siteVisit.workProgressSummary || 'N/A'],
                ['Safety Observations', siteVisit.safetyObservations || 'N/A'],
                ['Quality & Material Check', siteVisit.qualityMaterialCheck || 'N/A'],
                ['Issues / Non-Conformities', siteVisit.issuesFound || 'N/A'],
                ['Action Items / Follow-up', siteVisit.actionItems || 'N/A'],
                ['Weather Conditions', siteVisit.weatherConditions || 'N/A'],
                ['Description / Remarks', siteVisit.description || 'N/A']
              ]

              const professionalParagraphs = [
                { text: 'Executive Summary', style: 'h2', margin: [0, 16, 0, 8] },
                { text: `The site visit was conducted by ${siteVisit.engineerName || 'the assigned engineer'} on ${siteVisit.visitAt ? new Date(siteVisit.visitAt).toLocaleString() : 'N/A'}. The overall progress is summarized below with key observations and recommended follow-up actions for maintaining momentum and quality across on‑site operations.`, margin: [0,0,0,8] },
                { text: 'Observations & Insights', style: 'h2', margin: [0, 12, 0, 8] },
                { text: `Work on site is progressing ${siteVisit.workProgressSummary ? 'as follows: ' + siteVisit.workProgressSummary : 'according to plan'}.
${siteVisit.safetyObservations ? 'Safety: ' + siteVisit.safetyObservations : 'Safety standards appear to be upheld with no critical deviations reported at the time of visit.'}
${siteVisit.qualityMaterialCheck ? 'Quality & Materials: ' + siteVisit.qualityMaterialCheck : 'Materials inspected met expected quality benchmarks; workmanship aligns with design intent.'}`, margin: [0,0,0,8] },
                { text: 'Risks & Recommendations', style: 'h2', margin: [0, 12, 0, 8] },
                { text: `${siteVisit.issuesFound ? 'Issues identified: ' + siteVisit.issuesFound : 'No material issues were identified that could impact schedule or quality.'}
${siteVisit.actionItems ? 'Recommended follow‑up: ' + siteVisit.actionItems : 'Continue with current plan, monitor progress and perform targeted spot checks on critical path items.'}`, margin: [0,0,0,0] }
              ]

              const content = [
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
                { text: '\n' }
              ]

              if (leadFields.length > 0) {
                content.push(
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
                  }
                )
              }

              content.push(
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
              )

              const docDefinition = {
                pageMargins: [40, 60, 40, 60],
                content,
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
                setPrintPreviewModal({ open: true, pdfUrl: dataUrl })
              })
            } catch (e) {
              setNotify({ open: true, title: 'Preview Failed', message: 'We could not generate the PDF preview. Please try again.' })
            }
          }}>Print Preview</button>
        </div>
      </div>

      {deleteModal.open && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeleteModal({ open: false })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001 }}>
            <div className="modal-header">
              <h2>Delete Site Visit</h2>
              <button 
                onClick={() => !isDeleting && setDeleteModal({ open: false })} 
                className="close-btn"
                disabled={isDeleting}
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
                  onClick={() => setDeleteModal({ open: false })}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="reject-btn" 
                  onClick={async () => {
                    if (isDeleting || !siteVisit || !lead) return
                    setIsDeleting(true)
                    try {
                      const res = await apiFetch(`/api/leads/${lead._id}/site-visits/${siteVisit._id}`, {
                        method: 'DELETE'
                      })
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        throw new Error(err.message || 'Error deleting site visit')
                      }
                      setDeleteModal({ open: false })
                      setNotify({ open: true, title: 'Deleted', message: 'Site visit deleted successfully. Redirecting to lead...' })
                      setTimeout(() => {
                        try {
                          localStorage.setItem('leadDetail', JSON.stringify(lead))
                          localStorage.setItem('leadId', lead._id)
                          window.location.href = '/lead-detail'
                        } catch {
                          window.location.href = '/leads'
                        }
                      }, 1500)
                    } catch (e) {
                      setDeleteModal({ open: false })
                      setNotify({ open: true, title: 'Delete Failed', message: e.message || 'We could not delete the site visit. Please try again.' })
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
        <div className="modal-overlay" onClick={() => setPrintPreviewModal({ open: false, pdfUrl: null })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001, maxWidth: '95%', width: '100%', height: '95vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
              <h2>PDF Preview - Site Visit Report</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="save-btn" 
                  onClick={async () => {
                    try {
                      await exportVisitPDF(siteVisit)
                    } catch (e) {
                      setNotify({ open: true, title: 'Export Failed', message: 'We could not generate the PDF. Please try again.' })
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
                <button onClick={() => setPrintPreviewModal({ open: false, pdfUrl: null })} className="close-btn">×</button>
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
              {profileUser?.roles && Array.isArray(profileUser.roles) && profileUser.roles.length > 0 && (
                <div className="form-group">
                  <label>Roles</label>
                  <input type="text" value={profileUser.roles.join(', ')} readOnly />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="ld-grid">
        <div className="ld-card ld-section">
          <h3>Visit Information</h3>
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
                  <td data-label="Field">Date & Time</td>
                  <td data-label="Value">{siteVisit.visitAt ? new Date(siteVisit.visitAt).toLocaleString() : 'N/A'}</td>
                </tr>
                <tr>
                  <td data-label="Field">Site Location</td>
                  <td data-label="Value">{siteVisit.siteLocation || 'N/A'}</td>
                </tr>
                <tr>
                  <td data-label="Field">Engineer / Inspector Name</td>
                  <td data-label="Value">{siteVisit.engineerName || 'N/A'}</td>
                </tr>
                <tr>
                  <td data-label="Field">Created By</td>
                  <td data-label="Value">
                    {siteVisit.createdBy?._id === currentUser?.id ? 'You' : (siteVisit.createdBy?.name || 'N/A')}
                    {siteVisit.createdBy?._id !== currentUser?.id && siteVisit.createdBy && (
                      <button className="link-btn" onClick={() => setProfileUser(siteVisit.createdBy)} style={{ marginLeft: 6 }}>View Profile</button>
                    )}
                  </td>
                </tr>
                {siteVisit.createdAt && (
                  <tr>
                    <td data-label="Field">Created At</td>
                    <td data-label="Value">{new Date(siteVisit.createdAt).toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ld-card ld-section">
          <h3>Work Progress</h3>
          <div className="ld-field">
            <span className="ld-label">Summary</span>
            <span className="ld-value">{siteVisit.workProgressSummary || 'N/A'}</span>
          </div>
        </div>

        {siteVisit.safetyObservations && (
          <div className="ld-card ld-section">
            <h3>Safety Observations</h3>
            <div className="ld-field">
              <span className="ld-value">{siteVisit.safetyObservations}</span>
            </div>
          </div>
        )}

        {siteVisit.qualityMaterialCheck && (
          <div className="ld-card ld-section">
            <h3>Quality & Material Check</h3>
            <div className="ld-field">
              <span className="ld-value">{siteVisit.qualityMaterialCheck}</span>
            </div>
          </div>
        )}

        {siteVisit.issuesFound && (
          <div className="ld-card ld-section">
            <h3>Issues / Non-Conformities Found</h3>
            <div className="ld-field">
              <span className="ld-value">{siteVisit.issuesFound}</span>
            </div>
          </div>
        )}

        {siteVisit.actionItems && (
          <div className="ld-card ld-section">
            <h3>Action Items / Follow-up</h3>
            <div className="ld-field">
              <span className="ld-value">{siteVisit.actionItems}</span>
            </div>
          </div>
        )}

        {siteVisit.weatherConditions && (
          <div className="ld-card ld-section">
            <h3>Weather Conditions</h3>
            <div className="ld-field">
              <span className="ld-value">{siteVisit.weatherConditions}</span>
            </div>
          </div>
        )}

        <div className="ld-card ld-section">
          <h3>Description / Remarks</h3>
          <div className="ld-field">
            <span className="ld-value">{siteVisit.description || 'N/A'}</span>
          </div>
        </div>

        {siteVisit.attachments && siteVisit.attachments.length > 0 && (
          <div className="ld-card ld-section">
            <h3>Attachments ({siteVisit.attachments.length})</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginTop: '15px' }}>
              {siteVisit.attachments.map((attachment, idx) => {
                const isImage = attachment.mimetype && attachment.mimetype.startsWith('image/')
                const isVideo = attachment.mimetype && attachment.mimetype.startsWith('video/')
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
        )}

        {siteVisit.edits?.length > 0 && (
          <div className="ld-card ld-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Edit History</h3>
              <button className="link-btn" onClick={() => setVisitHistoryOpen(!visitHistoryOpen)}>
                {visitHistoryOpen ? 'Hide History' : 'View History'}
              </button>
            </div>
            {visitHistoryOpen && (
              <div className="edits-list">
                {siteVisit.edits.slice().reverse().map((edit, idx) => (
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
      </div>

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
                  
                  Object.keys(visitEditData).forEach(key => {
                    formDataToSend.append(key, visitEditData[key])
                  })
                  
                  editVisitFiles.forEach(file => {
                    formDataToSend.append('attachments', file)
                  })

                  if (editVisitAttachmentsToRemove.length > 0) {
                    editVisitAttachmentsToRemove.forEach(index => {
                      formDataToSend.append('removeAttachments', index)
                    })
                  }

                  const updated = await api.put(`/api/leads/${lead._id}/site-visits/${editVisit._id}`, formDataToSend)
                  setSiteVisit(updated.data)
                  localStorage.setItem('siteVisitDetail', JSON.stringify(updated.data))
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
                  onChange={handleVisitFileChange}
                  className="file-input"
                />
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  Accepted: Images (JPEG, PNG, GIF, WebP), Documents (PDF, DOC, DOCX, XLS, XLSX), Videos (MP4, MOV, AVI, WMV, WebM, etc.). Max 10MB per file.
                </small>
                
                {editVisit && editVisit.attachments && editVisit.attachments.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>Existing Attachments:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {editVisit.attachments.map((attachment, index) => {
                        const isImage = attachment.mimetype && attachment.mimetype.startsWith('image/')
                        const isVideo = attachment.mimetype && attachment.mimetype.startsWith('video/')
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
                            onClick={() => removeVisitFile(index)}
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

export default SiteVisitDetail

