import { LitElement, html, css } from "lit";

const sevScore = (s) => s === "error" ? 2 : s === "warn" ? 1 : 0;

export class ReportViewer extends LitElement {
  static properties = {
    src: { type: String },
    data: { state: true },
    q: { state: true },
    sev: { state: true }, // all|warn|error
    sortKey: { state: true }, // sev|hits|coverage|id
    sortDir: { state: true }  // desc|asc
  };
  static styles = css`
    :host{display:block; color:#E5E7EB; background:#0B1220; min-height:100vh}
    .wrap{max-width:1100px; margin:0 auto; padding:28px 18px 72px}
    header{
      background: radial-gradient(1200px 500px at 10% -10%, #3b82f6 0, transparent 60%),
                  radial-gradient(800px 300px at 90% -20%, #22d3ee 0, transparent 50%),
                  linear-gradient(180deg, rgba(59,130,246,.15), rgba(34,211,238,.08) 60%, transparent);
      padding: 28px 18px; border-radius: 16px; margin-bottom: 18px; box-shadow: 0 10px 30px rgba(0,0,0,.25);
    }
    h1{margin:0; font: 600 22px/1.2 ui-sans-serif, system-ui}
    .row{display:flex; gap:12px; align-items:center; margin-top:12px; flex-wrap:wrap}
    input[type=text]{flex:1; background:#0f172a; border:1px solid #1f2937; color:#e5e7eb; padding:10px 12px; border-radius:10px}
    button, select{background:#111827; color:#e5e7eb; border:1px solid #374151; padding:10px 12px; border-radius:10px; cursor:pointer}
    .summary{display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:14px}
    .card{background:#0C162B; border:1px solid #1E293B; padding:16px; border-radius:14px}
    .k{font:600 12px/1.2 ui-sans-serif; opacity:.7}
    .v{font:700 22px/1 ui-sans-serif}
    .ok{color:#34d399}.warn{color:#f59e0b}.err{color:#ef4444}
    table{width:100%; border-collapse:separate; border-spacing:0 10px; margin-top:14px}
    th,td{padding:10px 12px; text-align:left; font: 13px/1.3 ui-sans-serif}
    tbody tr{background:#0C1324; border:1px solid #1E293B}
    tbody td:first-child{border-radius:12px 0 0 12px}
    tbody td:last-child{border-radius:0 12px 12px 0}
    .pill{padding:.2rem .5rem;border-radius:999px;background:#0b1220;border:1px solid #1f2937}
    .pill.err{background:#3b0d0d;border-color:#7f1d1d}.pill.warn{background:#3a2502;border-color:#854d0e}.pill.ok{background:#062b1c;border-color:#065f46}
    .mdn{color:#93c5fd}
    .spark{height:24px;width:80px;display:inline-block; vertical-align:middle}
    .small{opacity:.7}
    .link{color:#60a5fa; text-decoration:none}
    .footer{margin-top:24px; opacity:.6; font-size:12px}
  `;

  constructor(){
    super();
    this.src = new URLSearchParams(location.search).get("src") || "./demo/report.json";
    this.q = ""; this.sev = "all"; this.sortKey = "sev"; this.sortDir = "desc";
  }
  connectedCallback(){ super.connectedCallback(); this.load(); }

  async load(){
    try{
      const res = await fetch(this.src);
      this.data = await res.json();
      document.title = `Flightdeck  ${this.data.summary.achieved}%`;
    }catch(e){
      this.data = { summary:{violations:[],warnings:[],achieved:0,coverageBudget:0}, features:{} };
    }
  }

