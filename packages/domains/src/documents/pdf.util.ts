import { BadRequestException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';

const PDF_MAGIC = Buffer.from('%PDF');

export function assertPdfBuffer(buffer: Buffer, maxBytes: number) {
  if (!buffer?.length) {
    throw new BadRequestException('Empty file');
  }
  if (buffer.length > maxBytes) {
    throw new BadRequestException(
      `File exceeds max size of ${maxBytes} bytes`,
    );
  }
  if (buffer.subarray(0, 4).compare(PDF_MAGIC) !== 0) {
    throw new BadRequestException('File is not a valid PDF (missing %PDF signature)');
  }
}

export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  try {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch {
    throw new BadRequestException('Unable to parse PDF');
  }
}
