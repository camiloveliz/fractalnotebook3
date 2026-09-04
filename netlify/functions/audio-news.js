
const FEEDS = [
  { source: 'Audio Música Digital', urls: ['https://www.audiomusicadigital.com/feed/'] },
  { source: 'Diffusion Magazine', urls: ['https://www.diffusionmagazine.com/index.php?format=feed&type=rss'] },
  { source: 'Revista de Acústica', urls: ['https://www.sea-acustica.es/feed/'] },
  { source: 'ISP Música', urls: [
      'https://www.ispmusica.com/?format=feed&type=rss',
      'https://www.ispmusica.com/index.php?format=feed&type=rss',
      'https://www.ispmusica.com/feed/'
    ] }
];

const decode = (s='') => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
  .replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;/g,' ')
  .replace(/&amp;/g,'&')
  .replace(/&quot;/g,'"')
  .replace(/&#39;|&apos;/g,"'")
  .replace(/&lt;/g,'<')
  .replace(/&gt;/g,'>')
  .replace(/\s+/g,' ')
  .trim();

const tag = (block,name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));
  return m ? decode(m[1]) : '';
};
const attrLink = (block) => {
  const m=block.match(/<link[^>]+href=["']([^"']+)["']/i);
  return m?m[1]:'';
};
function parseFeed(xml, source){
  const out=[];
  const rss=[...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]);
  const atom=[...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m=>m[0]);
  for(const b of [...rss,...atom]){
    const title=tag(b,'title');
    const link=tag(b,'link') || attrLink(b) || tag(b,'guid');
    const date=tag(b,'pubDate') || tag(b,'published') || tag(b,'updated') || tag(b,'dc:date');
    const description=tag(b,'description') || tag(b,'summary') || tag(b,'content:encoded') || tag(b,'content');
    if(title && /^https?:\/\//i.test(link)){
      out.push({source,title,link,date,description:description.slice(0,220)});
    }
  }
  return out;
}
async function fetchText(url){
  const r=await fetch(url,{headers:{'user-agent':'FractalNotebook/1.0 (+Netlify)','accept':'application/rss+xml, application/atom+xml, text/xml, application/xml, text/html'}});
  if(!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.text();
}
async function getSource(cfg){
  let lastErr;
  for(const url of cfg.urls){
    try{
      const txt=await fetchText(url);
      const parsed=parseFeed(txt,cfg.source);
      if(parsed.length) return parsed;
    }catch(e){ lastErr=e; }
  }
  if(lastErr) throw lastErr;
  return [];
}
exports.handler=async()=>{
  const settled=await Promise.allSettled(FEEDS.map(getSource));
  let items=[];
  let failed=0;
  settled.forEach(x=>{
    if(x.status==='fulfilled') items.push(...x.value);
    else failed++;
  });
  const seen=new Set();
  items=items.filter(x=>{
    const key=(x.link||x.title).toLowerCase();
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
  items.sort((a,b)=>{
    const da=Date.parse(a.date)||0, db=Date.parse(b.date)||0;
    return db-da;
  });
  items=items.slice(0,60);
  return {
    statusCode:200,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'public, max-age=900, s-maxage=1800',
      'access-control-allow-origin':'*'
    },
    body:JSON.stringify({items,partial:failed>0,failedSources:failed})
  };
};
