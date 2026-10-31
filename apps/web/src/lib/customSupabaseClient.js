import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://daptthtsvqjspavvvhax.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhcHR0aHRzdnFqc3BhdnZ2aGF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMDE0NDksImV4cCI6MjA4NzY3NzQ0OX0.x9w3aySamOEbvehp0qSHbxZQaMHPfaoC6dUY0HrZbFk';

const customSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export default customSupabaseClient;

export { 
    customSupabaseClient,
    customSupabaseClient as supabase,
};
