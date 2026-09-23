import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, apiFetch } from '../lib/api'
import './LeadManagement.css'
import './LoadingComponents.css'
import { ButtonLoader } from './LoadingComponents'

function SiteVisitFormPage() {
  const navigate = useNavigate()
  const { leadId, visitId, projectId } = useParams()
  const [currentUser, setCurrentUser] = useState(null)
  const [lead, setLead] = useState(null)
  const [project, setProject] = useState(null)
  const [editingVisit, setEditingVisit] = useState(null)
  const [formData, setFormData] = useState({
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
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewFiles, setPreviewFiles] = useState([])
  const [attachmentsToRemove, setAttachmentsToRemove] = useState([])
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user'))
      setCurrentUser(user)
    } catch {
      setCurrentUser(null)
    }

    if (leadId) {
      fetchLead()
    }
    if (projectId) {
      fetchProject()
    }
    if (visitId) {
      fetchVisit()
    }
  }, [leadId, projectId, visitId])

  const fetchLead = async () => {
    try {
      const res = await apiFetch(`/api/leads/${leadId}`)
      const data = await res.json()
      setLead(data)
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load lead data.' })
    }
  }

  const fetchProject = async () => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}`)
      const data = await res.json()
      setProject(data)
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load project data.' })
    }
  }

  const fetchVisit = async () => {
    try {
      const parentId = leadId || projectId
      const endpoint = leadId 
        ? `/api/leads/${leadId}/site-visits`
        : `/api/projects/${projectId}/site-visits`
      
      const res = await apiFetch(endpoint)
      const visits = await res.json()
      const visit = visits.find(v => v._id === visitId)
      
      if (visit) {
        setEditingVisit(visit)
        setFormData({
          visitAt: visit.visitAt ? new Date(visit.visitAt).toISOString().slice(0, 16) : '',
          siteLocation: visit.siteLocation || '',
          engineerName: visit.engineerName || '',
          workProgressSummary: visit.workProgressSummary || '',
          safetyObservations: visit.safetyObservations || '',
          qualityMaterialCheck: visit.qualityMaterialCheck || '',
          issuesFound: visit.issuesFound || '',
          actionItems: visit.actionItems || '',
          weatherConditions: visit.weatherConditions || '',
          description: visit.description || ''
        })
      }
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load site visit data.' })
    }
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    setSelectedFiles(prev => [...prev, ...files])
    
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

  const handleRemoveAttachment = (index) => {
    setAttachmentsToRemove(prev => [...prev, index.toString()])
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
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
      if (editingVisit && attachmentsToRemove.length > 0) {
        attachmentsToRemove.forEach(index => {
          formDataToSend.append('removeAttachments', index)
        })
      }

      if (editingVisit) {
        // Update existing visit
        const parentId = leadId || projectId
        const endpoint = leadId 
          ? `/api/leads/${parentId}/site-visits/${visitId}`
          : `/api/projects/${parentId}/site-visits/${visitId}`
        
        await api.put(endpoint, formDataToSend)
        setNotify({ open: true, title: 'Success', message: 'Site visit updated successfully.' })
      } else {
        // Create new visit
        if (leadId) {
          await api.post(`/api/leads/${leadId}/site-visits`, formDataToSend)
          setNotify({ open: true, title: 'Success', message: 'Site visit created successfully.' })
        } else if (projectId) {
          formDataToSend.append('projectId', projectId)
          await api.post('/api/site-visits', formDataToSend)
          setNotify({ open: true, title: 'Success', message: 'Site visit created successfully.' })
        }
      }

      // Redirect after success
      setTimeout(() => {
        if (leadId) {
          navigate(`/lead-detail`)
          try {
            localStorage.setItem('leadId', leadId)
          } catch {}
        } else if (projectId) {
          navigate('/projects')
        } else {
          navigate('/')
        }
      }, 1500)
    } catch (error) {
      setNotify({ open: true, title: 'Save Failed', message: error.response?.data?.message || 'We could not save this site visit. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

  return (
    <div className="lead-management" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <button 
          onClick={() => {
            if (leadId) {
              navigate(`/lead-detail`)
              try {
                localStorage.setItem('leadId', leadId)
              } catch {}
            } else if (projectId) {
              navigate('/projects')
            } else {
              navigate('/')
            }
          }}
          className="cancel-btn"
          style={{ marginBottom: '16px' }}
        >
          ← Back
        </button>
        <h1>{editingVisit ? 'Edit Site Visit' : 'New Site Visit'}</h1>
        {(lead || project) && (
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
            {lead ? `Lead: ${lead.projectTitle || lead.customerName || 'N/A'}` : `Project: ${project?.name || 'N/A'}`}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="lead-form">
        <div className="form-group">
          <label>Date & Time *</label>
          <input
            type="datetime-local"
            value={formData.visitAt}
            onChange={(e) => setFormData({...formData, visitAt: e.target.value})}
            required
          />
        </div>

        <div className="form-group">
          <label>Site Location *</label>
          <input
            type="text"
            value={formData.siteLocation}
            onChange={(e) => setFormData({...formData, siteLocation: e.target.value})}
            required
          />
        </div>

        <div className="form-group">
          <label>Engineer / Inspector Name *</label>
          <input
            type="text"
            value={formData.engineerName}
            onChange={(e) => setFormData({...formData, engineerName: e.target.value})}
            required
          />
        </div>

        <div className="form-group">
          <label>Work Progress Summary *</label>
          <textarea
            value={formData.workProgressSummary}
            onChange={(e) => setFormData({...formData, workProgressSummary: e.target.value})}
            required
            rows={4}
          />
        </div>

        <div className="form-group">
          <label>Safety Observations</label>
          <textarea
            value={formData.safetyObservations}
            onChange={(e) => setFormData({...formData, safetyObservations: e.target.value})}
            rows={4}
          />
        </div>

        <div className="form-group">
          <label>Quality / Material Check</label>
          <textarea
            value={formData.qualityMaterialCheck}
            onChange={(e) => setFormData({...formData, qualityMaterialCheck: e.target.value})}
            rows={4}
          />
        </div>

        <div className="form-group">
          <label>Issues Found</label>
          <textarea
            value={formData.issuesFound}
            onChange={(e) => setFormData({...formData, issuesFound: e.target.value})}
            rows={4}
          />
        </div>

        <div className="form-group">
          <label>Action Items / Follow-up</label>
          <textarea
            value={formData.actionItems}
            onChange={(e) => setFormData({...formData, actionItems: e.target.value})}
            rows={4}
          />
        </div>

        <div className="form-group">
          <label>Weather Conditions</label>
          <input
            type="text"
            value={formData.weatherConditions}
            onChange={(e) => setFormData({...formData, weatherConditions: e.target.value})}
          />
        </div>

        <div className="form-group">
          <label>Detailed Description / Remarks *</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            required
            rows={6}
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
          {editingVisit && editingVisit.attachments && editingVisit.attachments.length > 0 && (
            <div style={{ marginTop: '15px' }}>
              <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>Existing Attachments:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {editingVisit.attachments.map((attachment, index) => {
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
                        />
                      ) : isVideo ? (
                        <div style={{ position: 'relative', width: '100%', height: '100px' }}>
                          <video 
                            src={fileUrl}
                            style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                            controls={false}
                            muted
                          />
                        </div>
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
                          <span style={{ fontSize: '12px' }}>📄 {attachment.originalName}</span>
                        </div>
                      )}
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
                          style={{ fontSize: '11px', color: '#007bff', textDecoration: 'none' }}
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
              <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>New Attachments:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {previewFiles.map((item, index) => (
                  <div key={index} style={{ 
                    position: 'relative', 
                    border: '1px solid #ddd', 
                    borderRadius: '4px', 
                    padding: '8px',
                    maxWidth: '150px'
                  }}>
                    {item.type === 'image' && item.preview && (
                      <img 
                        src={item.preview} 
                        alt={item.file.name}
                        style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                      />
                    )}
                    {item.type === 'video' && item.preview && (
                      <div style={{ position: 'relative', width: '100%', height: '100px' }}>
                        <video 
                          src={item.preview}
                          style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                          controls={false}
                          muted
                        />
                      </div>
                    )}
                    {item.type === 'document' && (
                      <div style={{ 
                        width: '100%', 
                        height: '100px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        backgroundColor: '#f5f5f5',
                        borderRadius: '4px'
                      }}>
                        <span style={{ fontSize: '12px' }}>📄 {item.file.name}</span>
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
                        marginTop: '5px',
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
              if (leadId) {
                navigate(`/lead-detail`)
                try {
                  localStorage.setItem('leadId', leadId)
                } catch {}
              } else if (projectId) {
                navigate('/projects')
              } else {
                navigate('/')
              }
            }}
            className="cancel-btn"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="save-btn"
            disabled={isSubmitting}
          >
            <ButtonLoader loading={isSubmitting}>
              {isSubmitting ? 'Saving...' : (editingVisit ? 'Update Visit' : 'Create Visit')}
            </ButtonLoader>
          </button>
        </div>
      </form>

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
                <button onClick={() => setNotify({ open: false, title: '', message: '' })} className="save-btn">OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SiteVisitFormPage

