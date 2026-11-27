declare const brand: unique symbol;

const publicIdPattern = /^[0-9a-f]{16}$/u;

export type PublicId = string & { readonly [brand]: "PublicId" };

export function isPublicId(value: string): value is PublicId {
  return publicIdPattern.test(value);
}
