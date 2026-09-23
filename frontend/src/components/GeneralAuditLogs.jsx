import { useEffect, useState, useRef, useCallback } from 'react'
import { api } from '../lib/api'
import './LeadManagement.css'
import './LoadingComponents.css'
import { Spinner, PageSkeleton } from './LoadingComponents'

function GeneralAuditLogs() {
  const [currentUser, setCurrentUser] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  
  // Filter states
  const [actionFilter, setActionFilter] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('')
  const [startDateFilter, setStartDateFilter] = useState('')
  const [endDateFilter, setEndDateFilter] = useState('')
  const [performedByFilter, setPerformedByFilter] = useState('')
  
  const [filtersExpanded, setFiltersExpanded] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(80)
  const headerRef = useRef(null)

  useEffect(() => {
    try {
      const userData = localStorage.getItem('user')
      setCurrentUser(userData ? JSON.parse(userData) : null)
    } catch (error) {
      console.error('Error loading user data:', error)
      setCurrentUser(null)
    }
  }, [])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth >= 768) {
        setFiltersExpanded(true)
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight)
    }
  }, [filtersExpanded])

  const fetchAuditLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString()
      })
      
      if (actionFilter) params.append('action', actionFilter)
      if (moduleFilter) params.append('module', moduleFilter)
      if (entityTypeFilter) params.append('entityType', entityTypeFilter)
      if (startDateFilter) params.append('startDate', startDateFilter)
      if (endDateFilter) params.append('endDate', endDateFilter)
      if (performedByFilter) params.append('performedBy', performedByFilter)

      const res = await api.get(`/api/general-audit-logs?${params.toString()}`)
      if (res && res.data) {
        setAuditLogs(Array.isArray(res.data.logs) ? res.data.logs : [])
        setTotalPages(res.data.pagination?.pages || 1)
        setTotal(res.data.pagination?.total || 0)
      } else {
        setAuditLogs([])
        setTotalPages(1)
        setTotal(0)
      }
    } catch (error) {
      console.error('Error fetching general audit logs:', error)
      setAuditLogs([])
      setTotalPages(1)
      setTotal(0)
      // Don't show error to user if it's a 403 (unauthorized) - user just doesn't have access
      if (error?.response?.status !== 403) {
        // Could show a notification here if needed
      }
    } finally {
      setIsLoading(false)
    }
  }, [currentPage, itemsPerPage, actionFilter, moduleFilter, entityTypeFilter, startDateFilter, endDateFilter, performedByFilter])

  useEffect(() => {
    fetchAuditLogs()
  }, [fetchAuditLogs])


  const formatAction = (action) => {
    if (!action) return ''
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const formatModule = (module) => {
    if (!module) return ''
    return module.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  if (isLoading && auditLogs.length === 0) {
    return <PageSkeleton />
  }

  return (
    <div className="lead-management">
      <div ref={headerRef} className="header-section" style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--bg)' }}>
        <div className="header">
          <h1>General Audit Logs</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Total: {total} logs
            </span>
          </div>
        </div>

        {/* Filters Section */}
        <div className={`filters-section ${filtersExpanded ? 'expanded' : ''}`} style={{ 
          marginTop: '16px',
          padding: '16px',
          background: 'var(--card)',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: filtersExpanded ? '16px' : '0' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Filters</h3>
            {isMobile && (
              <button
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                style={{
                  padding: '4px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                {filtersExpanded ? 'Collapse' : 'Expand'}
              </button>
            )}
          </div>
          
          {filtersExpanded && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div className="form-group">
                <label>Module</label>
                <select 
                  value={moduleFilter} 
                  onChange={e => {
                    setModuleFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input)', color: 'var(--text)' }}
                >
                  <option value="">All Modules</option>
                  <option value="authentication">Authentication</option>
                  <option value="user_management">User Management</option>
                  <option value="role_management">Role Management</option>
                  <option value="lead_management">Lead Management</option>
                  <option value="quotation_management">Quotation Management</option>
                  <option value="revision_management">Revision Management</option>
                  <option value="project_management">Project Management</option>
                  <option value="project_variation_management">Project Variation Management</option>
                  <option value="site_visit_management">Site Visit Management</option>
                  <option value="system">System</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Action</label>
                <input 
                  type="text" 
                  value={actionFilter} 
                  onChange={e => {
                    setActionFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Filter by action"
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input)', color: 'var(--text)' }}
                />
              </div>
              
              <div className="form-group">
                <label>Entity Type</label>
                <input 
                  type="text" 
                  value={entityTypeFilter} 
                  onChange={e => {
                    setEntityTypeFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Filter by entity type"
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input)', color: 'var(--text)' }}
                />
              </div>
              
              <div className="form-group">
                <label>Start Date</label>
                <input 
                  type="date" 
                  value={startDateFilter} 
                  onChange={e => {
                    setStartDateFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input)', color: 'var(--text)' }}
                />
              </div>
              
              <div className="form-group">
                <label>End Date</label>
                <input 
                  type="date" 
                  value={endDateFilter} 
                  onChange={e => {
                    setEndDateFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input)', color: 'var(--text)' }}
                />
              </div>
              
              <div className="form-group">
                <label>Performed By (User ID)</label>
                <input 
                  type="text" 
                  value={performedByFilter} 
                  onChange={e => {
                    setPerformedByFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Enter user ID"
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input)', color: 'var(--text)' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <Spinner />
        </div>
      ) : auditLogs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <p>No audit logs found.</p>
        </div>
      ) : (
        <>
          <div className="table" style={{ marginTop: '24px' }}>
            <table>
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Description</th>
                  <th>Performed By</th>
                  <th>Performed At</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log._id}>
                    <td data-label="Module">
                      <span className="status-badge" style={{ 
                        background: '#6366f1',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600
                      }}>
                        {formatModule(log.module)}
                      </span>
                    </td>
                    <td data-label="Action">
                      <span className="status-badge" style={{ 
                        background: log.success ? '#10b981' : '#ef4444',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600
                      }}>
                        {formatAction(log.action)}
                      </span>
                    </td>
                    <td data-label="Entity">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {log.entityName && (
                          <span><strong>{log.entityType}:</strong> {log.entityName}</span>
                        )}
                        {log.entityId && (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            ID: {log.entityId}
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Description">
                      {log.description || '-'}
                    </td>
                    <td data-label="Performed By">
                      {log.performedBy ? (
                        <div>
                          <div>{log.performedBy.name || 'N/A'}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {log.performedBy.email || ''}
                          </div>
                          {log.performedBy.roles && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {log.performedBy.roles.join(', ')}
                            </div>
                          )}
                        </div>
                      ) : 'N/A'}
                    </td>
                    <td data-label="Performed At">
                      {log.performedAt ? new Date(log.performedAt).toLocaleString() : 'N/A'}
                    </td>
                    <td data-label="Status">
                      <span className={`status-badge ${log.success ? 'approved' : 'rejected'}`}>
                        {log.success ? 'Success' : 'Failed'}
                      </span>
                      {log.errorMessage && (
                        <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '4px' }}>
                          {log.errorMessage}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
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
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </label>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, total)} of {total}
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
        </>
      )}
    </div>
  )
}

export default GeneralAuditLogs

