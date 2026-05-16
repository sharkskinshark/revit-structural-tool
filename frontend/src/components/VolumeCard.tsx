/**
 * VolumeCard — single volume editor card in the left sidebar.
 * Extracted from App.tsx during the component split.
 */
import { getVolumeElev, TYPES, USE_TYPES } from "../lib/buildingModel";
import { S } from "./uiStyles";

export default function VolumeCard({ vol, isSelected, onClick, onChange, onDelete, maxBX, maxBY, typicalH, exceptions }) {
  const set = (k, isNum) => e => onChange({ ...vol, [k]: isNum ? Number(e.target.value) : e.target.value });
  const isCore = vol.type === "core";
  const { height } = getVolumeElev(vol, typicalH, exceptions);
  return (
    <div onClick={onClick} style={{
      background: isSelected ? "#1a1a33" : "#111122",
      border: isSelected ? "2px solid #ffdd44" : (isCore ? "1px solid #884422" : "1px solid #2a2a44"),
      borderRadius:6, padding:8, marginBottom:6, cursor:"pointer",
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:12, height:12, borderRadius:2, background:vol.color }} />
          <span style={{ fontSize:12, fontWeight:700, color: isSelected ? "#ffdd44" : (isCore ? "#ee8866" : "#ccc") }}>
            {isCore && "🔲 "}{vol.name}
          </span>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete(vol.id); }}
          style={{ background:"none", border:"none", color:"#664444", cursor:"pointer", fontSize:14 }}>✕</button>
      </div>

      {isSelected && (
        <div style={{ marginTop:6 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 8px" }}>
            <div><label style={S.lbl}>名稱</label>
              <input style={S.inp} value={vol.name} onChange={set("name", false)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>類型</label>
              <select style={S.inp} value={vol.type} onChange={set("type", false)} onClick={e => e.stopPropagation()}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select></div>
            <div><label style={S.lbl}>用途</label>
              <select style={S.inp} value={vol.useType || "commercial"} onChange={set("useType", false)} onClick={e => e.stopPropagation()}>
                {Object.entries(USE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
            <div></div>
            <div><label style={S.lbl}>起始樓層</label>
              <input style={S.inp} type="number" min={-10} max={50} value={vol.startF} onChange={set("startF", true)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>結束樓層</label>
              <input style={S.inp} type="number" min={-10} max={80} value={vol.endF} onChange={set("endF", true)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>X起始跨</label>
              <input style={S.inp} type="number" min={0} max={maxBX} value={vol.x1} onChange={set("x1", true)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>X結束跨</label>
              <input style={S.inp} type="number" min={0} max={maxBX} value={vol.x2} onChange={set("x2", true)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>Y起始跨</label>
              <input style={S.inp} type="number" min={0} max={maxBY} value={vol.y1} onChange={set("y1", true)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>Y結束跨</label>
              <input style={S.inp} type="number" min={0} max={maxBY} value={vol.y2} onChange={set("y2", true)} onClick={e => e.stopPropagation()} /></div>
          </div>
          <div style={{ fontSize:9, color:"#ccaa66", marginTop:6 }}>實際總高: {(height/1000).toFixed(2)}m</div>
        </div>
      )}

      {!isSelected && (
        <div style={{ fontSize:10, color:"#778" }}>
          {vol.startF < 0 ? `B${Math.abs(vol.startF)}F` : `${vol.startF}F`}~{vol.endF}F ・ {USE_TYPES[vol.useType]?.label || ""} ・ {(height/1000).toFixed(1)}m
        </div>
      )}
    </div>
  );
}
