import Link from 'next/link';
import Image from 'next/image';

interface LogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}

export function Logo({ variant = 'dark', size = 'md' }: LogoProps) {
  const sizeClasses = {
    sm: { height: 50, text: 'text-xl' },
    md: { height: 60, text: 'text-2xl' },
    lg: { height: 80, text: 'text-3xl' },
  };

  const currentSize = sizeClasses[size];

  return (
    <div className={`flex items-center gap-3`}>
      <Image
        src="/logo.png"
        alt="Bakırcılar Logo"
        width={currentSize.height * 2.5}
        height={currentSize.height}
        className="object-contain"
        priority
      />
    </div>
  );
}

interface LogoLinkProps extends LogoProps {
  href?: string;
}

export function LogoLink({ href = '/', variant = 'dark', size = 'md' }: LogoLinkProps) {
  return (
    <Link href={href} className="hover:opacity-80 transition-opacity">
      <Logo variant={variant} size={size} />
    </Link>
  );
}
