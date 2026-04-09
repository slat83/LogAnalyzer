import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/projects/[id]/pages — latest PagesIndex
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
    .select("pages_index, created_at")
    .eq("project_id", id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data?.pages_index) return NextResponse.json(null);
  return NextResponse.json(data.pages_index);
}
