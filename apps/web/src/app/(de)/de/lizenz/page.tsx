import { LicensePageView } from "@/components/pages/license";
import { dictionary } from "@/content";
import { pageMetadata } from "@/lib/i18n";

export const metadata = pageMetadata("de", "license", {
  title: dictionary("de").meta.licenseTitle,
  description: dictionary("de").meta.licenseDescription,
});

export default function Page() {
  return <LicensePageView locale="de" />;
}
