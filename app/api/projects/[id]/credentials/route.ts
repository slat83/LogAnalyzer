import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";

// GET /api/projects/[id]/credentials — list credentials (without secrets)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("credentials")
    .select("id, project_id, type, name, last_used_at, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/projects/[id]/credentials — create a new credential
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { type, name, config } = body;

  if (!type || !name || !config) {
    return NextResponse.json({ error: "type, name, and config are required" }, { status: 400 });
  }

  const validTypes = ["ssh", "sftp", "gsc_api", "ga4_api", "custom_api"];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  const encrypted_config = encrypt(JSON.stringify(config));

  const { data, error } = await supabase
    .from("credentials")
    .insert({
      project_id: id,
      type,
      name: name.trim(),
      encrypted_config,
    })
    .select("id, project_id, type, name, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
