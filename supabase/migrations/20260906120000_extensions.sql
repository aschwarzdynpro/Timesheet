-- Phase 1 – Fundament: Erweiterungen
--
-- btree_gist wird gebraucht, damit EXCLUDE-Constraints Gleichheit auf uuid/text
-- mit Ueberlappung auf daterange kombinieren koennen. Genau das erzwingt die
-- Ueberlappungsfreiheit der Stundensatz-Historie.
--
-- Bewusst NICHT in public: dort waere die Erweiterung ueber die API sichtbar und
-- kollidiert mit eigenen Objekten (Supabase-Lint 0014, extension_in_public).
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
