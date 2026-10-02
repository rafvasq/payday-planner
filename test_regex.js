const regex = /-?\$?-?\s*\d+(?:,\d+)*(?:\.\d{2})?/g;
const msg = 'payment of **$1,348.96** is due. balance of **$1,572.43**, floor of $3,200 immediately';
const matches = msg.match(regex);
console.log('matches:', matches);
const unmatched = [];
const seen = new Set();
for (const m of matches) {
    if (!m.includes('$')) continue;
    if (seen.has(m)) continue;
    seen.add(m);
    const clean = m.replace(/[$\s-]/g, '').replace(/,/g, '');
    const valCents = Math.round(parseFloat(clean) * 100);
    unmatched.push({ m, valCents });
}
console.log(unmatched);
