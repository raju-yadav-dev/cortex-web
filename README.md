# Altarix Web

This is the deploy-ready version of the `Altarix-site` frontend. It keeps the same static pages and assets, and the login/signup pages connect directly to Supabase.

## Setup

1. Create a Supabase project.
2. Run `supabase-schema.sql` and `supabase-userdata-schema.sql` in the Supabase SQL editor.
3. Add your Supabase URL and anon key in `assets/js/auth.js`.
4. Deploy this folder to your static hosting provider.
5. Create your first admin account by inserting into `admindata`:

```sql
insert into admindata (admin_id, name, password)
values ('admin001', 'Admin', 'admin123');
```

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `PUBLIC_REPO_URL`
- `SITE_NAME`

