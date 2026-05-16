/**
 * FloorHeightEditor — typical floor height + exception list editor.
 * Extracted from App.tsx during the component split.
 */
import { S } from "./uiStyles";

export default function FloorHeightEditor({ typicalH, setTypicalH, exceptions, setExceptions }) {
  const update = (i, k, v) => setExceptions(exs => exs.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const remove = i => setExceptions(exs => exs.filter((_, idx) => idx !== i));
  const add = () => setExceptions(exs => [...exs, { floor: 1, height: 4500, label: "新挑高層" }]);
  const sorted = [...exceptions].sort((a, b) => a.floor - b.floor);
  const sortedIndices = sorted.map(e => exceptions.indexOf(e));

  return (
    <div>
      <label style={S.lbl}>典型樓高 (mm)</label>
      <input style={S.inp} type="number" step={100} value={typicalH} onChange={e=>setTypicalH(Number(e.target.value))} />
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8, marginBottom:4 }}>
        <span style={{ fontSize:10, color:"#6688aa", fontWeight:600 }}>例外樓層</span>
        <button onClick={add} style={{ padding:"2px 6px", fontSize:9, background:"#1a3344", color:"#88bbcc", border:"1px solid #2a4455", borderRadius:2, cursor:"pointer" }}>+ 新增</button>
      </div>
      {sorted.map((e, di) => {
        const i = sortedIndices[di];
        const fl = e.floor;
        const lbl = fl < 0 ? `B${Math.abs(fl)}F` : `${fl}F`;
        return (
          <div key={i} style={{ background:"#181828", borderRadius:3, padding:5, marginBottom:3, border:"1px solid #2a2a44" }}>
            <div style={{ display:"grid", gridTemplateColumns:"38px 60px 1fr 18px", gap:4, alignItems:"center" }}>
              <input style={{...S.inp, padding:"2px 4px", fontSize:10, textAlign:"center"}}
                type="number" min={-10} max={50} value={e.floor} onChange={ev => update(i, "floor", Number(ev.target.value))} />
              <input style={{...S.inp, padding:"2px 4px", fontSize:10}}
                type="number" step={100} value={e.height} onChange={ev => update(i, "height", Number(ev.target.value))} />
              <input style={{...S.inp, padding:"2px 4px", fontSize:9}}
                value={e.label} onChange={ev => update(i, "label", ev.target.value)} placeholder="說明" />
              <button onClick={() => remove(i)} style={{ background:"none", border:"none", color:"#664444", cursor:"pointer", fontSize:11, padding:0 }}>✕</button>
            </div>
            <div style={{ fontSize:8, color:"#556", marginTop:1 }}>{lbl}: {e.height}mm</div>
          </div>
        );
      })}
    </div>
  );
}
