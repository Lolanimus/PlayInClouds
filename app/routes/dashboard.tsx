import { useEffect } from "react"
import { Link, useNavigate } from "react-router"

import { useUser } from "~/store/user_state"

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useUser()

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true })
    }
  }, [user, navigate])

  if (!user) return null

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5] px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[#e7e7e7] bg-[#ffffff] p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#000000]">Dashboard</h1>
        <p className="mt-2 text-sm text-[#6d6d6d]">Welcome back.</p>

        <div className="mt-6 space-y-2 text-sm text-[#1e1e1e]">
          <p>
            <span className="font-medium">Email:</span> {user.email ?? "—"}
          </p>
          <p>
            <span className="font-medium">User ID:</span> {user.id}
          </p>
        </div>

        <div className="mt-6">
          <Link className="text-sm underline-offset-4 hover:underline" to="/">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}
