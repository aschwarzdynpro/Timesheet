# E2E-Prüfung der Zeiterfassung

## Reguläres PR-Gate

`E2E` baut die App und prüft sie über `vite preview`. Installation und Start stehen
im README unter „Browser-Tests“. Die vollständige Suite läuft auf Chromium bei
320/390/768/1400 px und WebKit mit dem iPhone-13-Profil bei 390 px. Das WebKit-Projekt
startet wirklich WebKit; es ist dennoch keine Prüfung auf einem physischen iPhone.

| Szenario | Nachweis |
|---|---|
| Jahres-/Wochenwechsel | genaue Query-Grenzen, Datensätze und Kalenderwoche |
| Schnelleintrag | Validierung, POST-Werte, Persistenz nach Reload |
| Inline-Bearbeitung | Blur/Enter, PATCH-ID und Werte, Wochenwechsel, Reload |
| Ungültige Dauer/Beschreibung | sichtbare Validierung, keine Mutation |
| Neue Zeile | unvollständiger Entwurf bleibt erhalten, genau ein POST nach Vervollständigung |
| Löschen | Fokus auf Abbrechen, keine Mutation beim Abbruch, gezieltes DELETE nach Bestätigung |
| API-Fehler | Entwurf bleibt korrigierbar, fehlgeschlagenes DELETE erhält Daten |
| Wocheneditor | aufgeklappter Rastereditor bzw. mobiler Dialog speichert denselben Datensatz |
| Gemeldete/abgenommene/fakturierte Periode | schreibgeschützter Bestand, leere Tage bleiben gesperrt, Folgewoche wieder offen |
| Sperre nach dem Laden | Serverfehler sichtbar, gespeicherter Bestand bleibt unverändert |
| Responsive Layout | kein Seiten-/Dialog-Overflow, keine Browserfehler |

Die Mocks sind je Test isoliert und zustandsbehaftet. PATCH/DELETE verlangen eine
konkrete ID; ein Mutationsprotokoll sichert ausbleibende oder doppelte Requests ab.
Fehler werden gezielt für die nächste Mutation injiziert. Datumsfilter werden
weiterhin ausgewertet. Die Antworten auf Schreibrequests sind **Test-Fixtures**,
keine zweite Implementierung von Rundung, Satzermittlung, Periodenzuordnung oder
RLS. Deren Nachweis bleibt in den Datenbanktests.

## Echte Anmeldung: separater Smoke-Test

`npm --prefix e2e run test:auth` verwendet weder eine vorbereitete Browser-Session
noch gemockte Auth-/API-Antworten. Er prüft Passwortanmeldung, Session-Erhalt nach
Reload und Abmeldung mit erneutem Reload in Chromium und WebKit. Schreibende
REST-Aufrufe auf Geschäftsdaten werden abgebrochen; der Test erstellt keine
Buchungen. Magic Links, MFA, ablaufende Refresh-Tokens und echte CRUD-/RLS-E2E
sind nicht Teil dieses Smoke-Tests.

Im Repository war bei Einführung keine separate Supabase-Testumgebung hinterlegt.
Der Test ist vorbereitet, aber **ohne eingerichtetes Testprojekt und bestätigten
Lauf nicht als erfolgreich validiert zu werten**.

Für GitHub Actions das Environment `e2e-auth` mit diesen Werten konfigurieren:

| Name | Art | Inhalt |
|---|---|---|
| `E2E_AUTH_SUPABASE_URL` | Variable | HTTPS-URL des separaten Supabase-Testprojekts |
| `E2E_AUTH_PUBLISHABLE_KEY` | Variable | öffentlicher `sb_publishable_…`-Key dieses Projekts |
| `E2E_AUTH_EMAIL` | Secret | dediziertes bestätigtes Testkonto |
| `E2E_AUTH_PASSWORD` | Secret | Passwort des Testkontos |

Das Testprojekt muss das Timesheet-Schema besitzen; Stammdaten und Zeiteinträge
sind für diesen Anmeldetest nicht nötig. Keine produktiven Nutzer oder Daten
verwenden. Der Test provisioniert keine Umgebung und führt keine Migrationen aus.

Danach unter Actions den Workflow **Auth Smoke** manuell starten. Lokal dieselben
vier Variablen in der Shell bereitstellen und `npm --prefix e2e run test:auth`
aufrufen. Fehlende Konfiguration führt zu einem Fehler statt zu einem grünen Skip.
Port 4174 muss frei sein. Auth- und Mock-Suite bauen beide nach `dist` und dürfen
lokal deshalb nicht gleichzeitig laufen.

Der Auth-Test schreibt keine Session-Datei. Traces, Screenshots, Videos und
Report-Uploads sind dort deaktiviert, damit Passwort und Sitzung nicht in
Artefakten landen. Secrets gehören weder in Issues noch in Logs oder Repository-Dateien.
