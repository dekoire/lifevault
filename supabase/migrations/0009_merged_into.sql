-- Zusammengeführte Dokumente: Einzelteile bleiben erhalten (ausgeblendet) und verweisen auf das Ganze.
-- Wird das Ganze gelöscht („Wieder trennen“), sind die Teile automatisch wieder einzeln da.
alter table public.documents add column if not exists merged_into uuid references public.documents(id) on delete set null;
create index if not exists documents_merged_into_idx on public.documents (merged_into) where merged_into is not null;
