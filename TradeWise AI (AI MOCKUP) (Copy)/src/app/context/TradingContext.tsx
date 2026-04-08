import { createContext, useContext, useState, ReactNode } from 'react';

export interface Holding {
  shares: number;
  avgPrice: number;
}

export interface Transaction {
  id: string;
  type: 'BUY' | 'SELL';
  symbol: string;
  shares: number;
  price: number;
  date: string;
}

interface TradingContextType {
  balance: number;
  portfolio: Record<string, Holding>;
  history: Transaction[];
  buyStock: (symbol: string, shares: number, price: number) => { success: boolean; message: string };
  sellStock: (symbol: string, shares: number, price: number) => { success: boolean; message: string };
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

export function TradingProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState<number>(10000);
  const [portfolio, setPortfolio] = useState<Record<string, Holding>>({});
  const [history, setHistory] = useState<Transaction[]>([]);

  const buyStock = (symbol: string, shares: number, price: number) => {
    const cost = shares * price;
    if (balance < cost) {
      return { success: false, message: 'Insufficient funds' };
    }

    setBalance(prev => prev - cost);
    setPortfolio(prev => {
      const existing = prev[symbol] || { shares: 0, avgPrice: 0 };
      const newShares = existing.shares + shares;
      const totalCost = (existing.shares * existing.avgPrice) + cost;
      const newAvg = totalCost / newShares;
      
      return {
        ...prev,
        [symbol]: { shares: newShares, avgPrice: newAvg }
      };
    });

    setHistory(prev => [{
      id: Math.random().toString(36).substring(7),
      type: 'BUY',
      symbol,
      shares,
      price,
      date: new Date().toISOString()
    }, ...prev]);

    return { success: true, message: 'Purchase successful' };
  };

  const sellStock = (symbol: string, shares: number, price: number) => {
    const holding = portfolio[symbol];
    if (!holding || holding.shares < shares) {
      return { success: false, message: 'Insufficient shares' };
    }

    const revenue = shares * price;
    setBalance(prev => prev + revenue);
    
    setPortfolio(prev => {
      const existing = prev[symbol];
      const newShares = existing.shares - shares;
      
      if (newShares <= 0) {
        const newPortfolio = { ...prev };
        delete newPortfolio[symbol];
        return newPortfolio;
      }
      
      return {
        ...prev,
        [symbol]: { ...existing, shares: newShares }
      };
    });

    setHistory(prev => [{
      id: Math.random().toString(36).substring(7),
      type: 'SELL',
      symbol,
      shares,
      price,
      date: new Date().toISOString()
    }, ...prev]);

    return { success: true, message: 'Sale successful' };
  };

  return (
    <TradingContext.Provider value={{ balance, portfolio, history, buyStock, sellStock }}>
      {children}
    </TradingContext.Provider>
  );
}

export function useTrading() {
  const context = useContext(TradingContext);
  if (context === undefined) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
}
