import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/logo/app-logo.png'
import { initTheme, setTheme } from '../utils/theme'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const MIN_LENGTH = 10

const EyeOpenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
    <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" clipRule="evenodd" />
  </svg>
)

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a11.249 11.249 0 01-2.631 4.31l-3.099-3.099a5.25 5.25 0 00-6.71-6.71L7.759 4.577a11.217 11.217 0 014.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113z" />
    <path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0115.75 12zM12.53 15.713l-4.243-4.244a3.75 3.75 0 004.243 4.243z" />
    <path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 00-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 016.75 12z" />
  </svg>
)

function ChangePassword() {
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')

  let user = null
  try { user = JSON.parse(localStorage.getItem('user') || 'null') } catch { user = null }
  const forced = !!user?.mustChangePassword

  useEffect(() => {
    initTheme()
    setMounted(true)
    if (!localStorage.getItem('token')) {
      navigate('/', { replace: true })
    }
  }, [navigate])

  useEffect(() => { setTheme(isDark) }, [isDark])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match')
      return
    }
    if (newPassword === currentPassword) {
      setError('New password must differ from current password')
      return
    }

    setIsLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.message || `Failed (${res.status})`)
        setIsLoading(false)
        return
      }

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Network error')
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    if (forced) return
    navigate(-1)
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
          {isDark ? '☀' : '☾'}
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
            <h2>{forced ? 'Set a new password' : 'Change password'}</h2>
            <p>
              {forced
                ? 'Your account was just provisioned. Please choose a new password to continue.'
                : `Choose a new password (minimum ${MIN_LENGTH} characters).`}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="form">
            <div className="input-wrapper focused">
              <label>Current password</label>
              <div className="input-container">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowCurrent(v => !v)}
                  aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                >
                  {showCurrent ? <EyeOffIcon /> : <EyeOpenIcon />}
                </button>
              </div>
            </div>

            <div className="input-wrapper focused">
              <label>New password</label>
              <div className="input-container">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowNew(v => !v)}
                  aria-label={showNew ? 'Hide new password' : 'Show new password'}
                >
                  {showNew ? <EyeOffIcon /> : <EyeOpenIcon />}
                </button>
              </div>
            </div>

            <div className="input-wrapper focused">
              <label>Confirm new password</label>
              <div className="input-container">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirm(v => !v)}
                  aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirm ? <EyeOffIcon /> : <EyeOpenIcon />}
                </button>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="submit-btn" disabled={isLoading}>
              <span className="btn-text">{isLoading ? 'Saving…' : 'Update password'}</span>
              {isLoading && <div className="btn-spinner"></div>}
              <div className="btn-bg"></div>
            </button>

            {!forced && (
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  marginTop: '0.75rem',
                  background: 'transparent',
                  color: 'var(--text-secondary, #666)',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '0.9rem'
                }}
              >
                Cancel
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

export default ChangePassword
