"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Navigation } from "../components/Navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [factsPage, setFactsPage] = useState(0);
  const [cardsPage, setCardsPage] = useState(0);
  const limit = 10;

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();
  const { data: factsData, isLoading: factsLoading } = trpc.facts.list.useQuery({
    limit,
    offset: factsPage * limit,
    includeTrashed: false,
  });
  const { data: cardsData, isLoading: cardsLoading } = trpc.cards.list.useQuery({
    limit,
    offset: cardsPage * limit,
  });

  useEffect(() => {
    if (!userLoading && !userData?.user) {
      router.push("/");
    }
  }, [userLoading, userData, router]);

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

  const user = userData.user;
  const facts = factsData?.facts || [];
  const totalFacts = factsData?.total || 0;
  const factsTotalPages = Math.ceil(totalFacts / limit);
  const cards = cardsData?.cards || [];
  const totalCards = cardsData?.total || 0;
  const cardsTotalPages = Math.ceil(totalCards / limit);

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Welcome back, <span className="gradient-text-blue">{user.username}</span>!
          </h1>
          <p className="text-lg text-slate-600">
            Manage your knowledge base and facts
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Total Facts</p>
                <p className="text-3xl font-bold text-slate-900">{totalFacts}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Knowledge Cards</p>
                <p className="text-3xl font-bold text-slate-900">{totalCards}</p>
              </div>
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Active Facts</p>
                <p className="text-3xl font-bold text-slate-900">{facts.length}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Facts List */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900">Your Facts</h2>
            <p className="text-sm text-slate-600 mt-1">
              View and manage your knowledge base facts
            </p>
          </div>

          {factsLoading ? (
            <div className="p-8 text-center">
              <div className="text-slate-600">Loading facts...</div>
            </div>
          ) : facts.length === 0 ? (
            <div className="p-8 text-center">
              <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium text-slate-900 mb-2">No facts yet</p>
              <p className="text-slate-600">
                Start adding facts to build your knowledge base
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-200">
                {facts.map((fact) => (
                  <div key={fact.id} className="p-6 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-slate-900 mb-2 leading-relaxed">{fact.content}</p>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(fact.created_at).toLocaleDateString()}
                          </span>
                          {fact.metadata && Object.keys(fact.metadata).length > 0 && (
                            <span className="text-xs text-slate-400">
                              {Object.keys(fact.metadata).length} metadata field{Object.keys(fact.metadata).length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {factsTotalPages > 1 && (
                <div className="p-6 border-t border-slate-200 flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    Showing {factsPage * limit + 1} to {Math.min((factsPage + 1) * limit, totalFacts)} of {totalFacts} facts
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFactsPage(Math.max(0, factsPage - 1))}
                      disabled={factsPage === 0}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setFactsPage(Math.min(factsTotalPages - 1, factsPage + 1))}
                      disabled={factsPage >= factsTotalPages - 1}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Knowledge Cards List */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mt-8">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900">Knowledge Cards</h2>
            <p className="text-sm text-slate-600 mt-1">
              Consolidated knowledge cards from your facts
            </p>
          </div>

          {cardsLoading ? (
            <div className="p-8 text-center">
              <div className="text-slate-600">Loading cards...</div>
            </div>
          ) : cards.length === 0 ? (
            <div className="p-8 text-center">
              <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-lg font-medium text-slate-900 mb-2">No knowledge cards yet</p>
              <p className="text-slate-600">
                Cards are created when facts are consolidated
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-200">
                {cards.map((card) => (
                  <div key={card.id} className="p-6 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
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
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {cardsTotalPages > 1 && (
                <div className="p-6 border-t border-slate-200 flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    Showing {cardsPage * limit + 1} to {Math.min((cardsPage + 1) * limit, totalCards)} of {totalCards} cards
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCardsPage(Math.max(0, cardsPage - 1))}
                      disabled={cardsPage === 0}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCardsPage(Math.min(cardsTotalPages - 1, cardsPage + 1))}
                      disabled={cardsPage >= cardsTotalPages - 1}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

