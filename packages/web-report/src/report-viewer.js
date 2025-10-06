import { LitElement, html, css } from "lit";

const bySeverity = (s)=> s==="error"?2 : s==="warn"?1 : 0;
const fmt = (n)=> new Intl.NumberFormat().format(n);

export class ReportViewer extends LitElement {
  static styles = css`
    :host{display:block;background:#0b0f17;color:#e5e7eb;min-height:100vh}
    .wrap{max-width:1200px;margin:auto;padding:28px}
    header{display:flex;align-items:center;gap:14px;margin-bottom:14px}
    h1{font:600 20px/1.2 Inter,system-ui;margin:0}
    .sub{color:#93a4b8;font-size:13px}
    .toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 18px}
    input[type="text"]{background:#0e1628;border:1px solid #1d2a44;border-radius:10px;padding:10px 12px;color:#e5e7eb;min-width:360px;outline:none}
    select,button{background:#13244a;border:1px solid #1f3b7a;border-radius:10px;color:#e5e7eb;padding:10px 12px;cursor:pointer}
    button.ghost{background:#0e1628;border-color:#27324a}
    .chip{padding:.25rem .6rem;border-radius:999px;border:1px solid #2a3653;cursor:pointer}
    .chip[active]{background:#183058}
    .grid{display:grid;grid-template-columns:1fr;gap:14px}
    @media(min-width:980px){.grid{grid-template-columns: 360px 1fr}}
    .card{background:#0f1522;border:1px solid #1b2640;border-radius:14px;padding:16px}
    .row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .muted{color:#9ba8bf;font-size:13px}
    .score{display:flex;gap:10px}
    .score .cell{flex:1;background:#0d1424;border:1px solid #1b2640;border-radius:12px;padding:14px}
    .h2{font-weight:600}
    .list{display:grid;gap:10px}
    .item{background:#0f1522;border:1px solid #1b2640;border-radius:12px;padding:12px}
    .item .title{display:flex;gap:8px;align-items:center}
    .badge{padding:.1rem .5rem;border-radius:999px;font-size:12px}
    .b-error{background:#3b1d22;color:#ffc2cc;border:1px solid #5b212e}
    .b-warn{background:#2d2a13;color:#ffe59a;border:1px solid #6a5f29}
    .b-info{background:#10291a;color:#b8f4c4;border:1px solid #1e4f33}
    .mdn{color:#93c5fd;text-decoration:none}
    .sp{flex:1}
    .inline{display:flex;gap:8px;flex-wrap:wrap}
    .gauge{width:120px;height:120px}
    .gauge text{font:600 20px Inter,system-ui;fill:#e5e7eb}
    .mini{height:10px;background:linear-gradient(90deg,#1b2440,#0f1522);border-radius:999px;position:relative;overflow:hidden}
    .mini > span{position:absolute;left:0;top:0;bottom:0;background:#2dd4bf}
    .hl{color:#c7d2fe}
  `;

  static properties = {
    src: { type: String },         // report.json URL
    data: { state: true },
    err:  { state: true },
    q:    { state: true },
    sev:  { state: true },         // set of enabled severities
    sort: { state: true },         // "sev" | "hits" | "coverage"
    loading: { state: true }
  };

  constructor(){
    super();
    const p = new URLSearchParams(location.search);
    this.src = p.get("src") || "/demo/report.json";
    this.q   = p.get("q")   || "";
    this.sev = new Set((p.get("sev")?.split(",")||["error","warn","info"]).filter(Boolean));
    this.sort= p.get("sort")|| "sev";
    this.loading = true;
    this.err = "";
  }

  connectedCallback(){ super.connectedCallback(); this.load(); }
  updateUrl(){
    const s = new URLSearchParams();
    if (this.src) s.set("src", this.src);
    if (this.q) s.set("q", this.q);
    if (this.sort!=="sev") s.set("sort", this.sort);
    const sv = ["error","warn","info"].filter(x=>this.sev.has(x));
    if (sv.length !== 3) s.set("sev", sv.join(","));
    history.replaceState(null,"","?"+s.toString());
  }

  async load(){
    this.loading = true; this.err = ""; this.updateUrl();
    try{
      const res = await fetch(this.src, { cache:"no-store" });
      if (!res.ok) throw new Error(res.status+" "+res.statusText);
      const t = await res.text();
      try{
        this.data = JSON.parse(t);
      }catch(jsonErr){
        throw new Error(`Unexpected token while parsing JSON (did you point to HTML?). First chars: ${t.slice(0,40)}`);
      }
      document.title = `Flightdeck  ${this.data.summary.achieved}%`;
    }catch(e){ this.err = `Failed to load ${this.src}  ${e.message}`; this.data = null; }
    finally{ this.loading = false; }
  }

  // derived list
  get filtered(){
    if (!this.data) return [];
    const items = Object.values(this.data.features);
    return items
      .filter(u=> this.sev.has(u.severity))
      .filter(u=> this.q ? (u.id.includes(this.q) || (u.mdn||"").includes(this.q)) : true)
      .sort((a,b)=>{
        if (this.sort==="hits") return b.count - a.count;
        if (this.sort==="coverage") return a.coverage - b.coverage;
        return bySeverity(b.severity) - bySeverity(a.severity) || b.count - a.count;
      });
  }

