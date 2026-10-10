"""
tru8.py - Minimal rANS entropy coder for TruFold
API: encode(symbol, cdf) / decode(cdf) -> symbol
Real rANS implementation, 8-bit alphabet.
"""

import numpy as np


class Encoder:
    def __init__(self):
        self.state = 1 << 23
        self.stream = []
        self.L = 1 << 23
        self.b = 1 << 16

    def encode(self, symbol, probs):
        """probs: np.ndarray of shape [256] summing to ~1.0"""
        freq = (probs * 16383).astype(np.int32) + 1
        freq = freq * 16384 // freq.sum()
        freq = np.maximum(freq, 1)
        diff = 16384 - freq.sum()
        freq[np.argmax(freq)] += diff

        cum = np.zeros(257, dtype=np.int32)
        cum[1:] = np.cumsum(freq[:-1])

        c = cum[symbol]
        f = freq[symbol]

        if self.state >= (self.L // 16384) * self.b:
            self.stream.append(self.state & 0xFFFF)
            self.state >>= 16

        self.state = (self.state // f) * 16384 + (self.state % f) + c

    def flush(self):
        out = self.stream.copy()
        s = self.state
        for _ in range(4):
            out.append(s & 0xFFFF)
            s >>= 16
            if s == 0:
                break
        out.append(s & 0xFFFF)

        result = bytearray()
        for v in out:
            result += v.to_bytes(2, 'little')
        return bytes(result)


class Decoder:
    def __init__(self, bitstream):
        words = [int.from_bytes(bitstream[i:i+2], 'little')
                 for i in range(0, len(bitstream), 2)]
        self.stream = words[::-1]
        self.state = 0
        if len(self.stream) >= 2:
            self.state = (self.stream.pop() << 16) | self.stream.pop()
            if self.stream:
                self.state = (self.state << 16) | self.stream.pop()
        self.L = 1 << 23
        self.b = 1 << 16

    def decode(self, probs):
        freq = (probs * 16383).astype(np.int32) + 1
        freq = freq * 16384 // freq.sum()
        freq = np.maximum(freq, 1)
        diff = 16384 - freq.sum()
        freq[np.argmax(freq)] += diff

        cum = np.zeros(257, dtype=np.int32)
        cum[1:] = np.cumsum(freq[:-1])

        slot = self.state % 16384
        symbol = int(np.searchsorted(cum[1:], slot, side='right'))

        c = cum[symbol]
        f = freq[symbol]

        self.state = f * (self.state // 16384) + (self.state % 16384) - c

        if self.state < self.L and self.stream:
            self.state = (self.state << 16) | self.stream.pop()

        return symbol
