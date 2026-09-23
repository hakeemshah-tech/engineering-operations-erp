import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'object' && v.$numberDecimal !== undefined) return parseFloat(v.$numberDecimal)
  return parseFloat(v) || 0
}

function KpiCard({ label, value, subtext, onClick, accent = 'rgba(31, 71, 136, 0.1)', color = '#1F4788', icon = '📊' }) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        background: 'var(--card)',
        borderRadius: 12,
        padding: 20,
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        minWidth: 200,
        flex: 1
      }}
    >
      <div style={{ background: accent, color, width: 44, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 22 }}>{icon}</div>
      <div>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>{label}</p>
        <p style={{ margin: '4px 0 0', color: 'var(--text)', fontSize: 24, fontWeight: 700 }}>{value}</p>
        {subtext && <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 11 }}>{subtext}</p>}
      </div>
    </div>
  )
}

function money(v) { return 'AED ' + toNum(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function AccountsDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    draftJournals: 0,
    postedJournals: 0,
    pendingSync: 0,
    downloadedSync: 0,
    syncedCount: 0,
    coaCount: 0,
    billsDraft: 0,
    billsMatched: 0,
    billsJournalized: 0,
    claimsDraft: 0,
    claimsApproved: 0,
    claimsJournalized: 0,
    apOutstanding: 0,
    arOutstanding: 0,
    latestSalaryRun: null
  })

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try {
      const [drafts, posted, tallyPending, coa, billsDraft, billsMatched, billsJournalized, claimsDraft, claimsApproved, claimsJournalized, salary] = await Promise.all([
        api.get('/api/accounts/journal-entries?status=DRAFT&limit=1'),
        api.get('/api/accounts/journal-entries?status=POSTED&limit=1'),
        api.get('/api/accounts/tally/pending?syncStatus=PENDING&limit=1'),
        api.get('/api/accounts/chart-of-accounts'),
        api.get('/api/accounts/supplier-bills?status=draft&limit=1'),
        api.get('/api/accounts/supplier-bills?status=matched&limit=200'),
        api.get('/api/accounts/supplier-bills?status=journalized&limit=200'),
        api.get('/api/accounts/sales-claims?status=draft&limit=1'),
        api.get('/api/accounts/sales-claims?status=approved&limit=200'),
        api.get('/api/accounts/sales-claims?status=journalized&limit=200'),
        api.get('/api/accounts/salary-runs?limit=1')
      ])

      // AP outstanding = sum of journalized bills not yet paid
      const apOutstanding = (billsJournalized.data.items || []).reduce((s, b) => s + toNum(b.totalAmount), 0)
      // AR outstanding = sum of journalized claims not yet collected
      const arOutstanding = (claimsJournalized.data.items || []).reduce((s, c) => s + toNum(c.netInvoiceAmount), 0)

      setStats({
        draftJournals: drafts.data.total || 0,
        postedJournals: posted.data.total || 0,
        pendingSync: tallyPending.data.summary?.PENDING || 0,
        downloadedSync: tallyPending.data.summary?.DOWNLOADED || 0,
        syncedCount: tallyPending.data.summary?.SYNCED || 0,
        coaCount: Array.isArray(coa.data) ? coa.data.length : 0,
        billsDraft: billsDraft.data.total || 0,
        billsMatched: billsMatched.data.total || 0,
        billsJournalized: billsJournalized.data.total || 0,
        claimsDraft: claimsDraft.data.total || 0,
        claimsApproved: claimsApproved.data.total || 0,
        claimsJournalized: claimsJournalized.data.total || 0,
        apOutstanding,
        arOutstanding,
        latestSalaryRun: (salary.data.items || [])[0] || null
      })
    } catch (err) {
      console.error('Error loading dashboard stats:', err)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: 'var(--text)' }}>Accounts Dashboard</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
          Financial overlay across POs, Sales Claims, Salary Preparation and Tally sync.
        </p>
      </div>

      {/* Row 1: Tally sync */}
      <h3 style={{ color: 'var(--text-muted)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' }}>Tally Sync</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Pending XML" icon="⏳" value={stats.pendingSync} subtext="Not yet downloaded"
          onClick={() => navigate('/accounts/tally-sync')} accent="rgba(245,158,11,0.1)" color="#f59e0b" />
        <KpiCard label="Downloaded (awaiting ack)" icon="⬇" value={stats.downloadedSync} subtext="Ready for Tally import"
          onClick={() => navigate('/accounts/tally-sync')} accent="rgba(59,130,246,0.1)" color="#3b82f6" />
        <KpiCard label="Synced" icon="✓" value={stats.syncedCount} subtext="Confirmed in Tally"
          onClick={() => navigate('/accounts/tally-sync')} accent="rgba(16,185,129,0.1)" color="#10b981" />
        <KpiCard label="Chart of Accounts" icon="📒" value={stats.coaCount} subtext="Active ledgers"
          onClick={() => navigate('/accounts/chart')} accent="rgba(168,85,247,0.1)" color="#a855f7" />
      </div>

      {/* Row 2: AP / AR */}
      <h3 style={{ color: 'var(--text-muted)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' }}>Accounts Payable / Receivable</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <KpiCard label="AP Outstanding" icon="📤" value={money(stats.apOutstanding)} subtext={`${stats.billsJournalized} journalized bill(s)`}
          onClick={() => navigate('/accounts/bills')} accent="rgba(239,68,68,0.1)" color="#ef4444" />
        <KpiCard label="AR Outstanding" icon="📥" value={money(stats.arOutstanding)} subtext={`${stats.claimsJournalized} invoiced claim(s)`}
          onClick={() => navigate('/accounts/claims')} accent="rgba(16,185,129,0.1)" color="#10b981" />
        <KpiCard label="Bills to Match/Post" icon="🧾" value={stats.billsDraft + stats.billsMatched} subtext={`${stats.billsDraft} draft · ${stats.billsMatched} matched`}
          onClick={() => navigate('/accounts/bills')} accent="rgba(245,158,11,0.1)" color="#f59e0b" />
        <KpiCard label="Claims to Approve/Invoice" icon="💰" value={stats.claimsDraft + stats.claimsApproved} subtext={`${stats.claimsDraft} draft · ${stats.claimsApproved} approved`}
          onClick={() => navigate('/accounts/claims')} accent="rgba(59,130,246,0.1)" color="#3b82f6" />
      </div>

      {/* Row 3: Salary + manual */}
      <h3 style={{ color: 'var(--text-muted)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' }}>Salary Preparation & Manual Journals</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <KpiCard label="Draft Journals" icon="📝" value={stats.draftJournals} subtext="Awaiting posting"
          onClick={() => navigate('/accounts/journals?status=DRAFT')} accent="rgba(245,158,11,0.1)" color="#f59e0b" />
        <KpiCard label="Posted Journals" icon="✔" value={stats.postedJournals} subtext="Locked, ready for Tally"
          onClick={() => navigate('/accounts/journals?status=POSTED')} accent="rgba(16,185,129,0.1)" color="#10b981" />
        {stats.latestSalaryRun ? (
          <KpiCard
            label={`Latest Salary Run (${stats.latestSalaryRun.runNumber})`}
            icon="💼"
            value={money(stats.latestSalaryRun.totals?.netPay)}
            subtext={`${stats.latestSalaryRun.totals?.employeeCount || 0} staff · ${stats.latestSalaryRun.status}`}
            onClick={() => navigate(`/accounts/salary-preparation/${stats.latestSalaryRun._id}`)}
            accent="rgba(168,85,247,0.1)" color="#a855f7"
          />
        ) : (
          <KpiCard label="Salary Preparation" icon="💼" value="—" subtext="No runs yet"
            onClick={() => navigate('/accounts/salary-preparation')} accent="rgba(168,85,247,0.1)" color="#a855f7" />
        )}
      </div>

      {/* Quick actions */}
      <div style={{ background: 'var(--card)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Quick Actions</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button className="save-btn" onClick={() => navigate('/accounts/bills/create')}>+ Enter Supplier Bill</button>
          <button className="save-btn" onClick={() => navigate('/accounts/claims/create')}>+ New Sales Claim</button>
          <button className="save-btn" onClick={() => navigate('/accounts/journals/create')}>+ Manual Journal</button>
          <button className="save-btn" style={{ background: 'var(--primary)' }} onClick={() => navigate('/accounts/tally-sync')}>Open Tally Queue</button>
          <button className="save-btn" style={{ background: '#a855f7' }} onClick={() => navigate('/accounts/tally-setup')}>Tally Setup (First-Time)</button>
        </div>
      </div>
    </div>
  )
}
