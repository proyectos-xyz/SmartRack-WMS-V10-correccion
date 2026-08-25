import { supabase } from './supabaseClient';

export const generateLPN = (correlative: number): string => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  
  // Format correlative to 6 digits as requested in example 260328000450
  const sequence = correlative.toString().padStart(6, '0');
  
  return `${year}${month}${day}${sequence}`;
};

export const generateMixedLPN = (correlative: number): string => {
  return `MIX${correlative}`;
};

/**
 * Consumes N correlative numbers directly from public.lpn_sequence table (id = 1).
 * Updates last_value = last_value + count and returns the reserved numbers array.
 */
export const getNextLpnCorrelativesFromDb = async (countVal: number = 1): Promise<number[]> => {
  const count = Math.max(1, countVal);

  try {
    // 1. Query lpn_sequence for row id = 1
    const { data: row, error: selectError } = await supabase
      .from('lpn_sequence')
      .select('id, last_value')
      .eq('id', 1)
      .maybeSingle();

    let currentLastValue: number = 0;
    let rowExists = false;

    if (!selectError && row) {
      currentLastValue = Number(row.last_value) || 0;
      rowExists = true;
    } else {
      // Row or table not initialized yet, check max from paletas_lpn as seed
      try {
        const { data: maxLpnRows } = await supabase
          .from('paletas_lpn')
          .select('lpn')
          .not('lpn', 'like', 'MIX%')
          .order('created_at', { ascending: false })
          .limit(25);

        if (maxLpnRows && maxLpnRows.length > 0) {
          for (const item of maxLpnRows) {
            if (item.lpn && item.lpn.length >= 6) {
              const last6 = parseInt(item.lpn.slice(-6), 10);
              if (!isNaN(last6) && last6 > currentLastValue) {
                currentLastValue = last6;
              }
            }
          }
        }
      } catch (e) {
        console.warn("Could not check paletas_lpn seed:", e);
      }
    }

    const nextLastValue = currentLastValue + count;

    // 2. Persist new last_value into lpn_sequence
    if (rowExists) {
      const { error: updateError } = await supabase
        .from('lpn_sequence')
        .update({ last_value: nextLastValue })
        .eq('id', 1);

      if (updateError) {
        console.warn("Error updating lpn_sequence, trying upsert:", updateError);
        await supabase.from('lpn_sequence').upsert({ id: 1, last_value: nextLastValue });
      }
    } else {
      const { error: insertError } = await supabase
        .from('lpn_sequence')
        .upsert({ id: 1, last_value: nextLastValue });

      if (insertError) {
        console.warn("Error upserting lpn_sequence:", insertError);
      }
    }

    // 3. Return allocated correlatives
    const correlatives: number[] = [];
    for (let i = 1; i <= count; i++) {
      correlatives.push(currentLastValue + i);
    }

    return correlatives;
  } catch (error) {
    console.error("Critical error reserving correlatives from lpn_sequence:", error);
    // Safe timestamp-based fallback if disconnected
    const fallbackBase = Date.now() % 900000;
    const correlatives: number[] = [];
    for (let i = 1; i <= count; i++) {
      correlatives.push(fallbackBase + i);
    }
    return correlatives;
  }
};

