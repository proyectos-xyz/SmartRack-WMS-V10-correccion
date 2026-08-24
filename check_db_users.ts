import { supabase } from './supabaseClient';

async function main() {
    const { data: users, error } = await supabase
        .from('usuarios')
        .select('*');
    if (error) {
        console.error(error);
        return;
    }
    console.log("Users in Database:");
    console.dir(users);
}

main();
