// netlify/functions/generate-daily.mjs
// Runs daily at 8:00 AM AEST (22:00 UTC) — FREE via Google Gemini API
// Get your free key at: aistudio.google.com (no credit card needed)

const TOPICS = [
  { topic: "How Australian businesses are adopting AI in 2026 — what early movers are learning and where SMBs should start", category: "AI & Tech", kw: "AI adoption Australia 2026" },
  { topic: "SEO in the age of AI Overviews: what changes, what stays the same, and how marketers should adapt", category: "SEO Strategy", kw: "SEO AI Overviews 2026" },
  { topic: "Automation tools reshaping content operations — from brief to publish without the bottlenecks", category: "Tech & Tools", kw: "content automation tools 2026" },
  { topic: "The philosophy of signal versus noise: why the internet has too much content and what quality writing actually solves", category: "Abstract", kw: "content quality vs quantity internet" },
  { topic: "Digital marketing budgets for Australian SMBs in 2026: where to spend, where to cut, and what the data says", category: "Digital Marketing", kw: "digital marketing budget Australia SMB" },
  { topic: "How large language models are reshaping search behaviour — and the SEO implications most marketers are missing", category: "AI & SEO", kw: "LLM search behaviour SEO implications" },
  { topic: "Building content systems that outlast algorithm updates: the case for evergreen strategy over trend-chasing", category: "Content Strategy", kw: "evergreen content strategy SEO" }
];

const SITE_URL   = process.env.SITE_URL || 'https://yoursite.netlify.app';
const GH_TOKEN   = process.env.GITHUB_TOKEN;
const GH_OWNER   = process.env.GITHUB_OWNER;
const GH_REPO    = process.env.GITHUB_REPO;

function geminiURL() {
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
}

