-- Verbundene Apps ohne Freigabe für persönliche Daten: Eckdaten nur noch nach Positivliste.
-- Bisher wurden nur bekannte persönliche Bezeichnungen entfernt (Name, Adresse, IBAN …). Durch rutschten aber z. B.
-- „Kosten Robert-Mayer Str. 70“, „Grundsteuer (Ahmed)“, „Diagnose“, „Staatsangehörigkeit“, „Steuerklasse“, „Kinder“.
-- Jetzt gilt: Ohne Freigabe gehen nur Vertrags-, Frist- und Zahlungsangaben raus, und keine Bezeichnung mit einem
-- Eigennamen in Klammern („Anteil Ahmed (8 Monate)“, „Strom (Anteil Wohnung)“). Die alte Sperrliste bleibt zusätzlich.
create or replace function public.api_fact_ok(c public.api_clients, f jsonb) returns boolean
language sql immutable set search_path = public as $$
  select c.allow_personal or (
    not coalesce((f ->> 'personal')::boolean, false)
    and coalesce(f ->> 'group', '') !~* '(persönlich|personal|kontakt|patient|gesundheit)'
    and coalesce(f ->> 'label', '') !~* '(name|adresse|anschrift|straße|str\.|wohnort|geburt|iban|bic|blz|konto|bank|kreditinstitut|sv-?nummer|sozialversicherung|steuer-?id|steuerklasse|identifikationsnummer|personalnummer|versichertennummer|kundennummer|vertragsnummer|mitglied|mandat|telefon|rufnummer|e-?mail|patient|diagnose|kinder|kirche|staatsangeh|tätigkeit|arbeitsverhältnis|arbeitsentgelt|beitragsgruppe|grund|steuer-?nr)'
    and coalesce(f ->> 'label', '') !~ '\([^)]*[A-ZÄÖÜ][a-zäöüß]+'
    and lower(coalesce(f ->> 'label', '')) ~ ('^(vertrags?beginn|versicherungsbeginn|mietbeginn|nutzungsbeginn|beginn|start|gültig ab|vertragsabschluss|vertragsart|vertragsablauf|'
      || 'vertragsverlängerung|laufzeit|mindestlaufzeit|ablauf|ende( |$)|versicherungsdauer|leistungsdauer|versicherungszeitraum|abrechnungszeitraum|leistungszeitraum|'
      || 'kündig|kündbar|ordentliche kündigung|sonderkündigung|verlängerung|widerrufsfrist|widerspruchsfrist|zahlungsweise|zahlweise|zahlart|zahlungsart|'
      || 'zahlungsfälligkeit|fälligkeit|fällig|zahlungsfrist|zahlungsziel|frist( |$)|tarif( |$)|preisanpassung|monatlicher beitrag|beitrag|monatsbeitrag|'
      || 'jahresbeitrag|jahresnettobeitrag|gesamtbeitrag|neuer beitrag|kaltmiete|gesamtmiete|vorauszahlung|abschlag|rechnungsbetrag|rechnungsdatum|gesamtbetrag|'
      || 'gesamtsumme|offener|zu zahlen|zu überweisen|summe( |$)|endsumme|mahnbetrag|mahngebühr|mahnkosten|forderung|hauptforderung|gebühr|aufnahmegebühr|'
      || 'selbstbeteiligung|versicherungsart|versicherungssumme|produkt|kategorie|status( |$)|mwst|umsatzsteuer|versicherungs?steuer|nettobetrag|zwischensumme|'
      || 'nachzahlung|kaution|preis)')
  );
$$;
revoke execute on function public.api_fact_ok(public.api_clients, jsonb) from public, anon, authenticated;

create or replace function public.api_doc_json(c public.api_clients, d public.documents, p_full boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', d.id,
    'project', (select jsonb_build_object('id', p.id, 'name', p.name) from public.projects p where p.id = d.project_id),
    'cluster', d.cluster, 'title', d.title, 'doc_type', d.doc_type, 'sender', d.sender, 'sender_domain', d.sender_domain,
    'doc_date', d.doc_date, 'received_at', d.received_at, 'file_name', d.file_name, 'mime_type', d.mime_type,
    'archived', d.archived, 'archived_reason', d.archived_reason, 'encrypted', d.encrypted,
    'summary', d.summary, 'tags', to_jsonb(d.tags), 'deadlines', d.deadlines, 'amounts', d.amounts,
    'key_facts', (select coalesce(jsonb_agg(f), '[]'::jsonb) from jsonb_array_elements(coalesce(d.key_facts, '[]'::jsonb)) f where public.api_fact_ok(c, f)),
    'redacted', jsonb_build_object('personal', not c.allow_personal, 'full_text', not (c.allow_personal and c.allow_full_text))
  ) || case when p_full and c.allow_personal and c.allow_full_text then jsonb_build_object('full_text', d.full_text) else '{}'::jsonb end;
$$;
revoke execute on function public.api_doc_json(public.api_clients, public.documents, boolean) from public, anon, authenticated;
