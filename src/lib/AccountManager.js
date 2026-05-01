/**
 * Way AI Code — AccountManager.js
 * Smart multi-account rotation engine
 * Reference: OpenClaude smart_router.py + providerAutoDetect.ts
 */

export const PROVIDERS = {
  chatgpt:    { label:"ChatGPT",    icon:"⬛", color:"#10a37f", local:false, costPer1k:0.002,  defaultModel:"gpt-4o-mini",              baseUrl:"https://api.openai.com/v1",              pingPath:null },
  claude:     { label:"Claude",     icon:"🟠", color:"#d97706", local:false, costPer1k:0.003,  defaultModel:"claude-haiku-4-5",          baseUrl:null,                                     pingPath:null },
  copilot:    { label:"Copilot",    icon:"⬡",  color:"#6e40c9", local:false, costPer1k:0.002,  defaultModel:"gpt-4o",                    baseUrl:"https://api.githubcopilot.com",           pingPath:null },
  gemini:     { label:"Gemini",     icon:"◈",  color:"#4285f4", local:false, costPer1k:0.0005, defaultModel:"gemini-2.0-flash",           baseUrl:null,                                     pingPath:null },
  groq:       { label:"Groq",       icon:"▲",  color:"#f59e0b", local:false, costPer1k:0.0001, defaultModel:"llama-3.3-70b-versatile",    baseUrl:"https://api.groq.com/openai/v1",          pingPath:null },
  mistral:    { label:"Mistral",    icon:"🌬", color:"#ff7000", local:false, costPer1k:0.0001, defaultModel:"devstral-latest",            baseUrl:"https://api.mistral.ai/v1",              pingPath:null },
  deepseek:   { label:"DeepSeek",   icon:"🔮", color:"#6366f1", local:false, costPer1k:0.0002, defaultModel:"deepseek-chat",              baseUrl:"https://api.deepseek.com/v1",            pingPath:null },
  openrouter: { label:"OpenRouter", icon:"🛣",  color:"#ec4899", local:false, costPer1k:0.001,  defaultModel:"meta-llama/llama-3.1-8b-instruct:free", baseUrl:"https://openrouter.ai/api/v1", pingPath:null },
  ollama:     { label:"Ollama",     icon:"○",  color:"#7c3aed", local:true,  costPer1k:0,      defaultModel:"llama3.2",                  baseUrl:"http://localhost:11434",                  pingPath:"/api/tags" },
  lmstudio:   { label:"LM Studio",  icon:"□",  color:"#0ea5e9", local:true,  costPer1k:0,      defaultModel:"local-model",               baseUrl:"http://localhost:1234/v1",                pingPath:"/models" },
};

const LIMIT_PATTERNS = [
  /rate.?limit/i,/quota/i,/too.?many.?requests/i,
  /429/,/insufficient.?quota/i,/limit.?exceeded/i,
  /billing/i,/credits?.?exhausted/i,/overloaded/i,/503/,
];

import { secureSet, secureGet, secureDel, secureGetAll, migrateFromLocalStorage } from "./secureStorage.js";

const META_KEY = "wayai_accounts_meta_v4";

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "[]");
  } catch { return []; }
}

function saveMeta(accounts) {
  // Never write apiKey to localStorage
  const safe = accounts.map(({ apiKey: _k, ...rest }) => rest);
  try { localStorage.setItem(META_KEY, JSON.stringify(safe)); } catch {}
}

export const estimateTokens = (s = "") => Math.max(1, Math.ceil(String(s).length / 4));

// ── Auto-detect ───────────────────────────────────────────────────────────────
export async function autoDetect(savedSettings = {}) {
  const detected = [];
  const [ollamaOk, lmOk] = await Promise.all([
    _ping("http://localhost:11434/api/tags"),
    _ping("http://localhost:1234/v1/models"),
  ]);
  if (ollamaOk) detected.push({ id:"ollama",   reason:"Ollama running locally ✓" });
  if (lmOk)     detected.push({ id:"lmstudio", reason:"LM Studio running locally ✓" });
  ["gemini","groq","openai","chatgpt","mistral","deepseek","openrouter","claude","copilot"].forEach(id=>{
    if (savedSettings[id]?.apiKey) detected.push({ id, reason:`${PROVIDERS[id]?.label} API key found` });
  });
  return detected;
}
async function _ping(url) {
  try { const r=await fetch(url,{signal:AbortSignal.timeout(2500)}); return [200,400,401,403].includes(r.status); } catch { return false; }
}

