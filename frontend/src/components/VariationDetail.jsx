import { useEffect, useState, useRef } from 'react'
import { api, apiFetch } from '../lib/api'
import './LeadManagement.css'
import './LeadDetail.css'
import './LoadingComponents.css'
import logo from '../assets/logo/app-logo.png'
import { Spinner, Skeleton, PageSkeleton, ButtonLoader } from './LoadingComponents'

// Google Docs-style Rich Text Editor using contentEditable (compatible with React 19)
function ScopeOfWorkEditor({ value, onChange }) {
  const editorRef = useRef(null)
  const savedSelectionRef = useRef(null)
  const [isFocused, setIsFocused] = useState(false)
  const [fontSize, setFontSize] = useState('14')
  const [fontSizeInput, setFontSizeInput] = useState('14')
  const [showFontSizeDropdown, setShowFontSizeDropdown] = useState(false)
  const [fontFamily, setFontFamily] = useState('Arial')
  const [textColor, setTextColor] = useState('#000000')
  const [highlightColor, setHighlightColor] = useState('#ffff00')
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  useEffect(() => {
    if (editorRef.current) {
      const currentHtml = editorRef.current.innerHTML
      const newValue = value || ''
      if (currentHtml !== newValue) {
        editorRef.current.innerHTML = newValue
      }
    }
  }, [value])

  useEffect(() => {
    if (!showFontSizeDropdown) return
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-font-size-container]')) {
        setShowFontSizeDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFontSizeDropdown])

  const handleInput = (e) => {
    const html = e.target.innerHTML
    onChange(html)
    setTimeout(() => saveSelection(), 0)
  }
  
  useEffect(() => {
    if (!isFocused || !editorRef.current) return
    const handleMouseUp = (e) => {
      if (editorRef.current?.contains(e.target)) {
        setTimeout(() => saveSelection(), 0)
      }
    }
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        if (editorRef.current?.contains(range.anchorNode)) {
          saveSelection()
        }
      }
    }
    editorRef.current.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      if (editorRef.current) {
        editorRef.current.removeEventListener('mouseup', handleMouseUp)
      }
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [isFocused])

  const handlePaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }

  const handleUndo = () => {
    document.execCommand('undo', false, null)
    editorRef.current?.focus()
  }

  const handleRedo = () => {
    document.execCommand('redo', false, null)
    editorRef.current?.focus()
  }

  const expandToWord = (range) => {
    try {
      if (range.expand) {
        range.expand('word')
      }
    } catch (e) {
      const textNode = range.startContainer
      if (textNode && textNode.nodeType === 3) {
        const text = textNode.textContent
        const start = range.startOffset
        let wordStart = start
        let wordEnd = start
        while (wordStart > 0 && /\S/.test(text[wordStart - 1])) {
          wordStart--
        }
        while (wordEnd < text.length && /\S/.test(text[wordEnd])) {
          wordEnd++
        }
        if (wordStart < wordEnd) {
          range.setStart(textNode, wordStart)
          range.setEnd(textNode, wordEnd)
        }
      }
    }
  }

  const saveSelection = () => {
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (editorRef.current && 
          (editorRef.current.contains(range.anchorNode) || editorRef.current.contains(range.focusNode))) {
        if (!range.collapsed) {
          savedSelectionRef.current = range.cloneRange()
        } else {
          savedSelectionRef.current = null
        }
      }
    }
  }

  const applyFontSize = (size) => {
    if (!savedSelectionRef.current) {
      if (editorRef.current) {
        editorRef.current.focus()
      }
      return
    }
    
    const savedRange = savedSelectionRef.current
    
    if (!editorRef.current || 
        !editorRef.current.contains(savedRange.startContainer) || 
        !editorRef.current.contains(savedRange.endContainer)) {
      savedSelectionRef.current = null
      if (editorRef.current) {
        editorRef.current.focus()
      }
      return
    }
    
    const range = savedRange.cloneRange()
    
    if (range.collapsed) {
      if (editorRef.current) {
        editorRef.current.focus()
      }
      return
    }
    
    const selection = window.getSelection()
    selection.removeAllRanges()
    try {
      selection.addRange(range.cloneRange())
    } catch (e) {
      return
    }
    
    if (!editorRef.current?.contains(range.commonAncestorContainer)) {
      editorRef.current?.focus()
      return
    }
    
    const startContainer = range.startContainer
    const endContainer = range.endContainer
    const startOffset = range.startOffset
    const endOffset = range.endOffset
    
    if (startContainer === endContainer && startContainer.nodeType === 3) {
      const textNode = startContainer
      const text = textNode.textContent
      const beforeText = text.substring(0, startOffset)
      const selectedText = text.substring(startOffset, endOffset)
      const afterText = text.substring(endOffset)
      
      const beforeNode = document.createTextNode(beforeText)
      const span = document.createElement('span')
      span.style.fontSize = `${size}px`
      span.textContent = selectedText
      const afterNode = document.createTextNode(afterText)
      
      const parent = textNode.parentNode
      if (beforeNode.textContent) {
        parent.insertBefore(beforeNode, textNode)
      }
      parent.insertBefore(span, textNode)
      if (afterNode.textContent) {
        parent.insertBefore(afterNode, textNode)
      }
      parent.removeChild(textNode)
    } else {
      const workRange = range.cloneRange()
      const wrapper = document.createElement('span')
      wrapper.style.fontSize = `${size}px`
      const contents = workRange.extractContents()
      if (contents.hasChildNodes()) {
        while (contents.firstChild) {
          wrapper.appendChild(contents.firstChild)
        }
      } else if (contents.nodeType === 3) {
        wrapper.appendChild(contents)
      }
      if (wrapper.textContent.trim() || wrapper.hasChildNodes()) {
        range.insertNode(wrapper)
      }
    }
    
    savedSelectionRef.current = null
    
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
    
    editorRef.current?.focus()
  }

  const applyFontFamily = (family) => {
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (selection.isCollapsed) {
        expandToWord(range)
      }
      if (!range.collapsed) {
        const span = document.createElement('span')
        span.style.fontFamily = family
        try {
          range.surroundContents(span)
        } catch (e) {
          const contents = range.extractContents()
          span.appendChild(contents)
          range.insertNode(span)
        }
      }
    }
    editorRef.current?.focus()
  }

  const handleFontSizeInputChange = (e) => {
    const value = e.target.value
    setFontSizeInput(value)
  }

  const handleFontSizeInputBlur = (e) => {
    if (e.relatedTarget && e.relatedTarget.closest('[data-font-size-container]')) {
      return
    }
    
    setShowFontSizeDropdown(false)
    
    if (!savedSelectionRef.current) {
      const numValue = parseFloat(fontSizeInput)
      if (fontSizeInput && !isNaN(numValue) && numValue > 0 && numValue <= 200) {
        const sizeStr = String(Math.round(numValue))
        setFontSize(sizeStr)
        setFontSizeInput(sizeStr)
      } else {
        setFontSizeInput(fontSize)
      }
      return
    }
    
    const numValue = parseFloat(fontSizeInput)
    if (fontSizeInput && !isNaN(numValue) && numValue > 0 && numValue <= 200) {
      const sizeStr = String(Math.round(numValue))
      setFontSize(sizeStr)
      setFontSizeInput(sizeStr)
      applyFontSize(numValue)
    } else {
      setFontSizeInput(fontSize)
    }
  }

  const handleFontSizeInputKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleFontSizeInputBlur()
    }
  }

  const handleFontSizeSelect = (size) => {
    setFontSize(size)
    setFontSizeInput(size)
    setShowFontSizeDropdown(false)
    
    if (!savedSelectionRef.current) {
      return
    }
    
    setTimeout(() => {
      applyFontSize(parseFloat(size))
    }, 10)
  }

  const handleFontFamilyChange = (e) => {
    const family = e.target.value
    setFontFamily(family)
    applyFontFamily(family)
  }

  const handleTextColorChange = (e) => {
    const color = e.target.value
    setTextColor(color)
    document.execCommand('foreColor', false, color)
    editorRef.current?.focus()
  }

  const handleHighlightColorChange = (e) => {
    const color = e.target.value
    setHighlightColor(color)
    document.execCommand('backColor', false, color)
    editorRef.current?.focus()
  }

  const handleFormatBlock = (e) => {
    const format = e.target.value
    if (format === 'p') {
      document.execCommand('formatBlock', false, '<p>')
    } else {
      document.execCommand('formatBlock', false, `<${format}>`)
    }
    editorRef.current?.focus()
  }

  const handleInsertLink = () => {
    setShowLinkModal(true)
    setLinkUrl('')
  }

  const handleLinkModalSave = () => {
    if (linkUrl && linkUrl.trim()) {
      const url = linkUrl.trim()
      const finalUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
      
      const selection = window.getSelection()
      if (selection.rangeCount > 0 && editorRef.current) {
        const range = selection.getRangeAt(0)
        if (selection.isCollapsed) {
          expandToWord(range)
        }
        if (!range.collapsed) {
          const linkElement = range.commonAncestorContainer.nodeType === 1 
            ? range.commonAncestorContainer.closest('a')
            : range.commonAncestorContainer.parentElement?.closest('a')
          
          if (linkElement) {
            linkElement.href = finalUrl
          } else {
            selection.removeAllRanges()
            selection.addRange(range)
            document.execCommand('createLink', false, finalUrl)
          }
        } else {
          const link = document.createElement('a')
          link.href = finalUrl
          link.textContent = finalUrl
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          range.insertNode(link)
          range.setStartAfter(link)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }
    }
    setShowLinkModal(false)
    setLinkUrl('')
    editorRef.current?.focus()
  }

  const handleLinkModalCancel = () => {
    setShowLinkModal(false)
    setLinkUrl('')
    editorRef.current?.focus()
  }

  const handleListStyleChange = (listType, style) => {
    const selection = window.getSelection()
    if (selection.rangeCount > 0 && editorRef.current) {
      const range = selection.getRangeAt(0)
      let listElement = null
      
      if (range.commonAncestorContainer.nodeType === 1) {
        listElement = range.commonAncestorContainer.closest('ul, ol')
      } else {
        listElement = range.commonAncestorContainer.parentElement?.closest('ul, ol')
      }
      
      if (listElement) {
        const currentType = listElement.tagName.toLowerCase()
        if ((listType === 'ul' && currentType === 'ol') || (listType === 'ol' && currentType === 'ul')) {
          const newList = document.createElement(listType === 'ul' ? 'ul' : 'ol')
          newList.style.setProperty('list-style-type', style, 'important')
          while (listElement.firstChild) {
            newList.appendChild(listElement.firstChild)
          }
          listElement.parentNode?.replaceChild(newList, listElement)
          listElement = newList
        } else {
          listElement.style.setProperty('list-style-type', style, 'important')
          listElement.setAttribute('data-list-style', style)
        }
      } else {
        if (listType === 'ul') {
          document.execCommand('insertUnorderedList', false, null)
          setTimeout(() => {
            const newList = editorRef.current?.querySelector('ul:last-of-type')
            if (newList) {
              newList.style.setProperty('list-style-type', style, 'important')
              newList.setAttribute('data-list-style', style)
            }
          }, 50)
        } else {
          document.execCommand('insertOrderedList', false, null)
          setTimeout(() => {
            const newList = editorRef.current?.querySelector('ol:last-of-type')
            if (newList) {
              newList.style.setProperty('list-style-type', style, 'important')
              newList.setAttribute('data-list-style', style)
            }
          }, 50)
        }
      }
    }
    editorRef.current?.focus()
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input)', width: '100%', minWidth: '100%' }}>
      <div 
        style={{ 
          display: 'flex', 
          gap: '4px', 
          padding: '8px', 
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          flexWrap: 'wrap',
          alignItems: 'center',
          width: '100%',
          minHeight: '36px',
          boxSizing: 'border-box'
        }}
        onMouseEnter={() => saveSelection()}
        onMouseDown={(e) => saveSelection()}
      >
        <button type="button" onClick={handleUndo} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Undo">
          ↶
        </button>
        <button type="button" onClick={handleRedo} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Redo">
          ↷
        </button>
        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
        
        <select 
          onChange={handleFormatBlock}
          style={{ padding: '4px 6px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer', fontSize: '12px', width: '120px', minWidth: '120px', maxWidth: '120px' }}
          title="Format"
        >
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
        </select>
        
        <select 
          value={fontFamily}
          onChange={handleFontFamilyChange}
          style={{ padding: '4px 6px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer', fontSize: '12px', width: '140px', minWidth: '140px', maxWidth: '140px' }}
          title="Font Family"
        >
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Courier New">Courier New</option>
          <option value="Georgia">Georgia</option>
          <option value="Verdana">Verdana</option>
          <option value="Helvetica">Helvetica</option>
          <option value="Comic Sans MS">Comic Sans MS</option>
        </select>
        
        <div 
          style={{ position: 'relative', display: 'inline-block' }} 
          data-font-size-container
          onMouseEnter={() => saveSelection()}
        >
          <input
            type="text"
            value={fontSizeInput}
            onChange={handleFontSizeInputChange}
            onBlur={handleFontSizeInputBlur}
            onKeyPress={handleFontSizeInputKeyPress}
            onMouseDown={(e) => {
              e.preventDefault()
              saveSelection()
              setTimeout(() => {
                e.target.focus()
              }, 0)
            }}
            onFocus={() => {
              saveSelection()
              setShowFontSizeDropdown(true)
            }}
            style={{ 
              padding: '4px 6px', 
              border: '1px solid var(--border)', 
              borderRadius: '4px', 
              background: 'var(--input)', 
              fontSize: '12px', 
              width: '60px',
              boxSizing: 'border-box',
              textAlign: 'center'
            }}
            title="Font Size (type custom value or click dropdown)"
          />
          {showFontSizeDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '2px',
                background: 'var(--input)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                zIndex: 1000,
                maxHeight: '200px',
                overflowY: 'auto',
                minWidth: '60px'
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map(size => (
                <div
                  key={size}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!savedSelectionRef.current) {
                      saveSelection()
                    }
                    handleFontSizeSelect(String(size))
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    saveSelection()
                  }}
                  style={{
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    backgroundColor: fontSize === String(size) ? 'var(--primary)' : 'transparent',
                    color: fontSize === String(size) ? 'white' : 'var(--text)'
                  }}
                  onMouseEnter={(e) => {
                    if (fontSize !== String(size)) {
                      e.target.style.backgroundColor = 'var(--bg)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (fontSize !== String(size)) {
                      e.target.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  {size}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
        
        <button type="button" onClick={() => execCommand('bold')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer', fontWeight: 'bold' }} title="Bold">
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => execCommand('italic')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer', fontStyle: 'italic' }} title="Italic">
          <em>I</em>
        </button>
        <button type="button" onClick={() => execCommand('underline')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer', textDecoration: 'underline' }} title="Underline">
          <u>U</u>
        </button>
        
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <input
            type="color"
            value={textColor}
            onChange={handleTextColorChange}
            style={{ width: '32px', height: '28px', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
            title="Text Color"
          />
        </div>
        
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <input
            type="color"
            value={highlightColor}
            onChange={handleHighlightColorChange}
            style={{ width: '32px', height: '28px', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
            title="Highlight Color"
          />
        </div>
        
        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
        
        <button type="button" onClick={() => execCommand('justifyLeft')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Align Left">
          ⬅
        </button>
        <button type="button" onClick={() => execCommand('justifyCenter')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Align Center">
          ⬌
        </button>
        <button type="button" onClick={() => execCommand('justifyRight')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Align Right">
          ➡
        </button>
        <button type="button" onClick={() => execCommand('justifyFull')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Justify">
          ⬌⬌
        </button>
        
        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
        
        <button type="button" onClick={handleInsertLink} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Insert Link">
          🔗
        </button>
        
        <button type="button" onClick={() => handleListStyleChange('ul', 'disc')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Bullet List">
          •
        </button>
        <button type="button" onClick={() => handleListStyleChange('ol', 'decimal')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Numbered List">
          1.
        </button>
      </div>
      
      <div
        contentEditable
        ref={editorRef}
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{
          minHeight: '150px',
          padding: '12px',
          outline: 'none',
          fontSize: '14px',
          lineHeight: '1.5',
          fontFamily: 'Arial, sans-serif',
          color: 'var(--text)',
          background: 'var(--input)',
          overflowY: 'auto',
          maxHeight: '400px'
        }}
        suppressContentEditableWarning
      />
      
      {showLinkModal && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', zIndex: 1001, minWidth: '300px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <div style={{ marginBottom: '12px', fontWeight: '600' }}>Insert Link</div>
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Enter URL"
            style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', marginBottom: '12px', boxSizing: 'border-box' }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleLinkModalSave()
              }
            }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={handleLinkModalCancel} style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={handleLinkModalSave} style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--primary)', color: 'white', cursor: 'pointer' }}>Insert</button>
          </div>
        </div>
      )}
    </div>
  )
}

function VariationDetail() {
  const [variation, setVariation] = useState(null)
  const [originalRichTextFields, setOriginalRichTextFields] = useState({ scopeOfWork: null, exclusions: null, paymentTerms: null })
  const [lead, setLead] = useState(null)
  const [project, setProject] = useState(null)
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  const [editModal, setEditModal] = useState({ open: false, form: null })
  const [createVariationModal, setCreateVariationModal] = useState({ open: false, form: null })
  const [showHistory, setShowHistory] = useState(false)
  const [profileUser, setProfileUser] = useState(null)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [approvalModal, setApprovalModal] = useState({ open: false, action: null, note: '' })
  const [showApprovals, setShowApprovals] = useState(false)
  const [editWarningModal, setEditWarningModal] = useState({ open: false })
  const [sendApprovalConfirmModal, setSendApprovalConfirmModal] = useState({ open: false })
  const [deleteModal, setDeleteModal] = useState({ open: false })
  const [printPreviewModal, setPrintPreviewModal] = useState({ open: false, pdfUrl: null })
  const [dateFieldsModified, setDateFieldsModified] = useState({ offerDate: false, enquiryDate: false })
  const [originalDateValues, setOriginalDateValues] = useState({ offerDate: null, enquiryDate: null })
  const [isLoading, setIsLoading] = useState(true)
  const [editSelectedFiles, setEditSelectedFiles] = useState([])
  const [editPreviewFiles, setEditPreviewFiles] = useState([])
  const [editAttachmentsToRemove, setEditAttachmentsToRemove] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingAction, setLoadingAction] = useState(null)

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const handleEditFileChange = (e) => {
    const files = Array.from(e.target.files)
    setEditSelectedFiles(prev => [...prev, ...files])
    
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setEditPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'image' }])
        }
        reader.readAsDataURL(file)
      } else if (file.type.startsWith('video/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setEditPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'video' }])
        }
        reader.readAsDataURL(file)
      } else {
        setEditPreviewFiles(prev => [...prev, { file, preview: null, type: 'document' }])
      }
    })
  }

  const removeEditFile = (index) => {
    setEditSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setEditPreviewFiles(prev => prev.filter((_, i) => i !== index))
  }

  const removeEditAttachment = (index) => {
    if (!editAttachmentsToRemove.includes(index.toString())) {
      setEditAttachmentsToRemove(prev => [...prev, index.toString()])
    }
  }

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      try {
        const vid = localStorage.getItem('variationId')
        if (!vid) {
          setIsLoading(false)
          return
        }
        const res = await apiFetch(`/api/project-variations/${vid}`)
        if (!res.ok) {
          throw new Error(`Failed to fetch variation: ${res.status} ${res.statusText}`)
        }
        const varData = await res.json()
        if (!varData || !varData._id) {
          throw new Error('Invalid variation data received')
        }
        // Normalize rich text fields for backward compatibility
        // Store original string values before normalization
        setOriginalRichTextFields({
          scopeOfWork: typeof varData.scopeOfWork === 'string' ? varData.scopeOfWork : null,
          exclusions: typeof varData.exclusions === 'string' ? varData.exclusions : null,
          paymentTerms: typeof varData.paymentTerms === 'string' ? varData.paymentTerms : null
        })
        const normalizedVariation = normalizeRichTextFields(varData)
        setVariation(normalizedVariation)
        
        // Load lead if available
        if (varData.lead) {
          const leadId = typeof varData.lead === 'object' ? varData.lead?._id : varData.lead
          if (leadId) {
            try {
              const resLead = await apiFetch(`/api/leads/${leadId}`)
              const leadData = await resLead.json()
              const visitsRes = await apiFetch(`/api/leads/${leadId}/site-visits`)
              const visits = await visitsRes.json()
              setLead({ ...leadData, siteVisits: visits })
            } catch {}
          }
        }
        
        // Load parent project if available
        if (varData.parentProject) {
          const projectId = typeof varData.parentProject === 'object' ? varData.parentProject?._id : varData.parentProject
          if (projectId) {
            try {
              const resProject = await apiFetch(`/api/projects/${projectId}`)
              const projectData = await resProject.json()
              setProject(projectData)
            } catch {}
          }
        }
        
      } catch (e) {
        console.error('Error loading variation:', e)
        setNotify({ open: true, title: 'Load Failed', message: 'Failed to load variation data. Please try again.' })
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [currentUser])

  const ensurePdfMake = async () => {
    if (window.pdfMake) return
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/pdfmake.min.js'
      script.onload = resolve
      script.onerror = reject
      document.body.appendChild(script)
    })
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/vfs_fonts.js'
      script.onload = resolve
      script.onerror = reject
      document.body.appendChild(script)
    })
  }

  const toDataURL = async (url) => {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  }

  // Normalize rich text fields from strings to arrays/objects for backward compatibility
  const normalizeRichTextFields = (v) => {
    if (!v) return v
    const clone = { ...v }

    // scopeOfWork: string -> array of one item with description
    if (typeof clone.scopeOfWork === 'string') {
      const desc = clone.scopeOfWork
      clone.scopeOfWork = desc ? [{ description: desc, quantity: '', unit: '', locationRemarks: '' }] : []
    }

    // priceSchedule: keep as string (rich text HTML content)
    // No conversion needed - it's already a string

    // exclusions: string -> array (split by <br> or newline); array of strings ok; other -> []
    if (typeof clone.exclusions === 'string') {
      clone.exclusions = clone.exclusions
        ? clone.exclusions.split(/<br\s*\/?>|\n/gi).map(s => s.trim()).filter(Boolean)
        : []
    } else if (!Array.isArray(clone.exclusions)) {
      clone.exclusions = []
    }

    // paymentTerms: string -> array of objects; array ok; else []
    if (typeof clone.paymentTerms === 'string') {
      clone.paymentTerms = clone.paymentTerms
        ? clone.paymentTerms.split(/<br\s*\/?>|\n/gi).map(term => {
            const match = term.match(/^(.+?)(?:\s*-\s*(\d+(?:\.\d+)?)%)?$/)
            return {
              milestoneDescription: match ? match[1].trim() : term.trim(),
              amountPercent: match && match[2] ? parseFloat(match[2]) : 0
            }
          }).filter(t => t.milestoneDescription)
        : []
    } else if (!Array.isArray(clone.paymentTerms)) {
      clone.paymentTerms = []
    }

    return clone
  }

  // Convert rich text HTML to pdfMake-friendly fragments (preserve inline styles)
  const htmlToPdfFragments = (html) => {
    if (!html) return [{ text: '' }]

    const fallback = (raw) => {
      const withBreaks = raw
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/\s*li\s*>/gi, '\n')
        .replace(/<\s*li\s*>/gi, '• ')
      const stripped = withBreaks.replace(/<[^>]+>/g, '')
      return [{ text: stripped.trim() }]
    }

    const applyInlineStyles = (node, base = {}) => {
      const next = { ...base }
      const style = (node.getAttribute && node.getAttribute('style')) || ''
      if (style) {
        const colorMatch = style.match(/color\s*:\s*([^;]+)/i)
        if (colorMatch) next.color = colorMatch[1].trim()
        const bgMatch = style.match(/background(?:-color)?\s*:\s*([^;]+)/i)
        if (bgMatch) next.background = bgMatch[1].trim()
        const ffMatch = style.match(/font-family\s*:\s*([^;]+)/i)
        if (ffMatch) next.font = ffMatch[1].trim().replace(/['"]/g, '')
        const fsMatch = style.match(/font-size\s*:\s*([^;]+)/i)
        if (fsMatch) {
          const raw = fsMatch[1].trim()
          const num = parseFloat(raw)
          if (!Number.isNaN(num)) next.fontSize = num
        }
      }
      if (node.tagName?.toLowerCase() === 'font' && node.getAttribute) {
        const c = node.getAttribute('color')
        if (c) next.color = c
      }
      return next
    }

    if (typeof DOMParser === 'undefined' || typeof Node === 'undefined') {
      return fallback(html)
    }

    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')

    const walk = (node, inherited = {}) => {
      const results = []
      const pushText = (text, style = inherited) => {
        if (text === undefined || text === null) return
        const val = String(text)
        if (val.length === 0) return
        results.push({ text: val, ...style })
      }

      switch (node.nodeType) {
        case Node.TEXT_NODE: {
          const t = node.textContent || ''
          if (t.trim().length === 0 && /\s+/.test(t)) break
          pushText(t, inherited)
          break
        }
        case Node.ELEMENT_NODE: {
          const tag = node.tagName.toLowerCase()
          const next = applyInlineStyles(node, inherited)
          if (['strong', 'b'].includes(tag)) next.bold = true
          if (['em', 'i'].includes(tag)) next.italics = true
          if (tag === 'u') next.decoration = 'underline'
          if (['h1', 'h2', 'h3', 'h4'].includes(tag)) next.fontSize = 12

          if (tag === 'br') {
            results.push({ text: '\n', ...next })
            break
          }

          if (tag === 'ul' || tag === 'ol') {
            const isOrdered = tag === 'ol'
            const items = []
            node.childNodes.forEach((child, idx) => {
              if (child.tagName?.toLowerCase() === 'li') {
                const liParts = walk(child, next)
                const combined = liParts.map(p => p.text || '').join('').trim()
                if (combined.length) {
                  items.push({ text: isOrdered ? `${idx + 1}. ${combined}` : `• ${combined}`, ...next })
                }
              }
            })
            if (items.length) {
              results.push({ stack: items, margin: [0, 0, 0, 2] })
            }
            break
          }

          if (tag === 'li') {
            node.childNodes.forEach(child => {
              results.push(...walk(child, next))
            })
            break
          }

          const blockLike = ['p', 'div', 'h1', 'h2', 'h3', 'h4'].includes(tag)
          const children = []
          node.childNodes.forEach(child => {
            children.push(...walk(child, next))
          })
          if (children.length) {
            if (blockLike) {
              results.push({ stack: children, margin: [0, 0, 0, 4] })
            } else {
              results.push(...children)
            }
          }
          break
        }
        default:
          break
      }

      return results
    }

    const output = []
    doc.body.childNodes.forEach(n => output.push(...walk(n)))
    if (!output.length) return fallback(html)
    return output
  }

  const richTextCell = (val) => {
    const frags = htmlToPdfFragments(val)
    return { stack: frags, preserveLeadingSpaces: true, margin: [0, 0, 0, 2] }
  }

  // Helper function to build PDF content (shared between preview and export)
  const buildVariationPDFContent = async () => {
    try {
      if (!variation) return null
      await ensurePdfMake()
      const logoDataUrl = await toDataURL(variation.companyInfo?.logo || logo)
      const currency = 'AED' // Default currency since priceSchedule is now just HTML

      const leadFull = lead || (typeof variation.lead === 'object' ? variation.lead : null)
      const siteVisits = Array.isArray(lead?.siteVisits) ? lead.siteVisits : []

      const coverFieldsRaw = [
        ['Submitted To', variation.submittedTo],
        ['Attention', variation.attention],
        ['Offer Reference', variation.offerReference],
        ['Enquiry Number', variation.enquiryNumber || leadFull?.enquiryNumber],
        ['Offer Date', variation.offerDate ? new Date(variation.offerDate).toLocaleDateString() : ''],
        ['Enquiry Date', variation.enquiryDate ? new Date(variation.enquiryDate).toLocaleDateString() : ''],
        ['Project Title', variation.projectTitle || leadFull?.projectTitle]
      ]
      const coverFields = coverFieldsRaw.filter(([, v]) => v && String(v).trim().length > 0)

      // Get original HTML strings for rich text fields (before normalization)
      const scopeOfWorkHtml = originalRichTextFields.scopeOfWork || (typeof variation.scopeOfWork === 'string' ? variation.scopeOfWork : '')
      const exclusionsHtml = originalRichTextFields.exclusions || (typeof variation.exclusions === 'string' ? variation.exclusions : '')
      const paymentTermsHtml = originalRichTextFields.paymentTerms || (typeof variation.paymentTerms === 'string' ? variation.paymentTerms : '')
      
      // Convert HTML strings to PDF fragments
      const scopeOfWorkFragments = scopeOfWorkHtml && scopeOfWorkHtml.trim() ? htmlToPdfFragments(scopeOfWorkHtml) : []
      const priceScheduleHtml = typeof variation.priceSchedule === 'string' 
        ? variation.priceSchedule 
        : (variation.priceSchedule?.items?.length 
          ? variation.priceSchedule.items.map(item => item.description || '').join('<br>')
          : '')
      const priceScheduleFragments = priceScheduleHtml && priceScheduleHtml.trim() ? htmlToPdfFragments(priceScheduleHtml) : []
      const exclusionsFragments = exclusionsHtml && exclusionsHtml.trim() ? htmlToPdfFragments(exclusionsHtml) : []
      const paymentTermsFragments = paymentTermsHtml && paymentTermsHtml.trim() ? htmlToPdfFragments(paymentTermsHtml) : []

      const dcwv = variation.deliveryCompletionWarrantyValidity || {}
      const deliveryRowsRaw = [
        ['Delivery / Completion Timeline', dcwv.deliveryTimeline],
        ['Warranty Period', dcwv.warrantyPeriod],
        ['Offer Validity (Days)', typeof dcwv.offerValidity === 'number' ? String(dcwv.offerValidity) : (dcwv.offerValidity || '')],
        ['Authorized Signatory', dcwv.authorizedSignatory]
      ]
      const deliveryRows = deliveryRowsRaw.filter(([, v]) => v && String(v).trim().length > 0)

      const header = {
        margin: [36, 20, 36, 8],
        stack: [
          {
            columns: [
              { image: logoDataUrl, width: 60 },
              [
                { text: variation.companyInfo?.name || 'Company', style: 'brand' },
                { text: [variation.companyInfo?.address, variation.companyInfo?.phone, variation.companyInfo?.email].filter(Boolean).join(' | '), color: '#64748b', fontSize: 9 }
              ]
            ],
            columnGap: 12
          },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.5, lineColor: '#e5e7eb' }] }
        ]
      }

      const content = []
      content.push({ text: `Variation ${variation.variationNumber} — Commercial Quotation`, style: 'h1', margin: [0, 0, 0, 8] })

      if (coverFields.length > 0) {
        content.push({ text: 'Cover & Basic Details', style: 'h2', margin: [0, 6, 0, 6] })
        content.push({
          table: {
            widths: ['30%', '70%'],
            body: [
              [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
              ...coverFields.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: v, style: 'tdVal' }])
            ]
          },
          layout: 'lightHorizontalLines'
        })
      }

      if (leadFull) {
        const leadDetailsRaw = [
          ['Customer', leadFull.customerName],
          ['Project Title', leadFull.projectTitle],
          ['Enquiry #', leadFull.enquiryNumber],
          ['Enquiry Date', leadFull.enquiryDate ? new Date(leadFull.enquiryDate).toLocaleDateString() : ''],
          ['Submission Due', leadFull.submissionDueDate ? new Date(leadFull.submissionDueDate).toLocaleDateString() : ''],
          ['Scope Summary', leadFull.scopeSummary]
        ]
        const leadDetails = leadDetailsRaw.filter(([, v]) => v && String(v).trim().length > 0)
        if (leadDetails.length > 0) {
          content.push({ text: 'Project Details', style: 'h2', margin: [0, 12, 0, 6] })
          content.push({
            table: {
              widths: ['30%', '70%'],
              body: [
                [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                ...leadDetails.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: v, style: 'tdVal' }])
              ]
            },
            layout: 'lightHorizontalLines'
          })
        }
      }

      if ((variation.introductionText || '').trim().length > 0) {
        content.push({ text: 'Introduction', style: 'h2', margin: [0, 10, 0, 6] })
        content.push({ stack: htmlToPdfFragments(variation.introductionText), margin: [0, 0, 0, 6], preserveLeadingSpaces: true })
      }

      if (scopeOfWorkFragments.length > 0) {
        content.push({ text: 'Scope of Work', style: 'h2', margin: [0, 12, 0, 6] })
        content.push({
          stack: scopeOfWorkFragments.map(frag => ({ ...frag, margin: [0, 0, 0, 8] }))
        })
      }

      if (Array.isArray(siteVisits) && siteVisits.length > 0) {
        const visitRows = siteVisits.map((v, i) => [
          String(i + 1),
          v.visitAt ? new Date(v.visitAt).toLocaleString() : '',
          v.siteLocation || '',
          v.engineerName || '',
          (v.workProgressSummary || '').slice(0, 140)
        ])
        content.push({ text: 'Site Visit Reports', style: 'h2', margin: [0, 12, 0, 6] })
        content.push({
          table: {
            widths: ['6%', '22%', '22%', '20%', '30%'],
            body: [
              [
                { text: '#', style: 'th' },
                { text: 'Date & Time', style: 'th' },
                { text: 'Location', style: 'th' },
                { text: 'Engineer', style: 'th' },
                { text: 'Progress Summary', style: 'th' }
              ],
              ...visitRows
            ]
          },
          layout: 'lightHorizontalLines'
        })
      }

      // Price Schedule (rich text HTML content)
      if (priceScheduleFragments.length > 0) {
        content.push({ text: 'Price Schedule', style: 'h2', margin: [0, 12, 0, 6] })
        content.push({
          stack: priceScheduleFragments.map(frag => ({ ...frag, margin: [0, 0, 0, 8] }))
        })
      }

      if ((variation.ourViewpoints || '').trim().length > 0 || exclusionsFragments.length > 0) {
        content.push({ text: 'Our Viewpoints / Special Terms', style: 'h2', margin: [0, 12, 0, 6] })
        if ((variation.ourViewpoints || '').trim().length > 0) {
          content.push({ stack: htmlToPdfFragments(variation.ourViewpoints), margin: [0, 0, 0, 6], preserveLeadingSpaces: true })
        }
        if (exclusionsFragments.length > 0) {
          content.push({ text: 'Exclusions', style: 'h3', margin: [0, 6, 0, 4] })
          content.push({
            stack: exclusionsFragments.map(frag => ({ ...frag, margin: [0, 0, 0, 8] }))
          })
        }
      }

      if (paymentTermsFragments.length > 0) {
        content.push({ text: 'Payment Terms', style: 'h2', margin: [0, 12, 0, 6] })
        content.push({
          stack: paymentTermsFragments.map(frag => ({ ...frag, margin: [0, 0, 0, 8] }))
        })
      }

      if (deliveryRows.length > 0) {
        content.push({ text: 'Delivery, Completion, Warranty & Validity', style: 'h2', margin: [0, 12, 0, 6] })
        content.push({
          table: {
            widths: ['30%', '70%'],
            body: [
              ...deliveryRows.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: v, style: 'tdVal' }])
            ]
          },
          layout: 'lightHorizontalLines'
        })
      }

      const isPending = variation.managementApproval?.status === 'pending'
      if (isPending) {
        content.push({ text: 'Management Approval: Pending', italics: true, color: '#b45309', margin: [0, 12, 0, 0] })
      } else if (variation.managementApproval?.status === 'approved') {
        content.push({ text: `Approved by: ${variation.managementApproval?.approvedBy?.name || 'Management'}`, italics: true, color: '#16a34a', margin: [0, 12, 0, 0] })
      }

      return {
        pageMargins: [36, 96, 36, 60],
        header,
        footer: function (currentPage, pageCount) {
          return {
            margin: [36, 0, 36, 20],
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.5, lineColor: '#e5e7eb' }] },
              {
                columns: [
                  { text: isPending ? 'Approval Pending' : (variation.managementApproval?.status === 'approved' ? 'Approved' : ''), color: isPending ? '#b45309' : '#16a34a' },
                  { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', color: '#94a3b8' }
                ]
              }
            ]
          }
        },
        content,
        styles: {
          brand: { fontSize: 14, color: '#1f2937', bold: true, margin: [0, 0, 0, 2] },
          h1: { fontSize: 18, bold: true, color: '#0f172a' },
          h2: { fontSize: 12, bold: true, color: '#0f172a' },
          h3: { fontSize: 11, bold: true, color: '#0f172a' },
          th: { bold: true, fillColor: '#f1f5f9' },
          tdKey: { color: '#64748b' },
          tdVal: { color: '#0f172a' }
        },
        defaultStyle: { fontSize: 10, lineHeight: 1.2 },
        watermark: isPending ? { text: 'Approval Pending', color: '#94a3b8', opacity: 0.12, bold: true } : undefined
      }
    } catch (e) {
      throw e
    }
  }

  const generatePDFPreview = async () => {
    try {
      if (!variation) return
      await ensurePdfMake()
      const docDefinition = await buildVariationPDFContent()
      if (!docDefinition) return
      const pdfDoc = window.pdfMake.createPdf(docDefinition)
      pdfDoc.getDataUrl((dataUrl) => {
        setPrintPreviewModal({ open: true, pdfUrl: dataUrl })
      })
    } catch (e) {
      setNotify({ open: true, title: 'Preview Failed', message: 'We could not generate the PDF preview. Please try again.' })
    }
  }

  const exportVariationPDF = async () => {
    try {
      if (!variation) return
      await ensurePdfMake()
      const docDefinition = await buildVariationPDFContent()
      if (!docDefinition) return
      const filename = `Variation_${variation.variationNumber}_${variation.projectTitle || 'Quotation'}.pdf`
      window.pdfMake.createPdf(docDefinition).download(filename)
    } catch (e) {
      setNotify({ open: true, title: 'Export Failed', message: 'We could not generate the PDF. Please try again.' })
    }
  }

  const approveVariation = async (status, note) => {
    setLoadingAction(`approve-${status}`)
    setIsSubmitting(true)
    try {
      if (!variation) return
      const token = localStorage.getItem('token')
      await apiFetch(`/api/project-variations/${variation._id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ status, note })
      })
      const res = await apiFetch(`/api/project-variations/${variation._id}`)
      if (!res.ok) throw new Error('Failed to refresh variation')
      const updated = await res.json()
      if (updated && updated._id) {
        setVariation(updated)
      }
      setApprovalModal({ open: false, action: null, note: '' })
      setNotify({ open: true, title: status === 'approved' ? 'Variation Approved' : 'Variation Rejected', message: `The variation has been ${status === 'approved' ? 'approved' : 'rejected'} successfully.` })
    } catch (e) {
      setNotify({ open: true, title: 'Approval Failed', message: 'We could not update approval. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  const deleteVariation = async () => {
    if (!variation) return
    setLoadingAction('delete-variation')
    setIsSubmitting(true)
    try {
      await api.delete(`/api/project-variations/${variation._id}`)
      setDeleteModal({ open: false })
      setNotify({ open: true, title: 'Deleted', message: 'Variation deleted successfully. Redirecting...' })
      setTimeout(() => {
        window.location.href = '/project-variations'
      }, 1500)
    } catch (e) {
      setDeleteModal({ open: false })
      setNotify({ open: true, title: 'Delete Failed', message: e.response?.data?.message || 'We could not delete the variation. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  const sendForApproval = async () => {
    setLoadingAction('send-approval')
    setIsSubmitting(true)
    try {
      if (!variation) return
      const token = localStorage.getItem('token')
      await apiFetch(`/api/project-variations/${variation._id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending' })
      })
      const res = await apiFetch(`/api/project-variations/${variation._id}`)
      if (!res.ok) throw new Error('Failed to refresh variation')
      const updated = await res.json()
      if (updated && updated._id) {
        setVariation(updated)
      }
      setSendApprovalConfirmModal({ open: false })
      setNotify({ open: true, title: 'Request Sent', message: 'Approval request has been sent successfully.' })
    } catch (e) {
      setNotify({ open: true, title: 'Send Failed', message: 'We could not send for approval. Please try again.' })
    }
  }

  const hasVariationChanges = (original, form) => {
    if (!original || !form) return false
    
    // Normalize date values for comparison
    const normalizeDate = (date) => {
      if (!date) return null
      if (typeof date === 'string') {
        // If it's already in YYYY-MM-DD format, return as is
        if (date.match(/^\d{4}-\d{2}-\d{2}$/)) return date
        // Otherwise try to convert
        try {
          const d = new Date(date)
          if (isNaN(d.getTime())) return null
          return d.toISOString().slice(0, 10)
        } catch {
          return null
        }
      }
      if (date instanceof Date) {
        return date.toISOString().slice(0, 10)
      }
      return null
    }

    const originalOfferDate = normalizeDate(original.offerDate)
    const formOfferDate = form.offerDate || ''
    const originalEnquiryDate = normalizeDate(original.enquiryDate)
    const formEnquiryDate = form.enquiryDate || ''

    // Check date fields only if they were manually modified
    if (dateFieldsModified.offerDate && originalOfferDate !== formOfferDate) return true
    if (dateFieldsModified.enquiryDate && originalEnquiryDate !== formEnquiryDate) return true

    // Compare other fields
    const fields = [
      'companyInfo', 'submittedTo', 'attention', 'offerReference', 'enquiryNumber',
      'projectTitle', 'introductionText', 'scopeOfWork', 'priceSchedule',
      'ourViewpoints', 'exclusions', 'paymentTerms', 'deliveryCompletionWarrantyValidity'
    ]

    for (const field of fields) {
      const originalValue = original[field]
      const formValue = form[field]
      
      // Deep comparison using JSON.stringify
      if (JSON.stringify(originalValue ?? null) !== JSON.stringify(formValue ?? null)) {
        return true
      }
    }

    return false
  }

  const formatHistoryValue = (field, value, { asHtml = false } = {}) => {
    // Handle null/undefined
    if (value === null || value === undefined) return ''
    
    // For rich text fields, return as HTML when asHtml is true
    if (asHtml && ['scopeOfWork', 'priceSchedule', 'exclusions', 'paymentTerms'].includes(field)) {
      if (typeof value === 'string') {
        return value
      }
    }
    
    // Handle date strings (from diffFromParent normalization)
    if (['offerDate', 'enquiryDate'].includes(field)) {
      if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        try {
          const date = new Date(value)
          if (!isNaN(date.getTime())) {
            return date.toLocaleDateString()
          }
        } catch {}
      }
      // If it's already a Date object or ISO string
      if (value instanceof Date || (typeof value === 'string' && value.includes('T'))) {
        try {
          const date = new Date(value)
          if (!isNaN(date.getTime())) {
            return date.toLocaleDateString()
          }
        } catch {}
      }
      // If it's a number (timestamp)
      if (typeof value === 'number') {
        try {
          const date = new Date(value)
          if (!isNaN(date.getTime())) {
            return date.toLocaleDateString()
          }
        } catch {}
      }
    }
    
    // Handle arrays first (before string check, as arrays might be serialized)
    if (Array.isArray(value)) {
      if (value.length === 0) return '(empty)'
      
      if (field === 'paymentTerms') {
        const terms = value || []
        return terms.map((t, i) => {
          if (typeof t === 'string') return `${i + 1}. ${t}`
          if (!t || typeof t !== 'object') return `${i + 1}. ${String(t)}`
          return `${i + 1}. ${t?.milestoneDescription || '-'} — ${t?.amountPercent ?? ''}%`
        }).join('<br>')
      }
      
      if (field === 'scopeOfWork') {
        const scopes = value || []
        return scopes.map((s, i) => {
          if (typeof s === 'string') return `${i + 1}. ${s}`
          if (!s || typeof s !== 'object') return `${i + 1}. ${String(s)}`
          const qtyUnit = [s?.quantity ?? '', s?.unit || ''].filter(x => String(x).trim().length > 0).join(' ')
          const remarks = s?.locationRemarks ? ` — ${s.locationRemarks}` : ''
          return `${i + 1}. ${s?.description || '-'}${qtyUnit ? ` — Qty: ${qtyUnit}` : ''}${remarks}`
        }).join('<br>')
      }
      
      if (field === 'exclusions') {
        return value.map((v, i) => `${i + 1}. ${String(v)}`).join('<br>')
      }
      
      // Generic array handling
      return value.map((v, i) => {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          return `${i + 1}. ${String(v)}`
        }
        if (v && typeof v === 'object') {
          const parts = Object.entries(v).map(([k, val]) => `${k}: ${val}`)
          return `${i + 1}. ${parts.join(', ')}`
        }
        return `${i + 1}. ${String(v)}`
      }).join('<br>')
    }
    
    // Handle objects (before string check)
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      if (field === 'priceSchedule') {
        const ps = value || {}
        const lines = []
        if (ps?.currency) lines.push(`Currency: ${ps.currency}`)
        const items = Array.isArray(ps?.items) ? ps.items : []
        if (items.length > 0) {
          lines.push('Items:')
          items.forEach((it, i) => {
            const qtyUnit = [it?.quantity ?? '', it?.unit || ''].filter(x => String(x).trim().length > 0).join(' ')
            const unitRate = (it?.unitRate ?? '') !== '' ? ` x ${it.unitRate}` : ''
            const amount = (it?.totalAmount ?? '') !== '' ? ` = ${it.totalAmount}` : ''
            lines.push(`  ${i + 1}. ${it?.description || '-'}${qtyUnit ? ` — Qty: ${qtyUnit}` : ''}${unitRate}${amount}`)
          })
        }
        if (ps?.subTotal !== undefined && ps?.subTotal !== null) lines.push(`Sub Total: ${ps.subTotal}`)
        if (ps?.taxDetails) {
          const rate = ps?.taxDetails?.vatRate ?? ''
          const amt = ps?.taxDetails?.vatAmount ?? ''
          if (rate !== '' || amt !== '') {
            lines.push(`VAT: ${rate}%${amt !== '' ? ` = ${amt}` : ''}`)
          }
        }
        if (ps?.grandTotal !== undefined && ps?.grandTotal !== null) lines.push(`Grand Total: ${ps.grandTotal}`)
        return lines.length > 0 ? lines.join('<br>') : '(empty)'
      }
      
      if (field === 'deliveryCompletionWarrantyValidity') {
        const d = value || {}
        const lines = []
        if (d?.deliveryTimeline) lines.push(`Delivery Timeline: ${d.deliveryTimeline}`)
        if (d?.warrantyPeriod) lines.push(`Warranty Period: ${d.warrantyPeriod}`)
        if (d?.offerValidity !== undefined && d?.offerValidity !== null) lines.push(`Offer Validity: ${d.offerValidity} days`)
        if (d?.authorizedSignatory) lines.push(`Authorized Signatory: ${d.authorizedSignatory}`)
        return lines.length > 0 ? lines.join('<br>') : '(empty)'
      }
      
      if (field === 'companyInfo') {
        const ci = value || {}
        const lines = []
        if (ci?.name) lines.push(`Name: ${ci.name}`)
        if (ci?.address) lines.push(`Address: ${ci.address}`)
        if (ci?.phone) lines.push(`Phone: ${ci.phone}`)
        if (ci?.email) lines.push(`Email: ${ci.email}`)
        return lines.length > 0 ? lines.join('<br>') : '(empty)'
      }
      
      // Generic object handling
      const entries = Object.entries(value).map(([k, v]) => {
        if (v === null || v === undefined) return `${k}: (empty)`
        if (typeof v === 'object') {
          try {
            return `${k}: ${JSON.stringify(v, null, 2)}`
          } catch {
            return `${k}: ${String(v)}`
          }
        }
        return `${k}: ${String(v)}`
      })
      return entries.length > 0 ? entries.join('<br>') : '(empty)'
    }
    
    // Handle primitive types
    if (typeof value === 'string') {
      // For rich text fields, return as-is when asHtml is true
      if (asHtml && ['scopeOfWork', 'priceSchedule', 'exclusions', 'paymentTerms'].includes(field)) {
        return value
      }
      // Try to parse JSON string if value looks like JSON
      if ((value.startsWith('{') || value.startsWith('[')) && value.length > 1) {
        try {
          const parsed = JSON.parse(value)
          // Recursively format the parsed value
          return formatHistoryValue(field, parsed, { asHtml })
        } catch {
          // Not valid JSON, return as string
          return value.trim() || '(empty)'
        }
      }
      return value.trim() || '(empty)'
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    
    // Fallback - try to stringify
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value) || '(empty)'
    }
  }

  if (isLoading) {
    return (
      <div className="lead-management" style={{ padding: 24 }}>
        <PageSkeleton showHeader={true} showContent={true} />
      </div>
    )
  }

  if (!variation) return (
    <div className="lead-management" style={{ padding: 24 }}>
      <h2>Variation Details</h2>
      <p>No variation found.</p>
    </div>
  )

  const currency = 'AED' // Default currency since priceSchedule is now just HTML
  const approvalStatus = variation.managementApproval?.status

  return (
    <div className="lead-detail">
      <div className="ld-header">
        <div className="ld-title">
          <div className="title-row">
            <h1>Variation {variation.variationNumber} — {variation.projectTitle || variation.lead?.projectTitle || project?.name || 'Variation'}</h1>
          </div>
          <span className="ld-subtitle">Offer Ref: {variation.offerReference || 'N/A'}</span>
        </div>
        <div className="ld-sticky-actions">
          <button className="save-btn" onClick={generatePDFPreview}>Print Preview</button>
          {project && (
            <button className="link-btn" onClick={() => {
              try {
                localStorage.setItem('projectId', project._id)
                localStorage.setItem('projectsFocusId', project._id)
              } catch {}
              window.location.href = '/project-detail'
            }}>View Project</button>
          )}
          {variation.lead?._id && (
            <button className="link-btn" onClick={async () => {
              try {
                const leadId = typeof variation.lead === 'object' ? variation.lead._id : variation.lead
                const res = await apiFetch(`/api/leads/${leadId}`)
                const leadData = await res.json()
                const visitsRes = await apiFetch(`/api/leads/${leadId}/site-visits`)
                const visits = await visitsRes.json()
                localStorage.setItem('leadDetail', JSON.stringify({ ...leadData, siteVisits: visits }))
                localStorage.setItem('leadId', leadId)
                window.location.href = '/lead-detail'
              } catch { setNotify({ open: true, title: 'Open Lead Failed', message: 'We could not open the linked lead. Please try again.' }) }
            }}>View Lead</button>
          )}
          {(currentUser?.roles?.includes('estimation_engineer') || variation?.createdBy?._id === currentUser?.id) && (
            <button className="assign-btn" onClick={() => {
              if (approvalStatus === 'approved') {
                setEditWarningModal({ open: true })
              } else {
                const originalOfferDate = variation.offerDate ? String(variation.offerDate).slice(0,10) : ''
                const originalEnquiryDate = variation.enquiryDate ? String(variation.enquiryDate).slice(0,10) : ''
                setOriginalDateValues({ offerDate: originalOfferDate, enquiryDate: originalEnquiryDate })
                setDateFieldsModified({ offerDate: false, enquiryDate: false })
                
                // Convert array data to HTML strings for ScopeOfWorkEditor
                const scopeOfWorkValue = typeof variation.scopeOfWork === 'string' 
                  ? variation.scopeOfWork 
                  : (Array.isArray(variation.scopeOfWork) && variation.scopeOfWork.length
                      ? variation.scopeOfWork.map(item => item.description || '').join('<br>')
                      : '')
                
                const exclusionsValue = typeof variation.exclusions === 'string'
                  ? variation.exclusions
                  : (Array.isArray(variation.exclusions) && variation.exclusions.length
                      ? variation.exclusions.join('<br>')
                      : '')
                
                const paymentTermsValue = typeof variation.paymentTerms === 'string'
                  ? variation.paymentTerms
                  : (Array.isArray(variation.paymentTerms) && variation.paymentTerms.length
                      ? variation.paymentTerms.map(term => `${term.milestoneDescription || ''}${term.amountPercent ? ` - ${term.amountPercent}%` : ''}`).join('<br>')
                      : '')
                
                // Reset file states
                setEditSelectedFiles([])
                setEditPreviewFiles([])
                setEditAttachmentsToRemove([])
                
                setEditModal({ open: true, form: {
                  companyInfo: variation.companyInfo || {},
                  submittedTo: variation.submittedTo || '',
                  attention: variation.attention || '',
                  offerReference: variation.offerReference || '',
                  enquiryNumber: variation.enquiryNumber || '',
                  offerDate: originalOfferDate,
                  enquiryDate: originalEnquiryDate,
                  projectTitle: variation.projectTitle || variation.lead?.projectTitle || project?.name || '',
                  introductionText: variation.introductionText || '',
                  scopeOfWork: scopeOfWorkValue,
                  priceSchedule: typeof variation.priceSchedule === 'string' ? variation.priceSchedule : '',
                  ourViewpoints: variation.ourViewpoints || '',
                  exclusions: exclusionsValue,
                  paymentTerms: paymentTermsValue,
                  deliveryCompletionWarrantyValidity: variation.deliveryCompletionWarrantyValidity || { deliveryTimeline: '', warrantyPeriod: '', offerValidity: 30, authorizedSignatory: currentUser?.name || '' }
                } })
              }
            }}>Edit</button>
          )}
          {approvalStatus === 'pending' ? (
            <span className="status-badge blue">Approval Pending</span>
          ) : (
            (approvalStatus !== 'approved' && (currentUser?.roles?.includes('estimation_engineer') || variation?.createdBy?._id === currentUser?.id)) && (
              <button className="save-btn" onClick={() => setSendApprovalConfirmModal({ open: true })}>Send for Approval</button>
            )
          )}
          {(currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin')) && approvalStatus === 'pending' && (
            <>
              <button className="approve-btn" onClick={() => setApprovalModal({ open: true, action: 'approved', note: '' })}>Approve</button>
              <button className="reject-btn" onClick={() => setApprovalModal({ open: true, action: 'rejected', note: '' })}>Reject</button>
            </>
          )}
          {/* Delete button - Estimation Engineers before approval, Managers/Admins after approval */}
          {((approvalStatus !== 'approved' && currentUser?.roles?.includes('estimation_engineer')) || 
            (approvalStatus === 'approved' && (currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin')))) && (
            <button className="reject-btn" onClick={() => setDeleteModal({ open: true })}>Delete Variation</button>
          )}
          {approvalStatus === 'approved' && (currentUser?.roles?.includes('estimation_engineer') || variation?.createdBy?._id === currentUser?.id) && (
            <button className="save-btn" onClick={async () => {
              try {
                // Check if a child variation already exists
                const res = await apiFetch(`/api/project-variations?parentVariation=${variation._id}`)
                const childVariations = await res.json()
                if (Array.isArray(childVariations) && childVariations.length > 0) {
                  setNotify({ open: true, title: 'Not Allowed', message: 'A child variation already exists for this variation.' })
                  return
                }
                // Open create variation modal with pre-populated form
                const originalOfferDate = variation.offerDate ? String(variation.offerDate).slice(0,10) : ''
                const originalEnquiryDate = variation.enquiryDate ? String(variation.enquiryDate).slice(0,10) : ''
                setCreateVariationModal({ open: true, form: {
                  companyInfo: variation.companyInfo || {},
                  submittedTo: variation.submittedTo || '',
                  attention: variation.attention || '',
                  offerReference: variation.offerReference || '',
                  enquiryNumber: variation.enquiryNumber || '',
                  offerDate: originalOfferDate,
                  enquiryDate: originalEnquiryDate,
                  projectTitle: variation.projectTitle || variation.lead?.projectTitle || project?.name || '',
                  introductionText: variation.introductionText || '',
                  scopeOfWork: variation.scopeOfWork?.length ? variation.scopeOfWork : [{ description: '', quantity: '', unit: '', locationRemarks: '' }],
                  priceSchedule: typeof variation.priceSchedule === 'string' ? variation.priceSchedule : '',
                  ourViewpoints: variation.ourViewpoints || '',
                  exclusions: variation.exclusions?.length ? variation.exclusions : [''],
                  paymentTerms: variation.paymentTerms?.length ? variation.paymentTerms : [{ milestoneDescription: '', amountPercent: ''}],
                  deliveryCompletionWarrantyValidity: variation.deliveryCompletionWarrantyValidity || { deliveryTimeline: '', warrantyPeriod: '', offerValidity: 30, authorizedSignatory: currentUser?.name || '' }
                } })
              } catch (e) {
                setNotify({ open: true, title: 'Error', message: 'Could not check for existing child variations. Please try again.' })
              }
            }}>Create Another Variation</button>
          )}
        </div>
      </div>

      <div className="ld-grid">
        {project && (
          <div className="ld-card ld-section">
            <h3>Parent Project</h3>
            <div className="ld-kv">
              <p><strong>Project Name:</strong> {project.name || 'N/A'}</p>
              <p><strong>Status:</strong> {project.status || 'N/A'}</p>
            </div>
          </div>
        )}

        {lead && (
          <div className="ld-card ld-section">
            <h3>Lead Overview</h3>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td data-label="Field">Customer</td>
                    <td data-label="Value">{lead.customerName || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td data-label="Field">Project Title</td>
                    <td data-label="Value">{lead.projectTitle || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td data-label="Field">Enquiry #</td>
                    <td data-label="Value">{lead.enquiryNumber || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td data-label="Field">Enquiry Date</td>
                    <td data-label="Value">{lead.enquiryDate ? new Date(lead.enquiryDate).toLocaleDateString() : 'N/A'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {variation.companyInfo && (variation.companyInfo.name || variation.companyInfo.address || variation.companyInfo.phone || variation.companyInfo.email) && (
          <div className="ld-card ld-section">
            <h3>Company Information</h3>
            <div className="ld-kv">
              {variation.companyInfo.name && <p><strong>Company Name:</strong> {variation.companyInfo.name}</p>}
              {variation.companyInfo.address && <p><strong>Address:</strong> {variation.companyInfo.address}</p>}
              {variation.companyInfo.phone && <p><strong>Phone:</strong> {variation.companyInfo.phone}</p>}
              {variation.companyInfo.email && <p><strong>Email:</strong> {variation.companyInfo.email}</p>}
            </div>
          </div>
        )}

        <div className="ld-card ld-section">
          <h3>Variation Overview</h3>
          <div className="ld-kv">
            <p><strong>Submitted To:</strong> {variation.submittedTo || 'N/A'}</p>
            <p><strong>Attention:</strong> {variation.attention || 'N/A'}</p>
            <p><strong>Offer Date:</strong> {variation.offerDate ? new Date(variation.offerDate).toLocaleDateString() : 'N/A'}</p>
            <p><strong>Enquiry Date:</strong> {variation.enquiryDate ? new Date(variation.enquiryDate).toLocaleDateString() : 'N/A'}</p>
            <p><strong>Enquiry #:</strong> {variation.enquiryNumber || lead?.enquiryNumber || 'N/A'}</p>
            <p><strong>Created By:</strong> {variation.createdBy?._id === currentUser?.id ? 'You' : (variation.createdBy?.name || 'N/A')} {variation.createdBy?._id && variation.createdBy._id !== currentUser?.id && (
              <button className="link-btn" onClick={() => setProfileUser(variation.createdBy)} style={{ marginLeft: 6 }}>View Profile</button>
            )}</p>
          </div>
        </div>

        {variation.diffFromParent && Array.isArray(variation.diffFromParent) && variation.diffFromParent.length > 0 && (
          <div className="ld-card ld-section">
            <h3>Changes from Parent</h3>
            <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
              This variation includes the following changes from the parent {variation.parentVariation ? 'variation' : 'project'}:
            </p>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Previous Value</th>
                    <th>New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {variation.diffFromParent.map((diff, idx) => {
                    const fieldNameMap = {
                      'companyInfo': 'Company Info',
                      'submittedTo': 'Submitted To',
                      'attention': 'Attention',
                      'offerReference': 'Offer Reference',
                      'enquiryNumber': 'Enquiry Number',
                      'offerDate': 'Offer Date',
                      'enquiryDate': 'Enquiry Date',
                      'projectTitle': 'Project Title',
                      'introductionText': 'Introduction',
                      'scopeOfWork': 'Scope of Work',
                      'priceSchedule': 'Price Schedule',
                      'ourViewpoints': 'Our Viewpoints',
                      'exclusions': 'Exclusions',
                      'paymentTerms': 'Payment Terms',
                      'deliveryCompletionWarrantyValidity': 'Delivery & Warranty'
                    }
                    const fieldName = fieldNameMap[diff.field] || diff.field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
                    
                    // Check if this is a rich text field
                    const isRichText = ['scopeOfWork', 'priceSchedule', 'exclusions', 'paymentTerms', 'ourViewpoints'].includes(diff.field)
                    // Check if this field should be rendered as HTML (contains HTML tags)
                    const isHtmlField = isRichText || diff.field === 'deliveryCompletionWarrantyValidity'
                    
                    // Format the values for display - ensure we're accessing the correct properties
                    const fromVal = diff.from !== undefined ? diff.from : (diff.fromValue !== undefined ? diff.fromValue : null)
                    const toVal = diff.to !== undefined ? diff.to : (diff.toValue !== undefined ? diff.toValue : null)
                    
                    // For rich text fields, use raw value directly; for others, format it
                    const fromValue = isRichText ? (fromVal || '') : formatHistoryValue(diff.field, fromVal)
                    const toValue = isRichText ? (toVal || '') : formatHistoryValue(diff.field, toVal)
                    
                    return (
                      <tr key={idx}>
                        <td data-label="Field"><strong>{fieldName}</strong></td>
                        <td data-label="Previous Value">
                          {isHtmlField ? (
                            <div className="rich-text-content" style={{ 
                              padding: '8px', 
                              border: '1px solid #FECACA', 
                              background: '#FEF2F2', 
                              borderRadius: '6px', 
                              maxHeight: '300px', 
                              overflow: 'auto', 
                              color: '#991B1B' 
                            }} dangerouslySetInnerHTML={{ __html: fromValue }} />
                          ) : (
                            <pre style={{ 
                              margin: 0, 
                              padding: '10px 12px', 
                              background: '#FEF2F2', 
                              border: '1px solid #FECACA', 
                              borderRadius: '6px',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontSize: '13px',
                              color: '#991B1B',
                              fontFamily: 'inherit'
                            }}>
                              {fromValue || '(empty)'}
                            </pre>
                          )}
                        </td>
                        <td data-label="New Value">
                          {isHtmlField ? (
                            <div className="rich-text-content" style={{ 
                              padding: '8px', 
                              border: '1px solid #BBF7D0', 
                              background: '#F0FDF4', 
                              borderRadius: '6px', 
                              maxHeight: '300px', 
                              overflow: 'auto', 
                              color: '#166534' 
                            }} dangerouslySetInnerHTML={{ __html: toValue }} />
                          ) : (
                            <pre style={{ 
                              margin: 0, 
                              padding: '10px 12px', 
                              background: '#F0FDF4', 
                              border: '1px solid #BBF7D0', 
                              borderRadius: '6px',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontSize: '13px',
                              color: '#166534',
                              fontFamily: 'inherit'
                            }}>
                              {toValue || '(empty)'}
                            </pre>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {variation.introductionText && (
          <div className="ld-card ld-section">
            <h3>Introduction</h3>
            <div>{variation.introductionText}</div>
          </div>
        )}

        {((originalRichTextFields.scopeOfWork && originalRichTextFields.scopeOfWork.trim()) || (typeof variation.scopeOfWork === 'string' && variation.scopeOfWork && variation.scopeOfWork.trim())) && (
          <div className="ld-card ld-section">
            <h3>Scope of Work</h3>
            <div className="rich-text-content" style={{ padding: '8px 12px' }} dangerouslySetInnerHTML={{ __html: (originalRichTextFields.scopeOfWork && originalRichTextFields.scopeOfWork.trim()) || (typeof variation.scopeOfWork === 'string' && variation.scopeOfWork ? variation.scopeOfWork : '') }} />
          </div>
        )}

        {variation.priceSchedule && (
          <div className="ld-card ld-section">
            <h3>Price Schedule</h3>
            <div className="rich-text-content" style={{ padding: '8px 12px' }} dangerouslySetInnerHTML={{ __html: typeof variation.priceSchedule === 'string' ? variation.priceSchedule : '' }} />
          </div>
        )}

        {variation.ourViewpoints && (
          <div className="ld-card ld-section">
            <h3>Our Viewpoints / Special Terms</h3>
            <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: variation.ourViewpoints }} />
          </div>
        )}

        {((originalRichTextFields.exclusions && originalRichTextFields.exclusions.trim()) || (typeof variation.exclusions === 'string' && variation.exclusions && variation.exclusions.trim())) && (
          <div className="ld-card ld-section">
            <h3>Exclusions</h3>
            <div className="rich-text-content" style={{ padding: '8px 12px' }} dangerouslySetInnerHTML={{ __html: (originalRichTextFields.exclusions && originalRichTextFields.exclusions.trim()) || (typeof variation.exclusions === 'string' && variation.exclusions ? variation.exclusions : '') }} />
          </div>
        )}

        {((originalRichTextFields.paymentTerms && originalRichTextFields.paymentTerms.trim()) || (typeof variation.paymentTerms === 'string' && variation.paymentTerms && variation.paymentTerms.trim())) && (
          <div className="ld-card ld-section">
            <h3>Payment Terms</h3>
            <div className="rich-text-content" style={{ padding: '8px 12px' }} dangerouslySetInnerHTML={{ __html: (originalRichTextFields.paymentTerms && originalRichTextFields.paymentTerms.trim()) || (typeof variation.paymentTerms === 'string' && variation.paymentTerms ? variation.paymentTerms : '') }} />
          </div>
        )}

        {variation.deliveryCompletionWarrantyValidity && (
          <div className="ld-card ld-section">
            <h3>Delivery, Completion, Warranty & Validity</h3>
            <div className="ld-kv">
              <p><strong>Delivery Timeline:</strong> {variation.deliveryCompletionWarrantyValidity.deliveryTimeline || 'N/A'}</p>
              <p><strong>Warranty Period:</strong> {variation.deliveryCompletionWarrantyValidity.warrantyPeriod || 'N/A'}</p>
              <p><strong>Offer Validity:</strong> {variation.deliveryCompletionWarrantyValidity.offerValidity || 'N/A'} days</p>
              <p><strong>Authorized Signatory:</strong> {variation.deliveryCompletionWarrantyValidity.authorizedSignatory || 'N/A'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Attachments Section */}
      {Array.isArray(variation.attachments) && variation.attachments.length > 0 && (
        <div className="ld-card ld-section">
          <h3>Attachments ({variation.attachments.length})</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
            gap: '20px',
            marginTop: '15px'
          }}>
            {variation.attachments.map((attachment, index) => {
              const isImage = attachment.mimetype && attachment.mimetype.startsWith('image/')
              const isVideo = attachment.mimetype && attachment.mimetype.startsWith('video/')
              const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
              const fileUrl = attachment.path.startsWith('http') 
                ? attachment.path 
                : `${apiBase}${attachment.path}`

              const formatFileSize = (bytes) => {
                if (bytes === 0) return '0 Bytes'
                const k = 1024
                const sizes = ['Bytes', 'KB', 'MB', 'GB']
                const i = Math.floor(Math.log(bytes) / Math.log(k))
                return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
              }

              return (
                <div 
                  key={index} 
                  style={{ 
                    border: '1px solid #ddd', 
                    borderRadius: '8px', 
                    padding: '12px',
                    backgroundColor: '#fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    cursor: (isImage || isVideo) ? 'pointer' : 'default'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                  onClick={(isImage || isVideo) ? () => {
                    const newWindow = window.open('', '_blank')
                    if (isImage) {
                      newWindow.document.write(`
                        <html>
                          <head>
                            <title>${attachment.originalName}</title>
                            <style>
                              body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
                              img { max-width: 100%; max-height: 90vh; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
                            </style>
                          </head>
                          <body>
                            <img src="${fileUrl}" alt="${attachment.originalName}" />
                          </body>
                        </html>
                      `)
                    } else if (isVideo) {
                      newWindow.document.write(`
                        <html>
                          <head>
                            <title>${attachment.originalName}</title>
                            <style>
                              body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #000; }
                              video { max-width: 100%; max-height: 90vh; border-radius: 8px; }
                            </style>
                          </head>
                          <body>
                            <video src="${fileUrl}" controls autoplay style="width: 100%; max-width: 1200px;"></video>
                          </body>
                        </html>
                      `)
                    }
                  } : undefined}
                >
                  {isImage ? (
                    <div style={{ position: 'relative', width: '100%', marginBottom: '10px' }}>
                      <img 
                        src={fileUrl} 
                        alt={attachment.originalName}
                        style={{ 
                          width: '100%', 
                          height: '150px', 
                          objectFit: 'cover', 
                          borderRadius: '4px',
                          border: '1px solid #eee'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none'
                          const fallback = e.target.nextSibling
                          if (fallback) fallback.style.display = 'flex'
                        }}
                      />
                      <div style={{ 
                        display: 'none',
                        width: '100%', 
                        height: '150px', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        backgroundColor: '#f5f5f5',
                        borderRadius: '4px',
                        border: '1px solid #eee'
                      }}>
                        <span style={{ fontSize: '12px', textAlign: 'center', color: '#666' }}>Image not available</span>
                      </div>
                    </div>
                  ) : isVideo ? (
                    <div style={{ position: 'relative', width: '100%', marginBottom: '10px' }}>
                      <video 
                        src={fileUrl}
                        style={{ 
                          width: '100%', 
                          height: '150px', 
                          objectFit: 'cover', 
                          borderRadius: '4px',
                          border: '1px solid #eee'
                        }}
                        controls={false}
                        muted
                        onError={(e) => {
                          e.target.style.display = 'none'
                          const fallback = e.target.nextSibling.nextSibling
                          if (fallback) fallback.style.display = 'flex'
                        }}
                      />
                      <div style={{ 
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none'
                      }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                      <div style={{ 
                        display: 'none',
                        width: '100%', 
                        height: '150px', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        backgroundColor: '#f5f5f5',
                        borderRadius: '4px',
                        border: '1px solid #eee'
                      }}>
                        <span style={{ fontSize: '12px', textAlign: 'center', color: '#666' }}>Video not available</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ 
                      width: '100%', 
                      height: '150px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '4px',
                      marginBottom: '10px',
                      border: '1px solid #eee'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#666', marginBottom: '8px' }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <div style={{ fontSize: '11px', color: '#666', wordBreak: 'break-word' }}>
                          {attachment.originalName.length > 20 
                            ? attachment.originalName.substring(0, 20) + '...' 
                            : attachment.originalName}
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ 
                      fontSize: '13px', 
                      fontWeight: '500', 
                      color: '#333',
                      marginBottom: '4px',
                      wordBreak: 'break-word'
                    }}>
                      {attachment.originalName.length > 25 
                        ? attachment.originalName.substring(0, 25) + '...' 
                        : attachment.originalName}
                    </div>
                    <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
                      {formatFileSize(attachment.size)}
                    </div>
                    <a 
                      href={fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'inline-block',
                        padding: '6px 12px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
                    >
                      {isImage ? 'View Full Size' : isVideo ? 'Play Video' : 'Download'}
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {variation && (
        <div className="ld-card ld-section">
          <button className="link-btn" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Hide Variation Edit History' : 'View Variation Edit History'}
          </button>
          {showHistory && Array.isArray(variation.edits) && variation.edits.length > 0 && (
            <div className="edits-list" style={{ marginTop: 8 }}>
              {variation.edits.slice().reverse().map((edit, idx) => (
                <div key={idx} className="edit-item">
                  <div className="edit-header">
                    <span>By {edit.editedBy?._id === currentUser?.id ? 'You' : (edit.editedBy?.name || 'N/A')}</span>
                    {edit.editedBy?._id && edit.editedBy._id !== currentUser?.id && (
                      <button className="link-btn" onClick={() => setProfileUser(edit.editedBy)} style={{ marginLeft: 6 }}>View Profile</button>
                    )}
                    <span>{new Date(edit.editedAt).toLocaleString()}</span>
                  </div>
                  <ul className="changes-list">
                    {edit.changes.map((c, i) => {
                       const isRichText = ['scopeOfWork', 'priceSchedule', 'exclusions', 'paymentTerms', 'ourViewpoints'].includes(c.field)
                       return (
                         <li key={i}>
                           <strong>{c.field}:</strong>
                           <div className="change-diff">
                             {isRichText ? (
                               <>
                                 <div className="change-block" style={{ maxHeight: '200px', overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: formatHistoryValue(c.field, c.from, { asHtml: true }) }} />
                                 <span>→</span>
                                 <div className="change-block" style={{ maxHeight: '200px', overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: formatHistoryValue(c.field, c.to, { asHtml: true }) }} />
                               </>
                             ) : (
                               <>
                                 <pre className="change-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatHistoryValue(c.field, c.from)}</pre>
                                 <span>→</span>
                                 <pre className="change-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatHistoryValue(c.field, c.to)}</pre>
                               </>
                             )}
                           </div>
                         </li>
                       )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {variation && (
        <div className="ld-card ld-section">
          <button className="link-btn" onClick={() => setShowApprovals(!showApprovals)}>
            {showApprovals ? 'Hide Approvals/Rejections' : 'View Approvals/Rejections'}
          </button>
          {showApprovals && (
            <>
              <h3 style={{ marginTop: '16px' }}>Approvals & Rejections</h3>
          {(() => {
            const varData = variation
            const rawLogs = Array.isArray(varData.managementApproval?.logs) ? varData.managementApproval.logs.slice().sort((a, b) => {
              const aTime = a.at ? new Date(a.at).getTime() : 0
              const bTime = b.at ? new Date(b.at).getTime() : 0
              return aTime - bTime
            }) : []
            const cycles = []
            let current = null
            for (const entry of rawLogs) {
              if (entry.status === 'pending') {
                if (current) cycles.push(current)
                current = {
                  requestedAt: entry.at || varData.updatedAt || varData.createdAt,
                  requestedBy: entry.requestedBy,
                  requestNote: entry.note,
                  decidedAt: null,
                  decidedBy: null,
                  decisionNote: null,
                  decisionStatus: 'pending'
                }
              } else if (entry.status === 'approved' || entry.status === 'rejected') {
                if (!current) {
                  current = { requestedAt: null, requestedBy: null, requestNote: null, decidedAt: null, decidedBy: null, decisionNote: null, decisionStatus: null }
                }
                if (!current.decidedAt) {
                  current.decidedAt = entry.at || varData.managementApproval?.approvedAt || varData.updatedAt || varData.createdAt
                  current.decidedBy = entry.decidedBy
                  current.decisionNote = entry.note
                  current.decisionStatus = entry.status
                  cycles.push(current)
                  current = null
                } else {
                  cycles.push({ requestedAt: null, requestedBy: null, requestNote: null, decidedAt: entry.at || varData.updatedAt || varData.createdAt, decidedBy: entry.decidedBy, decisionNote: entry.note, decisionStatus: entry.status })
                }
              }
            }
            if (current) cycles.push(current)

            if (cycles.length === 0 && (varData.managementApproval?.requestedBy || varData.managementApproval?.approvedBy)) {
              cycles.push({
                requestedAt: varData.updatedAt || varData.createdAt,
                requestedBy: varData.managementApproval?.requestedBy,
                requestNote: varData.managementApproval?.comments,
                decidedAt: varData.managementApproval?.approvedAt,
                decidedBy: varData.managementApproval?.approvedBy,
                decisionNote: varData.managementApproval?.comments,
                decisionStatus: varData.managementApproval?.status
              })
            }

            if (cycles.length === 0) return <p>No approval records.</p>

            return (
              <div className="edits-list" style={{ marginTop: 8 }}>
                {cycles.map((c, idx) => (
                  <div key={idx} className="edit-item">
                    <div className="edit-header">
                      <span>Approval Cycle {idx + 1} — {c.decisionStatus ? c.decisionStatus.toUpperCase() : 'PENDING'}</span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      <div><strong>Requested:</strong> {c.requestedAt ? new Date(c.requestedAt).toLocaleString() : '—'} {c.requestedBy?.name && (<> by {c.requestedBy?._id === currentUser?.id ? 'YOU' : c.requestedBy.name}
                        {c.requestedBy?._id && c.requestedBy._id !== currentUser?.id && (
                          <button className="link-btn" onClick={() => setProfileUser(c.requestedBy)} style={{ marginLeft: 6 }}>View Profile</button>
                        )}
                      </>)}</div>
                      {c.requestNote && <div><strong>Request note:</strong> {c.requestNote}</div>}
                      <div style={{ marginTop: 6 }}><strong>Decision:</strong> {c.decidedAt ? new Date(c.decidedAt).toLocaleString() : '—'} {c.decidedBy?.name && (<> by {c.decidedBy?._id === currentUser?.id ? 'YOU' : c.decidedBy.name}
                        {c.decidedBy?._id && c.decidedBy._id !== currentUser?.id && (
                          <button className="link-btn" onClick={() => setProfileUser(c.decidedBy)} style={{ marginLeft: 6 }}>View Profile</button>
                        )}
                      </>)} {c.decisionStatus && <span style={{ marginLeft: 6, textTransform: 'uppercase' }}>({c.decisionStatus})</span>}</div>
                      {c.decisionNote && <div><strong>Decision note:</strong> {c.decisionNote}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
            </>
          )}
        </div>
      )}

      {editModal.open && (
        <div className="modal-overlay" onClick={() => {
          setEditModal({ open: false, form: null })
          setEditSelectedFiles([])
          setEditPreviewFiles([])
          setEditAttachmentsToRemove([])
        }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Variation</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {editModal.form && variation?._id && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (variation && variation._id) {
                          window.open(`/variations/edit/${variation._id}`, '_blank')
                        }
                      }}
                      className="link-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '14px',
                        padding: '6px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        background: 'transparent',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      title="Open in New Tab"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                      Open in New Tab
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (variation && variation._id) {
                          window.location.href = `/variations/edit/${variation._id}`
                        }
                      }}
                      className="link-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '14px',
                        padding: '6px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        background: 'transparent',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      title="Open Full Form"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                      </svg>
                      Open Full Form
                    </button>
                  </>
                )}
                <button onClick={() => {
                  setEditModal({ open: false, form: null })
                  setEditSelectedFiles([])
                  setEditPreviewFiles([])
                  setEditAttachmentsToRemove([])
                }} className="close-btn">×</button>
              </div>
            </div>
            {editModal.form && (
              <div className="lead-form" style={{ maxHeight: '70vh', overflow: 'auto' }}>
                {variation.managementApproval?.status === 'approved' && (
                  <div style={{ padding: '16px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '16px' }}>
                    <p style={{ margin: 0, color: '#7C2D12', fontWeight: 500 }}>
                      ⚠️ This variation has been approved and cannot be edited. Please close this modal and contact a manager or administrator to revert the approval status if changes are needed.
                    </p>
                  </div>
                )}
                <div className="form-section">
                  <div className="section-header">
                    <h3>Cover & Basic Details</h3>
                  </div>
                  <div className="form-group">
                    <label>Submitted To (Client Company)</label>
                    <input type="text" value={editModal.form.submittedTo} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, submittedTo: e.target.value } })} />
                  </div>
                  <div className="form-group">
                    <label>Attention (Contact Person)</label>
                    <input type="text" value={editModal.form.attention} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, attention: e.target.value } })} />
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Offer Reference</label>
                      <input type="text" value={editModal.form.offerReference} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, offerReference: e.target.value } })} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Enquiry Number</label>
                      <input type="text" value={editModal.form.enquiryNumber} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, enquiryNumber: e.target.value } })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Offer Date</label>
                      <input 
                        type="date" 
                        value={editModal.form.offerDate} 
                        onChange={e => {
                          setDateFieldsModified(prev => ({ ...prev, offerDate: true }))
                          setEditModal({ ...editModal, form: { ...editModal.form, offerDate: e.target.value } })
                        }} 
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Enquiry Date</label>
                      <input 
                        type="date" 
                        value={editModal.form.enquiryDate} 
                        onChange={e => {
                          setDateFieldsModified(prev => ({ ...prev, enquiryDate: true }))
                          setEditModal({ ...editModal, form: { ...editModal.form, enquiryDate: e.target.value } })
                        }} 
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Project Details</h3>
                  </div>
                  <div className="form-group">
                    <label>Project Title</label>
                    <input type="text" value={editModal.form.projectTitle} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, projectTitle: e.target.value } })} />
                  </div>
                  <div className="form-group">
                    <label>Introduction</label>
                    <textarea value={editModal.form.introductionText} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, introductionText: e.target.value } })} />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Scope of Work</h3>
                  </div>
                  <div className="form-group">
                    <ScopeOfWorkEditor
                      value={typeof editModal.form.scopeOfWork === 'string' ? editModal.form.scopeOfWork : (Array.isArray(editModal.form.scopeOfWork) ? editModal.form.scopeOfWork.map(item => item.description || '').join('<br>') : '')}
                      onChange={(value) => setEditModal({ ...editModal, form: { ...editModal.form, scopeOfWork: value } })}
                    />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Price Schedule</h3>
                  </div>
                  <div className="form-group">
                    <ScopeOfWorkEditor
                      value={typeof editModal.form.priceSchedule === 'string' ? editModal.form.priceSchedule : ''}
                      onChange={(html) => setEditModal({ ...editModal, form: { ...editModal.form, priceSchedule: html } })}
                    />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Our Viewpoints / Special Terms</h3>
                  </div>
                  <div className="form-group">
                    <label>Our Viewpoints / Special Terms</label>
                    <textarea value={editModal.form.ourViewpoints} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, ourViewpoints: e.target.value } })} />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Exclusions</h3>
                  </div>
                  <div className="form-group">
                    <ScopeOfWorkEditor
                      value={typeof editModal.form.exclusions === 'string' ? editModal.form.exclusions : (Array.isArray(editModal.form.exclusions) ? editModal.form.exclusions.join('<br>') : '')}
                      onChange={(html) => setEditModal({ ...editModal, form: { ...editModal.form, exclusions: html } })}
                    />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Payment Terms</h3>
                  </div>
                  <div className="form-group">
                    <ScopeOfWorkEditor
                      value={typeof editModal.form.paymentTerms === 'string' ? editModal.form.paymentTerms : (Array.isArray(editModal.form.paymentTerms) ? editModal.form.paymentTerms.map(term => `${term.milestoneDescription || ''}${term.amountPercent ? ` - ${term.amountPercent}%` : ''}`).join('<br>') : '')}
                      onChange={(html) => setEditModal({ ...editModal, form: { ...editModal.form, paymentTerms: html } })}
                    />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Delivery, Completion, Warranty & Validity</h3>
                  </div>
                  <div className="form-group">
                    <label>Delivery / Completion Timeline</label>
                    <input type="text" value={editModal.form.deliveryCompletionWarrantyValidity.deliveryTimeline} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, deliveryCompletionWarrantyValidity: { ...editModal.form.deliveryCompletionWarrantyValidity, deliveryTimeline: e.target.value } } })} />
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Warranty Period</label>
                      <input type="text" value={editModal.form.deliveryCompletionWarrantyValidity.warrantyPeriod} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, deliveryCompletionWarrantyValidity: { ...editModal.form.deliveryCompletionWarrantyValidity, warrantyPeriod: e.target.value } } })} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Offer Validity (Days)</label>
                      <input type="number" value={editModal.form.deliveryCompletionWarrantyValidity.offerValidity} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, deliveryCompletionWarrantyValidity: { ...editModal.form.deliveryCompletionWarrantyValidity, offerValidity: e.target.value } } })} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Authorized Signatory</label>
                    <input type="text" value={editModal.form.deliveryCompletionWarrantyValidity.authorizedSignatory} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, deliveryCompletionWarrantyValidity: { ...editModal.form.deliveryCompletionWarrantyValidity, authorizedSignatory: e.target.value } } })} />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Attachments</h3>
                  </div>
                  <div className="form-group">
                    <label>Upload Files</label>
                    <input
                      key={`edit-file-input-${editModal.open ? 'open' : 'closed'}-${variation?._id || ''}`}
                      type="file"
                      multiple
                      onChange={handleEditFileChange}
                      style={{ marginBottom: '15px' }}
                    />
                    {editPreviewFiles.length > 0 && (
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                        gap: '15px',
                        marginTop: '15px'
                      }}>
                        {editPreviewFiles.map((preview, index) => (
                          <div 
                            key={index} 
                            style={{ 
                              border: '1px solid #ddd', 
                              borderRadius: '8px', 
                              padding: '10px',
                              backgroundColor: '#fff',
                              position: 'relative'
                            }}
                          >
                            {preview.type === 'image' && preview.preview && (
                              <img 
                                src={preview.preview} 
                                alt={preview.file.name}
                                style={{ 
                                  width: '100%', 
                                  height: '150px', 
                                  objectFit: 'cover',
                                  borderRadius: '4px',
                                  marginBottom: '8px'
                                }}
                              />
                            )}
                            {preview.type === 'video' && preview.preview && (
                              <video 
                                src={preview.preview}
                                style={{ 
                                  width: '100%', 
                                  height: '150px', 
                                  objectFit: 'cover',
                                  borderRadius: '4px',
                                  marginBottom: '8px'
                                }}
                                controls
                              />
                            )}
                            {preview.type === 'document' && (
                              <div style={{ 
                                width: '100%', 
                                height: '150px', 
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: '#f5f5f5',
                                borderRadius: '4px',
                                marginBottom: '8px',
                                fontSize: '48px'
                              }}>
                                📄
                              </div>
                            )}
                            <div style={{ fontSize: '12px', marginBottom: '8px', wordBreak: 'break-word' }}>
                              {preview.file.name.length > 20 
                                ? preview.file.name.substring(0, 20) + '...' 
                                : preview.file.name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
                              {formatFileSize(preview.file.size)}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeEditFile(index)}
                              style={{
                                width: '100%',
                                padding: '6px',
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {variation.attachments && Array.isArray(variation.attachments) && variation.attachments.length > 0 && (
                      <div style={{ marginTop: '15px' }}>
                        <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>Existing Attachments:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                          {variation.attachments.map((attachment, index) => {
                            const isImage = attachment.mimetype && attachment.mimetype.startsWith('image/')
                            const isVideo = attachment.mimetype && attachment.mimetype.startsWith('video/')
                            const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
                            const fileUrl = attachment.path.startsWith('http') ? attachment.path : `${apiBase}${attachment.path}`
                            const isMarkedForRemoval = editAttachmentsToRemove.includes(index.toString())
                            
                            return (
                              <div 
                                key={index} 
                                style={{ 
                                  border: '1px solid #ddd', 
                                  borderRadius: '8px', 
                                  padding: '10px',
                                  backgroundColor: isMarkedForRemoval ? '#fee' : '#fff',
                                  opacity: isMarkedForRemoval ? 0.6 : 1,
                                  position: 'relative',
                                  width: '200px'
                                }}
                              >
                                {isImage && (
                                  <img 
                                    src={fileUrl} 
                                    alt={attachment.originalName}
                                    style={{ 
                                      width: '100%', 
                                      height: '150px', 
                                      objectFit: 'cover',
                                      borderRadius: '4px',
                                      marginBottom: '8px'
                                    }}
                                  />
                                )}
                                {isVideo && (
                                  <video 
                                    src={fileUrl}
                                    style={{ 
                                      width: '100%', 
                                      height: '150px', 
                                      objectFit: 'cover',
                                      borderRadius: '4px',
                                      marginBottom: '8px'
                                    }}
                                    controls
                                  />
                                )}
                                {!isImage && !isVideo && (
                                  <div style={{ 
                                    width: '100%', 
                                    height: '150px', 
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: '#f5f5f5',
                                    borderRadius: '4px',
                                    marginBottom: '8px',
                                    fontSize: '48px'
                                  }}>
                                    📄
                                  </div>
                                )}
                                <div style={{ fontSize: '12px', marginBottom: '8px', wordBreak: 'break-word' }}>
                                  {attachment.originalName.length > 20 
                                    ? attachment.originalName.substring(0, 20) + '...' 
                                    : attachment.originalName}
                                </div>
                                <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
                                  {formatFileSize(attachment.size)}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeEditAttachment(index)}
                                  disabled={isMarkedForRemoval}
                                  style={{
                                    width: '100%',
                                    padding: '6px',
                                    backgroundColor: isMarkedForRemoval ? '#999' : '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: isMarkedForRemoval ? 'not-allowed' : 'pointer',
                                    fontSize: '12px'
                                  }}
                                >
                                  {isMarkedForRemoval ? 'Marked for Removal' : 'Remove'}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="cancel-btn" onClick={() => {
                    setEditModal({ open: false, form: null })
                    setEditSelectedFiles([])
                    setEditPreviewFiles([])
                    setEditAttachmentsToRemove([])
                  }}>Cancel</button>
                  <button 
                    type="button" 
                    className="save-btn" 
                    disabled={variation.managementApproval?.status === 'approved' || isSubmitting}
                    style={variation.managementApproval?.status === 'approved' ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                    onClick={async () => {
                      if (isSubmitting) return
                      setLoadingAction('save-variation')
                      setIsSubmitting(true)
                      try {
                        // Prevent saving if variation is approved (safety check)
                        if (variation.managementApproval?.status === 'approved') {
                          setNotify({ open: true, title: 'Cannot Edit', message: 'This variation has been approved and cannot be edited. The approval status must be reverted first.' })
                          return
                        }
                        
                        // Block save if date fields haven't been manually modified
                        if (!dateFieldsModified.offerDate && !dateFieldsModified.enquiryDate) {
                          // Check if dates are different from original (automatic change detected)
                          const currentOfferDate = editModal.form.offerDate || ''
                          const currentEnquiryDate = editModal.form.enquiryDate || ''
                          if (currentOfferDate !== originalDateValues.offerDate || currentEnquiryDate !== originalDateValues.enquiryDate) {
                            setNotify({ open: true, title: 'Date Fields Not Modified', message: 'Offer Date and Enquiry Date have not been manually modified. Please explicitly change these dates if you want to update them, or they will remain unchanged.' })
                            return
                          }
                        }
                        
                        // Check if there are any actual changes (including files)
                        const hasFiles = editSelectedFiles.length > 0
                        const hasAttachmentsToRemove = editAttachmentsToRemove.length > 0
                        if (!hasVariationChanges(variation, editModal.form) && !hasFiles && !hasAttachmentsToRemove) {
                          setNotify({ open: true, title: 'No Changes Detected', message: 'No changes have been made to this variation. Please modify the data before saving.' })
                          return
                        }
                        
                        const token = localStorage.getItem('token')
                        // Create payload excluding date fields if they weren't manually modified
                        const payload = { ...editModal.form }
                        if (!dateFieldsModified.offerDate) {
                          delete payload.offerDate
                        }
                        if (!dateFieldsModified.enquiryDate) {
                          delete payload.enquiryDate
                        }
                        
                        // Convert HTML strings to backend array format
                        // Convert scopeOfWork string to array format for backend compatibility
                        if (typeof payload.scopeOfWork === 'string') {
                          payload.scopeOfWork = payload.scopeOfWork ? [{ description: payload.scopeOfWork, quantity: '', unit: '', locationRemarks: '' }] : []
                        }
                        
                        // Convert exclusions string to array format for backend compatibility
                        if (typeof payload.exclusions === 'string') {
                          if (payload.exclusions) {
                            // Split by <br> and filter out empty strings
                            const temp = document.createElement('div')
                            temp.innerHTML = payload.exclusions
                            const lines = temp.textContent || temp.innerText || ''
                            payload.exclusions = lines.split(/\n|<br\s*\/?>/i).map(line => line.trim()).filter(line => line)
                          } else {
                            payload.exclusions = []
                          }
                        }
                        
                        // Convert paymentTerms string to array format for backend compatibility
                        if (typeof payload.paymentTerms === 'string') {
                          payload.paymentTerms = payload.paymentTerms 
                            ? payload.paymentTerms.split(/<br\s*\/?>/i).map(term => {
                                // Remove HTML tags and get text content
                                const temp = document.createElement('div')
                                temp.innerHTML = term
                                const text = (temp.textContent || temp.innerText || '').trim()
                                // Try to parse "Milestone - X%" format
                                const match = text.match(/^(.+?)(?:\s*-\s*(\d+(?:\.\d+)?)%)?$/)
                                return {
                                  milestoneDescription: match ? match[1].trim() : text,
                                  amountPercent: match && match[2] ? parseFloat(match[2]) : 0
                                }
                              }).filter(term => term.milestoneDescription)
                            : []
                        }
                        
                        // Use FormData if we have files or attachments to remove
                        let res
                        if (hasFiles || hasAttachmentsToRemove) {
                          const formData = new FormData()
                          // Append all form fields to FormData
                          Object.keys(payload).forEach(key => {
                            if (key === 'companyInfo' || key === 'priceSchedule' || key === 'deliveryCompletionWarrantyValidity') {
                              formData.append(key, JSON.stringify(payload[key]))
                            } else if (key === 'scopeOfWork' || key === 'exclusions' || key === 'paymentTerms') {
                              formData.append(key, JSON.stringify(payload[key]))
                            } else {
                              formData.append(key, payload[key] || '')
                            }
                          })
                          
                          // Append files
                          editSelectedFiles.forEach(file => {
                            formData.append('attachments', file)
                          })
                          
                          // Append files to remove
                          if (hasAttachmentsToRemove) {
                            editAttachmentsToRemove.forEach(index => {
                              formData.append('removeAttachments', index)
                            })
                          }
                          
                          res = await apiFetch(`/api/project-variations/${variation._id}`, {
                            method: 'PUT',
                            body: formData
                          })
                        } else {
                          res = await apiFetch(`/api/project-variations/${variation._id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                          })
                        }
                        if (!res.ok) {
                          const errorData = await res.json().catch(() => ({}))
                          throw new Error(errorData.message || 'Failed to save changes')
                        }
                        const updated = await res.json()
                        if (updated && updated._id) {
                          setVariation(updated)
                          // Reload lead and project if they changed
                          if (updated.lead) {
                            const leadId = typeof updated.lead === 'object' ? updated.lead?._id : updated.lead
                            if (leadId) {
                              try {
                                const resLead = await apiFetch(`/api/leads/${leadId}`)
                                const leadData = await resLead.json()
                                const visitsRes = await apiFetch(`/api/leads/${leadId}/site-visits`)
                                const visits = await visitsRes.json()
                                setLead({ ...leadData, siteVisits: visits })
                              } catch {}
                            }
                          }
                          if (updated.parentProject) {
                            const projectId = typeof updated.parentProject === 'object' ? updated.parentProject?._id : updated.parentProject
                            if (projectId) {
                              try {
                                const resProject = await apiFetch(`/api/projects/${projectId}`)
                                const projectData = await resProject.json()
                                setProject(projectData)
                              } catch {}
                            }
                          }
                        }
                        // Reset file states
                        setEditSelectedFiles([])
                        setEditPreviewFiles([])
                        setEditAttachmentsToRemove([])
                        setEditModal({ open: false, form: null })
                        setDateFieldsModified({ offerDate: false, enquiryDate: false })
                        setOriginalDateValues({ offerDate: null, enquiryDate: null })
                        setNotify({ open: true, title: 'Changes Saved', message: 'Your changes have been saved successfully.' })
                      } catch (e) {
                        setNotify({ open: true, title: 'Save Failed', message: e.message || 'We could not save your changes. Please try again.' })
                      }
                    }}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {createVariationModal.open && createVariationModal.form && (
        <div className="modal-overlay" onClick={() => setCreateVariationModal({ open: false, form: null })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Another Variation</h2>
              <button onClick={() => setCreateVariationModal({ open: false, form: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ maxHeight: '70vh', overflow: 'auto' }}>
              <div className="form-section">
                <div className="section-header">
                  <h3>Cover & Basic Details</h3>
                </div>
                <div className="form-group">
                  <label>Submitted To (Client Company)</label>
                  <input type="text" value={createVariationModal.form.submittedTo} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, submittedTo: e.target.value } })} />
                </div>
                <div className="form-group">
                  <label>Attention (Contact Person)</label>
                  <input type="text" value={createVariationModal.form.attention} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, attention: e.target.value } })} />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Offer Reference</label>
                    <input type="text" value={createVariationModal.form.offerReference} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, offerReference: e.target.value } })} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Enquiry Number</label>
                    <input type="text" value={createVariationModal.form.enquiryNumber} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, enquiryNumber: e.target.value } })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Offer Date</label>
                    <input type="date" value={createVariationModal.form.offerDate} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, offerDate: e.target.value } })} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Enquiry Date</label>
                    <input type="date" value={createVariationModal.form.enquiryDate} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, enquiryDate: e.target.value } })} />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Project Details</h3>
                </div>
                <div className="form-group">
                  <label>Project Title</label>
                  <input type="text" value={createVariationModal.form.projectTitle} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, projectTitle: e.target.value } })} />
                </div>
                <div className="form-group">
                  <label>Introduction</label>
                  <textarea value={createVariationModal.form.introductionText} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, introductionText: e.target.value } })} />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Scope of Work</h3>
                </div>
                {createVariationModal.form.scopeOfWork.map((s, i) => (
                  <div key={i} className="item-card">
                    <div className="item-header">
                      <span>Item {i + 1}</span>
                      <button type="button" className="cancel-btn" onClick={() => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, scopeOfWork: createVariationModal.form.scopeOfWork.filter((_, idx) => idx !== i) } })}>Remove</button>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 3 }}>
                        <label>Description</label>
                        <textarea value={s.description} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, scopeOfWork: createVariationModal.form.scopeOfWork.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x) } })} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Qty</label>
                        <input type="number" value={s.quantity} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, scopeOfWork: createVariationModal.form.scopeOfWork.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x) } })} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Unit</label>
                        <input type="text" value={s.unit} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, scopeOfWork: createVariationModal.form.scopeOfWork.map((x, idx) => idx === i ? { ...x, unit: e.target.value } : x) } })} />
                      </div>
                      <div className="form-group" style={{ flex: 2 }}>
                        <label>Location/Remarks</label>
                        <input type="text" value={s.locationRemarks} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, scopeOfWork: createVariationModal.form.scopeOfWork.map((x, idx) => idx === i ? { ...x, locationRemarks: e.target.value } : x) } })} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="section-actions">
                  <button type="button" className="link-btn" onClick={() => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, scopeOfWork: [...createVariationModal.form.scopeOfWork, { description: '', quantity: '', unit: '', locationRemarks: '' }] } })}>+ Add Scope Item</button>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Price Schedule</h3>
                </div>
                <div className="form-group">
                  <ScopeOfWorkEditor
                    value={typeof createVariationModal.form.priceSchedule === 'string' ? createVariationModal.form.priceSchedule : ''}
                    onChange={(html) => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, priceSchedule: html } })}
                  />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Our Viewpoints / Special Terms</h3>
                </div>
                <div className="form-group">
                  <label>Our Viewpoints / Special Terms</label>
                  <textarea value={createVariationModal.form.ourViewpoints} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, ourViewpoints: e.target.value } })} />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Exclusions</h3>
                </div>
                {createVariationModal.form.exclusions.map((ex, i) => (
                  <div key={i} className="item-card">
                    <div className="item-header">
                      <span>Item {i + 1}</span>
                      <button type="button" className="cancel-btn" onClick={() => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, exclusions: createVariationModal.form.exclusions.filter((_, idx) => idx !== i) } })}>Remove</button>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <input type="text" value={ex} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, exclusions: createVariationModal.form.exclusions.map((x, idx) => idx === i ? e.target.value : x) } })} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="section-actions">
                  <button type="button" className="link-btn" onClick={() => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, exclusions: [...createVariationModal.form.exclusions, ''] } })}>+ Add Exclusion</button>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Payment Terms</h3>
                </div>
                {createVariationModal.form.paymentTerms.map((p, i) => (
                  <div key={i} className="item-card">
                    <div className="item-header">
                      <span>Term {i + 1}</span>
                      <button type="button" className="cancel-btn" onClick={() => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, paymentTerms: createVariationModal.form.paymentTerms.filter((_, idx) => idx !== i) } })}>Remove</button>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 3 }}>
                        <label>Milestone</label>
                        <input type="text" value={p.milestoneDescription} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, paymentTerms: createVariationModal.form.paymentTerms.map((x, idx) => idx === i ? { ...x, milestoneDescription: e.target.value } : x) } })} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Amount %</label>
                        <input type="number" value={p.amountPercent} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, paymentTerms: createVariationModal.form.paymentTerms.map((x, idx) => idx === i ? { ...x, amountPercent: e.target.value } : x) } })} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="section-actions">
                  <button type="button" className="link-btn" onClick={() => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, paymentTerms: [...createVariationModal.form.paymentTerms, { milestoneDescription: '', amountPercent: '' }] } })}>+ Add Payment Term</button>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Delivery, Completion, Warranty & Validity</h3>
                </div>
                <div className="form-group">
                  <label>Delivery / Completion Timeline</label>
                  <input type="text" value={createVariationModal.form.deliveryCompletionWarrantyValidity.deliveryTimeline} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, deliveryCompletionWarrantyValidity: { ...createVariationModal.form.deliveryCompletionWarrantyValidity, deliveryTimeline: e.target.value } } })} />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Warranty Period</label>
                    <input type="text" value={createVariationModal.form.deliveryCompletionWarrantyValidity.warrantyPeriod} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, deliveryCompletionWarrantyValidity: { ...createVariationModal.form.deliveryCompletionWarrantyValidity, warrantyPeriod: e.target.value } } })} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Offer Validity (Days)</label>
                    <input type="number" value={createVariationModal.form.deliveryCompletionWarrantyValidity.offerValidity} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, deliveryCompletionWarrantyValidity: { ...createVariationModal.form.deliveryCompletionWarrantyValidity, offerValidity: e.target.value } } })} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Authorized Signatory</label>
                  <input type="text" value={createVariationModal.form.deliveryCompletionWarrantyValidity.authorizedSignatory} onChange={e => setCreateVariationModal({ ...createVariationModal, form: { ...createVariationModal.form, deliveryCompletionWarrantyValidity: { ...createVariationModal.form.deliveryCompletionWarrantyValidity, authorizedSignatory: e.target.value } } })} />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setCreateVariationModal({ open: false, form: null })}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  onClick={async () => {
                    if (isSubmitting) return
                    setLoadingAction('create-variation')
                    setIsSubmitting(true)
                    try {
                      // Check if there are changes from the parent variation
                      const fields = ['companyInfo','submittedTo','attention','offerReference','enquiryNumber','offerDate','enquiryDate','projectTitle','introductionText','scopeOfWork','priceSchedule','ourViewpoints','exclusions','paymentTerms','deliveryCompletionWarrantyValidity']
                      let changed = false
                      for (const f of fields) {
                        if (JSON.stringify(variation?.[f] ?? null) !== JSON.stringify(createVariationModal.form?.[f] ?? null)) { changed = true; break }
                      }
                      if (!changed) {
                        setNotify({ open: true, title: 'No Changes', message: 'No changes detected. Please modify data before creating a variation.' })
                        return
                      }
                      
                      const res = await apiFetch('/api/project-variations', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ parentVariationId: variation._id, data: createVariationModal.form })
                      })
                      if (!res.ok) {
                        const errorData = await res.json().catch(() => ({}))
                        throw new Error(errorData.message || 'Failed to create variation')
                      }
                      const newVariation = await res.json()
                      setCreateVariationModal({ open: false, form: null })
                      setNotify({ open: true, title: 'Variation Created', message: 'The new variation has been created successfully.' })
                      // Navigate to the new variation
                      try {
                        localStorage.setItem('variationId', newVariation._id)
                        window.location.href = '/variation-detail'
                      } catch {}
                    } catch (e) {
                      setNotify({ open: true, title: 'Creation Failed', message: e.message || 'We could not create the variation. Please try again.' })
                    } finally {
                      setIsSubmitting(false)
                      setLoadingAction(null)
                    }
                  }}
                  disabled={isSubmitting}
                >
                  <ButtonLoader loading={loadingAction === 'create-variation'}>
                    {isSubmitting ? 'Creating...' : 'Create Variation'}
                  </ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {approvalModal.open && (
        <div className="modal-overlay" onClick={() => setApprovalModal({ open: false, action: null, note: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{approvalModal.action === 'approved' ? 'Approve Variation' : 'Reject Variation'}</h2>
              <button onClick={() => setApprovalModal({ open: false, action: null, note: '' })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div className="form-group">
                <label>Note</label>
                <textarea value={approvalModal.note} onChange={e => setApprovalModal({ ...approvalModal, note: e.target.value })} />
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setApprovalModal({ open: false, action: null, note: '' })}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  onClick={() => approveVariation(approvalModal.action, approvalModal.note)}
                  disabled={isSubmitting}
                >
                  <ButtonLoader loading={isSubmitting}>
                    {isSubmitting ? (approvalModal.action === 'approved' ? 'Approving...' : 'Rejecting...') : 'Confirm'}
                  </ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editWarningModal.open && (
        <div className="modal-overlay" onClick={() => setEditWarningModal({ open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cannot Edit Approved Variation</h2>
              <button onClick={() => setEditWarningModal({ open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div style={{ padding: '16px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ margin: 0, color: '#7C2D12', fontWeight: 500 }}>
                  ⚠️ This variation has been approved and is locked to prevent modifications.
                </p>
              </div>
              <p style={{ marginBottom: '16px' }}>
                Approved variations cannot be edited to maintain data integrity and ensure consistency with approved quotations.
              </p>
              <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
                To make changes to this variation, the approval status must first be reverted. A manager or administrator can reject the variation, which will unlock it for editing.
              </p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => setEditWarningModal({ open: false })}>Understood</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sendApprovalConfirmModal.open && (
        <div className="modal-overlay" onClick={() => setSendApprovalConfirmModal({ open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Send for Approval</h2>
              <button onClick={() => setSendApprovalConfirmModal({ open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p style={{ marginBottom: '16px' }}>
                Are you sure you want to send this variation for management approval?
              </p>
              <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
                Once sent, the variation will be marked as "Pending Approval" and managers or administrators will be able to review and approve or reject it.
              </p>
              {variation && (
                <div style={{ padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '16px' }}>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>Variation #{variation.variationNumber}</p>
                  {variation.projectTitle && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-muted)' }}>{variation.projectTitle}</p>
                  )}
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setSendApprovalConfirmModal({ open: false })}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  onClick={async () => {
                    await sendForApproval()
                  }}
                  disabled={isSubmitting}
                >
                  <ButtonLoader loading={loadingAction === 'send-approval'}>
                    {isSubmitting ? 'Sending...' : 'Confirm'}
                  </ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModal.open && variation && (
        <div className="modal-overlay" onClick={() => setDeleteModal({ open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Variation</h2>
              <button onClick={() => setDeleteModal({ open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to delete Variation #{variation.variationNumber}? This action cannot be undone.</p>
              {variation.offerReference && (
                <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
                  Offer Reference: {variation.offerReference}
                </p>
              )}
              {project?.name && (
                <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                  Project: {project.name}
                </p>
              )}
              <div style={{ 
                padding: '12px', 
                background: '#FEF3C7', 
                border: '1px solid #F59E0B', 
                borderRadius: '8px', 
                marginTop: '16px',
                color: '#7C2D12'
              }}>
                <strong>Warning:</strong> This will permanently delete the variation. If this variation has child variations, deletion will be blocked.
              </div>
              <div className="form-actions">
                <button 
                  type="button" 
                  className="cancel-btn" 
                  onClick={() => setDeleteModal({ open: false })}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="reject-btn" 
                  onClick={deleteVariation}
                  disabled={isSubmitting}
                >
                  <ButtonLoader loading={loadingAction === 'delete-variation'}>
                    {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
                  </ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {profileUser && (
        <div className="modal-overlay profile" onClick={() => setProfileUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>User Profile</h2>
              <button onClick={() => setProfileUser(null)} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div className="form-group">
                <label>Name</label>
                <input type="text" value={profileUser?.name || ''} readOnly />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="text" value={profileUser?.email || ''} readOnly />
              </div>
            </div>
          </div>
        </div>
      )}

      {notify.open && (
        <div className="modal-overlay" onClick={() => setNotify({ open: false, title: '', message: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{notify.title || 'Notice'}</h2>
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

      {/* Print Preview Modal */}
      {printPreviewModal.open && printPreviewModal.pdfUrl && (
        <div className="modal-overlay" onClick={() => setPrintPreviewModal({ open: false, pdfUrl: null })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001, maxWidth: '95%', width: '100%', height: '95vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
              <h2>PDF Preview - {variation?.variationNumber || 'Variation'}</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="save-btn" 
                  onClick={async () => {
                    try {
                      await exportVariationPDF()
                    } catch (e) {
                      setNotify({ open: true, title: 'Export Failed', message: 'We could not generate the PDF. Please try again.' })
                    }
                  }}
                >
                  Download PDF
                </button>
                <button 
                  className="save-btn" 
                  onClick={() => {
                    if (printPreviewModal.pdfUrl) {
                      const printWindow = window.open('', '_blank')
                      printWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <title>${variation?.variationNumber || 'Variation'} - PDF</title>
                            <style>
                              body { margin: 0; padding: 0; }
                              iframe { width: 100%; height: 100vh; border: none; }
                            </style>
                          </head>
                          <body>
                            <iframe src="${printPreviewModal.pdfUrl}"></iframe>
                          </body>
                        </html>
                      `)
                      printWindow.document.close()
                      setTimeout(() => {
                        printWindow.frames[0].print()
                      }, 500)
                    }
                  }}
                >
                  Print
                </button>
                <button onClick={() => setPrintPreviewModal({ open: false, pdfUrl: null })} className="close-btn">×</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', background: '#525252', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <iframe 
                src={printPreviewModal.pdfUrl}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  border: 'none',
                  background: 'white'
                }}
                title="PDF Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VariationDetail

