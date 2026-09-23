import { useMemo, useState } from 'react'
import { hasAnyRole } from '../lib/roles'

function idOf(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return String(v._id || v.id || '')
}

const SUPERVISOR_ROLES = ['admin', 'manager', 'project_engineer', 'site_supervisor', 'supervisor']
const ANY_TEAM_MGMT_ROLES = [...SUPERVISOR_ROLES] // any of these MAY manage; final gate is project membership

/**
 * Read-only Site Team display for the Project Detail page.
 * Lists supervisors and workers as static information. All editing happens via
 * the "Manage Site Team" button which opens ManageSiteTeamModal.
 *
 * Props:
 *   project - the loaded project document
 *   onManageClick - invoked when the manage button is clicked (parent opens modal)
 */
export default function SiteTeamView({ project, onManageClick }) {
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  }, [])

  const canSeeManageButton = useMemo(() => {
    if (!project) return false
    const myId = String(currentUser?.id || currentUser?._id || '')
    if (hasAnyRole(currentUser, ['admin', 'manager'])) return true
    if (hasAnyRole(currentUser, ['project_engineer'])) {
      return (project.assignedProjectEngineer || []).some(e => idOf(e) === myId)
    }
    if (hasAnyRole(currentUser, ['site_supervisor', 'supervisor'])) {
      // Show the button optimistically - server will gate the actual save.
      return true
    }
    return false
  }, [project, currentUser])

  if (!project) return null

  const supervisors = Array.isArray(project.supervisors) ? project.supervisors : []
  const workers = Array.isArray(project.workers) ? project.workers : []

  return (
    <div className="ld-card ld-section">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        flexWrap: 'wrap'
      }}>
        <div>
          <h3 style={{ color: 'var(--text)', margin: 0 }}>Site Team</h3>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Supervisors and workers currently assigned to this project. Workers listed here are visible in project-scoped attendance.
          </p>
        </div>
        {canSeeManageButton && (
          <button
            type="button"
            onClick={onManageClick}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
            }}
          >
            Manage Site Team
          </button>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 14,
        marginTop: 16
      }}>
        <TeamPanel
          title="Supervisors"
          accentColor="#6366f1"
          members={supervisors}
        />
        <TeamPanel
          title="Workers"
          accentColor="#10b981"
          members={workers}
        />
      </div>
    </div>
  )
}

function TeamPanel({ title, accentColor, members }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? members : members.slice(0, 5)
  const hidden = members.length - visible.length

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 14
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10
      }}>
        <span style={{
          fontSize: '0.92rem',
          fontWeight: 700,
          color: 'var(--text)'
        }}>{title}</span>
        <span style={{
          background: accentColor,
          color: '#fff',
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: '0.72rem',
          fontWeight: 600
        }}>{members.length}</span>
      </div>

      {members.length === 0 ? (
        <div style={{
          color: 'var(--text-muted)',
          fontSize: '0.88rem',
          fontStyle: 'italic',
          padding: '8px 0'
        }}>
          No {title.toLowerCase()} assigned yet.
        </div>
      ) : (
        <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          {visible.map(m => {
            const id = m._id || m.id || m
            return (
              <li
                key={id}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'var(--input)',
                  borderLeft: `3px solid ${accentColor}`,
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 0
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {m.name || (typeof m === 'string' ? id : 'Unknown')}
                </span>
                {m.email && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {m.email}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 10,
            background: 'transparent',
            border: 'none',
            color: accentColor,
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            padding: 0
          }}
        >
          Show {hidden} more…
        </button>
      )}
      {expanded && members.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{
            marginTop: 10,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            padding: 0
          }}
        >
          Show less
        </button>
      )}
    </div>
  )
}
