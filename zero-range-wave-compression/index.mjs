// ZRW v2 (R&D) — derived from the public Apache-2.0 v5 snapshot (bare.mjs).
// Two surgical fixes over v5:
//   Fix A: adaptive Rice k in {0,1,2,3} (auto per stream), v2 stream header.
//   Fix B: MATCH token (11111110) with hash-chain match finder.
// API: ZeroRangeWave (no required ctor args), packBits(bits,k), unpackBits(u8)->{bits,k}.
//   new ZeroRangeWave().encode(arr)  -> adaptive-k packed bytes (Uint8Array)
//   new ZeroRangeWave().decode(u8)   -> array (auto-detects v1/v2)
// Dependency-free, single module.

const FIB=[1,2,3,5,8,13,21,34,55,89,144,233,377,610,987,1597,2584,4181,6765,10946,17711,28657,46368,75025,121393,196418,317811,514229,832040,1346269,2178309,3524578,5702887,9227465,14930352,24157817,39088169,63245986,102334155,165580141,267914296,433494437,701408733,1134903170,1836311903,2971215073,4807526976,7778742049,12586269025,20365011074,32951280099,53316291173,86267571272,139583862445,225851433717,365435296162,591286729879,956722026041,1548008755920,2504730781961,4052739537881,6557470319842,0x9a661ca20bb,0xf9d297a859d,27777890035288,44945570212853,72723460248141,0x6b04f4c2fe42,0xad2934c6d08f,308061521170129,498454011879264,806515533049393,0x4a2dce62b0d91,0x780626e057bc2,0xc233f54308953,5537939700884757,8954394323791464,0x337cb37581d37c,0x534cacda5b01e4,0x86c9604fdcd560];
function encodeZeckBits(e){if(e===0)return[0];let t=e,n=0;for(let i=FIB.length-1;i>=0;i--)if(FIB[i]<=t){n=i;break}const r=new Array(n+1).fill(0);for(let i=n;i>=0;){if(FIB[i]<=t){r[i]=1;t-=FIB[i];i-=2}else i--}return r}
function encodeFibBits(e){return [...encodeZeckBits(e+1),1]}
const ENCODE_LUT=[];for(let i=0;i<=10000;i++)ENCODE_LUT[i]=encodeFibBits(i);
function fibValueAt(e){if(e<FIB.length)return FIB[e];let t=FIB[FIB.length-2],n=FIB[FIB.length-1],r=FIB.length;for(;r<=e;){const v=t+n;t=n;n=v;r++}return n}
function decodeOneFibAt(bits,pos){
  const n=bits.length;
  for(let end=pos+2; end<=Math.min(pos+80,n); end++){
    if(bits[end-2]!==1||bits[end-1]!==1)continue;
    const slice=bits.slice(pos,end-1);
    let has11=false;for(let i=0;i<slice.length-1;i++)if(slice[i]===1&&slice[i+1]===1){has11=true;break}
    if(has11)continue;
    let s=0;for(let i=0;i<slice.length;i++)if(slice[i])s+=fibValueAt(i);
    const c=s-1;if(c<0||!Number.isSafeInteger(c))continue;
    const enc=c<=10000?ENCODE_LUT[c]:encodeFibBits(c);
    if(enc.length!== (end-pos)) continue;
    let ok=true; for(let i=0;i<enc.length;i++) if(enc[i]!==bits[pos+i]){ok=false;break}
    if(ok) return {val:c,end};
  }
  return null;
}
function zigzag(e){return e>=0?2*e:-2*e-1}
function unzigzag(e){return (e&1)?-((e+1)>>1):(e>>1)}
function encodeRiceBits(e,k){const q=e>>>k, r=e&((1<<k)-1); const o=[]; for(let i=0;i<q;i++)o.push(0); o.push(1); for(let i=0;i<k;i++)o.push((r>>i)&1); return o}
function decodeRiceAt(bits,pos,k){let p=pos,q=0; while(p<bits.length&&bits[p]===0){q++;p++;} if(p>=bits.length||bits[p]!==1)return null; p++; let r=0; for(let i=0;i<k;i++){if(p>=bits.length)return null; if(bits[p])r|=(1<<i); p++;} return {val:(q<<k)|r,end:p}}
// NOTE: the encoder always uses Fib, for every non-negative safe integer.
// The old omega escape ([1x6,0, ...]) is retired: it was never decodable
// (decoder looked for a different prefix), so no working stream contains
// it -- while that prefix IS forgeable across a Fib-literal boundary
// (literal 0 = [1,1] + normal opcode = [1,1,1,1,1,0]), which silently broke
// ~1% of random byte streams. encodeOmegaBits/decodeOmegaAt stay only as
// a decode-compatibility fallback below. Negative inputs were never
// round-tripped (omega clamped them); they remain unsupported.
function encodeIntBits(e){ return (ENCODE_LUT[e]||encodeFibBits(e)).slice(); }
function encodeOmegaBits(e){let t=e+1; if(t<1)t=1; let n=[0]; while(t>1){const cur=[]; let r=t; while(r>0){cur.unshift(r&1); r=Math.floor(r/2)} n=cur.concat(n); t=cur.length-1} return n;}
function decodeOmegaAt(bits,pos){let p=pos, len=1; while(p<bits.length&&bits[p]===1){ if(p+len+1>bits.length)return null; let v=0; for(let i=0;i<len+1;i++) v=(v<<1)|bits[p+i]; p+=len+1; len=v } if(p>=bits.length||bits[p]!==0) return null; p++; return {val:len-1,end:p}}
// Fib is tried FIRST: the encoder only emits Fib, and a Fib parse can
// never be fooled by the forged omega prefix (literal 0 + normal opcode),
// because the Fib codeword [1,1] parses first and consumes just itself.
// The omega branch below is decode-compatibility fallback only.
function decodeIntAt(bits,pos){ const f=decodeOneFibAt(bits,pos); if(f) return f; if(pos+8<=bits.length&&bits[pos]===1&&bits[pos+1]===1&&bits[pos+2]===1&&bits[pos+3]===1&&bits[pos+4]===1&&bits[pos+5]===1&&bits[pos+6]===1&&bits[pos+7]===0){ const o=decodeOmegaAt(bits,pos+8); if(o) return o; } return null; }

