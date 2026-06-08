-- wood_zones.company_id NOT NULL 제거
ALTER TABLE public.wood_zones ALTER COLUMN company_id DROP NOT NULL;
