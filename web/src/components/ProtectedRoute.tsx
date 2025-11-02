import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { trpc } from "../utils/trpc";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { data, isLoading } = trpc.auth.me.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data?.user) {
    // Redirect to first available auth provider or info page
    return <Navigate to="/auth/google" replace />;
  }

  return <>{children}</>;
}

