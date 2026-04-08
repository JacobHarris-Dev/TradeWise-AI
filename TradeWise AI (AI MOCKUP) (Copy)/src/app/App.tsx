import { RouterProvider } from 'react-router';
import { router } from './routes';
import { TradingProvider } from './context/TradingContext';

export default function App() {
  return (
    <TradingProvider>
      <RouterProvider router={router} />
    </TradingProvider>
  );
}
