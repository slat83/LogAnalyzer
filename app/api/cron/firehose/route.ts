import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/cron/firehose — Daily Firehose poll (called by Vercel Cron)
 * Protected by CRON_SECRET header.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const tapToken = process.env.FIREHOSE_TAP_TOKEN;

  if (!tapToken) {
    return NextResponse.json({ error: "FIREHOSE_TAP_TOKEN not configured" }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Get all projects that have brand_keywords configured
  const { data: projects } = await admin
    .from("projects")
    .select("id, brand_keywords")
    .not("brand_keywords", "eq", "{}");

  if (!projects?.length) {
    return NextResponse.json({ message: "No projects with brand keywords" });
  }

  const results = [];

  for (const project of projects) {
    try {
      const { data, error } = await admin.functions.invoke("firehose-poller", {
        body: {
          projectId: project.id,
          tapToken,
          keywords: project.brand_keywords || [],
          supabaseUrl,
          supabaseServiceKey: serviceRoleKey,
          since: "24h",
        },
      });

      results.push({
        projectId: project.id,
        ...(error ? { error: error.message } : data),
      });
    } catch (err) {
      results.push({
        projectId: project.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ results, projectsPolled: projects.length });
}
