-- NON-DESTRUCTIVE rollback proposal. Revoke application access; retain any history.
begin;
revoke all on all tables in schema navi_private from service_role;
revoke usage on schema navi_private from service_role;
-- Do not DROP this schema or its tables if any records may have been committed.
commit;
