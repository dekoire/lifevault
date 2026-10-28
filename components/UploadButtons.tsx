"use client";
import { useRef } from "react";
import { Camera, FileUp } from "lucide-react";
import { useDocs } from "@/lib/docs";

/** Zwei Wege zum Hochladen: Kamera (Handy) oder Dateien (Fotos/PDF, mehrere auf einmal) */
export function useUploadPickers() {
  const { upload } = useDocs();
  const cam = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = "";
    if (list.length) void upload(list);
  };
  const inputs = (
    <>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
      <input ref={files} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onPick} />
    </>
  );
  return { inputs, openCamera: () => cam.current?.click(), openFiles: () => files.current?.click() };
}

export function UploadCard() {
  const { upload, uploading } = useDocs();
  const { inputs, openCamera, openFiles } = useUploadPickers();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const list = [...e.dataTransfer.files];
    if (list.length) void upload(list);
  };
  return (
    <section onDragOver={(e) => e.preventDefault()} onDrop={onDrop} className="rounded-3xl p-5 text-white shadow-md md:p-6" style={{ background: "linear-gradient(135deg, #7c5cff 0%, #6d4aff 45%, #4a2fc4 100%)" }}>
      {inputs}
      <h2 className="text-[19px] leading-7 font-semibold">Dokumente hinzufügen</h2>
      <p className="mt-1 text-[14px] leading-5 text-white/80">Foto oder PDF – Lifevault liest alles aus und sortiert es für dich.</p>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={openCamera} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-semibold text-brand-600 shadow-sm active:scale-[.98]"><Camera size={18} /> Fotografieren</button>
        <button type="button" onClick={openFiles} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/15 text-[15px] font-semibold text-white ring-1 ring-white/25 active:scale-[.98]"><FileUp size={18} /> Dateien</button>
      </div>
      {uploading > 0 && <p className="mt-3 text-[13px] text-white/85">Lade {uploading} {uploading === 1 ? "Datei" : "Dateien"} hoch …</p>}
    </section>
  );
}
