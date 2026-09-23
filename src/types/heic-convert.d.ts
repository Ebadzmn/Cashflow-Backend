declare module 'heic-convert' {
  type ConversionOptions = {
    buffer: Uint8Array;
    format: 'JPEG' | 'PNG';
    quality?: number;
  };

  const convert: (options: ConversionOptions) => Promise<Uint8Array>;

  export = convert;
}
