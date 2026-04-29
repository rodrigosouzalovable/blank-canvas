UPDATE auth.users
SET aud = COALESCE(aud, 'authenticated'),
    role = COALESCE(role, 'authenticated')
WHERE aud IS NULL OR role IS NULL;