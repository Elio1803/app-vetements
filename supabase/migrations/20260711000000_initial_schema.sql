-- Le Dressing - initial Supabase schema
-- Photos are private Storage objects. `clothing_items.photo_url` stores an
-- object path (`<user-id>/<file-name>`), never a public URL.

begin;

create type public.clothing_category as enum (
  'haut',
  'bas',
  'chaussures',
  'veste_manteau',
  'accessoire',
  'robe'
);

create type public.outfit_occasion as enum (
  'quotidien',
  'travail',
  'soiree',
  'sport',
  'rendez_vous',
  'habille'
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),

  constraint users_email_shape check (
    email is null
    or (
      email = btrim(email)
      and char_length(email) between 3 and 320
      and position('@' in email) > 1
    )
  )
);

create unique index users_email_lower_unique
  on public.users (lower(email))
  where email is not null;

create table public.clothing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.users (id) on delete cascade,
  photo_url text not null,
  category public.clothing_category not null,
  color_dominant text,
  name text,
  created_at timestamptz not null default now(),
  last_worn_at timestamptz,
  wear_count integer not null default 0,

  constraint clothing_items_photo_path_shape check (
    char_length(photo_url) between 38 and 512
    and photo_url = btrim(photo_url)
    and position('//' in photo_url) = 0
    and position(chr(92) in photo_url) = 0
    and photo_url !~ '[[:cntrl:]]'
    and photo_url !~ '/$'
    and photo_url !~ '(^|/)\.{1,2}(/|$)'
    and split_part(photo_url, '/', 1) = user_id::text
  ),
  constraint clothing_items_color_length check (
    color_dominant is null
    or (
      color_dominant = btrim(color_dominant)
      and char_length(color_dominant) between 1 and 80
    )
  ),
  constraint clothing_items_name_length check (
    name is null
    or (
      name = btrim(name)
      and char_length(name) between 1 and 160
    )
  ),
  constraint clothing_items_wear_count_nonnegative check (wear_count >= 0)
);

comment on column public.clothing_items.photo_url is
  'Private Storage object path in clothing-photos, formatted as <user-id>/<file-name>; not a public URL.';

create index clothing_items_user_category_idx
  on public.clothing_items (user_id, category);

create index clothing_items_user_forgotten_idx
  on public.clothing_items (
    user_id,
    last_worn_at asc nulls first,
    created_at asc
  );

create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.users (id) on delete cascade,
  occasion public.outfit_occasion not null,
  item_ids uuid[] not null,
  ai_name text not null,
  ai_reason text not null,
  generation_request_id uuid not null,
  generation_request_hash text not null,
  generation_position smallint not null,
  worn_at timestamptz,
  created_at timestamptz not null default now(),

  constraint outfits_item_count check (cardinality(item_ids) between 1 and 12),
  constraint outfits_item_ids_have_no_null check (array_position(item_ids, null) is null),
  constraint outfits_ai_name_length check (
    ai_name = btrim(ai_name)
    and char_length(ai_name) between 1 and 100
  ),
  constraint outfits_ai_reason_length check (
    ai_reason = btrim(ai_reason)
    and char_length(ai_reason) between 1 and 1000
  ),
  constraint outfits_generation_request_hash_shape check (
    generation_request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint outfits_generation_position check (generation_position between 0 and 2)
);

comment on column public.outfits.item_ids is
  'Snapshot of clothing item IDs. A trigger verifies ownership/existence when the outfit is created; historical IDs may remain after a clothing item is deleted.';

create index outfits_user_created_idx
  on public.outfits (user_id, created_at desc);

create index outfits_user_worn_idx
  on public.outfits (user_id, worn_at desc)
  where worn_at is not null;

create index outfits_item_ids_gin_idx
  on public.outfits using gin (item_ids);

create unique index outfits_generation_idempotency_unique
  on public.outfits (user_id, generation_request_id, generation_position);

-- Internal usage ledger for cost control. It is outside the exposed `public`
-- schema and can only be touched by the SECURITY DEFINER quota function.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now(),

  constraint ai_usage_events_action check (
    action in ('analyze_clothing', 'generate_outfits')
  )
);

revoke all on table private.ai_usage_events from public, anon, authenticated;

create index ai_usage_events_user_window_idx
  on private.ai_usage_events (user_id, action, created_at desc);

create index ai_usage_events_cleanup_idx
  on private.ai_usage_events (created_at);

-- Keep public profiles synchronized with Supabase Auth. Email is nullable so
-- enabling another Auth provider later cannot make Auth user creation fail.
create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, created_at)
  values (new.id, new.email, coalesce(new.created_at, now()))
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

revoke all on function public.sync_auth_user_profile()
  from public, anon, authenticated;

create trigger on_auth_user_profile_changed
  after insert or update of email on auth.users
  for each row execute function public.sync_auth_user_profile();

-- Backfill profiles when this migration is applied to an existing project.
insert into public.users (id, email, created_at)
select id, email, created_at
from auth.users
on conflict (id) do update
  set email = excluded.email;

