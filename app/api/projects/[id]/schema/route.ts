import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/projects/[id]/schema — latest schema scan state
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get latest scan_id
  const { data: latest } = await supabase
    .from("schema_results")
    .select("scan_id, scanned_at")
    .eq("project_id", id)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .single();

  if (!latest) return NextResponse.json(null);

  // Get all results for that scan
  const { data: results } = await supabase
    .from("schema_results")
    .select("*")
    .eq("scan_id", latest.scan_id)
    .order("status", { ascending: true }); // CRITICAL first

  const schemaState = {
    timestamp: latest.scanned_at,
    results: (results || []).map((r) => ({
      url: r.url,
      pageType: r.page_type,
      foundSchemaTypes: r.found_schema_types,
      mustHave: r.must_have,
      niceToHave: r.nice_to_have,
      missingMustHave: r.missing_must_have,
      missingNiceToHave: r.missing_nice_to_have,
      hasMicrodataBreadcrumb: r.has_microdata_breadcrumb,
      errors: r.errors,
      status: r.status,
      delta: r.delta,
    })),
  };

  return NextResponse.json(schemaState);
}
