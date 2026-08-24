
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fipxwbplksvjvysdqnyn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpcHh3YnBsa3N2anZ5c2RxbnluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczNjM3MjMsImV4cCI6MjEwMjkzOTcyM30.7n5AdfeKgLILSHKA_sG6MJVrPIQXEjI8Xiqezub1qbg';

export const supabase = createClient(supabaseUrl, supabaseKey);
