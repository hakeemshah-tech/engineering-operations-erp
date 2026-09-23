import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Spinner, ButtonLoader } from './LoadingComponents'
import AttendanceIPLockSection from './settings/AttendanceIPLockSection'
import SelfieRetentionSection from './settings/SelfieRetentionSection'
import AttendanceSchedulesSection from './settings/AttendanceSchedulesSection'

function Settings() {
  const [currentUser, setCurrentUser] = useState(null)
  const [activeTab, setActiveTab] = useState('inventory')
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })

  const isAdminOrManager = currentUser?.roles?.includes('admin') || currentUser?.roles?.includes('manager')

  useEffect(() => {
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}')
      setCurrentUser(userData)
    } catch {
      setCurrentUser(null)
    }
  }, [])

  useEffect(() => {
    if (currentUser && isAdminOrManager) {
      fetchSettings()
    } else if (currentUser && !isAdminOrManager) {
      setLoading(false)
    }
  }, [currentUser])

  const fetchSettings = async () => {
    try {
      const res = await api.get('/api/system-settings')
      setSettings(res.data)
    } catch (error) {
      console.error('Error fetching settings:', error)
      setNotify({ open: true, title: 'Error', message: 'Failed to load settings.' })
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (category, key, value) => {
    setSaving(true)
    try {
      const payload = {
        [category]: {
          [key]: value
        }
      }
      const res = await api.put('/api/system-settings', payload)
      setSettings(res.data)
      setNotify({ open: true, title: 'Success', message: 'Setting updated successfully.' })
    } catch (error) {
      console.error('Error updating setting:', error)
      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to update setting.' })
    } finally {
      setSaving(false)
    }
  }

  // Access Denied
  if (!loading && currentUser && !isAdminOrManager) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ 
          background: 'var(--card)', 
          borderRadius: '12px', 
          padding: '48px', 
          maxWidth: '500px', 
          margin: '0 auto',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>🚫</div>
          <h2 style={{ color: 'var(--text)', marginBottom: '16px' }}>Access Denied</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            You do not have permission to access Settings.
            <br /><br />
            Required roles: <strong>Admin</strong> or <strong>Manager</strong>
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Spinner />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading settings...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('inventory')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: '8px',
            background: activeTab === 'inventory' ? 'var(--primary)' : 'var(--bg)',
            color: activeTab === 'inventory' ? 'white' : 'var(--text)',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          📦 Inventory
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: '8px',
            background: activeTab === 'attendance' ? 'var(--primary)' : 'var(--bg)',
            color: activeTab === 'attendance' ? 'white' : 'var(--text)',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          🔐 Attendance · IP Lock
        </button>
      </div>

      {/* Inventory Settings Tab */}
      {activeTab === 'inventory' && (
        <div>
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text)' }}>Inventory Settings</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
              Configure inventory module behavior and permissions.
            </p>
          </div>

          <div style={{ 
            background: 'var(--card)', 
            borderRadius: '12px', 
            border: '1px solid var(--border)',
            overflow: 'hidden'
          }}>
            {/* Store Creation Toggle */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '20px',
              borderBottom: '1px solid var(--border)'
            }}>
              <div>
                <div style={{ fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>
                  Store Creation
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Allow Inventory Managers to create new store locations.
                </div>
              </div>
              <label style={{ 
                position: 'relative', 
                display: 'inline-block', 
                width: '52px', 
                height: '28px' 
              }}>
                <input
                  type="checkbox"
                  checked={settings?.inventory?.storeCreationEnabled ?? true}
                  onChange={(e) => handleToggle('inventory', 'storeCreationEnabled', e.target.checked)}
                  disabled={saving}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: settings?.inventory?.storeCreationEnabled ? 'var(--primary)' : '#ccc',
                  borderRadius: '28px',
                  transition: '0.3s',
                  opacity: saving ? 0.6 : 1
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '',
                    height: '22px',
                    width: '22px',
                    left: settings?.inventory?.storeCreationEnabled ? '27px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.3s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}></span>
                </span>
              </label>
            </div>

            {/* Status Info */}
            <div style={{
              padding: '16px 20px',
              background: 'var(--bg)',
              fontSize: '13px',
              color: 'var(--text-muted)'
            }}>
              <strong>Current Status:</strong>{' '}
              {settings?.inventory?.storeCreationEnabled ? (
                <span style={{ color: '#10b981' }}>✓ Enabled - Inventory Managers can create stores</span>
              ) : (
                <span style={{ color: '#ef4444' }}>✗ Disabled - Store creation is blocked</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attendance - IP Lock Settings */}
      {activeTab === 'attendance' && settings && (
        <div>
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text)' }}>Attendance · IP Lock</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
              Control which networks office employees may punch from. Field/site employees are not affected — they're validated by GPS geofences on their assigned project sites.
            </p>
          </div>
          <AttendanceSchedulesSection
            settings={settings}
            onSaved={(updated) => {
              setSettings(updated)
              setNotify({ open: true, title: 'Saved', message: 'Attendance schedules updated.' })
            }}
          />
          <AttendanceIPLockSection
            settings={settings}
            onSaved={(updated) => {
              setSettings(updated)
              setNotify({ open: true, title: 'Saved', message: 'Attendance IP Lock settings updated.' })
            }}
          />
          <SelfieRetentionSection
            settings={settings}
            onSaved={(updated) => {
              setSettings(updated)
              setNotify({ open: true, title: 'Saved', message: 'Selfie retention policy updated.' })
            }}
          />
        </div>
      )}

      {/* Notification Modal */}
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
                <button type="button" className="save-btn" onClick={() => setNotify({ open: false, title: '', message: '' })}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings
