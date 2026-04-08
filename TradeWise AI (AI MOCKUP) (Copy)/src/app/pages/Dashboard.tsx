import { Link } from "react-router";
import { useTrading } from "../context/TradingContext";
import { STOCKS } from "../data/mockData";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight, TrendingUp, Wallet } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from "recharts";
import { CHART_DATA } from "../data/mockData";

export function Dashboard() {
  const { balance, portfolio, history } = useTrading();

  // Calculate portfolio value
  const holdingsValue = Object.entries(portfolio).reduce((total, [symbol, holding]) => {
    const stock = STOCKS.find(s => s.symbol === symbol);
    if (!stock) return total;
    return total + (holding.shares * stock.currentPrice);
  }, 0);

  const totalEquity = balance + holdingsValue;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20 md:pb-0">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center text-slate-400 mb-2 space-x-2">
            <Wallet className="w-5 h-5 text-indigo-400" />
            <h3 className="font-medium text-sm">Total Equity</h3>
          </div>
          <div className="text-3xl font-bold font-mono tracking-tight text-white">
            ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-sm text-emerald-400 flex items-center">
            <TrendingUp className="w-4 h-4 mr-1" />
            <span>+${(totalEquity - 10000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-slate-500 ml-2">All time</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center text-slate-400 mb-2 space-x-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h3 className="font-medium text-sm">Buying Power</h3>
          </div>
          <div className="text-3xl font-bold font-mono tracking-tight text-white">
            ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-center">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-slate-400 font-medium text-sm mb-1">Active Positions</h3>
              <div className="text-3xl font-bold text-white">{Object.keys(portfolio).length}</div>
            </div>
            <Link to="/portfolio" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Market Overview */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Featured Markets</h2>
              <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-1 rounded-md">Simulated Real-time</span>
            </div>
            <div className="divide-y divide-slate-800/50">
              {STOCKS.map((stock) => {
                const isPositive = stock.change >= 0;
                const data = CHART_DATA[stock.symbol];
                return (
                  <Link 
                    key={stock.symbol} 
                    to={`/trade/${stock.symbol}`}
                    className="flex items-center p-4 hover:bg-slate-800/50 transition-colors cursor-pointer group"
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 group-hover:bg-slate-700 transition-colors">
                      {stock.symbol.charAt(0)}
                    </div>
                    <div className="ml-4 flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-slate-100">{stock.symbol}</h3>
                          <p className="text-sm text-slate-500">{stock.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-medium text-white">${stock.currentPrice.toFixed(2)}</p>
                          <p className={`text-sm flex items-center justify-end font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                            {Math.abs(stock.changePercent)}%
                          </p>
                        </div>
                      </div>
                      
                      {/* Mini Chart */}
                      <div className="h-10 mt-3 w-full opacity-60 group-hover:opacity-100 transition-opacity min-w-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                          <LineChart data={data}>
                            <YAxis domain={['auto', 'auto']} hide />
                            <Line 
                              type="monotone" 
                              dataKey="price" 
                              stroke={isPositive ? '#10b981' : '#f43f5e'} 
                              strokeWidth={2} 
                              dot={false}
                              isAnimationActive={false} 
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Column: AI Insights & Activity */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-900/50 to-slate-900 border border-indigo-500/30 rounded-xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
            <div className="flex items-center mb-4">
              <div className="bg-indigo-500/20 p-2 rounded-lg mr-3 border border-indigo-500/30">
                <CheckCircle2 className="w-5 h-5 text-indigo-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">TradeWise AI</h2>
            </div>
            <p className="text-sm text-indigo-200/80 mb-4 leading-relaxed">
              Your paper-trading strategy simulator. Explore simulated markets, view AI-driven trading signals, and practice trading without financial risk.
            </p>
            <Link to="/trade/AAPL">
              <button className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/20">
                View AI Signals
              </button>
            </Link>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="text-base font-semibold text-white">Recent Activity</h2>
            </div>
            <div className="p-2 h-64 overflow-auto">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <p className="text-sm">No trades yet</p>
                  <p className="text-xs mt-1">Visit a market to place a trade</p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {history.slice(0, 5).map(tx => (
                    <li key={tx.id} className="flex justify-between items-center p-3 hover:bg-slate-800/50 rounded-lg transition-colors">
                      <div className="flex items-center">
                        <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold mr-3 ${
                          tx.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {tx.type}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-200">{tx.symbol}</p>
                          <p className="text-xs text-slate-500">{new Date(tx.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono text-white">{tx.shares} sh</p>
                        <p className="text-xs text-slate-400 font-mono">@ ${(tx.price).toFixed(2)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
