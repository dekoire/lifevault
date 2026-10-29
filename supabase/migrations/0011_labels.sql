alter table public.documents add column if not exists labels text[];
create index if not exists documents_labels_idx on public.documents using gin (labels);