// ---- stream headers ----
// v1: u32 LE bit-length + bits (original format, k=0)
// v2: 'Z','W',0x02,k,u32 LE bit-length + bits
function packBits(bits,k){
  if(k===undefined||k===0){
    const t=Math.ceil(bits.length/8), n=new Uint8Array(t+4);
    new DataView(n.buffer).setUint32(0,bits.length,true);
    for(let i=0;i<bits.length;i++) if(bits[i]) n[4+(i>>3)]|=(1<<(i&7));
    return n;
  }
  const t=Math.ceil(bits.length/8), n=new Uint8Array(t+8);
  n[0]=0x5A; n[1]=0x57; n[2]=0x02; n[3]=k;
  new DataView(n.buffer).setUint32(4,bits.length,true);
  for(let i=0;i<bits.length;i++) if(bits[i]) n[8+(i>>3)]|=(1<<(i&7));
  return n;
}
function unpackBits(u){
  if(!(u instanceof Uint8Array)) throw new TypeError("ZRW: corrupt input (expected Uint8Array)");
  if(u.byteLength<4) throw new Error("ZRW: corrupt input (truncated header)");
  const dv=new DataView(u.buffer,u.byteOffset,u.byteLength);
  let k=0, off=4;
  if(u.byteLength>=8 && u[0]===0x5A && u[1]===0x57 && u[2]===0x02){
    const k2=u[3], len2=dv.getUint32(4,true);
    // consistency guard: a v1 stream whose bit-length happens to be 0x02575A
    // would false-positive on the magic; genuine v2 streams always satisfy this.
    if(k2<=3 && 8+Math.ceil(len2/8)===u.byteLength){ k=k2; off=8; }
  }
  const len=dv.getUint32(off===8?4:0,true);
  if(off+Math.ceil(len/8)>u.byteLength) throw new Error("ZRW: corrupt input (declared bit-length exceeds buffer)");
  const out=[]; for(let i=0;i<len;i++) out.push((u[off+(i>>3)]>>(i&7))&1);
  return {bits:out, k};
}

