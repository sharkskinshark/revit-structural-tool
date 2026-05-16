/**
 * Shared inline-style fragments for the editor panels.
 * Extracted from App.tsx during the component split.
 */
import type React from "react";

export const S: Record<string, React.CSSProperties> = {
  inp: { width:"100%", padding:"4px 6px", background:"#151528", color:"#ddd", border:"1px solid #2a2a44", borderRadius:3, fontSize:11, boxSizing:"border-box" },
  lbl: { display:"block", fontSize:9, color:"#6688aa", marginBottom:1, marginTop:6 },
};
