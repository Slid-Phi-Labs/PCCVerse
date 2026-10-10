export class BitWriter {
  private bits: number[] = [];

  writeBit(bit: 0 | 1) {
    this.bits.push(bit);
  }

  writeBits(value: number, width: number) {
    for (let i = width - 1; i >= 0; i--) {
      this.writeBit(((value >>> i) & 1) as 0 | 1);
    }
  }

  writeByte(value: number) {
    this.writeBits(value & 0xff, 8);
  }

  writeUleb(n: number) {
    let x = n >>> 0;
    while (x >= 0x80) {
      this.writeByte((x & 0x7f) | 0x80);
      x >>>= 7;
    }
    this.writeByte(x);
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i]) out[i >> 3] |= 1 << (7 - (i & 7));
    }
    return out;
  }

  get bitLength {
    return this.bits.length;
  }
}

export class BitReader {
  private i = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get offset {
    return this.i;
  }

  seek(bitOffset: number) {
    if (bitOffset < 0 || bitOffset > this.bytes.length * 8) {
      throw new Error("seek out of range");
    }
    this.i = bitOffset;
  }

  get remainingBits {
    return this.bytes.length * 8 - this.i;
  }

  readBit(): 0 | 1 {
    if (this.i >= this.bytes.length * 8) {
      throw new Error("Unexpected end of bitstream");
    }
    const byte = this.bytes[this.i >> 3] ?? 0;
    const bit = ((byte >> (7 - (this.i & 7))) & 1) as 0 | 1;
    this.i += 1;
    return bit;
  }

  readBits(width: number): number {
    let v = 0;
    for (let i = 0; i < width; i++) v = (v << 1) | this.readBit();
    return v;
  }

  readByte(): number {
    return this.readBits(8);
  }

  readUleb(): number {
    let shift = 0;
    let v = 0;
    for (;;) {
      const b = this.readByte();
      v |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) return v >>> 0;
      shift += 7;
      if (shift > 28) throw new Error("uleb overflow");
    }
  }
}

export function ulebBits(n: number): number {
  let x = n >>> 0;
  let bits = 8;
  while (x >= 0x80) {
    x >>>= 7;
    bits += 8;
  }
  return bits;
}
