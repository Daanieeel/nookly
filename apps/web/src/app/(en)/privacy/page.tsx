import { LegalPageView } from "@/components/pages/legal";
import { dictionary } from "@/content";
import { pageMetadata } from "@/lib/i18n";

export const metadata = pageMetadata("en", "privacy", {
  title: dictionary("en").meta.privacyTitle,
  description: dictionary("en").meta.legalDescription,
});

export default function Page() {
  return <LegalPageView locale="en" page="privacy" />;
}
