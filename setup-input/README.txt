SETUP INPUT FILES (gitignored)
==============================

Firebase / push (see PUSH_SETUP_START_HERE.md):
1) google-services.json
2) firebase-service-account.json
3) render-api-key.txt

Supabase / database (see SUPABASE_SETUP_START_HERE.md):
4) supabase-access-token.txt
   (one line: personal access token from https://supabase.com/dashboard/account/tokens)

Then run:
   node scripts/completeSupabaseSetup.mjs

Optional after first run (auto-written, do not commit):
- supabase-env.txt
- supabase-db-password.txt
- supabase-database-url.txt  (only if you need to override the DB URI)

Do not commit this folder’s secrets to GitHub.
