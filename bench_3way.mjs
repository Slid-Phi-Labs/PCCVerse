
import { compress as bjCompress, BlackjackBaseV4, BlackjackV4 } from './blackjack_clean.mjs';
import zlib from 'zlib';

function bench(name, data){
  // 1 = adaptive (slow first pass)
  const t0=performance.now();
  const adaptive = new BlackjackV4().encode(data);
  const tAdaptive = performance.now()-t0;
  const adaptiveBytes = Math.ceil(adaptive.bits.length/8)+4;

  // 2 = fast single-variant (trained per corpus - best var/k)
  const t1=performance.now();
  const fast = new BlackjackBaseV4(adaptive.variant, adaptive.k).encode(data);
  const tFast = performance.now()-t1;
  const fastBytes = Math.ceil(fast.length/8)+4;

  // 3 = two-stage: blackjack + brotli
  const bjPacked = bjCompress(data);
  const t2=performance.now();
  const twoStage = zlib.brotliCompressSync(bjPacked);
  const tTwo = performance.now()-t2 + t0; // include blackjack time approx
  // actually time two-stage = adaptive encode + brotli
  const t2full = performance.now();
  const adaptivePacked = bjPacked;
  const brotli = zlib.brotliCompressSync(adaptivePacked);
  const tTwoFull = performance.now()-t2full + tAdaptive;

  return {
    name,
    len: data.length,
    adaptive: {variant: adaptive.variant, k: adaptive.k, bytes: adaptiveBytes, bits: adaptive.bits.length, ms: tAdaptive.toFixed(3)},
    fast_fixed: {variant: adaptive.variant, k: adaptive.k, bytes: fastBytes, bits: fast.length, ms: tFast.toFixed(3), saving: ((1-fastBytes/adaptiveBytes)*100).toFixed(1)+'%', speedup: (tAdaptive/tFast).toFixed(2)+'x'},
    two_stage: {bytes: brotli.length, bits: brotli.length*8, ms: (tAdaptive+ (performance.now()-t2full)).toFixed(3), vs_adaptive: ((1-brotli.length/adaptiveBytes)*100).toFixed(1)+'% smaller'},
  };
}

function makeWalk(n, step){ let a=[0]; for(let i=1;i<n;i++) a.push(a[i-1]+ (Math.floor(Math.random()*(2*step+1))-step)); return a; }

const corpora = {
  'zeros_1k': Array(1000).fill(0),
  'ramp_1k': Array.from({length:1000}, (_,i)=>i),
  'walk_10k_s1': makeWalk(10000,1),
  'walk_10k_s5': makeWalk(10000,5),
  'blackjack_1k': Array.from({length:1000}, ()=> Math.floor(Math.random()*11)+1),
  'blackjack_10k': Array.from({length:10000}, ()=> Math.floor(Math.random()*11)+1),
  'triangular_1k': Array.from({length:1000}, (_,i)=> Math.floor(i*(i+1)/2)),
  'rle_1k': Array.from({length:1000}, ()=> Math.random()<0.8? 100 : 101),
};

let results=[];
for(const [k,v] of Object.entries(corpora)){
  results.push(bench(k,v));
}
console.log(JSON.stringify(results,null,2));

// Overall winner tally
let wins={adaptive:0, fast:0, two:0};
for(const r of results){
  const sizes = [{name:'adaptive', s:r.adaptive.bytes},{name:'fast', s:r.fast_fixed.bytes},{name:'two', s:r.two_stage.bytes}];
  sizes.sort((a,b)=>a.s-b.s);
  const winner=sizes[0].name;
  if(winner==='adaptive') wins.adaptive++;
  else if(winner==='fast') wins.fast++;
  else wins.two++;
}
console.log('WINS', wins);
