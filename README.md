# zero-range-wave-compression

**IP Guard off (2026-08-21).** This repo is **public**. `compress` / `decompress` are the real ZRW integer path (zeros/ramps/walks). License gates are no-op.

Flagship: 10,000 int32 zeros → 8 bytes. This is **not** a claim we beat brotli on general text.

## Use

```js
import { compress, decompress } from "zero-range-wave-compression";
const packed = compress(Array(10000).fill(0));
const back = decompress(packed);
```

Site: https://www.slidphilabs.com/tru8  
Prices: https://www.slidphilabs.com/pricing.json  

Live seats unchanged: Chamber $9/$49/$490 · TRU8 $19/$99/$990 · Gate $29/$89/$790 · Lab Pass $1,088 · TruGame $12/$79.

© Slid Phi Labs
