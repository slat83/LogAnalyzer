import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/projects/[id]/pages/status — enrichment run status
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("page_enrichment_runs")
    .select("id, status, error_message, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ data: data || null });
}
