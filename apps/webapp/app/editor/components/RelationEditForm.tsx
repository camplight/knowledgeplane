"use client";

import { useState, useEffect } from "react";

interface RelationEditFormProps {
  relationId: string;
  currentType: string;
  currentFactId: string;
  isPending: boolean;
  onSave: (type: string, factId: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
  variant?: "outgoing" | "incoming";
  availableFacts?: Array<{ id: string; content: string }>;
}

const RELATION_TYPES = [
  { value: "related_to", label: "Related To" },
  { value: "references", label: "References" },
  { value: "depends_on", label: "Depends On" },
  { value: "part_of", label: "Part Of" },
] as const;

export function RelationEditForm({
  relationId,
  currentType,
  currentFactId,
  isPending,
  onSave,
  onCancel,
  onDelete,
  isDeleting = false,
  variant = "outgoing",
  availableFacts = [],
}: RelationEditFormProps) {
  // Use controlled components for proper selection
  const [selectedType, setSelectedType] = useState(currentType);
  const [selectedFactId, setSelectedFactId] = useState(currentFactId);

  // Update state when props change (e.g., when editing a different relation)
  useEffect(() => {
    setSelectedType(currentType);
    setSelectedFactId(currentFactId);
  }, [currentType, currentFactId]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const newType = selectedType;
    const newFactId = selectedFactId;
    
    console.log("RelationEditForm submit:", { 
      newType, 
      newFactId, 
      currentType, 
      currentFactId,
      relationId,
      availableFactsCount: availableFacts.length 
    });
    
    if (!newType || newType.trim() === "") {
      console.error("RelationEditForm: Missing or empty type");
      alert("Please select a relation type");
      return;
    }
    
    if (!newFactId || newFactId.trim() === "") {
      console.error("RelationEditForm: Missing fact ID");
      alert("Please select a fact");
      return;
    }
    
    onSave(newType.trim(), newFactId.trim());
  };

  const isOutgoing = variant === "outgoing";

  // Ensure current fact is in the list of available facts
  const allAvailableFacts = availableFacts.some(f => f.id === currentFactId)
    ? availableFacts
    : [...availableFacts, { id: currentFactId, content: "" }];

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
        <select
          name="type"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className={`w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-2 ${
            isOutgoing ? "focus:ring-blue-500" : "focus:ring-green-500"
          } bg-white`}
          required
        >
          {RELATION_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      {allAvailableFacts.length > 0 ? (
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {variant === "outgoing" ? "To Fact" : "From Fact"}
          </label>
          <select
            name="factId"
            value={selectedFactId}
            onChange={(e) => setSelectedFactId(e.target.value)}
            className={`w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-2 ${
              isOutgoing ? "focus:ring-blue-500" : "focus:ring-green-500"
            } bg-white`}
            required
          >
            {allAvailableFacts.map((fact) => {
              const displayText = fact.content 
                ? `${fact.content.substring(0, 50)}${fact.content.length > 50 ? "..." : ""}`
                : `Fact ${fact.id.substring(0, 30)}${fact.id.length > 30 ? "..." : ""}`;
              return (
                <option key={fact.id} value={fact.id}>
                  {displayText}
                </option>
              );
            })}
          </select>
        </div>
      ) : (
        // Hidden field to ensure factId is always present in form data
        <input type="hidden" name="factId" value={currentFactId} />
      )}
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={isPending}
          className={`flex-1 px-2 py-1 text-xs text-white rounded disabled:opacity-50 ${
            isOutgoing
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </form>
  );
}

