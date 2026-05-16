/**
 * SummaryPanel — right-hand summary: selected element, design KPIs, family inventory.
 * Extracted from App.tsx during the component split.
 */
import { getFloorBottom, getH } from "../lib/buildingModel";
import FamilyTypePanel from "./FamilyTypePanel";

export default function SummaryPanel({ volumes, gridX, gridY, typicalH, exceptions, dwall, transferIssues, families, totalAbove, selectedElement, location, windZone, designForces, seismicSDS, seismicSD1 }) {
  const cores = volumes.filter(v => v.type === "core");
  const towers = volumes.filter(v => v.type === "tower");
  const maxFloor = Math.max(...volumes.map(v => v.endF), 0);
  const minFloor = Math.min(...volumes.map(v => v.startF), 0);
  const totalH = maxFloor > 0 ? getFloorBottom(maxFloor, typicalH, exceptions) + getH(maxFloor, typicalH, exceptions) : 0;

  const R = ({l,v,c}) => (
    <div style={{display:"flex",justifyContent:"space-between",padding:"2px 0",borderBottom:"1px solid #1a1a2a"}}>
      <span style={{color:"#667",fontSize:10}}>{l}</span>
      <span style={{color:c||"#ccc",fontSize:10,fontWeight:500}}>{v}</span>
    </div>
  );

  return (
    <div style={{ padding:10, overflowY:"auto", height:"100%" }}>
      {/* SELECTED ELEMENT - prominent display */}
      {selectedElement && (
        <div style={{
          background:"linear-gradient(135deg, #2a2238 0%, #1a1a3a 100%)",
          borderRadius:6, padding:10, marginBottom:10,
          border:"2px solid #ffdd44", boxShadow:"0 0 12px rgba(255,221,68,.15)"
        }}>
          <div style={{ color:"#ffdd44", fontSize:11, fontWeight:700, marginBottom:6, letterSpacing:1 }}>
            🔍 選取構件規格
          </div>
          {Object.entries(selectedElement).map(([k, v]) => (
            <div key={k} style={{
              display:"flex", justifyContent:"space-between", padding:"3px 0",
              borderBottom:"1px solid rgba(255,221,68,.1)", gap:8
            }}>
              <span style={{ color:"#aabbcc", fontSize:10, flexShrink:0 }}>{k}</span>
              <span style={{ color:"#ffeecc", fontSize:10, fontWeight:500, textAlign:"right",
                fontFamily: k==="Family/Type" ? "monospace" : "inherit" }}>{v}</span>
            </div>
          ))}
          <div style={{ fontSize:9, color:"#776644", marginTop:6, fontStyle:"italic" }}>
            點擊其他構件可切換顯示
          </div>
        </div>
      )}

      <div style={{ fontSize:13, fontWeight:700, color:"#88aacc", marginBottom:10, letterSpacing:1 }}>📊 量體摘要</div>

      {/* DESIGN TARGETS - core structural KPIs */}
      <div style={{
        background:"linear-gradient(135deg, #1a2a3a 0%, #1a1a3a 100%)",
        borderRadius:6, padding:9, marginBottom:8,
        border:"1px solid #2a4466"
      }}>
        <div style={{ color:"#66bbee", fontSize:11, fontWeight:700, marginBottom:6 }}>
          🎯 結構設計核心目標
        </div>
        <div style={{ borderTop:"1px solid #1a2a3a", paddingTop:4 }}>
          <div style={{ color:"#cc7766", fontSize:10, fontWeight:600, marginTop:3, marginBottom:3 }}>💨 抗風</div>
          <R l="工址" v={location} c="#aabbcc"/>
          <R l="基本設計風速" v={`${windZone.v} m/s`} c="#ddaa66"/>
          <R l="風速壓 q" v={`${designForces.q_kgfm2} kgf/m² (${designForces.q_kNm2} kN/m²)`}/>
          <R l="風力 X 向" v={`≈ ${designForces.windForceX_kN} kN`}/>
          <R l="風力 Y 向" v={`≈ ${designForces.windForceY_kN} kN`}/>
          <R l="迎風面 W×H" v={`${designForces.plan_W_m}×${designForces.totalH_m}m`}/>

          <div style={{ color:"#ee6666", fontSize:10, fontWeight:600, marginTop:8, marginBottom:3 }}>🌐 抗震</div>
          <R l="設計地震" v="475年回歸期" c="#aabbcc"/>
          <R l="SDS" v={seismicSDS.toFixed(2)} c="#ddaa66"/>
          <R l="SD1" v={seismicSD1.toFixed(2)} c="#ddaa66"/>
          <R l="基本振動週期 T" v={`${designForces.period_T} s`}/>
          <R l="高寬比 H/B" v={designForces.aspectRatio} c={parseFloat(designForces.aspectRatio) > 4 ? "#ee8866" : "#ccc"}/>
          <R l="總重 W" v={`≈ ${designForces.totalWeight_tf} tf`}/>

          <div style={{ color:"#ddbb44", fontSize:10, fontWeight:600, marginTop:8, marginBottom:3 }}>🔥 防火 (§70)</div>
          <R l="頂層~第4層" v="柱/梁 1hr｜板 1hr"/>
          <R l="第5~14層" v="柱/梁 2hr｜板 2hr"/>
          <R l="第15層以下" v="柱/梁 3hr｜板 2hr" c="#ddaa66"/>
          <div style={{ fontSize:9, color:"#778", marginTop:3, fontStyle:"italic" }}>
            ※ 含地下層數，自頂層起算
          </div>

          <div style={{ color:"#aaeeaa", fontSize:10, fontWeight:600, marginTop:8, marginBottom:3 }}>🧱 fc' 分區</div>
          <R l="B+1F~3F" v="fc'=350 kgf/cm²" c="#aaccaa"/>
          <R l="中段樓層" v="fc'=280 kgf/cm²"/>
          <R l="上段樓層" v="fc'=245 kgf/cm²"/>
        </div>
      </div>

      <div style={{ background:"#151528", borderRadius:5, padding:8, marginBottom:8, border:"1px solid #2a2a44" }}>
        <R l="總高度" v={`${(totalH/1000).toFixed(1)}m / ${maxFloor}F`} />
        <R l="開挖深度" v={dwall ? `${dwall.depth.toFixed(1)}m / B${Math.abs(minFloor)}F` : "無"} />
        <R l="塔樓" v={towers.length ? `${towers.length}個` : "無"} />
        <R l="服務核" v={cores.length ? `${cores.length}個` : "無 ⚠"} c={cores.length === 0 ? "#cc8844" : "#ccc"} />
      </div>

      {dwall && (
        <div style={{ background:"#221c14", borderRadius:5, padding:8, marginBottom:8, border:"1px solid #553322" }}>
          <div style={{ color:"#ccaa66", fontSize:11, fontWeight:600, marginBottom:4 }}>🧱 連續壁</div>
          <R l="厚度" v={`${dwall.thickness}mm`} c="#ddbb77" />
          <R l="深度" v={`${dwall.depth.toFixed(1)}m`} />
          <div style={{ color:"#aa8855", fontSize:9, marginTop:4 }}>{dwall.note}</div>
        </div>
      )}

      {transferIssues.length > 0 && (
        <div style={{ background:"#2a1818", borderRadius:5, padding:8, marginBottom:8, border:"1px solid #663333" }}>
          <div style={{ color:"#ee6666", fontSize:11, fontWeight:600, marginBottom:4 }}>🔴 結構轉換</div>
          {transferIssues.map((w,i) => <div key={i} style={{ color:"#cc8888", fontSize:10, marginBottom:2 }}>• {w}</div>)}
        </div>
      )}

      <FamilyTypePanel families={families} />
    </div>
  );
}
