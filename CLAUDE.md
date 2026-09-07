Die Arbeitsregeln für dieses Repository stehen in [AGENTS.md](AGENTS.md) — eine Datei
für alle Werkzeuge, damit die Regeln nicht auseinanderlaufen. Bitte dort weiterlesen,
bevor du etwas änderst.

Die fünf wichtigsten Punkte vorweg, falls es schnell gehen muss:

1. Geschäftslogik gehört in die Datenbank, nicht in die Oberfläche.
2. Alles Sichtbare kommt aus `src/components/ui/` — keine zweite Formensprache in
   eigenem CSS daneben.
3. Farben und Diagrammpalette bleiben, wie sie sind.
4. Der `service_role`-Key gehört nie ins Frontend.
5. Schema-Änderungen nur als neue Datei in `supabase/migrations/`.
