declare module "utif" {
  export function decode(buffer: ArrayBuffer): Array<{
    width: number;
    height: number;
    data: Uint8Array;
  }>;
  export function decodeImage(buffer: ArrayBuffer, ifd: unknown): void;
  export function toRGBA8(ifd: unknown): Uint8Array;
}
