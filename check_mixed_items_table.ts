
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ydsiwdpyeuelhzszmqwb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkc2l3ZHB5ZXVlbGh6c3ptcXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjcxODUsImV4cCI6MjA5MjkwMzE4NX0.Y44sLnY05-vunYGt9X5sDME_Uc3pw2X_pwhDsMNH_yc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
  const { data, error } = await supabase.from('paletas_lpn_items').select().limit(1);
  if (error) console.log('paletas_lpn_items does not exist or error:', error.message);
  else console.log('paletas_lpn_items exists, keys:', Object.keys(data[0] || {}));
}

checkTable();