  // UI helpers
  badge(sev){ return "badge " + (sev==="error"?"b-error": sev==="warn"?"b-warn":"b-info"); }
  gauge(ach=0){
    const pct = Math.max(0, Math.min(100, ach));
    const r=52, c=2*Math.PI*r, o= c * (1 - pct/100);
    return html`<svg class="gauge" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="${r}" stroke="#192243" stroke-width="12" fill="none"/>
      <circle cx="60" cy="60" r="${r}" stroke="#22d3ee" stroke-width="12" fill="none"
              stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${o}" transform="rotate(-90 60 60)"/>
      <text x="60" y="66" text-anchor="middle">${pct}%</text>
    </svg>`;
  }

  copyLink(){
    navigator.clipboard.writeText(location.href).then(()=>{
      const btn = this.renderRoot?.querySelector("#copylink");
      if (btn){ btn.textContent="Copied!"; setTimeout(()=>btn.textContent="Share link",1200); }
    });
  }

  renderItem(u){
    return html`<div class="item">
      <div class="title">
        <span class="${this.badge(u.severity)}">${u.severity}</span>
        <span class="h2">${u.id}</span>
        <span class="muted">status: ${u.status}</span>
        <span class="muted">coverage: ${u.coverage}%</span>
        <span class="muted">hits: ${fmt(u.count)}</span>
        <span class="sp"></span>
        ${u.mdn?html`<a class="mdn" href="${u.mdn}" target="_blank" rel="noreferrer">MDN</a>`:""}
      </div>
      <div class="muted" style="margin-top:6px">
        ${u.hits?.length ? html`
          <div class="mini"><span style="width:${Math.min(100, u.coverage)}%"></span></div>
          <div style="margin-top:6px">
            <span class="hl">${u.hits[0].file}</span> :${u.hits[0].line}
            ${u.hits.length>1 ? html`  and ${u.hits.length-1} more`:""}
          </div>` : "No source hits captured."}
      </div>
    </div>`;
  }

  render(){
    const s = this.data?.summary;
    return html`
      <div class="wrap">
        <header>
          <h1>Baseline Flightdeck</h1>
          <span class="sub">Modern web-compat advisor</span>
        </header>

        <!-- Controls -->
        <div class="toolbar">
          <input placeholder="report.json URL or /@fs/absolute-path/report.json"
                 .value=${this.src}
                 @change=${(e)=>{this.src=e.target.value; this.load();}} />
          <input placeholder="Search features (id or MDN)"
                 .value=${this.q}
                 @input=${(e)=>{this.q=e.target.value; this.updateUrl();}} />
          <select .value=${this.sort} @change=${(e)=>{this.sort=e.target.value; this.updateUrl();}}>
            <option value="sev">Sort: Severity</option>
            <option value="hits">Sort: Hits</option>
            <option value="coverage">Sort: Low coverage</option>
          </select>
          <button id="copylink" class="ghost" @click=${()=>this.copyLink()}>Share link</button>
        </div>

        <!-- Filters -->
        <div class="toolbar">
          ${["error","warn","info"].map(sv=>html`
            <div class="chip" ?active=${this.sev.has(sv)} @click=${()=>{ if(this.sev.has(sv)) this.sev.delete(sv); else this.sev.add(sv); this.requestUpdate(); this.updateUrl(); }}>
              ${sv}
            </div>
          `)}
        </div>

        <div class="grid">
          <!-- Left scorecard -->
          <div class="card">
            ${s ? html`
              <div class="row">
                ${this.gauge(s.achieved)}
                <div class="score sp">
                  <div class="cell">
                    <div class="muted">Budget</div>
                    <div class="h2">${s.coverageBudget}%</div>
                  </div>
                  <div class="cell">
                    <div class="muted">Violations</div>
                    <div class="h2">${s.violations.length}</div>
                  </div>
                  <div class="cell">
                    <div class="muted">Warnings</div>
                    <div class="h2">${s.warnings.length}</div>
                  </div>
                </div>
              </div>
              <div class="muted" style="margin-top:10px">
                Tip: Use <code>?src=</code> to load any projects report.json. Example:
                <code>?src=/@fs/C:/path/to/report.json</code>
              </div>
            ` : html`<div class="muted">Load a report to see metrics.</div>`}
          </div>

          <!-- Right list / errors -->
          <div>
            ${this.err? html`<div class="card b-error">${this.err}</div>`:""}
            ${this.loading? html`<div class="card">Loading</div>` : ""}
            ${this.data ? html`
              <div class="card"><div class="row">
                <div class="h2">Features</div>
                <span class="muted">(${fmt(this.filtered.length)} of ${fmt(Object.keys(this.data.features).length)})</span>
              </div></div>
              <div class="list">${this.filtered.map(u=>this.renderItem(u))}</div>
            `:""}
          </div>
        </div>
      </div>
    `;
  }
}
customElements.define("report-viewer", ReportViewer);
