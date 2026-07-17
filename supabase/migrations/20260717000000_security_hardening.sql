-- Le Dressing - security hardening
-- Adds atomic per-user API throttling and removes the legacy public profile
-- e-mail uniqueness workaround. Supabase Auth remains the source of truth for
-- account e-mail uniqueness.

begin;

drop index if exists public.users_email_lower_unique;

create table if not exists private.api_rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now(),

  constraint api_rate_limit_events_action check (
    action in (
      'remove_background',
      'analyze_clothing',
      'generate_outfits',
      'compose_outfit',
      'sync_clothing_item',
      'list_clothing_items',
      'send_welcome_email'
    )
  )
);

revoke all on table private.api_rate_limit_events
  from public, anon, authenticated;

create index if not exists api_rate_limit_user_window_idx
  on private.api_rate_limit_events (user_id, action, created_at desc);

create index if not exists api_rate_limit_cleanup_idx
  on private.api_rate_limit_events (created_at);

create or replace function public.consume_api_rate_limit(p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  minute_limit integer;
  hourly_limit integer;
  minute_count integer;
  hourly_count integer;
begin
  if requesting_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'authentication required';
  end if;

  select limits.minute_limit, limits.hourly_limit
    into minute_limit, hourly_limit
  from (values
    ('remove_background', 6, 30),
    ('analyze_clothing', 5, 30),
    ('generate_outfits', 3, 12),
    ('compose_outfit', 2, 6),
    ('sync_clothing_item', 15, 120),
    ('list_clothing_items', 30, 300),
    ('send_welcome_email', 2, 5)
  ) as limits(action, minute_limit, hourly_limit)
  where limits.action = p_action;

  if minute_limit is null or hourly_limit is null then
    raise exception using
      errcode = '22023',
      message = 'unknown API rate limit action';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      requesting_user_id::text || ':api:' || p_action,
      0
    )
  );

  delete from private.api_rate_limit_events
  where created_at < now() - interval '24 hours';

  select
    count(*) filter (where created_at >= now() - interval '1 minute'),
    count(*) filter (where created_at >= now() - interval '1 hour')
    into minute_count, hourly_count
  from private.api_rate_limit_events
  where user_id = requesting_user_id
    and action = p_action
    and created_at >= now() - interval '1 hour';

  if minute_count >= minute_limit or hourly_count >= hourly_limit then
    return false;
  end if;

  insert into private.api_rate_limit_events (user_id, action)
  values (requesting_user_id, p_action);

  return true;
end;
$$;

revoke all on function public.consume_api_rate_limit(text)
  from public, anon;
grant execute on function public.consume_api_rate_limit(text)
  to authenticated;

-- New uploads are limited to still-image formats inspected by the Edge
-- Function. Existing GIF objects remain readable but cannot be uploaded again.
update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'clothing-photos';

commit;