function todayAEST() { return new Date().toLocaleDateString('sv-SE',{timeZone:'Australia/Sydney'}); }
function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'').substring(0,60); }
function fmtDate(d) { return new Date(d+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'}); }
function esc(s) { return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):''; }

async function callGemini(systemText, userText, maxTokens=2000) {
  const res = await fetch(geminiURL(), {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      systemInstruction:{parts:[{text:systemText}]},
      contents:[{parts:[{text:userText}]}],
      generationConfig:{temperature:0.75, maxOutputTokens:maxTokens}
    })
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.candidates[0].content.parts[0].text;
}

async function generatePost(date, t) {
  const raw = await callGemini(
    `You are a professional content writer for a digital marketing portfolio. Write authoritative, original blog posts. Australia-first audience but globally relevant. Rules: ~1000 words; structured intro + 3 H2 sections + conclusion; cite 2-3 credible sources by name only (MIT Technology Review, Search Engine Journal, Google Search Central Blog, Moz, CSIRO, Gartner, McKinsey, Harvard Business Review, Australian Financial Review, Wired, The Verge); no em dashes; no AI filler. Return ONLY valid JSON, no markdown.`,
    `Write a ~1000 word blog post on: "${t.topic}". Category: ${t.category}. Focus keyword: "${t.kw}". Date: ${date}. Return ONLY: {"title":"under 65 chars","category":"${t.category}","focusKeyword":"${t.kw}","metaDescription":"under 160 chars","readingTime":"X min read","intro":"~120 words","sections":[{"h2":"heading","content":"~200 words"},{"h2":"heading","content":"~200 words"},{"h2":"heading","content":"~200 words"}],"conclusion":"~100 words","sources":["Pub — context","Pub — context"],"tags":["tag1","tag2","tag3","tag4"]}`
  );
  const post = JSON.parse(raw.replace(/```json|```/g,'').trim());
  post.date = date;
  return post;
}

async function generateTips(date) {
  const raw = await callGemini(
    'Generate byte-sized tech tips. Return ONLY a valid JSON array, no markdown.',
    `Generate 3 byte-sized tips for ${date}. Mix: AI tools, SEO tactics, developer productivity, digital marketing. Each 1-2 sentences, non-obvious, useful for Australian professionals. Return ONLY: [{"tip":"...","category":"AI|SEO|Dev|Marketing"},{"tip":"...","category":"..."},{"tip":"...","category":"..."}]`,
    400
  );
  return JSON.parse(raw.replace(/```json|```/g,'').trim());
}

async function ghCommit(path, content, message) {
  const base = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;
  const headers = {'Authorization':`Bearer ${GH_TOKEN}`,'Accept':'application/vnd.github.v3+json','Content-Type':'application/json'};
  let sha;
  const check = await fetch(base,{headers});
  if (check.ok) { const ex=await check.json(); sha=ex.sha; }
  const body = {message, content:Buffer.from(content).toString('base64'), branch:'main'};
  if (sha) body.sha=sha;
  const res = await fetch(base,{method:'PUT',headers,body:JSON.stringify(body)});
  if (!res.ok) throw new Error(`GitHub commit failed for ${path}: ${await res.text()}`);
}

function buildSitemap(manifest) {
  const today = todayAEST();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>\n  <url><loc>${SITE_URL}/blog/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n${manifest.map(p=>`  <url><loc>${SITE_URL}/blog/${p.slug}.html</loc><lastmod>${p.date}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`).join('\n')}\n</urlset>`;
}

function buildIndexHTML(manifest) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Insights | Dheer Sanghavi</title><meta name="description" content="Daily insights on AI, SEO, digital marketing, and content strategy."><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Syne:wght@400;600;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}:root{--bg:#070707;--sur:#0e0e0e;--bdr:#1c1c1c;--gold:#c8a96e;--tx:#e6e6e6;--tx2:#7a7a7a;--tx3:#383838;--disp:'Cormorant Garamond',serif;--ui:'Syne',sans-serif}body{background:var(--bg);color:var(--tx);font-family:var(--ui)}header{position:sticky;top:0;background:rgba(7,7,7,.94);border-bottom:1px solid var(--bdr);padding:1.1rem 3rem;display:flex;align-items:center;justify-content:space-between}.logo{font-family:var(--disp);font-size:1.3rem;font-weight:600;color:var(--tx);text-decoration:none}.logo span{color:var(--gold)}.back{font-size:.63rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--tx2);text-decoration:none}.back:hover{color:var(--gold)}.hero{padding:5rem 3rem 3rem;max-width:900px;margin:0 auto}.hero-tag{font-size:.57rem;letter-spacing:.32em;text-transform:uppercase;color:var(--gold);margin-bottom:.85rem}.hero-title{font-family:var(--disp);font-size:clamp(2.2rem,5vw,4rem);font-weight:300;line-height:1.05;color:var(--tx);margin-bottom:.75rem}.hero-title em{font-style:italic;color:var(--gold)}.hero-sub{font-size:.85rem;color:var(--tx2);line-height:1.8;max-width:500px}.posts{max-width:900px;margin:0 auto;padding:2rem 3rem 6rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.2rem}.pc{background:var(--sur);border:1px solid var(--bdr);padding:1.8rem;text-decoration:none;display:block;position:relative;overflow:hidden;transition:border-color .25s,transform .25s}.pc::after{content:'';position:absolute;top:0;left:0;width:3px;height:0;background:var(--gold);transition:height .32s}.pc:hover{border-color:#2c2c2c;transform:translateY(-2px)}.pc:hover::after{height:100%}.pc-date{font-size:.55rem;letter-spacing:.18em;text-transform:uppercase;color:var(--tx3);margin-bottom:.5rem}.pc-cat{display:inline-block;font-size:.52rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);border:1px solid rgba(200,169,110,.25);padding:.18rem .5rem;margin-bottom:.75rem}.pc-title{font-family:var(--disp);font-size:1.2rem;color:var(--tx);line-height:1.3;margin-bottom:.6rem;transition:color .2s}.pc:hover .pc-title{color:var(--gold)}.pc-desc{font-size:.76rem;color:var(--tx2);line-height:1.65}.empty{grid-column:1/-1;text-align:center;padding:5rem;font-size:.85rem;color:var(--tx3)}footer{border-top:1px solid var(--bdr);padding:2rem;text-align:center;font-size:.57rem;letter-spacing:.2em;text-transform:uppercase;color:var(--tx3)}footer a{color:var(--gold);text-decoration:none}@media(max-width:600px){header{padding:1rem 1.25rem}.hero,.posts{padding-left:1.25rem;padding-right:1.25rem}}</style></head><body><header><a href="/" class="logo">Dheer Sanghavi<span>.</span></a><a href="/" class="back">← Portfolio</a></header><div class="hero"><div class="hero-tag">Insights</div><h1 class="hero-title">Daily writing on<br>AI, SEO &amp; <em>strategy</em></h1><p class="hero-sub">Original perspectives on digital marketing, search, and technology. Published daily. Australia-first, globally relevant.</p></div><div class="posts">${manifest.length===0?'<div class="empty">First post arrives tomorrow at 8 AM AEST.</div>':manifest.slice(0,60).map(p=>`<a href="/blog/${p.slug}.html" class="pc"><div class="pc-date">${fmtDate(p.date)}</div><span class="pc-cat">${esc(p.category)}</span><div class="pc-title">${esc(p.title)}</div><p class="pc-desc">${esc(p.description||'')}</p></a>`).join('')}</div><footer><p><a href="/">Dheer Jayesh Sanghavi</a> &nbsp;·&nbsp; Marrickville, Sydney</p></footer></body></html>`;
}

function buildPostHTML(post, filename, manifest) {
  const prev = manifest[manifest.findIndex(p=>p.slug===filename)+1];
  const next = manifest[manifest.findIndex(p=>p.slug===filename)-1];
  const url  = `${SITE_URL}/blog/${filename}.html`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(post.title)} | Dheer Sanghavi</title><meta name="description" content="${esc(post.metaDescription)}"><link rel="canonical" href="${url}"><meta property="og:title" content="${esc(post.title)}"><meta property="og:description" content="${esc(post.metaDescription)}"><meta property="og:url" content="${url}"><meta property="article:published_time" content="${post.date}T08:00:00+10:00"><script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"Article","headline":post.title,"datePublished":`${post.date}T08:00:00+10:00`,"author":{"@type":"Person","name":"Dheer Jayesh Sanghavi","url":SITE_URL},"url":url})}<\/script><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Syne:wght@400;600;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}:root{--bg:#070707;--sur:#0e0e0e;--bdr:#1c1c1c;--gold:#c8a96e;--tx:#e6e6e6;--tx2:#7a7a7a;--tx3:#383838;--disp:'Cormorant Garamond',serif;--ui:'Syne',sans-serif}body{background:var(--bg);color:var(--tx);font-family:var(--ui);line-height:1.6}#progress{position:fixed;top:0;left:0;height:2px;background:var(--gold);width:0;z-index:100;transition:width .1s}header{position:sticky;top:0;background:rgba(7,7,7,.94);border-bottom:1px solid var(--bdr);padding:1.1rem 3rem;display:flex;align-items:center;justify-content:space-between}.logo{font-family:var(--disp);font-size:1.3rem;font-weight:600;color:var(--tx);text-decoration:none}.logo span{color:var(--gold)}.hlinks{display:flex;gap:1.5rem}.hlink{font-size:.63rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--tx2);text-decoration:none}.hlink:hover{color:var(--gold)}main{max-width:740px;margin:0 auto;padding:5rem 2rem 4rem}.a-meta{display:flex;gap:.9rem;flex-wrap:wrap;margin-bottom:1rem}.a-cat{font-size:.54rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);border:1px solid rgba(200,169,110,.3);padding:.2rem .6rem}.a-date{font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:var(--tx3)}h1{font-family:var(--disp);font-size:clamp(1.8rem,4vw,3rem);font-weight:300;line-height:1.12;color:var(--tx);margin-bottom:.65rem}.a-kw{font-size:.66rem;color:var(--tx3);margin-bottom:2rem}.a-kw strong{color:var(--tx2)}hr{border:none;border-top:1px solid var(--bdr);margin-bottom:2.2rem}.a-intro{font-size:.96rem;line-height:1.92;color:var(--tx);margin-bottom:1.8rem}h2{font-family:var(--disp);font-size:1.5rem;font-weight:400;color:var(--tx);margin:2.5rem 0 1rem}p{font-size:.88rem;line-height:1.9;color:var(--tx2);margin-bottom:1.5rem}.a-conclusion{color:var(--tx)}.a-footer{margin-top:3rem;padding-top:2rem;border-top:1px solid var(--bdr)}.ft{font-size:.54rem;letter-spacing:.26em;text-transform:uppercase;color:var(--gold);margin-bottom:.75rem}.src{font-size:.74rem;color:var(--tx3);padding-left:.9rem;position:relative;margin-bottom:.25rem}.src::before{content:'—';position:absolute;left:0}.tags{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:1.5rem}.tag{font-size:.62rem;color:var(--tx3);background:var(--sur);border:1px solid var(--bdr);padding:.24rem .65rem}.post-nav{max-width:740px;margin:0 auto;padding:0 2rem 5rem;display:grid;grid-template-columns:1fr 1fr;gap:1rem}.nc{background:var(--sur);border:1px solid var(--bdr);padding:1.2rem 1.4rem;text-decoration:none;display:block;transition:border-color .2s}.nc:hover{border-color:#2c2c2c}.nd{font-size:.54rem;letter-spacing:.22em;text-transform:uppercase;color:var(--tx3);margin-bottom:.4rem}.nt{font-family:var(--disp);font-size:.95rem;color:var(--tx2);line-height:1.4}.nc:hover .nt{color:var(--gold)}.nr{text-align:right}footer{border-top:1px solid var(--bdr);padding:2rem;text-align:center;font-size:.57rem;letter-spacing:.2em;text-transform:uppercase;color:var(--tx3)}footer a{color:var(--gold);text-decoration:none}@media(max-width:600px){header{padding:1rem 1.25rem}main,.post-nav{padding-left:1.25rem;padding-right:1.25rem}}</style></head><body><div id="progress"></div><header><a href="/" class="logo">Dheer Sanghavi<span>.</span></a><div class="hlinks"><a href="/blog/" class="hlink">All Insights</a><a href="/" class="hlink">Portfolio</a></div></header><main><article><div class="a-meta"><span class="a-cat">${esc(post.category)}</span><span class="a-date">${fmtDate(post.date)}</span><span class="a-date">${esc(post.readingTime||'5 min read')}</span></div><h1>${esc(post.title)}</h1><div class="a-kw">Focus keyword: <strong>${esc(post.focusKeyword)}</strong></div><hr><p class="a-intro">${esc(post.intro)}</p>${(post.sections||[]).map(s=>`<h2>${esc(s.h2)}</h2><p>${esc(s.content)}</p>`).join('')}<p class="a-conclusion">${esc(post.conclusion)}</p><div class="a-footer">${post.sources&&post.sources.length?`<div class="ft">Sources</div>${post.sources.map(s=>`<div class="src">${esc(s)}</div>`).join('')}`:''} ${post.tags&&post.tags.length?`<div class="ft" style="margin-top:1.5rem">Tags</div><div class="tags">${post.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}</div></article></main><nav class="post-nav">${prev?`<a href="/blog/${prev.slug}.html" class="nc"><div class="nd">← Older</div><div class="nt">${esc(prev.title)}</div></a>`:'<div></div>'}${next?`<a href="/blog/${next.slug}.html" class="nc nr"><div class="nd">Newer →</div><div class="nt">${esc(next.title)}</div></a>`:'<div></div>'}</nav><footer><p><a href="/">Dheer Jayesh Sanghavi</a> &nbsp;·&nbsp; <a href="/blog/">All Insights</a></p></footer><script>window.addEventListener('scroll',()=>{const p=(window.scrollY/(document.body.scrollHeight-window.innerHeight))*100;document.getElementById('progress').style.width=Math.min(p,100)+'%'});<\/script></body></html>`;
}

