
insert into storage.buckets (id, name, public, file_size_limit)
values ('admin-kb', 'admin-kb', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "admin_kb_select" on storage.objects;
drop policy if exists "admin_kb_insert" on storage.objects;
drop policy if exists "admin_kb_update" on storage.objects;
drop policy if exists "admin_kb_delete" on storage.objects;

create policy "admin_kb_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'admin-kb' and public.has_role(auth.uid(), 'tabless_admin'));

create policy "admin_kb_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'admin-kb' and public.has_role(auth.uid(), 'tabless_admin'));

create policy "admin_kb_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'admin-kb' and public.has_role(auth.uid(), 'tabless_admin'))
  with check (bucket_id = 'admin-kb' and public.has_role(auth.uid(), 'tabless_admin'));

create policy "admin_kb_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'admin-kb' and public.has_role(auth.uid(), 'tabless_admin'));
