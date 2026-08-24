import { supabase } from './supabaseClient';

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
