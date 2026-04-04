import { redirect } from "next/navigation";

/** Landing URL sends users straight into the main dashboard experience. */
export default function Home() {
  redirect("/dashboard");
}
