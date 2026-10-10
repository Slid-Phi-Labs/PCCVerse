# LicenseBox — required before public use

24h trial → monthly payment check → open if succeed / **shut if fail**.

```js
import { requireLicense, licenseMiddleware } from "./license-box.mjs";
await requireLicense("zero-range-wave-compression");
// Hosted API/MCP:
app.use("/api", licenseMiddleware("zero-range-wave-compression"));
```

Env: `LICENSE_CHECK_URL`, `LICENSE_PAY_URL`, `LICENSE_HMAC_SECRET`

**Note:** npm/source is readable when public. Real enforcement = hosted routes + Stripe via LICENSE_CHECK_URL.
