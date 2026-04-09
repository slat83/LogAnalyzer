import type { Metadata } from "next";
import "./globals.css";
import Layout from "@/components/Layout";
import { ProjectProvider } from "@/lib/project-context";
import { DateRangeProvider } from "@/lib/date-range-context";

export const metadata: Metadata = {
  title: "LogAnalyzer",
  description: "Access log analysis dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased">
        <ProjectProvider>
          <DateRangeProvider>
            <Layout>{children}</Layout>
          </DateRangeProvider>
        </ProjectProvider>
      </body>
    </html>
  );
}
