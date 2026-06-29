import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ydsiwdpyeuelhzszmqwb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkc2l3ZHB5ZXVlbGh6c3ptcXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjcxODUsImV4cCI6MjA5MjkwMzE4NX0.Y44sLnY05-vunYGt9X5sDME_Uc3pw2X_pwhDsMNH_yc';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data, error } = await supabase
        .from('sedes')
        .select('*')
        .limit(1);
    if (error) {
        console.error("Error querying sedes:", error);
        return;
    }
    console.log("Columns in 'sedes' table:");
    if (data && data.length > 0) {
        console.log(Object.keys(data[0]));
        console.log("Sample row:", data[0]);
    } else {
        console.log("No sedes rows found, but query succeeded.");
    }
}

main();
