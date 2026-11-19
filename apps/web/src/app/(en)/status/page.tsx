import { StatusPage } from "@/components/pages/status";
import { dictionary } from "@/content";
import { pageMetadata } from "@/lib/i18n";

const t = dictionary("en").meta;
export const metadata = pageMetadata("en", "status", {
  title: t.statusTitle,
  description: t.statusDescription,
});

export default function Page() {
  return <StatusPage locale="en" />;
}
