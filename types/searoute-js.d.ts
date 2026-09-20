declare module "searoute-js" {
  const searoute: (origin: object, destination: object, units?: string) => object | null;
  export default searoute;
}
