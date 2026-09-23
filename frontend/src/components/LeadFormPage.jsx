import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import './LeadManagement.css'
import './LoadingComponents.css'
import { ButtonLoader } from './LoadingComponents'

function LeadFormPage() {
  const navigate = useNavigate()
  const { leadId } = useParams()
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
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setCurrentUser(JSON.parse(localStorage.getItem('user')) || null)
    if (leadId) {
      fetchLead()
    }
  }, [leadId])

  const fetchLead = async () => {
    try {
      const res = await api.get(`/api/leads/${leadId}`)
      setEditingLead(res.data)
      setFormData({
        customerName: res.data.customerName || '',
        projectTitle: res.data.projectTitle || '',
        enquiryNumber: res.data.enquiryNumber || '',
        enquiryDate: res.data.enquiryDate ? res.data.enquiryDate.substring(0, 10) : '',
        scopeSummary: res.data.scopeSummary || '',
        submissionDueDate: res.data.submissionDueDate ? res.data.submissionDueDate.substring(0, 10) : ''
      })
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load lead data.' })
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
      if (editingLead && attachmentsToRemove.length > 0) {
        attachmentsToRemove.forEach(index => {
          formDataToSend.append('removeAttachments', index)
        })
      }

      if (editingLead) {
        await api.put(`/api/leads/${editingLead._id}`, formDataToSend)
      } else {
        await api.post('/api/leads', formDataToSend)
      }
      
      setNotify({ open: true, title: 'Success', message: editingLead ? 'Lead updated successfully.' : 'Lead created successfully.' })
      
      // Redirect back to leads list after a short delay
      setTimeout(() => {
        navigate('/leads')
      }, 1500)
    } catch (error) {
      setNotify({ open: true, title: 'Save Failed', message: error.response?.data?.message || 'We could not save this lead. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!currentUser) {
    return <div>Loading...</div>
  }

  const canEdit = currentUser?.roles?.includes('sales_engineer') || currentUser?.roles?.includes('estimation_engineer')

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{editingLead ? 'Edit Lead' : 'Create New Lead'}</h1>
        <button
          onClick={() => navigate('/leads')}
          style={{
            padding: '8px 16px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            background: 'var(--card)',
            color: 'var(--text)',
            cursor: 'pointer'
          }}
        >
          Back to Leads
        </button>
      </div>

      {canEdit ? (
        <form onSubmit={handleSubmit} className="lead-form" style={{ background: 'var(--card)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
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
              rows={5}
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
                              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'
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
                      {item.type === 'image' && item.preview && (
                        <img 
                          src={item.preview} 
                          alt="Preview"
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
                          background: 'rgba(220, 53, 69, 0.8)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
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

          <div className="form-actions" style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button 
              type="button" 
              onClick={() => navigate('/leads')}
              className="cancel-btn"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="save-btn"
              disabled={isSubmitting}
            >
              <ButtonLoader loading={isSubmitting}>
                {isSubmitting ? (editingLead ? 'Saving...' : 'Creating...') : (editingLead ? 'Save Changes' : 'Create Lead')}
              </ButtonLoader>
            </button>
          </div>
        </form>
      ) : (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          You don't have permission to create or edit leads.
        </div>
      )}

      {/* Notification Modal */}
      {notify.open && (
        <div className="modal-overlay" onClick={() => setNotify({ open: false, title: '', message: '' })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001, maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>{notify.title || 'Notice'}</h2>
              <button onClick={() => setNotify({ open: false, title: '', message: '' })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p style={{ margin: '16px 0' }}>{notify.message}</p>
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

export default LeadFormPage

