import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/projects/[id]/competitors — list competitor mentions
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("competitor_mentions")
    .select("matched_at, rule, url, title, domain, language, page_category, page_types, publish_time, has_brand_mention, matched_keywords, mention_snippet")
    .eq("project_id", id)
    .order("matched_at", { ascending: false })
    .range(0, 499);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}
