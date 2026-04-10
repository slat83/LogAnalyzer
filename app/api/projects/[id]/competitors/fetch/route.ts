import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * POST /api/projects/[id]/competitors/fetch — Manual trigger for Firehose poll
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

  const { data, error } = await admin.functions.invoke("firehose-poller", {
    body: {
      projectId: id,
      tapToken,
      keywords: project.brand_keywords || [],
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
