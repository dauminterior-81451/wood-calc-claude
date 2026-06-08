CREATE TABLE IF NOT EXISTS public.wood_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wood_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wood_sites_all" ON public.wood_sites
  FOR ALL USING (true) WITH CHECK (true);
