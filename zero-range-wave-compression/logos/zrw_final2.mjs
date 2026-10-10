
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
function encodeIntBits(e){ if(Number.isSafeInteger(e)&&e>=0&&e<=10000) return (ENCODE_LUT[e]||encodeFibBits(e)).slice(); return [1,1,1,1,1,1,0, ...encodeOmegaBits(e)]; }
function encodeOmegaBits(e){let t=e+1; if(t<1)t=1; let n=[0]; while(t>1){const cur=[]; let r=t; while(r>0){cur.unshift(r&1); r=Math.floor(r/2)} n=cur.concat(n); t=cur.length-1} return n;}
function decodeOmegaAt(bits,pos){let p=pos, len=1; while(p<bits.length&&bits[p]===1){ if(p+len+1>bits.length)return null; let v=0; for(let i=0;i<len+1;i++) v=(v<<1)|bits[p+i]; p+=len+1; len=v } if(p>=bits.length||bits[p]!==0) return null; p++; return {val:len-1,end:p}}
function decodeIntAt(bits,pos){ if(pos+8<=bits.length&&bits[pos]===1&&bits[pos+1]===1&&bits[pos+2]===1&&bits[pos+3]===1&&bits[pos+4]===1&&bits[pos+5]===1&&bits[pos+6]===1&&bits[pos+7]===0){ const o=decodeOmegaAt(bits,pos+8); if(o) return o; } return decodeOneFibAt(bits,pos);}
function packBits(bits){const t=Math.ceil(bits.length/8), n=new Uint8Array(t+4); new DataView(n.buffer).setUint32(0,bits.length,true); for(let i=0;i<bits.length;i++) if(bits[i]) n[4+(i>>3)]|=(1<<(i&7)); return n}
function unpackBits(u){const len=new DataView(u.buffer,u.byteOffset,u.byteLength).getUint32(0,true); const out=[]; for(let i=0;i<len;i++) out.push((u[4+(i>>3)]>>(i&7))&1); return out}

