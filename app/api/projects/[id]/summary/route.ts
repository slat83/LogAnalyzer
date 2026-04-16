import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Summary, Cluster, BotData, DayCount, ClusterDayDetail } from "@/lib/types";
import { fetchAllPaged } from "@/lib/paginate";

type ClusterDailyRow = { cluster_id: string; day: string; request_count: number };
type ClusterUARow = { cluster_id: string; user_agent: string; request_count: number };
type BotDailyRow = { bot_id: string; day: string; request_count: number };

async function fetchClusterDaily(
  supabase: SupabaseClient,
  clusterIds: string[],
): Promise<ClusterDailyRow[]> {
  return fetchAllPaged<ClusterDailyRow>((from, to) =>
    supabase
      .from("cluster_daily")
      .select("cluster_id, day, request_count")
      .in("cluster_id", clusterIds)
      .order("day")
      .range(from, to),
  );
}

async function fetchClusterUAs(
  supabase: SupabaseClient,
  clusterIds: string[],
): Promise<ClusterUARow[]> {
  return fetchAllPaged<ClusterUARow>((from, to) =>
    supabase
      .from("cluster_user_agents")
      .select("cluster_id, user_agent, request_count")
      .in("cluster_id", clusterIds)
      .order("request_count", { ascending: false })
      .range(from, to),
  );
}

