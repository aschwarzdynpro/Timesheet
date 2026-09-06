# Timesheet

Persönliche Zeiterfassung für Beratungsleistungen: Zeiten je Kunde und Projekt erfassen,
je Projekt mit eigenem Stundensatz bewerten, wochen-/monats-/jahresweise auswerten,
kundenindividuell reporten und nach Excel bzw. D365 F&O exportieren.

## Status

Konzeptphase (Rev. 3) – es ist noch kein Code implementiert.

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [docs/01-fachkonzept.md](docs/01-fachkonzept.md) | Fachliche Anforderungen, Kernentscheidungen, Auswertungen, Erfassungs-Ergonomie |
| [docs/02-architektur.md](docs/02-architektur.md) | Stack, Systemüberblick, Datenmodell, Export, FinOps-Anbindung, Phasenplan |

## Geplanter Stack

React 19 + TypeScript (Vite) · PostgreSQL (Supabase) · PostgREST · Edge Functions (Deno)

Details und Begründung der Technologiewahl: [docs/02-architektur.md](docs/02-architektur.md#1-technologie-stack)
