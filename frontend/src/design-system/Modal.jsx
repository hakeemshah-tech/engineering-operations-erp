import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './Modal.css'

/**
 * Shared Modal Component
 * Provides consistent modal layout and behavior across the application
 * Features:
 * - Scroll lock on body when open
 * - Focus trap inside modal
 * - Escape key handling
 * - Backdrop click to dismiss
 */
export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'medium',
  className = '',
  showCloseButton = true,
  closeOnOverlayClick = true,
  headerActions = null
}) {
  const modalRef = useRef(null)
  const previousActiveElement = useRef(null)

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      // Store the currently focused element
      previousActiveElement.current = document.activeElement
      
      // Lock body scroll
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      document.body.style.paddingRight = `${scrollbarWidth}px`
      
      // Focus the modal container for accessibility
      if (modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const firstFocusable = focusableElements[0]
        if (firstFocusable) {
          firstFocusable.focus()
        }
      }
    } else {
      // Restore body scroll
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
      
      // Restore focus to previous element
      if (previousActiveElement.current && previousActiveElement.current.focus) {
        previousActiveElement.current.focus()
      }
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = ''
      document.body.style.paddingRight = ''
    }
  }, [isOpen])

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e) => {
      if (e.key === 'Escape' && closeOnOverlayClick) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose, closeOnOverlayClick])

  // Focus trap: keep focus within modal
  useEffect(() => {
    if (!isOpen || !modalRef.current) return

    const modal = modalRef.current
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstFocusable = focusableElements[0]
    const lastFocusable = focusableElements[focusableElements.length - 1]

    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
          e.preventDefault()
          lastFocusable?.focus()
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable) {
          e.preventDefault()
          firstFocusable?.focus()
        }
      }
    }

    modal.addEventListener('keydown', handleTabKey)
    return () => {
      modal.removeEventListener('keydown', handleTabKey)
    }
  }, [isOpen])

  const sizeClasses = {
    small: 'modal-size-small',
    medium: 'modal-size-medium',
    large: 'modal-size-large',
    xlarge: 'modal-size-xlarge'
  }

  const modalContent = (
    <div 
      className={`modal-overlay ${className}`}
      onClick={closeOnOverlayClick ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      style={{
        // Force transparent background to match Add Lead modal
        backgroundColor: 'rgba(0, 0, 0, 0.48)',
        WebkitBackdropFilter: 'blur(1px)',
        backdropFilter: 'blur(1px)',
      }}
    >
      <div 
        ref={modalRef}
        className={`modal ${sizeClasses[size] || sizeClasses.medium}`}
        onClick={e => e.stopPropagation()}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="modal-header">
          {title && <h2 id="modal-title">{title}</h2>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {headerActions}
            {showCloseButton && (
              <button 
                onClick={onClose} 
                className="close-btn" 
                aria-label="Close modal"
                type="button"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  )

  // Portal modal to document.body to avoid stacking context issues
  if (!isOpen) return null
  
  return createPortal(modalContent, document.body)
}

