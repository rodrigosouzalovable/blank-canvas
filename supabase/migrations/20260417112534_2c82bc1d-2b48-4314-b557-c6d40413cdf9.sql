-- Corrigir CNPJs que perderam o zero à esquerda durante importação de Excel.
-- Excel salva CNPJs como número e perde zeros iniciais, gerando registros com 12 ou 13 dígitos.
-- CPF tem 11 dígitos, CNPJ tem 14 dígitos. Tudo entre 12 e 13 dígitos é CNPJ encurtado.

UPDATE public.devedores
SET cpf = lpad(cpf, 14, '0')
WHERE length(cpf) IN (12, 13);

-- Mesma correção para CPFs encurtados (10 dígitos) — CPF deve ter 11.
UPDATE public.devedores
SET cpf = lpad(cpf, 11, '0')
WHERE length(cpf) = 10;

-- Telefones de devedores referenciam por cpf — corrigir também.
UPDATE public.devedor_telefones
SET devedor_cpf = lpad(devedor_cpf, 14, '0')
WHERE length(devedor_cpf) IN (12, 13);

UPDATE public.devedor_telefones
SET devedor_cpf = lpad(devedor_cpf, 11, '0')
WHERE length(devedor_cpf) = 10;