/**
 * Swarm-smart DNA.
 * Three loci every member of every swarm can face or mimic:
 *   .1  perceive
 *   .2  route
 *   .3  emit
 */
export const LOCUS = Object.freeze({ perceive: 1, route: 2, emit: 3 });
export const LOCUS_NAME = Object.freeze({ 1: "perceive", 2: "route", 3: "emit" });

export function makeDna(id, seed) {
  return {
    id,
    seed: seed >>> 0,
    locus: LOCUS.perceive,
    canMimic: [1, 2, 3],
    alleles: [
      ((seed >>> 0) & 255) / 255,
      ((seed >>> 8) & 255) / 255,
      ((seed >>> 16) & 255) / 255,
    ],
  };
}

export function face(dna, locus) {
  const L = Number(locus);
  if (L !== 1 && L !== 2 && L !== 3) throw new Error("DNA faces .1 .2 .3 only");
  return { ...dna, locus: L };
}

export function allele(dna, locus = dna.locus) {
  return dna.alleles[(Number(locus) - 1) % 3];
}