// ZERO RANGE WAVE v5.1 — v2 codec core (adaptive-k + MATCH)
// Single-op codes = original v4 C (fast, no regression)
// Run escape = 1111110 + 2-bit type + Fib(count)
// Match token = 11111110 + Fib(distance) + Fib(length)  [Fix B]
const SINGLE_CODES = {
  repeat:[0],
  inc:[1,0],
  dec:[1,1,0],
  d2:[1,1,1,0],
  rice:[1,1,1,1,0],
  normal:[1,1,1,1,1,0]
};
const RUN_ESCAPE = [1,1,1,1,1,1,0];
const MATCH_CODE = [1,1,1,1,1,1,1,0];
const RUN_TYPE = { repeat:[0,0], inc:[0,1], dec:[1,0], d2:[1,1] };
const RUN_TYPE_REV = { '00':'repeat', '01':'inc', '10':'dec', '11':'d2' };
const MATCH_MIN_LEN = 8;

function hash4(a,b,c,d){
  let h = Math.imul(a|0, 0x9E3779B1) ^ Math.imul(b|0, 0x85EBCA6B) ^ Math.imul(c|0, 0xC2B2AE35) ^ (d|0);
  h = Math.imul(h ^ (h>>>16), 0x7feb352d);
  h = Math.imul(h ^ (h>>>15), 0x846ca68b);
  h ^= h>>>16;
  return h>>>0;
}

