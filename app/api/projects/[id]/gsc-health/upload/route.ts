import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// POST /api/projects/[id]/gsc-health/upload — store parsed GSC CSV data
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { type, rows } = body;

  if (!type || !rows?.length) {
    return NextResponse.json({ error: "type and rows are required" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Upsert: delete existing data for same project+type+dates, then insert
  const dates = [...new Set(rows.map((r: { date: string }) => r.date))];

  // Delete existing entries for these dates
  for (const date of dates) {
    await admin
      .from("gsc_health_data")
      .delete()
      .eq("project_id", id)
      .eq("report_type", type)
      .eq("report_date", date);
  }

  // Insert new rows
  const insertRows = rows.map((r: { date: string; data: Record<string, unknown> }) => ({
    project_id: id,
    report_type: type,
    report_date: r.date,
    data: r.data,
  }));

  for (let i = 0; i < insertRows.length; i += 500) {
    const batch = insertRows.slice(i, i + 500);
    const { error } = await admin.from("gsc_health_data").insert(batch);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { inserted: insertRows.length, type } });
}