async function fetchBotDaily(
  supabase: SupabaseClient,
  botIds: string[],
): Promise<BotDailyRow[]> {
  return fetchAllPaged<BotDailyRow>((from, to) =>
    supabase
      .from("bot_daily")
      .select("bot_id, day, request_count")
      .in("bot_id", botIds)
      .order("day")
      .range(from, to),
  );
}
/**
 * GET /api/projects/[id]/summary
 * Reconstructs a full Summary object from the normalized DB tables.
 * This is what dashboard pages consume — same shape as the old static JSON.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Get latest analysis run
  const { data: run, error: runErr } = await supabase
    .from("analysis_runs")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (runErr || !run) {
    return NextResponse.json({ error: "No analysis found" }, { status: 404 });
  }

  const runId = run.id;

  // 2. Fetch all normalized data in parallel
  const [
    clustersRes,
    errorsRes,
    botsRes,
    redirectsRes,
    gone410Res,
    langsRes,
  ] = await Promise.all([
    supabase.from("clusters").select("id, pattern, request_count, statuses, rt_avg, rt_p95").eq("run_id", runId).order("request_count", { ascending: false }),
    supabase.from("error_entries").select("error_type, pattern, request_count, avg_time, examples").eq("run_id", runId).order("request_count", { ascending: false }),
    supabase.from("bot_stats").select("id, bot_name, request_count, top_pages").eq("run_id", runId).order("request_count", { ascending: false }),
    supabase.from("redirect_patterns").select("pattern, request_count, bot_count, human_count").eq("run_id", runId).order("request_count", { ascending: false }),
    supabase.from("gone410_patterns").select("pattern, request_count, bot_count, examples").eq("run_id", runId).order("request_count", { ascending: false }),
    supabase.from("language_stats").select("lang, request_count, ok_200, err_404, bot_percent").eq("run_id", runId).order("request_count", { ascending: false }),
  ]);

  // 3. Fetch cluster daily and UAs for each cluster
  const clusterIds = (clustersRes.data || []).map((c) => c.id);
  let clusterDailyMap = new Map<string, DayCount[]>();
  let clusterUAMap = new Map<string, { ua: string; count: number }[]>();

  if (clusterIds.length > 0) {
    const [dailyRows, uaRows] = await Promise.all([
      fetchClusterDaily(supabase, clusterIds),
      fetchClusterUAs(supabase, clusterIds),
    ]);

    // Group daily by cluster_id
    for (const row of dailyRows) {
      const arr = clusterDailyMap.get(row.cluster_id) || [];
      arr.push({ date: row.day, count: row.request_count });
      clusterDailyMap.set(row.cluster_id, arr);
    }

    // Group UAs by cluster_id (top 10 per cluster)
    const uaCounts = new Map<string, number>();
    for (const row of uaRows) {
      const arr = clusterUAMap.get(row.cluster_id) || [];
      const cnt = uaCounts.get(row.cluster_id) || 0;
      if (cnt < 10) {
        arr.push({ ua: row.user_agent, count: row.request_count });
        clusterUAMap.set(row.cluster_id, arr);
        uaCounts.set(row.cluster_id, cnt + 1);
      }
    }
  }

  // 4. Fetch bot daily data
  const botIds = (botsRes.data || []).map((b) => b.id);
  let botDailyMap = new Map<string, DayCount[]>();

  if (botIds.length > 0) {
    const botDailyRows = await fetchBotDaily(supabase, botIds);
    for (const row of botDailyRows) {
      const arr = botDailyMap.get(row.bot_id) || [];
      arr.push({ date: row.day, count: row.request_count });
      botDailyMap.set(row.bot_id, arr);
    }
  }

  // 5. Assemble Summary
  const overview = run.overview as Record<string, unknown>;
  const timeSeries = run.time_series as Record<string, unknown>;

  // Per-cluster per-day detail from time_series JSONB (may be missing on older analyses)
  const clusterDetailMap = ((run.time_series as Record<string, unknown>)?.clusterDetail || {}) as Record<string, ClusterDayDetail[]>;

  // Clusters
  const clusters: Cluster[] = (clustersRes.data || []).map((c) => ({
    pattern: c.pattern,
    count: c.request_count,
    statuses: c.statuses as Record<string, number>,
    responseTime: { avg: c.rt_avg, p95: c.rt_p95 },
    byDay: clusterDailyMap.get(c.id) || [],
    topUAs: clusterUAMap.get(c.id) || [],
    detailByDay: clusterDetailMap[c.pattern],
  }));

  // Errors
  const errors404 = (errorsRes.data || []).filter((e) => e.error_type === "404").map((e) => ({
    pattern: e.pattern, count: e.request_count, examples: e.examples || [],
  }));
  const errors5xx = (errorsRes.data || []).filter((e) => e.error_type === "500").map((e) => ({
    pattern: e.pattern, count: e.request_count,
  }));
  const errorsSlow = (errorsRes.data || []).filter((e) => e.error_type === "slow").map((e) => ({
    pattern: e.pattern, avgTime: e.avg_time || 0, count: e.request_count,
  }));

  // Bots
  const bots: Record<string, BotData> = {};
  for (const b of botsRes.data || []) {
    bots[b.bot_name] = {
      requests: b.request_count,
      topPages: (b.top_pages as { url: string; count: number }[]) || [],
      byDay: botDailyMap.get(b.id) || [],
    };
  }

  // Redirects
  const redirectsSummary = run.redirects_summary as { total: number; byStatus: Record<string, number> } | null;
  const redirectPatterns = (redirectsRes.data || []).map((r) => ({
    pattern: r.pattern, count: r.request_count, botCount: r.bot_count, humanCount: r.human_count,
  }));

  // Gone 410
  const gone410Summary = run.gone410_summary as { total: number; googlebotRequests: number } | null;
  const gone410Patterns = (gone410Res.data || []).map((g) => ({
    pattern: g.pattern, count: g.request_count, botCount: g.bot_count, examples: g.examples || [],
  }));

  // Languages
  const languages = (langsRes.data || []).map((l) => ({
    lang: l.lang, requests: l.request_count, ok200: l.ok_200, err404: l.err_404, botPercent: l.bot_percent,
  }));

  const summary: Summary = {
    totalRequests: overview.totalRequests as number,
    uniqueUrls: overview.uniqueUrls as number,
    dateRange: overview.dateRange as { from: string; to: string },
    responseTime: overview.responseTime as { avg: number; median: number; p95: number; p99: number },
    statusCodes: overview.statusCodes as Record<string, number>,
    botVsHuman: overview.botVsHuman as Summary["botVsHuman"],
    crawlBudget: overview.crawlBudget as Summary["crawlBudget"],
    requestsByDay: (timeSeries.requestsByDay as DayCount[]) || [],
    checkoutFunnel: (timeSeries.checkoutFunnel as Summary["checkoutFunnel"]) || { totalRequests: 0, uniqueVINs: 0, byStatus: {}, byDay: [] },
    statusCodesByDay: (timeSeries.statusCodesByDay as Summary["statusCodesByDay"]) || undefined,
    responseTimeByDay: (timeSeries.responseTimeByDay as Summary["responseTimeByDay"]) || undefined,
    heatmap: (run.heatmap as Summary["heatmap"]) || { responseTime: [], requests: [], hours: [], days: [] },
    suspicious: (run.suspicious as Summary["suspicious"]) || { topUAs: [], highErrorUAs: [] },
    clusters,
    errors: { "404": errors404, "500": errors5xx, slow: errorsSlow },
    bots,
    redirects: {
      total: redirectsSummary?.total || 0,
      byStatus: redirectsSummary?.byStatus || {},
      byPattern: redirectPatterns,
    },
    gone410: {
      total: gone410Summary?.total || 0,
      googlebotRequests: gone410Summary?.googlebotRequests || 0,
      byPattern: gone410Patterns,
    },
    languages,
  };

  return NextResponse.json(summary);
}
