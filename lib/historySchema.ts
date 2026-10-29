import { z } from "zod";

/** Verlauf: wer/was war früher, wer/was gilt jetzt – Arztwechsel, Praxisübergaben, alter → neuer Vertrag */
export const HistorySchema = z.object({
  roles: z.array(z.object({
    role: z.string().describe("Rolle aus Sicht der Person, z. B. „Hausarzt“, „Urologe“, „Endokrinologie“, „Arbeitgeber“, „Krankenkasse“, „Wohnung“, „Mobilfunk“"),
    chain: z.array(z.object({
      name: z.string().describe("Stelle/Person genau so geschrieben wie der Absender in den Dokumenten"),
      from: z.string().nullable().describe("Beginn, JJJJ oder JJJJ-MM"),
      to: z.string().nullable().describe("Ende, JJJJ oder JJJJ-MM; null wenn aktuell oder unbekannt"),
      status: z.enum(["aktuell", "früher"]),
      change: z.enum(["start", "wechsel", "uebergabe", "umzug", "neuer_vertrag", "ende"]).nullable().describe("wie es zu diesem Eintrag kam: wechsel = anderer Arzt/Anbieter, uebergabe = Praxis/Firma ging an Nachfolger (z. B. Vater → Sohn), neuer_vertrag = neue Fassung beim selben Partner"),
      note: z.string().nullable().describe("kurz, z. B. „Praxis wahrscheinlich vom Vater an den Sohn übergeben (gleicher Nachname, gleiche Adresse)“"),
      docIds: z.array(z.string()).describe("höchstens 3 Quelldokumente"),
    })).describe("chronologisch, ältester zuerst"),
  })).describe("nur Rollen, bei denen es einen Verlauf oder einen klaren aktuellen Stand gibt"),
  contracts: z.array(z.object({
    topic: z.string().describe("z. B. „Arbeitsvertrag“, „Mietvertrag“, „Krankenversicherung“"),
    currentDocId: z.string().nullable(),
    oldDocIds: z.array(z.string()).describe("ältere, abgelöste Fassungen/Verträge"),
    note: z.string().nullable(),
  })).describe("alter Vertrag → neuer Vertrag; nur wenn es wirklich eine neuere Fassung gibt"),
});
export type History = z.infer<typeof HistorySchema>;
export type HistoryEntry = History["roles"][number]["chain"][number];
