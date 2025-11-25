"use client";

import { RelationEditForm } from "./RelationEditForm";

interface RelationItemProps {
  relation: {
    relation: {
      id: string;
      _key?: string;
      type: string;
    };
    fact: {
      id: string;
      _key?: string;
      content?: string;
    };
  };
  isEditing: boolean;
  editingType: string;
  editingFactId?: string;
  isUpdating: boolean;
  isDeleting: boolean;
  variant: "outgoing" | "incoming";
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (type: string, factId: string) => void;
  onDelete: () => void;
  onSelectFact: (factId: string) => void;
  availableFacts?: Array<{ id: string; content: string }>;
}

export function RelationItem({
  relation,
  isEditing,
  editingType,
  editingFactId,
  isUpdating,
  isDeleting,
  variant,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onSelectFact,
  availableFacts = [],
}: RelationItemProps) {
  // Get fact ID - normalized facts always have 'id' field
  const fact = relation.fact;
  let factId = fact?.id || "";
  
  // Validate fact ID - ensure it's a fact ID, not a relation ID
  if (factId && (factId.startsWith("relations/") || factId.startsWith("fact_relations/"))) {
    // This is a relation ID, not a fact ID - try to extract from _key
    if (fact?._key) {
      factId = `facts/${fact._key}`;
    } else {
      console.warn("RelationItem: Invalid fact ID detected (relation ID instead of fact ID)", {
        factId,
        fact: relation.fact,
        relation: relation.relation
      });
      factId = "";
    }
  }
  
  // Get fact content - check multiple possible locations
  const factContent = relation.fact?.content || "";
  const isOutgoing = variant === "outgoing";
  
  // Only log debug if we have a valid fact ID but missing content
  if (!factContent && factId && factId.startsWith("facts/")) {
    console.debug("RelationItem: Fact missing content", { 
      factId, 
      fact: relation.fact,
      hasContent: !!relation.fact?.content 
    });
  }
  
  // Get preview text: first characters of content or fact ID
  const previewText = factContent && factContent.trim()
    ? `${factContent.substring(0, 60)}${factContent.length > 60 ? "..." : ""}`
    : factId 
      ? `Fact ${factId.includes("/") ? factId.substring(factId.lastIndexOf("/") + 1) : factId.substring(0, 20)}${factId.length > 20 ? "..." : ""}`
      : "Unknown fact";
  
  // Get fact ID for display (short version)
  const factIdDisplay = factId 
    ? factId.includes("/") 
      ? factId.substring(factId.lastIndexOf("/") + 1)
      : factId.substring(0, 8)
    : "";

  return (
    <div className="text-xs p-2 bg-slate-50 rounded border border-slate-200">
      {isEditing ? (
        <RelationEditForm
          relationId={relation.relation.id || (relation.relation._key ? `fact_relations/${relation.relation._key}` : "")}
          currentType={editingType}
          currentFactId={editingFactId || factId}
          isPending={isUpdating}
          onSave={onSave}
          onCancel={onCancelEdit}
          onDelete={onDelete}
          isDeleting={isDeleting}
          variant={variant}
          availableFacts={availableFacts}
        />
      ) : (
        <>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`font-medium ${isOutgoing ? "text-blue-600" : "text-green-600"}`}>
                  {relation.relation.type}
                </span>
                <span className="text-slate-400">→</span>
              </div>
              <button
                onClick={() => factId && onSelectFact(factId)}
                className={`block text-slate-700 mt-1 text-left hover:underline transition-colors cursor-pointer w-full ${
                  isOutgoing ? "hover:text-blue-600" : "hover:text-green-600"
                }`}
                title={factId ? `Click to select fact ${factId}` : "Fact ID unavailable"}
              >
                <span className="font-medium">{previewText}</span>
                {factIdDisplay && (
                  <span className="ml-2 text-slate-400 text-[10px]">({factIdDisplay})</span>
                )}
              </button>
            </div>
            <div className="flex gap-1 ml-2">
              <button
                onClick={onEdit}
                className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                title="Edit"
              >
                ✏️
              </button>
              <button
                onClick={onDelete}
                className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200"
                title="Delete"
              >
                🗑️
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

