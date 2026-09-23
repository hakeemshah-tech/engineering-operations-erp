import { Modal } from '../../design-system/Modal'
import './locations.css'

/**
 * Confirmation modal shown before saving an edit to a Location or
 * Location Group that other records depend on. The intent is to make the
 * blast-radius of the change explicit ("you are about to change a location
 * that 14 employees and 3 projects depend on") so curators don't silently
 * break a large roster.
 *
 * Props:
 *   isOpen, onClose, onConfirm, loading
 *   entityType: 'location' | 'group'
 *   entityName
 *   deps: object returned by GET /:id/dependencies, shape varies per entityType:
 *     - location: { employeeCount, projectCount, locationGroupCount, breakdown:{asBase,asAdditional,viaGroup,asProjectSite}, groups:[{_id,name}] }
 *     - group:    { employeeCount, breakdown:{viaGroup} }
 */
export default function DependencyConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  loading = false,
  entityType = 'location',
  entityName = '',
  deps = null
}) {
  if (!deps) return null

  const isLocation = entityType === 'location'
  const employeeCount = Number(deps.employeeCount) || 0
  const projectCount = Number(deps.projectCount) || 0
  const groupCount = Number(deps.locationGroupCount) || 0
  const totalRefs = employeeCount + projectCount + groupCount

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isLocation ? 'Confirm location change' : 'Confirm location group change'}
      size="medium"
    >
      <div className="loc-dep-modal">
        <div className="loc-dep-summary">
          <p style={{ marginTop: 0, marginBottom: 12 }}>
            You are about to save changes to <strong>{entityName}</strong>.
          </p>
          {totalRefs === 0 ? (
            <div className="loc-banner" style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(34,197,94,.10)',
              border: '1px solid rgba(34,197,94,.35)',
              color: 'var(--text)',
              fontSize: '0.9rem',
              lineHeight: 1.5
            }}>
              ✓ No records currently reference this {isLocation ? 'location' : 'group'}. The change is safe to save.
            </div>
          ) : (
            <div className="loc-banner" style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(245,158,11,.10)',
              border: '1px solid rgba(245,158,11,.40)',
              color: 'var(--text)',
              fontSize: '0.9rem',
              lineHeight: 1.5
            }}>
              ⚠ This {isLocation ? 'location' : 'group'} is currently in use. Saving will affect the records listed below.
            </div>
          )}
        </div>

        <div className="loc-dep-grid">
          <DepCard
            label="Employees"
            value={employeeCount}
            hint={
              isLocation
                ? 'Linked via base, additional, or group membership.'
                : 'Linked via group assignment.'
            }
          />
          {isLocation && (
            <DepCard
              label="Projects"
              value={projectCount}
              hint="Using this location as their site geofence."
            />
          )}
          {isLocation && (
            <DepCard
              label="Location groups"
              value={groupCount}
              hint="Groups that include this location as a member."
            />
          )}
        </div>

        {isLocation && deps.breakdown && (
          <div className="loc-dep-breakdown">
            <div className="loc-dep-breakdown-title">Employee link breakdown</div>
            <ul className="loc-dep-breakdown-list">
              <li><span>As base location</span><strong>{deps.breakdown.asBase || 0}</strong></li>
              <li><span>As an additional location</span><strong>{deps.breakdown.asAdditional || 0}</strong></li>
              <li><span>Inherited via a location group</span><strong>{deps.breakdown.viaGroup || 0}</strong></li>
              <li><span>Projects using it as the site location</span><strong>{deps.breakdown.asProjectSite || 0}</strong></li>
            </ul>
            <div className="loc-dep-note">
              Employees may appear in more than one row — the top "Employees" count is de-duplicated.
            </div>
          </div>
        )}

        {isLocation && Array.isArray(deps.groups) && deps.groups.length > 0 && (
          <div className="loc-dep-groups">
            <div className="loc-dep-breakdown-title">Member of groups</div>
            <div className="loc-dep-chips">
              {deps.groups.map(g => (
                <span key={g._id} className="loc-dep-chip">{g.name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="loc-form-actions">
          <button
            type="button"
            className="loc-btn loc-btn-ghost"
            onClick={onClose}
            disabled={loading}
          >Cancel</button>
          <button
            type="button"
            className="loc-btn loc-btn-primary"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Saving...' : (totalRefs === 0 ? 'Save changes' : 'Save anyway')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DepCard({ label, value, hint }) {
  return (
    <div className="loc-dep-card">
      <div className="loc-dep-card-value">{value}</div>
      <div className="loc-dep-card-label">{label}</div>
      {hint && <div className="loc-dep-card-hint">{hint}</div>}
    </div>
  )
}
