-- Entscheidungen merken (geräteübergreifend): automatisch zusammengeführte Partner, „verschiedene Partner“, „keine doppelten Dokumente“
alter table public.partner_merges drop constraint if exists partner_merges_kind_check;
alter table public.partner_merges add constraint partner_merges_kind_check check (kind in ('merge', 'rename', 'auto', 'distinct', 'distinct_docs'));
