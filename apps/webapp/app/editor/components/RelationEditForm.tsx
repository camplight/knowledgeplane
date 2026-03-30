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
      <div className="form-control">
        <label className="label py-0">
          <span className="label-text text-xs font-medium">Type</span>
        </label>
        <select
          name="type"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="select select-bordered select-xs w-full"
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
        <div className="form-control">
          <label className="label py-0">
            <span className="label-text text-xs font-medium">
              {variant === "outgoing" ? "To Fact" : "From Fact"}
            </span>
          </label>
          <select
            name="factId"
            value={selectedFactId}
            onChange={(e) => setSelectedFactId(e.target.value)}
            className="select select-bordered select-xs w-full"
            required
          >
            {allAvailableFacts.map((fact) => {
              // Normalize content to ensure it's always a string
              let contentStr = "";
              if (typeof fact.content === "string") {
                contentStr = fact.content;
              } else if (typeof fact.content === "object" && fact.content !== null && "content" in fact.content) {
                contentStr = String((fact.content as any).content);
              } else {
                contentStr = JSON.stringify(fact.content || "");
              }
              const displayText = contentStr
                ? `${contentStr.substring(0, 50)}${contentStr.length > 50 ? "..." : ""}`
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
          className={`btn btn-xs flex-1 ${isOutgoing ? "btn-primary" : "btn-accent"}`}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost btn-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="btn btn-error btn-xs"
        >
          Delete
        </button>
      </div>
    </form>
  );
}

