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

export const getPeruDayRangeISO = (dateStr?: string) => {
  const peruDate = dateStr || getPeruDateString();
  const startISO = new Date(`${peruDate}T00:00:00.000-05:00`).toISOString();
  const endISO = new Date(`${peruDate}T23:59:59.999-05:00`).toISOString();
  return { peruDate, startISO, endISO };
};

