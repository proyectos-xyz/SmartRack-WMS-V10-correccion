
import { supabase } from './supabaseClient';

async function checkTable() {
  const { data, error } = await supabase.from('paletas_lpn_items').select().limit(1);
  if (error) console.log('paletas_lpn_items does not exist or error:', error.message);
  else console.log('paletas_lpn_items exists, keys:', Object.keys(data[0] || {}));
}

checkTable();
