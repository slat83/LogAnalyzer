import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * POST /api/projects/[id]/gsc-health/upload
 *
 * Dedup: For each (type, section), deletes ALL existing rows for that section
 * then inserts the new data. This is simpler and faster than per-date upsert.
 * Re-uploading replaces everything for that report type+section.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify project ownership
  const { data: project } = await supabase.from("projects").select("id").eq("id", id).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await request.json();
  const { type, sections } = body;

  const sectionList: { name: string; rows: { date: string; data: Record<string, unknown> }[] }[] =
    sections || [{ name: "default", rows: body.rows || [] }];

  if (!type || !sectionList.length) {
    return NextResponse.json({ error: "type and data are required" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let totalInserted = 0;

  // Process all sections: bulk delete then bulk insert
  const allInsertRows: Record<string, unknown>[] = [];
  const sectionsToDelete = new Set<string>();

  for (const section of sectionList) {
    if (!section.rows?.length) continue;
    const sectionName = section.name.replace(/\.csv$/, "");
    sectionsToDelete.add(sectionName);

    for (const r of section.rows) {
      allInsertRows.push({
        project_id: id,
        report_type: type,
        report_date: r.date,
        section: sectionName,
        data: r.data,
      });
    }
  }

  // Single delete per section (much faster than per-date)
  for (const sectionName of sectionsToDelete) {
    await admin
      .from("gsc_health_data")
      .delete()
      .eq("project_id", id)
      .eq("report_type", type)
      .eq("section", sectionName);
  }

  // Batch insert all rows (500 per batch)
  for (let i = 0; i < allInsertRows.length; i += 500) {
    const batch = allInsertRows.slice(i, i + 500);
    const { error } = await admin.from("gsc_health_data").insert(batch);
    if (error) {
      return NextResponse.json({ error: `Insert failed: ${error.message}` }, { status: 500 });
    }
    totalInserted += batch.length;
  }

  return NextResponse.json({
    data: { type, sections: sectionsToDelete.size, inserted: totalInserted },
  });
}
