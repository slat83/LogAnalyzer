"use client";

import Link from "next/link";

export default function NoProject({ error }: { error?: string | null }) {
  if (error === "NO_PROJECT") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-4xl mb-3">📁</div>
        <p className="text-gray-300 font-medium mb-2">No project selected</p>
        <p className="text-gray-500 text-sm mb-4">
          Create a project and upload log files to see analytics.
        </p>
        <Link
          href="/projects"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Go to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-gray-300 font-medium mb-2">No analysis data found</p>
      <p className="text-gray-500 text-sm mb-4">
        Upload log files from your project settings to generate analytics.
      </p>
      <Link
        href="/projects"
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Go to Projects
      </Link>
    </div>
  );
}
