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
      <div className="form-control">
        <label className="label">
          <span className="label-text text-sm font-medium">Content</span>
        </label>
        <textarea
          ref={textareaRef}
          name="content"
          value={textAreaValue}
          onChange={(e) => setTextAreaValue(e.target.value)}
          rows={4}
          className="textarea textarea-bordered w-full text-sm resize-none overflow-y-auto"
          style={{ minHeight: "100px", maxHeight: "600px" }}
          required
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="btn btn-primary btn-sm flex-1"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost btn-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

