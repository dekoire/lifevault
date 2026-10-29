-- Wichtigkeit je Dokument (1–5, mit Grund) und Rolle innerhalb des Partners (Grundlage, Änderung, laufend …) samt Bezug zur Grundlage
alter table public.documents
  add column if not exists importance smallint check (importance between 1 and 5),
  add column if not exists importance_reason text,
  add column if not exists importance_manual boolean not null default false,
  add column if not exists partner_role text check (partner_role in ('grundlage','aenderung','laufend','schriftverkehr','nebensache')),
  add column if not exists basis_id uuid references public.documents(id) on delete set null;
create index if not exists documents_importance_idx on public.documents (user_id, importance desc);
create index if not exists documents_basis_idx on public.documents (basis_id);

-- Volltextsuche: Wichtigkeit hebt, Archiviertes senkt den Rang
create or replace function public.search_documents(q text, max_results int default 8)
returns setof public.documents
language sql stable security invoker set search_path = public
as $$
  select d.* from public.documents d
  where d.status = 'ready' and d.fts @@ websearch_to_tsquery('german', q)
  order by ts_rank(d.fts, websearch_to_tsquery('german', q))
    * (0.6 + 0.15 * coalesce(d.importance, 3))
    * (case when d.archived then 0.6 else 1 end) desc
  limit greatest(1, least(max_results, 20));
$$;
