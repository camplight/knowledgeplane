import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60"></div>
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-400/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 right-1/4 w-[800px] h-[800px] bg-indigo-400/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-400/5 rounded-full blur-3xl animate-pulse-slow"></div>
        
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-50 container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:shadow-xl group-hover:shadow-blue-500/30 transition-all duration-300 transform group-hover:scale-105">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300"></div>
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent">
              KnowledgePlane
            </span>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-24 lg:py-32">
        <div className="max-w-6xl mx-auto">
          {/* Main Title */}
          <div className="text-center mb-12 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 bg-blue-50 border border-blue-100 rounded-full text-sm font-medium text-blue-700 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              Built on Model Context Protocol (MCP)
            </div>
            
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold mb-8 leading-tight">
              <span className="block text-slate-900 mb-2">Your AI Agents'</span>
              <span className="block bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Shared Memory
              </span>
            </h1>
            
            <p className="text-xl sm:text-2xl md:text-3xl text-slate-600 mb-6 font-light max-w-3xl mx-auto leading-relaxed">
              Connect all your AI assistants to one unified knowledge base
            </p>
            
            <p className="text-lg sm:text-xl text-slate-500 mb-12 max-w-2xl mx-auto leading-relaxed">
              Store, search, and share facts seamlessly across Claude, Cursor, and all your AI tools.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20">
              <Link
                to="/auth/google"
                className="group relative flex items-center justify-center gap-3 w-full sm:w-auto px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl shadow-slate-900/25 hover:shadow-slate-900/40 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>Continue with Google</span>
                <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                to="/auth/github"
                className="group relative flex items-center justify-center gap-3 w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-50 text-slate-900 font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl shadow-slate-200/50 hover:shadow-slate-300/50 border border-slate-200 hover:border-slate-300 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                <span>Continue with GitHub</span>
                <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Code Example Section */}
          <div className="max-w-4xl mx-auto mb-32 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-300"></div>
              <div className="relative bg-slate-900 rounded-2xl p-6 md:p-8 shadow-2xl border border-slate-800">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="ml-4 text-slate-400 text-sm font-mono">curl example</span>
                </div>
                <pre className="overflow-x-auto">
                  <code className="text-sm text-slate-300 font-mono">
{`curl -X POST http://localhost:8080/mcp \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "tools/call",
    "params": {
      "name": "facts.write",
      "arguments": {
        "content": "Project uses port 8080",
        "knowledge_context": "my-project"
      }
    }
  }'`}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="max-w-7xl mx-auto mt-32 mb-20">
          <div className="text-center mb-16 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 mb-4">
              Everything Your AI Agents Need
            </h2>
            <p className="text-xl sm:text-2xl text-slate-600 max-w-2xl mx-auto">
              Powerful features designed specifically for AI knowledge management
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 mt-16">
            {/* Feature 1 */}
            <div className="group relative animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <div className="relative h-full bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg hover:shadow-2xl border border-slate-200/50 transition-all duration-300 transform hover:-translate-y-1">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/25 transform group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-3">Write Facts</h3>
                  <p className="text-slate-600 leading-relaxed">
                    Store structured facts with rich metadata and knowledge contexts. Organize information by project, team, or domain for easy retrieval.
                  </p>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="group relative animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
              <div className="relative h-full bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg hover:shadow-2xl border border-slate-200/50 transition-all duration-300 transform hover:-translate-y-1">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/25 transform group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-3">Search Everything</h3>
                  <p className="text-slate-600 leading-relaxed">
                    Lightning-fast full-text search with advanced filtering. Find exactly what you need across your entire knowledge base in milliseconds.
                  </p>
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="group relative animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
              <div className="relative h-full bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg hover:shadow-2xl border border-slate-200/50 transition-all duration-300 transform hover:-translate-y-1">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-purple-500/25 transform group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-3">MCP Native</h3>
                  <p className="text-slate-600 leading-relaxed">
                    Built on the Model Context Protocol. Works seamlessly with Claude Desktop, Cursor, Windsurf, and all MCP-compatible tools.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* How It Works Section */}
        <div className="max-w-5xl mx-auto mt-32 mb-20">
          <div className="text-center mb-16 animate-fade-in-up" style={{ animationDelay: '0.7s' }}>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-xl sm:text-2xl text-slate-600">
              Simple setup, powerful results
            </p>
          </div>

          <div className="relative animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 md:p-12 shadow-xl border border-slate-200/50">
              <div className="space-y-10">
                <div className="flex gap-6 items-start">
                  <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/25">
                    1
                  </div>
                  <div className="flex-1 pt-2">
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">
                      Sign in with Google or GitHub
                    </h3>
                    <p className="text-lg text-slate-600 leading-relaxed">
                      Quick OAuth authentication. No passwords to remember, no accounts to manage.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6 items-start">
                  <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/25">
                    2
                  </div>
                  <div className="flex-1 pt-2">
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">
                      Copy your MCP endpoint
                    </h3>
                    <p className="text-lg text-slate-600 leading-relaxed">
                      Get your unique endpoint URL and session ID from the dashboard. One-click copy makes setup effortless.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6 items-start">
                  <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-purple-500/25">
                    3
                  </div>
                  <div className="flex-1 pt-2">
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">
                      Connect your AI tools
                    </h3>
                    <p className="text-lg text-slate-600 leading-relaxed">
                      Your AI agents can now write facts, search knowledge, and access shared memories instantly.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200 bg-white/60 backdrop-blur-sm mt-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                KnowledgePlane
              </span>
            </div>
            <p className="text-slate-600 mb-2">
              © 2024 KnowledgePlane. Built with ❤️ for AI developers.
            </p>
            <p className="text-sm text-slate-500">
              Empowering AI agents with shared memory
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