export const getNextLpnCorrelative = async (): Promise<number> => {
  const list = await getNextLpnCorrelativesFromDb(1);
  return list[0];
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  
  // Handle YYYY-MM-DD format to avoid timezone shifts
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  return new Date(dateStr).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const formatCompactDate = (dateStr: string): string => {
  if (!dateStr) return '';
  
  let day, month, year;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split('-').map(Number);
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else {
    const date = new Date(dateStr);
    day = date.getDate();
    month = date.getMonth() + 1;
    year = date.getFullYear();
  }
  
  return `${day.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}-${year}`;
};

export const getStatusColor = (status: 'empty' | 'occupied') => {
  switch (status) {
    case 'empty': return 'bg-emerald-500 hover:bg-emerald-600';
    case 'occupied': return 'bg-orange-500 hover:bg-orange-600';
    default: return 'bg-gray-300';
  }
};

export const compressImage = async (file: File, maxWidth = 1024, quality = 0.7): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas to Blob failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export const generateStorageFileName = (extension: string = 'jpg'): string => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const datePrefix = `${year}${month}${day}`;
  const randomCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${datePrefix}${randomCode}.${extension}`;
};

export const getPeruDateString = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

export const getPeruDayRangeISO = (date: Date = new Date()): { peruDate: string; startISO: string; endISO: string } => {
  const peruDate = getPeruDateString(date); // YYYY-MM-DD
  // Peru is UTC-5
  const startISO = `${peruDate}T00:00:00-05:00`;
  const endISO = `${peruDate}T23:59:59.999-05:00`;
  return { peruDate, startISO, endISO };
};

export const ensureStorageBucket = async (bucketName: string = 'evidencias'): Promise<boolean> => {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (buckets && buckets.some(b => b.name === bucketName || b.id === bucketName)) {
      return true;
    }
    const { error } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 10485760
    });
    if (!error) {
      console.log(`[Storage] Bucket '${bucketName}' creado exitosamente.`);
      return true;
    } else {
      console.warn(`[Storage] No se pudo crear bucket '${bucketName}' automáticamente:`, error.message);
      return false;
    }
  } catch (e) {
    console.warn(`[Storage] Excepción al verificar/crear bucket '${bucketName}':`, e);
    return false;
  }
};

/**
 * Robust image uploader:
 * 1. Skips already uploaded URLs (http/https).
 * 2. Compresses base64 or File/Blob using canvas.
 * 3. Uploads to Supabase Storage in 'evidencias/{folder}/{fileName}'.
 * 4. If bucket is not found, automatically attempts creating the 'evidencias' bucket and retries.
 * 5. If storage upload fails, safely falls back to compressed base64 so picking/dispatch transactions never crash.
 */
export const uploadEvidenceImage = async (
  input: string | File | Blob,
  folder: string = 'picking',
  customFileName?: string
): Promise<string> => {
  if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
    return input;
  }

  const fileName = customFileName || generateStorageFileName();
  const filePath = `${folder}/${fileName}`;

  let blob: Blob;
  let compressedDataUrl: string = '';

  if (typeof input === 'string') {
    try {
      const res = await fetch(input);
      const rawBlob = await res.blob();
      const file = new File([rawBlob], fileName, { type: rawBlob.type || 'image/jpeg' });
      blob = await compressImage(file, 1024, 0.6);
      compressedDataUrl = input;
    } catch {
      blob = new Blob([input], { type: 'image/jpeg' });
      compressedDataUrl = input;
    }
  } else if (input instanceof File) {
    try {
      blob = await compressImage(input, 1024, 0.6);
    } catch {
      blob = input;
    }
  } else {
    blob = input;
  }

  // Attempt 1: Upload to Supabase Storage
  try {
    const { error: uploadError } = await supabase.storage
      .from('evidencias')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (!uploadError) {
      const { data: pubData } = supabase.storage
        .from('evidencias')
        .getPublicUrl(filePath);
      return pubData.publicUrl;
    }

    // If bucket not found, attempt to create it and retry
    const errorMsg = uploadError.message?.toLowerCase() || '';
    if (errorMsg.includes('bucket not found') || (uploadError as any).statusCode === '404' || (uploadError as any).error === 'Bucket not found') {
      console.warn("[Storage] Bucket 'evidencias' no encontrado. Intentando crearlo automáticamente...");
      const created = await ensureStorageBucket('evidencias');
      if (created) {
        const { error: retryError } = await supabase.storage
          .from('evidencias')
          .upload(filePath, blob, {
            contentType: 'image/jpeg',
            upsert: true
          });
        if (!retryError) {
          const { data: pubData } = supabase.storage
            .from('evidencias')
            .getPublicUrl(filePath);
          return pubData.publicUrl;
        }
      }
    }

    console.warn(`[Storage] No se pudo subir imagen a storage (${uploadError.message}). Usando fallback.`);
  } catch (err: any) {
    console.warn("[Storage] Error al subir imagen a Supabase Storage:", err);
  }

  // Fallback: If we have data URL or can convert blob to compressed data URL, return it
  if (compressedDataUrl && compressedDataUrl.startsWith('data:image')) {
    return compressedDataUrl;
  }

  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string || '');
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
};


