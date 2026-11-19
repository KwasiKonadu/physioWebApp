-- Let every existing role apply for its own leave (new permission "leave.apply")
UPDATE "Role"
SET "permissions" = ("permissions"::jsonb || '["leave.apply"]'::jsonb)::text
WHERE NOT ("permissions"::jsonb ? 'leave.apply');
