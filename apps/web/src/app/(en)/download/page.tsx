import { DownloadPage } from "@/components/pages/download";
import { dictionary } from "@/content";
import { pageMetadata } from "@/lib/i18n";

const t = dictionary("en").meta;
export const metadata = pageMetadata("en", "download", {
  title: t.downloadTitle,
  description: t.downloadDescription,
});

export default function Page() {
  return <DownloadPage locale="en" />;
}
