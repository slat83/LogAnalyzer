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

  // Poll every project that has at least one enabled competitor rule bound
  // to a Firehose rule UUID. Joining from competitor_rules avoids scanning
  // projects with no active monitoring.
  const { data: ruleRows } = await admin
    .from("competitor_rules")
    .select("id, tag, project_id, firehose_rule_id, enabled")
    .eq("enabled", true)
    .not("firehose_rule_id", "is", null);

  const bindingsByProject = new Map<
    string,
    { id: string; firehoseRuleId: string; tag: string }[]
  >();
  for (const r of ruleRows || []) {
    const list = bindingsByProject.get(r.project_id) || [];
    list.push({ id: r.id, firehoseRuleId: r.firehose_rule_id as string, tag: r.tag });
    bindingsByProject.set(r.project_id, list);
  }

  if (bindingsByProject.size === 0) {
    return NextResponse.json({ message: "No projects with enabled competitor rules" });
  }

  const { data: projects } = await admin
    .from("projects")
    .select("id, brand_keywords")
    .in("id", Array.from(bindingsByProject.keys()));

  const results = [];

  for (const project of projects || []) {
    const bindings = bindingsByProject.get(project.id) || [];
    try {
      const { data, error } = await admin.functions.invoke("firehose-poller", {
        body: {
          projectId: project.id,
          tapToken,
          keywords: project.brand_keywords || [],
          rules: bindings,
          supabaseUrl,
          supabaseServiceKey: serviceRoleKey,
          since: "24h",
        },
      });

      results.push({
        projectId: project.id,
        rulesPolled: bindings.length,
        ...(error ? { error: error.message } : data),
      });
    } catch (err) {
      results.push({
        projectId: project.id,
        rulesPolled: bindings.length,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ results, projectsPolled: results.length });
}
