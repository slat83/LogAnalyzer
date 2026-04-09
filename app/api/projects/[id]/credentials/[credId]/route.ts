import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";

type Params = { params: Promise<{ id: string; credId: string }> };

// PATCH /api/projects/[id]/credentials/[credId] — update a credential
export async function PATCH(request: Request, { params }: Params) {
  const { id, credId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.config !== undefined) {
    updates.encrypted_config = encrypt(JSON.stringify(body.config));
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("credentials")
    .update(updates)
    .eq("id", credId)
    .eq("project_id", id)
    .select("id, project_id, type, name, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/projects/[id]/credentials/[credId] — delete a credential
export async function DELETE(_request: Request, { params }: Params) {
  const { id, credId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("credentials")
    .delete()
    .eq("id", credId)
    .eq("project_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { deleted: true } });
}