// ── SmartRouter ───────────────────────────────────────────────────────────────
export class SmartRouter {
  constructor() { this.scores={}; this.strategy="balanced"; }

  async pingAll(accounts) {
    const locals=[
      {id:"ollama",   url:"http://localhost:11434/api/tags"},
      {id:"lmstudio", url:"http://localhost:1234/v1/models"},
    ];
    await Promise.allSettled(locals.map(async({id,url})=>{
      const t0=performance.now(), ok=await _ping(url);
      this.scores[id]={latencyMs:ok?performance.now()-t0:9999,healthy:ok,requests:0,errors:0,errorRate:0};
    }));
    return this.scores;
  }

  record(id, success, ms) {
    const prev=this.scores[id]||{latencyMs:9999,requests:0,errors:0};
    const requests=prev.requests+1, errors=prev.errors+(success?0:1);
    const latencyMs=success?0.3*ms+0.7*prev.latencyMs:prev.latencyMs;
    const errorRate=errors/requests;
    this.scores[id]={latencyMs,requests,errors,errorRate,healthy:requests<3||errorRate<0.7};
  }

  setStrategy(s) { this.strategy=s; }
  getScores()    { return this.scores; }
}

// ── AccountManager ────────────────────────────────────────────────────────────
export class AccountManager {
  constructor(onChange) {
    this.accounts = [];
    this.activeId = null;
    this.onChange = typeof onChange === "function" ? onChange : () => {};
    this.router = new SmartRouter();
    this._ready = false;
  }

  // Must be called once on app start before using any other method
  async init() {
    await migrateFromLocalStorage();
    const meta = loadMeta();
    const allKeys = await secureGetAll();
    this.accounts = meta.map(acc => ({
      tokensIn: 0, tokensOut: 0, costUsd: 0, requests: 0, errors: 0, limitHits: 0, _streak: 0,
      ...acc,
      apiKey: allKeys[`key_${acc.id}`] || "",
    }));
    this._initActive();
    this._ready = true;
    this.onChange(this._status());
  }

  async add(opts) {
    const prov = PROVIDERS[opts.provider] || {};
    const count = this.accounts.filter(a => a.provider === opts.provider).length;
    const acc = {
      id: `${opts.provider}_${Date.now()}`, provider: opts.provider,
      label: opts.label || `${prov.label || opts.provider} ${count + 1}`,
      apiKey: opts.apiKey || "", baseUrl: opts.baseUrl || prov.baseUrl || "",
      model: opts.model || prov.defaultModel || "",
      status: "active", requests: 0, errors: 0, limitHits: 0, lastUsed: null, _streak: 0,
      tokensIn: 0, tokensOut: 0, costUsd: 0,
    };
    this.accounts.push(acc);
    if (!this.activeId) this.activeId = acc.id;
    if (opts.apiKey) await secureSet(`key_${acc.id}`, opts.apiKey);
    this._save();
    return acc;
  }

  async remove(id) {
    await secureDel(`key_${id}`);
    this.accounts = this.accounts.filter(a => a.id !== id);
    if (this.activeId === id) this._initActive();
    this._save();
  }

  async update(id, patch) {
    const a = this._find(id);
    if (!a) return;
    if ("apiKey" in patch) {
      if (patch.apiKey) {
        await secureSet(`key_${id}`, patch.apiKey);
      } else {
        await secureDel(`key_${id}`);
      }
    }
    Object.assign(a, patch);
    this._save();
  }

  setActive(id)    { this.activeId = id; this.onChange(this._status()); }
  resetAccount(id) { const a = this._find(id); if (a) { a.status = "active"; a._streak = 0; this._save(); } }

