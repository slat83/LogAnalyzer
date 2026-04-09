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

  let gscConfig: { serviceAccountJson: string; siteUrl: string } | null = null;
  let ga4Config: { serviceAccountJson: string; propertyId: string } | null = null;

  for (const c of creds || []) {
    try {
      const config = JSON.parse(decrypt(c.encrypted_config));
      if (c.type === "gsc_api") {
        gscConfig = {
          serviceAccountJson: config["Service Account JSON"] || config.serviceAccountJson,
          siteUrl: config["Site URL"] || config.siteUrl || project.site_url,
        };
      } else if (c.type === "ga4_api") {
        ga4Config = {
          serviceAccountJson: config["Service Account JSON"] || config.serviceAccountJson,
          propertyId: config["Property ID"] || config.propertyId,
        };
      }
    } catch (e) {
      console.error(`Failed to decrypt ${c.type} credential:`, e);
    }
  }

  if (!gscConfig && !ga4Config) {
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
      gscConfig,
      ga4Config,
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