  get filtered(){
    if(!this.data) return [];
    let items = Object.values(this.data.features);
    if(this.q){
      const q = this.q.toLowerCase();
      items = items.filter(x=> x.id.toLowerCase().includes(q) || (x.mdn||"").toLowerCase().includes(q));
    }
    if(this.sev!=="all"){
      items = items.filter(x => (this.sev==="error" ? x.severity==="error" : x.severity==="warn"));
    }
    const cmp = {
      sev: (a,b)=> sevScore(b.severity)-sevScore(a.severity),
      hits:(a,b)=> b.count-a.count,
      coverage:(a,b)=> b.coverage-a.coverage,
      id:(a,b)=> a.id.localeCompare(b.id)
    }[this.sortKey];
    items.sort(cmp);
    if(this.sortDir==="asc") items.reverse();
    return items;
  }

  sortBy(k){ this.sortKey=k; this.requestUpdate(); }
  flipDir(){ this.sortDir = this.sortDir==="desc"?"asc":"desc"; }

  spark(d){
    const w=80,h=24; const max=Math.max(...d,1), min=Math.min(...d,0);
    const pts=d.map((v,i)=>`${(i/(d.length-1))*w},${h-( (v-min)/(max-min||1))*h}`).join(" ");
    return html`<svg class="spark" viewBox="0 0 ${w} ${h}">
      <polyline points=${pts} fill="none" stroke="#60a5fa" stroke-width="2" />
    </svg>`;
  }

  renderHeader(){
    const s=this.data?.summary||{violations:[],warnings:[],achieved:0,coverageBudget:0};
    return html`
      <header>
        <h1>Baseline Flightdeck</h1>
        <div class="row">
          <input type="text" placeholder="Search features" @input=${e=>this.q=e.target.value} />
          <select @change=${e=>this.sev=e.target.value}>
            <option value="all">All severities</option>
            <option value="warn">Warnings only</option>
            <option value="error">Errors only</option>
          </select>
          <button @click=${()=>location.href=`${location.pathname}?src=${encodeURIComponent(this.src)}`}>Permalink</button>
          <button @click=${()=>navigator.clipboard.writeText(location.href)}>Copy URL</button>
        </div>
        <div class="summary">
          <div class="card"><div class="k">Coverage</div><div class="v">${s.achieved}% <span class="small"> (budget ${s.coverageBudget}%)</span></div></div>
          <div class="card"><div class="k">Violations</div><div class="v err">${(s.violations||[]).length}</div></div>
          <div class="card"><div class="k">Warnings</div><div class="v warn">${(s.warnings||[]).length}</div></div>
          <div class="card"><div class="k">Features Seen</div><div class="v">${Object.keys(this.data?.features||{}).length}</div></div>
        </div>
      </header>`;
  }

  renderTable(){
    if(!this.data) return html`<div class="wrap">Loading report</div>`;
    const rows=this.filtered;
    return html`
      <div class="wrap">
        <table>
          <thead>
            <tr>
              <th @click=${()=>this.sortBy("sev")}>Severity</th>
              <th @click=${()=>this.sortBy("id")}>Feature</th>
              <th>Status</th>
              <th @click=${()=>this.sortBy("coverage")}>Coverage</th>
              <th @click=${()=>this.sortBy("hits")}>Hits</th>
              <th>Trend</th>
              <th>Docs</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(u=>html`
              <tr>
                <td><span class="pill ${u.severity==="error"?"err":u.severity==="warn"?"warn":"ok"}">${u.severity}</span></td>
                <td>${u.id}</td>
                <td>${u.status}</td>
                <td>${u.coverage}%</td>
                <td>${u.count}</td>
                <td>${this.spark([u.coverage-5,u.coverage-2,u.coverage,u.coverage+1].map(x=>Math.max(0,Math.min(100,x))))}</td>
                <td>${u.mdn?html`<a class="link mdn" href=${u.mdn} target="_blank" rel="noopener">MDN</a>`:""}</td>
              </tr>
            `)}
          </tbody>
        </table>
        <div class="footer">Tip: pass <code>?src=/absolute/path/to/report.json</code> to view another projects report.</div>
      </div>`;
  }

  render(){ return html`${this.renderHeader()} ${this.renderTable()}`; }
}
customElements.define("report-viewer", ReportViewer);
