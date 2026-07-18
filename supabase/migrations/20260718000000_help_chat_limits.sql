-- Le Dressing - help chat quota
-- Adds the 'help_chat' action to the existing rate-limit and AI-quota
-- ledgers so the AI-powered help assistant is throttled the same way as
-- the other Anthropic-backed features.

begin;

alter table private.api_rate_limit_events
  drop constraint api_rate_limit_events_action;

alter table private.api_rate_limit_events
  add constraint api_rate_limit_events_action check (
    action in (
      'remove_background',
      'analyze_clothing',
      'generate_outfits',
      'compose_outfit',
      'sync_clothing_item',
      'list_clothing_items',
      'send_welcome_email',
      'help_chat'
    )
  );

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
    ('send_welcome_email', 2, 5),
    ('help_chat', 10, 60)
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

alter table private.ai_usage_events
  drop constraint ai_usage_events_action;

alter table private.ai_usage_events
  add constraint ai_usage_events_action check (
    action in ('analyze_clothing', 'generate_outfits', 'help_chat')
  );

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
    when 'help_chat' then 60
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

commit;
