-- Herkunft einer importierten Mail: wer hat sie an Lifevault geschickt, von wem kam sie ursprünglich, an wen war sie adressiert.
-- So sieht man am Dokument, über welches Postfach (welches Konto) es kam.
alter table public.mail_seen
  add column if not exists forwarded_by text check (char_length(forwarded_by) <= 300),
  add column if not exists original_from text check (char_length(original_from) <= 300),
  add column if not exists original_to text[] check (cardinality(original_to) <= 10);
