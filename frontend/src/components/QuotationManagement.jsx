import { useEffect, useMemo, useState, useRef, Fragment } from "react";
import { api, apiFetch } from "../lib/api";
import "./LeadManagement.css";
import "./LoadingComponents.css";
import { CreateQuotationModal } from "./CreateQuotationModal";
import "../design-system";
import logo from "../assets/logo/app-logo.png";
import {
  Spinner,
  SkeletonCard,
  SkeletonTableRow,
  ButtonLoader,
  PageSkeleton,
} from "./LoadingComponents";
import { Modal } from "../design-system/Modal";

// Google Docs-style Rich Text Editor using contentEditable (compatible with React 19)
function ScopeOfWorkEditor({ value, onChange }) {
  const editorRef = useRef(null);
  const savedSelectionRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [fontSize, setFontSize] = useState("14");
  const [fontSizeInput, setFontSizeInput] = useState("14");
  const [showFontSizeDropdown, setShowFontSizeDropdown] = useState(false);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [textColor, setTextColor] = useState("#000000");
  const [highlightColor, setHighlightColor] = useState("#ffff00");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    if (editorRef.current) {
      const currentHtml = editorRef.current.innerHTML;
      const newValue = value || "";
      if (currentHtml !== newValue) {
        editorRef.current.innerHTML = newValue;
      }
    }
  }, [value]);

  useEffect(() => {
    if (!showFontSizeDropdown) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest("[data-font-size-container]")) {
        setShowFontSizeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFontSizeDropdown]);

  const handleInput = (e) => {
    const html = e.target.innerHTML;
    onChange(html);
    setTimeout(() => saveSelection(), 0);
  };

  useEffect(() => {
    if (!isFocused || !editorRef.current) return;
    const handleMouseUp = (e) => {
      if (editorRef.current?.contains(e.target)) {
        setTimeout(() => saveSelection(), 0);
      }
    };
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (editorRef.current?.contains(range.anchorNode)) {
          saveSelection();
        }
      }
    };
    editorRef.current.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      if (editorRef.current) {
        editorRef.current.removeEventListener("mouseup", handleMouseUp);
      }
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [isFocused]);

  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const handleUndo = () => {
    document.execCommand("undo", false, null);
    editorRef.current?.focus();
  };

  const handleRedo = () => {
    document.execCommand("redo", false, null);
    editorRef.current?.focus();
  };

  const expandToWord = (range) => {
    try {
      if (range.expand) {
        range.expand("word");
      }
    } catch (e) {
      const textNode = range.startContainer;
      if (textNode && textNode.nodeType === 3) {
        const text = textNode.textContent;
        const start = range.startOffset;
        let wordStart = start;
        let wordEnd = start;
        while (wordStart > 0 && /\S/.test(text[wordStart - 1])) {
          wordStart--;
        }
        while (wordEnd < text.length && /\S/.test(text[wordEnd])) {
          wordEnd++;
        }
        if (wordStart < wordEnd) {
          range.setStart(textNode, wordStart);
          range.setEnd(textNode, wordEnd);
        }
      }
    }
  };

  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (
        editorRef.current &&
        (editorRef.current.contains(range.anchorNode) ||
          editorRef.current.contains(range.focusNode))
      ) {
        if (!range.collapsed) {
          savedSelectionRef.current = range.cloneRange();
        } else {
          savedSelectionRef.current = null;
        }
      }
    }
  };

  const applyFontSize = (size) => {
    if (!savedSelectionRef.current) {
      if (editorRef.current) {
        editorRef.current.focus();
      }
      return;
    }

    const savedRange = savedSelectionRef.current;

    if (
      !editorRef.current ||
      !editorRef.current.contains(savedRange.startContainer) ||
      !editorRef.current.contains(savedRange.endContainer)
    ) {
      savedSelectionRef.current = null;
      if (editorRef.current) {
        editorRef.current.focus();
      }
      return;
    }

    const range = savedRange.cloneRange();

    if (range.collapsed) {
      if (editorRef.current) {
        editorRef.current.focus();
      }
      return;
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    try {
      selection.addRange(range.cloneRange());
    } catch (e) {
      return;
    }

    if (!editorRef.current?.contains(range.commonAncestorContainer)) {
      editorRef.current?.focus();
      return;
    }

    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    if (startContainer === endContainer && startContainer.nodeType === 3) {
      const textNode = startContainer;
      const text = textNode.textContent;
      const beforeText = text.substring(0, startOffset);
      const selectedText = text.substring(startOffset, endOffset);
      const afterText = text.substring(endOffset);

      const beforeNode = document.createTextNode(beforeText);
      const span = document.createElement("span");
      span.style.fontSize = `${size}px`;
      span.textContent = selectedText;
      const afterNode = document.createTextNode(afterText);

      const parent = textNode.parentNode;
      if (beforeNode.textContent) {
        parent.insertBefore(beforeNode, textNode);
      }
      parent.insertBefore(span, textNode);
      if (afterNode.textContent) {
        parent.insertBefore(afterNode, textNode);
      }
      parent.removeChild(textNode);
    } else {
      const workRange = range.cloneRange();
      const wrapper = document.createElement("span");
      wrapper.style.fontSize = `${size}px`;
      const contents = workRange.extractContents();
      if (contents.hasChildNodes()) {
        while (contents.firstChild) {
          wrapper.appendChild(contents.firstChild);
        }
      } else if (contents.nodeType === 3) {
        wrapper.appendChild(contents);
      }
      if (wrapper.textContent.trim() || wrapper.hasChildNodes()) {
        range.insertNode(wrapper);
      }
    }

    savedSelectionRef.current = null;

    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }

    editorRef.current?.focus();
  };

  const applyFontFamily = (family) => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (selection.isCollapsed) {
        expandToWord(range);
      }
      if (!range.collapsed) {
        const span = document.createElement("span");
        span.style.fontFamily = family;
        try {
          range.surroundContents(span);
        } catch (e) {
          const contents = range.extractContents();
          span.appendChild(contents);
          range.insertNode(span);
        }
      }
    }
    editorRef.current?.focus();
  };

  const handleFontSizeInputChange = (e) => {
    const value = e.target.value;
    setFontSizeInput(value);
  };

  const handleFontSizeInputBlur = (e) => {
    if (
      e.relatedTarget &&
      e.relatedTarget.closest("[data-font-size-container]")
    ) {
      return;
    }

    setShowFontSizeDropdown(false);

    if (!savedSelectionRef.current) {
      const numValue = parseFloat(fontSizeInput);
      if (
        fontSizeInput &&
        !isNaN(numValue) &&
        numValue > 0 &&
        numValue <= 200
      ) {
        const sizeStr = String(Math.round(numValue));
        setFontSize(sizeStr);
        setFontSizeInput(sizeStr);
      } else {
        setFontSizeInput(fontSize);
      }
      return;
    }

    const numValue = parseFloat(fontSizeInput);
    if (fontSizeInput && !isNaN(numValue) && numValue > 0 && numValue <= 200) {
      const sizeStr = String(Math.round(numValue));
      setFontSize(sizeStr);
      setFontSizeInput(sizeStr);
      applyFontSize(numValue);
    } else {
      setFontSizeInput(fontSize);
    }
  };

  const handleFontSizeInputKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleFontSizeInputBlur();
    }
  };

  const handleFontSizeSelect = (size) => {
    setFontSize(size);
    setFontSizeInput(size);
    setShowFontSizeDropdown(false);

    if (!savedSelectionRef.current) {
      return;
    }

    setTimeout(() => {
      applyFontSize(parseFloat(size));
    }, 10);
  };

  const handleFontFamilyChange = (e) => {
    const family = e.target.value;
    setFontFamily(family);
    applyFontFamily(family);
  };

  const handleTextColorChange = (e) => {
    const color = e.target.value;
    setTextColor(color);
    document.execCommand("foreColor", false, color);
    editorRef.current?.focus();
  };

  const handleHighlightColorChange = (e) => {
    const color = e.target.value;
    setHighlightColor(color);
    document.execCommand("backColor", false, color);
    editorRef.current?.focus();
  };

  const handleFormatBlock = (e) => {
    const format = e.target.value;
    if (format === "p") {
      document.execCommand("formatBlock", false, "<p>");
    } else {
      document.execCommand("formatBlock", false, `<${format}>`);
    }
    editorRef.current?.focus();
  };

  const handleInsertLink = () => {
    setShowLinkModal(true);
    setLinkUrl("");
  };

  const handleLinkModalSave = () => {
    if (linkUrl && linkUrl.trim()) {
      const url = linkUrl.trim();
      const finalUrl =
        url.startsWith("http://") || url.startsWith("https://")
          ? url
          : `https://${url}`;

      const selection = window.getSelection();
      if (selection.rangeCount > 0 && editorRef.current) {
        const range = selection.getRangeAt(0);
        if (selection.isCollapsed) {
          expandToWord(range);
        }
        if (!range.collapsed) {
          const linkElement =
            range.commonAncestorContainer.nodeType === 1
              ? range.commonAncestorContainer.closest("a")
              : range.commonAncestorContainer.parentElement?.closest("a");

          if (linkElement) {
            linkElement.href = finalUrl;
          } else {
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand("createLink", false, finalUrl);
          }
        } else {
          const link = document.createElement("a");
          link.href = finalUrl;
          link.textContent = finalUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          range.insertNode(link);
          range.setStartAfter(link);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
    setShowLinkModal(false);
    setLinkUrl("");
    editorRef.current?.focus();
  };

  const handleLinkModalCancel = () => {
    setShowLinkModal(false);
    setLinkUrl("");
    editorRef.current?.focus();
  };

  const handleListStyleChange = (listType, style) => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && editorRef.current) {
      const range = selection.getRangeAt(0);
      let listElement = null;

      if (range.commonAncestorContainer.nodeType === 1) {
        listElement = range.commonAncestorContainer.closest("ul, ol");
      } else {
        listElement =
          range.commonAncestorContainer.parentElement?.closest("ul, ol");
      }

      if (listElement) {
        const currentType = listElement.tagName.toLowerCase();
        if (
          (listType === "ul" && currentType === "ol") ||
          (listType === "ol" && currentType === "ul")
        ) {
          const newList = document.createElement(
            listType === "ul" ? "ul" : "ol"
          );
          newList.style.setProperty("list-style-type", style, "important");
          while (listElement.firstChild) {
            newList.appendChild(listElement.firstChild);
          }
          listElement.parentNode?.replaceChild(newList, listElement);
          listElement = newList;
        } else {
          listElement.style.setProperty("list-style-type", style, "important");
          listElement.setAttribute("data-list-style", style);
        }
      } else {
        if (listType === "ul") {
          document.execCommand("insertUnorderedList", false, null);
          setTimeout(() => {
            const newList = editorRef.current?.querySelector("ul:last-of-type");
            if (newList) {
              newList.style.setProperty("list-style-type", style, "important");
              newList.setAttribute("data-list-style", style);
            }
          }, 50);
        } else {
          document.execCommand("insertOrderedList", false, null);
          setTimeout(() => {
            const newList = editorRef.current?.querySelector("ol:last-of-type");
            if (newList) {
              newList.style.setProperty("list-style-type", style, "important");
              newList.setAttribute("data-list-style", style);
            }
          }, 50);
        }
      }
    }
    editorRef.current?.focus();
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "6px",
        background: "var(--input)",
        width: "100%",
        minWidth: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "4px",
          padding: "8px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          flexWrap: "wrap",
          alignItems: "center",
          width: "100%",
          minHeight: "36px",
          boxSizing: "border-box",
        }}
        onMouseEnter={() => saveSelection()}
        onMouseDown={(e) => saveSelection()}
      >
        <button
          type="button"
          onClick={handleUndo}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
          }}
          title="Undo"
        >
          ↶
        </button>
        <button
          type="button"
          onClick={handleRedo}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
          }}
          title="Redo"
        >
          ↷
        </button>
        <div
          style={{
            width: "1px",
            height: "20px",
            background: "var(--border)",
            margin: "0 4px",
          }}
        />

        <select
          onChange={handleFormatBlock}
          style={{
            padding: "4px 6px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
            fontSize: "12px",
            width: "120px",
            minWidth: "120px",
            maxWidth: "120px",
          }}
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
          style={{
            padding: "4px 6px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
            fontSize: "12px",
            width: "140px",
            minWidth: "140px",
            maxWidth: "140px",
          }}
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
          style={{ position: "relative", display: "inline-block" }}
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
              e.preventDefault();
              saveSelection();
              setTimeout(() => {
                e.target.focus();
              }, 0);
            }}
            onFocus={() => {
              saveSelection();
              setShowFontSizeDropdown(true);
            }}
            style={{
              padding: "4px 6px",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              background: "var(--input)",
              fontSize: "12px",
              width: "60px",
              boxSizing: "border-box",
              textAlign: "center",
            }}
            title="Font Size (type custom value or click dropdown)"
          />
          {showFontSizeDropdown && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: "2px",
                background: "var(--input)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                zIndex: 1000,
                maxHeight: "200px",
                overflowY: "auto",
                minWidth: "60px",
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map(
                (size) => (
                  <div
                    key={size}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!savedSelectionRef.current) {
                        saveSelection();
                      }
                      handleFontSizeSelect(String(size));
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      saveSelection();
                    }}
                    style={{
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontSize: "12px",
                      backgroundColor:
                        fontSize === String(size)
                          ? "var(--primary)"
                          : "transparent",
                      color:
                        fontSize === String(size) ? "white" : "var(--text)",
                    }}
                    onMouseEnter={(e) => {
                      if (fontSize !== String(size)) {
                        e.target.style.backgroundColor = "var(--bg)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (fontSize !== String(size)) {
                        e.target.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    {size}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        <div
          style={{
            width: "1px",
            height: "20px",
            background: "var(--border)",
            margin: "0 4px",
          }}
        />

        <button
          type="button"
          onClick={() => execCommand("bold")}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
            fontWeight: "bold",
          }}
          title="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => execCommand("italic")}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
            fontStyle: "italic",
          }}
          title="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => execCommand("underline")}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
          title="Underline"
        >
          <u>U</u>
        </button>

        <div style={{ position: "relative", display: "inline-block" }}>
          <input
            type="color"
            value={textColor}
            onChange={handleTextColorChange}
            style={{
              width: "32px",
              height: "28px",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              cursor: "pointer",
              padding: 0,
            }}
            title="Text Color"
          />
        </div>

        <div style={{ position: "relative", display: "inline-block" }}>
          <input
            type="color"
            value={highlightColor}
            onChange={handleHighlightColorChange}
            style={{
              width: "32px",
              height: "28px",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              cursor: "pointer",
              padding: 0,
            }}
            title="Highlight Color"
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "4px",
          padding: "8px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          flexWrap: "wrap",
          alignItems: "center",
          width: "100%",
        }}
      >
        <button
          type="button"
          onClick={() => execCommand("justifyLeft")}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
          }}
          title="Align Left"
        >
          ⬅
        </button>
        <button
          type="button"
          onClick={() => execCommand("justifyCenter")}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
          }}
          title="Align Center"
        >
          ⬌
        </button>
        <button
          type="button"
          onClick={() => execCommand("justifyRight")}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
          }}
          title="Align Right"
        >
          ➡
        </button>
        <button
          type="button"
          onClick={() => execCommand("justifyFull")}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
          }}
          title="Justify"
        >
          ⬌⬌
        </button>

        <div
          style={{
            width: "1px",
            height: "20px",
            background: "var(--border)",
            margin: "0 4px",
          }}
        />

        <div style={{ position: "relative", display: "inline-block" }}>
          <button
            type="button"
            onClick={() => handleListStyleChange("ul", "disc")}
            style={{
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              background: "var(--input)",
              cursor: "pointer",
              pointerEvents: "none",
            }}
            title="Bullet List"
          >
            •
          </button>
          <select
            onChange={(e) => {
              e.stopPropagation();
              handleListStyleChange("ul", e.target.value);
            }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "pointer",
              fontSize: "12px",
              zIndex: 10,
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

        <div style={{ position: "relative", display: "inline-block" }}>
          <button
            type="button"
            onClick={() => handleListStyleChange("ol", "decimal")}
            style={{
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              background: "var(--input)",
              cursor: "pointer",
              pointerEvents: "none",
            }}
            title="Numbered List"
          >
            1.
          </button>
          <select
            onChange={(e) => {
              e.stopPropagation();
              handleListStyleChange("ol", e.target.value);
            }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "pointer",
              fontSize: "12px",
              zIndex: 10,
            }}
            title="Numbered List Style"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="decimal">1. Decimal</option>
            <option value="decimal-leading-zero">
              01. Decimal Leading Zero
            </option>
            <option value="lower-roman">i. Lower Roman</option>
            <option value="upper-roman">I. Upper Roman</option>
            <option value="lower-alpha">a. Lower Alpha</option>
            <option value="upper-alpha">A. Upper Alpha</option>
            <option value="lower-latin">a. Lower Latin</option>
            <option value="upper-latin">A. Upper Latin</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => execCommand("outdent")}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
          }}
          title="Decrease Indent"
        >
          ⬅
        </button>
        <button
          type="button"
          onClick={() => execCommand("indent")}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
          }}
          title="Increase Indent"
        >
          ➡
        </button>

        <div
          style={{
            width: "1px",
            height: "20px",
            background: "var(--border)",
            margin: "0 4px",
          }}
        />

        <button
          type="button"
          onClick={handleInsertLink}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
          }}
          title="Insert Link"
        >
          🔗
        </button>

        <div
          style={{
            width: "1px",
            height: "20px",
            background: "var(--border)",
            margin: "0 4px",
          }}
        />

        <button
          type="button"
          onClick={() => execCommand("removeFormat")}
          style={{
            padding: "4px 8px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            background: "var(--input)",
            cursor: "pointer",
          }}
          title="Clear Formatting"
        >
          Clear
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => {
          setIsFocused(true);
          saveSelection();
        }}
        onBlur={() => {
          setIsFocused(false);
        }}
        style={{
          minHeight: "200px",
          padding: "12px 12px 12px 24px",
          outline: isFocused ? "2px solid var(--primary)" : "none",
          outlineOffset: "-2px",
          color: "var(--text)",
          fontFamily: fontFamily,
          fontSize: `${fontSize}px`,
          lineHeight: "1.5",
          width: "100%",
          boxSizing: "border-box",
          overflowX: "auto",
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
        <div style={{ padding: "20px" }}>
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "500",
                fontSize: "14px",
              }}
            >
              URL:
            </label>
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleLinkModalSave();
                }
              }}
              autoFocus
            />
          </div>
          <div
            style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
          >
            <button
              type="button"
              onClick={handleLinkModalCancel}
              style={{
                padding: "8px 16px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--input)",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLinkModalSave}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: "6px",
                background: "var(--primary)",
                color: "white",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              Insert
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function QuotationManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [leads, setLeads] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [historyQuote, setHistoryQuote] = useState(null);
  const [myQuotationsOnly, setMyQuotationsOnly] = useState(false);
  const [selectedLeadFilter, setSelectedLeadFilter] = useState("");
  const [approvalModal, setApprovalModal] = useState({
    open: false,
    quote: null,
    action: null,
    note: "",
  });
  const [sendApprovalConfirmModal, setSendApprovalConfirmModal] = useState({
    open: false,
    quote: null,
  });
  const [deleteModal, setDeleteModal] = useState({ open: false, quote: null });
  const [approvalsView, setApprovalsView] = useState(null);
  const [revisionModal, setRevisionModal] = useState({
    open: false,
    quote: null,
    form: null,
  });
  const [originalRevisionForm, setOriginalRevisionForm] = useState(null);
  const priceScheduleEditedRef = useRef(false);
  const [hasRevisionFor, setHasRevisionFor] = useState({});
  const [hasProjectFor, setHasProjectFor] = useState({}); // Track projects created directly from quotations
  const [notify, setNotify] = useState({ open: false, title: "", message: "" });
  const [showRevisionsModal, setShowRevisionsModal] = useState(false);
  const [createProjectModal, setCreateProjectModal] = useState({
    open: false,
    quotation: null,
    form: {
      name: "",
      locationDetails: "",
      workingHours: "",
      manpowerCount: "",
      assignedProjectEngineerIds: [],
    },
    engineers: [],
    ack: false,
    selectedFiles: [],
    previewFiles: [],
  });
  const [revisionsForQuotation, setRevisionsForQuotation] = useState([]);
  const [selectedQuotationForRevisions, setSelectedQuotationForRevisions] =
    useState(null);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem("quotationViewMode");
    return saved === "table" ? "table" : "card"; // default to 'card' if not set
  });
  const [revisionCounts, setRevisionCounts] = useState({});
  const [expandedRevisionRows, setExpandedRevisionRows] = useState({}); // Track which rows have expanded revisions
  const [quotationRevisionsMap, setQuotationRevisionsMap] = useState({}); // Store revisions per quotation ID
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [printPreviewModal, setPrintPreviewModal] = useState({
    open: false,
    pdfUrl: null,
    quotation: null,
  });
  // New filter states
  const [nameFilter, setNameFilter] = useState("");
  const [dateModifiedFilter, setDateModifiedFilter] = useState("");
  const [dateCreatedFilter, setDateCreatedFilter] = useState("");
  // New sort states
  const [sortField, setSortField] = useState("dateCreated"); // 'name', 'dateModified', 'dateCreated'
  const [sortDirection, setSortDirection] = useState("desc"); // 'asc', 'desc'
  // Debounced filter values for performance
  const [debouncedNameFilter, setDebouncedNameFilter] = useState("");
  const [debouncedDateModifiedFilter, setDebouncedDateModifiedFilter] =
    useState("");
  const [debouncedDateCreatedFilter, setDebouncedDateCreatedFilter] =
    useState("");
  const [isFiltering, setIsFiltering] = useState(false); // Track filter operations
  const [filtersExpanded, setFiltersExpanded] = useState(false); // Mobile: collapsible filters
  const [isMobile, setIsMobile] = useState(false); // Track mobile viewport
  const [headerHeight, setHeaderHeight] = useState(80); // Header height for sticky positioning
  const headerRef = useRef(null);
  const [revisionProjectMap, setRevisionProjectMap] = useState({}); // Map revision ID to project info
  const [expandedProjectRows, setExpandedProjectRows] = useState({}); // Track which revision rows have expanded projects
  const [revisionProjectDetailsMap, setRevisionProjectDetailsMap] = useState(
    {}
  ); // Store full project details per revision ID
  const [projectModal, setProjectModal] = useState({
    open: false,
    project: null,
  });
  const [expandedVariationRows, setExpandedVariationRows] = useState({}); // Track which rows have expanded variations
  const [projectVariationsMap, setProjectVariationsMap] = useState({}); // Store variations per project ID
  const [variationsForProject, setVariationsForProject] = useState([]);
  const [selectedProjectForList, setSelectedProjectForList] = useState(null);
  const [showVariationsListModal, setShowVariationsListModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null);

  // Convert rich text HTML to pdfMake-friendly fragments (preserve inline styles)
  const htmlToPdfFragments = (html) => {
    if (!html) return [{ text: "" }];

    const fallback = (raw) => {
      const withBreaks = raw
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/\s*li\s*>/gi, "\n")
        .replace(/<\s*li\s*>/gi, "• ");
      const stripped = withBreaks.replace(/<[^>]+>/g, "");
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

  // File handling helpers for the create-project modal
  const handleProjectFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setCreateProjectModal((prev) => ({
      ...prev,
      selectedFiles: [...prev.selectedFiles, ...files],
    }));

    files.forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setCreateProjectModal((prev) => ({
            ...prev,
            previewFiles: [
              ...prev.previewFiles,
              { file, preview: reader.result, type: "image" },
            ],
          }));
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith("video/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setCreateProjectModal((prev) => ({
            ...prev,
            previewFiles: [
              ...prev.previewFiles,
              { file, preview: reader.result, type: "video" },
            ],
          }));
        };
        reader.readAsDataURL(file);
      } else {
        setCreateProjectModal((prev) => ({
          ...prev,
          previewFiles: [
            ...prev.previewFiles,
            { file, preview: null, type: "document" },
          ],
        }));
      }
    });
  };

  const removeProjectFile = (index) => {
    setCreateProjectModal((prev) => ({
      ...prev,
      selectedFiles: prev.selectedFiles.filter((_, i) => i !== index),
      previewFiles: prev.previewFiles.filter((_, i) => i !== index),
    }));
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes <= 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  };

  const defaultCompany = useMemo(
    () => ({
      logo,
      name: "Engineering Operations ERP",
      address: "Dubai, UAE",
      phone: "+971-00-000-0000",
      email: "info@example.com",
    }),
    []
  );

  const [form, setForm] = useState({
    lead: "",
    companyInfo: defaultCompany,
    submittedTo: "",
    attention: "",
    offerReference: "",
    enquiryNumber: "",
    offerDate: "",
    enquiryDate: "",
    projectTitle: "",
    introductionText: "",
    scopeOfWork: [
      { description: "", quantity: "", unit: "", locationRemarks: "" },
    ],
    priceSchedule: {
      items: [
        { description: "", quantity: 0, unit: "", unitRate: 0, totalAmount: 0 },
      ],
      subTotal: 0,
      grandTotal: 0,
      currency: "AED",
      taxDetails: { vatRate: 5, vatAmount: 0 },
    },
    ourViewpoints: "",
    exclusions: [""],
    paymentTerms: [{ milestoneDescription: "", amountPercent: "" }],
    deliveryCompletionWarrantyValidity: {
      deliveryTimeline: "",
      warrantyPeriod: "",
      offerValidity: 30,
      authorizedSignatory: "",
    },
  });

  // Detect mobile viewport and measure header height
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      // Auto-expand filters on desktop
      if (window.innerWidth >= 768) {
        setFiltersExpanded(true);
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Measure header height for sticky positioning
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      updateHeaderHeight();
    });
    window.addEventListener("resize", updateHeaderHeight);
    return () => window.removeEventListener("resize", updateHeaderHeight);
  }, []);

  useEffect(() => {
    setCurrentUser(JSON.parse(localStorage.getItem("user")) || null);
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchLeads(), fetchQuotations()]);
      setIsLoading(false);
    };
    void loadData();
  }, []);

  // Persist view mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("quotationViewMode", viewMode);
  }, [viewMode]);

  // Adjust itemsPerPage when switching views to ensure grid-friendly values for card view
  useEffect(() => {
    if (
      viewMode === "card" &&
      ![6, 9, 12, 15, 18, 21, 24].includes(itemsPerPage)
    ) {
      // Find the nearest card-friendly value (multiple of 3)
      const cardValues = [6, 9, 12, 15, 18, 21, 24];
      const nearest = cardValues.reduce((prev, curr) =>
        Math.abs(curr - itemsPerPage) < Math.abs(prev - itemsPerPage)
          ? curr
          : prev
      );
      setItemsPerPage(nearest);
    } else if (
      viewMode === "table" &&
      ![5, 10, 20, 50].includes(itemsPerPage)
    ) {
      // Find the nearest table-friendly value
      const tableValues = [5, 10, 20, 50];
      const nearest = tableValues.reduce((prev, curr) =>
        Math.abs(curr - itemsPerPage) < Math.abs(prev - itemsPerPage)
          ? curr
          : prev
      );
      setItemsPerPage(nearest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]); // Only run when viewMode changes, not when itemsPerPage changes

  // Note: Legacy localStorage-based auto-open removed - now using route-based modal
  // The CreateQuotationModal handles pre-selection via props

  const fetchLeads = async () => {
    try {
      const res = await api.get("/api/leads");
      setLeads(res.data);
    } catch {}
  };

  const fetchQuotations = async () => {
    try {
      const res = await api.get("/api/quotations");
      setQuotations(res.data);
      try {
        const revRes = await api.get("/api/revisions");
        const revisions = Array.isArray(revRes.data) ? revRes.data : [];
        const map = {};
        const counts = {};
        revisions.forEach((r) => {
          const parentId =
            typeof r.parentQuotation === "object"
              ? r.parentQuotation?._id
              : r.parentQuotation;
          if (parentId) {
            map[parentId] = true;
            counts[parentId] = (counts[parentId] || 0) + 1;
          }
        });
        setHasRevisionFor(map);
        setRevisionCounts(counts);

        // Check for projects created directly from quotations (no revisions)
        const projectMap = {};
        for (const q of res.data) {
          if (q.managementApproval?.status === "approved" && !map[q._id]) {
            try {
              await api.get(`/api/projects/by-quotation/${q._id}`);
              projectMap[q._id] = true;
            } catch {
              // No project for this quotation
            }
          }
        }
        setHasProjectFor(projectMap);
      } catch {}
    } catch {}
  };

  const canCreate = () => currentUser?.roles?.includes("estimation_engineer");

  const recalcTotals = (items, vatRate) => {
    const sub = items.reduce(
      (sum, it) => sum + Number(it.quantity || 0) * Number(it.unitRate || 0),
      0
    );
    const vat = sub * (Number(vatRate || 0) / 100);
    const grand = sub + vat;
    return {
      subTotal: Number(sub.toFixed(2)),
      vatAmount: Number(vat.toFixed(2)),
      grandTotal: Number(grand.toFixed(2)),
    };
  };

  const ensurePdfMake = async () => {
    if (window.pdfMake) return;

    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });

    const cdnPrimary = "https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build";
    const cdnFallback = "https://unpkg.com/pdfmake@0.2.7/build";

    try {
      await loadScript(`${cdnPrimary}/pdfmake.min.js`);
      await loadScript(`${cdnPrimary}/vfs_fonts.js`);
    } catch {
      await loadScript(`${cdnFallback}/pdfmake.min.js`);
      await loadScript(`${cdnFallback}/vfs_fonts.js`);
    }

    if (!window.pdfMake) {
      throw new Error("pdfMake failed to load");
    }
  };

  const toDataURL = async (url) => {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      if (!blob || !blob.size) return reject(new Error("Empty logo blob"));
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const FALLBACK_PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YqK8W8AAAAASUVORK5CYII=";

  // Safely get logo as data URL, falling back to bundled logo, then 1x1 pixel
  const getLogoDataUrl = async (url) => {
    try {
      if (url) return await toDataURL(url);
    } catch {}
    try {
      return await toDataURL(logo);
    } catch {
      return FALLBACK_PIXEL;
    }
  };

  // Normalize rich text fields for PDF rendering (align with QuotationDetail)
  const normalizeQuotationForPdf = (q) => {
    if (!q) return q;
    const clone = { ...q };

    if (typeof clone.scopeOfWork === "string") {
      const desc = clone.scopeOfWork;
      clone.scopeOfWork = desc
        ? [{ description: desc, quantity: "", unit: "", locationRemarks: "" }]
        : [];
    }

    if (typeof clone.priceSchedule === "string") {
      const desc = clone.priceSchedule;
      clone.priceSchedule = {
        items: desc
          ? [
              {
                description: desc,
                quantity: 0,
                unit: "",
                unitRate: 0,
                totalAmount: 0,
              },
            ]
          : [],
        subTotal: 0,
        grandTotal: 0,
        currency: "AED",
        taxDetails: { vatRate: 0, vatAmount: 0 },
      };
    }

    if (typeof clone.exclusions === "string") {
      clone.exclusions = clone.exclusions
        ? clone.exclusions
            .split(/<br\s*\/?>|\n/gi)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    } else if (!Array.isArray(clone.exclusions)) {
      clone.exclusions = [];
    }

    if (typeof clone.paymentTerms === "string") {
      clone.paymentTerms = clone.paymentTerms
        ? clone.paymentTerms
            .split(/<br\s*\/?>|\n/gi)
            .map((term) => {
              const match = term.match(/^(.+?)(?:\s*-\s*(\d+(?:\.\d+)?)%)?$/);
              return {
                milestoneDescription: match ? match[1].trim() : term.trim(),
                amountPercent: match && match[2] ? parseFloat(match[2]) : 0,
              };
            })
            .filter((t) => t.milestoneDescription)
        : [];
    } else if (!Array.isArray(clone.paymentTerms)) {
      clone.paymentTerms = [];
    }

    return clone;
  };

  // Build a single docDefinition used by both download and preview/print
  const buildDocDefinition = (params) => {
    const {
      q,
      logoDataUrl,
      leadFull,
      siteVisits,
      currency,
      isPending,
      scopeRows,
      priceRows,
      exclusions,
      paymentTerms,
      deliveryRows,
      coverFields,
    } = params;

    const content = [];

    // Title
    content.push({
      text: "Commercial Quotation",
      style: "h1",
      margin: [0, 0, 0, 8],
    });

    // Cover & Basic Details
    if (coverFields.length > 0) {
      content.push({
        text: "Cover & Basic Details",
        style: "h2",
        margin: [0, 6, 0, 6],
      });
      content.push({
        table: {
          widths: ["30%", "70%"],
          body: [
            [
              { text: "Field", style: "th" },
              { text: "Value", style: "th" },
            ],
            ...coverFields.map(([k, v]) => [
              { text: k, style: "tdKey" },
              { text: v, style: "tdVal" },
            ]),
          ],
        },
        layout: "lightHorizontalLines",
      });
    }

    // Lead Details
    if (leadFull) {
      const leadDetailsRaw = [
        ["Customer", leadFull.customerName],
        ["Project Title", leadFull.projectTitle],
        ["Enquiry #", leadFull.enquiryNumber],
        [
          "Enquiry Date",
          leadFull.enquiryDate
            ? new Date(leadFull.enquiryDate).toLocaleDateString()
            : "",
        ],
        [
          "Submission Due",
          leadFull.submissionDueDate
            ? new Date(leadFull.submissionDueDate).toLocaleDateString()
            : "",
        ],
        ["Scope Summary", leadFull.scopeSummary],
      ];
      const leadDetails = leadDetailsRaw.filter(
        ([, v]) => v && String(v).trim().length > 0
      );
      if (leadDetails.length > 0) {
        content.push({
          text: "Project Details",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        content.push({
          table: {
            widths: ["30%", "70%"],
            body: [
              [
                { text: "Field", style: "th" },
                { text: "Value", style: "th" },
              ],
              ...leadDetails.map(([k, v]) => [
                { text: k, style: "tdKey" },
                { text: v, style: "tdVal" },
              ]),
            ],
          },
          layout: "lightHorizontalLines",
        });
      }
    }

    // Introduction
    if ((q.introductionText || "").trim().length > 0) {
      content.push({
        text: "Introduction",
        style: "h2",
        margin: [0, 10, 0, 6],
      });
      content.push({
        stack: htmlToPdfFragments(q.introductionText),
        margin: [0, 0, 0, 6],
        preserveLeadingSpaces: true,
      });
    }

    // Scope of Work (stacked)
    if (scopeRows.length > 0) {
      content.push({
        text: "Scope of Work",
        style: "h2",
        margin: [0, 12, 0, 6],
      });
      content.push({
        stack: scopeRows
          .map((row) => row[1])
          .filter(Boolean)
          .map((cell) => ({ ...cell, margin: [0, 0, 0, 8] })),
      });
    }

    // Site Visit Reports
    if (Array.isArray(siteVisits) && siteVisits.length > 0) {
      const visitRows = siteVisits.map((v, i) => [
        String(i + 1),
        v.visitAt ? new Date(v.visitAt).toLocaleString() : "",
        v.siteLocation || "",
        v.engineerName || "",
        (v.workProgressSummary || "").slice(0, 140),
      ]);
      content.push({
        text: "Site Visit Reports",
        style: "h2",
        margin: [0, 12, 0, 6],
      });
      content.push({
        table: {
          widths: ["6%", "22%", "22%", "20%", "30%"],
          body: [
            [
              { text: "#", style: "th" },
              { text: "Date & Time", style: "th" },
              { text: "Location", style: "th" },
              { text: "Engineer", style: "th" },
              { text: "Progress Summary", style: "th" },
            ],
            ...visitRows,
          ],
        },
        layout: "lightHorizontalLines",
      });
    }

    // Price Schedule (stacked + totals)
    if (priceRows.length > 0) {
      content.push({
        text: "Price Schedule",
        style: "h2",
        margin: [0, 12, 0, 6],
      });
      content.push({
        stack: priceRows
          .map((row) => row[1])
          .filter(Boolean)
          .map((cell) => ({ ...cell, margin: [0, 0, 0, 8] })),
      });

      content.push({
        stack: [
          {
            text: `Sub Total: ${currency} ${Number(
              q.priceSchedule?.subTotal || 0
            ).toFixed(2)}`,
            margin: [0, 2, 0, 0],
          },
          {
            text: `VAT (${
              q.priceSchedule?.taxDetails?.vatRate || 0
            }%): ${currency} ${Number(
              q.priceSchedule?.taxDetails?.vatAmount || 0
            ).toFixed(2)}`,
            margin: [0, 2, 0, 0],
          },
          {
            text: `Grand Total: ${currency} ${Number(
              q.priceSchedule?.grandTotal || 0
            ).toFixed(2)}`,
            bold: true,
            margin: [0, 2, 0, 0],
          },
        ],
        margin: [0, 6, 0, 0],
      });
    }

    // Our Viewpoints / Exclusions
    if ((q.ourViewpoints || "").trim().length > 0 || exclusions.length > 0) {
      content.push({
        text: "Our Viewpoints / Special Terms",
        style: "h2",
        margin: [0, 12, 0, 6],
      });
      if ((q.ourViewpoints || "").trim().length > 0) {
        content.push({
          stack: htmlToPdfFragments(q.ourViewpoints),
          margin: [0, 0, 0, 6],
          preserveLeadingSpaces: true,
        });
      }
      if (exclusions.length > 0) {
        content.push({ text: "Exclusions", style: "h3", margin: [0, 6, 0, 4] });
        content.push({
          ul: exclusions.map((ex) => ({
            stack: htmlToPdfFragments(ex),
            preserveLeadingSpaces: true,
          })),
        });
      }
    }

    // Payment Terms (stacked)
    if (paymentTerms.length > 0) {
      content.push({
        text: "Payment Terms",
        style: "h2",
        margin: [0, 12, 0, 6],
      });
      content.push({
        stack: paymentTerms.map((p) => ({
          stack: [
            {
              ...richTextCell(p.milestoneDescription || ""),
              margin: [0, 0, 0, 2],
            },
            p.amountPercent
              ? { text: `${p.amountPercent}%`, margin: [0, 0, 0, 4] }
              : null,
          ].filter(Boolean),
          margin: [0, 0, 0, 8],
        })),
      });
    }

    // Delivery/Completion/Warranty/Validity
    if (deliveryRows.length > 0) {
      content.push({
        text: "Delivery, Completion, Warranty & Validity",
        style: "h2",
        margin: [0, 12, 0, 6],
      });
      content.push({
        table: {
          widths: ["30%", "70%"],
          body: [
            ...deliveryRows.map(([k, v]) => [
              { text: k, style: "tdKey" },
              { text: v, style: "tdVal" },
            ]),
          ],
        },
        layout: "lightHorizontalLines",
      });
    }

    // Approval status line
    if (isPending) {
      content.push({
        text: "Management Approval: Pending",
        italics: true,
        color: "#b45309",
        margin: [0, 12, 0, 0],
      });
    } else if (q.managementApproval?.status === "approved") {
      content.push({
        text: `Approved by: ${
          q.managementApproval?.approvedBy?.name || "Management"
        }`,
        italics: true,
        color: "#16a34a",
        margin: [0, 12, 0, 0],
      });
    }

    return {
      pageMargins: [36, 96, 36, 60],
      header: {
        margin: [36, 20, 36, 8],
        stack: [
          {
            columns: [
              { image: logoDataUrl || FALLBACK_PIXEL, width: 60 },
              [
                { text: q.companyInfo?.name || "Company", style: "brand" },
                {
                  text: [
                    q.companyInfo?.address,
                    q.companyInfo?.phone,
                    q.companyInfo?.email,
                  ]
                    .filter(Boolean)
                    .join(" | "),
                  color: "#64748b",
                  fontSize: 9,
                },
              ],
            ],
            columnGap: 12,
          },
          {
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: 0,
                x2: 523,
                y2: 0,
                lineWidth: 0.5,
                lineColor: "#e5e7eb",
              },
            ],
          },
        ],
      },
      footer: function (currentPage, pageCount) {
        return {
          margin: [36, 0, 36, 20],
          stack: [
            {
              canvas: [
                {
                  type: "line",
                  x1: 0,
                  y1: 0,
                  x2: 523,
                  y2: 0,
                  lineWidth: 0.5,
                  lineColor: "#e5e7eb",
                },
              ],
            },
            {
              columns: [
                {
                  text: isPending
                    ? "Approval Pending"
                    : q.managementApproval?.status === "approved"
                    ? "Approved"
                    : "Not Approved",
                  color: isPending
                    ? "#b45309"
                    : q.managementApproval?.status === "approved"
                    ? "#16a34a"
                    : "#b91c1c",
                },
                {
                  text: `Page ${currentPage} of ${pageCount}`,
                  alignment: "right",
                  color: "#94a3b8",
                },
              ],
            },
          ],
        };
      },
      content,
      styles: {
        brand: {
          fontSize: 14,
          color: "#1f2937",
          bold: true,
          margin: [0, 0, 0, 2],
        },
        h1: { fontSize: 18, bold: true, color: "#0f172a" },
        h2: { fontSize: 12, bold: true, color: "#0f172a" },
        h3: { fontSize: 11, bold: true, color: "#0f172a" },
        th: { bold: true, fillColor: "#f1f5f9" },
        tdKey: { color: "#64748b" },
        tdVal: { color: "#0f172a" },
      },
      defaultStyle: { fontSize: 10, lineHeight: 1.2 },
      watermark: isPending
        ? {
            text: "Approval Pending",
            color: "#94a3b8",
            opacity: 0.12,
            bold: true,
          }
        : undefined,
    };
  };

  const openCreate = () => {
    setEditing(null);
    setShowModal(true);
  };

  const handleSave = async (payload, editingQuote) => {
    if (isSubmitting) return;
    setLoadingAction(editingQuote ? "update-quotation" : "create-quotation");
    setIsSubmitting(true);
    try {
      if (editingQuote) {
        await api.put(`/api/quotations/${editingQuote._id}`, payload);
      } else {
        await api.post("/api/quotations", payload);
      }
      await fetchQuotations();
      setShowModal(false);
      setEditing(null);
      setNotify({
        open: true,
        title: "Success",
        message: editingQuote
          ? "Quotation updated successfully."
          : "Quotation created successfully.",
      });
    } catch (e) {
      setNotify({
        open: true,
        title: "Save Failed",
        message:
          e.response?.data?.message ||
          "We could not save the quotation. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
      setLoadingAction(null);
    }
  };

  const approveQuotation = async (q, status, note) => {
    setLoadingAction(`approve-${q._id}-${status}`);
    setIsSubmitting(true);
    try {
      await api.patch(`/api/quotations/${q._id}/approve`, { status, note });
      await fetchQuotations();
      setApprovalModal({ open: false, quote: null, action: null, note: "" });
      setNotify({
        open: true,
        title:
          status === "approved" ? "Quotation Approved" : "Quotation Rejected",
        message: `The quotation has been ${
          status === "approved" ? "approved" : "rejected"
        } successfully.`,
      });
    } catch (e) {
      setNotify({
        open: true,
        title: "Approval Failed",
        message:
          e.response?.data?.message ||
          "We could not update approval. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
      setLoadingAction(null);
    }
  };

  const sendForApproval = async (q) => {
    setLoadingAction(`send-approval-${q._id}`);
    setIsSubmitting(true);
    try {
      await api.patch(`/api/quotations/${q._id}/approve`, {
        status: "pending",
      });
      await fetchQuotations();
      setSendApprovalConfirmModal({ open: false, quote: null });
      setNotify({
        open: true,
        title: "Request Sent",
        message: "Approval request has been sent successfully.",
      });
    } catch (e) {
      setNotify({
        open: true,
        title: "Send Failed",
        message:
          e.response?.data?.message ||
          "We could not send for approval. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
      setLoadingAction(null);
    }
  };

  const handleDeleteQuotation = async (q) => {
    if (isSubmitting) return;
    setLoadingAction(`delete-${q._id}`);
    setIsSubmitting(true);
    try {
      await api.delete(`/api/quotations/${q._id}`);
      await fetchQuotations();
      setDeleteModal({ open: false, quote: null });
      setNotify({
        open: true,
        title: "Deleted",
        message: "Quotation deleted successfully.",
      });
    } catch (e) {
      setDeleteModal({ open: false, quote: null });
      setNotify({
        open: true,
        title: "Delete Failed",
        message:
          e.response?.data?.message ||
          "We could not delete the quotation. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
      setLoadingAction(null);
    }
  };

  const createRevision = async (q) => {
    if (isSubmitting) return;
    setLoadingAction("create-revision");
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const form = { ...revisionModal.form };

      // Compare BEFORE conversion - convert original quotation to same format as form
      const original = q;
      const originalFormFormat = {
        companyInfo: original.companyInfo || {},
        submittedTo: original.submittedTo || "",
        attention: original.attention || "",
        offerReference: original.offerReference || "",
        enquiryNumber: original.enquiryNumber || "",
        offerDate: original.offerDate
          ? original.offerDate.substring(0, 10)
          : "",
        enquiryDate: original.enquiryDate
          ? original.enquiryDate.substring(0, 10)
          : "",
        projectTitle:
          original.projectTitle || original.lead?.projectTitle || "",
        introductionText: original.introductionText || "",
        scopeOfWork: original.scopeOfWork?.length
          ? original.scopeOfWork
              .map((item) => item.description || "")
              .join("<br>")
          : "",
        priceSchedule: original.priceSchedule?.items?.length
          ? original.priceSchedule.items
              .map(
                (item) =>
                  `${item.description || ""}${
                    item.quantity ? ` - Qty: ${item.quantity}` : ""
                  }${item.unit ? ` ${item.unit}` : ""}${
                    item.unitRate ? ` @ ${item.unitRate}` : ""
                  }${item.totalAmount ? ` = ${item.totalAmount}` : ""}`
              )
              .join("<br>")
          : "",
        ourViewpoints: original.ourViewpoints || "",
        exclusions: original.exclusions?.length
          ? original.exclusions.join("<br>")
          : "",
        paymentTerms: original.paymentTerms?.length
          ? original.paymentTerms
              .map(
                (term) =>
                  `${term.milestoneDescription || ""}${
                    term.amountPercent ? ` - ${term.amountPercent}%` : ""
                  }`
              )
              .join("<br>")
          : "",
        deliveryCompletionWarrantyValidity:
          original.deliveryCompletionWarrantyValidity || {
            deliveryTimeline: "",
            warrantyPeriod: "",
            offerValidity: 30,
            authorizedSignatory: currentUser?.name || "",
          },
      };

      // Helper function to normalize HTML content for comparison
      const normalizeHtml = (html) => {
        if (!html) return "";
        // Create a temporary div to parse HTML
        const temp = document.createElement("div");
        temp.innerHTML = html;
        // Get text content and normalize whitespace
        let text = temp.textContent || temp.innerText || "";
        // Replace multiple whitespace with single space
        text = text.replace(/\s+/g, " ").trim();
        return text;
      };

      // Compare form data (both in HTML string format)
      const fields = [
        "companyInfo",
        "submittedTo",
        "attention",
        "offerReference",
        "enquiryNumber",
        "offerDate",
        "enquiryDate",
        "projectTitle",
        "introductionText",
        "scopeOfWork",
        "priceSchedule",
        "ourViewpoints",
        "exclusions",
        "paymentTerms",
        "deliveryCompletionWarrantyValidity",
      ];
      let changed = false;
      for (const f of fields) {
        if (f === "companyInfo" || f === "deliveryCompletionWarrantyValidity") {
          if (
            JSON.stringify(originalFormFormat[f] ?? null) !==
            JSON.stringify(form[f] ?? null)
          ) {
            changed = true;
            break;
          }
        } else {
          // For string fields, normalize HTML and compare text content
          const originalVal = normalizeHtml(
            String(originalFormFormat[f] ?? "")
          );
          const formVal = normalizeHtml(String(form[f] ?? ""));
          if (originalVal !== formVal) {
            changed = true;
            break;
          }
        }
      }
      if (!changed) {
        setNotify({
          open: true,
          title: "No Changes",
          message:
            "No changes detected. Please modify data before creating a revision.",
        });
        return;
      }

      // Now convert to backend format
      const payload = { ...form };

      // Convert scopeOfWork string to array format for backend compatibility
      if (typeof payload.scopeOfWork === "string") {
        payload.scopeOfWork = payload.scopeOfWork
          ? [
              {
                description: payload.scopeOfWork,
                quantity: "",
                unit: "",
                locationRemarks: "",
              },
            ]
          : [];
      }

      // Convert priceSchedule string to object format for backend compatibility
      if (typeof payload.priceSchedule === "string") {
        payload.priceSchedule = payload.priceSchedule
          ? {
              items: [
                {
                  description: payload.priceSchedule,
                  quantity: 0,
                  unit: "",
                  unitRate: 0,
                  totalAmount: 0,
                },
              ],
              subTotal: 0,
              grandTotal: 0,
              currency: original.priceSchedule?.currency || "AED",
              taxDetails: original.priceSchedule?.taxDetails || {
                vatRate: 5,
                vatAmount: 0,
              },
            }
          : {
              items: [],
              subTotal: 0,
              grandTotal: 0,
              currency: original.priceSchedule?.currency || "AED",
              taxDetails: original.priceSchedule?.taxDetails || {
                vatRate: 5,
                vatAmount: 0,
              },
            };
      }

      // Convert exclusions string to array format for backend compatibility
      if (typeof payload.exclusions === "string") {
        payload.exclusions = payload.exclusions
          ? payload.exclusions.split("<br>").filter((ex) => ex.trim())
          : [];
      }

      // Convert paymentTerms string to array format for backend compatibility
      if (typeof payload.paymentTerms === "string") {
        payload.paymentTerms = payload.paymentTerms
          ? payload.paymentTerms
              .split("<br>")
              .map((term) => {
                // Try to parse "Milestone - X%" format
                const match = term.match(/^(.+?)(?:\s*-\s*(\d+(?:\.\d+)?)%)?$/);
                return {
                  milestoneDescription: match ? match[1].trim() : term.trim(),
                  amountPercent: match && match[2] ? parseFloat(match[2]) : 0,
                };
              })
              .filter((term) => term.milestoneDescription)
          : [];
      }
      await api.post("/api/revisions", {
        sourceQuotationId: q._id,
        data: payload,
      });
      setNotify({
        open: true,
        title: "Revision Created",
        message: "The revision was created successfully.",
      });
      setRevisionModal({ open: false, quote: null, form: null });
      setOriginalRevisionForm(null);
      priceScheduleEditedRef.current = false;
      setHasRevisionFor({ ...hasRevisionFor, [q._id]: true });
      await fetchQuotations();
    } catch (e) {
      setNotify({
        open: true,
        title: "Create Failed",
        message:
          e.response?.data?.message ||
          "We could not create the revision. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
      setLoadingAction(null);
    }
  };

  const exportPDF = async (q) => {
    try {
      const qNorm = normalizeQuotationForPdf(q);

      await ensurePdfMake();
      const logoDataUrl = await getLogoDataUrl(qNorm.companyInfo?.logo);
      const isPending = qNorm.managementApproval?.status === "pending";

      const currency = qNorm.priceSchedule?.currency || "AED";
      // Fetch lead details and site visits for inclusion
      let leadFull = qNorm.lead || null;
      let siteVisits = [];
      try {
        const leadId =
          typeof qNorm.lead === "object" ? qNorm.lead?._id : qNorm.lead;
        if (leadId) {
          const resLead = await api.get(`/api/leads/${leadId}`);
          leadFull = resLead.data;
          const resVisits = await api.get(`/api/leads/${leadId}/site-visits`);
          siteVisits = Array.isArray(resVisits.data) ? resVisits.data : [];
        }
      } catch {}
      const coverFieldsRaw = [
        ["Submitted To", qNorm.submittedTo],
        ["Attention", qNorm.attention],
        ["Offer Reference", qNorm.offerReference],
        ["Enquiry Number", qNorm.enquiryNumber || leadFull?.enquiryNumber],
        [
          "Offer Date",
          qNorm.offerDate ? new Date(qNorm.offerDate).toLocaleDateString() : "",
        ],
        [
          "Enquiry Date",
          qNorm.enquiryDate
            ? new Date(qNorm.enquiryDate).toLocaleDateString()
            : "",
        ],
        ["Project Title", qNorm.projectTitle || leadFull?.projectTitle],
      ];
      const coverFields = coverFieldsRaw.filter(
        ([, v]) => v && String(v).trim().length > 0
      );

      const scopeRows = (qNorm.scopeOfWork || [])
        .filter((s) => (s?.description || "").trim().length > 0)
        .map((s, i) => [
          String(i + 1),
          richTextCell(s.description || ""),
          String(s.quantity || ""),
          s.unit || "",
          richTextCell(s.locationRemarks || ""),
        ]);

      const priceItems = (qNorm.priceSchedule?.items || []).filter(
        (it) =>
          (it?.description || "").trim().length > 0 ||
          Number(it.quantity) > 0 ||
          Number(it.unitRate) > 0
      );
      const priceRows = priceItems.map((it, i) => [
        String(i + 1),
        richTextCell(it.description || ""),
        String(it.quantity || 0),
        it.unit || "",
        `${currency} ${Number(it.unitRate || 0).toFixed(2)}`,
        `${currency} ${Number((it.quantity || 0) * (it.unitRate || 0)).toFixed(
          2
        )}`,
      ]);

      const exclusions = (qNorm.exclusions || [])
        .map((x) => String(x || ""))
        .filter((x) => x.trim().length > 0);
      const paymentTerms = (qNorm.paymentTerms || []).filter(
        (p) =>
          (p?.milestoneDescription || "").trim().length > 0 ||
          String(p?.amountPercent || "").trim().length > 0
      );

      const dcwv = qNorm.deliveryCompletionWarrantyValidity || {};
      const deliveryRowsRaw = [
        ["Delivery / Completion Timeline", dcwv.deliveryTimeline],
        ["Warranty Period", dcwv.warrantyPeriod],
        [
          "Offer Validity (Days)",
          typeof dcwv.offerValidity === "number"
            ? String(dcwv.offerValidity)
            : dcwv.offerValidity || "",
        ],
        ["Authorized Signatory", dcwv.authorizedSignatory],
      ];
      const deliveryRows = deliveryRowsRaw.filter(
        ([, v]) => v && String(v).trim().length > 0
      );

      const header = {
        margin: [36, 20, 36, 8],
        stack: [
          {
            columns: [
              { image: logoDataUrl || FALLBACK_PIXEL, width: 60 },
              [
                { text: qNorm.companyInfo?.name || "Company", style: "brand" },
                {
                  text: [
                    qNorm.companyInfo?.address,
                    qNorm.companyInfo?.phone,
                    qNorm.companyInfo?.email,
                  ]
                    .filter(Boolean)
                    .join(" | "),
                  color: "#64748b",
                  fontSize: 9,
                },
              ],
            ],
            columnGap: 12,
          },
          {
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: 0,
                x2: 523,
                y2: 0,
                lineWidth: 0.5,
                lineColor: "#e5e7eb",
              },
            ],
          },
        ],
      };

      const content = [];

      // Title
      content.push({
        text: "Commercial Quotation",
        style: "h1",
        margin: [0, 0, 0, 8],
      });

      // Cover & Basic Details
      if (coverFields.length > 0) {
        content.push({
          text: "Cover & Basic Details",
          style: "h2",
          margin: [0, 6, 0, 6],
        });
        content.push({
          table: {
            widths: ["30%", "70%"],
            body: [
              [
                { text: "Field", style: "th" },
                { text: "Value", style: "th" },
              ],
              ...coverFields.map(([k, v]) => [
                { text: k, style: "tdKey" },
                { text: v, style: "tdVal" },
              ]),
            ],
          },
          layout: "lightHorizontalLines",
        });
      }

      // Lead Details (from lead module)
      if (leadFull) {
        const leadDetailsRaw = [
          ["Customer", leadFull.customerName],
          ["Project Title", leadFull.projectTitle],
          ["Enquiry #", leadFull.enquiryNumber],
          [
            "Enquiry Date",
            leadFull.enquiryDate
              ? new Date(leadFull.enquiryDate).toLocaleDateString()
              : "",
          ],
          [
            "Submission Due",
            leadFull.submissionDueDate
              ? new Date(leadFull.submissionDueDate).toLocaleDateString()
              : "",
          ],
          ["Scope Summary", leadFull.scopeSummary],
        ];
        const leadDetails = leadDetailsRaw.filter(
          ([, v]) => v && String(v).trim().length > 0
        );
        if (leadDetails.length > 0) {
          content.push({
            text: "Project Details",
            style: "h2",
            margin: [0, 12, 0, 6],
          });
          content.push({
            table: {
              widths: ["30%", "70%"],
              body: [
                [
                  { text: "Field", style: "th" },
                  { text: "Value", style: "th" },
                ],
                ...leadDetails.map(([k, v]) => [
                  { text: k, style: "tdKey" },
                  { text: v, style: "tdVal" },
                ]),
              ],
            },
            layout: "lightHorizontalLines",
          });
        }
      }

      // Introduction
      if ((qNorm.introductionText || "").trim().length > 0) {
        content.push({
          text: "Introduction",
          style: "h2",
          margin: [0, 10, 0, 6],
        });
        content.push({
          stack: htmlToPdfFragments(qNorm.introductionText),
          margin: [0, 0, 0, 6],
          preserveLeadingSpaces: true,
        });
      }

      // Scope of Work
      if (scopeRows.length > 0) {
        content.push({
          text: "Scope of Work",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        content.push({
          stack: scopeRows
            .map((row) => row[1]) // description cell
            .filter(Boolean)
            .map((cell) => ({ ...cell, margin: [0, 0, 0, 8] })),
        });
      }

      // Site Visit Reports (compact table)
      if (Array.isArray(siteVisits) && siteVisits.length > 0) {
        const visitRows = siteVisits.map((v, i) => [
          String(i + 1),
          v.visitAt ? new Date(v.visitAt).toLocaleString() : "",
          v.siteLocation || "",
          v.engineerName || "",
          (v.workProgressSummary || "").slice(0, 140),
        ]);
        content.push({
          text: "Site Visit Reports",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        content.push({
          table: {
            widths: ["6%", "22%", "22%", "20%", "30%"],
            body: [
              [
                { text: "#", style: "th" },
                { text: "Date & Time", style: "th" },
                { text: "Location", style: "th" },
                { text: "Engineer", style: "th" },
                { text: "Progress Summary", style: "th" },
              ],
              ...visitRows,
            ],
          },
          layout: "lightHorizontalLines",
        });
      }

      // Price Schedule
      if (priceRows.length > 0) {
        content.push({
          text: "Price Schedule",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        content.push({
          stack: priceRows
            .map((row) => row[1]) // description cell
            .filter(Boolean)
            .map((cell) => ({ ...cell, margin: [0, 0, 0, 8] })),
        });

        content.push({
          stack: [
            {
              text: `Sub Total: ${currency} ${Number(
                qNorm.priceSchedule?.subTotal || 0
              ).toFixed(2)}`,
              margin: [0, 2, 0, 0],
            },
            {
              text: `VAT (${
                qNorm.priceSchedule?.taxDetails?.vatRate || 0
              }%): ${currency} ${Number(
                qNorm.priceSchedule?.taxDetails?.vatAmount || 0
              ).toFixed(2)}`,
              margin: [0, 2, 0, 0],
            },
            {
              text: `Grand Total: ${currency} ${Number(
                qNorm.priceSchedule?.grandTotal || 0
              ).toFixed(2)}`,
              bold: true,
              margin: [0, 2, 0, 0],
            },
          ],
          margin: [0, 6, 0, 0],
        });
      }

      // Our Viewpoints / Exclusions
      if ((q.ourViewpoints || "").trim().length > 0 || exclusions.length > 0) {
        content.push({
          text: "Our Viewpoints / Special Terms",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        if ((q.ourViewpoints || "").trim().length > 0) {
          content.push({
            stack: htmlToPdfFragments(q.ourViewpoints),
            margin: [0, 0, 0, 6],
            preserveLeadingSpaces: true,
          });
        }
        if (exclusions.length > 0) {
          content.push({
            text: "Exclusions",
            style: "h3",
            margin: [0, 6, 0, 4],
          });
          content.push({
            ul: exclusions.map((ex) => ({
              stack: htmlToPdfFragments(ex),
              preserveLeadingSpaces: true,
            })),
          });
        }
      }

      // Payment Terms
      if (paymentTerms.length > 0) {
        content.push({
          text: "Payment Terms",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        content.push({
          stack: paymentTerms.map((p) => ({
            stack: [
              {
                ...richTextCell(p.milestoneDescription || ""),
                margin: [0, 0, 0, 2],
              },
              p.amountPercent
                ? { text: `${p.amountPercent}%`, margin: [0, 0, 0, 4] }
                : null,
            ].filter(Boolean),
            margin: [0, 0, 0, 8],
          })),
        });
      }

      // Delivery/Completion/Warranty/Validity
      if (deliveryRows.length > 0) {
        content.push({
          text: "Delivery, Completion, Warranty & Validity",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        content.push({
          table: {
            widths: ["30%", "70%"],
            body: [
              ...deliveryRows.map(([k, v]) => [
                { text: k, style: "tdKey" },
                { text: v, style: "tdVal" },
              ]),
            ],
          },
          layout: "lightHorizontalLines",
        });
      }

      // Approval status line
      if (isPending) {
        content.push({
          text: "Management Approval: Pending",
          italics: true,
          color: "#b45309",
          margin: [0, 12, 0, 0],
        });
      } else if (qNorm.managementApproval?.status === "approved") {
        content.push({
          text: `Approved by: ${
            qNorm.managementApproval?.approvedBy?.name || "Management"
          }`,
          italics: true,
          color: "#16a34a",
          margin: [0, 12, 0, 0],
        });
      } else {
        content.push({
          text: "Management Approval: Not Approved",
          italics: true,
          color: "#b91c1c",
          margin: [0, 12, 0, 0],
        });
      }
      const docDefinition = buildDocDefinition({
        q: qNorm,
        logoDataUrl,
        leadFull,
        siteVisits,
        currency,
        isPending,
        scopeRows,
        priceRows,
        exclusions,
        paymentTerms,
        deliveryRows,
        coverFields,
      });

      // const docDefinition = {
      //   pageMargins: [36, 96, 36, 60],
      //   header,
      //   footer: function (currentPage, pageCount) {
      //     return {
      //       margin: [36, 0, 36, 20],
      //       stack: [
      //         { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.5, lineColor: '#e5e7eb' }] },
      //         {
      //           columns: [
      //             { text: isPending ? 'Approval Pending' : (qNorm.managementApproval?.status === 'approved' ? 'Approved' : ''), color: isPending ? '#b45309' : '#16a34a' },
      //             { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', color: '#94a3b8' }
      //           ]
      //         }
      //       ]
      //     }
      //   },
      //   content,
      //   styles: {
      //     brand: { fontSize: 14, color: '#1f2937', bold: true, margin: [0, 0, 0, 2] },
      //     h1: { fontSize: 18, bold: true, color: '#0f172a' },
      //     h2: { fontSize: 12, bold: true, color: '#0f172a' },
      //     h3: { fontSize: 11, bold: true, color: '#0f172a' },
      //     th: { bold: true, fillColor: '#f1f5f9' },
      //     tdKey: { color: '#64748b' },
      //     tdVal: { color: '#0f172a' }
      //   },
      //   defaultStyle: { fontSize: 10, lineHeight: 1.2 },
      //   watermark: isPending ? { text: 'Approval Pending', color: '#94a3b8', opacity: 0.12, bold: true } : undefined
      // }

      const filename = `${qNorm.projectTitle || "Quotation"}_${
        qNorm.offerReference || qNorm._id
      }.pdf`;
      window.pdfMake.createPdf(docDefinition).download(filename);
    } catch (e) {
      setNotify({
        open: true,
        title: "Export Failed",
        message:
          "We could not generate the PDF for this quotation. Please try again.",
      });
    }
  };

  const generatePDFPreview = async (q) => {
    try {
      const qNorm = normalizeQuotationForPdf(q);

      await ensurePdfMake();
      const logoDataUrl = await getLogoDataUrl(qNorm.companyInfo?.logo);
      const isPending = qNorm.managementApproval?.status === "pending";

      const currency = qNorm.priceSchedule?.currency || "AED";
      // Fetch lead details and site visits for inclusion
      let leadFull = qNorm.lead || null;
      let siteVisits = [];
      try {
        const leadId =
          typeof qNorm.lead === "object" ? qNorm.lead?._id : qNorm.lead;
        if (leadId) {
          const resLead = await api.get(`/api/leads/${leadId}`);
          leadFull = resLead.data;
          const resVisits = await api.get(`/api/leads/${leadId}/site-visits`);
          siteVisits = Array.isArray(resVisits.data) ? resVisits.data : [];
        }
      } catch {}
      const coverFieldsRaw = [
        ["Submitted To", qNorm.submittedTo],
        ["Attention", qNorm.attention],
        ["Offer Reference", qNorm.offerReference],
        ["Enquiry Number", qNorm.enquiryNumber || leadFull?.enquiryNumber],
        [
          "Offer Date",
          qNorm.offerDate ? new Date(qNorm.offerDate).toLocaleDateString() : "",
        ],
        [
          "Enquiry Date",
          qNorm.enquiryDate
            ? new Date(qNorm.enquiryDate).toLocaleDateString()
            : "",
        ],
        ["Project Title", qNorm.projectTitle || leadFull?.projectTitle],
      ];
      const coverFields = coverFieldsRaw.filter(
        ([, v]) => v && String(v).trim().length > 0
      );

      const scopeRows = (qNorm.scopeOfWork || [])
        .filter((s) => (s?.description || "").trim().length > 0)
        .map((s, i) => [
          String(i + 1),
          richTextCell(s.description || ""),
          String(s.quantity || ""),
          s.unit || "",
          richTextCell(s.locationRemarks || ""),
        ]);

      const priceItems = (qNorm.priceSchedule?.items || []).filter(
        (it) =>
          (it?.description || "").trim().length > 0 ||
          Number(it.quantity) > 0 ||
          Number(it.unitRate) > 0
      );
      const priceRows = priceItems.map((it, i) => [
        String(i + 1),
        richTextCell(it.description || ""),
        String(it.quantity || 0),
        it.unit || "",
        `${currency} ${Number(it.unitRate || 0).toFixed(2)}`,
        `${currency} ${Number((it.quantity || 0) * (it.unitRate || 0)).toFixed(
          2
        )}`,
      ]);

      const exclusions = (qNorm.exclusions || [])
        .map((x) => String(x || "").trim())
        .filter(Boolean);
      const paymentTerms = (qNorm.paymentTerms || []).filter(
        (p) =>
          (p?.milestoneDescription || "").trim().length > 0 ||
          String(p?.amountPercent || "").trim().length > 0
      );

      const dcwv = qNorm.deliveryCompletionWarrantyValidity || {};
      const deliveryRowsRaw = [
        ["Delivery / Completion Timeline", dcwv.deliveryTimeline],
        ["Warranty Period", dcwv.warrantyPeriod],
        [
          "Offer Validity (Days)",
          typeof dcwv.offerValidity === "number"
            ? String(dcwv.offerValidity)
            : dcwv.offerValidity || "",
        ],
        ["Authorized Signatory", dcwv.authorizedSignatory],
      ];
      const deliveryRows = deliveryRowsRaw.filter(
        ([, v]) => v && String(v).trim().length > 0
      );

      const header = {
        margin: [36, 20, 36, 8],
        stack: [
          {
            columns: [
              { image: logoDataUrl || FALLBACK_PIXEL, width: 60 },
              [
                { text: q.companyInfo?.name || "Company", style: "brand" },
                {
                  text: [
                    q.companyInfo?.address,
                    q.companyInfo?.phone,
                    q.companyInfo?.email,
                  ]
                    .filter(Boolean)
                    .join(" | "),
                  color: "#64748b",
                  fontSize: 9,
                },
              ],
            ],
            columnGap: 12,
          },
          {
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: 0,
                x2: 523,
                y2: 0,
                lineWidth: 0.5,
                lineColor: "#e5e7eb",
              },
            ],
          },
        ],
      };

      const content = [];

      // Title
      content.push({
        text: "Commercial Quotation",
        style: "h1",
        margin: [0, 0, 0, 8],
      });

      // Cover & Basic Details
      if (coverFields.length > 0) {
        content.push({
          text: "Cover & Basic Details",
          style: "h2",
          margin: [0, 6, 0, 6],
        });
        content.push({
          table: {
            widths: ["30%", "70%"],
            body: [
              [
                { text: "Field", style: "th" },
                { text: "Value", style: "th" },
              ],
              ...coverFields.map(([k, v]) => [
                { text: k, style: "tdKey" },
                { text: v, style: "tdVal" },
              ]),
            ],
          },
          layout: "lightHorizontalLines",
        });
      }

      // Lead Details (from lead module)
      if (leadFull) {
        const leadDetailsRaw = [
          ["Customer", leadFull.customerName],
          ["Project Title", leadFull.projectTitle],
          ["Enquiry #", leadFull.enquiryNumber],
          [
            "Enquiry Date",
            leadFull.enquiryDate
              ? new Date(leadFull.enquiryDate).toLocaleDateString()
              : "",
          ],
          [
            "Submission Due",
            leadFull.submissionDueDate
              ? new Date(leadFull.submissionDueDate).toLocaleDateString()
              : "",
          ],
          ["Scope Summary", leadFull.scopeSummary],
        ];
        const leadDetails = leadDetailsRaw.filter(
          ([, v]) => v && String(v).trim().length > 0
        );
        if (leadDetails.length > 0) {
          content.push({
            text: "Project Details",
            style: "h2",
            margin: [0, 12, 0, 6],
          });
          content.push({
            table: {
              widths: ["30%", "70%"],
              body: [
                [
                  { text: "Field", style: "th" },
                  { text: "Value", style: "th" },
                ],
                ...leadDetails.map(([k, v]) => [
                  { text: k, style: "tdKey" },
                  { text: v, style: "tdVal" },
                ]),
              ],
            },
            layout: "lightHorizontalLines",
          });
        }
      }

      // Introduction
      if ((q.introductionText || "").trim().length > 0) {
        content.push({
          text: "Introduction",
          style: "h2",
          margin: [0, 10, 0, 6],
        });
        content.push({ text: q.introductionText, margin: [0, 0, 0, 6] });
      }

      // Scope of Work
      if (scopeRows.length > 0) {
        content.push({
          text: "Scope of Work",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        content.push({
          table: {
            widths: ["6%", "54%", "10%", "10%", "20%"],
            body: [
              [
                { text: "#", style: "th" },
                { text: "Description", style: "th" },
                { text: "Qty", style: "th" },
                { text: "Unit", style: "th" },
                { text: "Location/Remarks", style: "th" },
              ],
              ...scopeRows,
            ],
          },
          layout: "lightHorizontalLines",
        });
      }

      // Site Visit Reports (compact table)
      if (Array.isArray(siteVisits) && siteVisits.length > 0) {
        const visitRows = siteVisits.map((v, i) => [
          String(i + 1),
          v.visitAt ? new Date(v.visitAt).toLocaleString() : "",
          v.siteLocation || "",
          v.engineerName || "",
          (v.workProgressSummary || "").slice(0, 140),
        ]);
        content.push({
          text: "Site Visit Reports",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        content.push({
          table: {
            widths: ["6%", "22%", "22%", "20%", "30%"],
            body: [
              [
                { text: "#", style: "th" },
                { text: "Date & Time", style: "th" },
                { text: "Location", style: "th" },
                { text: "Engineer", style: "th" },
                { text: "Progress Summary", style: "th" },
              ],
              ...visitRows,
            ],
          },
          layout: "lightHorizontalLines",
        });
      }

      // Price Schedule
      if (priceRows.length > 0) {
        content.push({
          text: "Price Schedule",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        content.push({
          table: {
            widths: ["6%", "44%", "10%", "10%", "15%", "15%"],
            body: [
              [
                { text: "#", style: "th" },
                { text: "Description", style: "th" },
                { text: "Qty", style: "th" },
                { text: "Unit", style: "th" },
                { text: `Unit Rate (${currency})`, style: "th" },
                { text: `Amount (${currency})`, style: "th" },
              ],
              ...priceRows,
            ],
          },
          layout: "lightHorizontalLines",
        });

        content.push({
          columns: [
            { width: "*", text: "" },
            {
              width: "40%",
              table: {
                widths: ["55%", "45%"],
                body: [
                  [
                    { text: "Sub Total", style: "tdKey" },
                    {
                      text: `${currency} ${Number(
                        q.priceSchedule?.subTotal || 0
                      ).toFixed(2)}`,
                      alignment: "right",
                    },
                  ],
                  [
                    {
                      text: `VAT (${
                        q.priceSchedule?.taxDetails?.vatRate || 0
                      }%)`,
                      style: "tdKey",
                    },
                    {
                      text: `${currency} ${Number(
                        q.priceSchedule?.taxDetails?.vatAmount || 0
                      ).toFixed(2)}`,
                      alignment: "right",
                    },
                  ],
                  [
                    { text: "Grand Total", style: "th" },
                    {
                      text: `${currency} ${Number(
                        q.priceSchedule?.grandTotal || 0
                      ).toFixed(2)}`,
                      style: "th",
                      alignment: "right",
                    },
                  ],
                ],
              },
              layout: "lightHorizontalLines",
            },
          ],
          margin: [0, 8, 0, 0],
        });
      }

      // Our Viewpoints / Exclusions
      if ((q.ourViewpoints || "").trim().length > 0 || exclusions.length > 0) {
        content.push({
          text: "Our Viewpoints / Special Terms",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        if ((q.ourViewpoints || "").trim().length > 0) {
          content.push({ text: q.ourViewpoints, margin: [0, 0, 0, 6] });
        }
        if (exclusions.length > 0) {
          content.push({
            text: "Exclusions",
            style: "h3",
            margin: [0, 6, 0, 4],
          });
          content.push({ ul: exclusions });
        }
      }

      // Payment Terms
      if (paymentTerms.length > 0) {
        content.push({
          text: "Payment Terms",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        content.push({
          table: {
            widths: ["10%", "70%", "20%"],
            body: [
              [
                { text: "#", style: "th" },
                { text: "Milestone", style: "th" },
                { text: "Amount %", style: "th" },
              ],
              ...paymentTerms.map((p, i) => [
                String(i + 1),
                p.milestoneDescription || "",
                String(p.amountPercent || ""),
              ]),
            ],
          },
          layout: "lightHorizontalLines",
        });
      }

      // Delivery/Completion/Warranty/Validity
      if (deliveryRows.length > 0) {
        content.push({
          text: "Delivery, Completion, Warranty & Validity",
          style: "h2",
          margin: [0, 12, 0, 6],
        });
        content.push({
          table: {
            widths: ["30%", "70%"],
            body: [
              ...deliveryRows.map(([k, v]) => [
                { text: k, style: "tdKey" },
                { text: v, style: "tdVal" },
              ]),
            ],
          },
          layout: "lightHorizontalLines",
        });
      }

      // Approval status line
      if (isPending) {
        content.push({
          text: "Management Approval: Pending",
          italics: true,
          color: "#b45309",
          margin: [0, 12, 0, 0],
        });
      } else if (qNorm.managementApproval?.status === "approved") {
        content.push({
          text: `Approved by: ${
            qNorm.managementApproval?.approvedBy?.name || "Management"
          }`,
          italics: true,
          color: "#16a34a",
          margin: [0, 12, 0, 0],
        });
      }

      const docDefinition = buildDocDefinition({
        q: qNorm,
        logoDataUrl,
        leadFull,
        siteVisits,
        currency,
        isPending,
        scopeRows,
        priceRows,
        exclusions,
        paymentTerms,
        deliveryRows,
        coverFields
      });

      const filename = `${qNorm.projectTitle || "Quotation"}_${
        qNorm.offerReference || qNorm._id
      }.pdf`;
      const pdfDoc = window.pdfMake.createPdf(docDefinition);
      pdfDoc.getDataUrl(
        (dataUrl) => {
          setPrintPreviewModal({
            open: true,
            pdfUrl: dataUrl,
            quotation: qNorm,
            filename,
          });
        },
        () => {
          setNotify({
            open: true,
            title: "Preview Failed",
            message: "We could not generate the PDF preview. Please try again.",
          });
        }
      );
    } catch (e) {
      setNotify({
        open: true,
        title: "Preview Failed",
        message: "We could not generate the PDF preview. Please try again.",
      });
    }
  };

  const hasRevisionChanges = (original, form) => {
    if (!original || !form) return false;
    const fields = [
      "companyInfo",
      "submittedTo",
      "attention",
      "offerReference",
      "enquiryNumber",
      "offerDate",
      "enquiryDate",
      "projectTitle",
      "introductionText",
      "scopeOfWork",
      "priceSchedule",
      "ourViewpoints",
      "exclusions",
      "paymentTerms",
      "deliveryCompletionWarrantyValidity",
    ];
    for (const f of fields) {
      if (
        JSON.stringify(original?.[f] ?? null) !==
        JSON.stringify(form?.[f] ?? null)
      )
        return true;
    }
    return false;
  };

  const formatHistoryValue = (field, value, { asHtml = false } = {}) => {
    const richFields = ["scopeOfWork", "priceSchedule", "exclusions", "paymentTerms"];
    const isRich = richFields.includes(field);
    if (value === null || value === undefined) return "";
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      if (isRich && asHtml) return String(value);
      return String(value);
    }
    try {
      if (Array.isArray(value)) {
        if (field === "paymentTerms") {
          const terms = value || [];
          const lines = terms.map(
            (t, i) =>
              `${i + 1}. ${t?.milestoneDescription || "-"} — ${
                t?.amountPercent ?? ""
              }%`
          );
          return asHtml ? lines.join("<br>") : lines.join("\n");
        }
        if (field === "scopeOfWork") {
          const scopes = value || [];
          const lines = scopes.map((s, i) => {
            const qtyUnit = [s?.quantity ?? "", s?.unit || ""]
              .filter((x) => String(x).trim().length > 0)
              .join(" ");
            const remarks = s?.locationRemarks
              ? ` — ${s.locationRemarks}`
              : "";
            return `${i + 1}. ${s?.description || "-"}${
              qtyUnit ? ` — Qty: ${qtyUnit}` : ""
            }${remarks}`;
          });
          return asHtml ? lines.join("<br>") : lines.join("\n");
        }
        if (field === "exclusions") {
          const lines = (value || []).map((v, i) => `${i + 1}. ${String(v || "")}`);
          return asHtml ? lines.join("<br>") : lines.join("\n");
        }
        const lines = value
          .map((v, i) => {
            if (
              typeof v === "string" ||
              typeof v === "number" ||
              typeof v === "boolean"
            )
              return `${i + 1}. ${String(v)}`;
            if (v && typeof v === "object") {
              const parts = Object.entries(v).map(([k, val]) => `${k}: ${val}`);
              return `${i + 1}. ${parts.join(", ")}`;
            }
            return `${i + 1}. ${String(v)}`;
          });
        return asHtml ? lines.join("<br>") : lines.join("\n");
      }
      if (typeof value === "object") {
        if (field === "priceSchedule") {
          const ps = value || {};
          const lines = [];
          if (ps?.currency) lines.push(`Currency: ${ps.currency}`);
          const items = Array.isArray(ps?.items) ? ps.items : [];
          if (items.length > 0) {
            lines.push("Items:");
            items.forEach((it, i) => {
              const qtyUnit = [it?.quantity ?? "", it?.unit || ""]
                .filter((x) => String(x).trim().length > 0)
                .join(" ");
              const unitRate =
                (it?.unitRate ?? "") !== "" ? ` x ${it.unitRate}` : "";
              const amount =
                (it?.totalAmount ?? "") !== "" ? ` = ${it.totalAmount}` : "";
              lines.push(
                `  ${i + 1}. ${it?.description || "-"}${
                  qtyUnit ? ` — Qty: ${qtyUnit}` : ""
                }${unitRate}${amount}`
              );
            });
          }
          if (ps?.subTotal !== undefined)
            lines.push(`Sub Total: ${ps.subTotal}`);
          if (
            ps?.taxDetails?.vatRate !== undefined ||
            ps?.taxDetails?.vatAmount !== undefined
          ) {
            const rate = ps?.taxDetails?.vatRate ?? "";
            const amt = ps?.taxDetails?.vatAmount ?? "";
            lines.push(`VAT: ${rate}%${amt !== "" ? ` = ${amt}` : ""}`);
          }
          if (ps?.grandTotal !== undefined)
            lines.push(`Grand Total: ${ps.grandTotal}`);
          return asHtml ? lines.join("<br>") : lines.join("\n");
        }
        if (field === "deliveryCompletionWarrantyValidity") {
          const d = value || {};
          const lines = [];
          if (d?.deliveryTimeline)
            lines.push(`Delivery Timeline: ${d.deliveryTimeline}`);
          if (d?.warrantyPeriod)
            lines.push(`Warranty Period: ${d.warrantyPeriod}`);
          if (d?.offerValidity !== undefined)
            lines.push(`Offer Validity: ${d.offerValidity} days`);
          if (d?.authorizedSignatory)
            lines.push(`Authorized Signatory: ${d.authorizedSignatory}`);
          return asHtml ? lines.join("<br>") : lines.join("\n");
        }
        const entries = Object.entries(value).map(
          ([k, v]) =>
            `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`
        );
        return asHtml ? entries.join("<br>") : entries.join("\n");
      }
    } catch {}
    return String(value);
  };

  const onChangeItem = (idx, field, value) => {
    const items = form.priceSchedule.items.map((it, i) =>
      i === idx
        ? {
            ...it,
            [field]: value,
            totalAmount: Number(
              (
                Number(field === "quantity" ? value : it.quantity || 0) *
                Number(field === "unitRate" ? value : it.unitRate || 0)
              ).toFixed(2)
            ),
          }
        : it
    );
    const totals = recalcTotals(items, form.priceSchedule.taxDetails.vatRate);
    setForm({
      ...form,
      priceSchedule: {
        ...form.priceSchedule,
        items,
        subTotal: totals.subTotal,
        grandTotal: totals.grandTotal,
        taxDetails: {
          ...form.priceSchedule.taxDetails,
          vatAmount: totals.vatAmount,
        },
      },
    });
  };

  // Handler for View Revisions in table view (accordion)
  const handleViewRevisionsTable = async (q) => {
    const quotationId = q._id;
    const isExpanded = expandedRevisionRows[quotationId];

    if (isExpanded) {
      // Collapse: remove from expanded rows
      setExpandedRevisionRows((prev) => {
        const next = { ...prev };
        delete next[quotationId];
        return next;
      });
    } else {
      // Expand: fetch revisions if not already loaded
      if (!quotationRevisionsMap[quotationId]) {
        try {
          const revRes = await api.get(
            `/api/revisions?parentQuotation=${quotationId}`
          );
          const revisions = Array.isArray(revRes.data) ? revRes.data : [];
          setQuotationRevisionsMap((prev) => ({
            ...prev,
            [quotationId]: revisions,
          }));

          // Check which revisions have projects
          const projectChecks = {};
          for (const rev of revisions) {
            try {
              const projectRes = await api.get(
                `/api/projects/by-revision/${rev._id}`
              );
              projectChecks[rev._id] = projectRes.data;
            } catch {
              // No project for this revision
            }
          }
          setRevisionProjectMap((prev) => ({ ...prev, ...projectChecks }));
        } catch (e) {
          setNotify({
            open: true,
            title: "Load Failed",
            message: "We could not load the revisions. Please try again.",
          });
          return;
        }
      }
      setExpandedRevisionRows((prev) => ({ ...prev, [quotationId]: true }));
    }
  };

  const fetchRevisionProjectDetails = async (revisionId) => {
    if (revisionProjectDetailsMap[revisionId])
      return revisionProjectDetailsMap[revisionId];

    try {
      const projectInfo = revisionProjectMap[revisionId];
      if (!projectInfo?._id) return null;

      const res = await api.get(`/api/projects/${projectInfo._id}`);
      const project = res.data;
      setRevisionProjectDetailsMap((prev) => ({
        ...prev,
        [revisionId]: project,
      }));
      return project;
    } catch {
      return null;
    }
  };

  const handleViewProjectFromRevision = async (revision, isTable = false) => {
    if (isTable) {
      // Toggle accordion in table view
      const isExpanded = expandedProjectRows[revision._id];
      setExpandedProjectRows((prev) => ({
        ...prev,
        [revision._id]: !isExpanded,
      }));

      // Fetch project details if not already loaded
      if (!isExpanded && !revisionProjectDetailsMap[revision._id]) {
        await fetchRevisionProjectDetails(revision._id);
      }
    } else {
      // Open modal in card view
      const project = await fetchRevisionProjectDetails(revision._id);
      if (project) {
        setProjectModal({ open: true, project });
      }
    }
  };

  // Handler for View Variations in table view (accordion)
  const handleViewVariationsTable = async (projectId) => {
    const isExpanded = expandedVariationRows[projectId];

    if (isExpanded) {
      // Collapse: remove from expanded rows
      setExpandedVariationRows((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
    } else {
      // Expand: fetch variations if not already loaded
      if (!projectVariationsMap[projectId]) {
        try {
          const res = await api.get(
            `/api/project-variations?parentProject=${projectId}`
          );
          const list = Array.isArray(res.data) ? res.data : [];
          setProjectVariationsMap((prev) => ({ ...prev, [projectId]: list }));
        } catch (e) {
          setNotify({
            open: true,
            title: "Load Failed",
            message: "We could not load the variations. Please try again.",
          });
          return;
        }
      }
      setExpandedVariationRows((prev) => ({ ...prev, [projectId]: true }));
    }
  };

  // Helper function to render quotation actions (used in both card and table views)
  const renderQuotationActions = (q, isTableView = false) => {
    const isApproved = q.managementApproval?.status === "approved";
    const canDelete =
      !isApproved ||
      currentUser?.roles?.includes("manager") ||
      currentUser?.roles?.includes("admin");
    return (
      <div className="lead-actions">
        {canDelete && (
          <button
            className="reject-btn"
            onClick={() => setDeleteModal({ open: true, quote: q })}
          >
            Delete
          </button>
        )}

        <button
          className="assign-btn"
          onClick={() => {
            try {
              localStorage.setItem("quotationId", q._id);
              localStorage.setItem("quotationDetail", JSON.stringify(q));
              const leadId = typeof q.lead === "object" ? q.lead?._id : q.lead;
              if (leadId) localStorage.setItem("leadId", leadId);
              window.location.href = "/quotation-detail";
            } catch {
              window.location.href = "/quotation-detail";
            }
          }}
        >
          Detailed View
        </button>
        {hasProjectFor[q._id] && (
          <button
            className="link-btn"
            onClick={async () => {
              try {
                const pjRes = await api.get(`/api/projects/by-quotation/${q._id}`)
                const pj = pjRes.data
                try {
                  localStorage.setItem('projectsFocusId', pj._id)
                  localStorage.setItem('projectId', pj._id)
                } catch {}
                window.location.href = '/project-detail'
              } catch {
                setNotify({ open: true, title: 'Open Project Failed', message: 'We could not open the linked project.' })
              }
            }}
          >
            View Project
          </button>
        )}
        {q.managementApproval?.status === "pending" ? (
          <span className="status-badge blue">Approval Pending</span>
        ) : (
          q.managementApproval?.status !== "approved" &&
          q.managementApproval?.status !== "pending" &&
          !(
            currentUser?.roles?.includes("manager") ||
            currentUser?.roles?.includes("admin")
          ) && (
            <button
              className="save-btn"
              onClick={() =>
                setSendApprovalConfirmModal({ open: true, quote: q })
              }
            >
              Send for Approval
            </button>
          )
        )}

        {(currentUser?.roles?.includes("manager") ||
          currentUser?.roles?.includes("admin")) &&
          q.managementApproval?.status === "pending" && (
            <>
              <button
                className="approve-btn"
                onClick={() =>
                  setApprovalModal({
                    open: true,
                    quote: q,
                    action: "approved",
                    note: "",
                  })
                }
              >
                Approve
              </button>
              <button
                className="reject-btn"
                onClick={() =>
                  setApprovalModal({
                    open: true,
                    quote: q,
                    action: "rejected",
                    note: "",
                  })
                }
              >
                Reject
              </button>
            </>
          )}
        <button
          className="link-btn"
          onClick={async () => {
            if (isTableView) {
              // Table view: use accordion
              handleViewRevisionsTable(q);
            } else {
              // Card view: use modal
              try {
                const revRes = await api.get(
                  `/api/revisions?parentQuotation=${q._id}`
                );
                const revisions = Array.isArray(revRes.data) ? revRes.data : [];
                setRevisionsForQuotation(revisions);
                setSelectedQuotationForRevisions(q);
                setShowRevisionsModal(true);

                // Check which revisions have projects
                const projectChecks = {};
                for (const rev of revisions) {
                  try {
                    const projectRes = await api.get(
                      `/api/projects/by-revision/${rev._id}`
                    );
                    projectChecks[rev._id] = projectRes.data;
                  } catch {
                    // No project for this revision
                  }
                }
                setRevisionProjectMap((prev) => ({
                  ...prev,
                  ...projectChecks,
                }));
              } catch (e) {
                setNotify({
                  open: true,
                  title: "Open Failed",
                  message: "We could not load the revisions. Please try again.",
                });
              }
            }
          }}
        >
          View Revisions
        </button>
      </div>
    );
  };

  // Debounce name filter (300ms delay)
  useEffect(() => {
    setIsFiltering(true);
    const timer = setTimeout(() => {
      setDebouncedNameFilter(nameFilter);
      setIsFiltering(false);
    }, 300);
    return () => {
      clearTimeout(timer);
      setIsFiltering(false);
    };
  }, [nameFilter]);

  // Date filters don't need debouncing (they're date inputs)
  useEffect(() => {
    setDebouncedDateModifiedFilter(dateModifiedFilter);
  }, [dateModifiedFilter]);

  useEffect(() => {
    setDebouncedDateCreatedFilter(dateCreatedFilter);
  }, [dateCreatedFilter]);

  // Calculate filtered quotations count
  const filteredQuotations = quotations.filter((q) => {
    // Apply "My Quotations" filter
    if (myQuotationsOnly && q.createdBy?._id !== currentUser?.id) return false;

    // Apply Lead filter
    if (selectedLeadFilter) {
      const qLeadId = typeof q.lead === "object" ? q.lead?._id : q.lead;
      if (qLeadId !== selectedLeadFilter) return false;
    }

    // Apply search filter
    if (search.trim()) {
      const term = search.toLowerCase();
      const matches =
        (q.projectTitle || q.lead?.projectTitle || "")
          .toLowerCase()
          .includes(term) ||
        (q.offerReference || "").toLowerCase().includes(term) ||
        (q.enquiryNumber || q.lead?.enquiryNumber || "")
          .toLowerCase()
          .includes(term) ||
        (q.lead?.customerName || "").toLowerCase().includes(term);
      if (!matches) return false;
    }

    // Apply name filter (project title or offer reference) - using debounced value
    if (debouncedNameFilter.trim()) {
      const term = debouncedNameFilter.toLowerCase();
      const projectTitle = (
        q.projectTitle ||
        q.lead?.projectTitle ||
        ""
      ).toLowerCase();
      const offerRef = (q.offerReference || "").toLowerCase();
      if (!projectTitle.includes(term) && !offerRef.includes(term))
        return false;
    }

    // Apply date modified filter - using debounced value
    if (debouncedDateModifiedFilter) {
      const filterDate = new Date(debouncedDateModifiedFilter);
      filterDate.setHours(0, 0, 0, 0);
      const quotationDate = q.updatedAt ? new Date(q.updatedAt) : null;
      if (
        !quotationDate ||
        quotationDate.toDateString() !== filterDate.toDateString()
      )
        return false;
    }

    // Apply date created filter - using debounced value
    if (debouncedDateCreatedFilter) {
      const filterDate = new Date(debouncedDateCreatedFilter);
      filterDate.setHours(0, 0, 0, 0);
      const quotationDate = q.createdAt ? new Date(q.createdAt) : null;
      if (
        !quotationDate ||
        quotationDate.toDateString() !== filterDate.toDateString()
      )
        return false;
    }

    return true;
  });

  // Sort quotations by selected field and direction
  const sortedQuotations = [...filteredQuotations].sort((a, b) => {
    let compareResult = 0;

    switch (sortField) {
      case "name":
        // Sort by project title, then offer reference
        const aProjectTitle = (
          a.projectTitle ||
          a.lead?.projectTitle ||
          ""
        ).toLowerCase();
        const bProjectTitle = (
          b.projectTitle ||
          b.lead?.projectTitle ||
          ""
        ).toLowerCase();
        const projectTitleCompare = aProjectTitle.localeCompare(bProjectTitle);
        if (projectTitleCompare !== 0) {
          compareResult = projectTitleCompare;
        } else {
          // If project titles are equal, sort by offer reference
          const aOfferRef = (a.offerReference || "").toLowerCase();
          const bOfferRef = (b.offerReference || "").toLowerCase();
          compareResult = aOfferRef.localeCompare(bOfferRef);
        }
        break;
      case "dateModified":
        const aModified = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bModified = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        compareResult =
          aModified > bModified ? 1 : aModified < bModified ? -1 : 0;
        break;
      case "dateCreated":
      default:
        const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        compareResult = aCreated > bCreated ? 1 : aCreated < bCreated ? -1 : 0;
        break;
    }

    // Apply sort direction
    return sortDirection === "asc" ? compareResult : -compareResult;
  });

  const totalQuotations = quotations.length;
  const displayedQuotations = sortedQuotations.length;

  // Pagination calculations
  const totalPages = Math.ceil(sortedQuotations.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedQuotations = sortedQuotations.slice(startIndex, endIndex);

  // Reset to page 1 when filters or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    myQuotationsOnly,
    selectedLeadFilter,
    search,
    debouncedNameFilter,
    debouncedDateModifiedFilter,
    debouncedDateCreatedFilter,
    sortField,
    sortDirection,
  ]);

  return (
    <div className="lead-management">
      <div className="header" ref={headerRef}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h1>Quotation Management</h1>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: "12px",
              background: "var(--bg)",
              color: "var(--text-muted)",
              fontSize: "14px",
              fontWeight: 600,
              border: "1px solid var(--border)",
            }}
          >
            {myQuotationsOnly ||
            selectedLeadFilter ||
            search ||
            debouncedNameFilter ||
            debouncedDateModifiedFilter ||
            debouncedDateCreatedFilter
              ? `${displayedQuotations} of ${totalQuotations}`
              : totalQuotations}{" "}
            {totalQuotations === 1 ? "Quotation" : "Quotations"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={myQuotationsOnly}
              onChange={() => setMyQuotationsOnly(!myQuotationsOnly)}
            />
            My Quotations
          </label>
          <input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "6px 12px",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "var(--card)",
              color: "var(--text)",
              fontSize: "14px",
              minWidth: "200px",
            }}
          />
          <select
            value={selectedLeadFilter}
            onChange={(e) => setSelectedLeadFilter(e.target.value)}
            style={{
              padding: "6px 12px",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "var(--card)",
              color: "var(--text)",
              fontSize: "14px",
              cursor: "pointer",
              maxWidth: "250px",
              width: "250px",
            }}
          >
            <option value="">All Leads</option>
            {leads.map((lead) => (
              <option key={lead._id} value={lead._id}>
                {lead.projectTitle || lead.name || "Untitled"} -{" "}
                {lead.customerName || "N/A"}
              </option>
            ))}
          </select>
          <div
            style={{
              display: "flex",
              gap: "4px",
              alignItems: "center",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "2px",
            }}
          >
            <button
              onClick={() => setViewMode("card")}
              style={{
                padding: "6px 12px",
                border: "none",
                borderRadius: "6px",
                background:
                  viewMode === "card" ? "var(--primary)" : "transparent",
                color: viewMode === "card" ? "white" : "var(--text)",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
                transition: "all 0.2s ease",
              }}
            >
              Card
            </button>
            <button
              onClick={() => setViewMode("table")}
              style={{
                padding: "6px 12px",
                border: "none",
                borderRadius: "6px",
                background:
                  viewMode === "table" ? "var(--primary)" : "transparent",
                color: viewMode === "table" ? "white" : "var(--text)",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
                transition: "all 0.2s ease",
              }}
            >
              Table
            </button>
          </div>
          {canCreate() && (
            <button className="add-btn" onClick={openCreate}>
              Create Quotation
            </button>
          )}
        </div>
      </div>

      {/* Filters and Sorting Section - Sticky */}
      <div
        style={{
          position: "sticky",
          top: `${headerHeight}px`,
          zIndex: 99,
          marginTop: "16px",
          marginBottom: "16px",
          padding: "16px",
          background: "var(--card)",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          alignSelf: "flex-start",
          width: "100%",
        }}
      >
        {/* Mobile: Collapsible Header */}
        {isMobile && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
              Filters & Sorting
            </h3>
            <button
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              style={{
                padding: "6px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "14px",
                cursor: "pointer",
              }}
              aria-expanded={filtersExpanded}
              aria-label={
                filtersExpanded ? "Collapse filters" : "Expand filters"
              }
            >
              {filtersExpanded ? "▼" : "▶"} {filtersExpanded ? "Hide" : "Show"}{" "}
              Filters
            </button>
          </div>
        )}

        {/* Filter Content - Hidden on mobile when collapsed */}
        {(!isMobile || filtersExpanded) && (
          <>
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "flex-start",
                flexWrap: "wrap",
                position: "relative",
              }}
            >
              {isFiltering && (
                <div
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    background: "var(--card)",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    zIndex: 1,
                  }}
                >
                  <span>Filtering...</span>
                </div>
              )}
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                Filter by Name:
                <div style={{ position: "relative", display: "inline-block" }}>
                  <input
                    type="text"
                    placeholder="Project title or offer reference..."
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: "14px",
                      minWidth: isMobile ? "100%" : "200px",
                      width: isMobile ? "100%" : "auto",
                    }}
                    aria-label="Filter by project title or offer reference"
                  />
                </div>
              </label>
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                Filter by Date Modified:
                <input
                  type="date"
                  value={dateModifiedFilter}
                  onChange={(e) => setDateModifiedFilter(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "14px",
                    minWidth: isMobile ? "100%" : "160px",
                    width: isMobile ? "100%" : "auto",
                  }}
                  aria-label="Filter by date modified"
                />
              </label>
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                Filter by Date Created:
                <input
                  type="date"
                  value={dateCreatedFilter}
                  onChange={(e) => setDateCreatedFilter(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "14px",
                    minWidth: isMobile ? "100%" : "160px",
                    width: isMobile ? "100%" : "auto",
                  }}
                  aria-label="Filter by date created"
                />
              </label>
              {(nameFilter || dateModifiedFilter || dateCreatedFilter) && (
                <button
                  onClick={() => {
                    setNameFilter("");
                    setDateModifiedFilter("");
                    setDateCreatedFilter("");
                  }}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "14px",
                    cursor: "pointer",
                    marginTop: isMobile ? "8px" : "20px",
                    alignSelf: isMobile ? "stretch" : "flex-end",
                    width: isMobile ? "100%" : "auto",
                  }}
                  aria-label="Clear all filters"
                >
                  Clear Filters
                </button>
              )}
            </div>
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
                paddingTop: "8px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  flex: isMobile ? "1 1 100%" : "0 0 auto",
                }}
              >
                Sort by:
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "14px",
                    cursor: "pointer",
                    minWidth: isMobile ? "100%" : "150px",
                    width: isMobile ? "100%" : "auto",
                    flex: isMobile ? "1" : "0 0 auto",
                  }}
                  aria-label="Sort by field"
                >
                  <option value="name">Name</option>
                  <option value="dateModified">Date Modified</option>
                  <option value="dateCreated">Date Created</option>
                </select>
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  flex: isMobile ? "1 1 100%" : "0 0 auto",
                }}
              >
                Order:
                <select
                  value={sortDirection}
                  onChange={(e) => setSortDirection(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: "14px",
                    cursor: "pointer",
                    minWidth: isMobile ? "100%" : "120px",
                    width: isMobile ? "100%" : "auto",
                    flex: isMobile ? "1" : "0 0 auto",
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

      {viewMode === "card" ? (
        <div className="leads-grid">
          {paginatedQuotations.map((q) => (
            <div key={q._id} className="lead-card">
              <div className="lead-header">
                <h3>{q.projectTitle || q.lead?.projectTitle || "Quotation"}</h3>
                {q.managementApproval?.status && (
                  <span
                    className={`status-badge ${
                      q.managementApproval.status === "approved"
                        ? "green"
                        : q.managementApproval.status === "rejected"
                        ? "red"
                        : "blue"
                    }`}
                  >
                    {q.managementApproval.status === "pending"
                      ? "Approval Pending"
                      : q.managementApproval.status}
                  </span>
                )}
              </div>
              <div className="lead-details">
                <p>
                  <strong>Customer:</strong> {q.lead?.customerName || "N/A"}
                </p>
                <p>
                  <strong>Enquiry #:</strong>{" "}
                  {q.enquiryNumber || q.lead?.enquiryNumber || "N/A"}
                </p>
                <p>
                  <strong>Offer Ref:</strong> {q.offerReference || "N/A"}
                </p>
                <p>
                  <strong>Grand Total:</strong>{" "}
                  {q.priceSchedule?.currency || "AED"}{" "}
                  {Number(q.priceSchedule?.grandTotal || 0).toFixed(2)}
                </p>
                <p>
                  <strong>Revisions:</strong> {revisionCounts[q._id] || 0}
                </p>
                <p>
                  <strong>Created by:</strong>{" "}
                  {q.createdBy?._id === currentUser?.id
                    ? "You"
                    : q.createdBy?.name || "N/A"}
                </p>
                {q.createdBy?._id !== currentUser?.id && q.createdBy && (
                  <button
                    className="link-btn"
                    onClick={() => setProfileUser(q.createdBy)}
                  >
                    View Profile
                  </button>
                )}
                {q.managementApproval?.requestedBy?.name && (
                  <p>
                    <strong>Approval sent by:</strong>{" "}
                    {q.managementApproval.requestedBy.name}{" "}
                    {q.managementApproval.requestedBy?._id && (
                      <button
                        className="link-btn"
                        onClick={() =>
                          setProfileUser(q.managementApproval.requestedBy)
                        }
                        style={{ marginLeft: 6 }}
                      >
                        View Profile
                      </button>
                    )}
                  </p>
                )}
                {q.managementApproval?.approvedBy?.name && (
                  <p>
                    <strong>Approved by:</strong>{" "}
                    {q.managementApproval.approvedBy.name}{" "}
                    {q.managementApproval.approvedBy?._id && (
                      <button
                        className="link-btn"
                        onClick={() =>
                          setProfileUser(q.managementApproval.approvedBy)
                        }
                        style={{ marginLeft: 6 }}
                      >
                        View Profile
                      </button>
                    )}
                  </p>
                )}
              </div>
              {renderQuotationActions(q)}
            </div>
          ))}
        </div>
      ) : (
        <div className="table" style={{ marginTop: "24px" }}>
          <table>
            <thead>
              <tr>
                <th>Project Title</th>
                <th>Offer Date</th>
                <th>Grand Total</th>
                <th>Status</th>
                <th>Created By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedQuotations.map((q) => {
                const isExpanded = expandedRevisionRows[q._id];
                const revisions = quotationRevisionsMap[q._id] || [];
                return (
                  <Fragment key={q._id}>
                    <tr key={q._id}>
                      <td data-label="Project Title">
                        {q.projectTitle || q.lead?.projectTitle || "Quotation"}
                      </td>
                      <td data-label="Offer Date">
                        {q.offerDate
                          ? new Date(q.offerDate).toLocaleDateString()
                          : "N/A"}
                      </td>
                      <td data-label="Grand Total">
                        {q.priceSchedule?.currency || "AED"}{" "}
                        {Number(q.priceSchedule?.grandTotal || 0).toFixed(2)}
                      </td>
                      <td data-label="Status">
                        <span
                          className={`status-badge ${
                            q.managementApproval?.status === "approved"
                              ? "green"
                              : q.managementApproval?.status === "rejected"
                              ? "red"
                              : "blue"
                          }`}
                        >
                          {q.managementApproval?.status === "pending"
                            ? "Approval Pending"
                            : q.managementApproval?.status || "N/A"}
                        </span>
                      </td>
                      <td data-label="Created By">
                        {q.createdBy?._id === currentUser?.id
                          ? "You"
                          : q.createdBy?.name || "N/A"}
                        {q.createdBy?._id !== currentUser?.id &&
                          q.createdBy && (
                            <button
                              className="link-btn"
                              onClick={() => setProfileUser(q.createdBy)}
                              style={{ marginLeft: "6px" }}
                            >
                              View Profile
                            </button>
                          )}
                      </td>
                      <td data-label="Actions">
                        {renderQuotationActions(q, true)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr
                        key={`${q._id}-revisions`}
                        className="history-row accordion-row"
                      >
                        <td colSpan={10} style={{ padding: "0" }}>
                          <div
                            className="history-panel accordion-content"
                            style={{ padding: "16px" }}
                          >
                            <h4
                              style={{
                                marginTop: "0",
                                marginBottom: "12px",
                                fontSize: "16px",
                                fontWeight: 600,
                              }}
                            >
                              Revisions (
                              {(quotationRevisionsMap[q._id] || []).length})
                            </h4>
                            {(quotationRevisionsMap[q._id] || []).length ===
                            0 ? (
                              <p
                                style={{
                                  margin: 0,
                                  color: "var(--text-muted)",
                                }}
                              >
                                No revisions found for this quotation.
                              </p>
                            ) : (
                              <div className="table">
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Revision #</th>
                                      <th>Offer Ref</th>
                                      <th>Offer Date</th>
                                      <th>Grand Total</th>
                                      <th>Status</th>
                                      <th>Created By</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(quotationRevisionsMap[q._id] || []).map(
                                      (r) => (
                                        <>
                                          <tr key={r._id}>
                                            <td data-label="Revision #">
                                              {r.parentQuotation?._id ||
                                              r.parentQuotation ? (
                                                <button
                                                  className="link-btn"
                                                  onClick={() => {
                                                    try {
                                                      const parentId =
                                                        typeof r.parentQuotation ===
                                                        "object"
                                                          ? r.parentQuotation
                                                              ._id
                                                          : r.parentQuotation;
                                                      localStorage.setItem(
                                                        "quotationId",
                                                        parentId
                                                      );
                                                      localStorage.setItem(
                                                        "quotationDetail",
                                                        JSON.stringify(
                                                          r.parentQuotation ||
                                                            {}
                                                        )
                                                      );
                                                    } catch {}
                                                    window.location.href =
                                                      "/quotation-detail";
                                                  }}
                                                  style={{
                                                    fontSize: "inherit",
                                                    fontWeight: 600,
                                                    padding: 0,
                                                    textDecoration: "underline",
                                                  }}
                                                >
                                                  {r.revisionNumber || "N/A"}
                                                </button>
                                              ) : (
                                                r.revisionNumber || "N/A"
                                              )}
                                            </td>
                                            <td data-label="Offer Ref">
                                              {r.offerReference || "N/A"}
                                            </td>
                                            <td data-label="Offer Date">
                                              {r.offerDate
                                                ? new Date(
                                                    r.offerDate
                                                  ).toLocaleDateString()
                                                : "N/A"}
                                            </td>
                                            <td data-label="Grand Total">
                                              {r.priceSchedule?.currency ||
                                                "AED"}{" "}
                                              {Number(
                                                r.priceSchedule?.grandTotal || 0
                                              ).toFixed(2)}
                                            </td>
                                            <td data-label="Status">
                                              {r.managementApproval?.status ||
                                                "pending"}
                                            </td>
                                            <td data-label="Created By">
                                              {r.createdBy?._id ===
                                              currentUser?.id
                                                ? "You"
                                                : r.createdBy?.name || "N/A"}
                                            </td>
                                            <td data-label="Actions">
                                              <button
                                                className="save-btn"
                                                onClick={() => {
                                                  try {
                                                    localStorage.setItem(
                                                      "revisionId",
                                                      r._id
                                                    );
                                                    localStorage.setItem(
                                                      "revisionDetail",
                                                      JSON.stringify(r)
                                                    );
                                                    const leadId =
                                                      typeof r.lead === "object"
                                                        ? r.lead?._id
                                                        : r.lead;
                                                    if (leadId)
                                                      localStorage.setItem(
                                                        "leadId",
                                                        leadId
                                                      );
                                                  } catch {}
                                                  window.location.href =
                                                    "/revision-detail";
                                                }}
                                              >
                                                View
                                              </button>
                                              {revisionProjectMap[r._id] && (
                                                <button
                                                  className="link-btn"
                                                  onClick={() =>
                                                    handleViewProjectFromRevision(
                                                      r,
                                                      true
                                                    )
                                                  }
                                                  style={{ marginLeft: "6px" }}
                                                >
                                                  View Project
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                          {expandedProjectRows[r._id] &&
                                            revisionProjectDetailsMap[
                                              r._id
                                            ] && (
                                              <tr className="accordion-row">
                                                <td
                                                  colSpan="7"
                                                  style={{
                                                    padding: "0",
                                                    borderTop: "none",
                                                  }}
                                                >
                                                  <div
                                                    className="accordion-content"
                                                    style={{
                                                      padding: "20px",
                                                      background: "var(--bg)",
                                                    }}
                                                  >
                                                    <h4
                                                      style={{
                                                        marginTop: 0,
                                                        marginBottom: "16px",
                                                      }}
                                                    >
                                                      Project Details
                                                    </h4>
                                                    <div
                                                      className="ld-kv"
                                                      style={{
                                                        display: "grid",
                                                        gridTemplateColumns:
                                                          "1fr 1fr",
                                                        gap: "12px 16px",
                                                      }}
                                                    >
                                                      <p>
                                                        <strong>
                                                          Project Name:
                                                        </strong>{" "}
                                                        {revisionProjectDetailsMap[
                                                          r._id
                                                        ].name || "N/A"}
                                                      </p>
                                                      <p>
                                                        <strong>Status:</strong>{" "}
                                                        {revisionProjectDetailsMap[
                                                          r._id
                                                        ].status || "N/A"}
                                                      </p>
                                                      <p>
                                                        <strong>
                                                          Location:
                                                        </strong>{" "}
                                                        {revisionProjectDetailsMap[
                                                          r._id
                                                        ].locationDetails ||
                                                          "N/A"}
                                                      </p>
                                                      <p>
                                                        <strong>
                                                          Working Hours:
                                                        </strong>{" "}
                                                        {revisionProjectDetailsMap[
                                                          r._id
                                                        ].workingHours || "N/A"}
                                                      </p>
                                                      <p>
                                                        <strong>
                                                          Manpower Count:
                                                        </strong>{" "}
                                                        {revisionProjectDetailsMap[
                                                          r._id
                                                        ].manpowerCount ||
                                                          "N/A"}
                                                      </p>
                                                      <p>
                                                        <strong>Budget:</strong>{" "}
                                                        {revisionProjectDetailsMap[
                                                          r._id
                                                        ].budget
                                                          ? `${
                                                              revisionProjectDetailsMap[
                                                                r._id
                                                              ].budget
                                                            }`
                                                          : "N/A"}
                                                      </p>
                                                      <p>
                                                        <strong>
                                                          Site Engineer:
                                                        </strong>{" "}
                                                        {revisionProjectDetailsMap[
                                                          r._id
                                                        ].assignedSiteEngineer
                                                          ?.name ||
                                                          "Not Assigned"}
                                                      </p>
                                                      <p>
                                                        <strong>
                                                          Project Engineer:
                                                        </strong>{" "}
                                                        {revisionProjectDetailsMap[
                                                          r._id
                                                        ]
                                                          .assignedProjectEngineer
                                                          ?.name ||
                                                          "Not Assigned"}
                                                      </p>
                                                      <p>
                                                        <strong>
                                                          Created At:
                                                        </strong>{" "}
                                                        {revisionProjectDetailsMap[
                                                          r._id
                                                        ].createdAt
                                                          ? new Date(
                                                              revisionProjectDetailsMap[
                                                                r._id
                                                              ].createdAt
                                                            ).toLocaleString()
                                                          : "N/A"}
                                                      </p>
                                                      <p>
                                                        <strong>
                                                          Created By:
                                                        </strong>{" "}
                                                        {revisionProjectDetailsMap[
                                                          r._id
                                                        ].createdBy?.name ||
                                                          "N/A"}
                                                      </p>
                                                    </div>
                                                    <div
                                                      style={{
                                                        marginTop: "16px",
                                                        display: "flex",
                                                        gap: "8px",
                                                      }}
                                                    >
                                                      <button
                                                        className="assign-btn"
                                                        onClick={() => {
                                                          try {
                                                            localStorage.setItem(
                                                              "projectsFocusId",
                                                              revisionProjectDetailsMap[
                                                                r._id
                                                              ]._id
                                                            );
                                                            localStorage.setItem(
                                                              "projectId",
                                                              revisionProjectDetailsMap[
                                                                r._id
                                                              ]._id
                                                            );
                                                          } catch {}
                                                          window.location.href =
                                                            "/project-detail";
                                                        }}
                                                      >
                                                        View Full Project
                                                        Details
                                                      </button>
                                                      <button
                                                        className="link-btn"
                                                        onClick={() =>
                                                          handleViewVariationsTable(
                                                            revisionProjectDetailsMap[
                                                              r._id
                                                            ]._id
                                                          )
                                                        }
                                                      >
                                                        View Variations
                                                      </button>
                                                    </div>
                                                  </div>
                                                </td>
                                              </tr>
                                            )}
                                          {revisionProjectDetailsMap[r._id] &&
                                            expandedVariationRows[
                                              revisionProjectDetailsMap[r._id]
                                                ._id
                                            ] && (
                                              <tr
                                                key={`${r._id}-variations`}
                                                className="accordion-row"
                                              >
                                                <td
                                                  colSpan={7}
                                                  style={{
                                                    padding: "0",
                                                    borderTop: "none",
                                                  }}
                                                >
                                                  <div
                                                    className="accordion-content"
                                                    style={{
                                                      padding: "16px",
                                                      background: "var(--bg)",
                                                    }}
                                                  >
                                                    <h4
                                                      style={{
                                                        marginTop: "0",
                                                        marginBottom: "12px",
                                                        fontSize: "16px",
                                                        fontWeight: 600,
                                                      }}
                                                    >
                                                      Variations (
                                                      {
                                                        (
                                                          projectVariationsMap[
                                                            revisionProjectDetailsMap[
                                                              r._id
                                                            ]._id
                                                          ] || []
                                                        ).length
                                                      }
                                                      )
                                                    </h4>
                                                    {(
                                                      projectVariationsMap[
                                                        revisionProjectDetailsMap[
                                                          r._id
                                                        ]._id
                                                      ] || []
                                                    ).length === 0 ? (
                                                      <p
                                                        style={{
                                                          margin: 0,
                                                          color:
                                                            "var(--text-muted)",
                                                        }}
                                                      >
                                                        No variations found for
                                                        this project.
                                                      </p>
                                                    ) : (
                                                      <div className="table">
                                                        <table>
                                                          <thead>
                                                            <tr>
                                                              <th>
                                                                Variation #
                                                              </th>
                                                              <th>Offer Ref</th>
                                                              <th>Status</th>
                                                              <th>
                                                                Grand Total
                                                              </th>
                                                              <th>
                                                                Created By
                                                              </th>
                                                              <th>
                                                                Created At
                                                              </th>
                                                              <th>Actions</th>
                                                            </tr>
                                                          </thead>
                                                          <tbody>
                                                            {(
                                                              projectVariationsMap[
                                                                revisionProjectDetailsMap[
                                                                  r._id
                                                                ]._id
                                                              ] || []
                                                            )
                                                              .sort(
                                                                (a, b) =>
                                                                  (a.variationNumber ||
                                                                    0) -
                                                                  (b.variationNumber ||
                                                                    0)
                                                              )
                                                              .map((v) => (
                                                                <tr key={v._id}>
                                                                  <td data-label="Variation #">
                                                                    {v.variationNumber ||
                                                                      "N/A"}
                                                                  </td>
                                                                  <td data-label="Offer Ref">
                                                                    {v.offerReference ||
                                                                      "N/A"}
                                                                  </td>
                                                                  <td data-label="Status">
                                                                    <span
                                                                      className={`status-badge ${
                                                                        v
                                                                          .managementApproval
                                                                          ?.status ===
                                                                        "approved"
                                                                          ? "approved"
                                                                          : v
                                                                              .managementApproval
                                                                              ?.status ===
                                                                            "rejected"
                                                                          ? "rejected"
                                                                          : "blue"
                                                                      }`}
                                                                    >
                                                                      {v
                                                                        .managementApproval
                                                                        ?.status ||
                                                                        "draft"}
                                                                    </span>
                                                                  </td>
                                                                  <td data-label="Grand Total">
                                                                    {v
                                                                      .priceSchedule
                                                                      ?.currency ||
                                                                      "AED"}{" "}
                                                                    {Number(
                                                                      v
                                                                        .priceSchedule
                                                                        ?.grandTotal ||
                                                                        0
                                                                    ).toFixed(
                                                                      2
                                                                    )}
                                                                  </td>
                                                                  <td data-label="Created By">
                                                                    {v.createdBy
                                                                      ?._id ===
                                                                    currentUser?.id
                                                                      ? "You"
                                                                      : v
                                                                          .createdBy
                                                                          ?.name ||
                                                                        "N/A"}
                                                                    {v.createdBy
                                                                      ?._id !==
                                                                      currentUser?.id &&
                                                                      v.createdBy && (
                                                                        <button
                                                                          className="link-btn"
                                                                          onClick={() =>
                                                                            setProfileUser(
                                                                              v.createdBy
                                                                            )
                                                                          }
                                                                          style={{
                                                                            marginLeft: 6,
                                                                          }}
                                                                        >
                                                                          View
                                                                          Profile
                                                                        </button>
                                                                      )}
                                                                  </td>
                                                                  <td data-label="Created At">
                                                                    {v.createdAt
                                                                      ? new Date(
                                                                          v.createdAt
                                                                        ).toLocaleDateString()
                                                                      : "N/A"}
                                                                  </td>
                                                                  <td data-label="Actions">
                                                                    <button
                                                                      className="save-btn"
                                                                      onClick={() => {
                                                                        try {
                                                                          localStorage.setItem(
                                                                            "variationId",
                                                                            v._id
                                                                          );
                                                                        } catch {}
                                                                        window.location.href =
                                                                          "/variation-detail";
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
                                      )
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {filteredQuotations.length > 0 && (
        <div
          className="pagination-container"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "24px",
            padding: "16px",
            background: "var(--card)",
            borderRadius: "8px",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
              }}
            >
              Items per page:
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: "4px 8px",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                {viewMode === "card" ? (
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
            <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>
              Showing {startIndex + 1} to{" "}
              {Math.min(endIndex, filteredQuotations.length)} of{" "}
              {filteredQuotations.length}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: "6px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: currentPage === 1 ? "var(--bg)" : "var(--card)",
                color: currentPage === 1 ? "var(--text-muted)" : "var(--text)",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                fontSize: "14px",
                opacity: currentPage === 1 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <div style={{ display: "flex", gap: "4px" }}>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background:
                        currentPage === pageNum
                          ? "var(--primary)"
                          : "var(--card)",
                      color: currentPage === pageNum ? "white" : "var(--text)",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: currentPage === pageNum ? 600 : 400,
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              style={{
                padding: "6px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background:
                  currentPage === totalPages ? "var(--bg)" : "var(--card)",
                color:
                  currentPage === totalPages
                    ? "var(--text-muted)"
                    : "var(--text)",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                fontSize: "14px",
                opacity: currentPage === totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <CreateQuotationModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditing(null);
        }}
        source="quotations"
        onSave={handleSave}
        editing={editing}
        leads={leads}
      />

      {/* Legacy modal code - keeping for reference but disabled */}
      {false && showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? "Edit Quotation" : "Create Quotation"}</h2>
              <button onClick={() => setShowModal(false)} className="close-btn">
                ×
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
              }}
              className="lead-form"
              style={{ maxHeight: "70vh", overflow: "auto" }}
            >
              <div className="form-group">
                <label>Select Lead *</label>
                <select
                  value={form.lead}
                  onChange={(e) => setForm({ ...form, lead: e.target.value })}
                  required
                >
                  <option value="">-- Choose Lead --</option>
                  {leads.map((l) => (
                    <option value={l._id} key={l._id}>
                      {l.projectTitle || l.name} — {l.customerName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Cover & Basic Details</h3>
                </div>
                <div className="form-group">
                  <label>Submitted To (Client Company)</label>
                  <input
                    type="text"
                    value={form.submittedTo}
                    onChange={(e) =>
                      setForm({ ...form, submittedTo: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Attention (Contact Person)</label>
                  <input
                    type="text"
                    value={form.attention}
                    onChange={(e) =>
                      setForm({ ...form, attention: e.target.value })
                    }
                  />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Offer Reference</label>
                    <input
                      type="text"
                      value={form.offerReference}
                      onChange={(e) =>
                        setForm({ ...form, offerReference: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Enquiry Number</label>
                    <input
                      type="text"
                      value={form.enquiryNumber}
                      onChange={(e) =>
                        setForm({ ...form, enquiryNumber: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Offer Date</label>
                    <input
                      type="date"
                      value={form.offerDate}
                      onChange={(e) =>
                        setForm({ ...form, offerDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Enquiry Date</label>
                    <input
                      type="date"
                      value={form.enquiryDate}
                      onChange={(e) =>
                        setForm({ ...form, enquiryDate: e.target.value })
                      }
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
                  <input
                    type="text"
                    value={form.projectTitle}
                    onChange={(e) =>
                      setForm({ ...form, projectTitle: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Introduction</label>
                  <textarea
                    value={form.introductionText}
                    onChange={(e) =>
                      setForm({ ...form, introductionText: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Scope of Work</h3>
                </div>
                {form.scopeOfWork.map((s, i) => (
                  <div key={i} className="item-card">
                    <div className="item-header">
                      <span>Item {i + 1}</span>
                      <button
                        type="button"
                        className="cancel-btn"
                        onClick={() =>
                          setForm({
                            ...form,
                            scopeOfWork: form.scopeOfWork.filter(
                              (_, idx) => idx !== i
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 3 }}>
                        <label>Description</label>
                        <textarea
                          value={s.description}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              scopeOfWork: form.scopeOfWork.map((x, idx) =>
                                idx === i
                                  ? { ...x, description: e.target.value }
                                  : x
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Qty</label>
                        <input
                          type="number"
                          value={s.quantity}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              scopeOfWork: form.scopeOfWork.map((x, idx) =>
                                idx === i
                                  ? { ...x, quantity: e.target.value }
                                  : x
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Unit</label>
                        <input
                          type="text"
                          value={s.unit}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              scopeOfWork: form.scopeOfWork.map((x, idx) =>
                                idx === i ? { ...x, unit: e.target.value } : x
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="form-group" style={{ flex: 2 }}>
                        <label>Location/Remarks</label>
                        <input
                          type="text"
                          value={s.locationRemarks}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              scopeOfWork: form.scopeOfWork.map((x, idx) =>
                                idx === i
                                  ? { ...x, locationRemarks: e.target.value }
                                  : x
                              ),
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="section-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                      setForm({
                        ...form,
                        scopeOfWork: [
                          ...form.scopeOfWork,
                          {
                            description: "",
                            quantity: "",
                            unit: "",
                            locationRemarks: "",
                          },
                        ],
                      })
                    }
                  >
                    + Add Scope Item
                  </button>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Price Schedule</h3>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Currency</label>
                    <input
                      type="text"
                      value={form.priceSchedule.currency}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          priceSchedule: {
                            ...form.priceSchedule,
                            currency: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>VAT %</label>
                    <input
                      type="number"
                      value={form.priceSchedule.taxDetails.vatRate}
                      onChange={(e) => {
                        const totals = recalcTotals(
                          form.priceSchedule.items,
                          e.target.value
                        );
                        setForm({
                          ...form,
                          priceSchedule: {
                            ...form.priceSchedule,
                            subTotal: totals.subTotal,
                            grandTotal: totals.grandTotal,
                            taxDetails: {
                              ...form.priceSchedule.taxDetails,
                              vatRate: e.target.value,
                              vatAmount: totals.vatAmount,
                            },
                          },
                        });
                      }}
                    />
                  </div>
                </div>
                {form.priceSchedule.items.map((it, i) => (
                  <div key={i} className="item-card">
                    <div className="item-header">
                      <span>Item {i + 1}</span>
                      <button
                        type="button"
                        className="cancel-btn"
                        onClick={() => {
                          const items = form.priceSchedule.items.filter(
                            (_, idx) => idx !== i
                          );
                          const totals = recalcTotals(
                            items,
                            form.priceSchedule.taxDetails.vatRate
                          );
                          setForm({
                            ...form,
                            priceSchedule: {
                              ...form.priceSchedule,
                              items,
                              subTotal: totals.subTotal,
                              grandTotal: totals.grandTotal,
                              taxDetails: {
                                ...form.priceSchedule.taxDetails,
                                vatAmount: totals.vatAmount,
                              },
                            },
                          });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 3 }}>
                        <label>Description</label>
                        <input
                          type="text"
                          value={it.description}
                          onChange={(e) =>
                            onChangeItem(i, "description", e.target.value)
                          }
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Qty</label>
                        <input
                          type="number"
                          value={it.quantity}
                          onChange={(e) =>
                            onChangeItem(i, "quantity", e.target.value)
                          }
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Unit</label>
                        <input
                          type="text"
                          value={it.unit}
                          onChange={(e) =>
                            onChangeItem(i, "unit", e.target.value)
                          }
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Unit Rate</label>
                        <input
                          type="number"
                          value={it.unitRate}
                          onChange={(e) =>
                            onChangeItem(i, "unitRate", e.target.value)
                          }
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Amount</label>
                        <input
                          type="number"
                          value={Number(it.totalAmount || 0)}
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="section-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                      setForm({
                        ...form,
                        priceSchedule: {
                          ...form.priceSchedule,
                          items: [
                            ...form.priceSchedule.items,
                            {
                              description: "",
                              quantity: 0,
                              unit: "",
                              unitRate: 0,
                              totalAmount: 0,
                            },
                          ],
                        },
                      })
                    }
                  >
                    + Add Item
                  </button>
                </div>

                <div className="totals-card">
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Sub Total</label>
                      <input
                        type="number"
                        readOnly
                        value={Number(form.priceSchedule.subTotal || 0)}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>VAT Amount</label>
                      <input
                        type="number"
                        readOnly
                        value={Number(
                          form.priceSchedule.taxDetails.vatAmount || 0
                        )}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Grand Total</label>
                      <input
                        type="number"
                        readOnly
                        value={Number(form.priceSchedule.grandTotal || 0)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Our Viewpoints / Special Terms</h3>
                </div>
                <div className="form-group">
                  <label>Our Viewpoints / Special Terms</label>
                  <textarea
                    value={form.ourViewpoints}
                    onChange={(e) =>
                      setForm({ ...form, ourViewpoints: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Exclusions</h3>
                </div>
                {form.exclusions.map((ex, i) => (
                  <div key={i} className="item-card">
                    <div className="item-header">
                      <span>Item {i + 1}</span>
                      <button
                        type="button"
                        className="cancel-btn"
                        onClick={() =>
                          setForm({
                            ...form,
                            exclusions: form.exclusions.filter(
                              (_, idx) => idx !== i
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={ex}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              exclusions: form.exclusions.map((x, idx) =>
                                idx === i ? e.target.value : x
                              ),
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="section-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                      setForm({ ...form, exclusions: [...form.exclusions, ""] })
                    }
                  >
                    + Add Exclusion
                  </button>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Payment Terms</h3>
                </div>
                {form.paymentTerms.map((p, i) => (
                  <div key={i} className="item-card">
                    <div className="item-header">
                      <span>Term {i + 1}</span>
                      <button
                        type="button"
                        className="cancel-btn"
                        onClick={() =>
                          setForm({
                            ...form,
                            paymentTerms: form.paymentTerms.filter(
                              (_, idx) => idx !== i
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 3 }}>
                        <label>Milestone</label>
                        <input
                          type="text"
                          value={p.milestoneDescription}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              paymentTerms: form.paymentTerms.map((x, idx) =>
                                idx === i
                                  ? {
                                      ...x,
                                      milestoneDescription: e.target.value,
                                    }
                                  : x
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Amount %</label>
                        <input
                          type="number"
                          value={p.amountPercent}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              paymentTerms: form.paymentTerms.map((x, idx) =>
                                idx === i
                                  ? { ...x, amountPercent: e.target.value }
                                  : x
                              ),
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="section-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                      setForm({
                        ...form,
                        paymentTerms: [
                          ...form.paymentTerms,
                          { milestoneDescription: "", amountPercent: "" },
                        ],
                      })
                    }
                  >
                    + Add Payment Term
                  </button>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Delivery, Completion, Warranty & Validity</h3>
                </div>
                <div className="form-group">
                  <label>Delivery / Completion Timeline</label>
                  <input
                    type="text"
                    value={
                      form.deliveryCompletionWarrantyValidity.deliveryTimeline
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        deliveryCompletionWarrantyValidity: {
                          ...form.deliveryCompletionWarrantyValidity,
                          deliveryTimeline: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Warranty Period</label>
                    <input
                      type="text"
                      value={
                        form.deliveryCompletionWarrantyValidity.warrantyPeriod
                      }
                      onChange={(e) =>
                        setForm({
                          ...form,
                          deliveryCompletionWarrantyValidity: {
                            ...form.deliveryCompletionWarrantyValidity,
                            warrantyPeriod: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Offer Validity (Days)</label>
                    <input
                      type="number"
                      value={
                        form.deliveryCompletionWarrantyValidity.offerValidity
                      }
                      onChange={(e) =>
                        setForm({
                          ...form,
                          deliveryCompletionWarrantyValidity: {
                            ...form.deliveryCompletionWarrantyValidity,
                            offerValidity: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Authorized Signatory</label>
                  <input
                    type="text"
                    value={
                      form.deliveryCompletionWarrantyValidity
                        .authorizedSignatory
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        deliveryCompletionWarrantyValidity: {
                          ...form.deliveryCompletionWarrantyValidity,
                          authorizedSignatory: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="cancel-btn"
                >
                  Cancel
                </button>
                <button type="submit" className="save-btn">
                  {editing ? "Save Changes" : "Create Quotation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sendApprovalConfirmModal.open && (
        <div
          className="modal-overlay"
          onClick={() =>
            setSendApprovalConfirmModal({ open: false, quote: null })
          }
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Send for Approval</h2>
              <button
                onClick={() =>
                  setSendApprovalConfirmModal({ open: false, quote: null })
                }
                className="close-btn"
              >
                ×
              </button>
            </div>
            <div className="lead-form">
              <p>Are you sure you want to send this quotation for approval?</p>
              <div className="form-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() =>
                    setSendApprovalConfirmModal({ open: false, quote: null })
                  }
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="save-btn"
                  onClick={() => {
                    if (sendApprovalConfirmModal.quote) {
                      sendForApproval(sendApprovalConfirmModal.quote);
                    }
                  }}
                  disabled={
                    isSubmitting &&
                    loadingAction ===
                      `send-approval-${sendApprovalConfirmModal.quote?._id}`
                  }
                >
                  {isSubmitting &&
                  loadingAction ===
                    `send-approval-${sendApprovalConfirmModal.quote?._id}`
                    ? "Sending..."
                    : "Confirm & Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {approvalModal.open && (
        <div
          className="modal-overlay"
          onClick={() =>
            setApprovalModal({
              open: false,
              quote: null,
              action: null,
              note: "",
            })
          }
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {approvalModal.action === "approved"
                  ? "Approve Quotation"
                  : "Reject Quotation"}
              </h2>
              <button
                onClick={() =>
                  setApprovalModal({
                    open: false,
                    quote: null,
                    action: null,
                    note: "",
                  })
                }
                className="close-btn"
              >
                ×
              </button>
            </div>
            <div className="lead-form">
              <div className="form-group">
                <label>Note</label>
                <textarea
                  value={approvalModal.note}
                  onChange={(e) =>
                    setApprovalModal({ ...approvalModal, note: e.target.value })
                  }
                />
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() =>
                    setApprovalModal({
                      open: false,
                      quote: null,
                      action: null,
                      note: "",
                    })
                  }
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="save-btn"
                  onClick={async () => {
                    if (!approvalModal.quote || !approvalModal.action) return;
                    await approveQuotation(
                      approvalModal.quote,
                      approvalModal.action,
                      approvalModal.note
                    );
                    setApprovalModal({
                      open: false,
                      quote: null,
                      action: null,
                      note: "",
                    });
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModal.open && deleteModal.quote && (
        <div
          className="modal-overlay"
          onClick={() => setDeleteModal({ open: false, quote: null })}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Quotation</h2>
              <button
                onClick={() => setDeleteModal({ open: false, quote: null })}
                className="close-btn"
              >
                ×
              </button>
            </div>
            <div className="lead-form">
              <p>
                Are you sure you want to delete this quotation? This action
                cannot be undone.
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setDeleteModal({ open: false, quote: null })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="reject-btn"
                  onClick={() => handleDeleteQuotation(deleteModal.quote)}
                  disabled={
                    isSubmitting &&
                    loadingAction === `delete-${deleteModal.quote._id}`
                  }
                >
                  <ButtonLoader
                    loading={
                      loadingAction === `delete-${deleteModal.quote._id}`
                    }
                  >
                    {isSubmitting &&
                    loadingAction === `delete-${deleteModal.quote._id}`
                      ? "Deleting..."
                      : "Delete"}
                  </ButtonLoader>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {revisionModal.open && (
        <div
          className="modal-overlay"
          onClick={() =>
            setRevisionModal({ open: false, quote: null, form: null })
          }
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Revision</h2>
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                {revisionModal.form && revisionModal.quote?._id && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          localStorage.setItem("revisionCreateMode", "true");
                          localStorage.setItem(
                            "revisionSourceQuotationId",
                            revisionModal.quote._id
                          );
                          localStorage.setItem(
                            "revisionFormData",
                            JSON.stringify(revisionModal.form)
                          );
                          window.open("/revision-detail", "_blank");
                        } catch {}
                      }}
                      className="link-btn"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "14px",
                        padding: "6px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        background: "transparent",
                        color: "var(--text)",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      title="Open in New Tab"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
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
                          localStorage.setItem("revisionCreateMode", "true");
                          localStorage.setItem(
                            "revisionSourceQuotationId",
                            revisionModal.quote._id
                          );
                          localStorage.setItem(
                            "revisionFormData",
                            JSON.stringify(revisionModal.form)
                          );
                          window.location.href = "/revision-detail";
                        } catch {}
                      }}
                      className="link-btn"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "14px",
                        padding: "6px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        background: "transparent",
                        color: "var(--text)",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      title="Open Full Form"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="2"
                          ry="2"
                        ></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                      </svg>
                      Open Full Form
                    </button>
                  </>
                )}
                <button
                  onClick={() =>
                    setRevisionModal({ open: false, quote: null, form: null })
                  }
                  className="close-btn"
                >
                  ×
                </button>
              </div>
            </div>
            {revisionModal.form && (
              <div
                className="lead-form"
                style={{ maxHeight: "70vh", overflow: "auto" }}
              >
                <div className="form-section">
                  <div className="section-header">
                    <h3>Cover & Basic Details</h3>
                  </div>
                  <div className="form-group">
                    <label>Submitted To (Client Company)</label>
                    <input
                      type="text"
                      value={revisionModal.form.submittedTo}
                      onChange={(e) =>
                        setRevisionModal({
                          ...revisionModal,
                          form: {
                            ...revisionModal.form,
                            submittedTo: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Attention (Contact Person)</label>
                    <input
                      type="text"
                      value={revisionModal.form.attention}
                      onChange={(e) =>
                        setRevisionModal({
                          ...revisionModal,
                          form: {
                            ...revisionModal.form,
                            attention: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Offer Reference</label>
                      <input
                        type="text"
                        value={revisionModal.form.offerReference}
                        onChange={(e) =>
                          setRevisionModal({
                            ...revisionModal,
                            form: {
                              ...revisionModal.form,
                              offerReference: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Enquiry Number</label>
                      <input
                        type="text"
                        value={revisionModal.form.enquiryNumber}
                        onChange={(e) =>
                          setRevisionModal({
                            ...revisionModal,
                            form: {
                              ...revisionModal.form,
                              enquiryNumber: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Offer Date</label>
                      <input
                        type="date"
                        value={revisionModal.form.offerDate}
                        onChange={(e) =>
                          setRevisionModal({
                            ...revisionModal,
                            form: {
                              ...revisionModal.form,
                              offerDate: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Enquiry Date</label>
                      <input
                        type="date"
                        value={revisionModal.form.enquiryDate}
                        onChange={(e) =>
                          setRevisionModal({
                            ...revisionModal,
                            form: {
                              ...revisionModal.form,
                              enquiryDate: e.target.value,
                            },
                          })
                        }
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
                    <input
                      type="text"
                      value={revisionModal.form.projectTitle}
                      onChange={(e) =>
                        setRevisionModal({
                          ...revisionModal,
                          form: {
                            ...revisionModal.form,
                            projectTitle: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Introduction</label>
                    <textarea
                      value={revisionModal.form.introductionText}
                      onChange={(e) =>
                        setRevisionModal({
                          ...revisionModal,
                          form: {
                            ...revisionModal.form,
                            introductionText: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Scope of Work</h3>
                  </div>
                  <div className="form-group">
                    <ScopeOfWorkEditor
                      value={
                        typeof revisionModal.form.scopeOfWork === "string"
                          ? revisionModal.form.scopeOfWork
                          : Array.isArray(revisionModal.form.scopeOfWork)
                          ? revisionModal.form.scopeOfWork
                              .map((item) => item.description || "")
                              .join("<br>")
                          : ""
                      }
                      onChange={(value) =>
                        setRevisionModal({
                          ...revisionModal,
                          form: { ...revisionModal.form, scopeOfWork: value },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Price Schedule</h3>
                  </div>
                  <div className="form-group">
                    <ScopeOfWorkEditor
                      value={
                        typeof revisionModal.form.priceSchedule === "string"
                          ? revisionModal.form.priceSchedule
                          : revisionModal.form.priceSchedule?.items?.length
                          ? revisionModal.form.priceSchedule.items
                              .map(
                                (item) =>
                                  `${item.description || ""}${
                                    item.quantity
                                      ? ` - Qty: ${item.quantity}`
                                      : ""
                                  }${item.unit ? ` ${item.unit}` : ""}${
                                    item.unitRate ? ` @ ${item.unitRate}` : ""
                                  }${
                                    item.totalAmount
                                      ? ` = ${item.totalAmount}`
                                      : ""
                                  }`
                              )
                              .join("<br>")
                          : ""
                      }
                      onChange={(html) => {
                        // Normalize HTML to check if content actually changed
                        const normalizeHtml = (h) => {
                          if (!h) return "";
                          const temp = document.createElement("div");
                          temp.innerHTML = h;
                          let text = temp.textContent || temp.innerText || "";
                          text = text.replace(/\s+/g, " ").trim();
                          return text;
                        };
                        const originalNormalized = normalizeHtml(
                          originalRevisionForm?.priceSchedule || ""
                        );
                        const newNormalized = normalizeHtml(html);
                        // Only update if content actually changed (user edited the field)
                        if (originalNormalized !== newNormalized) {
                          priceScheduleEditedRef.current = true;
                          setRevisionModal({
                            ...revisionModal,
                            form: {
                              ...revisionModal.form,
                              priceSchedule: html,
                            },
                          });
                        } else {
                          // Content is same but HTML structure might have changed - restore original to prevent normalization issues
                          const originalValue =
                            originalRevisionForm?.priceSchedule || "";
                          if (html !== originalValue) {
                            // HTML structure changed but content is same - restore original
                            setRevisionModal({
                              ...revisionModal,
                              form: {
                                ...revisionModal.form,
                                priceSchedule: originalValue,
                              },
                            });
                          }
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Our Viewpoints / Special Terms</h3>
                  </div>
                  <div className="form-group">
                    <label>Our Viewpoints / Special Terms</label>
                    <textarea
                      value={revisionModal.form.ourViewpoints}
                      onChange={(e) =>
                        setRevisionModal({
                          ...revisionModal,
                          form: {
                            ...revisionModal.form,
                            ourViewpoints: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Exclusions</h3>
                  </div>
                  <div className="form-group">
                    <ScopeOfWorkEditor
                      value={
                        typeof revisionModal.form.exclusions === "string"
                          ? revisionModal.form.exclusions
                          : Array.isArray(revisionModal.form.exclusions)
                          ? revisionModal.form.exclusions.join("<br>")
                          : ""
                      }
                      onChange={(html) =>
                        setRevisionModal({
                          ...revisionModal,
                          form: { ...revisionModal.form, exclusions: html },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Payment Terms</h3>
                  </div>
                  <div className="form-group">
                    <ScopeOfWorkEditor
                      value={
                        typeof revisionModal.form.paymentTerms === "string"
                          ? revisionModal.form.paymentTerms
                          : Array.isArray(revisionModal.form.paymentTerms)
                          ? revisionModal.form.paymentTerms
                              .map(
                                (term) =>
                                  `${term.milestoneDescription || ""}${
                                    term.amountPercent
                                      ? ` - ${term.amountPercent}%`
                                      : ""
                                  }`
                              )
                              .join("<br>")
                          : ""
                      }
                      onChange={(html) =>
                        setRevisionModal({
                          ...revisionModal,
                          form: { ...revisionModal.form, paymentTerms: html },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-header">
                    <h3>Delivery, Completion, Warranty & Validity</h3>
                  </div>
                  <div className="form-group">
                    <label>Delivery / Completion Timeline</label>
                    <input
                      type="text"
                      value={
                        revisionModal.form.deliveryCompletionWarrantyValidity
                          .deliveryTimeline
                      }
                      onChange={(e) =>
                        setRevisionModal({
                          ...revisionModal,
                          form: {
                            ...revisionModal.form,
                            deliveryCompletionWarrantyValidity: {
                              ...revisionModal.form
                                .deliveryCompletionWarrantyValidity,
                              deliveryTimeline: e.target.value,
                            },
                          },
                        })
                      }
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Warranty Period</label>
                      <input
                        type="text"
                        value={
                          revisionModal.form.deliveryCompletionWarrantyValidity
                            .warrantyPeriod
                        }
                        onChange={(e) =>
                          setRevisionModal({
                            ...revisionModal,
                            form: {
                              ...revisionModal.form,
                              deliveryCompletionWarrantyValidity: {
                                ...revisionModal.form
                                  .deliveryCompletionWarrantyValidity,
                                warrantyPeriod: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Offer Validity (Days)</label>
                      <input
                        type="number"
                        value={
                          revisionModal.form.deliveryCompletionWarrantyValidity
                            .offerValidity
                        }
                        onChange={(e) =>
                          setRevisionModal({
                            ...revisionModal,
                            form: {
                              ...revisionModal.form,
                              deliveryCompletionWarrantyValidity: {
                                ...revisionModal.form
                                  .deliveryCompletionWarrantyValidity,
                                offerValidity: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Authorized Signatory</label>
                    <input
                      type="text"
                      value={
                        revisionModal.form.deliveryCompletionWarrantyValidity
                          .authorizedSignatory
                      }
                      onChange={(e) =>
                        setRevisionModal({
                          ...revisionModal,
                          form: {
                            ...revisionModal.form,
                            deliveryCompletionWarrantyValidity: {
                              ...revisionModal.form
                                .deliveryCompletionWarrantyValidity,
                              authorizedSignatory: e.target.value,
                            },
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() =>
                      setRevisionModal({ open: false, quote: null, form: null })
                    }
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="save-btn"
                    disabled={
                      !hasRevisionChanges(
                        revisionModal.quote,
                        revisionModal.form
                      )
                    }
                    onClick={() => createRevision(revisionModal.quote)}
                  >
                    Confirm Revision
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {approvalsView && (
        <div
          className="modal-overlay history"
          onClick={() => setApprovalsView(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Approvals & Rejections</h2>
              <button
                onClick={() => setApprovalsView(null)}
                className="close-btn"
              >
                ×
              </button>
            </div>
            <div
              className="lead-form"
              style={{ maxHeight: "65vh", overflow: "auto" }}
            >
              {(() => {
                const q = approvalsView;
                const rawLogs = Array.isArray(q.managementApproval?.logs)
                  ? q.managementApproval.logs
                      .slice()
                      .sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0))
                  : [];
                const cycles = [];
                let current = null;
                for (const entry of rawLogs) {
                  if (entry.status === "pending") {
                    if (current) cycles.push(current);
                    current = {
                      requestedAt: entry.at,
                      requestedBy: entry.requestedBy,
                      requestNote: entry.note,
                      decidedAt: null,
                      decidedBy: null,
                      decisionNote: null,
                      decisionStatus: "pending",
                    };
                  } else if (
                    entry.status === "approved" ||
                    entry.status === "rejected"
                  ) {
                    if (!current) {
                      current = {
                        requestedAt: null,
                        requestedBy: null,
                        requestNote: null,
                        decidedAt: null,
                        decidedBy: null,
                        decisionNote: null,
                        decisionStatus: null,
                      };
                    }
                    if (!current.decidedAt) {
                      current.decidedAt = entry.at;
                      current.decidedBy = entry.decidedBy;
                      current.decisionNote = entry.note;
                      current.decisionStatus = entry.status;
                      cycles.push(current);
                      current = null;
                    } else {
                      cycles.push({
                        requestedAt: null,
                        requestedBy: null,
                        requestNote: null,
                        decidedAt: entry.at,
                        decidedBy: entry.decidedBy,
                        decisionNote: entry.note,
                        decisionStatus: entry.status,
                      });
                    }
                  }
                }
                if (current) cycles.push(current);

                // Fallback for legacy records without logs
                if (
                  cycles.length === 0 &&
                  (q.managementApproval?.requestedBy ||
                    q.managementApproval?.approvedBy)
                ) {
                  cycles.push({
                    requestedAt: q.updatedAt || q.createdAt,
                    requestedBy: q.managementApproval?.requestedBy,
                    requestNote: q.managementApproval?.comments,
                    decidedAt: q.managementApproval?.approvedAt,
                    decidedBy: q.managementApproval?.approvedBy,
                    decisionNote: q.managementApproval?.comments,
                    decisionStatus: q.managementApproval?.status,
                  });
                }

                if (cycles.length === 0) return <p>No approval records.</p>;

                return (
                  <div>
                    {cycles.map((c, idx) => (
                      <div
                        key={idx}
                        className="edit-item"
                        style={{ marginTop: idx === 0 ? 0 : 12 }}
                      >
                        <div className="edit-header">
                          <span>
                            Approval Cycle {idx + 1} —{" "}
                            {c.decisionStatus
                              ? c.decisionStatus.toUpperCase()
                              : "PENDING"}
                          </span>
                        </div>
                        <div style={{ whiteSpace: "pre-wrap" }}>
                          <div>
                            <strong>Requested:</strong>{" "}
                            {c.requestedAt
                              ? new Date(c.requestedAt).toLocaleString()
                              : "—"}{" "}
                            {c.requestedBy?.name && (
                              <>
                                by{" "}
                                {c.requestedBy?._id === currentUser?.id
                                  ? "YOU"
                                  : c.requestedBy.name}
                                {c.requestedBy?._id &&
                                  c.requestedBy._id !== currentUser?.id && (
                                    <button
                                      className="link-btn"
                                      onClick={() =>
                                        setProfileUser(c.requestedBy)
                                      }
                                      style={{ marginLeft: 6 }}
                                    >
                                      View Profile
                                    </button>
                                  )}
                              </>
                            )}
                          </div>
                          {c.requestNote && (
                            <div>
                              <strong>Request note:</strong> {c.requestNote}
                            </div>
                          )}
                          <div style={{ marginTop: 6 }}>
                            <strong>Decision:</strong>{" "}
                            {c.decidedAt
                              ? new Date(c.decidedAt).toLocaleString()
                              : "—"}{" "}
                            {c.decidedBy?.name && (
                              <>
                                by{" "}
                                {c.decidedBy?._id === currentUser?.id
                                  ? "YOU"
                                  : c.decidedBy.name}
                                {c.decidedBy?._id &&
                                  c.decidedBy._id !== currentUser?.id && (
                                    <button
                                      className="link-btn"
                                      onClick={() =>
                                        setProfileUser(c.decidedBy)
                                      }
                                      style={{ marginLeft: 6 }}
                                    >
                                      View Profile
                                    </button>
                                  )}
                              </>
                            )}{" "}
                            {c.decisionStatus && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  textTransform: "uppercase",
                                }}
                              >
                                ({c.decisionStatus})
                              </span>
                            )}
                          </div>
                          {c.decisionNote && (
                            <div>
                              <strong>Decision note:</strong> {c.decisionNote}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {createProjectModal.open && createProjectModal.quotation && (
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
              background: var(--text-secondary);
            }
          `}</style>
          <div
            className="modal-overlay"
            onClick={() =>
              setCreateProjectModal({
                open: false,
                quotation: null,
                form: {
                  name: "",
                  locationDetails: "",
                  workingHours: "",
                  manpowerCount: "",
                  assignedProjectEngineerIds: [],
                },
                engineers: [],
                ack: false,
                selectedFiles: [],
                previewFiles: [],
              })
            }
          >
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create Project</h2>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        createProjectModal.quotation &&
                        createProjectModal.quotation._id
                      ) {
                        window.open(
                          `/quotations/${createProjectModal.quotation._id}/create-project`,
                          "_blank"
                        );
                      }
                    }}
                    className="link-btn"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "14px",
                      padding: "6px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background: "transparent",
                      color: "var(--text)",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    title="Open in New Tab"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    Open in New Tab
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        createProjectModal.quotation &&
                        createProjectModal.quotation._id
                      ) {
                        window.location.href = `/quotations/${createProjectModal.quotation._id}/create-project`;
                      }
                    }}
                    className="link-btn"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "14px",
                      padding: "6px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background: "transparent",
                      color: "var(--text)",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    title="Open Full Form"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                      ></rect>
                      <line x1="9" y1="3" x2="9" y2="21"></line>
                    </svg>
                    Open Full Form
                  </button>
                  <button
                    onClick={() =>
                      setCreateProjectModal({
                        open: false,
                        quotation: null,
                        form: {
                          name: "",
                          locationDetails: "",
                          workingHours: "",
                          manpowerCount: "",
                          assignedProjectEngineerIds: [],
                        },
                        engineers: [],
                        ack: false,
                        selectedFiles: [],
                        previewFiles: [],
                      })
                    }
                    className="close-btn"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="lead-form">
                {currentUser?.roles?.includes("estimation_engineer") && (
                  <div
                    className="edit-item"
                    style={{
                      background: "#FEF3C7",
                      border: "1px solid #F59E0B",
                      padding: 14,
                      marginBottom: 14,
                      color: "#7C2D12",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          fontSize: 20,
                          lineHeight: "20px",
                          marginTop: 2,
                        }}
                      >
                        ⚠️
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>
                          Warning
                        </div>
                        <div style={{ lineHeight: 1.4 }}>
                          This action cannot be undone. Only managers can delete
                          projects once created.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label>Project Name</label>
                  <input
                    type="text"
                    value={createProjectModal.form?.name || ""}
                    onChange={(e) =>
                      setCreateProjectModal({
                        ...createProjectModal,
                        form: {
                          ...createProjectModal.form,
                          name: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Location Details</label>
                  <input
                    type="text"
                    value={createProjectModal.form.locationDetails}
                    onChange={(e) =>
                      setCreateProjectModal({
                        ...createProjectModal,
                        form: {
                          ...createProjectModal.form,
                          locationDetails: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Working Hours</label>
                    <input
                      type="text"
                      value={createProjectModal.form.workingHours}
                      onChange={(e) =>
                        setCreateProjectModal({
                          ...createProjectModal,
                          form: {
                            ...createProjectModal.form,
                            workingHours: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Manpower Count</label>
                    <input
                      type="number"
                      value={
                        createProjectModal.form.manpowerCount === null ||
                        createProjectModal.form.manpowerCount === undefined ||
                        createProjectModal.form.manpowerCount === ""
                          ? ""
                          : createProjectModal.form.manpowerCount
                      }
                      onChange={(e) => {
                        const inputVal = e.target.value;
                        // Allow empty string, otherwise convert to number
                        const val =
                          inputVal === ""
                            ? ""
                            : isNaN(Number(inputVal))
                            ? createProjectModal.form.manpowerCount
                            : Number(inputVal);
                        setCreateProjectModal({
                          ...createProjectModal,
                          form: {
                            ...createProjectModal.form,
                            manpowerCount: val,
                          },
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Assign Project Engineers</label>
                  <div
                    className="engineers-scroll-container"
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "8px",
                      maxHeight: "180px",
                      minHeight: "80px",
                      overflowY: "auto",
                      overflowX: "hidden",
                      background: "var(--bg)",
                      position: "relative",
                      scrollBehavior: "smooth",
                      WebkitOverflowScrolling: "touch",
                    }}
                  >
                    {Array.isArray(createProjectModal.engineers) &&
                    createProjectModal.engineers.length > 0 ? (
                      createProjectModal.engineers.map((u, index) => {
                        const isSelected =
                          Array.isArray(
                            createProjectModal.form.assignedProjectEngineerIds
                          ) &&
                          createProjectModal.form.assignedProjectEngineerIds.includes(
                            u._id
                          );
                        const isLast =
                          index === createProjectModal.engineers.length - 1;
                        return (
                          <div
                            key={u._id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "10px 8px",
                              borderBottom: isLast
                                ? "none"
                                : "1px solid var(--border)",
                              minHeight: "40px",
                            }}
                          >
                            <input
                              type="checkbox"
                              id={`engineer-${u._id}`}
                              checked={isSelected}
                              onChange={(e) => {
                                const currentIds = Array.isArray(
                                  createProjectModal.form
                                    .assignedProjectEngineerIds
                                )
                                  ? createProjectModal.form
                                      .assignedProjectEngineerIds
                                  : [];
                                const newIds = e.target.checked
                                  ? [...currentIds, u._id]
                                  : currentIds.filter((id) => id !== u._id);
                                setCreateProjectModal({
                                  ...createProjectModal,
                                  form: {
                                    ...createProjectModal.form,
                                    assignedProjectEngineerIds: newIds,
                                  },
                                });
                              }}
                              style={{
                                cursor: "pointer",
                                width: "18px",
                                height: "18px",
                                flexShrink: 0,
                                margin: 0,
                              }}
                            />
                            <label
                              htmlFor={`engineer-${u._id}`}
                              style={{
                                flex: 1,
                                cursor: "pointer",
                                color: "var(--text)",
                                margin: 0,
                                fontSize: "14px",
                                lineHeight: "1.5",
                                display: "flex",
                                alignItems: "center",
                                minHeight: "18px",
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
                                  fontSize: "12px",
                                  padding: "6px 12px",
                                  flexShrink: 0,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                View Profile
                              </button>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p
                        style={{
                          color: "var(--text-secondary)",
                          margin: 0,
                          padding: "12px 8px",
                          fontSize: "14px",
                        }}
                      >
                        No project engineers available
                      </p>
                    )}
                  </div>
                  {Array.isArray(
                    createProjectModal.form.assignedProjectEngineerIds
                  ) &&
                    createProjectModal.form.assignedProjectEngineerIds.length >
                      0 && (
                      <p
                        style={{
                          marginTop: "8px",
                          fontSize: "13px",
                          color: "var(--text-secondary)",
                          marginBottom: 0,
                        }}
                      >
                        {
                          createProjectModal.form.assignedProjectEngineerIds
                            .length
                        }{" "}
                        engineer(s) selected
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
                  <small
                    style={{
                      display: "block",
                      marginTop: "5px",
                      color: "var(--text-secondary)",
                      fontSize: "12px",
                    }}
                  >
                    Accepted: Images (JPEG, PNG, GIF, WebP), Documents (PDF,
                    DOC, DOCX, XLS, XLSX), Videos (MP4, MOV, AVI, WMV, WebM,
                    etc.). Max 10MB per file.
                  </small>

                  {/* Display selected files */}
                  {createProjectModal.previewFiles &&
                    createProjectModal.previewFiles.length > 0 && (
                      <div
                        style={{
                          marginTop: "15px",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "10px",
                        }}
                      >
                        {createProjectModal.previewFiles.map(
                          (preview, index) => (
                            <div
                              key={index}
                              style={{
                                position: "relative",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                padding: "8px",
                                background: "var(--bg)",
                                maxWidth: "200px",
                              }}
                            >
                              {preview.type === "image" && preview.preview && (
                                <img
                                  src={preview.preview}
                                  alt={preview.file.name}
                                  style={{
                                    width: "100%",
                                    height: "auto",
                                    borderRadius: "4px",
                                    marginBottom: "8px",
                                  }}
                                />
                              )}
                              {preview.type === "video" && preview.preview && (
                                <video
                                  src={preview.preview}
                                  style={{
                                    width: "100%",
                                    height: "auto",
                                    borderRadius: "4px",
                                    marginBottom: "8px",
                                  }}
                                  controls
                                />
                              )}
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "var(--text)",
                                  wordBreak: "break-word",
                                }}
                              >
                                {preview.file.name}
                              </div>
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "var(--text-secondary)",
                                  marginTop: "4px",
                                }}
                              >
                                {formatFileSize(preview.file.size)}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeProjectFile(index)}
                                style={{
                                  position: "absolute",
                                  top: "4px",
                                  right: "4px",
                                  background: "rgba(0, 0, 0, 0.6)",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "50%",
                                  width: "24px",
                                  height: "24px",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "16px",
                                  lineHeight: "1",
                                }}
                              >
                                ×
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    )}
                </div>
                {currentUser?.roles?.includes("estimation_engineer") && (
                  <div className="form-group">
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "flex-start",
                        padding: "14px 16px",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        background: "var(--bg)",
                      }}
                    >
                      <input
                        id="ack-project-create"
                        type="checkbox"
                        checked={createProjectModal.ack}
                        onChange={(e) =>
                          setCreateProjectModal({
                            ...createProjectModal,
                            ack: e.target.checked,
                          })
                        }
                        style={{
                          marginTop: "2px",
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      />
                      <label
                        htmlFor="ack-project-create"
                        style={{
                          color: "var(--text)",
                          cursor: "pointer",
                          margin: 0,
                          fontSize: "14px",
                          lineHeight: "1.5",
                          flex: 1,
                        }}
                      >
                        I understand this action cannot be undone and requires
                        management involvement to reverse.
                      </label>
                    </div>
                  </div>
                )}
                <div className="form-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() =>
                      setCreateProjectModal({
                        open: false,
                        quotation: null,
                        form: {
                          name: "",
                          locationDetails: "",
                          workingHours: "",
                          manpowerCount: "",
                          assignedProjectEngineerIds: [],
                        },
                        engineers: [],
                        ack: false,
                        selectedFiles: [],
                        previewFiles: [],
                      })
                    }
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="save-btn"
                    disabled={
                      (currentUser?.roles?.includes("estimation_engineer") &&
                        !createProjectModal.ack) ||
                      isSubmitting
                    }
                    onClick={async () => {
                      if (isSubmitting) return;
                      setLoadingAction("create-project");
                      setIsSubmitting(true);
                      try {
                        const formDataToSend = new FormData();

                        // Append form fields
                        formDataToSend.append(
                          "name",
                          createProjectModal.form.name || ""
                        );
                        formDataToSend.append(
                          "locationDetails",
                          createProjectModal.form.locationDetails || ""
                        );
                        formDataToSend.append(
                          "workingHours",
                          createProjectModal.form.workingHours || ""
                        );
                        // Only append manpowerCount if it has a value (not empty string)
                        if (
                          createProjectModal.form.manpowerCount !== "" &&
                          createProjectModal.form.manpowerCount !== null &&
                          createProjectModal.form.manpowerCount !== undefined
                        ) {
                          formDataToSend.append(
                            "manpowerCount",
                            createProjectModal.form.manpowerCount
                          );
                        }

                        // Handle array field - append each ID separately
                        const ids = Array.isArray(
                          createProjectModal.form.assignedProjectEngineerIds
                        )
                          ? createProjectModal.form.assignedProjectEngineerIds
                          : [];
                        ids.forEach((id) => {
                          formDataToSend.append(
                            "assignedProjectEngineerIds",
                            id
                          );
                        });

                        // Append files
                        if (
                          createProjectModal.selectedFiles &&
                          createProjectModal.selectedFiles.length > 0
                        ) {
                          createProjectModal.selectedFiles.forEach((file) => {
                            formDataToSend.append("attachments", file);
                          });
                        }

                        await api.post(
                          `/api/projects/from-quotation/${createProjectModal.quotation._id}`,
                          formDataToSend
                        );
                        setCreateProjectModal({
                          open: false,
                          quotation: null,
                          form: {
                            name: "",
                            locationDetails: "",
                            workingHours: "",
                            manpowerCount: "",
                            assignedProjectEngineerIds: [],
                          },
                          engineers: [],
                          ack: false,
                          selectedFiles: [],
                          previewFiles: [],
                        });
                        setNotify({
                          open: true,
                          title: "Project Created",
                          message:
                            "Project created from approved quotation. Redirecting to Projects...",
                        });
                        setHasProjectFor({
                          ...hasProjectFor,
                          [createProjectModal.quotation._id]: true,
                        });
                        await fetchQuotations();
                        setTimeout(() => {
                          window.location.href = "/projects";
                        }, 1500);
                      } catch (e) {
                        setNotify({
                          open: true,
                          title: "Create Failed",
                          message:
                            e.response?.data?.message ||
                            "We could not create the project. Please try again.",
                        });
                      } finally {
                        setIsSubmitting(false);
                        setLoadingAction(null);
                      }
                    }}
                  >
                    {isSubmitting && loadingAction === "create-project"
                      ? "Creating..."
                      : "Create Project"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {profileUser && (
        <div
          className="modal-overlay profile"
          onClick={() => setProfileUser(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>User Profile</h2>
              <button
                onClick={() => setProfileUser(null)}
                className="close-btn"
              >
                ×
              </button>
            </div>
            <div className="lead-form">
              <div className="form-group">
                <label>Name</label>
                <input type="text" value={profileUser?.name || ""} readOnly />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="text" value={profileUser?.email || ""} readOnly />
              </div>
            </div>
          </div>
        </div>
      )}

      {historyQuote && (
        <div
          className="modal-overlay history"
          onClick={() => setHistoryQuote(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit History</h2>
              <button
                onClick={() => setHistoryQuote(null)}
                className="close-btn"
              >
                ×
              </button>
            </div>
            <div
              className="lead-form"
              style={{ maxHeight: "65vh", overflow: "auto" }}
            >
              {historyQuote.edits && historyQuote.edits.length > 0 ? (
                historyQuote.edits
                  .slice()
                  .reverse()
                  .map((edit, idx) => (
                    <div key={idx} className="edit-item">
                      <div className="edit-header">
                        <span>
                          By{" "}
                          {edit.editedBy?._id === currentUser?.id
                            ? "You"
                            : edit.editedBy?.name}
                        </span>
                        <span>{new Date(edit.editedAt).toLocaleString()}</span>
                      </div>
                      <ul className="changes-list">
                        {edit.changes.map((c, i) => (
                      <li key={i}>
                        <strong>{c.field}:</strong>
                        <div className="change-diff">
                          {["scopeOfWork", "priceSchedule", "exclusions", "paymentTerms"].includes(c.field) ? (
                            <>
                              <div
                                className="change-block"
                                dangerouslySetInnerHTML={{ __html: formatHistoryValue(c.field, c.from, { asHtml: true }) }}
                              />
                              <span>→</span>
                              <div
                                className="change-block"
                                dangerouslySetInnerHTML={{ __html: formatHistoryValue(c.field, c.to, { asHtml: true }) }}
                              />
                            </>
                          ) : (
                            <>
                              <pre className="change-block">
                                {formatHistoryValue(c.field, c.from)}
                              </pre>
                              <span>→</span>
                              <pre className="change-block">
                                {formatHistoryValue(c.field, c.to)}
                              </pre>
                            </>
                          )}
                        </div>
                      </li>
                        ))}
                      </ul>
                    </div>
                  ))
              ) : (
                <p>No edits recorded.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showRevisionsModal && selectedQuotationForRevisions && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowRevisionsModal(false);
            setSelectedQuotationForRevisions(null);
            setRevisionsForQuotation([]);
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "900px", width: "90%" }}
          >
            <div className="modal-header">
              <h2>
                Revisions for{" "}
                {selectedQuotationForRevisions.projectTitle ||
                  selectedQuotationForRevisions.offerReference ||
                  "Quotation"}
              </h2>
              <button
                onClick={() => {
                  setShowRevisionsModal(false);
                  setSelectedQuotationForRevisions(null);
                  setRevisionsForQuotation([]);
                }}
                className="close-btn"
              >
                ×
              </button>
            </div>
            <div
              className="lead-form"
              style={{ maxHeight: "70vh", overflow: "auto" }}
            >
              {revisionsForQuotation.length === 0 ? (
                <p>No revisions found for this quotation.</p>
              ) : (
                <div className="table">
                  <table>
                    <thead>
                      <tr>
                        <th>Revision #</th>
                        <th>Offer Ref</th>
                        <th>Offer Date</th>
                        <th>Grand Total</th>
                        <th>Status</th>
                        <th>Created By</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revisionsForQuotation.map((r) => (
                        <tr key={r._id}>
                          <td data-label="Revision #">
                            {r.parentQuotation?._id || r.parentQuotation ? (
                              <button
                                className="link-btn"
                                onClick={() => {
                                  try {
                                    const parentId =
                                      typeof r.parentQuotation === "object"
                                        ? r.parentQuotation._id
                                        : r.parentQuotation;
                                    localStorage.setItem(
                                      "quotationId",
                                      parentId
                                    );
                                    localStorage.setItem(
                                      "quotationDetail",
                                      JSON.stringify(r.parentQuotation || {})
                                    );
                                  } catch {}
                                  window.location.href = "/quotation-detail";
                                }}
                                style={{
                                  fontSize: "inherit",
                                  fontWeight: 600,
                                  padding: 0,
                                  textDecoration: "underline",
                                }}
                              >
                                {r.revisionNumber || "N/A"}
                              </button>
                            ) : (
                              r.revisionNumber || "N/A"
                            )}
                          </td>
                          <td data-label="Offer Ref">
                            {r.offerReference || "N/A"}
                          </td>
                          <td data-label="Offer Date">
                            {r.offerDate
                              ? new Date(r.offerDate).toLocaleDateString()
                              : "N/A"}
                          </td>
                          <td data-label="Grand Total">
                            {r.priceSchedule?.currency || "AED"}{" "}
                            {Number(r.priceSchedule?.grandTotal || 0).toFixed(
                              2
                            )}
                          </td>
                          <td data-label="Status">
                            {r.managementApproval?.status || "pending"}
                          </td>
                          <td data-label="Created By">
                            {r.createdBy?._id === currentUser?.id
                              ? "You"
                              : r.createdBy?.name || "N/A"}
                          </td>
                          <td data-label="Actions">
                            <button
                              className="save-btn"
                              onClick={() => {
                                try {
                                  localStorage.setItem("revisionId", r._id);
                                  localStorage.setItem(
                                    "revisionDetail",
                                    JSON.stringify(r)
                                  );
                                  const leadId =
                                    typeof r.lead === "object"
                                      ? r.lead?._id
                                      : r.lead;
                                  if (leadId)
                                    localStorage.setItem("leadId", leadId);
                                } catch {}
                                window.location.href = "/revision-detail";
                              }}
                            >
                              View
                            </button>
                            {revisionProjectMap[r._id] && (
                              <button
                                className="link-btn"
                                onClick={() =>
                                  handleViewProjectFromRevision(r, false)
                                }
                                style={{ marginLeft: "6px" }}
                              >
                                View Project
                              </button>
                            )}
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

      {projectModal.open && projectModal.project && (
        <div
          className="modal-overlay"
          onClick={() => setProjectModal({ open: false, project: null })}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "800px", width: "90%" }}
          >
            <div className="modal-header">
              <h2>Project Details</h2>
              <button
                onClick={() => setProjectModal({ open: false, project: null })}
                className="close-btn"
              >
                ×
              </button>
            </div>
            <div
              className="lead-form"
              style={{ maxHeight: "70vh", overflow: "auto" }}
            >
              <div
                className="ld-kv"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px 16px",
                }}
              >
                <p>
                  <strong>Project Name:</strong>{" "}
                  {projectModal.project.name || "N/A"}
                </p>
                <p>
                  <strong>Status:</strong>{" "}
                  {projectModal.project.status || "N/A"}
                </p>
                <p>
                  <strong>Location:</strong>{" "}
                  {projectModal.project.locationDetails || "N/A"}
                </p>
                <p>
                  <strong>Working Hours:</strong>{" "}
                  {projectModal.project.workingHours || "N/A"}
                </p>
                <p>
                  <strong>Manpower Count:</strong>{" "}
                  {projectModal.project.manpowerCount || "N/A"}
                </p>
                <p>
                  <strong>Budget:</strong>{" "}
                  {projectModal.project.budget
                    ? `${projectModal.project.budget}`
                    : "N/A"}
                </p>
                <p>
                  <strong>Site Engineer:</strong>{" "}
                  {projectModal.project.assignedSiteEngineer?.name ||
                    "Not Assigned"}
                </p>
                <p>
                  <strong>Project Engineer:</strong>{" "}
                  {projectModal.project.assignedProjectEngineer?.name ||
                    "Not Assigned"}
                </p>
                <p>
                  <strong>Created At:</strong>{" "}
                  {projectModal.project.createdAt
                    ? new Date(projectModal.project.createdAt).toLocaleString()
                    : "N/A"}
                </p>
                <p>
                  <strong>Created By:</strong>{" "}
                  {projectModal.project.createdBy?.name || "N/A"}
                </p>
              </div>
              <div style={{ marginTop: "20px", display: "flex", gap: "8px" }}>
                <button
                  className="assign-btn"
                  onClick={() => {
                    try {
                      localStorage.setItem(
                        "projectsFocusId",
                        projectModal.project._id
                      );
                      localStorage.setItem(
                        "projectId",
                        projectModal.project._id
                      );
                    } catch {}
                    window.location.href = "/project-detail";
                  }}
                >
                  View Full Project Details
                </button>
                <button
                  className="link-btn"
                  onClick={async () => {
                    try {
                      const res = await api.get(
                        `/api/project-variations?parentProject=${projectModal.project._id}`
                      );
                      const list = Array.isArray(res.data) ? res.data : [];
                      if (list.length === 0) {
                        setNotify({
                          open: true,
                          title: "No Variations",
                          message: "No variations found for this project.",
                        });
                        return;
                      }
                      setVariationsForProject(list);
                      setSelectedProjectForList(projectModal.project);
                      setShowVariationsListModal(true);
                    } catch (e) {
                      setNotify({
                        open: true,
                        title: "Open Failed",
                        message:
                          "We could not load the variations. Please try again.",
                      });
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

      {showVariationsListModal && selectedProjectForList && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowVariationsListModal(false);
            setSelectedProjectForList(null);
            setVariationsForProject([]);
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "90vw", width: "900px" }}
          >
            <div className="modal-header">
              <h2>Variations for {selectedProjectForList.name}</h2>
              <button
                onClick={() => {
                  setShowVariationsListModal(false);
                  setSelectedProjectForList(null);
                  setVariationsForProject([]);
                }}
                className="close-btn"
              >
                ×
              </button>
            </div>
            <div
              className="lead-form"
              style={{ maxHeight: "70vh", overflow: "auto" }}
            >
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
                      {variationsForProject
                        .sort(
                          (a, b) =>
                            (a.variationNumber || 0) - (b.variationNumber || 0)
                        )
                        .map((v) => (
                          <tr key={v._id}>
                            <td data-label="Variation #">
                              {v.variationNumber || "N/A"}
                            </td>
                            <td data-label="Offer Ref">
                              {v.offerReference || "N/A"}
                            </td>
                            <td data-label="Status">
                              <span
                                className={`status-badge ${
                                  v.managementApproval?.status === "approved"
                                    ? "approved"
                                    : v.managementApproval?.status ===
                                      "rejected"
                                    ? "rejected"
                                    : "blue"
                                }`}
                              >
                                {v.managementApproval?.status || "draft"}
                              </span>
                            </td>
                            <td data-label="Grand Total">
                              {v.priceSchedule?.currency || "AED"}{" "}
                              {Number(v.priceSchedule?.grandTotal || 0).toFixed(
                                2
                              )}
                            </td>
                            <td data-label="Created By">
                              {v.createdBy?._id === currentUser?.id
                                ? "You"
                                : v.createdBy?.name || "N/A"}
                              {v.createdBy?._id !== currentUser?.id &&
                                v.createdBy && (
                                  <button
                                    className="link-btn"
                                    onClick={() => setProfileUser(v.createdBy)}
                                    style={{ marginLeft: 6 }}
                                  >
                                    View Profile
                                  </button>
                                )}
                            </td>
                            <td data-label="Created At">
                              {v.createdAt
                                ? new Date(v.createdAt).toLocaleDateString()
                                : "N/A"}
                            </td>
                            <td data-label="Actions">
                              <button
                                className="save-btn"
                                onClick={() => {
                                  try {
                                    localStorage.setItem("variationId", v._id);
                                  } catch {}
                                  window.location.href = "/variation-detail";
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

      {notify.open && (
        <div
          className="modal-overlay"
          onClick={() => setNotify({ open: false, title: "", message: "" })}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{notify.title || "Notice"}</h2>
              <button
                onClick={() =>
                  setNotify({ open: false, title: "", message: "" })
                }
                className="close-btn"
              >
                ×
              </button>
            </div>
            <div className="lead-form">
              <p>{notify.message}</p>
              <div className="form-actions">
                <button
                  type="button"
                  className="save-btn"
                  onClick={() =>
                    setNotify({ open: false, title: "", message: "" })
                  }
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {printPreviewModal.open && printPreviewModal.pdfUrl && (
        <div
          className="modal-overlay"
          onClick={() =>
            setPrintPreviewModal({ open: false, pdfUrl: null, quotation: null })
          }
          style={{ zIndex: 10000 }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              zIndex: 10001,
              maxWidth: "95%",
              width: "100%",
              height: "95vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="modal-header"
              style={{
                flexShrink: 0,
                borderBottom: "1px solid var(--border)",
                padding: "16px 24px",
              }}
            >
              <h2>PDF Preview - Commercial Quotation</h2>
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <button
                  className="save-btn"
                  onClick={async () => {
                    if (printPreviewModal.quotation) {
                      try {
                        await exportPDF(printPreviewModal.quotation);
                      } catch (e) {
                        setNotify({
                          open: true,
                          title: "Export Failed",
                          message:
                            "We could not generate the PDF. Please try again.",
                        });
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
                      const printWindow = window.open("", "_blank");
                      printWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <title>Commercial Quotation</title>
                            <style>
                              body { margin: 0; padding: 0; }
                              iframe { width: 100%; height: 100vh; border: none; }
                            </style>
                          </head>
                          <body>
                            <iframe src="${printPreviewModal.pdfUrl}"></iframe>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                      setTimeout(() => {
                        printWindow.frames[0].print();
                      }, 500);
                    }
                  }}
                >
                  Print
                </button>
                <button
                  onClick={() =>
                    setPrintPreviewModal({
                      open: false,
                      pdfUrl: null,
                      quotation: null,
                    })
                  }
                  className="close-btn"
                >
                  ×
                </button>
              </div>
            </div>
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                background: "#525252",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <iframe
                src={printPreviewModal.pdfUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  background: "white",
                }}
                title="PDF Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuotationManagement;
