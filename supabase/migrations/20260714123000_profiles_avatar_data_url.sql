alter table public.profiles
  add column if not exists avatar_data_url text;

