import { useTrading } from "../context/TradingContext";
import { STOCKS } from "../data/mockData";
import { Link, useNavigate } from "react-router";
import { ArrowDownRight, ArrowUpRight, BarChart3, Briefcase, History, LineChart, PieChart, TrendingUp, Wallet } from "lucide-react";

export function Portfolio() {
  const { balance, portfolio, history } = useTrading();
  const navigate = useNavigate();

  const holdings = Object.entries(portfolio).map(([symbol, holding]) => {
    const stock = STOCKS.find(s => s.symbol === symbol)!;
    const currentPrice = stock.currentPrice;
    const value = holding.shares * currentPrice;
    const costBasis = holding.shares * holding.avgPrice;
    const unrealizedPnL = value - costBasis;
    const pnlPercent = (unrealizedPnL / costBasis) * 100;
    
    return {
      symbol,
      shares: holding.shares,
      avgPrice: holding.avgPrice,
      currentPrice,
      value,
      unrealizedPnL,
      pnlPercent,
      stockName: stock.name
    };
  }).filter(h => h.shares > 0);

  const totalHoldingsValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const totalEquity = balance + totalHoldingsValue;
  const initialBalance = 10000;
  const totalReturn = totalEquity - initialBalance;
  const totalReturnPercent = (totalReturn / initialBalance) * 100;

  const isPositive = totalReturn >= 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 md:pb-0">
      <div className="flex items-center space-x-3 mb-6">
        <Briefcase className="w-8 h-8 text-indigo-400" />
        <h1 className="text-3xl font-bold text-white tracking-tight">Portfolio</h1>
      </div>

      {/* Summary Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-8 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
          
          <div className="space-y-2 border-b md:border-b-0 md:border-r border-slate-800 pb-6 md:pb-0 md:pr-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Total Equity</h3>
            <div className="text-4xl font-mono font-bold text-white">
              ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className={`flex items-center text-sm font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isPositive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
              ${Math.abs(totalReturn).toFixed(2)} ({Math.abs(totalReturnPercent).toFixed(2)}%) All Time
            </div>
          </div>

          <div className="space-y-2 border-b md:border-b-0 md:border-r border-slate-800 pb-6 md:pb-0 md:pr-6 md:pl-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center">
              <Wallet className="w-4 h-4 mr-2 text-indigo-400" /> Purchasing Power
            </h3>
            <div className="text-3xl font-mono font-bold text-slate-200">
              ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="space-y-2 md:pl-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center">
              <PieChart className="w-4 h-4 mr-2 text-indigo-400" /> Invested Capital
            </h3>
            <div className="text-3xl font-mono font-bold text-slate-200">
              ${totalHoldingsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Holdings List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <h2 className="text-lg font-semibold text-white flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-indigo-400" /> Current Positions
              </h2>
              <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                {holdings.length} Assets
              </span>
            </div>
            
            {holdings.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-500">
                  <LineChart className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-slate-300 mb-2">No active positions</h3>
                <p className="text-slate-500 max-w-sm mb-6">You haven't made any trades yet. Head over to the markets to start building your simulated portfolio.</p>
                <Link to="/">
                  <button className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">
                    Explore Markets
                  </button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/50 text-xs uppercase tracking-wider font-semibold text-slate-400 border-b border-slate-800">
                      <th className="px-6 py-4">Symbol</th>
                      <th className="px-6 py-4 text-right">Shares</th>
                      <th className="px-6 py-4 text-right">Avg Price</th>
                      <th className="px-6 py-4 text-right">Current</th>
                      <th className="px-6 py-4 text-right">Total Value</th>
                      <th className="px-6 py-4 text-right">Unrealized P/L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {holdings.map((h) => {
                      const pnlPositive = h.unrealizedPnL >= 0;
                      return (
                        <tr key={h.symbol} className="hover:bg-slate-800/30 transition-colors group cursor-pointer" onClick={() => navigate(`/trade/${h.symbol}`)}>
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 group-hover:bg-indigo-500/20 group-hover:text-indigo-300 transition-colors">
                                {h.symbol.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-white text-sm">{h.symbol}</p>
                                <p className="text-xs text-slate-500">{h.stockName}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-slate-300">{h.shares}</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-300">${h.avgPrice.toFixed(2)}</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-300">${h.currentPrice.toFixed(2)}</td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-white">${h.value.toFixed(2)}</td>
                          <td className="px-6 py-4 text-right">
                            <div className={`font-mono font-medium ${pnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {pnlPositive ? '+' : '-'}${Math.abs(h.unrealizedPnL).toFixed(2)}
                            </div>
                            <div className={`text-xs font-medium mt-1 ${pnlPositive ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                              {pnlPositive ? '+' : '-'}{Math.abs(h.pnlPercent).toFixed(2)}%
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* History / Activity Log */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm h-full max-h-[600px] flex flex-col">
            <div className="px-6 py-5 border-b border-slate-800 flex items-center bg-slate-900/50">
              <History className="w-5 h-5 mr-2 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">Order History</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                  <p className="text-sm">No transaction history</p>
                  <p className="text-xs mt-2">Trades you make will appear here</p>
                </div>
              ) : (
                history.map((tx) => (
                  <div key={tx.id} className="bg-slate-950/50 border border-slate-800/80 rounded-lg p-4 flex flex-col gap-2 hover:border-slate-700 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                          tx.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {tx.type}
                        </span>
                        <span className="font-bold text-white">{tx.symbol}</span>
                      </div>
                      <span className="text-xs font-medium text-slate-500">
                        {new Date(tx.date).toLocaleDateString()} {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-end mt-2 pt-2 border-t border-slate-800/50">
                      <div>
                        <p className="text-xs text-slate-400">Shares</p>
                        <p className="font-mono text-sm text-slate-200">{tx.shares}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Price</p>
                        <p className="font-mono text-sm text-slate-200">${tx.price.toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Total</p>
                        <p className="font-mono font-medium text-white">${(tx.shares * tx.price).toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
