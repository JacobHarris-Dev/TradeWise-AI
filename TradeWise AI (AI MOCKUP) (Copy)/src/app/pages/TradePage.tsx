import { useState } from "react";
import { useParams, Navigate, Link } from "react-router";
import { STOCKS, CHART_DATA, AI_SIGNALS } from "../data/mockData";
import { useTrading } from "../context/TradingContext";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, AlertCircle, ArrowDown, ArrowUp, Brain, Info, Layers, Zap } from "lucide-react";

export function TradePage() {
  const { symbol } = useParams();
  const { balance, portfolio, buyStock, sellStock } = useTrading();
  
  const stock = STOCKS.find(s => s.symbol === symbol);
  const chartData = symbol ? CHART_DATA[symbol] : [];
  const aiSignal = symbol ? AI_SIGNALS[symbol] : null;

  const [shares, setShares] = useState<string>("1");
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  if (!stock || !symbol) {
    return <Navigate to="/" />;
  }

  const holding = portfolio[symbol];
  const isPositive = stock.change >= 0;

  const handleTrade = () => {
    const numShares = parseInt(shares);
    if (isNaN(numShares) || numShares <= 0) {
      setStatusMessage({ type: 'error', text: 'Enter a valid number of shares' });
      return;
    }

    if (tradeType === "BUY") {
      const result = buyStock(symbol, numShares, stock.currentPrice);
      setStatusMessage({ type: result.success ? 'success' : 'error', text: result.message });
      if (result.success) setShares("1");
    } else {
      const result = sellStock(symbol, numShares, stock.currentPrice);
      setStatusMessage({ type: result.success ? 'success' : 'error', text: result.message });
      if (result.success) setShares("1");
    }

    setTimeout(() => setStatusMessage(null), 3000);
  };

  const cost = parseInt(shares) * stock.currentPrice || 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 md:pb-0">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <h1 className="text-3xl font-bold text-white tracking-tight">{stock.symbol}</h1>
            <span className="text-lg text-slate-400 font-medium">{stock.name}</span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300">SIMULATED</span>
          </div>
          <div className="flex items-baseline space-x-3">
            <span className="text-4xl font-mono font-bold text-white">${stock.currentPrice.toFixed(2)}</span>
            <span className={`flex items-center text-lg font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isPositive ? <ArrowUp className="w-5 h-5 mr-1" /> : <ArrowDown className="w-5 h-5 mr-1" />}
              {Math.abs(stock.change)} ({Math.abs(stock.changePercent)}%)
            </span>
          </div>
        </div>
        
        <div className="flex gap-2">
          {STOCKS.map(s => (
            <Link key={s.symbol} to={`/trade/${s.symbol}`} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${s.symbol === symbol ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'}`}>
              {s.symbol}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Chart & AI Analysis */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Main Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-base font-semibold text-slate-200 flex items-center">
                <Activity className="w-4 h-4 mr-2 text-indigo-400" />
                Price History
              </h2>
              <div className="flex space-x-1">
                {['1D', '1W', '1M', '3M', 'YTD', '1Y'].map(tf => (
                  <button key={tf} className={`px-3 py-1 rounded-md text-xs font-medium ${tf === '1M' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="h-[400px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop key="top" offset="5%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0.3}/>
                      <stop key="bottom" offset="95%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#334155" tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                  <YAxis domain={['auto', 'auto']} stroke="#334155" tick={{ fill: '#64748b', fontSize: 12, fontFamily: 'monospace' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.5rem', color: '#f8fafc' }}
                    itemStyle={{ color: '#f8fafc', fontWeight: 600, fontFamily: 'monospace' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="price" 
                    stroke={isPositive ? '#10b981' : '#f43f5e'} 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorPrice)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Analysis Panel */}
          {aiSignal && (
            <div className="bg-gradient-to-br from-indigo-950/80 to-slate-900 border border-indigo-500/30 rounded-xl overflow-hidden shadow-sm relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="px-6 py-4 border-b border-indigo-500/20 flex items-center justify-between bg-indigo-950/40">
                <div className="flex items-center">
                  <Brain className="w-5 h-5 text-indigo-400 mr-2" />
                  <h2 className="text-base font-semibold text-white">TradeWise AI Analysis</h2>
                </div>
                <div className="flex items-center text-xs text-indigo-300 font-medium bg-indigo-900/50 px-2 py-1 rounded border border-indigo-700/50">
                  <Zap className="w-3 h-3 mr-1" /> Powered by Machine Learning
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex flex-col justify-center items-center p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-2">Signal</span>
                    <span className={`text-2xl font-black tracking-widest ${
                      aiSignal.signal === 'BUY' ? 'text-emerald-400' : 
                      aiSignal.signal === 'SELL' ? 'text-rose-400' : 'text-amber-400'
                    }`}>
                      {aiSignal.signal}
                    </span>
                  </div>
                  <div className="flex flex-col justify-center items-center p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-2">Confidence</span>
                    <div className="relative flex items-center justify-center w-16 h-16">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1e293b" strokeWidth="3" />
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray={`${aiSignal.confidence}, 100`} />
                      </svg>
                      <span className="absolute text-lg font-bold text-white">{aiSignal.confidence}%</span>
                    </div>
                  </div>
                  <div className="md:col-span-3 lg:col-span-1 flex flex-col justify-center p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-2 flex items-center">
                      <Info className="w-3 h-3 mr-1" /> Explanation
                    </span>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {aiSignal.explanation}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Trading Panel */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden sticky top-24">
            
            {/* Tabs */}
            <div className="flex border-b border-slate-800">
              <button 
                className={`flex-1 py-4 text-sm font-semibold text-center transition-colors ${tradeType === 'BUY' ? 'bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'}`}
                onClick={() => setTradeType('BUY')}
              >
                Buy {symbol}
              </button>
              <button 
                className={`flex-1 py-4 text-sm font-semibold text-center transition-colors ${tradeType === 'SELL' ? 'bg-rose-500/10 text-rose-400 border-b-2 border-rose-500' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'}`}
                onClick={() => setTradeType('SELL')}
              >
                Sell {symbol}
              </button>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Status Message */}
              {statusMessage && (
                <div className={`p-3 rounded-lg text-sm font-medium flex items-center ${
                  statusMessage.type === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {statusMessage.type === 'error' ? <AlertCircle className="w-4 h-4 mr-2" /> : <Layers className="w-4 h-4 mr-2" />}
                  {statusMessage.text}
                </div>
              )}

              {/* Order Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Order Type</label>
                <div className="bg-slate-800 rounded-lg p-3 text-sm text-slate-300 font-medium flex justify-between items-center cursor-not-allowed opacity-80 border border-slate-700">
                  <span>Market Order</span>
                  <Info className="w-4 h-4 text-slate-500" />
                </div>
              </div>

              {/* Shares Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Shares</label>
                <div className="relative">
                  <input 
                    type="number" 
                    min="1"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-mono text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">Shares</span>
                </div>
              </div>

              {/* Market Price */}
              <div className="flex justify-between items-center py-2 border-b border-slate-800">
                <span className="text-sm text-slate-400 font-medium">Market Price</span>
                <span className="text-sm text-white font-mono">${stock.currentPrice.toFixed(2)}</span>
              </div>

              {/* Estimated Cost */}
              <div className="flex justify-between items-center py-2">
                <span className="text-base font-semibold text-slate-200">Estimated {tradeType === 'BUY' ? 'Cost' : 'Credit'}</span>
                <span className="text-xl font-bold text-white font-mono">${cost.toFixed(2)}</span>
              </div>

              {/* Action Button */}
              <button 
                onClick={handleTrade}
                className={`w-full py-4 rounded-lg font-bold text-white uppercase tracking-wider transition-all shadow-lg ${
                  tradeType === 'BUY' 
                    ? 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20' 
                    : 'bg-rose-500 hover:bg-rose-400 shadow-rose-500/20'
                }`}
              >
                {tradeType === 'BUY' ? `Buy ${symbol}` : `Sell ${symbol}`}
              </button>

              {/* Buying Power / Position Summary */}
              <div className="pt-4 mt-4 border-t border-slate-800 text-center space-y-2">
                <p className="text-sm text-slate-400">
                  {tradeType === 'BUY' ? (
                    <>Buying Power: <span className="font-mono text-white">${balance.toFixed(2)}</span></>
                  ) : (
                    <>Shares Owned: <span className="font-mono text-white">{holding?.shares || 0}</span></>
                  )}
                </p>
                {holding && tradeType === 'BUY' && (
                  <p className="text-xs text-slate-500">
                    You own {holding.shares} shares at ${holding.avgPrice.toFixed(2)} avg
                  </p>
                )}
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
