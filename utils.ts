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