  async setGitHubToken(token) {
    if (token) {
      await secureSet("github_token", token);
    } else {
      await secureDel("github_token");
    }
  }

  async getGitHubToken() {
    return secureGet("github_token");
  }

  async call(prompt,{onToken,model,signal}={}) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    const account=this._getActive();
    if (!account) throw new Error("No active accounts. Add accounts in the Accounts panel.");
    const t0=performance.now();
    try {
      const result=await this._dispatch(account,prompt,model||account.model,onToken,signal);
      this._record(account.id,true,performance.now()-t0,"",this._usage(account,prompt,result));
      return {result,account};
    } catch(err) {
      if (err?.name === "AbortError") throw err;
      this._record(account.id,false,performance.now()-t0,err.message);
      if (LIMIT_PATTERNS.some(p=>p.test(err.message))) {
        const next=this._nextAvailable(account.id);
        if (next) {
          try { const result=await this._dispatch(next,prompt,next.model,onToken,signal); this._record(next.id,true,performance.now()-t0,"",this._usage(next,prompt,result)); return {result,account:next}; }
          catch(e2){ this._record(next.id,false,0,e2.message); throw e2; }
        }
      }
      throw err;
    }
  }

  async _dispatch(account,prompt,model,onToken,signal) {
    const {provider,apiKey,baseUrl}=account;
    if (provider==="ollama")  return this._ollama(prompt,model,baseUrl||"http://localhost:11434",onToken,signal);
    if (provider==="gemini")  return this._gemini(prompt,model,apiKey,onToken,signal);
    if (provider==="claude")  return this._claude(prompt,model,apiKey,onToken,signal);
    return this._oaiCompat(prompt,model,baseUrl||PROVIDERS[provider]?.baseUrl||"https://api.openai.com/v1",apiKey,onToken,signal);
  }

  async _ollama(prompt,model,baseUrl,onToken,signal) {
    const res=await fetch(`${baseUrl}/api/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"user",content:prompt}],stream:!!onToken}),signal});
    if(!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    if(!onToken){const d=await res.json();return d.message?.content||"";}
    return this._streamNDJSON(res,onToken,c=>c.message?.content||"",signal);
  }

  async _oaiCompat(prompt,model,baseUrl,apiKey,onToken,signal) {
    const headers={"Content-Type":"application/json"};
    if(apiKey) headers["Authorization"]=`Bearer ${apiKey}`;
    const res=await fetch(`${baseUrl}/chat/completions`,{method:"POST",headers,body:JSON.stringify({model,messages:[{role:"user",content:prompt}],stream:!!onToken}),signal});
    if(!res.ok){const t=await res.text();throw new Error(`HTTP ${res.status}: ${t}`);}
    if(!onToken){const d=await res.json();return d.choices?.[0]?.message?.content||"";}
    return this._streamSSE(res,onToken,line=>{
      if(!line.startsWith("data: ")) return "";
      const j=line.slice(6).trim(); if(j==="[DONE]") return "";
      try{return JSON.parse(j).choices?.[0]?.delta?.content||"";}catch{return "";}
    },signal);
  }

  async _gemini(prompt,model,apiKey,onToken,signal) {
    const ep=onToken?"streamGenerateContent":"generateContent";
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:${ep}?key=${apiKey}${onToken?"&alt=sse":""}`;
    const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]}),signal});
    if(!res.ok){const t=await res.text();throw new Error(`Gemini ${res.status}: ${t}`);}
    if(!onToken){const d=await res.json();return d.candidates?.[0]?.content?.parts?.[0]?.text||"";}
    return this._streamSSE(res,onToken,line=>{
      if(!line.startsWith("data: ")) return "";
      try{return JSON.parse(line.slice(6)).candidates?.[0]?.content?.parts?.[0]?.text||"";}catch{return "";}
    },signal);
  }

  async _claude(prompt,model,apiKey,onToken,signal) {
    const res=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:model||"claude-haiku-4-5",max_tokens:4096,messages:[{role:"user",content:prompt}],stream:!!onToken}),
      signal,
    });
    if(!res.ok){const t=await res.text();throw new Error(`Claude ${res.status}: ${t}`);}
    if(!onToken){const d=await res.json();return d.content?.[0]?.text||"";}
    return this._streamSSE(res,onToken,line=>{
      if(!line.startsWith("data: ")) return "";
      try{const d=JSON.parse(line.slice(6));return d.type==="content_block_delta"?d.delta?.text||"":" ";}catch{return "";}
    },signal);
  }

  async _streamSSE(res,onToken,extract,signal) {
    const reader=res.body.getReader(),dec=new TextDecoder();let full="";
    while(true){
      if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
      const{done,value}=await reader.read();if(done)break;
      for(const line of dec.decode(value).split("\n").filter(Boolean)){try{const t=extract(line);if(t){full+=t;onToken(t);}}catch{}}
    }
    return full;
  }

  async _streamNDJSON(res,onToken,extract,signal) {
    const reader=res.body.getReader(),dec=new TextDecoder();let full="";
    while(true){
      if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
      const{done,value}=await reader.read();if(done)break;
      for(const line of dec.decode(value).split("\n").filter(Boolean)){try{const t=extract(JSON.parse(line));if(t){full+=t;onToken(t);}}catch{}}
    }
    return full;
  }

  _usage(account,prompt,result) {
    const input = estimateTokens(prompt);
    const output = estimateTokens(result);
    const rate = PROVIDERS[account.provider]?.costPer1k || 0;
    return { input, output, cost: ((input + output) / 1000) * rate };
  }

  _record(id,success,ms,errMsg="",usage=null) {
    const a=this._find(id);if(!a)return;
    a.requests++;a.lastUsed=Date.now();this.router.record(id,success,ms);
    a.tokensIn=a.tokensIn||0;a.tokensOut=a.tokensOut||0;a.costUsd=a.costUsd||0;
    if(success){a._streak=0;}
    else{
      a.errors++;a._streak=(a._streak||0)+1;
      const isLimit=LIMIT_PATTERNS.some(p=>p.test(errMsg));
      if(isLimit){a.status="limited";a.limitHits=(a.limitHits||0)+1;this._rotate(id,`Limit on ${a.label}`);}
      else if(a._streak>=3){a.status="error";this._rotate(id,`3 errors on ${a.label}`);}
    }
    if(success&&usage){a.tokensIn+=usage.input;a.tokensOut+=usage.output;a.costUsd+=usage.cost;}
    this._save();
  }

  _rotate(fromId,reason) {
    const next=this.accounts.find(a=>a.id!==fromId&&a.status==="active");
    const from=this._find(fromId);
    if(!next){this.onChange({...this._status(),toast:"⚠️ All accounts limited! Add more.",toastType:"warn"});return;}
    this.activeId=next.id;
    this.onChange({...this._status(),toast:`↻ ${from?.label} → ${next.label} (${reason})`,toastType:"info"});
  }

  _nextAvailable(excludeId)  { return this.accounts.find(a=>a.id!==excludeId&&a.status==="active")||null; }
  _getActive()               { return this._find(this.activeId)||this.accounts.find(a=>a.status==="active")||null; }
  _find(id)                  { return this.accounts.find(a=>a.id===id); }
  _initActive()              { this.activeId=this.accounts.find(a=>a.status==="active")?.id||null; }
  _save() {
    saveMeta(this.accounts);
    this.onChange(this._status());
  }

  _status() {
    const active = this._getActive();
    return {
      accounts: this.accounts.map(({ apiKey, ...rest }) => ({
        ...rest,
        apiKey: apiKey ? "\u2022\u2022\u2022\u2022" : "",
      })),
      activeId: this.activeId,
      active: active ? { ...active, apiKey: active.apiKey ? "\u2022\u2022\u2022\u2022" : "" } : null,
    };
  }

  getStatus() { return this._status(); }
  getAll()    { return this.accounts; }
}
