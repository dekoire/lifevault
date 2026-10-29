"use client";
import { PageHeader } from "@/components/ui";
import { DownloadsList } from "@/components/settings/Downloads";

export default function DownloadsPage() {
  return (
    <>
      <PageHeader title="Downloads" subtitle="Deine Exporte als ZIP – gespeichert in diesem Browser" />
      <DownloadsList />
    </>
  );
}
