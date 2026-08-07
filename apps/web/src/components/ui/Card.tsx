import { type ReactNode, type HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

/*
 * Shared card primitive used by every feature page.
 * Visual-only polish: larger radius, softer hairline border, and a layered
 * ambient shadow that reads better in both light and dark themes.
 * Public API (props / exports) is 100% unchanged.
 */
export const Card = ({ children, className = '', ...props }: CardProps) => {
  return (
    <div
      className={`rounded-xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-2px_rgba(15,23,42,0.06)] dark:border-slate-700/80 dark:bg-slate-800 dark:shadow-none ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

/* Header/body paddings collapse slightly on small screens (p-5 -> sm:p-6) */
export const CardHeader = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`px-5 py-4 sm:px-6 border-b border-gray-100 dark:border-slate-700/80 ${className}`}>
    {children}
  </div>
);

export const CardTitle = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <h3 className={`text-base font-semibold leading-6 text-gray-900 dark:text-white ${className}`}>
    {children}
  </h3>
);

export const CardBody = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`p-5 sm:p-6 ${className}`}>
    {children}
  </div>
);
