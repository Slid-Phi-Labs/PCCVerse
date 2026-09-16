#!/bin/bash
# Summarize held-out results into a comparison table.
S=~/workspace/pccx-handlers/results/SUMMARY.txt
python3 - "$S" << 'EOF'
import sys, re
rows = {}
for line in open(sys.argv[1]):
    m = re.match(r'(\S+) (stock|new) raw=(\d+) packed=(\S+) op=(\S+) exit=(\S+) secs=(\d+) verify=(\S+)', line.strip())
    if not m: continue
    f, tag, raw, packed, op, ec, secs, vrt = m.groups()
    rows.setdefault(f, {})[tag] = (raw, packed, op, ec, secs, vrt)
opname = {'0':'Zero','1':'Match','2':'Bwt','3':'Store','12':'Aware','13':'Sao','14':'Delt16','?':'?'}
print(f"{'file':<9}{'raw':>11}{'stock':>11}{'op':>7}{'new':>11}{'op':>7}{'delta':>10}  verify")
ts = tn = 0
for f in ['dickens','ooffice','samba','xml','mozilla','mr','nci','osdb','reymont','sao','webster','x-ray']:
    r = rows.get(f, {})
    s = r.get('stock'); n = r.get('new')
    if not s or not n:
        print(f"{f:<9} MISSING"); continue
    sraw, spack, sop, sec, ssecs, svrt = s
    nraw, npack, nop, nec, nsecs, nvrt = n
    try: sd = int(spack); ts += sd; ss = f"{sd:,}"
    except: ss = spack
    try: nd = int(npack); tn += nd; ns = f"{nd:,}"
    except: ns = npack
    try: d = f"{nd-sd:+,}"
    except: d = "n/a"
    print(f"{f:<9}{int(sraw):>11,}{ss:>11}{opname.get(sop,sop):>7}{ns:>11}{opname.get(nop,nop):>7}{d:>10}  {svrt}/{nvrt}")
print(f"{'TOTAL':<9}{'':>11}{ts:>11,}{'':>7}{tn:>11,}{'':>7}{tn-ts:+,}")
EOF
