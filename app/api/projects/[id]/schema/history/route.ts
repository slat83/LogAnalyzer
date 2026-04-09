import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/projects/[id]/schema/history — schema trend data
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("schema_history")
    .select("*")
    .eq("project_id", id)
    .order("date", { ascending: true })
    .limit(30);

  const history = (data || []).map((h) => ({
    date: h.date,
    timestamp: h.scanned_at,
    total: h.total,
    ok: h.ok,
    warning: h.warning,
    critical: h.critical,
    coverageRate: h.coverage_rate,
    changes: h.changes,
  }));

  return NextResponse.json(history);
}
