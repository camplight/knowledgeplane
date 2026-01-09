"use client";

import { useState, useMemo } from "react";

interface TruncatedContentProps {
  content: string;
  maxLength?: number;
  className?: string;
}

export function TruncatedContent({ 
  content, 
  maxLength = 300, 
  className = "" 
}: TruncatedContentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Memoize the truncation logic to avoid recalculating on every render
  const { shouldTruncate, displayContent } = useMemo(() => {
    if (!content || content.length === 0) {
      return { shouldTruncate: false, displayContent: "" };
    }
    const shouldTruncate = content.length > maxLength;
    const displayContent = shouldTruncate && !isExpanded
      ? content.substring(0, maxLength)
      : content;
    return { shouldTruncate, displayContent };
  }, [content, maxLength, isExpanded]);

  if (!content || content.length === 0) {
    return <p className={className}>No content</p>;
  }

  if (!shouldTruncate) {
    return <p className={className}>{content}</p>;
  }

  return (
    <div className={className}>
      <p className="mb-2 whitespace-pre-wrap break-words">{displayContent}{!isExpanded && "..."}</p>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className="text-sm text-blue-600 hover:text-blue-700 underline"
      >
        {isExpanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

