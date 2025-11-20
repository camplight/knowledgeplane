"use client";

interface FactEditFormProps {
  factId: string;
  content: string;
  isPending: boolean;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export function FactEditForm({ factId, content, isPending, onSave, onCancel }: FactEditFormProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newContent = formData.get("content") as string;
    if (newContent?.trim()) {
      onSave(newContent.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
        <textarea
          name="content"
          defaultValue={content}
          rows={4}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

