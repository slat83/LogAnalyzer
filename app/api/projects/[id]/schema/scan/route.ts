import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// POST /api/projects/[id]/schema/scan — trigger schema validation scan
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Get project with site_url
  const { data: project } = await supabase
    .from("projects")
    .select("id, site_url")
    .eq("id", id)
    .single();

  if (!project?.site_url) {
    return NextResponse.json(
      { error: "Set the site URL in project settings before scanning" },
      { status: 400 }
    );
  }

  const siteUrl = project.site_url.replace(/\/$/, ""); // Remove trailing slash

  // 2. Get latest analysis run to find clusters with sample URLs
  const { data: latestRun } = await supabase
    .from("analysis_runs")
    .select("id")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // 3. Build URL list from clusters
  const urls: string[] = [];
  const pageTypeMap: Record<string, string> = {};

  if (latestRun) {
    const { data: clusters } = await supabase
      .from("clusters")
      .select("pattern, sample_urls, request_count")
      .eq("run_id", latestRun.id)
      .order("request_count", { ascending: false })
      .limit(50);

    for (const c of clusters || []) {
      let url: string | null = null;

      // Try sample URLs first
      if (c.sample_urls?.length) {
        // Find a sample URL, prepend site_url if it's a path
        for (const su of c.sample_urls) {
          if (su.startsWith("http")) { url = su; break; }
          if (su.startsWith("/")) { url = siteUrl + su; break; }
        }
      }

      // Fallback: construct from pattern
      if (!url && c.pattern.startsWith("/")) {
        url = siteUrl + c.pattern;
      } else if (!url && c.pattern === "/") {
        url = siteUrl + "/";
      }

      if (!url || urls.includes(url)) continue;

      // Determine page type from pattern
      const p = c.pattern.toLowerCase();
      let pageType = "other";
      if (p === "/" || p === "") pageType = "homepage";
      else if (p.includes("faq")) pageType = "faq";
      else if (p.includes("article") || p.includes("blog") || p.includes("news")) pageType = "article";
      else if (p.includes("product") || p.includes("checkout") || p.includes("vin-decoder")) pageType = "product";
      else if (p.includes("categor") || p.includes("listing")) pageType = "category";
      else if (p.includes("search")) pageType = "search";

      urls.push(url);
      pageTypeMap[url] = pageType;
    }
  }

  // Always include homepage
  if (!urls.includes(siteUrl) && !urls.includes(siteUrl + "/")) {
    urls.unshift(siteUrl + "/");
    pageTypeMap[siteUrl + "/"] = "homepage";
  }

  if (urls.length === 0) {
    return NextResponse.json({ error: "No URLs to scan" }, { status: 400 });
  }

  // 4. Call Edge Function
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 500 }
    );
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey);
  const { data: fnResult, error: fnError } = await admin.functions.invoke(
    "schema-validator",
    { body: { urls, page_type_map: pageTypeMap } }
  );

  if (fnError) {
    return NextResponse.json(
      { error: `Edge Function error: ${fnError.message}` },
      { status: 502 }
    );
  }

  const results = fnResult?.results;
  if (!results?.length) {
    return NextResponse.json({ error: "No results from scanner" }, { status: 502 });
  }

  // 5. Compute deltas (compare with previous scan)
  const scanId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: prevResults } = await admin
    .from("schema_results")
    .select("url, status, scan_id")
    .eq("project_id", id)
    .order("scanned_at", { ascending: false })
    .limit(200);

  // Build previous status map (only from latest previous scan)
  const prevStatusMap = new Map<string, string>();
  if (prevResults?.length) {
    const prevScanId = prevResults[0].scan_id;
    for (const pr of prevResults) {
      if (pr.scan_id === prevScanId) {
        prevStatusMap.set(pr.url, pr.status);
      }
    }
  }

  // Calculate deltas and build insert rows
  let newErrors = 0, fixed = 0, degraded = 0;
  const insertRows = results.map((r: Record<string, unknown>) => {
    const prevStatus = prevStatusMap.get(r.url as string);
    let delta = "BASELINE";

    if (prevStatus) {
      const cur = r.status as string;
      if (prevStatus === cur) delta = "OK";
      else if (prevStatus === "CRITICAL" && cur === "OK") { delta = "FIXED"; fixed++; }
      else if (prevStatus === "OK" && cur === "CRITICAL") { delta = "NEW_ERROR"; newErrors++; }
      else if (
        (prevStatus === "OK" && cur === "WARNING") ||
        (prevStatus === "WARNING" && cur === "CRITICAL") ||
        (prevStatus === "OK" && cur === "CRITICAL")
      ) { delta = "DEGRADED"; degraded++; }
      else if (
        (prevStatus === "CRITICAL" && cur === "WARNING") ||
        (prevStatus === "WARNING" && cur === "OK")
      ) { delta = "FIXED"; fixed++; }
    }

    return {
      project_id: id,
      scan_id: scanId,
      scanned_at: now,
      url: r.url,
      page_type: r.pageType,
      found_schema_types: r.foundSchemaTypes,
      must_have: r.mustHave,
      nice_to_have: r.niceToHave,
      missing_must_have: r.missingMustHave,
      missing_nice_to_have: r.missingNiceToHave,
      has_microdata_breadcrumb: r.hasMicrodataBreadcrumb,
      errors: r.errors,
      status: r.status,
      delta,
    };
  });

  // 6. Insert results
  const { error: insertErr } = await admin
    .from("schema_results")
    .insert(insertRows);

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // 7. Insert history entry
  const okCount = results.filter((r: Record<string, unknown>) => r.status === "OK").length;
  const warnCount = results.filter((r: Record<string, unknown>) => r.status === "WARNING").length;
  const critCount = results.filter((r: Record<string, unknown>) => r.status === "CRITICAL").length;
  const total = results.length;

  await admin.from("schema_history").insert({
    project_id: id,
    scan_id: scanId,
    date: now.substring(0, 10),
    scanned_at: now,
    total,
    ok: okCount,
    warning: warnCount,
    critical: critCount,
    coverage_rate: total > 0 ? Math.round((okCount / total) * 10000) / 100 : 0,
    changes: { new_error: newErrors, fixed, degraded, missing: 0 },
  });

  return NextResponse.json({
    data: {
      scanId,
      timestamp: now,
      urlsScanned: total,
      ok: okCount,
      warning: warnCount,
      critical: critCount,
    },
  });
}
