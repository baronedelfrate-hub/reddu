-- Fix cupons INSERT policy: INSERT policies must use WITH CHECK clause, not USING
DROP POLICY IF EXISTS "cupons_insert_policy" ON public.cupons;
CREATE POLICY "cupons_insert_policy" ON public.cupons FOR INSERT WITH CHECK (empresa_id = public.get_user_empresa_id());