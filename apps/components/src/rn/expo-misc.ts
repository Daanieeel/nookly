// Clipboard, files, pictures and the router: nothing the gallery's components do when
// they are only looked at.
export async function setStringAsync() {
  return true;
}
export async function getStringAsync() {
  return "";
}
export const Stack = Object.assign(() => null, { Screen: () => null });
export const router = { push() {}, replace() {}, back() {}, navigate() {} };
export const useRouter = () => router;
export const useLocalSearchParams = () => ({});
export const usePathname = () => "/";
export const useSegments = () => [];
