/** ZRW by SlidPhiLabs — public stub only. https://www.slidphilabs.com/access */
const MSG =
  "zero-range-wave-compression (ZRW) is proprietary. " +
  "Public npm only ships a stub. After purchase or Try Gate, you receive the real package. " +
  "https://www.slidphilabs.com/access";
function blocked() { throw new Error(MSG); }
export const compress = blocked;
export const decompress = blocked;
export const setLicenseKey = blocked;
export default { compress, decompress, setLicenseKey };
console.warn("[ZRW by SlidPhiLabs] Stub — no codec source. → https://www.slidphilabs.com/access");
