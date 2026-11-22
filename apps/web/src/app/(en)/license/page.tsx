import { LicensePageView } from "@/components/pages/license";
import { dictionary } from "@/content";
import { pageMetadata } from "@/lib/i18n";

export const metadata = pageMetadata("en", "license", {
  title: dictionary("en").meta.licenseTitle,
  description: dictionary("en").meta.licenseDescription,
});

export default function Page() {
  return <LicensePageView locale="en" />;
}
