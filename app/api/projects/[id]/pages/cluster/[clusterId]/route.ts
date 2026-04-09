import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/projects/[id]/pages/cluster/[clusterId] — pages in a cluster
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; clusterId: string }> }
) {
  const { id, clusterId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get latest completed enrichment run
  const { data: run } = await supabase
    .from("page_enrichment_runs")
    .select("id")
    .eq("project_id", id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!run) return NextResponse.json(null);

  // Get all pages for this cluster
  const { data: rows } = await supabase
    .from("page_data")
    .select("*")
    .eq("enrichment_run_id", run.id)
    .eq("cluster_id", clusterId);

  if (!rows?.length) return NextResponse.json(null);

  const clusterData = {
    pattern: rows[0].cluster_pattern,
    pages: rows.map((r) => ({
      url: r.url,
      path: r.path,
      cluster: r.cluster_pattern,
      urlVariants: r.url_variants,
      gsc: r.gsc,
      ga4: r.ga4,
      channels: r.channels || {},
      indexing: r.indexing,
    })),
  };

  return NextResponse.json(clusterData);
}
