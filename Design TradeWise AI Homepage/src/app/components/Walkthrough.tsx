import { BrainCircuit, MousePointerClick, Search, Sparkles } from "lucide-react";

export default function Walkthrough() {
  const steps = [
    {
      title: "Search any global equity",
      description: "Enter a ticker symbol or company name. TradeWise instantly pulls up live pricing, historical charts, and pre-computes the technical baseline.",
      icon: Search,
      color: "text-blue-500",
      bg: "bg-blue-50 border-blue-100",
      visual: (
        <div className="w-full h-full bg-slate-50 rounded-2xl border border-slate-200 p-6 flex flex-col justify-center items-center relative overflow-hidden shadow-sm">
          <div className="w-[80%] bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-lg z-10">
            <Search className="w-5 h-5 text-slate-400" />
            <span className="text-slate-900 text-lg font-extrabold tracking-tight">PLTR<span className="text-blue-500 animate-pulse">|</span></span>
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-100/50 via-transparent to-transparent" />
        </div>
      )
    },
    {
      title: "Review the AI-generated signal",
      description: "Within milliseconds, our machine learning models evaluate 120+ technical indicators against historical price action to generate a high-conviction signal.",
      icon: BrainCircuit,
      color: "text-emerald-600",
      bg: "bg-emerald-50 border-emerald-100",
      visual: (
        <div className="w-full h-full bg-slate-50 rounded-2xl border border-slate-200 p-8 flex items-center justify-center relative overflow-hidden shadow-sm">
          <div className="w-[80%] bg-white border border-slate-200 rounded-xl p-6 shadow-xl z-10 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-500" />
            <div className="flex justify-between items-center mb-4 mt-2">
              <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Model Output</span>
              <span className="px-2 py-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-extrabold rounded">92% CONFIDENCE</span>
            </div>
            <div className="text-3xl font-black text-slate-900 tracking-tight mb-3">STRONG BUY</div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: "92%" }} />
            </div>
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-100/50 via-transparent to-transparent" />
        </div>
      )
    },
    {
      title: "Read the explanation layer",
      description: "Our LLM summarizes the 'why' behind the trade. See exactly which indicators fired, read the latest news context, and understand the macro risks.",
      icon: Sparkles,
      color: "text-cyan-600",
      bg: "bg-cyan-50 border-cyan-100",
      visual: (
        <div className="w-full h-full bg-slate-50 rounded-2xl border border-slate-200 p-6 flex flex-col justify-center items-center relative overflow-hidden shadow-sm">
          <div className="w-[90%] bg-white border border-slate-200 rounded-xl p-5 shadow-xl z-10 text-left relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-400 to-cyan-500" />
            <div className="flex items-center gap-2 mb-3 mt-1">
              <Sparkles className="w-4 h-4 text-cyan-600" />
              <span className="text-sm font-extrabold text-slate-900">AI Reasoning</span>
            </div>
            <p className="text-sm text-slate-600 font-medium leading-relaxed mb-4">
              "Price action has successfully retested the 200 SMA support zone. Furthermore, the newly announced government contract acts as a bullish catalyst against previous resistance."
            </p>
            <div className="flex gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded">Tech: SMA Bounce</span>
              <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded">News: Contract Won</span>
            </div>
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-100/50 via-transparent to-transparent" />
        </div>
      )
    },
    {
      title: "Act with unshakeable confidence",
      description: "Use the built-in integrations to execute your trade seamlessly, or simply port the high-conviction setup to your preferred brokerage.",
      icon: MousePointerClick,
      color: "text-amber-500",
      bg: "bg-amber-50 border-amber-100",
      visual: (
        <div className="w-full h-full bg-slate-50 rounded-2xl border border-slate-200 p-6 flex items-center justify-center relative overflow-hidden shadow-sm">
          <div className="w-[80%] bg-white border border-slate-200 rounded-xl p-6 shadow-xl z-10 flex flex-col gap-4">
            <button className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors shadow-md">
              Execute Buy Order
            </button>
            <button className="w-full py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg transition-colors border border-slate-200 shadow-sm">
              Copy Signal Data
            </button>
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-100/50 via-transparent to-transparent" />
        </div>
      )
    }
  ];

  return (
    <section id="product" className="py-24 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="text-center max-w-2xl mx-auto mb-20">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
            From noise to decision in seconds
          </h2>
          <p className="text-lg text-slate-600 font-medium">
            A frictionless workflow designed to give you an unfair advantage in the market.
          </p>
        </div>

        <div className="space-y-24 lg:space-y-32">
          {steps.map((step, idx) => (
            <div key={idx} className={`flex flex-col gap-8 lg:gap-16 ${idx % 2 === 1 ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center`}>
              {/* Text Side */}
              <div className="flex-1 space-y-6 text-center lg:text-left">
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mx-auto lg:mx-0 ${step.bg} border shadow-sm`}>
                  <step.icon className={`w-6 h-6 ${step.color}`} />
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Step {idx + 1}: {step.title}
                </h3>
                <p className="text-slate-600 font-medium text-lg leading-relaxed max-w-md mx-auto lg:mx-0">
                  {step.description}
                </p>
              </div>

              {/* Visual Side */}
              <div className="flex-1 w-full h-[320px] lg:h-[400px]">
                {step.visual}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
