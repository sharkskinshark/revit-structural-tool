/**
 * App — 結構預審工具主元件。
 *
 * 三欄佈局：左側編輯面板 / 中央 Scene3D / 右側 SummaryPanel。
 * 計算與生成邏輯在 lib/buildingModel.ts；子元件在各自的檔案。
 */
import { useState, useMemo } from "react";
import { downloadDesignJson } from "../lib/exportDesign";
import {
  COLORS, TYPES, DEFAULT_VOLUMES, DEFAULT_EXCEPTIONS,
  calculateDwall, generateColumns, generateBeams, generateSlabs,
  detectTransferIssues, generateFamilyTypes, getWindForLocation,
  estimateDesignForces,
} from "../lib/buildingModel";
import { S } from "./uiStyles";
import Scene3D from "./Scene3D";
import VolumeCard from "./VolumeCard";
import FloorHeightEditor from "./FloorHeightEditor";
import SummaryPanel from "./SummaryPanel";

let nextId = 10;

export default function App() {
  const [gridX, setGridX] = useState(8000);
  const [gridY, setGridY] = useState(7000);
  const [typicalH, setTypicalH] = useState(3300);
  const [exceptions, setExceptions] = useState(DEFAULT_EXCEPTIONS);
  const [maxBX, setMaxBX] = useState(6);
  const [maxBY, setMaxBY] = useState(5);
  const [volumes, setVolumes] = useState(DEFAULT_VOLUMES);
  const [selId, setSelId] = useState(null);
  const [selectedElement, setSelectedElement] = useState(null);
  const [activeTab, setActiveTab] = useState("volumes");
  const [show, setShow] = useState({ volumes:true, columns:true, beams:true, slabs:true, dwall:true });
  const [location, setLocation] = useState("臺北市");
  const [seismicSDS, setSeismicSDS] = useState(0.66);
  const [seismicSD1, setSeismicSD1] = useState(0.385);

  const totalAbove = useMemo(() => Math.max(...volumes.map(v => v.endF), 0), [volumes]);
  const dwall = useMemo(() => calculateDwall(volumes, typicalH, exceptions), [volumes, typicalH, exceptions]);
  const columns = useMemo(() => generateColumns(volumes, maxBX, maxBY), [volumes, maxBX, maxBY]);
  const beams = useMemo(() => generateBeams(volumes, gridX, gridY, typicalH, exceptions), [volumes, gridX, gridY, typicalH, exceptions]);
  const slabs = useMemo(() => generateSlabs(volumes, gridX, gridY, typicalH, exceptions), [volumes, gridX, gridY, typicalH, exceptions]);
  const transferIssues = useMemo(() => detectTransferIssues(volumes), [volumes]);
  const hasCore = useMemo(() => volumes.some(v => v.type === "core"), [volumes]);
  const families = useMemo(() => generateFamilyTypes(columns, beams, slabs, dwall, hasCore, totalAbove), [columns, beams, slabs, dwall, hasCore, totalAbove]);
  const windZone = useMemo(() => getWindForLocation(location), [location]);
  const designForces = useMemo(() => estimateDesignForces(volumes, gridX, gridY, typicalH, exceptions, windZone.v), [volumes, gridX, gridY, typicalH, exceptions, windZone]);

  const updateVol = (updated) => setVolumes(vs => vs.map(v => v.id === updated.id ? updated : v));
  const deleteVol = (id) => { setVolumes(vs => vs.filter(v => v.id !== id)); if (selId === id) setSelId(null); };
  const addVol = (type) => {
    const id = nextId++;
    const t = TYPES.find(t => t.value === type);
    const defaults = {
      basement: { startF:-2, endF:0, x1:0, x2:maxBX, y1:0, y2:maxBY, opacity:0.18, useType:"parking" },
      podium: { startF:1, endF:4, x1:0, x2:maxBX, y1:0, y2:maxBY, opacity:0.3, useType:"commercial" },
      tower: { startF:5, endF:15, x1:1, x2:maxBX-1, y1:1, y2:maxBY-1, opacity:0.32, useType:"residential" },
      core: { startF:-2, endF:15, x1:Math.floor(maxBX/2), x2:Math.floor(maxBX/2)+1, y1:Math.floor(maxBY/2), y2:Math.floor(maxBY/2)+1, opacity:0.5, useType:"core" },
      setback: { startF:10, endF:15, x1:2, x2:maxBX-2, y1:1, y2:maxBY-1, opacity:0.4, useType:"residential" },
    };
    const d = defaults[type] || defaults.tower;
    const colors = { core:"#aa6644" };
    const color = colors[type] || COLORS[volumes.length % COLORS.length];
    setVolumes(vs => [...vs, { id, name:`${t?.label||type}${id}`, type, color, ...d }]);
    setSelId(id);
  };

  const handleExport = () => {
    downloadDesignJson({
      project: { name: "Untitled", location, structureSystem: "RC" },
      designParams: {
        windV: windZone.v,
        windZone: windZone.label,
        SDS: seismicSDS,
        SD1: seismicSD1,
        importance: 1.0,
        siteClass: 2,
        seismicLevel: "中等",
      },
      geometry: { gridX, gridY, maxBX, maxBY, typicalH, exceptions, totalAbove },
      volumes, columns, beams, slabs, dwall, families,
    });
  };

  const tabBtn = (id, label) => (
    <button onClick={() => setActiveTab(id)} style={{
      flex:1, padding:"5px 4px", border:"none", cursor:"pointer", fontSize:10, fontWeight:600,
      background: activeTab === id ? "#1a1a3e" : "#0d0d18",
      color: activeTab === id ? "#88ccaa" : "#555",
      borderBottom: activeTab === id ? "2px solid #88ccaa" : "2px solid transparent"
    }}>{label}</button>
  );

  const showBtn = (k, label, color) => (
    <button onClick={() => setShow(s => ({...s, [k]: !s[k]}))} style={{
      padding:"3px 7px", border:"1px solid "+(show[k]?color:"#333"), borderRadius:3, cursor:"pointer",
      fontSize:9, background: show[k] ? "rgba(13,13,24,.85)" : "#0d0d18",
      color: show[k] ? color : "#444", fontWeight:600,
    }}>{label}</button>
  );

  return (
    <div style={{
      width:"100vw", height:"100vh", display:"grid", gridTemplateColumns:"280px 1fr 260px",
      background:"#0d0d18", color:"#e0e0e0", fontFamily:"'SF Mono','Noto Sans TC',monospace", overflow:"hidden",
    }}>
      <div style={{ borderRight:"1px solid #1e1e33", display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"6px 10px", background:"#151528", borderBottom:"1px solid #1e1e33", display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
          <span style={{ fontSize:13, fontWeight:700, color:"#88ccaa", letterSpacing:1 }}>
            🧊 量體 + 結構系統 v4
          </span>
          <button onClick={handleExport} title="匯出 design.json（給 calc-engine / pyRevit 用）" style={{
            padding:"4px 10px", border:"1px solid #2a4455", borderRadius:3, cursor:"pointer",
            fontSize:10, fontWeight:600, background:"#1a3344", color:"#88ccee",
          }}>📥 匯出</button>
        </div>
        <div style={{ display:"flex", borderBottom:"1px solid #1e1e33" }}>
          {tabBtn("volumes","量體")}
          {tabBtn("heights","樓高")}
          {tabBtn("grid","柱網")}
          {tabBtn("design","設計")}
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"8px 10px" }}>
          {activeTab === "grid" && (
            <>
              <div style={{ fontSize:10, color:"#6688aa", fontWeight:600, marginBottom:4 }}>基礎柱網</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 6px" }}>
                <div><label style={S.lbl}>X跨距(mm)</label><input style={S.inp} type="number" step={500} value={gridX} onChange={e=>setGridX(Number(e.target.value))}/></div>
                <div><label style={S.lbl}>Y跨距(mm)</label><input style={S.inp} type="number" step={500} value={gridY} onChange={e=>setGridY(Number(e.target.value))}/></div>
                <div><label style={S.lbl}>X最大跨數</label><input style={S.inp} type="number" min={1} max={20} value={maxBX} onChange={e=>setMaxBX(Number(e.target.value))}/></div>
                <div><label style={S.lbl}>Y最大跨數</label><input style={S.inp} type="number" min={1} max={20} value={maxBY} onChange={e=>setMaxBY(Number(e.target.value))}/></div>
              </div>
            </>
          )}

          {activeTab === "design" && (
            <>
              <div style={{ fontSize:10, color:"#6688aa", fontWeight:600, marginBottom:4 }}>🌍 工址設定</div>
              <label style={S.lbl}>位置（影響風速與震區）</label>
              <select style={S.inp} value={location} onChange={e=>setLocation(e.target.value)}>
                <optgroup label="台北/北部沿海 (42.5 m/s)">
                  <option>臺北市</option>
                  <option>新北市-淡水區</option>
                  <option>基隆市</option>
                </optgroup>
                <optgroup label="花蓮/恆春 (47.5 m/s)">
                  <option>花蓮縣-花蓮市</option>
                  <option>花蓮縣-吉安鄉</option>
                  <option>屏東縣-恆春鎮</option>
                </optgroup>
                <optgroup label="一般地區 (37.5 m/s)">
                  <option>桃園市</option>
                  <option>新竹市</option>
                  <option>臺中市</option>
                  <option>臺南市</option>
                  <option>高雄市</option>
                </optgroup>
              </select>

              <div style={{ fontSize:10, color:"#6688aa", fontWeight:600, marginTop:10, marginBottom:4 }}>🌐 耐震參數 (民國113年版)</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 6px" }}>
                <div><label style={S.lbl}>SDS (短週期)</label><input style={S.inp} type="number" step={0.01} value={seismicSDS} onChange={e=>setSeismicSDS(Number(e.target.value))}/></div>
                <div><label style={S.lbl}>SD1 (1秒週期)</label><input style={S.inp} type="number" step={0.01} value={seismicSD1} onChange={e=>setSeismicSD1(Number(e.target.value))}/></div>
              </div>
              <div style={{ fontSize:9, color:"#556", marginTop:6, lineHeight:"1.4" }}>
                📖 範例值（依工址查表 2-1）：<br/>
                臺北盆地: SDS=0.66, SD1=0.385<br/>
                花蓮市: SDS=0.96, SD1=0.585<br/>
                臺中市: SDS=0.77, SD1=0.42<br/>
                高雄市: SDS=0.66, SD1=0.385
              </div>

              <div style={{ background:"#1a2a3a", borderRadius:5, padding:8, marginTop:10, border:"1px solid #2a4466" }}>
                <div style={{ color:"#88bbcc", fontSize:10, fontWeight:600, marginBottom:4 }}>🎯 設計目標檢核</div>
                <div style={{ fontSize:9, color:"#aabbcc", lineHeight:"1.6" }}>
                  • 50年回歸期風速 → 不致嚴重損壞<br/>
                  • 475年回歸期地震 → 不致倒塌<br/>
                  • 30年回歸期中小地震 → 維持彈性<br/>
                  • 防火時效 (§70) → 維持構造完整<br/>
                  • 高寬比 H/B {parseFloat(designForces.aspectRatio) > 4 ? "⚠️ >4，須留意風壓" : "✓ ≤4，常規設計"}
                </div>
              </div>
            </>
          )}
          {activeTab === "heights" && (
            <FloorHeightEditor typicalH={typicalH} setTypicalH={setTypicalH} exceptions={exceptions} setExceptions={setExceptions} />
          )}
          {activeTab === "volumes" && (
            <>
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8 }}>
                {TYPES.map(t => (
                  <button key={t.value} onClick={() => addVol(t.value)}
                    style={{ padding:"4px 8px", border:"1px solid #333", borderRadius:3, cursor:"pointer",
                      fontSize:10, background:"#151528", color: t.value==="core"?"#ee8866":"#8aa" }}>
                    + {t.label}
                  </button>
                ))}
              </div>
              {volumes.map(v => (
                <VolumeCard key={v.id} vol={v} isSelected={selId === v.id}
                  onClick={() => setSelId(selId === v.id ? null : v.id)}
                  onChange={updateVol} onDelete={deleteVol} maxBX={maxBX} maxBY={maxBY}
                  typicalH={typicalH} exceptions={exceptions} />
              ))}
            </>
          )}
        </div>
      </div>

      <div style={{ position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:8, right:8, zIndex:10, background:"rgba(13,13,24,.85)",
          padding:"4px 8px", borderRadius:3, fontSize:9, color:"#555" }}>
          拖曳旋轉｜滾輪縮放｜點擊選取
        </div>
        {/* Visibility toggles */}
        <div style={{ position:"absolute", top:8, left:8, zIndex:10, display:"flex", gap:4, flexWrap:"wrap", maxWidth:400 }}>
          {showBtn("volumes","量體","#88ccaa")}
          {showBtn("columns","柱","#88bbee")}
          {showBtn("beams","梁","#cc8866")}
          {showBtn("slabs","樓板","#aabbaa")}
          {showBtn("dwall","連續壁","#ddaa66")}
        </div>
        <div style={{ position:"absolute", bottom:8, left:8, zIndex:10, background:"rgba(13,13,24,.9)",
          padding:6, borderRadius:4, fontSize:9, display:"flex", gap:10, flexWrap:"wrap" }}>
          <span style={{color:"#88bbee"}}>■ 柱 (依fc'分色)</span>
          <span style={{color:"#cc7744"}}>■ 梁</span>
          <span style={{color:"#667788"}}>■ 結構樓板</span>
          <span style={{color:"#cc8855"}}>■ 隔音層 (§46-6)</span>
          <span style={{color:"#cc6644"}}>■ 剪力牆</span>
          <span style={{color:"#aa7755"}}>■ 連續壁</span>
        </div>
        <Scene3D gridX={gridX} gridY={gridY} typicalH={typicalH} exceptions={exceptions}
          maxBX={maxBX} maxBY={maxBY} volumes={volumes} selected={selId}
          onSelect={setSelId} onSelectElement={setSelectedElement}
          dwall={dwall} columns={columns} beams={beams} slabs={slabs} totalAbove={totalAbove} show={show} />
      </div>

      <div style={{ borderLeft:"1px solid #1e1e33", overflow:"hidden" }}>
        <SummaryPanel volumes={volumes} gridX={gridX} gridY={gridY}
          typicalH={typicalH} exceptions={exceptions}
          dwall={dwall} transferIssues={transferIssues} families={families}
          totalAbove={totalAbove} selectedElement={selectedElement}
          location={location} windZone={windZone} designForces={designForces}
          seismicSDS={seismicSDS} seismicSD1={seismicSD1} />
      </div>
    </div>
  );
}
