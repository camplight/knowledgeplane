"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Navigation } from "../components/Navigation";
import { FactEditForm } from "./components/FactEditForm";
import { RelationItem } from "./components/RelationItem";

export default function EditorPage() {
  const router = useRouter();
  const [selectedView, setSelectedView] = useState<"facts" | "cards" | "graph">("facts");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [selectedFact, setSelectedFact] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  
  // Create fact form state
  const [showCreateFact, setShowCreateFact] = useState(false);
  const [factContent, setFactContent] = useState("");

  // Edit fact form state
  const [editingFactId, setEditingFactId] = useState<string | null>(null);

  // Fact relation form state
  const [showCreateRelation, setShowCreateRelation] = useState(false);
  const [relationFromFact, setRelationFromFact] = useState("");
  const [relationToFact, setRelationToFact] = useState("");
  const [relationType, setRelationType] = useState("related_to");

  // Edit relation state - use a map to track editing state per relation
  // Format: { relationId: { type: string, factId: string } }
  const [editingRelations, setEditingRelations] = useState<Record<string, { type: string; factId: string }>>({});

  // Update relationFromFact when selectedFact changes
  useEffect(() => {
    if (selectedFact) {
      setRelationFromFact(selectedFact);
    }
  }, [selectedFact]);

  // Cancel editing when selected fact changes
  useEffect(() => {
    if (selectedFact && editingFactId && editingFactId !== selectedFact) {
      setEditingFactId(null);
    }
    if (!selectedFact) {
      setEditingFactId(null);
      setEditingRelations({});
    }
  }, [selectedFact, editingFactId]);

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();
  
  // Facts queries
  const { data: factsData, isLoading: factsLoading, refetch: refetchFacts } = trpc.facts.list.useQuery({
    limit: 50,
    offset: 0,
    includeTrashed: false,
  });

  // Cards queries
  const { data: cardsData, isLoading: cardsLoading, refetch: refetchCards } = trpc.cards.list.useQuery({
    limit: 50,
    offset: 0,
  });

  // Get selected card details
  const { data: selectedCardData } = trpc.cards.getById.useQuery(
    { id: selectedCard || "" },
    { enabled: !!selectedCard }
  );

  // Search facts - only enabled when there's an active search query
  const { data: searchResults, isLoading: searchLoading, refetch: refetchSearch } = trpc.facts.search.useQuery(
    {
      query: activeSearchQuery || "*",
      k: 20,
    },
    { enabled: !!activeSearchQuery && activeSearchQuery.trim().length > 0 }
  );

  // Fact relations queries
  const { data: factRelationsData, refetch: refetchFactRelations } = trpc.factRelations.getForFact.useQuery(
    { fact_id: selectedFact || "" },
    { enabled: !!selectedFact }
  );

  // Create fact mutation
  const createFactMutation = trpc.facts.create.useMutation({
    onSuccess: () => {
      setFactContent("");
      setShowCreateFact(false);
      refetchFacts();
    },
  });

  // Create fact relation mutation
  const createFactRelationMutation = trpc.factRelations.create.useMutation({
    onSuccess: () => {
      setRelationFromFact(selectedFact || "");
      setRelationToFact("");
      setRelationType("related_to");
      setShowCreateRelation(false);
      // Clear any editing states
      setEditingRelations({});
      refetchFactRelations();
      refetchFacts(); // Refresh facts list in case new facts were created
    },
    onError: (error) => {
      console.error("Failed to create relation:", error);
      alert(`Failed to create relation: ${error.message}`);
    },
  });

  // Update fact mutation
  const updateFactMutation = trpc.facts.update.useMutation({
    onSuccess: () => {
      setEditingFactId(null);
      refetchFacts();
      refetchFactRelations();
    },
  });

  // Update relation mutation
  const updateRelationMutation = trpc.factRelations.update.useMutation({
    onSuccess: () => {
      setEditingRelations({});
      refetchFactRelations();
    },
    onError: (error) => {
      console.error("Failed to update relation:", error);
      alert(`Failed to update relation: ${error.message}`);
    },
  });

  // Delete relation mutation
  const deleteRelationMutation = trpc.factRelations.delete.useMutation({
    onSuccess: () => {
      refetchFactRelations();
    },
    onError: (error) => {
      console.error("Failed to delete relation:", error);
      alert(`Failed to delete relation: ${error.message}`);
    },
  });

  // Delete card mutation
  const deleteCardMutation = trpc.cards.delete.useMutation({
    onSuccess: () => {
      setSelectedCard(null);
      refetchCards();
    },
    onError: (error) => {
      console.error("Failed to delete card:", error);
      alert(`Failed to delete card: ${error.message}`);
    },
  });

  useEffect(() => {
    if (!userLoading && !userData?.user) {
      router.push("/");
    }
  }, [userLoading, userData, router]);

  const handleSearch = () => {
    if (searchQuery && searchQuery.trim().length > 0) {
      setActiveSearchQuery(searchQuery.trim());
    } else {
      // Clear search when query is empty
      setActiveSearchQuery("");
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveSearchQuery("");
  };

  // Client-side filter function
  const filterItems = <T extends { content?: string; title?: string; summary?: string }>(
    items: T[],
    query: string
  ): T[] => {
    if (!query || query.trim().length === 0) {
      return items;
    }
    
    const lowerQuery = query.toLowerCase().trim();
    return items.filter((item) => {
      const content = item.content?.toLowerCase() || "";
      const title = item.title?.toLowerCase() || "";
      const summary = item.summary?.toLowerCase() || "";
      
      return content.includes(lowerQuery) || 
             title.includes(lowerQuery) || 
             summary.includes(lowerQuery);
    });
  };

  const handleCreateFact = (e: React.FormEvent) => {
    e.preventDefault();
    if (factContent.trim()) {
      createFactMutation.mutate({ content: factContent.trim() });
    }
  };

  const handleCreateRelation = (e: React.FormEvent) => {
    e.preventDefault();
    if (relationFromFact && relationToFact && relationType) {
      createFactRelationMutation.mutate({
        from_fact: relationFromFact,
        to_fact: relationToFact,
        type: relationType,
      });
    }
  };

  const handleEditFact = (factId: string) => {
    setEditingFactId(factId);
  };

  const handleUpdateFact = (factId: string, content: string) => {
    updateFactMutation.mutate({
      id: factId,
      content,
    });
  };

  const handleCancelEditFact = () => {
    setEditingFactId(null);
  };

  const handleEditRelation = (relationKey: string, currentType: string, currentFactId: string) => {
    if (!relationKey) {
      console.error("handleEditRelation: missing relation key", { currentType, currentFactId });
      alert("Unable to edit this relation because its ID is missing.");
      return;
    }

    // Only allow one relation to be edited at a time - clear all others
    setEditingRelations({
      [relationKey]: { type: currentType, factId: currentFactId },
    });
  };

  const handleUpdateRelation = (relationId: string, type: string, newFactId: string, currentRelation: any, variant: "outgoing" | "incoming") => {
    // Normalize fact IDs for comparison
    const normalizeFactId = (id: string) => {
      if (!id) return "";
      // Remove any prefixes and get just the key part
      return id.includes("/") ? id.substring(id.lastIndexOf("/") + 1) : id;
    };
    
    const currentFactId = currentRelation.fact?.id || currentRelation.fact?._id || "";
    const normalizedCurrentFactId = normalizeFactId(currentFactId);
    const normalizedNewFactId = normalizeFactId(newFactId);
    
    console.log("handleUpdateRelation called:", { 
      relationId, 
      type, 
      newFactId, 
      normalizedNewFactId,
      currentFactId,
      normalizedCurrentFactId,
      variant 
    });
    
    // Validate relation ID - should not be a fact ID
    if (!relationId || relationId.trim() === "") {
      console.error("Missing relation ID");
      alert("Missing relation ID");
      return;
    }
    
    // Check if ID looks like a fact ID (facts/...) instead of relation ID
    if (relationId.startsWith("facts/") && !relationId.startsWith("fact_relations/")) {
      console.error("Invalid relation ID format - looks like a fact ID:", relationId);
      alert(`Invalid relation ID format: ${relationId}. This appears to be a fact ID, not a relation ID.`);
      return;
    }
    
    // If the fact ID changed, we need to delete and recreate the relation
    // Compare normalized IDs to handle different formats
    const factIdChanged = normalizedNewFactId !== normalizedCurrentFactId && newFactId !== currentFactId;
    
    if (factIdChanged) {
      console.log("Fact ID changed, deleting and recreating relation");
      // Delete old relation and create new one
      deleteRelationMutation.mutate(
        { id: relationId },
        {
          onSuccess: () => {
            // Determine which fact is the "from" and which is the "to"
            // For outgoing: selectedFact is "from", newFactId is "to"
            // For incoming: newFactId is "from", selectedFact is "to"
            const fromFact = variant === "outgoing" ? selectedFact : newFactId;
            const toFact = variant === "outgoing" ? newFactId : selectedFact;
            
            if (fromFact && toFact && selectedFact) {
              createFactRelationMutation.mutate({
                from_fact: fromFact,
                to_fact: toFact,
                type,
              });
            } else {
              console.error("Missing fact IDs for relation update", { fromFact, toFact, selectedFact });
              alert("Missing fact IDs for relation update");
            }
          },
          onError: (error) => {
            console.error("Failed to delete relation:", error);
            alert(`Failed to update relation: ${error.message}`);
          },
        }
      );
    } else {
      // Just update the type
      console.log("Updating relation type only", { relationId, type });
      if (!type || type.trim() === "") {
        console.error("Cannot update relation: type is empty");
        alert("Relation type cannot be empty");
        return;
      }
      updateRelationMutation.mutate({
        id: relationId,
        type: type.trim(),
      });
    }
  };

  const handleCancelEditRelation = (relationKey: string) => {
    if (!relationKey) {
      return;
    }

    setEditingRelations((prev) => {
      const next = { ...prev };
      delete next[relationKey];
      return next;
    });
  };

  const handleDeleteRelation = (relationId: string) => {
    // Validate relation ID - should not be a fact ID
    if (!relationId || relationId.trim() === "") {
      console.error("Missing relation ID");
      alert("Missing relation ID");
      return;
    }
    
    // Check if ID looks like a fact ID (facts/...) instead of relation ID
    if (relationId.startsWith("facts/") && !relationId.startsWith("fact_relations/")) {
      console.error("Invalid relation ID format - looks like a fact ID:", relationId);
      alert(`Invalid relation ID format: ${relationId}. This appears to be a fact ID, not a relation ID.`);
      return;
    }
    
    if (confirm("Are you sure you want to delete this relation?")) {
      deleteRelationMutation.mutate({ id: relationId });
    }
  };

  const handleDeleteCard = (cardId: string) => {
    if (!cardId || cardId.trim() === "") {
      console.error("Missing card ID");
      alert("Missing card ID");
      return;
    }
    
    if (confirm("Are you sure you want to delete this knowledge card? This action cannot be undone.")) {
      deleteCardMutation.mutate({ id: cardId });
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!userData?.user) {
    return null;
  }

  // Determine which facts to display based on search state
  const allFacts = activeSearchQuery && activeSearchQuery.trim().length > 0 && searchResults 
    ? searchResults.results 
    : (factsData?.facts || []);
  
  // Apply client-side filter to facts
  const facts = filterItems(allFacts, searchQuery);
  
  const isLoadingFacts = activeSearchQuery && activeSearchQuery.trim().length > 0 
    ? searchLoading 
    : factsLoading;
  const user = userData.user;
  
  // Apply client-side filter to cards
  const allCards = cardsData?.cards || [];
  const filteredCards = filterItems(allCards, searchQuery);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Bar */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search facts, cards, or browse knowledge graph..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  // Clear active search query when user types (client-side filtering takes over)
                  if (activeSearchQuery && e.target.value.trim().length === 0) {
                    setActiveSearchQuery("");
                  }
                }}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {(searchQuery || activeSearchQuery) && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 px-2"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              onClick={handleSearch}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Search
            </button>
          </div>
          {(activeSearchQuery || (searchQuery && searchQuery.trim().length > 0)) && (
            <div className="mt-2 text-sm text-slate-600">
              {activeSearchQuery ? (
                <>Showing server search results for: <span className="font-medium">"{activeSearchQuery}"</span></>
              ) : (
                <>Filtering {selectedView === "facts" ? facts.length : filteredCards.length} {selectedView === "facts" ? "fact" : "card"}{selectedView === "facts" ? (facts.length !== 1 ? "s" : "") : (filteredCards.length !== 1 ? "s" : "")} matching: <span className="font-medium">"{searchQuery}"</span></>
              )}
            </div>
          )}
        </div>

        {/* View Tabs */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-2">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSelectedView("facts");
                setSelectedCard(null);
              }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedView === "facts"
                  ? "bg-blue-600 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Facts
            </button>
            <button
              onClick={() => {
                setSelectedView("cards");
                setSelectedFact(null);
              }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedView === "cards"
                  ? "bg-blue-600 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => {
                setSelectedView("graph");
                setSelectedFact(null);
                setSelectedCard(null);
              }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedView === "graph"
                  ? "bg-blue-600 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Knowledge Graph
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {selectedView === "facts" && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200">
                <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Facts</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Browse and discover facts in your knowledge base
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCreateFact(!showCreateFact)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    {showCreateFact ? "Cancel" : "+ New Fact"}
                  </button>
                </div>
                
                {showCreateFact && (
                  <div className="p-6 border-b border-slate-200 bg-slate-50">
                    <form onSubmit={handleCreateFact}>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Fact Content
                        </label>
                        <textarea
                          value={factContent}
                          onChange={(e) => setFactContent(e.target.value)}
                          placeholder="Enter fact content..."
                          rows={4}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={createFactMutation.isPending}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {createFactMutation.isPending ? "Creating..." : "Create Fact"}
                      </button>
                    </form>
                  </div>
                )}

                {isLoadingFacts ? (
                  <div className="p-8 text-center">
                    <div className="text-slate-600">Loading facts...</div>
                  </div>
                ) : facts.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-lg font-medium text-slate-900 mb-2">No facts found</p>
                    <p className="text-slate-600">
                      {searchQuery && searchQuery.trim().length > 0
                        ? "No facts match your search. Try adjusting your search query or add new facts"
                        : activeSearchQuery && activeSearchQuery.trim().length > 0 
                        ? "Try adjusting your search or add new facts" 
                        : "Add new facts to get started"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {facts.map((fact: any) => {
                      const factIdDisplay = fact.id?.includes("/") 
                        ? fact.id.substring(fact.id.lastIndexOf("/") + 1)
                        : fact.id?.substring(0, 8) || "unknown";
                      return (
                        <div
                          key={fact.id}
                          onClick={() => setSelectedFact(fact.id)}
                          className={`p-6 hover:bg-slate-50 transition-colors cursor-pointer ${
                            selectedFact === fact.id ? "bg-blue-50 border-l-4 border-blue-600" : ""
                          }`}
                        >
                          <p className="text-slate-900 mb-2 leading-relaxed">{fact.content}</p>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                            <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                              ID: {factIdDisplay}
                            </span>
                            <span>{new Date(fact.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {selectedView === "cards" && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200">
                <div className="p-6 border-b border-slate-200">
                  <h2 className="text-2xl font-bold text-slate-900">Knowledge Cards</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Consolidated knowledge summaries from your facts
                  </p>
                </div>

                {cardsLoading ? (
                  <div className="p-8 text-center">
                    <div className="text-slate-600">Loading cards...</div>
                  </div>
                ) : !cardsData?.cards || cardsData.cards.length === 0 ? (
                  <div className="p-8 text-center">
                    <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <p className="text-lg font-medium text-slate-900 mb-2">No cards found</p>
                    <p className="text-slate-600">Cards are created when facts are consolidated</p>
                  </div>
                ) : filteredCards.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-lg font-medium text-slate-900 mb-2">No cards match your search</p>
                    <p className="text-slate-600">Try adjusting your search query</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {filteredCards.map((card: any) => (
                      <div
                        key={card.id}
                        onClick={() => setSelectedCard(card.id)}
                        className={`p-6 hover:bg-slate-50 transition-colors cursor-pointer ${
                          selectedCard === card.id ? "bg-indigo-50 border-l-4 border-indigo-600" : ""
                        }`}
                      >
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">{card.title}</h3>
                        <p className="text-slate-700 mb-3 leading-relaxed">{card.summary}</p>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(card.updated_at).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {card.fact_ids.length} fact{card.fact_ids.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedView === "graph" && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200">
                <div className="p-6 border-b border-slate-200">
                  <h2 className="text-2xl font-bold text-slate-900">Knowledge Graph</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Visualize relationships between facts
                  </p>
                </div>
                <div className="p-8 text-center">
                  <p className="text-slate-600">Graph visualization coming soon</p>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            {selectedFact && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 sticky top-24 space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Fact Details</h3>
                      {editingFactId !== selectedFact && (
                    <button
                      onClick={() => handleEditFact(selectedFact)}
                      className="text-xs px-2 py-1 bg-slate-600 text-white rounded hover:bg-slate-700 transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  {editingFactId === selectedFact ? (
                    <FactEditForm
                      factId={selectedFact}
                      content={facts.find((f: any) => f.id === selectedFact)?.content || ""}
                      isPending={updateFactMutation.isPending}
                      onSave={(content) => handleUpdateFact(selectedFact, content)}
                      onCancel={handleCancelEditFact}
                    />
                  ) : (
                    <>
                      <div>
                        <p className="text-sm font-medium text-slate-600 mb-1">Content</p>
                        <p className="text-slate-900">{facts.find((f: any) => f.id === selectedFact)?.content}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-600 mb-1">Created</p>
                        <p className="text-slate-900">
                          {new Date(facts.find((f: any) => f.id === selectedFact)?.created_at || "").toLocaleString()}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Relations Section */}
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-900">Relations</h4>
                    <button
                      onClick={() => setShowCreateRelation(!showCreateRelation)}
                      className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      {showCreateRelation ? "Cancel" : "+ Add"}
                    </button>
                  </div>

                  {showCreateRelation && (
                    <form onSubmit={handleCreateRelation} className="mb-4 p-3 bg-slate-50 rounded-lg space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">From Fact</label>
                        <select
                          value={relationFromFact || selectedFact || ""}
                          onChange={(e) => setRelationFromFact(e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                          required
                        >
                          <option value="">Select fact...</option>
                          {facts.map((f: any) => (
                            <option key={f.id} value={f.id}>
                              {f.content ? `${f.content.substring(0, 50)}...` : 'No content'}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Default: Currently selected fact</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">To Fact</label>
                        <select
                          value={relationToFact}
                          onChange={(e) => setRelationToFact(e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                          required
                        >
                          <option value="">Select fact...</option>
                          {facts.filter((f: any) => f.id !== relationFromFact).map((f: any) => (
                            <option key={f.id} value={f.id}>{f.content ? `${f.content.substring(0, 50)}...` : 'No content'}</option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">Select the fact this relates to</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                        <select
                          value={relationType}
                          onChange={(e) => setRelationType(e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="related_to">Related To</option>
                          <option value="references">References</option>
                          <option value="depends_on">Depends On</option>
                          <option value="part_of">Part Of</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        disabled={createFactRelationMutation.isPending}
                        className="w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {createFactRelationMutation.isPending ? "Creating..." : "Create Relation"}
                      </button>
                    </form>
                  )}

                  {/* Display Relations */}
                  {factRelationsData && (
                    <div className="space-y-3">
                      {factRelationsData.outgoing && factRelationsData.outgoing.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-2">Outgoing Relations</p>
                          <div className="space-y-2">
                            {factRelationsData.outgoing
                              .filter((rel: any) => {
                                // Validate that we have a fact and it's a valid fact ID (not a relation ID)
                                const factId = rel.fact?.id || rel.fact?._id || "";
                                const isValidFactId = factId && (
                                  factId.startsWith("facts/") || 
                                  (!factId.includes("/") && factId.length > 0) ||
                                  (rel.fact?._id && rel.fact._id.startsWith("facts/"))
                                );
                                if (!isValidFactId) {
                                  console.warn("Invalid fact ID in outgoing relation, skipping:", {
                                    factId,
                                    relationId: rel.relation?.id,
                                    fact: rel.fact
                                  });
                                  return false;
                                }
                                return rel.fact && factId;
                              })
                              .map((rel: any, index: number) => {
                                const relationDocId =
                                  rel.relation.id ||
                                  rel.relation._id ||
                                  (rel.relation._key ? `fact_relations/${rel.relation._key}` : "");
                                const relationStateKey = rel.relation._key || relationDocId || `outgoing-${index}`;
                                const relationRenderKey = `${relationStateKey || "outgoing"}-outgoing-${rel.fact?.id || rel.fact?._id || index}`;
                                const editingState = relationStateKey ? editingRelations[relationStateKey] : undefined;
                                const isEditing = editingState !== undefined;

                                if (!relationDocId) {
                                  console.warn("Relation missing ID (outgoing)", rel.relation);
                                }

                                // Extract fact ID - ensure it's a valid fact ID
                                let relatedFactId = rel.fact?.id || rel.fact?._id || "";
                                // If it's not in the correct format, try to normalize it
                                if (relatedFactId && !relatedFactId.startsWith("facts/") && rel.fact?._id) {
                                  relatedFactId = rel.fact._id.startsWith("facts/") ? rel.fact._id : `facts/${rel.fact._key || relatedFactId}`;
                                }

                                const availableFactsList = facts
                                  .filter((f: any) => {
                                    const factId = f.id || f._id;
                                    return factId !== selectedFact;
                                  })
                                  .map((f: any) => ({
                                    id: f.id || f._id,
                                    content: f.content || "",
                                  }));

                                const relatedFactAlreadyPresent = availableFactsList.some(
                                  (f: any) => (f.id || "").toString() === relatedFactId.toString()
                                );

                                if (!relatedFactAlreadyPresent && rel.fact && relatedFactId) {
                                  availableFactsList.push({
                                    id: relatedFactId,
                                    content: rel.fact.content || "",
                                  });
                                }

                                return (
                                  <RelationItem
                                    key={relationRenderKey}
                                    relation={rel}
                                    isEditing={isEditing}
                                    editingType={editingState?.type || rel.relation.type}
                                    editingFactId={editingState?.factId || relatedFactId}
                                    isUpdating={updateRelationMutation.isPending || deleteRelationMutation.isPending || createFactRelationMutation.isPending}
                                    isDeleting={deleteRelationMutation.isPending}
                                    variant="outgoing"
                                    onEdit={() => handleEditRelation(relationStateKey, rel.relation.type, relatedFactId)}
                                    onCancelEdit={() => handleCancelEditRelation(relationStateKey)}
                                    onSave={(type, factId) => handleUpdateRelation(relationDocId, type, factId, rel, "outgoing")}
                                    onDelete={() => handleDeleteRelation(relationDocId)}
                                    onSelectFact={(factId) => {
                                      setSelectedFact(factId);
                                      setSelectedView("facts");
                                    }}
                                    availableFacts={availableFactsList}
                                  />
                                );
                              })}
                          </div>
                        </div>
                      )}
                      {factRelationsData.incoming && factRelationsData.incoming.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-2">Incoming Relations</p>
                          <div className="space-y-2">
                            {factRelationsData.incoming
                              .filter((rel: any) => {
                                // Validate that we have a fact and it's a valid fact ID (not a relation ID)
                                const factId = rel.fact?.id || rel.fact?._id || "";
                                const isValidFactId = factId && (
                                  factId.startsWith("facts/") || 
                                  (!factId.includes("/") && factId.length > 0) ||
                                  (rel.fact?._id && rel.fact._id.startsWith("facts/"))
                                );
                                if (!isValidFactId) {
                                  console.warn("Invalid fact ID in incoming relation, skipping:", {
                                    factId,
                                    relationId: rel.relation?.id,
                                    fact: rel.fact
                                  });
                                  return false;
                                }
                                return rel.fact && factId;
                              })
                              .map((rel: any, index: number) => {
                                const relationDocId =
                                  rel.relation.id ||
                                  rel.relation._id ||
                                  (rel.relation._key ? `fact_relations/${rel.relation._key}` : "");
                                const relationStateKey = rel.relation._key || relationDocId || `incoming-${index}`;
                                const relationRenderKey = `${relationStateKey || "incoming"}-incoming-${rel.fact?.id || rel.fact?._id || index}`;
                                const editingState = relationStateKey ? editingRelations[relationStateKey] : undefined;
                                const isEditing = editingState !== undefined;

                                if (!relationDocId) {
                                  console.warn("Relation missing ID (incoming)", rel.relation);
                                }

                                // Extract fact ID - ensure it's a valid fact ID
                                let relatedFactId = rel.fact?.id || rel.fact?._id || "";
                                // If it's not in the correct format, try to normalize it
                                if (relatedFactId && !relatedFactId.startsWith("facts/") && rel.fact?._id) {
                                  relatedFactId = rel.fact._id.startsWith("facts/") ? rel.fact._id : `facts/${rel.fact._key || relatedFactId}`;
                                }

                                const availableFactsList = facts
                                  .filter((f: any) => {
                                    const factId = f.id || f._id;
                                    return factId !== selectedFact;
                                  })
                                  .map((f: any) => ({
                                    id: f.id || f._id,
                                    content: f.content || "",
                                  }));

                                const relatedFactAlreadyPresent = availableFactsList.some(
                                  (f: any) => (f.id || "").toString() === relatedFactId.toString()
                                );

                                if (!relatedFactAlreadyPresent && rel.fact && relatedFactId) {
                                  availableFactsList.push({
                                    id: relatedFactId,
                                    content: rel.fact.content || "",
                                  });
                                }
                              
                                return (
                                  <RelationItem
                                    key={relationRenderKey}
                                    relation={rel}
                                    isEditing={isEditing}
                                    editingType={editingState?.type || rel.relation.type}
                                    editingFactId={editingState?.factId || relatedFactId}
                                    isUpdating={updateRelationMutation.isPending || deleteRelationMutation.isPending || createFactRelationMutation.isPending}
                                    isDeleting={deleteRelationMutation.isPending}
                                    variant="incoming"
                                    onEdit={() => handleEditRelation(relationStateKey, rel.relation.type, relatedFactId)}
                                    onCancelEdit={() => handleCancelEditRelation(relationStateKey)}
                                    onSave={(type, factId) => handleUpdateRelation(relationDocId, type, factId, rel, "incoming")}
                                    onDelete={() => handleDeleteRelation(relationDocId)}
                                    onSelectFact={(factId) => {
                                      setSelectedFact(factId);
                                      setSelectedView("facts");
                                    }}
                                    availableFacts={availableFactsList}
                                  />
                                );
                              })}
                          </div>
                        </div>
                      )}
                      {(!factRelationsData.outgoing || factRelationsData.outgoing.length === 0) &&
                        (!factRelationsData.incoming || factRelationsData.incoming.length === 0) && (
                          <p className="text-xs text-slate-500">No relations yet</p>
                        )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedFact(null)}
                  className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Close
                </button>
              </div>
            )}

            {selectedCard && selectedCardData?.card && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 sticky top-24 space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Card Details</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Title</p>
                    <p className="text-slate-900 font-semibold">{selectedCardData.card.title}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Summary</p>
                    <p className="text-slate-900">{selectedCardData.card.summary}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Content</p>
                    <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">{selectedCardData.card.content}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Fact Count</p>
                    <p className="text-slate-900">{selectedCardData.card.fact_ids.length} fact{selectedCardData.card.fact_ids.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Created</p>
                    <p className="text-slate-900">
                      {new Date(selectedCardData.card.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Last Updated</p>
                    <p className="text-slate-900">
                      {new Date(selectedCardData.card.updated_at).toLocaleString()}
                    </p>
                  </div>
                  {selectedCardData.card.metadata && Object.keys(selectedCardData.card.metadata).length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-slate-600 mb-1">Metadata</p>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap">
                          {JSON.stringify(selectedCardData.card.metadata, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedCard(null)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => handleDeleteCard(selectedCard)}
                    disabled={deleteCardMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleteCardMutation.isPending ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
