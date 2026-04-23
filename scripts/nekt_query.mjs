const KEY = 'X1vqAEeldHNdUXfTpsDwWb0OS8FBZ1EhmIHRsJrcujaE2zHQa0eZlKH540YPGiGe7LvKByQFDIIoRUSmgBp9e39Z6Jfry1lemdd8pBTfCFSV3HKRGHR5o3Kx16V5Vrk7DySMaq06gI1o9c9m7QaKYe3SxdKFPLQkjeCimIZTSjgBE7kCXkEyXXnQVF1iVfxqkjgzHAXd83GcPQeVDOyXDmKW9TOcs10FBjk9BzqMCnMfiZBGSZYR20EBCZIRLWWh';
const sql = process.argv[2];
const r = await fetch('https://api.nekt.ai/api/v1/sql-query/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': KEY }, body: JSON.stringify({ sql, mode: 'csv' }) });
const j = await r.json();
const url = (j.presigned_urls && j.presigned_urls[0]) || j.presigned_url;
if (!url) { console.error('no url', j); process.exit(1); }
const csv = await fetch(url).then(x => x.text());
console.log(csv);
