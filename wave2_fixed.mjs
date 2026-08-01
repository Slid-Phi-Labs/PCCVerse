
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
function encodeOmegaBits(e){let t=e+1; if(t<1)t=1; let n=[0]; while(t>1){const cur=[]; let r=t; while(r>0){cur.unshift(r&1); r=Math.floor(r/2)} n=cur.concat(n); t=cur.length-1} return n}
function decodeOmegaAt(bits,pos){let p=pos, len=1; while(p<bits.length&&bits[p]===1){ if(p+len+1>bits.length)return null; let v=0; for(let i=0;i<len+1;i++) v=(v<<1)|bits[p+i]; p+=len+1; len=v } if(p>=bits.length||bits[p]!==0) return null; p++; return {val:len-1,end:p}}
function encodeIntBits(e){ if(Number.isSafeInteger(e)&&e>=0&&e<=10000) return (ENCODE_LUT[e]||encodeFibBits(e)).slice(); return [1,1,1,1,1,1,0,...encodeOmegaBits(e)]}
function decodeIntAt(bits,pos){ if(pos+7<=bits.length&&bits[pos]===1&&bits[pos+1]===1&&bits[pos+2]===1&&bits[pos+3]===1&&bits[pos+4]===1&&bits[pos+5]===1&&bits[pos+6]===0){ const o=decodeOmegaAt(bits,pos+7); if(o) return o; } return decodeOneFibAt(bits,pos)}
function packBits(bits){const t=Math.ceil(bits.length/8), n=new Uint8Array(t+4); new DataView(n.buffer).setUint32(0,bits.length,true); for(let i=0;i<bits.length;i++) if(bits[i]) n[4+(i>>3)]|=(1<<(i&7)); return n}
function unpackBits(u){const len=new DataView(u.buffer,u.byteOffset,u.byteLength).getUint32(0,true); const out=[]; for(let i=0;i<len;i++) out.push((u[4+(i>>3)]>>(i&7))&1); return out}


const CODE_TABLES = {
  C:{repeat:[0],inc:[1,0],dec:[1,1,0],d2:[1,1,1,0],rice:[1,1,1,1,0],normal:[1,1,1,1,1,0], repeatRun:[1,1,1,1,1,1,0], incRun:[1,1,1,1,1,1,1,0], decRun:[1,1,1,1,1,1,1,1,0], d2Run:[1,1,1,1,1,1,1,1,1,0]},
  I:{inc:[0],repeat:[1,0],dec:[1,1,0],d2:[1,1,1,0],rice:[1,1,1,1,0],normal:[1,1,1,1,1,0], incRun:[1,1,1,1,1,1,0], repeatRun:[1,1,1,1,1,1,1,0], decRun:[1,1,1,1,1,1,1,1,0], d2Run:[1,1,1,1,1,1,1,1,1,0]},
  R:{rice:[0],repeat:[1,0],inc:[1,1,0],dec:[1,1,1,0],d2:[1,1,1,1,0],normal:[1,1,1,1,1,0], repeatRun:[1,1,1,1,1,1,0], incRun:[1,1,1,1,1,1,1,0], decRun:[1,1,1,1,1,1,1,1,0], d2Run:[1,1,1,1,1,1,1,1,1,0]},
};


