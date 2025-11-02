import { trpc } from "../utils/trpc";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const { data: userData } = trpc.auth.me.useQuery();
  const { data: profile } = trpc.user.getProfile.useQuery(undefined, {
    enabled: !!userData?.user,
  });
  const logoutMutation = trpc.auth.logout.useMutation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    navigate("/auth/google");
  };

  const mcpUrl = `${window.location.origin}/mcp`;
  const mcpSessionId = `mcp-session-${userData?.user?.userId || "unknown"}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-100 p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">
                KnowledgePlane Dashboard
              </h1>
              <p className="text-slate-600 mt-1">
                Welcome back, {userData?.user?.username || profile?.username}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-white hover:bg-red-50 text-red-600 rounded-xl border border-red-200 hover:border-red-300 transition-all shadow-sm hover:shadow-md"
            >
              Logout
            </button>
          </div>
        </div>

        {/* MCP Configuration Section */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-100 p-6 mb-6">
          <h2 className="text-2xl font-semibold text-slate-800 mb-4">
            Configure Your AI Agents
          </h2>
          <p className="text-slate-700 mb-4">
            Use the following information to connect your AI agents to
            KnowledgePlane via the Model Context Protocol (MCP).
          </p>

          <div className="bg-slate-50/80 rounded-xl p-4 mb-4 border border-slate-100">
            <h3 className="font-semibold text-slate-800 mb-2">MCP Endpoint URL</h3>
            <code className="block bg-white p-3 rounded-lg border border-slate-200 text-sm text-slate-800 break-all">
              {mcpUrl}
            </code>
          </div>

          <div className="bg-slate-50/80 rounded-xl p-4 mb-4 border border-slate-100">
            <h3 className="font-semibold text-slate-800 mb-2">
              Required Headers
            </h3>
            <div className="bg-white p-3 rounded-lg border border-slate-200 text-sm">
              <div className="mb-2">
                <span className="font-semibold text-slate-800">Content-Type:</span>{" "}
                <code className="text-slate-700">application/json</code>
              </div>
              <div>
                <span className="font-semibold text-slate-800">mcp-session-id:</span>{" "}
                <code className="text-slate-700">{mcpSessionId}</code>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="font-semibold text-slate-800 mb-3">
              Example Configuration
            </h3>
            <div className="bg-slate-800 text-slate-100 p-4 rounded-xl overflow-x-auto border border-slate-700">
              <pre className="text-sm">
                {`{
  "clients": {
    "knowledgeplane": {
      "url": "${mcpUrl}",
      "headers": {
        "Content-Type": "application/json",
        "mcp-session-id": "${mcpSessionId}"
      }
    }
  }
}`}
              </pre>
            </div>
          </div>
        </div>

        {/* Instructions Section */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-2xl font-semibold text-slate-800 mb-4">
            Getting Started
          </h2>
          <ol className="list-decimal list-inside space-y-3 text-slate-700">
            <li>
              Copy the MCP endpoint URL above and add it to your MCP client
              configuration (e.g., Claude Desktop, VS Code MCP host, Cursor,
              etc.)
            </li>
            <li>
              Include the <code className="bg-slate-100 px-2 py-0.5 rounded text-slate-800">mcp-session-id</code> header
              in your requests to maintain session context
            </li>
            <li>
              Optionally, you can add user context via query parameters:
              <code className="block bg-slate-50 p-2 rounded-lg mt-2 text-sm text-slate-800 border border-slate-200">
                ?username={userData?.user?.username || "your-username"}&email={userData?.user?.email || "your-email"}
              </code>
            </li>
            <li>
              For knowledge context filtering, add:
              <code className="block bg-slate-50 p-2 rounded-lg mt-2 text-sm text-slate-800 border border-slate-200">
                ?knowledge_context=your-project-name
              </code>
            </li>
            <li>
              Use Bearer token authentication for programmatic access:
              <code className="block bg-slate-50 p-2 rounded-lg mt-2 text-sm text-slate-800 border border-slate-200">
                Authorization: Bearer &lt;your-oauth-token&gt;
              </code>
            </li>
          </ol>

          <div className="mt-6 p-4 bg-blue-50/80 border border-blue-200 rounded-xl">
            <h4 className="font-semibold text-blue-900 mb-2">
              📝 Available MCP Tools
            </h4>
            <ul className="list-disc list-inside space-y-1 text-blue-800 text-sm">
              <li>
                <code className="bg-blue-100/50 px-1.5 py-0.5 rounded text-blue-900">facts.write</code> - Write a fact with content, metadata,
                and knowledge context
              </li>
              <li>
                <code className="bg-blue-100/50 px-1.5 py-0.5 rounded text-blue-900">facts.search</code> - Search facts using full-text search
                with filtering
              </li>
              <li>
                <code className="bg-blue-100/50 px-1.5 py-0.5 rounded text-blue-900">facts.trash</code> - Mark facts as trashed
              </li>
              <li>
                <code className="bg-blue-100/50 px-1.5 py-0.5 rounded text-blue-900">users.register</code> - Register or update user
                information
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

