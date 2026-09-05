# true8b — PRIVATE

Slid Phi Labs. Residual / integer coder.

Job: order-1/2 XOR residual and postings IDs.  
Does not: occupy the TRU8 zeros seat (that flagship is 8 bytes). Not Combined GC. Not pulsar. Not #1.

**Not the lab’s general-compressor SKU.**

Want mixed lossless files? Buy **[Gate](SALE.md)** ($790/year).  
Want the token product? Buy **[TRU8 Year](SALE.md)** ($990).

- **Path A**: Order-1/2 context + XOR residual → true8b codes  
- **Path B**: Delta / postings → true8b (~5.7 bits/id)  
- Multi-block + OpenMP  
- Frame v2: `[TRUE8B][ver=2]…`

Calgary Path A = **64.5%** remaining. gzip-9 = **32.6%**. xz-9 = **27.2%**.  
Do **not** claim this beats gzip/xz on general text.

## Build
```bash
gcc -O3 -fopenmp -o true8b true8b.c
./true8b c text     input.bin   out.true8b
./true8b c postings ids.txt     out.true8b
./true8b d          out.true8b  restored.bin
```

Benches: `true8b_public_bench.json` · Gate vs brotli: `benches/`.  
Sale face: [`SALE.md`](SALE.md).
