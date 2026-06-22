import { RedocStandalone } from 'redoc';
import './TopNav.css';

function TopNav() {
  return (
    <div className="top-nav">
      <div className="nav-left">
        <h1 className="logo">CreditOS</h1>
        <div className="nav-links">
          <a href="#" className="active">API Reference</a>
          <a href="#">Guides</a>
          <a href="#">Changelog</a>
          <a href="#">Support</a>
        </div>
      </div>
      <div className="nav-right">
        <div className="search-bar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" placeholder="Search API..." />
        </div>
        <button className="btn-signup">Sign Up</button>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="App">
      <TopNav />
      <div className="redoc-container">
        <RedocStandalone
          specUrl="/openapi.json"
          options={{
            scrollYOffset: 60, // Offset for the fixed TopNav
            theme: {
              colors: {
                primary: {
                  main: '#000000', // Sleek black
                },
                success: {
                  main: '#10b981',
                },
                error: {
                  main: '#ef4444',
                },
                text: {
                  primary: '#111827',
                  secondary: '#4b5563',
                },
                http: {
                  get: '#0ea5e9',
                  post: '#10b981',
                  put: '#f59e0b',
                  delete: '#ef4444',
                },
              },
              schema: {
                linesColor: '#e5e7eb',
                typeNameColor: '#6b7280',
                requireLabelColor: '#ef4444', 
              },
              typography: {
                fontSize: '14px',
                fontFamily: '"Inter", sans-serif',
                headings: {
                    fontFamily: "\"Inter\", sans-serif",
                    fontWeight: "600"
                },
                code: {
                  fontFamily: '"Fira Code", monospace',
                  fontSize: '13px',
                  color: '#f8fafc',
                  backgroundColor: '#202020', // Darker gray like the screenshot
                },
              },
              rightPanel: {
                backgroundColor: '#2b2b2b', // Matched to the dark gray from screenshot
                textColor: '#f8fafc',
              },
              sidebar: {
                backgroundColor: '#f6f6f6', // Light gray background
                textColor: '#374151',
                activeTextColor: '#000000',
                width: '260px',
              },
            },
            nativeScrollbars: true,
            hideDownloadButton: true,
            disableSearch: true, // We use our own search bar in the top nav visually
          }}
        />
        {/* Injecting the API key button floating over the sidebar */}
        <div className="sidebar-footer-btn">
          <button className="btn-apikey">Get API Key</button>
        </div>
      </div>
    </div>
  );
}

export default App;
