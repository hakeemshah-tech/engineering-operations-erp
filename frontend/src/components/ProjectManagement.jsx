import { useState, useEffect, useMemo, useRef } from 'react'
import { api } from '../lib/api'
import './ProjectManagement.css'
import './LoadingComponents.css'
import { Spinner, SkeletonCard, SkeletonTableRow, ButtonLoader, PageSkeleton, DotsLoader } from './LoadingComponents'

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

function ProjectManagement() {
  const [projects, setProjects] = useState([])
  const [siteEngineers, setSiteEngineers] = useState([])
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [showVisitModal, setShowVisitModal] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [assignData, setAssignData] = useState({ siteEngineerId: '' })
  const [deleteModal, setDeleteModal] = useState({ open: false, project: null })
  const [revisionData, setRevisionData] = useState({
    type: 'price',
    description: ''
  })
  const [editProjectModal, setEditProjectModal] = useState({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })
  const [visitData, setVisitData] = useState({
    visitAt: '',
    siteLocation: '',
    engineerName: '',
    workProgressSummary: '',
    safetyObservations: '',
    qualityMaterialCheck: '',
    issuesFound: '',
    actionItems: '',
    weatherConditions: '',
    description: ''
  })
  const [visitFiles, setVisitFiles] = useState([])
  const [visitPreviewFiles, setVisitPreviewFiles] = useState([])
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [projectEngineers, setProjectEngineers] = useState([])
  const [profileUser, setProfileUser] = useState(null)
  const [historyOpen, setHistoryOpen] = useState({})
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem('projectViewMode')
    return saved === 'table' ? 'table' : 'card' // default to 'card' if not set
  })
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [revisions, setRevisions] = useState([])
  const [selectedRevisionFilter, setSelectedRevisionFilter] = useState('')
  const [variationModal, setVariationModal] = useState({ open: false, project: null, form: null })
  const [allVariations, setAllVariations] = useState([])
  const [variationWarningModal, setVariationWarningModal] = useState({ open: false, project: null, existingVariations: [] })
  const [editProjectWarningModal, setEditProjectWarningModal] = useState({ open: false, project: null, existingVariations: [] })
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewFiles, setPreviewFiles] = useState([])
  const [attachmentsToRemove, setAttachmentsToRemove] = useState([])
  const [variationSelectedFiles, setVariationSelectedFiles] = useState([])
  const [variationPreviewFiles, setVariationPreviewFiles] = useState([])
  const [printPreviewModal, setPrintPreviewModal] = useState({ open: false, pdfUrl: null, project: null })
  const [expandedVariationRows, setExpandedVariationRows] = useState({}) // Track which rows have expanded variations
  const [projectVariationsMap, setProjectVariationsMap] = useState({}) // Store variations per project ID
  const [variationsForProject, setVariationsForProject] = useState([])
  const [selectedProjectForList, setSelectedProjectForList] = useState(null)
  const [showVariationsListModal, setShowVariationsListModal] = useState(false)
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false)
  const [selectedProjectForAttachments, setSelectedProjectForAttachments] = useState(null)
  const [projectAttachmentsData, setProjectAttachmentsData] = useState({ leads: [], siteVisits: [], project: [], variations: [] })
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  // Filter states
  const [nameFilter, setNameFilter] = useState('')
  const [dateModifiedFilter, setDateModifiedFilter] = useState('')
  const [dateCreatedFilter, setDateCreatedFilter] = useState('')
  // Site Location filter - matches `project.siteLocationId._id`. Options
  // are fetched once from /api/locations.
  const [siteLocationFilter, setSiteLocationFilter] = useState('all')
  const [siteLocationOptions, setSiteLocationOptions] = useState([])
  // Sort states
  const [sortField, setSortField] = useState('dateCreated') // 'name', 'dateModified', 'dateCreated'
  const [sortDirection, setSortDirection] = useState('desc') // 'asc', 'desc'
  // Debounced filter values for performance
  const [debouncedNameFilter, setDebouncedNameFilter] = useState('')
  const [debouncedDateModifiedFilter, setDebouncedDateModifiedFilter] = useState('')
  const [debouncedDateCreatedFilter, setDebouncedDateCreatedFilter] = useState('')
  const [isFiltering, setIsFiltering] = useState(false) // Track filter operations
  const [filtersExpanded, setFiltersExpanded] = useState(false) // Mobile: collapsible filters
  const [isMobile, setIsMobile] = useState(false) // Track mobile viewport
  const [headerHeight, setHeaderHeight] = useState(80) // Header height for sticky positioning
  const headerRef = useRef(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [loadingAction, setLoadingAction] = useState(null)
  
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
      if (value.length === 0) return '(empty)'
      
      if (field === 'assignedProjectEngineer') {
        // Map ObjectIds to engineer names
        const names = value.map(id => {
          const engineer = projectEngineers.find(u => String(u._id) === String(id))
          return engineer ? engineer.name : (typeof id === 'object' && id?.name ? id.name : String(id))
        }).filter(name => name)
        return names.length > 0 ? names.join(', ') : '(empty)'
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
  
  const defaultCompany = useMemo(() => ({
    logo: null,
    name: 'Engineering Operations ERP',
    address: 'Dubai, UAE',
    phone: '+971-00-000-0000',
    email: 'info@example.com'
  }), [])

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

  // Helper function to build PDF content (shared between preview and export)
  const buildProjectPDFContent = async (project) => {
    try {
      await ensurePdfMake()
      const token = localStorage.getItem('token')
      // Fetch all related data
      let siteVisits = []
      let quotation = null
      let allRevisions = []
      let leadFull = null
      try {
        const resVisits = await api.get(`/api/site-visits/project/${project._id}`)
        siteVisits = Array.isArray(resVisits.data) ? resVisits.data : []
      } catch {}
      try {
        const leadId = typeof project.leadId === 'object' ? project.leadId?._id : project.leadId
        if (leadId) {
          const leadRes = await api.get(`/api/leads/${leadId}`)
          leadFull = leadRes.data
        }
      } catch {}
      try {
        if (project.sourceQuotation?._id) {
          const qRes = await api.get(`/api/quotations/${project.sourceQuotation._id}`)
          quotation = qRes.data
        }
      } catch {}
      try {
        if (project.sourceRevision?.parentQuotation) {
          const revRes = await api.get(`/api/revisions?parentQuotation=${project.sourceRevision.parentQuotation}`)
          allRevisions = Array.isArray(revRes.data) ? revRes.data : []
        }
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
        ['Project Engineer', Array.isArray(project.assignedProjectEngineer) && project.assignedProjectEngineer.length > 0 
          ? project.assignedProjectEngineer.map(e => e.name || 'Unknown').join(', ')
          : 'Not Assigned'],
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
      if (leadFull) {
        const leadRows = [
          ['Customer Name', leadFull.customerName || ''],
          ['Project Title', leadFull.projectTitle || ''],
          ['Enquiry Number', leadFull.enquiryNumber || ''],
          ['Enquiry Date', leadFull.enquiryDate ? new Date(leadFull.enquiryDate).toLocaleDateString() : ''],
          ['Submission Due Date', leadFull.submissionDueDate ? new Date(leadFull.submissionDueDate).toLocaleDateString() : ''],
          ['Scope Summary', leadFull.scopeSummary || ''],
          ['Name', leadFull.name || ''],
          ['Budget', leadFull.budget ? `${leadFull.budget}` : ''],
          ['Location Details', leadFull.locationDetails || ''],
          ['Working Hours', leadFull.workingHours || ''],
          ['Manpower Count', String(leadFull.manpowerCount || '')],
          ['Status', leadFull.status || ''],
          ['Created At', leadFull.createdAt ? new Date(leadFull.createdAt).toLocaleString() : ''],
          ['Created By', leadFull.createdBy?.name || 'N/A']
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
      if (Array.isArray(allRevisions) && allRevisions.length > 0) {
        const sortedRevs = allRevisions.sort((a, b) => (a.revisionNumber || 0) - (b.revisionNumber || 0))
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

  const generatePDFPreview = async (project) => {
    try {
      await ensurePdfMake()
      const docDefinition = await buildProjectPDFContent(project)
      const pdfDoc = window.pdfMake.createPdf(docDefinition)
      pdfDoc.getDataUrl((dataUrl) => {
        setPrintPreviewModal({ open: true, pdfUrl: dataUrl, project })
      })
    } catch (e) {
      setNotify({ open: true, title: 'Preview Failed', message: 'We could not generate the PDF preview. Please try again.' })
    }
  }

  const exportProjectPDF = async (project) => {
    try {
      await ensurePdfMake()
      const docDefinition = await buildProjectPDFContent(project)
      const filename = `Project_${project.name.replace(/\s+/g,'_')}.pdf`
      window.pdfMake.createPdf(docDefinition).download(filename)
    } catch (e) {
      setNotify({ open: true, title: 'Export Failed', message: 'We could not generate the PDF for this project. Please try again.' })
    }
  }

  // Detect mobile viewport and measure header height
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      // Auto-expand filters on desktop
      if (window.innerWidth >= 768) {
        setFiltersExpanded(true)
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Measure header height for sticky positioning
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight)
      }
    }
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      updateHeaderHeight()
    })
    window.addEventListener('resize', updateHeaderHeight)
    return () => window.removeEventListener('resize', updateHeaderHeight)
  }, [])

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user'))
    setCurrentUser(userData)
    const loadData = async () => {
      setIsLoading(true)
      await Promise.all([
        fetchProjects(false),
        fetchSiteEngineers(),
        fetchRevisions(),
        fetchAllVariations()
      ])
      setIsLoading(false)
    }
    void loadData()
    ;(async () => {
      try {
        const token = localStorage.getItem('token')
        const resEng = await api.get('/api/projects/project-engineers')
        setProjectEngineers(Array.isArray(resEng.data) ? resEng.data : [])
      } catch {}
    })()
    // Load location options for the Site Location filter
    ;(async () => {
      try {
        const r = await api.get('/api/locations', { params: { status: 'active' } })
        const list = Array.isArray(r.data) ? r.data : (r.data?.items || [])
        setSiteLocationOptions(list)
      } catch { setSiteLocationOptions([]) }
    })()
  }, [])

  const fetchAllVariations = async () => {
    try {
      const res = await api.get('/api/project-variations')
      setAllVariations(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error('Error fetching variations:', err)
      setAllVariations([])
    }
  }

  const fetchRevisions = async () => {
    try {
      const res = await api.get('/api/revisions')
      // Filter to only approved revisions that have projects
      const allRevisions = Array.isArray(res.data) ? res.data : []
      // Get revisions that have projects
      const revisionsWithProjects = []
      for (const rev of allRevisions) {
        try {
          await api.get(`/api/projects/by-revision/${rev._id}`)
          revisionsWithProjects.push(rev)
        } catch {
          // No project for this revision
        }
      }
      setRevisions(revisionsWithProjects)
    } catch {}
  }

  // Persist view mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('projectViewMode', viewMode)
  }, [viewMode])

  // Adjust itemsPerPage when switching views to ensure grid-friendly values for card view
  useEffect(() => {
    if (viewMode === 'card' && ![6, 9, 12, 15, 18, 21, 24].includes(itemsPerPage)) {
      // Find the nearest card-friendly value (multiple of 3)
      const cardValues = [6, 9, 12, 15, 18, 21, 24]
      const nearest = cardValues.reduce((prev, curr) => 
        Math.abs(curr - itemsPerPage) < Math.abs(prev - itemsPerPage) ? curr : prev
      )
      setItemsPerPage(nearest)
    } else if (viewMode === 'table' && ![5, 10, 20, 50].includes(itemsPerPage)) {
      // Find the nearest table-friendly value
      const tableValues = [5, 10, 20, 50]
      const nearest = tableValues.reduce((prev, curr) => 
        Math.abs(curr - itemsPerPage) < Math.abs(prev - itemsPerPage) ? curr : prev
      )
      setItemsPerPage(nearest)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]) // Only run when viewMode changes, not when itemsPerPage changes

  const fetchProjects = async (showLoading = false) => {
    if (showLoading) setIsLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await api.get('/api/projects')
      setProjects(response.data)
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }

  const fetchSiteEngineers = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await api.get('/api/users')
      const engineers = response.data.filter(user => user.roles?.includes('site_engineer'))
      setSiteEngineers(engineers)
    } catch (error) {
      console.error('Error fetching site engineers:', error)
    }
  }

  const assignSiteEngineer = async (e) => {
    e.preventDefault()
    setLoadingAction('assign-engineer')
    setIsSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      await api.patch(`/api/projects/${selectedProject._id}/assign-engineer`, assignData)
      await fetchProjects()
      setShowAssignModal(false)
      setAssignData({ siteEngineerId: '' })
      setNotify({ open: true, title: 'Success', message: 'Site engineer assigned successfully.' })
    } catch (error) {
      setNotify({ open: true, title: 'Assign Failed', message: error.response?.data?.message || 'We could not assign the engineer. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  const createRevision = async (e) => {
    e.preventDefault()
    setLoadingAction('create-revision')
    setIsSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      await api.post(`/api/projects/${selectedProject._id}/revisions`, revisionData)
      await fetchProjects()
      setShowRevisionModal(false)
      setRevisionData({ type: 'price', description: '' })
      setNotify({ open: true, title: 'Success', message: 'Revision created successfully.' })
    } catch (error) {
      setNotify({ open: true, title: 'Create Failed', message: error.response?.data?.message || 'We could not create the revision. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  const approveRevision = async (projectId, revisionId, status) => {
    setLoadingAction(`approve-revision-${revisionId}`)
    setIsSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      await api.patch(`/api/projects/${projectId}/revisions/${revisionId}/approve`, {
        status, comments: ''
      })
      await fetchProjects()
      setNotify({ open: true, title: 'Success', message: `Revision ${status === 'approved' ? 'approved' : 'rejected'} successfully.` })
    } catch (error) {
      setNotify({ open: true, title: 'Process Failed', message: error.response?.data?.message || 'We could not process the revision. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  const canAssignEngineer = () => {
    return currentUser?.roles?.some(role => ['admin', 'manager', 'supervisor'].includes(role))
  }

  const canCreateRevision = () => {
    return currentUser?.roles?.some(role => ['admin', 'manager'].includes(role))
  }

  const canCreateSiteVisit = () => {
    return currentUser?.roles?.includes('project_engineer')
  }

  const canCreateVariation = () => {
    return currentUser?.roles?.some(role => ['admin', 'manager', 'estimation_engineer'].includes(role))
  }

  const createVariation = async () => {
    if (isSubmitting) return
    setLoadingAction('create-variation')
    setIsSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      const payload = { ...variationModal.form }
      const project = variationModal.project
      
      // Send HTML strings directly - backend will handle conversion if needed
      // No conversion needed as backend expects HTML strings for rich text fields
      
      // Get source data from project's source revision or quotation
      let sourceData = null
      if (project.sourceRevision) {
        try {
          const revRes = await api.get(`/api/revisions/${typeof project.sourceRevision === 'object' ? project.sourceRevision._id : project.sourceRevision}`)
          sourceData = revRes.data
        } catch {}
      } else if (project.sourceQuotation) {
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
      setVariationModal({ open: false, project: null, form: null })
      setVariationSelectedFiles([])
      setVariationPreviewFiles([])
      await fetchProjects()
      await fetchAllVariations()
    } catch (e) {
      setNotify({ open: true, title: 'Create Failed', message: e.response?.data?.message || 'We could not create the variation. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      active: 'green',
      completed: 'blue',
      on_hold: 'orange'
    }
    return colors[status] || 'gray'
  }

  // Debounce name filter (300ms delay)
  useEffect(() => {
    setIsFiltering(true)
    const timer = setTimeout(() => {
      setDebouncedNameFilter(nameFilter)
      setIsFiltering(false)
    }, 300)
    return () => {
      clearTimeout(timer)
      setIsFiltering(false)
    }
  }, [nameFilter])

  // Date filters don't need debouncing (they're date inputs)
  useEffect(() => {
    setDebouncedDateModifiedFilter(dateModifiedFilter)
  }, [dateModifiedFilter])

  useEffect(() => {
    setDebouncedDateCreatedFilter(dateCreatedFilter)
  }, [dateCreatedFilter])

  // Filter projects based on search, revision, and new filters
  const filteredProjects = projects.filter(project => {
    // Apply revision filter
    if (selectedRevisionFilter) {
      const projectRevisionId = typeof project.sourceRevision === 'object' ? project.sourceRevision?._id : project.sourceRevision
      if (projectRevisionId !== selectedRevisionFilter) return false
    }
    
    // Apply search filter
    if (search.trim()) {
      const term = search.toLowerCase()
      const matches = (
        (project.name || '').toLowerCase().includes(term) ||
        (project.locationDetails || '').toLowerCase().includes(term) ||
        (project.leadId?.customerName || '').toLowerCase().includes(term) ||
        (project.leadId?.projectTitle || '').toLowerCase().includes(term) ||
        (project.assignedSiteEngineer?.name || '').toLowerCase().includes(term) ||
        (Array.isArray(project.assignedProjectEngineer) && project.assignedProjectEngineer.length > 0
          ? project.assignedProjectEngineer.some(e => (e.name || '').toLowerCase().includes(term))
          : false)
      )
      if (!matches) return false
    }
    
    // Apply name filter - using debounced value
    if (debouncedNameFilter.trim()) {
      const term = debouncedNameFilter.toLowerCase()
      const projectName = (project.name || '').toLowerCase()
      if (!projectName.includes(term)) return false
    }

    // Apply Site Location filter - matches project.siteLocationId (object or id).
    if (siteLocationFilter !== 'all') {
      const projSiteId = typeof project.siteLocationId === 'object'
        ? project.siteLocationId?._id
        : project.siteLocationId
      if (String(projSiteId || '') !== String(siteLocationFilter)) return false
    }
    
    // Apply date modified filter - using debounced value
    if (debouncedDateModifiedFilter) {
      const filterDate = new Date(debouncedDateModifiedFilter)
      filterDate.setHours(0, 0, 0, 0)
      const projectDate = project.updatedAt ? new Date(project.updatedAt) : null
      if (!projectDate || projectDate.toDateString() !== filterDate.toDateString()) return false
    }
    
    // Apply date created filter - using debounced value
    if (debouncedDateCreatedFilter) {
      const filterDate = new Date(debouncedDateCreatedFilter)
      filterDate.setHours(0, 0, 0, 0)
      const projectDate = project.createdAt ? new Date(project.createdAt) : null
      if (!projectDate || projectDate.toDateString() !== filterDate.toDateString()) return false
    }
    
    return true
  })

  // Sort projects by selected field and direction
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    let compareResult = 0
    switch (sortField) {
      case 'name':
        const aName = (a.name || '').toLowerCase()
        const bName = (b.name || '').toLowerCase()
        compareResult = aName.localeCompare(bName)
        break
      case 'dateModified':
        const aModified = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const bModified = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        compareResult = aModified > bModified ? 1 : aModified < bModified ? -1 : 0
        break
      case 'dateCreated':
      default:
        const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0
        compareResult = aCreated > bCreated ? 1 : aCreated < bCreated ? -1 : 0
        break
    }
    return sortDirection === 'asc' ? compareResult : -compareResult
  })
  const totalProjects = projects.length
  const displayedProjects = sortedProjects.length

  // Pagination calculations
  const totalPages = Math.ceil(sortedProjects.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedProjects = sortedProjects.slice(startIndex, endIndex)

  // Reset to page 1 when filters or sorting change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, selectedRevisionFilter, debouncedNameFilter, debouncedDateModifiedFilter, debouncedDateCreatedFilter, sortField, sortDirection])

  // Handler for View Variations in table view (accordion)
  const handleViewVariationsTable = async (project) => {
    const projectId = project._id
    const isExpanded = expandedVariationRows[projectId]
    
    if (isExpanded) {
      // Collapse: remove from expanded rows
      setExpandedVariationRows(prev => {
        const next = { ...prev }
        delete next[projectId]
        return next
      })
    } else {
      // Expand: fetch variations if not already loaded
      if (!projectVariationsMap[projectId]) {
        try {
          const res = await api.get(`/api/project-variations?parentProject=${projectId}`)
          const list = Array.isArray(res.data) ? res.data : []
          setProjectVariationsMap(prev => ({ ...prev, [projectId]: list }))
        } catch (e) {
          setNotify({ open: true, title: 'Load Failed', message: 'We could not load the variations. Please try again.' })
          return
        }
      }
      setExpandedVariationRows(prev => ({ ...prev, [projectId]: true }))
    }
  }

  // Helper function to render project actions
  const renderProjectActions = (project, isTableView = false) => (
    <div className="project-actions">


      <button className="assign-btn" onClick={() => { try { localStorage.setItem('projectId', project._id); localStorage.setItem('projectsFocusId', project._id) } catch {}; window.location.href = '/project-detail' }}>View Details</button>
      <button
        className="link-btn"
        onClick={async () => {
          if (isTableView) {
            // Table view: use accordion
            handleViewVariationsTable(project)
          } else {
            // Card view: use modal
            try {
              const projectId = typeof project._id === 'object' ? project._id._id : project._id
              const res = await api.get(`/api/project-variations?parentProject=${projectId}`)
              const list = Array.isArray(res.data) ? res.data : []
              if (list.length === 0) {
                setNotify({ open: true, title: 'No Variations', message: 'No variations found for this project.' })
                return
              }
              setVariationsForProject(list)
              setSelectedProjectForList(project)
              setShowVariationsListModal(true)
            } catch (e) {
              setNotify({ open: true, title: 'Open Failed', message: 'We could not load the variations. Please try again.' })
            }
          }
        }}
      >
        View Variations
      </button>


      {canCreateSiteVisit() && (
        <button onClick={() => {
          setSelectedProject(project)
          setShowVisitModal(true)
        }} className="assign-btn">
          New Site Visit
        </button>
      )}
      {(currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin')) && (
        <button className="reject-btn" onClick={() => setDeleteModal({ open: true, project })}>Delete Project</button>
      )}
    </div>
  )

  return (
    <div className="project-management">
      <div className="header" ref={headerRef}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1>Project Management</h1>
          <span style={{ 
            padding: '4px 12px', 
            borderRadius: '12px', 
            background: 'var(--bg)', 
            color: 'var(--text-muted)', 
            fontSize: '14px', 
            fontWeight: 600,
            border: '1px solid var(--border)'
          }}>
            {(search || selectedRevisionFilter || nameFilter || dateModifiedFilter || dateCreatedFilter) ? `${displayedProjects} of ${totalProjects}` : totalProjects} {totalProjects === 1 ? 'Project' : 'Projects'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={selectedRevisionFilter}
            onChange={(e) => setSelectedRevisionFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: '14px',
              cursor: 'pointer',
              minWidth: '200px'
            }}
          >
            <option value="">All Revisions</option>
            {revisions.map(rev => (
              <option key={rev._id} value={rev._id}>
                Revision #{rev.revisionNumber} - {rev.projectTitle || rev.lead?.projectTitle || rev.offerReference || 'N/A'}
              </option>
            ))}
          </select>
          <input 
            placeholder="Search..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: '14px',
              minWidth: '200px'
            }}
          />
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '8px', padding: '2px' }}>
            <button
              onClick={() => setViewMode('card')}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '6px',
                background: viewMode === 'card' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'card' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              Card
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '6px',
                background: viewMode === 'table' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'table' ? 'white' : 'var(--text)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Filters and Sorting Section - Sticky */}
      <div style={{ 
        position: 'sticky',
        top: `${headerHeight}px`,
        zIndex: 99,
        marginTop: '16px',
        marginBottom: '16px',
        padding: '16px', 
        background: 'var(--card)', 
        borderRadius: '8px', 
        border: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        alignSelf: 'flex-start',
        width: '100%'
      }}>
        {/* Mobile: Collapsible Header */}
        {isMobile && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Filters & Sorting</h3>
            <button
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: '14px',
                cursor: 'pointer'
              }}
              aria-expanded={filtersExpanded}
              aria-label={filtersExpanded ? 'Collapse filters' : 'Expand filters'}
            >
              {filtersExpanded ? '▼' : '▶'} {filtersExpanded ? 'Hide' : 'Show'} Filters
            </button>
          </div>
        )}
        
        {/* Filter Content - Hidden on mobile when collapsed */}
        {(!isMobile || filtersExpanded) && (
          <>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', position: 'relative' }}>
              {isFiltering && (
                <div style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  background: 'var(--card)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  zIndex: 1
                }}>
                  <DotsLoader />
                  <span>Filtering...</span>
                </div>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 500 }}>
                Filter by Name:
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <input 
                    type="text"
                    placeholder="Project name..."
                    value={nameFilter} 
                    onChange={e => setNameFilter(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontSize: '14px',
                      minWidth: isMobile ? '100%' : '200px',
                      width: isMobile ? '100%' : 'auto'
                    }}
                    aria-label="Filter by project name"
                  />
                </div>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 500 }}>
                Filter by Date Modified:
                <input 
                  type="date"
                  value={dateModifiedFilter} 
                  onChange={e => setDateModifiedFilter(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    minWidth: isMobile ? '100%' : '160px',
                    width: isMobile ? '100%' : 'auto'
                  }}
                  aria-label="Filter by date modified"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 500 }}>
                Filter by Date Created:
                <input 
                  type="date"
                  value={dateCreatedFilter} 
                  onChange={e => setDateCreatedFilter(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    minWidth: isMobile ? '100%' : '160px',
                    width: isMobile ? '100%' : 'auto'
                  }}
                  aria-label="Filter by date created"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 500 }}>
                Filter by Site Location:
                <select
                  value={siteLocationFilter}
                  onChange={e => setSiteLocationFilter(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    minWidth: isMobile ? '100%' : '180px',
                    width: isMobile ? '100%' : 'auto'
                  }}
                >
                  <option value="all">All site locations</option>
                  {siteLocationOptions.map(loc => (
                    <option key={loc._id} value={loc._id}>
                      📍 {loc.name}{loc.type ? ` (${loc.type})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {(nameFilter || dateModifiedFilter || dateCreatedFilter || siteLocationFilter !== 'all') && (
                <button
                  onClick={() => {
                    setNameFilter('')
                    setDateModifiedFilter('')
                    setDateCreatedFilter('')
                    setSiteLocationFilter('all')
                  }}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    marginTop: isMobile ? '8px' : '20px',
                    alignSelf: isMobile ? 'stretch' : 'flex-end',
                    width: isMobile ? '100%' : 'auto'
                  }}
                  aria-label="Clear all filters"
                >
                  Clear Filters
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
                Sort by:
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    minWidth: isMobile ? '100%' : '150px',
                    width: isMobile ? '100%' : 'auto',
                    flex: isMobile ? '1' : '0 0 auto'
                  }}
                  aria-label="Sort by field"
                >
                  <option value="name">Name</option>
                  <option value="dateModified">Date Modified</option>
                  <option value="dateCreated">Date Created</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
                Order:
                <select
                  value={sortDirection}
                  onChange={(e) => setSortDirection(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    minWidth: isMobile ? '100%' : '120px',
                    width: isMobile ? '100%' : 'auto',
                    flex: isMobile ? '1' : '0 0 auto'
                  }}
                  aria-label="Sort order"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </label>
            </div>
          </>
        )}
      </div>

      {isLoading ? (
        viewMode === 'card' ? (
          <div className="projects-grid">
            {Array.from({ length: itemsPerPage }).map((_, idx) => (
              <SkeletonCard key={idx} />
            ))}
          </div>
        ) : (
          <div className="table" style={{ marginTop: '24px' }}>
            <table>
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Budget</th>
                  <th>Project Engineer</th>
                  <th>Created By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: itemsPerPage }).map((_, idx) => (
                  <SkeletonTableRow key={idx} columns={7} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : viewMode === 'card' ? (
        <div className="projects-grid">
          {paginatedProjects.map(project => (
          <div key={project._id} className="project-card">
            <div className="project-header">
              <h3>{project.name}</h3>
              <span className={`status-badge ${getStatusColor(project.status)}`}>
                {project.status}
              </span>
            </div>
            
            <div className="project-details">
              <p><strong>Budget:</strong> AED {project.budget?.toLocaleString() || 'N/A'}</p>
              <p><strong>Location:</strong> {project.locationDetails}</p>
              <p><strong>Working Hours:</strong> {project.workingHours || 'N/A'}</p>
              <p><strong>Manpower:</strong> {project.manpowerCount || 'N/A'}</p>
              <p><strong>Project Engineer{Array.isArray(project.assignedProjectEngineer) && project.assignedProjectEngineer.length > 1 ? 's' : ''}:</strong> {
                Array.isArray(project.assignedProjectEngineer) && project.assignedProjectEngineer.length > 0 ? (
                  <span>
                    {project.assignedProjectEngineer.map((engineer, idx) => (
                      <span key={engineer._id || idx}>
                        {engineer.name || 'Unknown'}
                        {engineer._id && (
                          <button className="link-btn" style={{ marginLeft: 6 }} onClick={() => setProfileUser(engineer)}>View Profile</button>
                        )}
                        {idx < project.assignedProjectEngineer.length - 1 && ', '}
                      </span>
                    ))}
                  </span>
                ) : (
                  'Not Assigned'
                )
              }</p>
              {project.sourceQuotation && (<p><strong>Quotation:</strong> {project.sourceQuotation.offerReference || project.sourceQuotation._id}</p>)}
              {project.sourceRevision && (<p><strong>Source Revision:</strong> #{project.sourceRevision.revisionNumber}</p>)}
              {project.sourceQuotation && !project.sourceRevision && (
                <p><strong>Revisions:</strong> <span className="status-badge" style={{ backgroundColor: '#6b7280', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>No Revisions</span></p>
              )}
            </div>

            {project.revisions?.length > 0 && (
              <div className="revisions-section">
                <h4>Revisions ({project.revisions.length})</h4>
                <div className="revisions-list">
                  {project.revisions.slice(-3).map(revision => (
                    <div key={revision._id} className="revision-item">
                      <div className="revision-header">
                        <span className="revision-type">{revision.type}</span>
                        <span className={`revision-status ${revision.status}`}>
                          {revision.status}
                        </span>
                      </div>
                      <p className="revision-desc">{revision.description}</p>
                      {canCreateRevision() && revision.status === 'pending' && (
                        <div className="revision-actions">
                          <button 
                            onClick={() => approveRevision(project._id, revision._id, 'approved')} 
                            className="approve-btn"
                            disabled={isSubmitting}
                          >
                            <ButtonLoader loading={loadingAction === `approve-revision-${revision._id}` && !loadingAction.includes('rejected')}>
                              Approve
                            </ButtonLoader>
                          </button>
                          <button 
                            onClick={() => approveRevision(project._id, revision._id, 'rejected')} 
                            className="reject-btn"
                            disabled={isSubmitting}
                          >
                            <ButtonLoader loading={loadingAction === `approve-revision-${revision._id}` && loadingAction.includes('rejected')}>
                              Reject
                            </ButtonLoader>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {renderProjectActions(project, false)}
            {Array.isArray(project.edits) && project.edits.length > 0 && (
              <div className="ld-card ld-section" style={{ marginTop: 12 }}>
                <div className="edit-header">
                  <h4 style={{ margin: 0 }}>Project Edit History</h4>
                  <button className="link-btn" onClick={() => setHistoryOpen(prev => ({ ...prev, [project._id]: !prev[project._id] }))}>
                    {historyOpen[project._id] ? 'Hide' : 'View'}
                  </button>
                </div>
                {historyOpen[project._id] && (
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
                          {e.changes.map((c, k) => (
                            <li key={k}>
                              <strong>{c.field}:</strong>
                              <div className="change-diff">
                                <pre className="change-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatProjectHistoryValue(c.field, c.from)}</pre>
                                <span>→</span>
                                <pre className="change-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatProjectHistoryValue(c.field, c.to)}</pre>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      ) : isLoading ? (
        <div className="table" style={{ marginTop: '24px' }}>
          <table>
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Status</th>
                <th>Location</th>
                <th>Budget</th>
                <th>Project Engineer</th>
                <th>Created By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: itemsPerPage }).map((_, idx) => (
                <SkeletonTableRow key={idx} columns={7} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table" style={{ marginTop: '24px' }}>
          <table>
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Status</th>
                <th>Location</th>
                <th>Budget</th>
                <th>Project Engineer</th>
                <th>Created By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProjects.map(project => (
                <>
                  <tr key={project._id}>
                  <td data-label="Project Name">{project.name || 'N/A'}</td>
                  <td data-label="Status">
                    <span className={`status-badge ${getStatusColor(project.status)}`}>
                      {project.status || 'N/A'}
                    </span>
                  </td>
                  <td data-label="Location">{project.locationDetails || 'N/A'}</td>
                  <td data-label="Budget">AED {project.budget?.toLocaleString() || 'N/A'}</td>
                  <td data-label="Project Engineer">
                    {Array.isArray(project.assignedProjectEngineer) && project.assignedProjectEngineer.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {project.assignedProjectEngineer.map((engineer, idx) => (
                          <div key={engineer._id || idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{engineer.name || 'Unknown'}</span>
                            {engineer._id && (
                              <button className="link-btn" onClick={() => setProfileUser(engineer)} style={{ fontSize: '12px', padding: '2px 6px' }}>
                                View Profile
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      'Not Assigned'
                    )}
                  </td>
                  <td data-label="Created By">
                    {project.createdBy?._id === currentUser?.id ? 'You' : (project.createdBy?.name || 'N/A')}
                    {project.createdBy?._id !== currentUser?.id && project.createdBy && (
                      <button className="link-btn" onClick={() => setProfileUser(project.createdBy)} style={{ marginLeft: '6px' }}>
                        View Profile
                      </button>
                    )}
                  </td>
                  <td data-label="Actions">
                    {renderProjectActions(project, true)}
                  </td>
                </tr>
                {expandedVariationRows[project._id] && (
                  <tr key={`${project._id}-variations`} className="history-row accordion-row">
                    <td colSpan={7} style={{ padding: '0' }}>
                      <div className="history-panel accordion-content" style={{ padding: '16px' }}>
                        <h4 style={{ marginTop: '0', marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>Variations ({(projectVariationsMap[project._id] || []).length})</h4>
                        {(projectVariationsMap[project._id] || []).length === 0 ? (
                          <p style={{ margin: 0, color: 'var(--text-muted)' }}>No variations found for this project.</p>
                        ) : (
                          <div className="table">
                            <table>
                              <thead>
                                <tr>
                                  <th>Variation #</th>
                                  <th>Offer Ref</th>
                                  <th>Status</th>
                                  <th>Grand Total</th>
                                  <th>Created By</th>
                                  <th>Created At</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(projectVariationsMap[project._id] || []).sort((a,b)=> (a.variationNumber||0)-(b.variationNumber||0)).map((v) => (
                                  <tr key={v._id}>
                                    <td data-label="Variation #">{v.variationNumber || 'N/A'}</td>
                                    <td data-label="Offer Ref">{v.offerReference || 'N/A'}</td>
                                    <td data-label="Status">
                                      <span className={`status-badge ${v.managementApproval?.status === 'approved' ? 'approved' : v.managementApproval?.status === 'rejected' ? 'rejected' : 'blue'}`}>
                                        {v.managementApproval?.status || 'draft'}
                                      </span>
                                    </td>
                                    <td data-label="Grand Total">{(v.priceSchedule?.currency || 'AED')} {Number(v.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                                    <td data-label="Created By">
                                      {v.createdBy?._id === currentUser?.id ? 'You' : (v.createdBy?.name || 'N/A')}
                                      {v.createdBy?._id !== currentUser?.id && v.createdBy && (
                                        <button className="link-btn" onClick={() => setProfileUser(v.createdBy)} style={{ marginLeft: 6 }}>View Profile</button>
                                      )}
                                    </td>
                                    <td data-label="Created At">{v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'N/A'}</td>
                                    <td data-label="Actions">
                                      <button
                                        className="save-btn"
                                        onClick={() => {
                                          try {
                                            localStorage.setItem('variationId', v._id)
                                          } catch {}
                                          window.location.href = '/variation-detail'
                                        }}
                                      >
                                        View
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {filteredProjects.length > 0 && (
        <div className="pagination-container" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginTop: '24px',
          padding: '16px',
          background: 'var(--card)',
          borderRadius: '8px',
          border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              Items per page:
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value))
                  setCurrentPage(1)
                }}
                style={{
                  padding: '4px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                {viewMode === 'card' ? (
                  <>
                    <option value={6}>6</option>
                    <option value={9}>9</option>
                    <option value={12}>12</option>
                    <option value={15}>15</option>
                    <option value={18}>18</option>
                    <option value={21}>21</option>
                    <option value={24}>24</option>
                  </>
                ) : (
                  <>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </>
                )}
              </select>
            </label>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Showing {startIndex + 1} to {Math.min(endIndex, filteredProjects.length)} of {filteredProjects.length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                background: currentPage === 1 ? 'var(--bg)' : 'var(--card)',
                color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text)',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: currentPage === 1 ? 0.5 : 1
              }}
            >
              Previous
            </button>
            <div style={{ display: 'flex', gap: '4px' }}>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      background: currentPage === pageNum ? 'var(--primary)' : 'var(--card)',
                      color: currentPage === pageNum ? 'white' : 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: currentPage === pageNum ? 600 : 400
                    }}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                background: currentPage === totalPages ? 'var(--bg)' : 'var(--card)',
                color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text)',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: currentPage === totalPages ? 0.5 : 1
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showVisitModal && (
        <div className="modal-overlay" onClick={() => setShowVisitModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Site Visit</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedProject && selectedProject._id) {
                      window.open(`/projects/${selectedProject._id}/site-visits/create`, '_blank')
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
                    if (selectedProject && selectedProject._id) {
                      window.location.href = `/projects/${selectedProject._id}/site-visits/create`
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
                <button onClick={() => setShowVisitModal(false)} className="close-btn">×</button>
              </div>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (isSubmitting) return
                setLoadingAction('create-site-visit')
                setIsSubmitting(true)
                try {
                  const formDataToSend = new FormData()
                  
                  // Append projectId and form fields
                  formDataToSend.append('projectId', selectedProject._id)
                  Object.keys(visitData).forEach(key => {
                    formDataToSend.append(key, visitData[key])
                  })
                  
                  // Append files
                  visitFiles.forEach(file => {
                    formDataToSend.append('attachments', file)
                  })

                  await api.post('/api/site-visits', formDataToSend)
                  setShowVisitModal(false)
                  setVisitData({ visitAt: '', siteLocation: '', engineerName: '', workProgressSummary: '', safetyObservations: '', qualityMaterialCheck: '', issuesFound: '', actionItems: '', weatherConditions: '', description: '' })
                  setVisitFiles([])
                  setVisitPreviewFiles([])
                  setNotify({ open: true, title: 'Saved', message: 'Site visit saved successfully.' })
                  await fetchProjects()
                } catch (error) {
                  setNotify({ open: true, title: 'Create Failed', message: error.response?.data?.message || 'We could not create the site visit. Please try again.' })
                } finally {
                  setIsSubmitting(false)
                  setLoadingAction(null)
                }
              }}
              className="assign-form"
            >
              <div className="form-group">
                <label>Project Name</label>
                <input type="text" value={selectedProject?.name || ''} readOnly />
              </div>
              <div className="form-group">
                <label>Date and Time of Visit *</label>
                <input type="datetime-local" value={visitData.visitAt} onChange={e => setVisitData({ ...visitData, visitAt: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Site Location *</label>
                <input type="text" value={visitData.siteLocation} onChange={e => setVisitData({ ...visitData, siteLocation: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Engineer / Inspector Name *</label>
                <input type="text" value={visitData.engineerName} onChange={e => setVisitData({ ...visitData, engineerName: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Work Progress Summary *</label>
                <textarea value={visitData.workProgressSummary} onChange={e => setVisitData({ ...visitData, workProgressSummary: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Safety Observations</label>
                <textarea value={visitData.safetyObservations} onChange={e => setVisitData({ ...visitData, safetyObservations: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Quality and Material Check</label>
                <textarea value={visitData.qualityMaterialCheck} onChange={e => setVisitData({ ...visitData, qualityMaterialCheck: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Issues / Non-Conformities Found</label>
                <textarea value={visitData.issuesFound} onChange={e => setVisitData({ ...visitData, issuesFound: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Action Items / Follow-up</label>
                <textarea value={visitData.actionItems} onChange={e => setVisitData({ ...visitData, actionItems: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Weather Conditions</label>
                <input type="text" value={visitData.weatherConditions} onChange={e => setVisitData({ ...visitData, weatherConditions: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Detailed Description / Remarks *</label>
                <textarea value={visitData.description} onChange={e => setVisitData({ ...visitData, description: e.target.value })} required />
              </div>

              <div className="form-group">
                <label>Attachments (Documents, Images & Videos)</label>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,video/*"
                  onChange={(e) => {
                    const files = Array.from(e.target.files)
                    setVisitFiles(prev => [...prev, ...files])
                    
                    files.forEach(file => {
                      if (file.type.startsWith('image/')) {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                          setVisitPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'image' }])
                        }
                        reader.readAsDataURL(file)
                      } else if (file.type.startsWith('video/')) {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                          setVisitPreviewFiles(prev => [...prev, { file, preview: reader.result, type: 'video' }])
                        }
                        reader.readAsDataURL(file)
                      } else {
                        setVisitPreviewFiles(prev => [...prev, { file, preview: null, type: 'document' }])
                      }
                    })
                  }}
                  className="file-input"
                />
                <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                  Accepted: Images (JPEG, PNG, GIF, WebP), Documents (PDF, DOC, DOCX, XLS, XLSX), Videos (MP4, MOV, AVI, WMV, WebM, etc.). Max 10MB per file.
                </small>
                
                {/* Display new files being uploaded */}
                {visitPreviewFiles.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {visitPreviewFiles.map((item, index) => (
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
                            onClick={() => {
                              setVisitFiles(prev => prev.filter((_, i) => i !== index))
                              setVisitPreviewFiles(prev => prev.filter((_, i) => i !== index))
                            }}
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
                <button 
                  type="button" 
                  onClick={() => {
                    setShowVisitModal(false)
                    setVisitFiles([])
                    setVisitPreviewFiles([])
                  }} 
                  className="cancel-btn"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="save-btn"
                  disabled={isSubmitting}
                >
                  <ButtonLoader loading={loadingAction === 'create-site-visit'}>
                    {isSubmitting ? 'Saving...' : 'Save Visit'}
                  </ButtonLoader>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {deleteModal.open && deleteModal.project && (
        <div className="modal-overlay" onClick={() => setDeleteModal({ open: false, project: null })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Project</h2>
              <button onClick={() => setDeleteModal({ open: false, project: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to delete project "{deleteModal.project.name}"? This cannot be undone.</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setDeleteModal({ open: false, project: null })}>Cancel</button>
                <button 
                  type="button" 
                  className="reject-btn" 
                  onClick={async () => {
                    if (isSubmitting) return
                    setLoadingAction('delete-project')
                    setIsSubmitting(true)
                    try {
                      // Check if project has variations before deletion
                      const projectId = typeof deleteModal.project._id === 'object' ? deleteModal.project._id._id : deleteModal.project._id
                      const existingVariations = allVariations.filter(v => {
                        const variationProjectId = typeof v.parentProject === 'object' ? v.parentProject?._id : v.parentProject
                        return variationProjectId === projectId
                      })
                      
                      if (existingVariations.length > 0) {
                        setDeleteModal({ open: false, project: null })
                        setVariationWarningModal({ open: true, project: deleteModal.project, existingVariations, isDelete: true })
                        setIsSubmitting(false)
                        setLoadingAction(null)
                        return
                      }
                      
                      const token = localStorage.getItem('token')
                      await api.delete(`/api/projects/${projectId}`)
                      setDeleteModal({ open: false, project: null })
                      setNotify({ open: true, title: 'Deleted', message: 'Project deleted successfully.' })
                      await fetchProjects()
                    } catch (error) {
                      setDeleteModal({ open: false, project: null })
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
      {editProjectModal.open && selectedProject && (
        <div className="modal-overlay" onClick={() => setEditProjectModal({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Project</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedProject && selectedProject._id) {
                      const projectId = typeof selectedProject._id === 'object' ? selectedProject._id._id : selectedProject._id
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
                    if (selectedProject && selectedProject._id) {
                      const projectId = typeof selectedProject._id === 'object' ? selectedProject._id._id : selectedProject._id
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
                <button onClick={() => setEditProjectModal({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })} className="close-btn">×</button>
              </div>
            </div>
            <div className="lead-form">
              <div className="form-group">
                <label>Project Name *</label>
                <input type="text" value={editProjectModal.form.name} onChange={e => setEditProjectModal({ ...editProjectModal, form: { ...editProjectModal.form, name: e.target.value } })} required />
              </div>
              <div className="form-group">
                <label>Location Details *</label>
                <input type="text" value={editProjectModal.form.locationDetails} onChange={e => setEditProjectModal({ ...editProjectModal, form: { ...editProjectModal.form, locationDetails: e.target.value } })} required />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Working Hours</label>
                  <input type="text" value={editProjectModal.form.workingHours} onChange={e => setEditProjectModal({ ...editProjectModal, form: { ...editProjectModal.form, workingHours: e.target.value } })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Manpower Count</label>
                  <input 
                    type="number" 
                    value={editProjectModal.form.manpowerCount === null || editProjectModal.form.manpowerCount === undefined || editProjectModal.form.manpowerCount === '' ? '' : editProjectModal.form.manpowerCount} 
                    onChange={e => {
                      const inputVal = e.target.value
                      // Allow empty string, otherwise convert to number
                      const val = inputVal === '' ? '' : Number(inputVal)
                      setEditProjectModal({ ...editProjectModal, form: { ...editProjectModal.form, manpowerCount: val } })
                    }} 
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={editProjectModal.form.status} onChange={e => setEditProjectModal({ ...editProjectModal, form: { ...editProjectModal.form, status: e.target.value } })}>
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
                      const isSelected = Array.isArray(editProjectModal.form.assignedProjectEngineer) 
                        ? editProjectModal.form.assignedProjectEngineer.includes(u._id)
                        : editProjectModal.form.assignedProjectEngineer === u._id
                      
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
                              const currentEngineers = Array.isArray(editProjectModal.form.assignedProjectEngineer) 
                                ? editProjectModal.form.assignedProjectEngineer 
                                : []
                              
                              let newEngineers
                              if (e.target.checked) {
                                newEngineers = [...currentEngineers, u._id]
                              } else {
                                newEngineers = currentEngineers.filter(id => id !== u._id)
                              }
                              
                              setEditProjectModal({ 
                                ...editProjectModal, 
                                form: { ...editProjectModal.form, assignedProjectEngineer: newEngineers } 
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
                {Array.isArray(editProjectModal.form.assignedProjectEngineer) && editProjectModal.form.assignedProjectEngineer.length > 0 && (
                  <small style={{ display: 'block', marginTop: '8px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {editProjectModal.form.assignedProjectEngineer.length} engineer{editProjectModal.form.assignedProjectEngineer.length === 1 ? '' : 's'} selected
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
                {selectedProject && selectedProject.attachments && selectedProject.attachments.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>Existing Attachments:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {selectedProject.attachments.map((attachment, index) => {
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
                    {selectedProject && selectedProject.attachments && selectedProject.attachments.length > 0 && (
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
                <button type="button" className="cancel-btn" onClick={() => setEditProjectModal({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  onClick={async () => {
                    if (isSubmitting) return
                    setLoadingAction('save-project')
                    setIsSubmitting(true)
                    try {
                      // Safety check: verify no variations exist before saving
                      const projectId = typeof selectedProject._id === 'object' ? selectedProject._id._id : selectedProject._id
                      const existingVariations = allVariations.filter(v => {
                        const variationProjectId = typeof v.parentProject === 'object' ? v.parentProject?._id : v.parentProject
                        return variationProjectId === projectId
                      })
                      
                      if (existingVariations.length > 0) {
                        setEditProjectModal({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })
                        setEditProjectWarningModal({ open: true, project: selectedProject, existingVariations })
                        return
                      }
                      
                      // Use FormData for file uploads
                      const formData = new FormData()
                      Object.keys(editProjectModal.form).forEach(key => {
                        if (key === 'assignedProjectEngineer') return // Skip, handle separately
                        const value = editProjectModal.form[key]
                        // Always send manpowerCount (even if 0) so backend can properly compare
                        if (key === 'manpowerCount') {
                          formData.append(key, value !== null && value !== undefined ? value : '')
                        } else if (value !== '' && value !== null && value !== undefined) {
                          formData.append(key, value)
                        }
                      })
                      
                      // Append engineer IDs separately (FormData doesn't handle arrays well)
                      // Always append the field, even if empty, so backend can clear all engineers
                      if (Array.isArray(editProjectModal.form.assignedProjectEngineer)) {
                        if (editProjectModal.form.assignedProjectEngineer.length > 0) {
                          editProjectModal.form.assignedProjectEngineer.forEach(id => {
                            formData.append('assignedProjectEngineer', id)
                          })
                        } else {
                          // Send empty string to indicate empty array - backend will treat this as empty array
                          formData.append('assignedProjectEngineer', '')
                        }
                      } else {
                        // Handle non-array case (backward compatibility)
                        formData.append('assignedProjectEngineer', editProjectModal.form.assignedProjectEngineer || '')
                      }
                      
                      // Append new files
                      selectedFiles.forEach(file => {
                        formData.append('attachments', file)
                      })
                      
                      // Append attachments to remove
                      attachmentsToRemove.forEach(index => {
                        formData.append('removeAttachments', index)
                      })
                      
                      await api.patch(`/api/projects/${selectedProject._id}`, formData)
                      setEditProjectModal({ open: false, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', status: 'active' } })
                      setSelectedFiles([])
                      setPreviewFiles([])
                      setAttachmentsToRemove([])
                      await fetchProjects()
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
      {editProjectWarningModal.open && editProjectWarningModal.project && (
        <div className="modal-overlay" onClick={() => setEditProjectWarningModal({ open: false, project: null, existingVariations: [] })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cannot Edit Project</h2>
              <button onClick={() => setEditProjectWarningModal({ open: false, project: null, existingVariations: [] })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div style={{ padding: '16px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ margin: 0, color: '#7C2D12', fontWeight: 500 }}>
                  ⚠️ This project cannot be edited because it has {editProjectWarningModal.existingVariations.length} existing variation{editProjectWarningModal.existingVariations.length > 1 ? 's' : ''}.
                </p>
              </div>
              <p style={{ marginBottom: '16px' }}>
                Project <strong>{editProjectWarningModal.project.name}</strong> has existing variation quotations. 
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
                <button type="button" className="save-btn" onClick={() => setEditProjectWarningModal({ open: false, project: null, existingVariations: [] })}>Understood</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {variationModal.open && variationModal.form && variationModal.project && (
          <div className="modal-overlay" onClick={() => {
            setVariationModal({ open: false, project: null, form: null })
            setVariationSelectedFiles([])
            setVariationPreviewFiles([])
          }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', width: '900px' }}>
            <div className="modal-header">
              <h2>Create Variation Quotation</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {variationModal.form && variationModal.project?._id && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (variationModal.project && variationModal.project._id) {
                          const projectId = typeof variationModal.project._id === 'object' ? variationModal.project._id._id : variationModal.project._id
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
                        if (variationModal.project && variationModal.project._id) {
                          const projectId = typeof variationModal.project._id === 'object' ? variationModal.project._id._id : variationModal.project._id
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
                  setVariationModal({ open: false, project: null, form: null })
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
                  setVariationModal({ open: false, project: null, form: null })
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
      {variationWarningModal.open && variationWarningModal.project && (
        <div className="modal-overlay" onClick={() => setVariationWarningModal({ open: false, project: null, existingVariations: [] })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Variation Already Exists</h2>
              <button onClick={() => setVariationWarningModal({ open: false, project: null, existingVariations: [] })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div style={{ padding: '16px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ margin: 0, color: '#7C2D12', fontWeight: 500 }}>
                  ⚠️ This project already has {variationWarningModal.existingVariations.length} existing variation{variationWarningModal.existingVariations.length > 1 ? 's' : ''}.
                </p>
              </div>
              <p style={{ marginBottom: '16px' }}>
                A variation quotation already exists for project <strong>{variationWarningModal.project.name}</strong>. 
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
                <button type="button" className="save-btn" onClick={() => setVariationWarningModal({ open: false, project: null, existingVariations: [] })}>Understood</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {variationWarningModal.open && variationWarningModal.project && variationWarningModal.isDelete && (
        <div className="modal-overlay" onClick={() => setVariationWarningModal({ open: false, project: null, existingVariations: [], isDelete: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cannot Delete Project</h2>
              <button onClick={() => setVariationWarningModal({ open: false, project: null, existingVariations: [], isDelete: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div style={{ padding: '16px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ margin: 0, color: '#7C2D12', fontWeight: 500 }}>
                  ⚠️ This project cannot be deleted because it has {variationWarningModal.existingVariations.length} existing variation{variationWarningModal.existingVariations.length > 1 ? 's' : ''}.
                </p>
              </div>
              <p style={{ marginBottom: '16px' }}>
                Project <strong>{variationWarningModal.project.name}</strong> has existing variation quotations. 
                Deleting the project is blocked to maintain data integrity and ensure consistency with approved variations.
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
                To delete this project, you must first delete or remove all associated variations. 
                Please contact a manager or administrator if you need to delete this project.
              </p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => setVariationWarningModal({ open: false, project: null, existingVariations: [], isDelete: false })}>Understood</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showVariationsListModal && selectedProjectForList && (
        <div className="modal-overlay" onClick={() => setShowVariationsListModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', width: '900px' }}>
            <div className="modal-header">
              <h2>Variations for {selectedProjectForList.name}</h2>
              <button onClick={() => setShowVariationsListModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ maxHeight: '70vh', overflow: 'auto' }}>
              {variationsForProject.length === 0 ? (
                <p>No variations found for this project.</p>
              ) : (
                <div className="table">
                  <table>
                    <thead>
                      <tr>
                        <th>Variation #</th>
                        <th>Offer Ref</th>
                        <th>Status</th>
                        <th>Grand Total</th>
                        <th>Created By</th>
                        <th>Created At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variationsForProject.sort((a,b)=> (a.variationNumber||0)-(b.variationNumber||0)).map((v) => (
                        <tr key={v._id}>
                          <td data-label="Variation #">{v.variationNumber || 'N/A'}</td>
                          <td data-label="Offer Ref">{v.offerReference || 'N/A'}</td>
                          <td data-label="Status">
                            <span className={`status-badge ${v.managementApproval?.status === 'approved' ? 'approved' : v.managementApproval?.status === 'rejected' ? 'rejected' : 'blue'}`}>
                              {v.managementApproval?.status || 'draft'}
                            </span>
                          </td>
                          <td data-label="Grand Total">{(v.priceSchedule?.currency || 'AED')} {Number(v.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                          <td data-label="Created By">
                            {v.createdBy?._id === currentUser?.id ? 'You' : (v.createdBy?.name || 'N/A')}
                            {v.createdBy?._id !== currentUser?.id && v.createdBy && (
                              <button className="link-btn" onClick={() => setProfileUser(v.createdBy)} style={{ marginLeft: 6 }}>View Profile</button>
                            )}
                          </td>
                          <td data-label="Created At">{v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'N/A'}</td>
                          <td data-label="Actions">
                            <button
                              className="save-btn"
                              onClick={() => {
                                try {
                                  localStorage.setItem('variationId', v._id)
                                  setShowVariationsListModal(false)
                                } catch {}
                                window.location.href = '/variation-detail'
                              }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showAttachmentsModal && selectedProjectForAttachments && (
        <div className="modal-overlay" onClick={() => {
          setShowAttachmentsModal(false)
          setSelectedProjectForAttachments(null)
          setProjectAttachmentsData({ leads: [], siteVisits: [], project: [], variations: [] })
        }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '95vw', width: '1200px' }}>
            <div className="modal-header">
              <h2>All Attachments - {selectedProjectForAttachments.name}</h2>
              <button onClick={() => {
                setShowAttachmentsModal(false)
                setSelectedProjectForAttachments(null)
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

      {/* Print Preview Modal */}
      {printPreviewModal.open && printPreviewModal.pdfUrl && (
        <div className="modal-overlay" onClick={() => setPrintPreviewModal({ open: false, pdfUrl: null, project: null })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001, maxWidth: '95%', width: '100%', height: '95vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
              <h2>PDF Preview - {printPreviewModal.project?.name || 'Project'}</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="save-btn" 
                  onClick={async () => {
                    if (printPreviewModal.project) {
                      try {
                        await exportProjectPDF(printPreviewModal.project)
                      } catch (e) {
                        setNotify({ open: true, title: 'Export Failed', message: 'We could not generate the PDF. Please try again.' })
                      }
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
                            <title>${printPreviewModal.project?.name || 'Project'} - PDF</title>
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
                <button onClick={() => setPrintPreviewModal({ open: false, pdfUrl: null, project: null })} className="close-btn">×</button>
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

export default ProjectManagement