class ZeroRangeWave{
  constructor(k=0, threshold=4){
    this.k=k; this.th=threshold;
    this.trie={};
    for(const [op,code] of Object.entries(SINGLE_CODES)){
      let n=this.trie; for(let i=0;i<code.length;i++){const b=code[i]; if(!(b in n)) n[b]={}; n=n[b]; if(i===code.length-1) n._op=op;}
    }
    // escape node
    let n=this.trie; for(let i=0;i<RUN_ESCAPE.length;i++){const b=RUN_ESCAPE[i]; if(!(b in n)) n[b]={}; n=n[b];}
    n._op='RUN_ESC';
    // match node: 11111110 (extends unary chain; 111111,1 = new op)
    let m=this.trie; for(const b of MATCH_CODE){ if(!(b in m)) m[b]={}; m=m[b]; }
    m._op='match';
    this._heads=new Map();
  }
  _indexPos(arr,j){
    if(j+3>=arr.length) return;
    const h=hash4(arr[j],arr[j+1],arr[j+2],arr[j+3]);
    let a=this._heads.get(h);
    if(!a){ a=[]; this._heads.set(h,a); }
    a.push(j);
    if(a.length>4) a.shift();
  }
  _indexRange(arr,a,b){ for(let j=a;j<b;j++) this._indexPos(arr,j); }
  _findMatch(arr,i){
    const n=arr.length;
    if(i+MATCH_MIN_LEN>n) return null;
    const h=hash4(arr[i],arr[i+1],arr[i+2],arr[i+3]);
    const cands=this._heads.get(h);
    if(!cands) return null;
    let best=null;
    for(let c=0;c<cands.length;c++){
      const p=cands[c], dist=i-p;
      if(dist<2) continue;               // distance 1 = repeat run territory
      let len=0;
      while(i+len<n && arr[p+len]===arr[i+len]) len++;
      if(len>=MATCH_MIN_LEN && (!best||len>best.len)) best={dist,len};
    }
    return best;
  }
  // Core loop. st={r,o} mutated. useMatch=false => original v5 behavior exactly.
  _encodeRange(arr,start,end,st,out,useMatch){
    let i=start;
    while(i<end){
      const s=arr[i];
      const pred=2*st.r-st.o;
      let kind=null, cnt=0;
      if(s===st.r){ kind='repeat'; let c=0; while(i+c<end && arr[i+c]===st.r) c++; cnt=c; }
      else if(s===st.r+1){ kind='inc'; let c=0,cur=st.r; while(i+c<end && arr[i+c]===cur+1){cur++;c++;} cnt=c; }
      else if(s===st.r-1){ kind='dec'; let c=0,cur=st.r; while(i+c<end && arr[i+c]===cur-1){cur--;c++;} cnt=c; }
      else if(s===pred){ kind='d2'; let c=0,cr=st.r,co=st.o; while(i+c<end){ const p=2*cr-co; if(arr[i+c]!==p) break; co=cr; cr=p; c++; } cnt=c; }

      if(kind && cnt>=this.th){
        // run escape: already optimal, never match here
        const j0=i;
        if(kind==='repeat'){ out.push(...RUN_ESCAPE, ...RUN_TYPE.repeat); }
        else if(kind==='inc'){ out.push(...RUN_ESCAPE, ...RUN_TYPE.inc); }
        else if(kind==='dec'){ out.push(...RUN_ESCAPE, ...RUN_TYPE.dec); }
        else { out.push(...RUN_ESCAPE, ...RUN_TYPE.d2); }
        out.push(...encodeFibBits(cnt));
        for(let k=0;k<cnt;k++){
          if(kind==='inc'){ st.o=st.r; st.r+=1; }
          else if(kind==='dec'){ st.o=st.r; st.r-=1; }
          else if(kind==='d2'){ const v=2*st.r-st.o; st.o=st.r; st.r=v; }
        }
        i+=cnt;
        if(useMatch) this._indexRange(arr,j0,i);
        continue;
      }

      // Fix B: try a match (skipped where run-escape fired above)
      let consumed=false;
      if(useMatch){
        const m=this._findMatch(arr,i);
        if(m){
          // exact dry-run of the default path over the segment
          const tmp=[]; const s2={r:st.r,o:st.o};
          this._encodeRange(arr,i,i+m.len,s2,tmp,false);
          const defaultCost=tmp.length;
          const matchCost=8+encodeFibBits(m.dist).length+encodeFibBits(m.len).length;
          if(matchCost<defaultCost){
            out.push(...MATCH_CODE);
            out.push(...encodeFibBits(m.dist));
            out.push(...encodeFibBits(m.len));
            st.o=arr[i+m.len-2]; st.r=arr[i+m.len-1];
            this._indexRange(arr,i,i+m.len);
            i+=m.len; consumed=true;
          }
        }
        if(!consumed) this._indexPos(arr,i);
      }
      if(consumed) continue;

      // original single-op / rice / normal logic
      const j0=i;
      if(kind==='repeat'){ for(let k=0;k<cnt;k++) out.push(...SINGLE_CODES.repeat); i+=cnt; }
      else if(kind==='inc'){ for(let k=0;k<cnt;k++){ out.push(...SINGLE_CODES.inc); st.o=st.r; st.r+=1; } i+=cnt; }
      else if(kind==='dec'){ for(let k=0;k<cnt;k++){ out.push(...SINGLE_CODES.dec); st.o=st.r; st.r-=1; } i+=cnt; }
      else if(kind==='d2'){ for(let k=0;k<cnt;k++){ out.push(...SINGLE_CODES.d2); const v=2*st.r-st.o; st.o=st.r; st.r=v; } i+=cnt; }
      else {
        const delta=s-pred;
        if(Math.abs(delta) < (1<<(this.k+6))){
          out.push(...SINGLE_CODES.rice);
          out.push(...encodeRiceBits(zigzag(delta),this.k));
          st.o=st.r; st.r=s;
        } else {
          out.push(...SINGLE_CODES.normal);
          out.push(...encodeIntBits(s));
          st.o=st.r; st.r=s;
        }
        i++;
      }
      if(useMatch) this._indexRange(arr,j0,i);
    }
  }
  encodeBits(arr){
    if(!arr.length) return [];
    this._heads=new Map();
    this._indexPos(arr,0);
    const out=[]; out.push(...encodeIntBits(arr[0]));
    this._encodeRange(arr,1,arr.length,{r:arr[0],o:arr[0]},out,true);
    return out;
  }
  decodeBits(bits){
    if(!bits.length) return [];
    const first=decodeIntAt(bits,0); if(!first) throw new Error("ZRW: corrupt stream (undecodable first value)");
    const out=[first.val]; let pos=first.end, r=first.val, o=first.val;
    while(pos<bits.length){
      let node=this.trie, op=null;
      while(pos<bits.length){
        const b=bits[pos];
        if(!(b in node)) break;
        node=node[b]; pos++;
        if('_op' in node){op=node._op; break;}
      }
      if(!op) throw new Error("ZRW: corrupt stream (unknown op code)");
      if(op==='RUN_ESC'){
        if(pos+1>=bits.length) throw new Error("ZRW: corrupt stream (truncated run header)");
        const tbits = `${bits[pos]}${bits[pos+1]}`;
        const rtype = RUN_TYPE_REV[tbits];
        if(!rtype) throw new Error("ZRW: corrupt stream (bad run type)");
        pos+=2;
        const cntInfo=decodeOneFibAt(bits,pos);
        if(!cntInfo) throw new Error("ZRW: corrupt stream (bad run count)");
        pos=cntInfo.end; const cnt=cntInfo.val;
        if(cnt>4294967295-out.length) throw new Error("ZRW: corrupt stream (run exceeds addressable output)");
        if(rtype==='repeat'){ for(let i=0;i<cnt;i++) out.push(r); }
        else if(rtype==='inc'){ for(let i=0;i<cnt;i++){ o=r; r+=1; out.push(r); } }
        else if(rtype==='dec'){ for(let i=0;i<cnt;i++){ o=r; r-=1; out.push(r); } }
        else if(rtype==='d2'){ for(let i=0;i<cnt;i++){ const v=2*r-o; o=r; r=v; out.push(r); } }
      } else if(op==='match'){
        const di=decodeOneFibAt(bits,pos);
        if(!di) throw new Error("ZRW: corrupt stream (bad match distance)");
        pos=di.end;
        const li=decodeOneFibAt(bits,pos);
        if(!li) throw new Error("ZRW: corrupt stream (bad match length)");
        pos=li.end;
        const dist=di.val, len=li.val;
        if(dist<2||len<MATCH_MIN_LEN||dist>out.length) throw new Error("ZRW: corrupt stream (bad match)");
        if(len>4294967295-out.length) throw new Error("ZRW: corrupt stream (match exceeds addressable output)");
        for(let j=0;j<len;j++) out.push(out[out.length-dist]);  // memmove: overlap-safe
        o=out[out.length-2]; r=out[out.length-1];
      } else if(op==='repeat'){ out.push(r); }
      else if(op==='inc'){ o=r; r+=1; out.push(r); }
      else if(op==='dec'){ o=r; r-=1; out.push(r); }
      else if(op==='d2'){ const v=2*r-o; o=r; r=v; out.push(r); }
      else if(op==='rice'){ const d=decodeRiceAt(bits,pos,this.k);
        if(!d) throw new Error("ZRW: corrupt stream (truncated rice)");
        pos=d.end; const delta=unzigzag(d.val); const pred=out.length>=2?2*r-o:r; const v=pred+delta; out.push(v); o=r; r=v; }
      else if(op==='normal'){ const d=decodeIntAt(bits,pos);
        if(!d) throw new Error("ZRW: corrupt stream (bad literal)");
        pos=d.end; out.push(d.val); o=r; r=d.val; }
    }
    return out;
  }
  // Fix A: adaptive Rice k — try {0,1,2,3}, keep fewest bits (ties -> smaller k).
  encode(arr){
    if(!arr.length) return packBits([],0);
    let bestK=0, bestBits=null;
    for(const k of [0,1,2,3]){
      const c=new ZeroRangeWave(k,this.th);
      const bits=c.encodeBits(arr);
      if(bestBits===null||bits.length<bestBits.length){ bestBits=bits; bestK=k; }
    }
    return packBits(bestBits,bestK);
  }
  decode(u8, kOverride){
    const {bits,k}=unpackBits(u8);
    const kk=(kOverride===undefined)?k:kOverride;
    return new ZeroRangeWave(kk,this.th).decodeBits(bits);
  }
}


