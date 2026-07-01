'use client';

import { useCallback, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import toast from 'react-hot-toast';
import { Upload, X, Check } from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { getCroppedBlob, PixelCrop } from '@/lib/utils/cropImage';

interface ImageCropUploadProps {
  value?: string | null;
  onChange: (url: string) => void;
  /** Hedef en/boy orani (targetWidth/targetHeight) */
  aspect: number;
  targetWidth: number;
  targetHeight: number;
  label?: string;
  hint?: string;
}

/**
 * Görsel yükle + kırp: dosya seçilince o pozisyonun oranında (aspect) bir çerçeve açılır;
 * kullanıcı sürükleyip yakınlaştırarak hangi kısmın görüneceğini seçer; hedef ebatta kırpılıp
 * (uploadBannerImage ile) yüklenir. Böylece tam piksel ebatında dosya üretmeye gerek yok.
 */
export function ImageCropUpload({ value, onChange, aspect, targetWidth, targetHeight, label = 'Görsel', hint }: ImageCropUploadProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<PixelCrop | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Lütfen resim dosyası seçin');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Dosya boyutu 10MB\'dan küçük olmalı');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const onCropComplete = useCallback((_area: unknown, areaPx: PixelCrop) => setAreaPixels(areaPx), []);

  const saveCrop = async () => {
    if (!src || !areaPixels) return;
    setUploading(true);
    try {
      const blob = await getCroppedBlob(src, areaPixels, targetWidth, targetHeight);
      const fd = new FormData();
      fd.append('image', blob, 'banner.jpg');
      const { imageUrl } = await adminApi.uploadBannerImage(fd);
      onChange(imageUrl);
      setSrc(null);
      toast.success('Görsel kaydedildi');
    } catch {
      toast.error('Görsel yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {label && <div className="mb-1 text-[12px] font-medium text-[#51607a]">{label}</div>}
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg border border-[#e3e8f0] bg-white">
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute right-0.5 top-0.5 rounded bg-white/90 p-0.5 text-red-600 hover:bg-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex h-16 w-28 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-[#d8e0ec] bg-[#f7f9fc] text-[11px] text-[#9aa6b8]">
            Görsel yok
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] px-3 py-2 text-[12.5px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
        >
          <Upload className="h-4 w-4" />
          {value ? 'Görseli değiştir' : 'Görsel yükle'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
      {hint && <p className="mt-1 text-[11.5px] text-[#9aa6b8]">{hint}</p>}

      {src && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[14px] font-semibold text-[#14223b]">Görseli çerçeveye sığdır</div>
              <button type="button" onClick={() => setSrc(null)} className="text-[#8b97ac] hover:text-[#14223b]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative h-[320px] w-full overflow-hidden rounded-lg bg-[#0b1830]">
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                objectFit="contain"
              />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-[12px] text-[#51607a]">Yakınlaştır</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <p className="mt-1 text-[11.5px] text-[#9aa6b8]">
              Sürükleyerek konumla, kaydırarak yakınlaştır. Çerçeve = {targetWidth}×{targetHeight}px olarak kaydedilir.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSrc(null)}
                className="rounded-lg border border-[#d8e0ec] px-4 py-2 text-[13px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={saveCrop}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1c4585] disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {uploading ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImageCropUpload;
