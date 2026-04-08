import { Activity } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-slate-50 border-t border-slate-200 py-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row justify-between items-start gap-12 md:gap-24">
        
        {/* Brand */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-6">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-slate-900 font-bold tracking-tight text-lg">TradeWise AI</span>
          </div>
          <p className="text-sm font-medium text-slate-500 max-w-sm mb-6 leading-relaxed">
            The intelligent trading copilot. High-conviction signals, absolute transparency, zero noise. Built for modern financial decision-making.
          </p>
          <div className="text-xs font-bold text-slate-400">
            © {new Date().getFullYear()} TradeWise AI Inc. All rights reserved.
          </div>
        </div>

        {/* Links */}
        <div className="flex flex-1 gap-12 md:justify-end text-sm">
          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-slate-900 tracking-wide uppercase text-xs">Product</h4>
            <a href="#" className="font-medium text-slate-500 hover:text-slate-900 transition-colors">Signals</a>
            <a href="#" className="font-medium text-slate-500 hover:text-slate-900 transition-colors">Explanation Engine</a>
            <a href="#" className="font-medium text-slate-500 hover:text-slate-900 transition-colors">Integrations</a>
            <a href="#" className="font-medium text-slate-500 hover:text-slate-900 transition-colors">Pricing</a>
          </div>
          
          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-slate-900 tracking-wide uppercase text-xs">Company</h4>
            <a href="#" className="font-medium text-slate-500 hover:text-slate-900 transition-colors">About Us</a>
            <a href="#" className="font-medium text-slate-500 hover:text-slate-900 transition-colors">Careers</a>
            <a href="#" className="font-medium text-slate-500 hover:text-slate-900 transition-colors">Blog</a>
            <a href="#" className="font-medium text-slate-500 hover:text-slate-900 transition-colors">Contact</a>
          </div>
          
          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-slate-900 tracking-wide uppercase text-xs">Legal</h4>
            <a href="#" className="font-medium text-slate-500 hover:text-slate-900 transition-colors">Terms of Service</a>
            <a href="#" className="font-medium text-slate-500 hover:text-slate-900 transition-colors">Privacy Policy</a>
            <a href="#" className="font-medium text-slate-500 hover:text-slate-900 transition-colors">Disclosures</a>
          </div>
        </div>

      </div>
    </footer>
  );
}
