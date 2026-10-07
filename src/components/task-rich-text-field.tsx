import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Strikethrough,
  Underline,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

const ALLOWED_TAGS = new Set([
  "P",
  "DIV",
  "BR",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "STRIKE",
  "DEL",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "A",
  "SPAN",
  "FONT",
  "H1",
  "H2",
  "H3",
]);
const FONT_FAMILIES = ["Segoe UI", "Arial", "Calibri", "Georgia", "Verdana"];
const FONT_SIZES = ["11", "12", "14", "16", "18", "24"];
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+-]+\))$/i;

function safeColor(value: string) {
  const normalized = value.trim();
  return SAFE_COLOR.test(normalized) ? normalized : "";
}

/** Rebuilds a small, explicit HTML allowlist before markup is saved or displayed. */
function sanitizeTaskRichText(markup: string) {
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    return markup
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\r?\n/g, "<br>");
  }
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const root = document.createElement("div");
  const copySafe = (source: Node, target: Node) => {
    for (const child of Array.from(source.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        target.appendChild(document.createTextNode(child.textContent || ""));
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH"].includes(child.tagName)) continue;
      if (!ALLOWED_TAGS.has(child.tagName)) {
        copySafe(child, target);
        continue;
      }
      const element = document.createElement(child.tagName.toLowerCase());
      if (child.tagName === "A") {
        const href = child.getAttribute("href")?.trim() || "";
        if (/^(https?:|mailto:)/i.test(href)) {
          element.setAttribute("href", href);
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noopener noreferrer");
        }
      }
      if (child.tagName === "FONT") {
        const face = child.getAttribute("face")?.replace(/["']/g, "").trim();
        const family = FONT_FAMILIES.find(
          (candidate) => candidate.toLowerCase() === face?.toLowerCase(),
        );
        const size = Number(child.getAttribute("size"));
        if (family) element.setAttribute("face", family);
        if (Number.isInteger(size) && size >= 1 && size <= 7)
          element.setAttribute("size", String(size));
      }
      if (
        child.tagName === "SPAN" ||
        child.tagName === "P" ||
        child.tagName === "DIV" ||
        /^H[1-3]$/.test(child.tagName)
      ) {
        const styles: string[] = [];
        const align = child.style.textAlign;
        if (["left", "center", "right", "justify"].includes(align))
          styles.push(`text-align:${align}`);
        const color = safeColor(child.style.color);
        const background = safeColor(child.style.backgroundColor);
        if (color) styles.push(`color:${color}`);
        if (background) styles.push(`background-color:${background}`);
        const family = FONT_FAMILIES.find(
          (candidate) =>
            candidate.toLowerCase() ===
            child.style.fontFamily.replace(/["']/g, "").trim().toLowerCase(),
        );
        if (family) styles.push(`font-family:${family}`);
        const fontSize = Number.parseFloat(child.style.fontSize);
        if (Number.isFinite(fontSize) && fontSize >= 8 && fontSize <= 48)
          styles.push(`font-size:${fontSize}px`);
        if (styles.length) element.setAttribute("style", styles.join(";"));
      }
      copySafe(child, element);
      target.appendChild(element);
    }
  };
  copySafe(parsed.body, root);
  return root.innerHTML;
}

function normalizeUrl(value: string) {
  const url = value.trim();
  if (/^mailto:/i.test(url)) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function TaskRichTextField({
  value,
  onChange,
  readOnly = false,
  label = "Premissas do processo",
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  label?: string;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const savedSelection = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [safePreview, setSafePreview] = useState("");

  useEffect(() => {
    setSafePreview(sanitizeTaskRichText(value));
    if (!editor.current) return;
    const sanitized = sanitizeTaskRichText(value);
    if (editor.current.innerHTML !== sanitized) editor.current.innerHTML = sanitized;
  }, [value]);

  function run(command: string, argument?: string) {
    editor.current?.focus();
    document.execCommand(command, false, argument);
    if (editor.current && onChange) onChange(sanitizeTaskRichText(editor.current.innerHTML));
  }

  function openLink() {
    const selection = window.getSelection();
    savedSelection.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    setLinkUrl("");
    setLinkOpen(true);
  }

  function applyLink(event: FormEvent) {
    event.preventDefault();
    const url = normalizeUrl(linkUrl);
    if (!/^(https?:\/\/|mailto:)/i.test(url) || !editor.current) return;
    editor.current.focus();
    if (savedSelection.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedSelection.current);
    }
    document.execCommand("createLink", false, url);
    onChange?.(sanitizeTaskRichText(editor.current.innerHTML));
    setLinkOpen(false);
  }

  if (readOnly) {
    return (
      <div className="task-rich-readonly" aria-label={label}>
        <div dangerouslySetInnerHTML={{ __html: safePreview }} />
      </div>
    );
  }

  const tool = (name: string, icon: ReactNode, command: string, argument?: string) => (
    <button
      type="button"
      className="task-rich-tool"
      title={name}
      aria-label={name}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => run(command, argument)}
    >
      {icon}
    </button>
  );

  return (
    <div className="task-rich-field">
      <div className="task-rich-toolbar" role="toolbar" aria-label="Formatação das premissas">
        <label className="sr-only" htmlFor="premises-font-family">
          Fonte
        </label>
        <select
          id="premises-font-family"
          aria-label="Fonte"
          defaultValue="Segoe UI"
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => run("fontName", event.target.value)}
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font}>{font}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="premises-font-size">
          Tamanho da fonte
        </label>
        <select
          id="premises-font-size"
          aria-label="Tamanho da fonte"
          defaultValue="12"
          onChange={(event) => {
            const map: Record<string, string> = {
              "11": "2",
              "12": "3",
              "14": "4",
              "16": "5",
              "18": "6",
              "24": "7",
            };
            run("fontSize", map[event.target.value]);
          }}
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="task-rich-divider" aria-hidden="true" />
        {tool("Negrito", <Bold size={16} />, "bold")}
        {tool("Itálico", <Italic size={16} />, "italic")}
        {tool("Sublinhado", <Underline size={16} />, "underline")}
        {tool("Tachado", <Strikethrough size={16} />, "strikeThrough")}
        <label className="task-rich-color" title="Cor do texto">
          <span className="sr-only">Cor do texto</span>
          <input
            type="color"
            aria-label="Cor do texto"
            defaultValue="#343a40"
            onChange={(event) => run("foreColor", event.target.value)}
          />
        </label>
        <label className="task-rich-color" title="Realce">
          <Highlighter size={16} aria-hidden="true" />
          <input
            type="color"
            aria-label="Realce do texto"
            defaultValue="#fff2a8"
            onChange={(event) => run("hiliteColor", event.target.value)}
          />
        </label>
        <span className="task-rich-divider" aria-hidden="true" />
        {tool("Lista com marcadores", <List size={16} />, "insertUnorderedList")}
        {tool("Lista numerada", <ListOrdered size={16} />, "insertOrderedList")}
        {tool("Alinhar à esquerda", <AlignLeft size={16} />, "justifyLeft")}
        {tool("Centralizar", <AlignCenter size={16} />, "justifyCenter")}
        {tool("Alinhar à direita", <AlignRight size={16} />, "justifyRight")}
        {tool("Remover formatação", <X size={16} />, "removeFormat")}
        <button
          type="button"
          className="task-rich-tool"
          title="Inserir link"
          aria-label="Inserir link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openLink}
        >
          <Link2 size={16} />
        </button>
      </div>
      {linkOpen && (
        <form className="task-rich-link-form" onSubmit={applyLink}>
          <label htmlFor="premises-link-url">Endereço do link</label>
          <input
            id="premises-link-url"
            type="url"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://exemplo.com"
            required
            autoFocus
          />
          <button type="submit">Inserir link</button>
          <button type="button" onClick={() => setLinkOpen(false)}>
            Cancelar
          </button>
        </form>
      )}
      <div
        ref={editor}
        className="task-rich-editor"
        contentEditable
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        data-placeholder="Registre premissas, condições e informações importantes do processo…"
        onInput={(event) => {
          const target = event.currentTarget;
          const sanitized = sanitizeTaskRichText(target.innerHTML);
          if (target.innerHTML !== sanitized) target.innerHTML = sanitized;
          onChange?.(sanitized);
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
      />
      <p className="task-rich-help">A formatação será mantida no registro da tarefa.</p>
    </div>
  );
}
