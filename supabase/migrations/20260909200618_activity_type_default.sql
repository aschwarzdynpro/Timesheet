-- Standard-Taetigkeitsart
--
-- Fast jeder Zeiteintrag traegt dieselbe Art - "Beratung" bei den meisten
-- Beratern. Sie bei jedem Eintrag erneut zu waehlen ist Arbeit ohne Ertrag.
-- Eine Art traegt deshalb die Marke "Standard" und steht in der Erfassung
-- vorbelegt.
--
-- Hoechstens eine Art je Benutzer traegt sie. Diese Regel steht hier und nicht
-- in der Oberflaeche: sonst haetten zwei Fenster nebeneinander oder ein
-- direkter API-Aufruf gereicht, um zwei Standards zu erzeugen - und welcher
-- dann gewaenne, entschiede die Sortierung.

alter table activity_types
  add column is_default boolean not null default false;

comment on column activity_types.is_default is
  'Vorbelegung fuer neue Zeiteintraege; hoechstens eine je Benutzer';

-- Die Zusicherung. Der Trigger unten haelt sie im Normalfall ein; dieser Index
-- faengt den Fall, den kein Trigger sieht: zwei gleichzeitige Transaktionen.
create unique index activity_types_one_default
  on activity_types (owner_id) where is_default;

-- Der neue Standard loest den alten ab, statt abgelehnt zu werden.
--
-- Das Umsetzen als Trigger und nicht als zwei Aufrufe der Oberflaeche: dazwischen
-- gaebe es einen Moment ohne Standard, und bricht der zweite Aufruf ab, bliebe
-- es dabei.
create or replace function trg_activity_type_single_default()
returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  -- Eine inaktive Art steht in keiner Auswahlliste. Ein Standard, den man
  -- nirgends sieht und nirgends abwaehlen kann, waere eine Falle.
  if not new.is_active then
    new.is_default := false;
  end if;

  if new.is_default then
    update activity_types
       set is_default = false
     where owner_id = new.owner_id
       and id <> new.id
       and is_default;
  end if;

  return new;
end
$$;

-- Der Rekursionsschutz steckt in der Bedingung: die Zeilen, die der Trigger
-- selbst anfasst, bekommen is_default = false und loesen deshalb kein weiteres
-- Umsetzen aus.
create trigger trg_activity_types_single_default
  before insert or update on activity_types
  for each row execute function trg_activity_type_single_default();
