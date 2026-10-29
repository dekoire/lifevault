/** Fakt mit Gruppe (z. B. „Persönliche Daten“, „Bezüge“, „Abzüge“, „Gültigkeit“) */
export type Fact = { label: string; value: string; group?: string };
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
}

/** Inhalt, der bei verschlüsselten Dokumenten im Tresor liegt */
export type SecretPart = Pick<Doc, "summary" | "key_facts" | "deadlines" | "amounts" | "full_text">;

/** Spalten für Listen (ohne Volltext) */
export const LIST_COLS = "id,file_path,file_name,mime_type,size_bytes,status,error,cluster,title,doc_type,sender,doc_date,received_at,summary,key_facts,deadlines,amounts,tags,sender_domain,archived,archived_reason,encrypted";
