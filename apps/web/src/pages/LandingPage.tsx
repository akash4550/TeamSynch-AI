import { type FC, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, BrainCircuit, ShieldCheck, Zap, ArrowRight } from 'lucide-react';

export const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 transition-colors dark:bg-slate-900">

      {/* Sticky frosted navbar — same treatment as the app Topbar */}
      <nav
        aria-label="Main navigation"
        className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-gray-200/80 bg-white/90 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/90"
      >
        {/* Brand lockup — identical visual identity to Sidebar / LoginPage */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-md shadow-primary-600/20">
            <BrainCircuit className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
            TeamSynch <span className="text-primary-600 dark:text-primary-400">AI</span>
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* ORIGINAL handler: navigate('/login') — restyled as a ghost button (Sign In) */}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="hidden rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40 sm:inline-flex dark:text-gray-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            Sign In
          </button>
          {/* ORIGINAL handler: navigate('/login') — restyled as the primary button (Get Started) */}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section — readable type scale at every breakpoint + ambient glow */}
      <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-6 text-center">
        {/* Decorative ambient glow (purely presentational) */}
        <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[42rem] max-w-full -translate-x-1/2 rounded-full bg-primary-500/10 blur-3xl dark:bg-primary-500/15" />

        <div className="relative mx-auto max-w-4xl space-y-6 sm:space-y-8">
          <Badge className="inline-flex items-center gap-2 rounded-full border border-primary-200/80 bg-primary-50 px-3.5 py-1 text-xs font-semibold text-primary-700 sm:text-sm dark:border-primary-800/80 dark:bg-primary-900/30 dark:text-primary-300">
            <span aria-hidden="true">✨</span>
            <span>Now in Production Release v1.0</span>
          </Badge>

          {/* RESPONSIVE FIX: 4xl on phones, scaling to 7xl only on large screens
              (the old fixed 5xl/7xl scale overflowed narrow viewports) */}
          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-gray-900 sm:text-6xl lg:text-7xl dark:text-white">
            The Enterprise SaaS <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-primary-600 to-emerald-500 bg-clip-text text-transparent">
              Built for the Future
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-base leading-relaxed text-gray-600 sm:text-xl dark:text-gray-400">
            A production-grade, multi-tenant platform demonstrating advanced architectural patterns, real-time collaboration, and provider-agnostic AI integration.
          </p>

          {/* CTAs stack full-width on mobile, sit side-by-side from sm up.
              ORIGINAL handlers preserved: navigate('/login') + window.open(...). */}
          <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row sm:gap-4 sm:pt-4">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-primary-600/25 transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 sm:w-auto dark:focus:ring-offset-slate-900"
            >
              View Live Demo
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => window.open('https://github.com', '_blank')}
              className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 sm:w-auto dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700 dark:focus:ring-offset-slate-900"
            >
              View Source Code
            </button>
          </div>
        </div>

        {/* Feature Grid — 1 col on mobile, 3 on md+; generous responsive spacing */}
        <div className="relative mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-4 text-left sm:mt-24 sm:gap-6 md:grid-cols-3">
          <FeatureCard
            icon={<ShieldCheck className="h-6 w-6 text-emerald-500" />}
            title="Strict Multi-Tenancy"
            description="Data is actively isolated at the database and middleware layers, guaranteeing complete security across organizations."
          />
          <FeatureCard
            icon={<Zap className="h-6 w-6 text-amber-500" />}
            title="Asynchronous Architecture"
            description="Heavy AI generations and analytics are offloaded to Redis-backed BullMQ workers for lightning-fast API responses."
          />
          <FeatureCard
            icon={<LayoutDashboard className="h-6 w-6 text-purple-500" />}
            title="Modular Monolith"
            description="Strictly partitioned domains (Auth, CRM, Search) in a single robust deployment unit. Fast iteration, easy scaling."
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-500 dark:border-slate-800 dark:text-gray-400">
        <p>Built as a portfolio demonstration of enterprise engineering patterns.</p>
      </footer>
    </div>
  );
};

/* Local presentational helpers — same props as before, aligned to the design system */
const Badge: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
  <div className={className}>{children}</div>
);

const FeatureCard: FC<{ icon: ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
  <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700/80 dark:bg-slate-800">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-900">
      {icon}
    </div>
    <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
    <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">{description}</p>
  </div>
);
