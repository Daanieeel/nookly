import { LegalPageView } from "@/components/pages/legal";
import { dictionary } from "@/content";
import { pageMetadata } from "@/lib/i18n";

export const metadata = pageMetadata("de", "imprint", {
  title: dictionary("de").meta.imprintTitle,
  description: dictionary("de").meta.legalDescription,
});

export default function Page() {
  return <LegalPageView locale="de" page="imprint" />;
}
