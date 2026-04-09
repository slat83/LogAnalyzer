import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * POST /api/projects/[id]/gsc-health/upload
 *
 * Deduplication strategy:
 * - Each row is keyed by (project_id, report_type, report_date, section)
 * - On upload: delete existing rows for the same (type, section, dates), then insert
 * - This means re-uploading the same file replaces data cleanly
 * - Uploading a newer file with overlapping dates replaces only the overlapping dates
 * - Different sections (e.g., Queries vs Pages from the same Performance zip) are stored separately
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { type, sections } = body;

  // Support both old format (flat rows) and new format (sections)
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
  let totalReplaced = 0;

  for (const section of sectionList) {
    if (!section.rows?.length) continue;

    const sectionName = section.name.replace(/\.csv$/, "");
    const dates = [...new Set(section.rows.map((r) => r.date))];

    // Delete existing rows for this (project, type, section, dates)
    // Use batched IN clause for efficiency
    const { count } = await admin
      .from("gsc_health_data")
      .delete({ count: "exact" })
      .eq("project_id", id)
      .eq("report_type", type)
      .eq("section", sectionName)
      .in("report_date", dates);

    totalReplaced += count || 0;

    // Insert new rows
    const insertRows = section.rows.map((r) => ({
      project_id: id,
      report_type: type,
      report_date: r.date,
      section: sectionName,
      data: r.data,
    }));

    for (let i = 0; i < insertRows.length; i += 500) {
      const batch = insertRows.slice(i, i + 500);
      const { error } = await admin.from("gsc_health_data").insert(batch);
      if (error) {
        // On unique constraint violation, try upsert row by row
        if (error.code === "23505") {
          for (const row of batch) {
            await admin.from("gsc_health_data")
              .delete()
              .eq("project_id", row.project_id)
              .eq("report_type", row.report_type)
              .eq("report_date", row.report_date)
              .eq("section", row.section);
            await admin.from("gsc_health_data").insert(row);
          }
        } else {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    }

    totalInserted += insertRows.length;
  }

  return NextResponse.json({
    data: {
      type,
      sections: sectionList.length,
      inserted: totalInserted,
      replaced: totalReplaced,
    },
  });
}
