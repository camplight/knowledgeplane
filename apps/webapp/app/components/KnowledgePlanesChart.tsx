"use client";

import { useEffect, useState } from "react";
import { trpc } from "../../utils/trpc";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  timestamp: string;
  date: string;
  facts: number;
  cards: number;
  relations: number;
}

export function KnowledgePlanesChart() {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const { data: factsData } = trpc.facts.list.useQuery(
    { limit: 100, offset: 0, includeTrashed: false },
    { refetchInterval: 30000 } // Poll every 30s
  );
  const { data: cardsData } = trpc.cards.list.useQuery(
    { limit: 100, offset: 0 },
    { refetchInterval: 30000 }
  );
  const { data: relationsData } = trpc.factRelations.list.useQuery(
    { limit: 100, offset: 0 },
    { refetchInterval: 30000 }
  );

  useEffect(() => {
    if (factsData && cardsData && relationsData) {
      // Count items created in each day for the last 30 days
      const now = new Date();
      const points: DataPoint[] = [];

      // Generate last 30 days
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const dateStr = date.toISOString().split('T')[0];

        // Count items created ON this specific day (not cumulative)
        const factsCount = factsData.facts.filter(f => {
          const createdAt = new Date(f.created_at);
          return createdAt >= date && createdAt < nextDate;
        }).length;

        const cardsCount = cardsData.cards.filter(c => {
          const createdAt = new Date(c.created_at);
          return createdAt >= date && createdAt < nextDate;
        }).length;

        const relationsCount = relationsData.relations.filter(r => {
          const createdAt = new Date(r.created_at);
          return createdAt >= date && createdAt < nextDate;
        }).length;

        // Build cumulative totals for visualization
        const prevPoint = points[points.length - 1];
        const cumulativeFacts = (prevPoint?.facts || 0) + factsCount;
        const cumulativeCards = (prevPoint?.cards || 0) + cardsCount;
        const cumulativeRelations = (prevPoint?.relations || 0) + relationsCount;

        points.push({
          timestamp: date.toISOString(),
          date: dateStr,
          facts: cumulativeFacts,
          cards: cumulativeCards,
          relations: cumulativeRelations,
        });
      }

      setDataPoints(points);
    }
  }, [factsData, cardsData, relationsData]);

  const totalFacts = factsData?.total || 0;
  const totalCards = cardsData?.total || 0;
  const totalRelations = relationsData?.total || 0;
  const hasData = totalFacts > 0 || totalCards > 0 || totalRelations > 0;

  if (!hasData) {
    return (
      <div className="card bg-base-100 shadow-xl border border-base-300">
        <div className="card-body p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-2 font-mono">Knowledge Growth</h2>
          <p className="text-xs sm:text-sm text-base-content/60 mb-4 sm:mb-6">
            Track your knowledge base expansion over time
          </p>

          {/* Empty State */}
          <div className="relative h-64 flex items-center justify-center">
            <div className="absolute inset-0 opacity-10">
              <svg className="w-full h-full" viewBox="0 0 400 200">
                <defs>
                  <linearGradient id="emptyGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.3" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,100 Q100,50 200,80 T400,100 L400,200 L0,200 Z"
                  fill="url(#emptyGrad1)"
                />
                <path
                  d="M0,120 Q100,90 200,110 T400,120 L400,200 L0,200 Z"
                  fill="url(#emptyGrad1)"
                  opacity="0.6"
                />
              </svg>
            </div>

            <div className="relative text-center">
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="w-12 h-1 bg-primary/20 rounded-full"></div>
                <svg className="w-8 h-8 text-primary/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <div className="w-12 h-1 bg-secondary/20 rounded-full"></div>
              </div>
              <p className="text-sm font-medium text-base-content/50 font-mono">
                Your knowledge planes will appear here
              </p>
              <p className="text-xs text-base-content/40 mt-2 font-mono">
                Start adding facts to see growth over time
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const date = new Date(payload[0].payload.timestamp);
      return (
        <div className="bg-base-100 border border-base-300 rounded-lg p-3 shadow-lg">
          <p className="text-xs font-mono text-base-content/60 mb-2">
            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary"></div>
              <span className="text-sm font-mono">Facts: {payload[0].value}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-secondary"></div>
              <span className="text-sm font-mono">Cards: {payload[1].value}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accent"></div>
              <span className="text-sm font-mono">Relations: {payload[2].value}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300 overflow-hidden">
      <div className="card-body p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold font-mono">Knowledge Growth</h2>
            <p className="text-xs text-base-content/60 mt-1 font-mono hidden sm:block">
              Last 30 days • Updates every 30s
            </p>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
              <div className="absolute inset-0 w-2 h-2 bg-success rounded-full animate-ping"></div>
            </div>
            <span className="text-xs font-mono text-success hidden sm:inline">Live</span>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-1 sm:gap-3">
            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-primary flex-shrink-0"></div>
            <div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-primary">{totalFacts}</div>
              <div className="text-[10px] sm:text-xs text-base-content/60 font-mono">Facts</div>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-secondary flex-shrink-0"></div>
            <div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-secondary">{totalCards}</div>
              <div className="text-[10px] sm:text-xs text-base-content/60 font-mono">Cards</div>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-accent flex-shrink-0"></div>
            <div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-accent">{totalRelations}</div>
              <div className="text-[10px] sm:text-xs text-base-content/60 font-mono">Relations</div>
            </div>
          </div>
        </div>

        {/* Intersecting Planes Chart */}
        <div className="relative h-48 sm:h-64 lg:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={dataPoints}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorFacts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCards" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorRelations" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.getDate().toString();
                }}
                stroke="currentColor"
                opacity={0.5}
                style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}
              />
              <YAxis
                stroke="currentColor"
                opacity={0.5}
                style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="facts"
                stroke="#f59e0b"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorFacts)"
              />
              <Area
                type="monotone"
                dataKey="cards"
                stroke="#6366f1"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCards)"
              />
              <Area
                type="monotone"
                dataKey="relations"
                stroke="#14b8a6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRelations)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
