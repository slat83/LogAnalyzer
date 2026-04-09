"use client";
import { useGscHealth } from "@/lib/use-gsc-health";
import NoProject from "@/components/NoProject";

export default function CwvPage() {
  const { data, loading, error } = useGscHealth("core_web_vitals");
  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !data.length) return <NoProject error={error} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">⚙️ Core Web Vitals</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-800 text-gray-400">
            <th className="px-4 py-3 text-left">Metric</th>
            <th className="px-4 py-3 text-left">Value</th>
            <th className="px-4 py-3 text-left">Date</th>
          </tr></thead>
          <tbody>
            {data.map((r, i) => {
              const entries = Object.entries(r.data).filter(([, v]) => v !== null && v !== "");
              return entries.map(([key, val], j) => (
                <tr key={`${i}-${j}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-300 font-medium">{key}</td>
                  <td className="px-4 py-2 text-gray-100">{String(val)}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{r.report_date}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
