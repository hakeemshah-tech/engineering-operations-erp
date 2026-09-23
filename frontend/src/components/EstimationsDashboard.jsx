import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './Dashboard.css'
import './LoadingComponents.css'
import { Spinner } from './LoadingComponents'

function EstimationsDashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    leads: {
      total: 0,
      withSiteVisits: 0,
      withQuotations: 0,
      withBoth: 0,
      converted: 0,
      noActivity: 0
    },
    siteVisits: {
      total: 0,
      thisMonth: 0,
      lastMonth: 0
    },
    quotations: {
      total: 0,
      draft: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      totalValue: 0
    },
    revisions: {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    },
    projects: {
      total: 0,
      active: 0,
      completed: 0,
      onHold: 0
    },
    projectVariations: {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      totalValue: 0
    }
  })

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      
      // Fetch all data in parallel
      const [leadsRes, quotationsRes, revisionsRes, projectsRes, variationsRes] = await Promise.all([
        apiFetch('/api/leads'),
        apiFetch('/api/quotations'),
        apiFetch('/api/revisions'),
        apiFetch('/api/projects'),
        apiFetch('/api/project-variations')
      ])

      const leads = await leadsRes.json()
      const quotations = await quotationsRes.json()
      const revisions = await revisionsRes.json()
      const projects = await projectsRes.json()
      const variations = await variationsRes.json()

      // Calculate site visits from leads and projects
      let totalSiteVisits = 0
      let thisMonthVisits = 0
      let lastMonthVisits = 0
      const now = new Date()
      const thisMonth = now.getMonth()
      const thisYear = now.getFullYear()
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
      const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear

      // Helper function to process site visits
      const processSiteVisits = (visits) => {
        if (!visits || !Array.isArray(visits)) return
        visits.forEach(visit => {
          if (visit && visit.visitAt) {
            totalSiteVisits++
            const visitDate = new Date(visit.visitAt)
            if (visitDate.getMonth() === thisMonth && visitDate.getFullYear() === thisYear) {
              thisMonthVisits++
            } else if (visitDate.getMonth() === lastMonth && visitDate.getFullYear() === lastMonthYear) {
              lastMonthVisits++
            }
          }
        })
      }

      // Fetch site visits for all leads in parallel
      const leadVisitsPromises = leads
        .filter(lead => lead._id)
        .map(lead => 
          apiFetch(`/api/leads/${lead._id}/site-visits`)
            .then(res => res.json())
            .then(visits => ({ leadId: lead._id, visits }))
            .catch(error => {
              console.error(`Error fetching site visits for lead ${lead._id}:`, error)
              return { leadId: lead._id, visits: [] } // Return empty array on error
            })
        )
      
      // Fetch site visits for all projects in parallel
      const projectVisitsPromises = projects
        .filter(project => project._id)
        .map(project => 
          apiFetch(`/api/site-visits/project/${project._id}`)
            .then(res => res.json())
            .catch(error => {
              console.error(`Error fetching site visits for project ${project._id}:`, error)
              return [] // Return empty array on error
            })
        )
      
      // Wait for all site visits to be fetched
      const [leadVisitsResults, projectVisitsArrays] = await Promise.all([
        Promise.all(leadVisitsPromises),
        Promise.all(projectVisitsPromises)
      ])
      
      // Process all lead site visits for counting
      leadVisitsResults.forEach(({ visits }) => {
        processSiteVisits(visits)
      })
      
      // Process all project site visits
      projectVisitsArrays.forEach(projectVisits => {
        processSiteVisits(projectVisits)
      })

      // Process leads with site visits and quotations data
      // Create a map of lead ID to site visits
      const leadSiteVisitsMap = {}
      leadVisitsResults.forEach(({ leadId, visits }) => {
        leadSiteVisitsMap[leadId] = visits || []
      })

      // Map quotations to leads
      const leadQuotationsMap = {}
      quotations.forEach(q => {
        const qLeadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
        if (qLeadId) {
          if (!leadQuotationsMap[qLeadId]) {
            leadQuotationsMap[qLeadId] = []
          }
          leadQuotationsMap[qLeadId].push(q)
        }
      })

      // Calculate lead breakdown metrics
      let leadsWithSiteVisits = 0
      let leadsWithQuotations = 0
      let leadsWithBoth = 0
      let leadsConverted = 0
      let leadsNoActivity = 0

      leads.forEach(lead => {
        const leadId = lead._id
        const hasSiteVisits = (leadSiteVisitsMap[leadId] || []).length > 0
        const hasQuotations = (leadQuotationsMap[leadId] || []).length > 0
        const isConverted = !!lead.projectId

        if (isConverted) {
          leadsConverted++
        }
        if (hasSiteVisits) {
          leadsWithSiteVisits++
        }
        if (hasQuotations) {
          leadsWithQuotations++
        }
        if (hasSiteVisits && hasQuotations) {
          leadsWithBoth++
        }
        if (!hasSiteVisits && !hasQuotations && !isConverted) {
          leadsNoActivity++
        }
      })

      const leadsStats = {
        total: leads.length,
        withSiteVisits: leadsWithSiteVisits,
        withQuotations: leadsWithQuotations,
        withBoth: leadsWithBoth,
        converted: leadsConverted,
        noActivity: leadsNoActivity
      }

      // Process quotations
      const quotationsStats = {
        total: quotations.length,
        draft: quotations.filter(q => q.managementApprovalStatus === 'draft').length,
        pending: quotations.filter(q => q.managementApprovalStatus === 'pending').length,
        approved: quotations.filter(q => q.managementApprovalStatus === 'approved').length,
        rejected: quotations.filter(q => q.managementApprovalStatus === 'rejected').length,
        totalValue: quotations.reduce((sum, q) => sum + (parseFloat(q.grandTotal) || 0), 0)
      }

      // Process revisions
      const revisionsStats = {
        total: revisions.length,
        pending: revisions.filter(r => r.managementApprovalStatus === 'pending').length,
        approved: revisions.filter(r => r.managementApprovalStatus === 'approved').length,
        rejected: revisions.filter(r => r.managementApprovalStatus === 'rejected').length
      }

      // Process projects
      const projectsStats = {
        total: projects.length,
        active: projects.filter(p => p.status === 'active').length,
        completed: projects.filter(p => p.status === 'completed').length,
        onHold: projects.filter(p => p.status === 'on_hold').length
      }

      // Process project variations
      const variationsStats = {
        total: variations.length,
        pending: variations.filter(v => v.managementApprovalStatus === 'pending').length,
        approved: variations.filter(v => v.managementApprovalStatus === 'approved').length,
        rejected: variations.filter(v => v.managementApprovalStatus === 'rejected').length,
        totalValue: variations.reduce((sum, v) => sum + (parseFloat(v.additionalCost) || 0), 0)
      }

      setStats({
        leads: leadsStats,
        siteVisits: {
          total: totalSiteVisits,
          thisMonth: thisMonthVisits,
          lastMonth: lastMonthVisits
        },
        quotations: quotationsStats,
        revisions: revisionsStats,
        projects: projectsStats,
        projectVariations: variationsStats
      })
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: 'AED',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const calculateChange = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0
    return ((current - previous) / previous * 100).toFixed(1)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spinner />
      </div>
    )
  }

  return (
    <div className="estimations-dashboard">
      <div className="dashboard-header">
        <h1>Estimations Dashboard</h1>
        <p>Comprehensive analytics for estimations and projects management</p>
      </div>

      {/* Overview Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon leads">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/>
            </svg>
          </div>
          <div className="stat-content">
            <h3>{stats.leads.total}</h3>
            <p>Total Leads</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '12px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Draft: {stats.leads.draft}</span>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span style={{ color: 'var(--text-muted)' }}>Converted: {stats.leads.converted}</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon site-visits">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
          <div className="stat-content">
            <h3>{stats.siteVisits.total}</h3>
            <p>Total Site Visits</p>
            <span className="stat-change positive">
              {stats.siteVisits.lastMonth > 0 
                ? `+${calculateChange(stats.siteVisits.thisMonth, stats.siteVisits.lastMonth)}%`
                : stats.siteVisits.thisMonth > 0 ? 'New' : '0%'
              } this month
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon quotations">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 2h9a3 3 0 013 3v14a3 3 0 01-3 3H6a3 3 0 01-3-3V5a3 3 0 013-3zm2 5h7v2H8V7zm0 4h7v2H8v-2zm0 4h5v2H8v-2z"/>
            </svg>
          </div>
          <div className="stat-content">
            <h3>{stats.quotations.total}</h3>
            <p>Total Quotations</p>
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--success)' }}>
                {formatCurrency(stats.quotations.totalValue)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Total Value
              </div>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon revisions">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 4h9a3 3 0 013 3v11a3 3 0 01-3 3H5a3 3 0 01-3-3V7a3 3 0 013-3zm2 4h7v2H7V8zm0 4h7v2H7v-2zm0 4h5v2H7v-2z"/>
            </svg>
          </div>
          <div className="stat-content">
            <h3>{stats.revisions.total}</h3>
            <p>Total Revisions</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '12px' }}>
              <span className="stat-change" style={{ background: stats.revisions.pending > 0 ? 'rgba(245, 158, 11, 0.1)' : 'transparent', color: stats.revisions.pending > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                Pending: {stats.revisions.pending}
              </span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon projects">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
          </div>
          <div className="stat-content">
            <h3>{stats.projects.total}</h3>
            <p>Total Projects</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '12px' }}>
              <span style={{ color: 'var(--success)' }}>Active: {stats.projects.active}</span>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span style={{ color: 'var(--text-muted)' }}>Completed: {stats.projects.completed}</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon variations">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-4v-4H5v-4h4V5h4v4h4v4z"/>
            </svg>
          </div>
          <div className="stat-content">
            <h3>{stats.projectVariations.total}</h3>
            <p>Project Variations</p>
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: 'var(--primary)' }}>
                {formatCurrency(stats.projectVariations.totalValue)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Total Additional Cost
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Analytics */}
      <div className="charts-section">
        <div className="chart-card">
          <h3>Leads Activity Breakdown</h3>
          <div className="status-breakdown">
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill converted" 
                  style={{ width: `${stats.leads.total > 0 ? (stats.leads.converted / stats.leads.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>Converted to Projects</span>
                <span>{stats.leads.converted} ({stats.leads.total > 0 ? ((stats.leads.converted / stats.leads.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill approved" 
                  style={{ width: `${stats.leads.total > 0 ? (stats.leads.withBoth / stats.leads.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>With Site Visits & Quotations</span>
                <span>{stats.leads.withBoth} ({stats.leads.total > 0 ? ((stats.leads.withBoth / stats.leads.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill submitted" 
                  style={{ width: `${stats.leads.total > 0 ? (stats.leads.withQuotations / stats.leads.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>With Quotations</span>
                <span>{stats.leads.withQuotations} ({stats.leads.total > 0 ? ((stats.leads.withQuotations / stats.leads.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill draft" 
                  style={{ width: `${stats.leads.total > 0 ? (stats.leads.withSiteVisits / stats.leads.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>With Site Visits</span>
                <span>{stats.leads.withSiteVisits} ({stats.leads.total > 0 ? ((stats.leads.withSiteVisits / stats.leads.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill rejected" 
                  style={{ width: `${stats.leads.total > 0 ? (stats.leads.noActivity / stats.leads.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>No Activity</span>
                <span>{stats.leads.noActivity} ({stats.leads.total > 0 ? ((stats.leads.noActivity / stats.leads.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="chart-card">
          <h3>Quotations Approval Status</h3>
          <div className="status-breakdown">
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill draft" 
                  style={{ width: `${stats.quotations.total > 0 ? (stats.quotations.draft / stats.quotations.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>Draft</span>
                <span>{stats.quotations.draft} ({stats.quotations.total > 0 ? ((stats.quotations.draft / stats.quotations.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill pending" 
                  style={{ width: `${stats.quotations.total > 0 ? (stats.quotations.pending / stats.quotations.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>Pending Approval</span>
                <span>{stats.quotations.pending} ({stats.quotations.total > 0 ? ((stats.quotations.pending / stats.quotations.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill approved" 
                  style={{ width: `${stats.quotations.total > 0 ? (stats.quotations.approved / stats.quotations.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>Approved</span>
                <span>{stats.quotations.approved} ({stats.quotations.total > 0 ? ((stats.quotations.approved / stats.quotations.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill rejected" 
                  style={{ width: `${stats.quotations.total > 0 ? (stats.quotations.rejected / stats.quotations.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>Rejected</span>
                <span>{stats.quotations.rejected} ({stats.quotations.total > 0 ? ((stats.quotations.rejected / stats.quotations.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="chart-card">
          <h3>Projects Status</h3>
          <div className="status-breakdown">
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill active" 
                  style={{ width: `${stats.projects.total > 0 ? (stats.projects.active / stats.projects.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>Active</span>
                <span>{stats.projects.active} ({stats.projects.total > 0 ? ((stats.projects.active / stats.projects.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill completed" 
                  style={{ width: `${stats.projects.total > 0 ? (stats.projects.completed / stats.projects.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>Completed</span>
                <span>{stats.projects.completed} ({stats.projects.total > 0 ? ((stats.projects.completed / stats.projects.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
            <div className="status-item">
              <div className="status-bar">
                <div 
                  className="status-fill on-hold" 
                  style={{ width: `${stats.projects.total > 0 ? (stats.projects.onHold / stats.projects.total * 100) : 0}%` }}
                ></div>
              </div>
              <div className="status-info">
                <span>On Hold</span>
                <span>{stats.projects.onHold} ({stats.projects.total > 0 ? ((stats.projects.onHold / stats.projects.total) * 100).toFixed(1) : 0}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EstimationsDashboard

