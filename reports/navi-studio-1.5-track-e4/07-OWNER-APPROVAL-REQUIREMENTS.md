# Owner approval requirements before PostgreSQL verification

E4 did not install PostgreSQL, start Docker/WSL, provision a database/role, or connect to any database. The integration harness remains default-off. Before a future local integration run, the owner must provide or explicitly authorize provisioning a standalone PostgreSQL 17 synthetic instance, database `navi_e4_test`, and restricted role `navi_e4_runner`; provide its secret through process environment from an approved local secret store; and explicitly set the harness opt-in after reviewing its script/SQL cleanup boundaries.

The harness rejects non-loopback hosts, any database or role name other than its fixed synthetic target, non-PostgreSQL-17 tools/server, privileged login roles, a database without schema-create permission, Supabase API roles, or a preexisting `navi_scoped` schema. It uses no Supabase connection string or campus data.

Separate owner authorization and a reviewed backup/restore plan are required before any real Development export, migration, restore, or recoverability claim. Production and cloud operations remain prohibited by the E4 scope. Passing this local code gate is not approval to apply the migration or proof that Development is recoverable.
