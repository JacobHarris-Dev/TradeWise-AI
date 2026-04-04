import { Dashboard } from "@/components/dashboard";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <Dashboard />
    </div>
  );
}
