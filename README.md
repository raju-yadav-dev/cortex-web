# Cortex Web

This is the deploy-ready version of the `cortex-site` frontend. It keeps the same static pages and assets, but replaces the old local Node/MySQL backend with serverless functions that use Supabase.

## Setup

1. Create a Supabase project.
2. Run `supabase-schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` for local Vercel development, or add the same variables in Vercel/Netlify.
4. Deploy this folder to Vercel or Netlify.
5. Sign up once, then promote your account:

```sql
update public.user_profiles set role = 'admin' where email = 'you@example.com';
```

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `PUBLIC_REPO_URL`
- `SITE_NAME`
