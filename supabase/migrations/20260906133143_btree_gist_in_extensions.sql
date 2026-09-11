-- btree_gist liegt im Schema extensions, nicht in public
--
-- Diese Migration lief bereits gegen die Datenbank, fehlte hier aber als Datei:
-- eine frueh eingespielte Fassung der Erweiterungs-Migration hatte btree_gist
-- noch in public angelegt, und dort ist sie ueber die API sichtbar und
-- kollidiert mit eigenen Objekten (Supabase-Lint 0014, extension_in_public).
--
-- Ohne diese Datei kaeme eine frische Datenbank aus supabase/migrations zwar
-- zum richtigen Ergebnis - die Erweiterungs-Migration legt die Erweiterung
-- inzwischen gleich in extensions an -, der lokale Migrationsstand wiche aber
-- weiter von dem der Datenbank ab.
--
-- Deshalb mit Bedingung: Liegt die Erweiterung schon am richtigen Ort, gibt es
-- nichts zu tun. Ein unbedingtes ALTER wuerde dort mit "is already in schema
-- extensions" abbrechen und jeden Testlauf gegen eine frische Datenbank
-- scheitern lassen.
do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'btree_gist' and n.nspname <> 'extensions'
  ) then
    alter extension btree_gist set schema extensions;
  end if;
end $$;
