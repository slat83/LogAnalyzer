import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/projects/[id]/gsc-health?type=crawl_stats — fetch GSC health data
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (!type) {
    return NextResponse.json({ error: "type parameter required" }, { status: 400 });
  }

  const section = searchParams.get("section");

  let query = supabase
    .from("gsc_health_data")
    .select("report_date, section, data, uploaded_at")
    .eq("project_id", id)
    .eq("report_type", type)
    .order("report_date", { ascending: true });

  if (section) query = query.eq("section", section);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}
