/// <reference types="vite/client" />

declare module "netlistsvg" {
  const value: any;
  export default value;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}
