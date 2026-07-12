alter table public.users
  add column if not exists welcome_email_sent_at timestamptz;

comment on column public.users.welcome_email_sent_at is
  'Timestamp of the single welcome email sent by the authenticated Edge Function.';