export default async (req, context) => {
  console.log('[generate-daily] ' + new Date().toISOString());
  const missing = ['GEMINI_API_KEY','GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO'].filter(k=>!process.env[k]);
  if (missing.length) return new Response(`Missing: ${missing.join(', ')}`,{status:500});

  const date  = todayAEST();
  const topic = TOPICS[new Date(date+'T00:00:00').getDay()];

  try {
    let manifest = [];
    const mRes = await fetch(`https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/main/blog/manifest.json`);
    if (mRes.ok) manifest = await mRes.json();
    if (manifest.find(p=>p.date===date)) return new Response(`Already published for ${date}`,{status:200});

    const [post, tips] = await Promise.all([generatePost(date,topic), generateTips(date)]);
    const slug = `${date}-${slugify(post.title)}`;
    post.slug = slug;
    manifest.unshift({date,slug,title:post.title,category:post.category,description:post.metaDescription,tags:post.tags||[]});
    if (manifest.length>90) manifest=manifest.slice(0,90);

    await Promise.all([
      ghCommit(`blog/${slug}.html`,  buildPostHTML(post,slug,manifest), `Blog: ${post.title}`),
      ghCommit('blog/manifest.json', JSON.stringify(manifest,null,2),   `Manifest: ${date}`),
      ghCommit('blog/index.html',    buildIndexHTML(manifest),          `Index: ${date}`),
      ghCommit('blog/tips.json',     JSON.stringify({date,tips}),       `Tips: ${date}`),
      ghCommit('sitemap.xml',        buildSitemap(manifest),            `Sitemap: ${date}`)
    ]);

    return new Response(JSON.stringify({success:true,title:post.title}),{status:200,headers:{'Content-Type':'application/json'}});
  } catch(err) {
    console.error(err);
    return new Response(JSON.stringify({error:err.message}),{status:500,headers:{'Content-Type':'application/json'}});
  }
};

export const config = { schedule: "0 22 * * *" };
