-- Run in Supabase SQL Editor. Do not put a service-role key in the website.
create table if not exists public.collection (user_id uuid not null references auth.users(id) on delete cascade,model_id text not null,status text not null check(status in ('Owned','Ordered','Missing','Unconfirmed','Wishlist')),updated_at timestamptz not null default now(),primary key(user_id,model_id));
create table if not exists public.release_leads (id bigint generated always as identity primary key,brand text not null,title text not null,url text not null unique,status text not null default 'TBA / review',detected_at timestamptz not null default now());
create table if not exists public.push_subscriptions (user_id uuid not null references auth.users(id) on delete cascade,endpoint text not null,subscription jsonb not null,created_at timestamptz not null default now(),primary key(user_id,endpoint));
alter table public.collection enable row level security;
alter table public.release_leads enable row level security;
alter table public.push_subscriptions enable row level security;
create policy "Read own collection" on public.collection for select to authenticated using ((select auth.uid())=user_id);
create policy "Write own collection" on public.collection for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Update own collection" on public.collection for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Read public release leads" on public.release_leads for select to anon,authenticated using (true);
create policy "Read own push subscriptions" on public.push_subscriptions for select to authenticated using ((select auth.uid())=user_id);
create policy "Create own push subscriptions" on public.push_subscriptions for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Update own push subscriptions" on public.push_subscriptions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update on public.collection to authenticated;
grant select on public.release_leads to anon,authenticated;
grant select,insert,update on public.push_subscriptions to authenticated;
