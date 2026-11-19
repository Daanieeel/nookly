import { LegalPageView } from "@/components/pages/legal";
import { dictionary } from "@/content";
import { pageMetadata } from "@/lib/i18n";

export const metadata = pageMetadata("en", "imprint", {
  title: dictionary("en").meta.imprintTitle,
  description: dictionary("en").meta.legalDescription,
});

export default function Page() {
  return <LegalPageView locale="en" page="imprint" />;
}
