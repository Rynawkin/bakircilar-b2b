import Image from 'next/image';
import Link from 'next/link';
import { BRAND_ASSETS, BrandLogoLayout, BrandLogoTone } from '@/lib/brand';

interface LogoProps {
  variant?: 'light' | 'dark';
  tone?: BrandLogoTone;
  layout?: BrandLogoLayout;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Logo({
  variant = 'dark',
  tone,
  layout = 'horizontal',
  size = 'md',
  className = '',
}: LogoProps) {
  const sizeHeights = { sm: 28, md: 34, lg: 42, xl: 82 };
  const resolvedTone: BrandLogoTone = tone || (variant === 'light' ? 'white' : 'blue');
  const source = BRAND_ASSETS.logos[layout][resolvedTone];
  const naturalHeight = layout === 'horizontal' ? 270 : 486;
  const height = sizeHeights[size];
  const width = Math.round((1000 / naturalHeight) * height);

  return (
    <span className={`inline-flex flex-none items-center ${className}`}>
      <Image
        src={source}
        alt="Bakırcılar"
        width={width}
        height={height}
        className="h-auto max-w-full object-contain"
        priority
      />
    </span>
  );
}

interface LogoLinkProps extends LogoProps {
  href?: string;
}

export function LogoLink({
  href = '/',
  variant = 'dark',
  tone,
  layout = 'horizontal',
  size = 'md',
  className = '',
}: LogoLinkProps) {
  return (
    <Link href={href} className="inline-flex flex-none items-center transition-opacity hover:opacity-85">
      <Logo variant={variant} tone={tone} layout={layout} size={size} className={className} />
    </Link>
  );
}
