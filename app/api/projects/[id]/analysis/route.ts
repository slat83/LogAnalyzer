import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Summary, Cluster, BotData, DayCount } from "@/lib/types";

// GET /api/projects/[id]/analysis — get latest analysis run
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("analysis_runs")
    .select("id, project_id, created_at, overview, time_series, heatmap, redirects_summary, gone410_summary, suspicious")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

// POST /api/projects/[id]/analysis — upload parsed summary, decompose into tables
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let summary: Summary;
  try {
    summary = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!summary.totalRequests || !summary.dateRange) {
    return NextResponse.json({ error: "Invalid summary: missing totalRequests or dateRange" }, { status: 400 });
  }

  try {
    // 1. Insert analysis_runs with JSONB columns
    const { data: run, error: runError } = await supabase
      .from("analysis_runs")
      .insert({
        project_id: id,
        overview: {
          totalRequests: summary.totalRequests,
          uniqueUrls: summary.uniqueUrls,
          dateRange: summary.dateRange,
          responseTime: summary.responseTime,
          statusCodes: summary.statusCodes,
          botVsHuman: summary.botVsHuman,
          crawlBudget: summary.crawlBudget,
        },
        time_series: {
          requestsByDay: summary.requestsByDay,
          checkoutFunnel: summary.checkoutFunnel,
        },
        heatmap: summary.heatmap || null,
        redirects_summary: summary.redirects
          ? { total: summary.redirects.total, byStatus: summary.redirects.byStatus }
          : null,
        gone410_summary: summary.gone410
          ? { total: summary.gone410.total, googlebotRequests: summary.gone410.googlebotRequests }
          : null,
        suspicious: summary.suspicious || null,
      })
      .select("id")
      .single();

    if (runError) throw runError;
    const runId = run.id;

    // 2. Insert clusters
    if (summary.clusters?.length) {
      const clusterRows = summary.clusters.map((c: Cluster) => ({
        run_id: runId,
        pattern: c.pattern,
        request_count: c.count,
        statuses: c.statuses,
        rt_avg: c.responseTime?.avg || 0,
        rt_p95: c.responseTime?.p95 || 0,
        sample_urls: c.sampleUrls?.length ? c.sampleUrls : null,
      }));

      const { data: insertedClusters, error: cErr } = await supabase
        .from("clusters")
        .insert(clusterRows)
        .select("id, pattern");

      if (cErr) throw cErr;

      // Build pattern → id map
      const patternToId = new Map<string, string>();
      for (const c of insertedClusters || []) {
        patternToId.set(c.pattern, c.id);
      }

      // 2a. Insert cluster_daily (batch)
      const dailyRows: { cluster_id: string; day: string; request_count: number }[] = [];
      for (const c of summary.clusters) {
        const cid = patternToId.get(c.pattern);
        if (!cid || !c.byDay) continue;
        for (const d of c.byDay) {
          dailyRows.push({ cluster_id: cid, day: d.date, request_count: d.count });
        }
      }
      if (dailyRows.length) {
        // Batch in groups of 1000
        for (let i = 0; i < dailyRows.length; i += 1000) {
          const batch = dailyRows.slice(i, i + 1000);
          const { error } = await supabase.from("cluster_daily").insert(batch);
          if (error) throw error;
        }
      }

      // 2b. Insert cluster_user_agents (batch)
      const uaRows: { cluster_id: string; user_agent: string; request_count: number }[] = [];
      for (const c of summary.clusters) {
        const cid = patternToId.get(c.pattern);
        if (!cid || !c.topUAs) continue;
        for (const ua of c.topUAs) {
          uaRows.push({ cluster_id: cid, user_agent: ua.ua, request_count: ua.count });
        }
      }
      if (uaRows.length) {
        for (let i = 0; i < uaRows.length; i += 1000) {
          const batch = uaRows.slice(i, i + 1000);
          const { error } = await supabase.from("cluster_user_agents").insert(batch);
          if (error) throw error;
        }
      }
    }

    // 3. Insert error_entries
    const errorRows: { run_id: string; error_type: string; pattern: string; request_count: number; avg_time: number | null; examples: string[] | null }[] = [];
    if (summary.errors?.["404"]) {
      for (const e of summary.errors["404"]) {
        errorRows.push({ run_id: runId, error_type: "404", pattern: e.pattern, request_count: e.count, avg_time: null, examples: e.examples || null });
      }
    }
    if (summary.errors?.["500"]) {
      for (const e of summary.errors["500"]) {
        errorRows.push({ run_id: runId, error_type: "500", pattern: e.pattern, request_count: e.count, avg_time: null, examples: null });
      }
    }
    if (summary.errors?.slow) {
      for (const e of summary.errors.slow) {
        errorRows.push({ run_id: runId, error_type: "slow", pattern: e.pattern, request_count: e.count, avg_time: e.avgTime, examples: null });
      }
    }
    if (errorRows.length) {
      const { error } = await supabase.from("error_entries").insert(errorRows);
      if (error) throw error;
    }

    // 4. Insert bot_stats + bot_daily
    if (summary.bots && Object.keys(summary.bots).length) {
      const botRows = Object.entries(summary.bots).map(([name, b]: [string, BotData]) => ({
        run_id: runId,
        bot_name: name,
        request_count: b.requests,
        top_pages: b.topPages?.slice(0, 20) || null,
      }));

      const { data: insertedBots, error: bErr } = await supabase
        .from("bot_stats")
        .insert(botRows)
        .select("id, bot_name");

      if (bErr) throw bErr;

      const botNameToId = new Map<string, string>();
      for (const b of insertedBots || []) {
        botNameToId.set(b.bot_name, b.id);
      }

      const botDailyRows: { bot_id: string; day: string; request_count: number }[] = [];
      for (const [name, b] of Object.entries(summary.bots) as [string, BotData][]) {
        const bid = botNameToId.get(name);
        if (!bid || !b.byDay) continue;
        for (const d of b.byDay as DayCount[]) {
          botDailyRows.push({ bot_id: bid, day: d.date, request_count: d.count });
        }
      }
      if (botDailyRows.length) {
        for (let i = 0; i < botDailyRows.length; i += 1000) {
          const batch = botDailyRows.slice(i, i + 1000);
          const { error } = await supabase.from("bot_daily").insert(batch);
          if (error) throw error;
        }
      }
    }

    // 5. Insert redirect_patterns
    if (summary.redirects?.byPattern?.length) {
      const rows = summary.redirects.byPattern.map((r) => ({
        run_id: runId,
        pattern: r.pattern,
        request_count: r.count,
        bot_count: r.botCount || 0,
        human_count: r.humanCount || 0,
      }));
      const { error } = await supabase.from("redirect_patterns").insert(rows);
      if (error) throw error;
    }

    // 6. Insert gone410_patterns
    if (summary.gone410?.byPattern?.length) {
      const rows = summary.gone410.byPattern.map((g) => ({
        run_id: runId,
        pattern: g.pattern,
        request_count: g.count,
        bot_count: g.botCount || 0,
        examples: g.examples || null,
      }));
      const { error } = await supabase.from("gone410_patterns").insert(rows);
      if (error) throw error;
    }

    // 7. Insert language_stats
    if (summary.languages?.length) {
      const rows = summary.languages.map((l) => ({
        run_id: runId,
        lang: l.lang,
        request_count: l.requests,
        ok_200: l.ok200 || 0,
        err_404: l.err404 || 0,
        bot_percent: l.botPercent || 0,
      }));
      const { error } = await supabase.from("language_stats").insert(rows);
      if (error) throw error;
    }

    return NextResponse.json({ data: { runId } }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
