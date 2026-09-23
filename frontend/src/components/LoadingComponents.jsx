import React from 'react'
import './LoadingComponents.css'

// Indeterminate Spinner (circular)
export const Spinner = ({ size = 'medium', className = '', ariaLabel = 'Loading' }) => {
  const sizeClass = size === 'small' ? 'spinner-small' : size === 'large' ? 'spinner-large' : 'spinner-medium'
  return (
    <div 
      className={`spinner ${sizeClass} ${className}`}
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
    >
      <div className="spinner-circle"></div>
    </div>
  )
}

// Dots/Ellipsis Loader
export const DotsLoader = ({ text = 'Loading', className = '' }) => {
  return (
    <span 
      className={`dots-loader ${className}`}
      role="status"
      aria-busy="true"
      aria-label={`${text}...`}
    >
      {text}
      <span className="dots">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </span>
  )
}

// Skeleton Shimmer Component
export const Skeleton = ({ width, height, className = '', rounded = false }) => {
  const style = {
    width: width || '100%',
    height: height || '1em',
    borderRadius: rounded ? '4px' : '0'
  }
  return (
    <div 
      className={`skeleton ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}

// Skeleton Table Row
export const SkeletonTableRow = ({ columns = 5 }) => {
  return (
    <tr className="skeleton-row">
      {Array.from({ length: columns }).map((_, idx) => (
        <td key={idx}>
          <Skeleton height="20px" />
        </td>
      ))}
    </tr>
  )
}

// Skeleton Card
export const SkeletonCard = () => {
  return (
    <div className="skeleton-card">
      <Skeleton height="24px" width="60%" className="skeleton-title" />
      <Skeleton height="16px" width="40%" className="skeleton-subtitle" />
      <Skeleton height="16px" width="80%" />
      <Skeleton height="16px" width="70%" />
      <Skeleton height="16px" width="90%" />
    </div>
  )
}

// Linear Progress Bar (Determinate)
export const ProgressBar = ({ 
  value = 0, 
  max = 100, 
  showPercentage = false, 
  label = '', 
  className = '' 
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  
  return (
    <div 
      className={`progress-bar-container ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label || `Progress: ${percentage.toFixed(0)}%`}
    >
      {label && <div className="progress-label">{label}</div>}
      <div className="progress-bar-track">
        <div 
          className="progress-bar-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showPercentage && (
        <div className="progress-percentage">{percentage.toFixed(0)}%</div>
      )}
    </div>
  )
}

// Circular Determinate Progress
export const CircularProgress = ({ 
  value = 0, 
  max = 100, 
  size = 48, 
  showLabel = true,
  label = '',
  className = '' 
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference
  
  return (
    <div 
      className={`circular-progress ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label || `Progress: ${percentage.toFixed(0)}%`}
    >
      <svg width={size} height={size} className="circular-progress-svg">
        <circle
          className="circular-progress-background"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
        />
        <circle
          className="circular-progress-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {showLabel && (
        <div className="circular-progress-label">{percentage.toFixed(0)}%</div>
      )}
    </div>
  )
}

// Button Loader (for inline button loading states)
export const ButtonLoader = ({ loading = false, children, className = '' }) => {
  if (!loading) return children
  
  return (
    <span className={`button-loader ${className}`}>
      <Spinner size="small" ariaLabel="Processing" />
      <span className="button-loader-text">{children}</span>
    </span>
  )
}

// Page-level Skeleton
export const PageSkeleton = ({ showHeader = true, showFilters = true, showContent = true }) => {
  return (
    <div className="page-skeleton" aria-busy="true" aria-label="Loading page">
      {showHeader && (
        <div className="skeleton-header">
          <Skeleton height="32px" width="200px" />
          <Skeleton height="24px" width="150px" />
        </div>
      )}
      {showFilters && (
        <div className="skeleton-filters">
          <Skeleton height="36px" width="200px" />
          <Skeleton height="36px" width="200px" />
        </div>
      )}
      {showContent && (
        <div className="skeleton-content">
          {Array.from({ length: 6 }).map((_, idx) => (
            <SkeletonCard key={idx} />
          ))}
        </div>
      )}
    </div>
  )
}

// Inline Field Loader
export const FieldLoader = ({ loading = false, children }) => {
  if (!loading) return children
  
  return (
    <div className="field-loader" role="status" aria-busy="true">
      {children}
      <Spinner size="small" className="field-loader-spinner" />
    </div>
  )
}

