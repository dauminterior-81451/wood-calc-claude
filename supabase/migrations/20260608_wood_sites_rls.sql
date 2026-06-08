-- wood_sites RLS: 비인증 사용자(anon)도 SELECT / INSERT 허용
-- Supabase SQL Editor에서 직접 실행

-- 기존 정책 삭제 후 재생성
DROP POLICY IF EXISTS "wood_sites_all" ON public.wood_sites;

CREATE POLICY "wood_sites_select" ON public.wood_sites
  FOR SELECT USING (true);

CREATE POLICY "wood_sites_insert" ON public.wood_sites
  FOR INSERT WITH CHECK (true);
