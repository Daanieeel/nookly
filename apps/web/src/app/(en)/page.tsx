import { HomePage } from "@/components/pages/home";
import { dictionary } from "@/content";
import { pageMetadata } from "@/lib/i18n";

const t = dictionary("en").meta;
export const metadata = pageMetadata("en", "home", {
  title: t.homeTitle,
  description: t.homeDescription,
});

export default function Page() {
  return <HomePage locale="en" />;
}
