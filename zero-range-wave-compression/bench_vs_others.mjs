
import { compress as bjCompress, BlackjackV4, BlackjackBaseV4 } from './blackjack_clean.mjs';
import zlib from 'zlib';

function packInt32LE(arr){
  const b = Buffer.alloc(arr.length*4);
  for(let i=0;i<arr.length;i++) b.writeInt32LE(arr[i], i*4);
  return b;
}
function packDeltaVarint(arr){
  // simple: first as varint, then zigzag delta
  let out=[]; 
  function writeVarint(v){ v>>>=0; while(v>=0x80){ out.push((v&0x7F)|0x80); v>>>=7; } out.push(v); }
  if(!arr.length) return Buffer.from(out);
  writeVarint(arr[0]>>>0);
  for(let i=1;i<arr.length;i++){ 
    let d = arr[i]-arr[i-1];
    let zz = d>=0? d*2 : -d*2-1;
    writeVarint(zz);
  }
  return Buffer.from(out);
}

function benchCorpus(name, data){
  const raw32 = packInt32LE(data);
  const varint = packDeltaVarint(data);
  const bj = bjCompress(data); // includes 4 byte header
  const bjAdaptiveBits = new BlackjackV4().encode(data).bits.length;
  
  const gzRaw = zlib.gzipSync(raw32);
  const gzVarint = zlib.gzipSync(varint);
  const brotliRaw = zlib.brotliCompressSync(raw32);
  const deflateRaw = zlib.deflateSync(raw32);

  const res = {
    name, len: data.length,
    raw32: raw32.length,
    varint: varint.length,
    blackjack_bytes: bj.length,
    blackjack_bits: bjAdaptiveBits,
    blackjack_ratio_vs_raw: (bj.length/raw32.length).toFixed(3),
    gzip_raw: gzRaw.length,
    gzip_varint: gzVarint.length,
    brotli_raw: brotliRaw.length,
    deflate_raw: deflateRaw.length,
  };
  return res;
}

function makeWalk(n, step){ let a=[0]; for(let i=1;i<n;i++) a.push(a[i-1]+ (Math.floor(Math.random()*(2*step+1))-step)); return a; }

const corpora = {
  'zeros_1k': Array(1000).fill(0),
  'ramp_1k': Array.from({length:1000}, (_,i)=>i),
  'random_walk_10k_s1': makeWalk(10000,1),
  'random_walk_10k_s5': makeWalk(10000,5),
  'rle_1k': Array.from({length:1000}, ()=> Math.random()<0.8? 100 : 101),
  'blackjack_cards_1k': Array.from({length:1000}, ()=> Math.floor(Math.random()*11)+1),
  'sorted_set_1k': Array.from({length:1000}, (_,i)=> i*3 + Math.floor(Math.random()*2)), // increasing
  'triangular_1k': Array.from({length:1000}, (_,i)=> Math.floor(i*(i+1)/2)),
};

let out=[];
for(const [k,v] of Object.entries(corpora)){
  out.push(benchCorpus(k,v));
}
console.log(JSON.stringify(out,null,2));
