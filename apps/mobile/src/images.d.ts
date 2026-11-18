// Images bundled with the app, which Metro hands over as an asset number.
declare module "*.png" {
  const source: number;
  export default source;
}
