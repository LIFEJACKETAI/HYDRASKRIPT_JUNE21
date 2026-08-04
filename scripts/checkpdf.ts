import { supabaseAdmin } from '@/lib/supabase';
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'hydraskript-assets';
const { data, error } = await supabaseAdmin.storage.from(bucket).list('pdfs', { limit: 10 });
console.log('LIST', JSON.stringify(data, null, 1));
console.log('ERR', error?.message ?? 'none');
