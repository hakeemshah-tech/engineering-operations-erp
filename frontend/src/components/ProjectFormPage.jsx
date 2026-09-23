import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import LocationPicker from './locations/LocationPicker'
import UserPicker from './UserPicker'
import './LeadManagement.css'
import './LoadingComponents.css'
import { ButtonLoader } from './LoadingComponents'

function ProjectFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { revisionId, projectId, quotationId } = useParams()
  const [currentUser, setCurrentUser] = useState(null)
  const [revision, setRevision] = useState(null)
  const [quotation, setQuotation] = useState(null)
  const [editingProject, setEditingProject] = useState(null)
  const [projectEngineers, setProjectEngineers] = useState([])
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewFiles, setPreviewFiles] = useState([])
  const [attachmentsToRemove, setAttachmentsToRemove] = useState([])
  const [ack, setAck] = useState(false)

  const [form, setForm] = useState({
    name: '',
    locationDetails: '',
    siteLocationId: '',
    workingHours: '',
    manpowerCount: '',
    status: 'active',
    assignedProjectEngineerIds: []
  })
  const [locations, setLocations] = useState([])

  const fetchProjectEngineers = async () => {
    try {
      const res = await api.get('/api/projects/project-engineers')
      setProjectEngineers(Array.isArray(res.data) ? res.data : [])
    } catch {}
  }

  const fetchLocations = async () => {
    try {
      const res = await api.get('/api/locations', { params: { status: 'active' } })
      setLocations(Array.isArray(res.data) ? res.data : [])
    } catch {
      setLocations([])
    }
  }

  const fetchProject = async () => {
    try {
      const res = await api.get(`/api/projects/${projectId}`)
      const project = res.data
      setEditingProject(project)
      setForm({
        name: project.name || '',
        locationDetails: project.locationDetails || '',
        siteLocationId: project.siteLocationId
          ? (typeof project.siteLocationId === 'object' ? project.siteLocationId._id : project.siteLocationId)
          : '',
        workingHours: project.workingHours || '',
        manpowerCount: (project.manpowerCount !== null && project.manpowerCount !== undefined) ? project.manpowerCount : '',
        status: project.status || 'active',
        assignedProjectEngineerIds: Array.isArray(project.assignedProjectEngineer)
          ? project.assignedProjectEngineer.map(e => typeof e === 'object' ? e._id : e)
          : []
      })
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load project data.' })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchRevision = async () => {
    try {
      const res = await api.get(`/api/revisions/${revisionId}`)
      const rev = res.data
      setRevision(rev)
      setForm({
        name: rev.projectTitle || rev.lead?.projectTitle || 'Project',
        locationDetails: rev.lead?.locationDetails || '',
        siteLocationId: '',
        workingHours: rev.lead?.workingHours || '',
        manpowerCount: rev.lead?.manpowerCount ?? '',
        status: 'active',
        assignedProjectEngineerIds: []
      })
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load revision data.' })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchQuotation = async () => {
    try {
      if (!quotationId) {
        console.error('quotationId is missing')
        setNotify({ open: true, title: 'Error', message: 'Quotation ID is missing.' })
        setForm({
          name: 'Project',
          locationDetails: '',
          siteLocationId: '',
          workingHours: '',
          manpowerCount: '',
          status: 'active',
          assignedProjectEngineerIds: []
        })
        setIsLoading(false)
        return
      }
      
      const res = await api.get(`/api/quotations/${quotationId}`)
      const quot = res.data
      setQuotation(quot)
      // Get lead data for autofill
      let leadData = null
      if (quot.lead) {
        try {
          const leadId = typeof quot.lead === 'object' ? quot.lead._id : quot.lead
          const leadRes = await api.get(`/api/leads/${leadId}`)
          leadData = leadRes.data
        } catch (err) {
          console.warn('Failed to fetch lead data:', err)
        }
      }
      setForm({
        name: quot.projectTitle || leadData?.projectTitle || leadData?.customerName || 'Project',
        locationDetails: leadData?.locationDetails || '',
        siteLocationId: '',
        workingHours: leadData?.workingHours || '',
        manpowerCount: leadData?.manpowerCount ?? '',
        status: 'active',
        assignedProjectEngineerIds: []
      })
    } catch (error) {
      console.error('Error fetching quotation:', error)
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to load quotation data.' })
      // Set form with default values even on error
      setForm({
        name: 'Project',
        locationDetails: '',
        workingHours: '',
        manpowerCount: '',
        status: 'active',
        assignedProjectEngineerIds: []
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    try {
      setCurrentUser(JSON.parse(localStorage.getItem('user')) || null)
      setIsLoading(true)
      const loadData = async () => {
        try {
          await fetchProjectEngineers()
          await fetchLocations()
          if (projectId) {
            await fetchProject()
            // fetchProject sets isLoading to false in finally block
          } else if (revisionId) {
            await fetchRevision()
            // fetchRevision sets isLoading to false in finally block
          } else if (quotationId) {
            await fetchQuotation()
            // fetchQuotation sets isLoading to false in finally block
          } else {
            setIsLoading(false)
          }
        } catch (error) {
          console.error('Error in loadData:', error)
          setNotify({ open: true, title: 'Error', message: 'Failed to load data. Please try again.' })
          setIsLoading(false)
        }
      }
      void loadData()
    } catch (error) {
      console.error('Error in useEffect:', error)
      setIsLoading(false)
    }
  }, [projectId, revisionId, quotationId])

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
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

  const handleSave = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      // Check if editing and variations exist
      if (editingProject) {
        try {
          const resV = await api.get(`/api/project-variations?parentProject=${projectId}`)
          const vars = Array.isArray(resV.data) ? resV.data : []
          if (vars.length > 0) {
            setNotify({ open: true, title: 'Cannot Edit', message: `This project cannot be edited because it has ${vars.length} existing variation${vars.length > 1 ? 's' : ''}.` })
            setIsSaving(false)
            return
          }
        } catch {}
      }

      // Check if creating from revision and it's the latest approved
      if (revisionId && revision) {
        try {
          const parentId = revision.parentQuotation?._id || revision.parentQuotation
          let allRevisions = []
          if (parentId) {
            const revRes = await api.get(`/api/revisions?parentQuotation=${parentId}`)
            allRevisions = Array.isArray(revRes.data) ? revRes.data : []
          }
          const approved = allRevisions.filter(x => x.managementApproval?.status === 'approved')
          const latest = approved.slice().sort((a,b) => {
            const getRevisionNum = (revNum) => {
              if (!revNum) return 0;
              if (typeof revNum === 'number') return revNum;
              const match = String(revNum).match(/-REV-(\d+)$/);
              return match ? parseInt(match[1], 10) : 0;
            };
            return getRevisionNum(b.revisionNumber) - getRevisionNum(a.revisionNumber);
          })[0]
          if (latest && latest._id !== revision._id) {
            setNotify({ open: true, title: 'Not Allowed', message: `Only the latest approved revision (#${latest.revisionNumber}) can be used to create a project.` })
            setIsSaving(false)
            return
          }
        } catch {}
      }

      // Check acknowledgment for estimation engineers creating projects
      if ((revisionId || quotationId) && currentUser?.roles?.includes('estimation_engineer') && !ack) {
        setNotify({ open: true, title: 'Acknowledgment Required', message: 'Please acknowledge that this action cannot be undone.' })
        setIsSaving(false)
        return
      }

      // Use FormData for file uploads
      const formData = new FormData()
      formData.append('name', form.name)
      formData.append('locationDetails', form.locationDetails)
      if (form.siteLocationId) formData.append('siteLocationId', form.siteLocationId)
      if (form.workingHours) formData.append('workingHours', form.workingHours)
      if (form.manpowerCount !== '' && form.manpowerCount !== null && form.manpowerCount !== undefined) {
        formData.append('manpowerCount', form.manpowerCount)
      }
      if (editingProject) {
        formData.append('status', form.status)
      }

      // Append assigned project engineers
      if (Array.isArray(form.assignedProjectEngineerIds) && form.assignedProjectEngineerIds.length > 0) {
        form.assignedProjectEngineerIds.forEach(id => {
          formData.append('assignedProjectEngineerIds', id)
        })
      }

      // Append new files
      selectedFiles.forEach(file => {
        formData.append('attachments', file)
      })

      // Append files to remove (for editing)
      if (editingProject && attachmentsToRemove.length > 0) {
        attachmentsToRemove.forEach(index => {
          formData.append('removeAttachments', index)
        })
      }

      if (editingProject) {
        await api.patch(`/api/projects/${projectId}`, formData)
        setNotify({ open: true, title: 'Success', message: 'Project updated successfully.' })
      } else if (quotationId) {
        await api.post(`/api/projects/from-quotation/${quotationId}`, formData)
        setNotify({ open: true, title: 'Success', message: 'Project created successfully.' })
      } else {
        await api.post(`/api/projects/from-revision/${revisionId}`, formData)
        setNotify({ open: true, title: 'Success', message: 'Project created successfully.' })
      }
      
      // Navigate back after a short delay
      setTimeout(() => {
        if (editingProject) {
          navigate('/projects')
        } else if (quotationId) {
          navigate('/quotations')
        } else {
          navigate('/revisions')
        }
      }, 1500)
    } catch (err) {
      setNotify({ open: true, title: 'Save Failed', message: err.response?.data?.message || 'We could not save this project. Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    if (editingProject) {
      navigate('/projects')
    } else if (quotationId) {
      navigate('/quotations')
    } else {
      navigate('/revisions')
    }
  }

  // Debug: Log the params
  useEffect(() => {
    console.log('ProjectFormPage mounted with params:', { projectId, revisionId, quotationId })
    console.log('ProjectFormPage isLoading:', isLoading)
    console.log('ProjectFormPage location:', location.pathname)
  }, [projectId, revisionId, quotationId, isLoading, location.pathname])

  // Always render something - even if there's an error
  if (isLoading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'var(--bg)', 
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', color: 'var(--text)', marginBottom: '12px' }}>Loading project form...</div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {quotationId ? `Quotation ID: ${quotationId}` : revisionId ? `Revision ID: ${revisionId}` : projectId ? `Project ID: ${projectId}` : 'No ID provided'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--bg)', 
      padding: '24px',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      <div style={{
        background: 'var(--card)',
        borderRadius: '12px',
        padding: '32px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
          paddingBottom: '24px',
          borderBottom: '1px solid var(--border)'
        }}>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: '600', 
            color: 'var(--text)',
            margin: 0
          }}>
            {editingProject ? 'Edit Project' : quotationId ? 'Create Project from Quotation' : 'Create Project'}
          </h1>
          <button
            type="button"
            onClick={handleCancel}
            className="cancel-btn"
            style={{ padding: '8px 16px' }}
          >
            Cancel
          </button>
        </div>

        {notify.open && (
          <div style={{
            padding: '12px 16px',
            marginBottom: '24px',
            borderRadius: '8px',
            background: notify.title === 'Success' ? '#d4edda' : '#f8d7da',
            color: notify.title === 'Success' ? '#155724' : '#721c24',
            border: `1px solid ${notify.title === 'Success' ? '#c3e6cb' : '#f5c6cb'}`
          }}>
            <strong>{notify.title}:</strong> {notify.message}
            <button
              onClick={() => setNotify({ open: false, title: '', message: '' })}
              style={{
                float: 'right',
                background: 'none',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: 'inherit'
              }}
            >
              ×
            </button>
          </div>
        )}

        {currentUser?.roles?.includes('estimation_engineer') && (revisionId || quotationId) && (
          <div className="edit-item" style={{ background: '#FEF3C7', border: '1px solid #F59E0B', padding: 14, marginBottom: 14, color: '#7C2D12' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span aria-hidden="true" style={{ fontSize: 20, lineHeight: '20px', marginTop: 2 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Warning</div>
                <div style={{ lineHeight: 1.4 }}>This action cannot be undone. Only managers can delete projects once created.</div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Project Name *</label>
            <input 
              type="text" 
              value={form.name} 
              onChange={e => setForm({ ...form, name: e.target.value })} 
              required 
            />
          </div>

          <div className="form-group">
            <label>Location Details *</label>
            <input
              type="text"
              value={form.locationDetails}
              onChange={e => setForm({ ...form, locationDetails: e.target.value })}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Working Hours</label>
              <input
                type="text"
                value={form.workingHours}
                onChange={e => setForm({ ...form, workingHours: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Manpower Count</label>
              <input
                type="number"
                value={form.manpowerCount === null || form.manpowerCount === undefined || form.manpowerCount === '' ? '' : form.manpowerCount}
                onChange={e => {
                  const inputVal = e.target.value
                  const val = inputVal === '' ? '' : (isNaN(Number(inputVal)) ? form.manpowerCount : Number(inputVal))
                  setForm({ ...form, manpowerCount: val })
                }}
              />
            </div>
          </div>

          {editingProject && (
            <div className="form-group">
              <label>Status</label>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>
          )}

          {/* Site & Team allocation - these two pickers were ragged because
              they used the generic `form-group` wrapper and got squashed by
              the form's narrow input width. Wrapping them in a dedicated
              section card gives each picker breathing room, a section
              header, and proper hint text, and shows live selection
              summaries so the operator can see what they've picked without
              scrolling through the picker. */}
          <div style={{
            margin: '16px 0',
            padding: '16px 18px',
            background: 'var(--input, #f8fafc)',
            border: '1px solid var(--border)',
            borderRadius: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Site &amp; Team Allocation</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Used by GPS punch + attendance scoping
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    Site Location <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>· geofence anchor for GPS punch</span>
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {form.siteLocationId ? '1 selected' : 'None — falls back to each employee\'s base location'}
                  </span>
                </div>
                <LocationPicker
                  mode="single"
                  selectedId={form.siteLocationId || ''}
                  onChange={(id) => setForm({ ...form, siteLocationId: id || '' })}
                  pageSize={15}
                  allowClear={true}
                  emptyText="No locations match — adjust filters or add a Location first."
                />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    Project Engineer(s) <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>· responsible owners on site</span>
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {(form.assignedProjectEngineerIds?.length || 0)} engineer{(form.assignedProjectEngineerIds?.length || 0) === 1 ? '' : 's'} assigned
                  </span>
                </div>
                <UserPicker
                  mode="multi"
                  selectedIds={Array.isArray(form.assignedProjectEngineerIds) ? form.assignedProjectEngineerIds : []}
                  onChange={(ids) => setForm({ ...form, assignedProjectEngineerIds: ids })}
                  roleKeys={['project_engineer']}
                  pageSize={15}
                  emptyText="No project engineers available. Create one in User Management first."
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                  Project Engineers see this project on My Projects and can mark attendance for the site supervisors and workers assigned here.
                </div>
              </div>
            </div>
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
            {editingProject && editingProject.attachments && editingProject.attachments.length > 0 && (
              <div style={{ marginTop: '15px' }}>
                <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>Existing Attachments:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {editingProject.attachments.map((attachment, index) => {
                    const isImage = attachment.mimetype && attachment.mimetype.startsWith('image/')
                    const isVideo = attachment.mimetype && attachment.mimetype.startsWith('video/')
                    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
                    const fileUrl = attachment.path.startsWith('http') ? attachment.path : `${apiBase}${attachment.path}`
                    const isMarkedForRemoval = attachmentsToRemove.includes(index.toString())
                    
                    return (
                      <div 
                        key={index} 
                        style={{ 
                          position: 'relative', 
                          border: isMarkedForRemoval ? '2px solid #dc3545' : '1px solid #ddd', 
                          borderRadius: '4px', 
                          padding: '8px',
                          maxWidth: '150px',
                          opacity: isMarkedForRemoval ? 0.5 : 1,
                          backgroundColor: isMarkedForRemoval ? '#ffe6e6' : '#fff'
                        }}
                      >
                        {isImage && attachment.path ? (
                          <img 
                            src={fileUrl} 
                            alt={attachment.originalName}
                            style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        ) : isVideo && attachment.path ? (
                          <video 
                            src={fileUrl}
                            style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                            controls={false}
                            muted
                            onError={(e) => { e.target.style.display = 'none' }}
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
                            <span style={{ fontSize: '12px', textAlign: 'center' }}>{attachment.originalName}</span>
                          </div>
                        )}
                        <div style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
                          {attachment.originalName.length > 15 ? attachment.originalName.substring(0, 15) + '...' : attachment.originalName}
                        </div>
                        <div style={{ fontSize: '10px', color: '#999' }}>
                          {formatFileSize(attachment.size)}
                        </div>
                        {!isMarkedForRemoval && (
                          <button
                            type="button"
                            onClick={() => setAttachmentsToRemove(prev => [...prev, index.toString()])}
                            style={{
                              position: 'absolute',
                              top: '5px',
                              right: '5px',
                              background: 'rgba(220, 53, 69, 0.9)',
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
                        )}
                        {isMarkedForRemoval && (
                          <div style={{ 
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(220, 53, 69, 0.1)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: '#dc3545'
                          }}>
                            Will Remove
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            {/* Display new files being uploaded */}
            {previewFiles.length > 0 && (
              <div style={{ marginTop: '15px' }}>
                {editingProject && editingProject.attachments && editingProject.attachments.length > 0 && (
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

          {currentUser?.roles?.includes('estimation_engineer') && (revisionId || quotationId) && (
            <div className="form-group">
              <div style={{ 
                display: 'flex', 
                gap: '12px', 
                alignItems: 'flex-start', 
                padding: '14px 16px', 
                border: '1px solid var(--border)', 
                borderRadius: '8px', 
                background: 'var(--bg)'
              }}>
                <input 
                  id="ack-project-create" 
                  type="checkbox" 
                  checked={ack} 
                  onChange={e => setAck(e.target.checked)} 
                  style={{ 
                    marginTop: '2px',
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    flexShrink: 0
                  }} 
                />
                <label 
                  htmlFor="ack-project-create" 
                  style={{ 
                    color: 'var(--text)', 
                    cursor: 'pointer',
                    margin: 0,
                    fontSize: '14px',
                    lineHeight: '1.5',
                    flex: 1
                  }}
                >
                  I understand this action cannot be undone and requires management involvement to reverse.
                </label>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={handleCancel}>Cancel</button>
            <button 
              type="submit" 
              className="save-btn" 
              disabled={isSaving}
            >
              <ButtonLoader loading={isSaving}>
                {isSaving ? 'Saving...' : (editingProject ? 'Update Project' : 'Create Project')}
              </ButtonLoader>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProjectFormPage

