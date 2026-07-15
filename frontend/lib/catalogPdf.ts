import type { SalesCatalogPresentation } from '@/lib/api/salesCatalog';
import { BRAND_ASSETS } from '@/lib/brand';
import { getUnitConversionLabel } from '@/lib/utils/unit';

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

const loadImageAsPng = async (url: string | null | undefined): Promise<string | null> => {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const maxSide = 900;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

const loadCoverAsJpeg = async (url: string | null | undefined): Promise<string | null> => {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 600;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#07162e';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    context.drawImage(bitmap, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
    const overlay = context.createLinearGradient(0, 0, canvas.width, 0);
    overlay.addColorStop(0, 'rgba(11,29,59,0.99)');
    overlay.addColorStop(0.34, 'rgba(11,29,59,0.96)');
    overlay.addColorStop(0.62, 'rgba(11,29,59,0.68)');
    overlay.addColorStop(1, 'rgba(11,29,59,0.18)');
    context.fillStyle = overlay;
    context.fillRect(0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.9);
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
  const [{ default: jsPDF }, regular, bold, mono, images, cover, logoWhite, mascot] = await Promise.all([
    import('jspdf'),
    loadFont('/fonts/HankenGrotesk-Regular.ttf'),
    loadFont('/fonts/HankenGrotesk-Bold.ttf'),
    loadFont('/fonts/IBMPlexMono-Regular.ttf'),
    loadImages([
      ...data.sections.flatMap((section) => section.products.map((product) => product.imageUrl || '')),
    ]),
    loadCoverAsJpeg(data.catalog.coverImageUrl),
    loadImageAsPng(BRAND_ASSETS.logos.horizontal.white),
    loadImageAsPng(BRAND_ASSETS.mascot.pointing),
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

  const drawContainedImage = (
    image: string,
    format: 'PNG' | 'JPEG',
    x: number,
    y: number,
    boxWidth: number,
    boxHeight: number
  ) => {
    const properties = doc.getImageProperties(image);
    const sourceWidth = Number(properties.width) || boxWidth;
    const sourceHeight = Number(properties.height) || boxHeight;
    const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    doc.addImage(
      image,
      format,
      x + (boxWidth - drawWidth) / 2,
      y + (boxHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
      undefined,
      'FAST'
    );
  };

  const validFrom = formatDate(data.catalog.validFrom);
  const validTo = formatDate(data.catalog.validTo);
  const productCount = data.sections.reduce((sum, section) => sum + section.products.length, 0);

  doc.setFillColor(8, 20, 38);
  doc.rect(0, 0, width, 8, 'F');
  doc.setTextColor('#6f8fbf');
  doc.setFont('Hanken', 'bold');
  doc.setFontSize(6.5);
  doc.text('BAKIRCILAR B2B  /  GUNCEL SATIS KATALOGU', 16, 5.2);
  doc.setTextColor('#a8b3c4');
  doc.setFont('PlexMono', 'normal');
  doc.text(
    `REV ${String(data.catalog.revision).padStart(2, '0')}  /  ${data.catalog.vatMode === 'INCLUDED' ? 'KDV DAHIL' : 'KDV HARIC'}`,
    width - 16,
    5.2,
    { align: 'right' }
  );

  doc.setFillColor(11, 29, 59);
  doc.rect(0, 8, width, 18, 'F');
  if (logoWhite) drawContainedImage(logoWhite, 'PNG', 16, 10, 48, 13);
  doc.setTextColor('#ffffff');
  doc.setFont('Hanken', 'bold');
  doc.setFontSize(8);
  const headerTitle = (doc.splitTextToSize(data.catalog.title, 112) as string[])[0] || data.catalog.title;
  doc.text(headerTitle, 72, 18.5);

  if (cover) {
    doc.addImage(cover, 'JPEG', 0, 26, width, 112, undefined, 'FAST');
  } else {
    doc.setFillColor(11, 29, 59);
    doc.rect(0, 26, width, 112, 'F');
  }

  doc.setTextColor('#9cc3ef');
  doc.setFont('Hanken', 'bold');
  doc.setFontSize(7.5);
  doc.text('GUNCEL SATIS KATALOGU', 16, 47);
  doc.setDrawColor('#7fb0e8');
  doc.setLineWidth(0.5);
  doc.line(16, 51, 30, 51);

  doc.setTextColor('#ffffff');
  doc.setFont('Hanken', 'bold');
  doc.setFontSize(22);
  const titleLines = (doc.splitTextToSize(data.catalog.title, 132) as string[]).slice(0, 3);
  doc.text(titleLines, 16, 65, { lineHeightFactor: 1.04 });
  if (data.catalog.subtitle) {
    doc.setFont('Hanken', 'normal');
    doc.setFontSize(10.5);
    const subtitleY = 76 + Math.max(0, titleLines.length - 1) * 8;
    const subtitleLines = (doc.splitTextToSize(data.catalog.subtitle, 126) as string[]).slice(0, 2);
    doc.text(subtitleLines, 16, subtitleY, { lineHeightFactor: 1.15 });
  }

  doc.setFont('Hanken', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor('#ffffff');
  doc.text(`${productCount} URUN`, 16, 124);
  doc.setTextColor('#9cc3ef');
  doc.text('/', 42, 124);
  doc.setTextColor('#ffffff');
  doc.text(`${data.sections.length} KATEGORI`, 48, 124);
  doc.setTextColor('#9cc3ef');
  doc.text('/', 80, 124);
  doc.setTextColor('#ffffff');
  doc.text(data.catalog.vatMode === 'INCLUDED' ? 'KDV DAHIL' : 'KDV HARIC', 86, 124);
  if (mascot) drawContainedImage(mascot, 'PNG', width - 42, 92, 27, 42);

  doc.setTextColor(ink);
  doc.setFont('Hanken', 'bold');
  doc.setFontSize(12);
  doc.text('KATEGORILER', 16, 156);
  doc.setFont('Hanken', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(muted);
  doc.text('Kategori adina tiklayarak ilgili sayfaya gecebilirsiniz.', 16, 163);

  const tocY = 171;
  const tocSections = data.sections.slice(0, 12);
  const tocRows = Math.max(1, Math.ceil(tocSections.length / (tocSections.length > 1 ? 2 : 1)));
  tocSections.forEach((section, index) => {
    const column = Math.floor(index / tocRows);
    const row = index % tocRows;
    const x = 16 + column * 91;
    const y = tocY + row * 12;
    doc.setFillColor(column === 0 ? '#f4f7fb' : '#f8fafc');
    doc.roundedRect(x, y, 84, 9.5, 2, 2, 'F');
    doc.setTextColor(ink);
    doc.setFont('Hanken', 'bold');
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(section.title, 66)[0], x + 5, y + 6.2);
  });

  doc.setTextColor(muted);
  doc.setFont('Hanken', 'normal');
  doc.setFontSize(8.5);
  const validity = validFrom || validTo
    ? `Gecerlilik: ${validFrom || '-'} - ${validTo || '-'}`
    : `Olusturma: ${new Date(data.catalog.generatedAt).toLocaleDateString('tr-TR')}`;
  doc.text(validity, 16, height - 18);
  doc.text(data.catalog.vatMode === 'INCLUDED' ? 'Fiyatlara KDV dahildir.' : 'Fiyatlara KDV dahil degildir.', 16, height - 12);
  if (data.catalog.watermarkText) {
    doc.setFillColor('#eef4fb');
    doc.setDrawColor('#d6e0f1');
    doc.roundedRect(width - 104, height - 23, 88, 12, 2, 2, 'FD');
    doc.setTextColor('#15356b');
    doc.setFont('Hanken', 'bold');
    doc.setFontSize(7.2);
    const recipientLine = (doc.splitTextToSize(data.catalog.watermarkText, 80) as string[])[0] || data.catalog.watermarkText;
    doc.text(recipientLine, width - 60, height - 17.8, { align: 'center' });
    if (data.catalog.priceFingerprint) {
      doc.setFont('PlexMono', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor('#64748b');
      doc.text(`FIYAT IZI ${data.catalog.priceFingerprint}`, width - 60, height - 13.7, { align: 'center' });
    }
  }

  const sectionPages: Array<{ title: string; page: number; tocIndex: number }> = [];
  const compact = data.catalog.displayDensity === 'COMPACT';
  const columnCount = compact ? 3 : 2;
  const horizontalMargin = 12;
  const columnGap = compact ? 4 : 6;
  const rowGap = compact ? 3.5 : 4;
  const cardWidth = (width - horizontalMargin * 2 - columnGap * (columnCount - 1)) / columnCount;
  const cardHeight = compact ? 51 : 72;
  const headingHeight = compact ? 9 : 11;
  const contentTop = 32;
  const contentBottom = height - 12;
  let cursorY = contentTop;
  let contentPageOpen = false;

  const addContentPage = () => {
    doc.addPage();
    contentPageOpen = true;
    cursorY = contentTop;
    doc.setFillColor(11, 29, 59);
    doc.rect(0, 0, width, 24, 'F');
    if (logoWhite) drawContainedImage(logoWhite, 'PNG', 12, 4.5, 40, 14);
    doc.setTextColor('#ffffff');
    doc.setFont('Hanken', 'bold');
    doc.setFontSize(8.2);
    const pageTitle = (doc.splitTextToSize(data.catalog.title, 112) as string[])[0] || data.catalog.title;
    doc.text(pageTitle, width - 12, 10.5, { align: 'right' });
    doc.setTextColor('#9cc3ef');
    doc.setFont('PlexMono', 'normal');
    doc.setFontSize(6.2);
    doc.text(`REV ${String(data.catalog.revision).padStart(2, '0')}  /  ${data.catalog.vatMode === 'INCLUDED' ? 'KDV DAHIL' : 'KDV HARIC'}`, width - 12, 17, { align: 'right' });
    if (data.catalog.watermarkText) {
      doc.setFont('Hanken', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor('#c9d9ee');
      const watermarkLine = (doc.splitTextToSize(data.catalog.watermarkText, 112) as string[])[0] || data.catalog.watermarkText;
      doc.text(watermarkLine, width - 12, 21.2, { align: 'right' });
    }
  };

  const drawCategoryHeading = (
    section: SalesCatalogPresentation['sections'][number],
    sectionIndex: number,
    continuation = false
  ) => {
    const badgeSize = compact ? 7 : 8.5;
    doc.setFillColor(11, 29, 59);
    doc.roundedRect(horizontalMargin, cursorY, badgeSize, badgeSize, 1.5, 1.5, 'F');
    doc.setTextColor('#ffffff');
    doc.setFont('Hanken', 'bold');
    doc.setFontSize(compact ? 6.5 : 7.5);
    doc.text(String(sectionIndex + 1).padStart(2, '0'), horizontalMargin + badgeSize / 2, cursorY + badgeSize * 0.66, { align: 'center' });

    doc.setTextColor(ink);
    doc.setFont('Hanken', 'bold');
    doc.setFontSize(compact ? 9.2 : 11);
    const headingLabel = continuation ? `${section.title} (devam)` : section.title;
    const headingWidth = width - horizontalMargin * 2 - badgeSize - 35;
    const headingLine = (doc.splitTextToSize(headingLabel, headingWidth) as string[])[0] || headingLabel;
    doc.text(headingLine, horizontalMargin + badgeSize + 4, cursorY + badgeSize * 0.64);

    doc.setTextColor(muted);
    doc.setFont('Hanken', 'normal');
    doc.setFontSize(compact ? 6.5 : 7.2);
    doc.text(`${section.products.length} urun`, width - horizontalMargin, cursorY + badgeSize * 0.64, { align: 'right' });
    doc.setDrawColor('#dde4ee');
    doc.setLineWidth(0.25);
    doc.line(horizontalMargin, cursorY + headingHeight, width - horizontalMargin, cursorY + headingHeight);
    cursorY += headingHeight + (compact ? 2.5 : 3.5);
  };

  const fitProductName = (
    name: string,
    maxWidth: number,
    initialFontSize: number,
    minimumFontSize: number,
    maxLines: number
  ) => {
    let fontSize = initialFontSize;
    let lines = doc.splitTextToSize(name, maxWidth) as string[];
    while (lines.length > maxLines && fontSize > minimumFontSize) {
      fontSize = Math.max(minimumFontSize, fontSize - 0.25);
      doc.setFontSize(fontSize);
      lines = doc.splitTextToSize(name, maxWidth) as string[];
    }
    while (lines.length > maxLines && fontSize > 4.4) {
      fontSize = Math.max(4.4, fontSize - 0.2);
      doc.setFontSize(fontSize);
      lines = doc.splitTextToSize(name, maxWidth) as string[];
    }
    return { fontSize, lines };
  };

  const drawPackagingBadge = (
    label: string,
    x: number,
    y: number,
    maxWidth: number,
    height: number,
    initialFontSize: number
  ) => {
    doc.setFont('Hanken', 'bold');
    let fontSize = initialFontSize;
    doc.setFontSize(fontSize);
    while (doc.getTextWidth(label) + 5 > maxWidth && fontSize > 4.3) {
      fontSize = Math.max(4.3, fontSize - 0.2);
      doc.setFontSize(fontSize);
    }
    const badgeWidth = Math.min(maxWidth, doc.getTextWidth(label) + 5);
    doc.setFillColor('#eef4fb');
    doc.setDrawColor('#d6e0f1');
    doc.roundedRect(x, y, badgeWidth, height, 1.2, 1.2, 'FD');
    doc.setTextColor('#15356b');
    doc.text(label, x + badgeWidth / 2, y + height * 0.69, { align: 'center' });
  };

  const drawProductCard = (
    product: SalesCatalogPresentation['sections'][number]['products'][number],
    x: number,
    y: number
  ) => {
    doc.setDrawColor(line);
    doc.setFillColor('#ffffff');
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');
    const image = product.imageUrl ? images.get(product.imageUrl) : null;
    const packagingLabel = getUnitConversionLabel(product.unit, product.unit2, product.unit2Factor);

    if (compact) {
      if (image) {
        drawContainedImage(image, 'JPEG', x + 3, y + 3, 21, 18.5);
      } else {
        doc.setFillColor('#f1f5f9');
        doc.roundedRect(x + 3, y + 3, 21, 18.5, 1.5, 1.5, 'F');
        doc.setTextColor('#94a3b8');
        doc.setFont('Hanken', 'normal');
        doc.setFontSize(6);
        doc.text('Gorsel yok', x + 13.5, y + 12.8, { align: 'center' });
      }

      doc.setTextColor(ink);
      doc.setFont('Hanken', 'bold');
      doc.setFontSize(7.3);
      const fittedName = fitProductName(product.name, cardWidth - 30, 7.3, 5.4, 6);
      doc.setFontSize(fittedName.fontSize);
      doc.text(fittedName.lines, x + 27, y + 6.2, { lineHeightFactor: 0.98 });
      if (data.catalog.showProductCode) {
        doc.setFont('PlexMono', 'normal');
        doc.setFontSize(5.9);
        doc.setTextColor(muted);
        const codeWidth = cardWidth - 30;
        const measuredCodeWidth = doc.getTextWidth(product.productCode);
        if (measuredCodeWidth > codeWidth) doc.setFontSize(Math.max(4.6, 5.9 * (codeWidth / measuredCodeWidth)));
        doc.text(product.productCode, x + 27, y + 21.5);
      }

      doc.setDrawColor(line);
      doc.line(x + 3, y + 25, x + cardWidth - 3, y + 25);
      doc.setTextColor(navy);
      doc.setFont('Hanken', 'bold');
      doc.setFontSize(10.2);
      const priceLabel = formatMoney(product.salePrice);
      const priceWidth = doc.getTextWidth(priceLabel);
      if (priceWidth > cardWidth - 6) doc.setFontSize(Math.max(7, 10.2 * ((cardWidth - 6) / priceWidth)));
      doc.text(priceLabel, x + 3, y + 34.5);
      if (packagingLabel) {
        drawPackagingBadge(packagingLabel, x + 3, y + 37.2, cardWidth - 6, 5.3, 5.7);
      } else {
        doc.setTextColor(muted);
        doc.setFont('Hanken', 'normal');
        doc.setFontSize(6.2);
        if (data.catalog.showUnit && product.unit) doc.text(`Birim: ${product.unit}`, x + 3, y + 40.5);
      }
      if (data.catalog.showStockStatus && product.stockStatus) {
        const inStock = product.stockStatus === 'IN_STOCK';
        doc.setFillColor(inStock ? '#ecfdf5' : '#fff7ed');
        doc.roundedRect(x + 3, y + 43, 22, 5.5, 1.2, 1.2, 'F');
        doc.setTextColor(inStock ? '#047857' : '#c2410c');
        doc.setFont('Hanken', 'bold');
        doc.setFontSize(5.7);
        doc.text(inStock ? 'STOKTA' : 'STOKTA YOK', x + 14, y + 46.8, { align: 'center' });
      }
      doc.setTextColor(muted);
      doc.setFont('Hanken', 'normal');
      doc.setFontSize(5.8);
      doc.text(data.catalog.vatMode === 'INCLUDED' ? 'KDV dahil' : 'KDV haric', x + cardWidth - 3, y + 46.8, { align: 'right' });
      return;
    }

    if (image) {
      drawContainedImage(image, 'JPEG', x + 4, y + 4, 32, 28);
    } else {
      doc.setFillColor('#f1f5f9');
      doc.roundedRect(x + 4, y + 4, 32, 28, 1.5, 1.5, 'F');
      doc.setTextColor('#94a3b8');
      doc.setFont('Hanken', 'normal');
      doc.setFontSize(7.2);
      doc.text('Gorsel yok', x + 20, y + 19, { align: 'center' });
    }

    doc.setTextColor(ink);
    doc.setFont('Hanken', 'bold');
    doc.setFontSize(9);
    const fittedName = fitProductName(product.name, cardWidth - 44, 9, 6.2, 6);
    doc.setFontSize(fittedName.fontSize);
    doc.text(fittedName.lines, x + 40, y + 8, { lineHeightFactor: 0.98 });
    if (data.catalog.showProductCode) {
      doc.setFont('PlexMono', 'normal');
      doc.setFontSize(7.1);
      doc.setTextColor(muted);
      doc.text(product.productCode, x + 40, y + 28);
    }

    doc.setDrawColor(line);
    doc.line(x + 4, y + 36, x + cardWidth - 4, y + 36);
    doc.setTextColor('#93a2b8');
    doc.setFont('Hanken', 'bold');
    doc.setFontSize(6.2);
    doc.text('SATIS FIYATI', x + 4, y + 42);
    doc.setTextColor(navy);
    doc.setFontSize(14.2);
    const priceLabel = formatMoney(product.salePrice);
    const priceWidth = doc.getTextWidth(priceLabel);
    if (priceWidth > cardWidth - 8) doc.setFontSize(Math.max(10, 14.2 * ((cardWidth - 8) / priceWidth)));
    doc.text(priceLabel, x + 4, y + 53.5);
    if (packagingLabel) {
      drawPackagingBadge(packagingLabel, x + 4, y + 57.6, cardWidth - 8, 5.8, 6.4);
    } else {
      doc.setTextColor(muted);
      doc.setFont('Hanken', 'normal');
      doc.setFontSize(7.3);
      if (data.catalog.showUnit && product.unit) doc.text(`Birim: ${product.unit}`, x + 4, y + 61);
    }
    if (data.catalog.showStockStatus && product.stockStatus) {
      const inStock = product.stockStatus === 'IN_STOCK';
      doc.setFillColor(inStock ? '#ecfdf5' : '#fff7ed');
      doc.roundedRect(x + 4, y + 64, 27, 6, 1.4, 1.4, 'F');
      doc.setTextColor(inStock ? '#047857' : '#c2410c');
      doc.setFont('Hanken', 'bold');
      doc.setFontSize(6.5);
      doc.text(inStock ? 'STOKTA' : 'STOKTA YOK', x + 17.5, y + 68, { align: 'center' });
    }
    doc.setTextColor(muted);
    doc.setFont('Hanken', 'normal');
    doc.setFontSize(6.5);
    doc.text(data.catalog.vatMode === 'INCLUDED' ? 'KDV dahil' : 'KDV haric', x + cardWidth - 4, y + 68, { align: 'right' });
  };

  for (let sectionIndex = 0; sectionIndex < data.sections.length; sectionIndex += 1) {
    const section = data.sections[sectionIndex];
    const minimumSectionSpace = headingHeight + (compact ? 2.5 : 3.5) + cardHeight;
    if (!contentPageOpen || cursorY + minimumSectionSpace > contentBottom) addContentPage();

    sectionPages.push({ title: section.title, page: doc.getNumberOfPages(), tocIndex: sectionIndex });
    drawCategoryHeading(section, sectionIndex);

    for (let start = 0; start < section.products.length; start += columnCount) {
      if (cursorY + cardHeight > contentBottom) {
        addContentPage();
        drawCategoryHeading(section, sectionIndex, true);
      }
      const row = section.products.slice(start, start + columnCount);
      row.forEach((product, columnIndex) => {
        const x = horizontalMargin + columnIndex * (cardWidth + columnGap);
        drawProductCard(product, x, cursorY);
      });
      cursorY += cardHeight + rowGap;
    }
    cursorY += compact ? 2.5 : 4;
  }

  doc.setPage(1);
  sectionPages.filter((item) => item.tocIndex < 12).forEach((item) => {
    const column = Math.floor(item.tocIndex / tocRows);
    const row = item.tocIndex % tocRows;
    const x = 16 + column * 91;
    const y = tocY + row * 12;
    doc.setTextColor(navy);
    doc.setFont('Hanken', 'bold');
    doc.setFontSize(9);
    doc.text(String(item.page), x + 78, y + 6.2, { align: 'right' });
    (doc as any).link(x, y, 84, 9.5, { pageNumber: item.page });
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 2; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setTextColor('#94a3b8');
    doc.setFont('Hanken', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Bakircilar B2B | Revizyon ${data.catalog.revision}`, 16, height - 5);
    if (data.catalog.watermarkText) {
      doc.setFont('Hanken', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor('#64748b');
      const footerWatermark = (doc.splitTextToSize(data.catalog.watermarkText, 92) as string[])[0] || data.catalog.watermarkText;
      doc.text(footerWatermark, width / 2, height - 5, { align: 'center' });
    }
    doc.text(`${page} / ${pageCount}`, width - 16, height - 5, { align: 'right' });
  }

  doc.save(`${safeFileName(data.catalog.title)}-r${data.catalog.revision}.pdf`);
}
