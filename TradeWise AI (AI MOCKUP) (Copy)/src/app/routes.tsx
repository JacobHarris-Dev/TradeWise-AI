import { createBrowserRouter } from "react-router";
import { AppLayout } from "./layout/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { TradePage } from "./pages/TradePage";
import { Portfolio } from "./pages/Portfolio";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "trade/:symbol", Component: TradePage },
      { path: "portfolio", Component: Portfolio },
    ],
  },
]);
