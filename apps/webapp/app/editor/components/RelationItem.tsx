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
    <div className="text-xs p-2 bg-base-200 rounded border border-base-300">
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
                <span className={`badge badge-sm ${isOutgoing ? "badge-primary" : "badge-accent"}`}>
                  {relation.relation.type}
                </span>
                <span className="text-base-content/40">→</span>
              </div>
              <button
                onClick={() => factId && onSelectFact(factId)}
                className={`btn btn-ghost btn-xs justify-start h-auto py-1 px-0 min-h-0 text-left normal-case font-normal w-full ${
                  isOutgoing ? "hover:text-primary" : "hover:text-accent"
                }`}
                title={factId ? `Click to select fact ${factId}` : "Fact ID unavailable"}
              >
                <span className="font-medium">{previewText}</span>
                {factIdDisplay && (
                  <span className="ml-2 text-base-content/40 text-[10px]">({factIdDisplay})</span>
                )}
              </button>
            </div>
            <div className="flex gap-1 ml-2">
              <button
                onClick={onEdit}
                className="btn btn-ghost btn-xs"
                title="Edit"
              >
                ✏️
              </button>
              <button
                onClick={onDelete}
                className="btn btn-error btn-xs"
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

