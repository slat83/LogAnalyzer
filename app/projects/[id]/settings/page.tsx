"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import LogUploader from "@/components/LogUploader";
import CsvUploader from "@/components/CsvUploader";
import { useProject } from "@/lib/project-context";
import { clearSummaryCache } from "@/lib/data";

interface Project {
  id: string;
  name: string;
  description: string | null;
  log_format: string;
  site_url: string | null;
  brand_keywords: string[];
}

interface Credential {
  id: string;
  type: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
}

const CRED_TYPES = [
  { value: "ssh", label: "SSH", icon: "🔑" },
  { value: "sftp", label: "SFTP", icon: "📂" },
  { value: "gsc_api", label: "Google Search Console", icon: "🔍" },
  { value: "ga4_api", label: "Google Analytics 4", icon: "📊" },
  { value: "custom_api", label: "Custom API", icon: "🔗" },
];

function CredentialForm({
  projectId,
  onCreated,
  onCancel,
}: {
  projectId: string;
  onCreated: (c: Credential) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState("ssh");
  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields: Record<string, { label: string; placeholder: string; type?: string }[]> = {
    ssh: [
      { label: "Host", placeholder: "192.168.1.100" },
      { label: "Port", placeholder: "22" },
      { label: "Username", placeholder: "root" },
      { label: "Password", placeholder: "Leave empty for key auth", type: "password" },
      { label: "Private Key", placeholder: "Paste SSH private key" },
      { label: "Log Path", placeholder: "/var/log/nginx/" },
      { label: "Log Pattern", placeholder: "access.log*.gz" },
    ],
    sftp: [
      { label: "Host", placeholder: "ftp.example.com" },
      { label: "Port", placeholder: "22" },
      { label: "Username", placeholder: "user" },
      { label: "Password", placeholder: "Password", type: "password" },
      { label: "Log Path", placeholder: "/logs/" },
      { label: "Log Pattern", placeholder: "*.log.gz" },
    ],
    gsc_api: [
      { label: "Service Account JSON", placeholder: "Paste the full JSON key file content" },
      { label: "Site URL", placeholder: "https://example.com" },
    ],
    ga4_api: [
      { label: "Service Account JSON", placeholder: "Paste the full JSON key file content" },
      { label: "Property ID", placeholder: "123456789" },
    ],
    custom_api: [
      { label: "Base URL", placeholder: "https://api.example.com" },
      { label: "Auth Type", placeholder: "bearer / api_key / basic" },
      { label: "Token", placeholder: "Your API token", type: "password" },
    ],
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/projects/${projectId}/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name, config }),
    });

    const data = await res.json();
    if (res.ok) {
      onCreated(data.data);
    } else {
      setError(data.error || "Failed to save credential");
    }
    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4"
    >
      <h3 className="text-lg font-semibold text-white">Add Credential</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setConfig({}); }}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {CRED_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            placeholder="e.g., Production Server"
          />
        </div>
      </div>

      {(fields[type] || []).map((f) => (
        <div key={f.label}>
          <label className="block text-sm font-medium text-gray-300 mb-1">{f.label}</label>
          {f.label.includes("JSON") || f.label === "Private Key" ? (
            <textarea
              value={config[f.label] || ""}
              onChange={(e) => setConfig({ ...config, [f.label]: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono text-sm"
              placeholder={f.placeholder}
            />
          ) : (
            <input
              type={f.type || "text"}
              value={config[f.label] || ""}
              onChange={(e) => setConfig({ ...config, [f.label]: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder={f.placeholder}
            />
          )}
        </div>
      ))}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? "Saving..." : "Save Credential"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { setProjectId } = useProject();

  const [project, setProject] = useState<Project | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCred, setShowAddCred] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSiteUrl, setEditSiteUrl] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [fetchingMentions, setFetchingMentions] = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/credentials`).then((r) => r.json()),
    ]).then(([projRes, credRes]) => {
      setProject(projRes.data || null);
      setCredentials(credRes.data || []);
      if (projRes.data) {
        setEditName(projRes.data.name);
        setEditDesc(projRes.data.description || "");
        setEditSiteUrl(projRes.data.site_url || "");
        setEditKeywords((projRes.data.brand_keywords || []).join(", "));
      }
      setLoading(false);
    });
  }, [projectId]);

  async function handleUpdateProject(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        description: editDesc,
        site_url: editSiteUrl || null,
        brand_keywords: editKeywords.split(",").map((k: string) => k.trim()).filter(Boolean),
      }),
    });
    const { data } = await res.json();
    if (data) {
      setProject(data);
      setEditing(false);
    }
  }

  async function handleDeleteCred(credId: string) {
    await fetch(`/api/projects/${projectId}/credentials/${credId}`, {
      method: "DELETE",
    });
    setCredentials(credentials.filter((c) => c.id !== credId));
  }

  async function handleDeleteProject() {
    if (!confirm("Delete this project and all its data? This cannot be undone.")) return;
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    router.push("/projects");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Project not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Project Info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          <button
            onClick={() => setEditing(!editing)}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        {editing ? (
          <form onSubmit={handleUpdateProject} className="space-y-3">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <input
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <input
              value={editSiteUrl}
              onChange={(e) => setEditSiteUrl(e.target.value)}
              placeholder="Site URL (e.g., https://epicvin.com)"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Brand Keywords (comma-separated)</label>
              <input
                value={editKeywords}
                onChange={(e) => setEditKeywords(e.target.value)}
                placeholder="EpicVin, epicvin, epicvin.com"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Save
            </button>
          </form>
        ) : (
          <div>
            {project.description && (
              <p className="text-gray-400 text-sm">{project.description}</p>
            )}
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">
                Format: {project.log_format}
              </span>
              {project.site_url ? (
                <span className="text-xs bg-gray-800 text-blue-400 px-2 py-1 rounded">
                  {project.site_url}
                </span>
              ) : (
                <span className="text-xs bg-yellow-900/50 text-yellow-400 px-2 py-1 rounded">
                  No site URL set — needed for Schema scan
                </span>
              )}
              {project.brand_keywords?.length > 0 && (
                <span className="text-xs bg-gray-800 text-green-400 px-2 py-1 rounded">
                  Keywords: {project.brand_keywords.join(", ")}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fetch Competitor Mentions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Competitor Mentions</h3>
            <p className="text-gray-400 text-sm mt-1">Fetch latest mentions from Firehose and check for brand keyword matches.</p>
          </div>
          <button
            onClick={async () => {
              setFetchingMentions(true); setFetchResult(null);
              try {
                const res = await fetch(`/api/projects/${projectId}/competitors/fetch`, { method: "POST" });
                const d = await res.json();
                if (!res.ok) throw new Error(d.error);
                setFetchResult(`Fetched ${d.data?.total || 0} events, ${d.data?.inserted || 0} new, ${d.data?.brandMentions || 0} brand mentions`);
              } catch (e) { setFetchResult(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
              setFetchingMentions(false);
            }}
            disabled={fetchingMentions}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            {fetchingMentions ? "Fetching..." : "Fetch Now"}
          </button>
        </div>
        {fetchResult && <p className={`text-sm mt-3 ${fetchResult.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{fetchResult}</p>}
      </div>

      {/* Log Upload */}
      <LogUploader projectId={projectId} onComplete={() => { setProjectId(projectId); clearSummaryCache(); }} />

      {/* GSC CSV Upload */}
      <CsvUploader projectId={projectId} />

      {/* Credentials */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Credentials</h2>
          <button
            onClick={() => setShowAddCred(!showAddCred)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Credential
          </button>
        </div>

        {showAddCred && (
          <div className="mb-4">
            <CredentialForm
              projectId={projectId}
              onCreated={(c) => {
                setCredentials([c, ...credentials]);
                setShowAddCred(false);
              }}
              onCancel={() => setShowAddCred(false)}
            />
          </div>
        )}

        {credentials.length === 0 ? (
          <div className="text-center py-10 bg-gray-900 border border-gray-800 rounded-xl text-gray-500">
            <div className="text-3xl mb-2">🔒</div>
            <p className="text-sm">No credentials yet. Add SSH/SFTP or API keys to connect your data sources.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {credentials.map((c) => {
              const typeInfo = CRED_TYPES.find((t) => t.value === c.type);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{typeInfo?.icon || "🔗"}</span>
                    <div>
                      <div className="text-white font-medium text-sm">{c.name}</div>
                      <div className="text-gray-500 text-xs">
                        {typeInfo?.label || c.type}
                        {c.last_used_at &&
                          ` · Last used ${new Date(c.last_used_at).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteCred(c.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="border border-red-900/50 rounded-xl p-5">
        <h2 className="text-lg font-bold text-red-400 mb-2">Danger Zone</h2>
        <p className="text-gray-400 text-sm mb-4">
          Deleting this project will permanently remove all credentials, patterns, and analysis results.
        </p>
        <button
          onClick={handleDeleteProject}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Delete Project
        </button>
      </div>
    </div>
  );
}
