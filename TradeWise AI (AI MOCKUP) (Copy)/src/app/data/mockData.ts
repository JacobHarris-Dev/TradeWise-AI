export const STOCKS = [
  { symbol: "AAPL", name: "Apple Inc.", currentPrice: 175.50, change: 2.4, changePercent: 1.38 },
  { symbol: "TSLA", name: "Tesla Inc.", currentPrice: 202.10, change: -4.2, changePercent: -2.03 },
  { symbol: "NVDA", name: "NVIDIA Corp.", currentPrice: 850.20, change: 15.3, changePercent: 1.83 },
];

export const AI_SIGNALS: Record<string, { signal: "BUY" | "SELL" | "HOLD"; confidence: number; explanation: string }> = {
  AAPL: {
    signal: "BUY",
    confidence: 85,
    explanation: "The 50-day moving average has crossed above the 200-day moving average, creating a 'Golden Cross'. RSI is at 45, showing room for upward momentum without being overbought."
  },
  TSLA: {
    signal: "SELL",
    confidence: 72,
    explanation: "Recent price action shows lower highs. RSI has breached 70, indicating the asset is currently overbought. Short-term bearish divergence detected."
  },
  NVDA: {
    signal: "HOLD",
    confidence: 60,
    explanation: "Price is consolidating within a tight range. Trading volume has decreased over the last 3 sessions. Await a clear breakout above resistance or breakdown below support."
  }
};

export function generateChartData(startPrice: number, volatility: number, days: number = 30) {
  const data = [];
  let currentPrice = startPrice;
  const now = new Date();
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Random walk
    const change = (Math.random() - 0.5) * volatility;
    currentPrice = currentPrice + change;
    
    data.push({
      id: i.toString(),
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: Number(currentPrice.toFixed(2))
    });
  }
  
  // Ensure the last price matches exactly for consistency if needed, but for mockup it's fine
  return data;
}

export const CHART_DATA: Record<string, any[]> = {
  AAPL: generateChartData(160, 5, 30),
  TSLA: generateChartData(220, 8, 30),
  NVDA: generateChartData(800, 20, 30),
};
