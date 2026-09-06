-- Phase 1 – Fundament: Ablage fuer Spesenbelege
--
-- Wird erst in Phase 2b befuellt, muss aber vorher existieren. Privater Bucket:
-- Auslieferung ausschliesslich ueber signierte URLs mit kurzer Gueltigkeit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/jpeg','image/png','image/heic','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- Jeder Nutzer sieht ausschliesslich seinen eigenen Ordner: receipts/<uid>/…
create policy "receipts_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "receipts_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "receipts_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "receipts_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
