"use client";

import { useState, useEffect, useRef } from "react";

interface FactEditFormProps {
  factId: string;
  content: string;
  isPending: boolean;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export function FactEditForm({ factId, content, isPending, onSave, onCancel }: FactEditFormProps) {
  const [textAreaValue, setTextAreaValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update value when content prop changes (e.g., when editing a different fact)
  useEffect(() => {
    setTextAreaValue(content);
  }, [content, factId]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = "auto";
      // Set height based on content, with min and max constraints
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 100), 600);
      textarea.style.height = `${newHeight}px`;
    }
  }, [textAreaValue]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (textAreaValue?.trim()) {
      onSave(textAreaValue.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
        <textarea
          ref={textareaRef}
          name="content"
          value={textAreaValue}
          onChange={(e) => setTextAreaValue(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none overflow-y-auto"
          style={{ minHeight: "100px", maxHeight: "600px" }}
          required
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