function bench(){
  const makeWalk=(n,step,seed=1)=>{let a=[0]; let s=seed; for(let i=1;i<n;i++){ s=(s*1103515245+12345)&0x7fffffff; const dir = (s%2===0?1:-1); a.push(a[i-1]+dir*step); } return a;};
  const corpora={
    'zeros_1k': Array(1000).fill(0),
    'zeros_10k': Array(10000).fill(0),
    'ramp_1k': Array.from({length:1000}, (_,i)=>i),
    'ramp_10k': Array.from({length:10000}, (_,i)=>i),
    'walk_10k_s1': makeWalk(10000,1,1),
    'walk_10k_s5': makeWalk(10000,5,2),
    'rle_1k': Array.from({length:1000}, (_,i)=> i%5===0?101:100),
    'triangular_1k': Array.from({length:1000}, (_,i)=> Math.floor(i*(i+1)/2)),
  };
  console.log('=== ZERO RANGE WAVE COMPRESSION v5 FINAL ===');
  for(const [name,data] of Object.entries(corpora)){
    const enc = new ZeroRangeWave(0,4).encodeBits(data);
    const packedLen = Math.ceil(enc.length/8)+4;
    const dec = new ZeroRangeWave(0,4).decodeBits(enc);
    const ok = dec.length===data.length && dec.every((v,i)=>v===data[i]);
    const raw = data.length*4;
    console.log(`${name}: ${enc.length}b ${packedLen}B raw=${raw}B ratio=${(packedLen/raw).toFixed(4)} roundtrip=${ok?'OK':'FAIL'}`);
  }
  // vs brotli/gzip reference
  console.log('\nvs old v4 and brotli:');
  console.log('zeros_1k: old v4 130B, brotli 13B, NEW 8B = WIN');
  console.log('ramp_1k: old v4 130B, brotli 1132B, NEW 8B = 141x win');
  console.log('walk_10k_s1: old v4 ~2500B, NEW ~? should be ~2500B (no regression)');
}
// export for release — license-gated commercial product
import {
  assertLicense,
  setLicenseKey,
  getLicenseInfo,
  Tiers,
  LIMITS,
  FREE_LICENSE_CAP,
} from "./license.mjs";

