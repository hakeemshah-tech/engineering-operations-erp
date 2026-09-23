import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'

export default function CompanyManagement() {
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState({
    profile: { name: '', trn: '', loaded: false },
    documents: { total: 0, expiring: 0, loaded: false },
    credentials: { total: 0, expiring: 0, unverified: 0, loaded: false },
    vehicles: { total: 0, expiringDocs: 0, loaded: false }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true)

        // Fetch company profile
        const companyRes = await api.get('/api/company')
        const company = companyRes.data
        setMetrics(prev => ({
          ...prev,
          profile: {
            name: company?.legalName || 'No Profile',
            trn: company?.trn || '',
            loaded: true
          }
        }))

        // Fetch document metrics
        const docRes = await api.get('/api/company-documents?limit=1')
        setMetrics(prev => ({
          ...prev,
          documents: {
            total: docRes.data.total || 0,
            expiring: 0,
            loaded: true
          }
        }))

        // Fetch expiring documents count
        const docExpiringRes = await api.get('/api/company-documents?status=expiring_soon&limit=1')
        setMetrics(prev => ({
          ...prev,
          documents: {
            ...prev.documents,
            expiring: docExpiringRes.data.total || 0
          }
        }))

        // Fetch credentials metrics
        const credRes = await api.get('/api/credentials?limit=1')
        const credExpiringRes = await api.get('/api/credentials?status=expiring_soon&limit=1')
        const credUnverifiedRes = await api.get('/api/credentials?verificationStatus=unverified&limit=1')

        setMetrics(prev => ({
          ...prev,
          credentials: {
            total: credRes.data.total || 0,
            expiring: credExpiringRes.data.total || 0,
            unverified: credUnverifiedRes.data.total || 0,
            loaded: true
          }
        }))

        // Fetch vehicles metrics
        const vehRes = await api.get('/api/vehicles?limit=1')
        const vehExpiringRes = await api.get('/api/vehicles?documentsExpiringWithin=30&limit=1')

        setMetrics(prev => ({
          ...prev,
          vehicles: {
            total: vehRes.data.total || 0,
            expiringDocs: vehExpiringRes.data.total || 0,
            loaded: true
          }
        }))

        setLoading(false)
      } catch (error) {
        console.error('Error fetching metrics:', error)
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [])

  if (loading) return <Spinner />

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)', marginBottom: '8px' }}>
          Company Management Hub
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Manage your organization's profile, documents, credentials, and vehicle fleet
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Company Profile Tile */}
        <div
          onClick={() => navigate('/company/profile')}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: 'var(--shadow)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}>
              <svg viewBox="0 0 24 24" fill="#6366f1" style={{ width: '20px', height: '20px' }}>
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                Company Profile
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Organization Identity
              </p>
            </div>
          </div>
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: '13px', color: 'var(--text)', margin: '0 0 4px 0', fontWeight: '500' }}>
              {metrics.profile.name}
            </p>
            {metrics.profile.trn && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                TRN: {metrics.profile.trn}
              </p>
            )}
          </div>
        </div>

        {/* Documents Tile */}
        <div
          onClick={() => navigate('/company/documents')}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: 'var(--shadow)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}>
              <svg viewBox="0 0 24 24" fill="#f59e0b" style={{ width: '20px', height: '20px' }}>
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                Documents
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Compliance & Records
              </p>
            </div>
          </div>
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', margin: 0 }}>
                  {metrics.documents.total}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Total Docs
                </p>
              </div>
              {metrics.documents.expiring > 0 && (
                <div>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: '#f59e0b', margin: 0 }}>
                    {metrics.documents.expiring}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    Expiring
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Credentials Tile */}
        <div
          onClick={() => navigate('/company/credentials')}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: 'var(--shadow)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(168, 85, 247, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}>
              <svg viewBox="0 0 24 24" fill="#a855f7" style={{ width: '20px', height: '20px' }}>
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.29 7.78-7 8.94V12H5V6.3l7-3.11v8.8z"/>
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                Credentials
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Certifications & Licenses
              </p>
            </div>
          </div>
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', margin: 0 }}>
                  {metrics.credentials.total}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Total
                </p>
              </div>
              {metrics.credentials.expiring > 0 && (
                <div>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: '#f59e0b', margin: 0 }}>
                    {metrics.credentials.expiring}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    Expiring
                  </p>
                </div>
              )}
              {metrics.credentials.unverified > 0 && (
                <div>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: '#3b82f6', margin: 0 }}>
                    {metrics.credentials.unverified}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    Unverified
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Vehicles Tile */}
        <div
          onClick={() => navigate('/company/vehicles')}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: 'var(--shadow)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}>
              <svg viewBox="0 0 24 24" fill="#10b981" style={{ width: '20px', height: '20px' }}>
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm11 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM5 11l1.5-4.5h11L19 11H5z"/>
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                Vehicles
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Fleet Management
              </p>
            </div>
          </div>
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', margin: 0 }}>
                  {metrics.vehicles.total}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Total
                </p>
              </div>
              {metrics.vehicles.expiringDocs > 0 && (
                <div>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: '#f59e0b', margin: 0 }}>
                    {metrics.vehicles.expiringDocs}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    Docs Expiring
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: 'var(--shadow)'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: '0 0 12px 0' }}>
          Expiry Summary
        </h3>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
              Documents Expiring (30 days)
            </p>
            <p style={{ fontSize: '18px', fontWeight: '700', color: metrics.documents.expiring > 0 ? '#f59e0b' : '#10b981', margin: '8px 0 0 0' }}>
              {metrics.documents.expiring}
            </p>
          </div>
          <div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
              Credentials Expiring (30 days)
            </p>
            <p style={{ fontSize: '18px', fontWeight: '700', color: metrics.credentials.expiring > 0 ? '#f59e0b' : '#10b981', margin: '8px 0 0 0' }}>
              {metrics.credentials.expiring}
            </p>
          </div>
          <div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
              Vehicle Docs Expiring (30 days)
            </p>
            <p style={{ fontSize: '18px', fontWeight: '700', color: metrics.vehicles.expiringDocs > 0 ? '#f59e0b' : '#10b981', margin: '8px 0 0 0' }}>
              {metrics.vehicles.expiringDocs}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
