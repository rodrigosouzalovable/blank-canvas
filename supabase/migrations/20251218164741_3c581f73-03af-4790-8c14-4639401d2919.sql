-- Deny anonymous access to profiles table (contains PII: emails and names)
CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Deny anonymous access to acordos table (sensitive financial data)
CREATE POLICY "Deny anonymous access to acordos"
ON public.acordos
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Deny anonymous access to pagamentos table (sensitive financial data)
CREATE POLICY "Deny anonymous access to pagamentos"
ON public.pagamentos
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Deny anonymous access to user_roles table (security-critical data)
CREATE POLICY "Deny anonymous access to user_roles"
ON public.user_roles
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Deny anonymous access to team_members table (organizational structure)
CREATE POLICY "Deny anonymous access to team_members"
ON public.team_members
FOR ALL
TO anon
USING (false)
WITH CHECK (false);