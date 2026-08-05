-- AI PRD Copilot · Supabase 表结构（阶段 2：数据持久化）
-- 方式：在 Supabase Dashboard → SQL Editor 中整段执行，或在本地 supabase migration 中应用
-- 安全：启用 RLS，仅本人可管理自己的数据（按 Supabase 安全规范，TO authenticated + 属主谓词）

create extension if not exists "pgcrypto";

-- 项目表：整份 PRD（材料/章节/追问）以 JSON 存储，便于前端直接读写
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '未命名项目',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "users manage own projects"
  on public.projects
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

-- 用户设置表（模型名等偏好）
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "users manage own settings"
  on public.user_settings
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

-- 若通过 REST Data API 暴露，需显式授权（视 Data API 设置而定）
-- grant select, insert, update, delete on public.projects, public.user_settings to authenticated;
