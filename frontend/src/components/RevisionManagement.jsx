import { useEffect, useMemo, useState, useRef } from 'react'
import { api } from '../lib/api'
import { Modal } from '../design-system/Modal'
import './LeadManagement.css'
import '../design-system/Modal.css'
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

function RevisionManagement() {
  const [currentUser, setCurrentUser] = useState(null)
  const [revisions, setRevisions] = useState([])
  const [quotations, setQuotations] = useState([])
  const [myOnly, setMyOnly] = useState(false)
  const [selectedApprovedQuotationFilter, setSelectedApprovedQuotationFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('createdAt_desc')
  // New filter states
  const [nameFilter, setNameFilter] = useState('')
  const [dateModifiedFilter, setDateModifiedFilter] = useState('')
  const [dateCreatedFilter, setDateCreatedFilter] = useState('')
  // New sort states
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
  const [editModal, setEditModal] = useState({ open: false, revision: null, form: null, mode: 'edit' })
  const [approvedEditBlockModal, setApprovedEditBlockModal] = useState({ open: false })
  const [profileUser, setProfileUser] = useState(null)
  const [notify, setNotify] = useState({ open: false, title: '', message: '' })
  const [confirmDelete, setConfirmDelete] = useState({ open: false, revision: null })
  const [approvalsView, setApprovalsView] = useState(null)
  const [approvalModal, setApprovalModal] = useState({ open: false, revision: null, action: null, note: '' })
  const [sendApprovalConfirmModal, setSendApprovalConfirmModal] = useState({ open: false, revision: null })
  const [printPreviewModal, setPrintPreviewModal] = useState({ open: false, pdfUrl: null, revision: null })
  const [createProjectModal, setCreateProjectModal] = useState({ open: false, revision: null, form: { name: '', locationDetails: '', workingHours: '', manpowerCount: '', assignedProjectEngineerIds: [] }, engineers: [], ack: false, selectedFiles: [], previewFiles: [] })
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem('revisionViewMode')
    return saved === 'table' ? 'table' : 'card' // default to 'card' if not set
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [projectMap, setProjectMap] = useState({}) // Map revision ID to project info
  const [expandedProjectRows, setExpandedProjectRows] = useState({}) // Track which rows have expanded projects
  const [projectDetailsMap, setProjectDetailsMap] = useState({}) // Store full project details per revision ID
  const [projectModal, setProjectModal] = useState({ open: false, project: null })
  const [diffModal, setDiffModal] = useState({ open: false, revision: null })
  const [expandedVariationRows, setExpandedVariationRows] = useState({}) // Track which rows have expanded variations
  const [projectVariationsMap, setProjectVariationsMap] = useState({}) // Store variations per project ID
  const [variationsForProject, setVariationsForProject] = useState([])
  const [selectedProjectForList, setSelectedProjectForList] = useState(null)
  const [showVariationsListModal, setShowVariationsListModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingAction, setLoadingAction] = useState(null)

  // File handling functions for project creation
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

  const defaultCompany = useMemo(() => ({
    logo,
    name: 'Engineering Operations ERP',
    address: 'Dubai, UAE',
    phone: '+971-00-000-0000',
    email: 'info@example.com'
  }), [])

  useEffect(() => {
    setCurrentUser(JSON.parse(localStorage.getItem('user')) || null)
    const loadData = async () => {
      setIsLoading(true)
      await Promise.all([fetchRevisions(), fetchQuotations()])
      setIsLoading(false)
    }
    void loadData()
  }, [])

  // Persist view mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('revisionViewMode', viewMode)
  }, [viewMode])

  const fetchRevisions = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await api.get('/api/revisions')
      const revisionsData = res.data
      setRevisions(revisionsData)
      
      // Check which revisions have projects
      const projectChecks = {}
      for (const rev of revisionsData) {
        try {
          const projectRes = await api.get(`/api/projects/by-revision/${rev._id}`)
          projectChecks[rev._id] = projectRes.data
        } catch {
          // No project for this revision
        }
      }
      setProjectMap(projectChecks)
    } catch {}
  }

  const fetchQuotations = async () => {
    try {
      const res = await api.get('/api/quotations')
      // Filter to only approved quotations for the filter dropdown
      const approved = Array.isArray(res.data) ? res.data.filter(q => q.managementApproval?.status === 'approved') : []
      setQuotations(approved)
    } catch {}
  }

  const approveRevision = async (rev, status, note) => {
    setLoadingAction(`approve-${rev._id}-${status}`)
    setIsSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      await api.patch(`/api/revisions/${rev._id}/approve`, { status, note })
      await fetchRevisions()
      setApprovalModal({ open: false, revision: null, action: null, note: '' })
      setNotify({ open: true, title: status === 'approved' ? 'Revision Approved' : 'Revision Rejected', message: `The revision has been ${status === 'approved' ? 'approved' : 'rejected'} successfully.` })
    } catch (e) {
      setNotify({ open: true, title: 'Approval Failed', message: e.response?.data?.message || 'We could not update approval. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
  }

  const sendForApproval = async (rev) => {
    setLoadingAction(`send-approval-${rev._id}`)
    setIsSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      await api.patch(`/api/revisions/${rev._id}/approve`, { status: 'pending' })
      await fetchRevisions()
      setSendApprovalConfirmModal({ open: false, revision: null })
      setNotify({ open: true, title: 'Request Sent', message: 'Approval request has been sent successfully.' })
    } catch (e) {
      setNotify({ open: true, title: 'Send Failed', message: e.response?.data?.message || 'We could not send for approval. Please try again.' })
    } finally {
      setIsSubmitting(false)
      setLoadingAction(null)
    }
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

  const toDataURL = async (url) => {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  }

  const exportPDF = async (q) => {
    try {
      await ensurePdfMake()
      const logoDataUrl = await toDataURL(q.companyInfo?.logo || logo)
      const currency = q.priceSchedule?.currency || 'AED'

      // Fetch full lead details and site visits for richer PDF (like quotations)
      let leadFull = q.lead || null
      let siteVisits = []
      try {
        const token = localStorage.getItem('token')
        const leadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
        if (leadId) {
          const resLead = await api.get(`/api/leads/${leadId}`)
          leadFull = resLead.data
          const resVisits = await api.get(`/api/leads/${leadId}/site-visits`)
          siteVisits = Array.isArray(resVisits.data) ? resVisits.data : []
        }
      } catch {}

      const coverFieldsRaw = [
        ['Submitted To', q.submittedTo],
        ['Attention', q.attention],
        ['Offer Reference', q.offerReference],
        ['Enquiry Number', q.enquiryNumber || leadFull?.enquiryNumber],
        ['Offer Date', q.offerDate ? new Date(q.offerDate).toLocaleDateString() : ''],
        ['Enquiry Date', q.enquiryDate ? new Date(q.enquiryDate).toLocaleDateString() : ''],
        ['Project Title', q.projectTitle || leadFull?.projectTitle]
      ]
      const coverFields = coverFieldsRaw.filter(([, v]) => v && String(v).trim().length > 0)

      const scopeRows = (q.scopeOfWork || [])
        .filter(s => (s?.description || '').trim().length > 0)
        .map((s, i) => [String(i + 1), s.description, String(s.quantity || ''), s.unit || '', s.locationRemarks || ''])

      const priceItems = (q.priceSchedule?.items || [])
        .filter(it => (it?.description || '').trim().length > 0 || Number(it.quantity) > 0 || Number(it.unitRate) > 0)
      const priceRows = priceItems.map((it, i) => [
        String(i + 1),
        it.description || '',
        String(it.quantity || 0),
        it.unit || '',
        `${currency} ${Number(it.unitRate || 0).toFixed(2)}`,
        `${currency} ${Number((it.quantity || 0) * (it.unitRate || 0)).toFixed(2)}`
      ])

      const exclusions = (q.exclusions || []).map(x => String(x || '').trim()).filter(Boolean)
      const paymentTerms = (q.paymentTerms || []).filter(p => (p?.milestoneDescription || '').trim().length > 0 || String(p?.amountPercent || '').trim().length > 0)

      const dcwv = q.deliveryCompletionWarrantyValidity || {}
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
                { text: q.companyInfo?.name || 'Company', style: 'brand' },
                { text: [q.companyInfo?.address, q.companyInfo?.phone, q.companyInfo?.email].filter(Boolean).join(' | '), color: '#64748b', fontSize: 9 }
              ]
            ],
            columnGap: 12
          },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.5, lineColor: '#e5e7eb' }] }
        ]
      }

      const content = []
      content.push({ text: `Revision ${q.revisionNumber} — Commercial Quotation`, style: 'h1', margin: [0, 0, 0, 8] })

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

      // Project Details (from lead)
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

      // Site Visit Reports
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

      // Delivery/Completion/Warranty/Validity
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

      const filename = `Revision_${q.revisionNumber}_${q.projectTitle || 'Quotation'}.pdf`
      window.pdfMake.createPdf(docDefinition).download(filename)
    } catch (e) {
      setNotify({ open: true, title: 'Export Failed', message: 'We could not generate the PDF for this revision. Please try again.' })
    }
  }

  const generatePDFPreview = async (q) => {
    try {
      await ensurePdfMake()
      const logoDataUrl = await toDataURL(q.companyInfo?.logo || logo)
      const currency = q.priceSchedule?.currency || 'AED'

      // Fetch full lead details and site visits for richer PDF (like quotations)
      let leadFull = q.lead || null
      let siteVisits = []
      try {
        const token = localStorage.getItem('token')
        const leadId = typeof q.lead === 'object' ? q.lead?._id : q.lead
        if (leadId) {
          const resLead = await api.get(`/api/leads/${leadId}`)
          leadFull = resLead.data
          const resVisits = await api.get(`/api/leads/${leadId}/site-visits`)
          siteVisits = Array.isArray(resVisits.data) ? resVisits.data : []
        }
      } catch {}

      const coverFieldsRaw = [
        ['Submitted To', q.submittedTo],
        ['Attention', q.attention],
        ['Offer Reference', q.offerReference],
        ['Enquiry Number', q.enquiryNumber || leadFull?.enquiryNumber],
        ['Offer Date', q.offerDate ? new Date(q.offerDate).toLocaleDateString() : ''],
        ['Enquiry Date', q.enquiryDate ? new Date(q.enquiryDate).toLocaleDateString() : ''],
        ['Project Title', q.projectTitle || leadFull?.projectTitle]
      ]
      const coverFields = coverFieldsRaw.filter(([, v]) => v && String(v).trim().length > 0)

      const scopeRows = (q.scopeOfWork || [])
        .filter(s => (s?.description || '').trim().length > 0)
        .map((s, i) => [String(i + 1), s.description, String(s.quantity || ''), s.unit || '', s.locationRemarks || ''])

      const priceItems = (q.priceSchedule?.items || [])
        .filter(it => (it?.description || '').trim().length > 0 || Number(it.quantity) > 0 || Number(it.unitRate) > 0)
      const priceRows = priceItems.map((it, i) => [
        String(i + 1),
        it.description || '',
        String(it.quantity || 0),
        it.unit || '',
        `${currency} ${Number(it.unitRate || 0).toFixed(2)}`,
        `${currency} ${Number((it.quantity || 0) * (it.unitRate || 0)).toFixed(2)}`
      ])

      const exclusions = (q.exclusions || []).map(x => String(x || '').trim()).filter(Boolean)
      const paymentTerms = (q.paymentTerms || []).filter(p => (p?.milestoneDescription || '').trim().length > 0 || String(p?.amountPercent || '').trim().length > 0)

      const dcwv = q.deliveryCompletionWarrantyValidity || {}
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
                { text: q.companyInfo?.name || 'Company', style: 'brand' },
                { text: [q.companyInfo?.address, q.companyInfo?.phone, q.companyInfo?.email].filter(Boolean).join(' | '), color: '#64748b', fontSize: 9 }
              ]
            ],
            columnGap: 12
          },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.5, lineColor: '#e5e7eb' }] }
        ]
      }

      const content = []
      content.push({ text: `Revision ${q.revisionNumber} — Commercial Quotation`, style: 'h1', margin: [0, 0, 0, 8] })

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

      // Project Details (from lead)
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

      // Site Visit Reports
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

      // Delivery/Completion/Warranty/Validity
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
        setPrintPreviewModal({ open: true, pdfUrl: dataUrl, revision: q })
      })
    } catch (e) {
      setNotify({ open: true, title: 'Preview Failed', message: 'We could not generate the PDF preview. Please try again.' })
    }
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

  // Filter and sort revisions
  const filteredRevisions = revisions.filter(r => {
    // Apply "My Revisions" filter
    if (myOnly && r.createdBy?._id !== currentUser?.id) return false
    
    // Apply "Approved Quotation" filter
    if (selectedApprovedQuotationFilter) {
      const rParentId = typeof r.parentQuotation === 'object' ? r.parentQuotation?._id : r.parentQuotation
      if (rParentId !== selectedApprovedQuotationFilter) return false
    }
    
    // Apply search filter
    if (search.trim()) {
      const term = search.toLowerCase()
      const matches = (
        (r.projectTitle || '').toLowerCase().includes(term) ||
        (r.offerReference || '').toLowerCase().includes(term) ||
        (r.lead?.customerName || '').toLowerCase().includes(term) ||
        (r.parentQuotation?.offerReference || '').toLowerCase().includes(term)
      )
      if (!matches) return false
    }
    
    // Apply name filter (project title or revision number) - using debounced value
    if (debouncedNameFilter.trim()) {
      const term = debouncedNameFilter.toLowerCase()
      const projectTitle = (r.projectTitle || r.lead?.projectTitle || '').toLowerCase()
      const revisionNumber = String(r.revisionNumber || '').toLowerCase()
      if (!projectTitle.includes(term) && !revisionNumber.includes(term)) return false
    }
    
    // Apply date modified filter - using debounced value
    if (debouncedDateModifiedFilter) {
      const filterDate = new Date(debouncedDateModifiedFilter)
      filterDate.setHours(0, 0, 0, 0)
      const revisionDate = r.updatedAt ? new Date(r.updatedAt) : null
      if (!revisionDate || revisionDate.toDateString() !== filterDate.toDateString()) return false
    }
    
    // Apply date created filter - using debounced value
    if (debouncedDateCreatedFilter) {
      const filterDate = new Date(debouncedDateCreatedFilter)
      filterDate.setHours(0, 0, 0, 0)
      const revisionDate = r.createdAt ? new Date(r.createdAt) : null
      if (!revisionDate || revisionDate.toDateString() !== filterDate.toDateString()) return false
    }
    
    return true
  })

  // Sort revisions by selected field and direction
  const sortedRevisions = [...filteredRevisions].sort((a, b) => {
    let compareResult = 0
    
    switch (sortField) {
      case 'name':
        // Sort by project title, then revision number
        const aProjectTitle = (a.projectTitle || a.lead?.projectTitle || '').toLowerCase()
        const bProjectTitle = (b.projectTitle || b.lead?.projectTitle || '').toLowerCase()
        const projectTitleCompare = aProjectTitle.localeCompare(bProjectTitle)
        if (projectTitleCompare !== 0) {
          compareResult = projectTitleCompare
        } else {
          // If project titles are equal, sort by revision number
          const aRevNum = String(a.revisionNumber || '').toLowerCase()
          const bRevNum = String(b.revisionNumber || '').toLowerCase()
          compareResult = aRevNum.localeCompare(bRevNum, undefined, { numeric: true, sensitivity: 'base' })
        }
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
    
    // Apply sort direction
    return sortDirection === 'asc' ? compareResult : -compareResult
  })

  // Pagination calculations
  const totalPages = Math.ceil(sortedRevisions.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedRevisions = sortedRevisions.slice(startIndex, endIndex)

  // Reset to page 1 when filters or sorting change
  useEffect(() => {
    setCurrentPage(1)
  }, [myOnly, selectedApprovedQuotationFilter, search, debouncedNameFilter, debouncedDateModifiedFilter, debouncedDateCreatedFilter, sortField, sortDirection])

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

  // Helper function to render revision actions
  const fetchProjectDetails = async (revisionId) => {
    if (projectDetailsMap[revisionId]) return projectDetailsMap[revisionId]
    
    try {
      const projectInfo = projectMap[revisionId]
      if (!projectInfo?._id) return null
      
      const res = await api.get(`/api/projects/${projectInfo._id}`)
      const project = res.data
      setProjectDetailsMap(prev => ({ ...prev, [revisionId]: project }))
      return project
    } catch {
      return null
    }
  }

  const handleViewProject = async (revision, isTable = false) => {
    if (isTable) {
      // Toggle accordion in table view
      const isExpanded = expandedProjectRows[revision._id]
      setExpandedProjectRows(prev => ({ ...prev, [revision._id]: !isExpanded }))
      
      // Fetch project details if not already loaded
      if (!isExpanded && !projectDetailsMap[revision._id]) {
        await fetchProjectDetails(revision._id)
      }
    } else {
      // Open modal in card view
      const project = await fetchProjectDetails(revision._id)
      if (project) {
        setProjectModal({ open: true, project })
      }
    }
  }

  // Handler for View Variations in table view (accordion)
  const handleViewVariationsTable = async (revision) => {
    const projectInfo = projectMap[revision._id]
    if (!projectInfo?._id) return
    
    const projectId = projectInfo._id
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

  const renderRevisionActions = (r) => (
    <div className="lead-actions">
      {projectMap[r._id] && (
        <button className="link-btn" onClick={() => handleViewProject(r, viewMode === 'table')}>
          View Project
        </button>
      )}
      <button className="assign-btn" onClick={() => {
        localStorage.setItem('revisionId', r._id)
        window.location.href = '/revision-detail'
      }}>View Details</button>
      {r.managementApproval?.status === 'pending' && (
        <span className="status-badge blue">Approval Pending</span>
      )}
      {(currentUser?.roles?.includes('manager') || currentUser?.roles?.includes('admin')) && r.managementApproval?.status === 'pending' && (
        <>
          <button className="approve-btn" onClick={() => setApprovalModal({ open: true, revision: r, action: 'approved', note: '' })}>Approve</button>
          <button className="reject-btn" onClick={() => setApprovalModal({ open: true, revision: r, action: 'rejected', note: '' })}>Reject</button>
        </>
      )}
    </div>
  )

  const totalRevisions = revisions.length
  const displayedRevisions = filteredRevisions.length

  return (
    <div className="lead-management">
      <div className="header" ref={headerRef}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1>Revisions Management</h1>
          <span style={{ 
            padding: '4px 12px', 
            borderRadius: '12px', 
            background: 'var(--bg)', 
            color: 'var(--text-muted)', 
            fontSize: '14px', 
            fontWeight: 600,
            border: '1px solid var(--border)'
          }}>
            {(myOnly || selectedApprovedQuotationFilter || search || debouncedNameFilter || debouncedDateModifiedFilter || debouncedDateCreatedFilter) ? `${displayedRevisions} of ${totalRevisions}` : totalRevisions} {totalRevisions === 1 ? 'Revision' : 'Revisions'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="checkbox" checked={myOnly} onChange={() => setMyOnly(!myOnly)} />
            My Revisions
          </label>
          <select
            value={selectedApprovedQuotationFilter}
            onChange={(e) => setSelectedApprovedQuotationFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: '14px',
              cursor: 'pointer',
              maxWidth: '250px',
              width: '250px'
            }}
          >
            <option value="">All Approved Quotations</option>
            {quotations.map(q => (
              <option key={q._id} value={q._id}>
                {q.projectTitle || q.lead?.projectTitle || 'Quotation'} - {q.offerReference || 'N/A'}
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
                transition: 'all 0.2s ease'
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
                transition: 'all 0.2s ease'
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
                  <span>Filtering...</span>
                </div>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 500 }}>
                Filter by Name:
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <input 
                    type="text"
                    placeholder="Project title or revision number..."
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
                    aria-label="Filter by project title or revision number"
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
              {(nameFilter || dateModifiedFilter || dateCreatedFilter) && (
                <button
                  onClick={() => {
                    setNameFilter('')
                    setDateModifiedFilter('')
                    setDateCreatedFilter('')
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

      {viewMode === 'card' ? (
        <div className="leads-grid">
          {paginatedRevisions.map(r => (
            <div key={r._id} className="lead-card">
              <div className="lead-header">
                <h3>
                  {r.parentQuotation?._id || r.parentQuotation ? (
                    <button
                      className="link-btn"
                      onClick={() => {
                        try {
                          const parentId = typeof r.parentQuotation === 'object' ? r.parentQuotation._id : r.parentQuotation;
                          localStorage.setItem('quotationId', parentId);
                          localStorage.setItem('quotationDetail', JSON.stringify(r.parentQuotation || {}));
                        } catch {}
                        window.location.href = '/quotation-detail';
                      }}
                      style={{
                        fontSize: 'inherit',
                        fontWeight: 'inherit',
                        padding: 0,
                        textDecoration: 'underline',
                        cursor: 'pointer'
                      }}
                    >
                      Revision #{r.revisionNumber || 'N/A'}
                    </button>
                  ) : (
                    `Revision #${r.revisionNumber || 'N/A'}`
                  )}
                </h3>
                {r.managementApproval?.status && (
                  <span className={`status-badge ${r.managementApproval.status === 'approved' ? 'green' : (r.managementApproval.status === 'rejected' ? 'red' : 'blue')}`}>
                    {r.managementApproval.status === 'pending' ? 'Approval Pending' : r.managementApproval.status}
                  </span>
                )}
              </div>
              <div className="lead-details">
                <p><strong>Project:</strong> {r.projectTitle || r.lead?.projectTitle || 'N/A'}</p>
                <p><strong>Customer:</strong> {r.lead?.customerName || 'N/A'}</p>
                <p><strong>Offer Ref:</strong> {r.offerReference || 'N/A'}</p>
                {typeof r.parentQuotation === 'object' && r.parentQuotation?._id && (
                  <p>
                    <strong>Parent Quotation:</strong>{' '}
                    <button className="link-btn" onClick={() => {
                      localStorage.setItem('quotationId', r.parentQuotation._id)
                      window.location.href = '/quotation-detail'
                    }}>
                      View
                    </button>
                  </p>
                )}
                <p><strong>Grand Total:</strong> {(r.priceSchedule?.currency || 'AED')} {Number(r.priceSchedule?.grandTotal || 0).toFixed(2)}</p>
                {r.diffFromParent && Array.isArray(r.diffFromParent) && r.diffFromParent.length > 0 && (
                  <p>
                    <strong>Changes:</strong>
                    <span 
                      className="status-badge" 
                      style={{ 
                        marginLeft: '8px', 
                        background: '#DBEAFE', 
                        color: '#1E40AF', 
                        border: '1px solid #93C5FD',
                        cursor: 'pointer',
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        transition: 'all 0.2s',
                        userSelect: 'none'
                      }}
                      title="Click to view full changes"
                      onClick={() => setDiffModal({ open: true, revision: r })}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#BFDBFE'
                        e.target.style.transform = 'scale(1.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#DBEAFE'
                        e.target.style.transform = 'scale(1)'
                      }}
                    >
                      {r.diffFromParent.length} change{r.diffFromParent.length > 1 ? 's' : ''}
                    </span>
                  </p>
                )}
                <p><strong>Created by:</strong> {r.createdBy?._id === currentUser?.id ? 'You' : (r.createdBy?.name || 'N/A')}</p>
                {r.createdBy?._id !== currentUser?.id && r.createdBy && (
                  <button className="link-btn" onClick={() => setProfileUser(r.createdBy)}>
                    View Profile
                  </button>
                )}
              </div>
              {renderRevisionActions(r)}
            </div>
          ))}
        </div>
      ) : (
        <div className="table" style={{ marginTop: '24px' }}>
          <table>
            <thead>
              <tr>
                <th>Revision #</th>
                <th>Project</th>
                <th>Parent Quotation</th>
                <th>Grand Total</th>
                <th>Status</th>
                <th>Changes</th>
                <th>Created By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRevisions.map(r => (
                <>
                  <tr key={r._id}>
                    <td data-label="Revision #">
                      {r.parentQuotation?._id || r.parentQuotation ? (
                        <button
                          className="link-btn"
                          onClick={() => {
                            try {
                              const parentId = typeof r.parentQuotation === 'object' ? r.parentQuotation._id : r.parentQuotation;
                              localStorage.setItem('quotationId', parentId);
                              localStorage.setItem('quotationDetail', JSON.stringify(r.parentQuotation || {}));
                            } catch {}
                            window.location.href = '/quotation-detail';
                          }}
                          style={{
                            fontSize: 'inherit',
                            fontWeight: 600,
                            padding: 0,
                            textDecoration: 'underline'
                          }}
                        >
                          {r.revisionNumber || 'N/A'}
                        </button>
                      ) : (
                        r.revisionNumber || 'N/A'
                      )}
                    </td>
                    <td data-label="Project">{r.projectTitle || r.lead?.projectTitle || 'Revision'}</td>
                    <td data-label="Parent Quotation">
                      {typeof r.parentQuotation === 'object' && r.parentQuotation?._id && (
                        <button className="link-btn" onClick={() => {
                          localStorage.setItem('quotationId', r.parentQuotation._id)
                          window.location.href = '/quotation-detail'
                        }}>
                          View
                        </button>
                      )}
                    </td>
                    <td data-label="Grand Total">{(r.priceSchedule?.currency || 'AED')} {Number(r.priceSchedule?.grandTotal || 0).toFixed(2)}</td>
                    <td data-label="Status">
                      <span className={`status-badge ${r.managementApproval?.status === 'approved' ? 'green' : (r.managementApproval?.status === 'rejected' ? 'red' : 'blue')}`}>
                        {r.managementApproval?.status === 'pending' ? 'Approval Pending' : (r.managementApproval?.status || 'N/A')}
                      </span>
                    </td>
                    <td data-label="Changes">
                      {r.diffFromParent && Array.isArray(r.diffFromParent) && r.diffFromParent.length > 0 ? (
                        <span 
                          className="status-badge" 
                          style={{ 
                            background: '#DBEAFE', 
                            color: '#1E40AF', 
                            border: '1px solid #93C5FD',
                            cursor: 'pointer',
                            fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            display: 'inline-block',
                            transition: 'all 0.2s',
                            userSelect: 'none'
                          }}
                          title="Click to view full changes"
                          onClick={() => setDiffModal({ open: true, revision: r })}
                          onMouseEnter={(e) => {
                            e.target.style.background = '#BFDBFE'
                            e.target.style.transform = 'scale(1.05)'
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = '#DBEAFE'
                            e.target.style.transform = 'scale(1)'
                          }}
                        >
                          {r.diffFromParent.length} change{r.diffFromParent.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No changes</span>
                      )}
                    </td>
                    <td data-label="Created By">
                      {r.createdBy?._id === currentUser?.id ? 'You' : (r.createdBy?.name || 'N/A')}
                      {r.createdBy?._id !== currentUser?.id && r.createdBy && (
                        <button className="link-btn" onClick={() => setProfileUser(r.createdBy)} style={{ marginLeft: '6px' }}>
                          View Profile
                        </button>
                      )}
                    </td>
                    <td data-label="Actions">
                      {renderRevisionActions(r)}
                    </td>
                  </tr>
                  {expandedProjectRows[r._id] && projectDetailsMap[r._id] && (
                    <tr className="accordion-row">
                      <td colSpan="10" style={{ padding: '0', borderTop: 'none' }}>
                        <div className="accordion-content" style={{ padding: '20px', background: 'var(--bg)' }}>
                          <h4 style={{ marginTop: 0, marginBottom: '16px' }}>Project Details</h4>
                          <div className="ld-kv" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                            <p><strong>Project Name:</strong> {projectDetailsMap[r._id].name || 'N/A'}</p>
                            <p><strong>Status:</strong> {projectDetailsMap[r._id].status || 'N/A'}</p>
                            <p><strong>Location:</strong> {projectDetailsMap[r._id].locationDetails || 'N/A'}</p>
                            <p><strong>Working Hours:</strong> {projectDetailsMap[r._id].workingHours || 'N/A'}</p>
                            <p><strong>Manpower Count:</strong> {projectDetailsMap[r._id].manpowerCount || 'N/A'}</p>
                            <p><strong>Budget:</strong> {projectDetailsMap[r._id].budget ? `${projectDetailsMap[r._id].budget}` : 'N/A'}</p>
                            <p><strong>Site Engineer:</strong> {projectDetailsMap[r._id].assignedSiteEngineer?.name || 'Not Assigned'}</p>
                            <p><strong>Project Engineer:</strong> {projectDetailsMap[r._id].assignedProjectEngineer?.name || 'Not Assigned'}</p>
                            <p><strong>Created At:</strong> {projectDetailsMap[r._id].createdAt ? new Date(projectDetailsMap[r._id].createdAt).toLocaleString() : 'N/A'}</p>
                            <p><strong>Created By:</strong> {projectDetailsMap[r._id].createdBy?.name || 'N/A'}</p>
                          </div>
                          <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                            <button className="assign-btn" onClick={() => {
                              try {
                                localStorage.setItem('projectsFocusId', projectDetailsMap[r._id]._id)
                                localStorage.setItem('projectId', projectDetailsMap[r._id]._id)
                              } catch {}
                              window.location.href = '/project-detail'
                            }}>
                              View Full Project Details
                            </button>
                            <button
                              className="link-btn"
                              onClick={() => handleViewVariationsTable(r)}
                            >
                              View Variations
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {projectMap[r._id] && expandedVariationRows[projectMap[r._id]._id] && (
                    <tr key={`${r._id}-variations`} className="accordion-row">
                      <td colSpan="10" style={{ padding: '0', borderTop: 'none' }}>
                        <div className="accordion-content" style={{ padding: '16px', background: 'var(--bg)' }}>
                          <h4 style={{ marginTop: '0', marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>Variations ({(projectVariationsMap[projectMap[r._id]._id] || []).length})</h4>
                          {(projectVariationsMap[projectMap[r._id]._id] || []).length === 0 ? (
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
                                  {(projectVariationsMap[projectMap[r._id]._id] || []).sort((a,b)=> (a.variationNumber||0)-(b.variationNumber||0)).map((v) => (
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
      {filteredRevisions.length > 0 && (
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
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Showing {startIndex + 1} to {Math.min(endIndex, filteredRevisions.length)} of {filteredRevisions.length}
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
      {editModal.open && (
        <div className="modal-overlay" onClick={() => setEditModal({ open: false, revision: null, form: null })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editModal.mode === 'create' ? 'Create Revision' : 'Edit Revision'}</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {editModal.revision?._id && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          if (editModal.mode === 'create') {
                            // Create child revision mode
                            localStorage.setItem('revisionCreateMode', 'true')
                            localStorage.setItem('revisionSourceRevisionId', editModal.revision._id)
                            localStorage.setItem('revisionFormData', JSON.stringify(editModal.form))
                          } else {
                            // Edit mode
                            localStorage.setItem('revisionId', editModal.revision._id)
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
                            localStorage.setItem('revisionSourceRevisionId', editModal.revision._id)
                            localStorage.setItem('revisionFormData', JSON.stringify(editModal.form))
                          } else {
                            // Edit mode
                            localStorage.setItem('revisionId', editModal.revision._id)
                            localStorage.setItem('revisionEditMode', 'true')
                            localStorage.setItem('revisionEditFromListing', 'true')
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
                <button onClick={() => setEditModal({ open: false, revision: null, form: null, mode: 'edit' })} className="close-btn">×</button>
              </div>
            </div>
            {editModal.form && (
              <div className="lead-form" style={{ maxHeight: '70vh', overflow: 'auto' }}>
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
                  <button type="button" className="cancel-btn" onClick={() => setEditModal({ open: false, revision: null, form: null, mode: 'edit' })}>Cancel</button>
                  <button type="button" className="save-btn" onClick={async () => {
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
                      
                      if (editModal.mode === 'create') {
                        await api.post(`/api/revisions`, { sourceRevisionId: editModal.revision._id, data: payload })
                        setNotify({ open: true, title: 'Revision Created', message: 'New revision created successfully.' })
                      } else {
                        await api.put(`/api/revisions/${editModal.revision._id}`, payload)
                        setNotify({ open: true, title: 'Saved', message: 'Revision updated successfully.' })
                      }
                      await fetchRevisions()
                      setEditModal({ open: false, revision: null, form: null, mode: 'edit' })
                    } catch (e) {
                      setNotify({ open: true, title: 'Save Failed', message: e.response?.data?.message || 'Failed to save revision' })
                    }
                  }}>{editModal.mode === 'create' ? 'Create Revision' : 'Save Changes'}</button>
                </div>
              </div>
            )}
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

      {approvalsView && (
        <div className="modal-overlay history" onClick={() => setApprovalsView(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Approvals & Rejections</h2>
              <button onClick={() => setApprovalsView(null)} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ maxHeight: '65vh', overflow: 'auto' }}>
              {(() => {
                const rev = approvalsView
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
                  <div>
                    {cycles.map((c, idx) => (
                      <div key={idx} className="edit-item" style={{ marginTop: idx === 0 ? 0 : 12 }}>
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
            </div>
          </div>
        </div>
      )}

      {approvalModal.open && (
        <div className="modal-overlay" onClick={() => setApprovalModal({ open: false, revision: null, action: null, note: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{approvalModal.action === 'approved' ? 'Approve Revision' : 'Reject Revision'}</h2>
              <button onClick={() => setApprovalModal({ open: false, revision: null, action: null, note: '' })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <div className="form-group">
                <label>Note</label>
                <textarea value={approvalModal.note} onChange={e => setApprovalModal({ ...approvalModal, note: e.target.value })} />
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setApprovalModal({ open: false, revision: null, action: null, note: '' })}>Cancel</button>
                <button type="button" className="save-btn" onClick={async () => {
                  if (!approvalModal.revision || !approvalModal.action) return
                  await approveRevision(approvalModal.revision, approvalModal.action, approvalModal.note)
                  setApprovalModal({ open: false, revision: null, action: null, note: '' })
                }}>Confirm</button>
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

      {confirmDelete.open && confirmDelete.revision && (
        <div className="modal-overlay" onClick={() => setConfirmDelete({ open: false, revision: null })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Revision</h2>
              <button onClick={() => setConfirmDelete({ open: false, revision: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to delete Revision {confirmDelete.revision.revisionNumber}? This action cannot be undone.</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setConfirmDelete({ open: false, revision: null })}>Cancel</button>
                <button type="button" className="reject-btn" onClick={async () => {
                  try {
                    const token = localStorage.getItem('token')
                    await api.delete(`/api/revisions/${confirmDelete.revision._id}`)
                    setConfirmDelete({ open: false, revision: null })
                    setNotify({ open: true, title: 'Revision Deleted', message: 'The revision was deleted successfully.' })
                    await fetchRevisions()
                  } catch (e) {
                    setConfirmDelete({ open: false, revision: null })
                    setNotify({ open: true, title: 'Delete Failed', message: e.response?.data?.message || 'We could not delete the revision. Please try again.' })
                  }
                }}>Confirm Delete</button>
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

      {sendApprovalConfirmModal.open && sendApprovalConfirmModal.revision && (
        <div className="modal-overlay" onClick={() => setSendApprovalConfirmModal({ open: false, revision: null })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Send for Approval</h2>
              <button onClick={() => setSendApprovalConfirmModal({ open: false, revision: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to send this revision for approval?</p>
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setSendApprovalConfirmModal({ open: false, revision: null })}>Cancel</button>
                <button 
                  type="button" 
                  className="save-btn" 
                  onClick={() => sendForApproval(sendApprovalConfirmModal.revision)}
                  disabled={isSubmitting && loadingAction === `send-approval-${sendApprovalConfirmModal.revision._id}`}
                >
                  {isSubmitting && loadingAction === `send-approval-${sendApprovalConfirmModal.revision._id}` ? 'Sending...' : 'Confirm & Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {projectModal.open && projectModal.project && (
        <div className="modal-overlay" onClick={() => setProjectModal({ open: false, project: null })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header">
              <h2>Project Details</h2>
              <button onClick={() => setProjectModal({ open: false, project: null })} className="close-btn">×</button>
            </div>
            <div className="lead-form" style={{ maxHeight: '70vh', overflow: 'auto' }}>
              <div className="ld-kv" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                <p><strong>Project Name:</strong> {projectModal.project.name || 'N/A'}</p>
                <p><strong>Status:</strong> {projectModal.project.status || 'N/A'}</p>
                <p><strong>Location:</strong> {projectModal.project.locationDetails || 'N/A'}</p>
                <p><strong>Working Hours:</strong> {projectModal.project.workingHours || 'N/A'}</p>
                <p><strong>Manpower Count:</strong> {projectModal.project.manpowerCount || 'N/A'}</p>
                <p><strong>Budget:</strong> {projectModal.project.budget ? `${projectModal.project.budget}` : 'N/A'}</p>
                <p><strong>Site Engineer:</strong> {projectModal.project.assignedSiteEngineer?.name || 'Not Assigned'}</p>
                <p><strong>Project Engineer:</strong> {projectModal.project.assignedProjectEngineer?.name || 'Not Assigned'}</p>
                <p><strong>Created At:</strong> {projectModal.project.createdAt ? new Date(projectModal.project.createdAt).toLocaleString() : 'N/A'}</p>
                <p><strong>Created By:</strong> {projectModal.project.createdBy?.name || 'N/A'}</p>
              </div>
              <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
                <button className="assign-btn" onClick={() => {
                  try {
                    localStorage.setItem('projectsFocusId', projectModal.project._id)
                    localStorage.setItem('projectId', projectModal.project._id)
                  } catch {}
                  window.location.href = '/project-detail'
                }}>
                  View Full Project Details
                </button>
                <button
                  className="link-btn"
                  onClick={async () => {
                    try {
                      const res = await api.get(`/api/project-variations?parentProject=${projectModal.project._id}`)
                      const list = Array.isArray(res.data) ? res.data : []
                      if (list.length === 0) {
                        setNotify({ open: true, title: 'No Variations', message: 'No variations found for this project.' })
                        return
                      }
                      setVariationsForProject(list)
                      setSelectedProjectForList(projectModal.project)
                      setShowVariationsListModal(true)
                    } catch (e) {
                      setNotify({ open: true, title: 'Open Failed', message: 'We could not load the variations. Please try again.' })
                    }
                  }}
                >
                  View Variations
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {diffModal.open && diffModal.revision && diffModal.revision.diffFromParent && Array.isArray(diffModal.revision.diffFromParent) && diffModal.revision.diffFromParent.length > 0 && (
        <div className="modal-overlay" onClick={() => setDiffModal({ open: false, revision: null })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>Changes from Parent</h2>
              <button onClick={() => setDiffModal({ open: false, revision: null })} className="close-btn">×</button>
    </div>
            <div className="lead-form">
              <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
                Revision #{diffModal.revision.revisionNumber} includes the following changes from the parent quotation:
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
                    {diffModal.revision.diffFromParent.map((diff, idx) => {
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
                      
                      // Format the values for display
                      const fromVal = diff.from !== undefined ? diff.from : (diff.fromValue !== undefined ? diff.fromValue : null)
                      const toVal = diff.to !== undefined ? diff.to : (diff.toValue !== undefined ? diff.toValue : null)
                      const fromValue = isRichText ? (fromVal || '') : formatHistoryValue(diff.field, fromVal)
                      const toValue = isRichText ? (toVal || '') : formatHistoryValue(diff.field, toVal)
                      
                      return (
                        <tr key={idx}>
                          <td data-label="Field"><strong>{fieldName}</strong></td>
                          <td data-label="Previous Value">
                            {isRichText ? (
                              <div style={{ 
                                margin: 0, 
                                padding: '10px 12px', 
                                background: '#FEF2F2', 
                                border: '1px solid #FECACA', 
                                borderRadius: '6px',
                                maxHeight: '200px',
                                overflow: 'auto',
                                color: '#991B1B',
                                fontSize: '13px',
                                lineHeight: '1.5'
                              }} dangerouslySetInnerHTML={{ __html: fromValue || '(empty)' }} />
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
                                lineHeight: '1.5',
                                maxHeight: '200px',
                                overflow: 'auto',
                                color: '#991B1B',
                                fontFamily: 'inherit',
                                fontWeight: 400
                              }}>
                                {fromValue || '(empty)'}
                              </pre>
                            )}
                          </td>
                          <td data-label="New Value">
                            {isRichText ? (
                              <div style={{ 
                                margin: 0, 
                                padding: '10px 12px', 
                                background: '#F0FDF4', 
                                border: '1px solid #BBF7D0', 
                                borderRadius: '6px',
                                maxHeight: '200px',
                                overflow: 'auto',
                                color: '#166534',
                                fontSize: '13px',
                                lineHeight: '1.5'
                              }} dangerouslySetInnerHTML={{ __html: toValue || '(empty)' }} />
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
                                lineHeight: '1.5',
                                maxHeight: '200px',
                                overflow: 'auto',
                                color: '#166534',
                                fontFamily: 'inherit',
                              fontWeight: 400
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
              <div className="form-actions" style={{ marginTop: '20px' }}>
                <button type="button" className="save-btn" onClick={() => setDiffModal({ open: false, revision: null })}>Close</button>
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
                        await exportPDF(printPreviewModal.revision)
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

export default RevisionManagement


