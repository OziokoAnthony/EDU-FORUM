'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

/**
 * Tiptap rich-text editor (confirmed tool) for vacancy descriptions. Loaded only on the
 * posting form. Output is HTML; the API sanitises it before storing.
 */
export default function RichTextEditor({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (html: string) => void;
  invalid?: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, horizontalRule: false })],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-invalid': String(!!invalid),
        class: 'prose-sm min-h-40 px-3 py-2.5 text-base text-slate-900 outline-none [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  const tool = (label: string, active: boolean, run: () => void) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      aria-pressed={active}
      className={`rounded px-2 py-1 text-sm ${active ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
    >
      {label}
    </button>
  );

  return (
    <div className={`rounded-lg border bg-white ${invalid ? 'border-red-500' : 'border-slate-300'} focus-within:border-emerald-600`}>
      {editor ? (
        <div className="flex flex-wrap gap-1 border-b border-slate-200 p-1" role="toolbar" aria-label="Formatting">
          {tool('Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
          {tool('Italic', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
          {tool('Heading', editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
          {tool('• List', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run())}
          {tool('1. List', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run())}
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