class BlackjackWave2{
  constructor(variant='C',k=0, threshold=4){
    this.variant=variant; this.k=k; this.th=threshold;
    this.codes=CODE_TABLES[variant]||CODE_TABLES['C'];
    this.trie={}; for(const [op,code] of Object.entries(this.codes)){let n=this.trie; for(let i=0;i<code.length;i++){const b=code[i]; if(!(b in n)) n[b]={}; n=n[b]; if(i===code.length-1) n._op=op;}}
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
          out.push(...this.codes['repeatRun']);
          out.push(...encodeIntBits(cnt));
          i+=cnt;
        } else {
          for(let k=0;k<cnt;k++){ out.push(...this.codes['repeat']); }
          i+=cnt;
        }
        continue;
      } else if(s===r+1){
        let cnt=0; let cur=r;
        while(i+cnt<arr.length && arr[i+cnt]===cur+1){ cur++; cnt++; }
        if(cnt>=this.th){
          out.push(...this.codes['incRun']);
          out.push(...encodeIntBits(cnt));
          for(let k=0;k<cnt;k++){ o=r; r+=1; }
          i+=cnt;
        } else {
          for(let k=0;k<cnt;k++){ out.push(...this.codes['inc']); o=r; r+=1; }
          i+=cnt;
        }
        continue;
      } else if(s===r-1){
        let cnt=0; let cur=r;
        while(i+cnt<arr.length && arr[i+cnt]===cur-1){ cur--; cnt++; }
        if(cnt>=this.th){
          out.push(...this.codes['decRun']);
          out.push(...encodeIntBits(cnt));
          for(let k=0;k<cnt;k++){ o=r; r-=1; }
          i+=cnt;
        } else {
          for(let k=0;k<cnt;k++){ out.push(...this.codes['dec']); o=r; r-=1; }
          i+=cnt;
        }
        continue;
      } else if(s===pred){
        let cnt=0; let cr=r, co=o;
        while(i+cnt<arr.length){
          const p = 2*cr-co;
          if(arr[i+cnt]!==p) break;
          co=cr; cr=p; cnt++;
        }
        if(cnt>=this.th){
          out.push(...this.codes['d2Run']);
          out.push(...encodeIntBits(cnt));
          for(let k=0;k<cnt;k++){ const v=2*r-o; o=r; r=v; }
          i+=cnt;
        } else {
          for(let k=0;k<cnt;k++){ out.push(...this.codes['d2']); const v=2*r-o; o=r; r=v; }
          i+=cnt;
        }
        continue;
      } else {
        const delta=s-pred;
        const useRice = Math.abs(delta) < (1<<(this.k+6));
        if(useRice){
          out.push(...this.codes['rice']);
          out.push(...encodeRiceBits(zigzag(delta),this.k));
          o=r; r=s;
        } else {
          out.push(...this.codes['normal']);
          out.push(...encodeIntBits(s));
          o=r; r=s;
        }
        i++;
      }
    }
    return out;
  }
  decodeBits(bits){
    if(!bits.length) return []; const first=decodeIntAt(bits,0); if(!first) return []; const out=[first.val]; let pos=first.end, r=first.val, o=first.val;
    while(pos<bits.length){
      let node=this.trie, op=null;
      while(pos<bits.length){ const b=bits[pos]; if(!(b in node)) break; node=node[b]; pos++; if('_op' in node){op=node._op; break;} }
      if(!op) break;
      if(op==='repeat' || op==='inc' || op==='dec' || op==='d2'){
        if(op==='repeat'){ out.push(r); }
        else if(op==='inc'){ o=r; r+=1; out.push(r); }
        else if(op==='dec'){ o=r; r-=1; out.push(r); }
        else if(op==='d2'){ const v=2*r-o; o=r; r=v; out.push(r); }
      } else if(op==='repeatRun' || op==='incRun' || op==='decRun' || op==='d2Run'){
        const cntInfo=decodeIntAt(bits,pos); if(!cntInfo) break; pos=cntInfo.end; const cnt=cntInfo.val;
        if(op==='repeatRun'){ for(let i=0;i<cnt;i++) out.push(r); }
        else if(op==='incRun'){ for(let i=0;i<cnt;i++){ o=r; r+=1; out.push(r); } }
        else if(op==='decRun'){ for(let i=0;i<cnt;i++){ o=r; r-=1; out.push(r); } }
        else if(op==='d2Run'){ for(let i=0;i<cnt;i++){ const v=2*r-o; o=r; r=v; out.push(r); } }
      } else if(op==='rice'){ const d=decodeRiceAt(bits,pos,this.k); if(!d) break; pos=d.end; const delta=unzigzag(d.val); const pred=out.length>=2?2*r-o:r; const v=pred+delta; out.push(v); o=r; r=v; }
      else if(op==='normal'){ const d=decodeIntAt(bits,pos); if(!d) break; out.push(d.val); o=r; r=d.val; pos=d.end; }
    }
    return out;
  }
}

function testAll(){
  const makeWalk=(n,step)=>{let a=[0]; for(let i=1;i<n;i++) a.push(a[i-1]+ (Math.random()<0.5?step:-step)); return a;};
  const corpora={
    'zeros_1k': Array(1000).fill(0),
    'zeros_10k': Array(10000).fill(0),
    'ramp_1k': Array.from({length:1000}, (_,i)=>i),
    'ramp_10k': Array.from({length:10000}, (_,i)=>i),
    'walk_10k_s1': makeWalk(10000,1),
    'walk_10k_s5': makeWalk(10000,5),
    'rle_1k': Array.from({length:1000}, ()=> Math.random()<0.8?100:101),
    'triangular_1k': Array.from({length:1000}, (_,i)=> Math.floor(i*(i+1)/2)),
  };
  for(const [name,data] of Object.entries(corpora)){
    const waveC = new BlackjackWave2('C',0).encodeBits(data);
    const waveI = new BlackjackWave2('I',0).encodeBits(data);
    const waveR = new BlackjackWave2('R',1).encodeBits(data);
    let best=waveC; let bestVar='C';
    if(waveI.length<best.length){best=waveI; bestVar='I';}
    if(waveR.length<best.length){best=waveR; bestVar='R';}
    const packedLen = Math.ceil(best.length/8)+4;
    const dec = new BlackjackWave2(bestVar, bestVar==='R'?1:0).decodeBits(best);
    const ok = dec.length===data.length && dec.every((v,i)=>v===data[i]);
    console.log(`${name}: WAVE2 best=${bestVar} ${best.length}b ${packedLen}B roundtrip=${ok?'OK':'FAIL'} vs old C0 ~${name.includes('zeros')?'130B': name.includes('ramp')?'130B':'2500B'} vs brotli ${name.includes('zeros')?'13B': name.includes('ramp')?'1132B':''}`);
  }
}
testAll();
