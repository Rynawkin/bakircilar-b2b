import Link from 'next/link';

interface LogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}

export function Logo({ variant = 'dark', size = 'md' }: LogoProps) {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  const colorClass = variant === 'light' ? 'text-white' : 'text-primary-600';

  return (
    <div className={`font-bold ${sizeClasses[size]} ${colorClass} flex items-center gap-2`}>
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none"/>
        <path d="M12 2V12M12 12L2 7M12 12L22 7M12 12V22" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="12" cy="12" r="2" fill="currentColor"/>
      </svg>
      <span>Bakırcılar</span>
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
