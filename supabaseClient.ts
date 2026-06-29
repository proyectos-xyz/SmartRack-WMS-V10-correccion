
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ydsiwdpyeuelhzszmqwb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkc2l3ZHB5ZXVlbGh6c3ptcXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjcxODUsImV4cCI6MjA5MjkwMzE4NX0.Y44sLnY05-vunYGt9X5sDME_Uc3pw2X_pwhDsMNH_yc';

export const supabase = createClient(supabaseUrl, supabaseKey);
