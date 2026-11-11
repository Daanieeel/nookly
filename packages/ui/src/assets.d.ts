// Pictures are imported as the address the bundler of whichever app uses the package gives them.
declare module "*.svg" {
  const url: string;
  export default url;
}
