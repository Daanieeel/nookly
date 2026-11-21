// The phone's own source is compiled by the bundler, in the browser, through
// react-native-web. Its types belong to the phone's own `bun run typecheck`, so here what
// is imported from it is not checked again.
declare module "@mobile/*";
declare module "react-native-web";
