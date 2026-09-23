import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Spinner } from './LoadingComponents'
import ExpiryBadge from './ExpiryBadge'
import './CompanyProfile.css'

// The server returns relative paths like "/uploads/company/<file>.png". In
// dev the client runs on a different port from the API, so a bare relative
// src resolves against the Vite origin and 404s - prefix with the API origin
// when the URL is path-only, leave absolute URLs and data: URIs alone.
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
const resolveAssetUrl = (url) => {
  if (!url) return ''
  if (/^(data:|blob:|https?:)/i.test(url)) return url
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
}

export default function CompanyProfile() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const roles = user.roles || []
  const canManage = roles.includes('admin') || roles.includes('manager')
  const isAdmin = roles.includes('admin')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    legalName: '',
    tradingName: '',
    companyType: 'llc',
    industry: '',
    establishmentDate: '',
    companySize: '',
    registrationNumber: '',
    licenseExpiryDate: '',
    licenseIssuingAuthority: '',
    countryOfIncorporation: '',
    trn: '',
    taxRegistrationDate: '',
    primaryEmail: '',
    phone: '',
    alternatePhone: '',
    website: '',
    fax: '',
    address: {
      street: '',
      city: '',
      state: '',
      country: '',
      postalCode: '',
      poBox: ''
    },
    mailingAddress: {
      street: '',
      city: '',
      state: '',
      country: '',
      postalCode: '',
      poBox: ''
    },
    useSameAddress: true,
    workingHours: '',
    businessDescription: '',
    keyServices: '',
    numberOfEmployees: '',
    annualRevenueRange: '',
    bankName: '',
    accountName: '',
    accountNumber: '',
    iban: '',
    swiftCode: '',
    linkedIn: '',
    twitter: '',
    facebook: '',
    instagram: ''
  })

  const [logo, setLogo] = useState(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [companyId, setCompanyId] = useState(null)
  const [notify, setNotify] = useState(null)
  const [originalForm, setOriginalForm] = useState(form)
  const [edits, setEdits] = useState([])

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        setLoading(true)
        const res = await api.get('/api/company')
        if (res.data) {
          setCompanyId(res.data._id)
          const mailingAddr = res.data.mailingAddress || res.data.address
          const merged = {
            ...form,
            legalName: res.data.legalName || '',
            tradingName: res.data.tradingName || '',
            companyType: res.data.companyType || 'llc',
            industry: res.data.industry || '',
            establishmentDate: res.data.establishmentDate ? res.data.establishmentDate.split('T')[0] : '',
            companySize: res.data.companySize || '',
            registrationNumber: res.data.registrationNumber || '',
            licenseExpiryDate: res.data.licenseExpiryDate ? res.data.licenseExpiryDate.split('T')[0] : '',
            licenseIssuingAuthority: res.data.licenseIssuingAuthority || '',
            countryOfIncorporation: res.data.countryOfIncorporation || '',
            trn: res.data.trn || '',
            taxRegistrationDate: res.data.taxRegistrationDate ? res.data.taxRegistrationDate.split('T')[0] : '',
            primaryEmail: res.data.primaryEmail || '',
            phone: res.data.phone || '',
            alternatePhone: res.data.alternatePhone || '',
            website: res.data.website || '',
            fax: res.data.fax || '',
            address: res.data.address || form.address,
            mailingAddress: mailingAddr || form.mailingAddress,
            useSameAddress: !res.data.mailingAddress,
            workingHours: res.data.workingHours || '',
            businessDescription: res.data.businessDescription || '',
            keyServices: Array.isArray(res.data.keyServices) ? res.data.keyServices.join(', ') : '',
            numberOfEmployees: res.data.numberOfEmployees || '',
            annualRevenueRange: res.data.annualRevenueRange || '',
            bankName: res.data.bankName || '',
            accountName: res.data.accountName || '',
            accountNumber: res.data.accountNumber || '',
            iban: res.data.iban || '',
            swiftCode: res.data.swiftCode || '',
            linkedIn: res.data.socialLinks?.linkedIn || '',
            twitter: res.data.socialLinks?.twitter || '',
            facebook: res.data.socialLinks?.facebook || '',
            instagram: res.data.socialLinks?.instagram || ''
          }
          setForm(merged)
          setOriginalForm(merged)
          if (res.data.logo?.fileUrl) {
            setLogoPreview(resolveAssetUrl(res.data.logo.fileUrl))
          }
          if (res.data.edits) {
            setEdits(res.data.edits)
          }
        }
        setLoading(false)
      } catch (error) {
        console.error('Error fetching company:', error)
        setLoading(false)
      }
    }

    fetchCompany()
  }, [])

  const isDirty = JSON.stringify(form) !== JSON.stringify(originalForm) || !!logo

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    if (name.includes('.')) {
      const [section, field] = name.split('.')
      setForm(prev => ({
        ...prev,
        [section]: { ...prev[section], [field]: value }
      }))
    } else {
      setForm(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }))
    }
  }

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogo(file)
      const reader = new FileReader()
      reader.onloadend = () => setLogoPreview(reader.result)
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      let finalCompanyId = companyId

      // Prepare submission body
      const submitBody = {
        legalName: form.legalName,
        tradingName: form.tradingName,
        companyType: form.companyType,
        industry: form.industry,
        establishmentDate: form.establishmentDate || undefined,
        companySize: form.companySize || undefined,
        registrationNumber: form.registrationNumber || undefined,
        licenseExpiryDate: form.licenseExpiryDate || undefined,
        licenseIssuingAuthority: form.licenseIssuingAuthority || undefined,
        countryOfIncorporation: form.countryOfIncorporation || undefined,
        trn: form.trn || undefined,
        taxRegistrationDate: form.taxRegistrationDate || undefined,
        primaryEmail: form.primaryEmail || undefined,
        phone: form.phone || undefined,
        alternatePhone: form.alternatePhone || undefined,
        website: form.website || undefined,
        fax: form.fax || undefined,
        address: form.address,
        mailingAddress: form.useSameAddress ? undefined : form.mailingAddress,
        workingHours: form.workingHours || undefined,
        businessDescription: form.businessDescription || undefined,
        keyServices: form.keyServices ? form.keyServices.split(',').map(s => s.trim()).filter(s => s) : [],
        numberOfEmployees: form.numberOfEmployees || undefined,
        annualRevenueRange: form.annualRevenueRange || undefined
      }

      // Only include banking for admin
      if (isAdmin) {
        submitBody.bankName = form.bankName || undefined
        submitBody.accountName = form.accountName || undefined
        submitBody.accountNumber = form.accountNumber || undefined
        submitBody.iban = form.iban || undefined
        submitBody.swiftCode = form.swiftCode || undefined
      }

      submitBody.socialLinks = {
        linkedIn: form.linkedIn || undefined,
        twitter: form.twitter || undefined,
        facebook: form.facebook || undefined,
        instagram: form.instagram || undefined
      }

      // Create or update profile
      if (!finalCompanyId) {
        const createRes = await api.post('/api/company', submitBody)
        finalCompanyId = createRes.data._id
        setCompanyId(finalCompanyId)
      } else {
        await api.put(`/api/company/${finalCompanyId}`, submitBody)
      }

      // Upload logo if changed
      if (logo) {
        const logoFormData = new FormData()
        logoFormData.append('logo', logo)
        const logoRes = await api.post(`/api/company/${finalCompanyId}/logo`, logoFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        setLogoPreview(
          logoRes.data.logo?.fileUrl
            ? resolveAssetUrl(logoRes.data.logo.fileUrl)
            : logoPreview
        )
        setLogo(null)
      }

      // Refresh form
      const refreshRes = await api.get('/api/company')
      setOriginalForm({
        ...form,
        ...(form.useSameAddress && { mailingAddress: form.address })
      })
      if (refreshRes.data.edits) {
        setEdits(refreshRes.data.edits)
      }

      setNotify({ type: 'success', message: 'Company profile saved successfully.' })
      setTimeout(() => setNotify(null), 3000)
    } catch (error) {
      setNotify({ type: 'error', message: error.response?.data?.message || 'Error saving profile.' })
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>You do not have permission to manage company information.</p>
      </div>
    )
  }

  if (loading) return <Spinner />

  if (!companyId) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)', marginBottom: '8px' }}>
            Create Company Profile
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Set up your organization's core information, compliance details, and operational settings.
          </p>
        </div>

        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Legal Company Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              name="legalName"
              value={form.legalName}
              onChange={handleChange}
              placeholder="Enter company legal name"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'var(--input-bg)',
                color: 'var(--text)'
              }}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!form.legalName || saving}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              cursor: form.legalName && !saving ? 'pointer' : 'not-allowed',
              opacity: form.legalName && !saving ? 1 : 0.5,
              fontSize: '14px'
            }}
          >
            {saving ? 'Creating...' : 'Create Profile'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', paddingBottom: '120px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)', marginBottom: '8px' }}>
          Company Profile
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Manage your organization's identity, registration, compliance, and operational information
        </p>
      </div>

      {notify && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '16px',
          background: notify.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: notify.type === 'success' ? '#10b981' : '#ef4444',
          fontSize: '14px'
        }}>
          {notify.message}
        </div>
      )}

      <div style={{ display: 'grid', gap: '24px' }}>
        {/* Identity & Branding */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px', marginTop: 0 }}>
            Identity & Branding
          </h3>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Logo
            </label>
            <div style={{
              border: '2px dashed var(--border)',
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'var(--input-bg)',
              transition: 'all 0.2s'
            }}
              onDragOver={(e) => { e.preventDefault() }}
              onDrop={(e) => {
                e.preventDefault()
                const files = e.dataTransfer.files
                if (files.length > 0) {
                  setLogo(files[0])
                  const reader = new FileReader()
                  reader.onloadend = () => setLogoPreview(reader.result)
                  reader.readAsDataURL(files[0])
                }
              }}
            >
              {logoPreview ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <img src={logoPreview} alt="Logo preview" style={{ maxWidth: '100px', maxHeight: '100px', borderRadius: '4px' }} />
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
                    <span style={{ color: '#6366f1', textDecoration: 'underline' }}>Click or drag to replace</span>
                  </label>
                </div>
              ) : (
                <label style={{ cursor: 'pointer' }}>
                  <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    <p style={{ margin: '0 0 4px 0' }}>Drag and drop your logo here</p>
                    <p style={{ margin: 0, fontSize: '12px' }}>or <span style={{ color: '#6366f1', textDecoration: 'underline' }}>click to browse</span></p>
                  </div>
                </label>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Legal Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                name="legalName"
                value={form.legalName}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Trading Name
              </label>
              <input
                type="text"
                name="tradingName"
                value={form.tradingName}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Company Type
              </label>
              <select
                name="companyType"
                value={form.companyType}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              >
                <option value="llc">LLC</option>
                <option value="corporation">Corporation</option>
                <option value="partnership">Partnership</option>
                <option value="sole_proprietorship">Sole Proprietorship</option>
                <option value="free_zone">Free Zone</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Industry
              </label>
              <input
                type="text"
                name="industry"
                value={form.industry}
                onChange={handleChange}
                placeholder="e.g. Technology, Manufacturing"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Establishment Date
              </label>
              <input
                type="date"
                name="establishmentDate"
                value={form.establishmentDate}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Company Size
              </label>
              <select
                name="companySize"
                value={form.companySize}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              >
                <option value="">Select size</option>
                <option value="startup">Startup (1-10)</option>
                <option value="small">Small (11-50)</option>
                <option value="medium">Medium (51-250)</option>
                <option value="large">Large (250+)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Registration & License */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px', marginTop: 0 }}>
            Registration & License
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Registration Number
              </label>
              <input
                type="text"
                name="registrationNumber"
                value={form.registrationNumber}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Country of Incorporation
              </label>
              <input
                type="text"
                name="countryOfIncorporation"
                value={form.countryOfIncorporation}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                License Expiry Date
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <input
                  type="date"
                  name="licenseExpiryDate"
                  value={form.licenseExpiryDate}
                  onChange={handleChange}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    background: 'var(--input-bg)',
                    color: 'var(--text)'
                  }}
                />
                {form.licenseExpiryDate && (
                  <div style={{ marginTop: '4px' }}>
                    <ExpiryBadge expiryDate={form.licenseExpiryDate} reminderDaysBefore={30} />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                License Issuing Authority
              </label>
              <input
                type="text"
                name="licenseIssuingAuthority"
                value={form.licenseIssuingAuthority}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>
          </div>
        </div>

        {/* Tax */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px', marginTop: 0 }}>
            Tax Information
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                TRN (Tax Registration Number)
              </label>
              <input
                type="text"
                name="trn"
                value={form.trn}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Tax Registration Date
              </label>
              <input
                type="date"
                name="taxRegistrationDate"
                value={form.taxRegistrationDate}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>
          </div>
        </div>

        {/* Contact */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px', marginTop: 0 }}>
            Contact Information
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Primary Email
              </label>
              <input
                type="email"
                name="primaryEmail"
                value={form.primaryEmail}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Phone
              </label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Alternate Phone
              </label>
              <input
                type="tel"
                name="alternatePhone"
                value={form.alternatePhone}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Fax
              </label>
              <input
                type="tel"
                name="fax"
                value={form.fax}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Website
              </label>
              <input
                type="url"
                name="website"
                value={form.website}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>
          </div>
        </div>

        {/* Address */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px', marginTop: 0 }}>
            Address Information
          </h3>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="useSameAddress"
                checked={form.useSameAddress}
                onChange={handleChange}
                style={{ cursor: 'pointer' }}
              />
              Use same address for mailing
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: form.useSameAddress ? '1fr' : '1fr 1fr', gap: '16px' }}>
            {/* HQ Address */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '12px', marginTop: 0 }}>
                Headquarters Address
              </h4>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                  Street
                </label>
                <input
                  type="text"
                  name="address.street"
                  value={form.address.street}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    background: 'var(--input-bg)',
                    color: 'var(--text)'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                    City
                  </label>
                  <input
                    type="text"
                    name="address.city"
                    value={form.address.city}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      background: 'var(--input-bg)',
                      color: 'var(--text)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                    State
                  </label>
                  <input
                    type="text"
                    name="address.state"
                    value={form.address.state}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      background: 'var(--input-bg)',
                      color: 'var(--text)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                    Country
                  </label>
                  <input
                    type="text"
                    name="address.country"
                    value={form.address.country}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      background: 'var(--input-bg)',
                      color: 'var(--text)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                    Postal Code
                  </label>
                  <input
                    type="text"
                    name="address.postalCode"
                    value={form.address.postalCode}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      background: 'var(--input-bg)',
                      color: 'var(--text)'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginTop: '8px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                  P.O. Box
                </label>
                <input
                  type="text"
                  name="address.poBox"
                  value={form.address.poBox}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    background: 'var(--input-bg)',
                    color: 'var(--text)'
                  }}
                />
              </div>
            </div>

            {/* Mailing Address */}
            {!form.useSameAddress && (
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '12px', marginTop: 0 }}>
                  Mailing Address
                </h4>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                    Street
                  </label>
                  <input
                    type="text"
                    name="mailingAddress.street"
                    value={form.mailingAddress.street}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      background: 'var(--input-bg)',
                      color: 'var(--text)'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                      City
                    </label>
                    <input
                      type="text"
                      name="mailingAddress.city"
                      value={form.mailingAddress.city}
                      onChange={handleChange}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                        background: 'var(--input-bg)',
                        color: 'var(--text)'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                      State
                    </label>
                    <input
                      type="text"
                      name="mailingAddress.state"
                      value={form.mailingAddress.state}
                      onChange={handleChange}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                        background: 'var(--input-bg)',
                        color: 'var(--text)'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                      Country
                    </label>
                    <input
                      type="text"
                      name="mailingAddress.country"
                      value={form.mailingAddress.country}
                      onChange={handleChange}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                        background: 'var(--input-bg)',
                        color: 'var(--text)'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                      Postal Code
                    </label>
                    <input
                      type="text"
                      name="mailingAddress.postalCode"
                      value={form.mailingAddress.postalCode}
                      onChange={handleChange}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                        background: 'var(--input-bg)',
                        color: 'var(--text)'
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '8px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                    P.O. Box
                  </label>
                  <input
                    type="text"
                    name="mailingAddress.poBox"
                    value={form.mailingAddress.poBox}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      background: 'var(--input-bg)',
                      color: 'var(--text)'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Operational */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px', marginTop: 0 }}>
            Operational Information
          </h3>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Working Hours
            </label>
            <input
              type="text"
              name="workingHours"
              value={form.workingHours}
              onChange={handleChange}
              placeholder="e.g. 9:00 AM - 6:00 PM"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'var(--input-bg)',
                color: 'var(--text)'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Business Description
            </label>
            <textarea
              name="businessDescription"
              value={form.businessDescription}
              onChange={handleChange}
              placeholder="Brief description of business activities"
              rows="3"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
              Key Services (comma-separated)
            </label>
            <input
              type="text"
              name="keyServices"
              value={form.keyServices}
              onChange={handleChange}
              placeholder="e.g. Consulting, Development, Support"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'var(--input-bg)',
                color: 'var(--text)'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Number of Employees
              </label>
              <input
                type="number"
                name="numberOfEmployees"
                value={form.numberOfEmployees}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Annual Revenue Range
              </label>
              <select
                name="annualRevenueRange"
                value={form.annualRevenueRange}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              >
                <option value="">Select range</option>
                <option value="under_1m">Under 1M</option>
                <option value="1m_5m">1M - 5M</option>
                <option value="5m_10m">5M - 10M</option>
                <option value="10m_50m">10M - 50M</option>
                <option value="over_50m">Over 50M</option>
              </select>
            </div>
          </div>
        </div>

        {/* Banking */}
        {isAdmin && (
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px',
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <svg viewBox="0 0 24 24" fill="#f59e0b" style={{ width: '20px', height: '20px' }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: 0, marginTop: 0 }}>
                Banking Information (Admin Only)
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                  Bank Name
                </label>
                <input
                  type="text"
                  name="bankName"
                  value={form.bankName}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    background: 'var(--input-bg)',
                    color: 'var(--text)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                  Account Name
                </label>
                <input
                  type="text"
                  name="accountName"
                  value={form.accountName}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    background: 'var(--input-bg)',
                    color: 'var(--text)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                  Account Number
                </label>
                <input
                  type="text"
                  name="accountNumber"
                  value={form.accountNumber}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    background: 'var(--input-bg)',
                    color: 'var(--text)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                  IBAN
                </label>
                <input
                  type="text"
                  name="iban"
                  value={form.iban}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    background: 'var(--input-bg)',
                    color: 'var(--text)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                  SWIFT Code
                </label>
                <input
                  type="text"
                  name="swiftCode"
                  value={form.swiftCode}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    background: 'var(--input-bg)',
                    color: 'var(--text)'
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Social & Online */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px', marginTop: 0 }}>
            Social & Online
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                LinkedIn
              </label>
              <input
                type="url"
                name="linkedIn"
                value={form.linkedIn}
                onChange={handleChange}
                placeholder="https://linkedin.com/company/..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Twitter
              </label>
              <input
                type="url"
                name="twitter"
                value={form.twitter}
                onChange={handleChange}
                placeholder="https://twitter.com/..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Facebook
              </label>
              <input
                type="url"
                name="facebook"
                value={form.facebook}
                onChange={handleChange}
                placeholder="https://facebook.com/..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>
                Instagram
              </label>
              <input
                type="url"
                name="instagram"
                value={form.instagram}
                onChange={handleChange}
                placeholder="https://instagram.com/..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text)'
                }}
              />
            </div>
          </div>
        </div>

        {/* Edit History - Admin Only */}
        {isAdmin && edits.length > 0 && (
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '16px', marginTop: 0 }}>
              Edit History
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {edits.map((edit, idx) => (
                <div key={idx} style={{
                  paddingLeft: '16px',
                  borderLeft: '2px solid var(--border)',
                  paddingBottom: '12px'
                }}>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text)', margin: '0 0 4px 0' }}>
                    {edit.editedBy?.name || 'Unknown'} • {new Date(edit.editedAt).toLocaleString()}
                  </p>
                  {edit.changes?.map((change, cidx) => (
                    <p key={cidx} style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0' }}>
                      <strong>{change.field}:</strong> {change.from} → {change.to}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Save Footer */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--card)',
        borderTop: '1px solid var(--border)',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          style={{
            padding: '10px 24px',
            background: isDirty ? '#6366f1' : '#d1d5db',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: isDirty && !saving ? 'pointer' : 'not-allowed',
            opacity: isDirty && !saving ? 1 : 0.6,
            fontSize: '14px'
          }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
