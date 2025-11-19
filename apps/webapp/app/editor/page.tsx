"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Navigation } from "../components/Navigation";

export default function EditorPage() {
  const router = useRouter();
  const [selectedView, setSelectedView] = useState<"facts" | "cards" | "graph">("facts");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFact, setSelectedFact] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  
  // Create fact form state
  const [showCreateFact, setShowCreateFact] = useState(false);
  const [factContent, setFactContent] = useState("");

  // Fact relation form state
  const [showCreateRelation, setShowCreateRelation] = useState(false);
  const [relationFromFact, setRelationFromFact] = useState("");
  const [relationToFact, setRelationToFact] = useState("");
  const [relationType, setRelationType] = useState("related_to");

  // Update relationFromFact when selectedFact changes
  useEffect(() => {
    if (selectedFact) {
      setRelationFromFact(selectedFact);
    }
  }, [selectedFact]);

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

  // Search facts
  const { data: searchResults, refetch: refetchSearch } = trpc.facts.search.useQuery(
    {
      query: searchQuery || "*",
      k: 20,
    },
    { enabled: false }
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
      setRelationFromFact("");
      setRelationToFact("");
      setRelationType("related_to");
      setShowCreateRelation(false);
      refetchFactRelations();
    },
  });

  useEffect(() => {
    if (!userLoading && !userData?.user) {
      router.push("/");
    }
  }, [userLoading, userData, router]);

  const handleSearch = () => {
    if (searchQuery) {
      refetchSearch();
    }
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

  const facts = searchQuery && searchResults ? searchResults.results : (factsData?.facts || []);
  const user = userData.user;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Bar */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search facts, cards, or browse knowledge graph..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Search
            </button>
          </div>
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

                {factsLoading ? (
                  <div className="p-8 text-center">
                    <div className="text-slate-600">Loading facts...</div>
                  </div>
                ) : facts.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-lg font-medium text-slate-900 mb-2">No facts found</p>
                    <p className="text-slate-600">Try adjusting your search or add new facts</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {facts.map((fact: any) => (
                      <div
                        key={fact.id}
                        onClick={() => setSelectedFact(fact.id)}
                        className={`p-6 hover:bg-slate-50 transition-colors cursor-pointer ${
                          selectedFact === fact.id ? "bg-blue-50 border-l-4 border-blue-600" : ""
                        }`}
                      >
                        <p className="text-slate-900 mb-2 leading-relaxed">{fact.content}</p>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                          <span>{new Date(fact.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
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
                ) : (
                  <div className="divide-y divide-slate-200">
                    {cardsData.cards.map((card: any) => (
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
                <h3 className="text-lg font-bold text-slate-900 mb-4">Fact Details</h3>
                <div className="space-y-4">
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
                              {f.content.substring(0, 50)}...
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
                            <option key={f.id} value={f.id}>{f.content.substring(0, 50)}...</option>
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
                            {factRelationsData.outgoing.map((rel: any) => (
                              <div key={rel.relation.id} className="text-xs p-2 bg-slate-50 rounded border border-slate-200">
                                <span className="font-medium text-blue-600">{rel.relation.type}</span>
                                <p className="text-slate-700 mt-1">{rel.fact.content.substring(0, 60)}...</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {factRelationsData.incoming && factRelationsData.incoming.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-2">Incoming Relations</p>
                          <div className="space-y-2">
                            {factRelationsData.incoming.map((rel: any) => (
                              <div key={rel.relation.id} className="text-xs p-2 bg-slate-50 rounded border border-slate-200">
                                <span className="font-medium text-green-600">{rel.relation.type}</span>
                                <p className="text-slate-700 mt-1">{rel.fact.content.substring(0, 60)}...</p>
                              </div>
                            ))}
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
                <h3 className="text-lg font-bold text-slate-900 mb-4">Card Details</h3>
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

                <button
                  onClick={() => setSelectedCard(null)}
                  className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
