declare module "country-list" {
  export type CountryEntry = {
    code: string;
    name: string;
  };

  export function getData(): CountryEntry[];
  export function getCode(name: string): string | undefined;
  export function getName(code: string): string | undefined;
}
