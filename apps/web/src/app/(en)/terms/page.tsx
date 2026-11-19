import { LegalPageView } from "@/components/pages/legal";
import { dictionary } from "@/content";
import { pageMetadata } from "@/lib/i18n";

export const metadata = pageMetadata("en", "terms", {
  title: dictionary("en").meta.termsTitle,
  description: dictionary("en").meta.legalDescription,
});

export default function Page() {
  return <LegalPageView locale="en" page="terms" />;
}
