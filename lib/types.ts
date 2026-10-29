/** Fakt mit Gruppe (z. B. „Persönliche Daten“, „Bezüge“, „Abzüge“, „Gültigkeit“) */
export type Fact = { label: string; value: string; group?: string; personal?: boolean };
export type Deadline = { date: string; what: string };
export type Amount = { label: string; value: number; currency: string };

export interface Doc {
  id: string;
  user_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: "processing" | "ready" | "error";
  error: string | null;
  cluster: string | null;
  title: string | null;
  doc_type: string | null;
  sender: string | null;
  doc_date: string | null;
  received_at: string;
  summary: string | null;
  key_facts: Fact[];
  deadlines: Deadline[];
  amounts: Amount[];
  tags: string[];
  full_text: string | null;
  sender_domain: string | null;
  archived: boolean;
  archived_reason: string | null;
  encrypted: boolean;
  secret: { iv: string; ct: string } | null;
  project_id: string | null;
  split_from: string | null;
  /** aus der Internetrecherche: Suchanfrage, Quelle, wann geholt und zuletzt geprüft */
  web_source?: WebSource | null;
  /** Einzelteil eines zusammengeführten Dokuments (ausgeblendet, bis „Wieder trennen“) */
  merged_into?: string | null;
  topic?: string | null;
  purpose?: "zu_erledigen" | "wichtig" | "info" | null;
  topic_manual?: boolean;
  labels?: string[] | null;
  /** Wichtigkeit 1–5 (5 = unverzichtbar) mit kurzem Grund; von Hand gesetzt bleibt sie beim Neubewerten */
  importance?: number | null;
  importance_reason?: string | null;
  importance_manual?: boolean;
  /** Rolle beim Partner und Bezug zur Grundlage (z. B. Rechnung → Vertrag) */
  partner_role?: "grundlage" | "aenderung" | "laufend" | "schriftverkehr" | "nebensache" | null;
  basis_id?: string | null;
}

/** Inhalt, der bei verschlüsselten Dokumenten im Tresor liegt */
export type SecretPart = Pick<Doc, "summary" | "key_facts" | "deadlines" | "amounts" | "full_text">;

/** Spalten für Listen (ohne Volltext) */
export type WebSource = { query: string; url?: string; title?: string; imported_at: string; checked_at: string };
export const LIST_COLS = "id,file_path,file_name,mime_type,size_bytes,status,error,cluster,title,doc_type,sender,doc_date,received_at,summary,key_facts,deadlines,amounts,tags,sender_domain,archived,archived_reason,encrypted,secret,project_id,split_from,web_source,merged_into,topic,purpose,topic_manual,labels,importance,importance_reason,importance_manual,partner_role,basis_id";
