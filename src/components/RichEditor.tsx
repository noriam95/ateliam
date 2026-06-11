import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote, Link as LinkIcon, Undo2, Redo2 } from "lucide-react";

export interface RichEditorHandle {
  getHTML: () => string;
}

interface Props {
  initialHTML: string;
}

function cmd(name: string, value?: string) {
  document.execCommand(name, false, value);
}

const TOOLS: { icon: any; title: string; run: () => void }[] = [
  { icon: Bold, title: "Negrito", run: () => cmd("bold") },
  { icon: Italic, title: "Itálico", run: () => cmd("italic") },
  { icon: Heading2, title: "Título 2", run: () => cmd("formatBlock", "<h2>") },
  { icon: Heading3, title: "Título 3", run: () => cmd("formatBlock", "<h3>") },
  { icon: List, title: "Lista", run: () => cmd("insertUnorderedList") },
  { icon: ListOrdered, title: "Lista numerada", run: () => cmd("insertOrderedList") },
  { icon: Quote, title: "Citação", run: () => cmd("formatBlock", "<blockquote>") },
  {
    icon: LinkIcon, title: "Link", run: () => {
      const url = prompt("URL do link:");
      if (url) cmd("createLink", url);
    },
  },
  { icon: Undo2, title: "Desfazer", run: () => cmd("undo") },
  { icon: Redo2, title: "Refazer", run: () => cmd("redo") },
];

export const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor({ initialHTML }, ref) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = initialHTML;
    }
  }, [initialHTML]);

  useImperativeHandle(ref, () => ({
    getHTML: () => editorRef.current?.innerHTML ?? "",
  }));

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-surface px-4 py-2 flex flex-wrap gap-1 items-center sticky top-0 z-10">
        {TOOLS.map((t, i) => (
          <button
            key={i}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); t.run(); }}
            title={t.title}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition"
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto bg-background">
        <div className="max-w-3xl mx-auto px-10 py-12">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="prose-editor min-h-[60vh]"
          />
        </div>
      </div>
    </div>
  );
});
