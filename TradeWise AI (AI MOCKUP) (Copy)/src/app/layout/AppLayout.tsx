import { Link, Outlet, useLocation } from "react-router";
import { useTrading } from "../context/TradingContext";
import { BarChart3, Briefcase, Home, LineChart, LogOut, Settings, TrendingUp } from "lucide-react";

export function AppLayout() {
  const { balance } = useTrading();
  const location = useLocation();

  const navItems = [
    { label: "Dashboard", path: "/", icon: <Home className="w-5 h-5" /> },
    { label: "Markets", path: "/trade/AAPL", icon: <LineChart className="w-5 h-5" /> },
    { label: "Portfolio", path: "/portfolio", icon: <Briefcase className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900 flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <TrendingUp className="w-6 h-6 text-indigo-500 mr-2" />
          <span className="text-xl font-bold tracking-tight text-white">TradeWise</span>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (location.pathname.startsWith('/trade') && item.path.startsWith('/trade'));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive 
                    ? "bg-indigo-600/10 text-indigo-400 font-medium" 
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center space-x-3 px-4 py-2 text-slate-400 hover:text-slate-200 cursor-pointer">
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </div>
          <div className="flex items-center space-x-3 px-4 py-2 text-slate-400 hover:text-slate-200 cursor-pointer mt-1">
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="md:hidden flex items-center">
             <TrendingUp className="w-6 h-6 text-indigo-500 mr-2" />
             <span className="font-bold text-white">TradeWise</span>
          </div>
          <div className="hidden md:block">
            <h1 className="text-lg font-semibold text-slate-200">
              {location.pathname === "/" ? "Dashboard" : 
               location.pathname.includes("/trade") ? "Trading Desk" : 
               location.pathname === "/portfolio" ? "My Portfolio" : ""}
            </h1>
          </div>
          
          <div className="flex items-center space-x-6">
            <div className="flex flex-col items-end">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Buying Power</span>
              <span className="text-sm font-mono font-medium text-emerald-400">
                ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600">
              <span className="text-sm font-medium">JD</span>
            </div>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Nav Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900 border-t border-slate-800 flex justify-around items-center z-50">
        {navItems.map((item) => {
            const isActive = location.pathname === item.path || (location.pathname.startsWith('/trade') && item.path.startsWith('/trade'));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center w-full h-full ${
                  isActive ? "text-indigo-400" : "text-slate-500"
                }`}
              >
                {item.icon}
                <span className="text-[10px] mt-1 font-medium">{item.label}</span>
              </Link>
            );
          })}
      </nav>
    </div>
  );
}
