import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * POST /api/projects/[id]/competitors/fetch — Manual trigger for Firehose poll.
 *
 * Loads the project's enabled competitor_rules (each bound to a Firehose rule
 * UUID) and passes them to the Edge Function, which expands every incoming
 * event into one row per matching rule. Without rules, the Edge Function
 * returns early with "No rules configured" and no mentions are fetched.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get project with keywords
  const { data: project } = await supabase
    .from("projects")
    .select("id, brand_keywords")
    .eq("id", id)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const tapToken = process.env.FIREHOSE_TAP_TOKEN;
  if (!tapToken) {
    return NextResponse.json({ error: "FIREHOSE_TAP_TOKEN not configured" }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createAdminClient(supabaseUrl, serviceRoleKey);

  // Load enabled competitor rules bound to a Firehose rule UUID.
  const { data: rules } = await admin
    .from("competitor_rules")
    .select("id, tag, firehose_rule_id, enabled")
    .eq("project_id", id)
    .eq("enabled", true);

  const bindings = (rules || [])
    .filter((r) => r.firehose_rule_id)
    .map((r) => ({ id: r.id, firehoseRuleId: r.firehose_rule_id as string, tag: r.tag }));

  if (bindings.length === 0) {
    return NextResponse.json(
      {
        error:
          "No enabled competitor rules configured. Add one on the Competitor Rules page and register it with Firehose first.",
      },
      { status: 400 },
    );
  }

  const { data, error } = await admin.functions.invoke("firehose-poller", {
    body: {
      projectId: id,
      tapToken,
      keywords: project.brand_keywords || [],
      rules: bindings,
      supabaseUrl,
      supabaseServiceKey: serviceRoleKey,
      since: "24h",
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ data });
}