-- PostgreSQL cannot express a foreign key for every member of a uuid array.
-- This trigger provides the relevant integrity guarantee on insert/update.
create or replace function public.validate_outfit_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  distinct_item_count integer;
  owned_item_count integer;
begin
  select count(distinct item_id)
    into distinct_item_count
  from unnest(new.item_ids) as requested(item_id);

  if distinct_item_count <> cardinality(new.item_ids) then
    raise exception using
      errcode = '23514',
      message = 'outfit item_ids must contain unique values';
  end if;

  select count(*)
    into owned_item_count
  from public.clothing_items as item
  where item.user_id = new.user_id
    and item.id = any(new.item_ids);

  if owned_item_count <> cardinality(new.item_ids) then
    raise exception using
      errcode = '23503',
      message = 'every outfit item must exist and belong to the outfit owner';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_outfit_items()
  from public, anon, authenticated;

create trigger validate_outfit_items_before_write
  before insert or update of user_id, item_ids on public.outfits
  for each row execute function public.validate_outfit_items();

-- Fixed server-side limits: 30 image analyses/hour and 12 generations/hour.
-- The advisory lock prevents concurrent requests from racing past the limit.
create or replace function public.consume_ai_quota(p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  hourly_limit integer;
  recent_request_count integer;
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'authentication required';
  end if;

  hourly_limit := case p_action
    when 'analyze_clothing' then 30
    when 'generate_outfits' then 12
    else null
  end;

  if hourly_limit is null then
    raise exception using
      errcode = '22023',
      message = 'unknown AI quota action';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requesting_user_id::text || ':' || p_action, 0)
  );

  -- Opportunistic retention keeps the internal ledger bounded.
  delete from private.ai_usage_events
  where created_at < now() - interval '24 hours';

  select count(*)
    into recent_request_count
  from private.ai_usage_events as usage
  where usage.user_id = requesting_user_id
    and usage.action = p_action
    and usage.created_at >= now() - interval '1 hour';

  if recent_request_count >= hourly_limit then
    return false;
  end if;

  insert into private.ai_usage_events (user_id, action)
  values (requesting_user_id, p_action);

  return true;
end;
$$;

revoke all on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;

-- The only supported way for clients to mark an existing generated outfit as
-- worn. The row lock and worn_at guard make the operation atomic/idempotent.
create or replace function public.mark_outfit_worn(p_outfit_id uuid)
returns public.outfits
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  selected_outfit public.outfits%rowtype;
  worn_timestamp timestamptz := now();
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'authentication required';
  end if;

  select outfit.*
    into selected_outfit
  from public.outfits as outfit
  where outfit.id = p_outfit_id
    and outfit.user_id = requesting_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'outfit not found';
  end if;

  if selected_outfit.worn_at is null then
    update public.clothing_items as item
    set
      last_worn_at = case
        when item.last_worn_at is null or item.last_worn_at < worn_timestamp
          then worn_timestamp
        else item.last_worn_at
      end,
      wear_count = item.wear_count + 1
    where item.user_id = requesting_user_id
      and item.id = any(selected_outfit.item_ids);

    update public.outfits as outfit
    set worn_at = worn_timestamp
    where outfit.id = selected_outfit.id
    returning outfit.* into selected_outfit;
  end if;

  return selected_outfit;
end;
$$;

revoke all on function public.mark_outfit_worn(uuid) from public, anon;
grant execute on function public.mark_outfit_worn(uuid) to authenticated;

alter table public.users enable row level security;
alter table public.clothing_items enable row level security;
alter table public.outfits enable row level security;

alter table public.users force row level security;
alter table public.clothing_items force row level security;
alter table public.outfits force row level security;

create policy users_select_own
  on public.users
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy clothing_items_select_own
  on public.clothing_items
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy clothing_items_insert_own
  on public.clothing_items
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy clothing_items_update_own
  on public.clothing_items
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy clothing_items_delete_own
  on public.clothing_items
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create policy outfits_select_own
  on public.outfits
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy outfits_delete_own
  on public.outfits
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Explicit grants complement RLS. Wear tracking columns are intentionally not
-- client-updatable; mark_outfit_worn owns that state transition.
revoke all on table public.users from public, anon, authenticated;
revoke all on table public.clothing_items from public, anon, authenticated;
revoke all on table public.outfits from public, anon, authenticated;

grant select on table public.users to authenticated;
grant select, delete on table public.clothing_items to authenticated;
grant insert (id, user_id, photo_url, category, color_dominant, name)
  on table public.clothing_items to authenticated;
grant update (photo_url, category, color_dominant, name)
  on table public.clothing_items to authenticated;
grant select, delete on table public.outfits to authenticated;

grant usage on type public.clothing_category to authenticated;
grant usage on type public.outfit_occasion to authenticated;

-- Private bucket. The first path segment is the authenticated user's UUID.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'clothing-photos',
  'clothing-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy clothing_photos_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'clothing-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy clothing_photos_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'clothing-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy clothing_photos_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'clothing-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'clothing-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy clothing_photos_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'clothing-photos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

commit;
