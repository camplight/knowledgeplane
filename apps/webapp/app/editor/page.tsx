"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Navigation } from "../components/Navigation";

export default function EditorPage() {
  const router = useRouter();
  const [selectedView, setSelectedView] = useState<"facts" | "cards" | "categories" | "graph">("facts");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFact, setSelectedFact] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [knowledgeContext, setKnowledgeContext] = useState<string>("");

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();
  
  // Facts queries
  const { data: factsData, isLoading: factsLoading } = trpc.facts.list.useQuery({
    limit: 50,
    offset: 0,
    includeTrashed: false,
  });

  // Search facts
  const { data: searchResults, refetch: refetchSearch } = trpc.facts.search.useQuery(
    {
      query: searchQuery || "*",
      knowledge_context: knowledgeContext || undefined,
      k: 20,
    },
    { enabled: false }
  );

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
            <div className="w-64">
              <input
                type="text"
                placeholder="Knowledge context (optional)"
                value={knowledgeContext}
                onChange={(e) => setKnowledgeContext(e.target.value)}
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
              onClick={() => setSelectedView("facts")}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedView === "facts"
                  ? "bg-blue-600 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Facts
            </button>
            <button
              onClick={() => setSelectedView("cards")}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedView === "cards"
                  ? "bg-blue-600 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => setSelectedView("categories")}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedView === "categories"
                  ? "bg-blue-600 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Categories
            </button>
            <button
              onClick={() => setSelectedView("graph")}
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
                <div className="p-6 border-b border-slate-200">
                  <h2 className="text-2xl font-bold text-slate-900">Facts</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Browse and discover facts in your knowledge base
                  </p>
                </div>
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
                          {fact.knowledge_context && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md">
                              {fact.knowledge_context}
                            </span>
                          )}
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
                  <h2 className="text-2xl font-bold text-slate-900">Cards</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Consolidated knowledge summaries
                  </p>
                </div>
                <div className="p-8 text-center">
                  <p className="text-slate-600">Card view coming soon</p>
                </div>
              </div>
            )}

            {selectedView === "categories" && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200">
                <div className="p-6 border-b border-slate-200">
                  <h2 className="text-2xl font-bold text-slate-900">Categories</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Organized knowledge categories
                  </p>
                </div>
                <div className="p-8 text-center">
                  <p className="text-slate-600">Category view coming soon</p>
                </div>
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
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 sticky top-24">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Fact Details</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Content</p>
                    <p className="text-slate-900">{facts.find((f: any) => f.id === selectedFact)?.content}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Knowledge Context</p>
                    <p className="text-slate-900">{facts.find((f: any) => f.id === selectedFact)?.knowledge_context || "None"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Created</p>
                    <p className="text-slate-900">
                      {new Date(facts.find((f: any) => f.id === selectedFact)?.created_at || "").toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedFact(null)}
                    className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Close
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

