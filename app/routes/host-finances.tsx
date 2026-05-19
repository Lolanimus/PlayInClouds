import { useEffect, useState } from "react"
import { useNavigate } from "react-router"

import { createConnectOnboardingLink, getConnectAccountStatus, type ConnectAccountStatus } from "~/app/api/supabase/connect"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { useErrorActions } from "@/store/error_state"
import { useUser } from "@/store/user_state"

export default function HostFinancesPage() {
  const navigate = useNavigate()
  const user = useUser()
  const { setError, setSuccess } = useErrorActions()
  const { toast } = useToast()

  const [isLoadingConnect, setIsLoadingConnect] = useState(false)
  const [isOpeningConnect, setIsOpeningConnect] = useState(false)
  const [connectStatus, setConnectStatus] = useState<ConnectAccountStatus | null>(null)

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=%2Fhost%2Ffinances", { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    if (!user) return

    let isActive = true

    const loadConnectStatus = async () => {
      setIsLoadingConnect(true)

      try {
        const account = await getConnectAccountStatus()

        if (!isActive) return
        setConnectStatus(account)
      } catch (error) {
        if (!isActive) return
        console.error("Failed to load Stripe Connect status", error)
      } finally {
        if (isActive) {
          setIsLoadingConnect(false)
        }
      }
    }

    void loadConnectStatus()

    return () => {
      isActive = false
    }
  }, [user])

  if (!user) return null

  const isStripeConnected = Boolean(connectStatus?.onboardingComplete && connectStatus?.payoutsEnabled)
  const connectButtonLabel = isStripeConnected
    ? "Go to finances dashboard"
    : connectStatus?.needsIdentityVerificationOnly
      ? "Verify identity with Stripe"
      : connectStatus?.stripeAccountId
        ? "Continue Stripe onboarding"
        : "Connect Stripe payouts"

  const handleConnectStripe = async () => {
    if (isOpeningConnect) return

    setIsOpeningConnect(true)
    setError(null)
    setSuccess(null)

    try {
      const account = await createConnectOnboardingLink({
        returnPath: "/host/finances",
        refreshPath: "/host/finances",
        openDashboard: isStripeConnected,
      })

      setConnectStatus(account)

      if (!account.onboardingUrl) {
        throw new Error("Stripe onboarding link was not returned.")
      }

      window.location.href = account.onboardingUrl
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to open Stripe."
      setError(message)
      toast({
        variant: "destructive",
        title: "Stripe setup failed",
        description: message,
      })
    } finally {
      setIsOpeningConnect(false)
    }
  }

  return (
    <section className="h-full min-h-0 overflow-y-auto p-4 md:p-6 lg:p-8">
      <Card className="w-full border-[#e9e9e9] bg-[#ffffff] shadow-lg">
        <CardHeader className="border-b border-[#e9e9e9] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="pb-4">
              <CardTitle className="text-3xl text-[#000000]">Finances</CardTitle>
              <CardDescription>Manage Stripe payouts and review whether your host account is ready to receive money.</CardDescription>
            </div>
            <Badge variant="outline" className="w-fit border-[#dadada] bg-[#ffffff] text-[#000000]">
              {isStripeConnected ? "Payouts enabled" : "Action needed"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-6">
          <div className="rounded-2xl border border-[#e9e9e9] bg-[#fafafa] p-5">
            <div className="space-y-2">
              <p className="text-lg font-semibold text-[#000000]">Stripe payouts</p>
              <p className="text-sm text-[#6a6a6a]">
                Connect Stripe so PlayInClouds can send reservation payouts to your bank account.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-[#e9e9e9] bg-[#ffffff] p-4 text-sm">
              {isLoadingConnect ? (
                <p className="text-[#6a6a6a]">Loading payout onboarding status...</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-[#000000]">
                    Status:{" "}
                    <span className="font-medium">
                      {isStripeConnected
                        ? "Ready to receive payouts"
                        : connectStatus?.needsIdentityVerificationOnly
                          ? "Identity verification required"
                          : connectStatus?.stripeAccountId
                            ? "Onboarding still required"
                            : "Not connected"}
                    </span>
                  </p>
                  <p className="text-[#6a6a6a]">
                    {isStripeConnected
                      ? "Your Stripe account is connected and payouts are enabled."
                      : connectStatus?.needsIdentityVerificationOnly
                        ? "Stripe has the rest of your payout details, but still needs identity verification to enable payouts."
                        : "Stripe will collect the identity and bank details needed to pay you out."}
                  </p>
                  {connectStatus?.stripeAccountId ? (
                    <p className="text-xs text-[#8a8a8a]">Account ID: {connectStatus.stripeAccountId}</p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-[#f3d49b] bg-[#fff8eb] px-4 py-3">
              <p className="text-sm font-medium text-[#7a4c00]">Important</p>
              <p className="mt-1 text-sm text-[#9a6700]">
                Stripe status updates can take a little time to appear here after you finish onboarding or change payout details.
              </p>
            </div>

            <Button
              type="button"
              onClick={() => void handleConnectStripe()}
              className="mt-4 h-10 w-full"
              disabled={isLoadingConnect || isOpeningConnect}
            >
              {isOpeningConnect ? "Opening Stripe..." : connectButtonLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
