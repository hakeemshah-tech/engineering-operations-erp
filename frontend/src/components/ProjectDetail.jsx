import { useEffect, useState, useMemo, useRef } from 'react'
import { api } from '../lib/api'
import './LeadManagement.css'
import './LoadingComponents.css'
import { Spinner, PageSkeleton, ButtonLoader } from './LoadingComponents'
import SiteTeamView from './SiteTeamView'
import ManageSiteTeamModal from './ManageSiteTeamModal'

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

function ProjectDetail() {
  const [project, setProject] = useState(null)
  const [lead, setLead] = useState(null)
  const [quotation, setQuotation] = useState(null)
  const [revisions, setRevisions] = useState([])
  const [variations, setVariations] = useState([])
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false)
  const [projectAttachmentsData, setProjectAttachmentsData] = useState({ leads: [], siteVisits: [], project: [], variations: [] })
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const [editModal, setEditModal] = useState({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })
  const [editProjectWarningModal, setEditProjectWarningModal] = useState({ open: false, existingVariations: [] })
  const [deleteProjectWarningModal, setDeleteProjectWarningModal] = useState({ open: false, existingVariations: [] })
  const [deleteModal, setDeleteModal] = useState({ open: false })
  const [variationModal, setVariationModal] = useState({ open: false, form: null })
  const [variationWarningModal, setVariationWarningModal] = useState({ open: false, existingVariations: [] })
  const [projectEngineers, setProjectEngineers] = useState([])
  const [siteEngineers, setSiteEngineers] = useState([])
  const [teamUsers, setTeamUsers] = useState([]) // supervisors + workers pool for edit-history resolution
  const [profileUser, setProfileUser] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewFiles, setPreviewFiles] = useState([])
  const [attachmentsToRemove, setAttachmentsToRemove] = useState([])
  const [variationSelectedFiles, setVariationSelectedFiles] = useState([])
  const [variationPreviewFiles, setVariationPreviewFiles] = useState([])
  const [printPreviewModal, setPrintPreviewModal] = useState({ open: false, pdfUrl: null })
  const [manageTeamOpen, setManageTeamOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingAction, setLoadingAction] = useState(null)
  // Material Request state
  const [materialRequests, setMaterialRequests] = useState([])
  const [inventoryMaterials, setInventoryMaterials] = useState([])
  const [materialRequestModal, setMaterialRequestModal] = useState({ open: false, requestType: 'request', form: { items: [{ materialId: '', materialName: '', sku: '', quantity: 1, uom: 'Pcs', notes: '' }], priority: 'normal', requiredDate: '', purpose: '', notes: '', requesterPhone: '' } })
  const [returnModal, setReturnModal] = useState({ open: false, items: [], notes: '' })

  const openReturnModal = async () => {
    try {
      const mrRes = await api.get(`/api/material-requests?projectId=${project._id}`)
      const allRequests = mrRes.data.requests || []
      
      // Changed Logic: 'return' is now Outgoing (Project->Inventory) along with 'remaining_return'
      const requests = allRequests || []
      const incoming = requests.filter(r => r.status === 'received' && r.requestType === 'request')
      const outgoing = requests.filter(r => r.status === 'received' && (r.requestType === 'remaining_return' || r.requestType === 'return'))
      
      const projectMaterials = {} 
      const materialDetails = {} 
      
      // Add Incoming
      for (const req of incoming) {
        for (const item of req.items || []) {
          if (item.assignedQuantity > 0) {
            const matId = item.materialId?._id || item.materialId
            const key = String(matId)
            if (!projectMaterials[key]) projectMaterials[key] = 0
            projectMaterials[key] += item.assignedQuantity
            if (!materialDetails[key]) {
              materialDetails[key] = {
                id: key, name: item.materialName, sku: item.sku || '-', uom: item.uom
              }
            }
          }
        }
      }
      
      // Subtract Outgoing
      for (const req of outgoing) {
        for (const item of req.items || []) {
          const returnedQty = item.assignedQuantity || 0
          if (returnedQty > 0) {
            const matId = item.materialId?._id || item.materialId
            const key = String(matId)
            if (projectMaterials[key]) projectMaterials[key] -= returnedQty
          }
        }
      }
      
      const items = Object.values(materialDetails).map(mat => ({
        materialId: mat.id, materialName: mat.name, sku: mat.sku, uom: mat.uom,
        inProjectQty: Math.max(0, projectMaterials[mat.id] || 0), returnQty: 0
      })).filter(item => item.inProjectQty > 0)
      
      setReturnModal({ open: true, items, notes: '' })
    } catch (err) {
      console.error('Error fetching project stock:', err)
      setNotify({ open: true, title: 'Error', message: 'Failed to fetch project stock.' })
    }
  }

  const handleSubmitReturn = async () => {
    if (isSubmitting) return
    const itemsToReturn = returnModal.items.filter(item => item.returnQty > 0)
    if (itemsToReturn.length === 0) {
      setNotify({ open: true, title: 'Error', message: 'Please enter quantity to return.' })
      return
    }
    
    setIsSubmitting(true)
    try {
      const requestItems = itemsToReturn.map(item => ({
        materialId: item.materialId, materialName: item.materialName, sku: item.sku,
        quantity: item.returnQty, uom: item.uom, notes: ''
      }))
      
      const payload = {
        projectId: project._id, items: requestItems, priority: 'normal',
        requiredDate: new Date().toISOString().split('T')[0],
        purpose: 'Remaining Material Return',
        requestType: 'remaining_return',
        notes: returnModal.notes
      }
      
      await api.post('/api/material-requests', payload)
      setNotify({ open: true, title: 'Success', message: 'Return request submitted successfully.' })
      setReturnModal({ open: false, items: [], notes: '' })
      
      const resMR = await api.get(`/api/material-requests/project/${project._id}`)
      setMaterialRequests(Array.isArray(resMR.data) ? resMR.data : [])
    } catch (error) {
       setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to submit return request.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const defaultCompany = useMemo(() => ({
    logo: null,
    name: 'Engineering Operations ERP',
    address: 'Dubai, UAE',
    phone: '+971-00-000-0000',
    email: 'info@example.com'
  }), [])

  const canCreateVariation = () => {
    return currentUser?.roles?.some(role => ['admin', 'manager', 'estimation_engineer'].includes(role))
  }

  const canCreateMaterialRequest = () => {
    return currentUser?.roles?.some(role => ['admin', 'manager', 'project_engineer'].includes(role))
  }

  const canCreateReturnRequest = () => {
    return currentUser?.roles?.some(role => ['admin', 'manager', 'inventory_manager'].includes(role))
  }

  const createVariation = async () => {
    if (isSubmitting) return
    setLoadingAction('create-variation')
    setIsSubmitting(true)
    try {
      const payload = { ...variationModal.form }
      
      // Send HTML strings directly - backend will handle conversion if needed
      // No conversion needed as backend expects HTML strings for rich text fields
      
      // Get source data from project's source revision or quotation
      let sourceData = null
      if (project?.sourceRevision) {
        try {
          const revRes = await api.get(`/api/revisions/${typeof project.sourceRevision === 'object' ? project.sourceRevision._id : project.sourceRevision}`)
          sourceData = revRes.data
        } catch {}
      } else if (project?.sourceQuotation) {
        try {
          const qRes = await api.get(`/api/quotations/${typeof project.sourceQuotation === 'object' ? project.sourceQuotation._id : project.sourceQuotation}`)
          sourceData = qRes.data
        } catch {}
      }
      
      if (!sourceData) {
        setNotify({ open: true, title: 'Error', message: 'Project has no source quotation or revision to base variation on.' })
        setIsSubmitting(false)
        setLoadingAction(null)
        return
      }
      
      const fields = ['companyInfo','submittedTo','attention','offerReference','enquiryNumber','offerDate','enquiryDate','projectTitle','introductionText','scopeOfWork','priceSchedule','ourViewpoints','exclusions','paymentTerms','deliveryCompletionWarrantyValidity']
      let changed = false
      for (const f of fields) {
        if (JSON.stringify(sourceData?.[f] ?? null) !== JSON.stringify(payload?.[f] ?? null)) { changed = true; break }
      }
      // Also consider attachments as a change
      if (!changed && variationSelectedFiles.length > 0) {
        changed = true
      }
      if (!changed) { 
        setNotify({ open: true, title: 'No Changes', message: 'No changes detected. Please modify data before creating a variation.' })
        setIsSubmitting(false)
        setLoadingAction(null)
        return 
      }
      
      // Check if files are present
      if (variationSelectedFiles.length > 0) {
        // Use FormData for file uploads
        const formData = new FormData()
        formData.append('parentProjectId', project._id)
        formData.append('data', JSON.stringify(payload))
        
        // Append files
        variationSelectedFiles.forEach(file => {
          formData.append('attachments', file)
        })
        
        await api.post('/api/project-variations', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      } else {
        // Use JSON for non-file requests
        await api.post('/api/project-variations', { parentProjectId: project._id, data: payload })
      }
      
      setNotify({ open: true, title: 'Variation Created', message: 'The variation quotation was created successfully.' })
      setVariationModal({ open: false, form: null })
      setVariationSelectedFiles([])
      setVariationPreviewFiles([])
      // Refresh variations list
      try {
        const resV = await api.get(`/api/project-variations?parentProject=${project._id}`)
        setVariations(Array.isArray(resV.data) ? resV.data : [])
      } catch {}
    } catch (e) {
      setNotify({ open: true, title: 'Create Failed', message: e.response?.data?.message || 'We could not create the variation. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatProjectHistoryValue = (field, value) => {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return '(empty)'
    }

    // Handle arrays
    if (Array.isArray(value)) {
      if (value.length === 0) return '(none)'

      if (field === 'assignedProjectEngineer') {
        // Map ObjectIds to engineer names
        const names = value.map(id => {
          const engineer = projectEngineers.find(u => String(u._id) === String(id))
          return engineer ? engineer.name : (typeof id === 'object' && id?.name ? id.name : String(id))
        }).filter(name => name)
        return names.length > 0 ? names.join(', ') : '(none)'
      }

      if (field === 'supervisors' || field === 'workers') {
        // Entries may be full user objects ({ _id, name, email }) from newer audit writes,
        // or raw ObjectId strings from older entries. Resolve against the cached teamUsers pool.
        const lines = value.map((v, i) => {
          // Newer rich-object format
          if (v && typeof v === 'object' && (v.name || v.email)) {
            const tail = v.email ? ` <${v.email}>` : ''
            return `${i + 1}. ${v.name || 'Unknown user'}${tail}`
          }
          // Legacy format - raw ObjectId. Try to resolve against fetched users.
          const idStr = typeof v === 'object' && v?._id ? String(v._id) : String(v)
          const resolved = teamUsers.find(u => String(u._id) === idStr)
            || projectEngineers.find(u => String(u._id) === idStr)
            || siteEngineers.find(u => String(u._id) === idStr)
          if (resolved) {
            const tail = resolved.email ? ` <${resolved.email}>` : ''
            return `${i + 1}. ${resolved.name || 'Unknown user'}${tail}`
          }
          return `${i + 1}. (removed user)`
        })
        return lines.join('\n')
      }

      // Generic array handling
      return value.map((v, i) => {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          return `${i + 1}. ${String(v)}`
        }
        return `${i + 1}. ${String(v)}`
      }).join('\n')
    }

    // Handle objects
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      // Generic object handling
      const entries = Object.entries(value).map(([k, v]) => {
        if (v === null || v === undefined) return `${k}: (empty)`
        return `${k}: ${String(v)}`
      })
      return entries.length > 0 ? entries.join('\n') : '(empty)'
    }

    // Handle assignedSiteEngineer (single ObjectId)
    if (field === 'assignedSiteEngineer') {
      const engineer = siteEngineers.find(u => String(u._id) === String(value))
      if (engineer) return engineer.name
      if (typeof value === 'object' && value?.name) return value.name
      return String(value)
    }

    // Handle assignedProjectEngineer (single ObjectId - backward compatibility)
    if (field === 'assignedProjectEngineer' && !Array.isArray(value)) {
      const engineer = projectEngineers.find(u => String(u._id) === String(value))
      if (engineer) return engineer.name
      if (typeof value === 'object' && value?.name) return value.name
      return String(value)
    }

    // Handle strings
    if (typeof value === 'string') {
      return value.trim() || '(empty)'
    }

    // Handle numbers and booleans
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }

    return String(value)
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

  const handleVariationFileChange = (e) => {
    const files = Array.from(e.target.files)
    setVariationSelectedFiles(prev => [...prev, ...files])
    
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setVariationPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'image' }])
        }
        reader.readAsDataURL(file)
      } else if (file.type.startsWith('video/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setVariationPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'video' }])
        }
        reader.readAsDataURL(file)
      } else {
        setVariationPreviewFiles(prev => [...prev, { file, preview: null, type: 'document' }])
      }
    })
  }

  const removeVariationFile = (index) => {
    setVariationSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setVariationPreviewFiles(prev => prev.filter((_, i) => i !== index))
  }

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

  useEffect(() => {
    ;(async () => {
      setIsLoading(true)
      try {
        const focus = localStorage.getItem('projectsFocusId') || localStorage.getItem('projectId')
        if (!focus) {
          setIsLoading(false)
          return
        }
        const res = await api.get(`/api/projects/${focus}`)
        const pj = res.data
        setProject(pj)
        if (pj.leadId?._id) {
          const resLead = await api.get(`/api/leads/${pj.leadId._id}`)
          setLead(resLead.data)
        }
        if (pj.sourceQuotation?._id) {
          const resQ = await api.get(`/api/quotations/${pj.sourceQuotation._id}`)
          setQuotation(resQ.data)
        }
        if (pj.sourceRevision?.parentQuotation) {
          const resR = await api.get(`/api/revisions?parentQuotation=${pj.sourceRevision.parentQuotation}`)
          setRevisions(Array.isArray(resR.data) ? resR.data : [])
        }
        // Fetch project variations
        try {
          const resV = await api.get(`/api/project-variations?parentProject=${focus}`)
          setVariations(Array.isArray(resV.data) ? resV.data : [])
        } catch (err) {
          console.error('Error fetching variations:', err)
          setVariations([])
        }
        // Fetch material requests
        try {
          const resMR = await api.get(`/api/material-requests/project/${focus}`)
          setMaterialRequests(Array.isArray(resMR.data) ? resMR.data : [])
        } catch (err) {
          console.error('Error fetching material requests:', err)
          setMaterialRequests([])
        }
        // Preload project engineers for name mapping and profile view
        try {
          const resEng = await api.get('/api/projects/project-engineers')
          setProjectEngineers(Array.isArray(resEng.data) ? resEng.data : [])
        } catch {}
        // Preload supervisors + workers to resolve user IDs in edit history.
        // Fetch both supervisor role keys (they are treated as the same role).
        try {
          const [siteSupRes, supRes, wrkRes] = await Promise.all([
            api.get('/api/users/by-role/site_supervisor').catch(() => ({ data: [] })),
            api.get('/api/users/by-role/supervisor').catch(() => ({ data: [] })),
            api.get('/api/users/by-role/site_worker').catch(() => ({ data: [] }))
          ])
          const combined = [
            ...(siteSupRes.data || []),
            ...(supRes.data || []),
            ...(wrkRes.data || [])
          ]
          // Dedupe by _id so the resolver finds each user exactly once
          const unique = Array.from(new Map(combined.map(u => [String(u._id), u])).values())
          setTeamUsers(unique)
        } catch {}
        // Preload site engineers for name mapping
        try {
          const resUsers = await api.get('/api/users')
          const engineers = Array.isArray(resUsers.data) ? resUsers.data.filter(user => user.roles?.includes('site_engineer')) : []
          setSiteEngineers(engineers)
        } catch {}
      } catch (e) {
        console.error('Error loading project:', e)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  // Helper function to build PDF content (shared between preview and export)
  const buildProjectPDFContent = async () => {
    try {
      if (!project) return
      await ensurePdfMake()
      const token = localStorage.getItem('token')
      // Fetch site visits
      let siteVisits = []
      try {
        const resVisits = await api.get(`/api/site-visits/project/${project._id}`)
        siteVisits = Array.isArray(resVisits.data) ? resVisits.data : []
      } catch {}

      const content = []
      content.push({ text: `Project — ${project.name}`, style: 'h1', margin: [0, 0, 0, 8] })

      // 1. PROJECT DETAILS (Complete)
      const projectRows = [
        ['Project Name', project.name || ''],
        ['Status', project.status || ''],
        ['Location Details', project.locationDetails || ''],
        ['Working Hours', project.workingHours || ''],
        ['Manpower Count', String(project.manpowerCount || '')],
        ['Budget', project.budget ? `${project.budget}` : ''],
        ['Site Engineer', project.assignedSiteEngineer?.name || 'Not Assigned'],
        ['Project Engineer', project.assignedProjectEngineer?.name || 'Not Assigned'],
        ['Created At', project.createdAt ? new Date(project.createdAt).toLocaleString() : ''],
        ['Created By', project.createdBy?.name || 'N/A']
      ].filter(([, v]) => v && String(v).trim().length > 0)
      content.push({ text: 'Project Details', style: 'h2', margin: [0, 6, 0, 6] })
      content.push({
        table: {
          widths: ['30%', '70%'],
          body: [
            [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
            ...projectRows.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: String(v || ''), style: 'tdVal' }])
          ]
        },
        layout: 'lightHorizontalLines'
      })

      // 2. LEAD DETAILS (Complete)
      if (lead) {
        const leadRows = [
          ['Customer Name', lead.customerName || ''],
          ['Project Title', lead.projectTitle || ''],
          ['Enquiry Number', lead.enquiryNumber || ''],
          ['Enquiry Date', lead.enquiryDate ? new Date(lead.enquiryDate).toLocaleDateString() : ''],
          ['Submission Due Date', lead.submissionDueDate ? new Date(lead.submissionDueDate).toLocaleDateString() : ''],
          ['Scope Summary', lead.scopeSummary || ''],
          ['Name', lead.name || ''],
          ['Budget', lead.budget ? `${lead.budget}` : ''],
          ['Location Details', lead.locationDetails || ''],
          ['Working Hours', lead.workingHours || ''],
          ['Manpower Count', String(lead.manpowerCount || '')],
          ['Status', lead.status || ''],
          ['Created At', lead.createdAt ? new Date(lead.createdAt).toLocaleString() : ''],
          ['Created By', lead.createdBy?.name || 'N/A']
        ].filter(([, v]) => v && String(v).trim().length > 0)
        if (leadRows.length > 0) {
          content.push({ text: 'Lead Details', style: 'h2', margin: [0, 12, 0, 6] })
          content.push({
            table: {
              widths: ['30%', '70%'],
              body: [
                [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                ...leadRows.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: String(v || ''), style: 'tdVal' }])
              ]
            },
            layout: 'lightHorizontalLines'
          })
        }
      }

      // 3. QUOTATION DETAILS (Complete)
      if (quotation) {
        const q = quotation
        const currency = q.priceSchedule?.currency || 'AED'
        
        // Basic Quotation Info
        const qBasicRows = [
          ['Submitted To', q.submittedTo || ''],
          ['Attention', q.attention || ''],
          ['Offer Reference', q.offerReference || ''],
          ['Enquiry Number', q.enquiryNumber || ''],
          ['Offer Date', q.offerDate ? new Date(q.offerDate).toLocaleDateString() : ''],
          ['Enquiry Date', q.enquiryDate ? new Date(q.enquiryDate).toLocaleDateString() : ''],
          ['Project Title', q.projectTitle || ''],
          ['Introduction Text', q.introductionText || ''],
          ['Our Viewpoints', q.ourViewpoints || ''],
          ['Created At', q.createdAt ? new Date(q.createdAt).toLocaleString() : ''],
          ['Created By', q.createdBy?.name || 'N/A']
        ].filter(([, v]) => v && String(v).trim().length > 0)
        if (qBasicRows.length > 0) {
          content.push({ text: 'Quotation Details', style: 'h2', margin: [0, 12, 0, 6] })
          content.push({
            table: {
              widths: ['30%', '70%'],
              body: [
                [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                ...qBasicRows.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: String(v || ''), style: 'tdVal' }])
              ]
            },
            layout: 'lightHorizontalLines'
          })
        }

        // Company Info
        if (q.companyInfo && (q.companyInfo.name || q.companyInfo.address || q.companyInfo.phone || q.companyInfo.email)) {
          const compRows = [
            ['Company Name', q.companyInfo.name || ''],
            ['Address', q.companyInfo.address || ''],
            ['Phone', q.companyInfo.phone || ''],
            ['Email', q.companyInfo.email || '']
          ].filter(([, v]) => v && String(v).trim().length > 0)
          if (compRows.length > 0) {
            content.push({ text: 'Company Information', style: 'h2', margin: [0, 12, 0, 6] })
            content.push({
              table: {
                widths: ['30%', '70%'],
                body: [
                  [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                  ...compRows.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: String(v || ''), style: 'tdVal' }])
                ]
              },
              layout: 'lightHorizontalLines'
            })
          }
        }

        // Scope of Work
        if (Array.isArray(q.scopeOfWork) && q.scopeOfWork.length > 0) {
          const scopeRows = q.scopeOfWork
            .filter(s => (s?.description || '').trim().length > 0)
            .map((s, i) => [String(i + 1), s.description || '', String(s.quantity || ''), s.unit || '', s.locationRemarks || ''])
          if (scopeRows.length > 0) {
            content.push({ text: 'Scope of Work', style: 'h2', margin: [0, 12, 0, 6] })
            content.push({
              table: {
                widths: ['6%', '54%', '10%', '10%', '20%'],
                body: [
                  [{ text: '#', style: 'th' }, { text: 'Description', style: 'th' }, { text: 'Qty', style: 'th' }, { text: 'Unit', style: 'th' }, { text: 'Location/Remarks', style: 'th' }],
                  ...scopeRows
                ]
              },
              layout: 'lightHorizontalLines'
            })
          }
        }

        // Price Schedule
        if (q.priceSchedule) {
          const priceItems = (q.priceSchedule.items || [])
            .filter(it => (it?.description || '').trim().length > 0 || Number(it.quantity) > 0 || Number(it.unitRate) > 0)
          const priceRows = priceItems.map((it, i) => [
            String(i + 1),
            it.description || '',
            String(it.quantity || 0),
            it.unit || '',
            `${currency} ${Number(it.unitRate || 0).toFixed(2)}`,
            `${currency} ${Number((it.quantity || 0) * (it.unitRate || 0)).toFixed(2)}`
          ])
          if (priceRows.length > 0) {
            content.push({ text: 'Price Schedule', style: 'h2', margin: [0, 12, 0, 6] })
            content.push({
              table: {
                widths: ['6%', '44%', '10%', '10%', '15%', '15%'],
                body: [
                  [
                    { text: '#', style: 'th' },
                    { text: 'Description', style: 'th' },
                    { text: 'Qty', style: 'th' },
                    { text: 'Unit', style: 'th' },
                    { text: `Unit Rate (${currency})`, style: 'th' },
                    { text: `Amount (${currency})`, style: 'th' }
                  ],
                  ...priceRows
                ]
              },
              layout: 'lightHorizontalLines'
            })
            content.push({
              columns: [
                { width: '*', text: '' },
                {
                  width: '40%',
                  table: {
                    widths: ['55%', '45%'],
                    body: [
                      [{ text: 'Sub Total', style: 'tdKey' }, { text: `${currency} ${Number(q.priceSchedule?.subTotal || 0).toFixed(2)}`, alignment: 'right' }],
                      [{ text: `VAT (${q.priceSchedule?.taxDetails?.vatRate || 0}%)`, style: 'tdKey' }, { text: `${currency} ${Number(q.priceSchedule?.taxDetails?.vatAmount || 0).toFixed(2)}`, alignment: 'right' }],
                      [{ text: 'Grand Total', style: 'th' }, { text: `${currency} ${Number(q.priceSchedule?.grandTotal || 0).toFixed(2)}`, style: 'th', alignment: 'right' }]
                    ]
                  },
                  layout: 'lightHorizontalLines'
                }
              ],
              margin: [0, 8, 0, 0]
            })
          }
        }

        // Exclusions
        if (Array.isArray(q.exclusions) && q.exclusions.length > 0) {
          const exclText = q.exclusions.map(x => String(x || '').trim()).filter(Boolean).join(', ')
          if (exclText) {
            content.push({ text: 'Exclusions', style: 'h2', margin: [0, 12, 0, 6] })
            content.push({ text: exclText, margin: [0, 0, 0, 0] })
          }
        }

        // Payment Terms
        if (Array.isArray(q.paymentTerms) && q.paymentTerms.length > 0) {
          const payRows = q.paymentTerms
            .filter(p => (p?.milestoneDescription || '').trim().length > 0 || String(p?.amountPercent || '').trim().length > 0)
            .map(p => [p.milestoneDescription || '', `${p.amountPercent || 0}%`])
          if (payRows.length > 0) {
            content.push({ text: 'Payment Terms', style: 'h2', margin: [0, 12, 0, 6] })
            content.push({
              table: {
                widths: ['70%', '30%'],
                body: [
                  [{ text: 'Milestone Description', style: 'th' }, { text: 'Amount %', style: 'th' }],
                  ...payRows
                ]
              },
              layout: 'lightHorizontalLines'
            })
          }
        }

        // Delivery/Completion/Warranty/Validity
        if (q.deliveryCompletionWarrantyValidity) {
          const dcwv = q.deliveryCompletionWarrantyValidity
          const dcwvRows = [
            ['Delivery Timeline', dcwv.deliveryTimeline || ''],
            ['Warranty Period', dcwv.warrantyPeriod || ''],
            ['Offer Validity (Days)', typeof dcwv.offerValidity === 'number' ? String(dcwv.offerValidity) : (dcwv.offerValidity || '')],
            ['Authorized Signatory', dcwv.authorizedSignatory || '']
          ].filter(([, v]) => v && String(v).trim().length > 0)
          if (dcwvRows.length > 0) {
            content.push({ text: 'Delivery/Completion/Warranty/Validity', style: 'h2', margin: [0, 12, 0, 6] })
            content.push({
              table: {
                widths: ['30%', '70%'],
                body: [
                  [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                  ...dcwvRows.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: String(v || ''), style: 'tdVal' }])
                ]
              },
              layout: 'lightHorizontalLines'
            })
          }
        }

        // Management Approval
        if (q.managementApproval) {
          const maRows = [
            ['Status', q.managementApproval.status || ''],
            ['Approved By', q.managementApproval.approvedBy?.name || ''],
            ['Approved At', q.managementApproval.approvedAt ? new Date(q.managementApproval.approvedAt).toLocaleString() : ''],
            ['Comments', q.managementApproval.comments || '']
          ].filter(([, v]) => v && String(v).trim().length > 0)
          if (maRows.length > 0) {
            content.push({ text: 'Management Approval', style: 'h2', margin: [0, 12, 0, 6] })
            content.push({
              table: {
                widths: ['30%', '70%'],
                body: [
                  [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                  ...maRows.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: String(v || ''), style: 'tdVal' }])
                ]
              },
              layout: 'lightHorizontalLines'
            })
          }
        }
      }

      // 4. ALL REVISIONS DETAILS (Complete)
      if (Array.isArray(revisions) && revisions.length > 0) {
        const sortedRevs = revisions.sort((a, b) => (a.revisionNumber || 0) - (b.revisionNumber || 0))
        sortedRevs.forEach((rev, idx) => {
          const currency = rev.priceSchedule?.currency || 'AED'
          content.push({ text: `Revision #${rev.revisionNumber}`, style: 'h2', margin: [0, 12, 0, 6] })
          
          // Basic Revision Info
          const revBasicRows = [
            ['Submitted To', rev.submittedTo || ''],
            ['Attention', rev.attention || ''],
            ['Offer Reference', rev.offerReference || ''],
            ['Enquiry Number', rev.enquiryNumber || ''],
            ['Offer Date', rev.offerDate ? new Date(rev.offerDate).toLocaleDateString() : ''],
            ['Enquiry Date', rev.enquiryDate ? new Date(rev.enquiryDate).toLocaleDateString() : ''],
            ['Project Title', rev.projectTitle || ''],
            ['Introduction Text', rev.introductionText || ''],
            ['Our Viewpoints', rev.ourViewpoints || ''],
            ['Created At', rev.createdAt ? new Date(rev.createdAt).toLocaleString() : ''],
            ['Created By', rev.createdBy?.name || 'N/A']
          ].filter(([, v]) => v && String(v).trim().length > 0)
          if (revBasicRows.length > 0) {
            content.push({
              table: {
                widths: ['30%', '70%'],
                body: [
                  [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                  ...revBasicRows.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: String(v || ''), style: 'tdVal' }])
                ]
              },
              layout: 'lightHorizontalLines'
            })
          }

          // Scope of Work
          if (Array.isArray(rev.scopeOfWork) && rev.scopeOfWork.length > 0) {
            const scopeRows = rev.scopeOfWork
              .filter(s => (s?.description || '').trim().length > 0)
              .map((s, i) => [String(i + 1), s.description || '', String(s.quantity || ''), s.unit || '', s.locationRemarks || ''])
            if (scopeRows.length > 0) {
              content.push({ text: 'Scope of Work', style: 'h3', margin: [0, 8, 0, 4] })
              content.push({
                table: {
                  widths: ['6%', '54%', '10%', '10%', '20%'],
                  body: [
                    [{ text: '#', style: 'th' }, { text: 'Description', style: 'th' }, { text: 'Qty', style: 'th' }, { text: 'Unit', style: 'th' }, { text: 'Location/Remarks', style: 'th' }],
                    ...scopeRows
                  ]
                },
                layout: 'lightHorizontalLines'
              })
            }
          }

          // Price Schedule
          if (rev.priceSchedule) {
            const priceItems = (rev.priceSchedule.items || [])
              .filter(it => (it?.description || '').trim().length > 0 || Number(it.quantity) > 0 || Number(it.unitRate) > 0)
            const priceRows = priceItems.map((it, i) => [
              String(i + 1),
              it.description || '',
              String(it.quantity || 0),
              it.unit || '',
              `${currency} ${Number(it.unitRate || 0).toFixed(2)}`,
              `${currency} ${Number((it.quantity || 0) * (it.unitRate || 0)).toFixed(2)}`
            ])
            if (priceRows.length > 0) {
              content.push({ text: 'Price Schedule', style: 'h3', margin: [0, 8, 0, 4] })
              content.push({
                table: {
                  widths: ['6%', '44%', '10%', '10%', '15%', '15%'],
                  body: [
                    [
                      { text: '#', style: 'th' },
                      { text: 'Description', style: 'th' },
                      { text: 'Qty', style: 'th' },
                      { text: 'Unit', style: 'th' },
                      { text: `Unit Rate (${currency})`, style: 'th' },
                      { text: `Amount (${currency})`, style: 'th' }
                    ],
                    ...priceRows
                  ]
                },
                layout: 'lightHorizontalLines'
              })
              content.push({
                columns: [
                  { width: '*', text: '' },
                  {
                    width: '40%',
                    table: {
                      widths: ['55%', '45%'],
                      body: [
                        [{ text: 'Sub Total', style: 'tdKey' }, { text: `${currency} ${Number(rev.priceSchedule?.subTotal || 0).toFixed(2)}`, alignment: 'right' }],
                        [{ text: `VAT (${rev.priceSchedule?.taxDetails?.vatRate || 0}%)`, style: 'tdKey' }, { text: `${currency} ${Number(rev.priceSchedule?.taxDetails?.vatAmount || 0).toFixed(2)}`, alignment: 'right' }],
                        [{ text: 'Grand Total', style: 'th' }, { text: `${currency} ${Number(rev.priceSchedule?.grandTotal || 0).toFixed(2)}`, style: 'th', alignment: 'right' }]
                      ]
                    },
                    layout: 'lightHorizontalLines'
                  }
                ],
                margin: [0, 8, 0, 0]
              })
            }
          }

          // Management Approval
          if (rev.managementApproval) {
            const maRows = [
              ['Status', rev.managementApproval.status || ''],
              ['Approved By', rev.managementApproval.approvedBy?.name || ''],
              ['Approved At', rev.managementApproval.approvedAt ? new Date(rev.managementApproval.approvedAt).toLocaleString() : ''],
              ['Comments', rev.managementApproval.comments || '']
            ].filter(([, v]) => v && String(v).trim().length > 0)
            if (maRows.length > 0) {
              content.push({ text: 'Management Approval', style: 'h3', margin: [0, 8, 0, 4] })
              content.push({
                table: {
                  widths: ['30%', '70%'],
                  body: [
                    [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                    ...maRows.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: String(v || ''), style: 'tdVal' }])
                  ]
                },
                layout: 'lightHorizontalLines'
              })
            }
          }
        })
      }

      // 5. SITE VISITS DETAILS (Complete)
      if (Array.isArray(siteVisits) && siteVisits.length > 0) {
        siteVisits.forEach((visit, idx) => {
          content.push({ text: `Site Visit #${idx + 1}`, style: 'h2', margin: [0, 12, 0, 6] })
          const visitRows = [
            ['Visit Date & Time', visit.visitAt ? new Date(visit.visitAt).toLocaleString() : ''],
            ['Site Location', visit.siteLocation || ''],
            ['Engineer Name', visit.engineerName || ''],
            ['Work Progress Summary', visit.workProgressSummary || ''],
            ['Safety Observations', visit.safetyObservations || ''],
            ['Quality/Material Check', visit.qualityMaterialCheck || ''],
            ['Issues Found', visit.issuesFound || ''],
            ['Action Items', visit.actionItems || ''],
            ['Weather Conditions', visit.weatherConditions || ''],
            ['Description', visit.description || ''],
            ['Created At', visit.createdAt ? new Date(visit.createdAt).toLocaleString() : ''],
            ['Created By', visit.createdBy?.name || 'N/A']
          ].filter(([, v]) => v && String(v).trim().length > 0)
          if (visitRows.length > 0) {
            content.push({
              table: {
                widths: ['30%', '70%'],
                body: [
                  [{ text: 'Field', style: 'th' }, { text: 'Value', style: 'th' }],
                  ...visitRows.map(([k, v]) => [{ text: k, style: 'tdKey' }, { text: String(v || ''), style: 'tdVal' }])
                ]
              },
              layout: 'lightHorizontalLines'
            })
          }
        })
      }

      return {
        pageMargins: [36, 36, 36, 48],
        content,
        styles: {
          h1: { fontSize: 18, bold: true, color: '#0f172a' },
          h2: { fontSize: 12, bold: true, color: '#0f172a' },
          h3: { fontSize: 11, bold: true, color: '#0f172a' },
          th: { bold: true, fillColor: '#f1f5f9' },
          tdKey: { color: '#64748b' },
          tdVal: { color: '#0f172a' }
        },
        defaultStyle: { fontSize: 10, lineHeight: 1.2 }
      }
    } catch (e) {
      throw e
    }
  }

  const generatePDFPreview = async () => {
    try {
      if (!project) return
      await ensurePdfMake()
      const docDefinition = await buildProjectPDFContent()
      const pdfDoc = window.pdfMake.createPdf(docDefinition)
      pdfDoc.getDataUrl((dataUrl) => {
        setPrintPreviewModal({ open: true, pdfUrl: dataUrl })
      })
    } catch (e) {
      setNotify({ open: true, title: 'Preview Failed', message: 'We could not generate the PDF preview. Please try again.' })
    }
  }

  const exportProjectPDF = async () => {
    try {
      if (!project) return
      await ensurePdfMake()
      const docDefinition = await buildProjectPDFContent()
      const filename = `Project_${project.name.replace(/\s+/g,'_')}.pdf`
      window.pdfMake.createPdf(docDefinition).download(filename)
    } catch (e) {
      setNotify({ open: true, title: 'Export Failed', message: 'We could not generate the PDF for this project. Please try again.' })
    }
  }

  if (isLoading) {
    return (
      <div className="lead-management" style={{ padding: 24 }}>
        <PageSkeleton showHeader={true} showContent={true} />
      </div>
    )
  }

  if (!project) return (
    <div className="lead-management" style={{ padding: 24 }}>
      <h2>Project Details</h2>
      <p>Nothing to display.</p>
    </div>
  )

  return (
    <div className="lead-detail">
      <div className="ld-header">
        <div className="ld-title">
          <div className="title-row">
            <h1>{project.name}</h1>
          </div>
          <span className="ld-subtitle">Status: {project.status}</span>
        </div>
        <div className="ld-sticky-actions">
          <button className="save-btn" onClick={generatePDFPreview}>Print Preview</button>
          <button className="link-btn" onClick={async () => {
            setLoadingAttachments(true)
            setShowAttachmentsModal(true)
            try {
              // Fetch all attachments
              const attachmentsData = { leads: [], siteVisits: [], project: [], variations: [] }
              
              // Get project attachments
              if (project.attachments && Array.isArray(project.attachments) && project.attachments.length > 0) {
                attachmentsData.project = project.attachments.map(att => ({ ...att, source: 'project', sourceName: project.name }))
              }
              
              // Get lead attachments
              if (project.leadId) {
                try {
                  const leadId = typeof project.leadId === 'object' ? project.leadId._id : project.leadId
                  const leadRes = await api.get(`/api/leads/${leadId}`)
                  if (leadRes.data.attachments && Array.isArray(leadRes.data.attachments) && leadRes.data.attachments.length > 0) {
                    attachmentsData.leads = leadRes.data.attachments.map(att => ({ ...att, source: 'lead', sourceName: leadRes.data.customerName || leadRes.data.projectTitle || 'Lead' }))
                  }
                } catch {}
              }
              
              // Get site visit attachments
              try {
                console.log('Fetching site visits for project:', project._id)
                const siteVisitsRes = await api.get(`/api/site-visits/project/${project._id}`)
                console.log('Site visits response:', siteVisitsRes.data)
                if (Array.isArray(siteVisitsRes.data)) {
                  siteVisitsRes.data.forEach(visit => {
                    console.log('Processing visit:', visit._id, 'Attachments count:', visit.attachments?.length || 0)
                    if (visit.attachments && Array.isArray(visit.attachments) && visit.attachments.length > 0) {
                      const visitAttachments = visit.attachments.map(att => ({
                        ...att,
                        source: 'siteVisit',
                        sourceName: `Site Visit - ${new Date(visit.visitAt).toLocaleDateString()} - ${visit.siteLocation}`
                      }))
                      console.log('Adding site visit attachments:', visitAttachments.length)
                      attachmentsData.siteVisits.push(...visitAttachments)
                    }
                  })
                }
                console.log('Total site visit attachments:', attachmentsData.siteVisits.length)
              } catch (error) {
                console.error('Error fetching site visits:', error)
              }
              
              // Get variation attachments
              try {
                const variationsRes = await api.get(`/api/project-variations?parentProject=${project._id}`)
                if (Array.isArray(variationsRes.data)) {
                  variationsRes.data.forEach(variation => {
                    if (variation.attachments && Array.isArray(variation.attachments) && variation.attachments.length > 0) {
                      const variationAttachments = variation.attachments.map(att => ({
                        ...att,
                        source: 'variation',
                        sourceName: `Variation ${variation.variationNumber || variation._id}`
                      }))
                      attachmentsData.variations.push(...variationAttachments)
                    }
                  })
                }
              } catch {}
              
              setProjectAttachmentsData(attachmentsData)
              console.log('Final attachments data structure:', {
                project: attachmentsData.project.length,
                leads: attachmentsData.leads.length,
                siteVisits: attachmentsData.siteVisits.length,
                variations: attachmentsData.variations.length,
                totalAttachments: attachmentsData.project.length + attachmentsData.leads.length + attachmentsData.siteVisits.length + attachmentsData.variations.length
              })
            } catch (e) {
              setNotify({ open: true, title: 'Error', message: 'Failed to load attachments. Please try again.' })
            } finally {
              setLoadingAttachments(false)
            }
          }}>View All Attachments</button>
          {/* Edit gate mirrors server allow-list at PUT /api/projects/:id
              (manager / admin / estimation_engineer). Hiding it for everyone
              else - including site_worker, supervisor, project_engineer -
              keeps the read-only roles from clicking a button that would
              just bounce off the server with 403. */}
          {(currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin') || currentUser?.roles?.includes('estimation_engineer')) && (
            <button className="assign-btn" onClick={async () => {
              try {
                const token = localStorage.getItem('token')
                const resEng = await api.get('/api/projects/project-engineers')
                setProjectEngineers(Array.isArray(resEng.data) ? resEng.data : [])
              } catch {}
              // Check if variations already exist for this project
              if (variations && Array.isArray(variations) && variations.length > 0) {
                // Show warning modal instead of opening edit modal
                setEditProjectWarningModal({ open: true, existingVariations: variations })
                return
              }
              // Reset file states
              setSelectedFiles([])
              setPreviewFiles([])
              setAttachmentsToRemove([])
              setEditModal({ open: true, form: {
                name: project.name || '',
                locationDetails: project.locationDetails || '',
                workingHours: project.workingHours || '',
                manpowerCount: project.manpowerCount !== null && project.manpowerCount !== undefined ? project.manpowerCount : '',
                status: project.status || 'active',
                assignedProjectEngineer: Array.isArray(project.assignedProjectEngineer)
                  ? project.assignedProjectEngineer.map(e => typeof e === 'object' ? e._id : e)
                  : []
              } })
            }}>Edit</button>
          )}
          {lead?._id && (
            <button className="link-btn" onClick={() => { try { localStorage.setItem('leadId', lead._id) } catch {}; window.location.href = '/lead-detail' }}>View Lead</button>
          )}
          {quotation?._id && (
            <button className="link-btn" onClick={() => { try { localStorage.setItem('quotationId', quotation._id) } catch {}; window.location.href = '/quotation-detail' }}>View Quotation</button>
          )}
          {project.sourceRevision?._id && (
            <button className="link-btn" onClick={() => { try { localStorage.setItem('revisionId', project.sourceRevision._id) } catch {}; window.location.href = '/revision-detail' }}>View Source Revision</button>
          )}
          {project.sourceQuotation?._id && !project.sourceRevision?._id && (
            <span className="status-badge" style={{ backgroundColor: '#6b7280', color: 'white', padding: '6px 12px', borderRadius: '4px' }}>No Revisions</span>
          )}
          {(currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin')) && (
            <button className="reject-btn" onClick={() => setDeleteModal({ open: true })}>Delete Project</button>
          )}
          {canCreateVariation() && (
            <button className="assign-btn" onClick={async () => {
              // Check if variations already exist for this project
              if (variations && Array.isArray(variations) && variations.length > 0) {
                setVariationWarningModal({ open: true, existingVariations: variations })
                return
              }
              
              // Navigate to variation form page with project context
              try {
                window.location.href = `/projects/${project._id}/create-variation`
              } catch (error) {
                setNotify({ open: true, title: 'Error', message: 'Failed to navigate to variation form. Please try again.' })
              }
            }}>Create Variation Quotation</button>
          )}
          
          {(currentUser?.roles?.some(role => ['admin', 'manager', 'inventory_manager'].includes(role))) && (
            <button className="assign-btn" onClick={async () => {
              // Fetch inventory materials for dropdown
              try {
                const resMats = await api.get('/api/materials')
                setInventoryMaterials(Array.isArray(resMats.data) ? resMats.data : [])
              } catch (err) {
                console.error('Error fetching materials:', err)
                setInventoryMaterials([])
              }
              setMaterialRequestModal({ 
                open: true, 
                requestType: 'return',
                form: { items: [{ materialId: '', materialName: '', sku: '', quantity: 1, uom: 'Pcs', notes: '' }], priority: 'normal', requiredDate: '', purpose: 'Material Return', notes: '', requesterPhone: '' } 
              })
            }} style={{ background: '#f59e0b', marginRight: '8px' }}>Request Material Return</button>
          )}

          {(currentUser?.roles?.includes('project_engineer')) && (
            <button className="assign-btn" onClick={openReturnModal} style={{ background: '#f59e0b' }}>📦 Return Remaining Materials</button>
          )}
          {canCreateMaterialRequest() && (
            <button className="assign-btn" onClick={async () => {
              // Fetch inventory materials for dropdown
              try {
                const resMats = await api.get('/api/materials')
                setInventoryMaterials(Array.isArray(resMats.data) ? resMats.data : [])
              } catch (err) {
                console.error('Error fetching materials:', err)
                setInventoryMaterials([])
              }
              setMaterialRequestModal({ 
                open: true, 
                requestType: 'request',
                form: { items: [{ materialId: '', materialName: '', sku: '', quantity: 1, uom: 'Pcs', notes: '' }], priority: 'normal', requiredDate: '', purpose: '', notes: '', requesterPhone: '' } 
              })
            }} style={{ background: '#6366f1' }}>Create Material Request</button>
          )}

        </div>
      </div>

      <div className="ld-grid">
          <div className="ld-card ld-section">
          <h3>Project Overview</h3>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr><td data-label="Field">Location</td><td data-label="Value">{project.locationDetails || 'N/A'}</td></tr>
                <tr>
                  <td data-label="Field">Site Location (geofence for GPS punch)</td>
                  <td data-label="Value">
                    {project.siteLocationId
                      ? (typeof project.siteLocationId === 'object'
                          ? (
                            <>
                              <strong>{project.siteLocationId.name}</strong>
                              <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 6 }}>
                                ({project.siteLocationId.type}{project.siteLocationId.noGeofence
                                  ? ', no geofence'
                                  : `, ${project.siteLocationId.geofenceRadiusMeters || '—'}m radius`})
                              </span>
                              {project.siteLocationId.address && (
                                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                                  {project.siteLocationId.address}
                                </div>
                              )}
                            </>
                          )
                          : <span style={{ color: 'var(--text-muted)' }}>Site location set (refresh page to load details)</span>)
                      : <span style={{ color: 'var(--text-muted)' }}>None — assigned employees fall back to their base location</span>}
                  </td>
                </tr>
                <tr><td data-label="Field">Working Hours</td><td data-label="Value">{project.workingHours || 'N/A'}</td></tr>
                <tr><td data-label="Field">Manpower</td><td data-label="Value">{project.manpowerCount || 'N/A'}</td></tr>
                <tr>
                  <td data-label="Field">Project Engineer(s)</td>
                  <td data-label="Value">
                    {Array.isArray(project.assignedProjectEngineer) && project.assignedProjectEngineer.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {project.assignedProjectEngineer.map((eng, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{eng.name || 'N/A'}</span>
                            {eng._id && (
                              <button
                                className="link-btn"
                                onClick={() => setProfileUser(eng)}
                              >
                                View Profile
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : 'Not Assigned'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <SiteTeamView
          project={project}
          onManageClick={() => setManageTeamOpen(true)}
        />

        <ManageSiteTeamModal
          isOpen={manageTeamOpen}
          project={project}
          onClose={() => setManageTeamOpen(false)}
          onUpdated={async () => {
            try {
              const res = await api.get(`/api/projects/${project._id}`)
              setProject(res.data)
            } catch {}
          }}
        />

        {lead && (
          <div className="ld-card ld-section">
            <h3>Lead Details</h3>
            <div className="ld-kv">
              <p><strong>Customer:</strong> {lead.customerName || 'N/A'}</p>
              <p><strong>Project Title:</strong> {lead.projectTitle || 'N/A'}</p>
              <p><strong>Enquiry #:</strong> {lead.enquiryNumber || 'N/A'}</p>
            </div>
          </div>
        )}

        {quotation && (
          <div className="ld-card ld-section">
            <h3>Quotation Summary</h3>
            <div className="ld-kv">
              <p><strong>Offer Ref:</strong> {quotation.offerReference || 'N/A'}</p>
              <p><strong>Currency:</strong> {quotation.priceSchedule?.currency || 'AED'}</p>
              <p><strong>Grand Total:</strong> {Number(quotation.priceSchedule?.grandTotal || 0).toFixed(2)}</p>
            </div>
          </div>
        )}

        {Array.isArray(revisions) && revisions.length > 0 && (
          <div className="ld-card ld-section">
            <h3>Related Revisions ({revisions.length})</h3>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Grand Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {revisions.sort((a,b)=> (a.revisionNumber||0)-(b.revisionNumber||0)).map(r => (
                    <tr key={r._id}>
                      <td data-label="#">{r.revisionNumber}</td>
                      <td data-label="Status">{r.managementApproval?.status || 'pending'}</td>
                      <td data-label="Grand Total">{(r.priceSchedule?.currency || 'AED')} {Number(r.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                      <td data-label="Actions">
                        <button className="link-btn" onClick={() => { try { localStorage.setItem('revisionId', r._id) } catch {}; window.location.href = '/revision-detail' }}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {Array.isArray(variations) && variations.length > 0 && (
          <div className="ld-card ld-section">
            <h3>Related Variations ({variations.length})</h3>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Grand Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {variations.sort((a,b)=> (a.variationNumber||0)-(b.variationNumber||0)).map(v => (
                    <tr key={v._id}>
                      <td data-label="#">{v.variationNumber}</td>
                      <td data-label="Status">{v.managementApproval?.status || 'draft'}</td>
                      <td data-label="Grand Total">{(v.priceSchedule?.currency || 'AED')} {Number(v.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                      <td data-label="Actions">
                        <button className="link-btn" onClick={() => { try { localStorage.setItem('variationId', v._id) } catch {}; window.location.href = '/variation-detail' }}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {Array.isArray(materialRequests) && materialRequests.length > 0 && (
          <div className="ld-card ld-section">
            <h3>Material Requests ({materialRequests.length})</h3>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th>Requested</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {materialRequests.map(mr => (
                    <tr key={mr._id}>
                      <td data-label="Request #">
                        <span style={{ color: 'var(--primary)', fontWeight: '600' }}>{mr.requestNumber}</span>
                        {mr.requestType === 'return' && (
                          <span style={{ marginLeft: '6px', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '700', background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>↩</span>
                        )}
                      </td>
                      <td data-label="Type">
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '700',
                          background: mr.requestType === 'return' || mr.requestType === 'remaining_return' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
                          color: mr.requestType === 'return' || mr.requestType === 'remaining_return' ? '#f59e0b' : '#6366f1'
                        }}>
                          {mr.requestType === 'return' ? '🔄 RETURN' : mr.requestType === 'remaining_return' ? '↩️ REMAINING RETURN' : '📦 REQUEST'}
                        </span>
                      </td>
                      <td data-label="Priority">
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: mr.priority === 'urgent' ? 'rgba(239,68,68,0.1)' : mr.priority === 'high' ? 'rgba(251,191,36,0.1)' : 'rgba(59,130,246,0.1)',
                          color: mr.priority === 'urgent' ? '#ef4444' : mr.priority === 'high' ? '#f59e0b' : '#3b82f6'
                        }}>
                          {mr.priority?.toUpperCase()}
                        </span>
                      </td>
                      <td data-label="Status">
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: mr.status === 'approved' ? 'rgba(16,185,129,0.1)' : mr.status === 'pending' ? 'rgba(251,191,36,0.1)' : mr.status === 'rejected' ? 'rgba(239,68,68,0.1)' : mr.status === 'received' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                          color: mr.status === 'approved' ? '#10b981' : mr.status === 'pending' ? '#f59e0b' : mr.status === 'rejected' ? '#ef4444' : mr.status === 'received' ? '#059669' : '#6366f1'
                        }}>
                          {mr.status?.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td data-label="Items">{mr.items?.length || 0} items</td>
                      <td data-label="Requested">{new Date(mr.createdAt).toLocaleDateString()}</td>
                      <td data-label="Actions">
                        <button className="link-btn" onClick={() => window.location.href = `/material-request-detail?id=${mr._id}`}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Project Materials Summary - Only show if there are received material requests */}
        {/* Project Materials Summary - Only show if there are received material requests */}
        {(() => {
          // Changed Logic: 'return' is now Outgoing (Project->Inventory) along with 'remaining_return'
          const allRec = materialRequests || []
          const incoming = allRec.filter(r => r.status === 'received' && r.requestType === 'request')
          const outgoing = allRec.filter(r => r.status === 'received' && (r.requestType === 'remaining_return' || r.requestType === 'return'))
          
          if (incoming.length === 0 && outgoing.length === 0) return null
          
          const materialSummary = {}

          // Add Incoming
          for (const req of incoming) {
            for (const item of req.items || []) {
              if (item.assignedQuantity > 0) {
                const matId = item.materialId?._id || item.materialId || item.materialName
                const key = String(matId)
                if (!materialSummary[key]) {
                  materialSummary[key] = {
                    materialId: matId,
                    materialName: item.materialName,
                    sku: item.sku || '-',
                    uom: item.uom,
                    totalQuantity: 0,
                    returnedQuantity: 0,
                    sourceRequests: []
                  }
                }
                materialSummary[key].totalQuantity += item.assignedQuantity
                materialSummary[key].sourceRequests.push({
                   requestNumber: req.requestNumber,
                   quantity: item.assignedQuantity,
                   date: req.receivedAt,
                   type: 'received'
                })
              }
            }
          }

          // Subtract Outgoing
          for (const req of outgoing) {
             for (const item of req.items || []) {
                const returnedQty = item.assignedQuantity || 0
                if (returnedQty > 0) {
                    const matId = item.materialId?._id || item.materialId || item.materialName
                    const key = String(matId)
                    if (materialSummary[key]) {
                        materialSummary[key].totalQuantity -= returnedQty
                        materialSummary[key].returnedQuantity += returnedQty
                        materialSummary[key].sourceRequests.push({
                            requestNumber: req.requestNumber,
                            quantity: -returnedQty,
                            date: req.receivedAt,
                            type: 'returned'
                        })
                    }
                }
             }
          }
          
          // Filter out materials with 0 or negative quantities
          const summaryList = Object.values(materialSummary)
            .filter(m => m.totalQuantity > 0)
            .sort((a, b) => b.totalQuantity - a.totalQuantity)
          const totalMaterials = summaryList.length
          const totalQuantity = summaryList.reduce((sum, m) => sum + m.totalQuantity, 0)
          
          return (
            <div className="ld-card ld-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>📦 Project Materials Summary</h3>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <span style={{ padding: '6px 12px', background: 'rgba(99,102,241,0.1)', borderRadius: '6px', color: '#6366f1', fontWeight: '600', fontSize: '13px' }}>
                    {totalMaterials} Materials
                  </span>
                  <span style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.1)', borderRadius: '6px', color: '#10b981', fontWeight: '600', fontSize: '13px' }}>
                    {totalQuantity} Total Units
                  </span>
                </div>
              </div>
              
              <div className="table">
                <table>
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>SKU</th>
                      <th style={{ textAlign: 'center' }}>Total Qty</th>
                      <th>UOM</th>
                      <th>Source Request(s)</th>
                      <th>Last Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryList.map((mat, index) => (
                      <tr key={index}>
                        <td>
                          <span style={{ fontWeight: '600', color: 'var(--text)' }}>{mat.materialName}</span>
                        </td>
                        <td>
                          <span style={{ color: 'var(--primary)', fontSize: '12px' }}>{mat.sku}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ 
                            padding: '4px 10px', 
                            background: 'rgba(16,185,129,0.15)', 
                            borderRadius: '6px', 
                            fontWeight: '700', 
                            color: '#059669',
                            fontSize: '14px'
                          }}>
                            {mat.totalQuantity}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{mat.uom}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {mat.sourceRequests.filter(sr => sr.type === 'received').map((sr, i) => (
                              <span key={`r-${i}`} style={{ 
                                padding: '2px 6px', 
                                background: 'rgba(16,185,129,0.1)', 
                                borderRadius: '4px', 
                                fontSize: '11px', 
                                color: '#059669',
                                cursor: 'pointer'
                              }} title={`Received: ${sr.quantity} units`}>
                                {sr.requestNumber} (+{sr.quantity})
                              </span>
                            ))}
                            {mat.sourceRequests.filter(sr => sr.type === 'returned').map((sr, i) => (
                              <span key={`rt-${i}`} style={{ 
                                padding: '2px 6px', 
                                background: 'rgba(245,158,11,0.1)', 
                                borderRadius: '4px', 
                                fontSize: '11px', 
                                color: '#f59e0b',
                                cursor: 'pointer'
                              }} title={`Returned: ${Math.abs(sr.quantity)} units`}>
                                ↩ {sr.requestNumber} ({sr.quantity})
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          {mat.sourceRequests.length > 0 && mat.sourceRequests[mat.sourceRequests.length - 1].date
                            ? new Date(mat.sourceRequests[mat.sourceRequests.length - 1].date).toLocaleDateString()
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg)' }}>
                      <td colSpan={2} style={{ fontWeight: '600', color: 'var(--text)' }}>Total</td>
                      <td style={{ textAlign: 'center', fontWeight: '700', color: 'var(--text)', fontSize: '15px' }}>{totalQuantity}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })()}

        {Array.isArray(project.edits) && project.edits.length > 0 && (
          <div className="ld-card ld-section">
            <div className="edit-header">
              <h3 style={{ margin: 0 }}>Project Edit History</h3>
              <button className="link-btn" onClick={() => setHistoryOpen(!historyOpen)}>{historyOpen ? 'Hide' : 'View'}</button>
            </div>
            {historyOpen && (
              <div className="edits-list">
                {project.edits.slice().reverse().map((e, i) => (
                  <div key={i} className="edit-item">
                    <div className="edit-header">
                      <span>By {e.editedBy?._id === currentUser?.id ? 'You' : (e.editedBy?.name || 'N/A')}</span>
                      {e.editedBy?._id && e.editedBy._id !== currentUser?.id && (
                        <button className="link-btn" onClick={() => setProfileUser(e.editedBy)} style={{ marginLeft: 6 }}>View Profile</button>
                      )}
                      <span>{new Date(e.editedAt).toLocaleString()}</span>
                    </div>
                    <ul className="changes-list">
                      {e.changes.map((c, k) => {
                        const FIELD_LABELS = {
                          supervisors: 'Supervisors',
                          workers: 'Workers',
                          assignedProjectEngineer: 'Project Engineers',
                          assignedSiteEngineer: 'Site Engineer'
                        }
                        const label = FIELD_LABELS[c.field] || c.field
                        return (
                          <li key={k}>
                            <strong>{label}:</strong>
                            <div className="change-diff">
                              <pre className="change-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatProjectHistoryValue(c.field, c.from)}</pre>
                              <span>→</span>
                              <pre className="change-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatProjectHistoryValue(c.field, c.to)}</pre>
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

      {/* Attachments Section */}
      {Array.isArray(project.attachments) && project.attachments.length > 0 && (
        <div className="ld-card ld-section">
          <h3>Attachments ({project.attachments.length})</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
            gap: '20px',
            marginTop: '15px'
          }}>
            {project.attachments.map((attachment, index) => {
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
    </div>
      {notify.open && (
        <div className="modal-overlay" onClick={() => setNotify({ open: false, title: '', message: '' })} style={{ zIndex: 10002 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10003 }}>
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
      {editModal.open && (
        <div className="modal-overlay" onClick={() => setEditModal({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Project</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (project && project._id) {
                      const projectId = typeof project._id === 'object' ? project._id._id : project._id
                      window.open(`/projects/edit/${projectId}`, '_blank')
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
                    if (project && project._id) {
                      const projectId = typeof project._id === 'object' ? project._id._id : project._id
                      window.location.href = `/projects/edit/${projectId}`
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
                <button onClick={() => setEditModal({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })} className="close-btn">×</button>
              </div>
            </div>
            <div className="lead-form">
              <div className="form-group">
                <label>Project Name *</label>
                <input type="text" value={editModal.form.name} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, name: e.target.value } })} required />
              </div>
              <div className="form-group">
                <label>Location Details *</label>
                <input type="text" value={editModal.form.locationDetails} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, locationDetails: e.target.value } })} required />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Working Hours</label>
                  <input type="text" value={editModal.form.workingHours} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, workingHours: e.target.value } })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Manpower Count</label>
                  <input type="number" value={editModal.form.manpowerCount} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, manpowerCount: Number(e.target.value || 0) } })} />
                </div>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={editModal.form.status} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, status: e.target.value } })}>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="on_hold">On Hold</option>
                </select>
              </div>
              <div className="form-group">
                <label>Project Engineer(s)</label>
                <div style={{ 
                  border: '1px solid var(--border)', 
                  borderRadius: '8px', 
                  padding: '8px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  backgroundColor: 'var(--bg)'
                }}>
                  {projectEngineers.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '8px' }}>No project engineers available</p>
                  ) : (
                    projectEngineers.map(u => {
                      const isSelected = Array.isArray(editModal.form.assignedProjectEngineer) 
                        ? editModal.form.assignedProjectEngineer.includes(u._id)
                        : editModal.form.assignedProjectEngineer === u._id
                      
                      return (
                        <div key={u._id} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          padding: '8px', 
                          borderBottom: '1px solid var(--border-light)',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <input
                            type="checkbox"
                            id={`eng-${u._id}`}
                            checked={isSelected}
                            onChange={(e) => {
                              const currentEngineers = Array.isArray(editModal.form.assignedProjectEngineer) 
                                ? editModal.form.assignedProjectEngineer 
                                : []
                              
                              let newEngineers
                              if (e.target.checked) {
                                newEngineers = [...currentEngineers, u._id]
                              } else {
                                newEngineers = currentEngineers.filter(id => id !== u._id)
                              }
                              
                              setEditModal({ 
                                ...editModal, 
                                form: { ...editModal.form, assignedProjectEngineer: newEngineers } 
                              })
                            }}
                            style={{ marginRight: '10px', cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                          <label htmlFor={`eng-${u._id}`} style={{ cursor: 'pointer', flex: 1, margin: 0 }}>
                            {u.name} ({u.email})
                          </label>
                        </div>
                      )
                    })
                  )}
                </div>
                {Array.isArray(editModal.form.assignedProjectEngineer) && editModal.form.assignedProjectEngineer.length > 0 && (
                  <small style={{ display: 'block', marginTop: '8px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {editModal.form.assignedProjectEngineer.length} engineer{editModal.form.assignedProjectEngineer.length === 1 ? '' : 's'} selected
                  </small>
                )}
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
                {project && project.attachments && project.attachments.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>Existing Attachments:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {project.attachments.map((attachment, index) => {
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
                              opacity: isMarkedForRemoval ? 0.5 : 1,
                              backgroundColor: isMarkedForRemoval ? '#ffe6e6' : '#fff'
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
                                onError={(e) => { e.target.style.display = 'none' }}
                              />
                            ) : (
                              <div style={{ 
                                width: '100%', 
                                height: '100px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                backgroundColor: '#f5f5f5',
                                borderRadius: '4px'
                              }}>
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
                              >
                                ×
                              </button>
                            )}
                            {isMarkedForRemoval && (
                              <div style={{ 
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                color: '#dc3545'
                              }}>
                                Will Remove
                              </div>
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
                    {project && project.attachments && project.attachments.length > 0 && (
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
                            <div style={{ 
                              width: '100%', 
                              height: '100px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              backgroundColor: '#f5f5f5',
                              borderRadius: '4px'
                            }}>
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
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setEditModal({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  onClick={async () => {
                    if (isSubmitting) return
                    setLoadingAction('save-project')
                    setIsSubmitting(true)
                    try {
                      // Safety check: verify no variations exist before saving
                      if (variations && Array.isArray(variations) && variations.length > 0) {
                        setEditModal({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })
                        setEditProjectWarningModal({ open: true, existingVariations: variations })
                        return
                      }
                      
                      // Use FormData for file uploads
                      const formData = new FormData()
                      Object.keys(editModal.form).forEach(key => {
                        if (key === 'assignedProjectEngineer') return // Skip, handle separately
                        const value = editModal.form[key]
                        // Always send manpowerCount (even if 0) so backend can properly compare
                        if (key === 'manpowerCount') {
                          formData.append(key, value !== null && value !== undefined ? value : '')
                        } else if (value !== '' && value !== null && value !== undefined) {
                          formData.append(key, value)
                        }
                      })
                      
                      // Append engineer IDs separately (FormData doesn't handle arrays well)
                      // Always append the field, even if empty, so backend can clear all engineers
                      if (Array.isArray(editModal.form.assignedProjectEngineer)) {
                        if (editModal.form.assignedProjectEngineer.length > 0) {
                          editModal.form.assignedProjectEngineer.forEach(id => {
                            formData.append('assignedProjectEngineer', id)
                          })
                        } else {
                          // Send empty string to indicate empty array - backend will treat this as empty array
                          formData.append('assignedProjectEngineer', '')
                        }
                      } else {
                        // Handle non-array case (backward compatibility)
                        formData.append('assignedProjectEngineer', editModal.form.assignedProjectEngineer || '')
                      }
                      
                      // Append new files
                      selectedFiles.forEach(file => {
                        formData.append('attachments', file)
                      })
                      
                      // Append attachments to remove
                      attachmentsToRemove.forEach(index => {
                        formData.append('removeAttachments', index)
                      })
                      
                      await api.patch(`/api/projects/${project._id}`, formData)
                      const res = await api.get(`/api/projects/${project._id}`)
                      setProject(res.data)
                      setEditModal({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })
                      setSelectedFiles([])
                      setPreviewFiles([])
                      setAttachmentsToRemove([])
                      setNotify({ open: true, title: 'Saved', message: 'Project updated successfully.' })
                    } catch (error) {
                      setNotify({ open: true, title: 'Save Failed', message: error.response?.data?.message || 'We could not update the project.' })
                    } finally {
                      setIsSubmitting(false)
                      setLoadingAction(null)
                    }
                  }}
                  disabled={isSubmitting}
                >
                  <ButtonLoader loading={loadingAction === 'save-project'}>
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {editProjectWarningModal.open && (
        <div className="modal-overlay" onClick={() => setEditProjectWarningModal({ open: false, existingVariations: [] })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cannot Edit Project</h2>
              <button onClick={() => setEditProjectWarningModal({ open: false, existingVariations: [] })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div style={{ padding: '16px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ margin: 0, color: '#7C2D12', fontWeight: 500 }}>
                  ⚠️ This project cannot be edited because it has {editProjectWarningModal.existingVariations.length} existing variation{editProjectWarningModal.existingVariations.length > 1 ? 's' : ''}.
                </p>
              </div>
              <p style={{ marginBottom: '16px' }}>
                This project has existing variation quotations. 
                Editing the project is blocked to maintain data integrity and ensure consistency with approved variations.
              </p>
              {editProjectWarningModal.existingVariations.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ marginBottom: '8px', fontWeight: 600 }}>Existing Variations:</p>
                  <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                    {editProjectWarningModal.existingVariations.map((v, idx) => (
                      <li key={v._id || idx} style={{ marginBottom: '4px' }}>
                        Variation #{v.variationNumber} 
                        {v.offerReference && ` - ${v.offerReference}`}
                        {v.managementApproval?.status && (
                          <span className={`status-badge ${v.managementApproval.status === 'approved' ? 'approved' : v.managementApproval.status === 'rejected' ? 'rejected' : 'blue'}`} style={{ marginLeft: '8px' }}>
                            {v.managementApproval.status}
                          </span>
                        )}
                        <button 
                          className="link-btn" 
                          onClick={() => {
                            try {
                              localStorage.setItem('variationId', v._id)
                              window.location.href = '/variation-detail'
                            } catch {}
                          }}
                          style={{ marginLeft: '8px' }}
                        >
                          View
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
                To make changes to this project, you must first delete or remove all associated variations. 
                Please contact a manager or administrator if you need to modify project details.
              </p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => setEditProjectWarningModal({ open: false, existingVariations: [] })}>Understood</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {deleteProjectWarningModal.open && (
        <div className="modal-overlay" onClick={() => setDeleteProjectWarningModal({ open: false, existingVariations: [] })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cannot Delete Project</h2>
              <button onClick={() => setDeleteProjectWarningModal({ open: false, existingVariations: [] })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div style={{ padding: '16px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ margin: 0, color: '#7C2D12', fontWeight: 500 }}>
                  ⚠️ This project cannot be deleted because it has {deleteProjectWarningModal.existingVariations.length} existing variation{deleteProjectWarningModal.existingVariations.length > 1 ? 's' : ''}.
                </p>
              </div>
              <p style={{ marginBottom: '16px' }}>
                This project has existing variation quotations. 
                Deleting the project is blocked to maintain data integrity and ensure consistency with approved variations.
              </p>
              {deleteProjectWarningModal.existingVariations.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ marginBottom: '8px', fontWeight: 600 }}>Existing Variations:</p>
                  <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                    {deleteProjectWarningModal.existingVariations.map((v, idx) => (
                      <li key={v._id || idx} style={{ marginBottom: '4px' }}>
                        Variation #{v.variationNumber} 
                        {v.offerReference && ` - ${v.offerReference}`}
                        {v.managementApproval?.status && (
                          <span className={`status-badge ${v.managementApproval.status === 'approved' ? 'approved' : v.managementApproval.status === 'rejected' ? 'rejected' : 'blue'}`} style={{ marginLeft: '8px' }}>
                            {v.managementApproval.status}
                          </span>
                        )}
                        <button 
                          className="link-btn" 
                          onClick={() => {
                            try {
                              localStorage.setItem('variationId', v._id)
                              window.location.href = '/variation-detail'
                            } catch {}
                          }}
                          style={{ marginLeft: '8px' }}
                        >
                          View
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
                To delete this project, you must first delete or remove all associated variations. 
                Please contact a manager or administrator if you need to delete this project.
              </p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => setDeleteProjectWarningModal({ open: false, existingVariations: [] })}>Understood</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {variationWarningModal.open && (
        <div className="modal-overlay" onClick={() => setVariationWarningModal({ open: false, existingVariations: [] })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Variation Already Exists</h2>
              <button onClick={() => setVariationWarningModal({ open: false, existingVariations: [] })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div style={{ padding: '16px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ margin: 0, color: '#7C2D12', fontWeight: 500 }}>
                  ⚠️ This project already has {variationWarningModal.existingVariations.length} existing variation{variationWarningModal.existingVariations.length > 1 ? 's' : ''}.
                </p>
              </div>
              <p style={{ marginBottom: '16px' }}>
                A variation quotation already exists for project <strong>{project?.name}</strong>. 
                You cannot create another variation directly from the project.
              </p>
              {variationWarningModal.existingVariations.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ marginBottom: '8px', fontWeight: 600 }}>Existing Variations:</p>
                  <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                    {variationWarningModal.existingVariations.map((v, idx) => (
                      <li key={v._id || idx} style={{ marginBottom: '4px' }}>
                        Variation #{v.variationNumber} 
                        {v.offerReference && ` - ${v.offerReference}`}
                        {v.managementApproval?.status && (
                          <span className={`status-badge ${v.managementApproval.status === 'approved' ? 'approved' : v.managementApproval.status === 'rejected' ? 'rejected' : 'blue'}`} style={{ marginLeft: '8px' }}>
                            {v.managementApproval.status}
                          </span>
                        )}
                        <button 
                          className="link-btn" 
                          onClick={() => {
                            try {
                              localStorage.setItem('variationId', v._id)
                              window.location.href = '/variation-detail'
                            } catch {}
                          }}
                          style={{ marginLeft: '8px' }}
                        >
                          View
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
                To create a new variation, you should create it from an approved variation using the "Create Another Variation" button on the variation detail page.
              </p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => setVariationWarningModal({ open: false, existingVariations: [] })}>Understood</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showAttachmentsModal && project && (
        <div className="modal-overlay" onClick={() => {
          setShowAttachmentsModal(false)
          setProjectAttachmentsData({ leads: [], siteVisits: [], project: [], variations: [] })
        }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '95vw', width: '1200px' }}>
            <div className="modal-header">
              <h2>All Attachments - {project.name}</h2>
              <button onClick={() => {
                setShowAttachmentsModal(false)
                setProjectAttachmentsData({ leads: [], siteVisits: [], project: [], variations: [] })
              }} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ maxHeight: '80vh', overflow: 'auto' }}>
              {loadingAttachments ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>Loading attachments...</div>
              ) : (
                <>
                  {/* Lead Attachments */}
                  {projectAttachmentsData.leads.length > 0 && (
                    <div className="form-section" style={{ marginBottom: '30px' }}>
                      <div className="section-header">
                        <h3>Lead Attachments ({projectAttachmentsData.leads.length})</h3>
                      </div>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                        gap: '20px',
                        marginTop: '15px'
                      }}>
                        {projectAttachmentsData.leads.map((attachment, index) => {
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
                              key={`lead-${index}`}
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
                              onClick={() => {
                                if (isImage || isVideo) {
                                  window.open(fileUrl, '_blank')
                                }
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
                                  onClick={(e) => e.stopPropagation()}
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
                              <div style={{ fontSize: '12px', marginBottom: '4px', fontWeight: '500', color: '#333', wordBreak: 'break-word' }}>
                                {attachment.originalName.length > 25 
                                  ? attachment.originalName.substring(0, 25) + '...' 
                                  : attachment.originalName}
                              </div>
                              <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
                                {formatFileSize(attachment.size)}
                              </div>
                              <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>
                                Source: {attachment.sourceName}
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
                                  width: '100%',
                                  textAlign: 'center'
                                }}
                              >
                                {isImage ? 'View Full Size' : isVideo ? 'Play Video' : 'Download'}
                              </a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Site Visit Attachments */}
                  {projectAttachmentsData.siteVisits.length > 0 && (
                    <div className="form-section" style={{ marginBottom: '30px' }}>
                      <div className="section-header">
                        <h3>Site Visit Attachments ({projectAttachmentsData.siteVisits.length})</h3>
                      </div>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                        gap: '20px',
                        marginTop: '15px'
                      }}>
                        {projectAttachmentsData.siteVisits.map((attachment, index) => {
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
                              key={`sitevisit-${index}`}
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
                              onClick={() => {
                                if (isImage || isVideo) {
                                  window.open(fileUrl, '_blank')
                                }
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
                                  onClick={(e) => e.stopPropagation()}
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
                              <div style={{ fontSize: '12px', marginBottom: '4px', fontWeight: '500', color: '#333', wordBreak: 'break-word' }}>
                                {attachment.originalName.length > 25 
                                  ? attachment.originalName.substring(0, 25) + '...' 
                                  : attachment.originalName}
                              </div>
                              <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
                                {formatFileSize(attachment.size)}
                              </div>
                              <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>
                                Source: {attachment.sourceName}
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
                                  width: '100%',
                                  textAlign: 'center'
                                }}
                              >
                                {isImage ? 'View Full Size' : isVideo ? 'Play Video' : 'Download'}
                              </a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Project Attachments */}
                  {projectAttachmentsData.project.length > 0 && (
                    <div className="form-section" style={{ marginBottom: '30px' }}>
                      <div className="section-header">
                        <h3>Project Attachments ({projectAttachmentsData.project.length})</h3>
                      </div>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                        gap: '20px',
                        marginTop: '15px'
                      }}>
                        {projectAttachmentsData.project.map((attachment, index) => {
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
                              key={`project-${index}`}
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
                              onClick={() => {
                                if (isImage || isVideo) {
                                  window.open(fileUrl, '_blank')
                                }
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
                                  onClick={(e) => e.stopPropagation()}
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
                              <div style={{ fontSize: '12px', marginBottom: '4px', fontWeight: '500', color: '#333', wordBreak: 'break-word' }}>
                                {attachment.originalName.length > 25 
                                  ? attachment.originalName.substring(0, 25) + '...' 
                                  : attachment.originalName}
                              </div>
                              <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
                                {formatFileSize(attachment.size)}
                              </div>
                              <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>
                                Source: {attachment.sourceName}
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
                                  width: '100%',
                                  textAlign: 'center'
                                }}
                              >
                                {isImage ? 'View Full Size' : isVideo ? 'Play Video' : 'Download'}
                              </a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Variation Attachments */}
                  {projectAttachmentsData.variations.length > 0 && (
                    <div className="form-section" style={{ marginBottom: '30px' }}>
                      <div className="section-header">
                        <h3>Project Variation Attachments ({projectAttachmentsData.variations.length})</h3>
                      </div>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                        gap: '20px',
                        marginTop: '15px'
                      }}>
                        {projectAttachmentsData.variations.map((attachment, index) => {
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
                              key={`variation-${index}`}
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
                              onClick={() => {
                                if (isImage || isVideo) {
                                  window.open(fileUrl, '_blank')
                                }
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
                                  onClick={(e) => e.stopPropagation()}
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
                              <div style={{ fontSize: '12px', marginBottom: '4px', fontWeight: '500', color: '#333', wordBreak: 'break-word' }}>
                                {attachment.originalName.length > 25 
                                  ? attachment.originalName.substring(0, 25) + '...' 
                                  : attachment.originalName}
                              </div>
                              <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px' }}>
                                {formatFileSize(attachment.size)}
                              </div>
                              <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>
                                Source: {attachment.sourceName}
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
                                  width: '100%',
                                  textAlign: 'center'
                                }}
                              >
                                {isImage ? 'View Full Size' : isVideo ? 'Play Video' : 'Download'}
                              </a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* No attachments message */}
                  {projectAttachmentsData.leads.length === 0 && 
                   projectAttachmentsData.siteVisits.length === 0 && 
                   projectAttachmentsData.project.length === 0 && 
                   projectAttachmentsData.variations.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                      No attachments found for this project.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {variationModal.open && variationModal.form && project && (
        <div className="modal-overlay" onClick={() => {
          setVariationModal({ open: false, form: null })
          setVariationSelectedFiles([])
          setVariationPreviewFiles([])
        }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', width: '900px' }}>
            <div className="modal-header">
              <h2>Create Variation Quotation</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {variationModal.form && project?._id && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (project && project._id) {
                          const projectId = typeof project._id === 'object' ? project._id._id : project._id
                          window.open(`/projects/${projectId}/create-variation`, '_blank')
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
                        if (project && project._id) {
                          const projectId = typeof project._id === 'object' ? project._id._id : project._id
                          window.location.href = `/projects/${projectId}/create-variation`
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
                  setVariationModal({ open: false, form: null })
                  setVariationSelectedFiles([])
                  setVariationPreviewFiles([])
                }} className="close-btn">×</button>
              </div>
            </div>
            <div className="lead-form" style={{ maxHeight: '70vh', overflow: 'auto' }}>
              <div className="form-section">
                <div className="section-header">
                  <h3>Cover & Basic Details</h3>
                </div>
                <div className="form-group">
                  <label>Submitted To (Client Company)</label>
                  <input type="text" value={variationModal.form.submittedTo} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, submittedTo: e.target.value } })} />
                </div>
                <div className="form-group">
                  <label>Attention (Contact Person)</label>
                  <input type="text" value={variationModal.form.attention} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, attention: e.target.value } })} />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Offer Reference</label>
                    <input type="text" value={variationModal.form.offerReference} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, offerReference: e.target.value } })} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Enquiry Number</label>
                    <input type="text" value={variationModal.form.enquiryNumber} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, enquiryNumber: e.target.value } })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Offer Date</label>
                    <input type="date" value={variationModal.form.offerDate} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, offerDate: e.target.value } })} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Enquiry Date</label>
                    <input type="date" value={variationModal.form.enquiryDate} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, enquiryDate: e.target.value } })} />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Project Details</h3>
                </div>
                <div className="form-group">
                  <label>Project Title</label>
                  <input type="text" value={variationModal.form.projectTitle || ''} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, projectTitle: e.target.value } })} />
                </div>
                <div className="form-group">
                  <label>Introduction</label>
                  <textarea value={variationModal.form.introductionText || ''} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, introductionText: e.target.value } })} />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Scope of Work</h3>
                </div>
                <div className="form-group">
                  <ScopeOfWorkEditor
                    value={typeof variationModal.form.scopeOfWork === 'string' ? variationModal.form.scopeOfWork : (Array.isArray(variationModal.form.scopeOfWork) ? variationModal.form.scopeOfWork.map(item => item.description || '').join('<br>') : '')}
                    onChange={(value) => setVariationModal({ ...variationModal, form: { ...variationModal.form, scopeOfWork: value } })}
                  />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Price Schedule</h3>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Currency</label>
                    <input type="text" value={variationModal.form.priceSchedule.currency} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, priceSchedule: { ...variationModal.form.priceSchedule, currency: e.target.value } } })} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>VAT Rate (%)</label>
                    <input type="number" value={variationModal.form.priceSchedule.taxDetails.vatRate} onChange={e => {
                      const items = variationModal.form.priceSchedule.items
                      const sub = items.reduce((sum, it) => sum + Number(it.totalAmount || 0), 0)
                      const vat = sub * (Number(e.target.value || 0) / 100)
                      const grand = sub + vat
                      setVariationModal({ ...variationModal, form: { ...variationModal.form, priceSchedule: { ...variationModal.form.priceSchedule, subTotal: Number(sub.toFixed(2)), grandTotal: Number(grand.toFixed(2)), taxDetails: { ...variationModal.form.priceSchedule.taxDetails, vatRate: e.target.value, vatAmount: Number(vat.toFixed(2)) } } } })
                    }} />
                  </div>
                </div>
                {variationModal.form.priceSchedule.items.map((it, i) => (
                  <div key={i} className="item-card">
                    <div className="item-header">
                      <span>Item {i + 1}</span>
                      <button type="button" className="cancel-btn" onClick={() => {
                        const items = variationModal.form.priceSchedule.items.filter((_, idx) => idx !== i)
                        const sub = items.reduce((sum, it) => sum + Number(it.totalAmount || 0), 0)
                        const vat = sub * (Number(variationModal.form.priceSchedule.taxDetails.vatRate || 0) / 100)
                        const grand = sub + vat
                        setVariationModal({ ...variationModal, form: { ...variationModal.form, priceSchedule: { ...variationModal.form.priceSchedule, items, subTotal: Number(sub.toFixed(2)), grandTotal: Number(grand.toFixed(2)), taxDetails: { ...variationModal.form.priceSchedule.taxDetails, vatAmount: Number(vat.toFixed(2)) } } } })
                      }}>Remove</button>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 2 }}>
                        <label>Description</label>
                        <input type="text" value={it.description} onChange={e => {
                          const items = variationModal.form.priceSchedule.items.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x)
                          setVariationModal({ ...variationModal, form: { ...variationModal.form, priceSchedule: { ...variationModal.form.priceSchedule, items } } })
                        }} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Qty</label>
                        <input type="number" value={it.quantity} onChange={e => {
                          const items = variationModal.form.priceSchedule.items.map((x, idx) => idx === i ? { ...x, quantity: e.target.value, totalAmount: Number((Number(e.target.value || 0) * Number(x.unitRate || 0)).toFixed(2)) } : x)
                          const sub = items.reduce((sum, it) => sum + Number(it.totalAmount || 0), 0)
                          const vat = sub * (Number(variationModal.form.priceSchedule.taxDetails.vatRate || 0) / 100)
                          const grand = sub + vat
                          setVariationModal({ ...variationModal, form: { ...variationModal.form, priceSchedule: { ...variationModal.form.priceSchedule, items, subTotal: Number(sub.toFixed(2)), grandTotal: Number(grand.toFixed(2)), taxDetails: { ...variationModal.form.priceSchedule.taxDetails, vatAmount: Number(vat.toFixed(2)) } } } })
                        }} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Unit</label>
                        <input type="text" value={it.unit} onChange={e => {
                          const items = variationModal.form.priceSchedule.items.map((x, idx) => idx === i ? { ...x, unit: e.target.value } : x)
                          setVariationModal({ ...variationModal, form: { ...variationModal.form, priceSchedule: { ...variationModal.form.priceSchedule, items } } })
                        }} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Unit Rate</label>
                        <input type="number" value={it.unitRate} onChange={e => {
                          const items = variationModal.form.priceSchedule.items.map((x, idx) => idx === i ? { ...x, unitRate: e.target.value, totalAmount: Number((Number(x.quantity || 0) * Number(e.target.value || 0)).toFixed(2)) } : x)
                          const sub = items.reduce((sum, it) => sum + Number(it.totalAmount || 0), 0)
                          const vat = sub * (Number(variationModal.form.priceSchedule.taxDetails.vatRate || 0) / 100)
                          const grand = sub + vat
                          setVariationModal({ ...variationModal, form: { ...variationModal.form, priceSchedule: { ...variationModal.form.priceSchedule, items, subTotal: Number(sub.toFixed(2)), grandTotal: Number(grand.toFixed(2)), taxDetails: { ...variationModal.form.priceSchedule.taxDetails, vatAmount: Number(vat.toFixed(2)) } } } })
                        }} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Total</label>
                        <input type="number" readOnly value={Number(it.totalAmount || 0)} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="section-actions">
                  <button type="button" className="link-btn" onClick={() => setVariationModal({ ...variationModal, form: { ...variationModal.form, priceSchedule: { ...variationModal.form.priceSchedule, items: [...variationModal.form.priceSchedule.items, { description: '', quantity: 0, unit: '', unitRate: 0, totalAmount: 0 }] } } })}>+ Add Item</button>
                </div>
                <div className="form-row" style={{ marginTop: '16px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Sub Total</label>
                    <input type="number" readOnly value={Number(variationModal.form.priceSchedule.subTotal || 0)} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>VAT Amount</label>
                    <input type="number" readOnly value={Number(variationModal.form.priceSchedule.taxDetails.vatAmount || 0)} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Grand Total</label>
                    <input type="number" readOnly value={Number(variationModal.form.priceSchedule.grandTotal || 0)} />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Our Viewpoints / Special Terms</h3>
                </div>
                <div className="form-group">
                  <label>Our Viewpoints / Special Terms</label>
                  <textarea value={variationModal.form.ourViewpoints || ''} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, ourViewpoints: e.target.value } })} />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Exclusions</h3>
                </div>
                <div className="form-group">
                  <ScopeOfWorkEditor
                    value={typeof variationModal.form.exclusions === 'string' ? variationModal.form.exclusions : (Array.isArray(variationModal.form.exclusions) ? variationModal.form.exclusions.join('<br>') : '')}
                    onChange={(html) => setVariationModal({ ...variationModal, form: { ...variationModal.form, exclusions: html } })}
                  />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Payment Terms</h3>
                </div>
                <div className="form-group">
                  <ScopeOfWorkEditor
                    value={typeof variationModal.form.paymentTerms === 'string' ? variationModal.form.paymentTerms : (Array.isArray(variationModal.form.paymentTerms) ? variationModal.form.paymentTerms.map(term => `${term.milestoneDescription || ''}${term.amountPercent ? ` - ${term.amountPercent}%` : ''}`).join('<br>') : '')}
                    onChange={(html) => setVariationModal({ ...variationModal, form: { ...variationModal.form, paymentTerms: html } })}
                  />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Delivery, Completion, Warranty & Validity</h3>
                </div>
                <div className="form-group">
                  <label>Delivery / Completion Timeline</label>
                  <input type="text" value={variationModal.form.deliveryCompletionWarrantyValidity?.deliveryTimeline || ''} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, deliveryCompletionWarrantyValidity: { ...variationModal.form.deliveryCompletionWarrantyValidity, deliveryTimeline: e.target.value } } })} />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Warranty Period</label>
                    <input type="text" value={variationModal.form.deliveryCompletionWarrantyValidity?.warrantyPeriod || ''} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, deliveryCompletionWarrantyValidity: { ...variationModal.form.deliveryCompletionWarrantyValidity, warrantyPeriod: e.target.value } } })} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Offer Validity (Days)</label>
                    <input type="number" value={variationModal.form.deliveryCompletionWarrantyValidity?.offerValidity || 30} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, deliveryCompletionWarrantyValidity: { ...variationModal.form.deliveryCompletionWarrantyValidity, offerValidity: e.target.value } } })} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Authorized Signatory</label>
                  <input type="text" value={variationModal.form.deliveryCompletionWarrantyValidity?.authorizedSignatory || ''} onChange={e => setVariationModal({ ...variationModal, form: { ...variationModal.form, deliveryCompletionWarrantyValidity: { ...variationModal.form.deliveryCompletionWarrantyValidity, authorizedSignatory: e.target.value } } })} />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Attachments</h3>
                </div>
                <div className="form-group">
                  <label>Upload Files</label>
                  <input
                    type="file"
                    multiple
                    onChange={handleVariationFileChange}
                    style={{ marginBottom: '15px' }}
                  />
                  {variationPreviewFiles.length > 0 && (
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                      gap: '15px',
                      marginTop: '15px'
                    }}>
                      {variationPreviewFiles.map((preview, index) => (
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
                            onClick={() => removeVariationFile(index)}
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
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => {
                  setVariationModal({ open: false, form: null })
                  setVariationSelectedFiles([])
                  setVariationPreviewFiles([])
                }}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  onClick={createVariation}
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
      {deleteModal.open && (
        <div className="modal-overlay" onClick={() => setDeleteModal({ open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Project</h2>
              <button onClick={() => setDeleteModal({ open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to delete project "{project.name}"? This cannot be undone.</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setDeleteModal({ open: false })}>Cancel</button>
                <button 
                  type="button" 
                  className="reject-btn" 
                  onClick={async () => {
                    if (isSubmitting) return
                    setLoadingAction('delete-project')
                    setIsSubmitting(true)
                    try {
                      // Check if project has variations before deletion
                      if (variations && Array.isArray(variations) && variations.length > 0) {
                        setDeleteModal({ open: false })
                        setDeleteProjectWarningModal({ open: true, existingVariations: variations })
                        setIsSubmitting(false)
                        setLoadingAction(null)
                        return
                      }
                      
                      await api.delete(`/api/projects/${project._id}`)
                      setDeleteModal({ open: false })
                      setNotify({ open: true, title: 'Deleted', message: 'Project deleted successfully. Redirecting...' })
                      // Redirect to projects listing after short delay
                      setTimeout(() => {
                        window.location.href = '/projects'
                      }, 1500)
                    } catch (error) {
                      setDeleteModal({ open: false })
                      setNotify({ open: true, title: 'Delete Failed', message: error.response?.data?.message || 'We could not delete the project. Please try again.' })
                    } finally {
                      setIsSubmitting(false)
                      setLoadingAction(null)
                    }
                  }}
                  disabled={isSubmitting}
                >
                  <ButtonLoader loading={loadingAction === 'delete-project'}>
                    {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
                  </ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View All Attachments Modal */}
      {showAttachmentsModal && (
        <div className="modal-overlay" onClick={() => setShowAttachmentsModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '90%', width: '1200px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h2>All Attachments - {project.name}</h2>
              <button onClick={() => setShowAttachmentsModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ flex: 1, overflow: 'auto' }}>
              {loadingAttachments ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <Spinner />
                  <p>Loading attachments...</p>
                </div>
              ) : (
                <>
                  {/* Project Attachments */}
                  {projectAttachmentsData.project.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ marginBottom: '12px', color: 'var(--text)' }}>Project Attachments ({projectAttachmentsData.project.length})</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                        {projectAttachmentsData.project.map((att, idx) => {
                          const isImage = att.mimetype && att.mimetype.startsWith('image/')
                          const isVideo = att.mimetype && att.mimetype.startsWith('video/')
                          const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
                          const fileUrl = att.path.startsWith('http') ? att.path : `${apiBase}${att.path}`
                          
                          return (
                            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: 'var(--card)' }}>
                              {isImage && (
                                <img src={fileUrl} alt={att.originalName} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }} />
                              )}
                              {isVideo && (
                                <video src={fileUrl} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }} controls />
                              )}
                              {!isImage && !isVideo && (
                                <div style={{ width: '100%', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', borderRadius: '4px', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '48px' }}>📄</span>
                                </div>
                              )}
                              <div style={{ fontSize: '12px', wordBreak: 'break-word', marginBottom: '4px' }}>{att.originalName}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{att.sourceName}</div>
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--primary)', textDecoration: 'none', display: 'block', marginTop: '8px' }}>Open</a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Lead Attachments */}
                  {projectAttachmentsData.leads.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ marginBottom: '12px', color: 'var(--text)' }}>Lead Attachments ({projectAttachmentsData.leads.length})</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                        {projectAttachmentsData.leads.map((att, idx) => {
                          const isImage = att.mimetype && att.mimetype.startsWith('image/')
                          const isVideo = att.mimetype && att.mimetype.startsWith('video/')
                          const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
                          const fileUrl = att.path.startsWith('http') ? att.path : `${apiBase}${att.path}`
                          
                          return (
                            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: 'var(--card)' }}>
                              {isImage && (
                                <img src={fileUrl} alt={att.originalName} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }} />
                              )}
                              {isVideo && (
                                <video src={fileUrl} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }} controls />
                              )}
                              {!isImage && !isVideo && (
                                <div style={{ width: '100%', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', borderRadius: '4px', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '48px' }}>📄</span>
                                </div>
                              )}
                              <div style={{ fontSize: '12px', wordBreak: 'break-word', marginBottom: '4px' }}>{att.originalName}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{att.sourceName}</div>
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--primary)', textDecoration: 'none', display: 'block', marginTop: '8px' }}>Open</a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Site Visit Attachments */}
                  {projectAttachmentsData.siteVisits.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ marginBottom: '12px', color: 'var(--text)' }}>Site Visit Attachments ({projectAttachmentsData.siteVisits.length})</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                        {projectAttachmentsData.siteVisits.map((att, idx) => {
                          const isImage = att.mimetype && att.mimetype.startsWith('image/')
                          const isVideo = att.mimetype && att.mimetype.startsWith('video/')
                          const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
                          const fileUrl = att.path.startsWith('http') ? att.path : `${apiBase}${att.path}`
                          
                          return (
                            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: 'var(--card)' }}>
                              {isImage && (
                                <img src={fileUrl} alt={att.originalName} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }} />
                              )}
                              {isVideo && (
                                <video src={fileUrl} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }} controls />
                              )}
                              {!isImage && !isVideo && (
                                <div style={{ width: '100%', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', borderRadius: '4px', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '48px' }}>📄</span>
                                </div>
                              )}
                              <div style={{ fontSize: '12px', wordBreak: 'break-word', marginBottom: '4px' }}>{att.originalName}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{att.sourceName}</div>
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--primary)', textDecoration: 'none', display: 'block', marginTop: '8px' }}>Open</a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Variation Attachments */}
                  {projectAttachmentsData.variations.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ marginBottom: '12px', color: 'var(--text)' }}>Variation Attachments ({projectAttachmentsData.variations.length})</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                        {projectAttachmentsData.variations.map((att, idx) => {
                          const isImage = att.mimetype && att.mimetype.startsWith('image/')
                          const isVideo = att.mimetype && att.mimetype.startsWith('video/')
                          const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
                          const fileUrl = att.path.startsWith('http') ? att.path : `${apiBase}${att.path}`
                          
                          return (
                            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: 'var(--card)' }}>
                              {isImage && (
                                <img src={fileUrl} alt={att.originalName} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }} />
                              )}
                              {isVideo && (
                                <video src={fileUrl} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px', marginBottom: '8px' }} controls />
                              )}
                              {!isImage && !isVideo && (
                                <div style={{ width: '100%', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', borderRadius: '4px', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '48px' }}>📄</span>
                                </div>
                              )}
                              <div style={{ fontSize: '12px', wordBreak: 'break-word', marginBottom: '4px' }}>{att.originalName}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{att.sourceName}</div>
                              <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--primary)', textDecoration: 'none', display: 'block', marginTop: '8px' }}>Open</a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {projectAttachmentsData.project.length === 0 && 
                   projectAttachmentsData.leads.length === 0 && 
                   projectAttachmentsData.siteVisits.length === 0 && 
                   projectAttachmentsData.variations.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      <p>No attachments found for this project.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Print Preview Modal */}
      {printPreviewModal.open && printPreviewModal.pdfUrl && (
        <div className="modal-overlay" onClick={() => setPrintPreviewModal({ open: false, pdfUrl: null })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001, maxWidth: '95%', width: '100%', height: '95vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
              <h2>PDF Preview - {project?.name || 'Project'}</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="save-btn" 
                  onClick={async () => {
                    try {
                      await exportProjectPDF()
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
                            <title>${project?.name || 'Project'} - PDF</title>
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

      {/* Material Request Modal */}
      {materialRequestModal.open && (
        <div className="modal-overlay" onClick={() => setMaterialRequestModal({ ...materialRequestModal, open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>{materialRequestModal.requestType === 'return' ? '🔄 Request Material Return' : '📦 Create Material Request'}</h2>
              <button onClick={() => setMaterialRequestModal({ ...materialRequestModal, open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div className="form-group">
                <label>Priority</label>
                <select 
                  value={materialRequestModal.form.priority}
                  onChange={e => setMaterialRequestModal({ ...materialRequestModal, form: { ...materialRequestModal.form, priority: e.target.value }})}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Required Date</label>
                  <input 
                    type="date" 
                    value={materialRequestModal.form.requiredDate}
                    onChange={e => setMaterialRequestModal({ ...materialRequestModal, form: { ...materialRequestModal.form, requiredDate: e.target.value }})}
                  />
                </div>
                <div className="form-group">
                  <label>Contact Phone</label>
                  <input 
                    type="text" 
                    value={materialRequestModal.form.requesterPhone}
                    onChange={e => setMaterialRequestModal({ ...materialRequestModal, form: { ...materialRequestModal.form, requesterPhone: e.target.value }})}
                    placeholder="e.g., +971-50-123-4567"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Purpose</label>
                <input 
                  type="text" 
                  value={materialRequestModal.form.purpose}
                  onChange={e => setMaterialRequestModal({ ...materialRequestModal, form: { ...materialRequestModal.form, purpose: e.target.value }})}
                  placeholder="e.g., Phase 2 construction materials"
                />
              </div>

              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontWeight: '600', color: 'var(--text)' }}>Materials *</label>
                  <button 
                    type="button" 
                    className="link-btn" 
                    onClick={() => setMaterialRequestModal({ 
                      ...materialRequestModal, 
                      form: { 
                        ...materialRequestModal.form, 
                        items: [...materialRequestModal.form.items, { materialId: '', materialName: '', sku: '', quantity: 1, uom: 'Pcs', notes: '' }] 
                      }
                    })}
                  >
                    + Add Item
                  </button>
                </div>
                
                {materialRequestModal.form.items.map((item, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '8px', marginBottom: '8px', alignItems: 'end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      {index === 0 && <label style={{ fontSize: '11px' }}>Material *</label>}
                      <select
                        value={item.materialId}
                        onChange={e => {
                          const selectedMat = inventoryMaterials.find(m => m._id === e.target.value)
                          const newItems = [...materialRequestModal.form.items]
                          if (selectedMat) {
                            newItems[index].materialId = selectedMat._id
                            newItems[index].materialName = selectedMat.name
                            newItems[index].sku = selectedMat.sku || ''
                            newItems[index].uom = selectedMat.uom || 'Pcs'
                          } else {
                            newItems[index].materialId = ''
                            newItems[index].materialName = ''
                            newItems[index].sku = ''
                          }
                          setMaterialRequestModal({ ...materialRequestModal, form: { ...materialRequestModal.form, items: newItems }})
                        }}
                        style={{ width: '100%' }}
                      >
                        <option value="">-- Select Material --</option>
                        {inventoryMaterials.map(mat => (
                          <option key={mat._id} value={mat._id}>
                            {mat.name} {mat.sku ? `(${mat.sku})` : ''} - {mat.storeId?.name || 'Unknown Store'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      {index === 0 && <label style={{ fontSize: '11px' }}>Qty *</label>}
                      <input 
                        type="number" 
                        min="1"
                        value={item.quantity}
                        onChange={e => {
                          const newItems = [...materialRequestModal.form.items]
                          newItems[index].quantity = parseInt(e.target.value) || 1
                          setMaterialRequestModal({ ...materialRequestModal, form: { ...materialRequestModal.form, items: newItems }})
                        }}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      {index === 0 && <label style={{ fontSize: '11px' }}>UOM</label>}
                      <select 
                        value={item.uom}
                        onChange={e => {
                          const newItems = [...materialRequestModal.form.items]
                          newItems[index].uom = e.target.value
                          setMaterialRequestModal({ ...materialRequestModal, form: { ...materialRequestModal.form, items: newItems }})
                        }}
                      >
                        <option value="Pcs">Pcs</option>
                        <option value="Mtrs">Mtrs</option>
                        <option value="Kg">Kg</option>
                        <option value="Sets">Sets</option>
                        <option value="Boxes">Boxes</option>
                        <option value="Ltrs">Ltrs</option>
                        <option value="Rolls">Rolls</option>
                        <option value="Bags">Bags</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      {index === 0 && <label style={{ fontSize: '11px' }}>Notes</label>}
                      <input 
                        type="text" 
                        value={item.notes}
                        onChange={e => {
                          const newItems = [...materialRequestModal.form.items]
                          newItems[index].notes = e.target.value
                          setMaterialRequestModal({ ...materialRequestModal, form: { ...materialRequestModal.form, items: newItems }})
                        }}
                        placeholder="Optional"
                      />
                    </div>
                    {materialRequestModal.form.items.length > 1 && (
                      <button 
                        type="button" 
                        className="cancel-btn" 
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        onClick={() => {
                          const newItems = materialRequestModal.form.items.filter((_, i) => i !== index)
                          setMaterialRequestModal({ ...materialRequestModal, form: { ...materialRequestModal.form, items: newItems }})
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label>Additional Notes</label>
                <textarea 
                  value={materialRequestModal.form.notes}
                  onChange={e => setMaterialRequestModal({ ...materialRequestModal, form: { ...materialRequestModal.form, notes: e.target.value }})}
                  placeholder="Any additional notes for the inventory team..."
                  rows={3}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setMaterialRequestModal({ ...materialRequestModal, open: false })}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  disabled={isSubmitting}
                  style={{ background: '#6366f1' }}
                  onClick={async () => {
                    // Validate
                    const validItems = materialRequestModal.form.items.filter(item => item.materialId)
                    if (validItems.length === 0) {
                      setNotify({ open: true, title: 'Validation Error', message: 'Please add at least one material.' })
                      return
                    }

                    setIsSubmitting(true)
                    try {
                      await api.post('/api/material-requests', {
                        projectId: project._id,
                        items: validItems,
                        priority: materialRequestModal.form.priority,
                        requiredDate: materialRequestModal.form.requiredDate || null,
                        purpose: materialRequestModal.form.purpose,
                        notes: materialRequestModal.form.notes,
                        requesterPhone: materialRequestModal.form.requesterPhone,
                        requestType: materialRequestModal.requestType || 'request'
                      })
                      const successMsg = materialRequestModal.requestType === 'return' 
                        ? 'Material return request created successfully.' 
                        : 'Material request created successfully.'
                      setNotify({ open: true, title: 'Success', message: successMsg })
                      setMaterialRequestModal({ ...materialRequestModal, open: false })
                      // Refresh material requests
                      const resMR = await api.get(`/api/material-requests/project/${project._id}`)
                      setMaterialRequests(Array.isArray(resMR.data) ? resMR.data : [])
                    } catch (error) {
                      setNotify({ open: true, title: 'Error', message: error.response?.data?.message || 'Failed to create material request.' })
                    } finally {
                      setIsSubmitting(false)
                    }
                  }}
                >
                  <ButtonLoader loading={isSubmitting}>{isSubmitting ? 'Submitting...' : (materialRequestModal.requestType === 'return' ? 'Submit Return Request' : 'Submit Request')}</ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Remaining Material Return Modal */}
      {returnModal.open && (
        <div className="modal-overlay" onClick={() => setReturnModal({ open: false, items: [], notes: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>📦 Remaining Material Return</h2>
              <button onClick={() => setReturnModal({ open: false, items: [], notes: '' })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '14px' }}>
                Select materials to return to inventory. Only materials currently assigned to this project are shown.
              </p>
              
              <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>Material</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>In Project</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Return Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnModal.items.length === 0 ? (
                      <tr>
                        <td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No materials found in project stock.
                        </td>
                      </tr>
                    ) : (
                      returnModal.items.map((item, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px' }}>
                            <div style={{ fontWeight: '500', color: 'var(--text)' }}>{item.materialName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.sku} • {item.uom}</div>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{ fontWeight: '600', color: 'var(--primary)' }}>{item.inProjectQty}</span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <input
                              type="number"
                              min="0"
                              max={item.inProjectQty}
                              value={item.returnQty}
                              onChange={e => {
                                const newItems = [...returnModal.items]
                                let val = parseInt(e.target.value) || 0
                                if (val < 0) val = 0
                                if (val > item.inProjectQty) val = item.inProjectQty
                                newItems[index].returnQty = val
                                setReturnModal({ ...returnModal, items: newItems })
                              }}
                              style={{ 
                                width: '80px', 
                                textAlign: 'center', 
                                padding: '6px',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                background: 'var(--input)',
                                color: 'var(--text)'
                              }}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={returnModal.notes}
                  onChange={e => setReturnModal({ ...returnModal, notes: e.target.value })}
                  placeholder="Reason for return..."
                  rows="3"
                />
              </div>

              <div className="form-actions">
                <button className="cancel-btn" onClick={() => setReturnModal({ open: false, items: [], notes: '' })}>Cancel</button>
                <button className="save-btn" onClick={handleSubmitReturn}>Submit Return</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectDetail


