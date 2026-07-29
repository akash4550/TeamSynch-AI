import { type FC, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Title, Text, Button } from '@tremor/react';
import { LayoutDashboard, BrainCircuit, ShieldCheck, Zap } from 'lucide-react';

export const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors flex flex-col">
      
      {/* Navbar */}
      <nav className="h-16 px-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-8 h-8 text-blue-600" />
          <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">TeamSynch AI</span>
        </div>
        <div>
          <Button variant="light" onClick={() => navigate('/login')} className="mr-2 hidden sm:inline-flex">Sign In</Button>
          <Button onClick={() => navigate('/login')}>Get Started</Button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 rounded-full text-sm font-medium inline-flex items-center gap-2 border border-blue-200 dark:border-blue-800">
            <span>✨ Now in Production Release v1.0</span>
          </Badge>
          
          <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-tight">
            The Enterprise SaaS <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-emerald-500">
              Built for the Future
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            A production-grade, multi-tenant platform demonstrating advanced architectural patterns, real-time collaboration, and provider-agnostic AI integration.
          </p>
          
          <div className="flex items-center justify-center gap-4 pt-4">
            <Button size="xl" onClick={() => navigate('/login')} className="shadow-lg shadow-blue-500/20">
              View Live Demo
            </Button>
            <Button size="xl" variant="secondary" onClick={() => window.open('https://github.com', '_blank')}>
              View Source Code
            </Button>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mt-24 text-left">
          <FeatureCard 
            icon={<ShieldCheck className="w-6 h-6 text-emerald-500" />}
            title="Strict Multi-Tenancy"
            description="Data is actively isolated at the database and middleware layers, guaranteeing complete security across organizations."
          />
          <FeatureCard 
            icon={<Zap className="w-6 h-6 text-amber-500" />}
            title="Asynchronous Architecture"
            description="Heavy AI generations and analytics are offloaded to Redis-backed BullMQ workers for lightning-fast API responses."
          />
          <FeatureCard 
            icon={<LayoutDashboard className="w-6 h-6 text-purple-500" />}
            title="Modular Monolith"
            description="Strictly partitioned domains (Auth, CRM, Search) in a single robust deployment unit. Fast iteration, easy scaling."
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm border-t border-gray-200 dark:border-slate-800">
        <p>Built as a portfolio demonstration of enterprise engineering patterns.</p>
      </footer>
    </div>
  );
};

const Badge: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
  <div className={className}>{children}</div>
);

const FeatureCard: FC<{ icon: ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
  <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
    <div className="w-12 h-12 bg-gray-50 dark:bg-slate-900 rounded-xl flex items-center justify-center mb-4 border border-gray-100 dark:border-slate-700">
      {icon}
    </div>
    <Title className="mb-2 text-gray-900 dark:text-white">{title}</Title>
    <Text className="text-gray-600 dark:text-gray-400 leading-relaxed">{description}</Text>
  </div>
);
