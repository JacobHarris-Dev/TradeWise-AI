import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import TrustBand from "../components/TrustBand";
import Features from "../components/Features";
import Walkthrough from "../components/Walkthrough";
import Metrics from "../components/Metrics";
import Cta from "../components/Cta";
import Footer from "../components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <Navbar />
      <main>
        <Hero />
        <TrustBand />
        <Features />
        <Walkthrough />
        <Metrics />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
