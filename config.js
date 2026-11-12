// Supabase connection for the carshell site (separate project from douzi-shop).
// The publishable/anon key is meant to be public; data is protected by supabase/schema.sql.
// Never put a secret / service_role key here.
window.DOU_CONFIG = {
  SUPABASE_URL: 'https://bdsbkjkgysrnwusbbxax.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Ti2My7Rpx5gRWsZbfmq9NQ_sYefDqWL',
  // Public anon-role JWT, only used to pass the Edge Function gateway's JWT check (wx-login).
  FUNCTIONS_JWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkc2JramtneXNybnd1c2JieGF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0OTgwMDYsImV4cCI6MjExMDA3NDAwNn0.rkCp8j4PXgW2e-LBBml4BhYsQ3-rdZHYqsWq4C2J0hE'
};
