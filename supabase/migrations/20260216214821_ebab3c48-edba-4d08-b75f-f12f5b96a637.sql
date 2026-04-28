
CREATE POLICY "Usuarios autenticados podem atualizar eventos"
ON public.devedor_eventos FOR UPDATE
USING ((auth.uid() IS NOT NULL) AND (auth.uid() = criado_por));

CREATE POLICY "Usuarios autenticados podem excluir eventos"
ON public.devedor_eventos FOR DELETE
USING ((auth.uid() IS NOT NULL) AND (auth.uid() = criado_por));
