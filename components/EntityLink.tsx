"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useDetail } from "@/components/DetailPanel";
import { SenderLogo } from "@/components/SenderLogo";
import { useDocs } from "@/lib/docs";
import { buildPartners } from "@/lib/partners";

/** Verweis im Chat auf ein Dokument (/d/ID) oder einen Partner (/partner/KEY): mit Logo, Klick öffnet das Seitenpanel */
export function EntityLink({ href, label }: { href: string; label: string }) {
  const open = useDetail();
  const { allDocs } = useDocs();
  const docId = /^\/d\/([0-9a-f-]{36})$/i.exec(href)?.[1];
  const pkey = /^\/partner\/([a-z0-9äöüß-]+)$/i.exec(href)?.[1];
  const doc = docId ? allDocs.find((d) => d.id === docId) : undefined;
  const partner = useMemo(() => (pkey ? buildPartners(allDocs).find((p) => p.key === pkey) : undefined), [pkey, allDocs]);
  const logo = doc ? <SenderLogo domain={doc.sender_domain} sender={doc.sender} cluster={doc.cluster} size={18} /> : partner ? <SenderLogo domain={partner.domain} sender={partner.name} cluster={partner.cluster} size={18} /> : null;
  const cls = "mx-0.5 inline-flex max-w-full translate-y-[-1px] items-center gap-1.5 rounded-full border border-card-line bg-surface py-0.5 pr-2.5 pl-1 align-middle text-[14px] leading-5 font-semibold text-fg hover:bg-surface-2";
  const onClick = (e: React.MouseEvent) => {
    if (!open || (!docId && !pkey)) return;
    e.preventDefault();
    open(docId ? { kind: "doc", id: docId } : { kind: "partner", key: pkey! });
  };
  return <Link href={href} onClick={onClick} className={logo ? cls : `${cls} pl-2.5`}>{logo}<span className="truncate">{label}</span></Link>;
}
