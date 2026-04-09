import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";

// POST /api/projects/[id]/pages/enrich — trigger GSC + GA4 enrichment
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Get project
  const { data: project } = await supabase
    .from("projects")
    .select("id, site_url")
    .eq("id", id)
    .single();

  if (!project?.site_url) {
    return NextResponse.json(
      { error: "Set the site URL in project settings first" },
      { status: 400 }
    );
  }

  // 2. Get credentials (GSC and/or GA4)
  const { data: creds } = await supabase
    .from("credentials")
    .select("type, encrypted_config")
    .eq("project_id", id)
    .in("type", ["gsc_api", "ga4_api"]);

  // Parse credentials — support both OAuth2 (refresh_token) and service account formats
  let gscCredJson: Record<string, unknown> | null = null;
  let gscSiteUrl: string | null = null;
  let ga4CredJson: Record<string, unknown> | null = null;
  let ga4PropertyId: string | null = null;

  for (const c of creds || []) {
    try {
      const config = JSON.parse(decrypt(c.encrypted_config));
      if (c.type === "gsc_api") {
        // The stored config has the credential JSON + site URL
        const jsonStr = config["Service Account JSON"] || config.serviceAccountJson;
        gscCredJson = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
        // Also grab refresh_token if stored at top level
        if (config.refresh_token) {
          gscCredJson = { ...gscCredJson, refresh_token: config.refresh_token };
        }
        gscSiteUrl = config["Site URL"] || config.siteUrl || project.site_url;
      } else if (c.type === "ga4_api") {
        const jsonStr = config["Service Account JSON"] || config.serviceAccountJson;
        ga4CredJson = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
        if (config.refresh_token) {
          ga4CredJson = { ...ga4CredJson, refresh_token: config.refresh_token };
        }
        ga4PropertyId = config["Property ID"] || config.propertyId;
      }
    } catch (e) {
      console.error(`Failed to decrypt ${c.type} credential:`, e);
    }
  }

  if (!gscCredJson && !ga4CredJson) {
    return NextResponse.json(
      { error: "No GSC or GA4 credentials found. Add them in project settings." },
      { status: 400 }
    );
  }

  // 3. Get cluster patterns from latest analysis
  const clusterPatterns: string[] = [];
  const { data: latestRun } = await supabase
    .from("analysis_runs")
    .select("id")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestRun) {
    const { data: clusters } = await supabase
      .from("clusters")
      .select("pattern")
      .eq("run_id", latestRun.id)
      .order("request_count", { ascending: false });

    for (const c of clusters || []) {
      clusterPatterns.push(c.pattern);
    }
  }

  // 4. Create enrichment run
  const now = new Date();
  const endDate = now.toISOString().substring(0, 10);
  const startDate = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createAdminClient(supabaseUrl, serviceRoleKey);

  const { data: run, error: runErr } = await admin
    .from("page_enrichment_runs")
    .insert({
      project_id: id,
      run_id: latestRun?.id || null,
      date_range_start: startDate,
      date_range_end: endDate,
      status: "pending",
    })
    .select("id")
    .single();

  if (runErr) {
    return NextResponse.json({ error: runErr.message }, { status: 500 });
  }

  // 5. Invoke Edge Function (fire-and-forget style — returns immediately, EF runs async)
  admin.functions.invoke("pages-enrichment", {
    body: {
      enrichmentRunId: run.id,
      projectId: id,
      siteUrl: project.site_url,
      gscConfig: gscCredJson,
      gscSiteUrl,
      ga4Config: ga4CredJson,
      ga4PropertyId,
      clusterPatterns,
      dateRange: { start: startDate, end: endDate },
      supabaseUrl,
      supabaseServiceKey: serviceRoleKey,
    },
  }).catch((err) => {
    // Update status on invocation failure
    admin.from("page_enrichment_runs").update({
      status: "failed",
      error_message: err.message,
    }).eq("id", run.id);
  });

  return NextResponse.json({
    data: {
      enrichmentRunId: run.id,
      status: "running",
      dateRange: { start: startDate, end: endDate },
    },
  });
}
