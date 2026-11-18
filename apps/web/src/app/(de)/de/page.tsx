import { HomePage } from "@/components/pages/home";
import { dictionary } from "@/content";
import { pageMetadata } from "@/lib/i18n";

const t = dictionary("de").meta;
export const metadata = pageMetadata("de", "home", {
  title: t.homeTitle,
  description: t.homeDescription,
});

export default function Page() {
  return <HomePage locale="de" />;
}
