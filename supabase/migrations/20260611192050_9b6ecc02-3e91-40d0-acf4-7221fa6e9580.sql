
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

DROP POLICY IF EXISTS "Owners or admins update" ON public.documents;
CREATE POLICY "Owners or admins update" ON public.documents FOR UPDATE TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(),'admin'))
WITH CHECK (auth.uid() = owner_id OR public.has_role(auth.uid(),'admin'));
