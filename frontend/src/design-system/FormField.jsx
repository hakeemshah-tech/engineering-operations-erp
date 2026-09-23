import './FormField.css'

/**
 * Shared Form Field Component
 * Provides consistent form field styling and behavior
 */
export function FormField({ 
  label, 
  children, 
  error, 
  required = false,
  className = '',
  ...props 
}) {
  return (
    <div className={`form-group ${className}`} {...props}>
      {label && (
        <label>
          {label}
          {required && <span className="required-indicator"> *</span>}
        </label>
      )}
      {children}
      {error && <div className="form-error">{error}</div>}
    </div>
  )
}

/**
 * Form Row - for side-by-side fields
 */
export function FormRow({ children, className = '', ...props }) {
  return (
    <div className={`form-row ${className}`} {...props}>
      {children}
    </div>
  )
}

/**
 * Form Section - for grouping related fields
 */
export function FormSection({ title, children, className = '', ...props }) {
  return (
    <div className={`form-section ${className}`} {...props}>
      {title && (
        <div className="section-header">
          <h3>{title}</h3>
        </div>
      )}
      {children}
    </div>
  )
}

