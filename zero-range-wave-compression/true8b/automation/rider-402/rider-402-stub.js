/** Rider contracts + 402 stubs — drop-in */
const PRICING = {
  "tr8-year": "https://buy.stripe.com/dRmaEY6Jf1T23P78gw6wE0E",
  "lab-pass": "https://buy.stripe.com/3cI7sM2sZ0OYfxP7cs6wE0D",
  "chamber-year": "https://buy.stripe.com/dRmeVeaZv7dm99rcwM6wE0F",
  "gate-year": null // fill from live SoT when ready
};

function listContracts(req, res) {
  // Replace with real Supabase read
  res.json({ contracts: [], count: 0, note: "stub — wire cuni_contracts" });
}

function riderHealth(req, res) {
  res.json({
    ok: true,
    contracts: 0,
    exactness: "gate-live",
    blackbox_paths: ["omniwave", "native-compression"],
    note: "stub"
  });
}

function paymentRequired(product = "tr8-year") {
  return {
    ok: false,
    error: "payment_required",
    code: 402,
    product,
    checkout: PRICING[product] || "https://www.slidphilabs.com/pricing.json",
    pricing_sot: "https://www.slidphilabs.com/pricing.json"
  };
}

module.exports = { listContracts, riderHealth, paymentRequired, PRICING };
