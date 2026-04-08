import { Activity } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 lg:px-12 py-4 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600">
          <Activity className="w-5 h-5" />
        </div>
        <span className="text-slate-900 font-bold tracking-tight text-lg">TradeWise AI</span>
      </div>

      <div className="hidden md:flex items-center gap-8">
        {["Product", "Signals", "News Context", "Pricing"].map((link) => (
          <a
            key={link}
            href={`#${link.toLowerCase().replace(" ", "-")}`}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            {link}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button className="hidden sm:block px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
          Try Demo
        </button>
        <button className="px-5 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-full transition-colors shadow-sm">
          Get Started
        </button>
      </div>
    </nav>
  );
}
