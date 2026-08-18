# For sale — residual black box + Gate

We are **not** selling “#1 general compressor.” Numbers below are measured.

| Product | What it is | Buy |
|---|---|---|
| **Gate Year $790** | Mixed lossless router (text → brotli-11, else gzip-9). Calgary **+5.1%** vs brotli. | https://buy.stripe.com/7sY4gA6Jfapy1GZ8gw6wE0G |
| **TRU8 Year $990** | Token compression. Year = Chamber + TRU8. | https://buy.stripe.com/dRmaEY6Jf1T23P78gw6wE0E |
| **Chamber Year $490** | Security. 24-hour black box, then a seat. | https://buy.stripe.com/dRmeVeaZv7dm99rcwM6wE0F |
| **Lab Pass $1,088** | 365-day black box: Chamber + TRU8 + Gate + TruGame. | https://buy.stripe.com/3cI7sM2sZ0OYfxP7cs6wE0D |

This repo is the **public residual + swarm demo**. Production ZRW v5 stays closed.

## Measured (this repo)

| Sheet | residual | gzip-9 | brotli-11 |
|---|---:|---:|---:|
| zeros / ramp int32 | 13 | 73 / 13,907 | 13 / 10,429 |
| walk ±1 | **133** | 13,873 | 9,145 |
| Calgary bib | **33,213** | 35,083 | 28,380 |
| Calgary book1 | **284,002** | 312,498 | 256,323 |

Beats gzip on those Calgary text files. Does **not** beat brotli. #1 mixed GC is still brotli-11.

## Do not say
- this repo is #1 GC
- true8b / TruFold beat brotli on general files
- OmniWave 6.03× (lossy)

Inbox: corey@slidphilabs.com
