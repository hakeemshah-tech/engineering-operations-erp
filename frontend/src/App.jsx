import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { api } from './lib/api'
import './App.css'
import logo from './assets/logo/app-logo.png'
import { hasAnyRole } from './lib/roles'
import ChangePassword from './components/ChangePassword'
import Dashboard from './components/Dashboard'
import Profile from './components/Profile'

// Normalize any stale localStorage.user so `supervisor` and `site_supervisor`
// are always both present together. This upgrades sessions issued before the
// server-side role-alias fix without requiring the user to log out / in.
;(function normalizeStoredUserRoles() {
  try {
    const raw = JSON.parse(localStorage.getItem('user') || 'null')
    if (!raw || !Array.isArray(raw.roles)) return
    const aliases = ['supervisor', 'site_supervisor']
    const hasAny = raw.roles.some(r => aliases.includes(r))
    const hasBoth = aliases.every(r => raw.roles.includes(r))
    if (hasAny && !hasBoth) {
      const nextRoles = Array.from(new Set([...raw.roles, ...aliases]))
      localStorage.setItem('user', JSON.stringify({ ...raw, roles: nextRoles }))
    }
  } catch { /* noop */ }
})()
import LeadDetail from './components/LeadDetail'
import QuotationDetail from './components/QuotationDetail'
import RevisionDetail from './components/RevisionDetail'
import ProjectDetail from './components/ProjectDetail'
import VariationDetail from './components/VariationDetail'
import SiteVisitDetail from './components/SiteVisitDetail'
import SiteVisitFormPage from './components/SiteVisitFormPage'
import QuotationModal from './components/QuotationModal'
import QuotationFormPage from './components/QuotationFormPage'
import LeadFormPage from './components/LeadFormPage'
import ProjectFormPage from './components/ProjectFormPage'
import VariationFormPage from './components/VariationFormPage'
import MaterialRequestDetail from './components/MaterialRequestDetail'
import MaterialDetail from './components/MaterialDetail'
import PurchaseRequestDetail from './components/PurchaseRequestDetail'
import PurchaseOrderDetail from './components/PurchaseOrderDetail'
import VehicleDetail from './components/VehicleDetail'
import EmployeeFormPage from './components/hr/EmployeeFormPage'
import PunchPage from './components/punch/PunchPage'
import EmployeeDetail from './components/hr/EmployeeDetail'
import OffboardingDetail from './components/hr/OffboardingDetail'
import PasswordResetQueue from './components/hr/PasswordResetQueue'
import JournalEntryFormPage from './components/accounts/JournalEntryFormPage'
import SupplierBillFormPage from './components/accounts/SupplierBillFormPage'
import SalesClaimFormPage from './components/accounts/SalesClaimFormPage'
import SalaryRunDetail from './components/accounts/SalaryRunDetail'
import { initTheme, setTheme } from './utils/theme'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark'
  })
  const [showPassword, setShowPassword] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState('')
  const [showForgot, setShowForgot] = useState(false)
  const [forgotIdentifier, setForgotIdentifier] = useState('')
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [forgotSuccess, setForgotSuccess] = useState(null) // { message, maskedEmail }

  const closeForgot = () => {
    setShowForgot(false)
    setForgotIdentifier('')
    setForgotError('')
    setForgotSuccess(null)
    setForgotSubmitting(false)
  }

  const submitForgot = async (e) => {
    e.preventDefault()
    const identifier = forgotIdentifier.trim()
    if (!identifier) return
    setForgotSubmitting(true)
    setForgotError('')
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
      const res = await fetch(`${apiBase}/api/auth/forgot-password-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setForgotError(data.message || `Request failed (${res.status})`)
      } else {
        setForgotSuccess({ message: data.message, maskedEmail: data.maskedEmail })
      }
    } catch (err) {
      setForgotError(err.message || 'Network error. Please try again.')
    }
    setForgotSubmitting(false)
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      window.location.href = '/dashboard'
      return
    }
    setMounted(true)
  }, [])

  useEffect(() => {
    setTheme(isDark)
  }, [isDark])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      const response = await api.post('/api/auth/login', {
        email,
        password
      })
      
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      window.location.href = '/dashboard'
    } catch (error) {
      setError(error.response?.data?.message || 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={`app ${mounted ? 'mounted' : ''}`}>
      <div className="bg-animation">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>
      
      <button className="theme-toggle" onClick={() => setIsDark(!isDark)}>
        <div className="toggle-icon">
          {isDark ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd"/>
            </svg>
          )}
        </div>
      </button>
      
      <div className="container">
        <div className="login-card">
          <div className="card-glow"></div>
          
          <div className="logo-section">
            <div className="logo-container">
              <img src={logo} alt="Engineering Operations ERP Logo" className="logo" />
            </div>
            <h1 className="brand-title">Engineering Operations ERP</h1>
          </div>
          
          <div className="header">
            <h2>Welcome back</h2>
            <p>Sign in to continue to your account</p>
          </div>
          
          <form onSubmit={handleSubmit} className="form">
            <div className={`input-wrapper ${emailFocused || email ? 'focused' : ''}`}>
              <label>Email</label>
              <div className="input-container">
                <svg className="input-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z"/>
                  <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z"/>
                </svg>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  required
                />
              </div>
            </div>
            
            <div className={`input-wrapper ${passwordFocused || password ? 'focused' : ''}`}>
              <label>Password</label>
              <div className="input-container">
                <svg className="input-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd"/>
                </svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a11.249 11.249 0 01-2.631 4.31l-3.099-3.099a5.25 5.25 0 00-6.71-6.71L7.759 4.577a11.217 11.217 0 014.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113z"/>
                      <path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0115.75 12zM12.53 15.713l-4.243-4.244a3.75 3.75 0 004.243 4.243z"/>
                      <path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 00-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 016.75 12z"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
                      <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" clipRule="evenodd"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            
            <div className="options">
              <label className="checkbox-wrapper">
                <input type="checkbox" />
                <span className="checkmark"></span>
                Remember me
              </label>
              <a
                href="#"
                className="forgot-link"
                onClick={(e) => { e.preventDefault(); setShowForgot(true) }}
              >Forgot password?</a>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            
            <button type="submit" className="submit-btn" disabled={isLoading}>
              <span className="btn-text">{isLoading ? 'Signing in...' : 'Sign In'}</span>
              {isLoading && <div className="btn-spinner"></div>}
              <div className="btn-bg"></div>
            </button>
          </form>
        </div>
      </div>

      {showForgot && (
        <div
          onClick={closeForgot}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(480px, 92vw)',
              padding: '28px 28px 22px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.18)',
              backdropFilter: 'blur(22px) saturate(160%)',
              WebkitBackdropFilter: 'blur(22px) saturate(160%)',
              border: '1px solid rgba(255, 255, 255, 0.32)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
              color: 'var(--text-primary, #0f172a)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: '#0f172a' }}>
                {forgotSuccess ? 'Request submitted' : 'Forgot password?'}
              </h2>
              <button
                type="button"
                onClick={closeForgot}
                aria-label="Close"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.6rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  color: '#0f172a',
                  opacity: 0.7
                }}
              >×</button>
            </div>

            {!forgotSuccess && (
              <form onSubmit={submitForgot}>
                <p style={{ margin: '0 0 16px', color: '#334155', fontSize: '0.92rem', lineHeight: 1.5 }}>
                  Enter the <strong>email</strong>, <strong>Employee ID</strong>, or <strong>phone number</strong> on your account.
                  HR will generate a temporary password and deliver it to you securely.
                </p>
                <input
                  type="text"
                  value={forgotIdentifier}
                  onChange={(e) => { setForgotIdentifier(e.target.value); if (forgotError) setForgotError('') }}
                  placeholder="email / EMP-00001 / phone"
                  autoFocus
                  required
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: forgotError ? '1px solid rgba(239, 68, 68, 0.55)' : '1px solid rgba(0, 0, 0, 0.12)',
                    background: 'rgba(255, 255, 255, 0.85)',
                    color: '#0f172a',
                    fontSize: '0.95rem',
                    marginBottom: forgotError ? 10 : 18,
                    outline: 'none'
                  }}
                />
                {forgotError && (
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#991b1b',
                    fontSize: '0.88rem',
                    marginBottom: 18,
                    lineHeight: 1.45,
                    border: '1px solid rgba(239, 68, 68, 0.25)'
                  }}>{forgotError}</div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    onClick={closeForgot}
                    style={{
                      padding: '10px 18px',
                      borderRadius: 10,
                      border: '1px solid rgba(0, 0, 0, 0.12)',
                      background: 'rgba(255, 255, 255, 0.8)',
                      color: '#0f172a',
                      cursor: 'pointer',
                      fontWeight: 500
                    }}
                  >Cancel</button>
                  <button
                    type="submit"
                    disabled={forgotSubmitting || !forgotIdentifier.trim()}
                    style={{
                      padding: '10px 18px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      color: 'white',
                      cursor: forgotSubmitting ? 'default' : 'pointer',
                      fontWeight: 600,
                      boxShadow: '0 8px 20px rgba(99, 102, 241, 0.35)',
                      opacity: (forgotSubmitting || !forgotIdentifier.trim()) ? 0.65 : 1
                    }}
                  >{forgotSubmitting ? 'Submitting…' : 'Submit request'}</button>
                </div>
              </form>
            )}

            {forgotSuccess && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.96)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: 14,
                padding: '22px 22px 20px',
                marginBottom: 18,
                boxShadow: '0 8px 22px rgba(16, 185, 129, 0.12)'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    boxShadow: '0 6px 16px rgba(16, 185, 129, 0.35)'
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.02rem', fontWeight: 600, color: '#064e3b', marginBottom: 6 }}>
                      Your request has been sent to HR
                    </div>
                    <div style={{ fontSize: '0.92rem', color: '#334155', lineHeight: 1.55 }}>
                      {forgotSuccess.message || 'HR will generate a temporary password and share it with you shortly.'}
                      {forgotSuccess.maskedEmail && (
                        <div style={{ marginTop: 8, color: '#475569', fontSize: '0.88rem' }}>
                          Account: <strong style={{ color: '#0f172a' }}>{forgotSuccess.maskedEmail}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {forgotSuccess && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={closeForgot}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const HR_FULL_ROLES = ['admin', 'manager', 'hr']
const HR_ATTENDANCE_ROLES = ['admin', 'manager', 'hr', 'project_engineer', 'site_supervisor', 'supervisor']
const LOCATION_MGMT_ROLES = ['admin', 'manager', 'hr', 'project_engineer']
const USER_MGMT_ROLES = ['admin', 'manager']
const INVENTORY_DASHBOARD_ROLES = ['admin', 'manager', 'inventory_manager', 'store_keeper']
const PROCUREMENT_DASHBOARD_ROLES = ['admin', 'manager', 'procurement_engineer']

function ProtectedRoute({ children, allow }) {
  const token = localStorage.getItem('token')
  const location = useLocation()

  if (!token) return <Navigate to="/" replace />

  let user = null
  try { user = JSON.parse(localStorage.getItem('user') || 'null') } catch { user = null }

  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (Array.isArray(allow) && allow.length > 0 && !hasAnyRole(user, allow)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/estimations-dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/inventory-dashboard" element={
          <ProtectedRoute allow={INVENTORY_DASHBOARD_ROLES}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/procurement-dashboard" element={
          <ProtectedRoute allow={PROCUREMENT_DASHBOARD_ROLES}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute allow={USER_MGMT_ROLES}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />
        <Route path="/change-password" element={
          <ProtectedRoute>
            <ChangePassword />
          </ProtectedRoute>
        } />
        <Route path="/leads" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/projects" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/revisions" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/quotations" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/project-variations" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/audit-logs" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/inventory" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/material-requests" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/purchase-requests" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/purchase-orders" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/suppliers" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/company" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/company/profile" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/company/documents" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/company/credentials" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/company/vehicles" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/vehicle-detail" element={
          <ProtectedRoute>
            <VehicleDetail />
          </ProtectedRoute>
        } />
        <Route path="/material-request-detail" element={
          <ProtectedRoute>
            <MaterialRequestDetail />
          </ProtectedRoute>
        } />
        <Route path="/material-detail" element={
          <ProtectedRoute>
            <MaterialDetail />
          </ProtectedRoute>
        } />
        <Route path="/purchase-request-detail" element={
          <ProtectedRoute>
            <PurchaseRequestDetail />
          </ProtectedRoute>
        } />
        <Route path="/purchase-order-detail" element={
          <ProtectedRoute>
            <PurchaseOrderDetail />
          </ProtectedRoute>
        } />
        <Route path="/lead-detail" element={
          <ProtectedRoute>
            <LeadDetail />
          </ProtectedRoute>
        } />
        <Route path="/quotation-detail" element={
          <ProtectedRoute>
            <QuotationDetail />
          </ProtectedRoute>
        } />
        <Route path="/revision-detail" element={
          <ProtectedRoute>
            <RevisionDetail />
          </ProtectedRoute>
        } />
        <Route path="/project-detail" element={
          <ProtectedRoute>
            <ProjectDetail />
          </ProtectedRoute>
        } />
        <Route path="/variation-detail" element={
          <ProtectedRoute>
            <VariationDetail />
          </ProtectedRoute>
        } />
        <Route path="/site-visit-detail" element={
          <ProtectedRoute>
            <SiteVisitDetail />
          </ProtectedRoute>
        } />
        <Route path="/leads/create-quotation/:leadId" element={
          <ProtectedRoute>
            <QuotationFormPage />
          </ProtectedRoute>
        } />
        <Route path="/leads/create-quotation" element={
          <ProtectedRoute>
            <QuotationFormPage />
          </ProtectedRoute>
        } />
        <Route path="/quotations/create" element={
          <ProtectedRoute>
            <QuotationFormPage />
          </ProtectedRoute>
        } />
        <Route path="/quotations/edit/:quotationId" element={
          <ProtectedRoute>
            <QuotationFormPage />
          </ProtectedRoute>
        } />
        <Route path="/leads/create" element={
          <ProtectedRoute>
            <LeadFormPage />
          </ProtectedRoute>
        } />
        <Route path="/leads/edit/:leadId" element={
          <ProtectedRoute>
            <LeadFormPage />
          </ProtectedRoute>
        } />
        <Route path="/leads/:leadId/site-visits/create" element={
          <ProtectedRoute>
            <SiteVisitFormPage />
          </ProtectedRoute>
        } />
        <Route path="/leads/:leadId/site-visits/edit/:visitId" element={
          <ProtectedRoute>
            <SiteVisitFormPage />
          </ProtectedRoute>
        } />
        <Route path="/projects/:projectId/site-visits/create" element={
          <ProtectedRoute>
            <SiteVisitFormPage />
          </ProtectedRoute>
        } />
        <Route path="/projects/:projectId/site-visits/edit/:visitId" element={
          <ProtectedRoute>
            <SiteVisitFormPage />
          </ProtectedRoute>
        } />
        <Route path="/revisions/:revisionId/create-project" element={
          <ProtectedRoute>
            <ProjectFormPage />
          </ProtectedRoute>
        } />
        <Route path="/quotations/:quotationId/create-project" element={
          <ProtectedRoute>
            <ProjectFormPage />
          </ProtectedRoute>
        } />
        <Route path="/projects/edit/:projectId" element={
          <ProtectedRoute allow={['manager', 'admin', 'estimation_engineer']}>
            <ProjectFormPage />
          </ProtectedRoute>
        } />
        <Route path="/projects/:projectId/create-variation" element={
          <ProtectedRoute>
            <VariationFormPage />
          </ProtectedRoute>
        } />
        <Route path="/variations/edit/:variationId" element={
          <ProtectedRoute>
            <VariationFormPage />
          </ProtectedRoute>
        } />
        <Route path="/hr" element={
          <ProtectedRoute allow={HR_ATTENDANCE_ROLES}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/hr/employees" element={
          <ProtectedRoute allow={HR_FULL_ROLES}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/hr/attendance" element={
          <ProtectedRoute allow={HR_ATTENDANCE_ROLES}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/hr/leave" element={
          <ProtectedRoute>
            {/* Self-service leave is available to every authenticated user
                with an Employee profile. RBAC scoping inside LeaveManagement
                + the server's eligible-employees endpoint restrict the
                eligible roster (HR sees all, PE/SS sees their team, anyone
                else sees only themselves). */}
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/hr/offboarding" element={
          <ProtectedRoute allow={HR_FULL_ROLES}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/hr/locations" element={
          <ProtectedRoute allow={LOCATION_MGMT_ROLES}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/hr/location-groups" element={
          <ProtectedRoute allow={LOCATION_MGMT_ROLES}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/hr/holidays" element={
          <ProtectedRoute allow={['admin', 'manager', 'hr']}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/punch" element={
          <ProtectedRoute>
            <PunchPage />
          </ProtectedRoute>
        } />
        <Route path="/my-attendance" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/my-projects" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/hr/password-resets" element={
          <ProtectedRoute allow={HR_FULL_ROLES}>
            <PasswordResetQueue />
          </ProtectedRoute>
        } />
        <Route path="/hr/employees/create" element={
          <ProtectedRoute allow={HR_FULL_ROLES}>
            <EmployeeFormPage />
          </ProtectedRoute>
        } />
        <Route path="/hr/employees/edit/:id" element={
          <ProtectedRoute allow={HR_FULL_ROLES}>
            <EmployeeFormPage />
          </ProtectedRoute>
        } />
        <Route path="/hr/employee-detail" element={
          <ProtectedRoute allow={[...HR_FULL_ROLES, 'project_engineer', 'site_supervisor', 'supervisor']}>
            <EmployeeDetail />
          </ProtectedRoute>
        } />
        <Route path="/hr/offboarding-detail" element={
          <ProtectedRoute allow={HR_FULL_ROLES}>
            <OffboardingDetail />
          </ProtectedRoute>
        } />
        <Route path="/accounts" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/accounts/chart" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/accounts/journals" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/accounts/journals/create" element={
          <ProtectedRoute>
            <JournalEntryFormPage />
          </ProtectedRoute>
        } />
        <Route path="/accounts/journals/:entryId" element={
          <ProtectedRoute>
            <JournalEntryFormPage />
          </ProtectedRoute>
        } />
        <Route path="/accounts/bills" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/accounts/bills/create" element={
          <ProtectedRoute>
            <SupplierBillFormPage />
          </ProtectedRoute>
        } />
        <Route path="/accounts/bills/:billId" element={
          <ProtectedRoute>
            <SupplierBillFormPage />
          </ProtectedRoute>
        } />
        <Route path="/accounts/claims" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/accounts/claims/create" element={
          <ProtectedRoute>
            <SalesClaimFormPage />
          </ProtectedRoute>
        } />
        <Route path="/accounts/claims/:claimId" element={
          <ProtectedRoute>
            <SalesClaimFormPage />
          </ProtectedRoute>
        } />
        <Route path="/accounts/salary-preparation" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/accounts/salary-preparation/:runId" element={
          <ProtectedRoute>
            <SalaryRunDetail />
          </ProtectedRoute>
        } />
        <Route path="/accounts/tally-sync" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/accounts/vat-report" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/accounts/tally-setup" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/accounts/settings" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  )
}

export default App