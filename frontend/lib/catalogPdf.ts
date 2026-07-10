import type { SalesCatalogPresentation } from '@/lib/api/salesCatalog';

const mm = (value: number) => value;

const safeFileName = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'satis-katalogu';

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const loadFont = async (path: string) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Font yuklenemedi: ${path}`);
  return toBase64(await response.arrayBuffer());
};

const loadImageAsJpeg = async (url: string | null | undefined): Promise<string | null> => {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const maxSide = 720;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
};

const loadImages = async (urls: string[]) => {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const result = new Map<string, string | null>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(6, unique.length) }, async () => {
    while (cursor < unique.length) {
      const index = cursor++;
      const url = unique[index];
      result.set(url, await loadImageAsJpeg(url));
    }
  });
  await Promise.all(workers);
  return result;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' TL';

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
};

export async function generateSalesCatalogPdf(data: SalesCatalogPresentation) {
  const [{ default: jsPDF }, regular, bold, mono, images] = await Promise.all([
    import('jspdf'),
    loadFont('/fonts/HankenGrotesk-Regular.ttf'),
    loadFont('/fonts/HankenGrotesk-Bold.ttf'),
    loadFont('/fonts/IBMPlexMono-Regular.ttf'),
    loadImages([
      '/logo.png',
      data.catalog.coverImageUrl || '',
      ...data.sections.flatMap((section) => section.products.map((product) => product.imageUrl || '')),
    ]),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Hanken-Regular.ttf', regular);
  doc.addFont('Hanken-Regular.ttf', 'Hanken', 'normal');
  doc.addFileToVFS('Hanken-Bold.ttf', bold);
  doc.addFont('Hanken-Bold.ttf', 'Hanken', 'bold');
  doc.addFileToVFS('PlexMono.ttf', mono);
  doc.addFont('PlexMono.ttf', 'PlexMono', 'normal');
  doc.setFont('Hanken', 'normal');

  const navy = data.catalog.accentColor || '#15356b';
  const ink = '#14223b';
  const muted = '#64748b';
  const line = '#e2e8f0';
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  const cover = images.get(data.catalog.coverImageUrl || '');
  if (cover) {
    doc.addImage(cover, 'JPEG', 0, 0, width, 118, undefined, 'FAST');
    doc.setFillColor(11, 29, 59);
    doc.rect(0, 45, width, 73, 'F');
  } else {
    doc.setFillColor(navy);
    doc.rect(0, 0, width, 118, 'F');
  }
  const logo = images.get('/logo.png');
  if (logo) doc.addImage(logo, 'JPEG', 16, 14, 52, 17, undefined, 'FAST');
  doc.setTextColor('#ffffff');
  doc.setFont('Hanken', 'bold');
  doc.setFontSize(27);
  const titleLines = doc.splitTextToSize(data.catalog.title, 174);
  doc.text(titleLines, 16, 62);
  if (data.catalog.subtitle) {
    doc.setFont('Hanken', 'normal');
    doc.setFontSize(12);
    doc.text(doc.splitTextToSize(data.catalog.subtitle, 170), 16, 82);
  }
  doc.setFillColor('#ffffff');
  doc.roundedRect(16, 102, 72, 10, 2, 2, 'F');
  doc.setTextColor(navy);
  doc.setFont('Hanken', 'bold');
  doc.setFontSize(9);
  doc.text(`REVIZYON ${data.catalog.revision}`, 20, 108.5);

  doc.setTextColor(ink);
  doc.setFont('Hanken', 'bold');
  doc.setFontSize(12);
  doc.text('KATEGORILER', 16, 138);
  doc.setFont('Hanken', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(muted);
  doc.text('Sayfa numaralari katalog olusturulurken otomatik guncellenir.', 16, 145);

  const tocY = 157;
  data.sections.slice(0, 12).forEach((section, index) => {
    const column = index >= 6 ? 1 : 0;
    const row = index % 6;
    const x = 16 + column * 91;
    const y = tocY + row * 15;
    doc.setFillColor(column === 0 ? '#f4f7fb' : '#f8fafc');
    doc.roundedRect(x, y, 84, 11, 2, 2, 'F');
    doc.setTextColor(ink);
    doc.setFont('Hanken', 'bold');
    doc.setFontSize(9.5);
    doc.text(doc.splitTextToSize(section.title, 66)[0], x + 5, y + 7);
  });

  const validFrom = formatDate(data.catalog.validFrom);
  const validTo = formatDate(data.catalog.validTo);
  doc.setTextColor(muted);
  doc.setFont('Hanken', 'normal');
  doc.setFontSize(8.5);
  const validity = validFrom || validTo
    ? `Gecerlilik: ${validFrom || '-'} - ${validTo || '-'}`
    : `Olusturma: ${new Date(data.catalog.generatedAt).toLocaleDateString('tr-TR')}`;
  doc.text(validity, 16, height - 18);
  doc.text(data.catalog.vatMode === 'INCLUDED' ? 'Fiyatlara KDV dahildir.' : 'Fiyatlara KDV dahil degildir.', 16, height - 12);

  const sectionPages: Array<{ title: string; page: number; tocIndex: number }> = [];
  const cardWidth = 86;
  const cardHeight = 82;
  const xPositions = [16, 108];
  const yPositions = [42, 128, 214];

  for (let sectionIndex = 0; sectionIndex < data.sections.length; sectionIndex += 1) {
    const section = data.sections[sectionIndex];
    for (let start = 0; start < section.products.length; start += 6) {
      doc.addPage();
      if (start === 0) {
        sectionPages.push({ title: section.title, page: doc.getNumberOfPages(), tocIndex: sectionIndex });
      }
      doc.setFillColor(navy);
      doc.rect(0, 0, width, 28, 'F');
      if (logo) doc.addImage(logo, 'JPEG', 16, 6, 39, 13, undefined, 'FAST');
      doc.setTextColor('#ffffff');
      doc.setFont('Hanken', 'bold');
      doc.setFontSize(15);
      doc.text(section.title, 194, 16, { align: 'right' });
      doc.setTextColor(muted);
      doc.setFont('Hanken', 'normal');
      doc.setFontSize(8.5);
      doc.text(`${start + 1}-${Math.min(start + 6, section.products.length)} / ${section.products.length} urun`, 16, 35);

      const pageProducts = section.products.slice(start, start + 6);
      pageProducts.forEach((product, cardIndex) => {
        const x = xPositions[cardIndex % 2];
        const y = yPositions[Math.floor(cardIndex / 2)];
        doc.setDrawColor(line);
        doc.setFillColor('#ffffff');
        doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');

        const image = product.imageUrl ? images.get(product.imageUrl) : null;
        if (image) {
          doc.addImage(image, 'JPEG', x + 4, y + 4, 34, 32, undefined, 'FAST');
        } else {
          doc.setFillColor('#f1f5f9');
          doc.roundedRect(x + 4, y + 4, 34, 32, 1.5, 1.5, 'F');
          doc.setTextColor('#94a3b8');
          doc.setFontSize(7.5);
          doc.text('Gorsel yok', x + 21, y + 21, { align: 'center' });
        }

        doc.setTextColor(ink);
        doc.setFont('Hanken', 'bold');
        doc.setFontSize(9.2);
        const nameLines = doc.splitTextToSize(product.name, 40).slice(0, 3);
        doc.text(nameLines, x + 42, y + 9);
        if (data.catalog.showProductCode) {
          doc.setFont('PlexMono', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(muted);
          doc.text(product.productCode, x + 42, y + 31);
        }

        doc.setDrawColor(line);
        doc.line(x + 4, y + 41, x + cardWidth - 4, y + 41);
        doc.setTextColor(navy);
        doc.setFont('Hanken', 'bold');
        doc.setFontSize(15);
        doc.text(formatMoney(product.salePrice), x + 4, y + 54);
        doc.setTextColor(muted);
        doc.setFont('Hanken', 'normal');
        doc.setFontSize(8);
        if (data.catalog.showUnit && product.unit) doc.text(`Birim: ${product.unit}`, x + 4, y + 63);
        if (data.catalog.showStockStatus && product.stockStatus) {
          const inStock = product.stockStatus === 'IN_STOCK';
          doc.setFillColor(inStock ? '#ecfdf5' : '#fff7ed');
          doc.roundedRect(x + 4, y + 68, 28, 8, 1.5, 1.5, 'F');
          doc.setTextColor(inStock ? '#047857' : '#c2410c');
          doc.setFont('Hanken', 'bold');
          doc.setFontSize(7.5);
          doc.text(inStock ? 'STOKTA' : 'STOKTA YOK', x + 18, y + 73.3, { align: 'center' });
        }
        doc.setTextColor(muted);
        doc.setFont('Hanken', 'normal');
        doc.setFontSize(7.2);
        doc.text(data.catalog.vatMode === 'INCLUDED' ? 'KDV dahil' : 'KDV haric', x + cardWidth - 4, y + 73.3, { align: 'right' });
      });
    }
  }

  doc.setPage(1);
  sectionPages.filter((item) => item.tocIndex < 12).forEach((item) => {
    const column = item.tocIndex >= 6 ? 1 : 0;
    const row = item.tocIndex % 6;
    const x = 16 + column * 91;
    const y = tocY + row * 15;
    doc.setTextColor(navy);
    doc.setFont('Hanken', 'bold');
    doc.setFontSize(9);
    doc.text(String(item.page), x + 78, y + 7, { align: 'right' });
    (doc as any).link(x, y, 84, 11, { pageNumber: item.page });
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 2; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setTextColor('#94a3b8');
    doc.setFont('Hanken', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Bakircilar B2B | Revizyon ${data.catalog.revision}`, 16, height - 5);
    doc.text(`${page} / ${pageCount}`, width - 16, height - 5, { align: 'right' });
  }

  doc.save(`${safeFileName(data.catalog.title)}-r${data.catalog.revision}.pdf`);
}
