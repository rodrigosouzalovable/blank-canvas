-- Permitir admins inserir pagamentos em qualquer acordo
CREATE POLICY "Admins podem criar pagamentos em qualquer acordo"
  ON pagamentos
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Permitir admins atualizar pagamentos de qualquer acordo
CREATE POLICY "Admins podem atualizar pagamentos de qualquer acordo"
  ON pagamentos
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Permitir admins deletar pagamentos de qualquer acordo
CREATE POLICY "Admins podem deletar pagamentos de qualquer acordo"
  ON pagamentos
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));