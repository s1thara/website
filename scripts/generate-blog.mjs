import fs from 'node:fs/promises';

const DATA = 'data/blogs.json';
const companies = [
  {name:'Reliance Industries', symbol:'RELIANCE.NS', wiki:'Reliance_Industries', official:'https://www.ril.com/'},
  {name:'Tata Consultancy Services', symbol:'TCS.NS', wiki:'Tata_Consultancy_Services', official:'https://www.tcs.com/'},
  {name:'HDFC Bank', symbol:'HDFCBANK.NS', wiki:'HDFC_Bank', official:'https://www.hdfc.bank.in/'},
  {name:'Bharti Airtel', symbol:'BHARTIARTL.NS', wiki:'Bharti_Airtel', official:'https://www.airtel.in/'},
  {name:'ICICI Bank', symbol:'ICICIBANK.NS', wiki:'ICICI_Bank', official:'https://www.icicibank.com/'}
];

const today = new Date().toISOString().slice(0,10);
const data = JSON.parse(await fs.readFile(DATA,'utf8'));
const previousDates = data.articles.map(a=>a.date).filter(Boolean).sort().reverse();
const nextIndex = previousDates.length % companies.length;
const company = companies[nextIndex];

async function getJson(url, options={}) {
  const r = await fetch(url, {headers:{'User-Agent':'sithara-portfolio-blog/1.0'}, ...options});
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

const wiki = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(company.wiki)}`);
const market = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(company.symbol)}?range=1y&interval=1d&events=history`);
const result = market.chart?.result?.[0];
const closes = result?.indicators?.quote?.[0]?.close || [];
const points = (result?.timestamp || []).map((t,i)=>({date:new Date(t*1000).toISOString().slice(0,10),price:closes[i]})).filter(x=>Number.isFinite(x.price));
const price = points.at(-1)?.price ?? null;
const first = points[0]?.price ?? null;
const change1y = price && first ? ((price-first)/first)*100 : null;

let images=[];
try {
  const commons = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(company.name)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url&format=json`);
  images = Object.values(commons.query?.pages || {}).map(p=>({url:p.imageinfo?.[0]?.url,alt:company.name,caption:p.title?.replace(/^File:/,'')})).filter(x=>x.url && /\.(jpg|jpeg|png|webp|svg)$/i.test(x.url)).slice(0,3);
} catch {}
if (!images.length && wiki.originalimage?.source) images=[{url:wiki.originalimage.source,alt:company.name,caption:company.name}];

const prompt = `You are writing a high-quality finance publication for a B.Com Finance & Investment student's portfolio website. Create a factual company dossier about ${company.name}, an Indian listed company.

Use the supplied Wikipedia summary only as background and do not invent facts. Explain the company's history chronologically, how it became a major business, business model and segments, competitive position, important strategic milestones, leadership/context where reliably known, and an investor-oriented explanation of what drives the stock. Make it readable like a magazine feature, not a Wikipedia dump.

IMPORTANT: Do not invent current revenue, profit, market-cap, valuation, targets, analyst ratings or other numerical financial figures. The only current market number supplied is the live-ish price below. Discuss financial concepts qualitatively unless the source text provides a number.

Return ONLY valid JSON with exactly these keys:
{
  "deck": "2 sentence hook",
  "keyFacts": [{"label":"FOUNDED","value":"..."},{"label":"FOUNDER","value":"..."},{"label":"HQ","value":"..."},{"label":"CORE AREAS","value":"..."}],
  "sections": [
    {"heading":"THE BEGINNING","body":"2-4 paragraphs separated by blank lines"},
    {"heading":"THE TRANSFORMATION","body":"2-4 paragraphs"},
    {"heading":"HOW THE BUSINESS WORKS","body":"2-4 paragraphs"},
    {"heading":"WHAT MOVES THE STOCK","body":"2-4 paragraphs"},
    {"heading":"WHY IT MATTERS","body":"1-3 paragraphs giving an analytical takeaway, not a buy/sell recommendation"}
  ]
}

Company: ${company.name}
Wikipedia summary: ${wiki.extract || ''}
Current symbol: ${company.symbol}
Current price snapshot: ${price ?? 'unavailable'} INR
Approx 1-year change from supplied daily data: ${change1y == null ? 'unavailable' : change1y.toFixed(2)+'%'}
`;

const ai = await getJson('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent', {
  method:'POST',
  headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},
  body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.35}})
});
const raw = ai.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
const clean = raw.replace(/^```json\s*/i,'').replace(/```$/,'').trim();
const article = JSON.parse(clean);

const finalArticle = {
  slug: company.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),
  company: company.name,
  symbol: company.symbol,
  edition: `DAILY DOSSIER ${String(companies.findIndex(c=>c.symbol===company.symbol)+1).padStart(2,'0')}`,
  date: today,
  deck: article.deck,
  price,
  priceDate: today,
  oneYearChange: change1y,
  heroImage: images[0]?.url || wiki.originalimage?.source || '',
  images,
  keyFacts: article.keyFacts,
  sections: article.sections,
  sources: [
    {label:'Official company site',url:company.official},
    {label:'Wikipedia company history',url:`https://en.wikipedia.org/wiki/${company.wiki}`},
    {label:'NSE India',url:`https://www.nseindia.com/get-quotes/equity?symbol=${company.symbol.replace('.NS','')}`}
  ]
};

data.articles = [finalArticle, ...data.articles.filter(a=>a.company!==company.name)].slice(0,30);
await fs.writeFile(DATA, JSON.stringify(data,null,2)+'\n');
console.log(`Generated ${company.name} for ${today}`);
