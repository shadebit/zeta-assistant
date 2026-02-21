/**
 * Type declarations for the `qrcode-terminal` package.
 *
 * This package does not ship its own types.
 */
declare module 'qrcode-terminal' {
  interface QrCodeOptions {
    readonly small?: boolean;
  }

  /**
   * Generates a QR code and prints it to the terminal.
   *
   * @param text - The text to encode in the QR code.
   * @param options - Display options.
   * @param callback - Optional callback invoked with the QR string.
   */
  function generate(text: string, options?: QrCodeOptions, callback?: (qr: string) => void): void;

  export { generate };
}
