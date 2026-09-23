import { useEffect, useState, useRef } from 'react'
import { api, apiFetch } from '../lib/api'
import { Modal } from '../design-system/Modal'
import './LeadManagement.css'
import './LeadDetail.css'
import '../design-system/Modal.css'
import './LoadingComponents.css'
import { ButtonLoader } from './LoadingComponents'
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
      </div>
      
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
        
        <button type="button" onClick={() => execCommand('outdent')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Decrease Indent">
          ⬅
        </button>
        <button type="button" onClick={() => execCommand('indent')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Increase Indent">
          ➡
        </button>
        
        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
        
        <button type="button" onClick={handleInsertLink} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Insert Link">
          🔗
        </button>
        
        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
        
        <button type="button" onClick={() => execCommand('removeFormat')} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--input)', cursor: 'pointer' }} title="Clear Formatting">
          Clear
        </button>
      </div>
      
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

function RevisionDetail() {
  const [revision, setRevision] = useState(null)
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })
  const [editModal, setEditModal] = useState({ open: false, form: null, mode: 'edit' })
  const [approvedEditBlockModal, setApprovedEditBlockModal] = useState({ open: false })
  const [showHistory, setShowHistory] = useState(false)
  const [profileUser, setProfileUser] = useState(null)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [approvalModal, setApprovalModal] = useState({ open: false, action: null, note: '' })
  const [sendApprovalConfirmModal, setSendApprovalConfirmModal] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ open: false })
  const [printPreviewModal, setPrintPreviewModal] = useState({ open: false, pdfUrl: null, revision: null })
  const [createProjectModal, setCreateProjectModal] = useState({ open: false, revision: null, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', assignedProjectEngineerIds: [] }, engineers: [], ack: false, selectedFiles: [], previewFiles: [] })
  const [showApprovals, setShowApprovals] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingAction, setLoadingAction] = useState(null)
  const [isCreateMode, setIsCreateMode] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [sourceQuotationId, setSourceQuotationId] = useState(null)
  const [sourceRevisionId, setSourceRevisionId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [childRevisions, setChildRevisions] = useState([])

  
  const defaultCompany = {
    logo,
    name: 'Engineering Operations ERP',
    address: 'Dubai, UAE',
    phone: '+971-00-000-0000',
    email: 'info@example.com'
  }

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
    deliveryCompletionWarrantyValidity: {
      deliveryTimeline: '',
      warrantyPeriod: '',
      offerValidity: 30,
      authorizedSignatory: currentUser?.name || ''
    }
  })

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem('token')
        const createMode = localStorage.getItem('revisionCreateMode')
        
        if (createMode === 'true') {
          // Handle create mode
          setIsCreateMode(true)
          const formDataStr = localStorage.getItem('revisionFormData')
          const sourceQuotId = localStorage.getItem('revisionSourceQuotationId')
          const sourceRevId = localStorage.getItem('revisionSourceRevisionId')
          
          if (formDataStr) {
            try {
              const formData = JSON.parse(formDataStr)
              // Ensure all required fields exist with defaults
              setForm({
                companyInfo: formData.companyInfo || defaultCompany,
                submittedTo: formData.submittedTo || '',
                attention: formData.attention || '',
                offerReference: formData.offerReference || '',
                enquiryNumber: formData.enquiryNumber || '',
                offerDate: formData.offerDate || '',
                enquiryDate: formData.enquiryDate || '',
                projectTitle: formData.projectTitle || '',
                introductionText: formData.introductionText || '',
                scopeOfWork: formData.scopeOfWork || '',
                priceSchedule: formData.priceSchedule || '',
                ourViewpoints: formData.ourViewpoints || '',
                exclusions: formData.exclusions || '',
                paymentTerms: formData.paymentTerms || '',
                deliveryCompletionWarrantyValidity: formData.deliveryCompletionWarrantyValidity || {
                  deliveryTimeline: '',
                  warrantyPeriod: '',
                  offerValidity: 30,
                  authorizedSignatory: currentUser?.name || ''
                }
              })
            } catch {}
          }
          
          if (sourceQuotId) {
            setSourceQuotationId(sourceQuotId)
          } else if (sourceRevId) {
            setSourceRevisionId(sourceRevId)
          }
          
          // Clean up localStorage
          localStorage.removeItem('revisionCreateMode')
          localStorage.removeItem('revisionFormData')
          localStorage.removeItem('revisionSourceQuotationId')
          localStorage.removeItem('revisionSourceRevisionId')
        } else {
          // Handle view/edit mode
          const rid = localStorage.getItem('revisionId')
          const editMode = localStorage.getItem('revisionEditMode')
          if (!rid) return
          const res = await apiFetch(`/api/revisions/${rid}`)
          const rev = await res.json()
          setRevision(rev)
          
          // Show full-page edit form if in edit mode
          if (editMode === 'true') {
            localStorage.removeItem('revisionEditMode')
            // Block editing if revision is approved
            if (rev.managementApproval?.status === 'approved') {
              setNotify({ open: true, title: 'Cannot Edit Approved Revision', message: 'This revision has been approved and cannot be edited. Please create a new revision if you need to make changes.' })
              setIsEditMode(false)
            } else {
              // Keep revisionEditFromListing flag if it exists (for cancel navigation)
              setIsEditMode(true)
            }
            // Populate form with revision data
            setForm({
              companyInfo: rev.companyInfo || defaultCompany,
              submittedTo: rev.submittedTo || '',
              attention: rev.attention || '',
              offerReference: rev.offerReference || '',
              enquiryNumber: rev.enquiryNumber || '',
              offerDate: rev.offerDate ? String(rev.offerDate).slice(0,10) : '',
              enquiryDate: rev.enquiryDate ? String(rev.enquiryDate).slice(0,10) : '',
              projectTitle: rev.projectTitle || rev.lead?.projectTitle || '',
              introductionText: rev.introductionText || '',
              scopeOfWork: rev.scopeOfWork || '',
              priceSchedule: rev.priceSchedule || '',
              ourViewpoints: rev.ourViewpoints || '',
              exclusions: rev.exclusions || '',
              paymentTerms: rev.paymentTerms || '',
              deliveryCompletionWarrantyValidity: rev.deliveryCompletionWarrantyValidity || {
                deliveryTimeline: '',
                warrantyPeriod: '',
                offerValidity: 30,
                authorizedSignatory: currentUser?.name || ''
              }
            })
          }
          
          // Fetch child revisions to check if one already exists
          try {
            const childRes = await apiFetch(`/api/revisions?parentRevision=${rev._id}`)
            const childRevs = await childRes.json()
            setChildRevisions(Array.isArray(childRevs) ? childRevs : [])
          } catch {
            setChildRevisions([])
          }
        }
      } catch {}
    }
    load()
  }, [])

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

  const exportPDF = async () => {
    try {
      if (!revision) return
      await ensurePdfMake()
      const logoDataUrl = await toDataURL(revision.companyInfo?.logo || logo)
      const currency = revision.priceSchedule?.currency || 'AED'

      // Lead details and site visits
      let leadFull = revision.lead || null
      let siteVisits = []
      try {
        const token = localStorage.getItem('token')
        const leadId = typeof revision.lead === 'object' ? revision.lead?._id : revision.lead
        if (leadId) {
          const resLead = await api.get(`/api/leads/${leadId}`)
          leadFull = resLead.data
          const resVisits = await api.get(`/api/leads/${leadId}/site-visits`)
          siteVisits = Array.isArray(resVisits.data) ? resVisits.data : []
        }
      } catch {}

      const coverFieldsRaw = [
        ['Submitted To', revision.submittedTo],
        ['Attention', revision.attention],
        ['Offer Reference', revision.offerReference],
        ['Enquiry Number', revision.enquiryNumber || leadFull?.enquiryNumber],
        ['Offer Date', revision.offerDate ? new Date(revision.offerDate).toLocaleDateString() : ''],
        ['Enquiry Date', revision.enquiryDate ? new Date(revision.enquiryDate).toLocaleDateString() : ''],
        ['Project Title', revision.projectTitle || leadFull?.projectTitle]
      ]
      const coverFields = coverFieldsRaw.filter(([, v]) => v && String(v).trim().length > 0)

      const scopeRows = (revision.scopeOfWork || [])
        .filter(s => (s?.description || '').trim().length > 0)
        .map((s, i) => [
          String(i + 1),
          s.description,
          String(s.quantity || ''),
          s.unit || '',
          s.locationRemarks || ''
        ])

      const priceItems = (revision.priceSchedule?.items || [])
        .filter(it => (it?.description || '').trim().length > 0 || Number(it.quantity) > 0 || Number(it.unitRate) > 0)
      const priceRows = priceItems.map((it, i) => [
        String(i + 1),
        it.description || '',
        String(it.quantity || 0),
        it.unit || '',
        `${currency} ${Number(it.unitRate || 0).toFixed(2)}`,
        `${currency} ${Number((it.quantity || 0) * (it.unitRate || 0)).toFixed(2)}`
      ])

      const exclusions = (revision.exclusions || []).map(x => String(x || '').trim()).filter(Boolean)
      const paymentTerms = (revision.paymentTerms || []).filter(p => (p?.milestoneDescription || '').trim().length > 0 || String(p?.amountPercent || '').trim().length > 0)

      const dcwv = revision.deliveryCompletionWarrantyValidity || {}
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
                { text: revision.companyInfo?.name || 'Company', style: 'brand' },
                { text: [revision.companyInfo?.address, revision.companyInfo?.phone, revision.companyInfo?.email].filter(Boolean).join(' | '), color: '#64748b', fontSize: 9 }
              ]
            ],
            columnGap: 12
          },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.5, lineColor: '#e5e7eb' }] }
        ]
      }

      const content = []
      content.push({ text: `Revision ${revision.revisionNumber} — Commercial Quotation`, style: 'h1', margin: [0, 0, 0, 8] })

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
                  [{ text: 'Sub Total', style: 'tdKey' }, { text: `${currency} ${Number(revision.priceSchedule?.subTotal || 0).toFixed(2)}`, alignment: 'right' }],
                  [{ text: `VAT (${revision.priceSchedule?.taxDetails?.vatRate || 0}%)`, style: 'tdKey' }, { text: `${currency} ${Number(revision.priceSchedule?.taxDetails?.vatAmount || 0).toFixed(2)}`, alignment: 'right' }],
                  [{ text: 'Grand Total', style: 'th' }, { text: `${currency} ${Number(revision.priceSchedule?.grandTotal || 0).toFixed(2)}`, style: 'th', alignment: 'right' }]
                ]
              },
              layout: 'lightHorizontalLines'
            }
          ],
          margin: [0, 8, 0, 0]
        })
      }

      if ((revision.ourViewpoints || '').trim().length > 0 || exclusions.length > 0) {
        content.push({ text: 'Our Viewpoints / Special Terms', style: 'h2', margin: [0, 12, 0, 6] })
        if ((revision.ourViewpoints || '').trim().length > 0) {
          content.push({ text: revision.ourViewpoints, margin: [0, 0, 0, 6] })
        }
        if (exclusions.length > 0) {
          content.push({ text: 'Exclusions', style: 'h3', margin: [0, 6, 0, 4] })
          content.push({ ul: exclusions })
        }
      }

      if (paymentTerms.length > 0) {
        content.push({ text: 'Payment Terms', style: 'h2', margin: [0, 12, 0, 6] })
        content.push({
          table: {
            widths: ['10%', '70%', '20%'],
            body: [
              [{ text: '#', style: 'th' }, { text: 'Milestone', style: 'th' }, { text: 'Amount %', style: 'th' }],
              ...paymentTerms.map((p, i) => [String(i + 1), p.milestoneDescription || '', String(p.amountPercent || '')])
            ]
          },
          layout: 'lightHorizontalLines'
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

      const docDefinition = {
        pageMargins: [36, 96, 36, 60],
        header,
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
        defaultStyle: { fontSize: 10, lineHeight: 1.2 }
      }

      const filename = `Revision_${revision.revisionNumber}_${revision.projectTitle || 'Quotation'}.pdf`
      window.pdfMake.createPdf(docDefinition).download(filename)
    } catch (e) {
      setNotify({ open: true, title: 'Export Failed', message: 'We could not generate the PDF for this revision. Please try again.' })
    }
  }

  // Convert rich text HTML to pdfMake-friendly fragments (preserve inline styles)
  const htmlToPdfFragments = (html) => {
    if (!html) return [{ text: "" }];

    const fallback = (raw) => {
      const withBreaks = raw
        .replace(/\<\s*br\s*\/?\>/gi, "\n")
        .replace(/\<\/\s*li\s*\>/gi, "\n")
        .replace(/\<\s*li\s*\>/gi, "• ");
      const stripped = withBreaks.replace(/\<[^\>]+\>/g, "");
      return [{ text: stripped.trim() }];
    };

    const applyInlineStyles = (node, base = {}) => {
      const next = { ...base };
      const style = (node.getAttribute && node.getAttribute("style")) || "";
      if (style) {
        const colorMatch = style.match(/color\s*:\s*([^;]+)/i);
        if (colorMatch) next.color = colorMatch[1].trim();
        const bgMatch = style.match(/background(?:-color)?\s*:\s*([^;]+)/i);
        if (bgMatch) next.background = bgMatch[1].trim();
        const ffMatch = style.match(/font-family\s*:\s*([^;]+)/i);
        if (ffMatch) next.font = ffMatch[1].trim().replace(/['"]/g, "");
        const fsMatch = style.match(/font-size\s*:\s*([^;]+)/i);
        if (fsMatch) {
          const raw = fsMatch[1].trim();
          const num = parseFloat(raw);
          if (!Number.isNaN(num)) next.fontSize = num;
        }
      }
      if (node.tagName?.toLowerCase() === "font" && node.getAttribute) {
        const c = node.getAttribute("color");
        if (c) next.color = c;
      }
      return next;
    };

    if (typeof DOMParser === "undefined" || typeof Node === "undefined") {
      return fallback(html);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");

    const walk = (node, inherited = {}) => {
      const results = [];
      const pushText = (text, style = inherited) => {
        if (text === undefined || text === null) return;
        const val = String(text);
        if (val.length === 0) return;
        results.push({ text: val, ...style });
      };

      switch (node.nodeType) {
        case Node.TEXT_NODE: {
          const t = node.textContent || "";
          if (t.trim().length === 0 && /\s+/.test(t)) break;
          pushText(t, inherited);
          break;
        }
        case Node.ELEMENT_NODE: {
          const tag = node.tagName.toLowerCase();
          const next = applyInlineStyles(node, inherited);
          if (["strong", "b"].includes(tag)) next.bold = true;
          if (["em", "i"].includes(tag)) next.italics = true;
          if (tag === "u") next.decoration = "underline";
          if (["h1", "h2", "h3", "h4"].includes(tag)) next.fontSize = 12;

          if (tag === "br") {
            results.push({ text: "\n", ...next });
            break;
          }

          if (tag === "ul" || tag === "ol") {
            const isOrdered = tag === "ol";
            const items = [];
            node.childNodes.forEach((child, idx) => {
              if (child.tagName?.toLowerCase() === "li") {
                const liParts = walk(child, next);
                const combined = liParts
                  .map((p) => p.text || "")
                  .join("")
                  .trim();
                if (combined.length) {
                  items.push({
                    text: isOrdered ? `${idx + 1}. ${combined}` : `• ${combined}`,
                    ...next,
                  });
                }
              }
            });
            if (items.length) {
              results.push({ stack: items, margin: [0, 0, 0, 2] });
            }
            break;
          }

          if (tag === "li") {
            node.childNodes.forEach((child) => {
              results.push(...walk(child, next));
            });
            break;
          }

          const blockLike = ["p", "div", "h1", "h2", "h3", "h4"].includes(tag);
          const children = [];
          node.childNodes.forEach((child) => {
            children.push(...walk(child, next));
          });
          if (children.length) {
            if (blockLike) {
              results.push({ stack: children, margin: [0, 0, 0, 4] });
            } else {
              results.push(...children);
            }
          }
          break;
        }
        default:
          break;
      }

      return results;
    };

    const output = [];
    doc.body.childNodes.forEach((n) => output.push(...walk(n)));
    if (!output.length) return fallback(html);
    return output;
  };

  const richTextCell = (val) => {
    const frags = htmlToPdfFragments(val);
    return { stack: frags, preserveLeadingSpaces: true, margin: [0, 0, 0, 2] };
  };

  const generatePDFPreview = async () => {
    try {
      if (!revision) return
      await ensurePdfMake()
      const logoDataUrl = await toDataURL(revision.companyInfo?.logo || logo)
      const currency = revision.priceSchedule?.currency || 'AED'

      // Lead details and site visits
      let leadFull = revision.lead || null
      let siteVisits = []
      try {
        const token = localStorage.getItem('token')
        const leadId = typeof revision.lead === 'object' ? revision.lead?._id : revision.lead
        if (leadId) {
          const resLead = await api.get(`/api/leads/${leadId}`)
          leadFull = resLead.data
          const resVisits = await api.get(`/api/leads/${leadId}/site-visits`)
          siteVisits = Array.isArray(resVisits.data) ? resVisits.data : []
        }
      } catch {}

      const coverFieldsRaw = [
        ['Submitted To', revision.submittedTo],
        ['Attention', revision.attention],
        ['Offer Reference', revision.offerReference],
        ['Enquiry Number', revision.enquiryNumber || leadFull?.enquiryNumber],
        ['Offer Date', revision.offerDate ? new Date(revision.offerDate).toLocaleDateString() : ''],
        ['Enquiry Date', revision.enquiryDate ? new Date(revision.enquiryDate).toLocaleDateString() : ''],
        ['Project Title', revision.projectTitle || leadFull?.projectTitle]
      ]
      const coverFields = coverFieldsRaw.filter(([, v]) => v && String(v).trim().length > 0)

      // Handle scopeOfWork - stored as HTML string
      const scopeOfWorkHtml = typeof revision.scopeOfWork === 'string' ? revision.scopeOfWork : ''
      const hasScope = scopeOfWorkHtml && scopeOfWorkHtml.trim().length > 0

      // Handle priceSchedule - stored as HTML string
      const priceScheduleHtml = typeof revision.priceSchedule === 'string' ? revision.priceSchedule : ''
      const hasPrice = priceScheduleHtml && priceScheduleHtml.trim().length > 0
      
      // Handle exclusions - stored as HTML string
      const exclusionsHtml = typeof revision.exclusions === 'string' ? revision.exclusions : ''
      const hasExclusions = exclusionsHtml && exclusionsHtml.trim().length > 0
      
      // Handle paymentTerms - stored as HTML string
      const paymentTermsHtml = typeof revision.paymentTerms === 'string' ? revision.paymentTerms : ''
      const hasPaymentTerms = paymentTermsHtml && paymentTermsHtml.trim().length > 0

      const dcwv = revision.deliveryCompletionWarrantyValidity || {}
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
                { text: revision.companyInfo?.name || 'Company', style: 'brand' },
                { text: [revision.companyInfo?.address, revision.companyInfo?.phone, revision.companyInfo?.email].filter(Boolean).join(' | '), color: '#64748b', fontSize: 9 }
              ]
            ],
            columnGap: 12
          },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.5, lineColor: '#e5e7eb' }] }
        ]
      }

      const content = []
      content.push({ text: `Revision ${revision.revisionNumber} — Commercial Quotation`, style: 'h1', margin: [0, 0, 0, 8] })

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

      // Scope of Work section
      if (hasScope) {
        content.push({ text: 'Scope of Work', style: 'h2', margin: [0, 10, 0, 6] })
        content.push(richTextCell(scopeOfWorkHtml))
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

      // Price Schedule section
      if (hasPrice) {
        content.push({ text: 'Price Schedule', style: 'h2', margin: [0, 12, 0, 6] })
        content.push(richTextCell(priceScheduleHtml))

        content.push({
          columns: [
            { width: '*', text: '' },
            {
              width: '40%',
              table: {
                widths: ['55%', '45%'],
                body: [
                  [{ text: 'Sub Total', style: 'tdKey' }, { text: `${currency} ${Number(revision.priceSchedule?.subTotal || 0).toFixed(2)}`, alignment: 'right' }],
                  [{ text: `VAT (${revision.priceSchedule?.taxDetails?.vatRate || 0}%)`, style: 'tdKey' }, { text: `${currency} ${Number(revision.priceSchedule?.taxDetails?.vatAmount || 0).toFixed(2)}`, alignment: 'right' }],
                  [{ text: 'Grand Total', style: 'th' }, { text: `${currency} ${Number(revision.priceSchedule?.grandTotal || 0).toFixed(2)}`, style: 'th', alignment: 'right' }]
                ]
              },
              layout: 'lightHorizontalLines'
            }
          ],
          margin: [0, 8, 0, 0]
        })
      }

      // Our Viewpoints / Exclusions section
      if ((revision.ourViewpoints || '').trim().length > 0 || hasExclusions) {
        content.push({ text: 'Our Viewpoints / Special Terms', style: 'h2', margin: [0, 12, 0, 6] })
        if ((revision.ourViewpoints || '').trim().length > 0) {
          content.push(richTextCell(revision.ourViewpoints))
        }
        if (hasExclusions) {
          content.push({ text: 'Exclusions', style: 'h3', margin: [0, 6, 0, 4] })
          content.push(richTextCell(exclusionsHtml))
        }
      }

      // Payment Terms section
      if (hasPaymentTerms) {
        content.push({ text: 'Payment Terms', style: 'h2', margin: [0, 12, 0, 6] })
        content.push(richTextCell(paymentTermsHtml))
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

      const docDefinition = {
        pageMargins: [36, 96, 36, 60],
        header,
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
        defaultStyle: { fontSize: 10, lineHeight: 1.2 }
      }

      const pdfDoc = window.pdfMake.createPdf(docDefinition)
      pdfDoc.getDataUrl((dataUrl) => {
        setPrintPreviewModal({ open: true, pdfUrl: dataUrl, revision: revision })
      })
    } catch (e) {
      setNotify({ open: true, title: 'Preview Failed', message: 'We could not generate the PDF preview. Please try again.' })
    }
  }

  const approveRevision = async (status, note) => {
    try {
      if (!revision) return
      const token = localStorage.getItem('token')
      await apiFetch(`/api/revisions/${revision._id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ status, note })
      })
      const res = await apiFetch(`/api/revisions/${revision._id}`)
      const updated = await res.json()
      setRevision(updated)
      setApprovalModal({ open: false, action: null, note: '' })
    } catch (e) {
      setNotify({ open: true, title: 'Approval Failed', message: 'We could not update approval. Please try again.' })
    }
  }



  const handleProjectFileChange = (e) => {
    const files = Array.from(e.target.files)
    setCreateProjectModal(prev => ({
      ...prev,
      selectedFiles: [...prev.selectedFiles, ...files]
    }))
    
    // Create previews for images and videos
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setCreateProjectModal(prev => ({
            ...prev,
            previewFiles: [...prev.previewFiles, { file, preview: reader.result, type: 'image' }]
          }))
        }
        reader.readAsDataURL(file)
      } else if (file.type.startsWith('video/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setCreateProjectModal(prev => ({
            ...prev,
            previewFiles: [...prev.previewFiles, { file, preview: reader.result, type: 'video' }]
          }))
        }
        reader.readAsDataURL(file)
      } else {
        setCreateProjectModal(prev => ({
          ...prev,
          previewFiles: [...prev.previewFiles, { file, preview: null, type: 'document' }]
        }))
      }
    })
  }

  const removeProjectFile = (index) => {
    setCreateProjectModal(prev => ({
      ...prev,
      selectedFiles: prev.selectedFiles.filter((_, i) => i !== index),
      previewFiles: prev.previewFiles.filter((_, i) => i !== index)
    }))
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const sendForApproval = async () => {
    try {
      if (!revision) return
      const token = localStorage.getItem('token')
      await apiFetch(`/api/revisions/${revision._id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending' })
      })
      const res = await apiFetch(`/api/revisions/${revision._id}`)
      const updated = await res.json()
      setRevision(updated)
      setSendApprovalConfirmModal(false)
      setNotify({ open: true, title: 'Request Sent', message: 'Approval request has been sent successfully.' })
    } catch (e) {
      setNotify({ open: true, title: 'Send Failed', message: 'We could not send for approval. Please try again.' })
    }
  }

  const formatHistoryValue = (field, value) => {
    // Handle null/undefined
    if (value === null || value === undefined) return '(empty)'
    
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
        return value.map((t, i) => {
          if (typeof t === 'string') return `${i + 1}. ${t}`
          if (!t || typeof t !== 'object') return `${i + 1}. ${String(t)}`
          return `${i + 1}. ${t?.milestoneDescription || '-'} — ${t?.amountPercent ?? ''}%`
        }).join('\n')
      }
      
      if (field === 'scopeOfWork') {
        return value.map((s, i) => {
          if (typeof s === 'string') return `${i + 1}. ${s}`
          if (!s || typeof s !== 'object') return `${i + 1}. ${String(s)}`
          const qtyUnit = [s?.quantity ?? '', s?.unit || ''].filter(x => String(x).trim().length > 0).join(' ')
          const remarks = s?.locationRemarks ? ` — ${s.locationRemarks}` : ''
          return `${i + 1}. ${s?.description || '-'}${qtyUnit ? ` — Qty: ${qtyUnit}` : ''}${remarks}`
        }).join('\n')
      }
      
      if (field === 'exclusions') {
        return value.map((v, i) => `${i + 1}. ${String(v)}`).join('\n')
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
      }).join('\n')
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
        return lines.length > 0 ? lines.join('\n') : '(empty)'
      }
      
      if (field === 'deliveryCompletionWarrantyValidity') {
        const d = value || {}
        const lines = []
        if (d?.deliveryTimeline) lines.push(`Delivery Timeline: ${d.deliveryTimeline}`)
        if (d?.warrantyPeriod) lines.push(`Warranty Period: ${d.warrantyPeriod}`)
        if (d?.offerValidity !== undefined && d?.offerValidity !== null) lines.push(`Offer Validity: ${d.offerValidity} days`)
        if (d?.authorizedSignatory) lines.push(`Authorized Signatory: ${d.authorizedSignatory}`)
        return lines.length > 0 ? lines.join('\n') : '(empty)'
      }
      
      if (field === 'companyInfo') {
        const ci = value || {}
        const lines = []
        if (ci?.name) lines.push(`Name: ${ci.name}`)
        if (ci?.address) lines.push(`Address: ${ci.address}`)
        if (ci?.phone) lines.push(`Phone: ${ci.phone}`)
        if (ci?.email) lines.push(`Email: ${ci.email}`)
        return lines.length > 0 ? lines.join('\n') : '(empty)'
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
      return entries.length > 0 ? entries.join('\n') : '(empty)'
    }
    
    // Handle primitive types
    if (typeof value === 'string') {
      // Try to parse JSON string if value looks like JSON
      if ((value.startsWith('{') || value.startsWith('[')) && value.length > 1) {
        try {
          const parsed = JSON.parse(value)
          // Recursively format the parsed value
          return formatHistoryValue(field, parsed)
        } catch {
          // Not valid JSON, return as string
          return value.trim() || '(empty)'
        }
      }
      return value.trim() || '(empty)'
    }
    
    // Handle numbers and booleans
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    
    return String(value)
  }

  const recalcTotals = (items, vatRate) => {
    const sub = items.reduce((sum, it) => sum + (Number(it.quantity || 0) * Number(it.unitRate || 0)), 0)
    const vat = sub * (Number(vatRate || 0) / 100)
    const grand = sub + vat
    return { subTotal: Number(sub.toFixed(2)), vatAmount: Number(vat.toFixed(2)), grandTotal: Number(grand.toFixed(2)) }
  }

  const handleSave = async (e) => {
    if (e) e.preventDefault()
    setIsSaving(true)
    try {
      const formData = { ...form }
      
      if (isEditMode && revision?._id) {
        // Handle edit mode - update existing revision
        // Convert to backend format for edit
        const payload = { ...formData }
        
        // No conversion needed: backend now accepts strings
        // Payload already has the correct format from form
        
        await apiFetch(`/api/revisions/${revision._id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(payload)
        })
        
        // Reload the revision to get updated data
        const res = await apiFetch(`/api/revisions/${revision._id}`)
        const updated = await res.json()
        setRevision(updated)
        setIsEditMode(false)
        setNotify({ open: true, title: 'Saved', message: 'Revision updated successfully.' })
      } else {
        // Handle create mode - check for changes if we have a source
        if (sourceQuotationId || sourceRevisionId) {
          let original = null
          try {
            if (sourceQuotationId) {
              const res = await apiFetch(`/api/quotations/${sourceQuotationId}`)
              original = await res.json()
            } else if (sourceRevisionId) {
              const res = await apiFetch(`/api/revisions/${sourceRevisionId}`)
              original = await res.json()
            }
          } catch {}
          
          if (original) {
            // Convert original to same format as form (HTML strings) for comparison
            const originalFormFormat = {
              companyInfo: original.companyInfo || {},
              submittedTo: original.submittedTo || '',
              attention: original.attention || '',
              offerReference: original.offerReference || '',
              enquiryNumber: original.enquiryNumber || '',
              offerDate: original.offerDate ? original.offerDate.substring(0,10) : '',
              enquiryDate: original.enquiryDate ? original.enquiryDate.substring(0,10) : '',
              projectTitle: original.projectTitle || original.lead?.projectTitle || '',
              introductionText: original.introductionText || '',
              scopeOfWork: Array.isArray(original.scopeOfWork)
                ? original.scopeOfWork.map(item => item.description || '').join('<br>')
                : original.scopeOfWork || '',
              priceSchedule: Array.isArray(original.priceSchedule?.items)
                ? original.priceSchedule.items.map(item => `${item.description || ''}${item.quantity ? ` - Qty: ${item.quantity}` : ''}${item.unit ? ` ${item.unit}` : ''}${item.unitRate ? ` @ ${item.unitRate}` : ''}${item.totalAmount ? ` = ${item.totalAmount}` : ''}`).join('<br>')
                : '',
              ourViewpoints: original.ourViewpoints || '',
              exclusions: Array.isArray(original.exclusions)
                ? original.exclusions.join('<br>')
                : original.exclusions || '',
              paymentTerms: Array.isArray(original.paymentTerms)
                ? original.paymentTerms.map(term => `${term.milestoneDescription || ''}${term.amountPercent ? ` - ${term.amountPercent}%` : ''}`).join('<br>')
                : original.paymentTerms || '',
              deliveryCompletionWarrantyValidity: original.deliveryCompletionWarrantyValidity || { deliveryTimeline: '', warrantyPeriod: '', offerValidity: 30, authorizedSignatory: currentUser?.name || '' }
            }
            
            // Helper function to normalize HTML content for comparison
            const normalizeHtml = (html) => {
              if (!html) return ''
              // Create a temporary div to parse HTML
              const temp = document.createElement('div')
              temp.innerHTML = html
              // Get text content and normalize whitespace
              let text = temp.textContent || temp.innerText || ''
              // Replace multiple whitespace with single space
              text = text.replace(/\s+/g, ' ').trim()
              return text
            }
            
            // Compare form data (both in HTML string format)
            const fields = ['companyInfo','submittedTo','attention','offerReference','enquiryNumber','offerDate','enquiryDate','projectTitle','introductionText','scopeOfWork','priceSchedule','ourViewpoints','exclusions','paymentTerms','deliveryCompletionWarrantyValidity']
            let changed = false
            for (const f of fields) {
              if (f === 'companyInfo' || f === 'deliveryCompletionWarrantyValidity') {
                if (JSON.stringify(originalFormFormat[f] ?? null) !== JSON.stringify(formData[f] ?? null)) { 
                  changed = true
                  break 
                }
              } else {
                // For string fields, normalize HTML and compare text content
                const originalVal = normalizeHtml(String(originalFormFormat[f] ?? ''))
                const formVal = normalizeHtml(String(formData[f] ?? ''))
                if (originalVal !== formVal) {
                  changed = true
                  break
                }
              }
            }
            if (!changed) {
              setNotify({ open: true, title: 'No Changes', message: 'No changes detected. Please modify data before creating a revision.' })
              setIsSaving(false)
              return
            }
          }
        }
        
        // Now convert to backend format
        const payload = { ...formData }
        
        // No conversion needed: backend now accepts strings
        // Payload already has the correct format from form
        
        const requestBody = sourceQuotationId 
          ? { sourceQuotationId, data: payload }
          : { sourceRevisionId, data: payload }
        
        await apiFetch('/api/revisions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(requestBody)
        })
        
        setNotify({ open: true, title: 'Revision Created', message: 'The revision was created successfully.' })
        setTimeout(() => {
          window.location.href = '/revisions'
        }, 1500)
      }
    } catch (e) {
      setNotify({ open: true, title: isEditMode ? 'Save Failed' : 'Create Failed', message: e.message || (isEditMode ? 'We could not save your changes. Please try again.' : 'We could not create the revision. Please try again.') })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    if (isEditMode) {
      // Check if we came from the listing page
      const fromListing = localStorage.getItem('revisionEditFromListing')
      if (fromListing === 'true') {
        // Navigate back to listing page
        localStorage.removeItem('revisionEditFromListing')
        window.location.href = '/revisions'
        return
      }
      // If editing from detail page, just exit edit mode and show the detail view
      setIsEditMode(false)
      // Reload revision to ensure we have the latest data
      const loadRevision = async () => {
        try {
          const res = await apiFetch(`/api/revisions/${revision._id}`)
          const rev = await res.json()
          setRevision(rev)
        } catch {}
      }
      loadRevision()
    } else {
      window.location.href = '/revisions'
    }
  }

  // Show edit form if in edit mode
  if (isEditMode && revision) {
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
              Edit Revision
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
                <input type="text" value={form.submittedTo || ''} onChange={e => setForm({ ...form, submittedTo: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Attention (Contact Person)</label>
                <input type="text" value={form.attention || ''} onChange={e => setForm({ ...form, attention: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Offer Reference</label>
                  <input type="text" value={form.offerReference || ''} onChange={e => setForm({ ...form, offerReference: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Enquiry Number</label>
                  <input type="text" value={form.enquiryNumber || ''} onChange={e => setForm({ ...form, enquiryNumber: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Offer Date</label>
                  <input type="date" value={form.offerDate || ''} onChange={e => setForm({ ...form, offerDate: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Enquiry Date</label>
                  <input type="date" value={form.enquiryDate || ''} onChange={e => setForm({ ...form, enquiryDate: e.target.value })} />
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
                  value={form.priceSchedule || ''}
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
                  value={form.exclusions || ''}
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
                  value={form.paymentTerms || ''}
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

            <div className="form-actions" style={{ marginTop: '32px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="cancel-btn" onClick={handleCancel}>Cancel</button>
              <button type="submit" className="save-btn" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

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
    )
  }

  // Show create form if in create mode
  if (isCreateMode) {
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
              Create Revision
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
                <input type="text" value={form.submittedTo || ''} onChange={e => setForm({ ...form, submittedTo: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Attention (Contact Person)</label>
                <input type="text" value={form.attention || ''} onChange={e => setForm({ ...form, attention: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Offer Reference</label>
                  <input type="text" value={form.offerReference || ''} onChange={e => setForm({ ...form, offerReference: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Enquiry Number</label>
                  <input type="text" value={form.enquiryNumber || ''} onChange={e => setForm({ ...form, enquiryNumber: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Offer Date</label>
                  <input type="date" value={form.offerDate || ''} onChange={e => setForm({ ...form, offerDate: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Enquiry Date</label>
                  <input type="date" value={form.enquiryDate || ''} onChange={e => setForm({ ...form, enquiryDate: e.target.value })} />
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
                  value={form.priceSchedule || ''}
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
                  value={form.exclusions || ''}
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
                  value={form.paymentTerms || ''}
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

            <div className="form-actions" style={{ marginTop: '32px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="cancel-btn" onClick={handleCancel}>Cancel</button>
              <button type="submit" className="save-btn" disabled={isSaving}>
                {isSaving ? 'Creating...' : 'Create Revision'}
              </button>
            </div>
          </form>
        </div>

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
    )
  }

  if (!revision) return (
    <div className="lead-management" style={{ padding: 24 }}>
      <h2>Revision Details</h2>
      <p>Nothing to display.</p>
    </div>
  )

  const currency = revision.priceSchedule?.currency || 'AED'
  const approvalStatus = revision.managementApproval?.status

  return (
    <div className="lead-detail">
      <div className="ld-header">
        <div className="ld-title">
          <div className="title-row">
            <h1>Revision {revision.revisionNumber} — {revision.projectTitle || revision.lead?.projectTitle || 'Revision'}</h1>
          </div>
          <span className="ld-subtitle">Parent Offer Ref: {revision.parentQuotation?.offerReference || 'N/A'}</span>
        </div>
        <div className="ld-sticky-actions">
          <button className="link-btn" onClick={async () => {
            try {
              const token = localStorage.getItem('token')
              const res = await apiFetch(`/api/projects/by-revision/${revision._id}`)
              if (res.ok) {
                const pj = await res.json()
                try {
                  localStorage.setItem('projectsFocusId', pj._id)
                  localStorage.setItem('projectId', pj._id)
                } catch {}
                window.location.href = '/project-detail'
              } else {
                setNotify({ open: true, title: 'No Project', message: 'No project exists for this revision.' })
              }
            } catch { setNotify({ open: true, title: 'Open Project Failed', message: 'We could not open the linked project.' }) }
          }}>View Project</button>
          <button className="save-btn" onClick={generatePDFPreview}>Print Preview</button>
          {(currentUser?.roles?.includes('estimation_engineer') || revision?.createdBy?._id === currentUser?.id) && (
            <button className="assign-btn" onClick={() => {
              if (approvalStatus === 'approved') {
                setApprovedEditBlockModal({ open: true })
                return
              }
              setEditModal({ open: true, form: {
              companyInfo: revision.companyInfo || {},
              submittedTo: revision.submittedTo || '',
              attention: revision.attention || '',
              offerReference: revision.offerReference || '',
              enquiryNumber: revision.enquiryNumber || '',
              offerDate: revision.offerDate ? String(revision.offerDate).slice(0,10) : '',
              enquiryDate: revision.enquiryDate ? String(revision.enquiryDate).slice(0,10) : '',
              projectTitle: revision.projectTitle || revision.lead?.projectTitle || '',
              introductionText: revision.introductionText || '',
              scopeOfWork: typeof revision.scopeOfWork === 'string'
                ? revision.scopeOfWork
                : (revision.scopeOfWork?.length
                    ? revision.scopeOfWork.map(item => item.description || '').join('<br>')
                    : ''),
              priceSchedule: typeof revision.priceSchedule === 'string'
                ? revision.priceSchedule
                : (revision.priceSchedule?.items?.length
                    ? revision.priceSchedule.items.map(item => 
                        `${item.description || ''}${item.quantity ? ` - Qty: ${item.quantity}` : ''}${item.unit ? ` ${item.unit}` : ''}${item.unitRate ? ` @ ${item.unitRate}` : ''}${item.totalAmount ? ` = ${item.totalAmount}` : ''}`
                      ).join('<br>')
                    : ''),
              ourViewpoints: revision.ourViewpoints || '',
              exclusions: typeof revision.exclusions === 'string'
                ? revision.exclusions
                : (revision.exclusions?.length
                    ? revision.exclusions.join('<br>')
                    : ''),
              paymentTerms: typeof revision.paymentTerms === 'string'
                ? revision.paymentTerms
                : (revision.paymentTerms?.length
                    ? revision.paymentTerms.map(term => 
                        `${term.milestoneDescription || ''}${term.amountPercent ? ` - ${term.amountPercent}%` : ''}`
                      ).join('<br>')
                    : ''),
              deliveryCompletionWarrantyValidity: revision.deliveryCompletionWarrantyValidity || { deliveryTimeline: '', warrantyPeriod: '', offerValidity: 30, authorizedSignatory: currentUser?.name || '' }
            } })
          }}>Edit</button>
          )}
          <button className="link-btn" onClick={() => {
            if (revision.parentQuotation?._id) {
              localStorage.setItem('quotationId', revision.parentQuotation._id)
              window.location.href = '/quotation-detail'
            }
          }}>View Approved Quotation</button>
          {revision.lead?._id && (
            <button className="link-btn" onClick={async () => {
              try {
                const token = localStorage.getItem('token')
                const res = await apiFetch(`/api/leads/${revision.lead._id}`)
                const leadData = await res.json()
                const visitsRes = await apiFetch(`/api/leads/${revision.lead._id}/site-visits`)
                const visits = await visitsRes.json()
                localStorage.setItem('leadDetail', JSON.stringify({ ...leadData, siteVisits: visits }))
                localStorage.setItem('leadId', revision.lead._id)
                window.location.href = '/lead-detail'
              } catch { setNotify({ open: true, title: 'Open Lead Failed', message: 'We could not open the linked lead. Please try again.' }) }
            }}>View Lead</button>
          )}
          {approvalStatus === 'pending' ? (
            <span className="status-badge blue">Approval Pending</span>
          ) : (
            (approvalStatus !== 'approved' && (currentUser?.roles?.includes('estimation_engineer') || revision?.createdBy?._id === currentUser?.id)) && (
              <button className="save-btn" onClick={() => setSendApprovalConfirmModal(true)}>Send for Approval</button>
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
            <button className="reject-btn" onClick={() => setDeleteModal({ open: true })}>Delete Revision</button>
          )}
          {approvalStatus === 'approved' && (
            <>
              <button className="assign-btn" onClick={async () => {
                try {
                  if (!revision || !revision._id) {
                    setNotify({ open: true, title: 'Error', message: 'Invalid revision data. Please refresh the page and try again.' })
                    return
                  }
                  try {
                    await apiFetch(`/api/projects/by-revision/${revision._id}`)
                    setNotify({ open: true, title: 'Not Allowed', message: 'A project already exists for this revision.' })
                    return
                  } catch {}
                  const hasChild = childRevisions.some(x => (x.parentRevision?._id || x.parentRevision) === revision._id)
                  if (hasChild) {
                    setNotify({ open: true, title: 'Not Allowed', message: 'Project can only be created from the last approved child revision.' })
                    return
                  }
                  const parentId = typeof revision.parentQuotation === 'object' ? revision.parentQuotation?._id : revision.parentQuotation
                  let allRevisions = []
                  try {
                    if (parentId) {
                      const revRes = await apiFetch(`/api/revisions?parentQuotation=${parentId}`)
                      allRevisions = Array.isArray(await revRes.json()) ? await revRes.json() : []
                    }
                  } catch {}
                  const approved = allRevisions.filter(x => x.managementApproval?.status === 'approved')
                  const latest = approved.slice().sort((a,b) => {
                    const getRevisionNum = (revNum) => {
                      if (!revNum) return 0;
                      if (typeof revNum === 'number') return revNum;
                      const match = String(revNum).match(/-REV-(\d+)$/);
                      return match ? parseInt(match[1], 10) : 0;
                    };
                    return getRevisionNum(b.revisionNumber) - getRevisionNum(a.revisionNumber);
                  })[0]
                  if (latest && latest._id !== revision._id) {
                    setNotify({ open: true, title: 'Not Allowed', message: `Only the latest approved revision (#${latest.revisionNumber}) can be used to create a project.` })
                    return
                  }
                  let engineers = []
                  try {
                    const resEng = await api.get('/api/projects/project-engineers')
                    engineers = Array.isArray(resEng.data) ? resEng.data : []
                  } catch {}
                  setCreateProjectModal({ open: true, revision: revision, engineers, ack: false, form: {
                    name: revision.projectTitle || revision.lead?.projectTitle || 'Project',
                    locationDetails: revision.lead?.locationDetails || '',
                    workingHours: revision.lead?.workingHours || '',
                    manpowerCount: revision.lead?.manpowerCount ?? '',
                    assignedProjectEngineerIds: []
                  }, selectedFiles: [], previewFiles: [] })
                } catch (error) {
                  console.error('Error opening create project modal:', error)
                  setNotify({ open: true, title: 'Error', message: 'An error occurred while opening the create project form. Please try again.' })
                }
              }}>Create Project</button>
              <button className="save-btn" onClick={async () => {
                try {
                  await apiFetch(`/api/projects/by-revision/${revision._id}`)
                  setNotify({ open: true, title: 'Not Allowed', message: 'A project already exists for this revision.' })
                  return
                } catch {}
                const hasChild = childRevisions.some(x => (x.parentRevision?._id || x.parentRevision) === revision._id)
                if (hasChild) {
                  setNotify({ open: true, title: 'Not Allowed', message: 'A child revision already exists for this revision.' })
                  return
                }
                setEditModal({ open: true, form: {
                  companyInfo: revision.companyInfo || defaultCompany,
                  submittedTo: revision.submittedTo || '',
                  attention: revision.attention || '',
                  offerReference: revision.offerReference || '',
                  enquiryNumber: revision.enquiryNumber || '',
                  offerDate: revision.offerDate ? String(revision.offerDate).slice(0,10) : '',
                  enquiryDate: revision.enquiryDate ? String(revision.enquiryDate).slice(0,10) : '',
                  projectTitle: revision.projectTitle || revision.lead?.projectTitle || '',
                  introductionText: revision.introductionText || '',
                  scopeOfWork: revision.scopeOfWork || '',
                  priceSchedule: revision.priceSchedule || '',
                  ourViewpoints: revision.ourViewpoints || '',
                  exclusions: revision.exclusions || '',
                  paymentTerms: revision.paymentTerms || '',
                  deliveryCompletionWarrantyValidity: revision.deliveryCompletionWarrantyValidity || { deliveryTimeline: '', warrantyPeriod: '', offerValidity: 30, authorizedSignatory: currentUser?.name || '' }
                }, mode: 'create' })
              }}>Create Another Revision</button>
              {(currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin')) && (
                <button className="reject-btn" onClick={async () => {
                  // Check if child revisions exist
                  const hasChild = childRevisions.some(x => (x.parentRevision?._id || x.parentRevision) === revision._id)
                  if (hasChild) {
                    setNotify({ open: true, title: 'Cannot Delete', message: 'This revision cannot be deleted because it has child revisions.' })
                    return
                  }
                  setDeleteModal({ open: true })
                }}>Delete Revision</button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="ld-grid">
        {revision.lead && (
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
                  <tr><td data-label="Field">Customer</td><td data-label="Value">{revision.lead.customerName || 'N/A'}</td></tr>
                  <tr><td data-label="Field">Project Title</td><td data-label="Value">{revision.lead.projectTitle || 'N/A'}</td></tr>
                  <tr><td data-label="Field">Enquiry #</td><td data-label="Value">{revision.lead.enquiryNumber || 'N/A'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="ld-card ld-section">
          <h3>Revision Overview</h3>
          <div className="ld-kv">
            <p><strong>Submitted To:</strong> {revision.submittedTo || 'N/A'}</p>
            <p><strong>Attention:</strong> {revision.attention || 'N/A'}</p>
            <p><strong>Offer Date:</strong> {revision.offerDate ? new Date(revision.offerDate).toLocaleDateString() : 'N/A'}</p>
            <p><strong>Enquiry Date:</strong> {revision.enquiryDate ? new Date(revision.enquiryDate).toLocaleDateString() : 'N/A'}</p>
            <p><strong>Enquiry #:</strong> {revision.enquiryNumber || revision.lead?.enquiryNumber || 'N/A'}</p>
            <p><strong>Currency:</strong> {currency}</p>
            <p><strong>Grand Total:</strong> {Number(revision.priceSchedule?.grandTotal || 0).toFixed(2)}</p>
            <p><strong>Created By:</strong> {revision.createdBy?._id === currentUser?.id ? 'You' : (revision.createdBy?.name || 'N/A')} {revision.createdBy?._id && revision.createdBy._id !== currentUser?.id && (
              <button className="link-btn" onClick={() => setProfileUser(revision.createdBy)} style={{ marginLeft: 6 }}>View Profile</button>
            )}</p>
          </div>
        </div>

        {revision.scopeOfWork && (
          <div className="ld-card ld-section">
            <h3>Scope of Work</h3>
            <div className="rich-text-content" style={{ padding: '8px 12px' }} dangerouslySetInnerHTML={{ __html: revision.scopeOfWork }} />
          </div>
        )}

        {revision.priceSchedule && (
          <div className="ld-card ld-section">
            <h3>Price Schedule</h3>
            <div className="rich-text-content" style={{ padding: '8px 12px' }} dangerouslySetInnerHTML={{ __html: revision.priceSchedule }} />
          </div>
        )}

        {revision.ourViewpoints && (
          <div className="ld-card ld-section">
            <h3>Our Viewpoints / Special Terms</h3>
            <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: revision.ourViewpoints }} />
          </div>
        )}

        {revision.exclusions && (
          <div className="ld-card ld-section">
            <h3>Exclusions</h3>
            <div className="rich-text-content" style={{ padding: '8px 12px' }} dangerouslySetInnerHTML={{ __html: revision.exclusions }} />
          </div>
        )}

        {revision.paymentTerms && (
          <div className="ld-card ld-section">
            <h3>Payment Terms</h3>
            <div className="rich-text-content" style={{ padding: '8px 12px' }} dangerouslySetInnerHTML={{ __html: revision.paymentTerms }} />
          </div>
        )}

        {revision.deliveryCompletionWarrantyValidity && (
          <div className="ld-card ld-section">
            <h3>Delivery, Completion, Warranty & Validity</h3>
            <div className="ld-kv">
              <p><strong>Delivery Timeline:</strong> {revision.deliveryCompletionWarrantyValidity.deliveryTimeline || 'N/A'}</p>
              <p><strong>Warranty Period:</strong> {revision.deliveryCompletionWarrantyValidity.warrantyPeriod || 'N/A'}</p>
              <p><strong>Offer Validity:</strong> {revision.deliveryCompletionWarrantyValidity.offerValidity || 'N/A'} days</p>
              <p><strong>Authorized Signatory:</strong> {revision.deliveryCompletionWarrantyValidity.authorizedSignatory || 'N/A'}</p>
            </div>
          </div>
        )}

        {revision.diffFromParent && Array.isArray(revision.diffFromParent) && revision.diffFromParent.length > 0 && (
          <div className="ld-card ld-section">
            <h3>Changes from Parent</h3>
            <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
              This revision includes the following changes from the parent quotation:
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
                  {revision.diffFromParent.map((diff, idx) => {
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
                      'paymentTerms': 'Payment Terms'
                    }
                    const fieldName = fieldNameMap[diff.field] || diff.field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
                    
                    const isRichText = ['scopeOfWork', 'priceSchedule', 'exclusions', 'paymentTerms', 'ourViewpoints'].includes(diff.field)

                    // Format the values for display - ensure we're accessing the correct properties
                    const fromVal = diff.from !== undefined ? diff.from : (diff.fromValue !== undefined ? diff.fromValue : null)
                    const toVal = diff.to !== undefined ? diff.to : (diff.toValue !== undefined ? diff.toValue : null)
                    
                    const fromValue = isRichText ? (fromVal || '') : formatHistoryValue(diff.field, fromVal)
                    const toValue = isRichText ? (toVal || '') : formatHistoryValue(diff.field, toVal)
                    
                    return (
                      <tr key={idx}>
                        <td data-label="Field"><strong>{fieldName}</strong></td>
                        <td data-label="Previous Value">
                          {isRichText ? (
                            <div className="rich-text-content" style={{ padding: '8px', border: '1px solid #FECACA', background: '#FEF2F2', borderRadius: '6px', maxHeight: '300px', overflow: 'auto', color: '#991B1B' }} dangerouslySetInnerHTML={{ __html: fromValue }} />
                          ) : (
                            <pre style={{ margin: 0, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '13px', color: '#991B1B', fontFamily: 'inherit' }}>
                              {fromValue || '(empty)'}
                            </pre>
                          )}
                        </td>
                        <td data-label="New Value">
                          {isRichText ? (
                            <div className="rich-text-content" style={{ padding: '8px', border: '1px solid #BBF7D0', background: '#F0FDF4', borderRadius: '6px', maxHeight: '300px', overflow: 'auto', color: '#166534' }} dangerouslySetInnerHTML={{ __html: toValue }} />
                          ) : (
                            <pre style={{ margin: 0, padding: '10px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '13px', color: '#166534', fontFamily: 'inherit' }}>
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
      </div>

      {revision && (
        <div className="ld-card ld-section">
          <button className="link-btn" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Hide Revision Edit History' : 'View Revision Edit History'}
          </button>
          {showHistory && Array.isArray(revision.edits) && revision.edits.length > 0 && (
            <div className="edits-list" style={{ marginTop: 8 }}>
              {revision.edits.slice().reverse().map((edit, idx) => (
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

      {revision && (
        <div className="ld-card ld-section">
          <button className="link-btn" onClick={() => setShowApprovals(!showApprovals)}>
            {showApprovals ? 'Hide Approvals/Rejections' : 'View Approvals/Rejections'}
          </button>
          {showApprovals && (
            <>
              <h3 style={{ marginTop: '16px' }}>Approvals & Rejections</h3>
          {(() => {
            const rev = revision
            const rawLogs = Array.isArray(rev.managementApproval?.logs) ? rev.managementApproval.logs.slice().sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0)) : []
            const cycles = []
            let current = null
            for (const entry of rawLogs) {
              if (entry.status === 'pending') {
                if (current) cycles.push(current)
                current = {
                  requestedAt: entry.at,
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
                  current.decidedAt = entry.at
                  current.decidedBy = entry.decidedBy
                  current.decisionNote = entry.note
                  current.decisionStatus = entry.status
                  cycles.push(current)
                  current = null
                } else {
                  cycles.push({ requestedAt: null, requestedBy: null, requestNote: null, decidedAt: entry.at, decidedBy: entry.decidedBy, decisionNote: entry.note, decisionStatus: entry.status })
                }
              }
            }
            if (current) cycles.push(current)

            if (cycles.length === 0 && (rev.managementApproval?.requestedBy || rev.managementApproval?.approvedBy)) {
              cycles.push({
                requestedAt: rev.updatedAt || rev.createdAt,
                requestedBy: rev.managementApproval?.requestedBy,
                requestNote: rev.managementApproval?.comments,
                decidedAt: rev.managementApproval?.approvedAt,
                decidedBy: rev.managementApproval?.approvedBy,
                decisionNote: rev.managementApproval?.comments,
                decisionStatus: rev.managementApproval?.status
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
                      <div><strong>Requested:</strong> {c.requestedAt ? new Date(c.requestedAt).toLocaleString() : '—'} {c.requestedBy?.name && (<>
                        by {c.requestedBy?._id === currentUser?.id ? 'YOU' : c.requestedBy.name}
                        {c.requestedBy?._id && c.requestedBy._id !== currentUser?.id && (
                          <button className="link-btn" onClick={() => setProfileUser(c.requestedBy)} style={{ marginLeft: 6 }}>View Profile</button>
                        )}
                      </>)}
                      </div>
                      {c.requestNote && <div><strong>Request note:</strong> {c.requestNote}</div>}
                      <div style={{ marginTop: 6 }}><strong>Decision:</strong> {c.decidedAt ? new Date(c.decidedAt).toLocaleString() : '—'} {c.decidedBy?.name && (<>
                        by {c.decidedBy?._id === currentUser?.id ? 'YOU' : c.decidedBy.name}
                        {c.decidedBy?._id && c.decidedBy._id !== currentUser?.id && (
                          <button className="link-btn" onClick={() => setProfileUser(c.decidedBy)} style={{ marginLeft: 6 }}>View Profile</button>
                        )}
                      </>)} {c.decisionStatus && <span style={{ marginLeft: 6, textTransform: 'uppercase' }}>({c.decisionStatus})</span>}
                      </div>
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
        <div className="modal-overlay" onClick={() => setEditModal({ open: false, form: null, mode: 'edit' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editModal.mode === 'create' ? 'Create Revision' : 'Edit Revision'}</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {revision?._id && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          if (editModal.mode === 'create') {
                            // Create child revision mode
                            localStorage.setItem('revisionCreateMode', 'true')
                            localStorage.setItem('revisionSourceRevisionId', revision._id)
                            localStorage.setItem('revisionFormData', JSON.stringify(editModal.form))
                          } else {
                            // Edit mode
                            localStorage.setItem('revisionId', revision._id)
                            localStorage.setItem('revisionEditMode', 'true')
                          }
                          window.open('/revision-detail', '_blank')
                        } catch {}
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
                        try {
                          if (editModal.mode === 'create') {
                            // Create child revision mode
                            localStorage.setItem('revisionCreateMode', 'true')
                            localStorage.setItem('revisionSourceRevisionId', revision._id)
                            localStorage.setItem('revisionFormData', JSON.stringify(editModal.form))
                          } else {
                            // Edit mode
                            localStorage.setItem('revisionId', revision._id)
                            localStorage.setItem('revisionEditMode', 'true')
                          }
                          window.location.href = '/revision-detail'
                        } catch {}
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
                <button onClick={() => setEditModal({ open: false, form: null, mode: 'edit' })} className="close-btn">×</button>
              </div>
            </div>
            {editModal.form && (
              <div className="lead-form" style={{ maxHeight: '70vh', overflow: 'auto' }}>
                {editModal.mode === 'edit' && approvalStatus === 'approved' && (
                  <div style={{ 
                    padding: '12px', 
                    background: '#fee2e2', 
                    border: '1px solid #fecaca', 
                    borderRadius: '6px', 
                    marginBottom: '16px',
                    color: '#991b1b'
                  }}>
                    This revision has been approved and cannot be edited. Please create a new revision if you need to make changes.
                  </div>
                )}
                <div className="form-section">
                  <div className="section-header">
                    <h3>Cover & Basic Details</h3>
                  </div>
                  <div className="form-group">
                    <label>Submitted To (Client Company)</label>
                    <input type="text" value={editModal.form.submittedTo} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, submittedTo: e.target.value } })} disabled={editModal.mode === 'edit' && approvalStatus === 'approved'} />
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
                      <input type="date" value={editModal.form.offerDate} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, offerDate: e.target.value } })} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Enquiry Date</label>
                      <input type="date" value={editModal.form.enquiryDate} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, enquiryDate: e.target.value } })} />
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
                      value={typeof editModal.form.priceSchedule === 'string' ? editModal.form.priceSchedule : (editModal.form.priceSchedule?.items?.length ? editModal.form.priceSchedule.items.map(item => `${item.description || ''}${item.quantity ? ` - Qty: ${item.quantity}` : ''}${item.unit ? ` ${item.unit}` : ''}${item.unitRate ? ` @ ${item.unitRate}` : ''}${item.totalAmount ? ` = ${item.totalAmount}` : ''}`).join('<br>') : '')}
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

                <div className="form-actions">
                  <button type="button" className="cancel-btn" onClick={() => setEditModal({ open: false, form: null, mode: 'edit' })}>Cancel</button>
                  <button type="button" className="save-btn" disabled={editModal.mode === 'edit' && approvalStatus === 'approved'} onClick={async () => {
                    // Block saving if revision is approved
                    if (editModal.mode === 'edit' && approvalStatus === 'approved') {
                      setNotify({ open: true, title: 'Cannot Edit Approved Revision', message: 'This revision has been approved and cannot be edited. Please create a new revision if you need to make changes.' })
                      return
                    }
                    try {
                      const token = localStorage.getItem('token')
                      const payload = { ...editModal.form }
                      
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
                      
                      if (editModal.mode === 'create' && revision?._id) {
                        // Create child revision - check for changes first
                        const fields = ['companyInfo','submittedTo','attention','offerReference','enquiryNumber','offerDate','enquiryDate','projectTitle','introductionText','scopeOfWork','priceSchedule','ourViewpoints','exclusions','paymentTerms','deliveryCompletionWarrantyValidity']
                        let changed = false
                        for (const f of fields) {
                          if (JSON.stringify(revision?.[f] ?? null) !== JSON.stringify(payload?.[f] ?? null)) { 
                            changed = true
                            break 
                          }
                        }
                        if (!changed) {
                          setNotify({ open: true, title: 'No Changes', message: 'No changes detected. Please modify data before creating a revision.' })
                          return
                        }
                        
                        // Create child revision with correct API format
                        const requestBody = { sourceRevisionId: revision._id, data: payload }
                        const createRes = await apiFetch('/api/revisions', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                          },
                          body: JSON.stringify(requestBody)
                        })
                        const newRev = await createRes.json()
                        setEditModal({ open: false, form: null, mode: 'edit' })
                        setNotify({ open: true, title: 'Success', message: 'Child revision created successfully.' })
                        // Reload current revision to refresh child revisions list
                        const res = await apiFetch(`/api/revisions/${revision._id}`)
                        const updated = await res.json()
                        setRevision(updated)
                        // Fetch child revisions again
                        try {
                          const childRes = await apiFetch(`/api/revisions?parentRevision=${revision._id}`)
                          const childRevs = await childRes.json()
                          setChildRevisions(Array.isArray(childRevs) ? childRevs : [])
                        } catch {}
                      } else {
                        // Edit existing revision - block if approved
                        if (revision.managementApproval?.status === 'approved') {
                          setNotify({ open: true, title: 'Cannot Edit Approved Revision', message: 'This revision has been approved and cannot be edited. Please create a new revision if you need to make changes.' })
                          return
                        }
                        await apiFetch(`/api/revisions/${revision._id}`, {
                          method: 'PUT',
                          body: JSON.stringify(payload)
                        })
                        const res = await apiFetch(`/api/revisions/${revision._id}`)
                        const updated = await res.json()
                        setRevision(updated)
                        setEditModal({ open: false, form: null, mode: 'edit' })
                        setNotify({ open: true, title: 'Success', message: 'Revision updated successfully.' })
                      }
                    } catch {
                      setNotify({ open: true, title: 'Save Failed', message: 'We could not save your changes. Please try again.' })
                    }
                  }}>{editModal.mode === 'create' ? 'Create Revision' : 'Save Changes'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {approvalModal.open && (
        <div className="modal-overlay" onClick={() => setApprovalModal({ open: false, action: null, note: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{approvalModal.action === 'approved' ? 'Approve Revision' : 'Reject Revision'}</h2>
              <button onClick={() => setApprovalModal({ open: false, action: null, note: '' })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div className="form-group">
                <label>Note</label>
                <textarea value={approvalModal.note} onChange={e => setApprovalModal({ ...approvalModal, note: e.target.value })} />
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setApprovalModal({ open: false, action: null, note: '' })}>Cancel</button>
                <button type="button" className="save-btn" onClick={async () => {
                  if (!approvalModal.action) return
                  await approveRevision(approvalModal.action, approvalModal.note)
                }}>Confirm</button>
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
        <div className="modal-overlay" onClick={() => setPrintPreviewModal({ open: false, pdfUrl: null, revision: null })} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001, maxWidth: '95%', width: '100%', height: '95vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', padding: '16px 24px' }}>
              <h2>PDF Preview - Revision {printPreviewModal.revision?.revisionNumber || ''}</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="save-btn" 
                  onClick={async () => {
                    if (printPreviewModal.revision) {
                      try {
                        await exportPDF()
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
                            <title>Revision ${printPreviewModal.revision?.revisionNumber || ''} - Commercial Quotation</title>
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
                <button onClick={() => setPrintPreviewModal({ open: false, pdfUrl: null, revision: null })} className="close-btn">×</button>
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

      {sendApprovalConfirmModal && (
        <div className="modal-overlay" onClick={() => setSendApprovalConfirmModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Send for Approval</h2>
              <button onClick={() => setSendApprovalConfirmModal(false)} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to send this revision for approval?</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setSendApprovalConfirmModal(false)}>Cancel</button>
                <button type="button" className="save-btn" onClick={sendForApproval}>
                  Confirm & Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {createProjectModal.open && createProjectModal.revision && createProjectModal.form && (
        <>
          <style>{`
            .engineers-scroll-container::-webkit-scrollbar {
              width: 8px;
            }
            .engineers-scroll-container::-webkit-scrollbar-track {
              background: var(--bg);
              border-radius: 4px;
            }
            .engineers-scroll-container::-webkit-scrollbar-thumb {
              background: var(--border);
              border-radius: 4px;
            }
            .engineers-scroll-container::-webkit-scrollbar-thumb:hover {
              background: var(--text-muted);
            }
            .engineers-scroll-container {
              scrollbar-width: thin;
              scrollbar-color: var(--border) var(--bg);
            }
          `}</style>
          <div className="modal-overlay" onClick={() => setCreateProjectModal({ open: false, revision: null, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', assignedProjectEngineerIds: [] }, engineers: [], ack: false, selectedFiles: [], previewFiles: [] })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Project</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (createProjectModal.revision && createProjectModal.revision._id) {
                      window.open(`/revisions/${createProjectModal.revision._id}/create-project`, '_blank')
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
                    if (createProjectModal.revision && createProjectModal.revision._id) {
                      window.location.href = `/revisions/${createProjectModal.revision._id}/create-project`
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
                <button onClick={() => setCreateProjectModal({ open: false, revision: null, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', assignedProjectEngineerIds: [] }, engineers: [], ack: false, selectedFiles: [], previewFiles: [] })} className="close-btn">×</button>
              </div>
            </div>
            <div className="lead-form">
              {currentUser?.roles?.includes('estimation_engineer') && (
                <div className="edit-item" style={{ background: '#FEF3C7', border: '1px solid #F59E0B', padding: 14, marginBottom: 14, color: '#7C2D12' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span aria-hidden="true" style={{ fontSize: 20, lineHeight: '20px', marginTop: 2 }}>⚠️</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Warning</div>
                      <div style={{ lineHeight: 1.4 }}>This action cannot be undone. Only managers can delete projects once created.</div>
                    </div>
                  </div>
                </div>
              )}
              <div className="form-group">
                <label>Project Name</label>
                <input type="text" value={createProjectModal.form?.name || ''} onChange={e => setCreateProjectModal({ ...createProjectModal, form: { ...createProjectModal.form, name: e.target.value } })} />
              </div>
              <div className="form-group">
                <label>Location Details</label>
                <input type="text" value={createProjectModal.form.locationDetails} onChange={e => setCreateProjectModal({ ...createProjectModal, form: { ...createProjectModal.form, locationDetails: e.target.value } })} />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Working Hours</label>
                  <input type="text" value={createProjectModal.form.workingHours} onChange={e => setCreateProjectModal({ ...createProjectModal, form: { ...createProjectModal.form, workingHours: e.target.value } })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Manpower Count</label>
                  <input 
                    type="number" 
                    value={createProjectModal.form.manpowerCount === null || createProjectModal.form.manpowerCount === undefined || createProjectModal.form.manpowerCount === '' ? '' : createProjectModal.form.manpowerCount} 
                    onChange={e => {
                      const inputVal = e.target.value
                      // Allow empty string, otherwise convert to number
                      const val = inputVal === '' ? '' : (isNaN(Number(inputVal)) ? createProjectModal.form.manpowerCount : Number(inputVal))
                      setCreateProjectModal({ ...createProjectModal, form: { ...createProjectModal.form, manpowerCount: val } })
                    }} 
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Assign Project Engineers</label>
                <div 
                  className="engineers-scroll-container"
                  style={{ 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px', 
                    padding: '8px', 
                    maxHeight: '180px', 
                    minHeight: '80px',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    background: 'var(--bg)',
                    position: 'relative',
                    scrollBehavior: 'smooth',
                    WebkitOverflowScrolling: 'touch'
                  }}
                >
                  {Array.isArray(createProjectModal.engineers) && createProjectModal.engineers.length > 0 ? (
                    createProjectModal.engineers.map((u, index) => {
                      const isSelected = Array.isArray(createProjectModal.form.assignedProjectEngineerIds) && 
                        createProjectModal.form.assignedProjectEngineerIds.includes(u._id);
                      const isLast = index === createProjectModal.engineers.length - 1;
                      return (
                        <div key={u._id} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '12px', 
                          padding: '10px 8px',
                          borderBottom: isLast ? 'none' : '1px solid var(--border)',
                          minHeight: '40px'
                        }}>
                          <input
                            type="checkbox"
                            id={`engineer-${u._id}`}
                            checked={isSelected}
                            onChange={(e) => {
                              const currentIds = Array.isArray(createProjectModal.form.assignedProjectEngineerIds) 
                                ? createProjectModal.form.assignedProjectEngineerIds 
                                : [];
                              const newIds = e.target.checked
                                ? [...currentIds, u._id]
                                : currentIds.filter(id => id !== u._id);
                              setCreateProjectModal({ 
                                ...createProjectModal, 
                                form: { 
                                  ...createProjectModal.form, 
                                  assignedProjectEngineerIds: newIds 
                                } 
                              });
                            }}
                            style={{ 
                              cursor: 'pointer',
                              width: '18px',
                              height: '18px',
                              flexShrink: 0,
                              margin: 0
                            }}
                          />
                          <label 
                            htmlFor={`engineer-${u._id}`} 
                            style={{ 
                              flex: 1, 
                              cursor: 'pointer', 
                              color: 'var(--text)',
                              margin: 0,
                              fontSize: '14px',
                              lineHeight: '1.5',
                              display: 'flex',
                              alignItems: 'center',
                              minHeight: '18px'
                            }}
                          >
                            {u.name} ({u.email})
                          </label>
                          {isSelected && (
                            <button 
                              type="button" 
                              className="link-btn" 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (u) setProfileUser(u);
                              }}
                              style={{ 
                                fontSize: '12px', 
                                padding: '6px 12px',
                                flexShrink: 0,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              View Profile
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p style={{ 
                      color: 'var(--text-secondary)', 
                      margin: 0, 
                      padding: '12px 8px',
                      fontSize: '14px'
                    }}>
                      No project engineers available
                    </p>
                  )}
                </div>
                {Array.isArray(createProjectModal.form.assignedProjectEngineerIds) && 
                 createProjectModal.form.assignedProjectEngineerIds.length > 0 && (
                  <p style={{ 
                    marginTop: '8px', 
                    fontSize: '13px', 
                    color: 'var(--text-secondary)',
                    marginBottom: 0
                  }}>
                    {createProjectModal.form.assignedProjectEngineerIds.length} engineer(s) selected
                  </p>
                )}
              </div>
              <div className="form-group">
                <label>Attachments (Documents, Images & Videos)</label>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,video/*"
                  onChange={handleProjectFileChange}
                  className="file-input"
                />
                <small style={{ display: 'block', marginTop: '5px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  Accepted: Images (JPEG, PNG, GIF, WebP), Documents (PDF, DOC, DOCX, XLS, XLSX), Videos (MP4, MOV, AVI, WMV, WebM, etc.). Max 10MB per file.
                </small>
                
                {/* Display selected files */}
                {createProjectModal.previewFiles && createProjectModal.previewFiles.length > 0 && (
                  <div style={{ marginTop: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {createProjectModal.previewFiles.map((preview, index) => (
                      <div key={index} style={{ 
                        position: 'relative', 
                        border: '1px solid var(--border)', 
                        borderRadius: '8px', 
                        padding: '8px',
                        background: 'var(--bg)',
                        maxWidth: '200px'
                      }}>
                        {preview.type === 'image' && preview.preview && (
                          <img src={preview.preview} alt={preview.file.name} style={{ width: '100%', height: 'auto', borderRadius: '4px', marginBottom: '8px' }} />
                        )}
                        {preview.type === 'video' && preview.preview && (
                          <video src={preview.preview} style={{ width: '100%', height: 'auto', borderRadius: '4px', marginBottom: '8px' }} controls />
                        )}
                        <div style={{ fontSize: '12px', color: 'var(--text)', wordBreak: 'break-word' }}>
                          {preview.file.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {formatFileSize(preview.file.size)}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeProjectFile(index)}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            background: 'rgba(0, 0, 0, 0.6)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                            lineHeight: '1'
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {currentUser?.roles?.includes('estimation_engineer') && (
                <div className="form-group">
                  <div style={{ 
                    display: 'flex', 
                    gap: '12px', 
                    alignItems: 'flex-start', 
                    padding: '14px 16px', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px', 
                    background: 'var(--bg)'
                  }}>
                    <input 
                      id="ack-project-create" 
                      type="checkbox" 
                      checked={createProjectModal.ack} 
                      onChange={e => setCreateProjectModal({ ...createProjectModal, ack: e.target.checked })} 
                      style={{ 
                        marginTop: '2px',
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        flexShrink: 0
                      }} 
                    />
                    <label 
                      htmlFor="ack-project-create" 
                      style={{ 
                        color: 'var(--text)', 
                        cursor: 'pointer',
                        margin: 0,
                        fontSize: '14px',
                        lineHeight: '1.5',
                        flex: 1
                      }}
                    >
                      I understand this action cannot be undone and requires management involvement to reverse.
                    </label>
                  </div>
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setCreateProjectModal({ open: false, revision: null, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', assignedProjectEngineerIds: [] }, engineers: [], ack: false, selectedFiles: [], previewFiles: [] })}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  disabled={(currentUser?.roles?.includes('estimation_engineer') && !createProjectModal.ack) || isSubmitting} 
                  onClick={async () => {
                    if (isSubmitting) return
                    setLoadingAction('create-project')
                    setIsSubmitting(true)
                    try {
                      const formDataToSend = new FormData()
                      
                      // Append form fields
                      formDataToSend.append('name', createProjectModal.form.name || '')
                      formDataToSend.append('locationDetails', createProjectModal.form.locationDetails || '')
                      formDataToSend.append('workingHours', createProjectModal.form.workingHours || '')
                      // Only append manpowerCount if it has a value (not empty string)
                      if (createProjectModal.form.manpowerCount !== '' && createProjectModal.form.manpowerCount !== null && createProjectModal.form.manpowerCount !== undefined) {
                        formDataToSend.append('manpowerCount', createProjectModal.form.manpowerCount)
                      }
                      
                      // Handle array field - append each ID separately
                      const ids = Array.isArray(createProjectModal.form.assignedProjectEngineerIds) 
                        ? createProjectModal.form.assignedProjectEngineerIds 
                        : []
                      ids.forEach(id => {
                        formDataToSend.append('assignedProjectEngineerIds', id)
                      })
                      
                      // Append files
                      if (createProjectModal.selectedFiles && createProjectModal.selectedFiles.length > 0) {
                        createProjectModal.selectedFiles.forEach(file => {
                          formDataToSend.append('attachments', file)
                        })
                      }
                      
                      await api.post(`/api/projects/from-revision/${createProjectModal.revision._id}`, formDataToSend)
                      setCreateProjectModal({ open: false, revision: null, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', assignedProjectEngineerIds: [] }, engineers: [], ack: false, selectedFiles: [], previewFiles: [] })
                      setNotify({ open: true, title: 'Project Created', message: 'Project created from approved revision. Redirecting to Projects...' })
                      setTimeout(() => { window.location.href = '/projects' }, 800)
                    } catch (e) {
                      setNotify({ open: true, title: 'Create Project Failed', message: e.response?.data?.message || 'We could not create the project. Please try again.' })
                    } finally {
                      setIsSubmitting(false)
                      setLoadingAction(null)
                    }
                  }}
                >
                  <ButtonLoader loading={loadingAction === 'create-project'}>
                    {isSubmitting ? 'Creating...' : 'Create Project'}
                  </ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
        </>
      )}

      {deleteModal.open && (
        <div className="modal-overlay" onClick={() => setDeleteModal({ open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Revision</h2>
              <button onClick={() => setDeleteModal({ open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to delete Revision {revision?.revisionNumber}? This action cannot be undone.</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setDeleteModal({ open: false })}>Cancel</button>
                <button type="button" className="reject-btn" onClick={async () => {
                  try {
                    if (!revision?._id) return
                    // Double-check for child revisions before deleting
                    const hasChild = childRevisions.some(x => (x.parentRevision?._id || x.parentRevision) === revision._id)
                    if (hasChild) {
                      setDeleteModal({ open: false })
                      setNotify({ open: true, title: 'Cannot Delete', message: 'This revision cannot be deleted because it has child revisions.' })
                      return
                    }
                    await apiFetch(`/api/revisions/${revision._id}`, {
                      method: 'DELETE',
                      headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                      }
                    })
                    setDeleteModal({ open: false })
                    setNotify({ open: true, title: 'Revision Deleted', message: 'The revision was deleted successfully.' })
                    setTimeout(() => {
                      window.location.href = '/revisions'
                    }, 1500)
                  } catch (e) {
                    setDeleteModal({ open: false })
                    setNotify({ open: true, title: 'Delete Failed', message: e.message || 'We could not delete the revision. Please try again.' })
                  }
                }}>Confirm Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {approvedEditBlockModal.open && (
        <div className="modal-overlay" onClick={() => setApprovedEditBlockModal({ open: false })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cannot Edit Approved Revision</h2>
              <button onClick={() => setApprovedEditBlockModal({ open: false })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p style={{ marginBottom: '16px', color: 'var(--text)' }}>
                This revision has been approved and cannot be edited. Approved revisions are locked to maintain data integrity and audit trails.
              </p>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                If you need to make changes, please create a new revision instead.
              </p>
              <div className="form-actions">
                <button type="button" className="save-btn" onClick={() => setApprovedEditBlockModal({ open: false })}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RevisionDetail