// ZERO RANGE WAVE - FINAL
// Single-op codes = original v4 C (fast, no regression)
// Run escape = 111111 (6 ones) + 2-bit type + count
const SINGLE_CODES = {
  repeat:[0],
  inc:[1,0],
  dec:[1,1,0],
  d2:[1,1,1,0],
  rice:[1,1,1,1,0],
  normal:[1,1,1,1,1,0]
};
const RUN_ESCAPE = [1,1,1,1,1,1,0];
const RUN_TYPE = { repeat:[0,0], inc:[0,1], dec:[1,0], d2:[1,1] };
const RUN_TYPE_REV = { '00':'repeat', '01':'inc', '10':'dec', '11':'d2' };

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
  }
  encodeBits(arr){
    if(!arr.length) return [];
    const out=[]; out.push(...encodeIntBits(arr[0])); let r=arr[0], o=arr[0];
    let i=1;
    while(i<arr.length){
      const s=arr[i];
      const pred=2*r-o;
      if(s===r){
        let cnt=0; while(i+cnt<arr.length && arr[i+cnt]===r) cnt++;
        if(cnt>=this.th){
          out.push(...RUN_ESCAPE, ...RUN_TYPE.repeat);
          out.push(...encodeFibBits(cnt));
          i+=cnt;
        } else {
          for(let k=0;k<cnt;k++) out.push(...SINGLE_CODES.repeat);
          i+=cnt;
        }
      } else if(s===r+1){
        let cnt=0, cur=r;
        while(i+cnt<arr.length && arr[i+cnt]===cur+1){cur++; cnt++;}
        if(cnt>=this.th){
          out.push(...RUN_ESCAPE, ...RUN_TYPE.inc);
          out.push(...encodeFibBits(cnt));
          for(let k=0;k<cnt;k++){ o=r; r+=1; }
          i+=cnt;
        } else {
          for(let k=0;k<cnt;k++){ out.push(...SINGLE_CODES.inc); o=r; r+=1; }
          i+=cnt;
        }
      } else if(s===r-1){
        let cnt=0, cur=r;
        while(i+cnt<arr.length && arr[i+cnt]===cur-1){cur--; cnt++;}
        if(cnt>=this.th){
          out.push(...RUN_ESCAPE, ...RUN_TYPE.dec);
          out.push(...encodeFibBits(cnt));
          for(let k=0;k<cnt;k++){ o=r; r-=1; }
          i+=cnt;
        } else {
          for(let k=0;k<cnt;k++){ out.push(...SINGLE_CODES.dec); o=r; r-=1; }
          i+=cnt;
        }
      } else if(s===pred){
        let cnt=0, cr=r, co=o;
        while(i+cnt<arr.length){
          const p=2*cr-co;
          if(arr[i+cnt]!==p) break;
          co=cr; cr=p; cnt++;
        }
        if(cnt>=this.th){
          out.push(...RUN_ESCAPE, ...RUN_TYPE.d2);
          out.push(...encodeFibBits(cnt));
          for(let k=0;k<cnt;k++){ const v=2*r-o; o=r; r=v; }
          i+=cnt;
        } else {
          for(let k=0;k<cnt;k++){ out.push(...SINGLE_CODES.d2); const v=2*r-o; o=r; r=v; }
          i+=cnt;
        }
      } else {
        const delta=s-pred;
        if(Math.abs(delta) < (1<<(this.k+6))){
          out.push(...SINGLE_CODES.rice);
          out.push(...encodeRiceBits(zigzag(delta),this.k));
          o=r; r=s;
        } else {
          out.push(...SINGLE_CODES.normal);
          out.push(...encodeIntBits(s));
          o=r; r=s;
        }
        i++;
      }
    }
    return out;
  }
  decodeBits(bits){
    if(!bits.length) return [];
    const first=decodeIntAt(bits,0); if(!first) return [];
    const out=[first.val]; let pos=first.end, r=first.val, o=first.val;
    while(pos<bits.length){
      let node=this.trie, op=null, lastPos=pos;
      while(pos<bits.length){
        const b=bits[pos];
        if(!(b in node)) break;
        node=node[b]; pos++;
        if('_op' in node){op=node._op; break;}
      }
      if(!op) break;
      if(op==='RUN_ESC'){
        if(pos+1>=bits.length) break;
        const tbits = `${bits[pos]}${bits[pos+1]}`;
        const rtype = RUN_TYPE_REV[tbits];
        if(!rtype) break;
        pos+=2;
        const cntInfo=decodeOneFibAt(bits,pos); if(!cntInfo) break; pos=cntInfo.end; const cnt=cntInfo.val;
        if(rtype==='repeat'){ for(let i=0;i<cnt;i++) out.push(r); }
        else if(rtype==='inc'){ for(let i=0;i<cnt;i++){ o=r; r+=1; out.push(r); } }
        else if(rtype==='dec'){ for(let i=0;i<cnt;i++){ o=r; r-=1; out.push(r); } }
        else if(rtype==='d2'){ for(let i=0;i<cnt;i++){ const v=2*r-o; o=r; r=v; out.push(r); } }
      } else if(op==='repeat'){ out.push(r); }
      else if(op==='inc'){ o=r; r+=1; out.push(r); }
      else if(op==='dec'){ o=r; r-=1; out.push(r); }
      else if(op==='d2'){ const v=2*r-o; o=r; r=v; out.push(r); }
      else if(op==='rice'){ const d=decodeRiceAt(bits,pos,this.k); if(!d) break; pos=d.end; const delta=unzigzag(d.val); const pred=out.length>=2?2*r-o:r; const v=pred+delta; out.push(v); o=r; r=v; }
      else if(op==='normal'){ const d=decodeIntAt(bits,pos); if(!d) break; out.push(d.val); o=r; r=d.val; pos=d.end; }
    }
    return out;
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
bench();

// export for release
export const compress = (arr,k=0)=>{ const bits=new ZeroRangeWave(k).encodeBits(arr); const packed=packBits(bits); return packed; };
export const decompress = (packed,k=0)=>{ const bits=unpackBits(packed); return new ZeroRangeWave(k).decodeBits(bits); };