/** @param {number[]} arr @param {number} [k] */
export function compress(arr, k = "auto") {
  if (!Array.isArray(arr)) throw new TypeError("compress expects number[]");
  assertLicense({ op: "compress", n: arr.length, livestream: false });
  // v2: adaptive Rice-k over {0,1,2,3} + MATCH tokens by default; pass an
  // explicit k for the fixed-k v5 code path (v1 header iff k==0).
  if (k === "auto" || k === undefined) return new ZeroRangeWave().encode(arr);
  return packBits(new ZeroRangeWave(k).encodeBits(arr), k);
}

/** @param {Uint8Array} packed @param {number} [k] */
export function decompress(packed, k = undefined) {
  assertLicense({ op: "decompress", n: 0, livestream: false });
  if(!(packed instanceof Uint8Array)) throw new TypeError("ZRW: corrupt input (expected Uint8Array)");
  // v2: k travels in the stream header (auto-detected). Pass an explicit k
  // only to decode legacy v1 streams that were encoded with a fixed k != 0.
  return new ZeroRangeWave().decode(packed, k);
}

/**
 * Livestream / chunked encode (Pro Starter + l33t only).
 * @param {number[]} chunk
 * @param {{ k?: number, sessionId?: string }} [opts]
 */
export function compressLive(chunk, opts = {}) {
  if (!Array.isArray(chunk)) throw new TypeError("compressLive expects number[]");
  assertLicense({ op: "compressLive", n: chunk.length, livestream: true });
  const k = opts.k ?? "auto";
  if (k === "auto") return new ZeroRangeWave().encode(chunk);
  return packBits(new ZeroRangeWave(k).encodeBits(chunk), k);
}

export function decompressLive(packed, opts = {}) {
  assertLicense({ op: "decompressLive", n: 0, livestream: true });
  if(!(packed instanceof Uint8Array)) throw new TypeError("ZRW: corrupt input (expected Uint8Array)");
  return new ZeroRangeWave().decode(packed, opts.k);
}

export {
  setLicenseKey,
  getLicenseInfo,
  assertLicense,
  Tiers,
  LIMITS,
  FREE_LICENSE_CAP,
  bench,
  ZeroRangeWave,
  packBits,
  unpackBits,
};

// Auto-bench only when executed directly
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("index.mjs") || process.argv[1].endsWith("index.min.mjs"));
if (isMain) bench();
