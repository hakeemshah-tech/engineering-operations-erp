import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { FormField, FormRow, FormSection } from '../design-system/FormField'
import { Modal } from '../design-system/Modal'
import '../design-system/FormField.css'
import '../design-system/Modal.css'
import './LeadManagement.css'
import logo from '../assets/logo/app-logo.png'

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

  // Close font size dropdown when clicking outside
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
    // Save selection on input to preserve it
    setTimeout(() => saveSelection(), 0)
  }
  
  // Continuously save selection while editor is focused
  useEffect(() => {
    if (!isFocused || !editorRef.current) return
    
    // Save selection on mouseup (when user finishes selecting)
    const handleMouseUp = (e) => {
      // Only save if the mouseup is within the editor
      if (editorRef.current?.contains(e.target)) {
        setTimeout(() => saveSelection(), 0)
      }
    }
    
    // Save selection on any selection change
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        // Only save if selection is within editor
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
    // Try to expand to word boundaries
    try {
      if (range.expand) {
        range.expand('word')
      }
    } catch (e) {
      // Fallback: manually expand to word
      const textNode = range.startContainer
      if (textNode && textNode.nodeType === 3) {
        const text = textNode.textContent
        const start = range.startOffset
        let wordStart = start
        let wordEnd = start
        
        // Find word start
        while (wordStart > 0 && /\S/.test(text[wordStart - 1])) {
          wordStart--
        }
        
        // Find word end
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
      // Check if selection is within the editor
      if (editorRef.current && 
          (editorRef.current.contains(range.anchorNode) || editorRef.current.contains(range.focusNode))) {
        // Only save if there's actual selected text (not just cursor)
        if (!range.collapsed) {
          savedSelectionRef.current = range.cloneRange()
        } else {
          // Clear saved selection if it's just a cursor
          savedSelectionRef.current = null
        }
      }
    }
  }

  const restoreSelection = () => {
    if (savedSelectionRef.current && editorRef.current) {
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(savedSelectionRef.current)
    }
  }

  const applyFontSize = (size) => {
    // CRITICAL: Must use saved selection - current selection is lost when toolbar is clicked
    // ABSOLUTELY DO NOT apply font size if there's no saved selection
    
    // ONLY use saved selection - don't try current selection as it's already lost
    if (!savedSelectionRef.current) {
      // No saved selection - DO NOT apply font size to anything
      console.warn('No saved selection - font size not applied')
      if (editorRef.current) {
        editorRef.current.focus()
      }
      return
    }
    
    const savedRange = savedSelectionRef.current
    
    // Verify the saved selection is still valid (within editor)
    if (!editorRef.current || 
        !editorRef.current.contains(savedRange.startContainer) || 
        !editorRef.current.contains(savedRange.endContainer)) {
      // Saved selection is no longer valid - DO NOT apply font size
      console.warn('Saved selection is invalid - font size not applied')
      savedSelectionRef.current = null
      if (editorRef.current) {
        editorRef.current.focus()
      }
      return
    }
    
    const range = savedRange.cloneRange()
    
    // Only apply if there's actually selected text (not collapsed/cursor position)
    if (range.collapsed) {
      // No text selected - DO NOT apply font size
      console.warn('Selection is collapsed - font size not applied')
      if (editorRef.current) {
        editorRef.current.focus()
      }
      return
    }
    
    // Restore the selection in the DOM before applying
    const selection = window.getSelection()
    selection.removeAllRanges()
    try {
      selection.addRange(range.cloneRange())
    } catch (e) {
      console.error('Failed to restore selection:', e)
      return
    }
    
    // Ensure the range is within the editor
    if (!editorRef.current?.contains(range.commonAncestorContainer)) {
      editorRef.current?.focus()
      return
    }
    
    // Apply font size to selected text only - handle multi-node selections properly
    const startContainer = range.startContainer
    const endContainer = range.endContainer
    const startOffset = range.startOffset
    const endOffset = range.endOffset
    
    // If selection is within a single text node
    if (startContainer === endContainer && startContainer.nodeType === 3) {
      const textNode = startContainer
      const text = textNode.textContent
      const beforeText = text.substring(0, startOffset)
      const selectedText = text.substring(startOffset, endOffset)
      const afterText = text.substring(endOffset)
      
      // Create new text nodes and span
      const beforeNode = document.createTextNode(beforeText)
      const span = document.createElement('span')
      span.style.fontSize = `${size}px`
      span.textContent = selectedText
      const afterNode = document.createTextNode(afterText)
      
      // Replace the original text node
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
      // Multi-node selection - use a more precise approach
      // Clone range to work with it
      const workRange = range.cloneRange()
      
      // Create wrapper span
      const wrapper = document.createElement('span')
      wrapper.style.fontSize = `${size}px`
      
      // Extract contents - this will handle partial nodes correctly
      const contents = workRange.extractContents()
      
      // Move all extracted nodes into the wrapper
      if (contents.hasChildNodes()) {
        while (contents.firstChild) {
          wrapper.appendChild(contents.firstChild)
        }
      } else if (contents.nodeType === 3) {
        // If it's a text node fragment
        wrapper.appendChild(contents)
      }
      
      // Only insert if we have content
      if (wrapper.textContent.trim() || wrapper.hasChildNodes()) {
        // Insert at the original start position
        range.insertNode(wrapper)
      }
    }
    
    // Clear saved selection after applying
    savedSelectionRef.current = null
    
    // Update the onChange to reflect the change
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
    
    editorRef.current?.focus()
  }

  const applyFontFamily = (family) => {
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      
      // If no selection, try to select the word at cursor
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
    // Don't close if clicking on dropdown
    if (e.relatedTarget && e.relatedTarget.closest('[data-font-size-container]')) {
      return
    }
    
    setShowFontSizeDropdown(false)
    
    // CRITICAL: Check if we have a saved selection before applying
    if (!savedSelectionRef.current) {
      // No saved selection - don't apply font size, just update the input value
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
      // Reset to current fontSize if invalid
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
    
    // CRITICAL: Only apply if we have a saved selection
    if (!savedSelectionRef.current) {
      // No saved selection - don't apply font size
      return
    }
    
    // Small delay to ensure dropdown closes before applying
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
      // Ensure URL has protocol
      const finalUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
      
      const selection = window.getSelection()
      if (selection.rangeCount > 0 && editorRef.current) {
        const range = selection.getRangeAt(0)
        
        // If no selection, try to use the word at cursor
        if (selection.isCollapsed) {
          expandToWord(range)
        }
        
        if (!range.collapsed) {
          // Check if selection is already a link
          const linkElement = range.commonAncestorContainer.nodeType === 1 
            ? range.commonAncestorContainer.closest('a')
            : range.commonAncestorContainer.parentElement?.closest('a')
          
          if (linkElement) {
            linkElement.href = finalUrl
          } else {
            // Save selection before execCommand
            selection.removeAllRanges()
            selection.addRange(range)
            document.execCommand('createLink', false, finalUrl)
          }
        } else {
          // Insert link text if no selection
          const link = document.createElement('a')
          link.href = finalUrl
          link.textContent = finalUrl
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          range.insertNode(link)
          // Move cursor after the link
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
      
      // Find the list element
      if (range.commonAncestorContainer.nodeType === 1) {
        listElement = range.commonAncestorContainer.closest('ul, ol')
      } else {
        listElement = range.commonAncestorContainer.parentElement?.closest('ul, ol')
      }
      
      if (listElement) {
        // If we're switching list types, convert the list
        const currentType = listElement.tagName.toLowerCase()
        if ((listType === 'ul' && currentType === 'ol') || (listType === 'ol' && currentType === 'ul')) {
          // Convert list type
          const newList = document.createElement(listType === 'ul' ? 'ul' : 'ol')
          newList.style.setProperty('list-style-type', style, 'important')
          
          // Copy all list items
          while (listElement.firstChild) {
            newList.appendChild(listElement.firstChild)
          }
          
          // Replace old list with new list
          listElement.parentNode?.replaceChild(newList, listElement)
          listElement = newList
        } else {
          // Just change the style - use setProperty with important
          listElement.style.setProperty('list-style-type', style, 'important')
          listElement.setAttribute('data-list-style', style)
        }
      } else {
        // Create new list with style
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
      {/* Toolbar - Row 1: Undo/Redo and Format */}
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
        onMouseEnter={() => {
          // CRITICAL: Save selection when mouse enters toolbar area
          saveSelection()
        }}
        onMouseDown={(e) => {
          // CRITICAL: Save selection on any mouse down in toolbar BEFORE focus is lost
          saveSelection()
        }}
      >
        {/* Undo/Redo */}
        <button type="button" onClick={handleUndo} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Undo">
          ↶
        </button>
        <button type="button" onClick={handleRedo} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Redo">
          ↷
        </button>
        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
        
        {/* Font Style Dropdown */}
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
        
        {/* Font Family */}
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
        
        {/* Font Size - Editable Input with Dropdown */}
        <div 
          style={{ position: 'relative', display: 'inline-block' }} 
          data-font-size-container
          onMouseEnter={() => {
            // Save selection when hovering over font size control
            saveSelection()
          }}
        >
          <input
            type="text"
            value={fontSizeInput}
            onChange={handleFontSizeInputChange}
            onBlur={handleFontSizeInputBlur}
            onKeyPress={handleFontSizeInputKeyPress}
            onMouseDown={(e) => {
              // Save selection BEFORE the input gets focus (which would lose editor selection)
              // Use setTimeout to ensure this runs before focus change
              e.preventDefault()
              saveSelection()
              // Allow focus after saving selection
              setTimeout(() => {
                e.target.focus()
              }, 0)
            }}
            onFocus={() => {
              // Also save on focus as backup
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
                    // Ensure selection is saved before selecting from dropdown
                    if (!savedSelectionRef.current) {
                      saveSelection()
                    }
                    handleFontSizeSelect(String(size))
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    // Save selection when clicking dropdown item
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
        
        {/* Text Formatting */}
        <button type="button" onClick={() => execCommand('bold')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer', fontWeight: 'bold' }} title="Bold">
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => execCommand('italic')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer', fontStyle: 'italic' }} title="Italic">
          <em>I</em>
        </button>
        <button type="button" onClick={() => execCommand('underline')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer', textDecoration: 'underline' }} title="Underline">
          <u>U</u>
        </button>
        
        {/* Text Color */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <input
            type="color"
            value={textColor}
            onChange={handleTextColorChange}
            style={{ width: '32px', height: '28px', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
            title="Text Color"
          />
        </div>
        
        {/* Highlight Color */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <input
            type="color"
            value={highlightColor}
            onChange={handleHighlightColorChange}
            style={{ width: '32px', height: '28px', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
            title="Highlight Color"
          />
        </div>
      </div>
      
      {/* Toolbar - Row 2: Alignment, Lists, Links */}
      <div style={{ 
        display: 'flex', 
        gap: '4px', 
        padding: '8px', 
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        flexWrap: 'wrap',
        alignItems: 'center',
        width: '100%'
      }}>
        {/* Alignment */}
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
        
        {/* Bullet List with Styles */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button type="button" onClick={() => handleListStyleChange('ul', 'disc')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer', pointerEvents: 'none' }} title="Bullet List">
            •
          </button>
          <select 
            onChange={(e) => {
              e.stopPropagation()
              handleListStyleChange('ul', e.target.value)
            }}
            style={{ 
              position: 'absolute', 
              left: 0, 
              top: 0, 
              width: '100%', 
              height: '100%', 
              opacity: 0, 
              cursor: 'pointer',
              fontSize: '12px',
              zIndex: 10
            }}
            title="Bullet List Style"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="disc">• Disc</option>
            <option value="circle">○ Circle</option>
            <option value="square">■ Square</option>
            <option value="none">None</option>
          </select>
        </div>
        
        {/* Numbered List with Styles */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button type="button" onClick={() => handleListStyleChange('ol', 'decimal')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer', pointerEvents: 'none' }} title="Numbered List">
            1.
          </button>
          <select 
            onChange={(e) => {
              e.stopPropagation()
              handleListStyleChange('ol', e.target.value)
            }}
            style={{ 
              position: 'absolute', 
              left: 0, 
              top: 0, 
              width: '100%', 
              height: '100%', 
              opacity: 0, 
              cursor: 'pointer',
              fontSize: '12px',
              zIndex: 10
            }}
            title="Numbered List Style"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="decimal">1. Decimal</option>
            <option value="decimal-leading-zero">01. Decimal Leading Zero</option>
            <option value="lower-roman">i. Lower Roman</option>
            <option value="upper-roman">I. Upper Roman</option>
            <option value="lower-alpha">a. Lower Alpha</option>
            <option value="upper-alpha">A. Upper Alpha</option>
            <option value="lower-latin">a. Lower Latin</option>
            <option value="upper-latin">A. Upper Latin</option>
          </select>
        </div>
        
        {/* Indentation */}
        <button type="button" onClick={() => execCommand('outdent')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Decrease Indent">
          ⬅
        </button>
        <button type="button" onClick={() => execCommand('indent')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Increase Indent">
          ➡
        </button>
        
        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
        
        {/* Link */}
        <button type="button" onClick={handleInsertLink} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Insert Link">
          🔗
        </button>
        
        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
        
        {/* Clear Formatting */}
        <button type="button" onClick={() => execCommand('removeFormat')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Clear Formatting">
          Clear
        </button>
      </div>
      
      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => {
          setIsFocused(true)
          saveSelection()
        }}
        onBlur={() => {
          setIsFocused(false)
        }}
        style={{
          minHeight: '200px',
          padding: '12px 12px 12px 24px',
          outline: isFocused ? '2px solid var(--primary)' : 'none',
          outlineOffset: '-2px',
          color: 'var(--text)',
          fontFamily: fontFamily,
          fontSize: `${fontSize}px`,
          lineHeight: '1.5',
          width: '100%',
          boxSizing: 'border-box',
          overflowX: 'auto'
        }}
      />
      <style>{`
        [contenteditable="true"] ul,
        [contenteditable="true"] ol {
          padding-left: 32px !important;
          margin-left: 0 !important;
          margin-top: 8px !important;
          margin-bottom: 8px !important;
          list-style-position: outside !important;
        }
        [contenteditable="true"] li {
          margin-bottom: 4px !important;
          padding-left: 8px !important;
        }
        [contenteditable="true"] img {
          max-width: 100%;
          height: auto;
          margin: 8px 0;
        }
        [contenteditable="true"] a {
          color: var(--primary);
          text-decoration: underline;
        }
        [contenteditable="true"] h1,
        [contenteditable="true"] h2,
        [contenteditable="true"] h3,
        [contenteditable="true"] h4 {
          margin-top: 12px;
          margin-bottom: 8px;
          font-weight: bold;
        }
        [contenteditable="true"] h1 { font-size: 2em; }
        [contenteditable="true"] h2 { font-size: 1.5em; }
        [contenteditable="true"] h3 { font-size: 1.17em; }
        [contenteditable="true"] h4 { font-size: 1em; }
      `}</style>
      
      {/* Link Insert Modal */}
      <Modal
        isOpen={showLinkModal}
        onClose={handleLinkModalCancel}
        title="Insert Link"
        size="small"
      >
        <div style={{ padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              URL:
            </label>
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleLinkModalSave()
                }
              }}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleLinkModalCancel}
              style={{
                padding: '8px 16px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                background: 'var(--input)',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLinkModalSave}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                background: 'var(--primary)',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Insert
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function QuotationFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { leadId, quotationId } = useParams()
  const [currentUser, setCurrentUser] = useState(null)
  const [leads, setLeads] = useState([])
  const [editing, setEditing] = useState(null)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [isSaving, setIsSaving] = useState(false)

  const defaultCompany = useMemo(() => ({
    logo,
    name: 'Engineering Operations ERP',
    address: 'Dubai, UAE',
    phone: '+971-00-000-0000',
    email: 'info@example.com'
  }), [])

  const [form, setForm] = useState({
    lead: '',
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
    deliveryCompletionWarrantyValidity: {
      deliveryTimeline: '',
      warrantyPeriod: '',
      offerValidity: 30,
      authorizedSignatory: ''
    }
  })

  useEffect(() => {
    setCurrentUser(JSON.parse(localStorage.getItem('user')) || null)
    void fetchLeads()
    if (quotationId) {
      void fetchQuotation()
    }
  }, [quotationId])

  const fetchLeads = async () => {
    try {
      const res = await api.get('/api/leads')
      setLeads(res.data)
    } catch {}
  }

  const fetchQuotation = async () => {
    try {
      const res = await api.get(`/api/quotations/${quotationId}`)
      setEditing(res.data)
    } catch {}
  }

  useEffect(() => {
    if (editing) {
      // Populate form with editing quotation data
      setForm({
        lead: editing.lead?._id || editing.lead || '',
        companyInfo: editing.companyInfo || defaultCompany,
        submittedTo: editing.submittedTo || '',
        attention: editing.attention || '',
        offerReference: editing.offerReference || '',
        enquiryNumber: editing.enquiryNumber || '',
        offerDate: editing.offerDate ? editing.offerDate.substring(0, 10) : '',
        enquiryDate: editing.enquiryDate ? editing.enquiryDate.substring(0, 10) : '',
        projectTitle: editing.projectTitle || editing.lead?.projectTitle || '',
        introductionText: editing.introductionText || '',
        scopeOfWork: editing.scopeOfWork?.length 
          ? (Array.isArray(editing.scopeOfWork) 
              ? editing.scopeOfWork.map(item => item.description || '').join('<br>') 
              : editing.scopeOfWork)
          : '',
        priceSchedule: editing.priceSchedule 
          ? (typeof editing.priceSchedule === 'string' 
              ? editing.priceSchedule 
              : (editing.priceSchedule.items && editing.priceSchedule.items.length > 0
                  ? editing.priceSchedule.items.map(item => 
                      `${item.description || ''}${item.quantity ? ` - Qty: ${item.quantity}` : ''}${item.unit ? ` ${item.unit}` : ''}${item.unitRate ? ` @ ${item.unitRate}` : ''}${item.totalAmount ? ` = ${item.totalAmount}` : ''}`
                    ).join('<br>')
                  : ''))
          : '',
        ourViewpoints: editing.ourViewpoints || '',
        exclusions: editing.exclusions 
          ? (Array.isArray(editing.exclusions) && editing.exclusions.length > 0
              ? editing.exclusions.join('<br>')
              : (typeof editing.exclusions === 'string' ? editing.exclusions : ''))
          : '',
        paymentTerms: editing.paymentTerms 
          ? (Array.isArray(editing.paymentTerms) && editing.paymentTerms.length > 0
              ? editing.paymentTerms.map(term => 
                  `${term.milestoneDescription || ''}${term.amountPercent ? ` - ${term.amountPercent}%` : ''}`
                ).join('<br>')
              : (typeof editing.paymentTerms === 'string' ? editing.paymentTerms : ''))
          : '',
        deliveryCompletionWarrantyValidity: editing.deliveryCompletionWarrantyValidity || {
          deliveryTimeline: '',
          warrantyPeriod: '',
          offerValidity: 30,
          authorizedSignatory: currentUser?.name || ''
        }
      })
    } else {
      // Reset form for new quotation
      setForm({
        lead: '',
        companyInfo: defaultCompany,
        submittedTo: '',
        attention: '',
        offerReference: '',
        enquiryNumber: '',
        offerDate: new Date().toISOString().slice(0, 10),
        enquiryDate: '',
        projectTitle: '',
        introductionText: '',
        scopeOfWork: '',
        priceSchedule: '',
        ourViewpoints: '',
        exclusions: '',
        paymentTerms: '',
        deliveryCompletionWarrantyValidity: {
          deliveryTimeline: '',
          warrantyPeriod: '',
          offerValidity: 30,
          authorizedSignatory: currentUser?.name || ''
        }
      })
    }
  }, [editing, defaultCompany, currentUser])

  useEffect(() => {
    // Pre-populate form with lead data if leadId is provided
    if (leadId && leads.length > 0 && currentUser && !editing) {
      const selectedLead = leads.find(l => l._id === leadId)
      if (selectedLead) {
        setForm(prev => ({
          ...prev,
          lead: selectedLead._id,
          offerDate: new Date().toISOString().slice(0, 10),
          enquiryDate: selectedLead.enquiryDate ? selectedLead.enquiryDate.substring(0, 10) : '',
          projectTitle: selectedLead.projectTitle || '',
          enquiryNumber: selectedLead.enquiryNumber || '',
          deliveryCompletionWarrantyValidity: {
            ...prev.deliveryCompletionWarrantyValidity,
            authorizedSignatory: currentUser?.name || ''
          }
        }))
      }
    }
  }, [leadId, leads, currentUser, editing])

  const handleSave = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      const payload = { ...form }
      
      // Convert scopeOfWork string to array format for backend compatibility
      if (typeof payload.scopeOfWork === 'string') {
        payload.scopeOfWork = payload.scopeOfWork ? [{ description: payload.scopeOfWork, quantity: '', unit: '', locationRemarks: '' }] : []
      }
      
      // Convert priceSchedule string to object format for backend compatibility
      if (typeof payload.priceSchedule === 'string') {
        payload.priceSchedule = payload.priceSchedule ? {
          items: [{ description: payload.priceSchedule, quantity: 0, unit: '', unitRate: 0, totalAmount: 0 }],
          subTotal: 0,
          grandTotal: 0,
          currency: 'AED',
          taxDetails: { vatRate: 5, vatAmount: 0 }
        } : {
          items: [],
          subTotal: 0,
          grandTotal: 0,
          currency: 'AED',
          taxDetails: { vatRate: 5, vatAmount: 0 }
        }
      }
      
      // Convert exclusions string to array format for backend compatibility
      if (typeof payload.exclusions === 'string') {
        payload.exclusions = payload.exclusions 
          ? payload.exclusions.split('<br>').filter(ex => ex.trim())
          : []
      }
      
      // Convert paymentTerms string to array format for backend compatibility
      if (typeof payload.paymentTerms === 'string') {
        payload.paymentTerms = payload.paymentTerms 
          ? payload.paymentTerms.split('<br>').map(term => {
              // Try to parse "Milestone - X%" format
              const match = term.match(/^(.+?)(?:\s*-\s*(\d+(?:\.\d+)?)%)?$/)
              return {
                milestoneDescription: match ? match[1].trim() : term.trim(),
                amountPercent: match && match[2] ? parseFloat(match[2]) : 0
              }
            }).filter(term => term.milestoneDescription)
          : []
      }
      
      if (editing) {
        await api.put(`/api/quotations/${editing._id}`, payload)
        setNotify({ open: true, title: 'Success', message: 'Quotation updated successfully.' })
      } else {
        await api.post('/api/quotations', payload)
        setNotify({ open: true, title: 'Success', message: 'Quotation created successfully.' })
      }
      
      // Navigate back after a short delay
      setTimeout(() => {
        if (location.pathname.includes('/quotations/')) {
          navigate('/quotations')
        } else {
          navigate('/leads')
        }
      }, 1500)
    } catch (err) {
      setNotify({ open: true, title: 'Save Failed', message: err.response?.data?.message || 'We could not save this quotation. Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }


  const handleCancel = () => {
    if (location.pathname.includes('/quotations/')) {
      navigate('/quotations')
    } else {
      navigate('/leads')
    }
  }

  // Determine source based on the route
  const source = location.pathname.includes('/quotations/') ? 'quotations' : 'leads'

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
            {editing ? 'Edit Quotation' : 'Create Quotation'}
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
          <FormField label="Select Lead" required>
            <select 
              value={form.lead} 
              onChange={e => setForm({ ...form, lead: e.target.value })} 
              required
            >
              <option value="">-- Choose Lead --</option>
              {leads.map(l => (
                <option value={l._id} key={l._id}>
                  {l.projectTitle || l.name} — {l.customerName}
                </option>
              ))}
            </select>
          </FormField>

          <FormSection title="Cover & Basic Details">
            <FormField label="Submitted To (Client Company)">
              <input 
                type="text" 
                value={form.submittedTo} 
                onChange={e => setForm({ ...form, submittedTo: e.target.value })} 
              />
            </FormField>
            <FormField label="Attention (Contact Person)">
              <input 
                type="text" 
                value={form.attention} 
                onChange={e => setForm({ ...form, attention: e.target.value })} 
              />
            </FormField>
            <FormRow>
              <FormField label="Offer Reference">
                <input 
                  type="text" 
                  value={form.offerReference} 
                  onChange={e => setForm({ ...form, offerReference: e.target.value })} 
                />
              </FormField>
              <FormField label="Enquiry Number">
                <input 
                  type="text" 
                  value={form.enquiryNumber} 
                  onChange={e => setForm({ ...form, enquiryNumber: e.target.value })} 
                />
              </FormField>
            </FormRow>
            <FormRow>
              <FormField label="Offer Date">
                <input 
                  type="date" 
                  value={form.offerDate} 
                  onChange={e => setForm({ ...form, offerDate: e.target.value })} 
                />
              </FormField>
              <FormField label="Enquiry Date">
                <input 
                  type="date" 
                  value={form.enquiryDate} 
                  onChange={e => setForm({ ...form, enquiryDate: e.target.value })} 
                />
              </FormField>
            </FormRow>
          </FormSection>

          <FormSection title="Project Details">
            <FormField label="Project Title">
              <input 
                type="text" 
                value={form.projectTitle} 
                onChange={e => setForm({ ...form, projectTitle: e.target.value })} 
              />
            </FormField>
            <FormField label="Introduction">
              <textarea 
                value={form.introductionText} 
                onChange={e => setForm({ ...form, introductionText: e.target.value })} 
              />
            </FormField>
          </FormSection>

          <FormSection title="Scope of Work">
            <FormField>
              <ScopeOfWorkEditor
                value={typeof form.scopeOfWork === 'string' ? form.scopeOfWork : ''}
                onChange={(value) => setForm({ ...form, scopeOfWork: value })}
              />
            </FormField>
          </FormSection>

          <FormSection title="Price Schedule">
            <FormField label="Price Schedule">
              <ScopeOfWorkEditor
                value={form.priceSchedule || ''}
                onChange={(html) => setForm({ ...form, priceSchedule: html })}
              />
            </FormField>
          </FormSection>

          <FormSection title="Our Viewpoints / Special Terms">
            <FormField label="Our Viewpoints / Special Terms">
              <textarea 
                value={form.ourViewpoints} 
                onChange={e => setForm({ ...form, ourViewpoints: e.target.value })} 
              />
            </FormField>
          </FormSection>

          <FormSection title="Exclusions">
            <FormField label="Exclusions">
              <ScopeOfWorkEditor
                value={form.exclusions || ''}
                onChange={(html) => setForm({ ...form, exclusions: html })}
              />
            </FormField>
          </FormSection>

          <FormSection title="Payment Terms">
            <FormField label="Payment Terms">
              <ScopeOfWorkEditor
                value={form.paymentTerms || ''}
                onChange={(html) => setForm({ ...form, paymentTerms: html })}
              />
            </FormField>
          </FormSection>

          <FormSection title="Delivery, Completion, Warranty & Validity">
            <FormField label="Delivery / Completion Timeline">
              <input 
                type="text" 
                value={form.deliveryCompletionWarrantyValidity.deliveryTimeline} 
                onChange={e => setForm({ ...form, deliveryCompletionWarrantyValidity: { ...form.deliveryCompletionWarrantyValidity, deliveryTimeline: e.target.value } })} 
              />
            </FormField>
            <FormRow>
              <FormField label="Warranty Period">
                <input 
                  type="text" 
                  value={form.deliveryCompletionWarrantyValidity.warrantyPeriod} 
                  onChange={e => setForm({ ...form, deliveryCompletionWarrantyValidity: { ...form.deliveryCompletionWarrantyValidity, warrantyPeriod: e.target.value } })} 
                />
              </FormField>
              <FormField label="Offer Validity (Days)">
                <input 
                  type="number" 
                  value={form.deliveryCompletionWarrantyValidity.offerValidity} 
                  onChange={e => setForm({ ...form, deliveryCompletionWarrantyValidity: { ...form.deliveryCompletionWarrantyValidity, offerValidity: e.target.value } })} 
                />
              </FormField>
            </FormRow>
            <FormField label="Authorized Signatory">
              <input 
                type="text" 
                value={form.deliveryCompletionWarrantyValidity.authorizedSignatory} 
                onChange={e => setForm({ ...form, deliveryCompletionWarrantyValidity: { ...form.deliveryCompletionWarrantyValidity, authorizedSignatory: e.target.value } })} 
              />
            </FormField>
          </FormSection>

          <div className="form-actions">
            <button type="button" onClick={handleCancel} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" className="save-btn" disabled={isSaving}>
              {isSaving ? 'Saving...' : (editing ? 'Save Changes' : 'Create Quotation')}
            </button>
          </div>
        </form>
      </div>

      {notify.open && (
        <Modal
          isOpen={notify.open}
          onClose={() => setNotify({ open: false, title: '', message: '' })}
          title={notify.title || 'Notice'}
          size="small"
        >
          <p>{notify.message}</p>
          <div className="form-actions">
            <button 
              type="button" 
              className="save-btn" 
              onClick={() => setNotify({ open: false, title: '', message: '' })}
            >
              OK
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default QuotationFormPage

