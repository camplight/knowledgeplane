"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { AppLayout } from "../components/AppLayout";
import { KnowledgePlanesChart } from "../components/KnowledgePlanesChart";

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
  const { data: relationsData } = trpc.factRelations.list.useQuery({
    limit: 1,
    offset: 0,
  });

  useEffect(() => {
    if (!userLoading && !userData?.user) {
      router.push("/");
    }
  }, [userLoading, userData, router]);

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <div className="text-xl text-base-content">Loading...</div>
        </div>
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
  const totalRelations = relationsData?.total || 0;

  const hasNoContent = totalFacts === 0 && totalCards === 0;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-base-content">Dashboard</h1>
            <p className="text-xs sm:text-sm text-base-content/60 mt-1">
              Welcome back, {user.username}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="stats stats-vertical sm:stats-horizontal shadow w-full mb-4 sm:mb-6 bg-base-100 border border-base-300">
          <div className="stat">
            <div className="stat-figure text-primary">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="stat-title">Total Facts</div>
            <div className="stat-value text-primary">{totalFacts}</div>
            <div className="stat-desc">Knowledge base entries</div>
          </div>

          <div className="stat">
            <div className="stat-figure text-secondary">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div className="stat-title">Knowledge Cards</div>
            <div className="stat-value text-secondary">{totalCards}</div>
            <div className="stat-desc">Consolidated information</div>
          </div>

          <div className="stat">
            <div className="stat-figure text-accent">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div className="stat-title">Relations</div>
            <div className="stat-value text-accent">{totalRelations}</div>
            <div className="stat-desc">Connected facts</div>
          </div>
        </div>

        {/* Getting Started - Only show if no content */}
        {hasNoContent && (
          <div className="card bg-base-100 shadow-lg mb-6 border border-base-300">
            <div className="card-body">
              <h2 className="card-title text-xl">Get Started</h2>
              <p className="text-sm text-base-content/70">
                Build your knowledge base by adding facts or uploading documents
              </p>
              <div className="flex gap-3 mt-4">
                <Link href="/upload" className="btn btn-primary btn-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Document
                </Link>
                <Link href="/editor?view=facts" className="btn btn-outline btn-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Fact
                </Link>
                <Link href="/chat" className="btn btn-outline btn-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  Start Chat
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Knowledge Planes Growth Chart - First Class Citizen */}
        <div className="mb-6">
          <KnowledgePlanesChart />
        </div>

        {/* Facts List - Using DaisyUI card component */}
        {!hasNoContent && totalFacts > 0 && (
          <div className="card bg-base-100 shadow-lg border border-base-300 mb-6">
            <div className="card-body">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="card-title text-xl">Recent Facts</h2>
                  <p className="text-xs text-base-content/60 mt-1">
                    {totalFacts} total fact{totalFacts !== 1 ? 's' : ''} in your knowledge base
                  </p>
                </div>
                <Link href="/editor?view=facts" className="btn btn-primary btn-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Fact
                </Link>
              </div>

              {factsLoading ? (
                <div className="py-8 text-center">
                  <span className="loading loading-spinner loading-lg text-primary"></span>
                  <p className="text-base-content/70 mt-4">Loading facts...</p>
                </div>
              ) : (
              <>
                <div className="divide-y divide-base-300">
                  {facts.map((fact) => (
                    <div
                      key={fact.id}
                      onClick={() => router.push(`/editor?view=facts&factId=${encodeURIComponent(fact.id)}`)}
                      className="py-3 hover:bg-base-200 transition-colors cursor-pointer rounded-lg px-3 -mx-3"
                    >
                      <p className="text-sm text-base-content mb-2 leading-relaxed line-clamp-2">{fact.content}</p>
                      <div className="flex items-center gap-2 text-xs text-base-content/50">
                        <span>{new Date(fact.created_at).toLocaleDateString()}</span>
                        {fact.metadata && Object.keys(fact.metadata).length > 0 && (
                          <>
                            <span>•</span>
                            <span>{Object.keys(fact.metadata).length} metadata</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {factsTotalPages > 1 && (
                  <div className="flex justify-between items-center pt-3 mt-3 border-t border-base-300">
                    <div className="text-xs text-base-content/60">
                      {factsPage * limit + 1}-{Math.min((factsPage + 1) * limit, totalFacts)} of {totalFacts}
                    </div>
                    <div className="join">
                      <button
                        onClick={() => setFactsPage(Math.max(0, factsPage - 1))}
                        disabled={factsPage === 0}
                        className="join-item btn btn-xs"
                      >
                        ‹
                      </button>
                      <button
                        onClick={() => setFactsPage(Math.min(factsTotalPages - 1, factsPage + 1))}
                        disabled={factsPage >= factsTotalPages - 1}
                        className="join-item btn btn-xs"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            </div>
          </div>
        )}

        {/* Knowledge Cards List - Using DaisyUI card component */}
        {!hasNoContent && totalCards > 0 && (
          <div className="card bg-base-100 shadow-lg border border-base-300">
            <div className="card-body">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="card-title text-xl">Knowledge Cards</h2>
                  <p className="text-xs text-base-content/60 mt-1">
                    {totalCards} consolidated card{totalCards !== 1 ? 's' : ''} from your facts
                  </p>
                </div>
                <Link href="/editor?view=cards" className="btn btn-secondary btn-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  View All
                </Link>
              </div>

              {cardsLoading ? (
                <div className="py-8 text-center">
                  <span className="loading loading-spinner loading-lg text-secondary"></span>
                  <p className="text-base-content/70 mt-4">Loading cards...</p>
                </div>
              ) : (
              <>
                <div className="divide-y divide-base-300">
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      onClick={() => router.push(`/editor?view=cards&cardId=${encodeURIComponent(card.id)}`)}
                      className="py-3 hover:bg-base-200 transition-colors cursor-pointer rounded-lg px-3 -mx-3"
                    >
                      <h3 className="text-base font-semibold text-base-content mb-1">{card.title}</h3>
                      <p className="text-sm text-base-content/70 mb-2 leading-relaxed line-clamp-2">{card.summary}</p>
                      <div className="flex items-center gap-2 text-xs text-base-content/50">
                        <span>{new Date(card.updated_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <div className="badge badge-primary badge-xs">
                          {card.fact_ids.length} fact{card.fact_ids.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {cardsTotalPages > 1 && (
                  <div className="flex justify-between items-center pt-3 mt-3 border-t border-base-300">
                    <div className="text-xs text-base-content/60">
                      {cardsPage * limit + 1}-{Math.min((cardsPage + 1) * limit, totalCards)} of {totalCards}
                    </div>
                    <div className="join">
                      <button
                        onClick={() => setCardsPage(Math.max(0, cardsPage - 1))}
                        disabled={cardsPage === 0}
                        className="join-item btn btn-xs"
                      >
                        ‹
                      </button>
                      <button
                        onClick={() => setCardsPage(Math.min(cardsTotalPages - 1, cardsPage + 1))}
                        disabled={cardsPage >= cardsTotalPages - 1}
                        className="join-item btn btn-xs"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

