import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[Way AI] Uncaught error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#1e1e1e",color:"#f44747",fontFamily:"monospace",gap:16,padding:32}}>
          <div style={{fontSize:24}}>⚠ Way AI Code — Unexpected Error</div>
          <pre style={{background:"#252526",padding:16,borderRadius:6,maxWidth:"80vw",overflow:"auto",color:"#d4d4d4",fontSize:13}}>{String(this.state.error)}</pre>
          <button onClick={()=>this.setState({error:null})} style={{padding:"8px 20px",background:"#0e639c",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:14}}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
