import type { BotData, DayCount } from "@/lib/types";
import { filterByDateRange } from "@/lib/date-range-filter";

/**
 * Re-project the Bots page onto an active date range.
 *
 * Unlike clusters, the parser writes a full per-bot `byDay` array on every
 * run (see lib/parser/index.ts around line 412), so bot request counts can
 * always be filtered regardless of whether the newer `detailByDay` exists.
 *
 * Humans are not tracked as their own series. We derive them from
 * `summary.requestsByDay` minus the summed bot counts per day, matching the
 * parser's definition: humanRequests = total - isBot requests.
 *
 * avgResponseTime is NOT recoverable here — the parser accumulates a single
 * global sum/count for each of the bot and human buckets, not a daily
 * reservoir. Leave it at the full-range value and let the UI mark it.
 *
 * topPages per bot: same limitation, not tracked per day. Full-range only.
 */

export type ProjectedBot = {
  name: string;
  /** Filtered request count, derived from byDay within the window. */
  requests: number;
  byDay: DayCount[];
  topPages: { url: string; count: number }[];
};

export interface ProjectedBots {
  bots: ProjectedBot[];
  botVsHuman: {
    bot: { requests: number; avgResponseTime: number };
    human: { requests: number; avgResponseTime: number };
  };
  totalRequests: number;
  isFiltered: boolean;
}

export function projectBots(
  botsMap: Record<string, BotData>,
  requestsByDay: DayCount[],
  botVsHuman: {
    bot: { requests: number; avgResponseTime: number };
    human: { requests: number; avgResponseTime: number };
  },
  totalRequests: number,
  from: string | null,
  to: string | null,
): ProjectedBots {
  const isFiltered = !!(from || to);

  // Build per-bot projections. Sort the full result by filtered requests desc
  // so the "All Bots" table renders in the correct order under any filter.
  const bots: ProjectedBot[] = Object.entries(botsMap)
    .map(([name, b]): ProjectedBot => {
      if (!isFiltered) {
        return { name, requests: b.requests, byDay: b.byDay, topPages: b.topPages };
      }
      const filteredDays = filterByDateRange(b.byDay, "date", from, to);
      const requests = filteredDays.reduce((s, d) => s + d.count, 0);
      return { name, requests, byDay: filteredDays, topPages: b.topPages };
    })
    .filter((b) => !isFiltered || b.requests > 0)
    .sort((a, b) => b.requests - a.requests);

  if (!isFiltered) {
    return { bots, botVsHuman, totalRequests, isFiltered: false };
  }

  // Filtered totals
  const filteredTotalRequests = filterByDateRange(requestsByDay, "date", from, to)
    .reduce((s, d) => s + d.count, 0);

  const filteredBotRequests = bots.reduce((s, b) => s + b.requests, 0);
  const filteredHumanRequests = Math.max(0, filteredTotalRequests - filteredBotRequests);

  return {
    bots,
    botVsHuman: {
      // avgResponseTime stays full-range — not projectable from current data.
      bot: { requests: filteredBotRequests, avgResponseTime: botVsHuman.bot.avgResponseTime },
      human: { requests: filteredHumanRequests, avgResponseTime: botVsHuman.human.avgResponseTime },
    },
    totalRequests: filteredTotalRequests,
    isFiltered: true,
  };
}
