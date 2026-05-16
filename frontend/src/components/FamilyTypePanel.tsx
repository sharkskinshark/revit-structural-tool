/**
 * FamilyTypePanel — Revit Family/Type inventory preview.
 * Extracted from App.tsx during the component split.
 */

export default function FamilyTypePanel({ families }) {
  const Section = ({ title, items, color, icon, render }) => (
    <div style={{ marginBottom:8 }}>
      <div style={{ color, fontSize:11, fontWeight:600, marginBottom:4 }}>{icon} {title} ({items.length} types)</div>
      {items.map((it, i) => (
        <div key={i} style={{
          background:"#181828", padding:"4px 6px", borderRadius:3, marginBottom:2, fontSize:10,
          border:"1px solid #2a2a44",
        }}>
          <div style={{ color:"#ccc", fontFamily:"monospace" }}>{it.type}</div>
          <div style={{ color:"#778", fontSize:9 }}>{render(it)}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ fontSize:11, color:"#aabbcc", fontWeight:600, marginBottom:6 }}>
        🏗 Revit Family/Type 預覽
      </div>
      <div style={{ fontSize:9, color:"#556", marginBottom:8, lineHeight:"1.4" }}>
        以下為將生成到 Revit 的構件類型，搬到 Claude Code 後可自動建立 pyRevit 腳本
      </div>
      <Section title="柱 Column" icon="🟦" color="#88aacc" items={families.columns}
        render={it => `${it.dim}×${it.dim}mm, fc'=${it.fc} kgf/cm² (${it.count} 處)`} />
      <Section title="梁 Beam" icon="🟧" color="#cc8866" items={families.beams}
        render={it => `${it.B}×${it.D}mm (${it.count} 條)`} />
      <Section title="樓板 Slab" icon="⬜" color="#aabbaa" items={families.slabs}
        render={it => `結構${it.structThick}mm${it.soundLayer>0?` + 隔音${it.soundLayer}mm`:""} (${it.count} 片)`} />
      {families.walls.length > 0 && (
        <Section title="牆 Wall" icon="🟥" color="#cc8888" items={families.walls}
          render={it => `${it.thickness}mm - ${it.role} (${it.count} 處)`} />
      )}
    </div>
  );
}
