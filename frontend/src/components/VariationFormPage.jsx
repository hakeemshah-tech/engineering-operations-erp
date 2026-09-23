import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import './LeadManagement.css'
import './LoadingComponents.css'
import { ButtonLoader } from './LoadingComponents'

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

function VariationFormPage() {
  const navigate = useNavigate()
  const { projectId, variationId } = useParams()
  const [currentUser, setCurrentUser] = useState(null)
  const [project, setProject] = useState(null)
  const [variation, setVariation] = useState(null)
  const [sourceData, setSourceData] = useState(null)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [existingVariations, setExistingVariations] = useState([])
  const [dateFieldsModified, setDateFieldsModified] = useState({ offerDate: false, enquiryDate: false })
  const [originalDateValues, setOriginalDateValues] = useState({ offerDate: null, enquiryDate: null })
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewFiles, setPreviewFiles] = useState([])
  const [attachmentsToRemove, setAttachmentsToRemove] = useState([])
  
  const isEditMode = !!variationId

  const defaultCompany = useMemo(() => ({
    logo: null,
    name: 'Engineering Operations ERP',
    address: 'Dubai, UAE',
    phone: '+971-00-000-0000',
    email: 'info@example.com'
  }), [])

  const [form, setForm] = useState({
    companyInfo: defaultCompany,
    submittedTo: '',
    attention: '',
    offerReference: '',
    enquiryNumber: '',
    offerDate: '',
    enquiryDate: '',
    projectTitle: '',
    introductionText: '',
    scopeOfWork: '',
    priceSchedule: '',
    ourViewpoints: '',
    exclusions: '',
    paymentTerms: '',
    deliveryCompletionWarrantyValidity: { deliveryTimeline: '', warrantyPeriod: '', offerValidity: 30, authorizedSignatory: '' }
  })

  useEffect(() => {
    setCurrentUser(JSON.parse(localStorage.getItem('user')) || null)
    if (isEditMode && variationId) {
      void fetchVariation()
    } else if (projectId) {
      void fetchProject()
    }
  }, [projectId, variationId, isEditMode])

  const fetchVariation = async () => {
    setIsLoading(true)
    try {
      const res = await api.get(`/api/project-variations/${variationId}`)
      const varData = res.data
      setVariation(varData)
      
      // Load parent project
      if (varData.parentProject) {
        const projId = typeof varData.parentProject === 'object' ? varData.parentProject._id : varData.parentProject
        try {
          const projRes = await api.get(`/api/projects/${projId}`)
          setProject(projRes.data)
        } catch {}
      }
      
      // Convert variation data to form format
      const originalOfferDate = varData.offerDate ? String(varData.offerDate).slice(0,10) : ''
      const originalEnquiryDate = varData.enquiryDate ? String(varData.enquiryDate).slice(0,10) : ''
      setOriginalDateValues({ offerDate: originalOfferDate, enquiryDate: originalEnquiryDate })
      setDateFieldsModified({ offerDate: false, enquiryDate: false })
      
      const scopeOfWorkValue = typeof varData.scopeOfWork === 'string' 
        ? varData.scopeOfWork 
        : (Array.isArray(varData.scopeOfWork) && varData.scopeOfWork.length
            ? varData.scopeOfWork.map(item => item.description || '').join('<br>')
            : '')
      
      const exclusionsValue = typeof varData.exclusions === 'string'
        ? varData.exclusions
        : (Array.isArray(varData.exclusions) && varData.exclusions.length
            ? varData.exclusions.join('<br>')
            : '')
      
      const paymentTermsValue = typeof varData.paymentTerms === 'string'
        ? varData.paymentTerms
        : (Array.isArray(varData.paymentTerms) && varData.paymentTerms.length
            ? varData.paymentTerms.map(term => `${term.milestoneDescription || ''}${term.amountPercent ? ` - ${term.amountPercent}%` : ''}`).join('<br>')
            : '')
      
      setForm({
        companyInfo: varData.companyInfo || defaultCompany,
        submittedTo: varData.submittedTo || '',
        attention: varData.attention || '',
        offerReference: varData.offerReference || '',
        enquiryNumber: varData.enquiryNumber || '',
        offerDate: originalOfferDate,
        enquiryDate: originalEnquiryDate,
        projectTitle: varData.projectTitle || varData.lead?.projectTitle || project?.name || '',
        introductionText: varData.introductionText || '',
        scopeOfWork: scopeOfWorkValue,
        priceSchedule: typeof varData.priceSchedule === 'string' ? varData.priceSchedule : '',
        ourViewpoints: varData.ourViewpoints || '',
        exclusions: exclusionsValue,
        paymentTerms: paymentTermsValue,
        deliveryCompletionWarrantyValidity: varData.deliveryCompletionWarrantyValidity || { deliveryTimeline: '', warrantyPeriod: '', offerValidity: 30, authorizedSignatory: currentUser?.name || '' }
      })
      
      // Reset file states
      setSelectedFiles([])
      setPreviewFiles([])
      setAttachmentsToRemove([])
      
      setSourceData(varData)
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load variation data.' })
      setTimeout(() => {
        navigate('/project-variations')
      }, 2000)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchProject = async () => {
    setIsLoading(true)
    try {
      const res = await api.get(`/api/projects/${projectId}`)
      const proj = res.data
      setProject(proj)

      // Check for existing variations
      try {
        const resV = await api.get(`/api/project-variations?parentProject=${projectId}`)
        const variations = Array.isArray(resV.data) ? resV.data : []
        setExistingVariations(variations)
        if (variations.length > 0) {
          setNotify({ open: true, title: 'Variation Already Exists', message: 'This project already has existing variations. You cannot create another variation directly from the project.' })
          setTimeout(() => {
            navigate('/projects')
          }, 2000)
          return
        }
      } catch {}

      // Get source data from project's source revision or quotation
      let source = null
      if (proj.sourceRevision) {
        try {
          const revRes = await api.get(`/api/revisions/${typeof proj.sourceRevision === 'object' ? proj.sourceRevision._id : proj.sourceRevision}`)
          source = revRes.data
        } catch {}
      } else if (proj.sourceQuotation) {
        try {
          const qRes = await api.get(`/api/quotations/${typeof proj.sourceQuotation === 'object' ? proj.sourceQuotation._id : proj.sourceQuotation}`)
          source = qRes.data
        } catch {}
      }

      if (!source) {
        setNotify({ open: true, title: 'Error', message: 'Project has no source quotation or revision to base variation on.' })
        setTimeout(() => {
          navigate('/projects')
        }, 2000)
        return
      }

      setSourceData(source)
      
      // Convert source data to form format
      const scopeOfWorkValue = typeof source.scopeOfWork === 'string' 
        ? source.scopeOfWork 
        : (Array.isArray(source.scopeOfWork) && source.scopeOfWork.length
            ? source.scopeOfWork.map(item => item.description || '').join('<br>')
            : '')
      
      const exclusionsValue = typeof source.exclusions === 'string'
        ? source.exclusions
        : (Array.isArray(source.exclusions) && source.exclusions.length
            ? source.exclusions.join('<br>')
            : '')
      
      const paymentTermsValue = typeof source.paymentTerms === 'string'
        ? source.paymentTerms
        : (Array.isArray(source.paymentTerms) && source.paymentTerms.length
            ? source.paymentTerms.map(term => `${term.milestoneDescription || ''}${term.amountPercent ? ` - ${term.amountPercent}%` : ''}`).join('<br>')
            : '')
      
      setForm({
        companyInfo: source.companyInfo || defaultCompany,
        submittedTo: source.submittedTo || '',
        attention: source.attention || '',
        offerReference: source.offerReference || '',
        enquiryNumber: source.enquiryNumber || '',
        offerDate: source.offerDate ? source.offerDate.substring(0,10) : '',
        enquiryDate: source.enquiryDate ? source.enquiryDate.substring(0,10) : '',
        projectTitle: source.projectTitle || proj.name || '',
        introductionText: source.introductionText || '',
        scopeOfWork: scopeOfWorkValue,
        priceSchedule: typeof source.priceSchedule === 'string' ? source.priceSchedule : '',
        ourViewpoints: source.ourViewpoints || '',
        exclusions: exclusionsValue,
        paymentTerms: paymentTermsValue,
        deliveryCompletionWarrantyValidity: source.deliveryCompletionWarrantyValidity || { deliveryTimeline: '', warrantyPeriod: '', offerValidity: 30, authorizedSignatory: currentUser?.name || '' }
      })
    } catch (error) {
      setNotify({ open: true, title: 'Error', message: 'Failed to load project data.' })
    } finally {
      setIsLoading(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    setSelectedFiles(prev => [...prev, ...files])
    
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'image' }])
        }
        reader.readAsDataURL(file)
      } else if (file.type.startsWith('video/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'video' }])
        }
        reader.readAsDataURL(file)
      } else {
        setPreviewFiles(prev => [...prev, { file, preview: null, type: 'document' }])
      }
    })
  }

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setPreviewFiles(prev => prev.filter((_, i) => i !== index))
  }

  const canCreateVariation = () => {
    return currentUser?.roles?.some(role => ['admin', 'manager', 'estimation_engineer'].includes(role))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (isSaving) return

    if (!canCreateVariation()) {
      setNotify({ open: true, title: 'Not Authorized', message: 'You do not have permission to create/edit variations.' })
      return
    }

    setIsSaving(true)
    try {
      // Use FormData if we have files or attachments to remove
      const hasFiles = selectedFiles.length > 0
      const hasAttachmentsToRemove = attachmentsToRemove.length > 0
      const useFormData = hasFiles || hasAttachmentsToRemove
      
      let payload
      let formData
      
      if (useFormData) {
        formData = new FormData()
        payload = { ...form }
      } else {
        payload = { ...form }
      }
      
      // Send HTML strings directly - backend will handle conversion if needed
      // No conversion needed as backend expects HTML strings for rich text fields
      
      if (isEditMode) {
        // Edit mode: Check if variation is approved
        if (variation?.managementApproval?.status === 'approved') {
          setNotify({ open: true, title: 'Cannot Edit', message: 'This variation has been approved and cannot be edited. The approval status must be reverted first.' })
          setIsSaving(false)
          return
        }
        
        // Check if date fields were manually modified
        if (!dateFieldsModified.offerDate && !dateFieldsModified.enquiryDate) {
          const currentOfferDate = payload.offerDate || ''
          const currentEnquiryDate = payload.enquiryDate || ''
          if (currentOfferDate !== originalDateValues.offerDate || currentEnquiryDate !== originalDateValues.enquiryDate) {
            setNotify({ open: true, title: 'Date Fields Not Modified', message: 'Offer Date and Enquiry Date have not been manually modified. Please explicitly change these dates if you want to update them, or they will remain unchanged.' })
            setIsSaving(false)
            return
          }
        }
        
        // Exclude date fields if they weren't manually modified
        if (!dateFieldsModified.offerDate) {
          delete payload.offerDate
        }
        if (!dateFieldsModified.enquiryDate) {
          delete payload.enquiryDate
        }
        
        // Check if there are changes
        const fields = ['companyInfo','submittedTo','attention','offerReference','enquiryNumber','offerDate','enquiryDate','projectTitle','introductionText','scopeOfWork','priceSchedule','ourViewpoints','exclusions','paymentTerms','deliveryCompletionWarrantyValidity']
        let changed = false
        for (const f of fields) {
          if (JSON.stringify(variation?.[f] ?? null) !== JSON.stringify(payload?.[f] ?? null)) { 
            changed = true
            break 
          }
        }
        if (!changed && !hasFiles && !hasAttachmentsToRemove) { 
          setNotify({ open: true, title: 'No Changes', message: 'No changes detected. Please modify data before saving.' })
          setIsSaving(false)
          return 
        }
        
        if (useFormData) {
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
          selectedFiles.forEach(file => {
            formData.append('attachments', file)
          })
          
          // Append files to remove (for editing)
          if (attachmentsToRemove.length > 0) {
            attachmentsToRemove.forEach(index => {
              formData.append('removeAttachments', index)
            })
          }
          
          await api.put(`/api/project-variations/${variationId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
        } else {
          await api.put(`/api/project-variations/${variationId}`, payload)
        }
        setNotify({ open: true, title: 'Success', message: 'Variation updated successfully.' })
        
        setTimeout(() => {
          navigate(`/variation-detail?id=${variationId}`)
        }, 1500)
      } else {
        // Create mode: Check if there are changes from source
        const fields = ['companyInfo','submittedTo','attention','offerReference','enquiryNumber','offerDate','enquiryDate','projectTitle','introductionText','scopeOfWork','priceSchedule','ourViewpoints','exclusions','paymentTerms','deliveryCompletionWarrantyValidity']
        let changed = false
        for (const f of fields) {
          if (JSON.stringify(sourceData?.[f] ?? null) !== JSON.stringify(payload?.[f] ?? null)) { 
            changed = true
            break 
          }
        }
        if (!changed && !hasFiles) { 
          setNotify({ open: true, title: 'No Changes', message: 'No changes detected. Please modify data before creating a variation.' })
          setIsSaving(false)
          return 
        }

        if (useFormData) {
          // Append all form fields to FormData
          formData.append('parentProjectId', projectId)
          Object.keys(payload).forEach(key => {
            if (key === 'companyInfo' || key === 'priceSchedule' || key === 'deliveryCompletionWarrantyValidity') {
              formData.append(`data[${key}]`, JSON.stringify(payload[key]))
            } else if (key === 'scopeOfWork' || key === 'exclusions' || key === 'paymentTerms') {
              formData.append(`data[${key}]`, JSON.stringify(payload[key]))
            } else {
              formData.append(`data[${key}]`, payload[key] || '')
            }
          })
          
          // Append files
          selectedFiles.forEach(file => {
            formData.append('attachments', file)
          })
          
          await api.post('/api/project-variations', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
        } else {
          await api.post('/api/project-variations', { parentProjectId: projectId, data: payload })
        }
        setNotify({ open: true, title: 'Success', message: 'Variation created successfully.' })
        
        setTimeout(() => {
          navigate('/projects')
        }, 1500)
      }
    } catch (err) {
      setNotify({ open: true, title: 'Save Failed', message: err.response?.data?.message || `We could not ${isEditMode ? 'update' : 'create'} the variation. Please try again.` })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    if (isEditMode && variationId) {
      navigate(`/variation-detail?id=${variationId}`)
    } else {
      navigate('/projects')
    }
  }

  if (isLoading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'var(--bg)', 
        padding: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>Loading...</div>
      </div>
    )
  }

  if (!canCreateVariation()) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'var(--bg)', 
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <div style={{
          background: 'var(--card)',
          borderRadius: '12px',
          padding: '32px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h2>Not Authorized</h2>
          <p>You do not have permission to create variations.</p>
          <button onClick={handleCancel} className="cancel-btn">Go Back</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--bg)', 
      padding: '24px',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      <div style={{
        background: 'var(--card)',
        borderRadius: '12px',
        padding: '32px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
          paddingBottom: '24px',
          borderBottom: '1px solid var(--border)'
        }}>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: '600', 
            color: 'var(--text)',
            margin: 0
          }}>
            {isEditMode ? 'Edit Variation Quotation' : 'Create Variation Quotation'}
          </h1>
          <button
            type="button"
            onClick={handleCancel}
            className="cancel-btn"
            style={{ padding: '8px 16px' }}
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="form-section">
            <div className="section-header">
              <h3>Cover & Basic Details</h3>
            </div>
            <div className="form-group">
              <label>Submitted To (Client Company)</label>
              <input type="text" value={form.submittedTo} onChange={e => setForm({ ...form, submittedTo: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Attention (Contact Person)</label>
              <input type="text" value={form.attention} onChange={e => setForm({ ...form, attention: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Offer Reference</label>
                <input type="text" value={form.offerReference} onChange={e => setForm({ ...form, offerReference: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Enquiry Number</label>
                <input type="text" value={form.enquiryNumber} onChange={e => setForm({ ...form, enquiryNumber: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Offer Date</label>
                <input 
                  type="date" 
                  value={form.offerDate} 
                  onChange={e => {
                    if (isEditMode) {
                      setDateFieldsModified(prev => ({ ...prev, offerDate: true }))
                    }
                    setForm({ ...form, offerDate: e.target.value })
                  }} 
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Enquiry Date</label>
                <input 
                  type="date" 
                  value={form.enquiryDate} 
                  onChange={e => {
                    if (isEditMode) {
                      setDateFieldsModified(prev => ({ ...prev, enquiryDate: true }))
                    }
                    setForm({ ...form, enquiryDate: e.target.value })
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
              <input type="text" value={form.projectTitle || ''} onChange={e => setForm({ ...form, projectTitle: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Introduction</label>
              <textarea value={form.introductionText || ''} onChange={e => setForm({ ...form, introductionText: e.target.value })} />
            </div>
          </div>

          <div className="form-section">
            <div className="section-header">
              <h3>Scope of Work</h3>
            </div>
            <div className="form-group">
              <ScopeOfWorkEditor
                value={typeof form.scopeOfWork === 'string' ? form.scopeOfWork : ''}
                onChange={(value) => setForm({ ...form, scopeOfWork: value })}
              />
            </div>
          </div>

          <div className="form-section">
            <div className="section-header">
              <h3>Price Schedule</h3>
            </div>
            <div className="form-group">
              <ScopeOfWorkEditor
                value={typeof form.priceSchedule === 'string' ? form.priceSchedule : ''}
                onChange={(html) => setForm({ ...form, priceSchedule: html })}
              />
            </div>
          </div>

          <div className="form-section">
            <div className="section-header">
              <h3>Our Viewpoints / Special Terms</h3>
            </div>
            <div className="form-group">
              <label>Our Viewpoints / Special Terms</label>
              <textarea value={form.ourViewpoints || ''} onChange={e => setForm({ ...form, ourViewpoints: e.target.value })} />
            </div>
          </div>

          <div className="form-section">
            <div className="section-header">
              <h3>Exclusions</h3>
            </div>
            <div className="form-group">
              <ScopeOfWorkEditor
                value={typeof form.exclusions === 'string' ? form.exclusions : ''}
                onChange={(html) => setForm({ ...form, exclusions: html })}
              />
            </div>
          </div>

          <div className="form-section">
            <div className="section-header">
              <h3>Payment Terms</h3>
            </div>
            <div className="form-group">
              <ScopeOfWorkEditor
                value={typeof form.paymentTerms === 'string' ? form.paymentTerms : ''}
                onChange={(html) => setForm({ ...form, paymentTerms: html })}
              />
            </div>
          </div>

          <div className="form-section">
            <div className="section-header">
              <h3>Delivery, Completion, Warranty & Validity</h3>
            </div>
            <div className="form-group">
              <label>Delivery / Completion Timeline</label>
              <input type="text" value={form.deliveryCompletionWarrantyValidity?.deliveryTimeline || ''} onChange={e => setForm({ ...form, deliveryCompletionWarrantyValidity: { ...form.deliveryCompletionWarrantyValidity, deliveryTimeline: e.target.value } })} />
            </div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Warranty Period</label>
                <input type="text" value={form.deliveryCompletionWarrantyValidity?.warrantyPeriod || ''} onChange={e => setForm({ ...form, deliveryCompletionWarrantyValidity: { ...form.deliveryCompletionWarrantyValidity, warrantyPeriod: e.target.value } })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Offer Validity (Days)</label>
                <input type="number" value={form.deliveryCompletionWarrantyValidity?.offerValidity || 30} onChange={e => setForm({ ...form, deliveryCompletionWarrantyValidity: { ...form.deliveryCompletionWarrantyValidity, offerValidity: e.target.value } })} />
              </div>
            </div>
            <div className="form-group">
              <label>Authorized Signatory</label>
              <input type="text" value={form.deliveryCompletionWarrantyValidity?.authorizedSignatory || ''} onChange={e => setForm({ ...form, deliveryCompletionWarrantyValidity: { ...form.deliveryCompletionWarrantyValidity, authorizedSignatory: e.target.value } })} />
            </div>
          </div>

          <div className="form-section">
            <div className="section-header">
              <h3>Attachments</h3>
            </div>
            <div className="form-group">
              <label>Attachments (Documents, Images & Videos)</label>
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,video/*"
                onChange={handleFileChange}
                className="file-input"
              />
              <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                Accepted: Images (JPEG, PNG, GIF, WebP), Documents (PDF, DOC, DOCX, XLS, XLSX), Videos (MP4, MOV, AVI, WMV, WebM, etc.). Max 10MB per file.
              </small>
              
              {/* Display existing attachments when editing */}
              {isEditMode && variation && variation.attachments && variation.attachments.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                  <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>Existing Attachments:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {variation.attachments.map((attachment, index) => {
                      const isImage = attachment.mimetype && attachment.mimetype.startsWith('image/')
                      const isVideo = attachment.mimetype && attachment.mimetype.startsWith('video/')
                      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
                      const fileUrl = attachment.path.startsWith('http') ? attachment.path : `${apiBase}${attachment.path}`
                      const isMarkedForRemoval = attachmentsToRemove.includes(index.toString())
                      
                      return (
                        <div 
                          key={index} 
                          style={{ 
                            position: 'relative', 
                            border: isMarkedForRemoval ? '2px solid #dc3545' : '1px solid #ddd', 
                            borderRadius: '4px', 
                            padding: '8px',
                            maxWidth: '150px',
                            opacity: isMarkedForRemoval ? 0.5 : 1
                          }}
                        >
                          {isImage && attachment.path ? (
                            <img 
                              src={fileUrl} 
                              alt={attachment.originalName}
                              style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          ) : isVideo && attachment.path ? (
                            <video 
                              src={fileUrl}
                              style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                              controls={false}
                              muted
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                              <span style={{ fontSize: '12px', textAlign: 'center' }}>{attachment.originalName}</span>
                            </div>
                          )}
                          <div style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
                            {attachment.originalName.length > 15 ? attachment.originalName.substring(0, 15) + '...' : attachment.originalName}
                          </div>
                          <div style={{ fontSize: '10px', color: '#999' }}>
                            {formatFileSize(attachment.size)}
                          </div>
                          {!isMarkedForRemoval && (
                            <button
                              type="button"
                              onClick={() => setAttachmentsToRemove(prev => [...prev, index.toString()])}
                              style={{
                                position: 'absolute',
                                top: '5px',
                                right: '5px',
                                background: 'rgba(220, 53, 69, 0.9)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: '20px',
                                height: '20px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Remove attachment"
                            >
                              ×
                            </button>
                          )}
                          {isMarkedForRemoval && (
                            <button
                              type="button"
                              onClick={() => setAttachmentsToRemove(prev => prev.filter(i => i !== index.toString()))}
                              style={{
                                position: 'absolute',
                                top: '5px',
                                right: '5px',
                                background: 'rgba(40, 167, 69, 0.9)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: '20px',
                                height: '20px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Restore attachment"
                            >
                              ↺
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Display new files being uploaded */}
              {previewFiles.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                  {isEditMode && variation && variation.attachments && variation.attachments.length > 0 && (
                    <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>New Attachments:</div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {previewFiles.map((item, index) => (
                      <div key={index} style={{ 
                        position: 'relative', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px', 
                        padding: '8px',
                        maxWidth: '150px'
                      }}>
                        {item.type === 'image' && item.preview ? (
                          <img 
                            src={item.preview} 
                            alt={item.file.name}
                            style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                          />
                        ) : item.type === 'video' && item.preview ? (
                          <video 
                            src={item.preview}
                            style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                            controls={false}
                            muted
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                            <span style={{ fontSize: '12px', textAlign: 'center' }}>{item.file.name}</span>
                          </div>
                        )}
                        <div style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
                          {item.file.name.length > 15 ? item.file.name.substring(0, 15) + '...' : item.file.name}
                        </div>
                        <div style={{ fontSize: '10px', color: '#999' }}>
                          {formatFileSize(item.file.size)}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          style={{
                            position: 'absolute',
                            top: '5px',
                            right: '5px',
                            background: 'rgba(255, 0, 0, 0.7)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Remove file"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: '32px' }}>
            <button type="button" className="cancel-btn" onClick={handleCancel}>Cancel</button>
            <button 
              type="submit" 
              className="save-btn" 
              disabled={isSaving}
            >
              <ButtonLoader loading={isSaving}>
                {isSaving ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create Variation')}
              </ButtonLoader>
            </button>
          </div>
        </form>

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
      </div>
    </div>
  )
}

export default VariationFormPage

