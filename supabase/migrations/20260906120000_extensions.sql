-- Phase 1 – Fundament: Erweiterungen
--
-- btree_gist wird gebraucht, damit EXCLUDE-Constraints Gleichheit auf uuid/text
-- mit Ueberlappung auf daterange kombinieren koennen. Genau das erzwingt die
-- Ueberlappungsfreiheit der Stundensatz-Historie.
create extension if not exists btree_gist;
