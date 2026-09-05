module.exports = async (req, res) => {
  const symbol = String(req.query.symbol || 'RELIANCE.NS');
  const range = req.query.range === '1y' ? '1y' : '1d';
  if (!/^[A-Z0-9._-]+$/.test(symbol)) return res.status(400).json({error:'Invalid symbol'});
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=history`;
    const r = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0'}});
    if (!r.ok) throw new Error(`Market data HTTP ${r.status}`);
    const j = await r.json();
    const result = j.chart?.result?.[0];
    if (!result) throw new Error('No market data');
    const q = result.indicators?.quote?.[0] || {};
    const timestamps = result.timestamp || [];
    const closes = q.close || [];
    const points = timestamps.map((t,i)=>({date:new Date(t*1000).toISOString().slice(0,10),price:closes[i]})).filter(x=>Number.isFinite(x.price));
    const price = points.at(-1)?.price ?? null;
    const first = points[0]?.price ?? null;
    const change1y = price && first ? ((price-first)/first)*100 : null;
    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({symbol,price,change1y,points});
  } catch (e) {
    return res.status(502).json({error:'Market data unavailable'});
  }
};
